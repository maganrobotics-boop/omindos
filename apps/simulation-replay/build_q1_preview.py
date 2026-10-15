# SPDX-License-Identifier: GPL-3.0-only
"""Build the private, portable preview of OriginMind's own CAD assembly."""
import argparse
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path


def build(model_directory, output):
    model = model_directory / "model.glb"
    metadata = json.loads((model_directory / "model.json").read_text())
    if metadata.get("robot") != "originmind-q1" or metadata.get("scope") != "cad_geometry":
        raise ValueError("Expected the owner's Q1 CAD assembly")
    if hashlib.sha256(model.read_bytes()).hexdigest() != metadata["model_sha256"]:
        raise ValueError("The model changed after conversion")
    if metadata["dynamics"]["motion_simulation_verified"] is not False:
        raise ValueError("This viewer must not claim unverified motion")
    if not metadata.get("web_mesh", {}).get("display_only"):
        raise ValueError("Optimize the complete assembly for web display first")
    if not all(math.isfinite(v) and 0 < v < 10000 for v in metadata["bounds_mm"]["size"]):
        raise ValueError("Expected finite robot dimensions in millimeters")
    metadata["source_filename"] = "四足机器狗总装V1.2 (2).STEP"
    source = Path(__file__).parent
    logo = source.parent / "website" / "assets" / "brand" / "originmind-mark-184.webp"
    html = (source / "index.html").read_text()
    html = html.replace("__ORIGINMIND_LOGO__", "data:image/webp;base64," + base64.b64encode(logo.read_bytes()).decode())
    html = html.replace("__MODEL_INFO__", json.dumps(metadata, ensure_ascii=False).replace("<", "\\u003c"))
    html = html.replace("__MODEL_GZIP_BASE64__", base64.b64encode(gzip.compress(model.read_bytes(), compresslevel=9, mtime=0)).decode())
    if any(marker in html for marker in ["__ORIGINMIND_LOGO__", "__MODEL_INFO__", "__MODEL_GZIP_BASE64__"]):
        raise ValueError("Unresolved template content")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    return {"file": str(output), "size_bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "model_sha256": metadata["model_sha256"], "scope": "cad_geometry"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.model, args.output), ensure_ascii=False))
