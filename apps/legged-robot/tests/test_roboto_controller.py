"""Protect policy frame conventions, physical limits, and latched faults."""
import json
import math
import os
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from omindos_legged.robots.roboto_origin import (
    RobotoOriginController, action_to_targets, inverse_rotate_wxyz, pd_torque, stack_frame,
)
from omindos_legged.types import VelocityCommand


def test_inverse_quaternion_rotation_uses_wxyz_and_body_frame():
    q = (math.sqrt(0.5), 0, 0, math.sqrt(0.5))  # Body yaw is +90 degrees.
    np.testing.assert_allclose(inverse_rotate_wxyz(q, (1, 0, 0)), (0, -1, 0), atol=1e-12)
    np.testing.assert_allclose(inverse_rotate_wxyz(q, (0, 0, -1)), (0, 0, -1), atol=1e-12)
    q = (math.sqrt(0.5), 0, math.sqrt(0.5), 0)
    np.testing.assert_allclose(inverse_rotate_wxyz(q, (0, 0, -1)), (1, 0, 0), atol=1e-12)
    with pytest.raises(ValueError, match="cannot be zero"):
        inverse_rotate_wxyz((0, 0, 0, 0), (0, 0, -1))


def test_frame_major_history_keeps_oldest_first_and_repeats_initial_frame():
    history = np.zeros((10, 78), dtype=np.float32)
    first = np.arange(78, dtype=np.float32)
    stacked = stack_frame(history, first, True)
    assert stacked.shape == (1, 780)
    np.testing.assert_equal(stacked.reshape(10, 78), np.tile(first, (10, 1)))
    second = first + 100
    stack_frame(history, second, False)
    np.testing.assert_equal(history[:9], np.tile(first, (9, 1)))
    np.testing.assert_equal(history[-1], second)


def test_policy_actions_scatter_to_urdf_indices_before_joint_scale():
    mapping = [0, 6, 12, 1, 7, 13, 18, 2, 8, 14, 19, 3, 9, 15, 20, 4, 10, 16, 21, 5, 11, 17, 22]
    default = np.zeros(23)
    default[6] = -0.1
    scales = np.ones(23) * 0.25
    scales[6] = 0.5
    action = np.zeros(23)
    action[1] = 2
    action[2] = 3
    target = action_to_targets(action, mapping, default, scales)
    assert target[6] == pytest.approx(0.9)
    assert target[12] == pytest.approx(0.75)
    assert np.count_nonzero(target) == 2
    with pytest.raises(ValueError, match="permutation"):
        action_to_targets(action, [0] * 23, default, scales)


def test_pd_control_respects_asymmetric_model_torque_ranges():
    torque = pd_torque(np.array([10, -10, 1]), np.zeros(3), np.array([0, 0, 2]),
                       np.array([100, 100, 40]), np.array([3.3, 3.3, 2]),
                       np.array([[-120, 120], [-27, 27], [-20, 30]]))
    np.testing.assert_equal(torque, (120, -27, 30))


@pytest.fixture
def controller():
    configured = os.environ.get("OMINDOS_LEGGED_TEST_ASSETS")
    if not configured:
        pytest.skip("Set OMINDOS_LEGGED_TEST_ASSETS to the verified official asset directory")
    pytest.importorskip("mujoco")
    pytest.importorskip("onnxruntime")
    simulation = RobotoOriginController(Path(configured))
    yield simulation
    simulation.close()


def test_actual_policy_step_enforces_official_command_limits(controller):
    assert controller.policy_period == 0.02
    assert len(controller.joint_names) == 23
    assert controller.joint_names == controller.description.joint_names
    state = controller.step(VelocityCommand(10, -10, 10))
    assert state.command == VelocityCommand(0.6, -0.4, 0.8)
    assert state.status == "running"
    assert state.time_s == pytest.approx(0.02)
    assert np.isfinite(controller.data.ctrl).all()
    assert np.all(controller.data.ctrl >= controller.model.actuator_ctrlrange[:, 0])
    assert np.all(controller.data.ctrl <= controller.model.actuator_ctrlrange[:, 1])
    json.dumps(state.to_dict(), allow_nan=False)


def test_joint_limit_fault_is_named_and_latched_until_reset(controller):
    controller.data.qpos[controller._q_indices[0]] = -1.1
    state = controller.step(VelocityCommand(0.3))
    assert state.status == "fault"
    assert state.fault_reason.startswith("joint_limit:left_thigh_yaw_joint:")
    assert state.command == VelocityCommand()
    assert state.time_s == 0
    np.testing.assert_equal(controller.data.ctrl, np.zeros(23))
    next_state = controller.step(VelocityCommand(0.3))
    assert next_state == state
    assert controller.reset().status == "running"
    assert controller.step(VelocityCommand()).time_s == pytest.approx(0.02)


def test_tilt_threshold_reports_orientation_fault_without_claiming_physical_fall(controller):
    controller.data.qpos[3:7] = (math.sqrt(0.5), 0, math.sqrt(0.5), 0)
    state = controller.step(VelocityCommand())
    assert state.status == "fault"
    assert state.fault_reason.startswith("gravity_threshold:")
    assert state.time_s == 0


def test_nonfinite_simulation_state_returns_json_safe_last_finite_state(controller):
    controller.data.qvel[0] = float("nan")
    state = controller.step(VelocityCommand())
    assert state.status == "fault"
    assert state.fault_reason == "nonfinite_simulation_state"
    json.dumps(state.to_dict(), allow_nan=False)
    assert controller.step(VelocityCommand(0.1)) == state


def test_nonfinite_policy_output_stops_before_any_physics_step(controller):
    controller._session = SimpleNamespace(run=lambda *args: [np.full((1, 23), float("nan"))])
    state = controller.step(VelocityCommand(0.3))
    assert state.status == "fault"
    assert state.fault_reason == "nonfinite_policy_output"
    assert state.time_s == 0
    np.testing.assert_equal(controller.data.ctrl, np.zeros(23))


def test_mujoco_warning_stops_and_identifies_warning_category(controller):
    controller.data.warning[int(controller._mj.mjtWarning.mjWARN_BADQVEL)].number = 1
    state = controller.step(VelocityCommand())
    assert state.status == "fault"
    assert state.fault_reason == "mujoco_warning:mjWARN_BADQVEL:count=1"
    assert state.time_s == 0
