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
assert len(files)==94, len(files)
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
assert all(not any(term in f.read_text().lower() for term in ['mujin','truckbot','coal mine','framerusercontent']) for f in files), 'foreign or incorrect content'
assert any(t=='img' and d.get('src','').endswith('/originmind-mark-184.webp') for t,d in home.tags)
assert any(t=='img' and d.get('src','').endswith('/lab-quadruped-render.webp') for t,d in home.tags)
lab_images={'lab-quadruped-render.webp','lab-wheeled-render.webp','lab-wheel-legged-silver-render.webp','lab-wheel-legged-open-render.webp','lab-articulated-render.webp'}
used_images={Path(d['src']).name for p in parsed.values() for t,d in p.tags if t=='img'}
assert lab_images <= used_images,('missing laboratory rendering',lab_images-used_images)
assert not used_images.intersection({'originmind-quadruped-concept.webp','robot-integration.webp','fleet-hero.webp','quadruped-field.webp','humanoid-task.webp','tracked-inspection.webp','warehouse-transport.webp'}),'superseded concept image in use'
assert 'Engineering prototype in development' in (study/'index.html').read_text()
assert all('OriginMind AI OS' not in f.read_text() for f in files), 'outdated product name'
assert 'OmindOS' in (study/'task-level-system/index.html').read_text()
assert all(any(t=='img' and d.get('src','').endswith('/'+name) and 'AI-generated' in d.get('alt','') for t,d in home.tags) for name in ['warehouse-concept-v2.webp','task-platforms-concept-v2.webp'])
assert all('open' not in d for t,d in home.tags if t=='details'), 'default closed disclosures'
assert sum(t=='video' and 'data-field-video' in d for t,d in home.tags)==6
assert all(d.get('preload')=='none' and 'controls' in d for t,d in home.tags if t=='video' and 'data-field-video' in d)
redirects=[p for p in parsed.values() if any(t=='meta' and d.get('http-equiv')=='refresh' for t,d in p.tags)]
assert len(redirects)==83,len(redirects)
assert (study/'fonts/manrope-latin-variable.woff2').is_file()
mine=parsed[study/'field-tests/metal-mine/index.html']
assert any(t=='img' and d.get('src','').endswith('/metal-mine-quadruped-render.webp') and 'concept rendering' in d.get('alt','') for t,d in mine.tags)
assert 'Application concept rendering · Engineering prototype in development' in (study/'field-tests/metal-mine/index.html').read_text()
assert any(t=='img' and d.get('src','').endswith('/metal-mine-site.webp') for t,d in mine.tags)
assert any(t=='source' and '1000087153-web.mp4' in d.get('src','') for t,d in mine.tags)
film=next(d for t,d in home.tags if t=='video' and 'data-hero-film' in d)
assert all(k in film for k in ['muted','loop','playsinline'])
assert film.get('preload')=='none' and 'src' not in film
clips=json.loads(film['data-clips'])
assert len(clips)==3 and sum(c['end']-c['start'] for c in clips)==11
assert all(c['src'].startswith('https://omindos.ai/assets/videos/') and 0<=c['start']<c['end'] for c in clips)
assert all(0<c['crop']['top']<.4 and 0<c['crop']['bottom']<.3 and c['crop']['top']+c['crop']['bottom']<.6 for c in clips)
assert any(t=='source' and d.get('data-src')==clips[0]['src'] for t,d in home.tags)
assert not list(study.rglob('*.mp4'))
print(json.dumps({'html_pages':len(files),'brand_routes':10,'legacy_redirects':83,'local_references':refs,'structure':'valid'}))
