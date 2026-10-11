"""Prepare approved product simulation footage for the official site."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'deliverables'
OUT.mkdir(exist_ok=True)
FONT = Path('/workspace/scratch/edffb52b443a/video/NotoSansSC.ttf')
SOURCES = {
    'Q1': Path('/workspace/scratch/edffb52b443a/deliverables/OriginMind-Q1-Demo.mp4'),
    'MDA1': Path('/workspace/scratch/87cbc29fd155/OmindOS-Cloud-Mobile-Dual-Arm-1080p.mp4'),
}
CHAPTERS = {
    'Q1': [(0,10,'低速行走','Walking'), (10,20,'对角小跑','Trotting'),
           (20,32,'原地转向','Turning'), (32,38,'起跳与落地','Jump and landing'),
           (38,45,'慢动作回放','Slow-motion replay')],
    'MDA1': [(0,2,'MDA1 · 双臂协同转运','MDA1 · Cooperative tray transfer'),
             (2,8,'接近取盘桌','Approach the pickup table'),
             (8,13,'停车 · 双臂对位','Park and align both arms'),
             (13,16,'双手夹紧盘柄','Close both grippers'),
             (16,21,'抬盘离桌','Lift the tray'),
             (21,31,'底盘移动与转向','Move and turn the base'),
             (31,36,'停车并放盘','Park and lower the tray'),
             (36,37.5,'手爪松开放盘','Open the grippers'),
             (37.5,44,'双臂收回','Retract both arms'),
             (44,46,'任务完成','Task complete')],
}

def text_filter(text, x, y, size, color='0xdceaf2'):
    return f"drawtext=fontfile='{FONT}':text='{text}':x={x}:y={y}:fontsize={size}:fontcolor={color}"

def build(key):
    source = SOURCES[key]
    target = OUT / f'OriginMind-{key}-Demo.mp4'
    duration = 45 if key == 'Q1' else 46
    if key == 'Q1':
        filters = ['drawbox=x=1621:y=83:w=226:h=67:color=0x12363b:t=fill',
                   text_filter('仿真',1697,96,35,'0x74ead9')]
        inputs = ['-i',str(source)]
        maps = ['-map','0:v','-map','0:a?']
    else:
        filters = ['tpad=start_mode=clone:start_duration=2:stop_mode=clone:stop_duration=2',
                   'drawbox=x=1300:y=16:w=620:h=106:color=0x132536:t=fill',
                   text_filter('MDA1 · 移动双臂机器人',1320,34,32),
                   text_filter('仿真',1775,80,26,'0x74ead9'),
                   'drawbox=x=0:y=940:w=1920:h=140:color=0x132536:t=fill',
                   text_filter('OriginMind / OmindOS',54,1032,22,'0xabc2cf')]
        for start,end,zh,en in CHAPTERS[key]:
            filters.append(text_filter(zh,54,970,36) + f":enable='gte(t,{start})*lt(t,{end})'")
        inputs = ['-i',str(source),'-stream_loop','-1','-i',str(SOURCES['Q1'])]
        maps = ['-map','0:v','-map','1:a:0']
    subprocess.run(['ffmpeg','-v','error','-y',*inputs,*maps,'-vf',','.join(filters),
                    '-t',str(duration),'-c:v','libx264','-preset','fast','-crf','19',
                    '-profile:v','high','-level','4.1','-pix_fmt','yuv420p','-r','30',
                    '-threads','4','-c:a','aac','-b:a','160k',
                    '-af',f'afade=t=in:d=1,afade=t=out:st={duration-2}:d=2',
                    '-movflags','+faststart','-metadata','title='+key+' Product demonstration',
                    '-metadata','comment=Simulation footage; hardware has not been validated.',
                    str(target)],check=True)
    subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(target),'-f','null','-'],check=True)
    probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
                       '-show_streams','-show_format','-of','json',str(target)]))
    v = next(s for s in probe['streams'] if s['codec_type']=='video')
    assert (v['width'],v['height'],v['r_frame_rate'],v['pix_fmt']) == (1920,1080,'30/1','yuv420p')
    assert int(v['nb_read_frames']) == duration * 30
    poster = OUT / f'OriginMind-{key}-Poster.jpg'
    subprocess.run(['ffmpeg','-v','error','-y','-ss','24' if key=='Q1' else '14',
                    '-i',str(target),'-frames:v','1','-q:v','2',str(poster)],check=True)
    report = {'file':target.name,'duration_s':duration,'width':1920,'height':1080,
              'fps':30,'frames':duration*30,'full_decode':'PASS',
              'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
              'bytes':target.stat().st_size,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'gripper_dof_per_hand':2 if key=='MDA1' else None,
              'gripper_model':'user-approved simulation geometry' if key=='MDA1' else None,
              'hardware_validated':False,'chapters':CHAPTERS[key]}
    (OUT/f'{key}-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__ == '__main__':
    build(sys.argv[1])
