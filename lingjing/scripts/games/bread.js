// 喂饼 · 那张厚饼 — 古一, the cave (00-cave), rebuilt 2026-10-16 as the first of the new small
// games (design.md § 新小游戏: 割绳子's mechanic, our book and ink). The book: his mother's thick
// flatbread, the last of the Shens' white flour; he puts a big piece by the hurt fox's mouth and
// wraps a corner for tomorrow's breakfast — the corner 银月 eats at dawn, the root of
// 「本王欠你一张饼」. Here the 饼 hangs on vines in the cave; cut them (a tap or a swipe across
// a vine) so it swings and drops to the fox's mouth. A stone to bounce off, a gust from the cave
// mouth (tap the puff), and on most levels a 饼角 on the way: caught, it is a corner saved for
// breakfast — a star; three in the beat. Thought, never reflexes: each level is solved by the
// ORDER of cuts, made while the 饼 hangs still. A miss (on the floor, out of the cave, at rest
// where no wind can reach) retries the level at once; 重来 any time.
// The levels are the world's (tasks/world.json, bread-share's `deal.levels`), never code.
// The win's `grade`: half (a corner saved, the book's way) or most (all to the fox) — either
// opens 分它一半; `stars` (corners caught, 0–3) goes on the save for pay to scale on later.
// Physics: matter.js (physics.js), stepped only in `tick` at a fixed 1/60 s, so the bot and the
// page play the same world whatever the tick size. Pure module: newGame / html / act / tick.
import { Matter } from './physics.js';
import { btn, n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';
import { blowGust, buildWorld, cutVine, dist, outOf, stepWorld, BREAD_R, FLOOR, GUST_BAND, GUST_MS, H, STEP_MS, W } from './rope.js';

const { Body } = Matter;

export const meta = {
  id: 'bread',
  name: { zh: '喂饼 · 那张厚饼', en: 'The flatbread · Down to the fox' },
  how: {
    zh: '划断藤，让饼荡下去，落到它嘴边。路上的饼角接住了，留作明天的早饭。',
    en: 'Cut the vines so the bread swings down to its mouth. Catch the corners on the way: tomorrow\'s breakfast.',
  },
};

export { W, H, FLOOR, STEP_MS, BREAD_R };
export const PIECE_R = 14;
export const MOUTH_R = 26;
const EAT_MS = 900, MISS_MS = 700, CLEAR_MS = 1500, REST_MS = 700;
export const STUCK_MISSES = 4;

const T = {
  zh: {
    level: '第 {i} / {n} 处', pieces: '饼角', retry: '重来', next: '往下', again: '再来，接饼角',
    miss: ['饼掉在地上了。再来。', '没够着。再来。', '差一点。再来。'],
    eat: ['它闻了闻，看了你一眼，才慢慢地吃了下去。', '它吃得很慢，像怕吃完。', '吃完了，它又看着你。', '它不叫，也不抢，就那么看着你。'],
    piece: '饼角接住了，包好。',
    missedPiece: '饼角没接着。',
    end: '它吃完了，舔了舔嘴，把脑袋一扭，闭上了眼睛——连个谢字也没有。',
    kept: '省下 {s} 块饼角，包好了，塞进包袱最底下，留作明天的早饭。',
    none: '饼全给了它。',
    empty: '洞里没有挂饼的地方。',
  },
  en: {
    level: 'Spot {i} of {n}', pieces: 'Corners', retry: 'Again', next: 'On', again: 'Again, for the corner',
    miss: ['The bread is on the floor. Again.', 'Not quite. Again.', 'So close. Again.'],
    eat: ['It sniffs, gives you a look, and eats it slowly.', 'It eats very slowly, as if afraid of finishing.', 'When it has finished, it looks at you again.', 'It does not whine, or snatch. It only looks at you.'],
    piece: 'A corner caught, and wrapped.',
    missedPiece: 'The corner got away.',
    end: 'It finishes, licks its lips, turns its head away and shuts its eyes — without so much as a thank-you.',
    kept: '{s} corners saved, wrapped and pushed to the bottom of the bundle for tomorrow\'s breakfast.',
    none: 'All the bread went to the fox.',
    empty: 'Nothing to hang the bread from.',
  },
};

/* ── The world (rope.js, shared with the 饭桶's puzzle): the 饼, its vines, the stones, the floor ── */

const build = buildWorld;

/* ── The game ───────────────────────────────────────────────────────────────────────────── */

const levelOf = (s) => s.levels[s.li];
const piecesIn = (levels) => levels.filter((l) => l.piece).length;

/** A level laid fresh: the 饼 back on its vines, the corner (if any) back where it hangs. */
function lay(s, li) {
  const level = s.levels[li];
  const swing = build(level);
  watch(s.seed, swing);
  return { ...s, li, phase: 'play', t: 0, piece: false, moves: 0, swing, note: s.note === 'start' ? 'start' : 'lay' };
}

export function newGame(seed, _level = 1, deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels : [];
  const s = { seed: String(seed), live: levels.length > 0, levels, li: 0, phase: 'play', t: 0, clock: 0,
    misses: levels.map(() => 0), got: levels.map(() => false), piece: false, note: 'start', won: false, grade: null, stars: 0, still: Boolean(deal?.still) };
  return levels.length ? lay(s, 0) : { ...s, phase: 'empty' };
}

/** Corners caught over the beat: a level's best (caught once is kept, a retry never loses it). */
export const starsOf = (s) => s.got.filter(Boolean).length;
/** half: a corner saved, the book's way; most: everything to the fox. Both open 分它一半. */
export const gradeOf = (stars) => (stars > 0 ? 'half' : 'most');

/** Stuck (stuck.js): the same level missed again and again. */
export const stuck = (s) => !s.won && (s.misses?.[s.li] ?? 0) >= STUCK_MISSES;

function cut(s, data) {
  if (!cutVine(s.swing, Number(data.v), Number(data.k))) return null;
  return { ...s, note: 'cut', moves: s.moves + 1 };
}

function gust(s) {
  if (!blowGust(s.swing, levelOf(s))) return null;
  return { ...s, note: 'gust', gustAt: s.clock, moves: s.moves + 1 };
}

const VERBS = {
  cut: (s, d) => (s.phase === 'play' ? cut(s, d) : null),
  gust: (s) => (s.phase === 'play' ? gust(s) : null),
  retry: (s) => (['play', 'miss', 'clear'].includes(s.phase) ? lay({ ...s, note: 'lay' }, s.li) : null),
  next: (s) => (s.phase === 'clear' ? advance(s) : null),
};

export function act(state, data = {}) {
  if (!state || state.won || !state.live) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── Time ────────────────────────────────────────────────────────────────────────────────── */

/** Where the 饼 stands after one step of play: eaten, missed, or still going. */
function judge(s) {
  const level = levelOf(s), w = s.swing, b = w.bread, p = b.position;
  if (level.piece && !s.piece && dist(p, level.piece) < PIECE_R + BREAD_R) s = { ...s, piece: true, got: s.got.map((g, i) => g || i === s.li), note: 'piece', pieceAt: s.clock };
  if (dist(p, level.mouth) < MOUTH_R + BREAD_R * 0.4) return eat(s);
  const out = outOf(w);
  const free = w.vines.every((v) => v.cut != null);
  w.rest = free && b.speed < 0.08 && Math.abs(b.angularSpeed) < 0.01 ? w.rest + STEP_MS : 0;
  if (out || (w.rest >= REST_MS && !level.gust)) return miss(s);
  return s;
}

function eat(s) {
  Body.setStatic(s.swing.bread, true);
  s.swing.done = true;
  return { ...s, phase: 'eat', t: 0, note: 'eat', from: { x: s.swing.bread.position.x, y: s.swing.bread.position.y } };
}

function miss(s) {
  s.swing.done = true;
  return { ...s, phase: 'miss', t: 0, note: 'miss', misses: s.misses.map((m, i) => (i === s.li ? m + 1 : m)) };
}

function advance(s) {
  if (s.li + 1 < s.levels.length) return lay({ ...s, note: 'lay' }, s.li + 1);
  const stars = starsOf(s);
  return { ...s, phase: 'end', live: false, won: true, stars, grade: gradeOf(stars), note: 'end' };
}

const PHASES = {
  play(s) {
    stepWorld(s.swing, levelOf(s));
    return judge(s);
  },
  eat(s) {
    if (s.t < EAT_MS) return s;
    if (s.li + 1 >= s.levels.length) return advance(s);
    return { ...s, phase: 'clear', t: 0 };
  },
  miss: (s) => (s.t < MISS_MS ? s : lay({ ...s, note: 'lay' }, s.li)),
  // A level done with its corner caught (or none to catch) goes on by itself; a corner missed waits.
  clear: (s) => (s.t < CLEAR_MS || missedPiece(s) ? s : advance(s)),
};

const missedPiece = (s) => Boolean(levelOf(s)?.piece) && !s.got[s.li];

export function tick(state, ms) {
  if (!state?.live || state.won || !state.swing) return state;
  let s = state;
  s.swing.acc += ms;
  while (s.swing.acc >= STEP_MS && s.live && !s.won) {
    s.swing.acc -= STEP_MS;
    s = { ...s, t: s.t + STEP_MS, clock: s.clock + STEP_MS };
    const step = PHASES[s.phase];
    if (step) s = step(s);
  }
  return s;
}

/** Reduced motion: the page's setting, or the mount's own `reducedMotion`. */
const calm = (s) => Boolean(s?.still) || still();

/* ── The picture: the cave in ink, the vines as brush strokes, the 饼, the fox ─────────────── */

// Resolved from this file, so the beat, the try page and the 游戏厅 all find it.
const FOX = new URL('../../worlds/jiuding/art/people/yinyue-fox.webp', import.meta.url).href;
// The fox's art: 960×800, its nose at about (440, 480). Laid so the nose is the level's mouth.
const FOX_W = 196, FOX_H = FOX_W * 800 / 960, NOSE = [440 / 960, 480 / 800];

function curve(pts) {
  if (pts.length < 2) return '';
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q${n(pts[i].x)} ${n(pts[i].y)} ${n(mx)} ${n(my)}`;
  }
  const last = pts.at(-1);
  return `${d} L${n(last.x)} ${n(last.y)}`;
}

const vinePoints = (v, bread, at = (b) => b.position) => [{ x: v.at[0], y: v.at[1] }, ...v.links.map(at), at(bread)];
function vineStrokes(pts, cutAt, tail = true) {
  // Cut: the part left on the roof, and (while the 饼 is in play) the end it drags.
  const parts = cutAt == null ? [pts] : tail ? [pts.slice(0, cutAt + 1), pts.slice(cutAt + 1)] : [pts.slice(0, cutAt + 1)];
  return parts.filter((p) => p.length > 1).map((p) => {
    const d = curve(p);
    return `<path class="g-vine-wash" d="${d}"/><path class="g-vine" d="${d}"/>`;
  }).join('');
}

function vinePicture(v, i, bread, live, phase) {
  const pts = vinePoints(v, bread);
  const strokes = `<g data-vine="${i}">${vineStrokes(pts, v.cut, live || phase === 'miss')}</g>`;
  // The vine's joints, each one cuttable: a fat clear stroke a finger (or a swipe) finds.
  const hits = !live || v.cut != null ? '' : pts.slice(0, -1).map((a, k) => {
    const b = pts[k + 1];
    return `<line class="g-vine-hit" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" data-g="cut" data-g-swipe="" data-v="${i}" data-k="${k}"/>`;
  }).join('');
  const knot = `<circle class="g-vine-knot" cx="${v.at[0]}" cy="${v.at[1]}" r="4"/>`;
  return strokes + knot + hits;
}

function breadPicture(x, y, angle, scale = 1) {
  const r = BREAD_R;
  return `<g class="g-bing" transform="translate(${n(x)} ${n(y)}) rotate(${n((angle * 180) / Math.PI)}) scale(${n(scale, 2)})">`
    + `<circle class="g-bread" r="${r}"/><path class="g-bread-fold" d="M${-r * 0.55} ${-r * 0.2} q${r * 0.5} ${-r * 0.35} ${r * 1.05} ${r * 0.05}"/>`
    + `<circle class="g-scorch" cx="${n(-r * 0.3)}" cy="${n(r * 0.35)}" r="1.8"/><circle class="g-scorch" cx="${n(r * 0.4)}" cy="${n(r * 0.1)}" r="1.5"/><circle class="g-scorch" cx="${n(r * 0.05)}" cy="${n(-r * 0.45)}" r="1.4"/></g>`;
}

function piecePicture(level, s) {
  if (!level.piece) return '';
  const [x, y] = level.piece, taken = s.piece;
  const age = taken ? s.clock - (s.pieceAt ?? s.clock) : 0;
  if (taken && age > 600) return '';
  const k = taken ? 1 - age / 600 : 1;
  return `<g class="g-corner${s.got[s.li] && !taken ? ' is-had' : ''}" transform="translate(${x} ${y}) scale(${n(0.4 + 0.6 * k, 2)})" opacity="${n(k, 2)}">`
    + `<path class="g-bread is-corner" d="M0 ${-PIECE_R} A${PIECE_R} ${PIECE_R} 0 0 1 ${n(PIECE_R * 0.87)} ${n(PIECE_R * 0.5)} L0 0Z" transform="rotate(-30)"/>`
    + `<circle class="g-corner-ring" r="${PIECE_R + 3}"/></g>`;
}

function stonePicture(st) {
  const a = st.a ?? 0, w = st.w, h = st.h;
  return `<g transform="translate(${st.x} ${st.y}) rotate(${a})"><rect class="g-b-stone" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${n(h / 2.4)}"/>`
    + `<path class="g-b-stone-line" d="M${-w / 2 + 6} ${-h / 2 + 2} q${w / 3} ${-3} ${w - 14} 1"/></g>`;
}

function gustPicture(level, s) {
  const g = level.gust;
  if (!g) return '';
  const [x, y] = g.at, dir = (g.to ?? [1, 0])[0] >= 0 ? 1 : -1, on = s.swing?.gust > 0, band = g.band ?? GUST_BAND;
  const k = on ? 1 - s.swing.gust / GUST_MS : 0, reach = calm(s) ? 1 : k;
  const streaks = on ? [-0.6, -0.2, 0.25, 0.65].map((f, i) => {
    const yy = y + f * band, x0 = x + dir * 26, len = (120 + i * 30) * reach;
    return `<path class="g-gust-streak" d="M${n(x0)} ${n(yy)} q${n(dir * len * 0.5)} ${n(-6 + i * 3)} ${n(dir * len)} 0"/>`;
  }).join('') : '';
  const puff = `<g class="g-puff${on ? ' is-on' : ''}" transform="translate(${x} ${y})" data-g="gust">`
    + `<circle class="g-puff-hit" r="30"/><path class="g-puff-cloud" d="M-16 6 q-6 -12 6 -14 q4 -10 14 -4 q10 -4 12 6 q8 2 4 10 q-6 6 -36 2Z" transform="scale(${dir} 1)"/>`
    + `<path class="g-gust-streak" d="M${dir * 10} 0 q${dir * 6} -3 ${dir * 14} 0"/></g>`;
  return `<rect class="g-gust-band" x="0" y="${y - band}" width="${W}" height="${band * 2}"/>${streaks}${puff}`;
}

function foxPicture(level, s) {
  const [mx, my] = level.mouth, flip = level.fox_flip ? -1 : 1;
  const x = mx - NOSE[0] * FOX_W * flip, y = my - NOSE[1] * FOX_H;
  const chew = s.phase === 'eat' && !calm(s) ? n(Math.sin(s.t / 70) * 1.2) : 0;
  return `<g class="g-fox-art" transform="translate(${n(x)} ${n(y + chew)}) scale(${flip} 1)"><image href="${FOX}" width="${FOX_W}" height="${n(FOX_H)}" mask="url(#g-bread-fade)" preserveAspectRatio="none"/></g>`
    + `<circle class="g-b-mouth" cx="${mx}" cy="${my}" r="${MOUTH_R}"/>`;
}

const DEFS = `<defs><radialGradient id="g-bread-fadegrad" cx="0.5" cy="0.55" r="0.5"><stop offset="0.62" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`
  + `<mask id="g-bread-fade" maskContentUnits="objectBoundingBox"><rect width="1" height="1" style="fill:url(#g-bread-fadegrad)"/></mask></defs>`;

function cave() {
  // The roof's rock, the floor, and the fire at the mouth: a few strokes and a wash.
  return `<path class="g-cave-roof" d="M0 0 H${W} V26 C${W - 40} 38 ${W - 90} 22 ${W - 140} 30 C${W - 200} 40 120 20 70 32 C40 38 18 30 0 36Z"/>`
    + `<path class="g-cave-line" d="M0 36 C18 30 40 38 70 32 C120 20 ${W - 200} 40 ${W - 140} 30 C${W - 90} 22 ${W - 40} 38 ${W} 26"/>`
    + `<path class="g-cave-floor" d="M0 ${FLOOR} C80 ${FLOOR - 4} 160 ${FLOOR + 3} ${W} ${FLOOR - 2} V${H} H0Z"/>`
    + `<path class="g-cave-line" d="M0 ${FLOOR} C80 ${FLOOR - 4} 160 ${FLOOR + 3} ${W} ${FLOOR - 2}"/>`;
}

function playScene(s) {
  const level = levelOf(s), w = s.swing, live = s.phase === 'play';
  const b = w.bread;
  let bread;
  if (s.phase === 'eat' || s.phase === 'clear' || s.phase === 'end') {
    const k = Math.min(1, s.t / (EAT_MS * 0.6)), [mx, my] = level.mouth, f = s.from ?? b.position;
    bread = s.phase === 'eat' ? breadPicture(f.x + (mx - f.x) * k, f.y + (my - f.y) * k, b.angle, 1 - 0.75 * k) : '';
  } else bread = breadPicture(b.position.x, b.position.y, b.angle);
  const fx = s.phase === 'eat' && !calm(s) ? splash(level.mouth[0], level.mouth[1] - 6, s.t, { r: 12 })
    : s.phase === 'miss' && !calm(s) ? splash(b.position.x, Math.min(b.position.y, FLOOR - 4), s.t, { r: 10 }) : '';
  const caught = s.piece && !calm(s) ? splash(level.piece[0], level.piece[1], s.clock - (s.pieceAt ?? 0), { r: 9, seal: true }) : '';
  return scene(W, H, DEFS + cave() + gustPicture(level, s) + (level.stones ?? []).map(stonePicture).join('')
    + foxPicture(level, s) + piecePicture(level, s) + caught
    + w.vines.map((v, i) => vinePicture(v, i, b, live, s.phase)).join('') + bread + fx, 'g-bread-cave')
    .replace('<svg ', `<svg data-swing="${esc(s.seed)}" `);
}

function lineOf(s, t) {
  const level = levelOf(s), lang = t === T.en ? 'en' : 'zh';
  if (s.phase === 'miss') return t.miss[(s.misses[s.li] - 1) % t.miss.length];
  if (s.phase === 'eat' || s.phase === 'clear') {
    const said = t.eat[s.li % t.eat.length];
    if (!level.piece) return said;
    return `${said}${s.got[s.li] ? t.piece : t.missedPiece}`;
  }
  return level.say?.[lang] ?? level.say?.zh ?? '';
}

function head(s, t) {
  const total = piecesIn(s.levels);
  const corners = total ? `<span>${t.pieces} <b>${starsOf(s)}</b> / ${total}</span>` : '';
  return `<div class="g-head g-bread-head"><span>${t.level.replace('{i}', String(s.li + 1)).replace('{n}', String(s.levels.length))}</span>${corners}</div>`;
}

function controls(s, t) {
  if (s.phase === 'clear' && missedPiece(s)) return `<div class="g-pair">${btn(t.next, 'data-g="next"', 'main')}${btn(t.again, 'data-g="retry"', 'soft')}</div>`;
  if (s.phase === 'play' || s.phase === 'miss') return `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', 'quiet')}</div>`;
  return '<div class="g-bread-row"></div>';
}

function endScene(s) {
  // The fox has it: the 饼 at its mouth, and the brush's last flourish (CSS draws it in once);
  // the won seal is the shared kit's 成.
  const level = s.levels.at(-1), [mx, my] = level.mouth, d = mx > W / 2 ? -1 : 1; // the swirl opens toward the room
  const fx = (dx) => n(mx + d * dx);
  const flourish = `<path class="g-flourish" pathLength="1" d="M${fx(-90)} ${my - 70} C${fx(-40)} ${my - 120} ${fx(40)} ${my - 110} ${fx(70)} ${my - 64} S${fx(40)} ${my - 20} ${fx(4)} ${my - 30}"/>`;
  return scene(W, H, DEFS + cave() + foxPicture(level, { ...s, phase: 'end' }) + breadPicture(mx + 6, my + 2, 0.4, 0.55) + flourish, 'g-bread-cave is-end');
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.phase === 'empty') return `<div class="g-bread g-ink"><p class="g-line-say">${t.empty}</p></div>`;
  if (state.won) {
    const kept = state.stars ? t.kept.replace('{s}', String(state.stars)) : t.none;
    return `<div class="g-bread g-ink is-won">${endScene(state)}<p class="g-line-say">${t.end}<br>${kept}</p></div>`;
  }
  return `<div class="g-bread g-ink">${head(state, t)}${playScene(state)}<p class="g-line-say">${lineOf(state, t)}</p>${controls(state, t)}</div>`;
}

/* ── Between the clock's steps (50 ms on the page): the painter ────────────────────────────
   The page repaints the board each step; in a browser, every frame between, the 饼 and its vines
   are drawn where they will be — each body carried on by its own velocity for the time since the
   step (at most three steps) — so the swing reads smooth at the screen's rate. Draws only; the
   world moves only in `tick`. Nothing here runs in node. */
const SWINGS = new Map();
const esc = (v) => String(v).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

function watch(seed, swing) {
  if (typeof requestAnimationFrame !== 'function') return;
  SWINGS.set(String(seed), swing);
  if (!watch.on) { watch.on = true; requestAnimationFrame(paintFrame); }
}

function paintSwing(svg, w) {
  const k = Math.min(3, Math.max(0, (performance.now() - (w.wall ?? 0)) / STEP_MS));
  const at = (b) => ({ x: b.position.x + b.velocity.x * k, y: b.position.y + b.velocity.y * k });
  const bing = svg.querySelector('.g-bing'), p = at(w.bread), a = w.bread.angle + w.bread.angularVelocity * k;
  bing?.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)}) rotate(${n((a * 180) / Math.PI)})`);
  w.vines.forEach((v, i) => {
    const g = svg.querySelector(`[data-vine="${i}"]`);
    if (g) g.innerHTML = vineStrokes(vinePoints(v, w.bread, at), v.cut);
  });
}

function paintFrame() {
  for (const svg of document.querySelectorAll('svg[data-swing]')) {
    const w = SWINGS.get(svg.dataset.swing);
    if (w && !w.done && w.wall) paintSwing(svg, w);
  }
  requestAnimationFrame(paintFrame);
}

/* ── Standalone (Hanli, 2026-10-16: each small game built alone, then embedded) ─────────────
   The small-game contract (games/mount.js): mount(container, { data, lang, reducedMotion, … }) →
   Promise<{ won, grade, stars }>. `data.levels` when the caller has them (the beat, via Look);
   alone (the 游戏厅, the try page) it reads its own row of worlds/jiuding/games.json. */
async function ownLevels() {
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return (await res.json()).games.find((g) => g.id === meta.id)?.levels ?? [];
}
export async function mount(container, opts = {}) {
  const levels = opts.data?.levels ?? await ownLevels();
  const still = opts.reducedMotion ? { still: true } : {};
  return mountPure({ newGame, act, tick, html })(container, { ...opts, data: { ...(opts.data ?? {}), levels, ...still } });
}
