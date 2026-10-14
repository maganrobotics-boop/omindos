"""Command-line access to the OmindOS simulation-only legged module."""
from __future__ import annotations

import argparse
import csv
from dataclasses import asdict
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

from .assets import default_asset_root, fetch_assets
from .profiles import create_controller, list_profiles
from .types import VelocityCommand


def _finite_number(value: str) -> float:
    try:
        number = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Expected a finite number") from exc
    if not math.isfinite(number):
        raise argparse.ArgumentTypeError("Expected a finite number")
    return number


def _positive_seconds(value: str) -> float:
    number = _finite_number(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("Duration must be positive")
    return number


def scenario_command(scenario: str, time_s: float, command: VelocityCommand) -> VelocityCommand:
    """Select a command at a policy tick; baseline is a fixed 20-second check."""
    if scenario == "constant":
        return command
    if scenario != "baseline":
        raise ValueError(f"Unknown scenario: {scenario}")
    if time_s < 3.0 or time_s >= 14.0:
        return VelocityCommand()
    if time_s < 10.0:
        return VelocityCommand(vx=0.3)
    return VelocityCommand(vx=0.3, wz=0.3)


class _VideoWriter:
    """Write real-time-rate frames, preferring broadly playable H.264."""

    def __init__(self, path: Path, width=720, height=540, fps=20):
        self.path = path
        self.frames = 0
        self.width, self.height = width, height
        self._process = None
        self._opencv = None
        if shutil.which("ffmpeg"):
            self.codec = "h264"
            self._process = subprocess.Popen(
                ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                 "-s", f"{width}x{height}", "-r", str(fps), "-i", "-", "-an", "-c:v", "libx264",
                 "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)],
                stdin=subprocess.PIPE, stderr=subprocess.PIPE,
            )
        else:
            try:
                import cv2
            except ImportError as exc:
                raise RuntimeError("Video requires ffmpeg or opencv-python-headless; omit --video for headless checks") from exc
            self.codec = "mp4v"
            self._opencv = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            if not self._opencv.isOpened():
                self._opencv.release()
                raise RuntimeError("Could not open the MP4 video writer")

    def write(self, rgb):
        if tuple(rgb.shape) != (self.height, self.width, 3):
            raise ValueError("Renderer returned an unexpected RGB frame shape")
        if self._process is not None:
            try:
                self._process.stdin.write(rgb.tobytes())
            except BrokenPipeError as exc:
                raise RuntimeError("ffmpeg stopped while encoding simulation video") from exc
        else:
            self._opencv.write(rgb[:, :, ::-1])
        self.frames += 1

    def close(self):
        if self._process is not None:
            try:
                self._process.stdin.close()
            except BrokenPipeError:
                pass
            error = self._process.stderr.read().decode("utf-8", errors="replace")
            exit_code = self._process.wait()
            self._process.stderr.close()
            self._process = None
            if exit_code:
                raise RuntimeError(f"ffmpeg could not encode video: {error.strip()}")
        if self._opencv is not None:
            self._opencv.release()
            self._opencv = None


def _state_row(state):
    row = {
        "time_s": state.time_s,
        "command_vx": state.command.vx, "command_vy": state.command.vy, "command_wz": state.command.wz,
        "vx_body": state.linear_velocity_body[0], "vy_body": state.linear_velocity_body[1], "vz_body": state.linear_velocity_body[2],
        "wx_body": state.angular_velocity_body[0], "wy_body": state.angular_velocity_body[1], "wz_body": state.angular_velocity_body[2],
        "base_x": state.base_position[0], "base_y": state.base_position[1], "base_z": state.base_position[2],
        "qw": state.base_orientation_wxyz[0], "qx": state.base_orientation_wxyz[1],
        "qy": state.base_orientation_wxyz[2], "qz": state.base_orientation_wxyz[3],
        "status": state.status, "fault_reason": state.fault_reason or "",
    }
    row.update({f"q/{name}": position for name, position in zip(state.joint_names, state.joint_positions)})
    row.update({f"dq/{name}": velocity for name, velocity in zip(state.joint_names, state.joint_velocities)})
    return row


def _write_log(path, samples):
    if not samples:
        return
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(samples[0]))
        writer.writeheader()
        writer.writerows(samples)


def _simulate(args) -> int:
    output = args.output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    requested_command = VelocityCommand(args.vx, args.vy, args.wz)
    summary = {
        "robot": args.robot, "backend": "mujoco", "scope": "simulation_only",
        "scenario": args.scenario, "requested_duration_s": args.duration,
        "requested_command": asdict(requested_command), "status": "error",
        "simulated_duration_s": 0.0, "control_steps": 0,
    }
    controller = None
    video = None
    samples = []
    started_at = time.monotonic()
    exit_code = 1
    try:
        # MuJoCo reads the GL setting on import. Headless physics needs no GL.
        if args.video:
            os.environ.setdefault("MUJOCO_GL", "egl")
        controller = create_controller(args.robot, args.asset_dir)
        period = float(controller.policy_period)
        if not math.isfinite(period) or period <= 0:
            raise ValueError("Controller policy period must be positive and finite")
        summary["policy_period_s"] = period
        summary["command_limits"] = list(controller.command_limits)
        summary["effective_constant_command"] = asdict(requested_command.clipped(controller.command_limits))
        state = controller.state()
        initial_state = state
        summary["initial_state"] = state.to_dict()
        samples.append(_state_row(state))
        if args.video:
            video = _VideoWriter(output / "simulation.mp4")
            summary["video"] = {"file": "simulation.mp4", "fps": 20, "width": 720, "height": 540, "codec": video.codec}
            video.write(controller.render(width=720, height=540))
        next_frame_s = 0.05
        steps = math.ceil(args.duration / period - 1e-9)
        simulation_started_at = time.monotonic()
        for index in range(steps):
            # Use tick time rather than accumulated floating-point time at boundaries.
            command = scenario_command(args.scenario, index * period, requested_command)
            state = controller.step(command)
            samples.append(_state_row(state))
            summary["control_steps"] = index + 1
            summary["simulated_duration_s"] = state.time_s - initial_state.time_s
            if args.video and summary["simulated_duration_s"] + 1e-9 >= next_frame_s and next_frame_s < args.duration - 1e-9:
                video.write(controller.render(width=720, height=540))
                next_frame_s += 0.05
            if state.status == "fault" or state.fault_reason:
                summary["status"] = "fault"
                summary["fault_reason"] = state.fault_reason or "Controller reported a fault"
                break
            if args.realtime:
                remaining = simulation_started_at + (index + 1) * period - time.monotonic()
                if remaining > 0:
                    time.sleep(remaining)
        else:
            summary["status"] = "completed"
            exit_code = 0
        summary["final_state"] = state.to_dict()
        summary["minimum_base_height_m"] = min(row["base_z"] for row in samples)
        summary["displacement_xy_m"] = [state.base_position[i] - initial_state.base_position[i] for i in range(2)]
        moving = [row for row in samples if row["time_s"] - initial_state.time_s >= (4.0 if args.scenario == "baseline" else 1.0)
                  and (args.scenario != "baseline" or row["time_s"] - initial_state.time_s < 10.0)]
        if moving:
            summary["mean_forward_velocity_body_m_s"] = sum(row["vx_body"] for row in moving) / len(moving)
    except KeyboardInterrupt:
        summary["status"] = "interrupted"
        summary["error"] = "Interrupted by user"
        exit_code = 130
    except Exception as exc:
        summary["error"] = str(exc)
        print(f"Simulation failed: {exc}", file=sys.stderr)
    finally:
        if video is not None:
            summary["video"]["frames"] = video.frames
            try:
                video.close()
            except Exception as exc:
                summary["status"] = "error"
                summary["video_error"] = str(exc)
                print(f"Video failed: {exc}", file=sys.stderr)
                exit_code = 1
        if controller is not None:
            try:
                controller.close()
            except Exception as exc:
                summary["status"] = "error"
                summary["cleanup_error"] = str(exc)
                exit_code = 1
        summary["wall_time_s"] = time.monotonic() - started_at
        _write_log(output / "simulation.csv", samples)
        (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": summary["status"], "simulated_duration_s": summary["simulated_duration_s"],
                      "summary": str(output / "summary.json"), "log": str(output / "simulation.csv") if samples else None}, ensure_ascii=False))
    return exit_code


def _parser():
    parser = argparse.ArgumentParser(prog="legged-robot", description="OmindOS legged robot simulation module (no hardware backend)")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("list", help="List registered robot profiles")
    fetch = subparsers.add_parser("fetch-assets", help="Download and verify the pinned upstream assets")
    fetch.add_argument("--asset-dir", type=Path, default=default_asset_root())
    describe = subparsers.add_parser("describe", help="Verify URDF/MJCF and joint mapping without a policy or simulator")
    describe.add_argument("--asset-dir", type=Path, default=default_asset_root())
    describe.add_argument("--output", type=Path, help="Write description.json and resolved robot.urdf in this local directory")
    simulate = subparsers.add_parser("simulate", help="Run the official policy in a local MuJoCo simulation")
    simulate.add_argument("--robot", default="roboto-origin")
    simulate.add_argument("--asset-dir", type=Path, default=default_asset_root())
    simulate.add_argument("--duration", type=_positive_seconds, default=20.0)
    simulate.add_argument("--vx", type=_finite_number, default=0.3)
    simulate.add_argument("--vy", type=_finite_number, default=0.0)
    simulate.add_argument("--wz", type=_finite_number, default=0.0)
    simulate.add_argument("--scenario", choices=("constant", "baseline"), default="constant")
    simulate.add_argument("--output", type=Path, default=Path("runs/legged-robot"))
    simulate.add_argument("--video", action="store_true", help="Render a 720x540, 20 fps MP4 (optional GL dependency)")
    simulate.add_argument("--realtime", action="store_true", help="Pace simulation ticks to wall-clock time")
    ros2 = subparsers.add_parser("ros2", help="Bridge the simulation to ROS2 cmd_vel, joint states, and odometry")
    ros2.add_argument("--robot", default="roboto-origin")
    ros2.add_argument("--asset-dir", type=Path, default=default_asset_root())
    ros2.add_argument("--namespace", default="legged_robot", help="ROS2 topic namespace for this robot")
    ros2.add_argument("--frame-prefix", default=None, help="TF frame prefix (default: namespace; empty explicitly uses global frames)")
    return parser


def main(argv=None) -> int:
    parser = _parser()
    args, extra = parser.parse_known_args(argv)
    if extra and args.command != "ros2":
        parser.error(f"unrecognized arguments: {' '.join(extra)}")
    if args.command == "simulate" and args.scenario == "baseline" and args.duration < 20.0:
        parser.error("The baseline scenario requires --duration >= 20 to include stand, forward, turn, and stop")
    if args.command == "list":
        print(json.dumps(list_profiles(), ensure_ascii=False, indent=2))
        return 0
    if args.command == "simulate":
        return _simulate(args)
    try:
        if args.command == "describe":
            from .description import load_description
            description = load_description(args.asset_dir)
            metadata = description.to_dict()
            if args.output:
                output = args.output.expanduser().resolve()
                output.mkdir(parents=True, exist_ok=True)
                (output / "description.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
                (output / "robot.urdf").write_text(description.urdf_xml(), encoding="utf-8")
            print(json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False))
            return 0
        if args.command == "fetch-assets":
            result = fetch_assets(args.asset_dir)
            print(json.dumps({"asset_dir": str(args.asset_dir.expanduser().resolve()), "result": result}, ensure_ascii=False, indent=2, default=str))
            return 0
        if extra and extra[0] != "--ros-args":
            parser.error("ROS2 remappings must start with --ros-args")
        from .ros2_bridge import run_ros2
        return run_ros2(args.robot, args.asset_dir, ros_args=extra,
                        namespace=args.namespace, frame_prefix=args.frame_prefix)
    except (RuntimeError, ValueError, FileNotFoundError, ImportError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
