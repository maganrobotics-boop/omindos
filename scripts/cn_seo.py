"""Chinese metadata/link overlay; never reserialize HTML or change shared assets.

The route allowlist comes from checked-in cn/index.html pages, verified on Nginx.
Production uses the same transformation against its existing release, preserving
content which is newer than the repository. No domain-wide replacement is used.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
import re

CN_ORIGIN = 'https://omindos.cn'
EN_ORIGIN = 'https://omindos.ai'

class Attributes(HTMLParser):
    def handle_starttag(self, tag, attrs):
        self.attrs = dict(attrs)

def attributes(tag):
    parser = Attributes()
    parser.feed(tag)
    return parser.attrs

def attribute(tag, name, value):
    pattern = rf'(\b{re.escape(name)}\s*=\s*)([\"\'])(.*?)\2'
    return re.sub(pattern, lambda m: m[1] + m[2] + value + m[2], tag, count=1)

def routes(root):
    return sorted('/' + p.parent.relative_to(root / 'cn').as_posix().strip('.') + '/'
                  if p.parent != root / 'cn' else '/'
                  for p in (root / 'cn').rglob('index.html'))

def indexable_routes(root):
    """Keep all page routes known, but omit explicit noindex pages from search."""
    result = []
    for route in routes(root):
        page = root / 'cn' / route.strip('/') / 'index.html'
        directives = set()
        for raw in re.findall(r'<meta\b[^>]*>', page.read_text(), flags=re.I):
            attrs = attributes(raw)
            if attrs.get('name', '').lower() == 'robots':
                directives.update(re.split(r'[\s,]+', attrs.get('content', '').lower()))
        if not directives.intersection({'noindex', 'none'}):
            result.append(route)
    return result

def normalize_path(path):
    path = path.removesuffix('index.html')
    return path.rstrip('/') + '/' if path != '/' else '/'

def rewrite(source, route, known_routes, error=False):
    canonical = CN_ORIGIN + route
    def tag(match):
        raw = match[0]
        attrs = attributes(raw)
        if raw.lower().startswith('<link'):
            if attrs.get('rel') == 'canonical':
                return '' if error else attribute(raw, 'href', canonical)
            if attrs.get('rel') == 'alternate' and attrs.get('hreflang'):
                if error:
                    return ''
                if attrs['hreflang'] == 'zh-CN':
                    return attribute(raw, 'href', canonical)
                if attrs['hreflang'] == 'en':
                    return attribute(raw, 'href', EN_ORIGIN + '/en' + route)
        if attrs.get('property') == 'og:url':
            return '' if error else attribute(raw, 'content', canonical)
        if not raw.lower().startswith('<a') or 'href' not in attrs:
            return raw
        href = attrs['href']
        if href.startswith(('#', 'mailto:', 'tel:')):
            return raw
        # Mirror downloads use relative links. Resolve them against the cn file
        # location, and rewrite only a recognized HTML route, never media/API.
        u = urlsplit(urljoin(CN_ORIGIN + '/cn' + route, href))
        if u.hostname not in ('omindos.cn', 'www.omindos.cn', 'omindos.ai'):
            return raw
        path = u.path
        if path == '/cn' or path.startswith('/cn/'):
            path = path[3:] or '/'
            destination = normalize_path(path)
            if destination not in known_routes:
                return raw
            new = urlunsplit(('', '', destination, u.query, u.fragment))
        elif path.startswith('/en/'):
            destination = normalize_path(path[3:])
            if destination not in known_routes:
                return raw
            new = urlunsplit(('https', 'omindos.ai', '/en' + destination, u.query, u.fragment))
        elif path == '/founding-oem':
            new = urlunsplit(('https', 'omindos.ai', path, u.query, u.fragment))
        elif u.hostname in ('omindos.cn', 'www.omindos.cn') and normalize_path(path) in known_routes:
            new = urlunsplit(('', '', normalize_path(path), u.query, u.fragment))
        else:
            return raw
        # HTML escape query separators without changing their meaning.
        return attribute(raw, 'href', new.replace('&', '&amp;'))
    return re.sub(r'<(?:link|meta|a)\b[^>]*>', tag, source, flags=re.I)

def search_files(known_routes):
    # Chinese sitemap is deployed at /sitemap.xml; the international one stays
    # unchanged until an independently authorized international release.
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{CN_ORIGIN}{route}</loc></url>\n' for route in known_routes)
    return sitemap + '</urlset>\n', f'User-agent: *\nAllow: /\nSitemap: {CN_ORIGIN}/sitemap.xml\n'

def english_references(source, known_routes):
    def tag(match):
        raw = match[0]; attrs = attributes(raw)
        if attrs.get('hreflang') == 'zh-CN' and attrs.get('rel') == 'alternate':
            path = urlsplit(attrs.get('href', '')).path
            route = normalize_path(path[3:]) if path.startswith('/cn/') else None
            if route in known_routes:
                return attribute(raw, 'href', CN_ORIGIN + route)
        if raw.lower().startswith('<a') and 'href' in attrs:
            href = attrs['href']; u = urlsplit(urljoin(EN_ORIGIN, href))
            if u.hostname == 'omindos.ai' and u.path.startswith('/cn/'):
                route = normalize_path(u.path[3:])
                if route in known_routes:
                    return attribute(raw, 'href', urlunsplit(('https', 'omindos.cn', route, u.query, u.fragment)).replace('&', '&amp;'))
        return raw
    return re.sub(r'<(?:link|a)\b[^>]*>', tag, source, flags=re.I)

def apply(root):
    known = routes(root)
    for page in (root / 'cn').rglob('*.html'):
        route = '/' + page.relative_to(root / 'cn').as_posix().removesuffix('index.html')
        page.write_text(rewrite(page.read_text(), route, known, page.name == '404.html'))
    sitemap, robots = search_files(indexable_routes(root))
    (root / 'cn/sitemap.xml').write_text(sitemap)
    (root / 'cn/robots.txt').write_text(robots)

if __name__ == '__main__':
    import sys
    apply(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'apps/website')

