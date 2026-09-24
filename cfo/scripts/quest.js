// quest.js — CFO's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is CFO's MENU — every
// chore a player can do here — and each entry's `done_at` is CFO's own record
// of the last time it saw that chore done. `pool: true` offers an entry to the
// game's one-chore-a-day pick; `device` is where the player does it.
//
// Only the fact crosses — due, done, when — never an amount, a merchant, a
// category or a file name. Read-merge-write under the same lock and atomic
// rename every CFO file takes (lww.js): every other entry keeps its `done_at`,
// and an entry this menu does not know stays as it is. A failure never fails
// the action it follows. Pure apart from the injected `runBash`.

import { updateJsonFile } from './lww.js';

const OPEN = '/apps/cfo/scripts/index.html';

export const MENU = [
  {
    id: 'cfo-import', period: 'week', reward: 30, stamina: 20, device: 'mac', pool: true, open: `${OPEN}?tab=report`,
    title: { zh: '清点府库 · 在 CFO 导入一份账单', en: 'Balance the treasury · import a statement in CFO' },
  },
  {
    id: 'cfo-review', period: 'day', reward: 20, stamina: 10, device: 'mac', pool: true, open: `${OPEN}?tab=report`,
    title: { zh: '核账 · 看一遍本月的报告', en: "Check the accounts · read this month's report" },
  },
  {
    id: 'cfo-sort', period: 'week', reward: 25, stamina: 15, device: 'mac', pool: true, open: `${OPEN}?tab=txn`,
    title: { zh: '分账 · 给未分类的交易归类', en: 'Sort the ledger · categorize uncategorized transactions' },
  },
];

export const QUEST_FILE = '$HOME/.linggen/quests/cfo.json';

/// The file's next body: the menu, each entry's `done_at` from `stamps` when
/// given there, else from what the file held.
export function merged(doc, stamps, menu = MENU) {
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app: 'cfo',
    quests: [
      ...menu.map((m) => ({
        ...m,
        due: true,
        done_at: m.id in stamps ? stamps[m.id] : (was.get(m.id)?.done_at ?? null),
      })),
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
