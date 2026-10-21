// zhidian.js — 隔空指点 (point in the air), a test game in the 游戏厅 (Hanli 2026-10-21: 「剑诀目前是手指朝上, 如果手指指向
// 屏幕, 是否可行. 一个用户隔空双指点屏幕的demo视频, 也许能引起兴趣」; 「好，先做试玩」). The player holds 剑诀 with the two
// fingers at the camera; a 准星 follows where they point, a quick jab toward the camera throws a 火蛋 there. Beasts
// cross the 山道; hits in a minute give the stars. Not in the story.
//
// The parts: games/jieyin/eye.js (camera + the vendored MediaPipe model, all on the device), jieyin/judge3d.js (剑诀
// by joint angles, so it counts pointing at the lens), zhidian/aim.js (the 准星), zhidian/poke.js (the jab),
// zhidian/core.js (beasts, clock, hits), and 结印's hand hint (jieyin/hint.js handHint: the hand the camera sees, in
// ink, in a small frame — the camera's picture is never shown). Numbers: worlds/jiuding/levels/zhidian.json; the seal's shape: jieyin.json `seals.jian`.
// No camera, no permission, no WebGL, or the model fails → one line that it needs a camera; nothing else.
//
// The camera is asked for only on 开始, and stopped (its tracks) the moment the game pauses, ends or is left, or the
// page is hidden.
// Contract (games/mount.js): mount(container, { lang, data, signal, shell }) → Promise<{ won, stars } | { won: false, left: true }>
// Dev only: `?dev=1&feed=1` runs without a camera — hands from the console (`window.zhidianFeed({ world, image })`),
// or `window.zhidianFeed.bot()`, a made-up player who aims and jabs (zhidian/fake.js); never a player's.
import { available, dropModel, loadModel, openEye } from './jieyin/eye.js';
import { sealOf3d } from './jieyin/judge3d.js';
import { aimPoint, follow, toField } from './zhidian/aim.js';
import { poke, sizeOf, startPoke } from './zhidian/poke.js';
import { land, newField, over, starsOf, throwAt, tick as fieldTick, timeLeft } from './zhidian/core.js';
import { handHint } from './jieyin/hint.js';

export const meta = {
  id: 'zhidian',
  pause: true, // the shell's pause stops the camera
  camera: true,
  name: { zh: '隔空指点', en: 'Point in the air' },
  how: {
    zh: '剑诀对准摄像头：两指指哪，准星到哪；往前一戳，火蛋出手。',
    en: 'Point the sword seal at the camera: the crosshair follows the two fingers; jab forward to throw the fire egg.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/zhidian.json', import.meta.url);
const SEALS = new URL('../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = new URL('./zhidian/zhidian.css', import.meta.url);
const HINT_CSS = new URL('./jieyin/jieyin.css', import.meta.url); // the hand hint's own look
const ART = {
  bg: new URL('./shouqiang/art/bg.webp', import.meta.url).href, // 守墙关's 山道 and people (game-kit.md § Shared assets)
  xiaoman: new URL('./shouqiang/art/xiaoman-cast.webp', import.meta.url).href,
  egg: new URL('./jieyin/art/huodan.webp', import.meta.url).href, // 结印's 火蛋 (local FLUX)
  burnt: new URL('./jieyin/art/fizzle.webp', import.meta.url).href,
};
const foeArt = (id, frame) => new URL(`./shouqiang/art/${id}-${frame}.webp`, import.meta.url).href;

const W = {
  zh: { nocam: '隔空指点要用摄像头，这里用不了。', asking: '请允许使用摄像头……', hit: '中了！', hits: '中', left: '秒', who: '小满' },
  en: { nocam: 'Point in the air needs a camera — none here.', asking: 'Allow the camera…', hit: 'Hit!', hits: 'hits', left: 's', who: 'Xiaoman' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';
const pct = (v) => `${(v * 100).toFixed(2)}%`;

/** The level a link asks for (`data.lv` / `?lv=`): an id, or 1…; else the first. */
export function levelAsked(kit, data, search = '') {
  const lv = data?.lv ?? new URLSearchParams(search).get('lv');
  const n = Number(lv);
  return kit.levels.find((l) => l.id === lv) ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

/** The one line when it cannot be played; nothing else is drawn. */
export function unavailableHtml(lang = 'zh') {
  return `<p class="zd-nocam" role="status">${plain(W[lang === 'en' ? 'en' : 'zh'].nocam)}</p>`;
}

function loadCss(doc, url, key) {
  if (doc.querySelector(`link[data-${key}-css]`)) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = url.href;
  l.dataset[`${key}Css`] = '';
  doc.head.append(l);
}

function stageHtml(lang) {
  const w = W[lang];
  return `<div class="zd"><div class="zd-field" style="background-image:url('${ART.bg}')">`
    + `<div class="zd-beasts"></div><img class="zd-xm" alt="" src="${ART.xiaoman}">`
    + '<div class="zd-sight is-off"><i></i></div>'
    + `<div class="zd-top"><b class="zd-hits">0 ${plain(w.hits)}</b><b class="zd-time"></b></div>`
    + '<div class="jy-dock zd-dock"></div>'
    + '<p class="zd-status" role="status"></p>'
    // The camera's frames feed the model; the picture itself is never shown (Hanli 10-21).
    + '<video class="zd-eye" playsinline muted aria-hidden="true"></video>'
    + '</div></div>';
}

/** Lay the beasts on the field (one node each, kept by id). */
function drawBeasts(layer, beasts) {
  const doc = layer.ownerDocument, have = new Map([...layer.children].map((el) => [el.dataset.id, el]));
  for (const b of beasts) {
    let el = have.get(String(b.id));
    if (!el) {
      el = doc.createElement('div');
      el.className = 'zd-beast';
      el.dataset.id = String(b.id);
      el.innerHTML = `<img alt="" src="${foeArt(b.foe, 'walk-1')}">`;
      layer.append(el);
    }
    have.delete(String(b.id));
    el.style.left = pct(b.x);
    el.style.top = pct(b.y);
    el.classList.toggle('is-flip', b.dir < 0);
  }
  for (const el of have.values()) if (!el.classList.contains('is-hit')) el.remove();
}

/** A beast struck: its hit frame, then gone. */
function struckFx(layer, beast) {
  const el = layer.querySelector(`.zd-beast[data-id="${beast.id}"]`);
  if (!el) return;
  el.classList.add('is-hit');
  el.querySelector('img').src = foeArt(beast.foe, 'hit');
  setTimeout(() => el.remove(), 450);
}

/** A 火蛋 from 小满's hand to the 准星 (field 0…1), `ms` long; a miss leaves a charred egg there a moment. */
function eggFx(field, from, aim, ms) {
  const doc = field.ownerDocument, r = field.getBoundingClientRect(), a = from.getBoundingClientRect();
  const img = doc.createElement('img');
  img.className = 'zd-egg';
  img.src = ART.egg;
  img.alt = '';
  field.append(img);
  const x0 = a.left + a.width * 0.7 - r.left, y0 = a.top + a.height * 0.3 - r.top, x1 = aim.x * r.width, y1 = aim.y * r.height;
  const at = (k) => `translate(${x0 + (x1 - x0) * k}px, ${y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * r.height * 0.12}px) translate(-50%, -50%) scale(${1 - k * 0.4})`;
  const anim = img.animate?.([0, 0.5, 1].map((k) => ({ transform: at(k) })), { duration: ms, easing: 'ease-in' });
  (anim?.finished ?? Promise.resolve()).catch(() => {}).then(() => img.remove());
}

function missFx(field, aim) {
  const img = field.ownerDocument.createElement('img');
  img.className = 'zd-miss';
  img.src = ART.burnt;
  img.alt = '';
  img.style.left = pct(aim.x);
  img.style.top = pct(aim.y);
  field.append(img);
  setTimeout(() => img.remove(), 700);
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, shell, seed } = {}) {
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = W[lang];
  const q = new URLSearchParams(win.location?.search ?? '');
  const feedOnly = q.get('dev') === '1' && q.get('feed') === '1';
  loadCss(doc, CSS, 'zhidian');
  loadCss(doc, HINT_CSS, 'jieyin');
  return new Promise((resolve) => {
    let done = false, eye = null, offPause = null, offHide = null, loop = 0, botLoop = 0, hintOff = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      eye?.close();
      offPause?.();
      offHide?.();
      win.cancelAnimationFrame?.(loop);
      win.cancelAnimationFrame?.(botLoop);
      if (win.zhidianFeed) delete win.zhidianFeed;
      dropModel();
      hintOff?.();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    const nocam = () => { container.innerHTML = unavailableHtml(lang); leave(); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const [kit, sealKit] = await Promise.all([fetch(LEVELS).then((r) => r.json()), fetch(SEALS).then((r) => r.json())]);
      const level = levelAsked(kit, data, win.location?.search ?? '');
      const seals = { [kit.seal]: sealKit.seals[kit.seal] }; // the one seal this game reads
      if (!feedOnly && !(await available(win))) return nocam();
      if (done) return;
      loadModel().catch(() => {}); // from disk while the lead card is read; the camera waits for 开始
      container.innerHTML = stageHtml(lang);
      const box = container.querySelector('.zd');
      const $ = (s) => box.querySelector(s);
      const fieldEl = $('.zd-field'), beastsEl = $('.zd-beasts'), sight = $('.zd-sight'), video = $('video');
      const hint = handHint($('.zd-dock'), { lang, size: 'compact', seals, knobs: sealKit.hint });
      hintOff = () => hint.destroy();
      const aspect = () => (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3);
      let field = newField(level, seed ?? `zhidian|${Date.now()}`), last = win.performance.now(), ending = false;
      // What the camera last said: the 准星 shown, when the seal was last seen, the jab watcher.
      let shown = null, sealT = -Infinity, pk = startPoke(), seenT = 0;

      const sealedAt = (t) => t - sealT <= kit.judge3d.graceMs;
      const paused = () => Boolean(shell?.paused?.());

      // One camera frame: the seal, the 准星, the jab.
      const see = ({ world, image }, t = win.performance.now()) => {
        if (done || paused()) return;
        const dt = seenT ? t - seenT : 0;
        seenT = t;
        const k = (world ?? []).findIndex((h) => sealOf3d([h], seals, kit.judge3d, sealedAt(t) ? kit.seal : null));
        if (k >= 0) sealT = t;
        const hand = image?.[k >= 0 ? k : 0];
        hint.update({ image: image ?? [], aspect: aspect(), target: kit.seal, progress: k >= 0 ? 1 : 0, right: k >= 0, now: t });
        if (!hand) { pk = poke(pk, { t }, kit.poke).state; return; }
        shown = follow(shown, toField(aimPoint(hand, kit.aim), kit.aim), dt, kit.aim);
        const r = poke(pk, { t, size: sizeOf(hand), aim: shown, sealed: sealedAt(t) }, kit.poke);
        pk = r.state;
        if (r.shot && !ending) {
          field = throwAt(field, r.shot.aim);
          eggFx(fieldEl, $('.zd-xm'), r.shot.aim, reducedMotion ? 120 : level.eggMs);
        }
      };

      const hud = () => {
        drawBeasts(beastsEl, field.beasts);
        sight.classList.toggle('is-off', !shown);
        sight.classList.toggle('is-armed', sealedAt(win.performance.now()));
        if (shown) { sight.style.left = pct(shown.x); sight.style.top = pct(shown.y); }
        $('.zd-hits').textContent = `${field.hits} ${w.hits}`;
        $('.zd-time').textContent = `${Math.ceil(timeLeft(field) / 1000)}${w.left}`;
        box.dataset.hits = String(field.hits);
      };
      const say = (text) => (shell?.say ? shell.say(w.who, text, 1400) : ($('.zd-status').textContent = text));

      const end = () => {
        ending = true;
        const stars = starsOf(field.hits, level.stars);
        say(tr(level.end, lang));
        setTimeout(() => finish({ won: stars > 0, stars }), 1200);
      };

      // Each frame: the beasts walk and the clock runs (held while paused), eggs that arrived strike or miss.
      const frame = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - last);
        last = now;
        if (!paused() && !ending) {
          field = fieldTick(field, dt);
          const r = land(field);
          field = r.state;
          for (const ev of r.events) {
            if (ev.type === 'hit') { struckFx(beastsEl, ev.beast); say(w.hit); } else missFx(fieldEl, ev.aim);
          }
          if (over(field) && !field.eggs.length) end();
        }
        hud();
        loop = win.requestAnimationFrame(frame);
      };

      hud();
      if (shell?.lead) await shell.lead(tr(level.lead, lang));
      else await new Promise((r) => { const b = doc.createElement('button'); b.className = 'gshell-btn is-main zd-go'; b.textContent = lang === 'en' ? 'Start' : '开始'; b.onclick = () => { b.remove(); r(); }; box.append(b); });
      if (done) return;
      if (feedOnly) {
        win.zhidianFeed = (hands) => see(hands ?? {});
        win.zhidianFeed.bot = async () => {
          const { bot } = await import('./zhidian/fake.js');
          let b = null;
          const drive = () => {
            if (done) return;
            const t = win.performance.now(), r = bot(field, b, t, level, kit.aim, seals[kit.seal]);
            b = r.bot;
            see(r.hands, t);
            botLoop = win.requestAnimationFrame(drive);
          };
          drive();
        };
        loadModel().then(() => { box.dataset.model = 'ready'; }, () => { box.dataset.model = 'failed'; });
      } else {
        // `fps`: a jab lasts ~200 ms, so this game asks the eye for poke.fps (eye.js's default is 15); one hand is enough.
        eye = openEye({ video, onHands: (h) => see(h), env: win, fps: kit.poke.fps, numHands: 1 });
        // Heard before the camera is asked for: a pause while the prompt is open keeps the camera off (eye.js).
        offPause = shell?.onPause?.((p) => {
          if (done) return;
          if (p) { eye.pause(); pk = startPoke(); } else eye.start().catch(() => nocam());
        });
        // The page hidden: the camera off, its light with it; back in sight, on again unless the shell holds it paused.
        const seen = () => {
          if (done) return;
          if (doc.hidden) { eye.pause(); pk = startPoke(); } else if (!paused()) eye.start().catch(() => nocam());
        };
        doc.addEventListener?.('visibilitychange', seen);
        offHide = () => doc.removeEventListener?.('visibilitychange', seen);
        $('.zd-status').textContent = w.asking;
        try { await eye.start(); } catch (e) { console.warn('[zhidian]', e.reason ?? e); return nocam(); }
        if (done) return;
        $('.zd-status').textContent = '';
      }
      last = win.performance.now();
      frame();
    })().catch((e) => { console.warn('[zhidian]', e); if (!done) nocam(); });
  });
}
