// rules/playpay.mjs — 修为 is a fixed number for what he does, never a share of the layer (Hanli 2026-11-02: 「不要按照百分比
// 给.... 给太多了」 · 「我是说参考百分比的数值. 不能直接给百分比」 — supersedes 10-27's 「按照百分比奖励」; and the formula,
// 「这套公式基本可以, 先记下来, 以后在调整吧」; doc/design.md § Pay, doc/games.md § Pay). An act pays
//   R(content level) × its 体力 cost × difficulty × ★ × level gap × replay  (× 灵根 · 签 · 宜, core.mjs amountsOf)
// R(L) = 2 × 1.05^(L−1), × 1.2 a realm up (the 修为 a 体力 is worth at that level); 体力 ≈ minutes (1 体力 ≈ 1 分钟); difficulty
// normal 1 · elite 1.5 · boss/副本 2, a first clear +50%; ★ 0.6 · 0.8 · 1.0; the gap −15% a level he stands above the
// content (to 20%), +10% a level below it (to +30%); the replay 100 · 50 · 10% the same thing the same day. What has no
// 体力 of its own (人间功课, a wall tag, an errand's work, a night's 闭关) is priced in 体力-units the same way. A level: each
// 练气 层 one; a realm's step of three 层-worth three. The content level is where he stands unless the thing says its own
// (`level`). Every knob is balance.json `play_pay.xiuwei`, derived from `master.xiuwei` (tools/master.mjs); % of the
// layer survives only as the reference tools/numbers.mjs prints. What the book authors (a scene's, a pill's, a rumor's
// 修为) is the number written. 灵石 by the kind, on the same ★ and replay. No daily cap; 修为 stops at the gate and turns
// to 灵石 there (`play` converts, core.mjs pay). Nothing here names a board.
import { dayKey, staminaCost } from '../state.mjs';

const kindOf = (content, id, task) => (content.games?.games ?? []).find(g => g.task === id)?.mechanic
  ?? (content.games?.games ?? []).find(g => g.id === task?.game && !g.replaced)?.mechanic ?? null;

/* The 修为 the layer he stands on asks (`need` when a model plays it), else its threshold — the reference's yardstick only. */
export function needOf(content, state) {
  if (Number.isFinite(state?.need)) return state.need;
  const tier = content.ladder?.tiers?.find(t => t.id === state?.tier);
  return tier?.thresholds?.[state?.step ?? 0] ?? 0;
}
/* ── The formula ── */
const X = content => content.balance?.play_pay?.xiuwei ?? null;
/* His level on a ladder (`content.ladder.tiers`: 古's, or a line's world): the first realm one a 层 (零层 0); a realm of
   three steps three a step, one of nine 层 one a 层. Its realm's index beside it. null off the ladder. */
export function levelOf(content, tier, step = 0) {
  const tiers = content.ladder?.tiers ?? [], at = tiers.findIndex(t => t.id === tier);
  if (at < 0) return null;
  const steps = t => (t.thresholds?.length ?? t.steps?.zh?.length ?? 3);
  const per = t => (steps(t) >= 9 ? 1 : 3);
  const first = tiers[0], top = first.zero ? steps(first) - 1 : steps(first);
  if (at === 0) return { level: first.zero ? step : step + 1, realm: 0 };
  let level = top;
  for (let i = 1; i < at; i++) level += steps(tiers[i]) * per(tiers[i]);
  return { level: level + (step + 1) * per(tiers[at]), realm: at };
}
/* R(L): the 修为 one 体力 is worth at content level L of realm r. 0 at level 0 (零层 pays none). */
export function rateAt(content, level, realm = 0) {
  const x = X(content)?.rate;
  return x && level > 0 ? x.base * x.growth ** (level - 1) * (x.realm ?? 1) ** realm : 0;
}
/* S(L): sittings a level asks by the formula — the reference only (tools/numbers.mjs sets it beside the ladder's need). */
export function sittingsAt(content, level, realm = 0) {
  const x = X(content)?.sittings;
  return x && level > 0 ? x.base * x.growth ** (level - 1) * (x.realm ?? 1) ** realm : 0;
}
/* The gap: content below him pays less (−`below` a level, never under `floor`), above him more (+`above`, to `cap`). */
export function gapOf(content, mine, theirs) {
  const g = X(content)?.gap;
  if (!g || mine == null || theirs == null) return 1;
  const d = theirs - mine;
  return d < 0 ? Math.max(g.floor, 1 + d * g.below) : Math.min(1 + g.cap, 1 + d * g.above);
}
/* What `units` 体力 of play is worth to him now: R at the content's level (his own unless `level` says) × units ×
   difficulty (`normal` · `elite` · `boss`; `first` a first clear's more) × the gap. Unrounded. */
export function xiuweiOf(content, state, units, { level = null, difficulty = 'normal', first = false } = {}) {
  const x = X(content), me = levelOf(content, state?.tier, state?.step ?? 0);
  if (!x || !me || !units) return 0;
  const lc = level ?? me.level, realm = me.realm;
  const diff = (x.difficulty?.[difficulty] ?? 1) * (first ? 1 + (x.difficulty?.first_clear ?? 0) : 1);
  return rateAt(content, lc, realm) * units * diff * gapOf(content, me.level, lc);
}
/* A fight won (the `haunt` table, a pool's beast; 兽潮's night with `play: 'tide'`): the 体力 it costs × the formula. */
export function fightPlay(content, state, grant = {}) {
  if (!X(content)) return null;
  const units = staminaCost(content, grant.play === 'tide' ? 'shouchao' : 'duel');
  // `star`: the night's ★ as play_pay.stars prices it (兽潮, shouchao.mjs); a pool's beast has none.
  return Math.round(xiuweiOf(content, state, units, { difficulty: grant.boss ? 'boss' : grant.difficulty ?? 'normal' }) * (grant.star ?? 1));
}
/* `minutes` of board play (1 体力 ≈ 1 分钟) at full ★ and first play (秘境's rooms; tools/balance.mjs plays it). */
export function boardPlay(content, state, minutes) {
  return X(content) ? Math.round(xiuweiOf(content, state, minutes)) : null;
}
/* An authored 修为 is the number the book wrote (2026-11-02): no table scales it by the layer any more — but a pill. A pill's
   number (content.mjs pillPay: its 转's share of the 练气一层 the book is written against) is 体力-units at R(1): it rides
   R as play does (R(L) ÷ R(1)), so its card's 「抵N日打坐」 holds against a night's 闭关 at every layer. */
export function authoredScale(content, state, table) {
  if (table !== 'pill') return 1;
  const x = X(content), me = levelOf(content, state?.tier, state?.step ?? 0);
  return x && me?.level > 0 ? rateAt(content, me.level, me.realm) / x.rate.base : 1;
}

/* How many times this board was paid today (the replay's falling share). */
const playsToday = (state, id, now) => (state.plays?.day === dayKey(now) ? state.plays.ids?.[id] ?? 0 : 0);

/* The grant a board's win is worth now, or null where the world declares no play pay. `stars`: the win's; `first`: a story
   board's first clear (+50%). A board costs its 体力 (`game`); its kind names its 灵石 and the minutes the reference reads. */
export function playGrant(content, state, id, task, now, stars = null, { first = false } = {}) {
  const pp = content.balance?.play_pay;
  if (!pp) return null;
  const kind = kindOf(content, id, task);
  const minutes = pp.minutes?.[kind] ?? pp.minutes?.default ?? 0;
  const star = stars == null ? 1 : pp.stars?.[String(stars)] ?? 1;
  const replay = pp.replay ?? [1];
  const share = replay[Math.min(playsToday(state, id, now), replay.length - 1)];
  const f = star * share;
  const units = staminaCost(content, 'game');
  const progress = Math.round(xiuweiOf(content, state, units, { level: task?.level ?? null, difficulty: task?.difficulty ?? 'normal', first }) * f);
  const wealth = Math.round((pp.wealth?.[kind] ?? pp.wealth?.default ?? 0) * f);
  return progress || wealth ? { table: 'play', progress, wealth, kind, minutes, stamina: units } : null;
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

/* An errand's work: its minutes as 体力-units (`play_pay.errand.minutes`) × the formula; 灵石 its own. */
export function errandGrant(content, state) {
  const e = content.balance?.play_pay?.errand;
  if (!e) return null;
  const progress = Math.round(xiuweiOf(content, state, e.minutes ?? 0));
  return progress || e.wealth ? { table: 'play', progress, wealth: e.wealth ?? 0 } : null;
}

/* A wall's posted tag (rules/rotation.mjs: 执事堂's east wall): a fixed share of the layer — a day's posts together pay
   `play_pay.wall.day` (from the master table: about a day's 功课), so each tag is that over the wall's `posts`. Short
   fetch-and-deliver chores, never the full errand rate (Hanli 10-27: three a day at the errand rate was half a layer). 灵石
   as an errand's. Null where none. */
export function wallGrant(content, state, q) {
  const day = content.balance?.play_pay?.wall?.day, wall = (content.walls ?? []).find(w => w.id === q?.wall);
  if (!day || !wall || !state) return null;
  const progress = Math.round(xiuweiOf(content, state, day / Math.max(1, wall.posts ?? 3)));
  const wealth = content.balance?.play_pay?.errand?.wealth ?? 0;
  return progress || wealth ? { table: 'play', progress, wealth } : null;
}

/* What an errand's work pays on top of its grant: a wall tag its wall share, an 外门 errand (`work`) its minutes. */
export function workGrant(content, state, q) {
  if (q?.wall) return wallGrant(content, state, q);
  return q?.work ? errandGrant(content, state) : null;
}

/* A 人间功课's 修为: its period's 体力-units (`play_pay.chore`: a day 5, a week 10, a month 15 — a day's about 10 修为 at
   练气一层) × the formula (2026-11-02; was a share of the layer). 人间功课 is 古-line income (Hanli 「算古线吧」): paid on the 古
   ladder he stands on. Never ★, never the replay: one chore is paid once a period (chores.mjs). Null where none. */
export function chorePlay(content, state, period) {
  const units = content.balance?.play_pay?.chore?.[period];
  if (!units || !state) return null;
  return Math.round(xiuweiOf(content, state, units));
}

/* A pill eaten past its own 阶 (a 练气 pill in 筑基) pays `pills.below` of its share for each realm between (数值系统 phase 2:
   a pill is a share of the layer by its 转, at its own realm; one below is a lesser thing). 1 at or under its 阶. */
export function pillBelow(content, state, tier) {
  const below = content.balance?.pills?.below, tiers = content.ladder?.tiers ?? [];
  // A 阶 off the ladder (仙阶, balance.json pills `by_tier`) is never below him: 仙气自己找路.
  const own = tiers.findIndex(t => t.id === tier);
  const gap = tiers.findIndex(t => t.id === state?.tier) - own;
  return below != null && tier && own >= 0 && gap > 0 ? below ** gap : 1;
}

/* An hour's 闭关: a night's 体力-units (play_pay.seclusion.night) over rewards.json seclusion `rest_hours`, × the formula —
   as the 闭关 card says it. */
export function secludeHour(content, state) {
  const night = content.balance?.play_pay?.seclusion?.night, r = content.rewards?.seclusion;
  return night && r?.rest_hours ? xiuweiOf(content, state, night) / r.rest_hours : null;
}

/* 圆满 → 灵石 (balance.json `convert.rate`): 灵石 per 修为, flat — 修为 is a fixed number now (2026-11-02), so no layer
   rescales it. */
export function convertRate(content, state, conv = content.rewards?.xiuwei_to_lingshi) {
  return conv?.rate ?? 0;
}
