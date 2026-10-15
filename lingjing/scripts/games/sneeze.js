// 喷嚏符 · 让一拳 — 古六, the 大比's first bout (wm-dabi; the per-回 plan, 2026-10-15). 何七 has no
// creatures.json row, so the bout is the book's own reading of it, played: 「一拳当胸打过来…接不住，
// 只得往旁边一让；让开的那一霎，他两根指头捏着那张喷嚏符，往里送了一丝灵气…『阿——』又一皱：
// 『阿——嚏！』一个喷嚏打得他往后一仰，第二个打得他往前一栽，第三个打到一半，小满在他背上轻轻一推。」
// Three beats: step aside when his shoulder drops (too late and the fist lands); a thread of qi into
// the charm (a held press, short — too much scorches the paper's edge); push on the third sneeze,
// half-way through. Never a fail. Grade clean · clumsy, written as a mark.
// Pure module: newGame / html / act / tick (live through the bout; live-games.js).
import { btn, n, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'sneeze',
  name: { zh: '喷嚏符 · 让一拳', en: 'The sneezing charm · Let the punch go by' },
  how: {
    zh: '看他肩膀：一沉便「让」。按住「送气」一下就松——一丝就够。第三个喷嚏打到一半，「推」。',
    en: 'Watch his shoulder: when it drops, step aside. Press "Feed it" briefly — a thread is enough. Halfway through the third sneeze, push.',
  },
};

export const GUARD = [1500, 1100, 1800, 1300]; // ms before each shoulder-drop, in turn
export const TELL = 650; //   the shoulder drops; then the fist lands
export const THREAD = [250, 1100]; // a thread of qi: held this long (ms)
export const AH = 900, CHOO = 450; // one sneeze: 「阿——」 then 「嚏！」

const T = {
  zh: {
    ready: '何七是进门三年的老弟子，三层，上了台，冲你一抱拳。你昨夜叫饭桶吸了四口，丹田里只剩个底，腿还是软的。', start: '抱拳',
    guard: '他盯着你，拳头收在腰上。', tell: '他肩膀一沉——', hit: '一拳当胸打过来，接不住，你退了三步。他又摆开了架势。', early: '他肩膀还没动。你一闪，倒闪了个空。',
    dodged: '你往旁边一让。让开的那一霎，两根指头捏着那张喷嚏符——往里送一丝灵气。', short: '指头一碰就松了，符纸没动静。', much: '送多了，符纸边上一焦，冒了一缕青烟。再来，一丝就够。',
    smoke: '符上那只朱砂鼻子一皱——「嗤」地冒出一缕黑烟，细得像一根线，笔直地钻进了何七的鼻孔和嘴里。',
    ah: '「阿——」', choo: '「——嚏！」', s1: '一个喷嚏打得他往后一仰。', s2: '第二个打得他往前一栽。', s3: '第三个打到一半——', pushEarly: '他还站得住，你这一推推了个空。', again: '他又一皱，「阿——」',
    yield: '让', feed: '送气', push: '推', round: '喷嚏',
    clean: '何七一面「嚏！嚏！」，一面自己下了台。执事愣了一下，才道：「沈小满，胜。」', clumsy: '何七打着喷嚏，自己下了台，落了地还在打。执事愣了一下：「沈小满，胜。」',
    skipped: '何七打着喷嚏，自己下了台。「沈小满，胜。」',
  },
  en: {
    ready: 'He Qi has been in the sect three years, third layer. He comes up on the stage and salutes you, fist in palm. Last night the Rice Bucket drew four mouthfuls from you; your dantian has only its dregs, and your legs are still weak.', start: 'Salute',
    guard: 'He watches you, fist drawn back at his hip.', tell: 'His shoulder drops —', hit: 'A punch to the chest — you can\'t take it, and you stagger three steps back. He squares up again.', early: 'His shoulder hasn\'t moved. You dodge at nothing.',
    dodged: 'You step aside. In that instant, two fingers pinch the sneezing charm — feed it a thread of qi.', short: 'A touch and you let go; the paper does nothing.', much: 'Too much — the paper\'s edge scorches and a wisp of smoke rises. Again: a thread is enough.',
    smoke: 'The cinnabar nose on the charm wrinkles — *hiss* — a thread of black smoke, fine as a hair, shoots straight up He Qi\'s nose and into his mouth.',
    ah: '"Ah —"', choo: '"— choo!"', s1: 'The first sneeze throws him back.', s2: 'The second pitches him forward.', s3: 'Halfway through the third —', pushEarly: 'He\'s still on his feet; your push meets air.', again: 'His face wrinkles again: "Ah —"',
    yield: 'Step aside', feed: 'Feed it', push: 'Push', round: 'Sneeze',
    clean: 'He Qi, going *choo! choo!*, walks off the stage by himself. The steward gapes a moment, then: "Shen Xiaoman wins."', clumsy: 'He Qi walks off the stage sneezing, and is still sneezing on the ground. The steward gapes: "Shen Xiaoman wins."',
    skipped: 'He Qi walks off the stage sneezing. "Shen Xiaoman wins."',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, swings: 0, held: null, k: 0, part: 'ah', hits: 0, over: 0, early: 0, fx: null, note: 'ready', won: false, grade: null };
}

export const stuck = (s) => s.hits + s.over >= 5;
export const gradeOf = (s) => (s.hits === 0 && s.over === 0 && s.early <= 1 ? 'clean' : 'clumsy');
const guardMs = (s) => GUARD[s.swings % GUARD.length];
/* Where he is in a swing: guard, then the shoulder's drop. */
const swingPart = (s) => (s.t - s.at < guardMs(s) ? 'guard' : 'tell');

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'face', live: true, t: 0, at: 0, note: 'guard' } : null),
  yield: (s) => {
    if (s.phase !== 'face') return null;
    if (swingPart(s) === 'guard') return { ...s, early: s.early + 1, note: 'early' };
    return { ...s, phase: 'charm', note: 'dodged', fx: { at: s.t, ok: true } };
  },
  hold: (s) => (s.phase === 'charm' ? { ...s, held: s.t } : null),
  release: (s) => {
    if (s.phase !== 'charm' || s.held == null) return null;
    const ms = s.t - s.held;
    if (ms < THREAD[0]) return { ...s, held: null, note: 'short' };
    if (ms > THREAD[1]) return { ...s, held: null, over: s.over + 1, note: 'much' };
    return { ...s, held: null, phase: 'sneeze', at: s.t, k: 0, part: 'ah', note: 'smoke' };
  },
  push: (s) => {
    if (s.phase !== 'sneeze') return null;
    if (s.k < 2 || s.part !== 'ah') return { ...s, early: s.early + 1, note: 'pushEarly' };
    const grade = gradeOf(s);
    return { ...s, live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } };
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
  if (s.phase === 'face') {
    const since = s.t - s.at;
    if (since >= guardMs(s) + TELL) return { ...s, at: s.t, swings: s.swings + 1, hits: s.hits + 1, note: 'hit', fx: { at: s.t, ok: false } };
    return since >= guardMs(s) ? { ...s, note: 'tell' } : ['hit', 'early'].includes(s.note) && since < 900 ? s : { ...s, note: 'guard' };
  }
  if (s.phase === 'sneeze') {
    const since = s.t - s.at, part = since < AH ? 'ah' : 'choo';
    if (since >= AH + CHOO) return { ...s, at: s.t, k: Math.min(2, s.k + 1), part: 'ah', note: s.k >= 2 ? 'again' : `s${s.k + 1}` };
    return { ...s, part, note: part === 'choo' ? 'choo' : s.k === 2 ? 's3' : s.note === 'pushEarly' ? s.note : 'ah' };
  }
  return s;
}

/* ── The picture: the stone stage edge, 何七 a few brush strokes — his shoulder dropping on the
   tell, rocking back and forward on the sneezes; the charm's thread of black smoke. */
function picture(state) {
  const stage = '<path class="g-line" d="M10 118 H250"/><path class="g-line g-thin g-faint" d="M250 118 v10 M10 118 v10"/>';
  const tell = state.phase === 'face' && state.note === 'tell';
  const lean = state.phase === 'sneeze' ? (state.k === 0 ? -8 : state.k === 1 ? 8 : state.part === 'choo' ? 6 : -4) : 0;
  const x = state.won ? 286 : 170;
  const he = `<g transform="translate(${x} 0) rotate(${lean} 0 118)"><circle class="g-line" cx="0" cy="44" r="10"/><path class="g-line" d="M0 54 V92 M0 92 l-12 26 M0 92 l12 26"/>`
    + `<path class="g-line" d="M0 ${tell ? 66 : 60} l-22 ${tell ? 10 : 2} M0 60 l18 10"/></g>`;
  const me = '<g transform="translate(96 0)"><circle class="g-line g-thin" cx="0" cy="48" r="9"/><path class="g-line g-thin" d="M0 57 V94 M0 94 l-10 24 M0 94 l10 24 M0 64 l16 6"/></g>';
  const smoke = ['sneeze'].includes(state.phase) || state.note === 'smoke' ? `<path class="g-mist" d="M112 70 q20 -14 ${n(x - 132)} -26" opacity=".7"/>` : '';
  const fx = state.fx ? splash(state.fx.ok ? 130 : 100, 66, state.t - state.fx.at, { r: 10, seal: state.fx.ok }) : '';
  const done = state.won && state.grade ? splash(286, 60, 300, { r: 12, seal: true }) : '';
  return scene(320, 130, stage + me + he + smoke + fx + done);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-sneeze g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-sneeze g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const head = state.phase === 'sneeze' ? `<div class="g-head"><span>${t.round} <b>${state.k + 1}</b> / 3</span></div>` : '';
  const control = state.phase === 'face' ? btn(t.yield, 'data-g="yield"')
    : state.phase === 'charm' ? btn(t.feed, 'data-g-hold="1"', 'main', `g-hold${state.held != null ? ' is-held' : ''}`)
      : btn(t.push, 'data-g="push"');
  const say = state.note === 'choo' ? `${t.ah}${t.choo}` : t[state.note] ?? '';
  return `<div class="g-sneeze g-ink">${picture(state)}${head}<p class="g-line-say">${say}</p>${control}</div>`;
}
