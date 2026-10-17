// Domestic Chinese redirects and the retained overseas English website.
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
test('.ai Chinese root and deep links redirect directly to .cn independently of old preferences',async()=>{
 for(const host of ['omindos.ai','www.omindos.ai'])for(const route of routes){
  const path='/'+(route?route+'/':'');
  const r=await worker.fetch(new Request('https://'+host+path+'?source=partner#features',{headers:{'Accept-Language':'en-US',Cookie:'originmind_language=en'}}),env);
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn'+path+'?source=partner#features');
  assert.equal(await r.text(),'');
 }
});
test('English stays on .ai/en and language links preserve context across domains without loops',async()=>{
 const client=await readFile(join(root,'portal-client.js'),'utf8');
 for(const route of routes){
  const path='/'+(route?route+'/':'');
  for(const locale of ['cn','en']){
   const address=locale==='en'?'https://omindos.ai/en'+path:'https://omindos.cn'+path;
   let html;
   if(locale==='en'){
    const r=await worker.fetch(new Request(address,{headers:{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'}}),env);
    assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'en');
    html=await r.text();assert.ok(html.includes('rel="canonical" href="'+address+'"'));
    assert.ok(html.includes('hreflang="zh-CN" href="https://omindos.cn'+path+'"'));
   }else html=await readFile(join(root,'cn',route,'index.html'),'utf8');
   const switcher=html.match(/<nav class="locale-switch"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
   assert.ok(switcher);
   const links=[...switcher.matchAll(/href="([^"]+)"/g)].map(m=>({href:m[1],getAttribute(){return this.href;}}));
   const location=new URL(address+'?source=partner&lang=zh#features');
   runInNewContext(client,{URL,location,document:{querySelectorAll:()=>links,visibilityState:'visible',addEventListener(){},removeEventListener(){}},AbortSignal:{timeout(){}},fetch:async()=>({body:{cancel(){}}})});
   assert.equal(links[0].href,'https://omindos.cn'+path+'?source=partner#features');
   assert.equal(links[1].href,'https://omindos.ai/en'+path+'?source=partner#features');
  }
 }
});
test('Chinese aliases go to .cn while explicit English selection stays on .ai',async()=>{
 for(const route of routes){
  const path='/'+(route?route+'/':'');
  for(const alias of ['/cn'+path,'/cn'+path+'index.html',path+'?lang=zh']){
   const r=await worker.fetch(new Request('https://omindos.ai'+alias+(alias.includes('?')?'&':'?')+'source=old'),env);
   assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn'+path+'?source=old');
  }
  const en=await worker.fetch(new Request('https://omindos.ai'+path+'?lang=en&source=old'),env);
  assert.equal(en.status,302);assert.equal(en.headers.get('Location'),'https://omindos.ai/en'+path+'?source=old');
 }
 for(const [alias,target] of [['/index.html','/'],['/index.zh.html','/'],['/oem/zh/','/integration/'],['/why/zh/','/about/'],['/robots/zh/','/robots/']]){
  const r=await worker.fetch(new Request('https://omindos.ai'+alias),env);
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn'+target);
 }
});
test('Chinese media namespaces are served as assets and pages enforce safe methods',async()=>{
 const css=await worker.fetch(new Request('https://omindos.ai/cn/product-showcase.css?v=1'),env);
 assert.equal(css.status,200);assert.equal(css.headers.get('Location'),null);assert.doesNotMatch(await css.text(),/<html/);
 const head=await worker.fetch(new Request('https://omindos.ai/',{method:'HEAD'}),env);
 assert.equal(head.status,308);assert.equal(head.headers.get('Location'),'https://omindos.cn/');assert.equal(await head.text(),'');
 for(const path of ['/','/robots/','/cn/about/','/index.zh.html']){
  const post=await worker.fetch(new Request('https://omindos.ai'+path,{method:'POST',body:'private'}),env);
  assert.equal(post.status,405);assert.equal(post.headers.get('Location'),null);
 }
 const missing=await worker.fetch(new Request('https://omindos.ai/not-a-page/'),env);
 assert.equal(missing.status,404);
 const api=await worker.fetch(new Request('https://omindos.ai/api/visits'),env);
 assert.equal(api.status,405);
});
test('English product captions reach their exact same-origin media bytes',async()=>{
 for(const model of ['quadruped','mobile-dual-arm']){
  const page=await readFile(join(root,'en/robots',model,'index.html'),'utf8');
  const caption=page.match(/<track\b[^>]*src="([^"]+\.vtt)"/)?.[1];
  assert.ok(caption?.startsWith('/en/assets/'));
  const url='https://omindos.ai'+caption;
  for(const method of ['GET','HEAD']){
   const response=await worker.fetch(new Request(url,{method}),env);
   assert.equal(response.status,200);assert.equal(response.headers.get('Location'),null);
   if(method==='GET')assert.equal(await response.text(),await readFile(join(root,caption),'utf8'));
  }
  const post=await worker.fetch(new Request(url,{method:'POST',body:'unaccepted'}),env);
  assert.equal(post.status,405);assert.equal(post.headers.get('Location'),null);
 }
});
test('international sitemap lists only English canonical pages',async()=>{
 const xml=await readFile(join(root,'sitemap.xml'),'utf8');
 const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 for(const route of routes)assert.ok(urls.includes('https://omindos.ai/en/'+(route?route+'/':'')));
 assert.equal(urls.length,routes.length+2);assert.ok(!urls.includes('https://omindos.ai/'));
 assert.equal(new Set(urls).size,urls.length);assert.doesNotMatch(xml,/omindos\.cn|\/cn\//);
});

