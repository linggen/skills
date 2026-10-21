// helper.js — 结印 as a HELPER inside another game: 守墙关's spells (Hanli 2026-10-21: 「可以在守墙里面, 让用户结印发火弹帮忙
// 打怪」「放进去」). The host game keeps playing as it always does; this adds one 结印 button in a corner of its field,
// lit only while the host offers spells (守墙关: a 大妖 on the field), and — once the player taps it — the camera and the
// shared hand hint docked there. The hands are read by 手势斗法 (duel.js: 小招 shape + thrust, 法术 文 → 扣 → 推, the
// 大招's seals, 灵力 — doc/games.md § 手势斗法); its cast events go to the host, which decides what they do.
//
//   offerSeals({ host, lang, moves, state, cast, say, call, first, idle, fastFps, paused, aside, env, feed }) → Promise<{ close(), camera, wanted } | null>
//     moves   the move ids the host offers here (already past their `from` gate); a cast of any other is dropped
//     state() → { on, ready, cool, coolOf }   on: spells offered now · ready: one may fly now · cool: s of rest left
//     cast(event) → true when it flew        say(text): one short line in the host (the cues)
//     call() → the line when spells are first offered (a 大妖 out; 灵力 filled then)   first: the 小招's first-time line
//     idle    s ready with no hand raised before the camera closes itself · fastFps: the eye's rate while a 小招 is armed
//   (`available` and `eyeOf` stand in for eye.js's in a test.)
//
// null — and NOTHING drawn — when 结印 cannot be offered (no camera API, no camera, no WebGL; eye.js `available`) or no
// move offered is one 手势斗法 knows: the host plays exactly as it does without it (Hanli 10-21: 「没摄像头时, 就不用」).
// No tap stand-in. A refused camera or a failed model after the tap takes the button away too.
//
// Rest most of the time (Hanli 10-21: 「别让用户太累」「让用户大部分时间在休息」): while `state().on` is false the button is
// hidden and the camera off; while the host's rest runs or 灵力 is short of the cheapest move, the frame steps away
// (nothing asks for the hand: the duel sees no hands, 灵力 still refills), the button shows the rest burning down
// (「歇一歇」) and the camera idles at its slow rate; ready → the frame is back, the button glows.
//
// The camera: on only after the button; off (its tracks) while `paused()`, while the page is hidden, when the host stops
// offering, and for good on close(). No camera picture (Hanli 10-21: 「最好不显示摄像头」): the video stays off-screen.
// While `aside()` (the host's own modal, a card pick) the button and the frame step aside. All on the device.
//
// Dev only: `feed` (the host passes `?dev=1&feed=1`) offers it without a camera; hands from the console
// (`window.jieyinFeed(world, image?, handed?)`) — the live check's way to cast.
import { available as cameraHere, dropModel, openEye } from './eye.js';
import { duelFill, duelStart, duelStep } from './duel.js';
import { heldAt } from './spell.js';
import { handHint } from './hint.js';
import { eyeFor, sequenceFor, setOf } from './sets.js';

const LEVELS = new URL('../../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = { jieyinCss: new URL('./jieyin.css', import.meta.url), jieyinHelper: new URL('./helper.css', import.meta.url) }; // the hint's look, then the dock's
const SEEN = 'lingjing.jieyin.first'; // this device has had the first-time line (never the save)

export const WORDS = {
  zh: { btn: '结印', label: '对着摄像头结印', off: '收印', asking: '请允许摄像头……', rest: '歇一歇', ready: '好了，结印！' },
  en: { btn: 'Seals', label: 'Make hand seals at the camera', off: 'Stop', asking: 'Allow the camera…', rest: 'Rest', ready: 'Ready — make the seals!' },
};
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The offered ids by 手势斗法's tier (xiao · fa · da); an id it does not know is left out. */
export function tiersOf(kit, ids) {
  const d = kit.doufa ?? {}, tier = (id) => (d.xiao?.[id] ? 'xiao' : d.fa?.includes(id) ? 'fa' : d.da?.[id] ? 'da' : null);
  const out = { xiao: [], fa: [], da: [] };
  for (const id of ids) { const t = tier(id); if (t) out[t].push(id); }
  return out;
}

/** 灵力 short of the cheapest offered tier: how far, 0 (enough) … 1 (none). */
export function shortOf(lingli, cost, tiers) {
  const cheapest = Math.min(...Object.keys(tiers).filter((t) => tiers[t].length).map((t) => cost[t] ?? 0));
  return Number.isFinite(cheapest) && cheapest > 0 ? Math.max(0, 1 - lingli.now / cheapest) : 0;
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

export async function offerSeals({ host, lang = 'zh', moves = [], state = () => ({ on: true, ready: true, cool: 0, coolOf: 0 }),
  cast = () => false, say = () => {}, call = () => null, first = null, idle = 60, fastFps = 30, paused = () => false, aside = () => false,
  env = globalThis, feed = false, available = cameraHere, eyeOf = openEye } = {}) {
  if (!moves.length || (!feed && !(await available(env)))) return null;
  const kit = await fetch(LEVELS).then((r) => r.json());
  const tiers = tiersOf(kit, moves);
  if (!tiers.xiao.length && !tiers.fa.length && !tiers.da.length) return null;
  const doc = host.ownerDocument, win = doc.defaultView ?? env;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = WORDS[lang], set = setOf(kit, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' });
  loadCss(doc);

  const btn = buttonEl(doc, w), dock = dockEl(doc, w);
  host.append(btn, dock);
  const $ = (s) => dock.querySelector(s);
  for (const el of [btn, dock]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, (e) => e.stopPropagation());
  const hint = handHint($('.jyh-hint'), { lang, size: 'compact', seals: kit.seals, knobs: kit.hint });

  const offered = new Set(moves), D = kit.doufa;
  const bigId = tiers.da[0] ?? null, bigSeq = bigId ? sequenceFor(kit, D.da[bigId].move, set) : [];
  const shape = tiers.xiao.map((id) => D.xiao[id].shape).find((s) => kit.seals[s]) ?? null; // the hint's rest target: the 小招's shape
  const need = eyeFor(kit, set, bigSeq);
  let duel = duelStart(kit, { set }), held = [], hands = [], image = [], handed = [], aspect = 4 / 3;
  let wanted = false, cam = 'off', gen = 0, closed = false, loop = 0, last = 0, tried = 0, wasOn = false, wasReady = false, fast = null, told = false;
  const video = $('video');
  const see = (r) => { hands = r.world ?? []; image = r.image ?? []; handed = r.handed ?? []; aspect = (video.videoWidth / video.videoHeight) || aspect; };
  const eye = feed ? null : eyeOf({ video, onHands: see, env: win, ...need, handedSwap: kit.orient?.handedSwap ?? true });

  // The camera: 'off' → 'asking' → 'on'. A pause while asking wins (eye.js); a refusal or a failed model ends it here.
  const gone = (why) => { console.warn('[jieyin]', why?.reason ?? why); close(); };
  const camera = (run) => {
    if (!eye || run === (cam !== 'off')) return;
    const mine = (gen += 1);
    if (!run) { cam = 'off'; eye.pause(); hands = []; image = []; handed = []; return; }
    cam = 'asking';
    eye.start().then(() => { if (mine === gen && !closed) cam = 'on'; }, gone);
  };
  const rate = (quick) => { if (quick !== fast) { fast = quick; eye?.setFps?.(quick ? fastFps : need.fps); } };

  // The 大招 under way (two of its seals made — one alone is any 推掌): its seals as chips, its next seal the target.
  const bigAt = () => (bigId ? duel.big.find((b) => b.id === bigId)?.s.at ?? 0 : 0);
  const chips = (at) => {
    const ol = $('.jyh-chips'), on = at >= 2;
    if (ol.dataset.on !== String(on)) { ol.dataset.on = String(on); ol.innerHTML = on ? bigSeq.map((id) => `<li>${plain(kit.seals[id]?.glyph ?? '')}</li>`).join('') : ''; }
    ol.querySelectorAll('li').forEach((el, i) => { el.classList.toggle('is-done', i < at); el.classList.toggle('is-next', i === at); });
  };

  const hud = (st, ready, rest) => {
    btn.hidden = !st.on || (wanted && ready);
    dock.hidden = !(wanted && st.on && ready);
    btn.classList.toggle('is-ready', ready);
    btn.classList.toggle('is-rest', rest > 0);
    btn.style.setProperty('--k', String(Math.min(1, rest)));
    btn.querySelector('.jyh-word').textContent = rest > 0 ? w.rest : w.btn;
    $('.jyh-state').textContent = cam === 'asking' ? w.asking : '';
    if (dock.hidden) return;
    const at = bigAt(), next = at >= 2 ? bigSeq[at] : shape;
    chips(at);
    hint.update({ image, aspect, target: next, progress: 0, right: false, now: win.performance.now(), world: held.length || !next ? null : hands, handed, held: heldAt(held, handed, hands.length) });
  };

  // The cues: the host's line when spells are first offered (a 大妖 out: 灵力 filled), a short one when the rest is over,
  // and the 小招's first-time line once on this device.
  const cues = (st, ready) => {
    if (st.on && !wasOn) { duel = duelFill(duel, kit, 'boss'); const line = call(); if (line) say(line); btn.classList.add('is-call'); }
    if (!st.on) btn.classList.remove('is-call');
    if (st.on && ready && !wasReady && wasOn && wanted) say(w.ready);
    if (!told && wanted && ready && shape && first) { told = true; if (firstTime(win)) say(tr(first, lang)); }
    if (!st.on && wasOn) wanted = false;
    wasOn = st.on;
    wasReady = ready;
  };

  // Each frame: the cues, the camera (on while wanted, offered, not paused, page seen), the duel (hands only while a
  // move may fly; 灵力 refills either way), the casts to the host, the idle close.
  const tick = () => {
    if (closed) return;
    const now = win.performance.now(), dt = Math.min(100, now - last);
    last = now;
    const st = state(), away = aside(), rest = st.cool > 0 ? st.cool / (st.coolOf || st.cool) : shortOf(duel.lingli, D.lingli.cost, tiers);
    const ready = st.ready && rest <= 0;
    cues(st, ready);
    const run = wanted && st.on && !paused() && !doc.hidden;
    camera(run);
    for (const el of [btn, dock]) el.classList.toggle('is-aside', away);
    const live = run && ready && !away;
    rate(Boolean(live && tiers.xiao.length));
    if (st.on && !paused()) {
      const r = duelStep(duel, live ? { world: hands, image, handed, aspect, t: now } : { t: now }, dt, kit);
      duel = r.state;
      held = r.held;
      for (const e of r.events) if (e.type === 'cast' && offered.has(e.move)) cast(e);
      if (live && hands.length) tried = now;
    }
    if (!live) tried = now;
    else if (now - tried > idle * 1000) wanted = false;
    hud(st, ready, rest);
    loop = win.requestAnimationFrame(tick);
  };
  const seen = () => { if (doc.hidden) camera(false); }; // a hidden page runs no frames: off now, back via tick

  btn.addEventListener('click', () => { if (!state().on) return; wanted = !wanted; tried = win.performance.now(); btn.classList.remove('is-call'); });
  $('.jyh-off').addEventListener('click', () => { wanted = false; });
  doc.addEventListener('visibilitychange', seen);
  if (feed) win.jieyinFeed = (h, img = h, which = []) => { see({ world: h, image: img, handed: which }); aspect = 4 / 3; };
  if (feed) win.jieyinFeed.state = () => duel;
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
