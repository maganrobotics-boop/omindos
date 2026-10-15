# SPDX-License-Identifier: GPL-3.0-only
"""Render private original, rejected blocks and exterior at identical cameras."""
import argparse,base64,json,subprocess,tempfile,time,urllib.request
from pathlib import Path
from websockets.sync.client import connect


def capture(base,output):
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='q1-compare-') as profile:
        process=subprocess.Popen(['/usr/bin/google-chrome','--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader','--renderer-process-limit=1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            f=Path(profile)/'DevToolsActivePort'
            for _ in range(200):
                if f.exists():break
                time.sleep(.1)
            port=f.read_text().splitlines()[0]
            req=urllib.request.Request('http://127.0.0.1:'+port+'/json/new?about:blank',method='PUT')
            target=json.load(urllib.request.urlopen(req))
            with connect(target['webSocketDebuggerUrl'],ping_interval=None) as ws:
                seq=0
                def call(method,params=None):
                    nonlocal seq
                    seq+=1;ws.send(json.dumps({'id':seq,'method':method,'params':params or {}}))
                    while True:
                        r=json.loads(ws.recv(timeout=60))
                        if r.get('id')==seq:
                            if 'error' in r:raise RuntimeError(r)
                            return r.get('result',{})
                def ev(s):
                    return call('Runtime.evaluate',{'expression':s,'returnByValue':True})['result'].get('value')
                def wait(s):
                    for _ in range(600):
                        if ev(s):return
                        time.sleep(.1)
                    raise RuntimeError('Timed out '+s)
                call('Page.enable')
                for width,height in [(1366,900),(390,844)]:
                    call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':width<500})
                    for label in ['original','blocks','exterior']:
                        call('Page.navigate',{'url':base+'/'+label+'.html'})
                        wait('window.q1Viewer?.getState().ready&&q1Viewer.getState().frameRevision>0')
                        for view in ['front','side','rear','iso']:
                            previous=ev('q1Viewer.getState().frameRevision')
                            ev('q1Viewer.setView('+json.dumps(view)+');scrollTo(0,0)')
                            wait('q1Viewer.getState().frameRevision>'+str(previous))
                            box=ev('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()')
                            shot=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':True,'clip':box})
                            (output/f'{label}-{width}-{view}.png').write_bytes(base64.b64decode(shot['data']))
                            print(label,width,view,flush=True)
        finally:
            process.terminate();process.wait(timeout=10)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();capture(a.base,a.output)
