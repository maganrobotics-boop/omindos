"""Restore the approved MP4 bytes from transport-sized Git blobs."""
from pathlib import Path
import hashlib
import json
import os
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media/product-demos/20261011"


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def restore():
    manifest = json.loads((MEDIA / "manifest.json").read_text())
    for item in manifest["files"]:
        target = (ROOT / item["target"]).resolve()
        assert target.is_relative_to(ROOT / "apps/website/cn/assets/demos/20261011")
        if target.exists() and target.stat().st_size == item["bytes"] and digest(target) == item["sha256"]:
            print(f"Verified {target.name}: {item['sha256']}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
            try:
                for part in item["parts"]:
                    source = (MEDIA / part["path"]).resolve()
                    assert source.is_relative_to(MEDIA)
                    assert source.stat().st_size == part["bytes"], source
                    assert digest(source) == part["sha256"], source
                    with source.open("rb") as data:
                        for block in iter(lambda: data.read(1024 * 1024), b""):
                            output.write(block)
                output.flush()
                assert temporary.stat().st_size == item["bytes"], target
                assert digest(temporary) == item["sha256"], target
                os.chmod(temporary, 0o644)
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
        print(f"Restored {target.name}: {item['sha256']}")


if __name__ == "__main__":
    restore()
