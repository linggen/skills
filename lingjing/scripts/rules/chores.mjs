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
// - **开府** — `period: "once"`: the one-time first steps. Their own section,
//   never a book line; each pays once ever (`state.chores[id].period ===
//   'once'`, in the synced save). Only the rows the player's devices can do
//   are listed; every done one is handed in at once, and only the hint of an
//   undone one drips, one more a day (Hanli, 2026-11-02; § 开府 below).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chorePlay } from './playpay.mjs';
import { dayKey, lockedOf, periodKey, periodStart, pick, questStamina, seedOf, zeroAt } from '../state.mjs';

const isOnce = q => q.period === 'once';
const isPool = q => q.pool === true && !isOnce(q);
const isFixed = q => !q.pool && !isOnce(q);
/* `device`: where a row is done — `mac`, `phone`, `both` (either one) or `pair`
   (needs both: listed only to a player who has a Mac and a phone). Unknown reads `both`. */
const deviceOf = q => (['mac', 'phone', 'both', 'pair'].includes(q.device) ? q.device : 'both');

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

/* Which devices the player has — the ONE device filter (the 开府 list and the
   day's chores both use it). The host the rules run on is one (LINGJING_HOST:
   `phone` in the phone bundle, else the Mac); the other is known once a `pair`
   row is done, or a row only the other device can do was ever seen done. No
   signal, no other device: a row the player cannot do is never shown. */
export const hostOf = (env = process.env) => (env.LINGJING_HOST === 'phone' ? 'phone' : 'mac');
export function playerDevices(quests, host = hostOf()) {
  const other = host === 'phone' ? 'mac' : 'phone';
  const seen = quests.some(q => q.done_at && [other, 'pair'].includes(deviceOf(q)));
  return { mac: host === 'mac' || seen, phone: host === 'phone' || seen };
}
/* Doable on the devices the player has (`has`, playerDevices). */
export function fitsDevices(q, has) {
  const d = deviceOf(q);
  if (d === 'pair') return Boolean(has.mac && has.phone);
  return d === 'both' || Boolean(has[d]);
}
/* A phone is known (on the Mac): the old name, kept for its callers. */
export const phoneReady = quests => playerDevices(quests, 'mac').phone;

/* Still doable this period: not done, nor paid, before today. What happened
   today keeps it in, so doing the pick never re-rolls the day. */
function doable(state, q, now) {
  const today = periodStart('day', now);
  const done = questDone(q, now) && new Date(q.done_at) < today;
  const paid = paidNow(state, q, now) && new Date(state.chores[q.id].paid_at ?? now) < today;
  return !done && !paid;
}

/* Shown at all: the app says it can be done now (`due`; a row the app cannot
   offer publishes `due: false` and is never shown as not done), or it was done
   in its period anyway; and it fits the devices the player has (fitsDevices). */
const offered = (q, has, now) => (q.due !== false || questDone(q, now)) && fitsDevices(q, has);

/* The day's one: a pool entry, seeded by the day and the save — only one the
   player can do (offered), so a row its app hides or a device he lacks never
   wins the day. Days alternate mac and phone when he has both; a `both` fits
   either; when the day's device has none, the other's may serve.
   Highest-hash-wins, so an entry appearing mid-day moves the pick only if it
   outranks it. */
export function dailyPick(state, quests, now) {
  const has = playerDevices(quests), phone = has.phone;
  const pool = quests.filter(q => isPool(q) && offered(q, has, now) && doable(state, q, now));
  const device = has.mac && has.phone ? ((dayNumber(now) + mix(seedOf(state))) % 2 ? 'phone' : 'mac') : has.phone ? 'phone' : 'mac';
  const fits = pool.filter(q => [device, 'both'].includes(deviceOf(q)));
  const from = fits.length ? fits : pool;
  const key = q => mix(`${dayKey(now)}|${seedOf(state)}|${q.id}`);
  const best = from.reduce((a, q) => (!a || key(q) > key(a) || (key(q) === key(a) && q.id < a.id) ? q : a), null);
  return { pick: best, device, phone };
}

/* Today's 人间功课: the fixed ones (the dailies) the player can do, then the pick. */
export function todayChores(state, quests, now) {
  const has = playerDevices(quests), { pick: one } = dailyPick(state, quests, now);
  return [...quests.filter(q => isFixed(q) && offered(q, has, now)), ...(one ? [one] : [])];
}

/* How it is done, the app's own words (`how`, ≤20 words), or null. */
/* Whom a row's chat line goes to (`to`, an agent's id: 问安 is 银月's, milestones.rs) and the line it
   asks (`ask`, empty: the box opened for him to type) — the page opens the chat addressed so. */
const AGENT_ID = /^[a-z0-9-]{1,32}$/;
export const choreTalk = (q, lang) => ({
  ...(q?.ask ? { ask: pick(q.ask, lang) ?? '' } : {}),
  ...(AGENT_ID.test(q?.to ?? '') ? { to: q.to } : {}),
});
export const choreHow = (q, lang) => (q?.how && typeof q.how === 'object' ? pick(q.how, lang) ?? null : null);

/* May it be handed in today: a fixed one, the pick, or a milestone that is
   open or was skipped (the drip, below). */
export function choreCounts(state, quests, q, now, content) {
  if (isOnce(q)) return kaifuMay(state, content, quests, q, now);
  return isFixed(q) || dailyPick(state, quests, now).pick?.id === q.id;
}

/* What it pays (Hanli, 2026-10-15: 修为 comes from cultivation, chores pay
   灵石; 2026-10-27: 「health等app的任务, 可以多给一些修为」): the fixed one — the
   workout, the day's 功课 — on the `gongke` table; the day's pick (a scan, the
   books, a backup) on the `life` table, its `reward` read as stones; both
   a share of the layer in 修为 by their period (playpay.mjs chorePlay); a 开府 milestone on the `once` table,
   灵石. rewards.json caps each; 体力 is the app's own, else the quest refill.
   At 练气零层, which takes no 修为, the 功课 pays the `gongke_zero` table's
   灵石 instead (Hanli, 2026-10-15: every hand-in visibly raises one or the
   other) — `state` is the save it is paid to. */
const choreTable = (content, q, state) => (isOnce(q) ? 'once' : !isFixed(q) ? 'life'
  : state && content.rewards.tables.gongke_zero && zeroAt(content, state.tier, state.step) ? 'gongke_zero' : 'gongke');
const FLAT = new Set(['once', 'gongke_zero']); // the table's own 灵石, not the chore's `reward`
/* A day holds `shares_per_day` (gongke.json) dailies that pay their share of the layer; the rest pay their
   灵石 and meaning only (2026-11-02: six dailies instead of one fixed; one share keeps the day's chore 修为 near
   where it was — Hanli 11-02: 「按你建议1项吧」). `now` counts the day's already paid; without it, no limit. */
function dayShareLeft(content, q, state, now) {
  const n = content.gongke?.shares_per_day;
  if (!now || !state || q.period !== 'day' || !Number.isFinite(n)) return true;
  const today = periodKey('day', now);
  return Object.entries(state.chores ?? {}).filter(([id, c]) => id !== q.id && c?.period === today).length < n;
}
export function choreGrant(content, q, state = null, now = null) {
  const table = choreTable(content, q, state), cap = content.rewards.tables[table] ?? {};
  // The day's and the week's chores pay a share of the layer (rules/playpay.mjs chorePlay, 2026-10-27).
  // A share of the save's layer (play_pay.chore); with no save, none (a world declaring no `chore` pays the chore's `reward`).
  const minutes = Boolean(content.balance?.play_pay?.chore);
  const share = dayShareLeft(content, q, state, now);
  const played = FLAT.has(table) || !share ? 0 : minutes ? chorePlay(content, state, q.period) ?? 0 : q.reward ?? 0;
  return {
    table,
    progress: played,
    // 开府 pays the row's own 灵石 (50, as its quest says — Hanli 2026-11-02), capped by the `once` table.
    wealth: table === 'once' ? Math.min(q.reward ?? cap.wealth ?? 0, cap.wealth ?? 0) : FLAT.has(table) ? cap.wealth ?? 0 : q.reward ?? 0,
    // No quest pays 体力 (rewards.json stamina.refill.quest false — Hanli 2026-11-02: 「完成任务不奖励体力」), whatever its row says.
    stamina: questStamina(content, q),
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

/* ── 开府: the first steps, for the devices the player has ──
   (Hanli, 2026-11-02: 「任务设计可以, 按你说的做」.) The list holds only the
   rows doable on the player's devices (playerDevices / fitsDevices), so
   「开府 n/N」 counts those. Done in real life, a row is handed in at once —
   every done one, never one a day. Only the HINT of an undone row drips: ONE
   more undone row is shown each day (`state.kaifu.shown`, the ids revealed,
   and `shown_on`, the day of the last). The order is the world's (world.json
   `kaifu.order`), then an app's own numeric `order`, then the menu's; the
   rules name no milestone. */
function kaifuOrder(content, quests) {
  const listed = content?.world?.kaifu?.order ?? [], retired = new Set(content?.world?.kaifu?.retired ?? []);
  const rank = q => (listed.includes(q.id) ? listed.indexOf(q.id) : Infinity);
  const own = q => (Number.isFinite(q.order) ? q.order : Infinity);
  // A retired id (world.json `kaifu.retired`) is never a row, though an app's file still holds it till it writes again.
  return quests.filter(q => isOnce(q) && !retired.has(q.id)).map((q, i) => ({ q, i }))
    .sort((a, b) => rank(a.q) - rank(b.q) || own(a.q) - own(b.q) || a.i - b.i).map(x => x.q);
}
/* The rows this player's devices can do, in order. */
const kaifuRowsOf = (content, quests) => {
  const has = playerDevices(quests);
  return kaifuOrder(content, quests).filter(q => fitsDevices(q, has));
};
const shownOf = state => (Array.isArray(state?.kaifu?.shown) ? state.kaifu.shown : []);
const undone = (state, q, now) => !questDone(q, now) && !paidNow(state, q, now);

/* The hints revealed by `now`: the save's, and — on a day none was revealed
   yet — the next undone row in order. A read says it; kaifuFit writes it. */
function kaifuShown(state, rows, now) {
  const shown = shownOf(state);
  if (state?.kaifu?.shown_on === dayKey(now)) return { shown, today: null };
  const next = rows.find(q => undone(state, q, now) && !shown.includes(q.id));
  return { shown: next ? [...shown, next.id] : shown, today: next?.id ?? null };
}

/* Written with whatever the call writes (rules.mjs): the day's new hint kept,
   so the next day reveals one more. The save as it was when nothing moved. */
export function kaifuFit(content, state, quests, now) {
  if (!state || lockedOf(content, state).includes('kaifu')) return state;
  const { shown, today } = kaifuShown(state, kaifuRowsOf(content, quests), now);
  if (!today) return state;
  return { ...state, kaifu: { ...(state.kaifu ?? {}), shown, shown_on: dayKey(now) } };
}

/* Each row's step: `paid`, `ready` (done, to hand in), `open` (its hint shown)
   or `waits`. */
function kaifuSteps(state, content, quests, now) {
  const rows = kaifuRowsOf(content, quests), { shown } = kaifuShown(state, rows, now);
  const stepOf = q => (paidNow(state, q, now) ? 'paid' : questDone(q, now) ? 'ready' : shown.includes(q.id) ? 'open' : 'waits');
  return rows.map(q => ({ q, step: stepOf(q) }));
}

/* Handed in: any row on the list, done and unpaid — the drip never holds one back. */
function kaifuMay(state, content, quests, q, now) {
  return kaifuRowsOf(content, quests).some(x => x.id === q.id);
}

/* 开府 for the page (Quest `kaifu`, a read): every row of the list with its
   `step`, its 怎么做 (`how`), its page (`open`) and the line it asks her. */
export function kaifuList(state, quests, now, lang, content) {
  return kaifuSteps(state, content, quests, now).map(({ q, step }) => ({
    id: q.id, app: q.app, title: pick(q.title, lang), device: deviceOf(q), open: choreOpen(q),
    ...(q.how ? { how: pick(q.how, lang) } : {}), ...choreTalk(q, lang),
    done: questDone(q, now), paid: paidNow(state, q, now), step, reward: q.reward ?? null, stamina: questStamina(content, q) || null,
  }));
}

/* The other device, once 开府 is complete on a one-device player's: one card,
   never counted (Hanli, 2026-11-02) — the world names the words and the link
   (world.json `kaifu.other.<device>`). */
function kaifuOther(content, quests, list, lang) {
  if (!list.length || list.some(k => !k.paid)) return null;
  const has = playerDevices(quests), missing = has.mac && !has.phone ? 'phone' : has.phone && !has.mac ? 'mac' : null;
  const card = missing && content?.world?.kaifu?.other?.[missing];
  return card ? { device: missing, title: pick(card.title, lang), url: card.url } : null;
}

/* 开府 in one line, for Look and Progress: `done` (handed in) of `of` (the
   rows the player's devices can do), how many are `ready` to hand in, the
   rows to show (`rows`: ready, then the hints revealed), `next` (the first
   open hint), `opens: 'tomorrow'` when every revealed hint is done and more
   wait (`waiting`, how many: their hint, not their hand-in, is what waits — a row
   done before its hint shows is 交差 at once), and `other` once all is done on one device. */
export function kaifuBrief(state, quests, now, lang, content) {
  const list = kaifuList(state, quests, now, lang, content);
  if (!list.length) return null;
  const pick1 = k => ({ id: k.id, title: k.title, device: k.device, done: k.done, open: k.open, ...(k.how ? { how: k.how } : {}), ...('ask' in k ? { ask: k.ask } : {}), ...(k.to ? { to: k.to } : {}) });
  const rows = [...list.filter(k => k.step === 'ready'), ...list.filter(k => k.step === 'open')].map(k => ({ ...pick1(k), step: k.step }));
  const next = list.find(k => k.step === 'open'), waits = list.some(k => k.step === 'waits'), other = kaifuOther(content, quests, list, lang);
  return { done: list.filter(k => k.paid).length, of: list.length, ready: list.filter(k => k.step === 'ready').length, rows,
    ...(next ? { next: pick1(next) } : waits ? { opens: 'tomorrow', waiting: list.filter(k => k.step === 'waits').length } : {}), ...(other ? { other } : {}) };
}

/* The rows done and unpaid: handed in like any chore — all of them, at once. */
export const kaifuReady = (state, quests, now, content) =>
  kaifuSteps(state, content, quests, now).filter(x => x.step === 'ready').map(x => x.q);

export { deviceOf, isFixed, isOnce, isPool };
