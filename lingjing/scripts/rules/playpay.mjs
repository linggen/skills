// rules/playpay.mjs — 修为 is a fixed number for what he does, never a share of the layer (Hanli 2026-11-02: 「不要按照百分比
// 给.... 给太多了」 · 「我是说参考百分比的数值. 不能直接给百分比」 — supersedes 10-27's 「按照百分比奖励」; and the formula,
// 「这套公式基本可以, 先记下来, 以后在调整吧」; doc/design.md § Pay, doc/games.md § Pay). An act pays
//   R(content level) × its 体力 cost × difficulty × ★ × level gap × replay  (× 灵根 · 签 · 宜, core.mjs amountsOf)
// — and a small game's (a board, a 秘境 room's boards, a 兽潮 night, a 切磋 bout) × `board` on top (Hanli, confirmed
// 2026-11-10: 「把小游戏奖励修为提高到1.5呗, 加快一点升级速度」; raised so the games carry the layer again, the same day:
// 「打一场才几点, 感觉不太匹配」), a card fight against a beast × `fight`; 人间功课, an errand, a wall tag, 闭关, a pill and what
// the book authors never.
// R(L) = 2 × 1.05^(L−1), × 1.2 a realm up (the 修为 a 体力 is worth at that level); 体力 ≈ minutes (1 体力 ≈ 1 分钟); difficulty
// normal 1 · elite 1.5 · boss/副本 2, a first clear +50%; ★ 0.6 · 0.8 · 1.0; the gap −15% a level he stands above the
// content (to 20%), +10% a level below it (to +30%); the replay 100 · 50 · 10% the same thing the same day. What has no
// 体力 of its own (人间功课, a wall tag, an errand's work, a night's 闭关) is priced in 体力-units the same way. A level: L =
// realm × 9 + 层, each 层 one (Hanli 2026-11-10: 81 levels; 段 are display only). The content level is where he stands unless
// the thing says its own (`level`). Every knob is balance.json `play_pay.xiuwei`, derived from `master.xiuwei`
// (tools/master.mjs); % of the layer survives only as the reference tools/numbers.mjs prints. What the book sizes (a scene's,
// a board's, an errand's, a pill's `units`) is units × R where it is paid (Hanli 2026-11-10: 「所有和数值相关的都应该有公式推到」);
// the one number written by hand is a master `told`. 灵石 by the kind, on the same ★ and replay. No daily cap; 修为 stops at the gate and turns
// to 灵石 there (`play` converts, core.mjs pay). Nothing here names a board.
import { boardCost, boardMinutes, dayKey, staminaCost } from '../state.mjs';
import { sealedOf } from './world.mjs';
import { incomeOf, realmOfLevel } from './income.mjs';

/* The row of games.json actually played for a board, and so its mechanic (its 灵石 and minutes): `row` — the game the page
   played it as (an `alt`'s, a games.json row id, or one of its levels' ids) — else the task's own `game`; then the task's
   live row (not `replaced`, not `cut`); the first row naming the task last. Several rows share a task — the ones a board
   was played as before its game was replaced (live 2026-11-02: `cliff-shangya`, 几何冲刺 now, paid as the 打地鼠 it was) —
   so the first row by task is never trusted alone. */
/* The row a name points at for this board: a row naming the task by its id, or by one of its levels' ids; else the game's
   own live row. Null for a name no row holds. */
export function namedRow(content, id, name) {
  if (!name) return null;
  const all = content.games?.games ?? [], rows = all.filter(g => g.task === id);
  return rows.find(g => g.id === name) ?? rows.find(g => (g.levels ?? []).some(l => l.id === name)) ?? all.find(g => g.id === name && !g.replaced && !g.cut) ?? null;
}
export function playedRow(content, id, task, row = null) {
  const rows = (content.games?.games ?? []).filter(g => g.task === id);
  return namedRow(content, id, row) ?? namedRow(content, id, task?.game) ?? rows.find(g => !g.replaced && !g.cut) ?? rows[0] ?? null;
}

/* The 修为 the layer he stands on asks (`need` when a model plays it), else its threshold — the reference's yardstick only. */
export function needOf(content, state) {
  if (Number.isFinite(state?.need)) return state.need;
  const tier = content.ladder?.tiers?.find(t => t.id === state?.tier);
  return tier?.thresholds?.[state?.step ?? 0] ?? 0;
}
/* ── The formula ── */
const X = content => content.balance?.play_pay?.xiuwei ?? null;
/* His level on a ladder (`content.ladder.tiers`: 古's, or a line's world): L = realm × 9 + 层 (Hanli 2026-11-10: 81 levels, L1
   the first realm's 一层; 零层 L0) — a realm of nine 层 one level a 层, whether or not it is shown in 段 (段 are display only);
   one of three steps (今 above 新生) three levels a step, read at its top. Its realm's index beside it. null off the ladder. */
export function levelOf(content, tier, step = 0) {
  const tiers = content.ladder?.tiers ?? [], at = tiers.findIndex(t => t.id === tier);
  if (at < 0) return null;
  const t = tiers[at], n = (t.thresholds?.length ?? t.steps?.zh?.length ?? 3) - (t.zero ? 1 : 0), span = n >= 9 ? 1 : 9 / n;
  return { level: at * 9 + (t.zero ? step : step + 1) * span, realm: at };
}
/* R(L): the 修为 one 体力 is worth at content level L of realm r. 0 at level 0 (零层 pays none). */
export function rateAt(content, level, realm = 0) {
  const x = X(content)?.rate;
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
   difficulty (`normal` · `elite` · `boss`; `first` a first clear's more) × the gap — and, `board` (the caller says: it is a
   small game's play), × `play_pay.xiuwei.board` (1 where the world declares none). Unrounded. */
export function xiuweiOf(content, state, units, { level = null, difficulty = 'normal', first = false, board = false, fight = false } = {}) {
  const x = X(content), me = levelOf(content, state?.tier, state?.step ?? 0);
  if (!x || !me || !units) return 0;
  const lc = level ?? me.level, realm = me.realm;
  const diff = (x.difficulty?.[difficulty] ?? 1) * (first ? 1 + (x.difficulty?.first_clear ?? 0) : 1);
  // `board`: a small game's factor; `fight`: a card fight's (play_pay.xiuwei.fight, Hanli 2026-11-10: 「打一场才几点」) — 1 where none.
  const play = board ? x.board ?? 1 : fight ? x.fight ?? 1 : 1;
  return rateAt(content, lc, realm) * units * diff * gapOf(content, me.level, lc) * play;
}
/* A fight won (the `haunt` table, a pool's beast; 兽潮's night with `play: 'tide'`): the 体力 it costs × the formula. A grant
   that says it is a small game's (`board`: 兽潮's night, a 塔防 board — shouchao.mjs) is paid as one; a card fight never. */
export function fightPlay(content, state, grant = {}) {
  if (!X(content)) return null;
  // A night of 兽潮 its kit's minutes (`units`, shouchao.mjs: the 塔防 kits run 1 to 5 minutes), else the kind's.
  const units = grant.units ?? staminaCost(content, grant.play === 'tide' ? 'shouchao' : 'duel');
  // `star`: the night's ★ as play_pay.stars prices it (兽潮, shouchao.mjs); a pool's beast has none.
  return Math.round(xiuweiOf(content, state, units, { difficulty: grant.boss ? 'boss' : grant.difficulty ?? 'normal', board: Boolean(grant.board), fight: !grant.board }) * (grant.star ?? 1));
}
/* A story step's 修为 (the `story` table, Hanli 2026-11-09: 「剧情可以给修为, 但要给的和玩一场小游戏差不多」): one small game's
   worth where he stands — `play_pay.story.units` 体力 (a default board's, tools/master.mjs) × R. Never an authored number; a
   larger story gain is only one the scene itself tells (exit.grant `narrated`, content.mjs lintEarned). */
export function storyPlay(content, state) {
  const units = content.balance?.play_pay?.story?.units;
  // `board`: one small game's worth, so a small game's factor with it (play_pay.xiuwei.board, 2026-11-10) — it stays a board's.
  return X(content) && units ? Math.round(xiuweiOf(content, state, units, { board: true })) : 0;
}
/* `minutes` of board play (1 体力 ≈ 1 分钟) at full ★ and first play (秘境's rooms; tools/balance.mjs plays it). */
export function boardPlay(content, state, minutes) {
  return X(content) ? Math.round(xiuweiOf(content, state, minutes, { board: true })) : null;
}
/* A size's 修为 (Hanli 2026-11-10: content declares a size, never a 修为 number): `units` 体力-units at R where he stands — the
   same formula as play, so every grant grows with the layer it is paid on. */
export function unitsPay(content, state, units) {
  return units > 0 ? xiuweiOf(content, state, units) : 0;
}
/* The units a grant is sized at (`units`), else null (a legacy number: a made scene's, Ling's). */
export const grantUnits = (content, grant) => grant?.units ?? null;
/* The units a table pays where the rules build the grant from the table alone (今日传闻's step and end, a 奇遇, a 路遇):
   `play_pay.sized` (from master.xiuwei.units.tables), 0 where none. */
export const sizedUnits = (content, table) => content.balance?.play_pay?.sized?.[table] ?? 0;

/* How many times this board was paid today (the replay's falling share). */
const playsToday = (state, id, now) => (state.plays?.day === dayKey(now) ? state.plays.ids?.[id] ?? 0 : 0);

/* The share the next play of this board pays today (play_pay.replay by how often it was paid today: 1 · .5 · .1), or 1. */
export function replayShare(content, state, id, now) {
  const pp = content.balance?.play_pay, replay = (sealedOf(content, state) ? pp?.replay_sealed : null) ?? pp?.replay ?? [1];
  return replay[Math.min(playsToday(state, id, now), replay.length - 1)] ?? 1;
}

/* The grant a board's win is worth now, or null where the world declares no play pay. `stars`: the win's; `first`: a story
   board's first clear (+50%). A board costs its 体力 (`game`: its own minutes, state.mjs boardCost) and pays by them; its kind
   names its 灵石. */
export function playGrant(content, state, id, task, now, stars = null, { first = false, row = null } = {}) {
  const pp = content.balance?.play_pay;
  if (!pp) return null;
  // The row he played it as (`row`, else the one the win wrote down: tasks.mjs win `play_rows`).
  const played = playedRow(content, id, task, row ?? state?.play_rows?.[id] ?? null), kind = played?.mechanic ?? null;
  const minutes = boardMinutes(content, played);
  const star = stars == null ? 1 : pp.stars?.[String(stars)] ?? 1;
  // Inside a sealed instance (world.mjs sealedOf: the 秘境 of 古五) the room's boards are all there is to play: they replay
  // at `replay_sealed` (Hanli approved 2026-11-02: no falloff there), else the day's falling share.
  const replay = (sealedOf(content, state) ? pp.replay_sealed : null) ?? pp.replay ?? [1];
  const share = replay[Math.min(playsToday(state, id, now), replay.length - 1)];
  const f = star * share;
  const units = boardCost(content, 'game', played);
  const progress = Math.round(xiuweiOf(content, state, units, { level: task?.level ?? null, difficulty: task?.difficulty ?? 'normal', first, board: true }) * f);
  // Its 灵石: its kind's minutes of income (play_pay.wealth, batch 2) × I at the board's level (its own, else where he stands).
  const wealth = Math.round(stonesAt(content, state, pp.wealth?.[kind] ?? pp.wealth?.default ?? 0, { level: task?.level ?? null }) * f);
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

/* An errand's work: its minutes as 体力-units (`play_pay.errand.minutes`) × the formula; 灵石 its own size (`ls`, minutes of
   income × I where he stands, batch 2). */
export const errandStones = (content, state) => Math.round(stonesAt(content, state, content.balance?.play_pay?.errand?.ls ?? 0));
export function errandGrant(content, state) {
  const e = content.balance?.play_pay?.errand;
  if (!e) return null;
  const progress = Math.round(xiuweiOf(content, state, e.minutes ?? 0)), wealth = errandStones(content, state);
  return progress || wealth ? { table: 'play', progress, wealth } : null;
}

/* A wall's posted tag (rules/rotation.mjs: 执事堂's east wall): a fixed share of the layer — a day's posts together pay
   `play_pay.wall.day` (from the master table: about a day's 功课), so each tag is that over the wall's `posts`. Short
   fetch-and-deliver chores, never the full errand rate (Hanli 10-27: three a day at the errand rate was half a layer). 灵石
   as an errand's. Null where none. */
export function wallGrant(content, state, q) {
  const day = content.balance?.play_pay?.wall?.day, wall = (content.walls ?? []).find(w => w.id === q?.wall);
  if (!day || !wall || !state) return null;
  const progress = Math.round(xiuweiOf(content, state, day / Math.max(1, wall.posts ?? 3)));
  const wealth = errandStones(content, state);
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

/* An hour's 闭关: a night's 体力-units (play_pay.seclusion.night) over rewards.json seclusion `rest_hours`, × the formula —
   as the 闭关 card says it. */
export function secludeHour(content, state) {
  const night = content.balance?.play_pay?.seclusion?.night, r = content.rewards?.seclusion;
  return night && r?.rest_hours ? xiuweiOf(content, state, night) / r.rest_hours : null;
}

/* ── 灵石 (batch 2, Hanli 2026-11-10: 「所有和数值相关的都应该有公式推到」) ──
   I(L) = income.first × income.growth^(L−1) × income.realm^realm: the 灵石 a minute of play is worth at level L, the same
   shape as R(L) (balance.json `economy.income`, derived from master.economy). 零层 (L0) is read at L1 — it pays 灵石
   (gongke_zero) though it takes no 修为. A level's realm is its own: L = realm × 9 + 层. Every 灵石 the book grants is a size
   in minutes of income (`ls`) × I where it is paid (the content's `level` if it says one, else where he stands); every price
   is minutes × I(the item's level) (tools/master.mjs pricesOf). */
const INC = content => content.balance?.economy?.income ?? null;
export { realmOfLevel };
/* I(L), unrounded; 0 where the world declares no income (rules/income.mjs). */
export const incomeAt = (content, level) => incomeOf(INC(content), level);
/* His level for 灵石: where he stands on the 古 ladder (零层 read as L1). */
export function stoneLevel(content, state) {
  return Math.max(1, levelOf(content, state?.tier, state?.step ?? 0)?.level ?? 1);
}
/* `minutes` of income in 灵石 where it is paid: at the content's `level` if given, else where he stands. Unrounded. */
export function stonesAt(content, state, minutes, { level = null } = {}) {
  return minutes > 0 ? minutes * incomeAt(content, level ?? stoneLevel(content, state)) : 0;
}
/* A pay table's own 灵石 (balance.json `pay.<table>.ls`, minutes) where he stands — what a table pays by itself (labor,
   once, stage, chore_week, life, gongke_zero, haunt), and what it caps a grant at. Rounded. */
export function tableStones(content, state, table) {
  return Math.round(stonesAt(content, state, content.rewards?.tables?.[table]?.ls ?? 0));
}
/* R(L) at a level of its own realm (a thing's level, never where he stands, and never the gap): a levelled pill's 修为. */
export const rateOfLevel = (content, level) => rateAt(content, level, realmOfLevel(level));

/* 圆满 → 灵石 (balance.json `convert`): 灵石 per 修为 past the mark = `share` × I(L) ÷ (R(L) × board) — a minute of small-game
   play past the mark pays `share` of a minute's income on top (batch 2, 2026-11-10). R and I share their shape, so the rate is
   the same at every level; `rate` (a fixed number) where the world declares no income. */
export function convertRate(content, state, conv = content.rewards?.xiuwei_to_lingshi) {
  if (conv?.share != null && INC(content)) {
    const L = stoneLevel(content, state), r = rateOfLevel(content, L) * (X(content)?.board ?? 1);
    return r ? (conv.share * incomeAt(content, L)) / r : 0;
  }
  return conv?.rate ?? 0;
}
