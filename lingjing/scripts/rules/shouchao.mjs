// rules/shouchao.mjs — 兽潮: the daily beast tide at 沉鼎观, a plot the game alone has (Hanli 2026-10-20:
// 「兽潮塔防可以作为游戏里才有的一个情节. 比如每天固定时间有兽潮攻击沉鼎观. 在游戏里交代一下就好了」; it plays
// 守墙关, 「可以」; 「这几个主力游戏都有多个关卡, 以后要持续加关卡. 然后游戏里每次出现一个关卡」).
// Part of the rules engine; rules.mjs is its one door.
//
// Everything it knows is the task row's (tasks/world.json `shouchao`): the window (酉时, local hours), the
// scene that opens it (古四's 小周天, the first night he has 灵力), the places of 沉鼎观 where it is joined,
// the 灵气 it costs, the pay by stars, 银月's one telling. Its board is offered in the window while he
// stands at 沉鼎观, out of any instance, run or fight; the win is counted (`task done`) until the window's
// grace runs out, a night at most once. A night missed costs nothing: the senior disciples hold the wall,
// and only that night's pay is missed.
//
// THE NIGHTS: each one the next row of 守墙关's level table (levels/shouqiang.json) that carries a `tide`
// number, in that order, whose beasts are all of his 回 or before (creatures.json `hui`, read in book
// order — h11 is 古七, h09 古八). A won night moves him on; a lost one comes again. When the hand-made
// rows run out, the tide keeps rising on the last of them that fits: more beasts, closer together,
// tougher each wave, a boss of his 回 (the level's own `difficulty` / `hpMul` / `growth` knobs, handed to
// the game as `deal.over`). A row added later with a higher `tide` is played first, before the rise goes on.
import fs from 'node:fs';
import path from 'node:path';
import { dayKey, lockedOf, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse, spendStamina } from './core.mjs';
import { huiNow, huiOrder, sceneHui, sideLine } from './hui.mjs';
import { stow, storedLine } from './pouch.mjs';
import { hashOf } from './travel.mjs';
import { beatOf, creatureOf, passed, sceneOf } from './world.mjs';

const tideTask = content => (content.tasks?.tasks ?? []).find(t => t.shouchao) ?? null;

/* 守墙关's level table, read once per world (as qiyu.json is). */
const cache = new Map();
export function wallKit(content) {
  const dir = content?.dir;
  if (!dir) return null;
  if (!cache.has(dir)) {
    const file = path.join(dir, 'levels', 'shouqiang.json');
    cache.set(dir, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return cache.get(dir);
}

/* ── The clock ── */
const minuteOf = now => now.getHours() * 60 + now.getMinutes();
/* Inside the window (酉时 by default: local [from, to) hours). */
export function tideNow(t, now) {
  const [from, to] = t.shouchao.hours ?? [17, 19], m = minuteOf(now);
  return m >= from * 60 && m < to * 60;
}
/* …or within its grace after it shuts: a night begun at 18:55 is still counted at 19:10. */
const tideCounts = (t, now) => {
  const [from, to] = t.shouchao.hours ?? [17, 19], m = minuteOf(now);
  return m >= from * 60 && m < to * 60 + (t.shouchao.grace_min ?? 30);
};

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
const doneTonight = (state, t, now) => state.tasks?.[t.id]?.status === 'done' && state.tasks[t.id].period === dayKey(now);

/* Look's task list: the board offered in the window. */
export function shouchaoHosted(content, state, now) {
  const t = tideTask(content);
  if (!t || !tideNow(t, now) || !tideUp(content, state, t) || doneTonight(state, t, now)) return {};
  return { [t.id]: { status: 'offered' } };
}
/* Its win may be counted: the window (or its grace), and not yet tonight. */
export function shouchaoHere(content, state, id, now) {
  const t = tideTask(content);
  return Boolean(t) && t.id === id && tideCounts(t, now) && tideUp(content, state, t) && !doneTonight(state, t, now);
}

/* ── The nights ── */
/* The furthest 回 he has reached, as a place in the book (world.mjs reachedAt's reading). */
function reached(content, state) {
  const all = [huiNow(content, state), ...(state.done_scenes ?? []).map(id => sceneHui(content, id))].filter(Boolean);
  return all.length ? Math.max(...all.map(h => huiOrder(content, h))) : -Infinity;
}
/* A beast of his 回 or before (creatures.json `hui`); one with no 回 is never sent. */
export function beastOpen(content, state, kind) {
  const h = creatureOf(content, kind)?.hui;
  return Boolean(h) && huiOrder(content, h) <= reached(content, state);
}
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
  const title = { zh: `${pick(c.title, 'zh')} · 第${night.n}夜`, en: `${pick(c.title, 'en')} · night ${night.n}` };
  // 银月's telling, the first night only (until a night is won): the shell's lead card reads it.
  const told = Boolean(state.shouchao?.told);
  const lead = [...(told ? [] : c.tell ?? []), ...(row.lead ?? [])];
  const over = { title, lead, story: t.id, ...(night.rise ? riseOf(content, state, kit, row, night.rise, c.rise) : {}) };
  return { night: night.n, ...(night.rise ? { rise: night.rise } : {}), deal: { lv: row.id, over }, title: pick(title, lang) };
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
  // An herb the beasts were after, picked by the night.
  const herbs = c.herbs ?? [];
  const herb = row.herb && herbs.length ? herbs[hashOf(`${dayKey(ctx.now)}|${seedOf(s)}|shouchao`) % herbs.length] : null;
  const full = herb ? storedLine(s, [stow(content, s, herb, row.herb)]) : null;
  if (herb) paid.item = herb;
  const held = s.shouchao ?? {};
  s.shouchao = night.rise
    ? { ...held, risen: night.rise, told: true, last: dayKey(ctx.now) }
    : { ...held, won: [...(held.won ?? []), night.row.id], told: true, last: dayKey(ctx.now) };
  s.tasks[id] = { status: 'done', period: dayKey(ctx.now), done_at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, done: id, night: night.n, level: night.row.id, ...(night.rise ? { rise: night.rise } : {}), stars, paid, gives: null, line: pick(t.done_line, s.lang), ...(full ? { pouch_full: full } : {}) } };
}
