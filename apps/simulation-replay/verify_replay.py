# SPDX-License-Identifier: GPL-3.0-only
"""End-to-end replay check in an isolated headless Chrome test profile."""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

from websockets.sync.client import connect


def verify(url, output, chrome, check_failures=True):
    output.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []
    with tempfile.TemporaryDirectory(prefix="quadruped-replay-test-", ignore_cleanup_errors=True) as profile:
        process = subprocess.Popen([chrome, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
            "--disable-gpu", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
            "--user-data-dir=" + profile, "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 15
            while not port_file.exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("Chrome failed to start")
                time.sleep(.1)
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
                        if response.get("method") == "Runtime.exceptionThrown":
                            errors.append(response["params"])
                        if response.get("id") == sequence:
                            if "error" in response:
                                raise RuntimeError(response["error"])
                            return response.get("result", {})

                def evaluate(expression):
                    result = call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
                    if "exceptionDetails" in result:
                        raise RuntimeError(result["exceptionDetails"])
                    return result["result"].get("value")

                def until(expression, seconds=20):
                    deadline = time.monotonic() + seconds
                    while not evaluate(expression):
                        if time.monotonic() > deadline:
                            raise RuntimeError("Timed out: " + expression)
                        time.sleep(.1)

                call("Page.enable")
                call("Runtime.enable")
                for width, height in [(1366, 900), (768, 1024), (390, 844), (320, 740)]:
                    call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height,
                        "deviceScaleFactor": 1, "mobile": width < 500})
                    call("Page.navigate", {"url": url})
                    until("document.getElementById('run-badge')?.textContent.includes('已完成') && document.getElementById('simulation-video')?.readyState>=2")
                    info = evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.title,duration:document.getElementById('simulation-video').duration,path:!!document.querySelector('#trajectory path'),logo:document.querySelector('.brand-mark').naturalWidth,buttons:Array.from(document.querySelectorAll('.stage')).map(b=>({start:Number(b.dataset.start),disabled:b.disabled,name:b.firstChild.textContent}))})")
                    assert info["scroll"] <= width and info["logo"] > 0 and info["path"], info
                    assert "四足" in info["title"] and abs(info["duration"] - 22) < .05, info
                    assert len(info["buttons"]) == 5 and not any(b["disabled"] for b in info["buttons"]), info
                    for index, button in enumerate(info["buttons"]):
                        point = evaluate(f"(()=>{{const b=document.querySelectorAll('.stage')[{index}];b.scrollIntoView({{block:'center'}});const r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
                        call("Input.dispatchMouseEvent", {"type": "mousePressed", "button": "left", "clickCount": 1, **point})
                        call("Input.dispatchMouseEvent", {"type": "mouseReleased", "button": "left", "clickCount": 1, **point})
                        start = button["start"]
                        until(f"(()=>{{const v=document.getElementById('simulation-video');return v.currentTime>={start+.4}&&!v.seeking&&v.readyState>=3&&!v.paused}})()")
                        value = evaluate("({time:document.getElementById('simulation-video').currentTime,label:document.getElementById('stage-label').textContent,speed:document.getElementById('speed-value').textContent,height:document.getElementById('height-value').textContent,sample:document.getElementById('sample-label').textContent,pressed:document.querySelector('.stage[aria-pressed=true]')?.firstChild.textContent,cx:document.querySelector('#trajectory circle:last-child').getAttribute('cx')})")
                        assert button["name"] in value["label"] and value["pressed"] == button["name"], value
                        assert value["speed"] != "—" and value["height"] != "—", value
                        call("Runtime.evaluate", {"expression": "document.getElementById('simulation-video').pause()"})
                        if index == 2:
                            evaluate("scrollTo(0,0)")
                            bounds = call("Page.getLayoutMetrics")["cssContentSize"]
                            capture = call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True,
                                "clip": {"x": 0, "y": 0, "width": width, "height": bounds["height"], "scale": 1}})
                            (output / f"quadruped-{width}.png").write_bytes(base64.b64decode(capture["data"]))
                        checks.append({"viewport": [width, height], "phase": button["name"], "state": value, "passed": True})
                assert not errors, errors
                if check_failures:
                    # Missing files must not produce live-looking controls or invented data.
                    call("Network.enable")
                    call("Network.setBlockedURLs", {"urls": ["*preview.json"]})
                    call("Page.navigate", {"url": url})
                    until("document.getElementById('run-badge')?.textContent==='运行记录不可用'")
                    assert evaluate("Array.from(document.querySelectorAll('.stage')).every(b=>b.disabled)&&!document.querySelector('#trajectory path')"), "missing-record fallback"
                    checks.append({"scenario": "missing-record", "passed": True})
                    call("Network.setBlockedURLs", {"urls": ["*simulation.mp4"]})
                    call("Page.navigate", {"url": url})
                    until("document.getElementById('stage-label')?.textContent==='视频加载失败'")
                    assert evaluate("Array.from(document.querySelectorAll('.stage')).every(b=>b.disabled)&&document.getElementById('speed-value').textContent==='—'"), "missing-video fallback"
                    checks.append({"scenario": "missing-video", "passed": True})
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    report = {"url": url, "checks": checks, "console_errors": errors, "passed": True}
    (output / "browser-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chrome", default="/usr/bin/google-chrome")
    parser.add_argument("--standalone", action="store_true", help="Skip missing-file checks for embedded HTML")
    args = parser.parse_args()
    result = verify(args.url, args.output, args.chrome, check_failures=not args.standalone)
    print(json.dumps({"passed": result["passed"], "checks": len(result["checks"])}))
