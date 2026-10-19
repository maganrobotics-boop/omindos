import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCourseEntryResources} from './course-entry-resources.mjs';
import {handle} from './gateway.mjs';

const legacy = '<link rel="stylesheet" href="/learning/assets/login-layout-20261002.css">' +
  '<link rel="stylesheet" href="/learning/course-professional-20261002.css?v=2">' +
  '<link rel="stylesheet" href="/orientation-entry.css?v=20260927v1">' +
  '<script src="/orientation-entry.js?v=20260927v1"></script>';
const course = '<link rel="stylesheet" href="/learning/style.css?v=current">' +
  '<script type="module" src="/learning/app.js?v=current"></script>' +
  '<script src="/learning/account.js"></script><main>课程与学习进度</main>';

test('course entry drops only four inactive resource tags and keeps course/account code', () => {
  for (const pathname of ['/learning', '/learning/', '/learning/index.html']) {
    assert.equal(cleanCourseEntryResources(legacy + course, 'text/html; charset=utf-8', pathname), course);
  }
  const rewritten = legacy.replaceAll('/orientation-entry', '/learning/orientation-entry');
  assert.equal(cleanCourseEntryResources(rewritten + course, 'text/html', '/learning'), course);
});

test('cleanup leaves other pages, APIs, code, external resources and inline content unchanged', () => {
  for (const pathname of ['/', '/learning/account', '/learning/runner.html', '/learning/api/chat', '/arena/']) {
    assert.equal(cleanCourseEntryResources(legacy, 'text/html', pathname), legacy);
  }
  for (const type of ['application/json', 'application/javascript', 'text/event-stream']) {
    assert.equal(cleanCourseEntryResources(legacy, type, '/learning'), legacy);
  }
  const unrelated = '<link rel="preload" href="/orientation-entry.css">' +
    '<link rel="stylesheet" href="https://example.com/orientation-entry.css">' +
    '<script src="/orientation-entry.js">keepInlineFallback()</script>';
  assert.equal(cleanCourseEntryResources(unrelated, 'text/html', '/learning'), unrelated);
});

test('gateway serves the course entry without the stale requests and preserves security/cookies', async () => {
  const response = await handle(new Request('https://omindos.cn/learning'), async () => new Response(legacy + course, {
    headers: {'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'", 'Set-Cookie': 'course=retained; Path=/learning; Secure; HttpOnly'},
  }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), course);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'");
  assert.deepEqual(response.headers.getSetCookie(), ['course=retained; Path=/learning; Secure; HttpOnly']);
});
