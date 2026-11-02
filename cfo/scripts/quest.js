// quest.js — CFO's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is CFO's MENU — every
// chore a player can do here — and each entry's `done_at` is CFO's own record
// of the last time it saw that chore done. `pool: true` offers an entry to the
// game's one-chore-a-day pick; `device` is where the player does it; `kind`
// is what sort of practice it is (a plain word — a game reads it, CFO names
// no game): every CFO chore is `ledger`; `how` says in a line how it is done.
// `due` says whether it can be done now — the page publishes it from what it
// holds (publishDue): no account, no review; nothing uncategorised, no sort;
// no investment, no survey; never imported, no monthly import. A row whose
// due was never published reads false, and a game hides it.
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
    id: 'cfo-review', kind: 'ledger', period: 'day', reward: 20, stamina: 10, device: 'both', open: `${OPEN}?tab=report`,
    title: { zh: '核账 · 看一眼今天的花销', en: "Check the accounts · glance at today's spending" },
    how: { zh: '打开 CFO 的报告页，看上十几秒', en: 'Open the Report in CFO and read it a few seconds' },
  },
  {
    id: 'cfo-sort', kind: 'ledger', period: 'week', reward: 25, stamina: 15, device: 'both', pool: true, open: `${OPEN}?tab=txn`,
    title: { zh: '分账 · 给新交易归类', en: 'Sort the ledger · categorise new transactions' },
    how: { zh: '在 CFO 交易页给一笔「其他」选个类别', en: "Give one 'Other' transaction a category in CFO" },
  },
  {
    id: 'cfo-invest', kind: 'ledger', period: 'week', reward: 25, stamina: 15, device: 'both', pool: true, open: `${OPEN}?tab=invest`,
    title: { zh: '观宝库 · 看一遍投资', en: 'Survey the vault · look over your investments' },
    how: { zh: '打开 CFO 的投资页，看上十几秒', en: 'Open Investments in CFO and look a few seconds' },
  },
  {
    id: 'cfo-import', kind: 'ledger', period: 'month', reward: 30, stamina: 20, device: 'both', pool: true, open: `${OPEN}?tab=report`,
    title: { zh: '清点府库 · 导入一份账单', en: 'Balance the treasury · import a statement' },
    how: { zh: '把这个月的银行账单拖进 CFO', en: "Drop this month's bank statement into CFO" },
  },
];

/// Rows taken out of the menu: they leave the file, done or not (2026-11-02:
/// the one-time stock milestone went with the 开府 redesign).
export const RETIRED = ['cfo-first-stock'];

/// The facts the page holds, as each row's `due` (publishDue). Pure.
export function dueFacts({ ledger = [], accounts = {}, uncategorised = 0, investments = {} } = {}) {
  return {
    'cfo-review': ledger.length > 0 || Object.keys(accounts || {}).length > 0,
    'cfo-sort': uncategorised > 0,
    'cfo-invest': Object.keys(investments || {}).length > 0,
    'cfo-import': ledger.length > 0,
  };
}

export const QUEST_FILE = '$HOME/.linggen/quests/cfo.json';

/// The later of two times, either possibly missing or unreadable.
export function later(a, b) {
  const t = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
  if (Number.isNaN(t(a))) return Number.isNaN(t(b)) ? null : b;
  if (Number.isNaN(t(b))) return a;
  return t(b) > t(a) ? b : a;
}

/// The file's next body: the menu, each entry's `done_at` the later of what
/// the file held and `stamps` — a stamp never moves an entry back — and its
/// `due` from `due` (id → bool), else as the file held it, else false.
/// Retired rows leave; rows this menu does not know stay.
export function merged(doc, stamps, menu = MENU, due = {}) {
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app: 'cfo',
    quests: [
      ...menu.map((m) => {
        const had = was.get(m.id)?.done_at ?? null;
        const d = m.id in due ? Boolean(due[m.id]) : was.get(m.id)?.due === true;
        return { ...m, due: d, done_at: m.id in stamps ? later(had, stamps[m.id]) : had };
      }),
      ...held.filter((q) => !mine.has(q.id) && !RETIRED.includes(q.id)),
    ],
  };
}

/// Stamp `id` done at `now`. Resolves either way; an unknown id writes nothing.
export async function stampQuest(runBash, id, { file = QUEST_FILE, now = new Date() } = {}) {
  if (!MENU.some((m) => m.id === id)) return false;
  return write(runBash, file, { [id]: now.toISOString() }, {});
}

/// Publish each row's `due` from the page's facts (dueFacts), stamping nothing.
/// Resolves to whether it wrote; the same facts as the last write write nothing.
let LAST_DUE = '';
export async function publishDue(runBash, due, { file = QUEST_FILE } = {}) {
  const key = JSON.stringify(due);
  if (key === LAST_DUE) return false;
  const ok = await write(runBash, file, {}, due);
  if (ok) LAST_DUE = key;
  return ok;
}

async function write(runBash, file, stamps, due) {
  try {
    await updateJsonFile(runBash, file, (obj) => {
      const next = merged(obj, stamps, MENU, due);
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
