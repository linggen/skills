// rules/playpay.mjs — every 修为 pay is a share of the layer he stands on (Hanli 2026-10-27: 「一层才要470修为, 我们可否按照
// 百分比奖励, 这样等级高了后, 奖励也合理」; doc/games.md § Pay as a share of the layer). A layer is a budget of play time
// (`hours`: 练气一层 2 h, +1 h a layer); the small games and fights carry `games.share` (60%) of its 修为 over `games.time`
// (35%) of its minutes, so a thing that takes m minutes pays m ÷ (time × the layer's minutes) × share of the layer's need —
// × ★ (0.6 · 0.8 · 1.0) × the replay (100 · 50 · 10% the same board the same day). Errands the same on their own share;
// a 人间功课 a fixed share (`chore`: a day's 10%, a week's 20%); what the book authors (a scene's, a pill's, a rumor's 修为)
// is read as a share of the 练气一层 it was written against (`authored.base`, core.mjs amountsOf). 灵石 by the kind (Hanli's
// 20/5 · 10/10 · 5/10 …), on the same ★ and replay. No daily cap; 修为 stops at the gate and turns to 灵石 there (`play`
// converts, core.mjs pay). Every number is balance.json `play_pay`; nothing here names a board.
import { dayKey } from '../state.mjs';

const kindOf = (content, id, task) => (content.games?.games ?? []).find(g => g.task === id)?.mechanic
  ?? (content.games?.games ?? []).find(g => g.id === task?.game && !g.replaced)?.mechanic ?? null;

/* The 修为 the layer he stands on asks (`need` when a model plays it), else its threshold. */
export function needOf(content, state) {
  if (Number.isFinite(state?.need)) return state.need;
  const tier = content.ladder?.tiers?.find(t => t.id === state?.tier);
  return tier?.thresholds?.[state?.step ?? 0] ?? 0;
}
/* The layer's play minutes: `hours` by tier (练气 by its 层), else the default. */
function minutesOf(pp, state) {
  const row = pp.hours?.[state.tier] ?? pp.hours?.default ?? 0;
  return 60 * (Array.isArray(row) ? row[state.step] ?? row.at(-1) ?? 0 : row);
}
/* What one minute of a source is worth: its share of the layer over its share of the layer's minutes. 零层 pays none. */
function perMinute(content, state, src) {
  const pp = content.balance?.play_pay, mins = pp ? minutesOf(pp, state) : 0;
  return src && mins ? (src.share * needOf(content, state)) / (src.time * mins) : 0;
}
/* A fight won (the `haunt` table, a pool's or a rerun's beast): its minutes of play, as a board's (core.mjs amountsOf). */
export function fightPlay(content, state) {
  const pp = content.balance?.play_pay;
  return pp?.fight ? Math.round(perMinute(content, state, pp.games) * pp.fight.minutes) : null;
}
/* A board of `minutes` at the layer's share, at full ★ and first play (tools/balance.mjs plays it). */
export function boardPlay(content, state, minutes) {
  const pp = content.balance?.play_pay;
  return pp ? Math.round(perMinute(content, state, pp.games) * minutes) : null;
}
/* An authored 修为 on a table the book writes (a scene's way on, a pill, a rumor): its share of 练气一层, at this layer. */
export function authoredScale(content, state, table) {
  const a = content.balance?.play_pay?.authored;
  return a?.base && (a.tables ?? []).includes(table) ? needOf(content, state) / a.base : 1;
}

/* How many times this board was paid today (the replay's falling share). */
const playsToday = (state, id, now) => (state.plays?.day === dayKey(now) ? state.plays.ids?.[id] ?? 0 : 0);

/* The grant a board's win is worth now, or null where the world declares no play pay. `stars`: the win's. */
export function playGrant(content, state, id, task, now, stars = null) {
  const pp = content.balance?.play_pay;
  if (!pp) return null;
  const kind = kindOf(content, id, task);
  const minutes = pp.minutes?.[kind] ?? pp.minutes?.default ?? 0;
  const star = stars == null ? 1 : pp.stars?.[String(stars)] ?? 1;
  const replay = pp.replay ?? [1];
  const share = replay[Math.min(playsToday(state, id, now), replay.length - 1)];
  const f = star * share;
  const progress = Math.round(perMinute(content, state, pp.games) * minutes * f);
  const wealth = Math.round((pp.wealth?.[kind] ?? pp.wealth?.default ?? 0) * f);
  return progress || wealth ? { table: 'play', progress, wealth, kind, minutes } : null;
}

/* A beast fought for pay at a haunt or a pool, counted as a board is (its id in `plays`). */
export const hauntPlayId = cid => `haunt:${cid}`;
/* The share a win over this beast pays today: play_pay.replay by how often it was paid today (1 where none is declared). */
export function fightReplay(content, state, cid, now) {
  const replay = content.balance?.play_pay?.replay ?? [1];
  return replay[Math.min(playsToday(state, hauntPlayId(cid), now), replay.length - 1)];
}

/* Counted: one more play of this board today. */
export function playCounted(state, id, now) {
  const day = dayKey(now);
  const ids = state.plays?.day === day ? { ...state.plays.ids } : {};
  ids[id] = (ids[id] ?? 0) + 1;
  state.plays = { day, ids };
}

/* An errand's own share of the layer (the rest's 15% over 10% of the time, by its minutes); 灵石 its own. */
export function errandGrant(content, state) {
  const e = content.balance?.play_pay?.errand;
  if (!e) return null;
  const progress = Math.round(perMinute(content, state, e) * (e.minutes ?? 0));
  return progress || e.wealth ? { table: 'play', progress, wealth: e.wealth ?? 0 } : null;
}

/* A wall's posted tag (rules/rotation.mjs: 执事堂's east wall): a fixed share of the layer — a day's posts together pay
   `play_pay.wall.day` (from the master table: about a day's 功课), so each tag is that over the wall's `posts`. Short
   fetch-and-deliver chores, never the full errand rate (Hanli 10-27: three a day at the errand rate was half a layer). 灵石
   as an errand's. Null where none. */
export function wallGrant(content, state, q) {
  const day = content.balance?.play_pay?.wall?.day, wall = (content.walls ?? []).find(w => w.id === q?.wall);
  if (!day || !wall || !state) return null;
  const progress = Math.round((day / Math.max(1, wall.posts ?? 3)) * needOf(content, state));
  const wealth = content.balance?.play_pay?.errand?.wealth ?? 0;
  return progress || wealth ? { table: 'play', progress, wealth } : null;
}

/* What an errand's work pays on top of its grant: a wall tag its wall share, an 外门 errand (`work`) its minutes. */
export function workGrant(content, state, q) {
  if (q?.wall) return wallGrant(content, state, q);
  return q?.work ? errandGrant(content, state) : null;
}

/* A 人间功课's 修为 (Hanli 2026-10-27, then 「按照百分比奖励」): a fixed share of the layer by its period — a day's 10%, a
   week's 20%, a month's 30% (`play_pay.chore`, from the master table). 人间功课 is 古-line income (Hanli 「算古线吧」): paid on the 古 ladder
   he stands on. Never ★, never the replay: one chore is paid once a period (chores.mjs). Null where none. */
export function chorePlay(content, state, period) {
  const pct = content.balance?.play_pay?.chore?.[period];
  if (!pct || !state) return null;
  return Math.round(pct * needOf(content, state));
}

/* A pill eaten past its own 阶 (a 练气 pill in 筑基) pays `pills.below` of its share for each realm between (数值系统 phase 2:
   a pill is a share of the layer by its 转, at its own realm; one below is a lesser thing). 1 at or under its 阶. */
export function pillBelow(content, state, tier) {
  const below = content.balance?.pills?.below, tiers = content.ladder?.tiers ?? [];
  const gap = tiers.findIndex(t => t.id === state?.tier) - tiers.findIndex(t => t.id === tier);
  return below != null && tier && gap > 0 ? below ** gap : 1;
}

/* What a night's 闭关 is a share of the layer (play_pay.seclusion.night over rewards.json seclusion `rest_hours`): an hour's
   修为 at this layer, as the 闭关 card says it. */
export function secludeHour(content, state) {
  const night = content.balance?.play_pay?.seclusion?.night, r = content.rewards?.seclusion;
  return night && r?.rest_hours ? (night * needOf(content, state)) / r.rest_hours : null;
}

/* 圆满 → 灵石 (balance.json `convert.rate`): 灵石 per 修为 at the 练气一层 the book is written against (`authored.base`), so a
   converted fight pays the same 灵石 at every layer, whatever the layer's 修为 numbers. */
export function convertRate(content, state, conv = content.rewards?.xiuwei_to_lingshi) {
  const base = content.balance?.play_pay?.authored?.base, need = needOf(content, state);
  return (conv?.rate ?? 0) * (base && need ? base / need : 1);
}
