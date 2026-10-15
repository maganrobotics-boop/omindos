# SPDX-License-Identifier: GPL-3.0-only
"""Package a verified quadruped run as a self-contained, read-only replay."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import shutil

FIELDS = ["time_s", "command_vx", "command_wz", "vx_body", "wz_body", "base_x", "base_y", "base_z", "upright", "yaw"]
CHECKS = {"complete", "upright", "clearance", "forward_progress", "turn_progress", "stop_speed", "policy_executed"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package(run, output):
    summary = json.loads((run / "summary.json").read_text())
    if (summary.get("schema_version") != 1 or summary.get("robot") != "mevius2" or
        summary.get("scope") != "simulation_only" or summary.get("status") != "completed" or
        set(summary.get("checks", {})) != CHECKS or not all(v is True for v in summary["checks"].values()) or
        summary.get("failure") is not None):
        raise ValueError("Only a completed, validated quadruped simulation can be packaged")
    if summary.get("control_steps") != 4400 or abs(summary.get("duration_s", 0) - 22) > .001:
        raise ValueError("Incomplete 22 second baseline")
    if digest(run / "simulation.csv") != summary.get("csv_sha256"):
        raise ValueError("CSV changed after simulation")
    video = summary.get("video", {})
    if (video.get("frames") != 440 or video.get("fps") != 20 or video.get("duration_s") != 22 or
        video.get("from_recorded_states") is not True or digest(run / "simulation.mp4") != video.get("sha256")):
        raise ValueError("Video does not match the recorded states")
    if not (run / "poster.jpg").is_file():
        raise ValueError("A poster frame is required")
    with (run / "simulation.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != 4401:
        raise ValueError("Missing physics samples")
    values = [{field: float(row[field]) for field in FIELDS} for row in rows]
    if any(not math.isfinite(v) for row in values for v in row.values()):
        raise ValueError("Nonfinite state")
    if any(abs(row["time_s"] - i * .005) > .000001 for i, row in enumerate(values)):
        raise ValueError("Missing or out-of-order physics timestamps")
    # Every twentieth physics state: 10 Hz telemetry, including both endpoints.
    samples = values[::20]
    # Explicit public allowlist: no source paths, render states, code or weights.
    public_fields = ["schema_version", "robot", "robot_label", "version", "server", "created_at", "scope",
        "status", "duration_s", "control_steps", "physics_hz", "policy_hz", "command_limits", "phases",
        "checks", "hardware_tested", "customer_Q1_dynamics_tested", "model_source", "upstream_commit",
        "policy_sha256", "asset_manifest_sha256", "csv_sha256", "video", "versions"]
    preview = {key: summary[key] for key in public_fields}
    preview["samples"] = samples
    if output.exists():
        raise ValueError("Use a new package directory to preserve prior snapshots")
    output.mkdir(parents=True)
    output.chmod(0o755)
    (output / "preview.json").write_text(json.dumps(preview, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    for name in ["simulation.mp4", "simulation.csv", "poster.jpg"]:
        shutil.copy2(run / name, output / name)
    shutil.copy2(Path(__file__).with_name("index.html"), output / "index.html")
    for path in output.iterdir():
        if path.is_file():
            path.chmod(0o644)
    manifest = {p.name: digest(p) for p in output.iterdir() if p.is_file()}
    return {"files": manifest, "samples": len(samples), "status": summary["status"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(package(args.run, args.output), ensure_ascii=False))
