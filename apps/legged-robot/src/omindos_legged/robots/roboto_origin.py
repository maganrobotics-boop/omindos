# SPDX-License-Identifier: GPL-3.0-only
"""CPU MuJoCo adapter for the pinned RoboParty default locomotion policy.

Observation ordering, frame history and action mapping follow the upstream
``roboparty_inference`` default profile. This adapter only operates a simulator;
it does not open CAN, serial ports, or any real robot interface.
"""
from dataclasses import replace
import json
from pathlib import Path

import numpy as np

from ..assets import get_manifest, verify_assets
from ..description import load_description
from ..types import RobotState, VelocityCommand


def inverse_rotate_wxyz(quaternion, vector):
    """Rotate a world vector into the body frame using a WXYZ quaternion."""
    quaternion = np.asarray(quaternion, dtype=np.float64)
    vector = np.asarray(vector, dtype=np.float64)
    if quaternion.shape != (4,) or vector.shape != (3,):
        raise ValueError("Expected a WXYZ quaternion and a three-dimensional vector")
    norm = np.linalg.norm(quaternion)
    if not np.isfinite(norm) or norm < 1e-12 or not np.isfinite(vector).all():
        raise ValueError("Quaternion and vector must be finite; quaternion cannot be zero")
    w, x, y, z = quaternion / norm
    xyz = np.asarray((-x, -y, -z))
    return vector + 2.0 * np.cross(xyz, np.cross(xyz, vector) + w * vector)


def stack_frame(history, frame, first_frame):
    """Append a frame, repeating it across the history on upstream's first step."""
    frame = np.asarray(frame, dtype=np.float32)
    if history.ndim != 2 or frame.shape != (history.shape[1],):
        raise ValueError("Frame must match the observation history width")
    if first_frame:
        history[:] = frame
    else:
        history[:-1] = history[1:].copy()
        history[-1] = frame
    return history.reshape(1, -1)


def action_to_targets(action_usd, usd2urdf, default_urdf, scale_urdf):
    """Scatter policy actions from USD order into the URDF actuator order."""
    target = np.asarray(default_urdf, dtype=np.float64).copy()
    indices = np.asarray(usd2urdf, dtype=int)
    action_usd = np.asarray(action_usd, dtype=np.float64)
    if action_usd.shape != target.shape or sorted(indices.tolist()) != list(range(target.size)):
        raise ValueError("Action mapping must be a permutation of the joint indices")
    target[indices] += action_usd * np.asarray(scale_urdf)[indices]
    return target


def pd_torque(target, position, velocity, kp, kd, control_ranges):
    """Apply upstream PD gains and the unchanged model's actuator torque limits."""
    control_ranges = np.asarray(control_ranges)
    torque = np.asarray(kp) * (np.asarray(target) - position) - np.asarray(kd) * velocity
    return np.clip(torque, control_ranges[:, 0], control_ranges[:, 1])


class RobotoOriginController:
    """Run exactly one policy period per :meth:`step`, with faults latched.

    ``asset_root`` contains the official ``rpo_description`` and
    ``roboparty_inference`` directories. All locked assets are verified before
    loading. There are no downloads or network operations in this class.
    A fault freezes the simulator and clears actuator commands; call ``reset``
    explicitly to begin a new simulation. Nonfinite data returns the last finite
    state labelled with the fault, keeping JSON state streams valid.
    """

    policy_period = 0.02

    def __init__(self, asset_root: Path, manifest: Path | None = None):
        self.asset_root = Path(asset_root).expanduser().resolve()
        manifest = Path(manifest) if manifest is not None else get_manifest()
        verify_assets(self.asset_root, manifest)
        self.description = load_description(self.asset_root, manifest)
        locked = json.loads(Path(manifest).read_text(encoding="utf-8"))
        try:
            import mujoco
            import onnxruntime as ort
            import yaml
        except ImportError as exc:
            raise RuntimeError("Install omindos-legged-robot[sim] to run MuJoCo/ONNX") from exc
        self._mj = mujoco
        config = yaml.safe_load((self.asset_root / locked["config_path"]).read_text(encoding="utf-8"))
        self._config = config["inference_node"]["ros__parameters"]
        robot = yaml.safe_load((self.asset_root / locked["robot_path"]).read_text(encoding="utf-8"))["robot"]
        self._configure(self._config, robot)
        self.model = mujoco.MjModel.from_xml_path(str(self.asset_root / locked["model_path"]))
        self.data = mujoco.MjData(self.model)
        if self.model.nu != 23 or self.model.nq != 30 or self.model.nv != 29:
            raise ValueError("Default policy requires the official 23-joint free-base model")
        if not np.isclose(self.model.opt.timestep, 0.001, rtol=0, atol=1e-12):
            raise ValueError("Default adapter requires the official 1 ms physics timestep")
        joint_ids = self.model.actuator_trnid[:, 0].astype(int)
        if len(set(joint_ids.tolist())) != 23:
            raise ValueError("Expected one actuator per locomotion joint")
        self.joint_names = tuple(mujoco.mj_id2name(self.model, mujoco.mjtObj.mjOBJ_JOINT, int(jid))
                                 for jid in joint_ids)
        self.description.validate_joint_names(self.joint_names)
        self._q_indices = self.model.jnt_qposadr[joint_ids].astype(int)
        self._dq_indices = self.model.jnt_dofadr[joint_ids].astype(int)
        if not np.array_equal(self._q_indices, np.arange(7, 30)):
            raise ValueError("Model actuator order does not match the official URDF joint order")
        self._control_ranges = self.model.actuator_ctrlrange.copy()
        if not np.all(self.model.actuator_ctrllimited):
            raise ValueError("All official actuators must have enabled torque limits")
        self._sensor_slices = {}
        for name, dimension in (("angular-velocity", 3), ("linear-velocity", 3)):
            sid = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_SENSOR, name)
            if sid < 0 or self.model.sensor_dim[sid] != dimension:
                raise ValueError(f"Missing official body-frame sensor: {name}")
            start = int(self.model.sensor_adr[sid])
            self._sensor_slices[name] = slice(start, start + dimension)
        ort.disable_telemetry_events()
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(self._config.get("intra_threads", 1))
        options.inter_op_num_threads = 1
        self._session = ort.InferenceSession(str(self.asset_root / locked["policy_path"]),
                                             sess_options=options, providers=["CPUExecutionProvider"])
        inputs, outputs = self._session.get_inputs(), self._session.get_outputs()
        if len(inputs) != 1 or len(outputs) != 1 or inputs[0].type != "tensor(float)":
            raise ValueError("Expected the official policy's single float input and output")
        if inputs[0].shape != [1, 780] or outputs[0].shape != [1, 23]:
            raise ValueError(f"Unsupported ONNX shapes: {inputs[0].shape}, {outputs[0].shape}")
        self._input_name, self._output_name = inputs[0].name, outputs[0].name
        self._renderer = None
        self._render_size = None
        self._closed = False
        self._last_valid_state = None
        self.reset()

    def _configure(self, config, robot):
        expected_layout = "ang_vel:3,gravity_b:3,cmd_vel:3,dof_pos:23,dof_vel:23,last_action:23"
        layouts = config.get("obs_layouts", [])
        if (config.get("joint_num") != 23 or len(layouts) != 1
                or layouts[0].replace(" ", "") != expected_layout
                or config.get("frame_stacks") != [10]
                or config.get("obs_stack_orders") != ["frame_major"]):
            raise ValueError("Only the locked 78-observation, 10-frame default profile is supported")
        if not np.isclose(float(config["dt"]) * int(config["decimation"]), self.policy_period):
            raise ValueError("Default policy period must be 20 ms")
        if config.get("act_alpha", 1.0) != 1.0:
            raise ValueError("Only the official default action smoothing factor 1.0 is supported")
        self._usd2urdf = np.asarray(config["usd2urdf"], dtype=int)
        if sorted(self._usd2urdf.tolist()) != list(range(23)):
            raise ValueError("USD-to-URDF mapping must contain each of the 23 joints exactly once")
        self.command_limits = tuple(float(value) for value in config["clip_cmd"])
        if len(self.command_limits) != 6:
            raise ValueError("Expected six velocity command limits")
        self._default = np.asarray(config["joint_default_angle"], dtype=np.float64)
        self._joint_limits = np.asarray(config["joint_limits"], dtype=np.float64).reshape(23, 2)
        self._kp = np.asarray(robot["kp"], dtype=np.float64)
        self._kd = np.asarray(robot["kd"], dtype=np.float64)
        self._action_scale = np.asarray(config["action_scale"], dtype=np.float64)
        if self._action_scale.size == 1:
            self._action_scale = np.repeat(self._action_scale, 23)
        if any(array.shape != (23,) for array in (self._default, self._kp, self._kd, self._action_scale)):
            raise ValueError("Joint defaults, PD gains and action scales must have 23 values")
        self._clip_observations = float(config["clip_observations"])
        self._clip_actions = float(config["clip_actions"])
        self._gravity_z_upper = float(config["gravity_z_upper"])
        self._action_rescale = float(config.get("action_rescale", 1.0))
        self._scales = {key: float(config[f"obs_scales_{key}"]) for key in
                        ("lin_vel", "ang_vel", "gravity_b", "dof_pos", "dof_vel")}

    def _ensure_open(self):
        if self._closed:
            raise RuntimeError("Controller is closed")

    def reset(self) -> RobotState:
        self._ensure_open()
        self._mj.mj_resetData(self.model, self.data)
        self.data.qpos[self._q_indices] = self._default
        self._mj.mj_forward(self.model, self.data)
        self._history = np.zeros((10, 78), dtype=np.float32)
        self._first_frame = True
        self._last_action = np.zeros(23, dtype=np.float32)
        self._target = self._default.copy()
        self._command = VelocityCommand()
        self._fault_reason = None
        return self.state()

    def _gravity_body(self):
        return inverse_rotate_wxyz(self.data.qpos[3:7], (0, 0, -1))

    def _check_fault(self):
        arrays = (self.data.qpos, self.data.qvel, self.data.qacc, self.data.ctrl, self.data.sensordata)
        if not np.isfinite(self.data.time) or any(not np.isfinite(array).all() for array in arrays):
            return "nonfinite_simulation_state"
        for index, warning in enumerate(self.data.warning):
            if warning.number:
                return f"mujoco_warning:{self._mj.mjtWarning(index).name}:count={warning.number}"
        try:
            gravity = self._gravity_body()
        except ValueError:
            return "invalid_base_orientation"
        if gravity[2] > self._gravity_z_upper:
            return f"gravity_threshold:gravity_z={gravity[2]:.6f}>limit={self._gravity_z_upper:.6f}"
        positions = self.data.qpos[self._q_indices]
        indices = np.flatnonzero((positions < self._joint_limits[:, 0])
                                | (positions > self._joint_limits[:, 1]))
        if indices.size:
            index = int(indices[0])
            lower, upper = self._joint_limits[index]
            return f"joint_limit:{self.joint_names[index]}:q={positions[index]:.6f}:range=[{lower},{upper}]"
        return None

    def _set_fault(self, reason):
        self._fault_reason = reason
        self._command = VelocityCommand()
        self.data.ctrl[:] = 0

    def _observation(self):
        positions = self.data.qpos[self._q_indices]
        velocities = self.data.qvel[self._dq_indices]
        scales = self._scales
        command = np.asarray((self._command.vx * scales["lin_vel"],
                              self._command.vy * scales["lin_vel"],
                              self._command.wz * scales["ang_vel"]))
        frame = np.concatenate((
            self.data.sensordata[self._sensor_slices["angular-velocity"]] * scales["ang_vel"],
            self._gravity_body() * scales["gravity_b"], command,
            (positions - self._default)[self._usd2urdf] * scales["dof_pos"],
            velocities[self._usd2urdf] * scales["dof_vel"], self._last_action,
        )).astype(np.float32)
        np.clip(frame, -self._clip_observations, self._clip_observations, out=frame)
        observation = stack_frame(self._history, frame, self._first_frame)
        self._first_frame = False
        return observation

    def step(self, command: VelocityCommand) -> RobotState:
        self._ensure_open()
        if self._fault_reason is not None:
            return self.state()
        self._command = command.clipped(self.command_limits)
        reason = self._check_fault()
        if reason:
            self._set_fault(reason)
            return self.state()
        try:
            action = np.asarray(self._session.run([self._output_name],
                              {self._input_name: self._observation()})[0], dtype=np.float32)
            if action.shape != (1, 23):
                self._set_fault(f"policy_output_shape:{action.shape}")
                return self.state()
            if not np.isfinite(action).all():
                self._set_fault("nonfinite_policy_output")
                return self.state()
            self._last_action = self._action_rescale * np.clip(action[0], -self._clip_actions, self._clip_actions)
            self._target = action_to_targets(self._last_action, self._usd2urdf,
                                              self._default, self._action_scale)
            for _ in range(20):
                self.data.ctrl[:] = pd_torque(self._target, self.data.qpos[self._q_indices],
                    self.data.qvel[self._dq_indices], self._kp, self._kd, self._control_ranges)
                self._mj.mj_step(self.model, self.data)
                reason = self._check_fault()
                if reason:
                    self._set_fault(reason)
                    break
        except Exception as exc:
            self._set_fault(f"simulation_exception:{type(exc).__name__}:{exc}")
        return self.state()

    def state(self) -> RobotState:
        self._ensure_open()
        finite = (np.isfinite(self.data.time) and np.isfinite(self.data.qpos).all()
                  and np.isfinite(self.data.qvel).all() and np.isfinite(self.data.sensordata).all())
        if not finite and self._last_valid_state is not None:
            return replace(self._last_valid_state, command=VelocityCommand(), status="fault",
                           fault_reason=self._fault_reason or "nonfinite_simulation_state")
        def values(array):
            return tuple(float(value) for value in array)
        result = RobotState(
            time_s=float(self.data.time), joint_names=self.joint_names,
            joint_positions=values(self.data.qpos[self._q_indices]),
            joint_velocities=values(self.data.qvel[self._dq_indices]),
            base_position=values(self.data.qpos[:3]),
            base_orientation_wxyz=values(self.data.qpos[3:7]),
            linear_velocity_body=values(self.data.sensordata[self._sensor_slices["linear-velocity"]]),
            angular_velocity_body=values(self.data.sensordata[self._sensor_slices["angular-velocity"]]),
            command=self._command, status="fault" if self._fault_reason is not None else "running",
            fault_reason=self._fault_reason,
        )
        if finite:
            self._last_valid_state = result
        return result

    def render(self, width=720, height=540):
        """Render an RGB frame; graphics initialization is deferred until called."""
        self._ensure_open()
        if not isinstance(width, int) or not isinstance(height, int) or min(width, height) < 1:
            raise ValueError("Render dimensions must be positive integers")
        if width > self.model.vis.global_.offwidth or height > self.model.vis.global_.offheight:
            raise ValueError("Render dimensions exceed the unchanged model's offscreen framebuffer")
        if self._renderer is None or self._render_size != (width, height):
            if self._renderer is not None:
                self._renderer.close()
            self._renderer = self._mj.Renderer(self.model, height=height, width=width)
            self._render_size = (width, height)
        camera = self._mj.MjvCamera()
        camera.lookat[:] = self.data.qpos[:3]
        camera.lookat[2] += 0.1
        camera.distance = 2.5
        camera.azimuth = 140
        camera.elevation = -15
        self._renderer.update_scene(self.data, camera=camera)
        return self._renderer.render().copy()

    def close(self):
        if self._closed:
            return
        if self._renderer is not None:
            self._renderer.close()
            self._renderer = None
        self.data.ctrl[:] = 0
        self._session = None
        self._closed = True
