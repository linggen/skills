// ropekit.js — one 割绳子 level as a game, for every scene that drops, hangs or steers a thing
// (2026-10-16: the 饭桶's daily puzzle, then the story's beats — 算账 · 忍字 · 认路 — and any slot
// after them). The world is rope.js's, the level the caller's (made by rope-gen.js or written as
// data); a scene brings only what is its own through a `spec`:
//   meta, T                 the name and the words (zh/en): stars, retry, skip, say, miss[], broke,
//                           stolen, eat[], stuck, done, skipped, name (the thing)
//   makeLevel(seed, level, data) → { level, plan }    the level (data.level when given)
//   thing(s, r)             the thing's picture, centred on 0,0 (radius r)
//   target(s, calm)         the goal's picture at level.mouth — and its reaction while eating
//   grade(s)                the won grade (from s.best, the stars); `skipGrade` when fed by hand
//   quote                   the book's line, shown above the board (optional)
//   cls                     the board's own class
//   pack(s, r)              坠's picture (the weight under the thing), centred on 0,0 (radius r)
//   stone(st)               a stone's picture when the scene paints its own (a ledge, a spur); '' draws none
//   backdrop(s)             the board's ground (the cave's by default)
// The kit keeps the rest the same everywhere: cut (tap or swipe), puff, pop; a miss lays it again at
// once; after `max_misses` the skip button; the settle eased up to FAST×; flecks, popping stars,
// the teaching ring for the tool met the first time; the frame painter; the mount contract.
import { Matter } from './physics.js';
import { btn, n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import { blowGust, buildWorld, cutPack, cutVine, dist, outOf, popBubble, stepWorld, calm as hangsStill, BREAD_R, FLOOR, GUST_BAND, GUST_MS, H, STEP_MS, W } from './rope.js';
import { FALLBACK, MOUTH_R, STAR_R } from './rope-gen.js';
import { crowsPicture, sealsPicture, springPicture, toolMark } from './rope-art.js';

const { Body } = Matter;

export const EAT_MS = 1400;
export const MAX_MISSES = 4;
export const FAST = 4;
export const FAST_AFTER = 300;
export const RAMP_MS = 500;
const MISS_MS = 650, REST_MS = 700, FLECK_MS = 420, POP_MS = 520;
const ART = new URL('../../worlds/jiuding/art/', import.meta.url).href;
const BUBBLE = `${ART}games/bubble.webp`, THORNS = `${ART}games/thorns.webp`, PUFF = `${ART}games/bread/puff.webp`, SPARK = `${ART}games/spark.webp`;
export const esc = (v) => String(v).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
export const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/* ── The world's helpers, the same for every scene ── */
const anyHeld = (w) => w.bubbles.some((b) => b.state === 'held');
const mayRegrow = (w) => w.vines.some((v) => v.regrow && v.cut != null && dist(w.bread.position, v.at) <= v.len);
const starsNow = (s) => s.caught.filter(Boolean).length;
const calmOf = (s) => Boolean(s?.still) || still();
const ease = (x) => x * x * (3 - 2 * x);

/* No waiting (2026-10-16 「不要等」): after a move the swing plays at its own pace a moment, then
   time quickens — eased in over RAMP_MS, gentler on a big fast swing — up to FAST× while it only
   settles (hung on a vine or held in a bubble, no puff). A fall, a roll, a puff: always its own pace. */
export function paceOf(s) {
  if (s.phase !== 'play' || !s.moves) return 1;
  // A level built on swinging (`air`, 拽): the swing is the clock he times a cut by — never quickened.
  if (s.level.air != null) return 1;
  const since = s.clock - (s.movedAt ?? 0) - FAST_AFTER;
  if (since <= 0) return 1;
  const w = s.swing;
  // A crow walking is a clock the player races: its time is never quickened.
  if (w.gust > 0 || hangsStill(w) || w.crows?.some((c) => c.state === 'walking')) return 1;
  if (!(w.vines.some((v) => v.cut == null) || anyHeld(w))) return 1;
  const up = ease(Math.min(1, since / RAMP_MS));
  const down = 1 - 0.45 * ease(Math.min(1, Math.max(0, (w.bread.speed - 2) / 6)));
  return 1 + (FAST - 1) * up * down;
}

/* ── Drawing helpers, the same for every scene ── */
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
function vinePicture(v, i, w, live, phase, part = 'all') {
  const pts = vinePoints(v, w.bread);
  if (part === 'hits') {
    return !live || v.cut != null ? '' : pts.slice(0, -1).map((a, k) => {
      const b = pts[k + 1];
      return `<line class="g-vine-hit" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" data-g="cut" data-g-swipe="" data-v="${i}" data-k="${k}"/>`;
    }).join('');
  }
  const grow = v.regrow && v.cut != null ? Math.min(1, (w.clock - v.cutAt) / v.regrow) : null;
  const sprout = grow != null ? `<circle class="g-regrow" cx="${v.at[0]}" cy="${v.at[1] + 6}" r="${n(4 + grow * 6)}"/>` : '';
  return `<g data-vine="${i}" class="${v.regrow ? 'is-regrow' : ''}">${vineStrokes(pts, v.cut, live || phase === 'miss')}</g>`
    + `${sprout}<circle class="g-vine-knot${v.regrow ? ' is-regrow' : ''}" cx="${v.at[0]}" cy="${v.at[1]}" r="4"/>`;
}
function bubblePicture(w, i) {
  const b = w.bubbles[i];
  if (b.state === 'popped') return '';
  const r = b.r + (b.state === 'held' ? 6 : 0), [x, y] = b.state === 'held' ? [w.bread.position.x, w.bread.position.y] : b.at;
  return `<g class="g-ft-bubble${b.state === 'held' ? ' is-held' : ''}" data-g="pop" data-i="${i}" transform="translate(${n(x)} ${n(y)})">`
    + `<circle class="g-ft-hit" r="${r + 4}"/><image href="${BUBBLE}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"/></g>`;
}
const thornPicture = (t) => `<g class="g-ft-thorns" transform="translate(${t.x} ${t.y}) rotate(${t.a ?? 0})"><image href="${THORNS}" x="${-t.w / 2 - 8}" y="${-t.h / 2 - 10}" width="${t.w + 16}" height="${t.h + 20}" preserveAspectRatio="none"/></g>`;
const stonePicture = (st) => `<g transform="translate(${st.x} ${st.y}) rotate(${st.a ?? 0})"><rect class="g-b-stone" x="${-st.w / 2}" y="${-st.h / 2}" width="${st.w}" height="${st.h}" rx="${n(st.h / 2.4)}"/>`
  + `<path class="g-b-stone-line" d="M${-st.w / 2 + 6} ${-st.h / 2 + 2} q${st.w / 3} -3 ${st.w - 14} 1"/></g>`;
/* 坠: the strap (a vine-like line, cut like one) and the weight on it; once cut, the weight falls alone. */
function strapPoints(w, at = (b) => b.position) {
  return [at(w.bread), at(w.pack.body)];
}
function packPicture(s, spec, live) {
  const p = s.swing.pack;
  if (!p) return '';
  const b = p.body, r = b.circleRadius;
  const strap = p.cut ? '' : `<g data-strap="">${vineStrokes(strapPoints(s.swing), null)}</g>`;
  if (b.position.y > H + 60) return strap;
  return strap + `<g class="g-rope-pack" transform="translate(${n(b.position.x)} ${n(b.position.y)}) rotate(${n((b.angle * 180) / Math.PI)})">${spec.pack?.(s, r) ?? `<circle class="g-b-stone" r="${r}"/>`}</g>`;
}
function strapHit(s, live) {
  const p = s.swing.pack;
  if (!p || p.cut || !live) return '';
  const [a, b] = strapPoints(s.swing);
  return `<line class="g-vine-hit" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" data-g="cut" data-g-swipe="" data-v="pack" data-k="0"/>`;
}
function gustPicture(s) {
  const g = s.level.gust;
  if (!g) return '';
  const [x, y] = g.at, dir = (g.to ?? [1, 0])[0] >= 0 ? 1 : -1, on = s.swing.gust > 0, band = g.band ?? GUST_BAND;
  const k = on ? 1 - s.swing.gust / GUST_MS : 0, reach = calmOf(s) ? 1 : k;
  const streaks = on ? [-0.6, -0.2, 0.25, 0.65].map((f, i) => `<path class="g-gust-streak" d="M${n(x + dir * 26)} ${n(y + f * band)} q${n(dir * (120 + i * 30) * reach * 0.5)} ${n(-6 + i * 3)} ${n(dir * (120 + i * 30) * reach)} 0"/>`).join('') : '';
  return `<rect class="g-gust-band" x="0" y="${y - band}" width="${W}" height="${band * 2}"/>${streaks}`
    + `<g class="g-puff${on ? ' is-on' : ''}${s.must === 'gust' ? ' g-teach' : ''}" transform="translate(${x} ${y})" data-g="gust"><circle class="g-puff-hit" r="30"/>`
    // the painted puff (喂饼's, local FLUX) — no code-drawn cloud (Hanli 10-19, on 忍字's frame)
    + `<image class="g-puff-art" href="${PUFF}" x="-26" y="-16" width="52" height="32" transform="scale(${dir} 1)"/></g>`;
}
// 灵光: the painted mote (local FLUX, 2026-10-19 — they were code-drawn red dots)
const sparkImg = () => `<image class="g-ft-spark" href="${SPARK}" x="${-STAR_R * 1.6}" y="${-STAR_R * 1.6}" width="${STAR_R * 3.2}" height="${STAR_R * 3.2}"/>`;
function starsPicture(s) {
  return s.level.stars.map(([x, y], i) => {
    if (s.caught[i]) {
      const age = s.clock - (s.starI === i ? s.starAt : -1e9);
      if (!(age >= 0 && age < POP_MS) || calmOf(s)) return '';
      const k = age / POP_MS;
      return `<g class="g-ft-star is-pop" transform="translate(${x} ${y}) scale(${n(1 + k * 1.6, 2)})" opacity="${n(1 - k, 2)}">${sparkImg()}</g>`;
    }
    return `<g class="g-ft-star" transform="translate(${x} ${y})">${sparkImg()}</g>`;
  }).join('');
}
const flecks = (s) => (calmOf(s) ? '' : (s.swing.cuts ?? []).map((c) => splash(c.x, c.y, (s.swing.clock - c.at) * (700 / FLECK_MS), { r: 7 })).join(''));
export function ground() {
  return `<path class="g-cave-roof" d="M0 0 H${W} V18 C${W - 60} 26 ${W - 120} 14 ${W / 2} 22 C120 30 60 16 0 24Z"/>`
    + `<path class="g-cave-floor" d="M0 ${FLOOR} C90 ${FLOOR - 3} 200 ${FLOOR + 3} ${W} ${FLOOR - 1} V${H} H0Z"/>`
    + `<path class="g-cave-line" d="M0 ${FLOOR} C90 ${FLOOR - 3} 200 ${FLOOR + 3} ${W} ${FLOOR - 1}"/>`;
}
function teachMark(s) {
  const L = s.level, bub = s.swing.bubbles[0];
  const at = s.must === 'bubble' ? (bub?.state === 'popped' ? null : bub?.state === 'held' ? [s.swing.bread.position.x, s.swing.bread.position.y] : bub?.at)
    : s.must === 'thorns' ? [L.thorns?.[0]?.x, L.thorns?.[0]?.y] : s.must === 'regrow' ? s.swing.vines.find((v) => v.regrow)?.at : null;
  if (s.phase !== 'play' || s.moves > 1) return '';
  const tool = at ? null : toolMark(s.swing, L, s.must);
  if (tool) return `<circle class="g-teach-ring" cx="${n(tool[0])}" cy="${n(tool[1])}" r="${tool[2]}"/>`;
  if (!at || at[0] == null) return '';
  return `<circle class="g-teach-ring" cx="${n(at[0])}" cy="${n(at[1] + (s.must === 'regrow' ? 30 : 0))}" r="${s.must === 'thorns' ? 46 : 36}"/>`;
}

/* ── The frame painter (one for every kit game) ── */
const SWINGS = new Map();
function watch(key, swing) {
  if (typeof requestAnimationFrame !== 'function') return;
  SWINGS.set(String(key), swing);
  if (SWINGS.size > 8) SWINGS.delete(SWINGS.keys().next().value);
  if (!watch.on) { watch.on = true; requestAnimationFrame(paintFrame); }
}
function paintSwing(svg, w) {
  const k = Math.min(3, Math.max(0, (performance.now() - (w.wall ?? 0)) / STEP_MS));
  const at = (b) => ({ x: b.position.x + b.velocity.x * k, y: b.position.y + b.velocity.y * k });
  const p = at(w.bread), a = w.upright ? 0 : w.bread.angle + w.bread.angularVelocity * k;
  svg.querySelector('.g-ft-item')?.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)}) rotate(${n((a * 180) / Math.PI)})`);
  w.vines.forEach((v, i) => { const g = svg.querySelector(`[data-vine="${i}"]`); if (g) g.innerHTML = vineStrokes(vinePoints(v, w.bread, at), v.cut); });
  if (w.pack) {
    const q = at(w.pack.body);
    svg.querySelector('.g-rope-pack')?.setAttribute('transform', `translate(${n(q.x)} ${n(q.y)}) rotate(${n((w.pack.body.angle * 180) / Math.PI)})`);
    const g = svg.querySelector('[data-strap]');
    if (g) g.innerHTML = w.pack.cut ? '' : vineStrokes(strapPoints(w, at), null);
  }
  w.bubbles.forEach((b, i) => { if (b.state === 'held') svg.querySelector(`.g-ft-bubble[data-i="${i}"]`)?.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)})`); });
}
function paintFrame() {
  for (const svg of document.querySelectorAll('svg[data-swing]')) {
    const w = SWINGS.get(svg.dataset.swing);
    if (w && !w.done && w.wall && w.cuts) paintSwing(svg, w);
  }
  requestAnimationFrame(paintFrame);
}

/** One scene's game on the kit: the pure module (newGame · act · tick · html · stuck) and its mount. */
export function makeRopeGame(spec) {
  const { meta, T } = spec;

  function lay(s) {
    const swing = buildWorld(s.level);
    swing.cuts = [];
    swing.upright = Boolean(spec.upright); // a person hangs upright; a 饼 tumbles
    watch(s.key, swing);
    return { ...s, phase: 'play', t: 0, moves: 0, swing, caught: s.level.stars.map(() => false) };
  }

  function newGame(seed, level = 1, data = {}) {
    const made = data.level ? { level: data.level, plan: data.plan ?? null } : spec.makeLevel(seed, level, data);
    if (!made.level) Object.assign(made, { level: structuredClone(FALLBACK), plan: [{ g: 'cut', v: 0 }] }); // no level handed in: the one that always works
    const s = { seed: String(seed), key: `${meta.id}|${seed}|${Math.random().toString(36).slice(2, 8)}`, live: true, level: made.level, plan: made.plan ?? null,
      item: data.item ?? null, teach: data.teach ?? null, must: data.must ?? made.level.must ?? null, maxMisses: data.max_misses ?? MAX_MISSES,
      misses: 0, best: 0, clock: 0, note: 'start', won: false, grade: null, stars: 0, still: Boolean(data.still) };
    return lay(s);
  }

  const stuck = (s) => !s.won && s.misses >= s.maxMisses;

  function cutAt(s, v, k) {
    const vine = s.swing.vines[v];
    if (!vine || vine.cut != null) return false;
    const pts = vinePoints(vine, s.swing.bread), a = pts[k], b = pts[k + 1];
    if (!cutVine(s.swing, v, k)) return false;
    if (a && b) s.swing.cuts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: s.swing.clock });
    return true;
  }
  // 坠: the strap under the thing, cut like a vine (one segment); the weight falls away.
  function strapCut(s) {
    const p = s.swing.pack;
    if (!p || p.cut || !cutPack(s.swing)) return false;
    const a = s.swing.bread.position, b = p.body.position;
    s.swing.cuts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: s.swing.clock });
    return true;
  }
  const moved = (s, note) => ({ ...s, note, moves: s.moves + 1, movedAt: s.clock });
  const VERBS = {
    cut: (s, d) => (s.phase === 'play' && (d.v === 'pack' ? strapCut(s) : cutAt(s, Number(d.v), Number(d.k))) ? moved(s, 'cut') : null),
    gust: (s) => (s.phase === 'play' && blowGust(s.swing, s.level) ? { ...moved(s, 'gust'), gustAt: s.clock } : null),
    pop: (s, d) => (s.phase === 'play' && popBubble(s.swing, Number(d.i ?? 0)) ? { ...moved(s, 'pop'), popAt: s.clock } : null),
    retry: (s) => (['play', 'miss'].includes(s.phase) ? lay({ ...s, note: 'lay' }) : null),
    skip: (s) => (stuck(s) ? { ...s, phase: 'end', live: false, won: true, stars: 0, grade: spec.skipGrade ?? null, skipped: true, note: 'skipped' } : null),
  };
  function act(state, data = {}) {
    if (!state || state.won || !state.live) return { state, won: false };
    const next = VERBS[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  }

  function judge(s, ev) {
    const w = s.swing, p = w.bread.position, L = s.level;
    L.stars.forEach((st, i) => {
      if (!s.caught[i] && dist(p, st) < STAR_R + BREAD_R) s = { ...s, caught: s.caught.map((c, j) => c || j === i), note: 'star', starAt: s.clock, starI: i };
    });
    if (ev.broke) return miss(s, 'broke');
    if (ev.stolen) return miss(s, 'stolen');
    // `reach`: a level whose goal is a ledge, not a mouth, may set how near counts (拽, 2026-10-19).
    if (s.moves > 0 && dist(p, L.mouth) < (L.reach ?? MOUTH_R + BREAD_R * 0.4)) return eat(s);
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
    play: (s) => judge(s, stepWorld(s.swing, s.level)),
    eat: (s) => (s.t < EAT_MS ? s : { ...s, phase: 'end', live: false, won: true, stars: s.best, grade: spec.grade(s), note: 'done' }),
    miss: (s) => (s.t < MISS_MS ? s : lay({ ...s, note: 'lay' })),
  };
  function tick(state, ms) {
    if (!state?.live || state.won || !state.swing) return state;
    let s = state;
    s.swing.acc += ms * paceOf(s);
    while (s.swing.acc >= STEP_MS && s.live && !s.won) {
      s.swing.acc -= STEP_MS;
      s = { ...s, t: s.t + STEP_MS, clock: s.clock + STEP_MS };
      s = PHASES[s.phase]?.(s) ?? s;
    }
    return s;
  }

  function thingAt(s, x, y, angle, scale = 1) {
    const r = s.level.r ?? BREAD_R;
    return `<g class="g-bing g-ft-item" data-see="thing" transform="translate(${n(x)} ${n(y)}) rotate(${n(spec.upright ? 0 : (angle * 180) / Math.PI)}) scale(${n(scale, 2)})">${spec.thing(s, r)}</g>`;
  }
  function playScene(s) {
    const w = s.swing, live = s.phase === 'play', b = w.bread, L = s.level;
    let thing = '';
    if (s.phase === 'eat') {
      const k = Math.min(1, s.t / 380), [mx, my] = L.mouth, f = s.from;
      thing = k < 1 ? thingAt(s, f.x + (mx - f.x) * k, f.y + (my + 8 - f.y) * k, b.angle, 1 - 0.7 * k) : '';
    } else if (s.phase !== 'end') thing = thingAt(s, b.position.x, b.position.y, b.angle);
    const fx = s.phase === 'miss' && !calmOf(s) ? splash(b.position.x, Math.min(b.position.y, FLOOR - 4), s.t, { r: 11 }) : '';
    return scene(W, H, (spec.backdrop?.(s) ?? ground()) + gustPicture(s) + (L.stones ?? []).map((st) => spec.stone?.(st) ?? stonePicture(st)).join('') + (L.springs ?? []).map((sp) => springPicture(sp)).join('')
      + (L.thorns ?? []).map(thornPicture).join('') + sealsPicture(w, L)
      + spec.target(s, calmOf(s)) + starsPicture(s) + w.vines.map((v, i) => vinePicture(v, i, w, live, s.phase)).join('') + crowsPicture(w)
      + w.bubbles.map((_, i) => bubblePicture(w, i)).join('') + thing + packPicture(s, spec, live) + flecks(s) + fx + (s.must && s.must !== 'gust' ? teachMark(s) : '')
      // The vines' cut lines lie over everything: a tap on a vine above a bubble cuts the vine, never pops it.
      + w.vines.map((v, i) => vinePicture(v, i, w, live, s.phase, 'hits')).join('') + strapHit(s, live), `g-bread-cave g-ft-cave ${spec.cls ?? ''}`)
      .replace('<svg ', `<svg data-swing="${esc(s.key)}" `);
  }
  function lineOf(s, t) {
    if (s.phase === 'miss') return s.note === 'broke' ? t.broke : s.note === 'stolen' ? t.stolen : t.miss[(s.misses - 1) % t.miss.length];
    if (s.phase === 'eat') return t.eat[s.misses % t.eat.length];
    if (stuck(s)) return t.stuck;
    return s.teach ?? s.level.teach?.[t === T.en ? 'en' : 'zh'] ?? fill(t.say, { name: s.item?.name ?? t.name });
  }
  function html(state, lang = 'zh') {
    const t = T[lang] || T.zh, s = state;
    const quote = spec.quote ? `<p class="g-rope-quote">${esc(spec.quote[lang] ?? spec.quote.zh)}</p>` : '';
    const head = `${quote}<div class="g-head g-bread-head"><span>${esc(s.item?.name ?? t.name)}</span><span>${t.stars} <b>${s.won ? s.stars : starsNow(s)}</b> / 3</span></div>`;
    if (s.won) {
      // A thing that stays where it landed (the meat in the pan, the fox on the moss) is drawn there at the end.
      const rests = spec.rests && !s.skipped ? thingAt(s, s.level.mouth[0], s.level.mouth[1] - 6, 0, 0.9) : '';
      return `<div class="g-bread g-ft g-ink is-won ${spec.cls ?? ''}">${head}${scene(W, H, (spec.backdrop?.({ ...s, phase: 'end' }) ?? ground()) + spec.target({ ...s, phase: 'end' }, true) + rests, `g-bread-cave g-ft-cave is-end ${spec.cls ?? ''}`)}<p class="g-line-say">${esc(s.skipped ? t.skipped : t.done)}</p></div>`;
    }
    const row = stuck(s) && t.skip ? `<div class="g-pair">${btn(t.skip, 'data-g="skip"', 'main')}${btn(t.retry, 'data-g="retry"', 'soft')}</div>`
      : `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', 'quiet')}</div>`;
    const teaching = (s.teach || s.level.teach) && s.phase === 'play' && !stuck(s);
    return `<div class="g-bread g-ft g-ink ${spec.cls ?? ''}">${head}${playScene(s)}<p class="g-line-say${teaching ? ' g-teach-say' : ''}">${esc(lineOf(s, t))}</p>${row}</div>`;
  }

  const game = { meta, newGame, act, tick, html, stuck, paceOf };
  game.mount = (container, opts = {}) => mountPure(game)(container, { ...opts, data: { ...(opts.data ?? {}), ...(opts.reducedMotion ? { still: true } : {}) } });
  return game;
}
