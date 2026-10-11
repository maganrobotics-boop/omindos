import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const base='https://omindos.ai';
const routes=['','about','contact','developers','field-work','field-work/mining','field-work/warehouse','integration','mobility','omindos','privacy','robots','robots/articulated','robots/dual-arm','robots/mobile-dual-arm','robots/open-frame','robots/quadruped','robots/wheel-legged','robots/wheeled'];
async function request(url,headers={}){
 return fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; OMINDOS-Deployment-Check/1.0)',...headers},redirect:'manual',signal:AbortSignal.timeout(15000)});
}
async function check(name,callback){
 for(let attempt=1;;attempt++){
  try{await callback();console.log('PASS '+name);return;}
  catch(error){if(attempt===3)throw new Error(name+': '+error.message,{cause:error});await delay(2000);}
 }
}
for(const route of routes){
 const suffix=route?route+'/':'';
 await check('English /en/'+suffix,async()=>{
  const r=await request(base+'/en/'+suffix,{'Accept-Language':'zh-CN',Cookie:'originmind_language=zh'});
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'en');
  const html=await r.text();assert.ok(html.includes('rel="canonical" href="'+base+'/en/'+suffix+'"'));
  assert.ok(html.includes('property="og:url" content="'+base+'/en/'+suffix+'"'));
  assert.ok(html.includes('hreflang="zh-CN" href="https://omindos.ai/'+suffix+'"'));
  assert.match(html,/<html lang="en"/);assert.match(html,/<main\b/);
  assert.doesNotMatch(html,/href="(?:https:\/\/omindos\.ai)?\/cn\//);
 });
 await check('Chinese root /'+suffix,async()=>{
  const r=await request(base+'/'+suffix,{'Accept-Language':'en-US',Cookie:'originmind_language=en'});
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'zh-CN');
  const html=await r.text();assert.match(html,/<html lang="zh-CN"/);
  assert.ok(html.includes('rel="canonical" href="'+base+'/'+suffix+'"'));
  assert.ok(html.includes('hreflang="en" href="'+base+'/en/'+suffix+'"'));
  assert.doesNotMatch(html,/https:\/\/omindos\.cn/);
 });
 await check('Chinese alias /cn/'+suffix,async()=>{
  const r=await request(base+'/cn/'+suffix+'?source=deployment&lang=zh');
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),base+'/'+suffix+'?source=deployment');await r.body?.cancel();
 });
}
for(const path of ['/founding-oem','/why-originmind','/robot-products'])await check('English legacy '+path,async()=>{
 const r=await request(base+path,{Cookie:'originmind_language=zh'});assert.equal(r.status,200);assert.equal(r.headers.get('Content-Language'),'en');assert.match(await r.text(),/<html lang="en"/);
});
for(const path of ['/index.zh.html','/oem/zh/','/why/zh/','/robots/zh/'])await check('Retired alias '+path,async()=>{
 const r=await request(base+path);assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).host,'omindos.ai');await r.body?.cancel();
});
await check('Explicit English selection remains available',async()=>{
 const r=await request(base+'/?lang=en&source=deployment');
 assert.equal(r.status,302);assert.equal(r.headers.get('Location'),base+'/en/?source=deployment');await r.body?.cancel();
});
await check('International sitemap',async()=>{
 const r=await request(base+'/sitemap.xml');assert.equal(r.status,200);const xml=await r.text();assert.doesNotMatch(xml,/\/cn\//);
 const expectedUrls=[...routes.flatMap(route=>['','/en'].map(prefix=>base+prefix+'/'+(route?route+'/':''))),base+'/founding-oem',base+'/why-originmind'];
 assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]).sort(),expectedUrls.sort());
 const robots=await (await request(base+'/robots.txt')).text();assert.equal((robots.match(/Sitemap:/g)||[]).length,1);assert.ok(robots.includes(base+'/sitemap.xml'));
});
for(const path of ['/cn/assets/mda1-product-white-20261011.webp','/cn/product-showcase.css?v=20261011-white','/cn/assets/simulations/20261010/OriginMind-Quadruped-Website-1080p.mp4','/cn/assets/simulations/20261010/OriginMind-Dual-Arm-Website-1080p.mp4','/assets/originmind-mark-184.webp','/site.css?v=20260910-polish','/site.js?v=20260910-polish','/developer-docs.css?v=20261010','/developer-docs.js?v=20261010','/assets/videos/originmind-home-film.mp4','/assets/videos/open-frame-lab.mp4','/assets/videos/dual-arm-digital-twin.mp4','/assets/videos/wheel-legged-demo.mp4'])await check('Asset '+path,async()=>{
 const r=await request(base+path,{Range:'bytes=0-1023'});assert.ok([200,206].includes(r.status));
 const type=r.headers.get('Content-Type')||'';assert.doesNotMatch(type,/text\/html/);
 assert.match(type,path.includes('.css')?/text\/css/:path.includes('.js')?/javascript/:path.includes('.mp4')?/video\/mp4/:/image\/webp/);
 const reader=r.body.getReader();let bytes=0;
 try{while(bytes<=100){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;}}finally{await reader.cancel();}
 assert.ok(bytes>100,'asset response must contain actual content');
});
for(const path of ['/meeting','/api/meeting/login','/founding-oem.js'])await check('Removed '+path,async()=>{
 const r=await request(base+path);assert.equal(r.status,404);await r.body?.cancel();
});
await check('API remains inaccessible to public reads',async()=>{
 const r=await request(base+'/api/visits');assert.equal(r.status,405);assert.doesNotMatch(await r.text(),/visits|countries|last24Hours/);
});
for(const host of ['www.omindos.ai','originmindos.com','www.originmindos.com'])await check('Host '+host,async()=>{
 const r=await request('https://'+host+'/');assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).hostname,'omindos.ai');await r.body?.cancel();
});

