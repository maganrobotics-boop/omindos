import hashlib
import json
from pathlib import Path
import pytest

from omindos_legged.assets import AssetError, fetch_assets, get_manifest, load_manifest, verify_assets


def miniature_manifest(tmp_path):
    content = b"known robot asset"
    fields = {name: f"rpo_description/{name}.bin" for name in
              ("model_path", "policy_path", "config_path", "robot_path")}
    files = [{"path": path, "url": "https://raw.githubusercontent.com/Roboparty/rpo_description/" + "a" * 40 + "/" + Path(path).name,
              "sha256": hashlib.sha256(content).hexdigest(), "size_bytes": len(content)} for path in fields.values()]
    manifest = tmp_path / "assets.lock.json"
    value = {"schema_version": 1, "robot": "roboto-origin", "sources": [{"name": "rpo_description", "repository": "Roboparty/rpo_description", "commit": "a" * 40}], "files": files, **fields}
    manifest.write_text(json.dumps(value))
    return manifest, value, content


def test_manifest_is_packaged_and_pinned():
    data = load_manifest(get_manifest())
    assert len(data["files"]) == 34
    assert all(len(source["commit"]) == 40 for source in data["sources"])


def test_existing_assets_are_rejected_after_tampering(tmp_path):
    manifest, data, content = miniature_manifest(tmp_path)
    root = tmp_path / "cache"
    for entry in data["files"]:
        path = root / entry["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    verify_assets(root, manifest)
    (root / data["model_path"]).write_bytes(b"modified")
    with pytest.raises(AssetError, match="Missing or changed"):
        verify_assets(root, manifest)


def test_failed_download_never_installs_unverified_asset(tmp_path, monkeypatch):
    manifest, data, content = miniature_manifest(tmp_path)
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, size): return b"wrong downloaded bytes that exceed the manifest size"
    monkeypatch.setattr("omindos_legged.assets.urlopen", lambda *args, **kwargs: Response())
    root = tmp_path / "cache"
    with pytest.raises(AssetError, match="exceeded"):
        fetch_assets(root, manifest)
    assert not (root / data["model_path"]).exists()
    assert not list(root.rglob("*.download"))


def test_manifest_path_traversal_cannot_escape_cache(tmp_path):
    manifest, data, _ = miniature_manifest(tmp_path)
    data["files"][0]["path"] = "../outside.bin"
    manifest.write_text(json.dumps(data))
    with pytest.raises(AssetError, match="inside"):
        load_manifest(manifest)
