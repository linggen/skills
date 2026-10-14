// 烙饼 · 一张厚，一张薄 — 古一, the kitchen before dawn (00-kitchen; batch two, 2026-10-14).
// The book: 娘 shakes the last of the white flour out of the bag, three times, and makes two
// flatbreads, one thick, one thin — the thick one for 小满. Here he keeps the fire and watches
// the griddle with her: each side of each bread browns as the fire works; 「翻！」 when it has
// gone golden, and 娘 turns it. Called too early, it is still white and she waits; left too
// long, it scorches — and if he says nothing at all she turns it herself. The thin one first,
// then the thick one, which takes longer. Four sides; the grade (golden · scorched) is written
// as a mark. Never a fail.
// Pure module: newGame / html / act / tick (live while the fire burns; live-games.js).
import { SKIP, btn, n, scene, skipBtn, skipped, splash, still } from './ink.js';

export const meta = {
  id: 'griddle',
  name: { zh: '烙饼 · 一张厚，一张薄', en: 'The flatbreads · One thick, one thin' },
  how: {
    zh: '饼面烙出黄斑就喊「翻」——早了还白着，晚了就焦了。先薄的，后厚的。',
    en: 'Call "Turn it!" once the side has gone golden — too soon it is still white, too late it burns. The thin one first, then the thick.',
  },
};

// The four sides, in order: the thin bread browns faster than the thick one (doneness a second).
export const SIDES = [{ bread: 'thin', rate: 0.26 }, { bread: 'thin', rate: 0.26 }, { bread: 'thick', rate: 0.17 }, { bread: 'thick', rate: 0.17 }];
export const GOLD = 0.7; //    golden from here…
export const BURN = 1.05; //   …to here; past it the side scorches
export const LATE = 1.4; //    she turns it herself

const T = {
  zh: {
    ready: '娘把最后一点白面全抖了出来，抖了三遍。灶膛里的火，归你看着。', start: '添一把柴',
    flip: '翻！', thin: '薄的那张', thick: '厚的那张', side: '面',
    heat: '面饼贴着鏊子，一点一点地起黄斑……', raw: '「还白着呢。」娘没动铲子。',
    gold: '「翻。」铲子一挑——黄澄澄的。', burnt: '晚了一口气，翻过来，焦了一片。', herself: '你没吭声，娘自己翻了——焦了。',
    golden: '两张饼，四面黄澄澄的。娘把厚的那张包好，塞进你怀里。', scorched: '焦了几块。娘把焦的那面朝里，包好，塞进你怀里。',
    skipped: '娘一个人把饼烙完了，厚的那张包好，塞进你怀里。',
  },
  en: {
    ready: 'Mother shakes the last of the white flour out of the bag, three times over. The fire is yours to mind.', start: 'Feed the fire',
    flip: 'Turn it!', thin: 'The thin one', thick: 'The thick one', side: 'side',
    heat: 'The bread lies against the griddle, and the brown spots come up one by one…', raw: '"Still white." Mother leaves the spatula where it is.',
    gold: '"Turn." A flick of the spatula — golden.', burnt: 'One breath too late: turned over, it has a scorched patch.', herself: 'You said nothing, so Mother turned it herself — scorched.',
    golden: 'Two flatbreads, golden on all four sides. Mother wraps the thick one and tucks it inside your jacket.', scorched: 'A few scorched patches. Mother wraps it scorched side in, and tucks it inside your jacket.',
    skipped: 'Mother bakes the bread on her own, wraps the thick one, and tucks it inside your jacket.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), live: false, phase: 'ready', t: 0, side: 0, d: 0, sides: [], fx: null, note: 'ready', won: false, grade: null };
}

export const gradeOf = (sides) => (sides.filter((x) => x !== 'gold').length <= 1 ? 'golden' : 'scorched');

function turn(s, how) {
  const sides = [...s.sides, how === 'gold' ? 'gold' : 'burnt'];
  const next = { ...s, sides, side: s.side + 1, d: 0, fx: { at: s.t, ok: how === 'gold' }, note: how };
  if (next.side < SIDES.length) return next;
  const grade = gradeOf(sides);
  return { ...next, live: false, won: true, grade, note: grade };
}

const VERBS = {
  start: (s) => (s.phase !== 'ready' ? null : { ...s, phase: 'fire', live: true, note: 'heat' }),
  flip: (s) => {
    if (s.phase !== 'fire') return null;
    if (s.d < GOLD) return { ...s, note: 'raw' };
    return turn(s, s.d <= BURN ? 'gold' : 'burnt');
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
  if (!state.live || state.won || state.phase !== 'fire' || ms <= 0) return state;
  const s = { ...state, t: state.t + ms, d: state.d + (SIDES[state.side].rate * ms) / 1000 };
  return s.d >= LATE ? turn(s, 'herself') : s;
}

/* ── The picture: the stove's mouth with the fire in it, the round iron griddle over it, the
   bread browning from pale dough to gold to scorch — its spots coming up as it cooks — and a
   wisp of steam; the fire's tongues lick with the clock. */
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, k))));
const rgb = (c) => `rgb(${c.join(',')})`;
function breadFill(d) {
  const pale = [238, 226, 196], gold = [214, 160, 72], burnt = [96, 66, 34];
  return rgb(d < GOLD ? mix(pale, gold, d / GOLD) : mix(gold, burnt, (d - GOLD) / (LATE - GOLD)));
}
function griddleScene(state) {
  const live = state.phase === 'fire' && !state.won, t = still() ? 0 : state.t;
  const stove = '<path class="g-line" d="M40 130 V80 H280 V130"/><path class="g-line g-thin g-faint" d="M40 92 H280 M56 112 h30 M234 112 h30"/>'
    + '<path class="g-mouth" d="M116 130 V110 Q160 86 204 110 V130 Z"/><path class="g-line" d="M116 130 V110 Q160 86 204 110 V130"/>';
  const flames = live || state.phase === 'ready' ? [0, 1, 2].map((k) => {
    const h = 12 + (live ? 8 : 3) + Math.sin(t / 140 + k * 2) * 3;
    return `<path class="g-flame" d="M${140 + k * 20} 130 q-8 ${n(-h * 0.5)} 0 ${n(-h)} q8 ${n(h * 0.5)} 0 ${n(h)}z"/>`;
  }).join('') : '';
  const griddle = '<ellipse class="g-line" cx="160" cy="74" rx="78" ry="12" fill="none"/><path class="g-line g-thin" d="M82 74 q78 22 156 0"/>';
  const cur = SIDES[Math.min(state.side, SIDES.length - 1)], thick = cur.bread === 'thick';
  const d = state.won ? GOLD + 0.1 : state.d;
  const spots = d > 0.35 ? [[-18, -2], [10, -4], [22, 1], [-4, 2], [-26, 1], [14, 3]].slice(0, Math.min(6, Math.floor(d * 6)))
    .map(([x, y]) => `<ellipse class="g-scorch" cx="${160 + x}" cy="${n(70 + y - (thick ? 2 : 0))}" rx="${n(2 + d * 2)}" ry="1.4"/>`).join('') : '';
  const bread = `<ellipse class="g-loaf" cx="160" cy="${thick ? 68 : 70}" rx="${thick ? 50 : 54}" ry="${thick ? 9 : 6}" style="fill:${breadFill(d)}"/>${spots}`;
  const steam = live && state.d > 0.3 ? [0, 1].map((k) => `<path class="g-mist" d="M${150 + k * 20} 58 q-6 -8 0 -16 q6 -8 0 -16" opacity="${n(0.2 + Math.min(0.4, state.d * 0.3), 2)}"/>`).join('') : '';
  const fx = state.fx ? splash(160, 66, state.t - state.fx.at, { r: 9, seal: state.fx.ok }) : '';
  const done = state.won && state.grade === 'golden' ? splash(160, 62, 300, { r: 12, seal: true }) : '';
  return scene(320, 132, stove + flames + griddle + bread + steam + fx + done);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const pips = SIDES.map((_, i) => `<i class="${state.sides[i] === 'gold' ? 'is-on' : state.sides[i] ? 'is-burnt' : ''}"></i>`).join('');
  const cur = SIDES[Math.min(state.side, SIDES.length - 1)];
  const head = `<div class="g-head"><span>${t[cur.bread]} · ${Math.min(state.side, SIDES.length - 1) % 2 + 1} ${t.side}</span><span class="g-griddle-pips">${pips}</span></div>`;
  if (state.won) return `<div class="g-griddle g-ink is-won">${griddleScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-griddle g-ink">${griddleScene(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
  return `<div class="g-griddle g-ink">${griddleScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>`
    + `${btn(t.flip, 'data-g="flip"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
}
