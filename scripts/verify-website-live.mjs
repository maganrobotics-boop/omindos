import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

async function request(url, headers = {}) {
  return fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OMINDOS-Deployment-Check/1.0)', ...headers },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function check(name, callback) {
  for (let attempt = 1; ; attempt++) {
    try { await callback(); console.log(`PASS ${name}`); return; }
    catch (error) {
      if (attempt === 3) throw new Error(`${name}: ${error.message}`, { cause: error });
      await delay(2_000);
    }
  }
}

for (const [language, contentLanguage] of [['zh', 'zh-CN'], ['en', 'en']]) {
  await Promise.all(['/founding-oem', '/why-originmind', '/robot-products'].map(path => check(`${language} ${path}`, async () => {
    const response = await request(`https://omindos.ai${path}`, { Cookie: `originmind_language=${language}` });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Language'), contentLanguage);
    assert.equal(response.headers.get('Location'), null);
    assert.match(response.headers.get('Cache-Control'), /private/);
    assert.match(await response.text(), /<html/);
  })));
}

for (const [locale, contentLanguage] of [['cn', 'zh-CN'], ['en', 'en']]) {
  for (const route of ['', 'robots', 'robots/wheel-legged', 'robots/quadruped', 'robots/articulated', 'robots/open-frame', 'robots/wheeled', 'robots/dual-arm', 'omindos', 'integration', 'field-work', 'field-work/mining', 'field-work/warehouse', 'mobility', 'about', 'contact', 'privacy']) {
    const path = `/${locale}/${route ? route + '/' : ''}`;
    await check(`portal ${path}`, async () => {
      const response = await request(`https://omindos.ai${path}`, { 'Accept-Language': locale === 'cn' ? 'en' : 'zh-CN', Cookie: `originmind_language=${locale === 'cn' ? 'en' : 'zh'}` });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Language'), contentLanguage);
      assert.equal(response.headers.get('Location'), null);
      const html = await response.text();
      assert.doesNotMatch(html, /unitree-originmind-hardware\.jpg|dual-arm-(?:digital-twin-demo|service-demo)/);
      assert.ok(html.includes(`rel="canonical" href="https://omindos.ai${path}"`));
      assert.ok(html.includes('name="robots" content="index,follow"'));
      assert.match(html, /<a class="skip-link" href="#main-content">/);
      assert.match(html, /<main\b[^>]*\bid="main-content"[^>]*>/);
      const footer = [...html.matchAll(/<footer\b[^>]*class="[^"]*(?:site-footer|footer)[^"]*"[^>]*>[\s\S]*?<\/footer>/g)]
        .map(match => match[0]).at(-1);
      assert.ok(footer);
      assert.ok(footer.includes(`href="/${locale}/privacy/"`));
      assert.ok(html.includes('https://omindos.ai/og-card.png?v=20260909-omindos'));
      if (route === 'privacy') {
        assert.ok(html.includes('<code>originmind.language</code>'));
        assert.ok(html.includes('<code>originmind_language</code>'));
      }
      for (const match of html.matchAll(/href="(\/(?:cn|en)\/[^"?#]*)/g)) {
        if (!/\.[a-z0-9]+$/i.test(match[1])) assert.ok(match[1].endsWith('/'), match[1]);
      }
      if (route === '' || route === 'robots') {
        const quadruped = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
          .map(match => match[0]).filter(card => card.includes(`/${locale}/robots/quadruped`));
        assert.equal(quadruped.length, 1);
        assert.match(quadruped[0], locale === 'cn' ? />在研</ : />IN DEVELOPMENT</i);
        assert.doesNotMatch(quadruped[0], />(?:在售|for sale)</i);
        const dualArmName = locale === 'cn' ? '双臂协同操作平台' : 'Dual-arm manipulation platform';
        assert.ok(html.includes(`<h3 class="dual-arm-card-title"><a href="/${locale}/robots/dual-arm/">${dualArmName}</a></h3>`));
      }
      if (route === 'robots/quadruped') {
        assert.match(html, locale === 'cn' ? />在研</ : />IN DEVELOPMENT</i);
        assert.doesNotMatch(html, />(?:在售|for sale)<|咨询报价|Request a quote|咨询产品演示|Request a demonstration/i);
        assert.match(html, locale === 'cn' ? /整机集成与场景验证/ : /full-system integration and application validation/);
      }
      if (route.startsWith('robots/')) {
        const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)[0];
        assert.match(main, /id="features"/);
        assert.match(main, /id="applications"/);
        assert.doesNotMatch(main, /href="[^"]+\.(?:pdf|docx|zip)"/i);
        assert.ok(html.includes('/product-details.css?v=20260910-catalogue'));
      }
      if (route === 'robots/dual-arm') {
        const name = locale === 'cn' ? '双臂协同操作平台' : 'Dual-arm manipulation platform';
        assert.ok(html.includes(`<h1 class="dual-arm-title">${name}</h1>`));
        assert.ok(html.includes('/assets/covers/dual-arm-cover-20260909.webp'));
        assert.ok(html.includes('/assets/dual-arm-platform-photo-20260910.jpg'));
        assert.ok(html.includes('/assets/dual-arm-platform-cad-20260910.jpg'));
        assert.ok(html.includes('class="dual-arm-reference-grid"'));
        assert.doesNotMatch(html, /dual-arm-platform-manual\.jpg/);
        assert.ok(html.includes('id="videos"'));
        assert.ok(html.includes('/assets/videos/dual-arm-coffee-service.mp4'));
        assert.ok(html.includes('/assets/videos/dual-arm-digital-twin.mp4'));
        assert.ok(html.includes('/assets/dual-arm-coffee-service-poster.jpg'));
        assert.ok(html.includes('/assets/dual-arm-digital-twin-poster.jpg'));
        assert.doesNotMatch(html, /dual-arm-(?:service|digital-twin)-demo|dual-arm-digital-twin-manual\.png/);
      }
      if (route === 'robots/wheel-legged') {
        assert.doesNotMatch(html, /wheel-legged-(?:exploded|leg-exploded)/);
      }
      if (route === 'robots/open-frame') {
        const name = locale === 'cn' ? '并联轮足机器人' : 'Parallel-linkage wheel-legged robot';
        const retiredName = locale === 'cn' ? '开放式轮足机器人' : 'Open-frame wheel-legged robot';
        assert.ok(html.includes(name));
        assert.ok(!html.includes(retiredName));
      }
    });
  }
  await check(`automatic ${locale}`, async () => {
    const response = await request('https://omindos.ai/?source=deployment', { 'Accept-Language': contentLanguage });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `https://omindos.ai/${locale}/?source=deployment`);
    assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  });
  await check(`localized 404 ${locale}`, async () => {
    const response = await request(`https://omindos.ai/${locale}/deployment-check-not-a-page/`);
    assert.equal(response.status, 404); assert.equal(response.headers.get('Content-Language'), contentLanguage);
    assert.match(await response.text(), locale === 'cn' ? /<h1>页面未找到<\/h1>/ : /<h1>Page not found<\/h1>/);
  });
}

const productDemos = ['mobile-inspection-demo', 'wheel-legged-demo', 'articulated-gait-demo', 'spider-mechanism-demo', 'open-frame-field-demo', 'dual-arm-coffee-service', 'dual-arm-digital-twin'];
const productCovers = ['wheel-legged-cover-20260910.webp', 'quadruped-cover-20260909.webp', 'articulated-cover-20260910.webp', 'open-frame-cover-20260910.webp', 'wheeled-cover-20260910.webp', 'dual-arm-cover-20260909.webp'];
for (const asset of ['og-card.png?v=20260909-omindos', 'assets/videos/open-frame-lab.mp4', 'assets/videos/originmind-home-film.mp4', 'assets/underground-robot-team.jpg', 'assets/omindos-inspection-console-20260909.jpg', 'assets/omindos-system-overview-20260910-balanced.webp', 'assets/wheel-legged-bracket-model.png', 'assets/wheel-legged-bracket-photo.jpg', 'assets/third-party-quadruped-platform.jpg', 'assets/dual-arm-platform-photo-20260910.jpg', 'assets/dual-arm-platform-cad-20260910.jpg', ...productCovers.map(name => `assets/covers/${name}`), ...productDemos.flatMap(name => [`assets/videos/${name}.mp4`, `assets/${name}-poster.jpg`])]) {
  await check(`asset ${asset}`, async () => {
    const response = await fetch(`https://omindos.ai/${asset}`, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200); assert.ok(Number(response.headers.get('Content-Length')) > 1000);
    if (asset.endsWith('.mp4')) assert.match(response.headers.get('Content-Type'), /video\/mp4/);
  });
}
for (const path of ['/ja/', '/index.ja.html']) {
  await check(`retired Japanese path ${path} redirects to English`, async () => {
    const response = await request(`https://omindos.ai${path}`);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), 'https://omindos.ai/en/');
    await response.body?.cancel();
  });
}
for (const path of ['/founding-oem.ja.html', '/founding-oem.ja.js', '/oem/ja/', '/oem/ja/index.html', '/why/ja/', '/why/ja/index.html',
  '/robots/ja/', '/robots/ja/index.html', '/404.ja.html']) {
  await check(`retired Japanese path ${path} returns English 404`, async () => {
    const response = await request(`https://omindos.ai${path}`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Content-Language'), 'en');
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.doesNotMatch(await response.text(), /[ぁ-ゖァ-ヺ]|日本語/u);
  });
}
await check('Japanese brochure removed', async () => {
  const response = await request('https://omindos.ai/assets/brochures/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_JA.pdf');
  assert.equal(response.status, 404);
  await response.body?.cancel();
});
await check('OEM endpoint accepts no public listing', async () => {
  const response = await request('https://omindos.ai/api/oem-applications');
  assert.equal(response.status, 405); await response.body?.cancel();
});

await check('visitor statistics are not publicly readable', async () => {
  const response = await request('https://omindos.ai/api/visits');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
  assert.doesNotMatch(await response.text(), /total|countries|last24Hours/);
});

await check('robots and sitemap policy', async () => {
  const robots = await (await request('https://omindos.ai/robots.txt')).text();
  assert.equal((robots.match(/BEGIN Cloudflare Managed/g) || []).length, 1);
  assert.equal((robots.match(/Sitemap:/g) || []).length, 1);
  const sitemap = await (await request('https://omindos.ai/sitemap.xml')).text();
  assert.match(sitemap, /https:\/\/omindos\.ai\/cn\/privacy\//);
  assert.match(sitemap, /https:\/\/omindos\.ai\/en\/privacy\//);
  assert.doesNotMatch(sitemap, /\/robot-products/);
});

for (const [language, route, label] of [
  ['zh', '/cn/robots/', '移动机器人手册与参考报价'],
  ['en', '/en/robots/', 'Mobile robot brochure and reference pricing'],
]) {
  await check(`legacy robot catalogue ${language}`, async () => {
    const response = await request('https://omindos.ai/robot-products', { Cookie: `originmind_language=${language}` });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`href="${route}"`));
    assert.ok(html.includes(label));
  });
}

for (const path of ['/meeting', '/meeting/display', '/api/meeting/login']) {
  await check(`removed ${path}`, async () => {
    const response = await request(`https://omindos.ai${path}`);
    assert.equal(response.status, 404);
    await response.body?.cancel();
  });
}

for (const host of ['www.omindos.ai', 'originmindos.com', 'www.originmindos.com']) {
  await check(`redirect ${host}`, async () => {
    const response = await request(`https://${host}/`);
    assert.equal(response.status, 308);
    assert.equal(new URL(response.headers.get('Location')).hostname, 'omindos.ai');
    await response.body?.cancel();
  });
}

