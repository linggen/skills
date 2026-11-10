// rules/aside.mjs — 先放一放: the book set aside mid-passage, and taken up again at the same beat
// (Hanli, 2026-10-26: 「如果玩家在读剧情时, 能跳出来去玩小游戏, 玩完后在回来接着读, 就能让玩家自己控制…比较灵活」;
// and on what may be played meanwhile: 「后面剧情里的游戏不能跳出去玩」).
// Part of the rules engine; rules.mjs is its one door.
//
// The page plays a passage beat by beat (rules/tell.mjs, dialogue.js). Setting it aside writes its place
// on the save (`aside`: the scene, the passages still to play from the one on show, and the beat), so a
// reload, another browser or the phone takes it up at the same beat (`resume`, the beats built again
// from the book, both languages). While it is set aside the story does not move: one declared rule says
// what may be played — ASIDE_KINDS, each only when its own system has it open now (its cooldown, 体力,
// the story gates) — and every other verb that writes is refused in the world's words. Never inside a
// key beat's lock (world.mjs lockOf: the map is shut there anyway).
import { dayKey, pick, poolSpent } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { taskOf } from './errands.mjs';
import { fantongBrief } from './fantong.mjs';
import { sideLine } from './hui.mjs';
import { isTide, shouchaoHere, shouchaoTray } from './shouchao.mjs';
import { isBout, qiecuoHere, qiecuoTray } from './qiecuo.mjs';
import { kaoHere } from './kao.mjs';
import { aside as asideItem } from './tell.mjs';
import { allPlaces, encounterOf, lockOf, placeOf, poolStands, poolWait, sceneOf } from './world.mjs';
import { gamesToday, standingToday } from './rotation.mjs';
import { errandWants, hostedHere } from './tasks.mjs';
import { boardVaries, wonEver } from './pool.mjs';
import { duiziBrief } from './duizi.mjs';
import { visitorsTray } from './visiting.mjs';
import { yaoshouBatch, yaoshouPlace, yaoshouTray } from './yaoshou.mjs';

/* What he is told when a verb would move the story while the book is set aside. */
const HELD = {
  zh: '书还摊在这一页。先接着读完，故事才往下走。',
  en: 'The book is still open at this page. Read on first; then the story moves.',
};
const held = (state, verb) => refuse('aside', pick(HELD, state.lang), { verb });

/* The story boards he kept for later (收着的棋局, rules/skips.mjs keepBoard): each may be taken up while the book is set aside. */
export const skippedHere = (content, state) => (state.kept ?? []).filter(e => e.story && taskOf(content, e.task)).map(e => e.task);

/* ── The one registry: every game played beside the story, what each may do while the book is set aside, and
   what each puts in 手边的棋局 ──
   Each kind declares, as its own system reads it:
   · `open` / `takes` (先放一放): whether it is open now (from Look's reading as the page gets it — a shut system is
     already out of it) and which verb calls are its. A replayed board is the board's own task once offered again.
     A kind without `open` is never played while the book is set aside.
   · `tray` (rules/tray.mjs, Hanli 2026-11-02): its entries in the tray, each `{ id, title?, left?: {unit, n?, of?},
     places?: [place ids, the first where he stands] | null (anywhere), opens?: the page's opener, arg?, stage?: the
     stage card that already shows it (`card` or `card:id`), task?: the task it stands for, wait_min?: a cooldown, shut?,
     notice?: nothing to open }`. A new timed game joins the tray by declaring this — the page draws whatever comes. */
const tasksOf = view => view?.tasks ?? [];
const lockedIn = (view, system) => (view?.locked ?? []).includes(system);
/* 闭关 may be entered: not in one, and not shut by a story gate — or shut with 体力 spent (rules/locks.mjs lockedVerb: no gate
   strands him at 0). */
const secludable = (content, state, view) => Boolean(view) && !state.seclusion && (!lockedIn(view, 'seclusion') || poolSpent(content, state));
/* 对对子's teachers whose scene is behind him: each one's brief as it reads standing at his place (rules/duizi.mjs). */
const duiziTray = (content, state, now) => (content.aigames?.duizi?.teachers ?? []).flatMap((t) => {
  const b = duiziBrief(content, { ...state, place: t.at }, now);
  // A couplet set and not yet graded (or skipped) is a round under way: it stands, 继续, even as the day's last.
  const open = Boolean(b?.round && !b.round.grades && !b.round.skipped);
  return b?.rounds_left > 0 || open ? [{ id: 'duizi', who: b.teacher, left: { unit: 'couplets', n: b.rounds_left }, places: [t.at], opens: 'duizi', stage: 'duizi', ...(open ? { resume: true } : {}) }] : [];
}).slice(0, 1);
/* 小游戏池's rows for 银月's games (rules/pool.mjs), each with its 时辰's lean. 本王考考你 rests a day (one a day).
   对对子 rests one 时辰 (Hanli 2026-11-02: three 联 a day, one a sitting): played, it is out of the row for the rest
   of the 时辰 it was played in (pool.mjs `played`) and back in the very next 时辰's draw — so its cooldown is 0
   minutes past that 时辰. 120 would miss the next draw (a play at 11:30 is 90 min old when 未 starts at 13:00).
   Its three a day stay the rules' (duizi.mjs `rounds`): the entry leaves the row once they are used. */
const HER_POOL = { duizi: { cooldown_min: 0, when: ['wu', 'wei'], cost: 'game' }, kao: { cooldown_min: 24 * 60, when: ['you', 'xu'], cost: 'game' } };
/* A practice board's lean by the kind of game it is (agent's pick, Hanli delegated 11-02): a riddle at dusk, a night watch at night. */
const BOARD_LEAN = { jinchat: ['you', 'xu'], shoulu: ['hai', 'zi'], shouqiang: ['hai', 'zi'], sadoushou: ['hai', 'zi'] };
/* The practice boards of every place on the painted map he stands on (the 观), each once, where he stands first. */
function boardsAround(content, state, now) {
  const here = placeOf(content, state.place), plate = here?.plate?.id;
  const places = plate ? [here, ...allPlaces(content).filter(p => p.plate?.id === plate && p.id !== here.id)] : here ? [here] : [];
  const seen = new Set();
  // What stands there (the plate's one deal, rotation.mjs) and the day's pool an errand may still ask for — hostedHere says which.
  return places.flatMap(p => [...new Set([...standingToday(content, state, p, now), ...gamesToday(content, p, now)])].filter(id => !seen.has(id) && hostedHere(content, { ...state, place: p.id }, id, now)).map((id) => {
    seen.add(id);
    const t = taskOf(content, id);
    return { id, task: id, game: t.game ?? null, title: String(pick(t.title, state.lang) ?? id), places: [p.id], opens: 'play', arg: id, stage: `board:${id}` };
  }));
}
export const PLAY_KINDS = [
  { kind: 'replay', // a story board kept for later (收着的棋局), taken up at once
    open: (content, state) => skippedHere(content, state).map(id => ({ id, title: pick(taskOf(content, id).title, state.lang) })),
    takes: (verb, args, content, state) => (verb === 'task' && ['kept-play', 'keep', 'kept-drop'].includes(args.action) && (skippedHere(content, state).includes(String(args.id ?? '')) || Boolean(state.tasks?.[String(args.id ?? '')]?.replay)))
      || (['win', 'task'].includes(verb) && ['done', undefined].includes(args.action) && Boolean(state.tasks?.[String(args.id ?? '')]?.replay)) },
  { kind: 'gongke', // 人间功课 (rules/gongke.mjs) — on the goal card, not in the tray
    open: (content, state, view) => (view?.gongke ? [{ id: 'gongke' }] : []),
    takes: (verb, args) => verb === 'task' && args.action === 'check' },
  { kind: 'fantong', // 饭桶 · 开炉, out of its cooldown (rules/fantong.mjs)
    open: (content, state, view, now) => (fantongBrief(content, state, now)?.ready ? [{ id: 'fantong' }] : []),
    takes: verb => verb === 'fantong',
    // Anywhere; its own cooldown is a wait; the day's allowance spent, it is done for today and not in the tray.
    tray: (content, state, view, now) => {
      const b = fantongBrief(content, state, now), lim = b?.limit ?? {};
      if (!b || (lim.per_day && lim.today >= lim.per_day)) return [];
      const row = { id: 'fantong', title: b.name ?? null, opens: 'gear' };
      if (!b.ready) return b.next_at ? [{ ...row, wait_min: Math.ceil((new Date(b.next_at) - now) / 60_000) }] : [];
      return [{ ...row, left: lim.per_day ? { unit: 'rounds', n: lim.per_day - lim.today } : { unit: 'today' } }];
    },
    pool: { row: () => ({ cooldown_min: 60, when: [], cost: null }), plays: (verb, args) => (verb === 'fantong' && args.action === 'feed' ? 'fantong' : null) } },
  { kind: 'pool', // a pool's fight at the place he stands, rested (world.mjs encounterOf; 体力 is the fight's own)
    open: (content, state, view, now) => { const e = encounterOf(content, state, now); return e?.pool ? [{ id: e.game.id, title: e.creature.name }] : []; },
    takes: (verb, args) => (verb === 'duel' && String(args.id ?? '').startsWith('haunt:')) || verb === 'tame' || verb === 'reroll' || verb === 'yaoshou',
    // A pool other than 妖兽出没's: its beast where he stands, or its rest (world.mjs poolWait).
    tray: (content, state, view, now) => {
      // …and between its batches, a pool that stands (world.mjs poolStands) is a plain haunt here.
      if (yaoshouPlace(content, placeOf(content, state.place)) && (!poolStands(content, placeOf(content, state.place)) || yaoshouBatch(content, state, now)?.up)) return [];
      const e = encounterOf(content, state, now), w = poolWait(content, state, now);
      if (e?.pool) return [{ id: e.game.id, title: e.creature.name, places: [state.place], opens: 'duel', arg: e.game.id, stage: `duel:${e.game.id}` }];
      return w ? [{ ...w, places: [state.place] }] : [];
    } },
  { kind: 'yaoshou', // 妖兽出没 (rules/yaoshou.mjs): a batch at 后山 · 上山路 — the fight itself is the pool's (above)
    tray: (content, state, view, now) => { const e = encounterOf(content, state, now); return yaoshouTray(content, state, now, e?.pool ? e.game.id : null); } },
  { kind: 'tide', // 兽潮, out of its cooldown (rules/shouchao.mjs)
    // …and 切磋's bout (rules/qiecuo.mjs), the same kind: a cooldown's board at hand
    open: (content, state, view, now) => tasksOf(view).filter(t => t.tide && (shouchaoHere(content, state, t.id, now) || qiecuoHere(content, state, t.id, now))).map(t => ({ id: t.id, title: t.title })),
    takes: (verb, args, content) => ['win', 'task'].includes(verb) && (isTide(content, String(args.id ?? '')) || isBout(content, String(args.id ?? ''))),
    tray: (content, state, view, now) => [...shouchaoTray(content, state, now), ...qiecuoTray(content, state, now)] },
  { kind: 'seclusion', // 闭关, where the story has opened it (rules/seclusion.mjs)
    open: (content, state, view) => (secludable(content, state, view) ? [{ id: 'seclusion' }] : []),
    takes: verb => verb === 'seclude',
    // `standing`: on hand all day, nothing new (Hanli 11-05: 「这个闭关卡一直这么显示吗? 可以折叠进全部dialog里」) — 全部 holds it,
    // never the strip (rules/agenda.mjs). Spent 体力 still brings it to the strip as the one way on (cards.js trayRestHtml).
    // Never a 小游戏池 member (Hanli 11-09: 「手机上闭关不用放主页面常驻, 全部里有就行」): a member stands only while the 时辰's
    // draw shows it, so a standing row in the pool was out of 全部 the rest of the day — and a drawn 闭关 held a strip slot
    // the strip never shows (rules/agenda.mjs `standing`).
    tray: (content, state, view) => (secludable(content, state, view) ? [{ id: 'seclusion', left: { unit: 'today' }, opens: 'seclude', stage: 'seclude', standing: true }] : []) },
  { kind: 'her', // 银月's games open to him, 今日传闻 and 问卦 (rules/aigames.mjs, kao.mjs, duizi.mjs, tale.mjs, fortune.mjs)
    open: (content, state, view) => [
      ...['duizi'].filter(k => view?.[k]).map(id => ({ id })),
      ...tasksOf(view).filter(t => t.light && t.open && t.left > 0).map(t => ({ id: 'kao', title: t.title })),
      ...(view?.tale && !view.tale.dropped ? [{ id: 'tale', title: view.tale.title ?? null }] : []),
      ...(view && !view.divination && !lockedIn(view, 'divine') ? [{ id: 'divine' }] : []),
    ],
    // 本王考考你's word is counted as its task's (tasks.mjs taskDone → kao.mjs kaoDone).
    takes: (verb, args, content, state, now) => ['duizi', 'kao', 'tale', 'lundao', 'divine', 'fate'].includes(verb)
      || (['win', 'task'].includes(verb) && kaoHere(content, state, String(args.id ?? ''), now)),
    // In the tray: 对对子 (today's couplets, at the teacher's place), 本王考考你 (today's rounds, anywhere), 问卦 (once a day).
    // 今日传闻 is the story's own thread, on its card.
    tray: (content, state, view, now) => [
      ...(view ? duiziTray(content, state, now) : []),
      ...tasksOf(view).filter(t => t.light && t.her && t.status === 'offered' && t.left > 0)
        .map(t => ({ id: 'kao', task: t.id, title: t.title, left: { unit: 'rounds', n: t.left }, opens: 'play', arg: t.id, stage: `board:${t.id}`, ...(t.open ? { resume: true } : {}) })),
      ...(view && !view.divination && !lockedIn(view, 'divine') ? [{ id: 'divine', left: { unit: 'today' }, opens: 'divine', stage: 'hexagram' }] : []),
    ],
    // In the pool: 对对子 (a 时辰's rest) and 银月出题 (a day's rest). 问卦 is not: once a day, fixed, as it was.
    pool: {
      row: e => HER_POOL[e.id] ?? null,
      plays: (verb, args) => (verb === 'duizi' && ['open', 'submit'].includes(args.action) ? 'duizi' : verb === 'kao' && args.action === 'open' ? 'kao' : null),
    } },
  // `in: 'shi'`: the 事 book lists it (cards.js bookPopHtml) — one place for one thing, the tray holds games only
  // (Hanli 11-02: 「在事里有的, 是否不用放下面显示?」). Declared here, drawn there.
  { kind: 'errands', in: 'shi', // 执事堂's work (errands.mjs workOf): where errands wait to be taken, how many
    tray: (content, state, view) => (view?.work?.kind === 'errand' && view.work.titles?.length
      ? [{ id: 'errands', left: { unit: 'errands', n: view.work.titles.length }, places: [view.work.place.id], opens: 'book', stage: 'offer' }] : []) },
  { kind: 'board', // a board a place on his painted map hosts today as practice (rules/rotation.mjs, tasks.mjs hostedHere): 周衡's 灯谜,
    // a story board hosted again where it was played (药园巡夜, 守火 …) — wherever on the map, the place where he stands first
    tray: (content, state, view, now) => boardsAround(content, state, now),
    pool: {
      row: e => ({ cooldown_min: 360, when: BOARD_LEAN[e.game] ?? [], cost: 'game' }),
      // Played is won, lost, put down (✕) or kept (留) — a board's own 跳过 too (2026-11-04: the row waits till then).
      plays: (verb, args, content) => ((verb === 'task' && ['done', 'lost', 'leave', 'skip', 'keep'].includes(args.action)) || (verb === 'win' && (args.grade === 'skipped' || args.skipped === true || args.skipped === 'true'))) && taskOf(content, String(args.id ?? ''))?.hosted ? String(args.id) : null,
      // Counted done is won (rules/pool.mjs `pool_won`).
      won: (verb, args, content) => (verb === 'task' && args.action === 'done' && taskOf(content, String(args.id ?? ''))?.hosted ? String(args.id) : null),
      // One fixed board, won once, is out of the pool for good (pool.mjs boardVaries, Hanli 11-02) — unless an errand
      // still asks for its win there.
      retired: (e, content, state) => !boardVaries(taskOf(content, e.id)) && wonEver(state, e.id) && !errandWants(content, state, e.id, e.places?.[0]),
    } },
  { kind: 'mijing', // 秘境探险 (rules/mijing.mjs): a 秘境令 in hand, away from the door — the door's run is its card there
    tray: (content, state, view) => (view?.mijing?.away ? [{ id: 'mijing', left: { unit: 'keys', n: view.mijing.keys }, places: [view.mijing.door.id], stage: 'mijing' }] : []) },
  { kind: 'chance', in: 'shi', // the day's 机缘 (road.mjs chanceBrief): where, the minutes left — met on arrival
    tray: (content, state, view) => { const c = view?.chance; return c?.minutes_left > 0 && !c.here ? [{ id: 'chance', left: { unit: 'ends', n: c.minutes_left }, places: [c.place.id] }] : []; } },
  { kind: 'visitor', in: 'shi', // a visiting shop (rules/visiting.mjs): standing today, or up tomorrow (a notice)
    tray: (content, state, view, now) => (view ? visitorsTray(content, state, now) : []) },
];
/* 先放一放's facet of the registry: the kinds that may be played while the book is set aside. */
export const ASIDE_KINDS = PLAY_KINDS.filter(k => k.open);

/* Verbs that never move the story: reads, the page's own marks, the save's keeping, the shelf, the
   pouch, an errand held — and these two. */
export const ASIDE_ALWAYS = new Set(['look', 'show', 'progress', 'story', 'bag', 'gear', 'deck', 'atlas', 'saves', 'save', 'load', 'forget',
  'lang', 'summarize', 'greet', 'remember', 'appear', 'unrolled', 'unfolded', 'unstick', 'reveal', 'quest', 'trade', 'haggle', 'refine', 'aside', 'resume']);
/* Verbs that move the story, or take him elsewhere: refused while the book is set aside (Move and Go
   too: no kind takes them since the 秘境 rerun was retired, 2026-10-28). */
export const ASIDE_REFUSED = new Set(['move', 'go', 'resolve', 'judge', 'travel', 'fly', 'meet', 'ring', 'make', 'enter', 'leave', 'build',
  'worlds', 'amend', 'art', 'mijing',
  // 旁炉 (rules/panglu.mjs): a batch at the 丹房's side furnace — no kind takes it; it waits for the book.
  'panglu']);
/* Verbs some kind may take (a call each kind's `takes` answers); else refused. */
export const ASIDE_KIND_VERBS = new Set(['task', 'win', 'duel', 'reroll', 'tame', 'yaoshou', 'fantong', 'seclude', 'duizi', 'kao', 'tale',
  'lundao', 'divine', 'fate']);

/* What may be played now, while set aside (or, before, whether the control has anything to offer). */
export function asideOffers(content, state, view, now = new Date()) {
  return ASIDE_KINDS.flatMap(k => k.open(content, state, view, now).map(o => ({ kind: k.kind, ...o })));
}

/* The refusal for a verb while the book is set aside, or null. */
export function asideVerb(content, state, verb, args = {}, ctx = {}) {
  if (!state?.aside || ASIDE_ALWAYS.has(verb)) return null;
  // 收手 never moves the story: a board put down while the book is set aside is put down (rules/skips.mjs leaveBoard).
  if (verb === 'task' && args.action === 'leave') return null;
  if (ASIDE_KIND_VERBS.has(verb) && ASIDE_KINDS.some(k => k.takes(verb, args, content, state, ctx.now ?? new Date()))) return null;
  return held(state, verb);
}

/* ── The two verbs ── */

/* A passage key the box plays (tell.mjs keys): a scene's own, its rest after a board, a choice's. */
const KINDS = new Set(['scene', 'after', 'choice']);
const keyOk = (content, state, it) => KINDS.has(it?.of) && typeof it.id === 'string' && Boolean(asideItem(content, state, it));

/* `aside --items=[{of,id},…] --i=<passage> --j=<beat>`: the scene's passages, the one on show and its beat.
   Refused inside a key beat's lock, with nothing to play meanwhile, or for a passage the book
   does not hold here. */
export function setAside(state, content, ctx, args = {}) {
  if (lockOf(content, state)) return refuse('locked', null);
  if (state.fight) return refuse('in-a-fight', null);
  let items = args.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return refuse('bad-items', null); } }
  items = (Array.isArray(items) ? items : []).map(it => ({ of: String(it?.of ?? ''), id: String(it?.id ?? '') }));
  if (!items.length || !items.every(it => keyOk(content, state, it))) return refuse('not-a-passage', null);
  const i = Number(args.i ?? 0), j = Number(args.j ?? 0);
  if (![i, j].every((n) => Number.isInteger(n) && n >= 0) || i >= items.length) return refuse('bad-beat', null);
  const s = clone(state);
  s.aside = { scene: state.scene, items, i, j, at: (ctx.now ?? new Date()).toISOString() };
  return { state: s, result: { ok: true, aside: { scene: state.scene, i, j } } };
}

/* `resume`: the passages again as the box plays them (both languages), at the passage and beat set aside — its
   set piece and the ones before it not played again — and the save as before. Back at the scene's
   place if he stands elsewhere. */
export function resume(state, content, ctx) {
  const a = state.aside;
  if (!a) return refuse('not-aside', null);
  const all = a.items.map(it => asideItem(content, state, it)), i = Math.min(a.i ?? 0, all.length - 1);
  const items = all.filter(Boolean), at = Math.max(0, items.indexOf(all[i]));
  const s = clone(state);
  delete s.aside;
  const scene = sceneOf(content, s);
  if (scene?.at && s.place !== scene.at && placeOf(content, scene.at)) s.place = scene.at;
  const unpiece = ({ piece, ...rest }) => rest;
  items.forEach((it, k) => { if (k <= at) for (const lang of ['zh', 'en']) it.beats[lang] = (it.beats[lang] ?? []).map((b, n) => (b.piece && (k < at || n <= a.j) ? unpiece(b) : b)); });
  const j = items.length ? Math.min(a.j, Math.max(0, (items[at].beats.zh ?? []).length - 1)) : 0;
  return { state: s, result: { ok: true, scene: a.scene, i: at, j, items, day: dayKey(ctx.now ?? new Date()) } };
}

/* What Look carries: while set aside, where (the scene, the beat) and what may be played; before, only
   the offers — the page shows 先放一放 while there is something, never inside a key beat's lock. */
export function asideLook(content, state, view, now = new Date()) {
  if (!state.aside && lockOf(content, state)) return null;
  const offers = asideOffers(content, state, view, now);
  if (state.aside) return { aside: { on: true, scene: state.aside.scene, i: state.aside.i ?? 0, j: state.aside.j, offers } };
  return offers.length ? { aside: { on: false, offers } } : null;
}

