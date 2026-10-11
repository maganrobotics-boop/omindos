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
 assert.ok(html.includes('href="/chat/"'));assert.ok(html.includes('src="/chat/assets/app.js"'));assert.ok(html.includes('href="/chat/learning"'));
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
 const s=await handle(new Request('https://omindos.cn/chat//evil.example/'),upstream);
 assert.ok(seen.url.startsWith('https://chat.omindos.cn/'));await s.body.cancel();
 assert.equal(publicUrl('https://chat.omindos.cn/learning?x=1'),'https://omindos.cn/chat/learning?x=1');
 assert.equal(publicUrl('https://oa.omindos.cn/'),'https://oa.omindos.cn/');
});
test('streaming chat data is passed through without buffering or rewriting',async()=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: /api/untouched\n\n'));controller.close();}});
 const r=await handle(new Request('https://omindos.cn/chat/api/chat',{method:'POST',headers:{origin:'https://omindos.cn'},body:'{}'}),async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}}));
 assert.equal(await r.text(),'data: /api/untouched\n\n');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('sandbox CSP moves its exact script and runtime paths without broadening permissions',async()=>{
 const policy="default-src 'none'; script-src https://chat.omindos.cn/learning/runner.js https://chat.omindos.cn/learning/runtime/ blob: 'wasm-unsafe-eval'; connect-src https://chat.omindos.cn/learning/runtime/; frame-ancestors 'self'; sandbox allow-scripts";
 const r=await handle(new Request('https://omindos.cn/chat/learning/runner.html'),async()=>new Response('<script src="/learning/runner.js"></script>',{headers:{'Content-Type':'text/html','Content-Security-Policy':policy}}));
 assert.equal(r.headers.get('content-security-policy'),policy.replaceAll('https://chat.omindos.cn','https://omindos.cn/chat'));
 assert.ok((await r.text()).includes('src="/chat/learning/runner.js"'));
});
