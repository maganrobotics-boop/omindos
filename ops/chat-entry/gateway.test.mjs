import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,rewriteStatic,upstreamHeaders,scopedCookie,publicUrl} from './gateway.mjs';

test('static application URLs stay in /chat without changing external links or code separators',()=>{
 const js="fetch('/api/status');fetch(`/api/shares/${id}`);const separator='/';new URL('/',origin);const home={href:'/'};const contact='https://oa.omindos.cn/';";
 const result=rewriteStatic(js,'application/javascript','/assets/app.js');
 assert.match(result,/fetch\('\/chat\/api\/status'\)/);
 assert.ok(result.includes('`/chat/api/shares/${id}`'));
 assert.ok(result.includes("separator='/'"));assert.ok(result.includes("new URL('/chat/',origin)"));
 assert.ok(result.includes("href:'/chat/'"));assert.ok(result.includes('https://oa.omindos.cn/'));
 const html=rewriteStatic('<a href="/">首页</a><script src="/assets/app.js"></script><a href="/learning">课程</a>','text/html','/');
 assert.ok(html.includes('href="/chat/"'));assert.ok(html.includes('src="/chat/assets/app.js"'));assert.ok(html.includes('href="/learning"'));
});
test('PWA scope and cookies do not cover unrelated website routes',()=>{
 const m=JSON.parse(rewriteStatic('{"id":"/","start_url":"/","scope":"/","icons":[{"src":"/assets/pwa/icon.png"}]}','application/manifest+json','/manifest.webmanifest'));
 assert.equal(m.scope,'/chat/');assert.equal(m.start_url,'/chat/');assert.equal(m.icons[0].src,'/chat/assets/pwa/icon.png');
 assert.equal(scopedCookie('session=x; Path=/; HttpOnly; Secure; SameSite=Lax'),'session=x; Path=/chat/; HttpOnly; Secure; SameSite=Lax');
 assert.equal(scopedCookie('__Host-session=x; Path=/; Secure; HttpOnly'),'__Host-session=x; Path=/; Secure; HttpOnly');
});
test('same-origin protection remains enforced and untrusted identity headers are dropped',async()=>{
 for(const origin of ['https://evil.example','null','']){
  const response=await handle(new Request('https://omindos.cn/chat/api/visitor/logout',{method:'POST',headers:origin?{origin}:{}}),()=>{throw new Error('must not forward');});
  assert.equal(response.status,403);
 }
 const h=upstreamHeaders(new Headers({origin:'https://omindos.cn','cf-connecting-ip':'spoof','oai-authenticated-user-email':'spoof','x-omindos-client-ip':'spoof'}),'1.2.3.4');
 assert.equal(h.get('origin'),'https://chat.omindos.cn');assert.equal(h.get('cf-connecting-ip'),null);assert.equal(h.get('oai-authenticated-user-email'),null);assert.equal(h.get('x-omindos-client-ip'),'1.2.3.4');
});
test('upstream target is fixed; redirects, multiple cookies and dynamic payloads survive',async()=>{
 let seen;
 const upstream=async(url,init)=>{seen={url:String(url),init};return new Response('{"answer":"/api/private https://chat.omindos.cn"}',{headers:{'Content-Type':'application/json','Set-Cookie':'session=x; Path=/; Secure; HttpOnly'}});};
 const r=await handle(new Request('https://omindos.cn/chat/api/status?source=qa'),upstream);
 assert.equal(seen.url,'https://chat.omindos.cn/api/status?source=qa');
 assert.equal(await r.text(),'{"answer":"/api/private https://chat.omindos.cn"}');
 assert.equal(r.headers.getSetCookie()[0],'session=x; Path=/chat/; Secure; HttpOnly');
 assert.equal(r.headers.getSetCookie()[1],'session=x; Path=/learning; Secure; HttpOnly');
 const s=await handle(new Request('https://omindos.cn/chat//evil.example/'),upstream);
 assert.ok(seen.url.startsWith('https://chat.omindos.cn/'));await s.body.cancel();
 assert.equal(publicUrl('https://chat.omindos.cn/learning?x=1'),'https://omindos.cn/learning?x=1');
 assert.equal(publicUrl('https://oa.omindos.cn/'),'https://oa.omindos.cn/');
});
test('streaming chat data is passed through without buffering or rewriting',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: /api/untouched\n\n'));controller.close();}});
 const r=await handle(new Request('https://omindos.cn/chat/api/chat',{method:'POST',headers:{origin:'https://omindos.cn'},body:'{}'}),async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
 assert.equal(await r.text(),'data: /api/untouched\n\n');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('sandbox CSP moves its exact script and runtime paths without broadening permissions',async()=>{
 const policy="default-src 'none'; script-src https://chat.omindos.cn/learning/runner.js https://chat.omindos.cn/learning/runtime/ blob: 'wasm-unsafe-eval'; connect-src https://chat.omindos.cn/learning/runtime/; frame-ancestors 'self'; sandbox allow-scripts";
 const r=await handle(new Request('https://omindos.cn/learning/runner.html'),async()=>new Response('<script src="/learning/runner.js"></script>',{headers:{'Content-Type':'text/html','Content-Security-Policy':policy}}));
 assert.equal(r.headers.get('content-security-policy'),policy.replaceAll('https://chat.omindos.cn','https://omindos.cn'));
 assert.ok((await r.text()).includes('src="/learning/runner.js"'));
});
test('learning is served directly and former nested URLs redirect without losing parameters',async()=>{
 let seen;
 const upstream=async(url,init)=>{seen={url:String(url),init};return new Response('<script src="/learning/app.js"></script><img src="/learning-media/example.svg">',{headers:{'Content-Type':'text/html'}});};
 for(const path of ['/learning','/learning/','/learning/admin?tab=projects']){
  const r=await handle(new Request('https://omindos.cn'+path,{headers:{referer:'https://omindos.cn/learning'}}),upstream);
  assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);assert.equal(seen.url,'https://chat.omindos.cn'+path);
  assert.equal(seen.init.headers.get('referer'),'https://chat.omindos.cn/learning');
  const html=await r.text();assert.ok(html.includes('src="/learning/app.js"'));assert.ok(html.includes('src="/chat/learning-media/example.svg"'));
  const old=await handle(new Request('https://omindos.cn/chat'+path),()=>{throw new Error('no upstream for alias');});
  assert.equal(old.status,302);assert.equal(old.headers.get('location'),path);
 }
 assert.equal((await handle(new Request('https://omindos.cn/learning-other'))).status,404);
});
test('logging out clears all application cookie scopes with the original security flags',async()=>{
 const r=await handle(new Request('https://omindos.cn/chat/api/visitor/logout',{method:'POST',headers:{origin:'https://omindos.cn'}}),async()=>new Response(null,{headers:{'Set-Cookie':'session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax'}}));
 assert.deepEqual(r.headers.getSetCookie(),['session=; Path=/chat/; Max-Age=0; Secure; HttpOnly; SameSite=Lax','session=; Path=/learning; Max-Age=0; Secure; HttpOnly; SameSite=Lax','session=; Path=/arena; Max-Age=0; Secure; HttpOnly; SameSite=Lax']);
 assert.equal(scopedCookie('course=x; Path=/learning; Secure'),'course=x; Path=/learning; Secure');
});
test('arena pages and API URLs stay independent, including admin, replay and map parameters',async()=>{
 let seen;
 const upstream=async(url,init)=>{seen={url:String(url),init};return new Response('<script src="/arena/app.js"></script><a href="https://chat.omindos.cn/arena/admin">管理</a>',{headers:{'Content-Type':'text/html'}});};
 for(const path of ['/arena/','/arena/admin','/arena/team.html?map=example','/arena/api/replay?id=12']){
  const r=await handle(new Request('https://omindos.cn'+path,{headers:{referer:'https://omindos.cn/arena/'}}),upstream);
  assert.equal(r.status,200);assert.equal(seen.url,'https://chat.omindos.cn'+path);
  assert.equal(seen.init.headers.get('referer'),'https://chat.omindos.cn/arena/');
  assert.equal(r.headers.get('x-omindos-entry'),'arena');
  if(!path.startsWith('/arena/api/'))assert.ok((await r.text()).includes('src="/arena/app.js"'));
  else await r.body.cancel();
  const old=await handle(new Request('https://omindos.cn/chat'+path),()=>{throw new Error('no upstream for alias');});
  assert.equal(old.status,302);assert.equal(old.headers.get('location'),path);
 }
 assert.equal(publicUrl('https://chat.omindos.cn/arena/admin'),'https://omindos.cn/arena/admin');
 assert.equal((await handle(new Request('https://omindos.cn/arena-other'))).status,404);
 const js=rewriteStatic("fetch('/arena/api/leaderboard');fetch('/api/visitor/status');location.href='/arena/admin';",'application/javascript','/arena/app.js');
 assert.ok(js.includes("fetch('/arena/api/leaderboard')"));assert.ok(js.includes("fetch('/chat/api/visitor/status')"));
});
test('arena writes retain method, body and session, reject other origins and preserve API payloads',async()=>{
 for(const origin of ['https://evil.example','null','']){
  const denied=await handle(new Request('https://omindos.cn/arena/api/evaluate',{method:'POST',headers:origin?{origin}:{},body:'{}'}),()=>{throw new Error('must not forward');});
  assert.equal(denied.status,403);
 }
 for(const prefix of ['', '/chat']){
  const r=await handle(new Request('https://omindos.cn'+prefix+'/arena/api/evaluate',{method:'POST',headers:{origin:'https://omindos.cn',cookie:'__Host-om-chat-session=test','content-type':'application/json'},body:'{"policy":"/arena/example"}'}),async(url,init)=>{
   assert.equal(String(url),'https://chat.omindos.cn/arena/api/evaluate');assert.equal(init.method,'POST');
   assert.equal(init.headers.get('cookie'),'__Host-om-chat-session=test');
   assert.equal(await new Response(init.body).text(),'{"policy":"/arena/example"}');
   return Response.json({url:'/arena/raw'});
  });
  assert.equal(await r.text(),'{"url":"/arena/raw"}');assert.equal(r.headers.get('cache-control'),'no-store');
 }
 assert.equal(scopedCookie('arena=x; Path=/arena; Secure; HttpOnly'),'arena=x; Path=/arena; Secure; HttpOnly');
});
