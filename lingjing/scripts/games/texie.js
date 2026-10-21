// texie.js — 施法特写 (the casting close-up), a TEST in the 游戏厅 for Hanli to choose a look (2026-10-21: 「用yinyue的3D模型
// 试一下. 另C的效果也给我看一下.」). The field is 结印's (守墙关's 山道, 小满 from behind, a boar); when a hand is seen a
// close-up panel slides in at the top corner, and the player's hands are 小满's in it. A seal held or a push at the
// camera: the panel's hand thrusts, a 火蛋 flies from 小满 on the field; the panel fades after. Two looks, one module:
//   `ink` (version C) — 小满 in side profile (one local-FLUX painting), his hands live ink strokes (texie/ink.js)
//   `vrm`             — Yinyue's VRM as his stand-in, her finger bones live (texie/vrm.js; the model from the engine)
// `&cutin=ink|vrm` picks, else the games.json row's `data.cutin` (one tile each). Not in the story: 10-14 「游戏里不需要3D模型」 stands.
//
// The parts: games/jieyin/eye.js (camera + the vendored MediaPipe model, on the device), jieyin/judge.js sealOf (the
// device's seals, jieyin.json), zhidian/poke.js (a push), texie/panel.js (when the panel shows). Numbers:
// worlds/jiuding/levels/texie.json. No camera, no permission, no WebGL, or the model fails → one line; nothing else.
// The camera is asked for only on 开始, stopped (its tracks) on pause, end, leave, or the page hidden; its picture is
// never shown.
// Contract (games/mount.js): mount(container, { lang, data, signal, shell }) → Promise<{ won, stars } | { won: false, left: true }>
// Dev only: `?dev=1&feed=1` runs without a camera — hands from the console (`window.texieFeed(world, image?, handed?)`),
// or `window.texieFeed.bot()`, made-up hands that open, close and push; `&bench=1` also runs the hand model on a
// drawn frame at the camera's rate (MediaPipe + the panel together, for the fps); never a player's.
import { available, dropModel, loadModel, openEye } from './jieyin/eye.js';
import { sealOf } from './jieyin/judge.js';
import { sealsFor, setOf } from './jieyin/sets.js';
import { buildHand } from './jieyin/pose.js';
import { poke, sizeOf, startPoke } from './zhidian/poke.js';
import { panelStep, startPanel } from './texie/panel.js';
import { inkView } from './texie/ink.js';

export const meta = {
  id: 'texie',
  pause: true, // the shell's pause stops the camera
  camera: true,
  name: { zh: '施法特写', en: 'Casting close-up' },
  how: {
    zh: '手举到镜头前，小满的手就跟着动；结一个印或往前一推，火蛋出手。',
    en: 'Raise your hands to the camera and Xiaoman\'s move with them; make a seal or push forward and the fire egg flies.',
  },
};

const KIT = new URL('../../worlds/jiuding/levels/texie.json', import.meta.url);
const SEALS = new URL('../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = new URL('./texie/texie.css', import.meta.url);
const ART = {
  bg: new URL('./shouqiang/art/bg.webp', import.meta.url).href, // 守墙关's 山道 and people (game-kit.md § Shared assets)
  xiaoman: new URL('./shouqiang/art/xiaoman-cast.webp', import.meta.url).href,
  egg: new URL('./jieyin/art/huodan.webp', import.meta.url).href, // 结印's 火蛋 (local FLUX)
};
const foeArt = (id, frame) => new URL(`./shouqiang/art/${id}-${frame}.webp`, import.meta.url).href;

const W = {
  zh: { nocam: '施法特写要用摄像头，这里用不了。', nogl: '这台设备画不了3D。', asking: '请允许使用摄像头……', loading: '模型加载中', raise: '把手举到镜头前', hit: '中了！', won: '野猪跑了。', who: '小满', ink: '水墨', vrm: '3D' },
  en: { nocam: 'The casting close-up needs a camera — none here.', nogl: 'No 3D on this device.', asking: 'Allow the camera…', loading: 'Loading the model', raise: 'Raise your hands to the camera', hit: 'Hit!', won: 'The boar runs off.', who: 'Xiaoman', ink: 'Ink', vrm: '3D' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';

/** Which look: the link's `cutin` (`&cutin=ink|vrm`), else the row's `data.cutin`; ink unless it says vrm. */
export const cutinOf = (data = {}, search = '') => ((new URLSearchParams(search).get('cutin') ?? data?.cutin) === 'vrm' ? 'vrm' : 'ink');

/** The one line when the game cannot be offered; nothing else is drawn. */
export const unavailableHtml = (lang = 'zh', why = 'nocam') => `<p class="tx-nocam" role="status">${plain(W[lang === 'en' ? 'en' : 'zh'][why] ?? W.zh.nocam)}</p>`;

/** A cast from this frame's hands: a seal held `holdMs` (once per seal: it must change or go before it casts again;
    not one in `skip` — an open palm only shows the hands), or a push; none within `coolMs` of the last. Pure: → { state, cast: null | 'seal' | 'push' }. */
export const startCaster = () => ({ seal: null, held: 0, latched: false, poke: startPoke(), coolTo: -Infinity });
export function castStep(state, { t, dt, seal = null, size = 0 }, knobs) {
  const s = { ...state };
  if (seal && seal === s.seal) s.held += dt; else { s.seal = seal; s.held = 0; s.latched = false; }
  const p = poke(s.poke, { t, size, sealed: true }, knobs.poke);
  s.poke = p.state;
  if (t < s.coolTo) return { state: s, cast: null };
  let cast = null;
  if (s.seal && !knobs.skip?.includes(s.seal) && !s.latched && s.held >= knobs.holdMs) { cast = 'seal'; s.latched = true; } else if (p.shot) cast = 'push';
  if (cast) s.coolTo = t + knobs.coolMs;
  return { state: s, cast };
}

function loadCss(doc) {
  if (doc.querySelector('link[data-texie-css]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS.href;
  l.dataset.texieCss = '';
  doc.head.append(l);
}

function stageHtml(level, cutin, lang) {
  return `<div class="tx" data-cutin="${cutin}"><div class="tx-field" style="background-image:url('${ART.bg}')">`
    + `<div class="tx-foe"><img alt="" src="${foeArt(level.foe, 'walk-1')}"><div class="tx-hp">${'<i></i>'.repeat(level.hits)}</div></div>`
    + `<img class="tx-xm" alt="" src="${ART.xiaoman}">`
    + `<div class="tx-panel" data-phase="hidden" aria-hidden="true"><span class="tx-tag">${plain(W[lang][cutin])}</span></div>`
    + `<video class="tx-eye" playsinline muted aria-hidden="true"></video><p class="tx-status" role="status"></p></div></div>`;
}

/** A sprite flies from one element to another (the 火蛋). */
function fly(box, src, from, to, ms) {
  const r = box.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const img = box.ownerDocument.createElement('img');
  img.className = 'tx-egg';
  img.src = src;
  img.alt = '';
  box.append(img);
  const x0 = a.left + a.width * 0.7 - r.left, y0 = a.top + a.height * 0.2 - r.top;
  const x1 = b.left + b.width / 2 - r.left, y1 = b.top + b.height / 2 - r.top;
  const at = (k) => `translate(${x0 + (x1 - x0) * k}px, ${y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * r.height * 0.15}px) translate(-50%, -50%) rotate(${k * 540}deg)`;
  const anim = img.animate([0, 0.25, 0.5, 0.75, 1].map((k) => ({ transform: at(k) })), { duration: ms, easing: 'ease-in' });
  return anim.finished.catch(() => {}).then(() => img.remove());
}

/** Made-up hands for the dev feed: an open hand that closes into a fist and opens, now and then a push (it grows). */
export function botHands(t) {
  const phase = (t % 4000) / 4000, close = phase < 0.5 ? Math.sin(phase * 2 * Math.PI) : 0;
  const curl = close > 0.6 ? ['index', 'middle', 'ring', 'pinky'] : close > 0.3 ? ['ring', 'pinky'] : [];
  const hand = buildHand({ curl, spread: 6 + 8 * (1 - close) });
  const push = phase > 0.7 && phase < 0.78 ? 1 + (phase - 0.7) * 6 : 1; // ×1.48 over ~300 ms
  const sway = Math.sin(t / 700) * 0.04;
  // pose.js draws a left hand, palm to the camera, in the camera's axes; the player's right hand is its mirror.
  const world = hand.map((p) => ({ x: -p.x / 100, y: p.y / 100, z: p.z / 100 }));
  const image = hand.map((p) => ({ x: 0.42 + sway - (p.x / 100) * 1.6 * push, y: 0.62 + (p.y / 100) * 2.1 * push, z: p.z / 100 }));
  return { world: [world], image: [image], handed: ['Right'] };
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, shell } = {}) {
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = W[lang];
  const q = new URLSearchParams(win.location?.search ?? '');
  const feedOnly = q.get('dev') === '1' && q.get('feed') === '1', bench = feedOnly && q.get('bench') === '1';
  const cutin = cutinOf(data, win.location?.search ?? '');
  loadCss(doc);
  return new Promise((resolve) => {
    let done = false, eye = null, view = null, offPause = null, offHide = null, loop = 0, benchTimer = 0, botOn = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      eye?.close();
      offPause?.();
      offHide?.();
      win.cancelAnimationFrame?.(loop);
      win.clearInterval?.(benchTimer);
      view?.destroy();
      if (win.texieFeed) delete win.texieFeed;
      dropModel();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    const nocam = (why = 'nocam') => { container.innerHTML = unavailableHtml(lang, why); leave(); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const [kit, seals] = await Promise.all([fetch(KIT).then((r) => r.json()), fetch(SEALS).then((r) => r.json())]);
      const level = kit.levels.find((l) => l.id === (data?.lv ?? q.get('lv'))) ?? kit.levels[0];
      const set = setOf(seals, { matchMedia: win.matchMedia?.bind(win), search: win.location?.search ?? '' });
      const table = sealsFor(seals, set);
      if (!feedOnly && !(await available(win))) return nocam();
      if (done) return;
      loadModel().catch(() => {}); // from disk while the lead card is read; the camera waits for 开始
      container.innerHTML = stageHtml(level, cutin, lang);
      const box = container.querySelector('.tx');
      const $ = (s) => box.querySelector(s);
      const video = $('video'), panel = $('.tx-panel');
      const status = (t) => { $('.tx-status').textContent = t; };

      // The close-up: the ink view at once; the VRM loaded now (16 MB from the engine) while the lead is read.
      let ready = null;
      if (cutin === 'ink') view = inkView(panel, { lang });
      else {
        status(`${w.loading}…`);
        ready = import('./texie/vrm.js').then((m) => m.vrmView(panel, { onProgress: (k) => { if (!done) status(`${w.loading} ${Math.round(k * 100)}%`); } }))
          .then((v) => { if (done) { v.destroy(); return; } view = v; box.dataset.model3d = 'ready'; status(''); })
          .catch((e) => { console.warn('[texie]', e); box.dataset.model3d = 'failed'; });
      }

      let hands = [], picture = [], handed = [], hp = level.hits, busy = false, last = win.performance.now();
      let ps = startPanel(), cs = startCaster(), sealNow = null, drawing = true;
      const say = (text) => (shell?.say ? shell.say(w.who, text, 1500) : status(text));

      const cast = async () => {
        if (busy) return;
        busy = true;
        view?.thrust?.();
        await new Promise((r) => setTimeout(r, reducedMotion ? 60 : 160)); // the hand thrusts first, then the egg leaves
        const foe = $('.tx-foe');
        await fly(box, ART.egg, $('.tx-xm'), foe, reducedMotion ? 200 : kit.eggMs);
        if (done) return;
        hp = Math.max(0, hp - 1);
        foe.querySelectorAll('.tx-hp i').forEach((el, i) => el.classList.toggle('is-gone', i >= hp));
        foe.querySelector('img').src = foeArt(level.foe, 'hit');
        foe.classList.add('is-hit');
        say(w.hit);
        await new Promise((r) => setTimeout(r, 420));
        foe.classList.remove('is-hit');
        if (hp > 0) { foe.querySelector('img').src = foeArt(level.foe, 'walk-1'); busy = false; return; }
        foe.classList.add('is-gone');
        say(w.won);
        setTimeout(() => finish({ won: true, stars: 3 }), 1400);
      };

      const tick = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - last);
        last = now;
        if (botOn) { const b = botHands(now); hands = b.world; picture = b.image; handed = b.handed; }
        const paused = shell?.paused?.();
        if (!paused) {
          const seen = picture.some((h) => h?.length >= 21);
          sealNow = seen ? sealOf(hands, table, seals.judge, sealNow, { image: picture, aspect: 4 / 3 }) : null;
          const size = seen ? Math.max(...picture.filter((h) => h?.length >= 21).map(sizeOf)) : 0;
          const c = castStep(cs, { t: now, dt, seal: sealNow, size }, kit.cast);
          cs = c.state;
          const castNow = Boolean(c.cast) && !busy && hp > 0;
          const p = panelStep(ps, { now, seen, cast: castNow }, kit.panel);
          ps = p.state;
          panel.dataset.phase = ps.phase;
          box.dataset.cast = c.cast ?? box.dataset.cast ?? '';
          if (castNow) cast();
          const line = !seen && ps.phase === 'hidden' && !busy ? w.raise : busy && !shell?.say ? null : '';
          if (line != null && $('.tx-status').textContent !== line) status(line);
          const glyph = sealNow ? table[sealNow]?.glyph ?? '' : '';
          const shown = ps.phase !== 'hidden' && ps.phase !== 'rest';
          if (shown) view?.update?.({ world: hands, image: picture, handed, aspect: 4 / 3, glyph });
          // The 3D view draws only while the panel is up (no GPU spent on a hidden panel).
          if (shown !== drawing) { drawing = shown; if (shown) view?.resume?.(); else view?.pause?.(); }
          box.dataset.seal = sealNow ?? '';
        }
        loop = win.requestAnimationFrame(tick);
      };

      const onHands = ({ world, image, handed: which }) => { hands = world; picture = image; handed = which ?? []; };
      if (shell?.lead) await shell.lead(tr(level.lead, lang));
      else await new Promise((r) => { const b = doc.createElement('button'); b.className = 'gshell-btn is-main tx-go'; b.textContent = lang === 'en' ? 'Start' : '开始'; b.onclick = () => { b.remove(); r(); }; box.append(b); });
      if (done) return;
      if (ready) await ready;
      if (done) return;
      if (cutin === 'vrm' && !view) return nocam('nogl');
      if (feedOnly) {
        win.texieFeed = (world, image = world, which = []) => { botOn = false; hands = world ?? []; picture = image ?? []; handed = which; };
        win.texieFeed.bot = (on = true) => { botOn = on; };
        if (bench) benchTimer = await benchModel(win, kit.cast.fps, box);
      } else {
        eye = openEye({ video, onHands, env: win, fps: kit.cast.fps, width: 320, height: 240, numHands: 2, handedSwap: seals.orient?.handedSwap ?? true });
        const off = () => { eye.pause(); hands = []; picture = []; view?.pause?.(); };
        const on = () => { if (drawing) view?.resume?.(); eye.start().catch(() => nocam()); };
        // Heard before the camera is asked for: a pause while the prompt is open keeps the camera off (eye.js).
        offPause = shell?.onPause?.((p) => { if (!done) (p ? off() : on()); });
        const seen = () => { if (done) return; if (doc.hidden) off(); else if (!shell?.paused?.()) on(); };
        doc.addEventListener?.('visibilitychange', seen);
        offHide = () => doc.removeEventListener?.('visibilitychange', seen);
        status(w.asking);
        try { await eye.start(); } catch (e) { console.warn('[texie]', e.reason ?? e); return nocam(); }
        if (done) return;
        status('');
      }
      last = win.performance.now();
      tick();
    })().catch((e) => { console.warn('[texie]', e); if (!done) nocam(); });
  });
}

/** Dev only (`&bench=1`): the hand model run on a drawn frame at the camera's rate, beside the panel — what MediaPipe
    and the close-up cost together. Writes `data-detect-ms` (the model's time a frame) on the box. */
async function benchModel(win, fps, box) {
  const lm = await loadModel().catch(() => null);
  if (!lm) { box.dataset.bench = 'nomodel'; return 0; }
  const c = win.document.createElement('canvas');
  c.width = 320; c.height = 240;
  const g = c.getContext('2d');
  let ms = 0, n = 0;
  return win.setInterval(() => {
    g.fillStyle = '#c8a07a'; g.fillRect(0, 0, 320, 240);
    g.fillStyle = '#e8b890'; g.beginPath(); g.ellipse(160 + Math.sin(n / 9) * 20, 140, 40, 55, 0, 0, Math.PI * 2); g.fill();
    const t0 = win.performance.now();
    try { lm.detectForVideo(c, t0); } catch { /* a frame it refuses */ }
    const d = win.performance.now() - t0;
    ms = n ? ms * 0.9 + d * 0.1 : d;
    n++;
    box.dataset.detectMs = ms.toFixed(1);
    box.dataset.detects = String(n);
  }, 1000 / fps);
}
