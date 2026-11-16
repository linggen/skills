// world.js — what CFO gives the world block (SKILL.md `world-line`). Pure.
//
// Every agent in every session reads this line, so it holds NO money fact: no
// amount, no balance, no holding, no spend, no account name, no file name, no
// merchant — and no count that is itself a reading of the person's finances
// (open alerts, over-budget categories). It says only that the ledger is kept
// current: the day of the last import and how much of it there is.
//
//   cfo: last import 2026-11-12 · imports 14 · sources 3 · 4d ago
//
// `imports` is the imports still in force (not undone); `sources` is the
// distinct accounts they came into, as a number — never their names.

const pad = (n) => String(n).padStart(2, '0');

/// The local calendar day of an ISO time, `YYYY-MM-DD`, or null.
const dayOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/// The world file's body from the import log (data/imports.json). `{}` when no
/// import is in force.
export function worldOf(log) {
  const live = (Array.isArray(log) ? log : []).filter((e) => e && typeof e === 'object' && !e.reverted && dayOf(e.at));
  if (!live.length) return {};
  const newest = live.map((e) => Date.parse(e.at)).reduce((a, b) => Math.max(a, b));
  return {
    last_import: dayOf(newest),
    imports: live.length,
    sources: new Set(live.map((e) => e.account).filter(Boolean)).size,
  };
}
