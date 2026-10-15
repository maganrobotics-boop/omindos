# SPDX-License-Identifier: GPL-3.0-only
"""Convert the owner's unmodified STEP assembly into a colored glTF model."""
import argparse
import hashlib
import json
from pathlib import Path
import time

import cadquery as cq


def convert(source, output):
    if output.exists():
        raise ValueError("Use a new output directory to preserve model snapshots")
    output.mkdir(parents=True)
    started = time.monotonic()
    print("Reading original STEP assembly", flush=True)
    assembly = cq.Assembly.importStep(str(source))
    print("STEP assembly loaded; inspecting geometry", flush=True)
    compound = assembly.toCompound()
    bounds = compound.BoundingBox()
    entries = list(assembly.traverse())
    metadata = {
        "schema_version": 1,
        "robot": "originmind-q1",
        "robot_label": "OriginMind 四足机器人 V1.2",
        "source_filename": "四足机器狗总装V1.2 (2).STEP",
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "source_bytes": source.stat().st_size,
        "source_units": "mm",
        "model_version": "V1.2",
        "scope": "cad_geometry",
        "original_assembly_preserved": True,
        "assembly_nodes": len(entries),
        "geometry_nodes": sum(node.obj is not None for _, node in entries),
        "solids": len(compound.Solids()),
        "faces": len(compound.Faces()),
        "bounds_mm": {"min": [bounds.xmin, bounds.ymin, bounds.zmin],
                      "max": [bounds.xmax, bounds.ymax, bounds.zmax],
                      "size": [bounds.xlen, bounds.ylen, bounds.zlen]},
        "dynamics": {"joint_configuration_verified": False,
                     "mass_inertia_verified": False,
                     "actuator_configuration_verified": False,
                     "motion_simulation_verified": False},
        "tessellation": {"linear_tolerance_mm": 0.65, "angular_tolerance_rad": 0.25},
        "cadquery_version": cq.__version__,
    }
    (output / "model.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(metadata, ensure_ascii=False), flush=True)
    print("Tessellating the original assembly with original colors", flush=True)
    model = output / "model.glb"
    assembly.export(str(model), tolerance=0.65, angularTolerance=0.25)
    metadata["model_bytes"] = model.stat().st_size
    metadata["model_sha256"] = hashlib.sha256(model.read_bytes()).hexdigest()
    metadata["conversion_seconds"] = round(time.monotonic() - started, 3)
    (output / "model.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"completed": True, "model_bytes": model.stat().st_size,
                      "seconds": metadata["conversion_seconds"]}), flush=True)
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    convert(args.source, args.output)
