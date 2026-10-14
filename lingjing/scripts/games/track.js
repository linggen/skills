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

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const marks = Array.from({ length: NEED }, (_, i) => `<i class="${state.cuts[i] ? `is-${state.cuts[i]}` : ''}"></i>`).join('');
  const head = `<div class="g-track-head"><span>${t.marks}</span><span class="g-track-marks">${marks}</span><span>${t.misread} <b>${state.misreads}</b></span></div>`;
  const last = state.cuts.length ? fill(t[state.cuts.at(-1)], FIRST + state.cuts.length - 1) : '';
  if (state.won) return `<div class="g-track is-won">${head}<p class="g-track-line">${t[state.note]}</p></div>`;
  if (state.phase === 'walk') {
    const n = Math.floor(state.steps);
    const found = SIGNS[state.said]?.found?.[lang] ?? '';
    return `<div class="g-track">${head}<p class="g-track-line">${found}<br>${t.walk}</p>`
      + `<div class="g-track-count${Math.abs(n - 100) <= NEAR ? ' is-near' : ''}"><b>${n}</b> ${t.steps}</div>`
      + `<button type="button" class="g-track-btn" data-g="carve">${t.carve}</button></div>`;
  }
  const tiles = state.rounds[state.r].map((k, i) => `<button type="button" class="g-track-sign${state.tried.includes(k) ? ' is-tried' : ''}" data-g="sign" data-i="${i}"${state.tried.includes(k) ? ' disabled' : ''}>${SIGNS[k][lang] ?? SIGNS[k].zh}</button>`).join('');
  const said = state.note === 'miss' ? SIGNS[state.said]?.miss?.[lang] ?? '' : last;
  return `<div class="g-track">${head}<p class="g-track-line">${said ? `${said}<br>` : ''}${t.read}</p><div class="g-track-ground">${tiles}</div></div>`;
}
