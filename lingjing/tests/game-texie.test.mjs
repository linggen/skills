// 施法特写 (games/texie.js): the panel's lifecycle, the cast rule, the ink placement, the no-camera path, and the
// module's camera / network rules. Its 3D look (the VRM's finger bones, three.js) went 2026-10-27 (Hanli 10-21: 「3D的直接不用就行了」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHand } from '../scripts/games/jieyin/pose.js';
import { PANEL, panelStep, startPanel } from '../scripts/games/texie/panel.js';
import { placeHands, VIEW } from '../scripts/games/texie/ink.js';
import { botHands, castStep, cutinOf, meta, mount, startCaster, unavailableHtml } from '../scripts/games/texie.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const FINGERS = ['index', 'middle', 'ring', 'little'];
const open = () => buildHand({});
const fist = () => buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] });
const sum = (a) => a.reduce((t, x) => t + x, 0);

test('the panel: in on a hand, a cast thrusts, fades after, rests; hands gone fade it; a cast while down still shows', () => {
  let s = startPanel(), ev = [];
  const at = (now, seen, cast = false) => { const r = panelStep(s, { now, seen, cast }); s = r.state; ev.push(...r.events); return s.phase; };
  assert.equal(at(0, false), 'hidden');
  assert.equal(at(100, true), 'in');
  assert.equal(at(100 + PANEL.inMs, true), 'shown');
  assert.equal(at(1000, true, true), 'thrust');
  assert.equal(at(1000 + PANEL.thrustMs - 1, true, true), 'thrust', 'no second thrust mid-thrust');
  assert.equal(at(1000 + PANEL.thrustMs, true), 'shown');
  const t0 = 1000 + PANEL.thrustMs;
  assert.equal(at(t0 + PANEL.afterMs, true), 'out', 'fades after a cast, hands up or not');
  assert.equal(at(t0 + PANEL.afterMs + PANEL.outMs, true), 'rest');
  assert.equal(at(t0 + PANEL.afterMs + PANEL.outMs + PANEL.restMs, true), 'hidden');
  assert.equal(at(t0 + PANEL.afterMs + PANEL.outMs + PANEL.restMs + 16, true), 'in', 'back on a hand');
  assert.deepEqual(ev, ['show', 'thrust', 'hide', 'show']);
  // Hands gone.
  s = startPanel(); ev = [];
  at(0, true); at(PANEL.inMs, true); at(500, false);
  assert.equal(at(PANEL.inMs + PANEL.goneMs - 1, false), 'shown', 'a frame or two lost is nothing');
  assert.equal(at(PANEL.inMs + PANEL.goneMs, false), 'out');
  assert.deepEqual(ev, ['show', 'gone']);
  // A push before the panel is in.
  s = startPanel(); ev = [];
  assert.equal(at(0, true, true), 'thrust');
  assert.deepEqual(ev, ['show', 'thrust']);
});

test('the cast: a seal held holdMs casts once (it must change or go), a push casts, none within coolMs', () => {
  const k = json('../worlds/jiuding/levels/texie.json').cast;
  let s = startCaster(), casts = [];
  const step = (t, seal, size = 1) => { const r = castStep(s, { t, dt: 33, seal, size }, k); s = r.state; if (r.cast) casts.push([t, r.cast]); };
  for (let t = 0; t <= 1000; t += 33) step(t, 'zhang');
  assert.deepEqual(casts, [], 'an open palm held only shows the hands (掌 is half of 推掌)');
  s = startCaster();
  for (let t = 0; t <= 2000; t += 33) step(t, 'jian');
  assert.deepEqual(casts.map((c) => c[1]), ['seal'], 'one cast for one held seal');
  assert.ok(casts[0][0] >= k.holdMs && casts[0][0] < k.holdMs + 66);
  step(2033, null); for (let t = 2066; t <= 2600; t += 33) step(t, 'jian');
  assert.equal(casts.length, 2, 'let go and made again: casts again');
  // A push: the hand's size grows fast.
  casts = []; s = startCaster();
  for (let t = 0; t < 400; t += 33) step(t, null, 1);
  for (let t = 400, z = 1; t < 700; t += 33, z *= 1.06) step(t, null, z);
  assert.deepEqual(casts.map((c) => c[1]), ['push']);
  // Cooled: a seal right after a push waits.
  for (let t = 700; t < 700 + k.coolMs - 400; t += 33) step(t, 'jian', 2);
  assert.equal(casts.length, 1, 'nothing within coolMs');
});

test('ink placement: one hand big and before his chest; two keep their sides; the hand follows the player a little', () => {
  const b = botHands(0);
  const [h] = placeHands(b.image);
  assert.equal(h.pts.length, 21);
  assert.ok(Math.abs(h.unit - VIEW.handLen) < 1e-6, 'wrist → middle root is handLen');
  const mid = h.pts.reduce((a, p) => a + p.x, 0) / 21;
  assert.ok(Math.abs(mid - VIEW.chest.x) < VIEW.follow, 'in front of his chest');
  const left = b.image[0].map((p) => ({ ...p, x: p.x - 0.25 })), right = b.image[0].map((p) => ({ ...p, x: p.x + 0.25 }));
  const two = placeHands([left, right]);
  // Mirrored: the picture's left hand is drawn on the right.
  assert.ok(two[0].wrist.x > two[1].wrist.x, 'mirrored, as in a mirror');
  const moved = placeHands([b.image[0].map((p) => ({ ...p, x: p.x - 0.3 }))])[0];
  assert.ok(moved.wrist.x > h.wrist.x && moved.wrist.x - h.wrist.x < VIEW.follow, 'follows the player, damped');
  assert.deepEqual(placeHands([]), []);
});

test('the dev bot\'s hand opens, closes into a fist, and pushes', () => {
  const tips = [0, 500, 1000, 1500, 2000].map((t) => JSON.stringify(botHands(t).world[0][8]));
  assert.ok(new Set(tips).size > 1, 'the hand moves');
  assert.equal(botHands(0).handed[0], 'Right');
});

test('one look, ink: the 3D one is gone (Hanli 10-21: 「3D的直接不用就行了」)', () => {
  assert.equal(cutinOf({ cutin: 'vrm' }, '?cutin=vrm'), 'ink');
  const rows = json('../worlds/jiuding/games.json').games.filter((g) => g.id === 'texie');
  assert.deepEqual(rows.map((r) => r.data.cutin), ['ink'], 'one tile in the 游戏厅');
  assert.ok(!fs.existsSync(new URL('../scripts/games/texie/vrm.js', import.meta.url)) && !fs.existsSync(new URL('../scripts/vendor/three-vrm-0.176.0-3.5.4.min.mjs', import.meta.url)), 'no 3D code left');
  assert.ok(rows.every((r) => r.group === 'seal' && r.mechanic === '结印' && !r.scene && !r.task), 'test-only: no scene, no task');
});

const canvasDoc = (gl) => ({ createElement: () => ({ getContext: () => (gl ? {} : null) }) });
test('no camera: one plain line, nothing to tap, no lead card', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(String(u)), 'utf8')) });
  try {
    for (const lang of ['zh', 'en']) for (const cutin of ['ink']) {
      const win = { location: { search: '?dev=1' }, navigator: {}, document: canvasDoc(true), performance: { now: () => 0 } };
      const doc = { defaultView: win, head: { append() {} }, querySelector: () => null, createElement: () => ({ dataset: {} }) };
      const container = { ownerDocument: doc, innerHTML: '' };
      const r = await mount(container, { lang, data: { cutin }, shell: { lead() { throw new Error('no lead card without a camera'); } } });
      assert.deepEqual(r, { won: false, left: true });
      assert.equal(container.innerHTML, unavailableHtml(lang));
      assert.match(container.innerHTML, lang === 'en' ? /camera/ : /摄像头/);
    }
  } finally { globalThis.fetch = realFetch; }
});

test('the module: the camera only through eye.js after 开始, off on pause / hidden / end; never shown; nothing from the network', () => {
  assert.equal(meta.name.zh, '施法特写');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en && meta.pause && meta.camera);
  const src = read('../scripts/games/texie.js');
  const parts = ['panel', 'ink'].map((f) => read(`../scripts/games/texie/${f}.js`)).join('');
  assert.doesNotMatch(src + parts, /getUserMedia/, 'the camera only through eye.js');
  assert.doesNotMatch(src + parts, /https?:\/\//, 'nothing from the network');
  assert.ok(src.indexOf('shell.lead(') < src.indexOf('eye.start()'), 'the lead card (开始) before the camera');
  assert.match(src, /const off = \(\) => \{ eye\.pause\(\);/, 'paused or hidden: the camera off');
  assert.match(src, /if \(doc\.hidden\) off\(\)/);
  assert.match(src, /eye\?\.close\(\)/, 'ended or left: closed');
  assert.match(src, /view\?\.destroy\(\)/, 'the close-up let go at the end');
  assert.doesNotMatch(src + parts, /drawImage|srcObject/, 'the camera\'s picture is never drawn');
  assert.match(read('../scripts/games/texie/texie.css'), /\.tx-eye \{[^}]*opacity: 0;/, 'the video element only feeds the model');
  assert.match(src, /q\.get\('dev'\) === '1' && q\.get\('feed'\) === '1'/, 'the feed only on a dev link');
  const files = fs.readdirSync(new URL('../', import.meta.url), { recursive: true }).map(String);
  assert.ok(!files.some((f) => /\.vrm$/i.test(f) && !f.includes('node_modules')), 'no .vrm in the skill');
});
