// live-data.mjs — read the live CFO data the way the page does.
//
// Accounts, rules, budgets and reverts live in the edit register
// (data/edits.json, see scripts/lww.js); `accounts.json` is retired and only
// seeds the register when an old install still has one. Rows the register
// reverted are not in the report, so they are not in what a test compares.
//
// Returns null when there is no live ledger — callers SKIP, never crash.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Register, overridesOf, budgetsOf, commitmentsOf, accountsOf, activeRows, seedFromLegacy } from '../../scripts/lww.js';

export const DATA = join(process.env.HOME, '.linggen/skills/cfo/data');

const readJson = (path, fallback) => {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; } catch { return fallback; }
};

export function loadLive(data = DATA) {
  const dir = join(data, 'ledger');
  if (!existsSync(dir)) return null;
  const rawRows = [], seen = new Set(), fileIds = []; // fileIds: every id on disk, duplicates included
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const l of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      let r;
      try { r = JSON.parse(l); } catch { continue; } // a torn last line, as the page drops it
      if (r && r.id != null) { fileIds.push(r.id); if (seen.has(r.id)) continue; seen.add(r.id); }
      rawRows.push(r);
    }
  }
  const reg = new Register('test', readJson(join(data, 'edits.json'), null));
  const cfg = readJson(join(data, '..', 'config.json'), {});
  seedFromLegacy(reg, {
    overrides: cfg.category_overrides,
    budgets: cfg.budgets,
    commitments: readJson(join(data, 'commitments.json'), {}),
    accounts: readJson(join(data, 'accounts.json'), {}),
    rows: rawRows,
  });
  const ov = overridesOf(reg);
  const budgets = budgetsOf(reg);
  const commitments = commitmentsOf(reg);
  return {
    fileIds,
    rawRows,
    rows: activeRows(reg, rawRows),
    accounts: accountsOf(reg),
    opts: {
      categoryOverrides: Object.keys(ov).length ? ov : null,
      commitments: Object.keys(commitments).length ? commitments : null,
      budgets: Object.keys(budgets).length ? budgets : null,
    },
    imports: readJson(join(data, 'imports.json'), []),
  };
}
