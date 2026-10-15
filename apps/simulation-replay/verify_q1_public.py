# SPDX-License-Identifier: GPL-3.0-only
"""Audit public HTTPS bytes and retired Q1 paths using normal DNS and TLS."""
import argparse
import base64
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.request


def verify(expected_html, expected_model, output):
    base='https://cloud.omindos.cn'
    live=['/quadruped/','/quadruped/index.html','/quadruped/?v=q1-v12-20261015T022706Z']
    retired=['model.glb','source.STEP','OriginMind-Quadruped-V1.2.glb',
             'q1-v12-20261015T022706Z/index.html','q1-shell-v1-20261015T031421Z/index.html',
             'preview.html','reference.html','index.html.bak']
    checks=[]
    for path in live+['/quadruped/'+p for p in retired]+['/legged-robot/','/']:
        try:
            with urllib.request.urlopen(base+path,timeout=30) as r:
                status=r.status;data=r.read()
        except urllib.error.HTTPError as e:
            status=e.code;data=e.read()
        expected=404 if path in ['/quadruped/'+p for p in retired] else 200
        assert status==expected,(path,status)
        if path in live:
            assert hashlib.sha256(data).hexdigest()==expected_html
            text=data.decode()
            packed=re.search(r'id="model-data">(.*?)</script>',text,re.S)[1]
            raw=gzip.decompress(base64.b64decode(packed))
            assert hashlib.sha256(raw).hexdigest()==expected_model
            assert not any(x in text for x in ['source_sha256','bounds_mm','duplicate_component_labels','.STEP'])
        checks.append({'path':path,'status':status,'passed':True})
    req=urllib.request.Request(base+'/legged-robot/simulation.mp4',headers={'Range':'bytes=0-63'})
    with urllib.request.urlopen(req,timeout=30) as r:
        assert r.status==206 and len(r.read())==64
    checks.append({'path':'/legged-robot/simulation.mp4','status':206,'passed':True})
    report={'passed':True,'verified_at':datetime.now(timezone.utc).isoformat(),'checks':checks,
            'html_sha256':expected_html,'model_sha256':expected_model,'public_html_and_glb_match_private_accepted_exterior':True,
            'normal_public_dns_https':True}
    output.write_text(json.dumps(report,indent=2)+'\n')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html-sha256',required=True)
    parser.add_argument('--model-sha256',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(verify(args.html_sha256,args.model_sha256,args.output)))
