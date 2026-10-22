// 施法特写 (games/texie.js): the landmark → finger-bone mapping on made-up hands (straight vs curled, the bend's
// direction checked through three.js's own Euler, the vendored bundle), the hand's turn, the panel's lifecycle, the
// cast rule, the ink placement, the no-camera path, and the module's camera / network rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHand } from '../scripts/games/jieyin/pose.js';
import { curlsOf, fingerTurns, handTurn, liveFrame, quatOf, restFrame, sideOf, turnBetween } from '../scripts/games/texie/fingers.js';
import { PANEL, panelStep, startPanel } from '../scripts/games/texie/panel.js';
import { placeHands, VIEW } from '../scripts/games/texie/ink.js';
import { botHands, castStep, cutinOf, meta, mount, startCaster, unavailableHtml } from '../scripts/games/texie.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const T = await import('../scripts/vendor/three-vrm-0.176.0-3.5.4.min.mjs');
const FINGERS = ['index', 'middle', 'ring', 'little'];
const open = () => buildHand({});
const fist = () => buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] });
const sum = (a) => a.reduce((t, x) => t + x, 0);

test('curls: an open hand reads straight, a fist folded at every joint, 剑诀 two straight and two folded', () => {
  const o = curlsOf(open()), f = curlsOf(fist()), j = curlsOf(buildHand({ curl: ['ring', 'pinky'] }));
  for (const k of FINGERS) {
    assert.ok(sum(o[k]) < 0.25, `${k} open: ${sum(o[k]).toFixed(2)}`);
    assert.ok(sum(f[k]) > 2.5, `${k} fist: ${sum(f[k]).toFixed(2)}`);
    f[k].forEach((a, i) => assert.ok(a > 0.6, `${k} joint ${i} folds in a fist`));
  }
  assert.ok(sum(o.thumb) < 0.4, 'the open thumb straight');
  assert.ok(sum(f.thumb) > 1, 'the fist\'s thumb folded over');
  assert.ok(sum(j.index) < 0.25 && sum(j.middle) < 0.25 && sum(j.ring) > 2.5 && sum(j.little) > 2.5, '剑诀');
});

// A finger bone at rest (the normalized rig, T-pose): pointing out along the arm, the palm down. Its tip after the
// mapping's turns, joint by joint (each local turn applied down the chain) — closer to the palm side (−Y) when curled.
function tipOf(turns, side, finger) {
  const P = side === 'left' ? 'left' : 'right', x = side === 'left' ? 1 : -1;
  const names = finger === 'thumb' ? ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'] : [`${finger[0].toUpperCase()}${finger.slice(1)}Proximal`, `${finger[0].toUpperCase()}${finger.slice(1)}Intermediate`, `${finger[0].toUpperCase()}${finger.slice(1)}Distal`];
  const bone = finger === 'thumb' ? new T.Vector3(x, 0, 1).normalize() : new T.Vector3(x, 0, 0);
  const q = new T.Quaternion(), tip = new T.Vector3();
  for (const n of names) {
    q.multiply(new T.Quaternion().setFromEuler(new T.Euler(...turns[`${P}${n}`])));
    tip.add(bone.clone().applyQuaternion(q));
  }
  return tip;
}

test('finger turns on the VRM rig: a straight hand stays straight; a curled one folds toward the palm, each hand its own way', () => {
  for (const side of ['right', 'left']) {
    const straight = fingerTurns(curlsOf(open()), side), curled = fingerTurns(curlsOf(fist()), side);
    assert.equal(Object.keys(curled).length, 15, 'all 15 finger bones');
    for (const n of Object.keys(curled)) assert.ok(n.startsWith(side), n);
    for (const k of FINGERS) {
      const s = tipOf(straight, side, k), c = tipOf(curled, side, k);
      assert.ok(Math.abs(s.x) > 2.9 && Math.abs(s.y) < 0.3, `${side} ${k} straight: along the arm (${s.toArray().map((v) => v.toFixed(2))})`);
      assert.ok(c.y < -1, `${side} ${k} curled: toward the palm (${c.toArray().map((v) => v.toFixed(2))})`);
      assert.ok(Math.abs(c.x) < Math.abs(s.x) - 1.5, `${side} ${k} curled: folded back`);
    }
    // The thumb folds across the palm: toward the little finger's side (−Z) and the palm (−Y).
    const ts = tipOf(straight, side, 'thumb'), tc = tipOf(curled, side, 'thumb');
    assert.ok(tc.z < ts.z - 0.5 && tc.y < ts.y, `${side} thumb across the palm`);
  }
});

test('the hand\'s turn: none when held as the T-pose; a right hand palm to the camera, fingers up → palm forward, fingers up', () => {
  assert.deepEqual(turnBetween(restFrame('right'), restFrame('right')).map((v) => +v.toFixed(6) + 0), [0, 0, 0, 1]);
  // pose.js's hand is a left hand, palm to the camera; mirrored it is the right one.
  const right = open().map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  const q = new T.Quaternion(...handTurn(right, 'right'));
  const fingers = new T.Vector3(-1, 0, 0).applyQuaternion(q), palm = new T.Vector3(0, -1, 0).applyQuaternion(q);
  assert.ok(fingers.y > 0.95, `fingers up (${fingers.toArray().map((v) => v.toFixed(2))})`);
  assert.ok(palm.z > 0.95, `palm forward, away from her (${palm.toArray().map((v) => v.toFixed(2))})`);
  const [d, n] = liveFrame(right);
  assert.ok(Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) < 1e-9, 'the frame is square');
  assert.deepEqual(quatOf([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), [0, 0, 0, 1]);
});

test('which of her hands: the handedness, else the picture\'s side (unmirrored: the player\'s right hand shows on the left)', () => {
  assert.equal(sideOf('Right'), 'right');
  assert.equal(sideOf('Left'), 'left');
  assert.equal(sideOf(null, [{ x: 0.3 }]), 'right');
  assert.equal(sideOf(undefined, [{ x: 0.7 }]), 'left');
});

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
  const sums = [0, 500, 1000, 1500, 2000].map((t) => sum(curlsOf(botHands(t).world[0]).index));
  assert.ok(Math.min(...sums) < 0.3 && Math.max(...sums) > 2.5, sums.join(' '));
  assert.equal(botHands(0).handed[0], 'Right');
});

test('which look: the link, else the row\'s data; ink by default', () => {
  assert.equal(cutinOf({ cutin: 'vrm' }), 'vrm');
  assert.equal(cutinOf({}, '?dev=1&cutin=vrm'), 'vrm');
  assert.equal(cutinOf({ cutin: 'ink' }, '?cutin=vrm'), 'vrm');
  assert.equal(cutinOf({ cutin: 'vrm' }, '?cutin=ink'), 'ink');
  assert.equal(cutinOf({}, ''), 'ink');
  const rows = json('../worlds/jiuding/games.json').games.filter((g) => g.id === 'texie');
  assert.deepEqual(rows.map((r) => r.data.cutin), ['ink', 'vrm'], 'two tiles in the 游戏厅, one each');
  assert.ok(rows.every((r) => r.group === 'main' && r.mechanic === '结印' && !r.scene && !r.task), 'test-only: no scene, no task');
});

const canvasDoc = (gl) => ({ createElement: () => ({ getContext: () => (gl ? {} : null) }) });
test('no camera: one plain line, nothing to tap, no lead card — both looks', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(String(u)), 'utf8')) });
  try {
    for (const lang of ['zh', 'en']) for (const cutin of ['ink', 'vrm']) {
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

test('the module: the camera only through eye.js after 开始, off on pause / hidden / end; never shown; the model from the engine, never copied; nothing else from the network', () => {
  assert.equal(meta.name.zh, '施法特写');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en && meta.pause && meta.camera);
  const src = read('../scripts/games/texie.js'), vrm = read('../scripts/games/texie/vrm.js');
  const parts = ['fingers', 'panel', 'ink', 'vrm'].map((f) => read(`../scripts/games/texie/${f}.js`)).join('');
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
  assert.match(vrm, /MODEL_PATH = '\/yinyue\.vrm'/, 'the engine\'s model, by its served path');
  assert.match(vrm, /new URL\(url, win\.location\.origin\)/, 'from the page\'s own origin (9527)');
  assert.match(vrm, /deepDispose[\s\S]*forceContextLoss/, 'the GL context let go');
  assert.match(src, /import\('\.\/texie\/vrm\.js'\)/, 'the 3D bundle loaded only for the 3D look');
  const files = fs.readdirSync(new URL('../', import.meta.url), { recursive: true }).map(String);
  assert.ok(!files.some((f) => /\.vrm$/i.test(f) && !f.includes('node_modules')), 'no .vrm in the skill');
  // Everything vrm.js takes from the bundle is in it.
  const names = [...vrm.matchAll(/\bT\.([A-Za-z0-9]+)/g)].map((m) => m[1]);
  for (const n of new Set(names)) assert.ok(n in T, `the bundle exports ${n}`);
});
