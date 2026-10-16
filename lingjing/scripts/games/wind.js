// 顺风溜 · 背后有风 — 古七, 年五开春, behind the 柴房 (09-xie; the per-回 plan, 2026-10-15). The
// boots the 饭桶 made of the 鯥's hide and wing membrane, and the line on their soles: 「背后有风，
// 脚下有路」. The book: 「他想了一想那行小字，迎着风，往后退了一步。那一步退出去，人便起来了……一滑便是
// 十丈……他转过身来，逆着风再退一步，那两道『鳃』张了张，『噗』，又『噗』，人一寸也没动。」 and 「他
// 来来回回试了三回，丹田里便空了一半——六层的灵力，撑不住第四回。」
// Read the wind (the flag and the grass lean with it), turn to face into it, and step back: facing
// into the wind he glides; any other way, 「噗，噗」 and a mouthful of 丹田 spent for nothing. Three
// glides, the wind shifting between them. Never a fail; `stuck` after three 噗.
// Grade read · puff. Pure module: newGame / act / tick / html.
import { btn, n, scene, skipped, splash, still } from './ink.js';
import { rng } from './seeded.js';
import { mountPure } from './mount.js';
import * as self from './wind.js';

export const DIRS = ['n', 'e', 's', 'w'];
export const GLIDES = 3, SIP = 1 / 6; // a step back costs this much 丹田: three glides, half of it
const ANG = { n: 0, e: 90, s: 180, w: 270 };

export const meta = {
  id: 'wind',
  name: { zh: '顺风溜 · 背后有风', en: 'Tailwind · Wind at your back' },
  how: {
    zh: '看风从哪边来——旗子和草往哪边倒。转过身，迎着风，「退一步」。逆着风退，只有「噗，噗」。',
    en: 'See where the wind comes from — which way the flag and the grass lean. Turn to face into it and "Step back". Step back with the wind in your face the wrong way, and all you get is pff, pff.',
  },
};

const T = {
  zh: {
    ready: '那天夜里刮的是北风。小满穿上它，在柴房后头的空地上站定，灌一丝灵力进去——两只脚后跟上的「鳃」便张开了，「噗」的一声，像两只小兽打了个响鼻。', start: '站定',
    n: '北', e: '东', s: '南', w: '西', face: '面朝', from: '风从{d}边来', back: '退一步',
    stand: '他想了一想那行小字。', glide: '那一步退出去，人便起来了——一滑便是十丈，到了墙根底下才停住。', puff: '那两道「鳃」张了张，「噗」，又「噗」，人一寸也没动。', shift: '风掉了个头。',
    qi: '丹田', glides: '滑',
    read: '他来来回回试了三回，丹田里便空了一半——六层的灵力，撑不住第四回。他坐在墙根底下喘气，心里明白了一样：这双鞋，不是打架的，是跑的。',
    puffed: '噗了几回，滑了三回，丹田里空了大半。他坐在墙根底下喘气：这双鞋，不是打架的，是跑的；跑之前，还得先看风。',
    skipped: '他迎着风，往后退了一步，一滑便是十丈。这双鞋，不是打架的，是跑的。',
  },
  en: {
    ready: 'That night the wind was from the north. Xiaoman put them on, stood still in the clearing behind the woodshed and sent in a thread of spiritual power. The "gills" at his two heels opened with a *pff*, like two small animals snorting.', start: 'Stand still',
    n: 'North', e: 'East', s: 'South', w: 'West', face: 'Face', from: 'Wind from the {d}', back: 'Step back',
    stand: 'He thought a moment about that line of small writing.', glide: 'With that step back, he rose — one slide was ten zhang, and he stopped only at the foot of the wall.', puff: 'The two "gills" opened and opened, *pff*, *pff* again, and he didn\'t move an inch.', shift: 'The wind has turned.',
    qi: 'Dantian', glides: 'Glide',
    read: 'He tried it back and forth three times, and his dantian was half empty — a sixth layer\'s power couldn\'t hold out for a fourth. He sat at the foot of the wall catching his breath, and understood one thing: these shoes weren\'t for fighting. They were for running.',
    puffed: 'A few pffs, three glides, and his dantian mostly empty. He sat at the foot of the wall catching his breath: these shoes were for running, not fighting — and before running, look at the wind.',
    skipped: 'He faced into the wind and stepped back, and slid ten zhang. These shoes weren\'t for fighting. They were for running.',
  },
};

/* The wind for each glide: north first (the book's), then where the seed turns it. */
export const windOf = (seed, k) => (k === 0 ? 'n' : DIRS[Math.floor(rng(`${seed}|${k}`)() * 4)]);

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', live: false, t: 0, k: 0, facing: 's', qi: 1, puffs: 0, fx: null, note: 'ready', won: false, grade: null };
}
export const stuck = (s) => s.puffs >= 3;

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'stand', live: true, note: 'stand' } : null),
  face: (s, d) => (s.phase === 'stand' && DIRS.includes(d.d) ? { ...s, facing: d.d } : null),
  back: (s) => {
    if (s.phase !== 'stand') return null;
    const qi = Math.max(0, s.qi - SIP);
    if (s.facing !== windOf(s.seed, s.k)) return { ...s, qi, puffs: s.puffs + 1, note: 'puff', fx: { at: s.t, ok: false } };
    const k = s.k + 1;
    if (k < GLIDES) return { ...s, qi, k, note: windOf(s.seed, k) === windOf(s.seed, s.k) ? 'glide' : 'shift', fx: { at: s.t, ok: true } };
    const grade = s.puffs === 0 ? 'read' : 'puff';
    return { ...s, qi, k, live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}
export const tick = (state, ms) => (!state.live || state.won || ms <= 0 ? state : { ...state, t: state.t + ms });

/* ── The picture: the clearing seen from above — a flag on the woodshed corner and tufts of grass
   leaning downwind, him in the middle, an arrow for the way he faces; a glide's streak. */
function picture(s) {
  const w = s.won ? windOf(s.seed, s.k - 1) : windOf(s.seed, s.k), a = ANG[w], sway = still() ? 0 : Math.sin(s.t / 240) * 4;
  // the wind blows FROM `w`, so everything leans the other way (a + 180)
  const lean = (x, y) => `<path class="g-reed" transform="translate(${x} ${y}) rotate(${n(a + 180 + sway)})" d="M0 0 L0 -12"/>`;
  const grass = [[40, 30], [70, 96], [250, 34], [280, 92], [60, 62], [262, 64]].map(([x, y]) => lean(x, y)).join('');
  const flag = `<path class="g-line g-thin" d="M290 14 v26"/><path class="g-line" transform="translate(290 16) rotate(${n(a + 90 + sway)})" d="M0 0 l12 3 l-12 3"/>`;
  const me = `<circle class="g-line" cx="160" cy="62" r="9"/><path class="g-line" transform="translate(160 62) rotate(${ANG[s.facing]})" d="M0 -10 L0 -24 M-4 -19 L0 -24 L4 -19"/>`;
  const fx = s.fx ? splash(160, 62, s.t - s.fx.at, { r: 10, seal: s.fx.ok }) : '';
  return scene(320, 124, grass + flag + me + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-wind g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade === 'puff' ? 'puffed' : state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-wind g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const head = `<div class="g-head"><span>${t.glides} <b>${state.k}</b> / ${GLIDES}</span><span>${t.qi}</span><span class="g-bar"><i style="width:${Math.round(state.qi * 100)}%"></i></span></div>`;
  const faces = `<div class="g-tags">${DIRS.map((d) => `<button type="button" class="g-tag${state.facing === d ? ' is-held' : ''}" data-g="face" data-d="${d}">${t.face}${t[d]}</button>`).join('')}</div>`;
  return `<div class="g-wind g-ink">${picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${faces}${btn(t.back, 'data-g="back"')}</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
