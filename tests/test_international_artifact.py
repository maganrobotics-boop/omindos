import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('artifact',Path(__file__).resolve().parents[1]/'scripts/prepare-international-artifact.py')
artifact=importlib.util.module_from_spec(spec);spec.loader.exec_module(artifact)

class InternationalArtifact(unittest.TestCase):
    def test_bilingual_artifact_preserves_source_services_and_media(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source';target=Path(directory)/'artifact'
            html='<link rel="canonical" href="https://omindos.cn/"><a href="https://omindos.cn/robots/">中文</a><a href="https://chat.omindos.cn/learning">课程</a>'
            files={'en/index.html':html,'cn/index.html':html,'_worker.js':'worker','cn/assets/video.mp4':'video','cn/style.css':'style','design-study/index.html':'private design'}
            for name,content in files.items():
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
            artifact.prepare(source,target)
            for name in ['cn/assets/video.mp4','cn/style.css','_worker.js']:
                self.assertEqual((source/name).read_bytes(),(target/name).read_bytes())
            for name in ['cn/index.html','en/index.html']:
                self.assertEqual((source/name).read_text(),html)
                output=(target/name).read_text()
                self.assertIn('href="https://omindos.ai/"',output)
                self.assertIn('href="https://omindos.ai/robots/"',output)
                self.assertIn('https://chat.omindos.cn/learning',output)
            self.assertFalse((target/'design-study').exists())
            sitemap=(target/'sitemap.xml').read_text()
            self.assertIn('<loc>https://omindos.ai/</loc>',sitemap)
            self.assertIn('<loc>https://omindos.ai/en/</loc>',sitemap)
            self.assertNotIn('/cn/',sitemap)
            self.assertNotIn('omindos.cn',sitemap)

if __name__=='__main__':unittest.main()
