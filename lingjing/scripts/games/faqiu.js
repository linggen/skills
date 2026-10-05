// 罚球 · 吸四吐六 — 今 · 二 (j04-line; Hanli 2026-10-05). 十月三十一日 傍晚, the
// empty gym after the 0/2: 阿禾's two fingers on his wrist — 「吸是踩油门，吐是踩
// 刹车。吐得比吸的长，心就慢一截。」 Hold to breathe in, let go to breathe out;
// a breath of about four in and six out takes a chunk off the heart (141 at the
// line). 出手 at the end of an out-breath with the heart down is in. The other
// way is the coach's, loud — 「深吸一口！憋住！」: the neck swells, the hands
// shake, the ball hits the front of the rim. Three in and he turns to shout.
// Nothing fails for good: a miss is the book's miss, and he shoots again.
// Pure module: newGame / html / act / tick; the hold is [data-g-hold] (live-games.js).
import { bar, beatOf, calm, flow, holdIn, isBrake, isHeld, letOut } from './breath.js';

export const meta = {
  id: 'faqiu',
  name: { zh: '罚球 · 吸四吐六', en: 'Free throws · In for four, out for six' },
  how: {
    zh: '按住吸气，松开吐气：吸四拍，吐六拍，心就慢一截。吐完了再出手。',
    en: 'Hold to breathe in, let go to breathe out: in for four, out for six, and the heart slows. Shoot at the end of the out-breath.',
  },
};

export const NEED = 3; //      baskets
export const START_HR = 141;
export const STEADY = 110; //  the heart at or under this, the hands are steady enough
const FLOOR = 84, BRAKE = 12, DRIFT = 0.25 / 1000, MADE_UP = 6;

const T = {
  zh: {
    ready: '傍晚空球馆。「过来。伸手。」她把他左手两根指头按在他右手腕子上，「别看手环，摸。」',
    in: '吸',
    out: '吐',
    shoot: '出手',
    bieshot: '深吸一口，憋住，投！',
    heart: '心',
    beat: '拍',
    breathing: '慢慢吸，四拍。慢慢吐，六拍。',
    brake: '吐到一半，那跳松了，一下和一下隔得长了。',
    short: '吸得太急，吐得太短——指头底下那一跳一跳，紧了，快了一点。',
    held: '憋住了，脖子都粗了——憋着，刹车是踩不下去的。',
    shake: '他深深吸了一口，憋住，把球投了出去。手在抖。「当」，砸在筐前沿上。',
    fast: '心还在楼上跺地板。球从筐前直直掉下去，连筐都没碰。',
    midin: '吸到一半出了手——球砸在篮板上，弹得老远。',
    made: '进了。',
    won: '进了。又进了。他回头要喊。',
  },
  en: {
    ready: 'The empty gym at dusk. "Come here. Hand out." She pressed two fingers of his left hand to his right wrist. "Don\'t look at the band. Feel it."',
    in: 'In',
    out: 'Out',
    shoot: 'Shoot',
    bieshot: 'Big breath, hold it, shoot!',
    heart: 'Heart',
    beat: 'beat',
    breathing: 'Breathe in slowly, four beats. Breathe out slowly, six.',
    brake: 'Halfway through the breath out, the pulse eased; the beats came further apart.',
    short: 'In too fast, out too short — under his fingers the beat tightened and quickened.',
    held: 'Holding it, his neck swelling — holding your breath, you can\'t get your foot on the brake.',
    shake: 'He drew a deep breath, held it, and let the ball go. His hands shook. Clang — off the front of the rim.',
    fast: 'His heart was still stamping like someone upstairs. The ball dropped straight down in front of the hoop, touching nothing.',
    midin: 'He shot halfway through a breath in — the ball hit the backboard and bounced a mile.',
    made: 'In.',
    won: 'In. In again. He turned to shout.',
  },
};

export function newGame(seed = '') {
  return { seed: String(seed), live: true, t: 0, hr: START_HR, breath: calm(), made: 0, shots: 0, note: 'ready', won: false };
}

function shoot(s, held) {
  const shots = s.shots + 1;
  if (held || isHeld(s.breath)) return { ...s, shots, hr: s.hr + 4, note: 'shake' };
  if (s.breath.phase === 'in') return { ...s, shots, note: 'midin' };
  if (s.hr > STEADY) return { ...s, shots, note: 'fast' };
  const made = s.made + 1;
  if (made >= NEED) return { ...s, shots, made, live: false, won: true, note: 'won' };
  return { ...s, shots, made, hr: s.hr + MADE_UP, note: 'made' };
}

const VERBS = {
  hold: (s) => {
    if (s.breath.phase === 'in') return null;
    const { breath, done } = holdIn(s.breath);
    if (!done) return { ...s, breath, note: 'breathing' };
    const good = isBrake(done);
    return { ...s, breath, hr: good ? Math.max(FLOOR, s.hr - BRAKE) : s.hr + 2, note: good ? 'brake' : 'short' };
  },
  release: (s) => (s.breath.phase === 'in' ? { ...s, breath: letOut(s.breath) } : null),
  shoot: (s) => shoot(s, false),
  bieshot: (s) => shoot(s, true),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won) return state;
  const breath = flow(state.breath, ms);
  // Holding past six beats is 憋: the heart climbs while it lasts.
  const hr = Math.min(160, state.hr + DRIFT * ms * (isHeld(breath) ? 4 : 1));
  return { ...state, t: state.t + ms, breath, hr, note: isHeld(breath) ? 'held' : state.note };
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-jin g-faqiu is-won"><p class="g-jin-line">${t.won}</p></div>`;
  const b = state.breath, phase = b.phase === 'idle' ? '' : `${b.phase === 'in' ? t.in : t.out} ${beatOf(b)} ${t.beat}`;
  const hoops = Array.from({ length: NEED }, (_, i) => `<span class="g-jin-dot${i < state.made ? ' is-on' : ''}"></span>`).join('');
  return `<div class="g-jin g-faqiu">`
    + `<div class="g-jin-dots">${hoops}</div>`
    + `<div class="g-jin-hr${state.hr > STEADY ? ' is-fast' : ''}"><b>${Math.round(state.hr)}</b><span>${t.heart}</span></div>`
    + bar(t.heart, (state.hr - 60) / 100, state.hr > STEADY ? 'is-low' : '')
    + `<div class="g-jin-beat">${phase}</div>`
    + `<p class="g-jin-line">${t[state.note] ?? ''}</p>`
    + `<button type="button" class="g-jin-btn${b.phase === 'in' ? ' is-held' : ''}" data-g-hold="in">${t.in}</button>`
    + `<div class="g-jin-pair"><button type="button" class="g-jin-btn is-small" data-g="shoot">${t.shoot}</button>`
    + `<button type="button" class="g-jin-btn is-small is-trap" data-g="bieshot">${t.bieshot}</button></div></div>`;
}
