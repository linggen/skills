// 小周天 · 冲三关 — 第五回, 九月十七, the night the small circuit opens
// (wm-zhoutian; his 2026-09-30: 「先并行做1到4」). The qi climbs the 督脉 through
// three passes: 尾闾, 夹脊, 玉枕. 银月 dug two and a half of them for a year of
// nights; the last half she left for him — 「本王替你撞，你这辈子都不知道门是
// 怎么开的」. The breath goes in, out, and rests; push the qi up only in the rest,
// the way 爹 waits for the wind to catch its breath. The two dug passes open at
// one push each; 玉枕 wants three, and a push out of time sets it back one.
// One push to a stillness (2026-10-01: tapping fast inside one 歇 opened the
// circuit at once): a second push in the same stillness is out of time too.
// Pure module: newGame / html / act / tick (live-games.js steps the breath).

export const meta = {
  id: 'zhoutian',
  name: { zh: '小周天 · 冲三关', en: 'The small circuit · Three passes' },
  how: {
    zh: '吸、呼、歇。气歇住的那一下，引气上行。',
    en: 'In, out, still. In the stillness, push the qi up.',
  },
};

/// The passes, with where they sit on the 三关 figure (codex 三关, measured on the painted dots).
export const GATES = [
  { id: '尾闾', en: 'Weilü', need: 1, x: 0.4943, y: 0.519 },
  { id: '夹脊', en: 'Jiaji', need: 1, x: 0.4943, y: 0.3182 },
  { id: '玉枕', en: 'Yuzhen', need: 3, x: 0.4942, y: 0.1091 },
];
export const FIGURE = { src: '../worlds/jiuding/art/codex/sanguan.webp', ratio: 0.75 };

const T = {
  zh: {
    ready: '子时。你盘腿坐在柴堆上，把念头往下沉。',
    start: '坐定',
    push: '引气上行',
    in: '吸……',
    out: '呼……',
    rest: '歇',
    open0: '尾闾一松——这一道，有人替你凿过了。',
    open1: '夹脊也开了。你忽然明白，这一年夜里木牌为什么总是暖的。',
    nudge: '玉枕动了一下。还差一点。',
    rush: '气乱了，撞在骨头上，生疼。',
    stuck: '最后那半道，得你自己撞。',
    won: '玉枕，开了。一股热气冲过后脑，从头顶翻过，顺着前胸落回丹田——小周天，通了。',
  },
  en: {
    ready: 'Midnight. You sit cross-legged on the woodpile and let your thoughts sink.',
    start: 'Settle',
    push: 'Push the qi up',
    in: 'In…',
    out: 'Out…',
    rest: 'Still',
    open0: 'Weilü gives — someone dug this one for you.',
    open1: 'Jiaji opens too. Suddenly you know why the token was always warm on those nights.',
    nudge: 'Yuzhen stirs. Not yet.',
    rush: 'The qi is out of step and slams into bone. It hurts.',
    stuck: 'The last half pass you have to break yourself.',
    won: 'Yuzhen opens. A heat rushes over the back of the head, across the crown, down the front into the dantian — the small circuit is through.',
  },
};

function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

/** One breath from the seed: in, out, still (ms). */
export function breathOf(seed) {
  const h = hash(`zhoutian:${seed}`);
  return { in: 1500 + (h % 400), out: 1500 + ((h >>> 9) % 400), rest: 900 + ((h >>> 18) % 300) };
}

export function phaseAt(b, t) {
  const cyc = b.in + b.out + b.rest, x = t % cyc;
  return x < b.in ? 'in' : x < b.in + b.out ? 'out' : 'rest';
}

export function newGame(seed) {
  return { seed: String(seed), breath: breathOf(seed), t: 0, live: false, at: 0, got: 0, rushes: 0, note: 'ready', won: false, used: -1 };
}

/* Which breath this is: one stillness each. */
const breathNo = (b, t) => Math.floor(t / (b.in + b.out + b.rest));

function push(s) {
  if (!s.live) return null;
  const gate = GATES[s.at], n = breathNo(s.breath, s.t);
  if (phaseAt(s.breath, s.t) !== 'rest' || s.used === n) {
    return { ...s, rushes: s.rushes + 1, got: gate.need > 1 ? Math.max(0, s.got - 1) : s.got, note: 'rush' };
  }
  const got = s.got + 1;
  if (got < gate.need) return { ...s, got, used: n, note: got === 1 ? 'stuck' : 'nudge' };
  const at = s.at + 1;
  if (at >= GATES.length) return { ...s, at, got: 0, used: n, live: false, won: true, note: 'won' };
  return { ...s, at, got: 0, used: n, note: `open${s.at}` };
}

const VERBS = {
  start: (s) => (s.live ? null : { ...s, live: true }),
  push: (s) => push(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  return { ...state, t: state.t + ms };
}

function figure(state, lang) {
  const H = 100 * FIGURE.ratio;
  const pts = GATES.map((g, i) => {
    const cls = i < state.at ? 'is-open' : i === state.at && !state.won ? 'is-now' : '';
    const x = (g.x * 100).toFixed(2), y = (g.y * H).toFixed(2);
    // The picture carries its own painted labels (codex 三关, `labels: false`); only the dots here.
    return `<g class="g-zt-pt ${cls}"><circle cx="${x}" cy="${y}" r="2.4"><title>${lang === 'en' ? g.en : g.id}</title></circle></g>`;
  }).join('');
  // The qi's climb so far: from 尾闾 up to the last pass opened.
  const top = state.won ? GATES[2] : GATES[Math.max(0, state.at - 1)];
  const climb = state.at > 0 ? `<line class="g-zt-qi" x1="${(GATES[0].x * 100).toFixed(2)}" y1="${(GATES[0].y * H).toFixed(2)}" x2="${(top.x * 100).toFixed(2)}" y2="${(top.y * H).toFixed(2)}"/>` : '';
  return `<div class="g-zt-fig"><img src="${FIGURE.src}" alt=""><svg viewBox="0 0 100 ${H.toFixed(2)}" aria-hidden="true">${climb}${pts}</svg></div>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const phase = phaseAt(state.breath, state.t);
  const gate = GATES[Math.min(state.at, GATES.length - 1)];
  const pips = !state.won && gate.need > 1 ? `<div class="g-zt-pips">${Array.from({ length: gate.need }, (_, i) => `<span class="${i < state.got ? 'is-on' : ''}"></span>`).join('')}</div>` : '';
  const breath = state.live ? `<div class="g-zt-breath is-${phase}">${t[phase]}</div>` : '';
  const btn = state.won ? ''
    : state.live ? `<button type="button" class="g-zt-btn" data-g="push">${t.push}</button>`
      : `<button type="button" class="g-zt-btn" data-g="start">${t.start}</button>`;
  return `<div class="g-zt${state.won ? ' is-won' : ''}">${figure(state, lang)}${breath}${pips}<p class="g-zt-line">${t[state.note] ?? ''}</p>${btn}</div>`;
}
