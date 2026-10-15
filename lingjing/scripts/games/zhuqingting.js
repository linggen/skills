// 猪蜻蜓 · 等风掉头 — 古六, the 大比's final (wm-laoyin; the per-回 plan, 2026-10-15). 祁长松 has no
// creatures.json row: the bout is the book's own reading of it, played. 阿禾's page said 「没法打，
// 认输」; 小满 watched the feet — 「前脚踩实了，后脚才跟上来——后脚跟上来的那一霎，是他身上最轻的
// 时候」. Spells and shoves bounce off his earth-yellow light; every step he takes eats the stage.
// 他爹: 「日头落山那一下，山里的风要掉个头」 — so he waits with the paper pig, the incense burning down;
// at 「香只剩一指」 the sun goes, he walks in, takes the palm, and slaps the charm on 祁长松's back in
// the instant the back foot comes up; the flag flips, both are lifted, and the result is the book's:
// he hangs in the cypress, 「……祁长松，胜。」 Never a fail. Grade caught · late, written as a mark.
// Pure module: newGame / html / act / tick (live while the incense burns; live-games.js).
import { btn, n, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'zhuqingting',
  name: { zh: '猪蜻蜓 · 等风掉头', en: 'The pig dragonfly · Wait for the wind to turn' },
  how: {
    zh: '撞他没用。攥着那张猪，等香烧到一指、日头落山；他后脚跟上来的那一霎，「拍」。',
    en: 'Shoving him is useless. Hold the paper pig and wait for the incense to burn to a finger and the sun to set; the instant his back foot comes up — slap.',
  },
};

export const INCENSE = 11000; // ms — 半炷香, played short
export const DUSK = 0.12; //     「香只剩一指的时候，日头沉下去了」
export const STEP = 1500; //     one step of his: the front foot sinks…
export const LIGHT = 480; //     …and the back foot's lift, the lightest instant (the step's tail)
export const START_EDGE = 6; //  half-feet of stone behind his heels at the start; a step takes one

const T = {
  zh: {
    ready: '祁长松道：「我不伤你。我送你下去。」香点着了。阿禾那张纸上写的是：没法打，认输。她看的是底册，你看的是脚。', start: '看他的脚',
    step: '他一步一掌，不快，不急。那一步迈上来，台上便少一块地方。', shove: '你上去推他，推不动；一头撞上去，像撞在一堵墙上，自己弹回来。',
    early: '你攥着那张猪，又缩了回来。他爹说过，日头落山那一下，山里的风要掉个头——还没到。',
    dusk: '香只剩一指的时候，日头沉下去了。演武场边上那面旗先是一垂——你从台边上直直地朝他走过去。',
    palm: '祁长松出掌了。那一掌平平地印在你胸口上——你没有倒，两只手往前一捞，揪住了他的袍子。',
    heavy: '前脚踩实了——', light: '后脚，正要跟上来——', miss: '他脚底下踩实了，那张纸拍不上去。',
    edge: '脚后跟底下', foot: '尺', shoveBtn: '撞他', slap: '拍',
    caught: '那张猪蜻蜓，贴在了祁长松的后背上。便在这时，演武场边上那面旗「哗」地翻了个面。风掉头了。祁长松两只脚，离了地——两个人一齐飘了起来。他落在了台边，是他起脚那地方后头三尺；你对折着挂在老柏的横杈上。执事锣槌转了两转：「……祁长松，胜。」',
    late: '你拍上去的时候，慢了一霎，可那张猪到底贴住了。旗「哗」地翻了个面，风掉头了，两个人一齐飘了起来。他落在了台边，后头三尺；你挂在了树上。「……祁长松，胜。」',
    skipped: '风掉头了。两个人一齐飘了起来，你挂在了老柏的横杈上。「……祁长松，胜。」',
  },
  en: {
    ready: 'Qi Changsong says, "I won\'t hurt you. I\'ll send you down." The incense is lit. Ahe\'s page said: can\'t be fought, concede. She read the records; you read the feet.', start: 'Watch his feet',
    step: 'A step and a palm, unhurried. Each step he takes, the stage has a little less room.', shove: 'You push him and he doesn\'t move; you ram him and it\'s like ramming a wall — you bounce off.',
    early: 'You grip the paper pig and draw it back. Father said: when the sun goes down, the mountain wind turns round — not yet.',
    dusk: 'With a finger of incense left, the sun sinks. The flag at the edge of the field droops — and you walk straight at him from the edge.',
    palm: 'Qi Changsong strikes. The palm lands flat on your chest — you don\'t go down; both hands grab forward and seize his robe.',
    heavy: 'The front foot sinks firm —', light: 'The back foot is just coming up —', miss: 'His foot is planted; the paper won\'t take.',
    edge: 'Behind your heels', foot: 'ft', shoveBtn: 'Ram him', slap: 'Slap',
    caught: 'The pig dragonfly sticks to Qi Changsong\'s back. At that moment the flag at the field\'s edge flips over. The wind has turned. Both his feet leave the ground — and the two of you float up together. He lands at the stage\'s edge, three feet behind where he started; you hang folded over a cypress branch. The steward twirls his drumstick twice: "…Qi Changsong wins."',
    late: 'You slap a moment late, but the paper pig sticks. The flag flips, the wind turns, and the two of you float up together. He lands on the edge, three feet back; you hang in the tree. "…Qi Changsong wins."',
    skipped: 'The wind turns. The two of you float up together, and you end up hanging in the old cypress. "…Qi Changsong wins."',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, edge: START_EDGE, shoves: 0, early: 0, misses: 0, fx: null, note: 'ready', won: false, grade: null };
}

export const stuck = (s) => s.misses >= 4;
export const gradeOf = (s) => (s.misses === 0 && s.early <= 1 ? 'caught' : 'late');
const left = (s) => Math.max(0, 1 - s.t / INCENSE);
/* Where his step is: the front foot sinking, then the back foot's light instant. */
export const footOf = (s) => ((s.t - s.at) % STEP >= STEP - LIGHT ? 'light' : 'heavy');

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'press', live: true, t: 0, at: 0, note: 'step' } : null),
  shove: (s) => (s.phase === 'press' ? { ...s, shoves: s.shoves + 1, edge: Math.max(1, s.edge - 1), note: 'shove', said: s.t, fx: { at: s.t, ok: false } } : null),
  slap: (s) => {
    if (s.phase === 'press') return { ...s, early: s.early + 1, note: 'early', said: s.t };
    if (s.phase !== 'close') return null;
    if (footOf(s) !== 'light') return { ...s, misses: s.misses + 1, note: 'miss', fx: { at: s.t, ok: false } };
    const grade = gradeOf(s);
    return { ...s, phase: 'flown', live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || ms <= 0) return state;
  const s = { ...state, t: state.t + ms };
  if (s.phase === 'press') {
    if (left(s) <= DUSK) return { ...s, phase: 'close', at: s.t, note: 'dusk' };
    const steps = Math.floor(s.t / STEP) - Math.floor(state.t / STEP);
    const edge = Math.max(1, s.edge - steps);
    const fresh = ['shove', 'early'].includes(s.note) && s.t - (s.said ?? 0) < 1400;
    return { ...s, edge, note: !steps && fresh ? s.note : 'step' };
  }
  if (s.phase === 'close') {
    const since = s.t - s.at;
    if (since < 1600) return { ...s, note: since < 800 ? 'dusk' : 'palm' };
    return { ...s, note: s.note === 'miss' && s.t - s.fx.at < 700 ? 'miss' : footOf(s) };
  }
  return s;
}

/* ── The picture: the stone stage, the incense stick burning down, the flag at the field's edge
   (drooping at dusk, flipped at the end); 祁长松 square and planted, his feet drawn heavy or light;
   the boy at the edge with the stone behind his heels shrinking; the cypress to the side. */
function picture(state) {
  const stage = '<path class="g-line" d="M20 116 H240"/>';
  const flagFlip = state.phase === 'flown', droop = state.phase === 'close';
  const flag = `<path class="g-line g-thin" d="M290 116 V40"/><path class="g-markstroke" d="M290 42 ${flagFlip ? 'l-24 8 l24 8' : droop ? 'l10 18 l6 -16' : 'l24 8 l-24 8'}"/>`;
  const stick = `<path class="g-line g-thin" d="M30 108 V${n(108 - 50 * left(state))}"/><circle class="g-ember" cx="30" cy="${n(108 - 50 * left(state))}" r="2.2"/>`;
  const light = state.phase === 'close' && footOf(state) === 'light';
  const qx = state.phase === 'flown' ? 186 : 150;
  const qi = `<g transform="translate(${qx} ${state.phase === 'flown' ? -40 : 0})"><circle class="g-glow" cx="0" cy="74" r="34" opacity=".25"/><circle class="g-line" cx="0" cy="46" r="11"/>`
    + `<path class="g-line" d="M0 57 V90 M-14 64 h28"/><path class="g-line" d="M0 90 l-10 26"/><path class="g-line${light ? ' g-faint' : ''}" d="M0 90 l12 ${light ? 20 : 26}"/></g>`;
  const mx = 90 + (START_EDGE - state.edge) * 6;
  const me = state.phase === 'flown' ? '<path class="g-line g-thin" d="M250 40 q8 14 16 0"/>'
    : `<g transform="translate(${n(mx)} 0)"><circle class="g-line g-thin" cx="0" cy="52" r="9"/><path class="g-line g-thin" d="M0 61 V94 M0 94 l-8 22 M0 94 l8 22"/></g>`;
  const tree = '<path class="g-line g-thin g-faint" d="M262 116 V30 M262 44 l-22 -6"/>';
  const fx = state.fx ? splash(state.fx.ok ? qx : mx + 14, 70, state.t - state.fx.at, { r: 10, seal: state.fx.ok }) : '';
  return scene(320, 124, stage + tree + flag + stick + qi + me + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-zqt g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-zqt g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const head = `<div class="g-head"><span>${t.edge} <b>${(state.edge / 2).toFixed(1)}</b> ${t.foot}</span></div>`;
  const controls = state.phase === 'press' ? `<div class="g-pair">${btn(t.shoveBtn, 'data-g="shove"', 'soft')}${btn(t.slap, 'data-g="slap"')}</div>` : btn(t.slap, 'data-g="slap"');
  return `<div class="g-zqt g-ink">${picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${controls}</div>`;
}
