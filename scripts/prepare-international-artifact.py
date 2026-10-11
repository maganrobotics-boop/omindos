"""Build the Chinese-default bilingual .ai site from shared website sources.

The .cn source keeps its own canonical URLs. Only this deployment artifact maps
website links and search metadata to .ai; service subdomains are not rewritten.
"""
from pathlib import Path
import re
import shutil
import sys

def prepare(source, target):
    if target.exists():
        raise RuntimeError('Use a new artifact directory')
    def ignore(directory, names):
        return [name for name in names if name in {'design-study', 'node_modules', '.wrangler', '__pycache__'}]
    shutil.copytree(source, target, ignore=ignore)
    for page in target.rglob('*.html'):
        text = page.read_text()
        text = re.sub(r'https://(?:www\.)?omindos\.cn(?=[/"\s<]|$)', 'https://omindos.ai', text)
        page.write_text(text)
    urls = []
    for locale in ('cn', 'en'):
        for page in sorted((target / locale).rglob('index.html')):
            route = '/' + page.relative_to(target / locale).as_posix().removesuffix('index.html')
            urls.append('https://omindos.ai' + ('' if locale == 'cn' else '/en') + route)
    urls += ['https://omindos.ai/founding-oem', 'https://omindos.ai/why-originmind']
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{url}</loc></url>\n' for url in dict.fromkeys(urls)) + '</urlset>\n'
    (target / 'sitemap.xml').write_text(sitemap)
    (target / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: https://omindos.ai/sitemap.xml\n')
    assert (target / 'cn/index.html').exists()
    assert (target / 'en/index.html').exists()
    assert (target / '_worker.js').exists()
    print('Prepared bilingual .ai artifact: Chinese root and English /en/')

if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
