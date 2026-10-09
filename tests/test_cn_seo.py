import sys
import unittest
from pathlib import Path
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import cn_seo
ROOT = Path(__file__).resolve().parents[1] / 'apps/website'

class Tags(HTMLParser):
    def __init__(self, source):
        super().__init__(); self.tags = []; self.feed(source)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

class ChineseSEO(unittest.TestCase):
    def test_all_pages_use_verified_primary_urls_and_language_targets(self):
        known = cn_seo.routes(ROOT)
        self.assertEqual(len(known), 18)
        for route in known:
            with self.subTest(route=route):
                page = ROOT / 'cn' / route.strip('/') / 'index.html'
                source = page.read_text(); tags = Tags(source).tags
                canonical = [a['href'] for t,a in tags if t=='link' and a.get('rel')=='canonical']
                og = [a['content'] for t,a in tags if t=='meta' and a.get('property')=='og:url']
                alternates = {a['hreflang']:a['href'] for t,a in tags if t=='link' and a.get('rel')=='alternate'}
                self.assertEqual(canonical, [cn_seo.CN_ORIGIN + route])
                self.assertEqual(og, canonical)
                expected_alternates = {'zh-CN':canonical[0]}
                if route != '/robots/mobile-dual-arm/':
                    expected_alternates['en'] = cn_seo.EN_ORIGIN+'/en'+route
                self.assertEqual(alternates, expected_alternates)
                self.assertEqual(cn_seo.rewrite(source, route, known), source)
                if route != '/robots/mobile-dual-arm/':
                    self.assertTrue((ROOT/'en'/route.strip('/')/'index.html').exists())
                for t,a in tags:
                    if t=='a':
                        href=a.get('href','')
                        self.assertFalse(href.startswith(('/cn/','/en/','https://omindos.ai/cn/')),href)
                        if href.startswith('/') and href.split('?')[0].split('#')[0].rstrip('/')+'/' in known:
                            self.assertTrue(href.split('?')[0].split('#')[0].endswith('/'),href)

    def test_sitemap_has_exactly_the_indexable_canonical_routes(self):
        xml=ET.fromstring((ROOT/'cn/sitemap.xml').read_text())
        urls=[e.text for e in xml.findall('.//{*}loc')]
        self.assertEqual(urls,[cn_seo.CN_ORIGIN+r for r in cn_seo.routes(ROOT)])
        self.assertEqual(len(urls),len(set(urls)))
        self.assertIn('Sitemap: https://omindos.cn/sitemap.xml',(ROOT/'cn/robots.txt').read_text())

    def test_error_page_is_not_advertised_as_indexable_content(self):
        source=(ROOT/'cn/404.html').read_text()
        self.assertIn('content="noindex,nofollow"',source)
        self.assertNotIn('rel="canonical"',source)
        self.assertNotIn('<link rel="alternate"',source)
        self.assertNotIn('property="og:url"',source)

    def test_overlay_preserves_content_assets_and_non_page_urls(self):
        source='<link href="index.html" rel="canonical"><meta content="wrong" property="og:url"><a href="../about/index.html?q=1&amp;x=2#part">About</a><a href="https://omindos.ai/en/robots/">EN</a><a href="/cn/unknown/">Unknown</a><img src="/assets/robot.png"><p>研发样机 0.390</p><a href="mailto:sales@omindos.ai">Email</a>'
        output=cn_seo.rewrite(source,'/robots/',cn_seo.routes(ROOT))
        self.assertIn('href="/about/?q=1&amp;x=2#part"',output)
        for unchanged in ['<img src="/assets/robot.png">','<p>研发样机 0.390</p>','href="/cn/unknown/"','href="mailto:sales@omindos.ai"','href="https://omindos.ai/en/robots/"']:
            self.assertIn(unchanged,output)
        self.assertEqual(cn_seo.rewrite(output,'/robots/',cn_seo.routes(ROOT)),output)

if __name__ == '__main__':
    unittest.main()
