// 七巧板 — 布阵. Slot-based tangram: pick a piece, turn it, lay it into a numbered slot.
// Pure module: newGame / html / act. No DOM access; state is plain JSON.

export const meta = {
  id: 'qiqiao',
  name: { zh: '七巧板', en: 'Tangram' },
  how: {
    zh: '点一块选中，再点转向，对准阵位落子；七位皆满，阵成。',
    en: 'Pick a piece, tap to turn it, then tap the matching slot. Fill all seven.',
  },
};

const R2 = Math.SQRT2;
const EPS = 1e-6;

// Canonical pieces in unit coords (square side 1). Orientation = mirror (flip) then rotate rot·45°.
const CANON = {
  L: [[0, 0], [2, 0], [0, 2]],
  M: [[0, 0], [R2, 0], [0, R2]],
  S: [[0, 0], [1, 0], [0, 1]],
  Q: [[0, 0], [1, 0], [1, 1], [0, 1]],
  P: [[0, 0], [1, 0], [2, 1], [1, 1]],
};
const PIECES = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];
const SYM = { L: 8, M: 8, S: 8, Q: 2, P: 4 };

// Silhouettes: 7 slots each, polygons given in a design grid then scaled by k into unit coords.
// k = 1: legs axis-aligned grid. k = √2/2: hypotenuse-aligned grid (the classic square).
const RAW = [
  { id: 'square', zh: '方阵', en: 'Square', level: 1, k: R2 / 2, slots: [
    ['L', [[0, 0], [4, 0], [2, 2]]], ['L', [[0, 0], [2, 2], [0, 4]]],
    ['M', [[4, 2], [4, 4], [2, 4]]], ['S', [[4, 0], [4, 2], [3, 1]]],
    ['Q', [[2, 2], [3, 1], [4, 2], [3, 3]]], ['S', [[2, 2], [3, 3], [1, 3]]],
    ['P', [[0, 4], [1, 3], [3, 3], [2, 4]]]] },
  { id: 'house', zh: '屋舍', en: 'House', level: 1, k: 1, slots: [
    ['L', [[0, 2], [2, 2], [2, 0]]], ['L', [[2, 2], [4, 2], [2, 0]]],
    ['M', [[1, 2], [3, 2], [2, 3]]], ['S', [[1, 2], [2, 3], [1, 3]]],
    ['Q', [[1, 3], [2, 3], [2, 4], [1, 4]]], ['P', [[2, 3], [3, 2], [3, 3], [2, 4]]],
    ['S', [[2, 4], [3, 3], [3, 4]]]] },
  { id: 'fish', zh: '游鱼', en: 'Fish', level: 2, k: 1, slots: [
    ['L', [[0, 2], [2, 0], [2, 2]]], ['L', [[0, 2], [2, 2], [2, 4]]],
    ['M', [[2, 2], [3, 1], [3, 3]]], ['S', [[3, 1], [4, 1], [4, 0]]],
    ['S', [[3, 3], [4, 3], [4, 4]]], ['P', [[2, -1], [2, 0], [1, 1], [1, 0]]],
    ['Q', [[2, 3], [3, 3], [3, 4], [2, 4]]]] },
  { id: 'mountain', zh: '山', en: 'Mountain', level: 2, k: 1, slots: [
    ['L', [[0, 2], [2, 2], [2, 0]]], ['L', [[2, 2], [4, 2], [2, 0]]],
    ['M', [[-2, 2], [0, 2], [-1, 1]]], ['S', [[4, 2], [5, 2], [5, 1]]],
    ['S', [[5, 2], [6, 2], [5, 1]]], ['Q', [[1, 2], [2, 2], [2, 3], [1, 3]]],
    ['P', [[2, 2], [3, 2], [4, 3], [3, 3]]]] },
  { id: 'boat', zh: '孤舟', en: 'Boat', level: 2, k: 1, slots: [
    ['L', [[0, 2], [2, 2], [2, 0]]], ['M', [[2, 0], [2, 2], [3, 1]]],
    ['L', [[0, 2], [2, 2], [2, 4]]], ['Q', [[2, 2], [3, 2], [3, 3], [2, 3]]],
    ['S', [[2, 3], [3, 3], [2, 4]]], ['S', [[3, 2], [4, 2], [3, 3]]],
    ['P', [[4, 2], [5, 2], [4, 3], [3, 3]]]] },
  { id: 'cat', zh: '灵猫', en: 'Cat', level: 2, k: 1, slots: [
    ['S', [[0, 1], [1, 1], [0, 0]]], ['S', [[1, 1], [2, 1], [2, 0]]],
    ['M', [[0, 1], [2, 1], [1, 2]]], ['L', [[1, 2], [1, 4], [-1, 4]]],
    ['L', [[1, 2], [1, 4], [3, 4]]], ['P', [[3, 4], [3, 3], [4, 2], [4, 3]]],
    ['Q', [[0, 4], [1, 4], [1, 5], [0, 5]]]] },
];

export const silhouettes = RAW.map((s) => ({
  id: s.id, zh: s.zh, en: s.en, level: s.level,
  slots: s.slots.map(([shape, pts]) => {
    const points = pts.map(([x, y]) => [x * s.k, y * s.k]);
    return { shape, points, ...orient(shape, points) };
  }),
}));
const byId = Object.fromEntries(silhouettes.map((s) => [s.id, s]));

function transform(pts, rot, flip) {
  const a = (rot * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => { const u = flip ? -x : x; return [u * c - y * s, u * s + y * c]; });
}
function centroid(pts) {
  return pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]);
}
function samePoly(a, b) {
  if (a.length !== b.length) return false;
  const [ax, ay] = centroid(a), [bx, by] = centroid(b);
  return a.every(([x, y]) => b.some(([u, v]) => Math.abs(x - ax - (u - bx)) < EPS && Math.abs(y - ay - (v - by)) < EPS));
}
function orient(shape, points) {
  for (const flip of shape === 'P' ? [0, 1] : [0])
    for (let rot = 0; rot < 8; rot++)
      if (samePoly(transform(CANON[shape], rot, flip), points)) return { rot, flip };
  return { rot: -1, flip: 0 }; // malformed slot; tests catch it
}

export function fits(piece, slot) {
  if (piece.shape !== slot.shape) return false;
  if (piece.shape === 'P' && piece.flip !== slot.flip) return false;
  const m = SYM[piece.shape];
  return (((piece.rot - slot.rot) % m) + m) % m === 0;
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newGame(seed, level = 1) {
  const lv = Math.max(1, Number(level) || 1);
  const pool = silhouettes.filter((s) => (lv === 1 ? s.level === 1 : s.level >= 2));
  const h = hash(`${seed}`);
  const sil = pool[h % pool.length].id;
  const r = rng(h ^ lv);
  return {
    game: 'qiqiao', seed: String(seed), level: lv, sil,
    pieces: PIECES.map((shape) => ({ shape, rot: Math.floor(r() * 8), flip: 0 })),
    slots: Array(7).fill(null), sel: null, refused: null, won: false, moves: 0,
  };
}

export function act(state, data = {}) {
  if (state.won) return { state, won: true };
  const sil = byId[state.sil];
  const next = { ...state, pieces: state.pieces.map((p) => ({ ...p })), slots: [...state.slots], refused: null };
  const placedAt = (p) => next.slots.indexOf(p);
  const turn = (p) => { next.pieces[p].rot = (next.pieces[p].rot + 1) % 8; };
  const same = { state, won: false };
  const p = Number(data.p), s = Number(data.s);
  switch (data.g) {
    case 'piece':
      if (!(p >= 0 && p < 7) || placedAt(p) >= 0) return same;
      if (next.sel === p) turn(p); else next.sel = p;
      break;
    case 'rotate':
      if (next.sel == null) return same;
      turn(next.sel);
      break;
    case 'flip':
      if (next.sel == null || next.pieces[next.sel].shape !== 'P') return same;
      next.pieces[next.sel].flip = next.pieces[next.sel].flip ? 0 : 1;
      break;
    case 'slot': {
      if (!(s >= 0 && s < 7) || next.slots[s] != null || next.sel == null) return same;
      const piece = next.pieces[next.sel], slot = sil.slots[s];
      if (piece.shape !== slot.shape) { next.refused = 'shape'; break; }
      if (!fits(piece, slot)) { next.refused = 'turn'; break; }
      next.slots[s] = next.sel;
      next.sel = null;
      break;
    }
    case 'lift':
      if (!(s >= 0 && s < 7) || next.slots[s] == null) return same;
      next.slots[s] = null;
      break;
    default:
      return same;
  }
  next.moves = state.moves + 1;
  next.won = next.slots.every((x) => x != null);
  if (next.won) next.sel = null;
  return { state: next, won: next.won };
}

const TXT = {
  zh: { won: '阵成', shape: '形不合此位', turn: '方位不合，再转一转', pick: '选一块棋子', place: '点棋子转向，再点阵位', rotate: '转', flip: '翻', slot: '阵位', piece: '棋子' },
  en: { won: 'The formation holds', shape: 'Wrong shape for that slot', turn: 'Wrong turn — rotate it', pick: 'Pick a piece', place: 'Tap to turn, then tap a slot', rotate: 'Turn', flip: 'Flip', slot: 'Slot', piece: 'Piece' },
};
const f2 = (n) => Number(n.toFixed(3));
const ptsAttr = (pts) => pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');

function mini(pts, cls) {
  const [cx, cy] = centroid(pts);
  return `<svg class="qq-mini" viewBox="${f2(cx - 1.6)} ${f2(cy - 1.6)} 3.2 3.2" aria-hidden="true"><polygon class="${cls}" points="${ptsAttr(pts)}"/></svg>`;
}

function board(state, sil) {
  const all = sil.slots.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const pad = 0.25, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  const polys = sil.slots.map((slot, i) => {
    const p = state.slots[i];
    if (p != null) return `<polygon class="qq-fill qq-c${p}" points="${ptsAttr(slot.points)}"/>`;
    const [cx, cy] = centroid(slot.points);
    return `<polygon class="qq-slot" points="${ptsAttr(slot.points)}"/><text class="qq-num" x="${f2(cx)}" y="${f2(cy)}">${i + 1}</text>`;
  });
  return `<svg class="qq-board" viewBox="${f2(x0)} ${f2(y0)} ${f2(w)} ${f2(h)}" role="img" aria-label="${sil.zh} / ${sil.en}">${polys.join('')}</svg>`;
}

export function html(state, lang = 'zh') {
  const t = TXT[lang] || TXT.zh;
  const sil = byId[state.sil];
  const title = `<div class="qq-title">${lang === 'en' ? sil.en : sil.zh}</div>`;
  if (state.won) return `<div class="g-qiqiao is-won">${title}${board(state, sil)}<p class="qq-won">${t.won}</p></div>`;
  const slots = sil.slots.map((slot, i) => {
    const p = state.slots[i];
    return p != null
      ? `<button type="button" class="qq-sbtn is-full" data-g="lift" data-s="${i}" aria-label="${t.slot} ${i + 1}">${mini(slot.points, `qq-fill qq-c${p}`)}<span>${i + 1}</span></button>`
      : `<button type="button" class="qq-sbtn" data-g="slot" data-s="${i}" aria-label="${t.slot} ${i + 1}"${state.sel == null ? ' disabled' : ''}>${mini(slot.points, 'qq-slot')}<span>${i + 1}</span></button>`;
  }).join('');
  const tray = state.pieces.map((pc, i) => (state.slots.includes(i) ? '' :
    `<button type="button" class="qq-pbtn${state.sel === i ? ' is-sel' : ''}" data-g="piece" data-p="${i}" aria-pressed="${state.sel === i}" aria-label="${t.piece} ${i + 1}">${mini(transform(CANON[pc.shape], pc.rot, pc.flip), `qq-fill qq-c${i}`)}</button>`)).join('');
  const sel = state.sel == null ? null : state.pieces[state.sel];
  const tools = `<button type="button" class="qq-tool" data-g="rotate"${sel ? '' : ' disabled'}>${t.rotate} ↻</button>`
    + (sel && sel.shape === 'P' ? `<button type="button" class="qq-tool" data-g="flip">${t.flip} ⇋</button>` : '');
  const msg = state.refused ? t[state.refused] : sel ? t.place : t.pick;
  return `<div class="g-qiqiao">${title}${board(state, sil)}`
    + `<div class="qq-slots">${slots}</div>`
    + `<p class="qq-msg${state.refused ? ' is-refused' : ''}">${msg}</p>`
    + `<div class="qq-tray">${tray}</div><div class="qq-tools">${tools}</div></div>`;
}
