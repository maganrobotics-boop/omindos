"""Add an iframe-based responsive review surface only to a preview artifact."""
from pathlib import Path
from html import escape
import sys

root = Path(sys.argv[1]).resolve()
assert (root / 'en/index.html').is_file()
routes = sorted('/' + page.relative_to(root).as_posix().removesuffix('index.html')
                for page in (root / 'en').rglob('index.html'))
routes += sorted('/_review/' + page.relative_to(root).as_posix().removesuffix('index.html')
                 for page in (root / 'cn').rglob('index.html'))
options = ''.join(f'<option value="{escape(route, quote=True)}">{escape(route)}</option>' for route in routes)
page = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>English responsive layout review</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#e7e5e0;color:#30302d;font:15px/1.5 Arial,sans-serif}
h1{font-size:22px;font-weight:500;margin:0 0 16px}.controls{display:flex;gap:20px;flex-wrap:wrap;align-items:end;margin-bottom:20px}
label{display:grid;gap:6px}select{min-height:42px;font:inherit;padding:7px;max-width:90vw}iframe{display:block;flex-shrink:0;width:390px;height:844px;border:1px solid #aaa;background:white}
.canvas{overflow:auto;max-width:100%;padding:0 0 20px}.note{font-size:13px;color:#62625b;margin:8px 0 18px}
</style></head><body><h1>English responsive layout review</h1><p class="note">Public preview. This page is generated only for layout review and is excluded from production.</p>
<div class="controls"><label>Page<select id="page">__OPTIONS__</select></label><label>Viewport width<select id="width"><option>320</option><option selected>390</option><option>768</option><option>1280</option></select></label></div>
<div class="canvas"><iframe title="Responsive website preview" src="/en/"></iframe></div>
<script>const page=document.getElementById('page'),width=document.getElementById('width'),frame=document.querySelector('iframe');page.addEventListener('change',()=>{frame.src=page.value});width.addEventListener('change',()=>{frame.style.width=width.value+'px'});</script></body></html>'''
target = root / 'en/assets/layout-review.html'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(page.replace('__OPTIONS__', options))
worker = root / '_worker.js'
source = worker.read_text()
marker = '    const url = new URL(request.url);\n    try {'
assert source.count(marker) == 1
review_handler = '''
      // Public review-only Chinese layout surface; never included in production.
      if (url.pathname.startsWith('/_review/cn/')) {
        const asset = new URL(request.url);
        asset.pathname = url.pathname.replace('/_review', '');
        return env.ASSETS.fetch(new Request(asset, request));
      }
'''
worker.write_text(source.replace(marker, marker + review_handler))
print('Prepared public responsive review surface: /en/assets/layout-review.html')
