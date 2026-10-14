// 追踪 · 一百步刻一道 — 古一, 黑松岭 (00-heisong; Hanli 2026-10-14). The book:
// 「追蹄印，一百步刻一道」 — his own first rule at the 断碑, forty-one marks in all. The
// game needs only four: each round, read the ground — the deer's sign among
// the forest's (a boar's print, needles, moss…) — then walk, the steps
// counting up, and carve when they come to a hundred. A misread costs a look,
// a mark off the hundredth step is crooked, a step far past it is cut late:
// none of it ends the game. How true the line ran is the `grade` (true ·
// rough), written as a mark by the rules.
// Pure module: newGame / html / act / tick (the clock runs only while walking).
import { rng, shuffled } from './seeded.js';
import { btn, n, scene, splash } from './ink.js';

export const meta = {
  id: 'track',
  name: { zh: '追踪 · 一百步刻一道', en: 'Tracking · A mark every hundred steps' },
  how: {
    zh: '先认出鹿留下的痕迹，再走；数到一百步，刻一道。',
    en: 'Find what the deer left, then walk; at a hundred steps, cut a mark.',
  },
};

export const NEED = 4; //        marks in the game (the book cuts forty-one)
export const PACE = 22; //       steps a second
export const NEAR = 6; //        steps either side of a hundred for a true mark
export const LATE = 135; //      past this the mark is cut late, by itself
const FIRST = 1; //              the first mark's number

const SIGNS = {
  hoof: { deer: true, zh: '蹄印', en: 'A hoofprint', found: { zh: '蹄印，比巴掌还宽，尖头朝前。', en: 'A hoofprint wider than your palm, the point facing on.' } },
  twig: { deer: true, zh: '折断的嫩枝', en: 'A snapped twig', found: { zh: '一根嫩枝，齐腰高，断口还湿着——它从这儿挤过去了。', en: 'A green twig at waist height, the break still wet — it pushed through here.' } },
  hair: { deer: true, zh: '刺上的鹿毛', en: 'Hair on a thorn', found: { zh: '刺上挂着几根赭红的毛，粗得像马鬃。', en: 'A few red-brown hairs on a thorn, coarse as a horse\'s mane.' } },
  boar: { zh: '野猪蹄印', en: "A boar's print", miss: { zh: '是野猪的——圆头，两瓣分得开。', en: "A boar's — round-toed, the halves splayed." } },
  needles: { zh: '一片松针', en: 'Pine needles', miss: { zh: '松针厚如毯，什么也看不出来。', en: 'The needles lie thick as a rug; they tell nothing.' } },
  moss: { zh: '青苔', en: 'Moss', miss: { zh: '青苔好好的，没有东西踩过。', en: 'The moss is whole; nothing has trodden it.' } },
  squirrel: { zh: '小爪印', en: 'Small claw prints', miss: { zh: '松鼠的，一串小坑，到树根就没了。', en: "A squirrel's: a run of little dents, gone at the tree root." } },
  branch: { zh: '枯枝', en: 'A dead branch', miss: { zh: '风折的，断口早灰了。', en: 'The wind broke it; the break is long grey.' } },
  stone: { zh: '一块青石', en: 'A grey stone', miss: { zh: '石头上什么也没有。', en: 'Nothing on the stone.' } },
};
const DEER = Object.keys(SIGNS).filter((k) => SIGNS[k].deer);
const FALSE = Object.keys(SIGNS).filter((k) => !SIGNS[k].deer);

const T = {
  zh: {
    read: '松针厚如毯，踩下去无声。哪一样是那头鹿留下的？',
    walk: '走——一步，两步……一百步刻一道，你自己立的规矩。',
    carve: '刻', steps: '步', marks: '记号', misread: '看岔',
    true: '刀口齐齐的。第 {n} 道。',
    crooked: '刻得差了几步。第 {n} 道。爹看了一眼，没说话。',
    late: '走过头了，退回来补了一道。第 {n} 道。',
    done_true: '一路的刀口，一道不差。回头望去，像一串钉在林子里的钉子。',
    done_rough: '记号歪歪扭扭，到底也连成了一路——认得回去。',
  },
  en: {
    read: 'The needles lie thick as a rug; no footstep sounds. Which of these did the deer leave?',
    walk: 'Walk — one step, two… a mark every hundred steps: your own rule.',
    carve: 'Cut', steps: 'steps', marks: 'Marks', misread: 'Misread',
    true: 'A clean cut. Mark {n}.',
    crooked: 'Cut a few steps off. Mark {n}. Father looks, and says nothing.',
    late: 'You walked past it and went back to cut it. Mark {n}.',
    done_true: 'A line of cuts, none of them off. Looking back, they run through the wood like a row of nails.',
    done_rough: 'The marks wander, but they make a line all the same — enough to find the way back.',
  },
};
const fill = (s, n) => s.replace('{n}', String(n));

/** The rounds: for each, five signs on the ground, one of them the deer's. */
export function rounds(seed) {
  const rnd = rng(`track:${seed}`);
  const deer = shuffled(DEER, rnd);
  return Array.from({ length: NEED }, (_, r) => shuffled([deer[r % deer.length], ...shuffled(FALSE, rnd).slice(0, 4)], rnd));
}

export function newGame(seed) {
  return { seed: String(seed), rounds: rounds(seed), r: 0, phase: 'read', live: false, steps: 0, tried: [], misreads: 0, cuts: [], note: 'read', said: null, won: false, grade: null };
}

function finish(s) {
  const good = s.cuts.filter((c) => c === 'true').length;
  const grade = s.misreads <= 1 && good >= NEED - 1 ? 'true' : 'rough';
  return { ...s, live: false, won: true, grade, note: `done_${grade}` };
}

function cut(s, how) {
  const n = { ...s, cuts: [...s.cuts, how], phase: 'read', live: false, steps: 0, tried: [], r: s.r + 1, note: how, said: null };
  return n.cuts.length >= NEED ? finish(n) : n;
}

const VERBS = {
  sign: (s, d) => {
    if (s.phase !== 'read') return null;
    const k = s.rounds[s.r]?.[Number(d.i)];
    if (!k || s.tried.includes(k)) return null;
    if (SIGNS[k].deer) return { ...s, phase: 'walk', live: true, steps: 0, note: 'walk', said: k };
    return { ...s, misreads: s.misreads + 1, tried: [...s.tried, k], note: 'miss', said: k };
  },
  carve: (s) => {
    if (s.phase !== 'walk') return null;
    return cut(s, Math.abs(s.steps - 100) <= NEAR ? 'true' : 'crooked');
  },
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'walk') return state;
  const steps = state.steps + (PACE * ms) / 1000;
  return steps >= LATE ? cut({ ...state, steps }, 'late') : { ...state, steps };
}

/* ── The picture (2026-10-14): each sign on the ground drawn in ink — the deer's split hoof,
   a snapped twig, red hair on a thorn among a boar's round print, needles, moss, a squirrel's
   dents, a dead branch, a stone — and the walk as pine trunks going by, the deer's prints
   ahead, the count climbing; a cut is a notch in the bark, cinnabar when it is true. */
const ICON = {
  hoof: '<path d="M25 9 C19 17 19 27 24 31 C28 31 29 25 28 19Z M35 9 C41 17 41 27 36 31 C32 31 31 25 32 19Z"/>',
  twig: '<path class="g-line" d="M6 32 L29 19 M32 17 L54 9 M29 19 l-2 -6 M32 17 l3 5"/><path class="g-line g-thin g-wood" d="M29 19 l3 -2 M30 21 l2 -4"/>',
  hair: '<path class="g-line g-thin" d="M8 30 L52 14 M22 25 l-3 -5 M38 19 l2 -6"/><path class="g-line g-thin g-earth" d="M28 20 q4 6 0 12 M31 19 q5 7 1 13 M34 18 q4 6 2 12"/>',
  boar: '<ellipse cx="25" cy="21" rx="6" ry="8"/><ellipse cx="36" cy="21" rx="6" ry="8"/><circle cx="23" cy="34" r="2"/><circle cx="38" cy="34" r="2"/>',
  needles: '<path class="g-line g-thin g-faint" d="M8 12 l14 10 M14 30 l18 -12 M26 8 l6 22 M36 30 l16 -16 M40 10 l12 14 M10 22 l20 2 M30 26 l22 -2"/>',
  moss: '<g class="g-wood">' + [[14, 24], [20, 18], [24, 27], [30, 21], [36, 26], [40, 19], [46, 24], [28, 31], [18, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('') + '</g>',
  squirrel: [[14, 26], [20, 22], [28, 26], [34, 22], [42, 26], [48, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join(''),
  branch: '<path class="g-line g-faint" style="stroke-width:4" d="M6 26 Q30 18 54 22"/><path class="g-line g-thin g-faint" d="M24 21 l-4 -8 M40 21 l6 -7"/>',
  stone: '<path class="g-line" d="M12 30 C8 18 22 8 34 11 C48 13 54 26 46 31 Z"/><path class="g-line g-thin g-faint" d="M22 18 q6 -3 12 0"/>',
};
const signIcon = (k) => scene(60, 40, ICON[k] ?? '', 'g-sign-icon');
function walkScene(state) {
  const st = state.steps;
  const trunks = [0, 1, 2, 3, 4].map((j) => {
    const x = (((j * 78 - st * 2.6) % 390) + 390) % 390 - 30, wd = 9 + (j % 2) * 4;
    return `<g class="g-trunk"><rect x="${n(x)}" y="6" width="${wd}" height="100" rx="2"/><path class="g-line g-thin g-bark" d="M${n(x + 3)} 22 l2 10 M${n(x + wd - 3)} 50 l-2 12 M${n(x + 4)} 78 l2 9"/></g>`;
  }).join('');
  const prints = [0, 1, 2, 3, 4, 5].map((j) => {
    const x = (((j * 60 + 40 - st * 2.6) % 360) + 360) % 360 - 20, y = 112 + (j % 2) * 4;
    return `<path transform="translate(${n(x)} ${y}) scale(0.32)" d="${'M25 9 C19 17 19 27 24 31 C28 31 29 25 28 19Z M35 9 C41 17 41 27 36 31 C32 31 31 25 32 19Z'}" class="g-print"/>`;
  }).join('');
  return scene(320, 124, `<path class="g-line g-faint" d="M0 108 Q160 102 320 108"/>` + trunks + prints);
}
function cutScene(state) {
  const last = state.cuts.at(-1);
  const notch = last ? `<path class="g-cut${last === 'true' ? ' is-true' : ''}" d="${last === 'true' ? 'M150 46 l20 -6 l0 6 l-20 6z' : 'M148 52 l20 -14 l2 5 l-20 14z'}"/>` : '';
  return scene(320, 80, `<rect class="g-trunkface" x="132" y="0" width="56" height="80" rx="3"/><path class="g-line g-thin g-bark" d="M140 8 l3 14 M178 30 l-3 16 M146 60 l2 12"/>` + notch
    + (last === 'true' ? splash(176, 44, 220, { r: 8, seal: true }) : ''));
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const marks = Array.from({ length: NEED }, (_, i) => `<i class="${state.cuts[i] ? `is-${state.cuts[i]}` : ''}"></i>`).join('');
  const head = `<div class="g-track-head g-head"><span>${t.marks} <span class="g-track-marks">${marks}</span></span><span>${t.misread} <b>${state.misreads}</b></span></div>`;
  const last = state.cuts.length ? fill(t[state.cuts.at(-1)], FIRST + state.cuts.length - 1) : '';
  if (state.won) return `<div class="g-track g-ink is-won">${head}${cutScene(state)}<p class="g-line-say">${t[state.note]}</p></div>`;
  if (state.phase === 'walk') {
    const found = SIGNS[state.said]?.found?.[lang] ?? '';
    return `<div class="g-track g-ink">${head}${walkScene(state)}<p class="g-line-say">${found}<br>${t.walk}</p>`
      + `<div class="g-track-count${Math.abs(state.steps - 100) <= NEAR ? ' is-near' : ''}"><b>${Math.floor(state.steps)}</b> ${t.steps}</div>`
      + btn(t.carve, 'data-g="carve"', 'main', 'g-track-btn') + `</div>`;
  }
  const tiles = state.rounds[state.r].map((k, i) => {
    const tried = state.tried.includes(k);
    return `<button type="button" class="g-track-sign${tried ? ' is-tried' : ''}" data-g="sign" data-i="${i}"${tried ? ' disabled' : ''}>${signIcon(k)}<span>${SIGNS[k][lang] ?? SIGNS[k].zh}</span></button>`;
  }).join('');
  const said = state.note === 'miss' ? SIGNS[state.said]?.miss?.[lang] ?? '' : last;
  const cut = state.cuts.length && !state.tried.length ? cutScene(state) : '';
  return `<div class="g-track g-ink">${head}${cut}<p class="g-line-say">${said ? `${said}<br>` : ''}${t.read}</p><div class="g-track-ground">${tiles}</div></div>`;
}
