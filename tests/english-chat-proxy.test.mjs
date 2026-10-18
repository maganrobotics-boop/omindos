import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preserveWorker, baselineFile } from '../scripts/preserve-website-statistics.mjs';

const source = await readFile(new URL('../apps/website/_worker.js', import.meta.url), 'utf8');
const { default: worker, handleEnglishChatRequest: handle } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const guest = { id: 'anonymous_guest_1234567890', kind: 'guest', name: 'Private guest name', email: 'private@example.com' };
const token = 'a'.repeat(64);
const nextToken = 'b'.repeat(64);
const cookieName = '__Host-omindos-english-guest';
const domesticCookie = '__Host-omindos-account';
const base = 'https://omindos.ai';
const question = { topic: 'research', messages: [{ role: 'user', content: 'Please answer in English. What is Q1?' }] };
const json = (data, options = {}) => Response.json(data, options);
const guestResponse = (issue = false) => json({ account: guest, verifiedEmailAvailable: true }, issue ? { headers: { 'Set-Cookie': `${domesticCookie}=${nextToken}; Path=/; Secure; HttpOnly; SameSite=Lax` } } : {});
function request(path = '/api/english-chat/session', options = {}) {
  const method = options.method || (path === '/api/english-chat' ? 'POST' : 'GET');
  const headers = new Headers({ Accept: 'application/json', 'Sec-Fetch-Site': 'same-origin' });
  if (options.cookie !== null) headers.set('Cookie', options.cookie || `${cookieName}=${token}`);
  if (method === 'POST') {
    headers.set('Origin', base);
    headers.set('Content-Type', 'application/json');
    headers.set('X-OmindOS-Expected-Account', guest.id);
  }
  for (const [key, value] of Object.entries(options.headers || {})) {
    if (value === null) headers.delete(key); else headers.set(key, value);
  }
  return new Request((options.base || base) + path, { method, headers, ...(method === 'POST' ? { body: options.rawBody ?? JSON.stringify(options.body ?? question) } : {}) });
}
function upstream(...replies) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options, headers: new Headers(options.headers) });
    const reply = replies.shift();
    assert.ok(reply, 'unexpected upstream call');
    return typeof reply === 'function' ? reply(url, options) : reply;
  };
  return { calls, fetch };
}
function assertPrivate(response) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
}

test('new anonymous session maps only the upstream guest cookie and exposes no profile', async () => {
  const u = upstream(guestResponse(true));
  const response = await handle(request(undefined, { cookie: null }), u);
  assert.equal(response.status, 200);
  assertPrivate(response);
  assert.deepEqual(await response.json(), { account: { id: guest.id, kind: 'guest' } });
  assert.equal(response.headers.get('Set-Cookie'), `${cookieName}=${nextToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  assert.equal(u.calls[0].url, 'https://omindos.cn/learning/api/account/session');
  assert.deepEqual([...u.calls[0].headers], [['accept', 'application/json']]);
  assert.equal(u.calls[0].redirect, 'error');
});

test('POST revalidates a guest, constructs fixed upstream credentials and filters response fields', async () => {
  const u = upstream(guestResponse(), json({ answer: 'Q1 is a quadruped inspection robot.', conversationToken: 'opaque-token', learningRecord: { owner: 'private' }, account: guest, images: ['private'], sources: [
    { url: 'https://omindos.cn/robots/quadruped/', title: 'Q1', secret: 'private' },
    { url: 'https://omindos.cn/robots/quadruped/', title: 'Duplicate' },
    { url: 'javascript:alert(1)', title: 'Unsafe' },
    { url: 'https://user:pass@example.com', title: 'Credential URL' },
  ] }, { headers: { 'Set-Cookie': `${domesticCookie}=${'c'.repeat(64)}; Secure; HttpOnly` } }));
  const input = request('/api/english-chat', { cookie: `${cookieName}=${token}; ${domesticCookie}=${'d'.repeat(64)}; oa_session=private; originmind_language=zh`, headers: { Authorization: 'Bearer private', 'X-OmindOS-Account': 'registered-user', 'X-Forwarded-For': '10.0.0.1', 'X-OmindOS-Expected-Account': guest.id }, body: { ...question, conversationToken: 'previous-token' } });
  const response = await handle(input, u);
  assert.equal(response.status, 200);
  assertPrivate(response);
  assert.equal(response.headers.get('Set-Cookie'), null, 'unverified POST cookies must not be adopted');
  assert.deepEqual(await response.json(), { answer: 'Q1 is a quadruped inspection robot.', conversationToken: 'opaque-token', sources: [{ url: 'https://omindos.cn/robots/quadruped/', title: 'Q1' }] });
  assert.equal(u.calls.length, 2);
  assert.equal(u.calls[0].headers.get('Cookie'), `${domesticCookie}=${token}`);
  assert.deepEqual([...u.calls[0].headers].map(([key]) => key), ['accept', 'cookie']);
  assert.equal(u.calls[1].url, 'https://omindos.cn/learning/api/chat');
  assert.deepEqual([...u.calls[1].headers], [
    ['accept', 'application/json'], ['content-type', 'application/json'], ['cookie', `${domesticCookie}=${token}`], ['origin', 'https://omindos.cn'], ['x-omindos-expected-account', guest.id],
  ]);
  assert.deepEqual(JSON.parse(u.calls[1].body), { ...question, conversationToken: 'previous-token' });
  assert.equal(u.calls[1].redirect, 'error');
});

test('both endpoints reject cross-site, sibling-site, missing provenance and untrusted hosts before fetching', async () => {
  for (const path of ['/api/english-chat/session', '/api/english-chat']) {
    for (const options of [
      { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' } },
      { headers: { Origin: base, 'Sec-Fetch-Site': 'cross-site' } },
      { headers: { Origin: 'https://chat.omindos.ai', 'Sec-Fetch-Site': 'same-site' } },
      { headers: { Origin: null, 'Sec-Fetch-Site': null } },
      { headers: { 'Sec-Fetch-Site': 'none' } },
      { base: 'https://evil.example', headers: { Origin: 'https://evil.example' } },
      { base: 'https://omindos.ai.evil.example', headers: { Origin: 'https://omindos.ai.evil.example' } },
      { base: 'http://omindos.ai', headers: { Origin: 'http://omindos.ai' } },
    ]) {
      const u = upstream();
      const response = await handle(request(path, options), u);
      assert.equal(response.status, 403);
      assert.equal(u.calls.length, 0);
      assertPrivate(response);
    }
  }
  const u = upstream();
  assert.equal((await handle(request('/api/english-chat', { headers: { Origin: null } }), u)).status, 403);
  assert.equal(u.calls.length, 0);
});

test('preview session stays on its own allowed origin, with no CORS permission', async () => {
  const u = upstream(guestResponse());
  const response = await handle(request(undefined, { base: 'https://review.omindos-website.pages.dev' }), u);
  assert.equal(response.status, 200);
  assertPrivate(response);
});

test('registered, OA and malformed upstream accounts never return their identities or reach chat', async () => {
  for (const account of [{ ...guest, kind: 'registered' }, { ...guest, kind: 'oa' }, { id: 'registered-private', kind: 'student', passwordHash: 'private' }, null]) {
    for (const path of ['/api/english-chat/session', '/api/english-chat']) {
      const u = upstream(json({ account, token: 'private' }, { headers: { 'Set-Cookie': `${domesticCookie}=${nextToken}; Secure; HttpOnly` } }));
      const response = await handle(request(path), u);
      assert.equal(response.status, 403);
      assert.equal(u.calls.length, 1);
      assert.equal(response.headers.get('Set-Cookie'), `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
      assert.doesNotMatch(await response.text(), /private|registered|student|email|passwordHash|anonymous_guest/);
    }
  }
});

test('client account mismatch and missing expected identity stop before any chat POST', async () => {
  const u = upstream(guestResponse());
  const response = await handle(request('/api/english-chat', { headers: { 'X-OmindOS-Expected-Account': 'another_guest_1234567890' } }), u);
  assert.equal(response.status, 409);
  assert.equal(u.calls.length, 1);
  for (const expected of [null, '', 'short']) {
    const other = upstream();
    assert.equal((await handle(request('/api/english-chat', { headers: { 'X-OmindOS-Expected-Account': expected } }), other)).status, 409);
    assert.equal(other.calls.length, 0);
  }
});

test('malformed or duplicate English cookies fail closed; domestic and OA cookies alone are ignored', async () => {
  for (const cookie of [`${cookieName}=not-a-token`, `${cookieName}=${token}; ${cookieName}=${nextToken}`, `${cookieName}=${'a'.repeat(65)}`]) {
    const u = upstream();
    const response = await handle(request(undefined, { cookie }), u);
    assert.equal(response.status, 403);
    assert.equal(u.calls.length, 0);
  }
  const u = upstream(guestResponse(true));
  assert.equal((await handle(request(undefined, { cookie: `${domesticCookie}=${token}; oa_session=private` }), u)).status, 200);
  assert.equal(u.calls[0].headers.has('Cookie'), false);
});

test('only exact routes and their designated methods are accepted, without query forwarding', async () => {
  for (const path of ['/api/english-chat/', '/api/english-chat/session/', '/api/english-chat/account', '/api/english-chat/session/other', '/api/english-chat/https://evil.example']) {
    const u = upstream();
    assert.equal((await handle(request(path), u)).status, 404);
    assert.equal(u.calls.length, 0);
    assert.equal((await worker.fetch(request(path), {})).status, 404);
  }
  const query = upstream();
  assert.equal((await handle(request('/api/english-chat/session?target=https://evil.example'), query)).status, 403);
  assert.equal(query.calls.length, 0);
  for (const [path, method, allow] of [['/api/english-chat', 'GET', 'POST'], ['/api/english-chat/session', 'POST', 'GET'], ['/api/english-chat/session', 'OPTIONS', 'GET']]) {
    const u = upstream();
    const response = await handle(request(path, { method }), u);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), allow);
    assert.equal(u.calls.length, 0);
  }
});

test('JSON, body, message and token limits are checked before an upstream request', async () => {
  for (const [options, status] of [
    [{ rawBody: '{"broken":' }, 400],
    [{ rawBody: 'null' }, 400],
    [{ rawBody: '[]' }, 400],
    [{ headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ rawBody: ' '.repeat(65537) }, 413],
    [{ headers: { 'Content-Length': '65537' } }, 413],
    [{ body: { ...question, topic: 'private' } }, 400],
    [{ body: { ...question, accountId: 'private' } }, 400],
    [{ body: { ...question, messages: [{ role: 'system', content: 'private' }] } }, 400],
    [{ body: { ...question, messages: [{ role: 'user', content: 'x'.repeat(4401) }] } }, 400],
    [{ body: { ...question, messages: [{ role: 'user', content: '\u0000' }] } }, 400],
    [{ body: { ...question, messages: [question.messages[0], question.messages[0]] } }, 400],
    [{ body: { ...question, conversationToken: 'x'.repeat(40001) } }, 400],
    [{ body: { ...question, conversationToken: 'two tokens' } }, 400],
  ]) {
    const u = upstream();
    assert.equal((await handle(request('/api/english-chat', options), u)).status, status);
    assert.equal(u.calls.length, 0);
  }
});

test('upstream JSON, content type, size, identity and cookie failures return generic errors', async () => {
  for (const reply of [
    new Response('<html>private login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{private', { headers: { 'Content-Type': 'application/json' } }),
    json({ account: { id: 'short', kind: 'guest' } }),
    json({ account: { id: 1234567890123456, kind: 'guest' } }),
    json({ account: guest, private: 'x'.repeat(17000) }),
    json({ account: guest }, { headers: { 'Set-Cookie': `${domesticCookie}=invalid; Secure; HttpOnly` } }),
  ]) {
    const u = upstream(reply);
    const response = await handle(request(), u);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private|anonymous_guest|login|email/);
  }
  const u = upstream(guestResponse());
  assert.equal((await handle(request(undefined, { cookie: null }), u)).status, 502, 'new guest requires its issued credential');
});

test('unrelated upstream cookies are stripped while the guest cookie is rewritten', async () => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'oa_session=private; Secure; HttpOnly');
  headers.append('Set-Cookie', `${domesticCookie}=${nextToken}; Secure; HttpOnly; Expires=Wed, 21 Oct 2030 07:28:00 GMT`);
  headers.append('Set-Cookie', 'registered=private; Secure; HttpOnly');
  const u = upstream(new Response(JSON.stringify({ account: guest }), { headers }));
  const response = await handle(request(), u);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Set-Cookie'), `${cookieName}=${nextToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`);
});

test('rate limiting survives the proxy without upstream errors or cookies leaking', async () => {
  const u = upstream(guestResponse(), json({ error: 'private internal error', owner: guest.id }, { status: 429, headers: { 'Retry-After': '3600', 'Set-Cookie': 'oa_session=private' } }));
  const response = await handle(request('/api/english-chat'), u);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '3600');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assertPrivate(response);
  assert.doesNotMatch(await response.text(), /private|anonymous_guest/);
});

test('upstream redirect/network failures are contained and the deadline aborts a stalled fetch', async () => {
  for (const reply of [() => { throw new TypeError('private network failure'); }, new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })]) {
    const u = upstream(reply);
    const response = await handle(request(), u);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private|evil\.example/);
  }
  let signal;
  const response = await handle(request(), { timeoutMs: 5, fetch: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.equal(response.status, 504);
  assert.equal(signal.aborted, true);
  assertPrivate(response);
});

test('the deadline also cancels a stalled upstream response body', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"account":')); },
    cancel() { cancelled = true; },
  });
  const u = upstream(new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  const response = await handle(request(), { ...u, timeoutMs: 5 });
  assert.equal(response.status, 504);
  assert.equal(cancelled, true);
});

test('the production preserve-current analytics adapter retains the independent guest proxy', async () => {
  const preserved = preserveWorker(source, baselineFile('apps/website/_worker.js'));
  const { handleEnglishChatRequest: productionHandle } = await import('data:text/javascript;base64,' + Buffer.from(preserved).toString('base64'));
  const u = upstream(guestResponse());
  const response = await productionHandle(request(), u);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { account: { id: guest.id, kind: 'guest' } });
  assert.doesNotMatch(preserved, /visit_\w+_v2/);
});

test('malformed, HTML and oversized successful chat responses are rejected', async () => {
  for (const reply of [
    json({ answer: '', private: 'secret' }),
    json({ answer: 'x'.repeat(64001) }),
    json({ answer: 'Q1', conversationToken: 'x'.repeat(40001) }),
    json({ answer: 'Q1', private: 'x'.repeat(262145) }),
    new Response('private HTML', { headers: { 'Content-Type': 'text/html' } }),
  ]) {
    const u = upstream(guestResponse(), reply);
    const response = await handle(request('/api/english-chat'), u);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private|secret/);
  }
});

test('only the local panel HTML receives same-origin framing permission and no-store', async () => {
  const env = { ASSETS: { fetch: async () => new Response('<html>panel</html>', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' } }) } };
  const panel = await worker.fetch(new Request(base + '/en/assets/english-chat/panel.html'), env);
  assert.equal(panel.headers.get('Content-Security-Policy'), "frame-ancestors 'self'");
  assert.equal(panel.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(panel.headers.get('Cache-Control'), 'no-store');
  assert.equal(panel.headers.get('X-Content-Type-Options'), 'nosniff');
  const other = await worker.fetch(new Request(base + '/en/assets/other.html'), env);
  assert.equal(other.headers.get('Content-Security-Policy'), "frame-ancestors 'none'");
  assert.equal(other.headers.get('X-Frame-Options'), 'DENY');
});
