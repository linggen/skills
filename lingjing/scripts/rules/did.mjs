// rules/did.mjs — What the page did, and who has read it; and Progress.
// Part of the rules engine; rules.mjs is its one door.
//
// The page moves, tames, refines, takes and hands in by itself, and no
// model hears the tap (his law, 2026-09-24: the page shows facts, the model
// tells). So neither is ever blind, every change the page makes is written
// down in the save as one short fact — `page_did`, the newest PAGE_KEEP —
// and each reader keeps its own place in it (`page_seen`): Ling's Look and
// Progress hand over only what came after her place, and Yinyue's Progress
// only what came after hers. Reading never clears it for the other (his,
// 2026-09-24: both of them look it up when they want to).
import { pick, stepName, threshold } from '../state.mjs';
import { herPast } from './companion.mjs';
import { staminaBrief } from './daily.mjs';
import { bookOf, questOf } from './errands.mjs';
import { taleLine, taleLundao } from './tale.mjs';
import { hostedHere, lundaoBrief, lundaoName } from './tasks.mjs';
import { tasksBrief, wordsOf } from './look.mjs';
import { placeOf } from './world.mjs';

export const PAGE_KEEP = 30;

/* What was paid, in the world's words: 「+20 修为 · +10 灵石」. */
function paidLine(p, w) {
  const parts = [p?.progress ? `+${p.progress} ${w.progress}` : '', p?.wealth ? `${p.wealth > 0 ? '+' : ''}${p.wealth} ${w.wealth}` : ''].filter(Boolean);
  return parts.length ? ` (${parts.join(' · ')})` : '';
}
const titleOf = (content, id, lang) => pick(questOf(content, id)?.title, lang) ?? id;

/* One fact per verb the page runs, from its args and its answer — null
   when the call changed nothing worth telling (a bare Look, a veil lifted). */
const QUEST_DID = {
  take: (r) => `took errand ${r.title}`,
  turn: (r, a, x) => (a.id === 'tale' ? taleDid(r, x) : `handed in ${r.title}${paidLine(r.paid, x.w)}`),
  drop: (r, a, x) => (a.id === 'tale' ? TALE_DID.drop() : `put down errand ${titleOf(x.content, r.dropped, x.lang)}`),
};
const TRADE_DID = {
  buy: (r) => `bought ${r.item?.name}`,
  sell: (r) => `sold ${r.item?.name}`,
  use: (r) => (r.wear ? `put on ${r.item?.name}` : `used ${r.item?.name}`),
  remove: (r) => `took off ${r.item?.name ?? r.removed}`,
};
const MEET_DID = {
  take: (r, a, x) => (r.chance ? `took the day's chance (机缘)${r.card ? `: ${r.card.name}` : ''}${paidLine(r.paid, x.w)}` : `took what lay by the road${r.took ? `: ${r.took.name}` : ''}${paidLine(r.paid, x.w)}`),
  pass: () => 'left what lay by the road',
  choose: (r) => `chose a way at a crossroads — ${r.success ? 'it went well' : 'it went wrong'}`,
  answer: () => "answered a traveller's riddle",
};
/* 传闻 on the page: a step's board won, its riddle answered, a kept win counted. */
const taleDid = (r, x) => (r.ended ? `ended today's rumor${paidLine(r.handed?.[0]?.paid, x.w)}${r.handed?.[0]?.gives ? `, got ${r.handed[0].gives}` : ''}`
  : r.kept ? "solved the rumor's step; counted when 体力 is back" : r.step ? `the rumor's step done${paidLine(r.handed?.[0]?.paid, x.w)}; next: ${r.step.game_name} at ${r.step.at?.name}` : null);
const TALE_DID = { win: (r, a, x) => taleDid(r, x), answer: (r, a, x) => taleDid(r, x), turn: (r, a, x) => taleDid(r, x), drop: () => "put today's rumor down" };
const byAction = (table) => (r, a, x) => table[a.action ?? 'take']?.(r, a, x) ?? null;

const PAGE_DID = {
  move: (r) => (r.here ? null : `moved to ${r.place?.name}${r.via?.length ? ` via ${r.via.map(p => p.name).join(', ')}` : ''}${r.stopped ? ', stopped where a scene took over' : ''}`),
  tame: (r) => `tamed ${r.tamed?.name} with ${r.fed?.name}`,
  refine: (r) => `refined 本命法宝 「${r.treasure?.name}」 from ${r.refined?.from} with ${r.refined?.with}`,
  quest: byAction(QUEST_DID),
  task: (r, a, x) => (a.action === 'done' ? `practice ${r.done} done${paidLine(r.paid, x.w)}` : a.action === 'check' ? `app task ${r.quest} paid${paidLine(r.paid, x.w)}` : null),
  trade: byAction(TRADE_DID),
  meet: byAction(MEET_DID),
  tale: (r, a, x) => TALE_DID[a.action]?.(r, a, x) ?? null,
};

/* The page's change, written down on the state it wrote: a fresh copy with
   the fact appended (the newest PAGE_KEEP kept), or null when there is none. */
export function notePage(verb, args, result, next, content, now) {
  if (!next || !result?.ok) return null;
  const x = { content, lang: next.lang, w: wordsOf(content, next.lang) };
  const what = PAGE_DID[verb]?.(result, args, x);
  if (!what) return null;
  const n = (next.page_n ?? 0) + 1;
  const entry = { n, at: now.toISOString(), verb, what };
  return { ...next, page_n: n, page_did: [...(next.page_did ?? []), entry].slice(-PAGE_KEEP) };
}

/* What this reader has not seen yet, as {at, verb, what} — the newest
   `keep` of them. */
export function unseen(state, reader, keep = PAGE_KEEP) {
  const since = state?.page_seen?.[reader] ?? 0;
  return (state?.page_did ?? []).filter(e => e.n > since).slice(-keep).map(({ at, verb, what }) => ({ at, verb, what }));
}

/* Move the reader's place to the newest fact, in place; true when it moved. */
export function markSeen(state, reader) {
  const last = state?.page_did?.at(-1)?.n ?? 0;
  if (!last || (state.page_seen?.[reader] ?? 0) >= last) return false;
  state.page_seen = { ...state.page_seen, [reader]: last };
  return true;
}

/* Which verbs hand a reader what the page did, and how much: Ling's Look
   all she has not seen; Progress, for anyone who says who they are, the last
   few — Yinyue is a pet, not a clerk. */
export const READS_PAGE = {
  look: { who: (reader) => reader === 'ling', keep: PAGE_KEEP },
  progress: { who: (reader) => Boolean(reader), keep: 5 },
};

/* 论道 open where the player stands, for Yinyue to help with (his, 2026-09-24:
   play WITH AI — she helps, never answers): the form, what the player must
   answer to (飞花令's keyword, 成语接龙's last idiom, 对联's upper line) and the
   misses — only what the player has been shown; never the rules' model line. */
const LUNDAO_HELP = 'If the player asks your help: give a hint or one or two candidate lines in your own words; never answer for them — they give their answer to the host themselves.';
function lundaoHelp(content, state, now) {
  const board = hostedHere(content, state, 'lundao') ? lundaoBrief(content, state, now) : null;
  const open = board?.outcome === 'open' ? { game: board.game, prompt: board.prompt, last: board.last, misses: board.misses, max_misses: board.max_misses } : taleLundao(content, state);
  if (!open) return null;
  return { form: lundaoName(open.game, state.lang), prompt: open.game === 'chengyu' ? open.last : open.prompt, misses: `${open.misses}/${open.max_misses}`, help: LUNDAO_HELP };
}

/* Progress — the game in a few lines, for Yinyue (or Ling): the realm, the
   pool, where the player stands, the errands in hand, today's practice, and
   what the page did since the reader last asked (rules.mjs adds `page_did`).
   A read: it changes nothing but the reader's place in the log. */
export function progress(state, content, ctx) {
  const lang = state.lang, here = placeOf(content, state.place);
  const st = staminaBrief(content, state, ctx.now);
  const { tasks, quests, kaifu } = tasksBrief(content, state, ctx);
  const lundao = lundaoHelp(content, state, ctx.now);
  return {
    state: null,
    result: {
      ok: true, name: state.name ?? null,
      tier: stepName(content, state.tier, state.step, lang), progress: state.progress, next: threshold(content, state),
      stamina: { now: st.now, max: st.max, ...(st.empty ? { empty: true, rest_at: st.rest_at } : {}) },
      place: here ? { id: here.id, name: pick(here.name, lang) } : null,
      book: bookOf(content, state, lang, ctx).map(b => ({ title: b.title, ready: b.ready })),
      tale: taleLine(content, state, ctx.now),
      practice: { done: tasks.filter(t => t.paid).map(t => t.title), left: tasks.filter(t => !t.paid).map(t => t.title) },
      // 人间功课: today's (the workout and the day's one pick), and 开府 as n/of.
      chores: { today: quests.map(q => ({ title: q.title, device: q.device, done: q.done, paid: q.paid })), ...(kaifu ? { kaifu: `${kaifu.done}/${kaifu.of}` } : {}) },
      // Her own past as far as the cauldrons have given it back, and where she stands (companion.mjs § 她的来处).
      her: herPast(content, state),
      ...(lundao ? { lundao } : {}),
    },
  };
}
