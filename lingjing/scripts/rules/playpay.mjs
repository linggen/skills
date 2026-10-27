// rules/playpay.mjs — what a board, a fight's room or an errand pays by the minutes it takes (Hanli 2026-10-27:
// 「12分钟的一个小游戏占2个小时的10%, 所以要奖励10%的修为」; doc/games.md § Pacing proposal). A layer is a budget of
// play time (练气一层 ~2 h, +1 h a layer); small games carry ~60% of its 修为, paid by each thing's share of the games'
// minutes: 修为 = the layer's rate a minute × the kind's minutes × ★ (0.6 · 0.8 · 1.0) × the replay (100 · 50 · 10% the
// same board the same day). 灵石 by the kind (Hanli's 20/5 · 10/10 · 5/10 …), on the same ★ and replay. No daily cap;
// 修为 stops at the gate and turns to 灵石 there (the `play` table is a converting one, core.mjs pay). Every number is
// balance.json `play_pay`; nothing here names a board.
import { dayKey } from '../state.mjs';

const kindOf = (content, id, task) => (content.games?.games ?? []).find(g => g.task === id)?.mechanic
  ?? (content.games?.games ?? []).find(g => g.id === task?.game && !g.replaced)?.mechanic ?? null;

/* The layer's rate a minute: by tier and step (练气 by its 层), else the default; 零层 pays none. */
function rateOf(table, state) {
  const row = table?.[state.tier];
  if (Array.isArray(row)) return row[state.step] ?? row.at(-1) ?? 0;
  return table?.default ?? 0;
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
  const progress = Math.round(rateOf(pp.rate, state) * minutes * f);
  const wealth = Math.round((pp.wealth?.[kind] ?? pp.wealth?.default ?? 0) * f);
  return progress || wealth ? { table: 'play', progress, wealth, kind, minutes } : null;
}

/* Counted: one more play of this board today. */
export function playCounted(state, id, now) {
  const day = dayKey(now);
  const ids = state.plays?.day === day ? { ...state.plays.ids } : {};
  ids[id] = (ids[id] ?? 0) + 1;
  state.plays = { day, ids };
}

/* An errand's own share of the layer (the rest's ~15%, by its minutes): 修为 by the errand rate, 灵石 its kind's. */
export function errandGrant(content, state) {
  const e = content.balance?.play_pay?.errand;
  if (!e) return null;
  const progress = Math.round(rateOf(e.rate, state) * (e.minutes ?? 0));
  return progress || e.wealth ? { table: 'play', progress, wealth: e.wealth ?? 0 } : null;
}
