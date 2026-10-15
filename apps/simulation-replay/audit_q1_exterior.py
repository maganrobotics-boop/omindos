# SPDX-License-Identifier: GPL-3.0-only
"""Audit exterior-only GLB structure and private same-camera silhouette evidence."""
import argparse,base64,gzip,hashlib,json,re,struct
from pathlib import Path
import numpy as np
from PIL import Image


def inspect(html):
    text=html.read_text()
    raw=gzip.decompress(base64.b64decode(re.search(r'id="model-data">(.*?)</script>',text,re.S)[1]))
    length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length])
    assert len(doc['meshes'])==1 and len(doc['nodes'])<=2
    assert not any(k in doc for k in ['skins','animations','images','textures'])
    assert sum('mesh' in n for n in doc['nodes'])==1
    assert sum(len(n.get('children',[])) for n in doc['nodes'])<=1
    assert all('uri' not in b for b in doc['buffers'])
    primitive=doc['meshes'][0]['primitives'][0]
    assert 'NORMAL' in primitive['attributes']
    triangles=doc['accessors'][primitive['indices']]['count']//3
    assert 1000<triangles<=24000
    assert set(n.get('name') for n in doc['nodes']) <= {'world','exterior_wrap'}
    info=json.loads(re.search(r'id="model-info">(.*?)</script>',text,re.S)[1])
    assert info['scope']=='public_exterior_wrap' and info['source_meshes_embedded'] is False
    assert info['original_assembly_preserved'] is False
    assert info['dynamics']['motion_simulation_verified'] is False
    assert not any(x in text for x in ['source_sha256','bounds_mm','duplicate_component_labels','.STEP'])
    return {'html_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),'model_sha256':hashlib.sha256(raw).hexdigest(),
            'triangles':triangles,'meshes':len(doc['meshes']),'nodes':len(doc['nodes']),'glb_bytes':len(raw),
            'no_source_hierarchy_or_internal_meshes':True,'normals_present':True}


def fidelity(directory):
    result=[]
    for width in [1366,390]:
        for view in ['front','side','rear','iso']:
            masks=[]
            for label in ['original','exterior']:
                rgb=np.asarray(Image.open(directory/f'{label}-{width}-{view}.png').convert('RGB')).astype(int)
                masks.append((rgb[:,:,2]>rgb[:,:,0]+5)&(rgb[:,:,2]>rgb[:,:,1]+3))
            a,b=masks
            iou=float((a&b).sum()/(a|b).sum())
            result.append({'width':width,'view':view,'silhouette_iou':iou,'passed':iou>=.90})
    assert all(r['passed'] for r in result),result
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--html',type=Path,required=True);p.add_argument('--comparisons',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    report={**inspect(a.html),'silhouette_checks':fidelity(a.comparisons),'passed':True}
    a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
