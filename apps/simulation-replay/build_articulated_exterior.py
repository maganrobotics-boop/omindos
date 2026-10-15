# SPDX-License-Identifier: GPL-3.0-only
"""Build a private, coarse articulated exterior and sanitised motion candidate.

Input geometry stays private. Every visible mesh is voxelised, closed, filled,
resurfaced and decimated independently in its own local coordinates. The output
contains only neutral display segments and bodyIndex values needed for replay.
The recorded body poses are preserved, never synthesised or dynamically rerun.
"""
from pathlib import Path
import argparse
import base64
import copy
import gzip
import hashlib
import io
import json
import re
import struct

import numpy as np
from scipy import ndimage
from skimage.measure import marching_cubes
import trimesh

PITCH = .003
FACE_BUDGET = 48000
MIN_FACES = 256


def sha(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def script_data(html, name):
    return re.search(r'<script[^>]*id="' + name + r'"[^>]*>(.*?)</script>', html, re.S)[1]


def replace_data(html, name, value):
    pattern = r'(<script[^>]*id="' + name + r'"[^>]*>).*?(</script>)'
    return re.sub(pattern, lambda m: m[1] + value + m[2], html, count=1, flags=re.S)


def unpack_glb(raw):
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    offset = 20 + length
    bin_length, bin_type = struct.unpack_from('<II', raw, offset)
    assert bin_type == 0x004E4942
    return doc, raw[offset + 8:offset + 8 + bin_length]


def accessor(doc, binary, number):
    a = doc['accessors'][number]
    v = doc['bufferViews'][a['bufferView']]
    kinds = {5123: '<u2', 5125: '<u4', 5126: '<f4'}
    columns = {'SCALAR': 1, 'VEC3': 3}
    assert 'byteStride' not in v and 'sparse' not in a
    values = np.frombuffer(binary, dtype=kinds[a['componentType']],
        count=a['count'] * columns[a['type']],
        offset=v.get('byteOffset', 0) + a.get('byteOffset', 0))
    return values.reshape((-1, columns[a['type']])).copy()


def wrap(mesh):
    # Working arrays cover only this body's local bounding box.
    bounds = mesh.bounds
    origin = np.floor(bounds[0] / PITCH) * PITCH - 4 * PITCH
    shape = np.ceil((bounds[1] - origin) / PITCH).astype(int) + 5
    occupied = np.zeros(shape, dtype=bool)
    # Sample source triangle surfaces in bounded batches instead of subdividing
    # complete merged components. Samples are <=1.5 mm apart; no source faces
    # are copied to output. At most 250k points are materialised at a time.
    triangles = np.asarray(mesh.vertices[mesh.faces], dtype=np.float32)
    edge = np.maximum.reduce([np.linalg.norm(triangles[:, 1] - triangles[:, 0], axis=1),
        np.linalg.norm(triangles[:, 2] - triangles[:, 0], axis=1),
        np.linalg.norm(triangles[:, 2] - triangles[:, 1], axis=1)])
    divisions = np.maximum(1, np.ceil(edge / (PITCH * .5)).astype(int))
    used = 0
    for n in np.unique(divisions):
        selected = np.flatnonzero(divisions == n)
        u, v = np.triu_indices(int(n) + 1)
        # u <= v; barycentric weights (u/n, (v-u)/n) stay in triangle.
        first = (u / n).astype(np.float32)
        second = ((v - u) / n).astype(np.float32)
        batch = max(1, 250000 // len(u))
        for offset in range(0, len(selected), batch):
            tri = triangles[selected[offset:offset + batch]]
            points = (tri[:, None, 0]
                + first[None, :, None] * (tri[:, None, 1] - tri[:, None, 0])
                + second[None, :, None] * (tri[:, None, 2] - tri[:, None, 0]))
            indices = np.rint((points.reshape(-1, 3) - origin) / PITCH).astype(np.int32)
            np.clip(indices, 0, shape - 1, out=indices)
            occupied[tuple(indices.T)] = True
            used += len(tri)
    del triangles, edge, divisions, points, indices
    assert used and occupied.any()
    occupied = ndimage.binary_closing(occupied, iterations=2)
    occupied = ndimage.binary_fill_holes(occupied)
    labels, count = ndimage.label(occupied)
    sizes = np.bincount(labels.ravel())
    keep = sizes >= 8
    keep[0] = False
    occupied = keep[labels]
    field = ndimage.gaussian_filter(occupied.astype(np.float32), sigma=.65)
    vertices, faces, _, _ = marching_cubes(field, .5,
        spacing=(PITCH,) * 3, allow_degenerate=False)
    exterior = trimesh.Trimesh(vertices=vertices + origin, faces=faces, process=True)
    trimesh.smoothing.filter_taubin(exterior, iterations=4)
    return exterior, used


def export_glb(parts, colors):
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def add_array(array, component_type, shape, bounds=False, target=34962):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        binary.extend(array.tobytes())
        view = len(views)
        views.append({'buffer': 0, 'byteOffset': start,
            'byteLength': array.nbytes, 'target': target})
        record = {'bufferView': view, 'componentType': component_type,
            'count': len(array), 'type': shape}
        if bounds:
            record['min'] = array.min(axis=0).astype(float).tolist()
            record['max'] = array.max(axis=0).astype(float).tolist()
        index = len(accessors)
        accessors.append(record)
        return index

    materials = []
    for index, (mesh, color) in enumerate(zip(parts, colors)):
        label = f'segment_{index:02d}'
        positions = np.asarray(mesh.vertices, dtype='<f4')
        normals = np.asarray(mesh.vertex_normals, dtype='<f4')
        faces = np.asarray(mesh.faces, dtype='<u4').reshape(-1)
        p = add_array(positions, 5126, 'VEC3', bounds=True)
        n = add_array(normals, 5126, 'VEC3')
        f = add_array(faces, 5125, 'SCALAR', target=34963)
        materials.append({'name': f'display_{index:02d}',
            'pbrMetallicRoughness': {'baseColorFactor': color, 'roughnessFactor': 1},
            'doubleSided': True})
        meshes.append({'name': label, 'primitives': [{
            'attributes': {'POSITION': p, 'NORMAL': n},
            'indices': f, 'material': index}]})
        nodes.append({'name': label, 'mesh': index,
            'extras': {'bodyIndex': index}})
    doc = {'asset': {'version': '2.0', 'generator': 'OriginMind exterior motion display'},
        'scene': 0, 'scenes': [{'nodes': list(range(len(parts)))}],
        'nodes': nodes, 'meshes': meshes, 'materials': materials,
        'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(binary)}]}
    encoded = canonical(doc).encode()
    encoded += b' ' * ((-len(encoded)) % 4)
    binary.extend(b'\0' * ((-len(binary)) % 4))
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, total)
        + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
        + struct.pack('<II', len(binary), 0x004E4942) + binary)


def build(root, reference):
    assert root.is_dir() and not (root / 'candidate.html').exists()
    html = reference.read_text()
    raw = gzip.decompress(base64.b64decode(script_data(html, 'model-data')))
    replay_source = json.loads(gzip.decompress(base64.b64decode(script_data(html, 'replay-data'))))
    doc, binary = unpack_glb(raw)
    assert len(doc['nodes']) == 21 and replay_source['validation']['status'] == 'PASS'
    source_meshes, colors = [], []
    for index, node in enumerate(doc['nodes']):
        assert node['extras']['bodyIndex'] == index
        assert not any(key in node for key in ('children', 'matrix', 'translation', 'rotation', 'scale'))
        primitive = doc['meshes'][node['mesh']]['primitives'][0]
        mesh = trimesh.Trimesh(
            vertices=accessor(doc, binary, primitive['attributes']['POSITION']),
            faces=accessor(doc, binary, primitive['indices']).reshape(-1, 3),
            process=False)
        source_meshes.append(mesh)
        colors.append(doc['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorFactor'])
    areas = np.asarray([mesh.area for mesh in source_meshes])
    extra = FACE_BUDGET - MIN_FACES * len(source_meshes)
    budgets = MIN_FACES + np.floor(extra * areas / areas.sum()).astype(int)
    parts = []
    for index, (mesh, budget) in enumerate(zip(source_meshes, budgets)):
        print('wrapping', index, 'input faces', len(mesh.faces), 'target', int(budget), flush=True)
        part, count = wrap(mesh)
        raw_faces = len(part.faces)
        if raw_faces > budget:
            part = part.simplify_quadric_decimation(face_count=int(budget))
        part.remove_unreferenced_vertices()
        assert np.isfinite(part.vertices).all() and len(part.faces) >= 4
        parts.append(part)
        print('finished', index, 'faces', len(part.faces), flush=True)
    model = export_glb(parts, colors)
    frames = [{'t': frame['t'], 'phase': frame['phase'], 'pose': frame['pose'],
        'height': frame['height'], 'speed': frame['speed'],
        'contacts': sum(value > 5 for value in frame['forces'])}
        for frame in replay_source['frames']]
    assert all(len(frame['pose']) == 147 for frame in frames)
    frame_digest = sha(canonical(frames).encode())
    model_digest = sha(model)
    motion_key = sha((model_digest + ':' + frame_digest).encode())
    replay = {'schema': 'originmind-q1-exterior-motion/v1', 'motion_key': motion_key,
        'body_count': 21, 'body_names': [f'segment_{i:02d}' for i in range(21)],
        'root_index': 0, 'duration_s': 22, 'validation': {'status': 'PASS'},
        'hardware_validated': False, 'frames': frames}
    replay_json = canonical(replay).encode()
    info = {'robot': 'originmind-q1', 'scope': 'public_articulated_exterior',
        'revision': 'Q1 exterior motion preview 1',
        'original_assembly_preserved': False, 'source_meshes_embedded': False,
        'precise_dimensions': False, 'estimated_parameters': True,
        'hardware_validated': False, 'motion_simulated': True,
        'geometry_nodes': 21, 'triangles': sum(len(part.faces) for part in parts),
        'vertices': sum(len(part.vertices) for part in parts),
        'model_bytes': len(model), 'model_sha256': model_digest,
        'motion_key': motion_key, 'duration_s': 22}
    html = replace_data(html, 'model-info', canonical(info))
    html = replace_data(html, 'model-data', base64.b64encode(gzip.compress(model, mtime=0)).decode())
    html = replace_data(html, 'replay-data', base64.b64encode(gzip.compress(replay_json, mtime=0)).decode())
    replacements = {
        "info.scope!=='dynamics_replay'": "info.scope!=='public_articulated_exterior'",
        "info.source_geometry_instances.toLocaleString('zh-CN')+' 个实例'": "info.geometry_nodes+' 个简化外壳分段'",
        "'12 个驱动 · 4 个四连杆'": "'估算参数 · 平地仿真'",
        "replay.source_sha256!==info.source_sha256||replay.validation.status!=='PASS'||replay.body_names.length!==21":
            "replay.motion_key!==info.motion_key||replay.body_count!==21||replay.root_index!==0||replay.frames.length<2",
        "bodyCount=replay.body_names.length": "bodyCount=replay.body_count",
        "const base=replay.body_names.indexOf('base'),po=base*7": "const base=replay.root_index,po=base*7",
        "contacts:a.forces.map((x,i)=>mix(x,b.forces[i])).filter(x=>x>5).length,closureMm:mix(a.closure_mm,b.closure_mm)":
            "contacts:a.contacts",
        "massAssumptionKg:45,hardwareValidated:false,trajectorySha256:replay.trajectory_sha256":
            "estimatedParameters:true,hardwareValidated:false,motionKey:replay.motion_key,scope:info.scope",
        "OriginMind-Q1-V1.2-Dynamics-R1.glb": "OriginMind-Q1-Exterior-Motion.glb",
        "OriginMind-Q1-V1.2-Dynamics-R1-Info.json": "OriginMind-Q1-Exterior-Motion-Info.json",
        "OriginMind-Q1-V1.2-Replay.json": "OriginMind-Q1-Exterior-Poses.json",
        "下载仿真展示模型": "下载简化外壳",
        "参数与来源": "展示信息",
        "采样轨迹与验证": "回放姿态",
        "OmindOS 四足仿真 · OriginMind V1.2": "OmindOS Q1 · 四足仿真回放",
        "OriginMind 自有 V1.2 四足机器人起身、行走与停步仿真回放，支持暂停、进度拖动和三维视角。":
            "Q1 简化外壳的 22 秒起身、行走与停步仿真回放，支持暂停、进度拖动和三维视角。",
        "查看 OriginMind 自有 V1.2 四足机器人的实际计算轨迹：起身、站立、行走、停步。":
            "查看 Q1 简化外壳的起身、站立、行走与停步仿真回放。",
        "OriginMind 自有 V1.2 机器人，起身、站立、行走与停步的连续物理仿真。":
            "Q1 简化外壳，回放 22 秒起身、行走与停步仿真。",
        'ORIGINMIND / V1.2 R1': 'ORIGINMIND / Q1 MOTION',
        '实际计算轨迹 · 可旋转查看': '简化外壳 · 仿真回放',
        '正在读取自有模型与实际仿真轨迹': '正在读取简化外壳与回放轨迹',
        '<span class="small">V1.2</span>': '<span class="small">Q1</span>',
        '<h3>四足机器人 V1.2</h3><p>V1.2 独立仿真副本 · 装配处理已记录。</p>':
            '<h3>Q1 四足机器人</h3><p>简化外壳与计算轨迹，支持手机和电脑查看。</p>',
        '<dt>模型来源</dt><dd>自有 V1.2 STEP 总装</dd><dt>源装配</dt>':
            '<dt>展示模型</dt><dd>Q1 分段简化外壳</dd><dt>外壳分段</dt>',
        '<dt>仿真机构</dt>': '<dt>仿真条件</dt>',
        '<dt>参数工况</dt><dd>45 kg · ±60 N·m（估算）</dd>':
            '<dt>参数状态</dt><dd>尚未完成真机实测标定</dd>',
        '<strong>起身、行走和停步已接入</strong><p>当前读数随采样轨迹更新。自由机身由关节力矩和足地接触驱动；质量、惯量与电机参数尚未实测标定。</p>':
            '<strong>22 秒仿真回放</strong><p>播放起身、站立、行走与停步的计算轨迹。可暂停、拖动进度或切换视角；读数来自仿真采样。</p>',
        'OriginMind V1.2 四足机器人三维模型。': 'OriginMind Q1 简化外壳三维模型。',
    }
    for old, new in replacements.items():
        assert old in html, 'missing replacement: ' + old
        html = html.replace(old, new)
    notice = ('<div class="notice">采用估算参数的平地仿真，展示简化外壳与计算轨迹；'
        '未完成真机标定与性能验收。公开模型不含详细装配与内部零件，'
        '仅用于外观与运动展示，不用于尺寸测量或制造。</div>')
    html, count = re.subn(r'<div class="notice">.*?</div>', lambda _: notice, html, count=1, flags=re.S)
    assert count == 1
    # Ensure detailed CAD hashes, assembly corrections and validation remain private.
    blocked = ['source_sha256', 'assembly_corrections', 'source_geometry_instances',
        'source_project', 'closure_mm', 'torque_limit', 'body_names', 'source_metadata',
        'display_meshes', 'input_triangles', 'mass_assumption_kg']
    assert not any(token in html for token in blocked)
    assert all(frame['pose'] == source['pose'] for frame, source in zip(frames, replay_source['frames']))
    assert info['triangles'] <= FACE_BUDGET
    public_doc, public_binary = unpack_glb(model)
    assert len(public_doc['nodes']) == len(public_doc['meshes']) == 21
    assert all(set(node) == {'name', 'mesh', 'extras'} for node in public_doc['nodes'])
    assert all(node['extras'] == {'bodyIndex': i} for i, node in enumerate(public_doc['nodes']))
    assert all(node['name'] == f'segment_{i:02d}' for i, node in enumerate(public_doc['nodes']))
    # Byte equality of any source buffer would indicate accidental mesh copying.
    source_buffers = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        for v in doc['bufferViews']]
    new_buffers = [public_binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        for v in public_doc['bufferViews']]
    reused = sum(item == original for item in new_buffers for original in source_buffers)
    assert reused == 0
    output = html.encode()
    (root / 'candidate.html').write_bytes(output)
    (root / 'exterior-motion.glb').write_bytes(model)
    (root / 'replay-poses.json').write_bytes(replay_json)
    audit = {'status': 'private_candidate_built', 'browser_qa_required': True,
        'candidate_html_sha256': sha(output), 'model_sha256': model_digest,
        'replay_sha256': sha(replay_json), 'motion_key': motion_key,
        'html_bytes': len(output), 'glb_bytes': len(model), 'replay_bytes': len(replay_json),
        'body_count': 21, 'frame_count': len(frames), 'duration_s': 22,
        'last_frame_s': frames[-1]['t'], 'triangles': info['triangles'],
        'vertices': info['vertices'], 'voxel_pitch_m': PITCH,
        'source_buffers_reused': reused, 'body_pose_samples_preserved': True,
        'source_frames_preserved': len(frames) == len(replay_source['frames']),
        'public_replay_frame_keys': sorted(frames[0]),
        'public_metadata_keys': sorted(info), 'detailed_metadata_removed': True,
        'hardware_validated': False, 'estimated_parameters': True}
    (root / 'build-summary.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps(audit, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', required=True, type=Path,
        help='Private frozen reference HTML containing model and sampled replay')
    parser.add_argument('--output', required=True, type=Path,
        help='New private output directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    build(args.output, args.reference)