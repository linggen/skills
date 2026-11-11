// rules/income.mjs — I(L), the 灵石 a minute of play is worth at level L (batch 2, Hanli 2026-11-10: 「所有和数值相关的都应该有公式
// 推到, 不能手动定」): I(L) = first × growth^(L−1) × realm^realm, the same shape as R(L) — L = realm × 9 + 层, 零层 read at L1.
// Pure (no imports): the one formula, read by rules/playpay.mjs (stonesAt, every 灵石 grant), rules/fantong-roll.mjs (开炉's
// worth) and tools/master.mjs (every price). The knobs: balance.json `economy.income`, from master.economy.income.

/* A level's realm (its index on the ladder): 练气 1–9 is 0, 筑基 10–18 is 1… */
export const realmOfLevel = L => (L > 0 ? Math.floor((L - 1) / 9) : 0);
/* I(L) on the knobs `x` ({first, growth, realm}), unrounded; 0 where there are none. */
export function incomeOf(x, level) {
  if (!x) return 0;
  const L = Math.max(1, level ?? 1);
  return x.first * x.growth ** (L - 1) * (x.realm ?? 1) ** realmOfLevel(L);
}
