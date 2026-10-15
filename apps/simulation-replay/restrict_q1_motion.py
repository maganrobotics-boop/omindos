# SPDX-License-Identifier: GPL-3.0-only
"""Restrict the verified remeshed Q1 motion release; never accept detailed CAD."""
import argparse, base64, copy, gzip, hashlib, json, re, struct
from pathlib import Path
SOURCE_SHA = 'c279f5f2b55a87550f7f11866fb252f56d277dbb1cbfc1b0d3595055ca9815ee'
KEEP = (0, 1, 2, 3, 4, 5, 8, 11, 12, 13, 14, 15, 16)
COLOR = [0.5906188488006592, 0.637596845626831, 0.8549926280975342, 1]
def sha(b): return hashlib.sha256(b).hexdigest()
def enc(v): return json.dumps(v, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
def data(h, n): return re.search(r'<script[^>]*id="'+n+r'"[^>]*>(.*?)</script>', h, re.S)[1]
def replace(h,n,v): return re.sub(r'(<script[^>]*id="'+n+r'"[^>]*>).*?(</script>)',lambda m:m[1]+v+m[2],h,count=1,flags=re.S)
def unpack(b):
    n=struct.unpack_from('<I',b,12)[0]
    return json.loads(b[20:20+n]), b[28+n:]
def build(source, output):
    raw=source.read_bytes(); assert sha(raw)==SOURCE_SHA, 'Unreviewed source release'
    h=raw.decode(); old, binary=unpack(gzip.decompress(base64.b64decode(data(h,'model-data'))))
    replay=json.loads(gzip.decompress(base64.b64decode(data(h,'replay-data'))))
    assert len(old['nodes'])==replay['body_count']==21
    doc={'asset':{'version':'2.0','generator':'OriginMind visible exterior display'},'scene':0,'scenes':[{'nodes':list(range(13))}], 'nodes':[], 'meshes':[], 'materials':[{'pbrMetallicRoughness':{'baseColorFactor':COLOR,'roughnessFactor':1},'doubleSided':True}], 'accessors':[], 'bufferViews':[]}
    buf=bytearray()
    def take(i):
        a=copy.deepcopy(old['accessors'][i]); v=old['bufferViews'][a['bufferView']]
        assert set(v)<= {'buffer','byteOffset','byteLength','target'} and not a.get('byteOffset',0)
        start=v.get('byteOffset',0); payload=binary[start:start+v['byteLength']]
        buf.extend(b'\0'*(-len(buf)%4)); nv={**v,'byteOffset':len(buf)};buf.extend(payload)
        a['bufferView']=len(doc['bufferViews']);doc['bufferViews'].append(nv)
        doc['accessors'].append(a);return len(doc['accessors'])-1
    for new,old_index in enumerate(KEEP):
        node=old['nodes'][old_index];assert node=={'name':f'segment_{old_index:02d}','mesh':old_index,'extras':{'bodyIndex':old_index}}
        p=old['meshes'][node['mesh']]['primitives'];assert len(p)==1
        p=p[0]; assert set(p['attributes'])=={'POSITION','NORMAL'}
        prim={'attributes':{k:take(v) for k,v in p['attributes'].items()},'indices':take(p['indices']),'material':0}
        doc['meshes'].append({'name':f'exterior_{new:02d}','primitives':[prim]})
        doc['nodes'].append({'name':f'exterior_{new:02d}','mesh':new,'extras':{'bodyIndex':new}})
    doc['buffers']=[{'byteLength':len(buf)}];jb=enc(doc);jb+=b' '*(-len(jb)%4);buf.extend(b'\0'*(-len(buf)%4))
    glb=struct.pack('<III',0x46546c67,2,28+len(jb)+len(buf))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(buf),0x004e4942)+buf
    frames=[]
    for i in sorted(set(range(0,len(replay['frames']),2))|{len(replay['frames'])-1}):
        f=replay['frames'][i];assert len(f['pose'])==147
        pose=[]
        for bi in KEEP: pose.extend(round(f['pose'][bi*7+k],3 if k<3 else 4) for k in range(7))
        frames.append({'t':f['t'],'phase':f['phase'],'pose':pose,'height':round(f['height'],3),'speed':round(f['speed'],3),'contacts':f['contacts']})
    motion_key=sha(glb+enc(frames))
    replay={'schema':'q1-visible-exterior-poses-v2','motion_key':motion_key,'body_count':13,'body_names':[n['name'] for n in doc['nodes']],'root_index':0,'duration_s':22,'hardware_validated':False,'sampling':{'nominal_hz':25,'translation_step_m':.001,'quaternion_step':.0001},'frames':frames}
    info=json.loads(data(h,'model-info'));info.update(scope='public_visible_exterior_motion',geometry_nodes=13,motion_key=motion_key,internal_transmission_embedded=False,pose_scope='visible exterior only; reduced sampling and precision',source_meshes_embedded=False)
    # Whitelist metadata; stale geometry statistics from the previous release are not retained.
    info={k:info[k] for k in ('robot','scope','geometry_nodes','motion_key','motion_simulated','source_meshes_embedded','internal_transmission_embedded','pose_scope')}
    for name,payload in [('model-data',glb),('replay-data',enc(replay))]: h=replace(h,name,base64.b64encode(gzip.compress(payload,mtime=0)).decode())
    h=replace(h,'model-info',enc(info).decode()).replace('public_articulated_exterior','public_visible_exterior_motion').replace('replay.body_count!==21','replay.body_count!==13')
    h=h.replace('>回放姿态</a>','>外壳动画数据</a>').replace('OriginMind-Q1-Exterior-Poses.json','OriginMind-Q1-Visible-Exterior-Poses.json')
    h=h.replace('公开模型不含详细装配与内部零件，仅用于外观与运动展示，不用于尺寸测量或制造。','公开数据仅含简化外壳和降低采样频率、精度的外壳动画，不含曲柄、连杆网格及其位姿。外壳模型和动画仍可提取，仅用于展示，不用于尺寸测量或制造。')
    output.mkdir(parents=True,exist_ok=False);(output/'index.html').write_text(h);(output/'exterior.glb').write_bytes(glb);(output/'visible-poses.json').write_bytes(enc(replay))
    report={'html_sha256':sha(h.encode()),'glb_sha256':sha(glb),'poses_sha256':sha(enc(replay)),'html_bytes':len(h.encode()),'glb_bytes':len(glb),'nodes':13,'frames':len(frames),'pose_values_per_frame':91,'color':COLOR,'removed_transmission_segments':8,'source_html_sha256':SOURCE_SHA}
    (output/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();build(a.source,a.output)
