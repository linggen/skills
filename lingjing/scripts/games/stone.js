// 扔石听声 · 先往里扔一块石头 — 古一, the night in 银叶谷 (00-cave; batch two, 2026-10-14). The
// book: at the foot of the cliff he finds a shallow cave, and first throws a stone in and listens
// — empty; throws another, listens — still empty; reaches for a third, thinks better of it, and
// goes in. Here there are three hollows under the cliff, the fox in his jacket and the rain
// coming down. A stone thrown into one comes back as a sound: a long hum that goes on and on (too
// deep — the wind comes out of it), a clack and then a scurry (something lives there), or one dry
// knock (shallow, and empty). Listen, then go into the one he can sleep in; a wrong one only
// sends him back out. Grade sure · lucky, written as a mark. Then 喂饼, the scene's second board.
// Pure module: newGame / html / act.
import { rng, shuffled } from './seeded.js';
import { btn, n, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'stone',
  name: { zh: '扔石听声 · 先往里扔一块石头', en: 'A stone and an ear · Throw one in first' },
  how: {
    zh: '往洞里扔块石头，听它怎么响——嗡嗡不停的太深，沙沙乱响的有东西，「嗒」一声的，才是浅的、空的。',
    en: 'Throw a stone in and listen to how it sounds — a hum that goes on is too deep, a scurry means something lives there, one dry knock is shallow and empty.',
  },
};

export const KINDS = ['deep', 'alive', 'shallow'];

const T = {
  zh: {
    ready: '雨还在下，狐狸在你怀里发抖。崖壁底下，有三个黑乎乎的洞口。', hole: '洞', throw: '扔石头', enter: '进去',
    picked: '先扔块石头，听一听。', deep: '「咕咚……嗡——嗡——」响了老半天，一股冷风从里头往外灌。',
    alive: '「嗒——沙沙沙沙」里头有什么东西窜了一下。', shallow: '「嗒。」一声，就没了。',
    shallow2: '又「嗒」一声。还是空的。', shallow3: '待要再捡第三块，想想算了——再扔就是糟蹋石头。',
    inDeep: '黑咕隆咚，风往外灌，冷得牙齿直打架。你退了出来。', inAlive: '一只獾子龇着牙，冲你「嗤」了一声。你退了出来。',
    sure: '浅浅的一个石洞，空的。你钻了进去，先生火。', lucky: '总算找着了一个浅浅的、空的石洞。你钻了进去，先生火。',
    skipped: '你在崖壁底下找到了一个浅浅的石洞，钻了进去。',
  },
  en: {
    ready: 'The rain keeps coming, and the fox shivers inside your jacket. At the foot of the cliff there are three dark openings.', hole: 'Hollow', throw: 'Throw a stone', enter: 'Go in',
    picked: 'Throw a stone in first, and listen.', deep: '"Plunk… hmmm — hmmm —" it goes on and on, and a cold wind blows out at you.',
    alive: '"Clack — scritch-scritch-scritch" — something in there darts away.', shallow: 'One dry "tock", and nothing more.',
    shallow2: 'Another "tock". Still empty.', shallow3: 'You reach for a third stone, think better of it — that would be wasting stones.',
    inDeep: 'Pitch black, the wind pouring out, so cold your teeth chatter. You back out.', inAlive: 'A badger bares its teeth and hisses at you. You back out.',
    sure: 'A shallow cave, and empty. You crawl in, and see to the fire first.', lucky: 'At last, a shallow cave, and empty. You crawl in, and see to the fire first.',
    skipped: 'At the foot of the cliff you find a shallow cave, and crawl in.',
  },
};

export function newGame(seed) {
  const rnd = rng(`stone:${seed}`);
  return { seed: String(seed), holes: shuffled(KINDS, rnd), at: null, thrown: [0, 0, 0], wrong: 0, last: null, fx: null, t: 0, note: 'ready', won: false, grade: null };
}

const VERBS = {
  hole: (s, d) => {
    const i = Number(d.i);
    return i >= 0 && i < 3 && i !== s.at ? { ...s, at: i, last: null, note: 'picked' } : null;
  },
  throw: (s) => {
    if (s.at == null) return null;
    const kind = s.holes[s.at], k = s.thrown[s.at] + 1;
    const thrown = s.thrown.map((x, i) => (i === s.at ? k : x));
    const note = kind === 'shallow' ? (k === 1 ? 'shallow' : k === 2 ? 'shallow2' : 'shallow3') : kind;
    return { ...s, thrown, last: kind, t: s.t + 1, fx: { at: s.t + 1, i: s.at }, note };
  },
  enter: (s) => {
    if (s.at == null) return null;
    const kind = s.holes[s.at];
    if (kind !== 'shallow') return { ...s, wrong: s.wrong + 1, note: kind === 'deep' ? 'inDeep' : 'inAlive' };
    const grade = s.wrong === 0 && s.thrown[s.at] > 0 ? 'sure' : 'lucky';
    return { ...s, won: true, grade, note: grade };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the cliff's foot in ink, rain on it, three dark mouths of different shapes;
   the one he stands at is ringed; a stone thrown sends its sound out as ink — long, slow rings
   for the deep one, a scatter of short ticks for the live one, one small tick for the shallow. */
const MOUTHS = [[64, 'M44 112 Q46 78 64 76 Q84 78 86 112Z'], [160, 'M136 112 Q140 70 160 68 Q182 72 184 112Z'], [256, 'M238 112 Q240 84 256 82 Q274 84 276 112Z']];
function sound(kind, x) {
  if (kind === 'deep') return [12, 22, 32, 42].map((r) => `<path class="g-line g-thin g-faint" d="M${x - r} ${70 - r * 0.3} q${r} ${-r * 0.7} ${r * 2} 0"/>`).join('');
  if (kind === 'alive') return [[-14, -6], [-6, -14], [6, -12], [14, -4], [0, -20]].map(([dx, dy]) => `<path class="g-line g-thin" d="M${x + dx} ${66 + dy} l${dx > 0 ? 4 : -4} -3"/>`).join('');
  return `<path class="g-line" d="M${x - 4} 62 l8 -6"/>`;
}
function stoneScene(state) {
  const cliff = '<path class="g-rock" d="M0 0 H320 V114 H0Z"/><path class="g-line" d="M0 114 H320"/><path class="g-line g-thin g-faint" d="M20 30 l14 6 M110 22 l18 4 M200 36 l12 8 M290 18 l-10 10"/>';
  const rain = Array.from({ length: 16 }, (_, i) => `<path class="g-line g-thin g-water" d="M${(i * 23) % 320} ${(i * 41) % 100} l4 10"/>`).join('');
  const holes = MOUTHS.map(([x, d], i) => `<path class="g-mouthdark" d="${d}"/>${state.at === i ? `<path class="g-line g-thin" d="M${x - 30} 122 h60" stroke-dasharray="3 4"/>` : ''}`).join('');
  const heard = state.fx && state.last ? sound(state.last, MOUTHS[state.fx.i][0]) : '';
  const done = state.won ? splash(MOUTHS[state.holes.indexOf('shallow')][0], 96, 300, { r: 10, seal: state.grade === 'sure' }) : '';
  return scene(320, 130, cliff + rain + holes + heard + done);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-stone g-ink is-won">${stoneScene(state)}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  const holes = [0, 1, 2].map((i) => `<button type="button" class="g-tag${state.at === i ? ' is-on' : ''}" data-g="hole" data-i="${i}" aria-pressed="${state.at === i}">${t.hole} ${i + 1}<small>${'·'.repeat(state.thrown[i]) || ' '}</small></button>`).join('');
  const acts = state.at == null ? '' : `<div class="g-pair">${btn(t.throw, 'data-g="throw"', 'soft')}${btn(t.enter, 'data-g="enter"')}</div>`;
  return `<div class="g-stone g-ink">${stoneScene(state)}<div class="g-tags">${holes}</div><p class="g-line-say">${t[state.note] ?? ''}</p>${acts}</div>`;
}

/** Stuck (scripts/stuck.js): two wrong holes — the page may offer 「算了，往下走」 now. */
export const stuck = (s) => (s.wrong ?? 0) >= 2;
