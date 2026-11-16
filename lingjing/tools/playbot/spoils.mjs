// tools/playbot/spoils.mjs — what a won fight owes the player's eye: the bot's `no-spoils` rule.
//
// The rule (design.md § 所得, the builder 2026-11-16: 「无论奖励什么都要显示出来」): after a won fight, ONE 所得 card shows what the
// win gave — the fight's settle (`duel --picks`: dropped, spent, paid, a haunt's variety) and, for a story fight, the
// story step after it (`resolve --exit`: its paid and cards, and Look's `gained`, which carries a cultivation stretch's
// whole 修为). What is owed must be on that one card, by name and amount; a story win that gave nothing owes no card
// (the bot lists it as `story-win-empty`: from 入门 on every story fight is meant to pay something — the prologue is
// exempt, the builder 2026-11-16: before 00-waimen 「你还是个凡人」 and nothing is owed, see inPrologue). A field fight's
// win always stands on a card (the page's settle sheet), as before.

const named = (x) => (typeof x === 'string' ? x : x?.name ?? x?.id ?? '');

/** What a settle answer gave, as the card names it: things, cards, spent, 修为, 灵石. Null when not a win's or not an answer. */
export function settleGave(out) {
  if (!out || out.outcome !== 'won') return out?.spent?.length ? { things: [], cards: [], spent: out.spent.map(named), progress: 0, wealth: 0 } : null;
  const dropped = (out.dropped ?? []).filter((d) => !d.offered);
  // 变着花样 (a haunt's): its 修为 joins the card's pays (lingjing.js varietyOwed · withVariety); its own line says the rest.
  const variety = out.variety?.paid ?? {};
  return {
    things: dropped.filter((d) => !d.card).map(named),
    cards: dropped.filter((d) => d.card).map(named),
    spent: (out.spent ?? []).map(named),
    progress: (out.paid?.progress ?? 0) + (variety.progress ?? 0),
    wealth: out.paid?.wealth ?? 0,
  };
}

/** What the story step after a won fight gave: Look's `gained` when it is this step's (the whole stretch's 修为), else the
 *  resolve's own `paid`; the cards it handed (`cards`). */
export function stepGave(step) {
  if (!step) return null;
  const g = step.gained ?? null, p = step.paid ?? {};
  return {
    things: g ? (g.items ?? []).map(named) : p.item ? [named(p.item)] : [],
    cards: (step.cards ?? []).map(named),
    spent: [],
    progress: g ? g.progress ?? 0 : p.progress ?? 0,
    wealth: g ? g.wealth ?? 0 : p.wealth ?? 0,
  };
}

const isEmpty = (o) => !o.things.length && !o.cards.length && !o.spent.length && !o.progress && !o.wealth;

/** What a won fight owes the card: the settle's and the step's, added. Null when the win gave nothing at all. */
export function owedOf(settle, step = null) {
  const a = settleGave(settle), b = stepGave(step);
  if (!a && !b) return null;
  const parts = [a, b].filter(Boolean);
  const sum = (k) => parts.reduce((n, o) => n + (o[k] ?? 0), 0);
  const all = (k) => parts.flatMap((o) => o[k]).filter(Boolean);
  const owed = { things: all('things'), cards: all('cards'), spent: all('spent'), progress: sum('progress'), wealth: sum('wealth') };
  return isEmpty(owed) ? null : owed;
}

/** Each owed thing as the card must say it: a name, or 修为 / 灵石 with its amount. */
export function owedLines(owed) {
  if (!owed) return [];
  return [
    ...owed.things, ...owed.cards, ...owed.spent,
    ...(owed.progress ? [`修为 +${owed.progress}`] : []),
    ...(owed.wealth ? [`灵石 +${owed.wealth}`] : []),
  ];
}

const AMOUNT = { 修为: '(修为|Cultivation)', 灵石: '(灵石|Spirit stones)' };
/** The owed lines a card's text does not show. An amount is read loosely (「修为 +20 · 灵石 +20」, en words too). */
export function missingOn(owed, text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  return owedLines(owed).filter((line) => {
    const m = /^(修为|灵石) \+(\d+)$/.exec(line);
    if (m) return !new RegExp(`${AMOUNT[m[1]]}\\s*\\+\\s*${m[2]}(?!\\d)`, 'i').test(t);
    return !t.includes(line);
  });
}

/** The story step a won fight led to, read off the Verb door's log from `from` on: the first resolve that took a way
 *  (`took`), and Look's `gained` read after it when it is new (its `n` counts up on each step that gave something). */
export function stepAfter(verbs, from) {
  const i = verbs.findIndex((v, k) => k >= from && v.verb === 'resolve' && v.out?.ok && v.out.took);
  if (i < 0) return null;
  const before = verbs.slice(0, i).findLast((v) => v.verb === 'look' && v.out?.ok !== false)?.out?.gained?.n ?? null;
  const after = verbs.slice(i + 1).find((v) => v.verb === 'look' && v.out?.ok !== false)?.out ?? null;
  const gained = after?.gained && after.gained.n !== before ? after.gained : null;
  const r = verbs[i].out;
  return { exit: r.took, paid: r.paid ?? null, cards: r.cards ?? [], gained, read: Boolean(after) };
}

/** Was the prologue's lock in force at the fight (the last Look before verb `at`: its `locked` names 'cultivation' —
 *  00-prologue chapter.json, until 00-waimen)? Then a story win that gave nothing is by design: no `story-win-empty`. */
export function inPrologue(verbs, at) {
  const look = verbs.slice(0, Math.max(0, at)).findLast((v) => v.verb === 'look' && v.out?.ok !== false)?.out;
  return Boolean(look?.locked?.includes('cultivation'));
}
