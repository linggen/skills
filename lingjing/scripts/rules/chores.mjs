// rules/chores.mjs — 人间功课 and 开府: the apps' menus, read into one line a day.
// Part of the rules engine; rules.mjs is its one door.
//
// Each app writes its whole MENU to ~/.linggen/quests/<app>.json (design.md §
// The menu). Listing every entry flooded the book, so the rules read it thus
// (design.md § 人间功课 — one a day):
//
// - **Fixed** — no `pool`, not `once` (the workout): a line every day.
// - **Pool** — `pool: true`: ONE is picked a day, the same on every device
//   and every reload. Only the pick (and the fixed) show and pay; a pool chore
//   done that is not today's pick is shown nowhere and pays nothing.
// - **开府** — `period: "once"`: the one-time setup milestones. Their own
//   section, never a book line; each pays once ever (`state.chores[id].period
//   === 'once'`, in the synced save). An undone one never nags.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey, periodKey, periodStart, pick } from '../state.mjs';

const isOnce = q => q.period === 'once';
const isPool = q => q.pool === true && !isOnce(q);
const isFixed = q => !q.pool && !isOnce(q);
const deviceOf = q => (['mac', 'phone', 'both'].includes(q.device) ? q.device : 'both');

/* Done by the app's own record, within the current period (all time for once). */
export function questDone(q, now) {
  if (!q.done_at) return false;
  const at = new Date(q.done_at);
  return at >= periodStart(q.period, now) && at <= now;
}
const paidNow = (state, q, now) => state.chores?.[q.id]?.period === periodKey(q.period, now);

/* FNV-1a: a spread good enough that each id wins its share of days. */
function mix(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
const dayNumber = now => Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
// The save's own id: made once, synced with it, so two devices pick alike.
const seedOf = state => state.created ?? state.name ?? '';

/* A phone is known to be paired when Linggen's own milestone says so, or a
   phone-only chore was ever seen done. No signal, no phone: a phone chore the
   player cannot do is never the day's one. */
export function phoneReady(quests) {
  return quests.some(q => (q.id === 'linggen-pair' || deviceOf(q) === 'phone') && q.done_at);
}

/* Still doable this period: not done, nor paid, before today. What happened
   today keeps it in, so doing the pick never re-rolls the day. */
function doable(state, q, now) {
  const today = periodStart('day', now);
  const done = questDone(q, now) && new Date(q.done_at) < today;
  const paid = paidNow(state, q, now) && new Date(state.chores[q.id].paid_at ?? now) < today;
  return !done && !paid;
}

/* The day's one: a pool entry, seeded by the day and the save. Days alternate
   mac and phone (always mac with no phone); a `both` fits either; when the
   day's device has none, the other's may serve. Highest-hash-wins, so an
   entry appearing mid-day moves the pick only if it outranks it. */
export function dailyPick(state, quests, now) {
  const phone = phoneReady(quests);
  const pool = quests.filter(q => isPool(q) && (phone || deviceOf(q) !== 'phone') && doable(state, q, now));
  const device = phone && (dayNumber(now) + mix(seedOf(state))) % 2 ? 'phone' : 'mac';
  const fits = pool.filter(q => [device, 'both'].includes(deviceOf(q)));
  const from = fits.length ? fits : pool;
  const key = q => mix(`${dayKey(now)}|${seedOf(state)}|${q.id}`);
  const best = from.reduce((a, q) => (!a || key(q) > key(a) || (key(q) === key(a) && q.id < a.id) ? q : a), null);
  return { pick: best, device, phone };
}

/* Today's 人间功课: the fixed ones and the pick — due or done, in that order. */
export function todayChores(state, quests, now) {
  const { pick: one } = dailyPick(state, quests, now);
  return [...quests.filter(isFixed), ...(one ? [one] : [])].filter(q => q.due || questDone(q, now));
}

/* May it be handed in today: a fixed one, the pick, or a milestone. */
export function choreCounts(state, quests, q, now) {
  return isOnce(q) || isFixed(q) || dailyPick(state, quests, now).pick?.id === q.id;
}

/* What it pays: a daily on the task table, a milestone on the `once` table
   (rewards.json caps both); 体力 is the app's own, else the quest refill. */
export function choreGrant(content, q) {
  const once = isOnce(q);
  return {
    table: once ? 'once' : 'task',
    progress: q.reward ?? 0,
    ...(once ? { wealth: content.rewards.tables.once?.wealth ?? 0 } : {}),
    stamina: q.stamina ?? content.rewards.stamina.refill.quest,
  };
}

/* Where a chore is done: the page the app declares (`open`, a path on this
   host — /apps/… or Linggen's own, like /settings?tab=models), else the app's
   own entry as its SKILL.md names it (`app.entry`) — `/apps/<app>/` alone is
   the Linggen shell, not the app (his, 2026-09-23). Never a link out. */
const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function appEntry(app) {
  if (!/^[a-z0-9-]+$/.test(app ?? '')) return null;
  try {
    const head = fs.readFileSync(path.join(SKILLS_ROOT, app, 'SKILL.md'), 'utf8').split(/^---$/m)[1] ?? '';
    const entry = /^\s+entry:\s*(\S+)\s*$/m.exec(head)?.[1];
    return entry && !entry.includes('..') ? `/apps/${app}/${entry}` : null;
  } catch { return null; }
}
const onHost = open => typeof open === 'string' && /^\/(?!\/)[^\s\\:]*$/.test(open) && !open.includes('..');
export const choreOpen = q => (onHost(q.open) ? q.open : appEntry(q.app));

/* 开府 in full, for the page's section (Quest `kaifu`, a read). */
export function kaifuList(state, quests, now, lang) {
  return quests.filter(isOnce).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang), device: deviceOf(q), open: choreOpen(q),
    done: questDone(q, now), paid: paidNow(state, q, now), reward: q.reward ?? null,
  }));
}

/* 开府 in one line, for Look and Progress: n of all, how many wait to be
   handed in, and one undone to offer when the player asks what to do. */
export function kaifuBrief(state, quests, now, lang) {
  const list = kaifuList(state, quests, now, lang);
  if (!list.length) return null;
  const next = list.find(k => !k.done);
  return { done: list.filter(k => k.done).length, of: list.length, ready: list.filter(k => k.done && !k.paid).length,
    ...(next ? { next: { id: next.id, title: next.title, device: next.device } } : {}) };
}

/* The milestones done and not yet paid: handed in like any chore. */
export const kaifuReady = (state, quests, now) => quests.filter(q => isOnce(q) && questDone(q, now) && !paidNow(state, q, now));

export { isFixed, isOnce, isPool };
