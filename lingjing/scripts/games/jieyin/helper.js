// helper.js — 结印 as a HELPER inside another game: 守墙关's spells (Hanli 2026-10-21: 「可以在守墙里面, 让用户结印发火弹帮忙
// 打怪」「放进去」). The host game keeps playing as it always does; this adds one 结印 button in a corner of its field,
// lit only while the host offers spells (守墙关: a 大妖 on the field), and — once the player taps it — the camera and the
// shared hand hint docked there. Two kinds of move (the host's rows, doc/games.md § 手势斗法):
//   jab   a 小招: a shape held at the camera (judge3d.js, so it counts pointing at the lens) and a jab toward it
//         (zhidian/poke.js) — 剑诀 + 戳 → 飞剑. Knobs: zhidian.json `judge3d` · `poke` (the same data, not a copy).
//   seq   a 大招: a jieyin.json move's seals in order (sequence.js), this device's set and, on a Mac, the phone's one-hand
//         set too; it fires on the last seal; a wrong seal held mid-way is 走火 (`fizzle()`).
//
//   offerSeals({ host, lang, moves, state, cast, fizzle, say, call, first, idle, paused, aside, env, feed }) → Promise<{ close(), camera, wanted } | null>
//     moves   the host's move rows offered here (already past their `from` gate): { id, name, seals | jieyin, motion }
//     state() → { on, ready, cool, coolOf }   on: spells offered now · ready: one may fly now · cool: s of rest left
//     cast(id) → true when it flew           say(text): one short line in the host (the cues)
//     call() → the line when spells are first offered (守墙关: 「大妖来了——结印！」)   first: the 小招's first-time line
//     idle    s ready with no seal tried before the camera closes itself
//   (`available` and `eyeOf` stand in for eye.js's in a test.)
//
// null — and NOTHING drawn — when 结印 cannot be offered (no camera API, no camera, no WebGL; eye.js `available`) or no
// move can be made here: the host plays exactly as it does without it (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打」).
// No tap stand-in. A refused camera or a failed model after the tap takes the button away too.
//
// Rest most of the time (Hanli 10-21: 「别让用户太累」「让用户大部分时间在休息」): while the host's `state().on` is false
// the button is hidden and the camera off; while a spell cools the frame steps away (nothing asks for the hand), the
// button shows the rest burning down (「歇一歇」) and the camera idles at a low rate; ready → the frame is back, the
// button glows. The camera runs at the jab's rate (poke.fps) only while a jab move is armed. Ready but no seal tried for
// `idle` s → the camera closes itself (a tap opens it again).
//
// The camera: on only after the button; off (its tracks) while `paused()`, while the page is hidden, when the host stops
// offering, and for good on close(). No camera picture (Hanli 10-21: 「最好不显示摄像头」): the video stays off-screen.
// While `aside()` (the host's own modal, a card pick) the button and the frame step aside. All on the device.
//
// Dev only: `feed` (the host passes `?dev=1&feed=1`) offers it without a camera; hands come from the console
// (`window.jieyinFeed(world, image?)`) — the live check's way to cast.
import { available as cameraHere, dropModel, openEye } from './eye.js';
import { sealOf } from './judge.js';
import { sealOf3d } from './judge3d.js';
import { expected, progress, start, step } from './sequence.js';
import { handHint } from './hint.js';
import { eyeFor, sequenceFor, setOf } from './sets.js';
import { poke, sizeOf, startPoke } from '../zhidian/poke.js';

const LEVELS = new URL('../../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const ZHIDIAN = new URL('../../../worlds/jiuding/levels/zhidian.json', import.meta.url);
const CSS = { jieyinCss: new URL('./jieyin.css', import.meta.url), jieyinHelper: new URL('./helper.css', import.meta.url) }; // the hint's look, then the dock's
const SEEN = 'lingjing.jieyin.first'; // this device has had the first-time line (never the save)

export const WORDS = {
  zh: { btn: '结印', label: '对着摄像头结印', off: '收印', asking: '请允许摄像头……', rest: '歇一歇', ready: '好了，结印！' },
  en: { btn: 'Seals', label: 'Make hand seals at the camera', off: 'Stop', asking: 'Allow the camera…', rest: 'Rest', ready: 'Ready — make the seals!' },
};
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The host's rows as this device makes them: a jab (its seal) or a sequence (this set's, plus the phone's one-hand
    set on a Mac — 「单手的也能用」); a row with no seals here is dropped. */
export function movesFor(kit, rows, env = globalThis) {
  const set = setOf(kit, { matchMedia: env.matchMedia?.bind(env), search: env.location?.search ?? '' });
  const one = (kit.sets ?? []).find((s) => s.hands === 1) ?? set;
  const made = (row) => {
    const seal = row.seals?.[0];
    if (row.motion === 'jab') return kit.seals[seal] ? { id: row.id, row, kind: 'jab', seal, only: { [seal]: kit.seals[seal] } } : null; // the one shape it reads
    const seqs = row.seals ? [row.seals] : [sequenceFor(kit, row.jieyin, set), sequenceFor(kit, row.jieyin, one)];
    const sequences = seqs.filter((q, i) => q.length && q.every((id) => kit.seals[id]) && seqs.findIndex((o) => o.join() === q.join()) === i);
    return sequences.length ? { id: row.id, row, kind: 'seq', sequences } : null;
  };
  return { set, moves: rows.map(made).filter(Boolean) };
}

/** Big moves' seals, all in step: each candidate sequence its own state; one that casts wins, all start over. A 走火
    counts only when the one that broke was under way and no other is. → { states, cast: move id | null, fizzle } */
export function stepAll(states, seal, dt, knobs) {
  const out = states.map((c) => ({ ...c, ...step(c.s, seal, dt, knobs) }));
  const cast = out.find((c) => c.events.some((e) => e.type === 'cast'));
  if (cast) return { states: out.map((c) => ({ ...c, s: start({ mode: 'sequence', sequence: c.seq }) })), cast: cast.id, fizzle: false };
  const broke = out.some((c, i) => states[i].s.at > 0 && c.events.some((e) => e.type === 'fizzle'));
  const going = out.some((c) => c.state.at > 0);
  return { states: out.map((c) => ({ ...c, s: c.state })), cast: null, fizzle: broke && !going };
}

function loadCss(doc) {
  for (const [key, url] of Object.entries(CSS)) {
    if (doc.querySelector(`link[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) continue;
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = url.href;
    l.dataset[key] = '';
    doc.head.append(l);
  }
}

function buttonEl(doc, w) {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'jyh-btn';
  b.hidden = true;
  b.title = w.label;
  b.setAttribute('aria-label', w.label);
  b.innerHTML = `<b class="jyh-word">${plain(w.btn)}</b>`;
  return b;
}

function dockEl(doc, w) {
  const d = doc.createElement('div');
  d.className = 'jyh-dock';
  d.hidden = true;
  d.innerHTML = `<div class="jyh-hint"></div><b class="jyh-state"></b><ol class="jyh-chips"></ol>`
    + `<button type="button" class="jyh-off" aria-label="${plain(w.off)}">×</button><video class="jyh-video" playsinline muted></video>`;
  return d;
}

const firstTime = (win) => { try { if (win.localStorage?.getItem(SEEN)) return false; win.localStorage?.setItem(SEEN, '1'); return true; } catch { return false; } };

export async function offerSeals({ host, lang = 'zh', moves: rows = [], state = () => ({ on: true, ready: true, cool: 0, coolOf: 0 }),
  cast = () => false, fizzle = () => {}, say = () => {}, call = () => null, first = null, idle = 60, paused = () => false, aside = () => false,
  env = globalThis, feed = false, available = cameraHere, eyeOf = openEye } = {}) {
  if (!rows.length || (!feed && !(await available(env)))) return null;
  const [kit, zd] = await Promise.all([fetch(LEVELS).then((r) => r.json()), fetch(ZHIDIAN).then((r) => r.json())]);
  const doc = host.ownerDocument, win = doc.defaultView ?? env;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = WORDS[lang], { set, moves } = movesFor(kit, rows, win);
  if (!moves.length) return null;
  loadCss(doc);

  const btn = buttonEl(doc, w), dock = dockEl(doc, w);
  host.append(btn, dock);
  const $ = (s) => dock.querySelector(s);
  for (const el of [btn, dock]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
  const hint = handHint($('.jyh-hint'), { lang, size: 'compact', seals: kit.seals, knobs: kit.hint });

  const jab = moves.find((m) => m.kind === 'jab');
  const fresh = () => moves.filter((m) => m.kind === 'seq').flatMap((m) => m.sequences.map((seq) => ({ id: m.id, seq, s: start({ mode: 'sequence', sequence: seq }) })));
  const big = moves.flatMap((m) => (m.kind === 'seq' ? m.sequences.flat() : []));
  const need = eyeFor(kit, set, big.length ? big : [jab?.seal].filter(Boolean));
  let seqs = fresh(), hands = [], image = [], aspect = 4 / 3, wanted = false, cam = 'off', gen = 0, closed = false;
  let loop = 0, last = 0, tried = 0, sealT = -Infinity, pk = startPoke(), wasOn = false, wasReady = false, armed = false, told = false;
  const video = $('video');

  // One camera frame: the hands for the hint and the big moves; the 小招's shape and jab, at the frame's own time.
  const see = (r, t = win.performance.now()) => {
    hands = r.world ?? [];
    image = r.image ?? [];
    aspect = (video.videoWidth / video.videoHeight) || aspect;
    if (!jab || !armed) return;
    const k = hands.findIndex((h) => sealOf3d([h], jab.only, zd.judge3d, t - sealT <= zd.judge3d.graceMs ? jab.seal : null) === jab.seal);
    if (k >= 0) { sealT = t; tried = t; }
    const hand = image[k >= 0 ? k : 0];
    const p = poke(pk, hand ? { t, size: sizeOf(hand), sealed: t - sealT <= zd.judge3d.graceMs } : { t }, zd.poke);
    pk = p.state;
    if (p.shot && cast(jab.id)) { seqs = fresh(); pk = startPoke(); }
  };
  const eye = feed ? null : eyeOf({ video, onHands: (r) => see(r), env: win, ...need });

  // The camera: 'off' → 'asking' → 'on'. A pause while asking wins (eye.js); a refusal or a failed model ends it here.
  const gone = (why) => { console.warn('[jieyin]', why?.reason ?? why); close(); };
  const camera = (run) => {
    if (!eye || run === (cam !== 'off')) return;
    const mine = (gen += 1);
    if (!run) { cam = 'off'; eye.pause(); hands = []; image = []; return; }
    cam = 'asking';
    eye.start().then(() => { if (mine === gen && !closed) cam = 'on'; }, gone);
  };
  const rate = (fast) => eye?.setFps?.(fast ? zd.poke.fps : need.fps);

  // The big moves: the leading candidate's seals as chips, its next seal the hint's target (else the 小招's shape).
  const lead = () => seqs.reduce((m, c) => (!m || c.s.at > m.s.at ? c : m), null);
  const chips = (c) => {
    const ol = $('.jyh-chips'), key = c ? `${c.id}|${c.seq.join()}` : '';
    if (ol.dataset.key !== key) { ol.dataset.key = key; ol.innerHTML = c ? c.seq.map((id) => `<li>${plain(kit.seals[id]?.glyph ?? '')}</li>`).join('') : ''; }
    ol.querySelectorAll('li').forEach((el, i) => { el.classList.toggle('is-done', i < c.s.at); el.classList.toggle('is-next', i === c.s.at); });
  };

  const hud = (st) => {
    btn.hidden = !st.on || (wanted && st.ready);
    dock.hidden = !(wanted && st.on && st.ready);
    btn.classList.toggle('is-ready', st.ready);
    btn.classList.toggle('is-rest', st.cool > 0);
    btn.style.setProperty('--k', st.coolOf ? String(Math.min(1, st.cool / st.coolOf)) : '0');
    $('.jyh-state').textContent = cam === 'asking' ? w.asking : '';
    btn.querySelector('.jyh-word').textContent = st.cool > 0 ? w.rest : w.btn;
    if (dock.hidden) return;
    const now = win.performance.now(), c = lead(), going = Boolean(c && (c.s.at > 0 || !jab));
    chips(going ? c : null);
    if (going) {
      const want = expected(c.s), right = Boolean(c.s.cur && c.s.cur === want);
      hint.update({ image, aspect, target: want, progress: right ? progress(c.s, kit.judge) : 0, right, now });
      return;
    }
    const held = now - sealT <= zd.judge3d.graceMs; // the 小招: its shape held, waiting for the jab
    hint.update({ image, aspect, target: jab.seal, progress: Number(held), right: held, now });
  };

  // The cues: the host's line when spells are first offered (a 大妖 out), a short one when the rest is over, and the
  // first-time line for the 小招 once on this device.
  const cues = (st) => {
    if (st.on && !wasOn) { const line = call(); if (line) say(line); btn.classList.add('is-call'); }
    if (!st.on) btn.classList.remove('is-call');
    if (st.on && st.ready && !wasReady && wasOn && wanted) say(w.ready);
    if (!told && wanted && st.ready && jab && first) { told = true; if (firstTime(win)) say(tr(first, lang)); }
    if (!st.on && wasOn) { wanted = false; seqs = fresh(); }
    wasOn = st.on;
    wasReady = st.ready;
  };

  // Each frame: the cues, the camera (on while wanted, offered, not paused, page seen), its rate, the big moves' seals
  // (only when a spell may fly), the idle close.
  const tick = () => {
    if (closed) return;
    const now = win.performance.now(), dt = Math.min(100, now - last);
    last = now;
    const st = state(), away = aside();
    cues(st);
    const run = wanted && st.on && !paused() && !doc.hidden;
    camera(run);
    for (const el of [btn, dock]) el.classList.toggle('is-aside', away);
    const fast = Boolean(run && st.ready && jab && !away);
    if (fast !== armed) { armed = fast; rate(fast); pk = startPoke(); }
    if (run && st.ready && !away) {
      const seal = seqs.length ? sealOf(hands, kit.seals, kit.judge, lead()?.s.cur, { image, aspect }) : null;
      if (seal) tried = now;
      if (seqs.length) {
        const r = stepAll(seqs, seal, dt, kit.judge);
        seqs = r.states;
        if (r.cast) { if (!cast(r.cast)) seqs = fresh(); }
        if (r.fizzle) { fizzle(); hint.fizzle(); }
      }
      if (wanted && now - tried > idle * 1000) { wanted = false; seqs = fresh(); }
    } else tried = now;
    hud(st);
    loop = win.requestAnimationFrame(tick);
  };
  const seen = () => { if (doc.hidden) camera(false); }; // a hidden page runs no frames: off now, back via tick

  btn.addEventListener('click', () => { if (!state().on) return; wanted = !wanted; tried = win.performance.now(); seqs = fresh(); btn.classList.remove('is-call'); });
  $('.jyh-off').addEventListener('click', () => { wanted = false; seqs = fresh(); });
  doc.addEventListener('visibilitychange', seen);
  if (feed) win.jieyinFeed = (h, img = h, t) => { see({ world: h ?? [], image: img ?? [] }, t); aspect = 1; };
  last = win.performance.now();
  loop = win.requestAnimationFrame(tick);

  function close() {
    if (closed) return;
    closed = true;
    wanted = false;
    win.cancelAnimationFrame(loop);
    doc.removeEventListener('visibilitychange', seen);
    eye?.close();
    hint.destroy();
    if (feed && win.jieyinFeed) delete win.jieyinFeed;
    btn.remove();
    dock.remove();
    if (eye) dropModel();
  }
  return { close, get camera() { return cam; }, get wanted() { return wanted; } };
}
