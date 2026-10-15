# SPDX-License-Identifier: GPL-3.0-only
"""Record the existing OmindOS MEVIUS2 controller in MuJoCo, without hardware I/O.

Navigation's controller and joint interface remain in their own source tree.
Only the explicit MuJoCo backend is constructed here. Assets must be preinstalled
and pass the controller's pinned manifest and policy checks; nothing is fetched.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time


PHASES = [
    {"name": "起身", "start_s": 0, "end_s": 4.2},
    {"name": "站立", "start_s": 4.2, "end_s": 7},
    {"name": "前进", "start_s": 7, "end_s": 13},
    {"name": "转向", "start_s": 13, "end_s": 17},
    {"name": "停车", "start_s": 17, "end_s": 22},
]
DT = .005
FIELDS = ["time_s", "phase", "command_vx", "command_vy", "command_wz",
          "vx_body", "vy_body", "wz_body", "base_x", "base_y", "base_z",
          "upright", "yaw", "controller_state"]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def record(scripts, assets, output):
    if output.exists():
        raise ValueError("Use a new output directory to preserve previous runs")
    output.mkdir(parents=True)
    sys.path.insert(0, str(scripts.resolve()))
    from quadruped_controller import Controller, PinnedPolicy, COMMIT, POLICY_SHA256, NAMES, LIMITS
    from quadruped_backends import MujocoBackend, SimulatedPositionBackend
    from joint_interface import PositionCommand
    import mujoco
    import numpy as np
    import torch

    started = time.monotonic()
    policy = PinnedPolicy(assets.resolve())
    physics = MujocoBackend(policy.source)
    now = 0.
    adapter = SimulatedPositionBackend(physics, NAMES,
        [(lo - .08, hi + .08) for lo, hi in LIMITS], [50.] * 12, [2.] * 12, clock=lambda: now)
    controller = Controller(policy, physics.effort_limits)
    rows, frames = [], []
    phase = PHASES[0]

    def sample():
        telemetry = physics.telemetry()
        sensors = physics.sensors(now)
        x, y, z, w = sensors.quaternion_xyzw
        values = [round(now, 6), phase["name"], *controller.command,
            *telemetry["body_velocity"][:2], sensors.gyro_body[2], *telemetry["base_xyz"],
            telemetry["upright"], math.atan2(2 * (w * z + x * y), 1 - 2 * (y*y + z*z)), controller.state]
        row = dict(zip(FIELDS, values))
        if not all(math.isfinite(v) for v in values if isinstance(v, (int, float))):
            raise RuntimeError("Nonfinite recorded state")
        return row

    status, failure = "failed", None
    try:
        adapter.arm()
        controller.action("arm", physics.sensors(now), now)
        rows.append(sample())
        steps = round(PHASES[-1]["end_s"] / DT)
        for step in range(steps):
            now = step * DT
            phase = next(p for p in PHASES if p["start_s"] <= now < p["end_s"])
            if step == 200:
                controller.action("stand", physics.sensors(now), now)
            if step == 1400:
                controller.action("walk", physics.sensors(now), now)
            if step == 3400:
                controller.action("stop", physics.sensors(now), now)
            if 7 <= now < 13:
                controller.velocity([.2, 0, 0], now)
            elif 13 <= now < 17:
                controller.velocity([0, 0, .3], now)
            target = controller.tick_targets(physics.sensors(now), now)
            if target is None or controller.state == "FAULT":
                raise RuntimeError(controller.reason)
            # One frame per 10 physics steps: exactly 20 fps, 440 actual states.
            if step % 10 == 0:
                frames.append((physics.data.qpos.copy(), physics.data.qvel.copy(), now))
            adapter.apply_positions(PositionCommand(adapter.command_session, step, now, .05,
                                    tuple(NAMES), tuple(target)), now)
            now = (step + 1) * DT
            if np.any(physics.data.warning.number):
                raise RuntimeError("MuJoCo reported a numerical warning")
            rows.append(sample())
        status = "completed"
    except Exception as error:
        failure = str(error)
    finally:
        adapter.close()

    with (output / "simulation.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    if frames:
        np.savez_compressed(output / "render-states.npz",
            qpos=np.array([f[0] for f in frames]), qvel=np.array([f[1] for f in frames]),
            time_s=np.array([f[2] for f in frames]))
    forward = [r for r in rows if 7 <= r["time_s"] < 13]
    turn = [r for r in rows if 13 <= r["time_s"] < 17]
    stop = [r for r in rows if 21 <= r["time_s"] <= 22]
    stable = [r for r in rows if r["time_s"] >= 4.2]
    yaw_change = math.atan2(math.sin(turn[-1]["yaw"] - turn[0]["yaw"]),
                            math.cos(turn[-1]["yaw"] - turn[0]["yaw"])) if turn else 0
    checks = {
        "complete": status == "completed" and len(rows) == 4401,
        "upright": bool(stable) and min(r["upright"] for r in stable) > .8,
        "clearance": bool(stable) and min(r["base_z"] for r in stable) > .2,
        "forward_progress": bool(forward) and forward[-1]["base_x"] - forward[0]["base_x"] > .3,
        "turn_progress": yaw_change > .3,
        "stop_speed": bool(stop) and sum(math.hypot(r["vx_body"], r["vy_body"]) for r in stop) / len(stop) < .15,
        "policy_executed": controller.inferences > 500,
    }
    if not all(checks.values()):
        status = "failed"
    summary = {
        "schema_version": 1, "robot": "mevius2", "robot_label": "MEVIUS2 参考模型",
        "version": "quadruped-replay-1", "scope": "simulation_only", "server": "腾讯云",
        "created_at": datetime.now(timezone.utc).isoformat(), "status": status, "failure": failure,
        "duration_s": round(now, 6), "control_steps": len(rows) - 1, "physics_hz": 200, "policy_hz": 50,
        "command_limits": [-.3, .3, -.2, .2, -.5, .5], "phases": PHASES, "checks": checks,
        "turn_yaw_change_rad": yaw_change, "policy_inferences": controller.inferences,
        "hardware_tested": False, "customer_Q1_dynamics_tested": False,
        "model_source": "https://github.com/haraduka/mevius2", "upstream_commit": COMMIT,
        "policy_sha256": POLICY_SHA256, "asset_manifest_sha256": sha256(assets / "REFERENCE.json"),
        "controller_sha256": {n: sha256(scripts / n) for n in
            ["quadruped_controller.py", "quadruped_backends.py", "joint_interface.py"]},
        "versions": {"torch": torch.__version__, "mujoco": mujoco.__version__, "numpy": np.__version__},
        "compute_wall_s": round(time.monotonic() - started, 3),
        "csv_sha256": sha256(output / "simulation.csv"),
    }
    write_json(output / "summary.json", summary)
    print(json.dumps({k: v for k, v in summary.items() if k not in ["controller_sha256", "phases"]}, ensure_ascii=False), flush=True)
    return 0 if status == "completed" else 1


def render(assets, run, ffmpeg, width=960, height=540):
    """Render the states from this exact run, without rerunning its controller."""
    import subprocess
    import mujoco
    import numpy as np
    summary = json.loads((run / "summary.json").read_text())
    if summary["status"] != "completed" or not all(summary["checks"].values()):
        raise ValueError("Only a validated run may be rendered")
    if (run / "simulation.mp4").exists():
        raise ValueError("Video already exists; preserve the previous render")
    manifest = json.loads((assets / "REFERENCE.json").read_text())
    if sha256(assets / "REFERENCE.json") != summary["asset_manifest_sha256"]:
        raise ValueError("Asset manifest changed since physics run")
    for name, digest in manifest["files"].items():
        if sha256(assets / name) != digest:
            raise ValueError("Asset changed since physics run: " + name)
    states = np.load(run / "render-states.npz", allow_pickle=False)
    if len(states["time_s"]) != 440:
        raise ValueError("Incomplete render states")
    model = mujoco.MjModel.from_xml_path(str(assets / "models/scene.xml"))
    model.vis.global_.offwidth, model.vis.global_.offheight = width, height
    data = mujoco.MjData(model)
    camera = mujoco.MjvCamera()
    camera.azimuth, camera.elevation, camera.distance = 135, -22, 2.4
    renderer = mujoco.Renderer(model, height=height, width=width)
    started = time.monotonic()
    command = [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{width}x{height}", "-pix_fmt", "rgb24",
        "-r", "20", "-i", "-", "-an", "-vcodec", "libx264", "-threads", "1", "-preset", "veryfast",
        "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(run / "simulation.mp4")]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for index, timestamp in enumerate(states["time_s"]):
            data.qpos[:], data.qvel[:], data.time = states["qpos"][index], states["qvel"][index], float(timestamp)
            mujoco.mj_forward(model, data)
            camera.lookat[:] = data.body("base_link").xpos
            camera.lookat[2] = .25
            renderer.update_scene(data, camera=camera)
            encoder.stdin.write(renderer.render().tobytes())
            if index % 40 == 0:
                print(f"rendered {index + 1}/440", flush=True)
        encoder.stdin.close()
        if encoder.wait(timeout=60):
            raise RuntimeError("Video encoding failed")
    finally:
        renderer.close()
        if encoder.poll() is None:
            encoder.terminate()
            encoder.wait(timeout=10)
    summary["video"] = {"width": width, "height": height, "fps": 20, "frames": 440,
        "duration_s": 22, "sha256": sha256(run / "simulation.mp4"),
        "render_wall_s": round(time.monotonic() - started, 3), "from_recorded_states": True}
    write_json(run / "summary.json", summary)
    print(json.dumps(summary["video"]), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    record_parser = sub.add_parser("record")
    record_parser.add_argument("--navigation-scripts", type=Path, required=True)
    record_parser.add_argument("--assets", type=Path, required=True)
    record_parser.add_argument("--output", type=Path, required=True)
    render_parser = sub.add_parser("render")
    render_parser.add_argument("--assets", type=Path, required=True)
    render_parser.add_argument("--run", type=Path, required=True)
    render_parser.add_argument("--ffmpeg", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "record":
        raise SystemExit(record(args.navigation_scripts, args.assets, args.output))
    render(args.assets, args.run, args.ffmpeg)
