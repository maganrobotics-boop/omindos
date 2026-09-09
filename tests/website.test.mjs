import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
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
  for (const path of ['/founding-oem', '/why-originmind', '/robot-products']) {
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
test('robot product aliases and language controls stay on the product page', async () => {
  const sharedScript = await readFile(new URL('script.js', root), 'utf8');
  for (const lang of ['zh', 'en', 'ja']) {
    const alias = await worker.fetch(new Request(`https://omindos.ai/robots/${lang}/index.html`), env);
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('Location'), `https://omindos.ai/robot-products?lang=${lang}`);
    const page = await readFile(new URL(`robots/${lang}/index.html`, root), 'utf8');
    const links = [...page.matchAll(/<a\b[^>]*data-language="(en|zh|ja)"[^>]*>/g)].map(match => {
      const attrs = new Map([['href', match[0].match(/href="([^"]+)"/)[1]]]);
      return { dataset: { language: match[1] }, attrs, classList: { toggle() {} },
        setAttribute(key, value) { attrs.set(key, value); }, removeAttribute(key) { attrs.delete(key); },
        set href(value) { attrs.set('href', value); } };
    });
    let update;
    runInNewContext(sharedScript.replace(/\}\)\(\);\s*$/, 'expose(updateLanguageLinks);})();'), {
      URL, URLSearchParams,
      document: { documentElement: { lang }, readyState: 'loading', addEventListener() {},
        body: { classList: { contains: value => value === 'robot-products-page' } },
        querySelector: () => null, querySelectorAll: () => links },
      window: { location: new URL('https://omindos.ai/robot-products#quote') },
      expose: value => { update = value; },
    });
    update();
    assert.equal(links.length, 6);
    for (const link of links) {
      assert.equal(link.attrs.get('href'), `https://omindos.ai/robot-products?lang=${link.dataset.language}#quote`);
      assert.equal(link.attrs.get('aria-current'), link.dataset.language === lang ? 'page' : undefined);
    }
    const quote = new URL(page.match(/href="(mailto:[^"]+\?subject=[^"]+)"/)[1].replaceAll('&amp;', '&'));
    assert.equal(quote.pathname, 'sales@omindos.ai');
    assert.ok(quote.searchParams.get('body').includes('\n\n'));
  }
});

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
test('each product page downloads its matching PDF without changing the page address',async()=>{
  for (const lang of ['zh', 'en', 'ja']) {
    const filename = `OriginMind_Intelligent_Mobile_Robot_Product_Brochure_${lang.toUpperCase()}.pdf`;
    const home = await worker.fetch(new Request('https://omindos.ai/robot-products', {headers:{Cookie:`originmind_language=${lang}`}}),env);
    assert.equal(home.headers.get('Location'),null);
    const html=await home.text();
    assert.ok(html.includes(`download="${filename}"`));
    const r=await worker.fetch(new Request(`https://omindos.ai/assets/brochures/${filename}`),env);
    assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');
    assert.equal(r.headers.get('Content-Disposition'),`attachment; filename="${filename}"`);
    assert.equal(new TextDecoder().decode((await r.arrayBuffer()).slice(0,5)),'%PDF-');
  }
});

async function oemFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/website/0002_oem_applications.sql', import.meta.url), 'utf8'));
  function prepare(query, params = []) { return { bind(...values) { return prepare(query, values); }, async first() { return db.prepare(query).get(...params) || null; }, async run() { return db.prepare(query).run(...params); } }; }
  const bound = { ...env, VISITS_DB: { prepare } };
  const payload = { submissionKey: crypto.randomUUID(), language: 'zh', company: 'Example Robotics', contact: 'Test contact', email: 'test@example.com', phone: '', robot: 'Test robot', stack: 'ROS 2', start: '2027', quantity: '', capabilities: 'Navigation', test_unit: 'Available', track: 'foundation', summary: '', consent: true };
  const send = (body = payload, headers = {}, method = 'POST') => worker.fetch(new Request('https://omindos.ai/api/oem-applications', { method, headers: { Origin: 'https://omindos.ai', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), bound);
  return { db, payload, send };
}
test('OEM applications validate input and never expose stored details publicly', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    assert.equal((await send(payload, {}, 'GET')).status, 405);
    assert.equal((await send(payload, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await send(payload, { 'Content-Type': 'text/plain' })).status, 415);
    for (const change of [{ consent: false }, { email: 'a@b\nBcc:bad@example.com' }, { company: '' }, { track: 'invalid' }, { language: 'de' }, { capabilities: 'x'.repeat(3001) }, { website: 'bot' }, { submissionKey: 'bad' }]) assert.equal((await send({ ...payload, ...change })).status, 400, JSON.stringify(change).slice(0, 100));
    assert.equal((await send({ ...payload, summary: 'x'.repeat(40000) })).status, 413);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 0);
  } finally { db.close(); }
});
test('OEM retries, simultaneous retries and changed content preserve one correct receipt', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    const results = await Promise.all([send(), send(), send()]);
    assert.ok(results.every((r) => [200, 201].includes(r.status)));
    const receipts = await Promise.all(results.map((r) => r.json()));
    assert.match(receipts[0].receipt, /^OEM-[0-9a-f-]{36}$/);
    assert.deepEqual(receipts[0], receipts[1]); assert.deepEqual(receipts[1], receipts[2]);
    assert.deepEqual(Object.keys(receipts[0]), ['receipt']);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 1);
    assert.equal((await send({ ...payload, company: 'Changed company' })).status, 409);
    assert.equal(JSON.parse(db.prepare('SELECT payload_json FROM oem_applications').get().payload_json).company, 'Example Robotics');
  } finally { db.close(); }
});
test('OEM limits repeated new submissions while allowing safe retries', async () => {
  const { db, payload, send } = await oemFixture();
  try {
    assert.equal((await send()).status, 201);
    const responses = await Promise.all(Array.from({ length: 11 }, () => send({ ...payload, submissionKey: crypto.randomUUID() })));
    assert.equal(responses.filter((r) => r.status === 201).length, 9);
    assert.equal(responses.filter((r) => r.status === 429).length, 2);
    assert.equal((await send()).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM oem_applications').get().n, 10);
  } finally { db.close(); }
});

const homepageRoot = new URL('../apps/website/', import.meta.url);
const enhancement = await readFile(new URL('homepage-v1511.js', homepageRoot), 'utf8');

const portalRoutes = ['', 'robots', 'robots/wheel-legged', 'robots/quadruped',
  'robots/articulated', 'robots/open-frame', 'robots/wheeled', 'omindos',
  'integration', 'field-work', 'field-work/mining', 'field-work/warehouse',
  'mobility', 'about', 'contact'];

test('quadruped availability agrees across both homepages, catalogues and product pages', async () => {
  for (const [locale, development, sale] of [['cn', '在研', '在售'], ['en', 'IN DEVELOPMENT', 'FOR SALE']]) {
    for (const route of ['', 'robots']) {
      const page = await readFile(new URL(`${locale}/${route ? route + '/' : ''}index.html`, root), 'utf8');
      const cards = [...page.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
        .map(match => match[0]).filter(card => /class="(?:sale-image|product-picture)"/.test(card));
      assert.equal(cards.length, 5);
      for (const card of cards) {
        const isQuadruped = card.includes(`/${locale}/robots/quadruped`);
        assert.match(card, new RegExp(`>${isQuadruped ? development : sale}<`, 'i'));
        const destination = card.match(/href="(\/(?:cn|en)\/robots\/[^"#]+)"/)[1];
        const actions = [...card.matchAll(/<a class="text-link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
        assert.deepEqual(actions.map(([, href]) => href), [destination, `/${locale}/contact`]);
        assert.deepEqual(actions.map(([, , label]) => label), locale === 'cn' ? ['产品详情', '联系我们'] : ['Details', 'Contact us']);
        if (isQuadruped) {
          assert.doesNotMatch(card, />(?:在售|for sale)<|咨询报价|Request a quote|咨询产品演示|Request a demonstration/i);
        }
      }
    }
    const page = await readFile(new URL(`${locale}/robots/quadruped/index.html`, root), 'utf8');
    assert.match(page, new RegExp(`>${development}<`, 'i'));
    assert.doesNotMatch(page, />(?:在售|for sale)<|咨询报价|Request a quote|咨询产品演示|Request a demonstration/i);
    assert.match(page, /id="specifications"/);
    assert.match(page, /id="videos"/);
    const enquiryLinks = [...page.matchAll(/href="(mailto:[^"]+\?subject=[^"]+)"/g)];
    assert.equal(enquiryLinks.length, 3);
    for (const [, href] of enquiryLinks) {
      const subject = new URL(href.replaceAll('&amp;', '&')).searchParams.get('subject');
      assert.match(subject, /研发进展|应用需求|development|application/);
      assert.doesNotMatch(subject, /报价|quotation|demonstration/);
    }
  }
});

test('product details are readable inline and keep model-specific specifications separate', async () => {
  for (const locale of ['cn', 'en']) {
    for (const model of ['wheel-legged', 'quadruped', 'articulated', 'open-frame', 'wheeled']) {
      const html = await readFile(new URL(`${locale}/robots/${model}/index.html`, root), 'utf8');
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
      assert.doesNotMatch(main, /href="[^"]+\.(?:pdf|docx|zip)"/i);
      for (const anchor of main.matchAll(/href="#([^"]+)"/g)) {
        assert.ok(main.includes(`id="${anchor[1]}"`), `${model}: ${anchor[1]}`);
      }
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      assert.equal(ids.length, new Set(ids).size);
      if (model === 'quadruped') {
        assert.doesNotMatch(main, /Go2|15\s*kg|700\s*[×x]\s*310|760\s*[×x]\s*310|10\s*km|7\.5万元/i);
        assert.match(main, locale === 'cn' ? /整机集成与场景验证/ : /full-system integration and application validation/);
      }
      if (model === 'wheeled') {
        assert.match(main, /730 × 460 × 860 mm/);
        assert.match(main, /1\.5 m\/s/);
        assert.match(main, /10 kg/);
      }
    }
  }
});

test('uploaded product demonstrations use accessible players and fast-start MP4 assets', async () => {
  const demos = {
    'wheel-legged': ['wheel-legged-demo', 'wheel-legged-exploded', 'wheel-legged-leg-exploded'],
    'open-frame': ['open-frame-field-demo'],
    'articulated': ['articulated-gait-demo', 'spider-mechanism-demo'],
    'wheeled': ['mobile-inspection-demo'],
  };
  for (const [model, names] of Object.entries(demos)) {
    for (const locale of ['cn', 'en']) {
      const html = await readFile(new URL(`${locale}/robots/${model}/index.html`, root), 'utf8');
      for (const name of names) {
        const player = [...html.matchAll(/<video\b[\s\S]*?<\/video>/g)].map(m => m[0])
          .find(video => video.includes(`/assets/videos/${name}.mp4`));
        assert.ok(player, `${locale} ${model} ${name}`);
        assert.match(player, /controls playsinline preload="none"/);
        assert.match(player, /aria-label="[^"]+"/);
        assert.doesNotMatch(player, /\bautoplay\b/);
        assert.ok(player.includes(`poster="/assets/${name}-poster.jpg"`));
      }
    }
    for (const name of names) {
      const file = await readFile(new URL(`assets/videos/${name}.mp4`, root));
      assert.equal(file.toString('ascii', 4, 8), 'ftyp');
      assert.ok(file.length < 25 * 1024 * 1024, 'within the hosting asset size limit');
      let offset = 0;
      const atoms = [];
      while (offset + 8 <= file.length) {
        const size = file.readUInt32BE(offset);
        atoms.push(file.toString('ascii', offset + 4, offset + 8));
        assert.ok(size >= 8 && offset + size <= file.length);
        offset += size;
      }
      assert.equal(offset, file.length);
      assert.ok(atoms.includes('moov') && atoms.includes('mdat'));
      assert.ok(atoms.indexOf('moov') < atoms.indexOf('mdat'), 'metadata precedes the video payload');
    }
  }
});

test('automatic portal entry follows preferred browser language and preserves query strings', async () => {
  for (const [accept, locale] of [['zh-CN,zh;q=0.9,en;q=0.8', 'cn'], ['zh-TW,en;q=0.8', 'cn'],
    ['en-US,zh;q=0.7', 'en'], ['ja,en;q=0.8', 'en'], ['', 'en'], ['en;q=0.5,zh;q=1', 'cn']]) {
    for (const route of ['', 'robots/open-frame', 'field-work/mining']) {
      const r = await worker.fetch(new Request(`https://omindos.ai/${route}?source=link`, {
        headers: { 'Accept-Language': accept, Cookie: `originmind_language=${locale === 'cn' ? 'en' : 'zh'}` },
      }), env);
      assert.equal(r.status, 302);
      assert.equal(r.headers.get('Location'), `https://omindos.ai/${locale}/${route ? route + '/' : ''}?source=link`);
      assert.match(r.headers.get('Cache-Control'), /private, no-store/);
      assert.equal(r.headers.get('Vary'), 'Accept-Language');
    }
  }
});

test('all 30 explicit bilingual pages ignore browser, cookie and query language preferences', async () => {
  for (const locale of ['cn', 'en']) {
    for (const route of portalRoutes) {
      const path = `/${locale}/${route ? route + '/' : ''}`;
      const r = await worker.fetch(new Request(`https://omindos.ai${path}?lang=${locale === 'cn' ? 'en' : 'zh'}`, {
        headers: { 'Accept-Language': locale === 'cn' ? 'en' : 'zh-CN', Cookie: `originmind_language=${locale === 'cn' ? 'en' : 'zh'}` },
      }), env);
      assert.equal(r.status, 200, path);
      assert.equal(r.headers.get('Location'), null, path);
      assert.equal(r.headers.get('Content-Language'), locale === 'cn' ? 'zh-CN' : 'en');
      const html = await r.text();
      assert.ok(html.includes(`rel="canonical" href="https://omindos.ai${path}"`), path);
      assert.ok(html.includes('name="robots" content="index,follow"'), path);
      assert.doesNotMatch(html, /data-language=|class="language-switch|mujin|framerusercontent/i);
      for (const match of html.matchAll(/(?:src|poster|href|data-video-src|data-src)="(\/[^"#]*)"/g)) {
        const target = new URL(match[1].replaceAll('&amp;', '&'), 'https://omindos.ai').pathname;
        if (target === '/founding-oem') continue;
        const asset = /\.[a-z0-9]+$/i.test(target) ? target : target.replace(/\/$/, '') + '/index.html';
        await access(new URL('.' + asset, root));
      }
    }
    const integration = await readFile(new URL(`${locale}/integration/index.html`, root), 'utf8');
    assert.ok(integration.includes(`/founding-oem?lang=${locale === 'cn' ? 'zh' : 'en'}`));
    const head = await worker.fetch(new Request(`https://omindos.ai/${locale}/`, { method: 'HEAD' }), env);
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const short = await worker.fetch(new Request(`https://omindos.ai/${locale}`), env);
    assert.equal(short.status, 308); assert.equal(short.headers.get('Location'), `https://omindos.ai/${locale}/`);
    const missing = await worker.fetch(new Request(`https://omindos.ai/${locale}/does-not-exist/`), env);
    assert.equal(missing.status, 404); assert.match(missing.headers.get('X-Robots-Tag'), /noindex/);
    assert.equal(missing.headers.get('Content-Language'), locale === 'cn' ? 'zh-CN' : 'en');
  }
});

test('explicit old homepage links and the Japanese homepage remain reachable', async () => {
  for (const [legacy, destination] of [['zh', 'cn'], ['en', 'en'], ['ja', 'ja']]) {
    const r = await worker.fetch(new Request(`https://omindos.ai/?lang=${legacy}&source=old`), env);
    assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), `https://omindos.ai/${destination}/?source=old`);
    const alias = await worker.fetch(new Request(`https://omindos.ai/index.${legacy}.html`), env);
    assert.equal(alias.status, 308); assert.equal(alias.headers.get('Location'), `https://omindos.ai/${destination}/`);
  }
  const japanese = await worker.fetch(new Request('https://omindos.ai/ja/'), env);
  assert.equal(japanese.status, 200); assert.equal(japanese.headers.get('Content-Language'), 'ja-JP');
  const policy = await readFile(new URL('robots.txt', root), 'utf8');
  assert.match(policy, /User-agent: \*\nAllow: \//);
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
  assert.ok(sitemap.includes('https://omindos.ai/cn/robots/wheeled/'));
  assert.ok(sitemap.includes('https://omindos.ai/en/robots/wheeled/'));
});

test('V1.5.17 keeps collapsed videos and product links while removing the final contact block', async () => {
  for (const lang of ['en', 'zh', 'ja']) {
    const source = await readFile(new URL(`index.${lang}.html`, homepageRoot), 'utf8');
    const sections = [...source.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(sections.slice(0, 6), ['what', 'tasks', 'production', 'why', 'products', 'company']);
    // Two capability pairs lead to warehouse, then mine task examples.
    // Every video starts collapsed; legacy demo anchors remain reachable.
    const groups = [...source.matchAll(/<details\b([^>]*\bid="demo-[^"]+"[^>]*)>([\s\S]*?)<\/details>/g)];
    assert.equal(groups.length, 4);
    const expected = [
      ['demo-navigation', ['1000087152', '1000087155']],
      ['demo-language', ['1000087157', '1000087156']],
      ['demo-pharma', ['1000087160']],
      ['demo-mine', ['1000087153']],
    ];
    for (const [index, [, attrs, contents]] of groups.entries()) {
      const [id, videos] = expected[index];
      assert.ok(attrs.includes(`id="${id}"`));
      assert.doesNotMatch(attrs, /\bopen(?:\s|=|$)/);
      assert.match(contents, /<summary>/);
      assert.deepEqual([...contents.matchAll(/<source src="\/assets\/videos\/(\d+)-web\.mp4"/g)].map(match => match[1]), videos);
    }
    const mobility = source.match(/<section\b[^>]*id="tasks"[^>]*>([\s\S]*?)<\/section>/)[1];
    const field = source.match(/<section\b[^>]*id="production"[^>]*>([\s\S]*?)<\/section>/)[1];
    assert.equal([...mobility.matchAll(/<article\b/g)].length, 2);
    assert.equal([...mobility.matchAll(/<video\b/g)].length, 4);
    assert.equal([...field.matchAll(/<video\b/g)].length, 2);
    const productPage = await readFile(new URL(`robots/${lang}/index.html`, homepageRoot), 'utf8');
    const documents = productPage.match(/<details\b([^>]*\bid="product-docs"[^>]*)>([\s\S]*?)<\/details>/);
    assert.ok(documents, 'product documents belong on the dedicated product page');
    assert.doesNotMatch(documents[1], /\bopen(?:\s|=|$)/);
    assert.match(documents[2], /<summary>/);
    assert.ok(documents[2].includes(`download="OriginMind_Intelligent_Mobile_Robot_Product_Brochure_${lang.toUpperCase()}.pdf"`));
    assert.ok(mobility.indexOf('id="product-docs"') > mobility.lastIndexOf('</video>'));
    assert.ok(mobility.includes(`href="/robot-products?lang=${lang}"`));
    assert.doesNotMatch(source, /assets\/brochures\//);
    assert.doesNotMatch(field, /v1513-task-bridge|class="v1511-note"/);
    const hero = source.match(/<section\b[^>]*id="what"[^>]*>([\s\S]*?)<\/section>/)[1];
    assert.doesNotMatch(hero, /class="v15-actions"/);
    for (const id of ['capabilities', 'demo-field', 'demo-mine', 'demo-pharma']) assert.ok(source.includes(`id="${id}"`));
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, 'deep links need unique targets');
    for (const id of ['ai-os', 'inspection']) {
      const card = source.match(new RegExp(`<article\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/article>`))[1];
      const mail = card.match(/href="(mailto:[^"]+)"/)[1].replaceAll('&amp;', '&');
      const draft = new URL(mail);
      assert.equal(draft.pathname, 'sales@omindos.ai');
      assert.ok(draft.searchParams.get('subject'));
      assert.ok(draft.searchParams.get('body').includes('\n'));
      const detail = await readFile(new URL(`why/${lang}/index.html`, homepageRoot), 'utf8');
      assert.ok(detail.includes(`href="/?lang=${lang}#${id}"`), 'both audiences can return to their homepage entry');
    }
    assert.match(source, /data-nav="production" href="#production"/);
    assert.doesNotMatch(source, /v1511-final|id="contact"|chat\.omindos\.ai\/widget/);
    assert.match(source, /data-nav="products" href="#products"/);
    assert.match(source, /data-visitor-map hidden aria-hidden="true" style="display: none;"/);
    assert.match(source, /data-sales-email data-sales-email-text/);
    assert.match(source, /originmind-mark-92\.webp/);
    assert.doesNotMatch(source, /homepage-v159|\/meeting(?:["/?#])/);
    const videos = [...source.matchAll(/<video\b([^>]*)>/g)];
    assert.equal(videos.length, 6);
    for (const [, attrs] of videos) {
      assert.match(attrs, /preload="none"/);
      assert.match(attrs, /poster="[^" ]+"/);
      assert.match(attrs, /\bcontrols\b/);
      assert.doesNotMatch(attrs, /\bautoplay\b/);
    }
  }
  assert.equal(await readFile(new URL('index.html', homepageRoot), 'utf8'), await readFile(new URL('index.en.html', homepageRoot), 'utf8'));
});

test('every updated page loads its own styles and keeps the current shared script', async () => {
  for (const page of ['index.html', 'index.en.html', 'index.zh.html', 'index.ja.html', ...['en', 'zh', 'ja'].flatMap(lang => [`why/${lang}/index.html`, `oem/${lang}/index.html`, `robots/${lang}/index.html`])]) {
    const source = await readFile(new URL(page, homepageRoot), 'utf8');
    if (!page.startsWith('oem/')) {
      assert.match(source, /homepage-v1511\.css/);
      assert.match(source, /homepage-v1511\.js/);
    }
    assert.match(source, /script\.js\?v=202609(?:07-contact|08-products)/);
    for (const match of source.matchAll(/<link\b[^>]*>/g)) {
      if (!/rel="stylesheet"/.test(match[0])) continue;
      const href = match[0].match(/href="([^"]+)"/)[1].split('?')[0];
      await readFile(new URL(href.startsWith('/') ? href.slice(1) : href, homepageRoot));
    }
  }
});

// A minimal DOM boundary for the dependency-free script. The calls below test
// observable behavior, including fresh elements after the real loader's body swap.
function fixture({ hash = '', clipboard, fallback = false } = {}) {
  const handlers = new Map(), windowHandlers = new Map(), ids = new Map();
  const videos = [], fields = [];
  let observer;
  class Element {
    constructor() { this.parentElement = null; this.dataset = {}; }
    closest(selector) { return this.matches?.[selector] || null; }
  }
  class Details extends Element {
    constructor() { super(); this.open = false; this.videos = []; }
    querySelectorAll() { return this.videos; }
  }
  class Video extends Element {
    constructor() { super(); this.paused = false; this.pauseCalls = 0; }
    pause() { this.paused = true; this.pauseCalls++; }
  }
  const status = { textContent: '' };
  const document = {
    body: { append(field) { fields.push(field); } },
    getElementById: id => ids.get(id),
    querySelector: () => status,
    querySelectorAll: () => videos,
    addEventListener(type, handler) { handlers.set(type, handler); },
    createElement() {
      return { style: {}, setAttribute() {}, select() {}, remove() { this.removed = true; } };
    },
    execCommand: () => fallback,
  };
  const location = { href: 'https://omindos.ai/', origin: 'https://omindos.ai', pathname: '/', hash };
  const window = { isSecureContext: true, addEventListener(type, handler) { windowHandlers.set(type, handler); } };
  const context = {
    window, document, location, navigator: { clipboard }, URL,
    Element, HTMLDetailsElement: Details, HTMLVideoElement: Video,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
  };
  runInNewContext(enhancement, context);
  const click = target => handlers.get('click')({ target, button: 0 });
  return { handlers, windowHandlers, ids, videos, fields, status, location, Element, Details, Video, click, observer: () => observer(), context };
}

test('task links reveal nested demos after a language body replacement', () => {
  const f = fixture();
  const parent = new f.Details(), inner = new f.Details(), target = new f.Element();
  target.parentElement = inner; inner.parentElement = parent;
  f.ids.set('demo-navigation', target);
  const link = new f.Element();
  link.href = 'https://omindos.ai/#demo-navigation'; link.matches = { 'a[href]': link };
  f.click(link);
  assert.equal(inner.open, true); assert.equal(parent.open, true);
  const translated = new f.Details(); f.ids.set('demo-navigation', translated);
  f.location.hash = '#demo-navigation'; f.observer();
  assert.equal(translated.open, true);
  assert.doesNotThrow(() => { f.location.hash = '#%E0%A4%A'; f.observer(); });
});

test('starting one clip pauses others and collapsing a demo pauses its videos', () => {
  const f = fixture();
  const playing = new f.Video(), other = new f.Video(), paused = new f.Video(); paused.paused = true;
  f.videos.push(playing, other, paused);
  f.handlers.get('play')({ target: playing });
  assert.equal(playing.pauseCalls, 0); assert.equal(other.pauseCalls, 1); assert.equal(paused.pauseCalls, 0);
  const disclosure = new f.Details(); disclosure.videos = [playing];
  f.handlers.get('toggle')({ target: disclosure });
  assert.equal(playing.pauseCalls, 1);
});

test('copying email reports clipboard success and fallback failure without leaving fields', async () => {
  for (const succeeds of [true, false]) {
    let copied;
    const f = fixture({ clipboard: { async writeText(text) { if (!succeeds) throw new Error('denied'); copied = text; } } });
    const button = new f.Element();
    button.dataset = { copyEmail: 'sales@omindos.ai', copySuccess: 'copied', copyFailure: 'copy manually' };
    button.matches = { 'button[data-copy-email]': button }; button.focus = () => {};
    f.click(button);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.disabled, false);
    assert.equal(f.status.textContent, succeeds ? 'copied' : 'copy manually');
    assert.equal(copied, succeeds ? 'sales@omindos.ai' : undefined);
    assert.ok(f.fields.every(field => field.removed));
  }
});

test('email selection fallback works and duplicate script execution keeps one handler set', async () => {
  const f = fixture({ fallback: true });
  const originalHandler = f.handlers.get('click');
  runInNewContext(enhancement, f.context);
  assert.equal(f.handlers.get('click'), originalHandler);
  const button = new f.Element();
  button.dataset = { copyEmail: 'sales@omindos.ai', copySuccess: 'copied', copyFailure: 'failed' };
  button.matches = { 'button[data-copy-email]': button }; button.focus = () => {};
  f.click(button);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.status.textContent, 'copied');
  assert.equal(f.fields.length, 1); assert.equal(f.fields[0].removed, true);
});
