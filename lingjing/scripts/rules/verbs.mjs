// rules/verbs.mjs — The verb table, quest and show.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, fill, pick } from '../state.mjs';
import { artBrief, artOf, refine } from './arms.mjs';
import { deck } from './cards.mjs';
import { clone, judge, paysOf, refuse, resolve, setRiddleAside } from './core.mjs';
import { choreGrant, kaifuList } from './chores.mjs';
import { greet } from './daily.mjs';
import { BOOK_MAX, bookOf, complete, countsOf, gearBrief, HANDED_KEEP, handedOne, itemOf, noticeAt, noticeOf, questDoneBefore, questOf, questReady } from './errands.mjs';
import { meet } from './road.mjs';
import { progress } from './did.mjs';
import { divine, fate } from './fortune.mjs';
import { look, stageAt } from './look.mjs';
import { duel, lundao, questCheck, task, win } from './tasks.mjs';
import { tale, taleInfo } from './tale.mjs';
import { go, lang, move, summarize, trade } from './travel.mjs';
import { placeName, placeOf } from './world.mjs';
import { amend, art, atlas, build, enter, forget, leave, load, make, ring, save, saves, tame, travel, wake, worlds } from './worlds.mjs';

export const VERBS = {
  look: (s, c, x) => {
    const woke = wake(s, c, x);
    // An art taught on waking (a companion from before the arts) is said once.
    const learned = woke ? (woke.arts ?? []).filter(id => !(s.arts ?? []).includes(id)).map(id => artBrief(c, woke, artOf(c, id))) : [];
    const aside = setRiddleAside(c, woke ?? s, x) ?? woke;
    const result = { ...look(aside ?? s, c, x), ...(learned.length ? { learned } : {}) };
    // Said once: the call is marked told the moment it is handed over.
    let next = aside;
    if (result.quest?.say) {
      next = clone(aside ?? s);
      next.companion = { ...next.companion, told: true };
    }
    return { state: next, result };
  },
  resolve, judge, task, win, duel, tame, refine, tale, summarize, move, trade, lang, make, enter, leave, build, worlds, travel, amend, art,
  go, saves, save, load, forget, atlas, divine, fate, ring, show, quest, meet, greet, deck, lundao, progress,
  gear: (s, c) => ({ state: null, result: { ok: true, gear: gearBrief(c, s) } }),
};

/* Quest — 接下 · 交差 · 撂下 (design.md § 差事). The world's errands, taken by
   the player and counted by the rules. `take` at the giver; `turn` wherever he
   stands, the moment the counts are met; `drop` is WoW's abandon, no penalty. */
export function quest(state, content, ctx, args) {
  const id = String(args.id ?? ''), lang = state.lang;
  const action = String(args.action ?? 'take');
  // The day's 传闻 rides the book as one line (tale.mjs): its row opens, is put down, or a kept win is counted.
  if (id === 'tale') return taleQuest(state, content, ctx, action);
  // The page's own reading of one line: everything a row expands to. It is
  // asked for on a tap and never rides Look, so it costs Ling nothing (his,
  // 2026-09-21: what the page knows it shows — the model is for telling).
  if (action === 'info') return { state: null, result: questInfo(state, content, ctx, id) };
  // 开府 in full, for the page's own section — a read, never on Look.
  if (action === 'kaifu') return { state: null, result: { ok: true, kaifu: kaifuList(state, ctx.quests ?? [], ctx.now, lang) } };
  // A 功课 is handed in with the same word as any errand; its app is the witness.
  if (action === 'turn' && (ctx.quests ?? []).some(x => x.id === id)) return choreTurn(state, content, ctx, id);
  const q = questOf(content, id);
  if (!q) return refuse('no-such-quest', null, { book: bookOf(content, state, lang, ctx) });
  const s = clone(state);
  s.quests ??= {};

  if (action === 'drop') {
    if (!s.quests[id] || questDoneBefore(s, id)) return refuse('not-taken', null);
    delete s.quests[id];
    return { state: s, result: { ok: true, dropped: id, book: bookOf(content, s, lang, ctx) } };
  }

  if (action === 'take') {
    if (s.quests[id]) return refuse(questDoneBefore(s, id) ? 'already-done' : 'already-taken', null);
    if (q.from?.place !== s.place) return refuse('not-here', null, { at: placeName(content, s, placeOf(content, q.from.place)) });
    if (q.opens?.after && !questDoneBefore(s, q.opens.after)) return refuse('not-yet', null);
    if (Object.keys(s.quests).filter(x => !questDoneBefore(s, x)).length >= BOOK_MAX) {
      return refuse('book-full', pick({ zh: `手上已有${BOOK_MAX}件事，先了一件。`, en: `Three things are already in hand — finish one first.` }, lang), { book: bookOf(content, s, lang, ctx) });
    }
    if (q.notice && noticeAt(content, s, ctx.now)?.id !== id) return refuse('not-posted', null);
    // A notice done on an earlier day has nothing left to say: the save keeps today's only.
    for (const old of Object.keys(s.quests)) if (noticeOf(content, old) && questDoneBefore(s, old) && noticeOf(content, old).day !== q.day) delete s.quests[old];
    s.quests[id] = { took: dayKey(ctx.now), have: {} };
    return { state: s, result: { ok: true, took: id, title: pick(q.title, lang), book: bookOf(content, s, lang, ctx) } };
  }

  if (action !== 'turn') return refuse('unknown-action', null, { actions: ['take', 'turn', 'drop', 'info', 'kaifu'] });
  if (!s.quests[id]) return refuse('not-taken', null);
  if (questDoneBefore(s, id)) return refuse('already-done', null);
  if (!questReady(content, s, q)) return refuse('not-done', null, { need: countsOf(content, s, q).map(n => ({ kind: n.kind, have: n.have, n: n.n })) });
  // What the need consumed: a `carry` hands the thing over.
  const h = complete(content, s, ctx, id, q);
  s.handed = [...(s.handed ?? []), h].slice(-HANDED_KEEP);
  const told = handedOne(content, s, h);
  return { state: s, result: { ok: true, turned: id, title: told.title, paid: h.paid, book: bookOf(content, s, lang, ctx),
    ...(told.next ? { then: told.next } : {}) } };
}

function taleQuest(state, content, ctx, action) {
  if (action === 'info') return { state: null, result: taleInfo(content, state, ctx) };
  return ['drop', 'turn'].includes(action) ? tale(state, content, ctx, { action }) : refuse('unknown-action', null, { actions: ['info', 'drop', 'turn'] });
}

function questInfo(state, content, ctx, id) {
  const lang = state.lang, row = bookOf(content, state, lang, ctx).find(b => b.id === id);
  const chore = (ctx.quests ?? []).find(x => x.id === id);
  // `grant` is what was authored; `pays` is what lands — caps, roots, the
  // day's cast and the tier counted (the card shows `pays`).
  if (chore) {
    const { table, ...grant } = choreGrant(content, chore);
    return { ok: true, id, kind: 'chore', title: pick(chore.title, lang), app: chore.app, period: chore.period, device: chore.device ?? null, grant,
      pays: { ...paysOf(content, state, ctx.now, { table, ...grant }), stamina: grant.stamina }, ...(row ? { need: row.need, ready: row.ready } : {}) };
  }
  const q = questOf(content, id);
  if (!q) return { ok: false, refused: 'no-such-quest' };
  const next = q.then ? questOf(content, q.then) : null;
  return { ok: true, id, kind: 'errand', title: pick(q.title, lang), who: q.from.who ? pick(q.from.who, lang) : null, say: fill(pick(q.say, lang), state),
    from: placeName(content, state, placeOf(content, q.from.place)), grant: q.grant, pays: paysOf(content, state, ctx.now, q.grant), taken: Boolean(row),
    ...(row ? { need: row.need, where: row.where, ready: row.ready } : { need: q.need.map(n => ({ kind: n.kind, have: 0, n: n.n })) }),
    ...(q.grant?.item ? { gives: pick(itemOf(content, q.grant.item)?.name, lang) } : {}),
    // `then` is the wrapper's word to Ling on every result; the next link is `next`.
    ...(next ? { next: pick(next.title, lang) } : {}) };
}

function choreTurn(state, content, ctx, id) {
  const checked = questCheck(state, content, ctx, id);
  if (!checked.state) return checked;
  const q = ctx.quests.find(x => x.id === id);
  return { state: checked.state, result: { ...checked.result, turned: id, title: pick(q.title, state.lang), book: bookOf(content, checked.state, state.lang, ctx) } };
}

/* Show — the cards Ling puts before the player, WRITTEN DOWN. It was a
   declarative tool until 2026-09-18: the page read the call off the chat
   stream and nobody else ever knew what stood on the stage, so the rules could
   not keep the question off it and a reload wiped it. Now the save holds it,
   which is what lets one reading serve both sides (his law: a widget stands in
   the chat or on the stage, both are told, only one shows it).

   Kept for the scene it was shown at, so walking away clears the stage by
   itself. */
export function show(state, content, ctx, args) {
  let cards = args.cards ?? [];
  if (typeof cards === 'string') { try { cards = JSON.parse(cards); } catch { return refuse('bad-cards', null); } }
  cards = (Array.isArray(cards) ? cards : []).filter(c => c && typeof c.card === 'string').map(c => ({ ...c }));
  if (!cards.length) return refuse('no-cards', null);
  const s = clone(state);
  s.shown = cards;
  s.shown_at = stageAt(content, s);
  return { state: s, result: { ok: true, shown: cards } };
}
