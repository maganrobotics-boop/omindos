# SPDX-License-Identifier: GPL-3.0-only
"""Create one portable HTML preview containing the real video and telemetry."""
import argparse
import base64
import hashlib
import json
from pathlib import Path


def make_offline(package, output):
    record = (package / "preview.json").read_text()
    data = json.loads(record)
    for name, expected in [("simulation.mp4", data["video"]["sha256"]), ("simulation.csv", data["csv_sha256"])]:
        if hashlib.sha256((package / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Changed packaged file: " + name)
    html = (package / "index.html").read_text()
    for name, mime in [("simulation.mp4", "video/mp4"), ("simulation.csv", "text/csv;charset=utf-8"),
                       ("preview.json", "application/json"), ("poster.jpg", "image/jpeg")]:
        uri = "data:" + mime + ";base64," + base64.b64encode((package / name).read_bytes()).decode()
        html = html.replace("./" + name, uri)
    start = html.index("        const response = await fetch('")
    end = html.index("        buildTrajectory(checked.samples);", start)
    html = html[:start] + "        const checked = checkedRecord(JSON.parse(document.getElementById('inline-record').textContent));\n" + html[end:]
    html = html.replace("  <script>", '<script id="inline-record" type="application/json">' + record.replace("<", "\\u003c") + "</script>\n  <script>", 1)
    html = html.replace('href="/quadruped/"', 'href="#page-title"')
    html = html.replace('href="/legged-robot/"', 'href="https://cloud.omindos.cn/legged-robot/"')
    html = html.replace('href="/"', 'href="https://cloud.omindos.cn/"')
    output.write_text(html)
    return {"bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(make_offline(args.package, args.output)))
