from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json

root=Path(__file__).resolve().parents[2]/'apps/website'
study=root/'design-study'
void={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Page(HTMLParser):
 def __init__(self,s):
  super().__init__();self.tags=[];self.stack=[];self.errors=[];self.feed(s)
 def handle_starttag(self,t,a):
  self.tags.append((t,dict(a)))
  if t not in void:self.stack.append(t)
 def handle_startendtag(self,t,a):self.tags.append((t,dict(a)))
 def handle_endtag(self,t):
  if t in void:return
  if not self.stack or self.stack[-1]!=t:self.errors.append((t,self.stack[-3:]))
  else:self.stack.pop()

files=list(study.rglob('*.html'));parsed={f:Page(f.read_text()) for f in files};refs=0
assert len(files)==86, len(files)
for f,p in parsed.items():
 assert not p.stack and not p.errors,(f,p.errors,p.stack)
 assert sum(t=='h1' for t,d in p.tags)==1,('h1',f)
 ids=[d['id'] for t,d in p.tags if 'id' in d];assert len(ids)==len(set(ids)),('duplicate id',f)
 assert any(t=='meta' and d.get('name')=='robots' and 'noindex' in d.get('content','') for t,d in p.tags),('noindex',f)
 for t,d in p.tags:
  if t=='img':assert d.get('alt'),('image alt',f)
  for key in ['href','src','poster','data-src','data-video-src']:
   if key not in d:continue
   u=urlsplit(d[key])
   if u.scheme or u.netloc:continue
   target=root/u.path.lstrip('/') if u.path else f
   assert target.is_relative_to(study),('route leaves study',f,d[key])
   if target.is_dir():target=target/'index.html'
   assert target.is_file(),(f,d[key])
   if u.fragment:assert any(x.get('id')==unquote(u.fragment) for _,x in parsed[target].tags),(f,d[key])
   refs+=1
home=parsed[study/'index.html']
scene_images=[d for t,d in home.tags if t=='img' and d.get('alt','').startswith('AI concept:')]
assert len(scene_images)==15,len(scene_images)
assert all(d['src'].startswith('/design-study/assets/') for d in scene_images)
film=next(d for t,d in home.tags if t=='video' and 'data-hero-film' in d)
assert all(k in film for k in ['muted','loop','playsinline'])
assert film.get('preload')=='none' and 'src' not in film
clips=json.loads(film['data-clips'])
assert len(clips)==3 and sum(c['end']-c['start'] for c in clips)==24
assert all(c['src'].startswith('https://omindos.ai/assets/videos/') and 0<=c['start']<c['end'] for c in clips)
assert any(t=='source' and d.get('data-src')==clips[0]['src'] for t,d in home.tags)
assert not list(study.rglob('*.mp4'))
print(json.dumps({'html_pages':len(files),'routes':85,'local_references':refs,'mobile_robot_image_slots':len(scene_images),'structure':'valid'}))
