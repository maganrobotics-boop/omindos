# SPDX-License-Identifier: GPL-3.0-only
"""Generate an independent, deliberately approximate public shell. No CAD input."""
import argparse
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct


def generate():
    blob = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def mesh(name, rings, color):
        # Equal polygon rings, closed ends; flat shading, no mechanical parts.
        faces = []
        n = len(rings[0])
        for ring, reverse in [(rings[0], True), (rings[-1], False)]:
            for i in range(1, n-1):
                tri = [ring[0], ring[i], ring[i+1]]
                faces.append(tri[::-1] if reverse else tri)
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i+1) % n
                faces.extend([[a[i], b[i], b[j]], [a[i], b[j], a[j]]])
        positions, normals = [], []
        for a,b,c in faces:
            u = [b[i]-a[i] for i in range(3)]
            v = [c[i]-a[i] for i in range(3)]
            normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            length = math.sqrt(sum(x*x for x in normal))
            for p in [a,b,c]:
                positions.extend(p)
                normals.extend(x/length for x in normal)
        attrs = {}
        for semantic, values in [('POSITION', positions), ('NORMAL', normals)]:
            data = struct.pack('<'+'f'*len(values), *values)
            views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)})
            blob.extend(data)
            acc = {'bufferView':len(views)-1,'componentType':5126,'count':len(values)//3,'type':'VEC3'}
            if semantic == 'POSITION':
                acc.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
            accessors.append(acc)
            attrs[semantic] = len(accessors)-1
        meshes.append({'name':name,'primitives':[{'attributes':attrs,'material':color}]})
        nodes.append({'name':name,'mesh':len(meshes)-1})

    def octagon(y, w, l):
        return [(-w*.75,y,-l),(w*.75,y,-l),(w,y,-l*.75),(w,y,l*.75),(w*.75,y,l),(-w*.75,y,l),(-w,y,l*.75),(-w,y,-l*.75)]

    mesh('approximate_outer_shell', [octagon(.53,.25,.47),octagon(.72,.25,.47),octagon(.77,.20,.40)], 0)
    # Broad tapered bent silhouettes, without joints, axles, motors or internals.
    for side in [-1,1]:
        for end in [-1,1]:
            rings=[]
            for y,z,w,d in [(.58,end*.31,.065,.075),(.32,end*.40,.052,.055),(.07,end*.31,.035,.04)]:
                x=side*.28
                rings.append([(x-w,y,z-d),(x+w,y,z-d),(x+w,y,z+d),(x-w,y,z+d)])
            mesh(f'leg_silhouette_{side}_{end}',rings,1)
    doc={'asset':{'version':'2.0','generator':'OriginMind approximate public shell v1'},'scene':0,
         'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,
         'materials':[{'pbrMetallicRoughness':{'baseColorFactor':c,'roughnessFactor':.85}} for c in [[.64,.67,.61,1],[.13,.16,.14,1]]],
         'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
    raw=json.dumps(doc,separators=(',',':')).encode()
    raw+=b' '*((-len(raw))%4)
    glb=struct.pack('<III',0x46546c67,2,28+len(raw)+len(blob))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(blob),0x004e4942)+blob
    return glb,doc


def build(output):
    glb,doc=generate()
    info={'robot':'originmind-q1','scope':'approximate_public_shell','version':'shell-v1',
          'original_assembly_preserved':False,'cad_input_used':False,'precise_dimensions':False,
          'geometry_nodes':len(doc['nodes']),'model_sha256':hashlib.sha256(glb).hexdigest(),
          'dynamics':{'motion_simulation_verified':False},'exportable':True}
    source=Path(__file__).parent
    logo=source.parent/'website/assets/brand/originmind-mark-184.webp'
    html=(source/'index.html').read_text().replace('__ORIGINMIND_LOGO__','data:image/webp;base64,'+base64.b64encode(logo.read_bytes()).decode())
    html=html.replace('__MODEL_INFO__',json.dumps(info)).replace('__MODEL_GZIP_BASE64__',base64.b64encode(gzip.compress(glb,mtime=0)).decode())
    output.mkdir(parents=True,exist_ok=True)
    (output/'index.html').write_text(html)
    # Inspection copy stays outside the public deployment; browser exports same bytes.
    (output/'shell.glb').write_bytes(glb)
    result={**info,'html_sha256':hashlib.sha256(html.encode()).hexdigest(),'glb_bytes':len(glb),
            'triangles':sum(a['count'] for a in doc['accessors'][::2])//3}
    (output/'shell-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    print(json.dumps(build(parser.parse_args().output),indent=2))
