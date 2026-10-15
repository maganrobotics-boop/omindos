# SPDX-License-Identifier: GPL-3.0-only
"""Stage and publish the user-authorized OriginMind Q1 page on Tencent Cloud.

Only the approved generated HTML enters the new public snapshot. Private CAD,
model caches, source directory permissions and existing application services are
preserved. Production writes occur only in the explicit publish subcommand.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess

PUBLIC = Path('/var/www/omindos-quadruped-replay')
BIPED = Path('/var/www/omindos-legged-replay')
CLOUD = Path('/etc/nginx/sites-enabled/omindos-cloud').resolve()
SNIPPET = Path('/etc/nginx/snippets/omindos-quadruped-replay.conf')
HEADERS = Path('/etc/nginx/snippets/omindos-quadruped-replay-headers.conf')
INCLUDE = '    include /etc/nginx/snippets/omindos-quadruped-replay.conf;\n'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def atomic_write(path, content, mode=None):
    mode = mode or (stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644)
    temporary = path.with_name(path.name + '.q1-new')
    temporary.write_text(content)
    temporary.chmod(mode)
    os.replace(temporary, path)


def switch(path, target):
    temporary = path.with_name(path.name + '.q1-next')
    temporary.symlink_to(target)
    os.replace(temporary, path)


def stage(candidate, output, expected):
    html = candidate.read_text()
    if digest(candidate) != expected:
        raise ValueError('Candidate changed after verification')
    info = json.loads(re.search(r'<script type="application/json" id="model-info">(.*?)</script>', html, re.S)[1])
    if info['robot'] != 'originmind-q1' or info['scope'] != 'cad_geometry' or info['dynamics']['motion_simulation_verified'] is not False:
        raise ValueError('Expected the approved own-CAD preview')
    if any(marker in html for marker in ['__MODEL_INFO__', '__MODEL_GZIP_BASE64__', '__ORIGINMIND_LOGO__']):
        raise ValueError('Unresolved model content')
    output.mkdir(parents=True, exist_ok=True)
    release = 'q1-v12-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    # These are new, explicitly approved public snapshots; private parents are not chmodded.
    if not PUBLIC.exists():
        PUBLIC.mkdir(mode=0o755)
        PUBLIC.chmod(0o755)
    public = PUBLIC / release
    public.mkdir(mode=0o755)
    public.chmod(0o755)
    shutil.copyfile(candidate, public / 'index.html')
    (public / 'index.html').chmod(0o644)
    biped_current = BIPED / 'current'
    biped_before = biped_current.resolve(strict=True)
    biped_new = BIPED / (release + '-navigation')
    shutil.copytree(biped_before, biped_new)
    biped_html = (biped_new / 'index.html').read_text()
    if '/quadruped/' not in biped_html:
        anchor = '</header>'
        if biped_html.count(anchor) != 1:
            raise ValueError('Unexpected current biped header')
        nav = '<nav aria-label="机器人仿真" style="display:flex;gap:20px;flex-wrap:wrap;padding:16px 0 0;font-size:12px"><a href="/legged-robot/" aria-current="page">双足仿真</a><a href="/quadruped/">四足仿真</a></nav>'
        (biped_new / 'index.html').write_text(biped_html.replace(anchor, anchor + '\n    ' + nav))
    for file in biped_new.iterdir():
        if file.is_file():
            file.chmod(0o644)
    source = Path(__file__).parent
    route = (source / 'nginx.conf').read_text().replace('/etc/nginx/snippets/omindos-quadruped-replay-headers.conf', str(source / 'nginx-headers.conf')).replace(str(PUBLIC / 'current') + '/', str(public) + '/')
    (output / 'q1-preflight-route.conf').write_text(route)
    config = 'pid ' + str(output / 'preflight.pid') + ';\nerror_log ' + str(output / 'preflight-error.log') + ';\nevents {}\nhttp { include /etc/nginx/mime.types; access_log off; server { listen 127.0.0.1:18096; include ' + str(output / 'q1-preflight-route.conf') + '; location ^~ /legged-robot/ { alias ' + str(biped_new) + '/; index index.html; } location / { return 404; } } }\n'
    (output / 'preflight.conf').write_text(config)
    subprocess.run(['nginx', '-t', '-c', str(output / 'preflight.conf')], check=True)
    state = {'url': 'https://cloud.omindos.cn/quadruped/', 'release': release, 'public_dir': str(public),
        'html_sha256': expected, 'model_sha256': info['model_sha256'], 'source_sha256': info['source_sha256'],
        'scope': info['scope'], 'biped_previous': str(biped_before), 'biped_candidate': str(biped_new),
        'biped_unchanged_media': {p.name: digest(p) for p in biped_before.iterdir() if p.is_file() and p.name != 'index.html'},
        'previous_current': str((PUBLIC / 'current').resolve()) if (PUBLIC / 'current').is_symlink() else None,
        'published': False}
    save(output / 'release.json', state)
    return state


def check_browser_report(qa, expected_html):
    errors = qa.get('console_errors', qa.get('consoleErrors'))
    checks = qa.get('checks', [])
    if (qa.get('passed') is not True or qa.get('fixture', False) is not False
            or len(checks) != 20 or errors != []
            or any(check.get('passed') is not True for check in checks)):
        raise ValueError('The candidate Q1 browser checks must pass first')
    if qa.get('html_sha256') != expected_html:
        raise ValueError('Browser verification must match the candidate HTML')


def publish(output, source_commit):
    if not re.fullmatch('[a-f0-9]{40}', source_commit):
        raise ValueError('An exact approved source commit is required')
    state = json.loads((output / 'release.json').read_text())
    public = Path(state['public_dir'])
    if state['published'] or digest(public / 'index.html') != state['html_sha256']:
        raise ValueError('Unexpected release state')
    qa = json.loads((output / 'qa-q1/browser-check.json').read_text())
    check_browser_report(qa, state['html_sha256'])
    for name, expected in state['biped_unchanged_media'].items():
        if digest(Path(state['biped_candidate']) / name) != expected:
            raise ValueError('Biped media changed: ' + name)
    if (BIPED / 'current').resolve() != Path(state['biped_previous']):
        raise ValueError('Biped production changed; re-stage before publishing')
    previous_config = CLOUD.read_text()
    anchor = '    include /etc/nginx/snippets/omindos-legged-replay.conf;\n'
    if previous_config.count(anchor) != 1 or INCLUDE in previous_config:
        raise ValueError('Unexpected Cloud route state; inspect before publishing')
    next_config = previous_config.replace(anchor, anchor + INCLUDE)
    (output / 'cloud-before-release.conf').write_text(previous_config)
    original_snippet = SNIPPET.read_text() if SNIPPET.exists() else None
    original_headers = HEADERS.read_text() if HEADERS.exists() else None
    source = Path(__file__).parent
    try:
        atomic_write(HEADERS, (source / 'nginx-headers.conf').read_text())
        atomic_write(SNIPPET, (source / 'nginx.conf').read_text())
        switch(PUBLIC / 'current', public)
        switch(BIPED / 'current', Path(state['biped_candidate']))
        atomic_write(CLOUD, next_config)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        # Restore only this release's own writes, keeping other services intact.
        if CLOUD.read_text() == next_config:
            atomic_write(CLOUD, previous_config)
        switch(BIPED / 'current', Path(state['biped_previous']))
        if state['previous_current']:
            switch(PUBLIC / 'current', Path(state['previous_current']))
        elif (PUBLIC / 'current').is_symlink():
            (PUBLIC / 'current').unlink()
        for path, previous in [(SNIPPET, original_snippet), (HEADERS, original_headers)]:
            if previous is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, previous)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    state.update(published=True, source_commit=source_commit, completed_at=datetime.now(timezone.utc).isoformat(),
                 cloud_config_sha256=digest(CLOUD), biped_html_sha256=digest(BIPED / 'current/index.html'))
    save(output / 'release.json', state)
    return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    st = sub.add_parser('stage')
    st.add_argument('--candidate', type=Path, required=True)
    st.add_argument('--output', type=Path, required=True)
    st.add_argument('--sha256', required=True)
    pub = sub.add_parser('publish')
    pub.add_argument('--output', type=Path, required=True)
    pub.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    result = stage(args.candidate, args.output, args.sha256) if args.operation == 'stage' else publish(args.output, args.source_commit)
    print(json.dumps(result, ensure_ascii=False, indent=2))
