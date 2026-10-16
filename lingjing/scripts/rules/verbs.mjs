// rules/verbs.mjs — The verb table, quest and show.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, fill, pick } from '../state.mjs';
import { artBrief, artOf, refine } from './arms.mjs';
import { deck } from './cards.mjs';
import { clone, judge, paysOf, refuse, resolve, setRiddleAside } from './core.mjs';
import { choreGrant, isOnce, kaifuAfter, kaifuList, kaifuOpen } from './chores.mjs';
import { greet } from './daily.mjs';
import { afterMet, layerMet, awayLine, BOOK_MAX, bookOf, complete, countsOf, gearBrief, HANDED_KEEP, handedOne, itemOf, mootQuest, noticeAt, noticeOf, questDoneBefore, questOf, questReady, withGiver } from './errands.mjs';
import { meet } from './road.mjs';
import { grantPass } from './world.mjs';
import { remember } from './ledger.mjs';
import { PAGE_OWNS, showable } from '../stage.mjs';
import { bag } from './pouch.mjs';
import { progress } from './did.mjs';
import { divine, fate } from './fortune.mjs';
import { gated } from './locks.mjs';
import { look, stageAt } from './look.mjs';
import { examine } from './examine.mjs';
import { fantong, fantongOpen, fantongRecipes } from './fantong.mjs';
import { mishi } from './mishi.mjs';
import { duel, lundao, questCheck, task, win } from './tasks.mjs';
import { seclude } from './seclusion.mjs';
import { caseVerb, haggle, twenty } from './aigames.mjs';
import { duizi } from './duizi.mjs';
import { rerun } from './rerun.mjs';
import { unstick } from './unstick.mjs';
import { story } from './story.mjs';
import { tale, taleInfo } from './tale.mjs';
import { go, lang, move, summarize, trade } from './travel.mjs';
import { placeName, placeOf } from './world.mjs';
import { fly, inkMapOf, jiudingBrief, unfolded, unrolled } from './inkmap.mjs';
import { amend, art, atlas, build, enter, forget, leave, load, make, ring, save, saves, tame, travel, wake, worlds } from './worlds.mjs';

/* Every verb kept to the story gates (rules/locks.mjs): a shut system's verb is refused `not-yet`. */
export const VERBS = gated({
  look: (s, c, x, args = {}) => {
    // `--at`: look at one thing in the scene (看, rules/examine.mjs) — free, written on the save.
    if (args.at != null) return examine(s, c, x, args);
    // `--day` (the page's preview of a festival, and tests) moves only `today`.
    if (args.day) x = { ...x, day: args.day };
    const woke = wake(s, c, x);
    // An art taught on waking (a companion from before the arts) is said once.
    const learned = woke ? (woke.arts ?? []).filter(id => !(s.arts ?? []).includes(id)).map(id => artBrief(c, woke, artOf(c, id))) : [];
    const aside = setRiddleAside(c, woke ?? s, x) ?? woke;
    // 九鼎 home (rules/inkmap.mjs): the page plays 鼎归 · 地图晕开 when the list grows.
    const jiuding = jiudingBrief(c, aside ?? s);
    const result = { ...look(aside ?? s, c, x), ...(learned.length ? { learned } : {}), ...(jiuding ? { jiuding } : {}) };
    // Said once: the call is marked told the moment it is handed over.
    let next = aside;
    if (result.quest?.say) {
      next = clone(aside ?? s);
      next.companion = { ...next.companion, told: true };
    }
    return { state: next, result };
  },
  resolve, judge, task, win, duel, tame, refine, tale, summarize, move, trade, lang, make, enter, leave, build, worlds, travel, amend, art,
  go, saves, save, load, forget, divine, fate, ring, show, quest, meet, greet, deck, lundao, progress, seclude, bag, fantong, rerun,
  // AI mini-games (rules/aigames.mjs): 二十问 (银月's), 讨价还价 and 断案 (Ling's).
  twenty, haggle, case: caseVerb,
  // 对对子 (rules/duizi.mjs): the page opens and submits, Ling grades, 银月 hints and offers.
  duizi,
  // 录 shows the 饭桶's 方子 found so far (rules/fantong.mjs).
  story: (s, c, x, args) => {
    const out = story(s, c, x, args), found = out.result?.ok ? fantongRecipes(c, s) : [];
    return found.length ? { ...out, result: { ...out.result, fantong: found } } : out;
  },
  // `fantong`: the 物品 panel's 饭桶 chip shows once he holds it.
  gear: (s, c, x) => ({ state: null, result: { ok: true, gear: { ...gearBrief(c, s, x?.now), ...(fantongOpen(c, s) ? { fantong: true } : {}) } } }),
  appear, remember, unstick,
  // 密室 (rules/mishi.mjs): the hidden room — the page's taps checked by the rules; `info` is anyone's.
  mishi,
  // The page's map: each province's places, and the 九州 in ink as the save stands (rules/inkmap.mjs).
  atlas: (s, c, x, args) => {
    const out = atlas(s, c, x, args), ink = inkMapOf(c, s, x.now);
    return ink ? { ...out, result: { ...out.result, ink: { ...ink, shapes: c.world.atlas.shapes ?? {}, ...(c.world.atlas.paint ? { paint: c.world.atlas.paint } : {}) } } } : out;
  },
  fly, unrolled, unfolded,
});

/* A beast's first sight (creatures.json `appear`) played on the page's stage
   — the page's alone: kept on the save, so every later meeting shows one line. */
function appear(state, content, ctx, args) {
  const id = String(args.id ?? '');
  if (!content.creatures.creatures.some(c => c.id === id && c.appear)) return refuse('no-appear', null);
  if ((state.appeared ?? []).includes(id)) return { state: null, result: { ok: true, appeared: id, seen: true } };
  const s = clone(state);
  s.appeared = [...(state.appeared ?? []), id];
  return { state: s, result: { ok: true, appeared: id } };
}

/* Quest — 接下 · 交差 · 撂下 (design.md § 差事). The world's errands, taken by
   the player and counted by the rules. `take` at the giver; `turn` wherever he
   stands, the moment the counts are met (a person's, where that person is); `drop` is WoW's abandon, no penalty. */
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
  if (action === 'kaifu') return { state: null, result: { ok: true, kaifu: kaifuList(state, ctx.quests ?? [], ctx.now, lang, content) } };
  // 跳过 on the open 开府 milestone (Hanli, 2026-10-15: never stuck): no pay, the next opens tomorrow.
  if (action === 'skip') return kaifuSkip(state, content, ctx, id);
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
    if (mootQuest(s, q)) return refuse('already-done', null);
    if (q.opens?.after && !afterMet(content, s, q.opens.after)) return refuse('not-yet', null);
    // 打妖的红牌，五层以下，不许揭 (古七): a layer the tag asks.
    if (!layerMet(content, s, q)) return refuse('not-yet', pick({ zh: '打妖的红牌，五层以下，不许揭。', en: 'A red tag for beast work: below the fifth layer, no one may take it.' }, lang));
    if (Object.keys(s.quests).filter(x => !questDoneBefore(s, x)).length >= BOOK_MAX) {
      return refuse('book-full', pick({ zh: `手上已有${BOOK_MAX}件事，先了一件。`, en: `Three things are already in hand — finish one first.` }, lang), { book: bookOf(content, s, lang, ctx) });
    }
    // One 令 at a time (执事堂, 2026-10-15): the next waits until the first is spent.
    if (q.pass && s.pass) return refuse('pass-held', pick({ zh: '腰里已挂着一块令。先把那一件了了，再来揭。', en: 'A pass already hangs at your belt. See that one through before you take another.' }, lang));
    if (q.notice && noticeAt(content, s, ctx.now)?.id !== id) return refuse('not-posted', null);
    // A notice done on an earlier day has nothing left to say: the save keeps today's only.
    for (const old of Object.keys(s.quests)) if (noticeOf(content, old) && questDoneBefore(s, old) && noticeOf(content, old).day !== q.day) delete s.quests[old];
    s.quests[id] = { took: dayKey(ctx.now), have: {} };
    // A 执事堂 task below the mountain hangs its 令 on him: the road to that one place opens (world.mjs grantPass).
    grantPass(content, s, q, ctx.now);
    return { state: s, result: { ok: true, took: id, title: pick(q.title, lang), book: bookOf(content, s, lang, ctx) } };
  }

  if (action !== 'turn') return refuse('unknown-action', null, { actions: ['take', 'turn', 'drop', 'info', 'kaifu', 'skip'] });
  if (!s.quests[id]) return refuse('not-taken', null);
  if (questDoneBefore(s, id)) return refuse('already-done', null);
  if (!questReady(content, s, q)) return refuse('not-done', null, { need: countsOf(content, s, q).map(n => ({ kind: n.kind, have: n.have, n: n.n })) });
  if (!withGiver(s, q)) return refuse('not-with-giver', awayLine(content, s, q), { at: placeName(content, s, placeOf(content, q.from.place)) });
  // What the need consumed: a `carry` hands the thing over.
  const h = complete(content, s, ctx, id, q);
  s.handed = [...(s.handed ?? []), h].slice(-HANDED_KEEP);
  const told = handedOne(content, s, h);
  // What the errand found (`seen`: the 香烛铺's ledger) comes back with the hand-in — the page shows it then.
  return { state: s, result: { ok: true, turned: id, title: told.title, paid: h.paid, book: bookOf(content, s, lang, ctx),
    ...(q.seen ? { seen: fill(pick(q.seen, lang), s, content) } : {}), ...(told.next ? { then: told.next } : {}) } };
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
    const { table, ...grant } = choreGrant(content, chore, state);
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

/* 跳过: the open 开府 milestone set aside — it pays nothing, comes back at the
   end of the order, and done in real life may still be handed in any day. */
function kaifuSkip(state, content, ctx, id) {
  const quests = ctx.quests ?? [];
  if (!quests.some(q => q.id === id && isOnce(q))) return refuse('unknown-quest', null);
  if (kaifuOpen(state, content, quests, ctx.now).open?.id !== id) return refuse('not-open', null);
  const s = clone(state);
  s.kaifu = kaifuAfter(state, content, quests, ctx.now, id, true);
  return { state: s, result: { ok: true, skipped: id, kaifu: kaifuList(s, quests, ctx.now, state.lang, content) } };
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
  // The panel, the people, the goal… are the page's own (stage.mjs PAGE_OWNS):
  // shown by Ling too they stood twice (2026-09-29). Dropped, and she is told.
  const dropped = cards.filter(c => PAGE_OWNS.has(c.card)).map(c => c.card);
  cards = cards.filter(showable);
  const told = dropped.length ? { dropped, why: 'the page draws these itself' } : {};
  if (!cards.length) return { state, result: { ok: true, shown: [], ...told } };
  const s = clone(state);
  s.shown = cards;
  s.shown_at = stageAt(content, s);
  return { state: s, result: { ok: true, shown: cards, ...told } };
}
