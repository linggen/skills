// setpiece-zhuji.js — 筑基天象 (第九回, 09-cliff): the moment 沈小满 lays his
// foundation on the 沉鼎观 cliff, drawn as ink on 宣纸 in WebGL (PixiJS) and
// timed by GSAP — the same vendored pair fx.js loads, loaded only now.
//
// It follows the book's images in order (09-第九回.md, 九月初三):
//   gather — the sky darkens; one cloud over this cliff alone turns faster and
//            faster into an upturned 锅; every wind stops, the pines go still;
//   light  — a thread of light from the cloud's heart onto his crown;
//   tai    — inside: stones rise from the lake's floor and stack into a 台;
//            the five doors, 金木水火土, light one after another;
//   door   — the 台 sways; a door he reads as 「勿入」 (心关 · 惧) — then the
//            words are 爹's 「今日放学」, and the door melts;
//   zhu    — 「上有黄庭下关元，后有幽阙前命门」: four piles driven, the 台 holds;
//   stars  — the 锅 bursts; the stars hang low enough to pick;
//   settle — 瞿老 in the starlight: 「几道纹？」「……一道。」「嗯。一道。」
//
// One Application per play, destroyed on close. Words are DOM, never painted.
// Beats follow the dialogue box: with `tap` each beat waits for a tap (or the
// page's next()); a tap mid-beat finishes that beat. `still` (reduced motion,
// or no WebGL) plays the same beats as still frames (SVG), tap to turn.
import { glOK, loadGsap, loadPixi } from './fx.js';

/// The beats: id, how long it runs (ms), and its caption (the book's words).
export const ZHUJI_BEATS = [
  { id: 'gather', ms: 2600, zh: '天忽然暗了下来。一团云只罩着这一座崖顶，越转越快，转成一口倒扣的大锅。四下里的风，一齐停了。', en: 'The sky darkened. A single cloud hung over this one cliff, turning faster and faster into an upturned cauldron. Every wind stopped.' },
  { id: 'light', ms: 1300, zh: '云心里透下一缕光来，不偏不倚，正照在他头顶上。', en: 'From the heart of the cloud a thread of light came down, straight onto the crown of his head.' },
  { id: 'tai', ms: 2600, zh: '丹田湖底，一块一块，垒起了一座台子。金木水火土五扇门，一扇接一扇地亮起来。', en: 'From the floor of the lake within, stone by stone, a platform rose. The five doors — metal, wood, water, fire, earth — lit one after another.' },
  { id: 'door', ms: 2800, zh: '台子晃了一晃。他看见一扇门，门上的字，他只觉得写的是「勿入」。——可他爹早就进过这扇门了。写的是「今日放学」。', en: 'The platform swayed. He saw a door, and the words on it, he was sure, said Keep Out. — But his father had walked through this door long ago. It said: No School Today.' },
  { id: 'zhu', ms: 1400, zh: '上有黄庭下关元，后有幽阙前命门。四根桩一落定，那台子便稳了。', en: 'Yellow Court above, the Pass Gate below; the Hidden Gate behind, the Gate of Life before. Four piles driven home, and the platform held.' },
  { id: 'stars', ms: 1900, zh: '头顶那口锅轰的一声散了。满天星斗一颗一颗往下垂，低得仿佛伸手便摘得着。', en: 'The cauldron overhead burst apart. The stars hung down one by one, so low it seemed a hand could pick them.' },
  { id: 'settle', ms: 0, zh: '「几道纹？」「……一道。」「嗯。一道。」', en: '"How many lines?" "…One." "Mm. One."' },
];

/// The door's words, before and after (DOM, crossfaded in the `door` beat).
export const DOOR_WORDS = { zh: ['勿入', '今日放学'], en: ['KEEP OUT', 'NO SCHOOL TODAY'] };
/// The five doors in the book's order, and their ink tints (muted 五色).
export const FIVE = [
  { id: 'jin', zh: '金', en: 'Metal', color: 0xb8a36a },
  { id: 'mu', zh: '木', en: 'Wood', color: 0x5d7d56 },
  { id: 'shui', zh: '水', en: 'Water', color: 0x34465c },
  { id: 'huo', zh: '火', en: 'Fire', color: 0xa24a38 },
  { id: 'tu', zh: '土', en: 'Earth', color: 0x9a7a44 },
];
/// Where each beat starts on the one timeline (seconds), and the whole length.
export const beatStarts = (beats = ZHUJI_BEATS) => beats.reduce((a, b, i) => (a.push(i ? a[i - 1] + beats[i - 1].ms / 1000 : 0), a), []);
export const totalMs = (beats = ZHUJI_BEATS) => beats.reduce((s, b) => s + b.ms, 0);
const capOf = (b, lang) => (lang === 'en' ? b.en : b.zh);
const SKIP = { zh: '跳过', en: 'Skip' };
const TAPHINT = { zh: '轻点继续', en: 'Tap to go on' };

/* ── the picture's units: 400 × 500, scaled to the slot ── */
const U = { w: 400, h: 500, cloud: [285, 112], head: [286, 309], lake: [200, 250] };
const INK = 0x231f1a, PAPER = 0xf5efe1;

/* Tiny deterministic noise, so every play (and every test) draws the same sky. */
function rng(seed = 9) {
  let h = seed >>> 0 || 9;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/// The stars' places (units), shared by the WebGL picture and the still frames.
export function starField(n = 72, seed = 3) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: 8 + r() * 384, y: 10 + r() * 250, s: 0.6 + r() * 1.6, a: 0.45 + r() * 0.55 }));
}

/* ── the still frames (reduced motion, no WebGL, tests): one SVG per beat ── */
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const cliffPath = 'M0,500 L0,432 C40,420 70,404 110,396 C150,388 170,366 214,348 C246,334 282,326 326,326 C356,326 380,332 400,340 L400,500 Z';
const figureSvg = () => `<g fill="#1c1916"><circle cx="286" cy="309" r="5.2"/><path d="M279,326 C279,318 282,314 286,314 C290,314 293,318 293,326 Z"/></g>`;
const pinesSvg = () => [[196, 352], [352, 328], [374, 333]].map(([x, y]) => `<g stroke="#231f1a" stroke-linecap="round" fill="none"><path d="M${x},${y} L${x - 1},${y - 34}" stroke-width="2"/><path d="M${x - 12},${y - 26} L${x + 10},${y - 29} M${x - 9},${y - 33} L${x + 8},${y - 36} M${x - 5},${y - 40} L${x + 5},${y - 41}" stroke-width="3" opacity=".8"/></g>`).join('');
const cloudSvg = (o = 0.8) => { const r = rng(5); return `<g opacity="${o}" filter="url(#zjblur)">${Array.from({ length: 26 }, (_, i) => { const a = i * 0.62, d = 12 + i * 3.1; return `<ellipse cx="${(U.cloud[0] + Math.cos(a) * d).toFixed(1)}" cy="${(U.cloud[1] + Math.sin(a) * d * 0.42).toFixed(1)}" rx="${(16 + r() * 12).toFixed(1)}" ry="${(9 + r() * 6).toFixed(1)}" fill="#3a3530" opacity="${(0.25 + r() * 0.2).toFixed(2)}"/>`; }).join('')}</g>`; };
const lightSvg = () => `<path d="M${U.cloud[0] - 7},${U.cloud[1] + 18} L${U.head[0] - 16},${U.head[1] + 2} L${U.head[0] + 16},${U.head[1] + 2} L${U.cloud[0] + 7},${U.cloud[1] + 18} Z" fill="url(#zjlight)"/>`;
function taiSvg({ sway = false, door = false, piles = false, lang = 'zh' } = {}) {
  const [cx, cy] = U.lake;
  const doors = FIVE.map((f, i) => { const a = -Math.PI / 2 + i * (2 * Math.PI / 5), x = cx + Math.cos(a) * 128, y = cy + Math.sin(a) * 128; return `<g><path d="M${(x - 9).toFixed(1)},${(y + 12).toFixed(1)} L${(x - 9).toFixed(1)},${(y - 4).toFixed(1)} Q${x.toFixed(1)},${(y - 15).toFixed(1)} ${(x + 9).toFixed(1)},${(y - 4).toFixed(1)} L${(x + 9).toFixed(1)},${(y + 12).toFixed(1)} Z" fill="${hex(f.color)}"/><text x="${x.toFixed(1)}" y="${(y + 30).toFixed(1)}" text-anchor="middle" font-size="11" fill="#6a6458">${lang === 'en' ? f.en : f.zh}</text></g>`; }).join('');
  const stones = Array.from({ length: 4 }, (_, row) => `<rect x="${cx - 62 + row * 10}" y="${cy + 58 - row * 16}" width="${124 - row * 20}" height="14" rx="4" fill="#3b352e" opacity="${0.75 - row * 0.08}"/>`).join('');
  const pileXs = [cx - 58, cx - 26, cx + 26, cx + 58];
  const pileSvg = piles ? pileXs.map((x) => `<path d="M${x},${cy - 10} L${x},${cy + 74}" stroke="#231f1a" stroke-width="5" stroke-linecap="round"/>`).join('') : '';
  const w = DOOR_WORDS[lang] ?? DOOR_WORDS.zh;
  const doorSvg = door ? `<g><rect x="${cx - 44}" y="${cy - 104}" width="88" height="132" fill="#6b5a45" opacity=".85"/><rect x="${cx - 36}" y="${cy - 96}" width="72" height="116" fill="none" stroke="#2a241d" stroke-width="3"/><rect x="${cx - 16}" y="${cy - 80}" width="32" height="64" fill="#efe6d2"/>${lang === 'en' ? w[1].split(' ').reduce((acc, word) => { const last = acc.at(-1); if (last && (last + ' ' + word).length <= 9) acc[acc.length - 1] = `${last} ${word}`; else acc.push(word); return acc; }, []).map((line, k, all) => `<text x="${cx}" y="${cy - 48 - (all.length - 1) * 5 + k * 10}" text-anchor="middle" font-size="7" fill="#231f1a">${line}</text>`).join('') : `<text x="${cx}" y="${cy - 62}" text-anchor="middle" font-size="12" fill="#231f1a" writing-mode="tb">${w[1]}</text>`}</g>` : '';
  return `<g transform="${sway ? `rotate(-2 ${cx} ${cy})` : ''}"><circle cx="${cx}" cy="${cy}" r="112" fill="#34465c" opacity=".12"/><circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#231f1a" stroke-width="2.5" opacity=".6"/>${stones}${pileSvg}${doors}${doorSvg}</g>`;
}
const starsSvg = () => starField().map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${(s.y + 26).toFixed(1)}" r="${s.s.toFixed(2)}" fill="#fdf6e3" opacity="${s.a.toFixed(2)}"/>`).join('');

/// The still frame for a beat: an <svg> string (the fallback, and what tests read).
export function stillSvg(beatId, lang = 'zh') {
  const dark = { gather: 0.3, light: 0.35, tai: 0.35, door: 0.35, zhu: 0.35, stars: 0.62, settle: 0.62 }[beatId] ?? 0;
  const inner = ['tai', 'door', 'zhu'].includes(beatId);
  const outside = `<rect width="400" height="500" fill="${hex(PAPER)}"/><rect width="400" height="500" fill="#2a2622" opacity="${dark}"/>`
    + (['stars', 'settle'].includes(beatId) ? starsSvg() : '')
    + (['gather', 'light'].includes(beatId) ? cloudSvg() : '')
    + (beatId === 'light' ? lightSvg() : '')
    + `<path d="${cliffPath}" fill="#231f1a" opacity=".88"/>${pinesSvg()}${figureSvg()}`;
  const within = inner ? `<rect width="400" height="500" fill="${hex(PAPER)}" opacity=".9"/>${taiSvg({ sway: beatId === 'door', door: beatId === 'door', piles: beatId === 'zhu', lang })}` : '';
  return `<svg class="zjstill" viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" role="img" data-beat="${beatId}"><defs><filter id="zjblur"><feGaussianBlur stdDeviation="4"/></filter><linearGradient id="zjlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6d8" stop-opacity=".15"/></linearGradient></defs>${outside}${within}</svg>`;
}

/* ── the frame the moment plays in (DOM): picture, caption, door words, skip ── */
function frameHost(slot, lang, captions) {
  const host = document.createElement('div');
  host.className = `zjhost ${lang === 'en' ? 'en' : 'zh'}`;
  host.innerHTML = `<div class="zjpic"><div class="zjdoor" hidden><span class="zjw0"></span><span class="zjw1"></span></div><div class="zjhint">${TAPHINT[lang] ?? TAPHINT.zh}</div></div>`
    + `${captions ? '<div class="zjcap" aria-live="polite"></div>' : ''}<button class="zjskip" type="button">${SKIP[lang] ?? SKIP.zh}</button>`;
  const [w0, w1] = DOOR_WORDS[lang] ?? DOOR_WORDS.zh;
  host.querySelector('.zjw0').textContent = w0;
  host.querySelector('.zjw1').textContent = w1;
  slot.appendChild(host);
  return host;
}

/// Plays 筑基天象 in `slot`. Resolves to a handle {host, tap(), skip(), done(),
/// destroy(), beat()}; calls onBeat(index, beat) as each beat starts and onDone()
/// once the last is shown. Each beat waits for a tap (the dialogue box's next
/// passage) unless `auto`. `captions` (default true): the book's words under the
/// picture — the game passes false and says them in its own box from onBeat.
export async function playZhuji(slot, { lang = 'zh', still = false, auto = false, captions = true, onBeat = () => {}, onDone = () => {} } = {}) {
  const beats = ZHUJI_BEATS;
  const tap = !auto;
  const host = frameHost(slot, lang, captions);
  const pic = host.querySelector('.zjpic');
  const cap = host.querySelector('.zjcap');
  const doorEl = host.querySelector('.zjdoor');
  let index = -1, finished = false, gone = false;
  const setCap = (b) => { if (cap) { cap.textContent = capOf(b, lang); cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); } };
  const finish = () => { if (finished) return; finished = true; host.classList.add('done'); onDone(); };

  // Still: one SVG per beat; a tap (or next) turns the page.
  if (still || !glOK()) {
    host.classList.add('still');
    const show = (i) => { index = i; const b = beats[i]; pic.querySelector('svg.zjstill')?.remove(); pic.insertAdjacentHTML('afterbegin', stillSvg(b.id, lang)); setCap(b); onBeat(i, b); if (i === beats.length - 1) finish(); };
    show(0);
    const next = () => { if (!gone && index < beats.length - 1) show(index + 1); };
    const skip = () => { if (!gone) show(beats.length - 1); };
    host.addEventListener('click', (e) => { if (e.target.closest('.zjskip')) skip(); else next(); });
    if (!tap) { const t = setInterval(() => { if (index >= beats.length - 1 || gone) clearInterval(t); else next(); }, 2200); }
    return { host, next, tap: next, skip, done: () => finished, beat: () => beats[index], destroy() { gone = true; host.remove(); } };
  }

  const [PIXI, gsap] = await Promise.all([loadPixi(), loadGsap()]);
  const width = Math.max(260, Math.min(560, slot.clientWidth || 400));
  const height = Math.round(width * U.h / U.w);
  const app = new PIXI.Application();
  await app.init({ width, height, backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
  pic.prepend(app.canvas);
  const root = new PIXI.Container();
  root.scale.set(width / U.w);
  app.stage.addChild(root);

  // The outside: paper, the darkening wash, stars, the cloud, the light, the cliff, pines, him.
  const out = new PIXI.Container();
  root.addChild(out);
  out.addChild(new PIXI.Graphics().rect(0, 0, U.w, U.h).fill(PAPER));
  const dusk = new PIXI.Graphics().rect(0, 0, U.w, U.h).fill(0x2a2622);
  dusk.alpha = 0;
  out.addChild(dusk);
  const stars = new PIXI.Container();
  const starDots = starField().map((s) => { const g = new PIXI.Graphics().circle(0, 0, s.s).fill(0xfdf6e3); g.position.set(s.x, s.y); g.alpha = 0; g.baseA = s.a; stars.addChild(g); return g; });
  out.addChild(stars);

  const cloud = new PIXI.Container();
  cloud.position.set(...U.cloud);
  const swirl = new PIXI.Container();
  const r = rng(5);
  for (let i = 0; i < 30; i += 1) {
    const a = i * 0.62, d = 12 + i * 3.1;
    const blob = new PIXI.Graphics().ellipse(0, 0, 16 + r() * 13, 10 + r() * 7).fill({ color: 0x3a3530, alpha: 0.22 + r() * 0.22 });
    blob.position.set(Math.cos(a) * d, Math.sin(a) * d);
    swirl.addChild(blob);
  }
  cloud.addChild(swirl);
  cloud.scale.set(2.4, 2.4 * 0.42);
  cloud.alpha = 0;
  cloud.filters = [new PIXI.BlurFilter({ strength: 5, quality: 3 })];
  out.addChild(cloud);

  const lc = document.createElement('canvas');
  lc.width = 32; lc.height = 128;
  const lg = lc.getContext('2d');
  const grad = lg.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,246,216,0.95)'); grad.addColorStop(1, 'rgba(255,246,216,0.18)');
  lg.fillStyle = grad; lg.fillRect(0, 0, 32, 128);
  const lightTex = PIXI.Texture.from(lc);
  const light = new PIXI.Sprite(lightTex);
  light.anchor.set(0.5, 0);
  light.position.set(U.cloud[0], U.cloud[1] + 16);
  light.width = 26; light.height = U.head[1] - U.cloud[1] - 14;
  light.alpha = 0;
  light.filters = [new PIXI.BlurFilter({ strength: 3 })];
  out.addChild(light);

  const cliff = new PIXI.Graphics().svg(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${cliffPath}" fill="#231f1a"/></svg>`);
  cliff.alpha = 0.9;
  out.addChild(cliff);
  const pines = [[196, 352], [352, 328], [374, 333]].map(([x, y]) => {
    const p = new PIXI.Graphics();
    p.moveTo(0, 0).lineTo(-1, -34).stroke({ width: 2, color: INK });
    for (const [a, b, c] of [[-12, 10, -27], [-9, 8, -34], [-5, 5, -40]]) p.moveTo(a, c + 1).lineTo(b, c - 2).stroke({ width: 3, color: INK, alpha: 0.8, cap: 'round' });
    p.position.set(x, y);
    out.addChild(p);
    return p;
  });
  const him = new PIXI.Graphics().circle(0, -17, 5.2).fill(0x1c1916).moveTo(-7, 0).bezierCurveTo(-7, -8, -4, -12, 0, -12).bezierCurveTo(4, -12, 7, -8, 7, 0).closePath().fill(0x1c1916);
  him.position.set(U.head[0], U.head[1] + 17);
  out.addChild(him);

  // The inside: the lake, the stones, the five doors, the door, the four piles.
  const inn = new PIXI.Container();
  inn.alpha = 0;
  root.addChild(inn);
  inn.addChild(new PIXI.Graphics().rect(0, 0, U.w, U.h).fill({ color: PAPER, alpha: 0.94 }));
  const [cx, cy] = U.lake;
  const tai = new PIXI.Container();
  tai.position.set(cx, cy);
  inn.addChild(tai);
  tai.addChild(new PIXI.Graphics().circle(0, 0, 112).fill({ color: 0x34465c, alpha: 0.12 }).circle(0, 0, 112).stroke({ width: 2.5, color: INK, alpha: 0.6 }));
  const stones = [];
  for (let row = 0; row < 4; row += 1) {
    for (let k = 0; k < 4 - row; k += 1) {
      const w = 28, x = -62 + row * 14 + k * 31, y = 58 - row * 16;
      const s = new PIXI.Graphics().roundRect(0, 0, w, 14, 4).fill({ color: 0x3b352e, alpha: 0.78 - row * 0.08 });
      s.position.set(x, y + 90);
      s.alpha = 0;
      s.to = y;
      tai.addChild(s);
      stones.push(s);
    }
  }
  const doorsFive = FIVE.map((f, i) => {
    const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
    const d = new PIXI.Graphics().moveTo(-9, 12).lineTo(-9, -4).quadraticCurveTo(0, -15, 9, -4).lineTo(9, 12).closePath().fill(f.color);
    d.position.set(Math.cos(a) * 128, Math.sin(a) * 128);
    d.alpha = 0.12;
    tai.addChild(d);
    return d;
  });
  const door = new PIXI.Container();
  door.addChild(new PIXI.Graphics().rect(-44, -104, 88, 132).fill({ color: 0x6b5a45, alpha: 0.88 }).rect(-36, -96, 72, 116).stroke({ width: 3, color: 0x2a241d }).rect(-16, -80, 32, 64).fill(0xefe6d2));
  door.alpha = 0;
  tai.addChild(door);
  const piles = [-58, -26, 26, 58].map((x) => { const p = new PIXI.Graphics().moveTo(0, 0).lineTo(0, 84).stroke({ width: 5, color: INK, cap: 'round' }); p.position.set(x, -170); p.alpha = 0; tai.addChild(p); return p; });

  // What turns every frame: the cloud's spin (its speed is a tweened value), the stars' twinkle.
  const live = { spin: 0.15, twinkle: 0 };
  let t0 = 0;
  const tick = (tk) => {
    t0 += tk.deltaMS / 1000;
    swirl.rotation += live.spin * tk.deltaMS / 1000;
    if (live.twinkle > 0) starDots.forEach((g, i) => { g.alpha = live.twinkle * g.baseA * (0.75 + 0.25 * Math.sin(t0 * 2.2 + i)); });
  };
  app.ticker.add(tick);
  const sway = gsap.to(pines.map((p) => p.skew), { x: 0.05, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.2 });

  // One timeline, a label per beat.
  const starts = beatStarts(beats);
  const tl = gsap.timeline({ paused: true });
  beats.forEach((b, i) => tl.addLabel(b.id, starts[i]));
  const S = (id, d = 0) => starts[beats.findIndex((b) => b.id === id)] + d;
  // gather
  tl.to(dusk, { alpha: 0.3, duration: 2.2, ease: 'sine.inOut' }, S('gather'))
    .to(cloud, { alpha: 0.85, duration: 1.4 }, S('gather'))
    .to(cloud.scale, { x: 1, y: 0.42, duration: 2.4, ease: 'power2.inOut' }, S('gather'))
    .to(live, { spin: 2.6, duration: 2.4, ease: 'power1.in' }, S('gather'))
    .call(() => { sway.pause(); }, null, S('gather', 1.2))
    .to(pines.map((p) => p.skew), { x: 0, duration: 0.8, ease: 'power2.out' }, S('gather', 1.2))
  // light
    .to(light, { alpha: 0.85, duration: 0.8, ease: 'sine.out' }, S('light'))
    .to(light, { width: 34, duration: 0.5, yoyo: true, repeat: 1 }, S('light', 0.4))
    .to(him, { alpha: 0.75, duration: 0.3, yoyo: true, repeat: 1 }, S('light', 0.8))
  // tai: into him
    .to(out, { alpha: 0.12, duration: 0.6 }, S('tai'))
    .to(inn, { alpha: 1, duration: 0.6 }, S('tai'));
  stones.forEach((s, k) => tl.to(s, { alpha: 1, y: s.to, duration: 0.45, ease: 'power2.out' }, S('tai', 0.5 + k * 0.1)));
  doorsFive.forEach((d, k) => tl.to(d, { alpha: 1, duration: 0.25 }, S('tai', 1.2 + k * 0.25)).to(d.scale, { x: 1.35, y: 1.35, duration: 0.15, yoyo: true, repeat: 1 }, S('tai', 1.2 + k * 0.25)));
  // door
  tl.to(tai, { keyframes: [{ rotation: -0.05, duration: 0.18 }, { rotation: 0.04, duration: 0.18 }, { rotation: -0.02, duration: 0.14 }, { rotation: 0, duration: 0.12 }] }, S('door'))
    .to(door, { alpha: 1, duration: 0.5 }, S('door', 0.4))
    .call(() => { doorEl.hidden = false; doorEl.className = 'zjdoor w0'; }, null, S('door', 0.5))
    .call(() => { doorEl.className = 'zjdoor w1'; }, null, S('door', 1.5))
    .to(door, { alpha: 0, duration: 0.7, ease: 'sine.in' }, S('door', 2.05))
    .to(door.scale, { x: 1.12, y: 1.12, duration: 0.7 }, S('door', 2.05))
    .call(() => { doorEl.className = 'zjdoor gone'; }, null, S('door', 2.05));
  // zhu: four piles driven
  piles.forEach((p, k) => tl.to(p, { alpha: 1, y: -10, duration: 0.22, ease: 'power3.in' }, S('zhu', 0.1 + k * 0.22)).to(tai, { y: cy + 2, duration: 0.05, yoyo: true, repeat: 1 }, S('zhu', 0.32 + k * 0.22)));
  // stars: back outside; the 锅 bursts; the night comes close
  tl.to(inn, { alpha: 0, duration: 0.5 }, S('stars'))
    .to(out, { alpha: 1, duration: 0.5 }, S('stars'))
    .to(light, { alpha: 0, duration: 0.3 }, S('stars'))
    .to(cloud.scale, { x: 2.6, y: 1.4, duration: 0.45, ease: 'power3.out' }, S('stars', 0.3))
    .to(cloud, { alpha: 0, duration: 0.45 }, S('stars', 0.3))
    .to(pic, { keyframes: [{ x: 3, y: 1, duration: 0.05 }, { x: -3, y: -1, duration: 0.05 }, { x: 2, duration: 0.05 }, { x: 0, y: 0, duration: 0.05 }] }, S('stars', 0.3))
    .to(dusk, { alpha: 0.62, duration: 0.9 }, S('stars', 0.4))
    .to(live, { twinkle: 1, duration: 1.1 }, S('stars', 0.6))
    .to(stars, { y: 26, duration: 1.3, ease: 'sine.out' }, S('stars', 0.6))
    .addLabel('end', S('settle'));

  // Beats: play from a label to the next; a tap mid-beat lands on its end.
  let playing = null;
  const endOf = (i) => (i + 1 < beats.length ? beats[i + 1].id : 'end');
  const start = (i) => {
    index = i;
    const b = beats[i];
    setCap(b);
    onBeat(i, b);
    if (b.id === 'settle') { tl.seek('end'); finish(); return; }
    playing = tl.tweenFromTo(b.id, endOf(i), { onComplete: () => { playing = null; if (!tap) start(i + 1); else host.classList.add('wait'); } });
  };
  const next = () => {
    if (gone || finished) return;
    host.classList.remove('wait');
    if (playing) {
      playing.kill(); playing = null; tl.seek(endOf(index));
      // A seek skips the timeline's calls: set what they would have left.
      if (beats[index].id === 'gather') sway.pause();
      if (beats[index].id === 'door') { doorEl.hidden = false; doorEl.className = 'zjdoor gone'; }
      if (!tap) start(index + 1); else host.classList.add('wait');
      return;
    }
    start(index + 1);
  };
  const skip = () => { if (gone) return; if (playing) playing.kill(); playing = null; sway.pause(); tl.seek('end'); live.twinkle = 1; doorEl.className = 'zjdoor gone'; if (index < beats.length - 1) start(beats.length - 1); };
  host.addEventListener('click', (e) => { if (e.target.closest('.zjskip')) skip(); else next(); });
  start(0);

  // For looking at one instant (previews, checks): stop and show beat `id` at `frac` of its way.
  const peek = (id, frac = 0.5) => {
    const i = beats.findIndex((b) => b.id === id);
    if (i < 0 || gone) return;
    if (playing) { playing.kill(); playing = null; }
    const t = starts[i] + frac * beats[i].ms / 1000;
    tl.seek(t);
    index = i; setCap(beats[i]);
    const d = t - S('door');
    doorEl.hidden = !(d >= 0.5 && beats[i].id === 'door');
    doorEl.className = `zjdoor ${d < 1.5 ? 'w0' : d < 2.05 ? 'w1' : 'gone'}`;
    host.classList.add('wait');
  };
  return {
    host, next, tap: next, skip, peek,
    done: () => finished,
    beat: () => beats[index],
    destroy() {
      if (gone) return;
      gone = true;
      if (playing) playing.kill();
      tl.kill(); sway.kill();
      app.ticker.remove(tick);
      app.destroy(true, { children: true });
      lightTex.destroy(true);
      host.remove();
    },
  };
}

/// By id, in the same call shape as setpiece.js's runner (the 大场面 lane's):
/// playSetPiece(host, 'zhuji', {lang, still, auto, onBeat(i, beat), onDone}).
export const SET_PIECES = { zhuji: { beats: ZHUJI_BEATS, play: playZhuji } };
export function playSetPiece(host, id, opts = {}) {
  const sp = SET_PIECES[id];
  if (!sp) throw new Error(`no set piece "${id}"`);
  return sp.play(host, opts);
}
