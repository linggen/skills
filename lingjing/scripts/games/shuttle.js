// 嘀声 · 二十米往返跑 — 今二's beep test (j04-trial; Hanli 2026-10-27: 「这个小游戏连着出现, 换一个」 — it was 气走经脉,
// right after 卧推's). A 节奏 board, the classic beep test: the runner goes on his own between two lines twenty
// metres apart; each beep, tap 转身 as he reaches the line. Too early (before the window) or no tap by the end of
// it is a miss, and a miss costs one of three. The beeps quicken level by level (STAGES), as the real test's do.
// Three misses: 出局 — that level again from its first beep, all three back. Never a dead end: stuck (two outs)
// lets the page offer its skip. The beat is drawn as well as heard (muted it plays the same): a ring closes on the
// line he runs to, and the line flashes on the beep.
// A level is data (games.json, the rows with id `shuttle`; Hanli 10-27: 「最好小游戏关卡不重复…游戏类型不变」): its `stages`,
// its `move` (run: across the court between two lines · squat: down and up under the bar, a beat each way), its `art`
// (a picture under worlds/jiuding/art/) and its `lines` (a {zh, en} of the words below, any left out are 嘀声's).
// 嘀声 (`didi`) is the built-in level; a story task deals another by its row's `levels`.
// Pure: meta · newGame · act · tick · html · stuck · sounds (live-games.js, mount.js).
import { btn, n, scene, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './shuttle.js';

const ART = (path) => new URL(`../../worlds/jiuding/art/${path}`, import.meta.url).href;

/* The test, level by level: `gap` ms between beeps, `n` lengths, `win` ms either side of the beep a turn counts. */
export const STAGES = [
  { gap: 1500, n: 5, win: 300 },
  { gap: 1250, n: 6, win: 250 },
  { gap: 1060, n: 6, win: 220 },
  { gap: 920, n: 7, win: 190 },
  { gap: 800, n: 8, win: 170 },
];
export const LIVES = 3;
export const AGAIN_MS = 1800; // after 出局: the level starts again this long after
export const DOUBLE_MS = 220; //  a second tap this soon after a good turn is the same turn, not an early one
const LINES = [44, 276]; //       the two lines' x on the 320-wide court

export const meta = {
  id: 'shuttle',
  name: { zh: '嘀声 · 二十米往返跑', en: 'The beeps · The twenty-metre shuttle' },
  how: { zh: '嘀声一响，脚正好踩线：点转身。早了晚了都丢一条，一级比一级急。', en: 'Turn on each beep, foot on the line. Early or late costs one of three; each level is faster.' },
  sounds: ['start', 'beat', 'turn', 'miss', 'level', 'out'],
  keys: { ' ': { g: 'turn' }, Enter: { g: 'turn' } },
};

export const T = {
  zh: {
    ready: '体育馆一楼，二十三个人站成一排。录音机「嘀」了一声。', start: '开跑', turn: '转身',
    go: '嘀声一到，脚正好踩线——转身。', good: '踩线，转身。', early: '转早了——脚还没够着线。', late: '嘀声响过去，脚还没够着线。',
    level: (k) => `第 ${k} 级——嘀声更急了。`, out: '三回没够着线。场边马小宝喊：「不行就下来！」——这一级，再来。',
    clean: '嘀声越来越急，一个一个的人退了下去，他还在跑。吐，吸，吐。', ok: '他撑到了最后一级。二十三个人里，第十四。',
    skipped: '他跑到嘀声响过去、脚还没够着线，才停。', lv: '级', laps: '来回', lives: '还剩',
  },
  en: {
    ready: 'Ground floor of the gym, twenty-three in a line. The tape player goes *beep*.', start: 'Run', turn: 'Turn',
    go: 'Foot on the line as the beep comes — turn.', good: 'On the line. Turn.', early: 'Too soon — his foot never reached the line.', late: 'The beep went by before his foot reached the line.',
    level: (k) => `Level ${k}: the beeps come faster.`, out: 'Three times short of the line. Ma Xiaobao, from the side: "Can\'t do it, come off!" This level again.',
    clean: 'The beeps come faster, people drop out one by one, and he\'s still running. Out, in, out.', ok: 'He lasted to the last level. Fourteenth of twenty-three.',
    skipped: 'He ran until a beep went by before his foot reached the line, and stopped.', lv: 'Level', laps: 'Lengths', lives: 'Left',
  },
};

/* 嘀声, the built-in level; a data level is laid over it field by field (its lines line by line). */
export const DIDI = { id: 'didi', stages: STAGES, move: 'run', art: 'places/jin-court.webp', lines: T };
const filled = new WeakMap();
export function fill(raw) {
  if (!raw || raw === DIDI || typeof raw !== 'object') return DIDI;
  if (!filled.has(raw)) filled.set(raw, { ...DIDI, ...raw, stages: raw.stages?.length ? raw.stages : STAGES, lines: Object.fromEntries(['zh', 'en'].map((k) => [k, { ...T[k], ...(raw.lines?.[k] ?? {}) }])) });
  return filled.get(raw);
}
export const levelOf = (s) => fill(s?.level);

export function newGame(seed, _level = 1, deal = {}) {
  const raw = deal?.levels?.[0] ?? null;
  return { seed: String(seed), ...(raw ? { level: raw } : {}), phase: 'ready', live: false, won: false, grade: null, stars: 0, t: 0, si: 0, bi: 0, from: 0, next: 0, mark: null, rung: -1, beeps: 0, side: 1, lives: LIVES, lost: 0, misses: 0, outs: 0, laps: 0, hitAt: -1e9, note: 'ready', fx: null };
}

const stage = (s) => levelOf(s).stages[s.si];

/* A life gone: the note says why; at none, 出局 — the level from its first beep, three again. */
function lose(s, why) {
  const lives = s.lives - 1, out = { ...s, lost: s.lost + 1, misses: s.misses + 1, fx: { at: s.t, ok: false } };
  if (lives > 0) return { ...out, lives, note: why };
  return { ...out, lives: LIVES, outs: s.outs + 1, bi: 0, from: s.t, next: s.t + AGAIN_MS, mark: null, note: 'out' };
}

/* The beep `next` is done with (turned on, or gone by): on to the next length, the next level, or the end. */
function advance(s) {
  let o = { ...s, laps: s.laps + 1, side: 1 - s.side, from: s.next, mark: null, bi: s.bi + 1 };
  if (o.bi >= stage(o).n) {
    if (o.si + 1 >= levelOf(o).stages.length) {
      const stars = o.lost === 0 ? 3 : o.outs === 0 ? 2 : 1;
      return { ...o, live: false, won: true, grade: o.lost === 0 ? 'clean' : 'ok', stars, note: o.lost === 0 ? 'clean' : 'ok' };
    }
    o = { ...o, si: o.si + 1, bi: 0, note: 'level' };
  }
  return { ...o, next: o.from + stage(o).gap };
}

function turn(s) {
  if (s.phase !== 'run' || s.mark) return null; // this beep already judged: the tap is the same turn
  const w = stage(s).win;
  if (s.t >= s.next - w) return { ...s, mark: 'hit', hitAt: s.t, note: 'good', fx: { at: s.t, ok: true } };
  if (s.t - s.hitAt < DOUBLE_MS) return null;
  return { ...lose(s, 'early'), mark: s.lives > 1 ? 'miss' : null };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'run', live: true, from: s.t, next: s.t + levelOf(s).stages[0].gap, note: 'go' } : null),
  turn,
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || ms <= 0) return state;
  let s = { ...state, t: state.t + ms };
  for (let guard = 0; guard < 8 && s.live && !s.won; guard += 1) {
    if (s.t >= s.next && s.rung !== s.next) s = { ...s, rung: s.next, beeps: s.beeps + 1 };
    if (s.mark && s.t >= s.next) { s = advance(s); continue; }
    if (!s.mark && s.t > s.next + stage(s).win) {
      const was = s.outs;
      s = lose(s, 'late');
      if (s.outs === was) s = advance(s);
      continue;
    }
    break;
  }
  return s;
}

/** Out twice: the page may offer its 「算了，往下走」 (stuck.js). */
export const stuck = (s) => (s.outs ?? 0) >= 2;

/** What a step sounded (games/kit/heard.js): the run begun, a beep, a turn on the line, a miss, a new level, 出局. */
export function sounds(b, a) {
  if (!b || !a) return [];
  const out = [];
  if (!b.live && a.live && !a.won) out.push('start');
  if (a.beeps > b.beeps) out.push('beat');
  if (a.mark === 'hit' && b.mark !== 'hit') out.push('turn');
  if (a.outs > b.outs) out.push('out');
  else if (a.misses > b.misses) out.push('miss');
  if (a.si > b.si) out.push('level');
  return out;
}

/* ── The picture: the level's place (jin-court for 嘀声), and either the runner between two lines twenty metres apart
   (run) or the lifter under the bar between standing and down (squat); a ring closing on the mark he moves to (the beat,
   seen), the mark lit on the beep. ── */
const W = 320, H = 130, FLOOR = 104;
const progress = (s) => (s.phase === 'run' ? Math.min(1, Math.max(0, (s.t - s.from) / Math.max(1, s.next - s.from))) : 0);
const ringOf = (s, cx, cy) => {
  const left = s.next - s.t;
  return s.phase === 'run' && !s.won && left > -stage(s).win ? `<circle class="g-shuttle-ring${s.mark === 'hit' ? ' is-hit' : ''}" cx="${n(cx)}" cy="${n(cy)}" r="${n(7 + Math.min(34, Math.max(0, left) / 30))}"/>` : '';
};
const lit = (s) => s.rung >= 0 && s.t - s.rung < 220;
const MOVES = {
  run(s) {
    const k = progress(s), x0 = LINES[1 - s.side], x1 = LINES[s.side], x = s.won ? x1 : x0 + (x1 - x0) * k, dir = x1 > x0 ? 1 : -1;
    const lines = LINES.map((lx, i) => `<rect class="g-shuttle-line${lit(s) && i === 1 - s.side ? ' is-lit' : ''}" x="${lx - 2}" y="${FLOOR - 30}" width="4" height="40" rx="1"/>`).join('');
    const stride = Math.sin((s.t / 90) * Math.PI) * 5 * (s.phase === 'run' ? 1 : 0);
    const body = `<g class="g-shuttle-runner" transform="translate(${n(x)} ${FLOOR}) scale(${dir} 1)">`
      + `<circle cx="1" cy="-34" r="5"/><path d="M0 -29 L-2 -14 M-2 -14 L${n(4 + stride)} 0 M-2 -14 L${n(-4 - stride)} 0 M0 -25 L${n(6 - stride / 2)} -18 M0 -25 L${n(-5 + stride / 2)} -17"/></g>`;
    const fx = s.fx ? splash(LINES[s.fx.ok ? 1 - s.side : s.side], FLOOR - 12, s.t - s.fx.at, { r: 9, seal: !s.fx.ok }) : '';
    return lines + ringOf(s, x1, FLOOR - 10) + body + fx;
  },
  /* side 1: going down (the mark low), side 0: coming up (the mark high); d 0 stood · 1 down. */
  squat(s) {
    const k = progress(s), d = s.won ? 0 : s.side === 1 ? k : 1 - k, cx = 150, hip = -30 + 14 * d, knee = 8 * d;
    const marks = [[0, FLOOR - 48], [1, FLOOR - 34]].map(([side, y]) => `<rect class="g-shuttle-line${lit(s) && side === 1 - s.side ? ' is-lit' : ''}" x="214" y="${y - 2}" width="34" height="4" rx="1"/>`).join('');
    const body = `<g class="g-shuttle-runner" transform="translate(${cx} ${FLOOR})">`
      + `<circle cx="0" cy="${n(hip - 18)}" r="5"/><path d="M0 ${n(hip - 13)} L0 ${n(hip)} M0 ${n(hip)} L${n(knee + 4)} ${n(hip / 2)} L3 0 M0 ${n(hip)} L${n(-knee - 4)} ${n(hip / 2)} L-3 0 M-26 ${n(hip - 12)} L26 ${n(hip - 12)}"/>`
      + `<rect x="-30" y="${n(hip - 17)}" width="5" height="10" rx="1"/><rect x="25" y="${n(hip - 17)}" width="5" height="10" rx="1"/></g>`;
    const target = s.side === 1 ? FLOOR - 34 : FLOOR - 48;
    const fx = s.fx ? splash(231, s.fx.ok ? (s.side === 1 ? FLOOR - 48 : FLOOR - 34) : target, s.t - s.fx.at, { r: 9, seal: !s.fx.ok }) : '';
    return marks + ringOf(s, 231, target) + body + fx;
  },
};
function picture(s) {
  const L = levelOf(s);
  const ground = `<image href="${ART(L.art)}" x="0" y="-80" width="${W}" height="${W * 2 / 3}" preserveAspectRatio="xMidYMid slice" opacity="0.85"/>`;
  return scene(W, H, ground + (MOVES[L.move] ?? MOVES.run)(s), 'g-shuttle-pic');
}

/* A line may be a function of the level number (`level`), a pair by side (the squat's button: 起 · 蹲), or a word. */
const word = (v, s) => (typeof v === 'function' ? v(s.si + 1) : Array.isArray(v) ? v[s.side] : v);
const say = (t, s) => (s.note === 'level' ? (typeof t.level === 'function' ? t.level(s.si + 1) : String(t.level).replace('{k}', s.si + 1)) : word(t[s.note], s) ?? '');

export function html(state, lang = 'zh') {
  const L = levelOf(state), t = L.lines[lang] || L.lines.zh;
  if (state.won) return `<div class="g-shuttle g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped'] ?? t.skipped}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-shuttle g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const dots = Array.from({ length: LIVES }, (_, i) => (i < state.lives ? '●' : '○')).join('');
  const head = `<div class="g-head"><span>${t.lv} <b>${state.si + 1}</b> / ${L.stages.length}</span><span>${t.laps} <b>${state.laps}</b></span><span class="${state.lives === 1 ? 'is-near' : ''}">${t.lives} <b>${dots}</b></span></div>`;
  return `<div class="g-shuttle g-ink">${picture(state)}${head}<p class="g-line-say">${say(t, state)}</p>${btn(word(t.turn, state), 'data-g="turn"', 'main', 'g-shuttle-turn')}</div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export async function mount(container, opts = {}) {
  let level = opts.data?.levels?.[0] ?? null;
  const id = opts.data?.level;
  if (!level && id && id !== DIDI.id) {
    try { level = ladderOf(await (await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url))).json()).find((l) => l.id === id) ?? null; } catch { level = null; }
  }
  return mountPure(self)(container, { ...opts, data: { ...(opts.data ?? {}), ...(level && level !== DIDI ? { levels: [level] } : {}) } });
}
/** Every level the kit knows: 嘀声, then the games.json rows with id `shuttle` (their `levels`). */
export const ladderOf = (registry) => [DIDI, ...(registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => g.levels ?? [])];
