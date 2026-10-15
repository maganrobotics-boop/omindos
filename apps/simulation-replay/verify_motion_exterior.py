# SPDX-License-Identifier: GPL-3.0-only
"""Exercise actual browser controls and sampled dynamics, using isolated Chrome."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

from websockets.sync.client import connect


def verify(url, output):
    output.mkdir(parents=True, exist_ok=False)
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
        html_sha256 = hashlib.sha256(raw).hexdigest()
        import re, gzip
        markup=raw.decode()
        info=json.loads(re.search(r'id="model-info">(.*?)</script>',markup,re.S)[1])
        assert info.get('source_meshes_embedded') is False, info
        assert not any(t in markup for t in ['source_sha256','assembly_corrections','source_project'])
        packed=gzip.decompress(base64.b64decode(re.search(r'id="replay-data">(.*?)</script>',markup,re.S)[1]))
        replay=json.loads(packed)
        assert not any(t in packed.decode() for t in ['source_sha256','assembly_corrections','source_project'])
        assert len(replay['frames'])==1100
        assert not replay.get('hardware_validated',False)
    checks, errors = [], []
    with tempfile.TemporaryDirectory(prefix="q1-motion-", ignore_cleanup_errors=True) as profile:
        process = subprocess.Popen(["/usr/bin/google-chrome", "--headless=new", "--no-sandbox",
            "--disable-dev-shm-usage", "--disable-gpu", "--enable-unsafe-swiftshader",
            "--renderer-process-limit=1", "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            portfile = Path(profile) / "DevToolsActivePort"
            deadline = time.monotonic() + 30
            while not portfile.exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("Chrome unavailable")
                time.sleep(.1)
            port = portfile.read_text().splitlines()[0]
            req = urllib.request.Request(f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT")
            target = json.load(urllib.request.urlopen(req, timeout=10))
            with connect(target["webSocketDebuggerUrl"], open_timeout=15, ping_interval=None) as socket:
                sequence = 0

                def call(method, params=None):
                    nonlocal sequence
                    sequence += 1
                    socket.send(json.dumps(dict(id=sequence, method=method, params=params or {})))
                    while True:
                        result = json.loads(socket.recv(timeout=45))
                        if result.get("method") == "Runtime.exceptionThrown":
                            errors.append(result["params"])
                        if result.get("id") == sequence:
                            if "error" in result:
                                raise RuntimeError(result["error"])
                            return result.get("result", {})

                def evaluate(code):
                    result = call("Runtime.evaluate", dict(expression=code, returnByValue=True))
                    if "exceptionDetails" in result:
                        raise RuntimeError(result["exceptionDetails"])
                    return result["result"].get("value")

                def until(code, seconds=90):
                    deadline = time.monotonic() + seconds
                    while not evaluate(code):
                        if time.monotonic() > deadline:
                            raise RuntimeError("Timed out: " + code + "; " + str(evaluate("document.querySelector('#loading')?.textContent")))
                        time.sleep(.1)

                def click(selector):
                    p = evaluate("(()=>{const b=document.querySelector(" + json.dumps(selector) + ");b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    for kind in ["mousePressed", "mouseReleased"]:
                        call("Input.dispatchMouseEvent", dict(type=kind, button="left", clickCount=1, **p))

                def seek(value):
                    old = evaluate("q1Viewer.getState().poseRevision")
                    evaluate(f"(()=>{{const b=document.querySelector('#sim-seek');b.value={value};b.dispatchEvent(new Event('input',{{bubbles:true}}));}})()")
                    until(f"q1Viewer.getState().poseRevision>{old}")
                    state = evaluate("q1Viewer.getState()")
                    assert abs(state["time"] - value) < .011 and not state["playing"], state
                    return state

                call("Page.enable")
                call("Runtime.enable")
                for width, height in [(1366, 900), (768, 1024), (390, 844), (320, 740)]:
                    print(json.dumps(dict(viewport=[width, height], stage="loading")), flush=True)
                    call("Emulation.setDeviceMetricsOverride", dict(width=width, height=height, deviceScaleFactor=1, mobile=width < 500))
                    call("Page.navigate", dict(url=url))
                    until("window.q1Viewer?.getState().ready&&q1Viewer.getState().frameRevision>0")
                    state = evaluate("q1Viewer.getState()")
                    text = evaluate("document.body.innerText")
                    assert state["motionReplay"] and not state["geometryOnly"] and state["bodyCount"] == 21
                    assert not state["playing"] and not state["hardwareValidated"]
                    assert state["vertices"] > 1000 and 1000 < state["triangles"] <= 60000
                    assert evaluate("document.documentElement.scrollWidth") <= width
                    assert evaluate("document.querySelector('.brand img').naturalWidth") > 0
                    assert "估算" in text  and "MEVIUS" not in text
                    assert evaluate("[...document.querySelectorAll('.download a')].every(a=>a.href.startsWith('blob:')&&!a.hidden)")
                    checks.append(dict(viewport=[width, height], check="own-model-layout-provenance", passed=True))
                    print(json.dumps(dict(viewport=[width, height], stage="model-ready")), flush=True)
                    for view in ["front", "side", "top", "iso"]:
                        old = evaluate("q1Viewer.getState().frameRevision")
                        click("button[data-view=" + view + "]")
                        until(f"q1Viewer.getState().frameRevision>{old}")
                        assert evaluate("document.querySelector('canvas').dataset.view") == view
                        checks.append(dict(viewport=[width, height], check="view-" + view, passed=True))
                    print(json.dumps(dict(viewport=[width, height], stage="views-passed")), flush=True)
                    crouch = seek(0)
                    stand = seek(4.5)
                    walk = seek(11)
                    end = seek(21.9)
                    assert stand["telemetry"]["height"] - crouch["telemetry"]["height"] > .15
                    assert abs(stand["telemetry"]["height"] - .4) < .01
                    assert .4 < walk["telemetry"]["advance"] < .5
                    assert 1.0 < end["telemetry"]["advance"] < 1.03
                    assert abs(end["telemetry"]["speed"]) < .002
                    checks.append(dict(viewport=[width, height], check="sampled-rise-walk-stop", samples=[crouch["telemetry"], stand["telemetry"], walk["telemetry"], end["telemetry"]], passed=True))
                    seek(6)
                    click("#sim-play")
                    until("q1Viewer.getState().time>6.2")
                    click("#sim-play")
                    assert not evaluate("q1Viewer.getState().playing")
                    evaluate("document.querySelector('#sim-rate').value='2';document.querySelector('#sim-rate').dispatchEvent(new Event('change'))")
                    assert evaluate("q1Viewer.getState().rate") == 2
                    click("#sim-reset")
                    until("q1Viewer.getState().time===0")
                    for chapter in [1, 6, 16]:
                        click(f"button[data-phase='{chapter}']")
                        until(f"q1Viewer.getState().time>={chapter}&&q1Viewer.getState().playing")
                        click("#sim-play")
                    checks.append(dict(viewport=[width, height], check="play-pause-rate-reset-chapters", passed=True))
                    old = evaluate("q1Viewer.getState().theta")
                    evaluate("document.querySelector('canvas').focus()")
                    call("Input.dispatchKeyEvent", dict(type="keyDown", key="ArrowRight", code="ArrowRight"))
                    call("Input.dispatchKeyEvent", dict(type="keyUp", key="ArrowRight", code="ArrowRight"))
                    assert evaluate("q1Viewer.getState().theta") > old
                    p = evaluate("(()=>{const b=document.querySelector('canvas');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    old = evaluate("q1Viewer.getState().distance")
                    call("Input.dispatchMouseEvent", dict(type="mouseWheel", x=p["x"], y=p["y"], deltaX=0, deltaY=-100))
                    until(f"q1Viewer.getState().distance<{old}")
                    checks.append(dict(viewport=[width, height], check="keyboard-zoom", passed=True))
                    seek(4.5)
                    click("button[data-view=iso]")
                    evaluate("scrollTo(0,0)")
                    until("q1Viewer.getState().telemetry.time===4.5")
                    bounds = call("Page.getLayoutMetrics")["cssContentSize"]
                    shot = call("Page.captureScreenshot", dict(format="png", captureBeyondViewport=True,
                                clip=dict(x=0, y=0, width=width, height=bounds["height"], scale=1)))
                    (output / f"motion-{width}.png").write_bytes(base64.b64decode(shot["data"]))
                    print(json.dumps(dict(viewport=[width, height], checks=len(checks), passed=True)), flush=True)
                assert not errors, errors
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    report = dict(passed=True, url=url, html_sha256=html_sha256, checks=checks, console_errors=errors)
    (output / "browser-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    result = verify(args.url, args.output)
    print(json.dumps(dict(passed=result["passed"], checks=len(result["checks"]))))