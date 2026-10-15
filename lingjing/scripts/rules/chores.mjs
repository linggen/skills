// rules/chores.mjs — 人间功课 and 开府: the apps' menus, read into one line a day.
// Part of the rules engine; rules.mjs is its one door.
//
// Each app writes its whole MENU to ~/.linggen/quests/<app>.json (design.md §
// The menu). Listing every entry flooded the book, so the rules read it thus
// (design.md § A day, 今日传闻, real-life chores — one a day):
//
// - **Fixed** — no `pool`, not `once` (the workout): a line every day.
// - **Pool** — `pool: true`: ONE is picked a day, the same on every device
//   and every reload. Only the pick (and the fixed) show and pay; a pool chore
//   done that is not today's pick is shown nowhere and pays nothing.
// - **开府** — `period: "once"`: the one-time setup milestones. Their own
//   section, never a book line; each pays once ever (`state.chores[id].period
//   === 'once'`, in the synced save). An undone one never nags. They drip
//   (Hanli, 2026-10-15): ONE is open at a time, in the world's order
//   (world.json `kaifu.order`); handed in or skipped, the next opens on the
//   next calendar day. A skipped one pays nothing and comes back at the end;
//   done in real life, it may be handed in any day (`state.kaifu`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey, periodKey, periodStart, pick, seedOf, zeroAt } from '../state.mjs';

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

/* May it be handed in today: a fixed one, the pick, or a milestone that is
   open or was skipped (the drip, below). */
export function choreCounts(state, quests, q, now, content) {
  if (isOnce(q)) return kaifuMay(state, content, quests, q, now);
  return isFixed(q) || dailyPick(state, quests, now).pick?.id === q.id;
}

/* What it pays (Hanli, 2026-10-15: 修为 comes from cultivation, chores pay
   灵石): the fixed one — the workout, the day's 功课 — on the `gongke` table,
   修为; the day's pick (a scan, the books, a backup) on the `life` table,
   灵石 — its `reward` read as stones; a 开府 milestone on the `once` table,
   灵石. rewards.json caps each; 体力 is the app's own, else the quest refill.
   At 练气零层, which takes no 修为, the 功课 pays the `gongke_zero` table's
   灵石 instead (Hanli, 2026-10-15: every hand-in visibly raises one or the
   other) — `state` is the save it is paid to. */
const choreTable = (content, q, state) => (isOnce(q) ? 'once' : !isFixed(q) ? 'life'
  : state && content.rewards.tables.gongke_zero && zeroAt(content, state.tier, state.step) ? 'gongke_zero' : 'gongke');
const FLAT = new Set(['once', 'gongke_zero']); // the table's own 灵石, not the chore's `reward`
export function choreGrant(content, q, state = null) {
  const table = choreTable(content, q, state), cap = content.rewards.tables[table] ?? {};
  return {
    table,
    progress: table === 'gongke_zero' ? 0 : q.reward ?? 0,
    wealth: FLAT.has(table) ? cap.wealth ?? 0 : q.reward ?? 0,
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

/* ── 开府 drips: one open at a time, the next on the next day ──
   The order is the world's (world.json `kaifu.order`), then an app's own
   numeric `order`, then the menu's; the rules name no milestone. */
function kaifuOrder(content, quests) {
  const listed = content?.world?.kaifu?.order ?? [];
  const rank = q => (listed.includes(q.id) ? listed.indexOf(q.id) : Infinity);
  const own = q => (Number.isFinite(q.order) ? q.order : Infinity);
  return quests.filter(isOnce).map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || own(a.q) - own(b.q) || a.i - b.i).map(x => x.q);
}
const skippedOf = state => (Array.isArray(state.kaifu?.skipped) ? state.kaifu.skipped : []);

/* The day the open one was last handed in or skipped. A save from before the
   drip has no record: its latest milestone paid stands for it. */
function kaifuClosed(state, quests) {
  if (state.kaifu?.closed !== undefined) return state.kaifu.closed;
  const paid = quests.filter(isOnce).map(q => state.chores?.[q.id]).filter(c => c?.period === 'once' && c.paid_at);
  return paid.map(c => dayKey(new Date(c.paid_at))).sort().pop() ?? null;
}

/* The next unpaid in order, skipped ones last in the order they were skipped
   (so skipping again moves one to the back, never stuck); it is open unless
   the open one closed today. */
export function kaifuOpen(state, content, quests, now) {
  const unpaid = kaifuOrder(content, quests).filter(q => !paidNow(state, q, now));
  const skipped = skippedOf(state).map(id => unpaid.find(q => q.id === id)).filter(Boolean);
  const next = unpaid.find(q => !skipped.includes(q)) ?? skipped[0] ?? null;
  return { open: kaifuClosed(state, quests) === dayKey(now) ? null : next, next, skipped };
}

/* Handed in: the open one, or one skipped before — the drip limits what
   opens, never whether a thing done counts. */
function kaifuMay(state, content, quests, q, now) {
  const { open, skipped } = kaifuOpen(state, content, quests, now);
  return open?.id === q.id || skipped.some(x => x.id === q.id);
}

/* `state.kaifu` after a milestone leaves the open slot — paid, or skipped
   (`skip`): the day closes for the open one only; a skipped one handed in
   later leaves the open one standing. */
export function kaifuAfter(state, content, quests, now, id, skip = false) {
  const { open } = kaifuOpen(state, content, quests, now);
  const skipped = skippedOf(state).filter(x => x !== id);
  return { closed: open?.id === id ? dayKey(now) : kaifuClosed(state, quests), skipped: skip ? [...skipped, id] : skipped };
}

/* 开府 for the page (Quest `kaifu`, a read): each milestone with its `step` —
   `open`, `skipped`, `waits` (not yet open) or `paid`. The page shows the open
   one, the skipped ones done, and folds the paid. */
export function kaifuList(state, quests, now, lang, content) {
  const { open, skipped } = kaifuOpen(state, content, quests, now);
  const stepOf = q => (paidNow(state, q, now) ? 'paid' : open?.id === q.id ? 'open' : skipped.includes(q) ? 'skipped' : 'waits');
  return kaifuOrder(content, quests).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang), device: deviceOf(q), open: choreOpen(q),
    done: questDone(q, now), paid: paidNow(state, q, now), step: stepOf(q), reward: q.reward ?? null,
  }));
}

/* 开府 in one line, for Look and Progress: `done` (handed in) of all, how
   many wait to be handed in, the ONE open (`next`) — or `opens: 'tomorrow'`
   when today's is settled — and how many were skipped. */
export function kaifuBrief(state, quests, now, lang, content) {
  const list = kaifuList(state, quests, now, lang, content);
  if (!list.length) return null;
  const next = list.find(k => k.step === 'open'), left = list.some(k => !k.paid), skipped = list.filter(k => k.step === 'skipped').length;
  return { done: list.filter(k => k.paid).length, of: list.length, ready: list.filter(k => k.done && ['open', 'skipped'].includes(k.step)).length,
    ...(next ? { next: { id: next.id, title: next.title, device: next.device, done: next.done, open: next.open } } : left ? { opens: 'tomorrow' } : {}),
    ...(skipped ? { skipped } : {}) };
}

/* The milestones done, unpaid and open (or skipped before): handed in like any chore. */
export const kaifuReady = (state, quests, now, content) =>
  quests.filter(q => isOnce(q) && questDone(q, now) && !paidNow(state, q, now) && kaifuMay(state, content, quests, q, now));

export { isFixed, isOnce, isPool };
