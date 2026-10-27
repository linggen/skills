// stats.mjs — the play log read back (rules/analytics.mjs writes it): what the dev page (stats.html) shows and what
// tools/analytics-read.mjs hands the numbers. Pure: lines in, one report out — no files, no clock (the caller's `now`).
//
// Every target is the world's own model (balance.json): a board's minutes by its kind (`play_pay.minutes`, the
// mechanic games.json names), a passage at `model.chars_per_min`, a 回 at the typical player's band of days
// (`model.bands.typical`) × his minutes a day (`model.players.typical.minutes`), a layer at the hours rule
// (`_play_pay`: 练气一层 ~2 h, +1 h a layer), 修为 by source at its plan (`_play_pay`: the small games ~60%, errands ~15%).

const IDLE_CUT_S = 120;
/* The hours rule (balance.json `_play_pay`, Hanli 2026-10-27: 「练气1层比如要玩2小时 … 每一层多比如1个小时」). */
export const LAYER_HOURS = { first: 2, per: 1 };
/* 修为 by source, the plan (balance.json `_play_pay`: the small games ~60% of a layer's 修为; errands the rest's ~15%). */
export const PLAN = { games: 0.6, errands: 0.15, rest: 0.25 };

const r1 = (x) => Math.round(x * 10) / 10;
const pct = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : null);
export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const dayOf = (at) => String(at).slice(0, 10);
const group = (xs, key) => { const m = new Map(); for (const x of xs) { const k = key(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const sum = (xs, f) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);

/* ── Where the time went ── */

/* Active seconds a line counts: a sitting's tick or end carries the time since the last. */
const activeOf = (l) => (l.kind === 'session' && (l.op === 'tick' || l.op === 'end') ? Number(l.active_s) || 0 : 0);

/** Days played, sittings a day, streaks. */
export function retention(lines, now) {
  const days = [...new Set(lines.map((l) => dayOf(l.at)))].sort();
  const starts = lines.filter((l) => l.kind === 'session' && l.op === 'start');
  const byDay = group(lines, (l) => dayOf(l.at));
  const perDay = days.map((d) => {
    const ls = byDay.get(d) ?? [];
    return { day: d, sessions: ls.filter((l) => l.kind === 'session' && l.op === 'start').length, active_min: r1(sum(ls, activeOf) / 60), boards: ls.filter((l) => l.kind === 'board').length, fights: ls.filter((l) => l.kind === 'fight').length };
  });
  // Streaks over calendar days (UTC dates, as the lines are stamped).
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && (Date.parse(d) - Date.parse(prev)) === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const today = now ? now.toISOString().slice(0, 10) : null;
  const yesterday = now ? new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10) : null;
  const current = prev && (prev === today || prev === yesterday) ? run : 0;
  // Next-day return: of the days played (but the last), the share followed by a day played.
  const set = new Set(days);
  const nextOf = days.slice(0, -1).filter((d) => set.has(new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10))).length;
  return {
    days: days.length, first: days[0] ?? null, last: days.at(-1) ?? null, sessions: starts.length,
    sessions_per_day: days.length ? r1(starts.length / days.length) : null,
    active_min: r1(sum(lines, activeOf) / 60), streak: { current, longest },
    next_day: days.length > 1 ? pct(nextOf, days.length - 1) : null, per_day: perDay,
  };
}

/** Active minutes by 回 and by layer, beside their targets. */
export function timeBy(lines, content) {
  const model = content?.balance?.model ?? {};
  const band = model.bands?.typical ?? null, perDay = model.players?.typical?.minutes ?? null;
  const huiTarget = band && perDay ? [band[0] * perDay, band[1] * perDay] : null;
  const ticks = lines.filter((l) => activeOf(l) > 0);
  const hui = [...group(ticks, (l) => l.hui ?? null)].map(([id, ls]) => ({
    hui: id, active_min: r1(sum(ls, activeOf) / 60), days: new Set(ls.map((l) => dayOf(l.at))).size,
    target_min: huiTarget, first: ls[0].at,
  })).sort((a, b) => String(a.first).localeCompare(String(b.first)));
  const layer = [...group(ticks, (l) => (l.tier ? `${l.tier}:${l.layer ?? 0}` : null))].map(([key, ls]) => {
    const [tier, n] = key.split(':'), L = Number(n);
    const target = tier === 'qi' && L >= 1 ? (LAYER_HOURS.first + (L - 1) * LAYER_HOURS.per) * 60 : null;
    return { tier, layer: L, active_min: r1(sum(ls, activeOf) / 60), target_min: target, days: new Set(ls.map((l) => dayOf(l.at))).size, first: ls[0].at };
  }).sort((a, b) => String(a.first).localeCompare(String(b.first)));
  return { hui, layer, hui_target: huiTarget, layer_rule: LAYER_HOURS };
}

/* ── Boards, fights, passages ── */

/* A board's kind (its mechanic) as rules/playpay.mjs reads it: the registry row for the task, else for the game. */
function mechanicOf(content, task, game) {
  const games = content?.games?.games ?? [];
  return games.find((g) => g.task && g.task === task)?.mechanic ?? games.find((g) => g.id === game && !g.replaced)?.mechanic ?? null;
}

export function boards(lines, content) {
  const pp = content?.balance?.play_pay;
  const rows = lines.filter((l) => l.kind === 'board');
  return [...group(rows, (l) => l.game ?? l.id)].map(([game, ls]) => {
    const mech = mechanicOf(content, ls[0].task ?? ls[0].id, game);
    const designed = pp ? pp.minutes?.[mech] ?? pp.minutes?.default ?? null : null;
    const n = ls.length, out = (o) => ls.filter((l) => l.outcome === o).length;
    return {
      game, mechanic: mech, n, designed_min: designed,
      median_min: median(ls.map((l) => (Number(l.active_s) || 0) / 60)) != null ? r1(median(ls.map((l) => (Number(l.active_s) || 0) / 60))) : null,
      median_wall_min: median(ls.map((l) => (Number(l.ms) || 0) / 60000)) != null ? r1(median(ls.map((l) => (Number(l.ms) || 0) / 60000))) : null,
      won: pct(out('won'), n), lost: pct(out('lost'), n), skipped: pct(out('skipped'), n), left: pct(out('left'), n),
      retries: r1(sum(ls, (l) => l.retries) / n), hints: r1(sum(ls, (l) => l.hints) / n),
      sources: Object.fromEntries([...group(ls, (l) => l.source ?? 'unknown')].map(([k, v]) => [k, v.length])),
      levels: [...new Set(ls.map((l) => l.level).filter(Boolean))].slice(0, 8),
    };
  }).sort((a, b) => b.n - a.n);
}

export function fights(lines) {
  const rows = lines.filter((l) => l.kind === 'fight' && l.outcome);
  return [...group(rows, (l) => l.beast ?? l.id)].map(([beast, ls]) => {
    const n = ls.length, won = ls.filter((l) => l.outcome === 'won').length;
    const odds = ls.map((l) => Number(l.odds)).filter(Number.isFinite);
    const chips = [...group(ls, (l) => l.chip ?? null)].sort((a, b) => b[1].length - a[1].length);
    return {
      beast, n, won: pct(won, n), bot: odds.length ? r1((sum(odds, (x) => x) / odds.length) * 100) : null,
      chip: chips[0]?.[0] ?? null, turns: median(ls.map((l) => Number(l.turns))), hand: median(ls.map((l) => Number(l.hand))),
      places: [...new Set(ls.map((l) => l.place).filter(Boolean))].slice(0, 4),
      min: median(ls.map((l) => (Number(l.active_s) || 0) / 60)) != null ? r1(median(ls.map((l) => (Number(l.active_s) || 0) / 60))) : null,
    };
  }).sort((a, b) => b.n - a.n);
}

export function reading(lines, content) {
  const rows = lines.filter((l) => l.kind === 'read');
  const chars = sum(rows, (l) => l.chars), read = rows.filter((l) => !l.skipped);
  const ms = sum(read, (l) => l.ms), readChars = sum(read, (l) => l.chars);
  return {
    passages: rows.length, chars, skipped: pct(rows.length - read.length, rows.length),
    chars_per_min: ms ? Math.round(readChars / (ms / 60000)) : null, model_chars_per_min: content?.balance?.model?.chars_per_min ?? null,
    minutes: r1(ms / 60000),
  };
}

/* ── Where play stalls ── */

export function stalls(lines) {
  const gates = lines.filter((l) => l.kind === 'gate' && l.op === 'open' && Number(l.waited_s) > 0)
    .sort((a, b) => b.waited_s - a.waited_s).slice(0, 12)
    .map((l) => ({ what: l.what, waited_min: r1(l.waited_s / 60), at: l.at, hui: l.hui ?? null, scene: l.at_scene ?? null }));
  const shut = lines.filter((l) => l.kind === 'gate' && l.op === 'shut').length;
  const signals = [...group(lines.filter((l) => l.kind === 'stall'), (l) => `${l.what}|${l.board ?? l.scene ?? ''}`)]
    .map(([k, ls]) => ({ what: ls[0].what, board: ls[0].board ?? null, scene: ls[0].scene ?? ls[0].at_scene ?? null, n: ls.length, idle_min: r1(Math.max(...ls.map((l) => Number(l.idle_s) || 0)) / 60), last: ls.at(-1).at }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const refusals = [...group(lines.filter((l) => l.kind === 'refused'), (l) => `${l.verb}|${l.why}`)]
    .map(([, ls]) => ({ verb: ls[0].verb, why: ls[0].why, n: ls.length, streak: Math.max(...ls.map((l) => Number(l.streak) || 1)) }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  const errors = [...group(lines.filter((l) => l.kind === 'error'), (l) => `${l.where}|${l.msg}`)]
    .map(([, ls]) => ({ where: ls[0].where, msg: ls[0].msg ?? '', n: ls.length, last: ls.at(-1).at }))
    .sort((a, b) => b.n - a.n).slice(0, 12);
  // Where each day's play stopped: the day's last line — its scene and 回, and what was on.
  const days = [...group(lines, (l) => dayOf(l.at))].map(([day, ls]) => {
    const last = ls.filter((l) => !(l.kind === 'session' && l.op !== 'start')).at(-1) ?? ls.at(-1);
    return { day, at: last.at, kind: last.kind, what: last.game ?? last.beast ?? last.what ?? last.scene ?? null, outcome: last.outcome ?? null, hui: last.hui ?? null, scene: last.at_scene ?? null };
  });
  return { gates, gates_shut: shut, signals, refusals, errors, day_ends: days.slice(-14) };
}

/* ── Income ── */

/* A pay line's source, as the plan counts it. */
export function categoryOf(l) {
  const v = l.verb ?? String(l.src ?? '').split(':')[0], a = String(l.src ?? '').split(':')[1] ?? null;
  if (v === 'win' || v === 'kao' || v === 'shouchao' || (v === 'task' && a === 'done') || (v === 'tale' && a === 'win') || v === 'duizi' || v === 'lundao') return 'games';
  if (v === 'duel' || v === 'tame') return 'fights';
  if (v === 'task' && (a === 'check' || a === 'quest')) return 'chores';
  if (v === 'quest') return 'chores';
  if (v === 'seclude') return 'seclusion';
  if (v === 'trade' || v === 'haggle') return 'shop';
  if (v === 'resolve' || v === 'enter' || v === 'meet' || v === 'go' || v === 'turn') return 'story';
  return 'other';
}

export function income(lines) {
  const rows = lines.filter((l) => l.kind === 'pay');
  const cats = {};
  const add = (c, xw, ls) => { cats[c] ??= { xw: 0, ls: 0, n: 0 }; cats[c].xw += xw; cats[c].ls += ls; cats[c].n += 1; };
  for (const l of rows) {
    add(categoryOf(l), Number(l.xw) || 0, Math.max(0, Number(l.ls) || 0));
    if (l.errand_xw || l.errand_ls) add('errands', Number(l.errand_xw) || 0, Number(l.errand_ls) || 0);
  }
  const xw = Object.values(cats).reduce((a, c) => a + c.xw, 0);
  const spent = -sum(rows.filter((l) => Number(l.ls) < 0), (l) => l.ls);
  const by = Object.entries(cats).map(([cat, c]) => ({ cat, xw: c.xw, ls: c.ls, n: c.n, share: pct(c.xw, xw), plan: cat === 'games' ? PLAN.games * 100 : cat === 'errands' ? PLAN.errands * 100 : null })).sort((a, b) => b.xw - a.xw);
  const rest = by.filter((c) => c.cat !== 'games' && c.cat !== 'errands').reduce((a, c) => a + c.xw, 0);
  return { xw, ls: Object.values(cats).reduce((a, c) => a + c.ls, 0), ls_spent: spent, by, rest_share: pct(rest, xw), plan: PLAN };
}

/* ── Asks and hints ── */

export function asks(lines) {
  const rows = lines.filter((l) => l.kind === 'ask');
  return { n: rows.length, by: Object.fromEntries([...group(rows, (l) => `${l.to}:${l.what ?? ''}`)].map(([k, v]) => [k, v.length])), hints: sum(lines.filter((l) => l.kind === 'hint'), () => 1) };
}

/** The whole report. `now` for the streaks. */
export function report(lines, content, { now = new Date() } = {}) {
  const ls = (Array.isArray(lines) ? lines : []).filter((l) => l && l.at && l.kind).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return {
    lines: ls.length, idle_cut_s: IDLE_CUT_S, devices: [...new Set(ls.map((l) => l.dev ?? 'mac'))],
    retention: retention(ls, now), time: timeBy(ls, content), boards: boards(ls, content), fights: fights(ls),
    reading: reading(ls, content), stalls: stalls(ls), income: income(ls), asks: asks(ls),
  };
}
