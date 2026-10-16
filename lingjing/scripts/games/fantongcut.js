// 喂饭桶 · 割藤 — the 饭桶's free play as a daily 割绳子 puzzle (Hanli, 2026-10-16: 「割绳子挺好玩，
// 可以反复出现，不同的割法」). He has chosen what to feed (the 物品 panel, as before); it hangs on
// vines over the 饭桶 and he cuts and steers it into its mouth: a tap or a swipe across a vine, a puff
// of wind, a 灵气泡 to pop, 荆棘 to keep clear of, a vine that grows back. The level is made from the
// day's seed and proved solvable before it is shown (rope-gen.js); a miss lays it again at once;
// after `max_misses` 「直接喂」 feeds it anyway, stars 0. Three 灵光 on the way are the stars (kept on
// the save, unpaid). What comes out of the 饭桶 is the rules' roll, as ever — this only stands
// between the choice and the feed.
// Pure module (newGame / act / tick / html) on rope.js's world, plus the small-game contract
// mount(container, { data, lang, reducedMotion }) → Promise<{ won, grade, stars }>.
import { Matter } from './physics.js';
import { btn, n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import { blowGust, buildWorld, cutVine, dist, outOf, popBubble, stepWorld, calm as hangsStill, BREAD_R, FLOOR, GUST_BAND, GUST_MS, H, STEP_MS, W } from './rope.js';
import { generate, MOUTH_R, STAR_R } from './rope-gen.js';

const { Body } = Matter;

export const meta = {
  id: 'fantongcut',
  name: { zh: '喂饭桶 · 割藤', en: 'Feeding the Rice Bucket · Cut the vines' },
  how: {
    zh: '划断藤，把东西送进饭桶嘴里。路上的灵光接住了是星。',
    en: 'Cut the vines and bring it down into the Rice Bucket\'s mouth. The sparks on the way are stars.',
  },
};

const EAT_MS = 1100, MISS_MS = 650, REST_MS = 700, FLECK_MS = 420, POP_MS = 520;
export const MAX_MISSES = 4;
const ART = new URL('../../worlds/jiuding/art/', import.meta.url).href;
const POT = `${ART}games/fantong-pot.webp`, BUBBLE = `${ART}games/bubble.webp`, THORNS = `${ART}games/thorns.webp`;
// The pot's art: its rim sits on the mouth, its feet on the floor.
const POT_W = 92, POT_H = POT_W * 490 / 440, RIM = 0.306;

const T = {
  zh: {
    stars: '灵光', retry: '重来', skip: '直接喂', sample: '柴火棍',
    say: '划断藤，把{name}送进饭桶嘴里。',
    miss: ['掉地上了。再来。', '没进嘴。再来。', '差一点。再来。'], broke: '碰上荆棘，碎了。再来。',
    eat: ['「咕咚」——饭桶一口吞了。', '饭桶「嗝」了一声。', '盖子一跳：吃进去了。'],
    stuck: '实在送不进去，就直接喂吧。',
    done: '吃进去了。', skipped: '直接喂了进去。',
  },
  en: {
    stars: 'Sparks', retry: 'Again', skip: 'Just feed it', sample: 'firewood',
    say: 'Cut the vines and bring the {name} down into the Rice Bucket\'s mouth.',
    miss: ['On the floor. Again.', 'Missed the mouth. Again.', 'So close. Again.'], broke: 'It touched the thorns and broke. Again.',
    eat: ['*Gulp* — the Rice Bucket swallows it whole.', 'The Rice Bucket goes *burp*.', 'The lid jumps: in it goes.'],
    stuck: 'If it will not go in, feed it by hand.',
    done: 'In it went.', skipped: 'Fed by hand.',
  },
};
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/* ── The game ─────────────────────────────────────────────────────────────────────────────── */

/** The sample day when none is given (the 游戏厅, the try page): the seed's level at `tier`. */
const SAMPLE_ELS = [[], ['gust'], ['gust', 'bubble'], ['gust', 'bubble', 'thorns'], ['gust', 'bubble', 'thorns', 'regrow']];

function lay(s) {
  const swing = buildWorld(s.level);
  swing.cuts = [];
  watch(s.key, swing);
  return { ...s, phase: 'play', t: 0, moves: 0, swing, caught: s.level.stars.map(() => false) };
}

export function newGame(seed, level = 1, data = {}) {
  const tier = Math.max(0, Math.min(4, (Number(level) || 1) - 1));
  const made = data.level ? { level: data.level, plan: data.plan ?? null } : generate(data.seed ?? String(seed), { tier: data.tier ?? tier, els: data.els ?? SAMPLE_ELS[tier], must: data.must ?? null });
  const s = { seed: String(seed), key: `${seed}|${Math.random().toString(36).slice(2, 8)}`, live: true, level: made.level, plan: made.plan ?? null,
    item: data.item ?? null, teach: data.teach ?? null, must: data.must ?? null, maxMisses: data.max_misses ?? MAX_MISSES,
    misses: 0, best: 0, clock: 0, note: 'start', won: false, grade: null, stars: 0, still: Boolean(data.still) };
  return lay(s);
}

/** Stuck: missed the same level again and again — 「直接喂」 shows. */
export const stuck = (s) => !s.won && s.misses >= s.maxMisses;
const starsNow = (s) => s.caught.filter(Boolean).length;

const VERBS = {
  cut: (s, d) => (s.phase === 'play' && cutAt(s, Number(d.v), Number(d.k)) ? { ...s, note: 'cut', moves: s.moves + 1 } : null),
  gust: (s) => (s.phase === 'play' && blowGust(s.swing, s.level) ? { ...s, note: 'gust', gustAt: s.clock, moves: s.moves + 1 } : null),
  pop: (s, d) => (s.phase === 'play' && popBubble(s.swing, Number(d.i ?? 0)) ? { ...s, note: 'pop', popAt: s.clock, moves: s.moves + 1 } : null),
  retry: (s) => (['play', 'miss'].includes(s.phase) ? lay({ ...s, note: 'lay' }) : null),
  skip: (s) => (stuck(s) ? { ...s, phase: 'end', live: false, won: true, stars: 0, grade: 'skipped', note: 'skipped' } : null),
};

/* A cut leaves an ink fleck where the vine snapped (the feel: a snap you see). */
function cutAt(s, v, k) {
  const vine = s.swing.vines[v];
  if (!vine || vine.cut != null) return false;
  const pts = vinePoints(vine, s.swing.bread), a = pts[k], b = pts[k + 1];
  if (!cutVine(s.swing, v, k)) return false;
  if (a && b) s.swing.cuts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: s.swing.clock });
  return true;
}

export function act(state, data = {}) {
  if (!state || state.won || !state.live) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── Time ─────────────────────────────────────────────────────────────────────────────────── */

const anyHeld = (w) => w.bubbles.some((b) => b.state === 'held');
const mayRegrow = (w) => w.vines.some((v) => v.regrow && v.cut != null && dist(w.bread.position, v.at) <= v.len);

function judge(s, ev) {
  const w = s.swing, b = w.bread, p = b.position, L = s.level;
  L.stars.forEach((st, i) => {
    if (!s.caught[i] && dist(p, st) < STAR_R + BREAD_R) { s = { ...s, caught: s.caught.map((c, j) => c || j === i), note: 'star', starAt: s.clock, starI: i }; }
  });
  if (ev.broke) return miss(s, 'broke');
  if (s.moves > 0 && dist(p, L.mouth) < MOUTH_R + BREAD_R * 0.4) return eat(s);
  const free = w.vines.every((v) => v.cut != null) && !anyHeld(w);
  w.rest = free && hangsStill(w) ? w.rest + STEP_MS : 0;
  if (outOf(w) || (w.rest >= REST_MS && !L.gust && !mayRegrow(w))) return miss(s, 'miss');
  return s;
}

function eat(s) {
  Body.setStatic(s.swing.bread, true);
  s.swing.done = true;
  return { ...s, phase: 'eat', t: 0, note: 'eat', from: { x: s.swing.bread.position.x, y: s.swing.bread.position.y }, best: Math.max(s.best, starsNow(s)) };
}

function miss(s, why) {
  s.swing.done = true;
  return { ...s, phase: 'miss', t: 0, note: why, misses: s.misses + 1 };
}

const PHASES = {
  play(s) { return judge(s, stepWorld(s.swing, s.level)); },
  eat: (s) => (s.t < EAT_MS ? s : { ...s, phase: 'end', live: false, won: true, stars: s.best, grade: 'fed', note: 'done' }),
  miss: (s) => (s.t < MISS_MS ? s : lay({ ...s, note: 'lay' })),
};

export function tick(state, ms) {
  if (!state?.live || state.won || !state.swing) return state;
  let s = state;
  s.swing.acc += ms;
  while (s.swing.acc >= STEP_MS && s.live && !s.won) {
    s.swing.acc -= STEP_MS;
    s = { ...s, t: s.t + STEP_MS, clock: s.clock + STEP_MS };
    s = PHASES[s.phase]?.(s) ?? s;
  }
  return s;
}

/* ── The picture ──────────────────────────────────────────────────────────────────────────── */

const calm = (s) => Boolean(s?.still) || still();

function curve(pts) {
  if (pts.length < 2) return '';
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) d += ` Q${n(pts[i].x)} ${n(pts[i].y)} ${n((pts[i].x + pts[i + 1].x) / 2)} ${n((pts[i].y + pts[i + 1].y) / 2)}`;
  return `${d} L${n(pts.at(-1).x)} ${n(pts.at(-1).y)}`;
}
const vinePoints = (v, bread, at = (b) => b.position) => [{ x: v.at[0], y: v.at[1] }, ...v.links.map(at), at(bread)];
function vineStrokes(pts, cutAt, tail = true) {
  const parts = cutAt == null ? [pts] : tail ? [pts.slice(0, cutAt + 1), pts.slice(cutAt + 1)] : [pts.slice(0, cutAt + 1)];
  return parts.filter((p) => p.length > 1).map((p) => { const d = curve(p); return `<path class="g-vine-wash" d="${d}"/><path class="g-vine" d="${d}"/>`; }).join('');
}

function vinePicture(v, i, w, live, phase) {
  const pts = vinePoints(v, w.bread);
  const grow = v.regrow && v.cut != null ? Math.min(1, (w.clock - v.cutAt) / v.regrow) : null;
  const sprout = grow != null ? `<circle class="g-regrow" cx="${v.at[0]}" cy="${v.at[1] + 6}" r="${n(4 + grow * 6)}"/>` : '';
  const strokes = `<g data-vine="${i}" class="${v.regrow ? 'is-regrow' : ''}">${vineStrokes(pts, v.cut, live || phase === 'miss')}</g>`;
  const hits = !live || v.cut != null ? '' : pts.slice(0, -1).map((a, k) => {
    const b = pts[k + 1];
    return `<line class="g-vine-hit" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" data-g="cut" data-g-swipe="" data-v="${i}" data-k="${k}"/>`;
  }).join('');
  return strokes + sprout + `<circle class="g-vine-knot${v.regrow ? ' is-regrow' : ''}" cx="${v.at[0]}" cy="${v.at[1]}" r="4"/>` + hits;
}

/* The thing he chose: its own picture in a round, else its name's first character in an ink ring. */
function itemPicture(s, x, y, angle, scale = 1) {
  const r = s.level.r ?? BREAD_R, it = s.item;
  const face = it?.art
    ? `<clipPath id="g-ft-clip"><circle r="${r}"/></clipPath><image href="${it.art}" x="${-r * 1.6}" y="${-r * 1.2}" width="${r * 3.2}" height="${r * 2.4}" clip-path="url(#g-ft-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text class="g-ft-glyph" y="6" text-anchor="middle">${(it?.name ?? '柴').slice(0, 1)}</text>`;
  return `<g class="g-bing g-ft-item" transform="translate(${n(x)} ${n(y)}) rotate(${n((angle * 180) / Math.PI)}) scale(${n(scale, 2)})"><circle class="g-ft-ring" r="${r}"/>${face}</g>`;
}

function potPicture(s) {
  const [mx, my] = s.level.mouth, x = mx - POT_W / 2, y = my - RIM * POT_H;
  const k = s.phase === 'eat' && !calm(s) ? Math.sin(Math.min(1, s.t / 420) * Math.PI) : 0;
  return `<g class="g-ft-pot${s.phase === 'eat' ? ' is-eating' : ''}" transform="translate(${n(x)} ${n(y - k * 12)}) scale(1 ${n(1 - k * 0.06, 3)})">`
    + `<image href="${POT}" width="${POT_W}" height="${n(POT_H)}"/></g><ellipse class="g-ft-mouth" cx="${mx}" cy="${my}" rx="${MOUTH_R + 6}" ry="7"/>`;
}

function bubblePicture(w, i) {
  const b = w.bubbles[i];
  if (b.state === 'popped') return '';
  const r = b.r + (b.state === 'held' ? 6 : 0), [x, y] = b.state === 'held' ? [w.bread.position.x, w.bread.position.y] : b.at;
  return `<g class="g-ft-bubble${b.state === 'held' ? ' is-held' : ''}" data-g="pop" data-i="${i}" transform="translate(${n(x)} ${n(y)})">`
    + `<circle class="g-ft-hit" r="${r + 10}"/><image href="${BUBBLE}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"/></g>`;
}

const thornPicture = (t) => `<g class="g-ft-thorns" transform="translate(${t.x} ${t.y}) rotate(${t.a ?? 0})"><image href="${THORNS}" x="${-t.w / 2 - 8}" y="${-t.h / 2 - 10}" width="${t.w + 16}" height="${t.h + 20}" preserveAspectRatio="none"/></g>`;

function stonePicture(st) {
  return `<g transform="translate(${st.x} ${st.y}) rotate(${st.a ?? 0})"><rect class="g-b-stone" x="${-st.w / 2}" y="${-st.h / 2}" width="${st.w}" height="${st.h}" rx="${n(st.h / 2.4)}"/>`
    + `<path class="g-b-stone-line" d="M${-st.w / 2 + 6} ${-st.h / 2 + 2} q${st.w / 3} -3 ${st.w - 14} 1"/></g>`;
}

function gustPicture(s) {
  const g = s.level.gust;
  if (!g) return '';
  const [x, y] = g.at, dir = (g.to ?? [1, 0])[0] >= 0 ? 1 : -1, on = s.swing.gust > 0, band = g.band ?? GUST_BAND;
  const k = on ? 1 - s.swing.gust / GUST_MS : 0, reach = calm(s) ? 1 : k;
  const streaks = on ? [-0.6, -0.2, 0.25, 0.65].map((f, i) => `<path class="g-gust-streak" d="M${n(x + dir * 26)} ${n(y + f * band)} q${n(dir * (120 + i * 30) * reach * 0.5)} ${n(-6 + i * 3)} ${n(dir * (120 + i * 30) * reach)} 0"/>`).join('') : '';
  return `<rect class="g-gust-band" x="0" y="${y - band}" width="${W}" height="${band * 2}"/>${streaks}`
    + `<g class="g-puff${on ? ' is-on' : ''}${s.must === 'gust' ? ' g-teach' : ''}" transform="translate(${x} ${y})" data-g="gust"><circle class="g-puff-hit" r="30"/>`
    + `<path class="g-puff-cloud" d="M-16 6 q-6 -12 6 -14 q4 -10 14 -4 q10 -4 12 6 q8 2 4 10 q-6 6 -36 2Z" transform="scale(${dir} 1)"/></g>`;
}

/* 灵光: a star is a spark of the house's cinnabar, popping when caught. */
function starsPicture(s) {
  return s.level.stars.map(([x, y], i) => {
    if (s.caught[i]) {
      const age = s.clock - (s.starI === i ? s.starAt : -1e9);
      if (!(age >= 0 && age < POP_MS) || calm(s)) return '';
      const k = age / POP_MS;
      return `<g class="g-ft-star is-pop" transform="translate(${x} ${y}) scale(${n(1 + k * 1.6, 2)})" opacity="${n(1 - k, 2)}"><circle r="${STAR_R - 3}"/></g>`;
    }
    return `<g class="g-ft-star" transform="translate(${x} ${y})"><circle class="g-ft-glow" r="${STAR_R}"/><circle r="${STAR_R - 6}"/></g>`;
  }).join('');
}

function flecks(s) {
  if (calm(s)) return '';
  return (s.swing.cuts ?? []).map((c) => splash(c.x, c.y, (s.swing.clock - c.at) * (700 / FLECK_MS), { r: 7 })).join('');
}

function ground() {
  return `<path class="g-cave-roof" d="M0 0 H${W} V18 C${W - 60} 26 ${W - 120} 14 ${W / 2} 22 C120 30 60 16 0 24Z"/>`
    + `<path class="g-cave-floor" d="M0 ${FLOOR} C90 ${FLOOR - 3} 200 ${FLOOR + 3} ${W} ${FLOOR - 1} V${H} H0Z"/>`
    + `<path class="g-cave-line" d="M0 ${FLOOR} C90 ${FLOOR - 3} 200 ${FLOOR + 3} ${W} ${FLOOR - 1}"/>`;
}

function playScene(s) {
  const w = s.swing, live = s.phase === 'play', b = w.bread, L = s.level;
  let item = '';
  if (s.phase === 'eat') {
    const k = Math.min(1, s.t / 380), [mx, my] = L.mouth, f = s.from;
    item = k < 1 ? itemPicture(s, f.x + (mx - f.x) * k, f.y + (my + 8 - f.y) * k, b.angle, 1 - 0.7 * k) : '';
  } else if (s.phase !== 'end') item = itemPicture(s, b.position.x, b.position.y, b.angle);
  const fx = s.phase === 'miss' && !calm(s) ? splash(b.position.x, Math.min(b.position.y, FLOOR - 4), s.t, { r: 11 }) : '';
  const burp = s.phase === 'eat' ? `<text class="g-ft-burp" x="${L.mouth[0] + 30}" y="${n(L.mouth[1] - 30 - Math.min(1, s.t / 500) * 18)}" opacity="${n(Math.max(0, 1 - s.t / EAT_MS), 2)}">嗝</text>` : '';
  const teachRing = s.must && s.must !== 'gust' ? teachMark(s) : '';
  return scene(W, H, ground() + gustPicture(s) + (L.stones ?? []).map(stonePicture).join('') + (L.thorns ?? []).map(thornPicture).join('')
    + potPicture(s) + starsPicture(s) + w.vines.map((v, i) => vinePicture(v, i, w, live, s.phase)).join('')
    + w.bubbles.map((_, i) => bubblePicture(w, i)).join('') + item + flecks(s) + fx + burp + teachRing, 'g-bread-cave g-ft-cave')
    .replace('<svg ', `<svg data-swing="${esc(s.key)}" `);
}

/* The teaching beat: a slow ink ring around the element met for the first time today. */
function teachMark(s) {
  const L = s.level, at = s.must === 'bubble' ? L.bubbles?.[0]?.at : s.must === 'thorns' ? [L.thorns?.[0]?.x, L.thorns?.[0]?.y]
    : s.must === 'regrow' ? s.swing.vines.find((v) => v.regrow)?.at : null;
  if (!at || at[0] == null || s.phase !== 'play' || s.moves > 1) return '';
  return `<circle class="g-teach-ring" cx="${at[0]}" cy="${at[1] + (s.must === 'regrow' ? 30 : 0)}" r="${s.must === 'thorns' ? 46 : 36}"/>`;
}

function lineOf(s, t, lang) {
  if (s.phase === 'miss') return s.note === 'broke' ? t.broke : t.miss[(s.misses - 1) % t.miss.length];
  if (s.phase === 'eat') return t.eat[s.misses % t.eat.length];
  if (stuck(s)) return t.stuck;
  return s.teach ?? fill(t.say, { name: s.item?.name ?? t.sample });
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, s = state;
  const head = `<div class="g-head g-bread-head"><span>${esc(s.item?.name ?? t.sample)}</span><span>${t.stars} <b>${s.won ? s.stars : starsNow(s)}</b> / 3</span></div>`;
  if (s.won) {
    return `<div class="g-bread g-ft g-ink is-won">${head}${scene(W, H, ground() + potPicture({ ...s, phase: 'end' }), 'g-bread-cave g-ft-cave is-end')}<p class="g-line-say">${s.grade === 'skipped' ? t.skipped : t.done}</p></div>`;
  }
  const row = stuck(s) ? `<div class="g-pair">${btn(t.skip, 'data-g="skip"', 'main')}${btn(t.retry, 'data-g="retry"', 'soft')}</div>`
    : `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', 'quiet')}</div>`;
  return `<div class="g-bread g-ft g-ink">${head}${playScene(s)}<p class="g-line-say${s.teach && s.phase === 'play' && !stuck(s) ? ' g-teach-say' : ''}">${esc(lineOf(s, t, lang))}</p>${row}</div>`;
}

/* ── Between the clock's steps: the frame painter (as 喂饼's) ── */
const SWINGS = new Map();
const esc = (v) => String(v).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
function watch(key, swing) {
  if (typeof requestAnimationFrame !== 'function') return;
  SWINGS.set(String(key), swing);
  if (SWINGS.size > 8) SWINGS.delete(SWINGS.keys().next().value);
  if (!watch.on) { watch.on = true; requestAnimationFrame(paintFrame); }
}
function paintSwing(svg, w) {
  const k = Math.min(3, Math.max(0, (performance.now() - (w.wall ?? 0)) / STEP_MS));
  const at = (b) => ({ x: b.position.x + b.velocity.x * k, y: b.position.y + b.velocity.y * k });
  const p = at(w.bread), a = w.bread.angle + w.bread.angularVelocity * k;
  svg.querySelector('.g-ft-item')?.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)}) rotate(${n((a * 180) / Math.PI)})`);
  w.vines.forEach((v, i) => { const g = svg.querySelector(`[data-vine="${i}"]`); if (g) g.innerHTML = vineStrokes(vinePoints(v, w.bread, at), v.cut); });
  w.bubbles.forEach((b, i) => { if (b.state === 'held') svg.querySelector(`.g-ft-bubble[data-i="${i}"]`)?.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)})`); });
}
function paintFrame() {
  for (const svg of document.querySelectorAll('svg[data-swing]')) {
    const w = SWINGS.get(svg.dataset.swing);
    if (w && !w.done && w.wall && w.cuts) paintSwing(svg, w);
  }
  requestAnimationFrame(paintFrame);
}

/* ── Standalone: the small-game contract ── */
export function mount(container, opts = {}) {
  return mountPure({ newGame, act, tick, html })(container, { ...opts, data: { ...(opts.data ?? {}), ...(opts.reducedMotion ? { still: true } : {}) } });
}
