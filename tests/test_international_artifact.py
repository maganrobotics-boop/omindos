import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('artifact',Path(__file__).resolve().parents[1]/'scripts/prepare-international-artifact.py')
artifact=importlib.util.module_from_spec(spec);spec.loader.exec_module(artifact)

class InternationalArtifact(unittest.TestCase):
    def test_chinese_content_is_excluded_without_changing_sources_or_english_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source';target=Path(directory)/'artifact'
            files=['en/index.html','_worker.js','assets/video.mp4','cn/index.html','design-study/index.html','index.zh.html','oem/zh/index.html','oem/en/index.html','robots/zh/index.html','why/zh/index.html','founding-oem.js']
            for name in files:
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(name.encode())
            artifact.prepare(source,target)
            for name in ['en/index.html','_worker.js','assets/video.mp4','oem/en/index.html']:
                self.assertEqual((source/name).read_bytes(),(target/name).read_bytes())
            for name in ['cn','design-study','index.zh.html','oem/zh','robots/zh','why/zh','founding-oem.js']:
                self.assertTrue((source/name).exists());self.assertFalse((target/name).exists())

if __name__=='__main__':unittest.main()
