// rules/share.mjs — 传音: a share made on the page, kept in the game's own menu (scripts/quest.mjs) and handed in.
// Part of the rules engine; rules.mjs is its one door.
//
// Hanli, 2026-11-10 (「分享动作就给奖励」): the act is the whole witness — no proof anyone received it. The page reports a
// finished 分享, 拷贝图片 or 保存图片 of its pictures (the 签; qian-share.js); the rules stamp the menu's row and hand it in
// at once, as any 人间功课 is (tasks.mjs questCheck): once a day, its pay the kind's own (chores.mjs ownOf). The page's
// alone: a report Ling could make would be a self-reported share.
import { APP, SHARE, merged, publish, stamp } from '../quest.mjs';
import { questsWriteDir } from './files.mjs';

/* The menu put in the quests folder, when the game may write one there (a scratch save without its own folder may not). */
export function publishMenu() {
  const dir = questsWriteDir();
  if (!dir) return { ok: true, kept: false };
  try { publish({ dir }); return { ok: true, kept: true }; } catch { return { ok: true, kept: false }; }
}

/* A share now: the row of the menu with `done_at` at `now`, written where it may be; a folder that cannot be written
   leaves the row in memory only (it pays all the same — the paid record in the save is the day's). */
export function shareRow(now) {
  const dir = questsWriteDir();
  if (dir) { try { return { ...stamp(SHARE, { dir, now }), app: APP }; } catch { /* the row below */ } }
  return { ...merged(null, { [SHARE]: now.toISOString() }, undefined, now).quests.find((m) => m.id === SHARE), app: APP };
}
