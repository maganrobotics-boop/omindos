#!/usr/bin/env python3
"""Render Nginx locations for Chinese static pages without changing app routes."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('website', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
args.destination.mkdir(parents=True, exist_ok=True)
headers = '/etc/nginx/snippets/omindos-static-headers.conf'
lines = ['# Generated from cn/**/index.html; retain application proxies in the host config.']
pages = sorted(args.website.joinpath('cn').rglob('index.html'))
for page in pages:
    relative = page.relative_to(args.website / 'cn').parent.as_posix()
    public = '/' if relative == '.' else '/' + relative + '/'
    source = '/cn/index.html' if relative == '.' else '/cn/' + relative + '/index.html'
    aliases = ['/cn', '/cn/', '/cn/index.html'] if relative == '.' else [public.rstrip('/'), '/cn' + public.rstrip('/'), '/cn' + public, '/cn' + public + 'index.html', public + 'index.html']
    for alias in aliases:
        lines.append(f'location = {alias} {{ return 308 {public}$is_args$args; }}')
    lines += [f'location = {public} {{', f'    try_files {source} =404;',
              '    expires -1;', f'    include {headers};', '}']
lines += [
    'location ~ ^/(?:cn/)?assets/.*\\.vtt$ {',
    '    try_files $uri =404;', '    types { text/vtt vtt; }',
    '    default_type text/vtt;', '    expires 1d;', f'    include {headers};', '}',
    'location ~ ^/(?:cn/)?assets/.*\\.(?:webp|png|jpe?g|svg|gif|mp4|pdf)$ {',
    '    try_files $uri =404;', '    expires 1d;', f'    include {headers};', '}',
]
css_js = [p.name.replace('.', r'\.') for p in args.website.iterdir()
          if p.suffix in ('.css', '.js') and not p.name.startswith('_')]
lines += [
    'location ~ ^/(?:' + '|'.join(sorted(css_js)) + r'|cn/[^/]+\.(?:css|js))$ {',
    '    try_files $uri =404;', '    expires 1h;', f'    include {headers};', '}',
]
args.destination.joinpath('omindos-static-site.conf').write_text('\n'.join(lines) + '\n')
args.destination.joinpath('omindos-static-headers.conf').write_text(
    'add_header X-Content-Type-Options nosniff always;\n'
    'add_header Referrer-Policy strict-origin-when-cross-origin always;\n'
    'add_header Strict-Transport-Security "max-age=31536000" always;\n')
print(f'Rendered {len(pages)} static pages; application routes are excluded.')
