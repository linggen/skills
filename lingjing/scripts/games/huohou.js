// 火候 — the shared furnace-watch board (the per-回 plan, 2026-10-15). 闵丹师's 「药下去，每一刻味儿都
// 不同。先是苦，苦里透甜，甜里冒一丝焦——那一丝，只有半口气的工夫。早一口，药没熟；晚一口，一炉全废。」
// The furnace's breath runs through its phases (a stop's `phases`, each a span of ms the seed picks
// inside); one of them is the moment (`hit`), and the player speaks up inside it. Too early: the
// medicine is not done yet, and the furnace goes on; too late: the batch is lost and a new one goes in.
// Never a fail; `stuck` after three batches lost. Grade nose · late.
// A stop is data (STOPS): 'smell' is 古七's 丹房 (09-year — 「丹师，这个……是不是就是丹焦的味儿？」);
// 古八's side furnace ('fire', 首尾武中间文) is meant to be added the same way.
// Pure: makeHuohou(stop) → { meta, newGame, act, tick, html, stuck }; huohousmell.js is the stop's module.
import { btn, n, scene, skipped, splash, still } from './ink.js';
import { rng } from './seeded.js';

export const STOPS = {
  smell: {
    phases: [{ id: 'ku', ms: [2200, 3200] }, { id: 'tian', ms: [1600, 2600] }, { id: 'jiao', ms: [850, 850], hit: true }],
    name: { zh: '闻焦 · 半口气', en: 'The scorch · Half a breath' },
    how: { zh: '闻炉里的药气：先是苦，苦里透甜，甜里冒一丝焦。那一丝一冒出来，就说——只有半口气的工夫。', en: 'Smell the medicine in the furnace: first bitter, then bitter going sweet, then out of the sweet a wisp of scorching. The moment that wisp comes, speak — it lasts half a breath.' },
    zh: {
      ready: '闵丹师蹲在炉前，指尖游出一缕火灵力，出了神。他的神识全在火上。', start: '闻着',
      ku: '药气是苦的。', tian: '苦里透甜。', jiao: '甜里冒出一丝焦——', early: '你耸了耸鼻子：还没到。药没熟。', lost: '晚了一口——一炉全废，都成了药引。闵丹师又下了一炉。',
      say: '「丹师，这个……是丹焦的味儿？」', batch: '炉',
      nose: '闵丹师猛地回头，指尖一收，火势立刻退了半分，那一炉药在炉里翻了个身，稳住了。', lateLine: '闵丹师猛地回头，指尖一收，火势退了半分——这一炉，到底稳住了。',
      skipped: '炉里的药气变了。闵丹师猛地回头，指尖一收，火势退了半分。',
    },
    en: {
      ready: 'Pill-master Min squats at the furnace, a wisp of fire-type power at his fingertip, lost in thought. His spirit sense is all on the fire.', start: 'Smell it',
      ku: 'The medicine smells bitter.', tian: 'Bitter going sweet.', jiao: 'Out of the sweet, a wisp of scorching —', early: 'You twitch your nose: not yet. The medicine isn\'t done.', lost: 'A breath late — the whole furnace is wasted, nothing but medicine starter. Pill-master Min puts in another batch.',
      say: '"Pill-master, is this... the smell of a pill scorching?"', batch: 'Batch',
      nose: 'Pill-master Min whips round, draws his fingertip back, and the fire drops by half at once. The furnace of medicine turns over inside and settles.', lateLine: 'Pill-master Min whips round and draws his fingertip back; the fire drops by half — this batch, in the end, settles.',
      skipped: 'The smell in the furnace changed. Pill-master Min whipped round and drew the fire back by half.',
    },
  },
};

export function makeHuohou(stop) {
  const S = STOPS[stop];
  const meta = { id: `huohou${stop}`, name: S.name, how: S.how };
  /* A batch's phases: each span picked inside its range by the seed and the batch's number. */
  const spans = (seed, b) => { const r = rng(`${seed}|${b}`); return S.phases.map((p) => Math.round(p.ms[0] + r() * (p.ms[1] - p.ms[0]))); };
  const newGame = (seed) => ({ seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, b: 0, early: 0, lost: 0, fx: null, note: 'ready', won: false, grade: null });
  /* Where the batch stands: the phase index, or phases.length once it is past saving. */
  const where = (s) => { let left = s.t - s.at; const sp = spans(s.seed, s.b); for (let i = 0; i < sp.length; i += 1) { if (left < sp[i]) return i; left -= sp[i]; } return sp.length; };
  const verbs = {
    start: (s) => (s.phase === 'ready' ? { ...s, phase: 'watch', live: true, at: s.t, note: S.phases[0].id } : null),
    say: (s) => {
      if (s.phase !== 'watch') return null;
      const i = where(s);
      if (!S.phases[i]?.hit) return { ...s, early: s.early + 1, note: 'early' };
      const grade = s.early === 0 && s.lost === 0 ? 'nose' : 'late';
      return { ...s, live: false, won: true, grade, note: grade, fx: { at: s.t } };
    },
    skip: (s) => skipped(s),
  };
  const act = (state, data = {}) => {
    if (!state || state.won) return { state, won: false };
    const next = verbs[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  };
  function tick(state, ms) {
    if (!state.live || state.won || ms <= 0) return state;
    const s = { ...state, t: state.t + ms }, i = where(s);
    if (i >= S.phases.length) return { ...s, at: s.t, b: s.b + 1, lost: s.lost + 1, note: 'lost', fx: { at: s.t } };
    const keep = (s.note === 'early' || s.note === 'lost') && !S.phases[i].hit && s.t - (s.fx?.at ?? s.at) < 1100;
    return { ...s, note: keep ? s.note : S.phases[i].id };
  }

  /* ── The picture: the furnace on its stone, the breath rising off it — pale while bitter, a
     curl while sweet, a thin dark wisp for the scorch. */
  function picture(s) {
    const i = s.phase === 'watch' ? where(s) : -1, hit = S.phases[i]?.hit, sway = still() ? 0 : Math.sin(s.t / 300) * 6;
    const pot = '<path class="g-line" d="M120 70 q0 40 40 40 q40 0 40 -40 Z"/><path class="g-line" d="M114 66 h92"/><path class="g-line g-thin g-faint" d="M100 118 h120"/>';
    const breath = i >= 0 ? `<path class="g-mist" d="M150 62 q${n(-10 + sway)} -20 0 -36 q${n(10 - sway)} -14 ${n(4 + sway)} -26" opacity="${i === 0 ? 0.35 : 0.6}"/>` : '';
    const wisp = hit ? `<path class="g-line g-thin" d="M168 60 q${n(8 + sway)} -16 ${n(2 - sway)} -34"/>` : '';
    const fx = s.fx ? splash(170, 40, s.t - s.fx.at, { r: 9, seal: s.won }) : '';
    return scene(320, 124, pot + breath + wisp + fx);
  }

  function html(state, lang = 'zh') {
    const t = S[lang] || S.zh;
    if (state.won) return `<div class="g-huohou g-ink is-won">${picture(state)}<p class="g-line-say">${state.grade ? `${t.say} ${t[state.grade === 'late' ? 'lateLine' : state.grade]}` : t.skipped}</p></div>`;
    if (state.phase === 'ready') return `<div class="g-huohou g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
    const head = `<div class="g-head"><span>${t.batch} <b>${state.b + 1}</b></span></div>`;
    return `<div class="g-huohou g-ink">${picture(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p>${btn(t.say, 'data-g="say"')}</div>`;
  }

  const stuck = (s) => s.lost >= 3;
  return { meta, newGame, act, tick, html, stuck };
}
