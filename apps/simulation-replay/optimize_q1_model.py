# SPDX-License-Identifier: GPL-3.0-only
"""Pack a complete Q1 assembly into a smaller, display-only web mesh."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import struct
import time

import fast_simplification
import numpy as np
from vtkmodules.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy
from vtkmodules.vtkCommonCore import vtkPoints
from vtkmodules.vtkCommonDataModel import vtkCellArray, vtkPolyData
from vtkmodules.vtkFiltersCore import vtkPolyDataNormals


def crease_normals(positions, triangles):
    """Keep mechanical hard edges while smoothing the tessellated curves."""
    points = vtkPoints()
    points.SetData(numpy_to_vtk(np.ascontiguousarray(positions), deep=True))
    cells = vtkCellArray()
    cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0, 3*len(triangles)+1, 3, dtype=np.int64), deep=True),
                  numpy_to_vtkIdTypeArray(np.ascontiguousarray(triangles.reshape(-1), dtype=np.int64), deep=True))
    mesh = vtkPolyData()
    mesh.SetPoints(points)
    mesh.SetPolys(cells)
    normals = vtkPolyDataNormals()
    normals.SetInputData(mesh)
    normals.SetFeatureAngle(45)
    normals.SplittingOn()
    normals.ConsistencyOff()
    normals.ComputePointNormalsOn()
    normals.ComputeCellNormalsOff()
    normals.Update()
    result = normals.GetOutput()
    return (vtk_to_numpy(result.GetPoints().GetData()).copy(),
            vtk_to_numpy(result.GetPolys().GetConnectivityArray()).reshape(-1, 3).copy(),
            vtk_to_numpy(result.GetPointData().GetNormals()).copy())


def optimize(source, output):
    if output.exists():
        raise ValueError("Use a new model snapshot directory")
    started = time.monotonic()
    raw = (source / "model.glb").read_bytes()
    info = json.loads((source / "model.json").read_text())
    if hashlib.sha256(raw).hexdigest() != info["model_sha256"]:
        raise ValueError("Original exported mesh changed")
    length = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    binary = memoryview(raw)[28+length:]
    types = {5123: "<u2", 5125: "<u4", 5126: "<f4"}
    widths = {"SCALAR": 1, "VEC3": 3}

    def array(index):
        a = doc["accessors"][index]
        v = doc["bufferViews"][a["bufferView"]]
        if a.get("sparse"):
            raise ValueError("Unexpected CAD mesh layout")
        dtype = np.dtype(types[a["componentType"]])
        width = widths[a["type"]]
        return np.ndarray((a["count"], width), dtype=dtype, buffer=binary,
                          offset=v.get("byteOffset", 0)+a.get("byteOffset", 0),
                          strides=(v.get("byteStride") or width*dtype.itemsize, dtype.itemsize))

    new = {k: copy.deepcopy(doc[k]) for k in ["asset", "scene", "scenes", "nodes", "materials"] if k in doc}
    new.update(meshes=[], accessors=[], bufferViews=[], buffers=[])
    payload = bytearray()
    signatures, mapping, original_points = {}, {}, {}
    input_triangles, output_triangles = {}, {}

    def accessor(values, kind):
        data = np.ascontiguousarray(values, dtype="<u4" if kind == "SCALAR" else "<f4")
        offset = len(payload)
        payload.extend(data.tobytes())
        new["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": data.nbytes})
        entry = {"bufferView": len(new["bufferViews"])-1, "componentType": 5125 if kind == "SCALAR" else 5126,
                 "count": len(data), "type": kind}
        if kind == "VEC3":
            entry.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        new["accessors"].append(entry)
        return len(new["accessors"])-1

    for index, mesh in enumerate(doc["meshes"]):
        signature = tuple((p["attributes"]["POSITION"], p["attributes"]["NORMAL"], p["indices"], p.get("material")) for p in mesh["primitives"])
        if signature in signatures:
            mapping[index] = signatures[signature]
            continue
        target = len(new["meshes"])
        signatures[signature] = mapping[index] = target
        groups = {}
        for p in mesh["primitives"]:
            if set(p["attributes"]) != {"POSITION", "NORMAL"} or p.get("mode", 4) != 4:
                raise ValueError("Unexpected CAD primitive attributes")
            groups.setdefault(p.get("material"), []).append(p)
        packed, originals = [], []
        before = after = 0
        for material, primitives in groups.items():
            points, faces, offset = [], [], 0
            for p in primitives:
                positions = array(p["attributes"]["POSITION"])
                points.append(positions)
                faces.append(array(p["indices"]).reshape(-1, 3).astype(np.int64)+offset)
                offset += len(positions)
            positions = np.concatenate(points).astype(np.float64)
            triangles = np.concatenate(faces)
            if not np.isfinite(positions).all():
                raise ValueError("Non-finite source mesh coordinates")
            originals.append(positions)
            before += len(triangles)
            # CAD faces duplicate their boundary vertices. Join coincident
            # seams first, so retaining real open borders does not prevent
            # simplification of an otherwise closed mechanical component.
            _, first, inverse = np.unique(np.round(positions, 5), axis=0,
                                          return_index=True, return_inverse=True)
            positions = positions[first]
            triangles = inverse[triangles]
            if len(triangles) > 1000:
                positions, triangles = fast_simplification.simplify(positions, triangles,
                    target_count=max(300, int(len(triangles)*0.12)), agg=6, preserve_border=True)
            if len(triangles) == 0:
                raise ValueError("A source component lost all geometry")
            after += len(triangles)
            positions, triangles, normals = crease_normals(positions, triangles)
            primitive = {"attributes": {"POSITION": accessor(positions, "VEC3"), "NORMAL": accessor(normals, "VEC3")},
                         "indices": accessor(triangles.reshape(-1), "SCALAR"), "mode": 4}
            if material is not None:
                primitive["material"] = material
            packed.append(primitive)
        original_points[target] = np.concatenate(originals)
        input_triangles[target], output_triangles[target] = before, after
        new["meshes"].append({"primitives": packed, "name": mesh.get("name", f"part-{target}")})
        if target % 16 == 0:
            print(f"Packed {target+1} unique component meshes", flush=True)

    minimum, maximum = np.full(3, np.inf), np.full(3, -np.inf)
    instances = original_count = optimized_count = 0

    def matrix(node):
        if "matrix" in node:
            return np.array(node["matrix"]).reshape(4, 4, order="F")
        x, y, z, w = node.get("rotation", [0, 0, 0, 1])
        result = np.array([[1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w, 0],
                           [2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w, 0],
                           [2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y, 0], [0, 0, 0, 1.]])
        result[:3, :3] *= node.get("scale", [1, 1, 1])
        result[:3, 3] = node.get("translation", [0, 0, 0])
        return result

    # Undo CadQuery's glTF axis rotation when reporting source CAD dimensions.
    cad_axes = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]])

    def visit(index, parent):
        nonlocal minimum, maximum, instances, original_count, optimized_count
        node = doc["nodes"][index]
        transform = parent @ matrix(node)
        if "mesh" in node:
            target = mapping[node["mesh"]]
            positions = original_points[target]
            m = cad_axes @ transform
            world = positions[:, 0, None]*m[:3, 0]+positions[:, 1, None]*m[:3, 1]+positions[:, 2, None]*m[:3, 2]+m[:3, 3]
            minimum, maximum = np.minimum(minimum, world.min(axis=0)), np.maximum(maximum, world.max(axis=0))
            new["nodes"][index]["mesh"] = target
            instances += 1
            original_count += input_triangles[target]
            optimized_count += output_triangles[target]
        for child in node.get("children", []):
            visit(child, transform)

    roots = doc["scenes"][doc.get("scene", 0)]["nodes"]
    for root in roots:
        visit(root, np.eye(4))
        node = new["nodes"][root]
        # This assembly uses CAD Y as its vertical axis. CadQuery's exporter
        # adds a Z-up-to-Y-up root rotation; undo that whole-assembly rotation
        # here as well as in the reported bounds. Child placements are retained.
        placed = cad_axes @ matrix(node)
        placed[:3, :] *= 0.001
        for key in ["rotation", "translation", "scale"]:
            node.pop(key, None)
        node["matrix"] = placed.reshape(-1, order="F").tolist()
    repaired_names = 0
    for node in new["nodes"]:
        if "name" not in node:
            continue
        try:
            original_label = node["name"].encode("latin1").decode("utf8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if original_label != node["name"]:
            node["name"] = original_label
            repaired_names += 1
    if instances != info["geometry_nodes"] or len(new["nodes"]) != info["assembly_nodes"]:
        raise ValueError("The original assembly instance count changed")
    new["buffers"] = [{"byteLength": len(payload)}]
    encoded = json.dumps(new, ensure_ascii=False, separators=(",", ":")).encode()
    encoded += b" "*((-len(encoded)) % 4)
    payload.extend(b"\0"*((-len(payload)) % 4))
    result = struct.pack("<III", 0x46546C67, 2, 28+len(encoded)+len(payload))
    result += struct.pack("<II", len(encoded), 0x4E4F534A)+encoded
    result += struct.pack("<II", len(payload), 0x004E4942)+payload
    info.update(original_model_sha256=info["model_sha256"], original_model_bytes=len(raw),
        model_sha256=hashlib.sha256(result).hexdigest(), model_bytes=len(result),
        bounds_mm={"min": minimum.tolist(), "max": maximum.tolist(), "size": (maximum-minimum).tolist()},
        bounds_method="source-axis bounds of all original exported vertices",
        gltf_units="m", source_up_axis="Y", gltf_up_axis="Y",
        export_axis_rotation_corrected=True,
        utf8_node_labels_repaired=repaired_names,
        web_mesh={"display_only": True, "assembly_instances": instances,
            "unique_meshes": len(new["meshes"]), "original_triangles": original_count,
            "display_triangles": optimized_count, "target_fraction_large_parts": 0.12,
            "algorithm": "fast-simplification quadric error", "aggressiveness": 6,
            "preserve_open_boundaries": True,
            "coincident_seam_tolerance_mm": 0.00001, "hard_edge_angle_degrees": 45,
            "seconds": round(time.monotonic()-started, 3)})
    output.mkdir(parents=True)
    (output / "model.glb").write_bytes(result)
    (output / "model.json").write_text(json.dumps(info, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"bytes": len(result), "triangles": optimized_count, "instances": instances,
                      "bounds_mm": info["bounds_mm"], "seconds": info["web_mesh"]["seconds"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    optimize(args.source, args.output)
