// 攀 · 右手抓一根荆条 — 古二, out of the valley (00-cliff; batch two, 2026-10-14). The book: a
// crack runs slantwise from the cliff's foot to its waist, thorn bushes growing in it; his left
// wrist is swollen, so it is the right hand alone — grab a branch, haul himself up half a foot,
// let go, grab the next — and every time he lets go the ball of fur on his shoulder tightens its
// claws. Halfway, a jutting stone just wide enough for half a backside. Here each reach has two
// branches, one on either side of the crack: a living one, in leaf, holds; a dead one, bare and
// grey, snaps and drops him back a reach. The grip drains while he hangs; the ledge gives it back.
// At the top 爹's hand reaches down. A grip run out slides him back to the ledge, never further;
// past the limit 老周's rope does the rest. Grade steady · scraped, written as a mark.
// Pure module: newGame / html / act / tick (live while he climbs; live-games.js).
import { rng } from './seeded.js';
import { SKIP, btn, n, scene, skipBtn, skipped, splash } from './ink.js';

export const meta = {
  id: 'climb',
  name: { zh: '攀 · 右手抓一根荆条', en: 'The climb · One branch at a time, right hand only' },
  how: {
    zh: '左手腕肿着，只能拿右手抓荆条。抓带叶子的活枝；光秃秃发灰的是枯的，一抓就断。手上没劲了，到那块凸石上歇一歇。',
    en: 'Your left wrist is swollen — right hand only. Grab the living branches, the ones in leaf; the bare grey ones are dead and snap. When your grip goes, rest on the jutting stone.',
  },
};

export const RUNGS = 8; //       reaches from the foot to the waist
export const LEDGE = 4; //       the jutting stone
export const DRAIN = 0.075; //   grip lost a second while hanging
export const SNAP = 0.15; //     a dead branch costs this much grip too
export const LIMIT = 40000; //   ms: then 老周's rope

const T = {
  zh: {
    ready: '出了那道石缝，顺着崖根找着一道斜斜的石缝，缝里长着几丛野荆。上头，就是昨儿爹膝盖罢工的那道坡。', start: '往上爬',
    left: '抓左边那根', right: '抓右边那根', rest: '坐上去喘口气', hand: '抓住爹的手', grip: '手劲', up: '高',
    climb: '右手抓一根，把身子送上去半尺，松开，再抓上面一根。', held: '活枝，抓牢了。肩上那团毛把爪子收紧了一分。',
    snapped: '「咔」——是根枯的。你往下一滑，手掌又磨掉一层皮。', slid: '手上没劲了——你一路滑回那块凸石上。',
    ledge: '凸出来的一块石头，刚好容得下半个屁股。', rested: '喘匀了气，手上又有了劲。', top: '头顶上，一只手五根指头张着，往下伸着——是爹的手。',
    steady: '你伸出右手，抓住了它。这一回，它抓住了。', scraped: '手掌磨烂了，指甲缝里全是泥——可你伸出右手，抓住了它。',
    rope: '上头的人一齐发一声喊，老周把绳子放了下来，爷儿俩给一寸一寸地拽了上去。', skipped: '你一口气往上爬，抓住了爹伸下来的手。',
  },
  en: {
    ready: 'Out of the gap, you follow the cliff foot to a crack that runs slantwise up the rock, thorn bushes growing in it. Above is the slope where Father\'s knee gave out yesterday.', start: 'Start climbing',
    left: 'Grab the left one', right: 'Grab the right one', rest: 'Sit and get your breath', hand: 'Take Father\'s hand', grip: 'Grip', up: 'Height',
    climb: 'Right hand on a branch, haul up half a foot, let go, grab the next.', held: 'A living branch — it holds. The fur on your shoulder tightens its claws.',
    snapped: 'Crack — a dead one. You slide back down, and lose another layer of skin off your palm.', slid: 'Your grip is gone — you slither all the way back to the jutting stone.',
    ledge: 'A stone jutting out, just wide enough for half a backside.', rested: 'Your breath comes back, and the strength into your hand.', top: 'Above you a hand reaches down, five fingers spread — Father\'s hand.',
    steady: 'You reach up with your right hand and take it. This time, it holds.', scraped: 'Your palm is torn, your nails full of mud — but you reach up with your right hand and take it.',
    rope: 'The men above give a shout together; Old Zhou lets the rope down, and father and son are hauled up inch by inch.', skipped: 'You climb without stopping, and take the hand Father reaches down.',
  },
};

export function newGame(seed) {
  const rnd = rng(`climb:${seed}`);
  return { seed: String(seed), live: false, phase: 'ready', t: 0, rung: 0, grip: 1, live_side: Array.from({ length: RUNGS }, () => (rnd() < 0.5 ? 'left' : 'right')), snaps: 0, slips: 0, fx: null, note: 'ready', won: false, grade: null };
}

const finish = (s, note) => ({ ...s, live: false, won: true, grade: note === 'rope' || s.snaps + s.slips > 1 ? 'scraped' : 'steady', note });
const atTop = (s) => s.rung >= RUNGS;
const onLedge = (s) => s.rung === LEDGE;

const VERBS = {
  start: (s) => (s.phase !== 'ready' ? null : { ...s, phase: 'climb', live: true, note: 'climb' }),
  grab: (s, d) => {
    if (s.phase !== 'climb' || atTop(s) || !['left', 'right'].includes(d.side)) return null;
    if (d.side === s.live_side[s.rung]) {
      const up = { ...s, rung: s.rung + 1, fx: { at: s.t, ok: true }, note: 'held' };
      return atTop(up) ? { ...up, note: 'top' } : onLedge(up) ? { ...up, note: 'ledge' } : up;
    }
    return { ...s, rung: Math.max(onLedge(s) ? LEDGE : 0, s.rung - 1), grip: Math.max(0, s.grip - SNAP), snaps: s.snaps + 1, fx: { at: s.t, ok: false }, note: 'snapped' };
  },
  rest: (s) => (s.phase === 'climb' && onLedge(s) ? { ...s, grip: 1, note: 'rested' } : null),
  hand: (s) => (s.phase === 'climb' && atTop(s) ? finish(s, s.snaps + s.slips > 1 ? 'scraped' : 'steady') : null),
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'climb' || ms <= 0) return state;
  const s = { ...state, t: state.t + ms };
  if (s.t >= LIMIT) return finish(s, 'rope');
  if (onLedge(s) || atTop(s)) return s;
  s.grip = Math.max(0, s.grip - (DRAIN * ms) / 1000);
  if (s.grip > 0) return s;
  return { ...s, rung: s.rung > LEDGE ? LEDGE : 0, grip: 0.6, slips: s.slips + 1, fx: { at: s.t, ok: false }, note: 'slid' };
}

/* ── The picture: the crack in the cliff, slantwise, the thorn branches in it — in leaf or bare —
   the jutting stone halfway, the boy at the reach he is on, and at the top 爹's hand. */
const Y0 = 150, STEP = 15;
const yOf = (r) => Y0 - 10 - r * STEP;
const xOf = (r) => 140 + r * 6;
function branch(r, side, alive) {
  const x = xOf(r), y = yOf(r), dx = side === 'left' ? -1 : 1;
  const stem = `<path class="g-line g-thin${alive ? '' : ' g-faint'}" d="M${x} ${y} q${dx * 10} -4 ${dx * 22} -2"/>`;
  const leaves = alive ? [8, 15, 21].map((k) => `<ellipse class="g-leaf" cx="${x + dx * k}" cy="${y - 4}" rx="3" ry="1.6"/>`).join('') : `<path class="g-line g-thin g-faint" d="M${x + dx * 16} ${y - 6} l${dx * 4} 4 m0 -4 l${-dx * 4} 4"/>`;
  return stem + leaves;
}
function climbScene(state) {
  const crack = `<path class="g-rock" d="M0 0 H320 V${Y0} H0Z"/><path class="g-line" d="M${xOf(0)} ${Y0} L${xOf(RUNGS)} ${yOf(RUNGS) - 6}"/>`;
  const ledge = `<path class="g-rockblock" d="M${xOf(LEDGE) + 2} ${yOf(LEDGE) + 4} h28 q4 4 -2 6 h-26z"/>`;
  const branches = Array.from({ length: RUNGS }, (_, r) => branch(r, 'left', state.live_side[r] === 'left') + branch(r, 'right', state.live_side[r] === 'right')).join('');
  const r = Math.min(state.rung, RUNGS), bx = xOf(r) + 8, by = yOf(r) + 12;
  const boy = `<circle class="g-line" cx="${bx}" cy="${by - 14}" r="4" fill="none"/><path class="g-line" d="M${bx} ${by - 10} v10 l-4 8 M${bx} ${by} l4 8 M${bx} ${by - 8} l-6 ${-8}"/><ellipse class="g-fox" cx="${bx + 4}" cy="${by - 12}" rx="3.5" ry="2"/>`;
  const hand = `<path class="g-line" d="M${xOf(RUNGS) + 6} 0 V${n(yOf(RUNGS) - 12)} M${xOf(RUNGS) + 2} ${n(yOf(RUNGS) - 10)} l4 -4 l4 4"/>`;
  const fx = state.fx ? splash(bx, by - 18, state.t - state.fx.at, { r: 7, seal: state.fx.ok }) : '';
  const done = state.won && state.grade === 'steady' ? splash(xOf(RUNGS) + 6, yOf(RUNGS) - 8, 300, { r: 10, seal: true }) : '';
  return scene(320, Y0, crack + ledge + branches + hand + boy + fx + done);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = `<div class="g-head"><span>${t.up} <b>${Math.min(state.rung, RUNGS)}</b> / ${RUNGS}</span></div>`;
  if (state.won) return `<div class="g-climb g-ink is-won">${climbScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-climb g-ink">${climbScene(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
  const meter = `<div class="g-meter"><span>${t.grip}</span><span class="g-bar${state.grip < 0.3 ? ' is-seal' : ''}"><i style="width:${Math.round(state.grip * 100)}%"></i></span></div>`;
  const acts = atTop(state) ? btn(t.hand, 'data-g="hand"')
    : `<div class="g-pair">${btn(t.left, 'data-g="grab" data-side="left"', 'soft')}${btn(t.right, 'data-g="grab" data-side="right"', 'soft')}</div>${onLedge(state) ? btn(t.rest, 'data-g="rest"', 'quiet') : ''}`;
  return `<div class="g-climb g-ink">${climbScene(state)}${head}${meter}<p class="g-line-say">${t[state.note] ?? ''}</p>${acts}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
}
