# SPDX-License-Identifier: GPL-3.0-only
"""Privately wrap visible Q1 geometry into a coarse, solid, unstructured exterior.

The detailed GLB is read only from a private historical HTML. No source meshes,
names, hierarchy, transforms, metadata or internal surfaces are copied to output.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import numpy as np
from scipy import ndimage
from skimage.measure import marching_cubes
import trimesh


def build(reference, template, output, pitch=.003):
    source=reference.read_text()
    raw=gzip.decompress(base64.b64decode(re.search(r'id="model-data">(.*?)</script>',source,re.S)[1]))
    scene=trimesh.load(io.BytesIO(raw),file_type='glb',force='scene',process=False)
    bounds=scene.bounds
    origin=np.floor(bounds[0]/pitch)*pitch-4*pitch
    shape=np.ceil((bounds[1]-origin)/pitch).astype(int)+5
    occupied=np.zeros(shape,dtype=bool)
    used=0
    for name in scene.graph.nodes_geometry:
        matrix,key=scene.graph[name]
        mesh=scene.geometry[key].copy()
        mesh.apply_transform(matrix)
        # Sub-centimeter hardware is omitted before wrapping.
        if mesh.extents.max()<.012:
            continue
        points=mesh.voxelized(pitch,method='subdivide').fill().points
        indices=np.rint((points-origin)/pitch).astype(int)
        indices=np.clip(indices,0,shape-1)
        occupied[tuple(indices.T)]=True
        used+=1
        if used%40==0:print('wrapped components',used,flush=True)
    # Seal small vents, screw holes and gaps; fill enclosed assembly cavities.
    occupied=ndimage.binary_closing(occupied,iterations=2)
    occupied=ndimage.binary_fill_holes(occupied)
    labels,count=ndimage.label(occupied)
    sizes=np.bincount(labels.ravel())
    keep=sizes>=12;keep[0]=False
    occupied=keep[labels]
    # Smooth the occupancy field before meshing to eliminate corner-only contacts.
    field=ndimage.gaussian_filter(occupied.astype(np.float32),sigma=.65)
    vertices,faces,_,_=marching_cubes(field,.5,spacing=(pitch,)*3,allow_degenerate=False)
    exterior=trimesh.Trimesh(vertices=vertices+origin,faces=faces,process=True)
    trimesh.smoothing.filter_taubin(exterior,iterations=4)
    if len(exterior.faces)>24000:
        exterior=exterior.simplify_quadric_decimation(face_count=24000)
    exterior.remove_unreferenced_vertices()
    # Original public model's material, not an invented redesign.
    color=[.5906188488,.6375968456,.8549926281,1]
    exterior.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(baseColorFactor=color,roughnessFactor=1,doubleSided=True))
    exported=trimesh.Scene()
    exported.add_geometry(exterior,geom_name='exterior_wrap',node_name='exterior_wrap')
    glb=exported.export(file_type='glb',include_normals=True)
    metadata={'robot':'originmind-q1','scope':'public_exterior_wrap','version':'exterior-v2',
        'original_assembly_preserved':False,'source_meshes_embedded':False,
        'precise_dimensions':False,'geometry_nodes':1,'model_sha256':hashlib.sha256(glb).hexdigest(),
        'dynamics':{'motion_simulation_verified':False},'exportable':True,
        'triangles':len(exterior.faces),'vertices':len(exterior.vertices)}
    html=template.read_text()
    logo=re.search(r'<img src="(data:image/webp;base64,[^"]+)"',source)[1]
    html=html.replace('__ORIGINMIND_LOGO__',logo).replace('__MODEL_INFO__',json.dumps(metadata)).replace('__MODEL_GZIP_BASE64__',base64.b64encode(gzip.compress(glb,mtime=0)).decode())
    output.mkdir(parents=True,exist_ok=True)
    (output/'index.html').write_text(html)
    (output/'exterior.glb').write_bytes(glb)
    report={**metadata,'html_sha256':hashlib.sha256(html.encode()).hexdigest(),'glb_bytes':len(glb),
        'voxel_pitch_m':pitch,'source_bounds_private':bounds.tolist(),'exterior_bounds_private':exterior.bounds.tolist(),
        'watertight':exterior.is_watertight,'body_count':exterior.body_count,'source_components_used_privately':used,
        'source_glb_sha256_private':hashlib.sha256(raw).hexdigest()}
    (output/'private-wrap-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--template',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    build(args.reference,args.template,args.output)
