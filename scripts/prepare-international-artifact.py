"""Build the overseas English site with Chinese entry redirects to .cn.

Keep the source's cross-domain language links: Chinese on .cn, English on .ai/en/.
Retain assets and API handlers for existing English pages and cached clients.
"""
from pathlib import Path
import shutil
import sys

def prepare(source, target):
    if target.exists():
        raise RuntimeError('Use a new artifact directory')
    def ignore(directory, names):
        return [name for name in names if name in {'design-study', 'node_modules', '.wrangler', '__pycache__'}]
    shutil.copytree(source, target, ignore=ignore)
    urls = []
    for page in sorted((target / 'en').rglob('index.html')):
        route = '/' + page.relative_to(target / 'en').as_posix().removesuffix('index.html')
        urls.append('https://omindos.ai/en' + route)
    urls += ['https://omindos.ai/founding-oem', 'https://omindos.ai/why-originmind']
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{url}</loc></url>\n' for url in dict.fromkeys(urls)) + '</urlset>\n'
    (target / 'sitemap.xml').write_text(sitemap)
    (target / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: https://omindos.ai/sitemap.xml\n')
    assert (target / 'cn/index.html').exists()
    assert (target / 'en/index.html').exists()
    assert (target / '_worker.js').exists()
    print('Prepared .ai artifact: Chinese redirects to .cn; English remains at /en/')

if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())

