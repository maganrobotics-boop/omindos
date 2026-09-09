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

for (const [language, contentLanguage] of [['zh', 'zh-CN'], ['en', 'en'], ['ja', 'ja-JP']]) {
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
  for (const route of ['', 'robots', 'robots/wheel-legged', 'robots/quadruped', 'robots/articulated', 'robots/open-frame', 'robots/wheeled', 'robots/dual-arm', 'omindos', 'integration', 'field-work', 'field-work/mining', 'field-work/warehouse', 'mobility', 'about', 'contact']) {
    const path = `/${locale}/${route ? route + '/' : ''}`;
    await check(`portal ${path}`, async () => {
      const response = await request(`https://omindos.ai${path}`, { 'Accept-Language': locale === 'cn' ? 'en' : 'zh-CN', Cookie: `originmind_language=${locale === 'cn' ? 'en' : 'zh'}` });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Language'), contentLanguage);
      assert.equal(response.headers.get('Location'), null);
      const html = await response.text();
      assert.ok(html.includes(`rel="canonical" href="https://omindos.ai${path}"`));
      assert.ok(html.includes('name="robots" content="index,follow"'));
      if (route === '' || route === 'robots') {
        const quadruped = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
          .map(match => match[0]).filter(card => card.includes(`/${locale}/robots/quadruped`));
        assert.equal(quadruped.length, 1);
        assert.match(quadruped[0], locale === 'cn' ? />在研</ : />IN DEVELOPMENT</i);
        assert.doesNotMatch(quadruped[0], />(?:在售|for sale)</i);
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
    await response.body?.cancel();
  });
}

const productDemos = ['mobile-inspection-demo', 'wheel-legged-demo', 'articulated-gait-demo', 'spider-mechanism-demo', 'open-frame-field-demo', 'wheel-legged-exploded', 'wheel-legged-leg-exploded', 'dual-arm-digital-twin-demo', 'dual-arm-service-demo'];
for (const asset of ['assets/videos/open-frame-lab.mp4', 'assets/videos/originmind-home-film.mp4', 'assets/underground-robot-team.jpg', 'assets/omindos-inspection-console-20260909.jpg', 'assets/wheel-legged-bracket-model.png', 'assets/wheel-legged-bracket-photo.jpg', ...productDemos.flatMap(name => [`assets/videos/${name}.mp4`, `assets/${name}-poster.jpg`])]) {
  await check(`asset ${asset}`, async () => {
    const response = await fetch(`https://omindos.ai/${asset}`, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200); assert.ok(Number(response.headers.get('Content-Length')) > 1000);
    if (asset.endsWith('.mp4')) assert.match(response.headers.get('Content-Type'), /video\/mp4/);
  });
}
await check('Japanese homepage', async () => {
  const response = await request('https://omindos.ai/ja/');
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Language'), 'ja-JP');
  await response.body?.cancel();
});
await check('OEM endpoint accepts no public listing', async () => {
  const response = await request('https://omindos.ai/api/oem-applications');
  assert.equal(response.status, 405); await response.body?.cancel();
});

await check('visitor statistics', async () => {
  const response = await request('https://omindos.ai/api/visits');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).enabled, true);
});

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

