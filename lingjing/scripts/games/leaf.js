// 随叶 / 定风 — the shared leaf board (the per-回 plan, 2026-10-15; 古七): a dry leaf on the 崖顶's
// wind, and 瞿老's 巽 — 「风，你是砍不着的……你得随它，跟着它走」. Two stops, each data (STOPS):
//   'sui'  (09-jiuge, 腊月十五): the leaf drops from 瞿老's fingers and the wind walks it about; hold
//          随左 / 随右 to keep the broom tip under it all the way down — 「叶子落地，扫帚把也落地，叶子
//          正落在扫帚把尖上」. 砍 blows it off (the book's four or five cuts that never touch it); a leaf
//          that lands off the tip is picked up and dropped again. Grade follow · chase.
//   'ding' (09-furnace, 开春 to 三月): standing on 巽 at dawn, leaves spin on the cliff; the eyes want
//          to follow (a tap on a spin is the eye turning with it). One leaf rises from the edge and
//          drifts at his face: 「他看见了它起来的那一下」 — step half aside (挪半步) inside that rise.
//          Too late, it slaps his face; the morning is over and the next comes. Grade still · eyes.
// Never a fail; `stuck` after three misses (the page lays its skip). Both stops pay 修为 (tasks/h11.json).
// Pure: makeLeaf(stop) → { meta, newGame, act, tick, html, stuck }; leafsui.js / leafding.js are the stops.
import { btn, n, scene, skipped, splash, still } from './ink.js';
import { hash } from './seeded.js';

export const SUI = { fall: 9000, speed: 0.34, tip: 0.07, cutGust: 0.22 };
export const DING = { spins: [1700, 2300, 1500, 2600, 1900], rise: 1100, mornings: 3 };

export const STOPS = {
  sui: {
    name: { zh: '随叶 · 跟着它走', en: 'Follow the leaf · Go with it' },
    how: { zh: '叶子往哪儿飘，扫帚把就跟到哪儿——按住「随左」「随右」。别砍：剑一到，风先把它推开。', en: 'Wherever the leaf drifts, the broom follows — hold "With it, left" / "With it, right". Don\'t cut: the blade\'s wind pushes it off first.' },
    zh: {
      ready: '他从扫帚头上掰下一片干叶子：「这一格是巽，巽是风。」把叶子举到眼前，松了手。', start: '看它落',
      fall: '叶子飘下来。', under: '扫帚把跟着那片叶子的路，慢慢地往下走。', off: '叶子飘开了——跟上。', cut: '剑还没到，那片叶子便给剑上带起的风推开了，打着旋儿飘出去三尺。',
      miss: '叶子落在格子外头。瞿老把它捡回来，又举起来，松手。', left: '随左', right: '随右', chop: '砍', tries: '落',
      follow: '叶子落地，扫帚把也落地，叶子正落在扫帚把尖上。「你得随它，跟着它走。」', chase: '叶子落在了扫帚把尖上——追得一头汗。瞿老道：「风，你是砍不着的。」',
      skipped: '瞿老拿扫帚把跟着那片叶子，慢慢地往下走：「你得随它，跟着它走。」',
    },
    en: {
      ready: 'He snaps a dry leaf off the broom head. "This square is Xun, and Xun is wind." He holds the leaf up before his eyes and lets go.', start: 'Watch it fall',
      fall: 'The leaf floats down.', under: 'The broom handle follows the leaf\'s path down, slowly.', off: 'The leaf drifts away — go with it.', cut: 'Before the blade gets there, the leaf is pushed aside by the wind the sword raises and spins three feet away.',
      miss: 'The leaf lands outside the squares. Elder Qu picks it up, holds it up again and lets go.', left: 'With it, left', right: 'With it, right', chop: 'Cut', tries: 'Drop',
      follow: 'When the leaf reaches the ground the handle reaches the ground too, and the leaf lands right on its tip. "You have to go with it. Follow it."', chase: 'The leaf lands on the tip — after a sweaty chase. Elder Qu says, "You can\'t cut the wind."',
      skipped: 'Elder Qu follows the leaf down with the broom handle, slowly: "You have to go with it. Follow it."',
    },
  },
  ding: {
    name: { zh: '定风 · 看见它起来', en: 'Settle the wind · See it rise' },
    how: { zh: '站在巽那一格上，叶子打转，眼睛别跟着转。有一片从崖边起来，往你脸上飘——看见它起来的那一下，「挪半步」。', en: 'Stand on the Xun square. Leaves spin; don\'t let your eyes spin with them. One rises from the cliff edge and drifts at your face — the moment you see it rise, take half a step aside.' },
    zh: {
      ready: '他照师父的功课，每天天不亮上崖顶，站到巽那一格上，看落叶打转。', start: '站上巽位',
      spin: '叶子转。', eyes: '叶子转，他的眼睛跟着转。', rise: '一片叶子从崖边起来，往他脸上飘——', slap: '叶子贴在了脸上。天亮了，明天再来。',
      step: '挪半步', month: '早', still: '他没躲，也没砍，只往旁边挪了半步——那片叶子贴着他的耳朵飘过去了。他看见了它起来的那一下。',
      shaky: '眼睛先跟着转了几回；到底，他看见了它起来的那一下，往旁边挪了半步，那片叶子贴着他的耳朵飘过去了。',
      skipped: '到了三月里一个早上，一片叶子贴着他的耳朵飘过去了。',
    },
    en: {
      ready: 'He did his master\'s homework: every day before dawn he went up to the clifftop and stood in the Xun square, watching the fallen leaves spin.', start: 'Stand on Xun',
      spin: 'The leaves spin.', eyes: 'The leaves spin, and his eyes spin with them.', rise: 'A leaf rises from the cliff edge and drifts at his face —', slap: 'The leaf sticks to his face. Day has come; again tomorrow.',
      step: 'Half a step aside', month: 'Dawn', still: 'He doesn\'t dodge and doesn\'t cut. He just moves half a step to the side, and the leaf floats past his ear. He has seen the moment it rose.',
      shaky: 'His eyes spun with the leaves a few times first; in the end he saw the moment it rose, moved half a step aside, and the leaf floated past his ear.',
      skipped: 'One morning in the third month a leaf floated past his ear.',
    },
  },
};

/* The wind walking the leaf: two slow swells, their phases the seed's. */
export const leafX = (seed, t) => {
  const h = hash(seed), a = (h % 628) / 100, b = ((h >> 8) % 628) / 100;
  return Math.max(0.06, Math.min(0.94, 0.5 + 0.3 * Math.sin(t / 1400 + a) + 0.11 * Math.sin(t / 560 + b)));
};

function suiGame() {
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', live: false, t: 0, drop: 0, at: 0, bx: 0.5, dir: 0, gust: 0, under: 0, total: 0, cuts: 0, misses: 0, fx: null, note: 'ready', won: false, grade: null });
  const lx = (s) => Math.max(0.04, Math.min(0.96, leafX(`${s.seed}|${s.drop}`, s.t - s.at) + s.gust));
  const verbs = {
    start: (s) => (s.phase === 'ready' ? { ...s, phase: 'fall', live: true, at: s.t, note: 'fall' } : null),
    hold: (s, d) => (s.phase === 'fall' ? { ...s, dir: d.dir === 'l' ? -1 : 1 } : null),
    release: (s) => (s.phase === 'fall' ? { ...s, dir: 0 } : null),
    chop: (s) => (s.phase === 'fall' ? { ...s, cuts: s.cuts + 1, gust: s.gust + (lx(s) > s.bx ? SUI.cutGust : -SUI.cutGust), note: 'cut', fx: { at: s.t } } : null),
  };
  function tick(state, ms) {
    if (!state.live || state.won || ms <= 0) return state;
    const dt = ms / 1000;
    let s = { ...state, t: state.t + ms, bx: Math.max(0.04, Math.min(0.96, state.bx + state.dir * SUI.speed * dt)), gust: state.gust * Math.pow(0.6, dt) };
    const close = Math.abs(lx(s) - s.bx) <= SUI.tip;
    s = { ...s, under: s.under + (close ? ms : 0), total: s.total + ms, note: s.note === 'cut' && s.t - s.fx.at < 900 ? 'cut' : s.note === 'miss' && s.t - s.at < 1200 ? 'miss' : close ? 'under' : 'off' };
    if (s.t - s.at < SUI.fall) return s;
    if (!close) return { ...s, misses: s.misses + 1, drop: s.drop + 1, at: s.t, gust: 0, note: 'miss', fx: { at: s.t } };
    const grade = s.cuts === 0 && s.misses === 0 && s.under / s.total >= 0.5 ? 'follow' : 'chase';
    return { ...s, live: false, won: true, grade, note: grade };
  }
  function picture(s) {
    const k = s.phase === 'fall' ? Math.min(1, (s.t - s.at) / SUI.fall) : 0;
    const x = 20 + lx(s) * 280, y = 18 + k * 92, bxp = 20 + s.bx * 280, tilt = still() ? 0 : Math.sin(s.t / 260) * 25;
    const grid = '<path class="g-line g-thin g-faint" d="M60 112 H260 M60 124 H260"/>';
    const leaf = `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(tilt)})"><path class="g-line" d="M-7 0 Q0 -6 7 0 Q0 6 -7 0Z"/><path class="g-line g-thin" d="M-7 0 H7"/></g>`;
    const broom = `<path class="g-line" d="M${n(bxp)} 112 L${n(bxp + 34)} 60"/><path class="g-line g-thin" d="M${n(bxp + 30)} 64 l12 -10 M${n(bxp + 34)} 60 l14 -6"/>`;
    const fx = s.fx ? splash(x, y, s.t - s.fx.at, { r: 8 }) : '';
    return scene(320, 130, grid + broom + leaf + fx);
  }
  return { newGame, verbs, tick, picture, stuck: (s) => s.misses + s.cuts >= 4 };
}

function dingGame() {
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, k: 0, morning: 0, eyes: 0, slaps: 0, fx: null, note: 'ready', won: false, grade: null });
  // A morning: spins (each a flutter the eye wants), then the one leaf rises at its turn.
  const spinsOf = (s) => 2 + (hash(`${s.seed}|${s.morning}`) % 3);
  const riseAt = (s) => Array.from({ length: spinsOf(s) }, (_, i) => DING.spins[(i + s.morning) % DING.spins.length]).reduce((a, b) => a + b, 0);
  const verbs = {
    start: (s) => (s.phase === 'ready' ? { ...s, phase: 'stand', live: true, at: s.t, note: 'spin' } : null),
    step: (s) => {
      if (s.phase !== 'stand') return null;
      const since = s.t - s.at, r = riseAt(s);
      if (since < r) return { ...s, eyes: s.eyes + 1, note: 'eyes' };
      const grade = s.eyes === 0 && s.slaps === 0 ? 'still' : 'shaky';
      return { ...s, live: false, won: true, grade, note: grade, fx: { at: s.t } };
    },
  };
  function tick(state, ms) {
    if (!state.live || state.won || ms <= 0) return state;
    const s = { ...state, t: state.t + ms }, since = s.t - s.at, r = riseAt(s);
    if (since >= r + DING.rise) return { ...s, at: s.t, morning: s.morning + 1, slaps: s.slaps + 1, note: 'slap', fx: { at: s.t } };
    if (since >= r) return { ...s, note: 'rise' };
    return { ...s, note: s.note === 'eyes' || (s.note === 'slap' && since < 1200) ? s.note : 'spin' };
  }
  function picture(s) {
    const since = s.t - s.at, r = s.phase === 'stand' ? riseAt(s) : Infinity, up = since >= r ? Math.min(1, (since - r) / DING.rise) : 0;
    const cliff = '<path class="g-line" d="M10 112 H210 L230 128"/><path class="g-line g-thin g-faint" d="M120 112 h40 M120 104 h40"/>';
    const me = '<g transform="translate(140 0)"><circle class="g-line g-thin" cx="0" cy="62" r="8"/><path class="g-line g-thin" d="M0 70 V96 M0 96 l-8 16 M0 96 l8 16"/></g>';
    const spins = still() ? '' : [40, 80, 200].map((x, i) => `<path class="g-line g-thin g-faint" transform="translate(${x} ${n(90 - 6 * i)}) rotate(${n((s.t / (3 + i)) % 360)})" d="M-5 0 Q0 -4 5 0 Q0 4 -5 0Z"/>`).join('');
    const one = up > 0 ? `<path class="g-line" transform="translate(${n(226 - up * 82)} ${n(120 - up * 58)}) rotate(${n(up * 200)})" d="M-6 0 Q0 -5 6 0 Q0 5 -6 0Z"/>` : '';
    const fx = s.fx ? splash(144, 62, s.t - s.fx.at, { r: 9, seal: s.won }) : '';
    return scene(320, 130, cliff + spins + me + one + fx);
  }
  return { newGame, verbs, tick, picture, stuck: (s) => s.slaps >= 3 };
}

export function makeLeaf(stop) {
  const S = STOPS[stop], G = stop === 'sui' ? suiGame() : dingGame();
  const meta = { id: `leaf${stop}`, name: S.name, how: S.how };
  const verbs = { ...G.verbs, skip: (s) => skipped(s) };
  const act = (state, data = {}) => {
    if (!state || state.won) return { state, won: false };
    const next = verbs[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  };
  function html(state, lang = 'zh') {
    const t = S[lang] || S.zh;
    if (state.won) return `<div class="g-leaf g-ink is-won">${G.picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
    if (state.phase === 'ready') return `<div class="g-leaf g-ink">${G.picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
    if (stop === 'sui') {
      const head = `<div class="g-head"><span>${t.tries} <b>${state.drop + 1}</b></span></div>`;
      const pad = btn(t.left, 'data-g-hold="1" data-dir="l"', 'soft', `g-hold${state.dir < 0 ? ' is-held' : ''}`) + btn(t.chop, 'data-g="chop"', 'soft') + btn(t.right, 'data-g-hold="1" data-dir="r"', 'soft', `g-hold${state.dir > 0 ? ' is-held' : ''}`);
      return `<div class="g-leaf g-ink">${G.picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p><div class="g-pair">${pad}</div></div>`;
    }
    const head = `<div class="g-head"><span>${t.month} <b>${state.morning + 1}</b></span></div>`;
    return `<div class="g-leaf g-ink">${G.picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${btn(t.step, 'data-g="step"')}</div>`;
  }
  return { meta, newGame: G.newGame, act, tick: G.tick, html, stuck: G.stuck };
}
