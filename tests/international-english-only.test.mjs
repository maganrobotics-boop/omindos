// English international entry with preserved domestic Chinese deep links.
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
const routes=['','about','careers','contact','developers','field-work','field-work/mining','field-work/warehouse','integration','join','lab','lab/join','mobility','omindos','privacy','robots','robots/articulated','robots/dual-arm','robots/mobile-dual-arm','robots/open-frame','robots/quadruped','robots/tracked','robots/wheel-legged','robots/wheeled'];
const env={ASSETS:{async fetch(request){
 const path=new URL(request.url).pathname;
 for(const name of [path,path.endsWith('/')?path+'index.html':path+'.html']){
  try{return new Response(await readFile(join(root,name)),{headers:{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'}});}catch{}
 }
 return new Response('not found',{status:404});
}}};
test('.ai homepage opens in English independently of browser and old cookie preferences',async()=>{
 for(const host of ['omindos.ai','www.omindos.ai'])for(const path of ['/','/index.html']){
  for(const headers of [{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'},{'Accept-Language':'en-US',Cookie:'originmind_language=en'}]){
   for(const lang of ['','&lang=en']){
    const r=await worker.fetch(new Request('https://'+host+path+'?source=partner'+lang+'#features',{headers}),env);
    assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://omindos.ai/en/?source=partner#features');
    assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(await r.text(),'');
   }
  }
  for(const lang of ['zh','cn','ZH','CN']){
   const r=await worker.fetch(new Request('https://'+host+path+'?lang='+lang+'&source=partner#features'),env);
   assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn/?source=partner#features');
  }
 }
});
test('.ai established unprefixed deep links redirect directly to .cn independently of old preferences',async()=>{
 for(const host of ['omindos.ai','www.omindos.ai'])for(const route of routes.filter(Boolean)){
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
 for(const [alias,target] of [['/index.zh.html','/'],['/oem/zh/','/integration/'],['/why/zh/','/about/'],['/robots/zh/','/robots/']]){
  const r=await worker.fetch(new Request('https://omindos.ai'+alias),env);
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn'+target);
 }
});
test('Chinese media namespaces are served as assets and pages enforce safe methods',async()=>{
 for(const path of ['/cn/product-showcase.css?v=1','/en/site-20261018.css?v=2-single-line','/en/assets/layout-20261018/mining-environment-20261012.css']){
  const css=await worker.fetch(new Request('https://omindos.ai'+path),env);
  assert.equal(css.status,200);assert.equal(css.headers.get('Location'),null);assert.doesNotMatch(await css.text(),/<html/);
 }
 const head=await worker.fetch(new Request('https://omindos.ai/',{method:'HEAD'}),env);
 assert.equal(head.status,302);assert.equal(head.headers.get('Location'),'https://omindos.ai/en/');assert.equal(await head.text(),'');
 for(const path of ['/','/index.html','/robots/','/cn/about/','/index.zh.html','/en/lab/','/en/robots/tracked/']){
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
test('English missing pages use the current English layout through the clean asset URL',async()=>{
 const assetRequests=[];
 const cleanAssetEnv={ASSETS:{async fetch(request){
  const pathname=new URL(request.url).pathname;
  assetRequests.push(pathname);
  // Cloudflare Pages redirects explicit .html asset requests to clean URLs.
  if(pathname==='/en/404.html')return new Response(null,{status:308,headers:{Location:'https://omindos.ai/en/404'}});
  return env.ASSETS.fetch(request);
 }}};
 for(const pathname of ['/en/not-a-page/','/not-a-page/','/en/404.html']){
  const response=await worker.fetch(new Request('https://omindos.ai'+pathname),cleanAssetEnv);
  assert.equal(response.status,404);assert.equal(response.headers.get('Content-Language'),'en');
  assert.equal(response.headers.get('Location'),null);assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.match(response.headers.get('Content-Type'),/text\/html/);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const html=await response.text();
  assert.ok(html.includes('class="header en-header"'));assert.ok(html.includes('/en/site-20261018.css?v=2-single-line'));
  assert.ok(html.includes('<h1>Page not found</h1>'));assert.ok(html.includes('href="/en/">OriginMind homepage</a>'));
  assert.doesNotMatch(html,/founding-oem|OEM partnership|Become an OEM partner/i);
 }
 assert.ok(assetRequests.includes('/en/404'));assert.ok(!assetRequests.includes('/en/404.html'));
 const chinese=await worker.fetch(new Request('https://omindos.ai/404.zh.html'),cleanAssetEnv);
 assert.equal(chinese.status,404);assert.equal(chinese.headers.get('Content-Language'),'zh-CN');
 assert.ok(assetRequests.includes('/404.zh'));
});
test('international sitemap lists only English canonical pages',async()=>{
 const xml=await readFile(join(root,'sitemap.xml'),'utf8');
 const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 for(const route of routes)assert.ok(urls.includes('https://omindos.ai/en/'+(route?route+'/':'')));
 assert.equal(urls.length,routes.length+2);assert.ok(!urls.includes('https://omindos.ai/'));
 assert.equal(new Set(urls).size,urls.length);assert.doesNotMatch(xml,/omindos\.cn|\/cn\//);
});

