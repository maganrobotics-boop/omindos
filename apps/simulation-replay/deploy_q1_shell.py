# SPDX-License-Identifier: GPL-3.0-only
"""Replace only the Q1 HTML after private verification; archive old HTML privately."""
import argparse
import base64
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from audit_q1_exterior import inspect

PUBLIC=Path('/var/www/omindos-quadruped-replay')
PRIVATE=Path('/opt/omindos-quadruped-simulation')
OLD_SHA='e3b98f5ff93db45c16f526d5610f4e1927126c3b420f8f59c5b22817b4fc3f7b'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(candidate, report, fidelity):
    html=candidate.read_text()
    packed=re.search(r'id="model-data">(.*?)</script>',html,re.S)[1]
    glb=gzip.decompress(base64.b64decode(packed))
    inspected=inspect(candidate)
    visual=json.loads(fidelity.read_text())
    assert visual['passed'] is True and visual['html_sha256']==digest(candidate)
    assert visual['model_sha256']==inspected['model_sha256']
    assert len(visual['silhouette_checks'])==8 and all(c['passed'] for c in visual['silhouette_checks'])
    info=json.loads(re.search(r'id="model-info">(.*?)</script>',html,re.S)[1])
    assert info['scope']=='public_exterior_wrap' and info['source_meshes_embedded'] is False
    assert info['dynamics']['motion_simulation_verified'] is False
    assert info['model_sha256']==hashlib.sha256(glb).hexdigest()
    assert 'source_sha256' not in info and 'bounds_mm' not in info
    qa=json.loads(report.read_text())
    assert qa['passed'] is True and qa['fixture'] is False and qa['console_errors']==[]
    assert qa['html_sha256']==digest(candidate)
    assert len(qa['checks'])==24 and all(c['passed'] is True for c in qa['checks'])
    return info


def publish(candidate, report, fidelity, commit):
    assert re.fullmatch('[a-f0-9]{40}',commit)
    info=validate(candidate,report,fidelity)
    current=PUBLIC/'current'
    previous=current.resolve(strict=True)
    assert previous.parent==PUBLIC and digest(previous/'index.html')==OLD_SHA, 'Production changed; inspect before retrying'
    assert set(p.name for p in previous.iterdir())=={'index.html'}
    assert PRIVATE.stat().st_mode & 0o077 == 0, 'Backup parent must be private'
    # No nginx, biped, other public meshes, or application service changes.
    subprocess.run(['nginx','-t'],check=True)
    release='q1-exterior-v2-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    receipt_dir=PRIVATE/release
    receipt_dir.mkdir(mode=0o700)
    backup=receipt_dir/'previous-public-release'
    shutil.copytree(previous,backup)
    backup.chmod(0o700)
    (backup/'index.html').chmod(0o600)
    assert digest(backup/'index.html')==OLD_SHA
    target=PUBLIC/release
    target.mkdir(mode=0o755)
    target.chmod(0o755)
    shutil.copyfile(candidate,target/'index.html')
    (target/'index.html').chmod(0o644)
    assert digest(target/'index.html')==digest(candidate)
    assert current.resolve()==previous and digest(previous/'index.html')==OLD_SHA
    temporary=PUBLIC/'.shell-next'
    temporary.symlink_to(target)
    os.replace(temporary,current)
    # Keep original snapshot intact but remove it from all public filesystem roots.
    archived=receipt_dir/previous.name
    shutil.move(str(previous),str(archived))
    archived.chmod(0o700)
    (archived/'index.html').chmod(0o600)
    assert digest(archived/'index.html')==OLD_SHA
    receipt={'published':True,'release':release,'url':'https://cloud.omindos.cn/quadruped/',
             'published_at':datetime.now(timezone.utc).isoformat(),'source_commit':commit,
             'html_sha256':digest(target/'index.html'),'model_sha256':info['model_sha256'],
             'scope':info['scope'],'previous_html_sha256':OLD_SHA,
             'private_backup':str(archived),'rollback_policy':'Detailed backup is private; do not restore publicly without explicit authorization.',
             'motion_simulation_verified':False}
    (receipt_dir/'release.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--source-commit',required=True)
    parser.add_argument('--fidelity',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(publish(args.candidate,args.report,args.fidelity,args.source_commit),indent=2))
