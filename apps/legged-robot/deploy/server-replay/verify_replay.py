# SPDX-License-Identifier: GPL-3.0-only
"""Check the actual public replay using an isolated headless Chrome profile."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

from websockets.sync.client import connect


def verify(url, output, chrome):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    checks = []
    with tempfile.TemporaryDirectory(prefix="legged-replay-chrome-", ignore_cleanup_errors=True) as profile:
        process = subprocess.Popen([chrome, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                                    "--disable-gpu", "--remote-debugging-address=127.0.0.1",
                                    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 15
            while not port_file.exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("Chrome failed to start")
                time.sleep(0.1)
            port = port_file.read_text().splitlines()[0]
            request = urllib.request.Request(f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT")
            target = json.load(urllib.request.urlopen(request, timeout=10))
            with connect(target["webSocketDebuggerUrl"], open_timeout=10) as socket:
                sequence = 0

                def call(method, params=None):
                    nonlocal sequence
                    sequence += 1
                    socket.send(json.dumps({"id": sequence, "method": method, "params": params or {}}))
                    while True:
                        response = json.loads(socket.recv(timeout=15))
                        if response.get("id") == sequence:
                            if "error" in response:
                                raise RuntimeError(response["error"])
                            return response.get("result", {})

                def evaluate(expression):
                    response = call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
                    if "exceptionDetails" in response:
                        raise RuntimeError(response["exceptionDetails"])
                    return response["result"].get("value")

                call("Page.enable")
                call("Runtime.enable")
                for width, height in [(1366, 900), (390, 844), (320, 740)]:
                    call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
                    call("Page.navigate", {"url": url})
                    deadline = time.monotonic() + 20
                    expression = "document.getElementById('run-badge')?.textContent.includes('已完成') && document.getElementById('simulation-video')?.readyState >= 2"
                    while not evaluate(expression):
                        if time.monotonic() > deadline:
                            raise RuntimeError("Replay data or video did not load")
                        time.sleep(0.2)
                    result = evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,version:document.getElementById('record-version').textContent,duration:document.getElementById('simulation-video').duration,path:!!document.querySelector('#trajectory path')})")
                    assert result["scroll"] <= width, result
                    assert result["version"] == "0.1.0a2" and abs(result["duration"] - 20) < 0.05 and result["path"], result
                    point = evaluate("(()=>{const r=document.querySelector('[data-start=\"14\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    call("Input.dispatchMouseEvent", {"type": "mousePressed", "button": "left", "clickCount": 1, **point})
                    call("Input.dispatchMouseEvent", {"type": "mouseReleased", "button": "left", "clickCount": 1, **point})
                    deadline = time.monotonic() + 15
                    while not evaluate("(()=>{const v=document.getElementById('simulation-video');return v.currentTime>=14.5&&!v.seeking&&v.readyState>=3})()"):
                        if time.monotonic() > deadline:
                            raise RuntimeError("Video did not seek and play after the stage click")
                        time.sleep(0.2)
                    playback = evaluate("({time:document.getElementById('simulation-video').currentTime,stage:document.getElementById('stage-label').textContent,speed:document.getElementById('speed-value').textContent})")
                    assert playback["time"] >= 14 and "停车" in playback["stage"] and playback["speed"] != "—", playback
                    evaluate("document.getElementById('simulation-video').pause()")
                    metrics = call("Page.getLayoutMetrics")["cssContentSize"]
                    snapshot = call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True,
                                    "clip": {"x": 0, "y": 0, "width": width, "height": metrics["height"], "scale": 1}})
                    (output / f"replay-{width}.png").write_bytes(base64.b64decode(snapshot["data"]))
                    checks.append({"viewport": [width, height], "page": result, "playback": playback, "passed": True})
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    (output / "browser-check.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n")
    return checks


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://cloud.omindos.cn/legged-robot/")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chrome", default="/usr/bin/google-chrome")
    args = parser.parse_args()
    print(json.dumps(verify(args.url, args.output, args.chrome), ensure_ascii=False))
