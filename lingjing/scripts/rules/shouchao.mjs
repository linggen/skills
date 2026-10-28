// rules/shouchao.mjs — 兽潮: the daily beast tide at 沉鼎观, a plot the game alone has (Hanli 2026-10-20:
// 「兽潮塔防可以作为游戏里才有的一个情节. 比如每天固定时间有兽潮攻击沉鼎观. 在游戏里交代一下就好了」; it plays
// 守墙关, 「可以」; 「这几个主力游戏都有多个关卡, 以后要持续加关卡. 然后游戏里每次出现一个关卡」). No clock window since
// 2026-10-26 (「好, 按这样改」: players missed 酉时): once a cooldown, at any hour, as the 秘境 rerun is.
// Part of the rules engine; rules.mjs is its one door.
//
// Everything it knows is the task row's (tasks/world.json `shouchao`): the cooldown (`every_h`, from
// balance.json `cooldowns.shouchao_h`), the scene that opens it (古四's 小周天, the first night he has 灵力),
// the places of 沉鼎观 where it is joined, the 灵气 it costs, the pay by stars, 银月's one telling, the
// words of a tide not yet back (`shut`). Its board is offered at any hour while he stands at 沉鼎观, out of
// any instance, run or fight, unless a night was counted (`task done`) less than `every_h` hours ago — one
// night a cooldown. A night missed costs nothing: the senior disciples hold the wall, and only that night's
// pay is missed.
//
// THE NIGHTS: first the hand-made rows of 守墙关's level table (levels/shouqiang.json) that carry a `tide` number, in that
// order, whose beasts are all of his 回 or before (creatures.json `hui`, read in book order — h11 is 古七, h09 古八); a
// row added later is played first. Past them (Hanli 2026-10-28: 「最好不要反复」 · 「主力塔防放进兽潮」 · 「关卡要多, 最起码1个月
// 不重复」), each night is MADE by one of the 游戏厅's 主力 塔防 kits in turn (`rotation`; each kit's maker beside its
// engine, games/tide.js), never the kit of the night before when another can come, from the save's seed and the
// night's number; a layout the save has held (`seen`, by its `sig`) is never dealt again. Each kit climbs over its own
// first `climb` nights; a 大妖 of his 回 comes on the `boss` nights, in a kit with 结印. A won night moves him on;
// a lost one comes again exactly (nothing it is made from has moved). The day's first nights pay in full, the rest
// a replay's falling share (tideShare).
import { dayKey, lockedOf, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { sideLine } from './hui.mjs';
import { beastOpen, kitOf } from './reveal.mjs';
import { stow, storedLine } from './pouch.mjs';
import { hashOf } from './travel.mjs';
import { beatOf, passed, sceneOf } from './world.mjs';
import { keyDrop } from './mijing.mjs';
import { TIDES } from '../games/tide.js';

const tideTask = content => (content.tasks?.tasks ?? []).find(t => t.shouchao) ?? null;

/* 守墙关's level table (levels/shouqiang.json), read once per world. */
export const wallKit = content => kitOf(content, 'shouqiang');

/* ── The cooldown ── */
const HOUR = 3600_000;
/* When the last night was counted: the save's own mark, or (a save counted before 2026-10-26) the task's done_at. */
const lastAt = (state, t) => state.shouchao?.at ?? (state.tasks?.[t.id]?.status === 'done' ? state.tasks[t.id].done_at : null) ?? null;
/* Milliseconds until the tide comes again (0: it is up now). */
export function tideWait(state, t, now) {
  const last = lastAt(state, t);
  return last ? Math.max(0, Date.parse(last) + (t.shouchao.every_h ?? 20) * HOUR - now.getTime()) : 0;
}
const cooling = (state, t, now) => tideWait(state, t, now) > 0;

/* ── Who may join ── */
/* Has he held a night of the tide? (A save from before the 执事堂's errand had: it never sees the errand.) */
export const tideBegun = state => heldN(state.shouchao ?? {}) > 0;
/* The tide's first night is an errand (`intro`, quests/guan.json — Hanli 2026-10-28: 「执事堂里加一个兽潮来袭的防御差事就可以了吧」):
   till it is done (or a night was held before it existed) no hourly tide is offered anywhere. */
const introDone = (content, state, c) => !c.intro || Boolean(state.quests?.[c.intro]?.done_at) || tideBegun(state);
/* The errand's night: the tide's board, its errand taken and not done, his first night not yet held. */
export function shouchaoFirst(content, state, id) {
  const t = tideTask(content);
  return Boolean(t && t.id === id && t.shouchao.intro && state.quests?.[t.shouchao.intro] && !state.quests[t.shouchao.intro].done_at && !tideBegun(state));
}
/* Past the scene that opens it (古四's 小周天), standing at 沉鼎观, on the 古 line, out of any instance,
   run, fight or beat — and after 入门, when the 灵石 are his. */
function tideUp(content, state, t) {
  const c = t.shouchao;
  if (c.after && !passed(content, state, c.after)) return false;
  if (!introDone(content, state, c)) return false;
  // …and never inside a key beat's lock (the 柴房 nights: 「你一身是伤，哪儿也去不了」): the story holds him there.
  if (state.sealed || state.rerun || state.fight || beatOf(content, state)) return false;
  if (sideLine(content, sceneOf(content, state))) return false;
  if (lockedOf(content, state).includes('wealth')) return false;
  return !c.places || c.places.includes(state.place);
}
/* Look's task list: the board offered, at any hour, out of the cooldown. */
export function shouchaoHosted(content, state, now) {
  const t = tideTask(content);
  if (!t || !tideUp(content, state, t) || cooling(state, t, now)) return {};
  return { [t.id]: { status: 'offered' } };
}
/* Its win may be played and counted: out of the cooldown. */
export function shouchaoHere(content, state, id, now) {
  const t = tideTask(content);
  return Boolean(t) && t.id === id && tideUp(content, state, t) && !cooling(state, t, now);
}
/* Its row waits (Look keeps it past midnight): where he may join, inside the cooldown. */
export function shouchaoWaiting(content, state, id, now) {
  const t = tideTask(content);
  return Boolean(t) && t.id === id && tideUp(content, state, t) && cooling(state, t, now);
}
/* Look's `waits` row for the tide inside its cooldown, where he may join: the tide just held, its line, the minutes left. */
export function shouchaoWait(content, state, now) {
  const t = tideTask(content);
  if (!t || !shouchaoWaiting(content, state, t.id, now)) return null;
  const r = shouchaoRow(content, state, now);
  return { id: t.id, title: r.title, shut: r.shut ?? null, wait_min: r.wait_min };
}
/* The tide's task (tasks.mjs taskOpen asks it alone, never the generic period). */
export const isTide = (content, id) => tideTask(content)?.id === id;
/* Inside the cooldown where he may join: refused in the world's words, with the minutes left — else null. */
export function shouchaoShut(content, state, id, now) {
  const t = tideTask(content);
  if (!t || t.id !== id || !tideUp(content, state, t)) return null;
  const wait = tideWait(state, t, now);
  return wait > 0 ? refuse('shut', pick(t.shouchao.shut, state.lang) ?? null, { left_min: Math.ceil(wait / 60_000) }) : null;
}

/* ── The nights ── */
/* A beast of his 回 or before: rules/reveal.mjs, which 撒豆成兵's 秘境 deals share. */
export { beastOpen };
const kindsOf = level => [...new Set(level.waves.flat().map(g => g[0]))];
const fits = (content, state, level) => kindsOf(level).every(k => beastOpen(content, state, k));
/* The hand-made nights, in `tide` order. */
/* A row a story plays (`story` set: 「药园巡夜 · 开春」 at 09-furnace) is never a night of the tide, `tide` or no. */
export const tideRows = kit => (kit?.levels ?? []).filter(l => l.tide != null && !l.story).sort((a, b) => a.tide - b.tide);

/* How many nights he has held (a save from before 2026-10-28 counted the rows won and the rises). */
const heldN = held => held.n ?? ((held.won?.length ?? 0) + (held.risen ?? 0));
/* A kit's level table as its maker reads it: levels/<game>.json, else its games.json row (守炉's levels live there). */
function tableOf(content, game) {
  return kitOf(content, game) ?? (content.games?.games ?? []).find(g => g.id === game && Array.isArray(g.levels)) ?? null;
}
/* Is night `n` a 大妖's (the task's `boss`: from night `from`, every `every`th)? */
export function bossNight(c, n) {
  const b = c.boss ?? {};
  return n >= (b.from ?? 4) && (n - (b.from ?? 4)) % (b.every ?? 3) === 0;
}
/* The kits that turn tonight, in the order they are tried: those met least first, never last night's kit when another can
   come, then by the night's own draw (the save's seed): so the four come round in turn, in a different order each round. */
function kitsInTurn(content, state, c, n) {
  const held = state.shouchao ?? {}, seen = held.kits ?? {}, seed = seedOf(state);
  const turn = (c.rotation ?? []).filter(k => TIDES[k.game] && (!k.after || passed(content, state, k.after)) && tableOf(content, k.game));
  const order = (a, b) => (seen[a.game] ?? 0) - (seen[b.game] ?? 0) || hashOf(`${seed}|${n}|${a.game}`) - hashOf(`${seed}|${n}|${b.game}`);
  const sorted = [...turn].sort(order);
  return sorted.length > 1 ? [...sorted.filter(k => k.game !== held.last), ...sorted.filter(k => k.game === held.last)] : sorted;
}
/* A made night of kit `k`: its maker asked with the night's seed, `salt` stepped on until the layout is one this save has
   never held (`seen`). The same save, night and history ask the same, so a lost night comes again as it was. */
/* A maker's night, kept: a maker proves its layout by playing it (tens of ms to a few s), and Look asks every turn. Its
   answer depends on its ask alone, so the ask is the key (the beasts open written out). */
const made = new Map();
function makeOnce(content, game, table, ask, openKey) {
  const key = `${game}|${ask.seed}|${ask.tier}|${ask.boss}|${openKey}`;
  if (!made.has(key)) {
    if (made.size > 400) made.delete(made.keys().next().value);
    made.set(key, TIDES[game].night(table, ask));
  }
  return made.get(key);
}
function madeNight(content, state, c, k, n, boss) {
  const held = state.shouchao ?? {}, seen = new Set(held.seen ?? []), maker = TIDES[k.game], table = tableOf(content, k.game);
  // First the kit's twenty levels (levels/tide.json, tools/tide-levels.mjs: each proven), in order — a 大妖's night its
  // next boss level, any other night its next plain one — of beasts he has met and never held; then its maker's own.
  const fit = l => !seen.has(l.sig) && l.kinds.every(kind => beastOpen(content, state, kind)) && Boolean(l.boss) === Boolean(boss && maker.boss);
  const level = (kitOf(content, 'tide')?.[k.game]?.levels ?? []).find(fit);
  if (level) return { deal: level.deal, sig: level.sig, boss: Boolean(level.boss), kinds: level.kinds, game: k.game, level: level.i };
  const tier = Math.round(Math.min(1, (held.kits?.[k.game] ?? 0) / (c.climb ?? 12)) * 1000) / 1000;
  const openKey = (content.creatures?.creatures ?? []).filter(x => beastOpen(content, state, x.id)).map(x => x.id).join(',');
  const ask = { tier, boss: boss && maker.boss, open: kind => beastOpen(content, state, kind) };
  let first = null;
  for (let salt = 0; salt < 24; salt += 1) {
    const made = makeOnce(content, k.game, table, { ...ask, seed: `${seedOf(state)}|${n}${salt ? `|${salt}` : ''}` }, openKey);
    if (!made) return null;
    first ??= made;
    if (!seen.has(made.sig)) return { ...made, game: k.game, tier };
  }
  return { ...first, game: k.game, tier };
}

/* The night he would play now: the first hand-made row of 守墙关's table not yet won that fits his 回 (the tide's opening
   arc: 野猪, 狰, the 犰狳 and the first young 合窳, the 山门 with its 鬿雀 — a row added later is played first); past
   them, a night made by one of the 主力 塔防 kits in turn (`rotation`), a 大妖 of his 回 on the task's `boss` nights.
   `n`: which night this is (the nights held + 1). */
export function tonight(content, state) {
  const t = tideTask(content), kit = wallKit(content);
  if (!t || !kit) return null;
  const c = t.shouchao, held = state.shouchao ?? {}, won = new Set(held.won ?? []), n = heldN(held) + 1;
  const row = tideRows(kit).filter(l => fits(content, state, l)).find(l => !won.has(l.id));
  if (row) {
    const kinds = kindsOf(row);
    return { n, game: t.game, row, sig: `${t.game}:${row.id}`, kinds, boss: kinds.some(k => kit.beasts?.[k]?.boss), deal: { lv: row.id } };
  }
  const boss = bossNight(c, n);
  const kits = kitsInTurn(content, state, c, n);
  // A 大妖's night goes to a kit that brings one (and has one of his 回 to bring), the first in turn; else as any night.
  const tries = boss ? [...kits.filter(k => TIDES[k.game].boss), ...kits] : kits;
  for (const k of tries) {
    const made = madeNight(content, state, c, k, n, boss);
    if (made && (!boss || made.boss || k === tries.at(-1) || !TIDES[k.game].boss)) return { n, ...made };
  }
  for (const k of kits) { const made = madeNight(content, state, c, k, n, false); if (made) return { n, ...made }; }
  return null;
}

/* What the board is dealt tonight (Look's row, `deal`, and the kit that plays it, `game`): the night's own words — its
   title, the lead with 银月's one telling the first time — over the hand-made row, or the made night's whole deal. */
export function shouchaoRow(content, state, now) {
  const t = tideTask(content);
  if (!t) return {};
  const lang = state.lang, c = t.shouchao;
  const nameOf = n => ({ zh: `${pick(c.title, 'zh')} · 第${n}潮`, en: `${pick(c.title, 'en')} · tide ${n}` });
  // Inside the cooldown: the row names the night just held, says when the next comes, and deals nothing more (nor makes it).
  const wait = tideWait(state, t, now), held = heldN(state.shouchao ?? {});
  if (wait > 0 && held > 0) return { tide: true, night: held, title: pick(nameOf(held), lang), wait_min: Math.ceil(wait / 60_000), shut: pick(c.shut, lang) ?? null };
  // Made only where it may be played (the tide up, or its errand's night): Look asks of every save every turn.
  if (!shouchaoFirst(content, state, t.id) && !tideUp(content, state, t)) return {};
  const night = tonight(content, state);
  if (!night) return {};
  const title = nameOf(night.n);
  const head = { tide: true, night: night.n, game: night.game, ...(night.boss ? { boss: true } : {}), title: pick(title, lang) };
  // A made night: its kit's whole deal, the night's title laid on its `over` where it has one (守墙关's top bar reads it).
  if (!night.row) return { ...head, deal: { ...night.deal, ...(night.deal.over ? { over: { ...night.deal.over, title } } : {}), tide: true, title } };
  // 银月's telling, the first night only (until a night is won): the shell's lead card reads it.
  const told = Boolean(state.shouchao?.told);
  const lead = [...(told ? [] : c.tell ?? []), ...(night.row.lead ?? [])];
  return { ...head, deal: { lv: night.row.id, over: { title, lead, story: t.id } } };
}

/* The share a night pays (balance.json `play_pay.tide`): the day's first `full` nights in full, then a replay's falling
   share (`play_pay.replay`, the same rule as a board played again) — the tide every hour is no farm. */
export function tideShare(content, state, now) {
  const pp = content.balance?.play_pay ?? {}, full = pp.tide?.full ?? Infinity, fall = pp.replay ?? [1];
  const held = state.shouchao ?? {}, today = held.day?.key === dayKey(now) ? held.day.count ?? 0 : 0;
  return today < full ? 1 : fall[Math.min(today - full + 1, fall.length - 1)];
}

/* ── Counted ── */
/* Its win handed in (tasks.mjs taskDone): the night's 灵气, the pay by stars (by the day's share), the next night moved on. */
export function shouchaoDone(state, content, ctx, id) {
  const t = tideTask(content), c = t.shouchao;
  if (!state.wins?.[id]) return refuse('not-won', null);
  const night = tonight(content, state);
  if (!night) return refuse('not-here', null);
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, c.cost ?? 'game');
  if (empty) return empty;
  delete s.wins[id];
  const stars = Math.max(1, Math.min(3, Number(s.stars?.[id] ?? 1) || 1));
  if (s.stars) delete s.stars[id]; // the night's, not a best ever
  const row = c.pay?.[stars] ?? {}, share = tideShare(content, state, ctx.now);
  const paid = pay(content, s, ctx, { table: c.table ?? 'haunt', progress: row.progress ?? 0, wealth: 0, ...(share < 1 ? { share } : {}) });
  // 灵石 by the small-game ranks (balance.json `boards`): every night, by the day's share.
  if (!lockedOf(content, s).includes('wealth')) {
    const amount = Math.round((content.balance?.boards?.[row.rank] ?? 0) * share);
    if (amount) { s.wealth += amount; s.day.wealth += amount; paid.wealth = (paid.wealth ?? 0) + amount; paid.board = { rank: row.rank, wealth: amount }; }
  }
  // An herb the beasts were after, picked by the night (its day and number: two nights may share a day) — a full night's only.
  const herbs = c.herbs ?? [];
  const herb = row.herb && share >= 1 && herbs.length ? herbs[hashOf(`${dayKey(ctx.now)}|${night.n}|${seedOf(s)}|shouchao`) % herbs.length] : null;
  const full = herb ? storedLine(s, [stow(content, s, herb, row.herb)]) : null;
  if (herb) paid.item = herb;
  const held = s.shouchao ?? {}, today = dayKey(ctx.now);
  s.shouchao = {
    ...held, n: night.n, told: true, at: ctx.now.toISOString(),
    ...(night.row ? { won: [...(held.won ?? []), night.row.id] } : {}),
    // the layouts held (never dealt again), the nights each kit has had (its climb), the kit last played (never twice running)
    seen: [...(held.seen ?? []), night.sig].slice(-(c.remember ?? 2000)),
    kits: { ...(held.kits ?? {}), [night.game]: (held.kits?.[night.game] ?? 0) + 1 }, last: night.game,
    day: { key: today, count: (held.day?.key === today ? held.day.count ?? 0 : 0) + 1 },
  };
  delete s.shouchao.risen;
  s.tasks[id] = { status: 'done', period: dayKey(ctx.now), done_at: ctx.now.toISOString() };
  const key = keyDrop(content, s, ctx, 'shouchao'); // a night won may drop a 秘境令 (rules/mijing.mjs)
  return { state: s, result: { ok: true, done: id, ...(key ? { key } : {}), night: night.n, game: night.game, level: night.row?.id ?? night.sig, ...(night.boss ? { boss: true } : {}), ...(share < 1 ? { share } : {}), stars, paid, gives: null, line: pick(t.done_line, s.lang), ...(full ? { pouch_full: full } : {}) } };
}
