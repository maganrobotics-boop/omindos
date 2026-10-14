"""Explicit, integrity-checked retrieval of pinned upstream robot assets."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class AssetError(ValueError):
    pass


def get_manifest():
    packaged = Path(__file__).resolve().parent / "data/roboto_origin/assets.lock.json"
    if packaged.is_file():
        return packaged
    return Path(__file__).resolve().parents[2] / "configs/roboto_origin/assets.lock.json"


def default_asset_root():
    configured = os.environ.get("OMINDOS_LEGGED_ASSETS")
    if configured:
        return Path(configured).expanduser()
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return cache / "omindos/legged-robot/roboto-origin"


def load_manifest(manifest=None):
    path = Path(manifest) if manifest is not None else get_manifest()
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != 1 or value.get("robot") != "roboto-origin":
        raise AssetError("Unsupported asset manifest")
    if not isinstance(value.get("files"), list) or not value["files"]:
        raise AssetError("Asset manifest has no files")
    sources = {source["name"]: source for source in value["sources"]}
    seen = set()
    for entry in value["files"]:
        path = PurePosixPath(entry["path"])
        if path.is_absolute() or ".." in path.parts or not path.parts or "\\" in entry["path"]:
            raise AssetError("Asset paths must stay inside the asset directory")
        if entry["path"] in seen:
            raise AssetError("Duplicate asset path")
        seen.add(entry["path"])
        if not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
            raise AssetError("Invalid asset SHA256")
        source = sources.get(path.parts[0])
        url = urlparse(entry["url"])
        if source is None or url.scheme != "https" or url.netloc != "raw.githubusercontent.com":
            raise AssetError("Asset source must be a pinned official GitHub raw URL")
        prefix = "/" + source["repository"] + "/" + source["commit"] + "/"
        if not url.path.startswith(prefix):
            raise AssetError("Asset source does not match its pinned repository commit")
        if not isinstance(entry["size_bytes"], int) or entry["size_bytes"] <= 0:
            raise AssetError("Invalid asset size")
    for field in ("model_path", "policy_path", "config_path", "robot_path"):
        if value[field] not in seen:
            raise AssetError(f"Manifest is missing {field}")
    return value


def _asset_path(root, relative):
    root = Path(root).expanduser().resolve()
    path = (root / relative).resolve()
    if root not in path.parents:
        raise AssetError("Asset path resolves outside the asset directory")
    return path


def _valid(path, entry):
    if not path.is_file() or path.stat().st_size != entry["size_bytes"]:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == entry["sha256"]


def verify_assets(asset_root, manifest=None):
    data = load_manifest(manifest)
    for entry in data["files"]:
        path = _asset_path(asset_root, entry["path"])
        if not _valid(path, entry):
            raise AssetError(f"Missing or changed asset: {entry['path']}. Run legged-robot fetch-assets first.")


def fetch_assets(asset_root, manifest=None):
    data = load_manifest(manifest)
    downloaded = cached = 0
    for entry in data["files"]:
        target = _asset_path(asset_root, entry["path"])
        if _valid(target, entry):
            cached += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".download", delete=False) as stream:
                temporary = Path(stream.name)
                request = Request(entry["url"], headers={"User-Agent": "OmindOS-Legged-Robot/0.1"})
                with urlopen(request, timeout=60) as response:
                    total = 0
                    while block := response.read(1024 * 1024):
                        total += len(block)
                        if total > entry["size_bytes"]:
                            raise AssetError(f"Downloaded asset exceeded expected size: {entry['path']}")
                        stream.write(block)
            if not _valid(temporary, entry):
                raise AssetError(f"Downloaded asset failed SHA256 verification: {entry['path']}")
            temporary.replace(target)
            downloaded += 1
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return {"robot": data["robot"], "downloaded": downloaded, "cached": cached,
            "files": len(data["files"]), "asset_root": str(Path(asset_root).expanduser().resolve())}
