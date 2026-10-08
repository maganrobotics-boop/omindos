"""Prepare the approved static portal for the official Cloudflare website.

Pass a built portal directory to import a future approved version. Without an
argument, refresh production metadata on the checked-in bilingual pages.
Legacy OEM pages, APIs and verification files are retained.
"""
from pathlib import Path
import html
import re
import shutil
import sys

website = Path(__file__).resolve().parents[1] / 'apps/website'


def version_asset(source, asset, version):
    """Replace an optional existing query string with the release version."""
    return re.sub(
        rf'(?P<quote>["\']){re.escape(asset)}(?:\?[^"\']*)?(?P=quote)',
        lambda match: f'{match["quote"]}{asset}?v={version}{match["quote"]}',
        source,
    )


if len(sys.argv) == 2:
    source = Path(sys.argv[1]).resolve()
    for file in source.rglob('*'):
        relative = file.relative_to(source)
        if not file.is_file() or relative.as_posix() in {'index.html', '404.html', 'robots.txt', '_worker.js'}:
            continue
        if '.openai' in relative.parts:
            continue
        target = website / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)

urls = []
for locale in ['cn', 'en']:
    for page in sorted((website / locale).rglob('*.html')):
        source = page.read_text()
        route = '/' + page.relative_to(website).as_posix().removesuffix('index.html')
        is_error = page.name == '404.html'
        if not is_error:
            urls.append('https://omindos.ai' + route)
            source = re.sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="index,follow">', source)
        source = re.sub(r'<link rel="canonical"[^>]*>', '', source)
        source = re.sub(r'<meta property="og:[^"]*"[^>]*>', '', source)
        source = re.sub(r'<link rel="alternate" hreflang="([^"]+)" href="(?:https://omindos.ai)?([^"]+)">',
                        lambda match: f'<link rel="alternate" hreflang="{match[1]}" href="https://omindos.ai{match[2].rstrip("/") + ("" if is_error else "/")}">', source)
        title = re.search(r'<title>(.*?)</title>', source, re.S)[1]
        description = re.search(r'<meta name="description" content="([^"]*)">', source)
        metadata = f'<link rel="canonical" href="https://omindos.ai{route}"><meta property="og:type" content="website"><meta property="og:site_name" content="OriginMind"><meta property="og:title" content="{html.escape(html.unescape(title), quote=True)}"><meta property="og:url" content="https://omindos.ai{route}"><meta property="og:locale" content="{"zh_CN" if locale == "cn" else "en_US"}"><meta property="og:image" content="https://omindos.ai/og-card.png?v=20260909-omindos">'
        if description:
            metadata += f'<meta property="og:description" content="{description[1]}">'
        if '/portal-client.js' not in source and not is_error:
            metadata += '<script src="/portal-client.js" defer></script>'
        source = source.replace('</head>', metadata + '</head>')
        # Preserve the official application flow in the language of the page.
        source = source.replace('https://omindos.ai/founding-oem?lang=en', '/founding-oem?lang=' + ('zh' if locale == 'cn' else 'en'))
        for asset, version in [
            ('/site.css', '20260909-remediation'),
            ('/site.js', '20260909-remediation'),
            ('/home/base.css', '20260909-remediation'),
            ('/home/controls.js', '20260909-remediation'),
            ('/product-cards.css', '20260909-remediation'),
            ('/product-details.css', '20260909-remediation'),
            ('/robot-covers.css', '20260909'),
        ]:
            source = version_asset(source, asset, version)
        page.write_text(source)

for relative in [
    'index.html', 'index.en.html', 'index.zh.html',
    'why/en/index.html', 'why/zh/index.html',
    'oem/en/index.html', 'oem/zh/index.html',
    'robots/en/index.html', 'robots/zh/index.html',
]:
    page = website / relative
    source = page.read_text()
    source = version_asset(source, '/script.js', '20260909-remediation')
    source = version_asset(source, 'script.js', '20260909-remediation')
    page.write_text(source)

legacy_urls = ['https://omindos.ai/founding-oem', 'https://omindos.ai/why-originmind']
urls += legacy_urls
(website / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{url}</loc></url>\n' for url in urls) + '</urlset>\n')
print(f'Prepared {len(urls) - len(legacy_urls)} bilingual pages and production search metadata.')

# Chinese primary URLs use a separate host/root route map. Preserve this policy
# when importing a future portal; the international sitemap is released separately.
from cn_seo import apply as apply_chinese_seo
apply_chinese_seo(website)
from cn_seo import english_references, routes
for page in (website / 'en').rglob('index.html'):
    page.write_text(english_references(page.read_text(), routes(website)))
# The international sitemap lists only international canonical URLs.
international = [url for url in urls if not url.startswith('https://omindos.ai/cn/')]
(website / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{url}</loc></url>\n' for url in international) + '</urlset>\n')
