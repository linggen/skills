// helper.js — 结印 as a HELPER inside another game: 守墙关's 火蛋 (Hanli 2026-10-21: 「可以在守墙里面, 让用户结印发火弹帮忙打怪」,
// 「放进去」). The host game keeps playing as it always does; this adds one small 结印 button in a corner of its field and,
// once the player taps it, the camera and a small hint frame docked there. The seals of one jieyin.json move (`moves`,
// this device's sequence: sets.js) made in order call the host's `cast()`; a wrong seal held calls its `fizzle()`.
//
//   offerSeals({ host, lang, move, cast, fizzle, cool, paused, env, feed }) → Promise<{ close(), camera, wanted } | null>
//   (`available` and `eyeOf` stand in for eye.js's in a test.)
//
// null — and NOTHING drawn — when 结印 cannot be offered (no camera API, no camera, no WebGL; eye.js `available`):
// the host plays exactly as it does without it (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打, 游戏像现在这样打就OK」). No tap
// stand-in. If the camera is refused or the model fails after the tap, the button and the frame go too.
//
// No camera picture is shown (Hanli 10-21: 「最好不显示摄像头」): the video stays off-screen for the model; the frame is
// the shared hand hint (hint.js handHint: the hands in ink where the camera sees them, edge / near / far cues, the seal
// to make, the hold ring), with the move's seals as chips under it.
//
// The camera: on only after the button; off (its tracks) while `paused()` (the shell's pause, the game's own), while
// the page is hidden, and for good on close() (the level ends, the player leaves). Back on by itself only if the
// player had it on. While `cool()` > 0 the seals are not counted. All on the device; nothing goes out.
//
// Dev only: `feed` (the host passes `?dev=1&feed=1`) offers it without a camera; hands come from the console
// (`window.jieyinFeed(hands)`, world points as judge.js reads them) — the live check's way to cast.
import { available as cameraHere, dropModel, openEye } from './eye.js';
import { sealOf } from './judge.js';
import { expected, progress, start, step } from './sequence.js';
import { handHint } from './hint.js';
import { eyeFor, sealsFor, sequenceFor, setOf } from './sets.js';

const LEVELS = new URL('../../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = { jieyinCss: new URL('./jieyin.css', import.meta.url), jieyinHelper: new URL('./helper.css', import.meta.url) }; // the hint's look, then the dock's

export const WORDS = {
  zh: { btn: '结印', label: '对着摄像头结印，放火蛋', off: '收印', asking: '请允许摄像头……', cool: (n) => `火蛋 ${n}`, ready: '火蛋在手' },
  en: { btn: 'Seals', label: 'Make hand seals at the camera for a fire egg', off: 'Stop', asking: 'Allow the camera…', cool: (n) => `Egg ${n}`, ready: 'Egg in hand' },
};
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The move's seals for this device (sets.js: one hand on a phone, both on a Mac) and the table they are judged from. */
export function sealsOf(kit, move, env = globalThis) {
  const set = setOf(kit, { matchMedia: env.matchMedia?.bind(env), search: env.location?.search ?? '' });
  return { set, sequence: sequenceFor(kit, move, set), seals: sealsFor(kit, set) };
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

function dockHtml(kit, sequence, w) {
  const chips = sequence.map((id, i) => `<li data-i="${i}">${plain(kit.seals[id]?.glyph ?? '')}</li>`).join('');
  return `<div class="jyh-hint"></div><b class="jyh-state"></b><ol class="jyh-chips">${chips}</ol>`
    + `<button type="button" class="jyh-off" aria-label="${plain(w.off)}">×</button>`
    + `<video class="jyh-video" playsinline muted></video>`;
}

export async function offerSeals({ host, lang = 'zh', move = 'huodan', cast = () => false, fizzle = () => {}, cool = () => 0,
  paused = () => false, env = globalThis, feed = false, available = cameraHere, eyeOf = openEye } = {}) {
  if (!feed && !(await available(env))) return null;
  const kit = await fetch(LEVELS).then((r) => r.json());
  const doc = host.ownerDocument, win = doc.defaultView ?? env;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = WORDS[lang], { set, sequence, seals } = sealsOf(kit, move, win);
  if (!sequence.length) return null;
  loadCss(doc);

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'jyh-btn';
  btn.textContent = w.btn;
  btn.title = w.label;
  btn.setAttribute('aria-label', w.label);
  const dock = doc.createElement('div');
  dock.className = 'jyh-dock';
  dock.hidden = true;
  dock.innerHTML = dockHtml(kit, sequence, w);
  host.append(btn, dock);
  const $ = (s) => dock.querySelector(s);
  const hint = handHint($('.jyh-hint'), { lang, size: 'compact', seals, knobs: kit.hint });
  // Taps on the button and the frame stay theirs (the field under them never takes them as a focus tap).
  for (const el of [btn, dock]) for (const t of ['pointerdown', 'pointerup', 'click']) el.addEventListener(t, (e) => e.stopPropagation());

  let s = start({ mode: 'sequence', sequence }), hands = [], image = [], aspect = 4 / 3, wanted = false, cam = 'off', gen = 0, closed = false;
  let charged = false, loop = 0, last = 0;
  const video = $('video');
  const seeHands = (r) => { hands = r.world; image = r.image; aspect = (video.videoWidth / video.videoHeight) || aspect; };
  const eye = feed ? null : eyeOf({ video, onHands: seeHands, env: win, ...eyeFor(kit, set, sequence) });

  // The camera: 'off' → 'asking' (the prompt, the model loading) → 'on'. A pause while asking wins (eye.js); a refusal
  // or a model that fails takes 结印 away for this level.
  const gone = (why) => { console.warn('[jieyin]', why?.reason ?? why); close(); };
  const camera = (run) => {
    if (!eye || run === (cam !== 'off')) return;
    const mine = (gen += 1);
    if (!run) { cam = 'off'; eye.pause(); hands = []; image = []; return; }
    cam = 'asking';
    eye.start().then(() => { if (mine === gen && !closed) cam = 'on'; }, gone);
  };

  const hud = () => {
    const want = expected(s), c = cool();
    dock.classList.toggle('is-cool', c > 0);
    dock.classList.toggle('is-ready', charged);
    dock.querySelectorAll('.jyh-chips li').forEach((el, i) => { el.classList.toggle('is-done', i < s.at); el.classList.toggle('is-next', i === s.at); });
    const right = Boolean(s.cur && s.cur === want);
    hint.update({ image, aspect, target: want, progress: right ? progress(s, kit.judge) : 0, right, now: win.performance.now() });
    $('.jyh-state').textContent = cam === 'asking' ? w.asking : charged ? w.ready : c > 0 ? w.cool(Math.ceil(c)) : '';
  };

  const act = (ev) => {
    if (ev.type === 'cast') charged = true;
    if (ev.type === 'fizzle') { fizzle(); hint.fizzle(); }
  };

  // Each frame: the camera follows `wanted` / paused / hidden; a charged egg flies the moment the host takes it; the
  // seals count only when nothing cools.
  const tick = () => {
    if (closed) return;
    const now = win.performance.now(), dt = Math.min(100, now - last);
    last = now;
    const run = wanted && !paused() && !doc.hidden;
    camera(run);
    if (run) {
      if (charged && cast()) charged = false;
      if (!charged && cool() <= 0) {
        const r = step(s, sealOf(hands, seals, kit.judge, s.cur, { image, aspect }), dt, kit.judge);
        s = r.state;
        r.events.forEach(act);
      }
      hud();
    }
    loop = win.requestAnimationFrame(tick);
  };
  const seen = () => { if (doc.hidden) camera(false); }; // a hidden page runs no frames: off now, back via tick

  const show = (yes) => {
    wanted = yes;
    btn.hidden = yes;
    dock.hidden = !yes;
    if (!yes) { camera(false); s = start({ mode: 'sequence', sequence }); charged = false; return; }
    last = win.performance.now();
  };
  btn.addEventListener('click', () => show(true));
  $('.jyh-off').addEventListener('click', () => show(false));
  doc.addEventListener('visibilitychange', seen);
  if (feed) win.jieyinFeed = (h, img = h) => { hands = h ?? []; image = img ?? []; aspect = 1; }; // img: the picture's points (two-hand seals)
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
