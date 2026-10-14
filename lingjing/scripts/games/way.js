// 认路 · 崖壁上一段划了一道 — 古一, the dawn in 银叶谷 (00-yinyue; batch two, 2026-10-14). The
// book: the valley is cliff on every side and the silver-leaf trees are all alike, but all the
// way in he scratched a line on the cliff every so often, and every one of them is still there —
// so the boy who scratches lines leads, and the queen who cannot fly follows. Here the valley is
// a small grid in ink, seen only a step around him; the grass glows where he has walked (the
// book's own); his marks show on the cells by the cliff. Follow them back from the cave to the
// moss where he fell. A rock or the cliff only stops him; lost long enough, 银月 points the way.
// Grade straight · wandered, written as a mark.
// Pure module: newGame / html / act.
import { SKIP, n, scene, skipBtn, skipped, splash } from './ink.js';

export const meta = {
  id: 'way',
  name: { zh: '认路 · 崖壁上一段划了一道', en: 'Finding the way · A line on the cliff every so often' },
  how: {
    zh: '银叶树棵棵一样，可崖壁上有你划的道道。一道一道认着走，回到你摔下来的那片苔藓。',
    en: 'Every silver tree looks the same, but your marks are on the cliff. Follow them one by one back to the moss where you fell.',
  },
};

// The valley: '#' rock, '.' silver trees, '*' a cell by the cliff with his mark, 'C' the cave, 'M' the moss.
export const MAP = [
  '***.*M',
  '*#.###',
  '*.#...',
  '#*..#.',
  'C*.#..',
];
export const W = 6, H = 5;
export const BEST = 11; //     the moves the marks take
export const STRAIGHT = 15; // within this, straight
export const LEAD = 30; //     lost this long, she points the way
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cell = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? MAP[y][x] : null);
const find = (ch) => { for (let y = 0; y < H; y += 1) { const x = MAP[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };

const T = {
  zh: {
    ready: '四面是崖，崖上垂着藤，银叶树一棵挨着一棵。她咳了一声：「走吧，凡人。先带本王出去。」', moves: '步', marks: '记号',
    up: '往上', down: '往下', left: '往左', right: '往右',
    go: '草叶在你脚底下微微发亮。', mark: '崖壁上有一道——是你划的。', wall: '是崖壁，过不去。', rock: '一块大石头挡着。',
    lost: '「凡人，你在转圈。」', lead: '银月叹了口气，下巴一抬：「那边。」',
    straight: '一道一道，一道都没错。脚底下是那片厚厚的苔藓——你就是从这儿摔下来的。', wandered: '绕了几个圈，总算又踩上了那片厚厚的苔藓。',
    skipped: '你认着崖壁上的道道，领着她走了出去。',
  },
  en: {
    ready: 'Cliff on every side, vines hanging down it, silver trees one after another. She coughs. "Come along, mortal. You may lead this queen out first."', moves: 'steps', marks: 'marks',
    up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    go: 'The grass glows faintly under your feet.', mark: 'A line on the cliff — one you scratched.', wall: 'The cliff. No way through.', rock: 'A great boulder blocks the way.',
    lost: '"Mortal, you are going in circles."', lead: 'Yinyue sighs and lifts her chin. "That way."',
    straight: 'Line by line, not one wrong. Under your feet is the thick moss — this is where you fell.', wandered: 'A few circles later, you are on the thick moss again.',
    skipped: 'You follow the lines on the cliff and lead her out.',
  },
};

export function newGame(seed) {
  const [x, y] = find('C');
  return { seed: String(seed), x, y, moves: 0, walked: [`${x},${y}`], seen: seen([], x, y), fx: null, note: 'ready', won: false, grade: null };
}

function seen(list, x, y) {
  const out = new Set(list);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (cell(x + dx, y + dy)) out.add(`${x + dx},${y + dy}`);
  return [...out];
}
const marksSeen = (s) => s.walked.filter((k) => { const [x, y] = k.split(',').map(Number); return cell(x, y) === '*'; }).length;

const VERBS = {
  go: (s, d) => {
    const dir = DIRS[d.d];
    if (!dir) return null;
    const x = s.x + dir[0], y = s.y + dir[1], c = cell(x, y);
    if (c == null) return { ...s, note: 'wall' };
    if (c === '#') return { ...s, note: 'rock' };
    const moves = s.moves + 1, key = `${x},${y}`;
    const next = { ...s, x, y, moves, walked: s.walked.includes(key) ? s.walked : [...s.walked, key], seen: seen(s.seen, x, y), note: c === '*' ? 'mark' : moves > STRAIGHT + 4 ? 'lost' : 'go' };
    if (c === 'M') return { ...next, won: true, grade: moves <= STRAIGHT ? 'straight' : 'wandered', note: moves <= STRAIGHT ? 'straight' : 'wandered', fx: { at: moves } };
    if (moves >= LEAD) { const [mx, my] = find('M'); return { ...next, x: mx, y: my, won: true, grade: 'wandered', note: 'lead' }; }
    return next;
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the valley as a small grid in ink — the cliff round it, boulders, silver
   trees, the cave mouth and the moss; fog over what he has not seen; the glow of the grass where
   he has walked; his marks, cinnabar strokes on the cells by the cliff; him, a dot. */
const CW = 50, CH = 24, OX = 10, OY = 8;
function wayScene(state) {
  const box = `<rect class="g-line" x="${OX - 4}" y="${OY - 4}" width="${W * CW + 8}" height="${H * CH + 8}" rx="6" fill="none"/>`;
  let cells = '';
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const k = `${x},${y}`, c = MAP[y][x], px = OX + x * CW, py = OY + y * CH, cx = px + CW / 2, cy = py + CH / 2;
    if (!state.seen.includes(k) && !state.won) { cells += `<rect class="g-fog" x="${px + 1}" y="${py + 1}" width="${CW - 2}" height="${CH - 2}" rx="3"/>`; continue; }
    if (state.walked.includes(k)) cells += `<ellipse class="g-glow" cx="${cx}" cy="${cy}" rx="18" ry="8"/>`;
    if (c === '#') cells += `<path class="g-rockblock" d="M${px + 8} ${py + CH - 3} Q${px + 10} ${py + 4} ${cx} ${py + 3} Q${px + CW - 8} ${py + 5} ${px + CW - 8} ${py + CH - 3}Z"/>`;
    else if (c === 'C') cells += `<path class="g-mouthdark" d="M${cx - 12} ${py + CH - 2} Q${cx} ${py + 2} ${cx + 12} ${py + CH - 2}Z"/>`;
    else if (c === 'M') cells += `<ellipse class="g-moss" cx="${cx}" cy="${cy + 3}" rx="18" ry="6"/>`;
    else cells += `<path class="g-line g-thin g-faint" d="M${cx} ${py + CH - 3} v-7"/><circle class="g-silver" cx="${cx}" cy="${py + 9}" r="6"/>`;
    if (c === '*') cells += `<path class="g-markstroke" d="M${px + 6} ${py + 6} l6 12"/>`;
  }
  const me = `<circle class="g-me" cx="${OX + state.x * CW + CW / 2 + 10}" cy="${OY + state.y * CH + CH / 2 + 2}" r="4"/>`;
  const fx = state.won && state.grade === 'straight' ? splash(OX + state.x * CW + CW / 2, OY + state.y * CH + CH / 2, 300, { r: 10, seal: true }) : '';
  return scene(W * CW + 2 * OX, H * CH + 2 * OY, box + cells + me + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = `<div class="g-head"><span>${t.moves} <b>${state.moves}</b></span><span>${t.marks} <b>${marksSeen(state)}</b></span></div>`;
  if (state.won) return `<div class="g-way g-ink is-won">${wayScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  const pad = ['up', 'left', 'right', 'down'].map((d) => `<button type="button" class="g-nudgebtn g-way-${d}" data-g="go" data-d="${d}" aria-label="${t[d]}">${{ up: '↑', down: '↓', left: '←', right: '→' }[d]}</button>`).join('');
  return `<div class="g-way g-ink">${wayScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p><div class="g-way-pad">${pad}</div>${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
}
