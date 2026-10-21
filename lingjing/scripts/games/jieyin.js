// jieyin.js — 结印 (hand seals), a prototype in the 游戏厅 (Hanli 2026-10-21: 「做一个测试一下, 好玩的话, 可以在守墙里面,
// 让用户结印发火弹帮忙打怪」). The player makes seals at the camera; four in order — 推掌 · 剑诀 · 申文 · 午文 — cast a
// 火蛋 at the boar; three eggs drive it off. A wrong seal held = 走火: a charred egg and a puff, back to the first seal.
// The second level is the shape of 古六's 讲堂 teaching level (one seal at a time, 褚先生's line for each). Not in
// the story.
//
// The parts any other game can take (守墙关's helper later): games/jieyin/eye.js (camera + the vendored MediaPipe
// model, all on the device), judge.js (seal rules, data in worlds/jiuding/levels/jieyin.json), sequence.js (holds,
// order, 走火), pose.js (each seal's hand icon). No camera, no permission, no WebGL, or the model fails → 结印 is not
// offered: here one line says it needs a camera and the game leaves (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打」).
//
// The camera is asked for only on 开始, and stopped (its tracks) the moment the game pauses, ends or is left, or the
// page is hidden.
// Contract (games/mount.js): mount(container, { lang, data, signal, shell }) → Promise<{ won, stars } | { won: false, left: true }>
// Dev only: `?dev=1&feed=1` runs without a camera, hands fed from the console (`window.jieyinFeed(hands)`) — the
// live check's way to play it through; never a player's.
import { available, dropModel, loadModel, openEye } from './jieyin/eye.js';
import { sealOf } from './jieyin/judge.js';
import { expected, progress, start, starsOf, step } from './jieyin/sequence.js';
import { BONES, iconSvg } from './jieyin/pose.js';

export const meta = {
  id: 'jieyin',
  pause: true, // the shell's pause stops the camera
  camera: true,
  name: { zh: '结印', en: 'Hand seals' },
  how: {
    zh: '对着摄像头结印：每个印稳住一下才算。四个印按次序结完，火蛋出手；结错一个，走火。',
    en: 'Make the seals at the camera, each held a moment. Four in order and the fire egg flies; a wrong one fizzles.',
  },
};

const LEVELS = new URL('../../worlds/jiuding/levels/jieyin.json', import.meta.url);
const CSS = new URL('./jieyin/jieyin.css', import.meta.url);
const ART = {
  bg: new URL('./shouqiang/art/bg.webp', import.meta.url).href, // 守墙关's 山道 and people (game-kit.md § Shared assets)
  xiaoman: new URL('./shouqiang/art/xiaoman-cast.webp', import.meta.url).href,
  egg: new URL('./jieyin/art/huodan.webp', import.meta.url).href, // local FLUX (tools/paint-jieyin-flux.py)
  burnt: new URL('./jieyin/art/fizzle.webp', import.meta.url).href,
};
const foeArt = (id, frame) => new URL(`./shouqiang/art/${id}-${frame}.webp`, import.meta.url).href;

const W = {
  zh: { nocam: '结印要用摄像头，这里用不了。', fizzle: '噗——走火了。', hit: '中了！', won: '野猪跑了。', learned: '五个印都会了。', asking: '请允许使用摄像头……', loading: '……', next: '下一个' },
  en: { nocam: 'Hand seals need a camera — none here.', fizzle: 'Pfft — it fizzled.', hit: 'Hit!', won: 'The boar runs off.', learned: 'All five seals learned.', asking: 'Allow the camera…', loading: '…', next: 'Next' },
};
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tr = (o, lang) => o?.[lang] ?? o?.zh ?? '';

/** The level a link asks for (`data.lv` / `?lv=`): an id, or 1…; else the first. */
export function levelAsked(kit, data, search = '') {
  const lv = data?.lv ?? new URLSearchParams(search).get('lv');
  const n = Number(lv);
  return kit.levels.find((l) => l.id === lv) ?? (Number.isInteger(n) && n >= 1 && n <= kit.levels.length ? kit.levels[n - 1] : kit.levels[0]);
}

function loadCss(doc) {
  if (doc.querySelector('link[data-jieyin-css]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS.href;
  l.dataset.jieyinCss = '';
  doc.head.append(l);
}

/** The one line when 结印 cannot be offered; nothing else is drawn. */
export function unavailableHtml(lang = 'zh') {
  return `<p class="jy-nocam" role="status">${plain(W[lang === 'en' ? 'en' : 'zh'].nocam)}</p>`;
}

function seqHtml(kit, level, lang) {
  return level.sequence.map((id, i) => {
    const s = kit.seals[id];
    return `<li class="jy-slot" data-i="${i}" title="${plain(tr(s.how, lang))}"><span class="jy-glyph">${plain(s.glyph)}</span>${iconSvg(s, 34)}<small>${plain(tr(s.name, lang))}</small></li>`;
  }).join('');
}

function stageHtml(kit, level, lang) {
  const foe = level.mode === 'one' ? '' : `<div class="jy-foe"><img alt="" src="${foeArt(level.foe, 'walk-1')}"><div class="jy-hp">${'<i></i>'.repeat(level.hits)}</div></div>`;
  return `<div class="jy" data-mode="${plain(level.mode)}">`
    + `<div class="jy-field" style="background-image:url('${ART.bg}')">${foe}<img class="jy-xm" alt="" src="${ART.xiaoman}">`
    + `<div class="jy-cam"><video playsinline muted></video><canvas></canvas>`
    + `<div class="jy-now"><svg viewBox="0 0 36 36"><circle class="jy-ring-bg" cx="18" cy="18" r="15"/><circle class="jy-ring" cx="18" cy="18" r="15" pathLength="100"/></svg><b></b></div>`
    + `<p class="jy-status"></p></div></div>`
    + `<ol class="jy-seq">${seqHtml(kit, level, lang)}</ol><p class="jy-hint"></p></div>`;
}

/** Draw the hands the model saw on the preview (mirrored with the video by CSS). */
function drawHands(canvas, video, image) {
  const w = (canvas.width = video.videoWidth || 320), h = (canvas.height = video.videoHeight || 240);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.lineWidth = Math.max(2, w / 160);
  g.strokeStyle = '#ffd36a';
  g.fillStyle = '#e8432f';
  for (const hand of image) {
    g.beginPath();
    for (const [a, b] of BONES) { g.moveTo(hand[a].x * w, hand[a].y * h); g.lineTo(hand[b].x * w, hand[b].y * h); }
    g.stroke();
    for (const p of hand) { g.beginPath(); g.arc(p.x * w, p.y * h, g.lineWidth * 1.2, 0, 7); g.fill(); }
  }
}

/** A sprite flies from one element to another (the 火蛋). */
function fly(box, src, from, to, ms) {
  const r = box.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const img = box.ownerDocument.createElement('img');
  img.className = 'jy-egg';
  img.src = src;
  img.alt = '';
  box.append(img);
  const x0 = a.left + a.width * 0.7 - r.left, y0 = a.top + a.height * 0.3 - r.top;
  const x1 = b.left + b.width / 2 - r.left, y1 = b.top + b.height / 2 - r.top;
  const at = (k) => `translate(${x0 + (x1 - x0) * k}px, ${y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * r.height * 0.18}px) translate(-50%, -50%) rotate(${k * 540}deg)`;
  const anim = img.animate([0, 0.25, 0.5, 0.75, 1].map((k) => ({ transform: at(k) })), { duration: ms, easing: 'ease-in' });
  return anim.finished.catch(() => {}).then(() => img.remove());
}

/** A charred egg pops out and drops (走火). */
function burnt(box, from, reducedMotion) {
  const img = box.ownerDocument.createElement('img');
  img.className = 'jy-burnt';
  img.src = ART.burnt;
  img.alt = '';
  const r = box.getBoundingClientRect(), a = from.getBoundingClientRect();
  img.style.left = `${a.left + a.width * 0.7 - r.left}px`;
  img.style.top = `${a.top + a.height * 0.25 - r.top}px`;
  box.append(img);
  const anim = img.animate(reducedMotion ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-80%) scale(1.1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%,40%) scale(1) rotate(25deg)', opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  anim.finished.catch(() => {}).then(() => img.remove());
}

export function mount(container, { lang = 'zh', data = {}, signal, reducedMotion = false, shell } = {}) {
  const doc = container.ownerDocument, win = doc.defaultView ?? globalThis;
  lang = lang === 'en' ? 'en' : 'zh';
  const w = W[lang];
  const q = new URLSearchParams(win.location?.search ?? '');
  const feedOnly = q.get('dev') === '1' && q.get('feed') === '1';
  loadCss(doc);
  return new Promise((resolve) => {
    let done = false, eye = null, offPause = null, offHide = null, loop = 0;
    const finish = (r) => {
      if (done) return;
      done = true;
      eye?.close();
      offPause?.();
      offHide?.();
      win.cancelAnimationFrame?.(loop);
      if (win.jieyinFeed) delete win.jieyinFeed;
      dropModel();
      resolve(r);
    };
    const leave = () => finish({ won: false, left: true });
    const nocam = () => { container.innerHTML = unavailableHtml(lang); leave(); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });

    (async () => {
      const kit = await fetch(LEVELS).then((r) => r.json());
      const level = levelAsked(kit, data, win.location?.search ?? '');
      if (!feedOnly && !(await available(win))) return nocam();
      if (done) return;
      loadModel().catch(() => {}); // from disk while the lead card is read; the camera waits for 开始
      container.innerHTML = stageHtml(kit, level, lang);
      const box = container.querySelector('.jy');
      const $ = (s) => box.querySelector(s);
      const video = $('video'), canvas = $('canvas');
      let s = start(level), hands = [], hp = level.hits ?? 0, busy = false, last = win.performance.now();

      const hud = () => {
        const want = expected(s);
        box.querySelectorAll('.jy-slot').forEach((el, i) => {
          el.classList.toggle('is-done', s.done || i < s.at);
          el.classList.toggle('is-next', !s.done && i === s.at);
        });
        const seal = s.cur ? kit.seals[s.cur] : null;
        $('.jy-now b').textContent = seal ? tr(seal.name, lang) : '';
        $('.jy-ring').style.strokeDasharray = `${Math.round(progress(s, kit.judge) * 100)} 100`;
        $('.jy-now').classList.toggle('is-right', Boolean(s.cur && s.cur === want));
        const next = want ? kit.seals[want] : null;
        $('.jy-hint').textContent = next ? (level.mode === 'one' ? `${tr(next.hint, lang)}　${tr(next.how, lang)}` : `${tr(next.name, lang)}：${tr(next.how, lang)}`) : '';
      };
      const say = (text) => (shell?.say ? shell.say('xiaoman', text, 1800) : ($('.jy-status').textContent = text));

      const cast = async () => {
        busy = true;
        const foe = $('.jy-foe');
        await fly(box, ART.egg, $('.jy-xm'), foe, reducedMotion ? 200 : 650);
        if (done) return;
        hp -= 1;
        foe.querySelectorAll('.jy-hp i').forEach((el, i) => el.classList.toggle('is-gone', i >= hp));
        foe.querySelector('img').src = foeArt(level.foe, 'hit');
        foe.classList.add('is-hit');
        say(w.hit);
        await new Promise((r) => setTimeout(r, 420));
        foe.classList.remove('is-hit');
        if (hp > 0) { foe.querySelector('img').src = foeArt(level.foe, 'walk-1'); busy = false; return; }
        foe.classList.add('is-gone');
        say(w.won);
        setTimeout(() => finish({ won: true, stars: starsOf(s.fizzles, level.stars) }), 1200);
      };

      const act = (ev) => {
        if (ev.type === 'seal') { const el = box.querySelector(`.jy-slot[data-i="${ev.at}"]`); el?.classList.remove('is-pop'); void el?.offsetWidth; el?.classList.add('is-pop'); }
        if (ev.type === 'cast') cast();
        if (ev.type === 'fizzle') { burnt(box, $('.jy-xm'), reducedMotion); say(w.fizzle); }
        if (ev.type === 'miss') { const el = box.querySelector('.jy-slot.is-next'); el?.classList.remove('is-shake'); void el?.offsetWidth; el?.classList.add('is-shake'); }
        if (ev.type === 'done') { say(w.learned); setTimeout(() => finish({ won: true, stars: starsOf(s.misses, level.stars) }), 1200); }
      };

      // Each frame: the judge on the hands last seen, the sequence on with the time passed (still while paused or a
      // 火蛋 is in the air).
      const tick = () => {
        if (done) return;
        const now = win.performance.now(), dt = Math.min(100, now - last);
        last = now;
        if (!shell?.paused?.() && !busy) {
          const r = step(s, sealOf(hands, kit.seals, kit.judge, s.cur), dt, kit.judge);
          s = r.state;
          r.events.forEach(act);
        }
        hud();
        loop = win.requestAnimationFrame(tick);
      };

      const onHands = ({ world, image }) => { hands = world; drawHands(canvas, video, image); };
      hud();
      if (shell?.lead) await shell.lead(tr(level.lead, lang));
      else await new Promise((r) => { const b = doc.createElement('button'); b.className = 'gshell-btn is-main jy-go'; b.textContent = lang === 'en' ? 'Start' : '开始'; b.onclick = () => { b.remove(); r(); }; box.append(b); });
      if (done) return;
      if (feedOnly) {
        win.jieyinFeed = (h) => { hands = h ?? []; };
        loadModel().then(() => { box.dataset.model = 'ready'; }, () => { box.dataset.model = 'failed'; });
      } else {
        eye = openEye({ video, onHands, env: win });
        // Heard before the camera is asked for: a pause while the prompt is open keeps the camera off (eye.js).
        offPause = shell?.onPause?.((paused) => {
          if (done) return;
          if (paused) { eye.pause(); hands = []; } else eye.start().catch(() => nocam());
        });
        // The page hidden (another tab, the window away): the camera off, its light with it; back in sight, on again
        // unless the shell holds it paused.
        const seen = () => {
          if (done) return;
          if (doc.hidden) { eye.pause(); hands = []; } else if (!shell?.paused?.()) eye.start().catch(() => nocam());
        };
        doc.addEventListener?.('visibilitychange', seen);
        offHide = () => doc.removeEventListener?.('visibilitychange', seen);
        $('.jy-status').textContent = w.asking;
        try { await eye.start(); } catch (e) { console.warn('[jieyin]', e.reason ?? e); return nocam(); }
        if (done) return;
        $('.jy-status').textContent = '';
      }
      last = win.performance.now();
      tick();
    })().catch((e) => { console.warn('[jieyin]', e); if (!done) nocam(); });
  });
}
