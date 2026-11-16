// tools/playbot/spoils.mjs — what a settled fight owes the player's eye: the one rule the bot's `no-spoils` check and
// the page's 所得 sheet must agree on.
//
// The page opens 所得 after a duel only when the rules' answer carries something to show (lingjing.js, onDuelDone: `got`,
// `own`, `vary`, `spent` → `if (got.length || paid || spent.length) keep({ spoils … })`). A win that paid nothing opens
// none: the story fights of the first chapter (the fox, 蠪侄) pay no 修为 and carry no loot, so they leave a 符 on one
// win in three (rewards.json `growth.charm.fight_one_in`, rolled by the day and the save's seed) and otherwise nothing
// — a run on a fresh save meets that roll every time, which is why `no-spoils` came and went between sizes and runs
// (2026-11-16, three false findings in one run: the rules had paid nothing in each, verbs.jsonl).
// So the bot asks for a sheet exactly when the rules paid something. A win that paid and showed none is still hard.
//
// If the page's gate changes, change this with it (tests/playbot-spoils.test.mjs holds the pair together).

/** What a won fight's settle answer (`duel --picks` output) paid, as the page would show it, or null when it paid nothing. */
export function owedOf(out) {
  if (!out || out.outcome !== 'won') return null;
  const things = (out.dropped ?? []).filter((d) => !d.offered);
  const paid = out.paid?.progress || out.paid?.wealth ? out.paid : null;
  const variety = out.variety?.paid ?? null; // 变着花样: a win at a haunt, its pay joins the sheet
  const spent = out.spent ?? [];
  if (!things.length && !paid && !variety && !spent.length) return null;
  return {
    ...(things.length ? { dropped: things.map((d) => d.id ?? d.name) } : {}),
    ...(paid ? { paid } : {}),
    ...(variety ? { variety } : {}),
    ...(spent.length ? { spent: spent.map((x) => (typeof x === 'string' ? x : x?.id ?? x?.name)) } : {}),
  };
}
