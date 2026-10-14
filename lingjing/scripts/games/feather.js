// 吹鹅毛 · 吐气，毛不许动 — 古二, the woodpile (00-halfyear; Hanli 2026-10-14). The
// book: the scroll's one line with a number in it — 「心里数到一百二十，拿一根鸿毛搁在
// 鼻子底下，吐气，毛不许动」 — and 老周家's goose feather on a strip of bamboo. The
// first night he breathes in, holds it, counts — and at twelve the breath bursts
// out and the feather flies into the hen house. The lesson is 今线's too: 先吐.
// Here the breath out is a stroke: press and move slowly and steadily (a small
// circle) — that is the breath going out, and the count runs. Stop moving and
// the breath is held: it builds, and bursts. Move fast and the feather shakes,
// and flies. The stroke used up, the breath is spent. Three breaths; the best
// count is the `grade` (still · shaky), written as a mark. Never a fail.
// Pure module: newGame / html / act / tick. The stroke is [data-g-drag] (live-games.js).

export const meta = {
  id: 'feather',
  name: { zh: '吹鹅毛 · 吐气，毛不许动', en: 'The goose feather · Breathe out, and it mustn\'t stir' },
  how: {
    zh: '按住，慢慢地、匀匀地画圈——那是吐气。手停了是憋气；画急了，鹅毛就飞了。',
    en: 'Press and draw slow, even circles — that is the breath going out. Stop and you are holding it; rush and the feather flies.',
  },
};

export const TRIES = 3; //      breaths
export const TARGET = 120; //   the scroll's count
export const STILL = 96; //     his best on the last night: a still feather
export const RATE = 6; //       counts a second while the breath runs right
export const LUNG_PX = 960; //  the stroke a whole breath is
export const VMIN = 12; //      px/s: slower than this, the breath is held
export const VMAX = 110; //     px/s: faster than this, the feather shakes
export const FLY_MS = 450; //   shaking this long, it flies
export const HOLD_MS = 1500; // held this long, the breath bursts out

const T = {
  zh: {
    ready: '鹅毛粘在竹篾上，横在鼻子底下。吐气，毛不许动。',
    first: '先吐——慢慢地，细细地。',
    out: '一，二，三……数要像娘拨算盘珠子，一颗是一颗。',
    held: '憋住了……胸口发胀。',
    shake: '鹅毛在抖——慢些。',
    burst: '憋不住了，「噗」的一声，鹅毛翻着跟头飞了。数到 {n}。',
    puff: '吐得太急，鹅毛一抖，飞了。数到 {n}。',
    empty: '一口气吐尽了，鹅毛没动。数到 {n}。',
    let: '手一松，这口气断了。数到 {n}。',
    pad: '按住，慢慢画圈', again: '再来一口气',
    lung: '这口气', best: '最多', breaths: '口气',
    still: '数到 {n}。鹅毛在鼻子底下轻轻地抖，没飞。',
    shaky: '最多数到 {n}。鹅毛飞了几回，鸡窝乱了几回。',
  },
  en: {
    ready: 'The feather is stuck to a strip of bamboo, under your nose. Breathe out, and it mustn\'t stir.',
    first: 'Out first — slowly, finely.',
    out: 'One, two, three… counted like Mother\'s abacus beads, each one its own.',
    held: 'You are holding it… your chest swells.',
    shake: 'The feather is shaking — slower.',
    burst: 'You can\'t hold it: *puff*, and the feather goes tumbling away. You reached {n}.',
    puff: 'Too fast: the feather shivers, and flies. You reached {n}.',
    empty: 'The breath is all out, and the feather never moved. You reached {n}.',
    let: 'You let go, and the breath breaks. You reached {n}.',
    pad: 'Press and circle slowly', again: 'Another breath',
    lung: 'Breath', best: 'Best', breaths: 'breaths',
    still: 'You reached {n}. The feather trembles under your nose, and stays.',
    shaky: 'Your best was {n}. The feather flew a few times, and so did the hens.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), live: false, phase: 'ready', t: 0, lung: 1, v: 0, moved: 0, still: 0, flutter: 0, count: 0, best: 0, breaths: 0, note: 'ready', won: false, grade: null };
}

export const gradeOf = (best) => (best >= STILL ? 'still' : 'shaky');

function finish(s) {
  const grade = gradeOf(s.best);
  return { ...s, live: false, won: true, grade, note: grade };
}

function endBreath(s, why) {
  const n = Math.floor(s.count);
  const e = { ...s, live: false, phase: 'rest', breaths: s.breaths + 1, best: Math.max(s.best, n), last: n, note: why, moved: 0, v: 0, still: 0, flutter: 0 };
  return e.breaths >= TRIES || e.best >= TARGET ? finish(e) : e;
}

const VERBS = {
  hold: (s) => (s.phase === 'out' ? null : { ...s, live: true, phase: 'out', lung: 1, count: 0, v: 0, moved: 0, still: 0, flutter: 0, note: 'first' }),
  move: (s, d) => (s.phase !== 'out' ? null : { ...s, moved: s.moved + Math.max(0, Math.min(400, Number(d.d) || 0)) }),
  release: (s) => (s.phase === 'out' ? endBreath(s, 'let') : null),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'out' || ms <= 0) return state;
  const inst = state.moved / (ms / 1000);
  const s = { ...state, t: state.t + ms, v: state.v + (inst - state.v) * 0.4, lung: state.lung - state.moved / LUNG_PX, moved: 0 };
  if (s.v > VMAX) {
    s.flutter += ms;
    s.note = 'shake';
    if (s.flutter > FLY_MS) return endBreath(s, 'puff');
  } else s.flutter = Math.max(0, s.flutter - ms);
  if (s.v < VMIN) {
    s.still += ms;
    if (s.count > 0 || s.still > 400) s.note = 'held';
    if (s.still > HOLD_MS) return endBreath(s, 'burst');
  } else {
    s.still = 0;
    if (s.v <= VMAX) { s.count += (RATE * ms) / 1000; s.note = 'out'; }
  }
  if (s.count >= TARGET) return endBreath({ ...s, count: TARGET }, 'empty');
  return s.lung <= 0 ? endBreath({ ...s, lung: 0 }, 'empty') : s;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const say = (k, n) => (t[k] ?? '').replace('{n}', String(n));
  const pips = Array.from({ length: TRIES }, (_, i) => `<i class="${i < state.breaths ? 'is-on' : ''}"></i>`).join('');
  const shake = state.phase === 'out' ? Math.min(1, Math.max(0, (state.v - VMAX * 0.6) / VMAX)) : 0;
  const flown = ['puff', 'burst'].includes(state.note);
  const feather = `<div class="g-feather-strip"><span class="g-feather-quill${flown ? ' is-flown' : ''}" style="--shake:${shake.toFixed(2)}"></span></div>`;
  const head = `<div class="g-feather-head"><span>${t.best} <b>${state.best}</b> / ${TARGET}</span><span class="g-feather-pips">${pips}</span></div>`;
  if (state.won) return `<div class="g-feather is-won">${feather}${head}<p class="g-feather-line">${say(state.grade, state.best)}</p></div>`;
  const count = state.phase === 'out' ? Math.floor(state.count) : state.phase === 'rest' ? state.last : 0;
  const line = state.phase === 'rest' ? say(state.note, state.last) : say(state.note, count);
  const lung = `<div class="g-feather-lung"><span>${t.lung}</span><span class="g-feather-bar"><i style="width:${Math.round(Math.max(0, state.lung) * 100)}%"></i></span></div>`;
  return `<div class="g-feather">${feather}${head}<div class="g-feather-count"><b>${count}</b></div>${state.phase === 'out' ? lung : ''}`
    + `<p class="g-feather-line">${line}</p>`
    + `<div class="g-feather-pad${state.phase === 'out' ? ' is-held' : ''}" data-g-drag="breath" role="button" tabindex="0">${state.phase === 'rest' ? t.again : t.pad}</div></div>`;
}
