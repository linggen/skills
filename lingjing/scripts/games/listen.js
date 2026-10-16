// 听 · 鸟忽然全停了 — 古一, 黑松岭 before the storm (00-storm; batch two, 2026-10-14). The book:
// it is 小满 who notices first — the birds, which had been calling a moment ago, all stop at
// once, as if someone had clapped a hand over the mountain's mouth; then 先看风: the treetops
// do not stir, but the cloud on the ridge is pressing down like an upturned iron pot. Here the
// birds call from the pines; when the forest goes quiet, say so — 「不对」 — and then read the
// sky: of the treetops, the hoofprints and the cloud on the ridge, which is the sign? Saying it
// while the birds still call is a false alarm and nothing more; saying nothing, 爹 sees it too.
// Grade sharp · late, written as a mark; both of the scene's ways on stay his.
// Pure module: newGame / html / act / tick (live while he listens; live-games.js).
import { rng } from './seeded.js';
import { btn, n, scene, skipped, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './listen.js';

export const meta = {
  id: 'listen',
  name: { zh: '听 · 鸟忽然全停了', en: 'Listening · The birds stop all at once' },
  how: {
    zh: '听着林子里的鸟叫。一静下来，就喊「不对」；再看天——哪一样是要变天的样子？',
    en: 'Listen to the birds in the pines. The moment it goes quiet, say "Something\'s wrong" — then look: which sign says the weather is turning?',
  },
};

export const BIRDS = 5;
export const QUIET_AFTER = [4500, 7500]; // ms of birdsong before the forest goes quiet (seeded)
export const SHARP_MS = 2500; //          noticed within this, sharp
export const FATHER_MS = 7000; //         unnoticed this long, 爹 sees it himself
const SIGNS = ['tops', 'prints', 'cloud'];

const T = {
  zh: {
    ready: '黑松岭里，蹄印还是新的，鹿就在前头。林子里有几声鸟叫。', start: '竖起耳朵听',
    listening: '啾……啾啾……鸟还在叫。', early: '「不对？」爹侧耳听了听：「鸟还叫着呢。」', wrong: '不对',
    quiet: '……', noticed: '鸟不叫了——像有人一把捂住了整座山的嘴。先看风：', father: '爹也觉出来了，抬头看天。',
    tops: '树梢', prints: '蹄印', cloud: '山梁上的云',
    topsSay: '树梢一动不动——还没起风。再看。', printsSay: '蹄印还是新的——那是鹿，不是天。再看。',
    sharp: '山梁上的云正往下压，又低又黑，像一口倒扣过来的大铁锅。你一把拉住爹：「爹，第三条规矩。」',
    late: '天边那道山梁上的云已经压下来了。爹也看见了。',
    skipped: '风里飘过来一股铁锈味。爹也看见了。',
  },
  en: {
    ready: 'In Black Pine Ridge the hoofprints are still fresh — the deer is just ahead. A few birds call in the trees.', start: 'Listen',
    listening: 'Chirp… chirp-chirp… the birds are still calling.', early: '"Something\'s wrong?" Father listens. "The birds are still singing."', wrong: 'Something\'s wrong',
    quiet: '…', noticed: 'The birds have stopped — as if someone had clapped a hand over the whole mountain\'s mouth. Wind first:', father: 'Father feels it too, and looks up at the sky.',
    tops: 'The treetops', prints: 'The hoofprints', cloud: 'The cloud on the ridge',
    topsSay: 'The treetops do not stir — no wind yet. Look again.', printsSay: 'The prints are still fresh — that is the deer, not the sky. Look again.',
    sharp: 'The cloud on the ridge is pressing down, low and black, like a great iron pot turned upside down. You grab Father: "Pa — the third rule."',
    late: 'The cloud on the ridge is already pressing down. Father has seen it too.',
    skipped: 'A smell like rust drifts in on the wind. Father has seen it too.',
  },
};

export function newGame(seed) {
  const rnd = rng(`listen:${seed}`);
  const quietAt = Math.round(QUIET_AFTER[0] + rnd() * (QUIET_AFTER[1] - QUIET_AFTER[0]));
  const calls = Array.from({ length: 18 }, () => ({ bird: Math.floor(rnd() * BIRDS), at: Math.round(rnd() * quietAt) })).sort((a, b) => a.at - b.at);
  return { seed: String(seed), quietAt, calls, phase: 'ready', live: false, t: 0, alarms: 0, heard: null, looked: [], fx: null, note: 'ready', won: false, grade: null };
}

const quiet = (s) => s.t >= s.quietAt;
const end = (s, grade) => ({ ...s, live: false, won: true, grade, note: grade });

const VERBS = {
  start: (s) => (s.phase !== 'ready' ? null : { ...s, phase: 'listen', live: true, note: 'listening' }),
  wrong: (s) => {
    if (s.phase !== 'listen') return null;
    if (!quiet(s)) return { ...s, alarms: s.alarms + 1, fx: { at: s.t, ok: false }, note: 'early' };
    return { ...s, phase: 'sky', heard: s.t - s.quietAt, fx: { at: s.t, ok: true }, note: 'noticed' };
  },
  sign: (s, d) => {
    if (s.phase !== 'sky' || !SIGNS.includes(d.id) || s.looked.includes(d.id)) return null;
    if (d.id !== 'cloud') return { ...s, looked: [...s.looked, d.id], note: `${d.id}Say` };
    const sharp = s.heard <= SHARP_MS && s.alarms <= 1 && s.looked.length === 0;
    return end({ ...s, fx: { at: s.t, ok: true } }, sharp ? 'sharp' : 'late');
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
  if (s.phase === 'listen' && quiet(s) && s.t - s.quietAt > FATHER_MS) return { ...s, phase: 'sky', heard: FATHER_MS, note: 'father' };
  return s;
}

/* ── The picture: pines in ink, a bird on a branch of each; a bird calling throws out a small
   ring of sound. When the forest goes quiet the rings stop; the cloud on the ridge comes
   down over the far hill as the time runs, faster once the birds are silent. */
const PINES = [[40, 118, 70], [96, 120, 88], [160, 118, 64], [222, 120, 84], [280, 118, 72]];
function listenScene(state) {
  const t = state.t, q = quiet(state) || state.phase === 'sky' || state.won;
  const low = q ? Math.min(1, (t - state.quietAt) / 6000 + 0.3) : Math.min(0.3, t / 20000);
  const ridge = '<path class="g-line g-faint" d="M0 58 Q60 40 120 52 T240 46 T320 54"/>';
  const cloud = `<path class="g-cloud" d="M0 ${n(10 + low * 30)} Q60 ${n(-4 + low * 30)} 120 ${n(12 + low * 32)} T240 ${n(8 + low * 32)} T320 ${n(14 + low * 30)} V0 H0Z" opacity="${n(0.12 + low * 0.35, 2)}"/>`;
  const pines = PINES.map(([x, base, h]) => `<path class="g-pine" d="M${x} ${base - h} L${x - h * 0.28} ${base} H${x + h * 0.28}Z"/><path class="g-line g-thin" d="M${x} ${base} v6"/>`).join('');
  const birds = PINES.map(([x, base, h], i) => {
    const bx = x + 10, by = base - h * 0.55;
    const calling = !q && state.phase !== 'ready' && state.calls.some((c) => c.bird === i && t - c.at >= 0 && t - c.at < 600);
    const ring = calling ? `<path class="g-line g-thin" d="M${bx + 6} ${by - 6} q4 -3 8 0 M${bx + 8} ${by - 10} q5 -4 10 0" opacity="${n(1 - (t % 600) / 600, 2)}"/>` : '';
    return `<path class="g-line g-thin" d="M${bx - 4} ${by} q4 -4 8 0"/>${ring}`;
  }).join('');
  const fx = state.fx ? splash(state.fx.ok ? 160 : 290, state.fx.ok ? 30 : 108, state.t - state.fx.at, { r: 8, seal: state.fx.ok }) : '';
  return scene(320, 130, cloud + ridge + pines + birds + fx);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-listen g-ink is-won">${listenScene(state)}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-listen g-ink">${listenScene(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  if (state.phase === 'sky') {
    const tiles = SIGNS.map((id) => `<button type="button" class="g-tag${state.looked.includes(id) ? ' is-tried' : ''}" data-g="sign" data-id="${id}"${state.looked.includes(id) ? ' disabled' : ''}>${t[id]}</button>`).join('');
    return `<div class="g-listen g-ink">${listenScene(state)}<p class="g-line-say">${t[state.note] ?? ''}</p><div class="g-tags">${tiles}</div></div>`;
  }
  const line = quiet(state) ? t.quiet : state.note === 'early' ? t.early : t.listening;
  return `<div class="g-listen g-ink">${listenScene(state)}<p class="g-line-say">${line}</p>${btn(t.wrong, 'data-g="wrong"')}</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
