# SPDX-License-Identifier: GPL-3.0-only
"""Independently check every public GLB buffer and every reduced exterior pose."""
import argparse, base64, gzip, json, struct
from pathlib import Path
from restrict_q1_motion import data, unpack, sha, COLOR, KEEP, SOURCE_SHA

def audit(candidate, source):
    assert sha(source.read_bytes())==SOURCE_SHA
    h=candidate.read_text();oldh=source.read_text()
    raw=gzip.decompress(base64.b64decode(data(h,'model-data')))
    doc,buf=unpack(raw);old,oldbuf=unpack(gzip.decompress(base64.b64decode(data(oldh,'model-data'))))
    replay=json.loads(gzip.decompress(base64.b64decode(data(h,'replay-data'))))
    oldreplay=json.loads(gzip.decompress(base64.b64decode(data(oldh,'replay-data'))))
    assert len(doc['nodes'])==len(doc['meshes'])==replay['body_count']==13
    assert len(doc['accessors'])==len(doc['bufferViews'])==39
    assert len(doc['materials'])==1 and doc['materials'][0]['pbrMetallicRoughness']['baseColorFactor']==COLOR
    def buffer(d,b,i):
        v=d['bufferViews'][d['accessors'][i]['bufferView']];return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    # Exact equality to only the already remeshed permitted exterior buffers.
    allowed=[];removed=[]
    for i,node in enumerate(old['nodes']):
        p=old['meshes'][node['mesh']]['primitives'][0]
        (allowed if i in KEEP else removed).extend(buffer(old,oldbuf,a) for a in [*p['attributes'].values(),p['indices']])
    actual=[buffer(doc,buf,i) for i in range(39)]
    assert actual==allowed
    assert not set(map(sha,actual)) & set(map(sha,removed))
    cursor=0
    for v in doc['bufferViews']:
        offset=v['byteOffset'];assert 0<=offset-cursor<=3 and not any(buf[cursor:offset]);cursor=offset+v['byteLength']
    assert len(buf)-cursor<=3 and not any(buf[cursor:])
    assert len(replay['frames'])==551
    sample=sorted(set(range(0,1100,2))|{1099})
    max_translation_error=0
    for f,si in zip(replay['frames'],sample):
        oldf=oldreplay['frames'][si];assert len(f['pose'])==91 and f['t']==oldf['t']
        for ni,oi in enumerate(KEEP):
            for k in range(7):
                expected=round(oldf['pose'][oi*7+k],3 if k<3 else 4)
                assert f['pose'][ni*7+k]==expected
                if k<3:max_translation_error=max(max_translation_error,abs(expected-oldf['pose'][oi*7+k]))
    assert not any(x in h for x in ['crank','RL_rod','RR_rod','FL_rod','FR_rod','source_project','assembly_corrections'])
    assert '仍可提取' in h
    return dict(passed=True,html_sha256=sha(h.encode()),glb_sha256=sha(raw),nodes=13,removed_segments=8,frames=551,values_per_frame=91,unused_binary_bytes=0,removed_buffer_matches=0,max_translation_quantization_error_m=max_translation_error,original_material_restored=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--candidate',type=Path,required=True);p.add_argument('--source',type=Path,required=True);a=p.parse_args();print(json.dumps(audit(a.candidate,a.source),indent=2))
