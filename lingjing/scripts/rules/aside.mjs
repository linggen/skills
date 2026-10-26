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
import { dayKey, pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { taskOf } from './errands.mjs';
import { fantongBrief } from './fantong.mjs';
import { sideLine } from './hui.mjs';
import { rerunOpen } from './rerun.mjs';
import { isTide, shouchaoHere } from './shouchao.mjs';
import { aside as asideItem } from './tell.mjs';
import { encounterOf, lockOf, placeOf, sceneOf } from './world.mjs';

/* What he is told when a verb would move the story while the book is set aside. */
const HELD = {
  zh: '书还摊在这一页。先接着读完，故事才往下走。',
  en: 'The book is still open at this page. Read on first; then the story moves.',
};
const held = (state, verb) => refuse('aside', pick(HELD, state.lang), { verb });

/* The skipped boards of the line the story stands on (rules/skips.mjs): every one, not only the day's. */
const lineAt = (content, state) => { const sc = sceneOf(content, state); return sc ? sideLine(content, sc) ?? null : null; };
export const skippedHere = (content, state) => (state.skipped ?? [])
  .filter(e => (e.line ?? null) === lineAt(content, state) && taskOf(content, e.task)).map(e => e.task);

/* ── The one rule: what may be played while the book is set aside ──
   Each kind: whether its own system has it open now (`open`, from Look's reading as the page gets it —
   a shut system is already out of it), and which verb calls are its (`takes`). A replayed board is
   the board's own task once offered again. */
const tasksOf = view => view?.tasks ?? [];
export const ASIDE_KINDS = [
  { kind: 'replay', // a board skipped earlier, offered again at once (not only the day's one)
    open: (content, state) => skippedHere(content, state).map(id => ({ id, title: pick(taskOf(content, id).title, state.lang) })),
    takes: (verb, args, content, state) => (verb === 'task' && args.action === 'replay' && skippedHere(content, state).includes(String(args.id ?? '')))
      || (['win', 'task'].includes(verb) && ['done', undefined].includes(args.action) && Boolean(state.tasks?.[String(args.id ?? '')]?.replay)) },
  { kind: 'rerun', // 秘境 again, at its door, out of its cooldown (rules/rerun.mjs)
    open: (content, state, view, now) => { const r = rerunOpen(content, state, now); return r && state.place === r.rerun.door ? [{ id: r.beat.id }] : []; },
    takes: (verb, args, content, state) => verb === 'rerun' || (Boolean(state.rerun) && ['duel', 'win', 'task', 'tame', 'mishi'].includes(verb)) },
  { kind: 'gongke', // 人间功课 (rules/gongke.mjs)
    open: (content, state, view) => (view?.gongke ? [{ id: 'gongke' }] : []),
    takes: (verb, args) => verb === 'task' && args.action === 'check' },
  { kind: 'fantong', // 饭桶 · 开炉, out of its cooldown (rules/fantong.mjs)
    open: (content, state, view, now) => (fantongBrief(content, state, now)?.ready ? [{ id: 'fantong' }] : []),
    takes: verb => verb === 'fantong' },
  { kind: 'pool', // a pool's fight at the place he stands, rested (world.mjs encounterOf; 体力 is the fight's own)
    open: (content, state, view, now) => { const e = encounterOf(content, state, now); return e?.pool ? [{ id: e.game.id, title: e.creature.name }] : []; },
    takes: (verb, args) => (verb === 'duel' && String(args.id ?? '').startsWith('haunt:')) || verb === 'tame' },
  { kind: 'tide', // 兽潮, out of its cooldown (rules/shouchao.mjs)
    open: (content, state, view, now) => tasksOf(view).filter(t => t.tide && shouchaoHere(content, state, t.id, now)).map(t => ({ id: t.id, title: t.title })),
    takes: (verb, args, content) => ['win', 'task'].includes(verb) && isTide(content, String(args.id ?? '')) },
  { kind: 'seclusion', // 闭关, where the story has opened it (rules/seclusion.mjs)
    open: (content, state, view) => (view && !(view.locked ?? []).includes('seclusion') && !state.seclusion ? [{ id: 'seclusion' }] : []),
    takes: verb => verb === 'seclude' },
  { kind: 'her', // 银月's games open to him, 今日传闻 and 问卦 (rules/aigames.mjs, kao.mjs, duizi.mjs, tale.mjs, fortune.mjs)
    open: (content, state, view) => [
      ...['twenty', 'haggle', 'case', 'duizi'].filter(k => view?.[k]).map(id => ({ id })),
      ...tasksOf(view).filter(t => t.light && t.open && t.left > 0).map(t => ({ id: 'kao', title: t.title })),
      ...(view?.tale && !view.tale.dropped ? [{ id: 'tale', title: view.tale.title ?? null }] : []),
      ...(view && !view.divination && !(view.locked ?? []).includes('divine') ? [{ id: 'divine' }] : []),
    ],
    takes: verb => ['twenty', 'haggle', 'case', 'duizi', 'kao', 'tale', 'lundao', 'divine', 'fate'].includes(verb) },
];

/* Verbs that never move the story: reads, the page's own marks, the save's keeping, the shelf, the
   pouch, an errand held — and these two. */
export const ASIDE_ALWAYS = new Set(['look', 'show', 'progress', 'story', 'bag', 'gear', 'deck', 'atlas', 'saves', 'save', 'load', 'forget',
  'lang', 'summarize', 'greet', 'remember', 'appear', 'unrolled', 'unfolded', 'unstick', 'quest', 'trade', 'refine', 'aside', 'resume']);
/* Verbs that move the story, or take him elsewhere: refused while the book is set aside. */
export const ASIDE_REFUSED = new Set(['resolve', 'judge', 'move', 'go', 'travel', 'fly', 'meet', 'ring', 'make', 'enter', 'leave', 'build',
  'worlds', 'amend', 'art']);
/* Verbs some kind may take (a call each kind's `takes` answers); else refused. */
export const ASIDE_KIND_VERBS = new Set(['task', 'win', 'duel', 'tame', 'rerun', 'fantong', 'seclude', 'twenty', 'haggle', 'case', 'duizi', 'kao', 'tale',
  'lundao', 'divine', 'fate', 'mishi']);

/* What may be played now, while set aside (or, before, whether the control has anything to offer). */
export function asideOffers(content, state, view, now = new Date()) {
  return ASIDE_KINDS.flatMap(k => k.open(content, state, view, now).map(o => ({ kind: k.kind, ...o })));
}

/* The refusal for a verb while the book is set aside, or null. */
export function asideVerb(content, state, verb, args = {}) {
  if (!state?.aside || ASIDE_ALWAYS.has(verb)) return null;
  if (ASIDE_KIND_VERBS.has(verb) && ASIDE_KINDS.some(k => k.takes(verb, args, content, state))) return null;
  return held(state, verb);
}

/* ── The two verbs ── */

/* A passage key the box plays (tell.mjs keys): a scene's own, its rest after a board, a choice's. */
const KINDS = new Set(['scene', 'after', 'choice']);
const keyOk = (content, state, it) => KINDS.has(it?.of) && typeof it.id === 'string' && Boolean(asideItem(content, state, it));

/* `aside --items=[{of,id},…] --j=<beat>`: the passages still to play, from the one on show, and the beat
   shown. Refused inside a key beat's lock, with nothing to play meanwhile, or for a passage the book
   does not hold here. */
export function setAside(state, content, ctx, args = {}) {
  if (lockOf(content, state)) return refuse('locked', null);
  if (state.fight) return refuse('in-a-fight', null);
  let items = args.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return refuse('bad-items', null); } }
  items = (Array.isArray(items) ? items : []).map(it => ({ of: String(it?.of ?? ''), id: String(it?.id ?? '') }));
  if (!items.length || !items.every(it => keyOk(content, state, it))) return refuse('not-a-passage', null);
  const j = Number(args.j ?? 0);
  if (!Number.isInteger(j) || j < 0) return refuse('bad-beat', null);
  const s = clone(state);
  s.aside = { scene: state.scene, items, j, at: (ctx.now ?? new Date()).toISOString() };
  return { state: s, result: { ok: true, aside: { scene: state.scene, j } } };
}

/* `resume`: the passages again as the box plays them (both languages), from the beat set aside — its
   set piece and the ones before it not played again — and the save as before. Back at the scene's
   place if a 秘境 run set him down elsewhere. Refused inside a run (leave it first). */
export function resume(state, content, ctx) {
  const a = state.aside;
  if (!a) return refuse('not-aside', null);
  if (state.rerun) return refuse('in-run', null);
  const items = a.items.map(it => asideItem(content, state, it)).filter(Boolean);
  const s = clone(state);
  delete s.aside;
  const scene = sceneOf(content, s);
  if (scene?.at && s.place !== scene.at && placeOf(content, scene.at)) s.place = scene.at;
  if (items.length) for (const lang of ['zh', 'en']) {
    const first = items[0].beats[lang] ?? [];
    items[0].beats[lang] = first.map((b, k) => (k <= a.j && b.piece ? (({ piece, ...rest }) => rest)(b) : b));
  }
  return { state: s, result: { ok: true, scene: a.scene, j: items.length ? Math.min(a.j, Math.max(0, (items[0].beats.zh ?? []).length - 1)) : 0, items, day: dayKey(ctx.now ?? new Date()) } };
}

/* What Look carries: while set aside, where (the scene, the beat) and what may be played; before, only
   the offers — the page shows 先放一放 while there is something, never inside a key beat's lock. */
export function asideLook(content, state, view, now = new Date()) {
  if (!state.aside && lockOf(content, state)) return null;
  const offers = asideOffers(content, state, view, now);
  if (state.aside) return { aside: { on: true, scene: state.aside.scene, j: state.aside.j, offers } };
  return offers.length ? { aside: { on: false, offers } } : null;
}

