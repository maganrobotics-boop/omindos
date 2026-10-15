# SPDX-License-Identifier: GPL-3.0-only
"""Verify rejection of broken copies of an actual completed physics run."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from package_replay import package


def verify(run):
    passed = []
    for case in ["faulted-run", "missing-sample", "out-of-order-time", "changed-video"]:
        with tempfile.TemporaryDirectory(prefix="quadruped-package-check-") as temporary:
            root = Path(temporary)
            copied = root / "run"
            copied.mkdir()
            for name in ["summary.json", "simulation.csv", "simulation.mp4", "poster.jpg"]:
                shutil.copy2(run / name, copied / name)
            summary = json.loads((copied / "summary.json").read_text())
            if case == "faulted-run":
                summary["status"] = "failed"
            elif case in ["missing-sample", "out-of-order-time"]:
                csv = copied / "simulation.csv"
                lines = csv.read_text().splitlines(keepends=True)
                if case == "missing-sample":
                    del lines[51]
                else:
                    fields = lines[51].split(",")
                    fields[0] = "0"
                    lines[51] = ",".join(fields)
                csv.write_text("".join(lines))
                summary["csv_sha256"] = hashlib.sha256(csv.read_bytes()).hexdigest()
            else:
                with (copied / "simulation.mp4").open("ab") as stream:
                    stream.write(b"changed")
            (copied / "summary.json").write_text(json.dumps(summary))
            try:
                package(copied, root / "output")
            except ValueError as error:
                passed.append({"case": case, "rejected": True, "reason": str(error)})
            else:
                raise AssertionError("Accepted broken run: " + case)
    return passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.run), indent=2))
