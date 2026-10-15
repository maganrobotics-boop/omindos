# SPDX-License-Identifier: GPL-3.0-only
"""Verify the portable Q1 assembly viewer with an isolated Chrome profile."""
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


def verify(url, output, chrome, fixture=False, biped_url=None):
    output.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=30) as response:
        html_sha256 = hashlib.sha256(response.read()).hexdigest()
    checks, errors, navigation_checks = [], [], []
    with tempfile.TemporaryDirectory(prefix="originmind-q1-", ignore_cleanup_errors=True) as profile:
        process = subprocess.Popen([chrome, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
            "--disable-gpu", "--enable-unsafe-swiftshader", "--renderer-process-limit=1", "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0", "--user-data-dir="+profile, "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile)/"DevToolsActivePort"
            deadline = time.monotonic()+20
            while not port_file.exists():
                if process.poll() is not None or time.monotonic()>deadline:
                    raise RuntimeError("Chrome failed to start")
                time.sleep(.1)
            port = port_file.read_text().splitlines()[0]
            request = urllib.request.Request(f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT")
            target = json.load(urllib.request.urlopen(request, timeout=10))
            with connect(target["webSocketDebuggerUrl"], open_timeout=10, ping_interval=None) as socket:
                sequence = 0
                def call(method, params=None):
                    nonlocal sequence
                    sequence += 1
                    socket.send(json.dumps({"id":sequence,"method":method,"params":params or {}}))
                    while True:
                        response = json.loads(socket.recv(timeout=30))
                        if response.get("method")=="Runtime.exceptionThrown":
                            errors.append(response["params"])
                        if response.get("id")==sequence:
                            if "error" in response:
                                raise RuntimeError(response["error"])
                            return response.get("result",{})
                def evaluate(expression):
                    result=call("Runtime.evaluate",{"expression":expression,"returnByValue":True})
                    if "exceptionDetails" in result:
                        raise RuntimeError(result["exceptionDetails"])
                    return result["result"].get("value")
                def until(expression):
                    deadline=time.monotonic()+90
                    while not evaluate(expression):
                        if time.monotonic()>deadline:
                            raise RuntimeError("Timed out: "+expression+"; "+str(evaluate("document.getElementById('loading')?.textContent")))
                        time.sleep(.15)
                call("Page.enable")
                call("Runtime.enable")
                for width,height in [(1366,900),(768,1024),(390,844),(320,740)]:
                    call("Emulation.setDeviceMetricsOverride",{"width":width,"height":height,"deviceScaleFactor":1,"mobile":width<500})
                    call("Page.navigate",{"url":url})
                    until("window.q1Viewer?.getState().ready&&q1Viewer.getState().frameRevision>0&&document.querySelector('#model-canvas').width>0")
                    info=evaluate("({state:q1Viewer.getState(),scroll:document.documentElement.scrollWidth,text:document.body.innerText,video:!!document.querySelector('video'),logo:document.querySelector('.brand img').naturalWidth})")
                    assert info["state"]["model"]=="originmind-q1" and info["state"]["geometryOnly"],info
                    assert info["state"]["vertices"]>=(24 if fixture else 1000),info
                    if not fixture:
                        assert .5<info["state"]["boundsM"][1]<.75 and 1.0<info["state"]["boundsM"][2]<1.2,info
                    assert info["scroll"]<=width and info["logo"]>0 and not info["video"],info
                    assert "MEVIUS" not in info["text"] and "关节与动力学参数待核对" in info["text"],info
                    for view in ["front","side","top","iso"]:
                        point=evaluate(f"(()=>{{const b=document.querySelector('button[data-view={view}]');b.scrollIntoView({{block:'center'}});const r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
                        call("Input.dispatchMouseEvent",{"type":"mousePressed","button":"left","clickCount":1,**point})
                        call("Input.dispatchMouseEvent",{"type":"mouseReleased","button":"left","clickCount":1,**point})
                        assert evaluate("document.querySelector('canvas').dataset.view")==view
                        checks.append({"viewport":[width,height],"view":view,"passed":True})
                    evaluate("document.getElementById('rotate').click()")
                    assert evaluate("q1Viewer.getState().auto") is True
                    evaluate("document.getElementById('rotate').click()")
                    assert evaluate("q1Viewer.getState().auto") is False
                    evaluate("document.querySelector('canvas').focus()")
                    before=evaluate("q1Viewer.getState().theta")
                    call("Input.dispatchKeyEvent",{"type":"keyDown","key":"ArrowRight","code":"ArrowRight"})
                    call("Input.dispatchKeyEvent",{"type":"keyUp","key":"ArrowRight","code":"ArrowRight"})
                    assert evaluate("q1Viewer.getState().theta")>before
                    call("Emulation.setTouchEmulationEnabled",{"enabled":True,"maxTouchPoints":2})
                    point=evaluate("(()=>{const c=document.querySelector('canvas');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                    before=evaluate("q1Viewer.getState().theta")
                    call("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{**point,"id":1}]})
                    call("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":point["x"]+28,"y":point["y"]+15,"id":1}]})
                    call("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
                    assert evaluate("q1Viewer.getState().theta")!=before
                    before=evaluate("q1Viewer.getState().distance")
                    call("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":point["x"]-24,"y":point["y"],"id":1},{"x":point["x"]+24,"y":point["y"],"id":2}]})
                    call("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":point["x"]-42,"y":point["y"],"id":1},{"x":point["x"]+42,"y":point["y"],"id":2}]})
                    call("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
                    assert evaluate("q1Viewer.getState().distance")<before
                    call("Emulation.setTouchEmulationEnabled",{"enabled":False})
                    rendered=evaluate("q1Viewer.getState().frameRevision")
                    evaluate("document.querySelector('button[data-view=iso]').click();scrollTo(0,0)")
                    until(f"q1Viewer.getState().frameRevision>{rendered}")
                    reset=evaluate("q1Viewer.getState()")
                    assert reset['distance']==1.9 and reset['theta']==.94 and reset['phi']==1.12,reset
                    time.sleep(.3)
                    distinct=evaluate("(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2'),p=new Uint8Array(4),a=[];for(let y=.25;y<.8;y+=.1)for(let x=.2;x<.8;x+=.1){g.readPixels(Math.round(c.width*x),Math.round(c.height*y),1,1,g.RGBA,g.UNSIGNED_BYTE,p);a.push([...p]);}return new Set(a.map(v=>v.join(','))).size})()")
                    assert distinct>=(2 if fixture else 9),distinct
                    bounds=call("Page.getLayoutMetrics")["cssContentSize"]
                    screenshot=call("Page.captureScreenshot",{"format":"png","captureBeyondViewport":True,"clip":{"x":0,"y":0,"width":width,"height":bounds["height"],"scale":1}})
                    (output/f"q1-{width}.png").write_bytes(base64.b64decode(screenshot["data"]))
                    checks.append({"viewport":[width,height],"interaction":"rotation-keyboard-touch-pinch","distinct_pixel_samples":distinct,"state":evaluate("q1Viewer.getState()"),"passed":True})
                if biped_url:
                    for width,height in [(1366,900),(390,844)]:
                        call("Emulation.setDeviceMetricsOverride",{"width":width,"height":height,"deviceScaleFactor":1,"mobile":width<500})
                        call("Page.navigate",{"url":biped_url})
                        until("document.querySelector('a[href=\"/quadruped/\"]')&&document.querySelector('video')?.readyState>=1")
                        status=evaluate("({scroll:document.documentElement.scrollWidth,video:document.querySelector('video').readyState,quadruped:document.querySelector('a[href=\"/quadruped/\"]').href})")
                        assert status['scroll']<=width and status['video']>=1,status
                        navigation_checks.append({"viewport":[width,height],"biped_navigation":True,"passed":True})
                assert not errors,errors
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    report={"passed":True,"fixture":fixture,"url":url,"html_sha256":html_sha256,"checks":checks,"navigation_checks":navigation_checks,"console_errors":errors}
    (output/"browser-check.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url",required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--chrome",default="/usr/bin/google-chrome")
    parser.add_argument("--fixture",action="store_true")
    parser.add_argument("--biped-url")
    args=parser.parse_args()
    result=verify(args.url,args.output,args.chrome,args.fixture,args.biped_url)
    print(json.dumps({"passed":result["passed"],"checks":len(result["checks"]),"fixture":args.fixture}))
