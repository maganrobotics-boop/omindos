// Public bilingual policy; historical filename retained for workflow continuity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const sourceRoot=new URL('../apps/website/',import.meta.url);
const directory=await mkdtemp(join(tmpdir(),'omindos-bilingual-'));
const root=join(directory,'site');
execFileSync('python3',[fileURLToPath(new URL('../scripts/prepare-international-artifact.py',import.meta.url)),fileURLToPath(sourceRoot),root]);
process.on('exit',()=>{execFileSync('rm',['-rf',directory]);});
const source=await readFile(join(root,'_worker.js'),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const routes=['','about','contact','developers','field-work','field-work/mining','field-work/warehouse','integration','mobility','omindos','privacy','robots','robots/articulated','robots/dual-arm','robots/mobile-dual-arm','robots/open-frame','robots/quadruped','robots/wheel-legged','robots/wheeled'];
const env={ASSETS:{async fetch(request){
 const path=new URL(request.url).pathname;
 for(const name of [path,path.endsWith('/')?path+'index.html':path+'.html']){
  try{return new Response(await readFile(join(root,name)),{headers:{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'}});}catch{}
 }
 return new Response('not found',{status:404});
}}};
test('.ai root and deep links default to Chinese independently of old preferences',async()=>{
 for(const route of routes){
  const path='/'+(route?route+'/':'');
  const r=await worker.fetch(new Request('https://omindos.ai'+path+'?source=partner',{headers:{'Accept-Language':'en-US',Cookie:'originmind_language=en'}}),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'zh-CN');assert.equal(r.headers.get('Location'),null);
  const html=await r.text();assert.match(html,/<html lang="zh-CN"/);
  assert.ok(html.includes('rel="canonical" href="https://omindos.ai'+path+'"'));
  assert.ok(html.includes('property="og:url" content="https://omindos.ai'+path+'"'));
  assert.ok(html.includes('hreflang="en" href="https://omindos.ai/en'+path+'"'));
  assert.doesNotMatch(html,/https:\/\/omindos\.cn/);
 }
});
test('English URLs keep English and language links preserve page, query and section on .ai',async()=>{
 const client=await readFile(join(root,'portal-client.js'),'utf8');
 for(const route of routes){
  const path='/'+(route?route+'/':'');
  for(const locale of ['cn','en']){
   const address='https://omindos.ai'+(locale==='en'?'/en':'')+path;
   const r=await worker.fetch(new Request(address,{headers:{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'}}),env);
   assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),locale==='en'?'en':'zh-CN');
   const html=await r.text();
   const switcher=html.match(/<nav class="locale-switch"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
   assert.ok(switcher);
   const links=[...switcher.matchAll(/href="([^"]+)"/g)].map(m=>({href:m[1],getAttribute(){return this.href;}}));
   const location=new URL(address+'?source=partner&lang=zh#features');
   runInNewContext(client,{URL,location,document:{querySelectorAll:()=>links},AbortSignal:{timeout(){}},fetch:async()=>({body:{cancel(){}}})});
   assert.equal(links[0].href,'https://omindos.ai'+path+'?source=partner#features');
   assert.equal(links[1].href,'https://omindos.ai/en'+path+'?source=partner#features');
  }
 }
});
test('old aliases and explicit language selection preserve query without leaving .ai',async()=>{
 for(const route of routes){
  const path='/'+(route?route+'/':'');
  for(const alias of ['/cn'+path,'/cn'+path+'index.html',path+'?lang=zh']){
   const r=await worker.fetch(new Request('https://omindos.ai'+alias+(alias.includes('?')?'&':'?')+'source=old'),env);
   assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.ai'+path+'?source=old');
  }
  const en=await worker.fetch(new Request('https://omindos.ai'+path+'?lang=en&source=old'),env);
  assert.equal(en.status,302);assert.equal(en.headers.get('Location'),'https://omindos.ai/en'+path+'?source=old');
 }
 for(const [alias,target] of [['/index.html','/'],['/index.zh.html','/'],['/oem/zh/','/integration/'],['/why/zh/','/about/'],['/robots/zh/','/robots/']]){
  const r=await worker.fetch(new Request('https://omindos.ai'+alias),env);
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.ai'+target);
 }
});
test('Chinese media namespaces are served as assets and pages enforce safe methods',async()=>{
 const css=await worker.fetch(new Request('https://omindos.ai/cn/product-showcase.css?v=1'),env);
 assert.equal(css.status,200);assert.equal(css.headers.get('Location'),null);assert.doesNotMatch(await css.text(),/<html/);
 const head=await worker.fetch(new Request('https://omindos.ai/',{method:'HEAD'}),env);
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 const post=await worker.fetch(new Request('https://omindos.ai/robots/',{method:'POST'}),env);
 assert.equal(post.status,405);
 const missing=await worker.fetch(new Request('https://omindos.ai/not-a-page/'),env);
 assert.equal(missing.status,404);
 const api=await worker.fetch(new Request('https://omindos.ai/api/visits'),env);
 assert.equal(api.status,405);
});
test('bilingual sitemap lists all canonical routes and no Chinese aliases',async()=>{
 const xml=await readFile(join(root,'sitemap.xml'),'utf8');
 const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 for(const route of routes)for(const prefix of ['','/en'])assert.ok(urls.includes('https://omindos.ai'+prefix+'/'+(route?route+'/':'')));
 assert.equal(new Set(urls).size,urls.length);assert.doesNotMatch(xml,/omindos\.cn|\/cn\//);
});
