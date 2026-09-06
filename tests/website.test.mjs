import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../apps/website/', import.meta.url);
const source = await readFile(new URL('_worker.js', root), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { ASSETS: { async fetch(request) {
  const path = new URL(request.url).pathname;
  for (const file of [path, path.endsWith('/') ? `${path}index.html` : `${path}.html`]) {
    try { const body = await readFile(new URL(`.${file}`, root)); return new Response(body, {headers:{'Content-Type':file.endsWith('.html')?'text/html':'application/octet-stream'}}); } catch {}
  }
  return new Response('not found', {status:404});
}}};
for (const [lang, contentLanguage] of [['zh','zh-CN'],['en','en'],['ja','ja-JP']]) {
  for (const path of ['/', '/founding-oem', '/why-originmind']) {
    test(`${lang}: same-address route ${path}`, async () => {
      const url = `https://omindos.ai${path}`;
      const response = await worker.fetch(new Request(url, {headers:{Cookie:`originmind_language=${lang}`}}),env);
      assert.equal(response.status,200); assert.equal(response.headers.get('Content-Language'),contentLanguage);
      assert.equal(response.headers.get('Location'),null); assert.match(response.headers.get('Cache-Control'),/private/);
      assert.match(await response.text(), /<html/);
      const choose = await worker.fetch(new Request(`${url}?lang=${lang}`),env);
      assert.equal(choose.status,302); assert.equal(choose.headers.get('Location'),url);
      assert.match(choose.headers.get('Set-Cookie'),new RegExp(`originmind_language=${lang};`));
    });
  }
}
test('removed meeting pages and APIs return 404 without credentials',async()=>{
  for(const path of ['/meeting','/meeting/','/meeting/display','/meeting/index.page','/api/meeting/login','/api/meeting/realtime-secret','/api/meeting/rooms','/api/meetings']) {
    const r=await worker.fetch(new Request(`https://omindos.ai${path}`),env);assert.equal(r.status,404,path);
  }
  assert.doesNotMatch(source,/MEETING_|OPENAI|api\.openai|CLOUDFLARE_TURN/);
  await assert.rejects(access(new URL('meeting',root)));
});
test('original legacy-host redirects remain',async()=>{
  for(const host of ['originmindos.com','www.originmindos.com','www.omindos.ai','originmindos.cn','jp.originmindos.com']) {
    const r=await worker.fetch(new Request(`https://${host}/`),env); assert.equal(r.status,308);assert.equal(new URL(r.headers.get('Location')).hostname,'omindos.ai');
  }
});
test('visitor statistics binding remains optional and errors are controlled',async()=>{
  const r=await worker.fetch(new Request('https://omindos.ai/api/visits'),env);assert.equal(r.status,503);assert.equal((await r.json()).enabled,false);
  const method=await worker.fetch(new Request('https://omindos.ai/api/visits',{method:'DELETE'}),env);assert.equal(method.status,405);
  const forbidden=await worker.fetch(new Request('https://omindos.ai/api/visits',{method:'POST',headers:{Origin:'https://other.example'}}),{...env,VISITS_DB:{}});assert.equal(forbidden.status,403);
});
test('brochure download remains available',async()=>{
  const r=await worker.fetch(new Request('https://omindos.ai/assets/brochures/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_EN.pdf'),env);
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.match(r.headers.get('Content-Disposition'),/attachment/);
});
