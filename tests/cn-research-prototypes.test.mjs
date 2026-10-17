import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../apps/website/', import.meta.url);
test('three Chinese prototypes retain their names, visible status, demonstrations and research enquiries', async () => {
  for (const [model, name] of [['articulated','HX1'],['wheel-legged','WL1-EDU'],['open-frame','PW1-EDU']]) {
    const html = await readFile(new URL(`cn/robots/${model}/index.html`, root),'utf8');
    const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)[0];
    assert.ok(main.replace(/<[^>]*>/g, '').includes(name), model);
    assert.match(main, model === 'articulated' ? />研发样机</ : />产品样机</);
    assert.match(main, /咨询研发合作/);
    assert.doesNotMatch(decodeURIComponent(main), /在售|咨询报价|采购数量|交付范围|报价单/);
    const players = [...main.matchAll(/<video\b[^>]*>/g)].map(([tag]) => tag);
    assert.ok(players.length > 0, model + ': research demonstrations remain available');
    for (const player of players) {
      assert.match(player, /\bcontrols(?:\s|>)/);
      assert.match(player, /\bplaysinline(?:\s|>)/);
      assert.match(player, /\bpreload="none"/);
      assert.match(player, /\baria-label="[^"]+"/);
      assert.doesNotMatch(player, /\bautoplay\b/);
    }
    assert.ok(html.includes('/cn/research-prototypes.css?v=20261008'));
  }
  const art = await readFile(new URL('cn/robots/articulated/index.html',root),'utf8');
  for (const evidence of ['六足布局','12 个驱动','0.390','0.174','平地前进 20 s','0.2 r/s','IMU','非交付性能承诺','10.3390/mi13091404']) assert.ok(art.includes(evidence),evidence);
  const pwl = await readFile(new URL('cn/robots/open-frame/index.html',root),'utf8');
  assert.match(pwl, /id="manuals"/);
  assert.match(pwl, /停止行走不等于驱动失能/);
});
test('research styling is never loaded by unaffected Chinese or English pages', async () => {
  for (const locale of ['cn','en']) {
    for (const model of ['quadruped','wheeled','dual-arm', ...(locale==='en'?['articulated','wheel-legged','open-frame']:[])]) {
      const html = await readFile(new URL(`${locale}/robots/${model}/index.html`,root),'utf8');
      assert.doesNotMatch(html,/research-prototypes.css|articulated-product-20261006.css/);
    }
  }
});


