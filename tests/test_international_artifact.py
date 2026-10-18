import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('artifact',Path(__file__).resolve().parents[1]/'scripts/prepare-international-artifact.py')
artifact=importlib.util.module_from_spec(spec);spec.loader.exec_module(artifact)

class InternationalArtifact(unittest.TestCase):
    def test_english_artifact_preserves_domestic_links_services_and_media(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source';target=Path(directory)/'artifact'
            html='<link rel="canonical" href="https://omindos.cn/"><a href="https://omindos.cn/robots/">中文</a><a href="https://chat.omindos.cn/learning">课程</a>'
            files={'en/index.html':html,'cn/index.html':html,'_worker.js':'worker','cn/assets/video.mp4':'video','cn/style.css':'style','design-study/index.html':'private design'}
            files['assets/.partial-video.mp4.transfer']='incomplete transfer'
            files['.well-known/verification.txt']='public verification'
            added_routes=['robots/tracked','lab','lab/join','careers','join']
            for route in added_routes:
                files[f'en/{route}/index.html']=html
            for name,content in files.items():
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
            artifact.prepare(source,target)
            for name in ['cn/assets/video.mp4','cn/style.css','_worker.js']:
                self.assertEqual((source/name).read_bytes(),(target/name).read_bytes())
            for name in ['cn/index.html','en/index.html']:
                self.assertEqual((source/name).read_text(),html)
                output=(target/name).read_text()
                self.assertEqual(output,html)
                self.assertIn('href="https://omindos.cn/"',output)
                self.assertIn('href="https://omindos.cn/robots/"',output)
                self.assertIn('https://chat.omindos.cn/learning',output)
            self.assertFalse((target/'design-study').exists())
            self.assertFalse((target/'assets/.partial-video.mp4.transfer').exists())
            self.assertEqual((target/'.well-known/verification.txt').read_text(),'public verification')
            sitemap=(target/'sitemap.xml').read_text()
            self.assertNotIn('<loc>https://omindos.ai/</loc>',sitemap)
            self.assertIn('<loc>https://omindos.ai/en/</loc>',sitemap)
            for route in added_routes:
                self.assertIn(f'<loc>https://omindos.ai/en/{route}/</loc>',sitemap)
                self.assertEqual((target/f'en/{route}/index.html').read_text(),html)
            self.assertNotIn('/cn/',sitemap)
            self.assertNotIn('omindos.cn',sitemap)

if __name__=='__main__':unittest.main()

