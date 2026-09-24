// quest.js — CFO's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is CFO's MENU — every
// chore a player can do here — and each entry's `done_at` is CFO's own record
// of the last time it saw that chore done. `pool: true` offers an entry to the
// game's one-chore-a-day pick; `device` is where the player does it.
//
// Only the fact crosses — due, done, when — never an amount, a merchant, a
// category or a file name. Read-merge-write under the same lock and atomic
// rename every CFO file takes (lww.js): every other entry keeps its `done_at`,
// and an entry this menu does not know stays as it is. A stamp never moves an
// entry's `done_at` back. A failure never fails the action it follows. Pure
// apart from the injected `runBash`.
//
//   node scripts/quest.js stamp <id> <at>   the engine's door for a phone fact
//     (SKILL.md `quests:`): stamp <id> done at <at> (2026-09-24T14:03:11Z);
//     exit 0 once the file holds it or a later time, else 1.

import { updateJsonFile } from './lww.js';

const OPEN = '/apps/cfo/scripts/index.html';

export const MENU = [
  {
    id: 'cfo-import', period: 'week', reward: 30, stamina: 20, device: 'both', pool: true, open: `${OPEN}?tab=report`,
    title: { zh: '清点府库 · 在 CFO 导入一份账单', en: 'Balance the treasury · import a statement in CFO' },
  },
  {
    id: 'cfo-review', period: 'day', reward: 20, stamina: 10, device: 'both', pool: true, open: `${OPEN}?tab=report`,
    title: { zh: '核账 · 看一遍本月的报告', en: "Check the accounts · read this month's report" },
  },
  {
    id: 'cfo-sort', period: 'week', reward: 25, stamina: 15, device: 'mac', pool: true, open: `${OPEN}?tab=txn`,
    title: { zh: '分账 · 给未分类的交易归类', en: 'Sort the ledger · categorize uncategorized transactions' },
  },
  {
    id: 'cfo-invest', period: 'week', reward: 25, stamina: 15, device: 'phone', pool: true, open: `${OPEN}?tab=invest`,
    title: { zh: '观宝库 · 在手机上看一遍投资', en: 'Survey the vault · look over your investments on the phone' },
  },
];

export const QUEST_FILE = '$HOME/.linggen/quests/cfo.json';

/// The later of two times, either possibly missing or unreadable.
export function later(a, b) {
  const t = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
  if (Number.isNaN(t(a))) return Number.isNaN(t(b)) ? null : b;
  if (Number.isNaN(t(b))) return a;
  return t(b) > t(a) ? b : a;
}

/// The file's next body: the menu, each entry's `done_at` the later of what
/// the file held and `stamps` — a stamp never moves an entry back.
export function merged(doc, stamps, menu = MENU) {
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app: 'cfo',
    quests: [
      ...menu.map((m) => {
        const had = was.get(m.id)?.done_at ?? null;
        return { ...m, due: true, done_at: m.id in stamps ? later(had, stamps[m.id]) : had };
      }),
      ...held.filter((q) => !mine.has(q.id)),
    ],
  };
}

/// Stamp `id` done at `now`. Resolves either way; an unknown id writes nothing.
export async function stampQuest(runBash, id, { file = QUEST_FILE, now = new Date() } = {}) {
  if (!MENU.some((m) => m.id === id)) return false;
  try {
    await updateJsonFile(runBash, file, (obj) => {
      const next = merged(obj, { [id]: now.toISOString() });
      for (const k of Object.keys(obj)) delete obj[k];
      Object.assign(obj, next);
    });
    return true;
  } catch {
    return false; // the next time it is done writes it again
  }
}

const STAMP_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/// The engine's door: `stamp <id> <at>` → 0 when stamped (or a later time
/// already stands), 1 otherwise. `runBash` runs on this Mac.
export async function cli(argv, { runBash = localBash, file = QUEST_FILE } = {}) {
  const [verb, id, at] = argv;
  const when = new Date(at);
  if (verb !== 'stamp' || !STAMP_AT.test(at || '') || Number.isNaN(when.getTime())) return 1;
  return (await stampQuest(runBash, id, { file, now: when })) ? 0 : 1;
}

async function localBash(cmd) {
  const { execFileSync } = await import('node:child_process');
  return execFileSync('bash', ['-c', cmd], { encoding: 'utf8' });
}

// Run as a script (never when the page imports it).
if (typeof process !== 'undefined' && process.versions?.node && /(^|[\\/])quest\.js$/.test(process.argv?.[1] || '')) {
  process.exitCode = await cli(process.argv.slice(2));
}
