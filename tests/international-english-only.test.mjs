import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../apps/website/',import.meta.url);
const source=await readFile(new URL('_worker.js',root),'utf8');
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const routes=['','about','contact','field-work','field-work/mining','field-work/warehouse','integration','mobility','omindos','privacy','robots','robots/articulated','robots/dual-arm','robots/open-frame','robots/quadruped','robots/wheel-legged','robots/wheeled'];
const env={ASSETS:{async fetch(request){
 const path=new URL(request.url).pathname;
 for(const name of [path,path.endsWith('/')?path+'index.html':path+'.html']){
  try{return new Response(await readFile(new URL('.'+name,root)));}catch{}
 }
 return new Response('not found',{status:404});
}}};
test('international entry always selects English and keeps all English routes',async()=>{
 for(const route of routes){
  const r=await worker.fetch(new Request('https://omindos.ai/'+route+'?source=cn',{headers:{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'}}),env);
  assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://omindos.ai/en/'+(route?route+'/':'')+'?source=cn');
  const path='/en/'+(route?route+'/':'');
  const en=await worker.fetch(new Request('https://omindos.ai'+path+'?lang=zh',{headers:{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'}}),env);
  assert.equal(en.status,200);assert.equal(en.headers.get('Content-Language'),'en');
  const html=await en.text();assert.ok(html.includes('href="https://omindos.ai'+path+'"'));
  assert.ok(html.includes('hreflang="zh-CN" href="https://omindos.cn/'+(route?route+'/':'')+'"'));
 }
});
test('Chinese mirrors redirect to corresponding cn routes before stale asset caches',async()=>{
 const stale={ASSETS:{async fetch(){return new Response('stale Chinese HTML')}}};
 for(const route of routes){
  for(const path of ['/cn/'+(route?route+'/':''),'/cn/'+(route?route+'/':'')+'index.html']){
   const r=await worker.fetch(new Request('https://omindos.ai'+path+'?source=old&lang=zh'),stale);
   assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://omindos.cn/'+(route?route+'/':'')+'?source=old');assert.equal(await r.text(),'');
  }
 }
 for(const path of ['/index.zh.html','/index.zh.html?locale-resource=1']){
  const r=await worker.fetch(new Request('https://omindos.ai'+path),stale);assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).host,'omindos.cn');
 }
});
test('legacy public pages cannot select Chinese HTML, and old Chinese routes are retired',async()=>{
 for(const path of ['/founding-oem','/why-originmind','/robot-products']){
  const r=await worker.fetch(new Request('https://omindos.ai'+path,{headers:{Cookie:'originmind_language=zh'}}),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'en');
 }
 for(const path of ['/oem/zh/','/why/zh/','/robots/zh/','/founding-oem.zh.html']){
  const r=await worker.fetch(new Request('https://omindos.ai'+path),env);assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).host,'omindos.cn');
 }
 assert.equal((await worker.fetch(new Request('https://omindos.ai/cn/does-not-exist/'),env)).status,404);
});
