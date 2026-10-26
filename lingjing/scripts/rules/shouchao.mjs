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
// THE NIGHTS: each one the next row of 守墙关's level table (levels/shouqiang.json) that carries a `tide`
// number, in that order, whose beasts are all of his 回 or before (creatures.json `hui`, read in book
// order — h11 is 古七, h09 古八). A won night moves him on; a lost one comes again. When the hand-made
// rows run out, the tide keeps rising on the last of them that fits: more beasts, closer together,
// tougher each wave, a boss of his 回 (the level's own `difficulty` / `hpMul` / `growth` knobs, handed to
// the game as `deal.over`). A row added later with a higher `tide` is played first, before the rise goes on.
import { dayKey, lockedOf, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { sideLine } from './hui.mjs';
import { beastOpen, kitOf } from './reveal.mjs';
import { stow, storedLine } from './pouch.mjs';
import { hashOf } from './travel.mjs';
import { beatOf, passed, sceneOf } from './world.mjs';

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
/* Past the scene that opens it (古四's 小周天), standing at 沉鼎观, on the 古 line, out of any instance,
   run, fight or beat — and after 入门, when the 灵石 are his. */
function tideUp(content, state, t) {
  const c = t.shouchao;
  if (c.after && !passed(content, state, c.after)) return false;
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

/* The night he would play now: the first tide row not yet won that fits his 回 — or, past them all, the
   rise on the last that fits. `n`: which night this is (his wins + 1). */
export function tonightLevel(content, state) {
  const t = tideTask(content), kit = wallKit(content);
  if (!t || !kit) return null;
  const held = state.shouchao ?? {}, won = new Set(held.won ?? []);
  const rows = tideRows(kit).filter(l => fits(content, state, l));
  if (!rows.length) return null;
  const n = (held.won?.length ?? 0) + (held.risen ?? 0) + 1;
  const next = rows.find(l => !won.has(l.id));
  if (next) return { n, row: next, rise: 0 };
  return { n, row: rows.at(-1), rise: (held.risen ?? 0) + 1 };
}

/* The rise past the table (`rise` ≥ 1): the knobs the row carries, turned up by the task's `rise` steps —
   more beasts and tougher (`difficulty`, which the kit lays on both the count and the hp), each wave
   tougher than the last (`growth`), closer together (the groups' gaps); and where the row has a boss, one
   of his 回 in its place — a different one each night when more than one is open (kit beasts `boss`). */
export function riseOf(content, state, kit, row, rise, step) {
  const s = step ?? {};
  const bosses = Object.entries(kit.beasts ?? {}).filter(([k, b]) => !k.startsWith('_') && b?.boss && beastOpen(content, state, k)).map(([k]) => k);
  const gapMul = Math.max(s.gap_min ?? 0.6, 1 - (s.gap ?? 0.01) * rise);
  const boss = bosses.length ? bosses[(rise - 1) % bosses.length] : null;
  const waves = row.waves.map(w => w.flatMap(([kind, count, gap, delay, ...rest]) => {
    if (!kit.beasts?.[kind]?.boss) return [[kind, count, +(gap * gapMul).toFixed(3), delay, ...rest]];
    return boss ? [[boss, count, gap, delay, ...rest]] : [];
  }));
  return {
    difficulty: +((row.difficulty ?? 1) * (1 + (s.difficulty ?? 0.02) * rise)).toFixed(3),
    hpMul: +((row.hpMul ?? 1) * (1 + (s.hp ?? 0) * rise)).toFixed(3),
    growth: +((row.growth ?? 0) + (s.growth ?? 0.004) * rise).toFixed(3),
    waves,
  };
}

/* What the board is dealt tonight (Look's row, `deal`): the row by id, and over it the night's own words —
   its title, the lead with 银月's one telling the first time — and, past the table, the rise. */
export function shouchaoRow(content, state, now) {
  const t = tideTask(content), kit = wallKit(content), night = tonightLevel(content, state);
  if (!t || !night) return {};
  const lang = state.lang, c = t.shouchao, row = night.row;
  const nameOf = n => ({ zh: `${pick(c.title, 'zh')} · 第${n}潮`, en: `${pick(c.title, 'en')} · tide ${n}` });
  // Inside the cooldown: the row names the night just held, says when the next comes, and deals nothing more.
  const wait = tideWait(state, t, now);
  if (wait > 0) return { tide: true, night: night.n - 1, title: pick(nameOf(night.n - 1), lang), wait_min: Math.ceil(wait / 60_000), shut: pick(c.shut, lang) ?? null };
  const title = nameOf(night.n);
  // 银月's telling, the first night only (until a night is won): the shell's lead card reads it.
  const told = Boolean(state.shouchao?.told);
  const lead = [...(told ? [] : c.tell ?? []), ...(row.lead ?? [])];
  const over = { title, lead, story: t.id, ...(night.rise ? riseOf(content, state, kit, row, night.rise, c.rise) : {}) };
  return { tide: true, night: night.n, ...(night.rise ? { rise: night.rise } : {}), deal: { lv: row.id, over }, title: pick(title, lang) };
}

/* ── Counted ── */
/* Its win handed in (tasks.mjs taskDone): the night's 灵气, the pay by stars, the next night moved on. */
export function shouchaoDone(state, content, ctx, id) {
  const t = tideTask(content), c = t.shouchao;
  if (!state.wins?.[id]) return refuse('not-won', null);
  const night = tonightLevel(content, state);
  if (!night) return refuse('not-here', null);
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, c.cost ?? 'game');
  if (empty) return empty;
  delete s.wins[id];
  const stars = Math.max(1, Math.min(3, Number(s.stars?.[id] ?? 1) || 1));
  if (s.stars) delete s.stars[id]; // the night's, not a best ever
  const row = c.pay?.[stars] ?? {};
  const paid = pay(content, s, ctx, { table: c.table ?? 'haunt', progress: row.progress ?? 0, wealth: 0 });
  // 灵石 by the small-game ranks (balance.json `boards`): every night, not a first clear only.
  if (!lockedOf(content, s).includes('wealth')) {
    const amount = content.balance?.boards?.[row.rank] ?? 0;
    if (amount) { s.wealth += amount; s.day.wealth += amount; paid.wealth = (paid.wealth ?? 0) + amount; paid.board = { rank: row.rank, wealth: amount }; }
  }
  // An herb the beasts were after, picked by the night (its day and number: two nights may share a day).
  const herbs = c.herbs ?? [];
  const herb = row.herb && herbs.length ? herbs[hashOf(`${dayKey(ctx.now)}|${night.n}|${seedOf(s)}|shouchao`) % herbs.length] : null;
  const full = herb ? storedLine(s, [stow(content, s, herb, row.herb)]) : null;
  if (herb) paid.item = herb;
  const held = s.shouchao ?? {};
  s.shouchao = night.rise
    ? { ...held, risen: night.rise, told: true, at: ctx.now.toISOString() }
    : { ...held, won: [...(held.won ?? []), night.row.id], told: true, at: ctx.now.toISOString() };
  s.tasks[id] = { status: 'done', period: dayKey(ctx.now), done_at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, done: id, night: night.n, level: night.row.id, ...(night.rise ? { rise: night.rise } : {}), stars, paid, gives: null, line: pick(t.done_line, s.lang), ...(full ? { pouch_full: full } : {}) } };
}
