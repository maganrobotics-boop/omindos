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
  await Promise.all(['/', '/founding-oem', '/why-originmind'].map(path => check(`${language} ${path}`, async () => {
    const response = await request(`https://omindos.ai${path}`, { Cookie: `originmind_language=${language}` });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Language'), contentLanguage);
    assert.equal(response.headers.get('Location'), null);
    assert.match(response.headers.get('Cache-Control'), /private/);
    assert.match(await response.text(), /<html/);
  })));
}

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
