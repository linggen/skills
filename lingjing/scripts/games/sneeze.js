// 时机 — the timing kit: a bout played as a short run of steps, each one press at the right moment.
// Never a fail; graded clean · clumsy, written as a mark. Pure module: newGame / html / act / tick
// (live through the bout; live-games.js), and `mount` (games/mount.js) for a board alone in a container.
//
// The level it plays (`newGame(seed, n, deal)`): `deal.levels[0]`, else `deal.level` when it is a level
// object, else the built-in one (LEVEL, below). `mount` reads the same from `opts.data`, and also takes
// `data.level` as an id: the built-in level's, or one in the `levels` of the games.json rows with this
// kit's id (`ladderOf`). A story task deals one in its `deal` ({ levels: [level] }); a games.json row
// names one by `data: { level: '<id>' }` (or carries it in `levels`). A host that deals a level shows
// that level's `how`; `meta.how` is the built-in level's.
//
// A level (every text a { zh, en } pair):
//   id         — its name in data (the built-in one is `dabi`)
//   name, how  — its title and its one-line rule
//   ready, start — the line before it starts, and the start button's label
//   won        — { clean, clumsy, skipped }: the line it ends on, by the grade (skipped: the page's skip)
//   steps      — run in order; the same kind may repeat. Each has `kind`, `verb` (its button's label)
//                and `lines`:
//     tell  — { guard: [ms, …] (cycled, one per swing), tell: ms }: wait out the guard, then press in
//             the tell window. Early counts `early` (the swing goes on); too late counts `hit` and the
//             swing repeats. lines: guard · tell · hit · early · done (said as the next step starts)
//     hold  — { window: [min, max] ms }: a held press whose length lands in the window. Too short
//             is only said; too long counts `over`. lines: hold (said if it is the first step) ·
//             short · over · done
//     count — { k, ah, choo }: k beats, each `ah` ms then `choo` ms, the last one repeating; the
//             press lands in the first part of the k-th beat. Earlier counts `early`.
//             lines: round (the head's label) · ah · choo · beats [one per beat: the line after beat
//             i ends, i < k; the k-th is said through the last beat's first part] · early · again
//             (said when the last beat goes by unpressed) · done
//   art        — { stage, idle, tell, me }: painted image paths under worlds/jiuding/art/games/; the
//                foe stands idle, takes the `tell` pose in a tell's window (idle if it has none), and
//                rocks on its heels through a count. A piece not given is not drawn.
//   place      — optional, the picture's numbers where they differ (PLACE, below; each piece merged):
//                feet · stage { x, y, w, h } · foe { x, off (where it stands once won), h, w } ·
//                pose { dx, h, w } (the tell pose, hung from its right edge) · me { x, h, w } · thread { x, y }
//   grade      — optional { hits, over, early }: the most of each a clean bout has (0 · 0 · 1)
//   stuck      — optional: hits + over at which the page offers its skip (5)
import { btn, n, scene, skipped, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './sneeze.js';

/* The built-in level — 古六, the 大比's first bout (wm-dabi; the per-回 plan, 2026-10-15). 何七 has no
   creatures.json row, so the bout is the book's own reading of it, played: 「一拳当胸打过来…接不住，
   只得往旁边一让；让开的那一霎，他两根指头捏着那张喷嚏符，往里送了一丝灵气…『阿——』又一皱：
   『阿——嚏！』一个喷嚏打得他往后一仰，第二个打得他往前一栽，第三个打到一半，小满在他背上轻轻一推。」
   Step aside when his shoulder drops (too late and the fist lands); a thread of qi into the charm (a
   held press, short — too much scorches the paper's edge); push on the third sneeze, half-way through.
   Painted 2026-10-16 (tools/paint-games.py — the stick men read as another game). */
export const GUARD = [1500, 1100, 1800, 1300]; // ms before each shoulder-drop, in turn
export const TELL = 650; //   the shoulder drops; then the fist lands
export const THREAD = [250, 1100]; // a thread of qi: held this long (ms)
export const AH = 900, CHOO = 450; // one sneeze: 「阿——」 then 「嚏！」
export const LEVEL = {
  id: 'dabi',
  name: { zh: '喷嚏符 · 让一拳', en: 'The sneezing charm · Let the punch go by' },
  how: {
    zh: '看他肩膀：一沉便「让」。按住「送气」一下就松——一丝就够。第三个喷嚏打到一半，「推」。',
    en: 'Watch his shoulder: when it drops, step aside. Press "Feed it" briefly — a thread is enough. Halfway through the third sneeze, push.',
  },
  ready: {
    zh: '何七是进门三年的老弟子，三层，上了台，冲你一抱拳。你昨夜叫饭桶吸了四口，丹田里只剩个底，腿还是软的。',
    en: 'He Qi has been in the sect three years, third layer. He comes up on the stage and salutes you, fist in palm. Last night the Rice Bucket drew four mouthfuls from you; your dantian has only its dregs, and your legs are still weak.',
  },
  start: { zh: '抱拳', en: 'Salute' },
  won: {
    clean: { zh: '何七一面「嚏！嚏！」，一面自己下了台。执事愣了一下，才道：「沈小满，胜。」', en: 'He Qi, going *choo! choo!*, walks off the stage by himself. The steward gapes a moment, then: "Shen Xiaoman wins."' },
    clumsy: { zh: '何七打着喷嚏，自己下了台，落了地还在打。执事愣了一下：「沈小满，胜。」', en: 'He Qi walks off the stage sneezing, and is still sneezing on the ground. The steward gapes: "Shen Xiaoman wins."' },
    skipped: { zh: '何七打着喷嚏，自己下了台。「沈小满，胜。」', en: 'He Qi walks off the stage sneezing. "Shen Xiaoman wins."' },
  },
  steps: [
    {
      kind: 'tell', guard: GUARD, tell: TELL, verb: { zh: '让', en: 'Step aside' },
      lines: {
        guard: { zh: '他盯着你，拳头收在腰上。', en: 'He watches you, fist drawn back at his hip.' },
        tell: { zh: '他肩膀一沉——', en: 'His shoulder drops —' },
        hit: { zh: '一拳当胸打过来，接不住，你退了三步。他又摆开了架势。', en: 'A punch to the chest — you can\'t take it, and you stagger three steps back. He squares up again.' },
        early: { zh: '他肩膀还没动。你一闪，倒闪了个空。', en: 'His shoulder hasn\'t moved. You dodge at nothing.' },
        done: { zh: '你往旁边一让。让开的那一霎，两根指头捏着那张喷嚏符——往里送一丝灵气。', en: 'You step aside. In that instant, two fingers pinch the sneezing charm — feed it a thread of qi.' },
      },
    },
    {
      kind: 'hold', window: THREAD, verb: { zh: '送气', en: 'Feed it' },
      lines: {
        short: { zh: '指头一碰就松了，符纸没动静。', en: 'A touch and you let go; the paper does nothing.' },
        over: { zh: '送多了，符纸边上一焦，冒了一缕青烟。再来，一丝就够。', en: 'Too much — the paper\'s edge scorches and a wisp of smoke rises. Again: a thread is enough.' },
        done: { zh: '符上那只朱砂鼻子一皱——「嗤」地冒出一缕黑烟，细得像一根线，笔直地钻进了何七的鼻孔和嘴里。', en: 'The cinnabar nose on the charm wrinkles — *hiss* — a thread of black smoke, fine as a hair, shoots straight up He Qi\'s nose and into his mouth.' },
      },
    },
    {
      kind: 'count', k: 3, ah: AH, choo: CHOO, verb: { zh: '推', en: 'Push' },
      lines: {
        round: { zh: '喷嚏', en: 'Sneeze' },
        ah: { zh: '「阿——」', en: '"Ah —"' }, choo: { zh: '「——嚏！」', en: '"— choo!"' },
        beats: [
          { zh: '一个喷嚏打得他往后一仰。', en: 'The first sneeze throws him back.' },
          { zh: '第二个打得他往前一栽。', en: 'The second pitches him forward.' },
          { zh: '第三个打到一半——', en: 'Halfway through the third —' },
        ],
        early: { zh: '他还站得住，你这一推推了个空。', en: 'He\'s still on his feet; your push meets air.' },
        again: { zh: '他又一皱，「阿——」', en: 'His face wrinkles again: "Ah —"' },
      },
    },
  ],
  art: { stage: 'sneeze/stage.webp', idle: 'sneeze/heqi-guard.webp', tell: 'sneeze/heqi-punch.webp', me: 'sneeze/xiaoman.webp' },
};

export const meta = { id: 'sneeze', name: LEVEL.name, how: LEVEL.how, sounds: ['start', 'good', 'hurt', 'early', 'bad', 'short', 'tell', 'beat', 'sneeze', 'hold'] };

/** What a step sounded (games/kit/heard.js): a step done (good), the fist landing (hurt), too soon (early), held too long
    (bad) or too short (short), the shoulder dropping (tell), a count's beat and its 「嚏！」, the breath taken (hold). */
export function sounds(b, a) {
  if (!b || !a) return [];
  const out = [];
  if (b.phase === 'ready' && a.phase !== 'ready') out.push('start');
  if (a.step > b.step || (a.won && !b.won)) out.push('good');
  if (a.hits > b.hits) out.push('hurt');
  if (a.early > b.early) out.push('early');
  if (a.over > b.over) out.push('bad');
  if (a.note === 'short' && b.held != null && a.held == null) out.push('short');
  if (a.held != null && b.held == null) out.push('hold');
  if (a.note !== b.note && a.note === 'tell') out.push('tell');
  if (a.part === 'choo' && b.part !== 'choo') out.push('sneeze');
  else if (a.k !== b.k || (a.note !== b.note && /^s\d+$/.test(a.note ?? ''))) out.push('beat');
  return out;
}

/* ── The level ─────────────────────────────────────────────────────────────────────────────── */

const say = (x, lang) => x?.[lang] ?? x?.zh ?? '';
/* The level a deal hands newGame: its `levels[0]`, a level object as `level`, else the built-in one. */
const dealt = (deal) => deal?.levels?.[0] ?? (deal?.level && typeof deal.level === 'object' ? deal.level : null) ?? LEVEL;
/** The level a state plays (the built-in one rides in no state). */
export const levelOf = (s) => s?.level ?? LEVEL;
/** The step a state is on. */
export const stepOf = (s) => levelOf(s).steps[s?.step ?? 0] ?? levelOf(s).steps[0];
/** The guard before the current swing of a tell step (ms). */
export const guardOf = (s) => { const g = [stepOf(s).guard ?? 1000].flat(); return g[(s.swings ?? 0) % g.length]; };
/* The phase each kind of step plays as. */
const PHASE = { tell: 'face', hold: 'charm', count: 'sneeze' };
/* What is said as a step starts the bout, and as one ends into the next (that step's `done`). */
const FIRST = { tell: 'guard', hold: 'hold', count: 'ah' };
const DONE = { tell: 'dodged', hold: 'smoke', count: 'pushed' };
/* A note → the line of the step it is said on. */
const LINE = { tell: { guard: 'guard', tell: 'tell', hit: 'hit', early: 'early' }, hold: { hold: 'hold', short: 'short', much: 'over' }, count: { ah: 'ah', pushEarly: 'early', again: 'again' } };
const GRADE = { hits: 0, over: 0, early: 1 };

export function newGame(seed, _n = 1, deal = {}) {
  const level = dealt(deal);
  return { seed: String(seed), phase: 'ready', live: false, t: 0, at: 0, swings: 0, held: null, k: 0, part: 'ah', hits: 0, over: 0, early: 0, fx: null, note: 'ready', won: false, grade: null, step: 0, ...(level === LEVEL ? {} : { level }) };
}

export const stuck = (s) => s.hits + s.over >= (levelOf(s).stuck ?? 5);
export const gradeOf = (s) => {
  const g = { ...GRADE, ...levelOf(s).grade };
  return s.hits <= g.hits && s.over <= g.over && s.early <= g.early ? 'clean' : 'clumsy';
};

/* Step `i` begins, its note `note`. */
function enter(s, i, note) {
  const kind = levelOf(s).steps[i].kind, at = { ...s, step: i, phase: PHASE[kind], note };
  if (kind === 'tell') return { ...at, at: s.t, swings: 0 };
  if (kind === 'count') return { ...at, at: s.t, k: 0, part: 'ah' };
  return { ...at, held: null };
}
/* The current step is done: the next begins, or the bout is won. */
function advance(s, extra = {}) {
  const i = s.step + 1;
  if (i >= levelOf(s).steps.length) { const grade = gradeOf(s); return { ...s, ...extra, live: false, won: true, grade, note: grade, fx: { at: s.t, ok: true } }; }
  return enter({ ...s, ...extra }, i, DONE[stepOf(s).kind]);
}
/* Where a tell step is in a swing: guard, then the tell. */
const swingPart = (s) => (s.t - s.at < guardOf(s) ? 'guard' : 'tell');
const on = (s, kind) => !s.won && s.phase !== 'ready' && stepOf(s).kind === kind;

const VERBS = {
  start: (s) => (s.phase === 'ready' ? enter({ ...s, live: true, t: 0, at: 0 }, 0, FIRST[levelOf(s).steps[0].kind]) : null),
  yield: (s) => {
    if (!on(s, 'tell')) return null;
    if (swingPart(s) === 'guard') return { ...s, early: s.early + 1, note: 'early' };
    return advance(s, { fx: { at: s.t, ok: true } });
  },
  hold: (s) => (on(s, 'hold') ? { ...s, held: s.t } : null),
  release: (s) => {
    if (!on(s, 'hold') || s.held == null) return null;
    const ms = s.t - s.held, [min, max] = stepOf(s).window;
    if (ms < min) return { ...s, held: null, note: 'short' };
    if (ms > max) return { ...s, held: null, over: s.over + 1, note: 'much' };
    return advance(s, { held: null });
  },
  push: (s) => {
    if (!on(s, 'count')) return null;
    if (s.k < stepOf(s).k - 1 || s.part !== 'ah') return { ...s, early: s.early + 1, note: 'pushEarly' };
    return advance(s, { fx: { at: s.t, ok: true } });
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* Notes that stand a moment before a tell step's guard line comes back. */
const LINGER = ['hit', 'early', ...Object.values(DONE)];
export function tick(state, ms) {
  if (!state.live || state.won || ms <= 0) return state;
  const s = { ...state, t: state.t + ms }, step = stepOf(s);
  if (step.kind === 'tell') {
    const since = s.t - s.at;
    if (since >= guardOf(s) + step.tell) return { ...s, at: s.t, swings: s.swings + 1, hits: s.hits + 1, note: 'hit', fx: { at: s.t, ok: false } };
    return since >= guardOf(s) ? { ...s, note: 'tell' } : LINGER.includes(s.note) && since < 900 ? s : { ...s, note: 'guard' };
  }
  if (step.kind === 'count') {
    const since = s.t - s.at, part = since < step.ah ? 'ah' : 'choo', last = step.k - 1;
    if (since >= step.ah + step.choo) return { ...s, at: s.t, k: Math.min(last, s.k + 1), part: 'ah', note: s.k >= last ? 'again' : `s${s.k + 1}` };
    return { ...s, part, note: part === 'choo' ? 'choo' : s.k === last ? `s${step.k}` : s.note === 'pushEarly' ? s.note : 'ah' };
  }
  return s;
}

/* What the board says: the note's line on the step it is said on (a `done` is the step before's). */
function lineOf(s, lang) {
  const level = levelOf(s), step = stepOf(s), prev = level.steps[s.step - 1];
  if (prev && s.note === DONE[prev.kind]) return say(prev.lines?.done, lang);
  const lines = step.lines ?? {};
  if (step.kind === 'count') {
    if (s.note === 'choo') return `${say(lines.ah, lang)}${say(lines.choo, lang)}`;
    const beat = /^s(\d+)$/.exec(s.note ?? '');
    if (beat) return say(lines.beats?.[Number(beat[1]) - 1], lang);
  }
  return say(lines[LINE[step.kind][s.note]], lang);
}

/* ── The picture: the stage's edge, the foe squared up on the right, 小满 on the left. The foe takes
   its tell pose in a tell's window; through a count it rocks back and forward on its heels; won, it
   walks off the stage's end. The thread (after a hold lands, and through a count) and the ink are
   the brush's. */
const ART = (p) => (p ? new URL(`../../worlds/jiuding/art/games/${p}`, import.meta.url).href : null);
export const PLACE = { feet: 118, stage: { x: -6, y: 109, w: 332, h: 40 }, foe: { x: 186, off: 300, h: 98, w: 60 }, pose: { dx: 22, h: 98, w: 92 }, me: { x: 92, h: 88, w: 36 }, thread: { x: 108, y: 64 } };
const placeOf = (level) => {
  const p = level.place ?? {};
  return Object.fromEntries(Object.entries(PLACE).map(([k, v]) => [k, typeof v === 'object' ? { ...v, ...p[k] } : p[k] ?? v]));
};
/* A painted figure standing on the stage: its feet at (x, feet), `h` tall; `anchor` is the side the box hangs from. */
const figure = (src, feet, x, h, w, anchor = 'xMid', cls = '') => (src ? `<image class="g-fig${cls}" href="${src}" x="${n(anchor === 'xMax' ? x - w : anchor === 'xMin' ? x : x - w / 2)}" y="${feet - h}" width="${w}" height="${h}" preserveAspectRatio="${anchor}YMax meet"/>` : '');
/* The foe's lean through a count: back and forward by turns, then rocking on the last beat. */
const leanOf = (s, step) => (s.k < step.k - 1 ? (s.k % 2 === 0 ? -8 : 8) : s.part === 'choo' ? 6 : -4);
function picture(state) {
  const level = levelOf(state), step = stepOf(state), art = level.art ?? {}, p = placeOf(level), feet = p.feet;
  const stageSrc = ART(art.stage);
  const stage = stageSrc ? `<image class="g-stage" href="${stageSrc}" x="${p.stage.x}" y="${p.stage.y}" width="${p.stage.w}" height="${p.stage.h}" preserveAspectRatio="none"/>` : '';
  const counting = state.phase !== 'ready' && step.kind === 'count';
  const tell = state.phase !== 'ready' && step.kind === 'tell' && (state.note === 'tell' || state.note === 'hit');
  const lean = counting ? leanOf(state, step) : 0;
  const x = state.won ? p.foe.off : p.foe.x;
  const idle = ART(art.idle), pose = ART(art.tell) ?? idle;
  const body = tell && art.tell ? figure(pose, feet, x + p.pose.dx, p.pose.h, p.pose.w, 'xMax') : figure(idle, feet, x, p.foe.h, p.foe.w);
  const he = body ? `<g class="g-foe${state.won ? ' is-off' : ''}" transform="rotate(${lean} ${x} ${feet})">${body}</g>` : '';
  const mine = figure(ART(art.me), feet, p.me.x, p.me.h, p.me.w);
  const me = mine ? `<g class="g-me">${mine}</g>` : '';
  const smoke = counting || state.note === DONE.hold ? `<path class="g-mist" d="M${p.thread.x} ${p.thread.y} q20 -14 ${n(x - 20 - p.thread.x)} -22" opacity=".7"/>` : '';
  const fx = state.fx ? splash(state.fx.ok ? 130 : 100, 66, state.t - state.fx.at, { r: 10, seal: state.fx.ok }) : '';
  const done = state.won && state.grade ? splash(286, 60, 300, { r: 12, seal: true }) : '';
  return scene(320, 130, stage + me + he + smoke + fx + done, 'g-painted');
}

export function html(state, lang = 'zh') {
  const level = levelOf(state);
  if (state.won) return `<div class="g-sneeze g-ink is-won">${picture(state)}<p class="g-line-say">${say(level.won?.[state.grade ?? 'skipped'], lang)}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-sneeze g-ink">${picture(state)}<p class="g-line-say">${say(level.ready, lang)}</p>${btn(say(level.start, lang), 'data-g="start"')}</div>`;
  const step = stepOf(state), verb = say(step.verb, lang), round = say(step.lines?.round, lang);
  const head = step.kind === 'count' ? `<div class="g-head"><span>${round ? `${round} ` : ''}<b>${state.k + 1}</b> / ${step.k}</span></div>` : '';
  const control = step.kind === 'tell' ? btn(verb, 'data-g="yield"')
    : step.kind === 'hold' ? btn(verb, 'data-g-hold="1"', 'main', `g-hold${state.held != null ? ' is-held' : ''}`)
      : btn(verb, 'data-g="push"');
  return `<div class="g-sneeze g-ink">${picture(state)}${head}<p class="g-line-say">${lineOf(state, lang)}</p>${control}</div>`;
}

/* ── Standalone: the mount contract (games/mount.js), the level from `opts.data` ────────────────── */

/** Every level of the kit's games.json rows, in the registry's order, each carrying its row's name. */
export function ladderOf(registry) {
  return (registry?.games ?? []).filter((g) => g.id === meta.id).flatMap((g) => (g.levels ?? []).map((l) => ({ name: g.name, ...l })));
}
async function ladder() {
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return ladderOf(await res.json());
}
/* The level a mount plays when its data says it without the registry, else undefined. */
const levelNow = (data = {}) => {
  if (data.levels?.length || (data.level && typeof data.level === 'object')) return dealt(data);
  if (data.level == null || data.level === LEVEL.id) return LEVEL;
  return undefined;
};
/** The level a mount plays: `data.levels[0]`, a level object as `data.level`, else the built-in level
    or the registry's level named `data.level` (the built-in one when none is). */
export async function levelFor(opts = {}) {
  return levelNow(opts.data) ?? (await ladder().catch(() => [])).find((l) => l.id === opts.data.level) ?? LEVEL;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export function mount(container, opts = {}) {
  const play = (level) => mountPure(self)(container, { ...opts, data: { ...(opts.data ?? {}), levels: [level] } });
  const level = levelNow(opts.data);
  return level ? play(level) : levelFor(opts).then(play);
}
