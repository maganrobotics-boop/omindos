// SPDX-License-Identifier: GPL-3.0-only
// Uses an isolated Chrome profile and Node's built-in CDP WebSocket client.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [url, output, chrome = '/usr/bin/google-chrome'] = process.argv.slice(2);
if (!url || !output) throw new Error('Usage: node verify_q1.mjs FILE_URL OUTPUT [CHROME]');
const pageBytes = url.startsWith('file:') ? await fs.readFile(new URL(url)) : Buffer.from(await (await fetch(url)).arrayBuffer());
const html_sha256 = createHash('sha256').update(pageBytes).digest('hex');
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'originmind-q1-'));
const processChrome = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [], checks = [], pending = new Map();
try {
  let port;
  for (let i = 0; i < 150; i++) {
    try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await pause(100); }
  }
  assert(port, 'Isolated Chrome did not start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  socket.addEventListener('message', event => {
    const r = JSON.parse(event.data);
    if (r.method === 'Runtime.exceptionThrown') errors.push(r.params);
    if (r.id && pending.has(r.id)) { const p = pending.get(r.id); pending.delete(r.id); r.error ? p.reject(new Error(JSON.stringify(r.error))) : p.resolve(r.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 30000).unref();
  });
  async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
  async function until(expression, seconds = 60) { const deadline = Date.now() + seconds * 1000; while (!(await evaluate(expression))) { if (Date.now() > deadline) throw new Error('Timed out: ' + expression); await pause(150); } }
  await call('Page.enable'); await call('Runtime.enable');
  for (const [width, height] of [[1366, 900], [768, 1024], [390, 844], [320, 740]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await call('Page.navigate', { url });
    await until("window.q1Viewer?.getState().ready && q1Viewer.getState().frameRevision > 0 && document.querySelector('#model-canvas').width > 0");
    const info = await evaluate("({state:q1Viewer.getState(),width:innerWidth,scroll:document.documentElement.scrollWidth,oldVideo:!!document.querySelector('video'),text:document.body.innerText,logo:document.querySelector('.brand img').naturalWidth})");
    assert.equal(info.state.model, 'originmind-q1'); assert(info.state.geometryOnly); assert(info.state.vertices > 1000); assert(info.logo > 0); assert.equal(info.oldVideo, false); assert(!info.text.includes('MEVIUS')); assert(info.scroll <= width);
    assert(info.text.includes('运动仿真验收结果')); assert(info.text.includes('关节与动力学参数待核对'));
    for (const view of ['front', 'side', 'top', 'iso']) {
      const point = await evaluate(`(()=>{const b=document.querySelector('button[data-view=${view}]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
      assert.equal(await evaluate("document.querySelector('#model-canvas').dataset.view"), view);
      checks.push({ viewport: [width, height], view, passed: true });
    }
    await evaluate("document.querySelector('#rotate').click()"); assert.equal((await evaluate('q1Viewer.getState()')).auto, true);
    await evaluate("document.querySelector('#rotate').click()"); assert.equal((await evaluate('q1Viewer.getState()')).auto, false);
    await evaluate("document.querySelector('#model-canvas').focus()"); const before = await evaluate('q1Viewer.getState()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
    assert((await evaluate('q1Viewer.getState()')).theta > before.theta);
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const center = await evaluate("(()=>{const c=document.querySelector('canvas');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    const beforeTouch = await evaluate('q1Viewer.getState()');
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 28, y: center.y + 15, id: 1 }] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.notEqual((await evaluate('q1Viewer.getState()')).theta, beforeTouch.theta);
    const pinchStart = await evaluate('q1Viewer.getState()');
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x - 24, y: center.y, id: 1 }, { x: center.x + 24, y: center.y, id: 2 }] });
    await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x - 42, y: center.y, id: 1 }, { x: center.x + 42, y: center.y, id: 2 }] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert((await evaluate('q1Viewer.getState()')).distance < pinchStart.distance);
    await call('Emulation.setTouchEmulationEnabled', { enabled: false });
    const rendered = await evaluate('q1Viewer.getState().frameRevision');
    await evaluate("document.querySelector('button[data-view=iso]').click();scrollTo(0,0)");
    await until('q1Viewer.getState().frameRevision > ' + rendered);
    const reset = await evaluate('q1Viewer.getState()');
    assert.equal(reset.distance, 1.9); assert.equal(reset.theta, .94); assert.equal(reset.phi, 1.12);
    const pixels = await evaluate("(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2'),p=new Uint8Array(4),a=[];for(let y=.25;y<.8;y+=.1)for(let x=.2;x<.8;x+=.1){g.readPixels(Math.round(c.width*x),Math.round(c.height*y),1,1,g.RGBA,g.UNSIGNED_BYTE,p);a.push([...p]);}return new Set(a.map(v=>v.join(','))).size})()");
    assert(pixels > 8, 'Renderer produced a uniform canvas');
    const bounds = (await call('Page.getLayoutMetrics')).cssContentSize;
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: bounds.height, scale: 1 } });
    await fs.writeFile(path.join(output, `q1-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    checks.push({ viewport: [width, height], interaction: 'rotation-keyboard-touch-pinch', distinctPixelSamples: pixels, state: await evaluate('q1Viewer.getState()'), passed: true });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'browser-check.json'), JSON.stringify({ passed: true, url, html_sha256, checks, consoleErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, consoleErrors: errors.length }));
} finally {
  socket?.close(); processChrome.kill('SIGTERM');
  await new Promise(resolve => { if (processChrome.exitCode !== null) resolve(); else { processChrome.once('exit', resolve); setTimeout(() => { processChrome.kill('SIGKILL'); resolve(); }, 3000).unref(); } });
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
