// rules/power.mjs — P(L), a fighter's power at level L (batch 3, Hanli 2026-11-10: 「所有和数值相关的都应该有公式推到, 不能手动定」):
// P(L) = first × growth^(L−1) × realm^realm — the same shape as R(L) (playpay.mjs) and I(L) (income.mjs); L = realm × 9 + 层.
// P₁ = 21: 练气一层's 气血 as it was. His 气血 at full is P(his level) (rules/cards.mjs hpMaxOf); a beast's its class share of his
// realm's row × P(its level) ÷ P(his). The fight itself is reckoned in his units (battle.js § unitOf) — so a hero and a beast of
// one level fight 练气一层's fight (of his realm), turn for turn, whatever the level — and every number of it is shown × P(his
// level) ÷ his realm's anchor (rules/cards.mjs anchorOf · unitAt). A beast a level apart: P's ratio on its 气血 and its blows.
// 零层 (L0, before 入门) is outside the 81 levels: no level is given to its fights (`atLevel` null) and they keep today's numbers.
// Pure (no imports). The knobs: balance.json `power` ({first, growth, realm, things}), from master.fight.power (tools/master.mjs).

/* A level's realm (its index on the ladder): 练气 1–9 is 0, 筑基 10–18 is 1… */
export const realmOf = L => (L > 0 ? Math.floor((L - 1) / 9) : 0);
/* P(L) on the knobs `x`, unrounded; null at L0 or without knobs (a fight on the old numbers). */
export function powerOf(x, L) {
  if (!x || !(L >= 1)) return null;
  return x.first * x.growth ** (L - 1) * (x.realm ?? 1) ** realmOf(L);
}
/* P(L) ÷ P₁ (1 at 练气一层; 1 with no level): how much more a thing of level L is than one of 练气一层. */
export const factorOf = (x, L) => { const p = powerOf(x, L); return p == null ? 1 : p / x.first; };
/* The knobs as the rules read them. */
export const powerKnobs = content => content?.balance?.power ?? null;
/* The level a fight stands at for a side, null off the 81 (零层) or without knobs. */
export const atLevel = (content, L) => (powerKnobs(content) && L >= 1 ? L : null);
/* clamp(L, band): a repeatable beast meets him at his own level held inside its place's band ([min, max]); a band of none, his. */
export const clampTo = (L, band) => (Array.isArray(band) && band.length === 2 ? Math.min(band[1], Math.max(band[0], L)) : L);
