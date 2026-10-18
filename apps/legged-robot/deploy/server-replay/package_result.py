# SPDX-License-Identifier: GPL-3.0-only
"""Make a static replay from an actual, completed server simulation."""
import argparse
import csv
from datetime import datetime
import json
import math
from pathlib import Path
import shutil
from zoneinfo import ZoneInfo


def package_result(run, output):
    run, output = Path(run).resolve(), Path(output).resolve()
    summary = json.loads((run / "summary.json").read_text())
    if summary.get("status") != "completed" or summary.get("scope") != "simulation_only":
        raise ValueError("Only a completed simulation result may be published")
    if summary.get("scenario") != "baseline" or summary.get("control_steps") != 1000:
        raise ValueError("Replay requires the complete 20 second baseline")
    if abs(summary["simulated_duration_s"] - 20.0) > 0.001:
        raise ValueError("Unexpected simulation duration")
    video = run / "simulation.mp4"
    if not video.is_file() or not video.stat().st_size:
        raise ValueError("A rendered simulation video is required")
    with (run / "simulation.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != 1001:
        raise ValueError("CSV does not contain every control step")
    fields = ("time_s", "command_vx", "command_wz", "vx_body", "wz_body", "base_x", "base_y", "base_z")
    samples = [{field: float(row[field]) for field in fields} for row in rows[::5]]
    if any(not math.isfinite(value) for sample in samples for value in sample.values()):
        raise ValueError("Nonfinite replay state")
    if any(a["time_s"] >= b["time_s"] for a, b in zip(samples, samples[1:])):
        raise ValueError("Replay timestamps must increase")
    from omindos_legged import __version__
    preview = {
        "robot": "roboto-origin", "version": __version__, "server": "腾讯云",
        "created_at": datetime.fromtimestamp((run / "summary.json").stat().st_mtime, ZoneInfo("Asia/Shanghai")).isoformat(),
        "scope": "simulation_only", "status": summary["status"],
        "duration_s": summary["simulated_duration_s"], "control_steps": summary["control_steps"],
        "command_limits": summary["command_limits"], "samples": samples,
    }
    output.mkdir(parents=True, exist_ok=True)
    output.chmod(0o755)
    (output / "preview.json").write_text(json.dumps(preview, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    for name in ("simulation.mp4", "simulation.csv"):
        shutil.copy2(run / name, output / name)
    shutil.copy2(Path(__file__).with_name("index.html"), output / "index.html")
    for name in ("preview.json", "simulation.mp4", "simulation.csv", "index.html"):
        (output / name).chmod(0o644)
    return {"output": str(output), "samples": len(samples), "status": preview["status"], "version": __version__}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(package_result(args.run, args.output), ensure_ascii=False))
