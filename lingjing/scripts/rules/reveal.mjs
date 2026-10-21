// rules/reveal.mjs — the beasts the book has shown him: a board the story deals sends only those
// (Hanli 2026-10-21, 「按你的建议来」: the 秘境's 撒豆成兵 plays the beasts of the 回 he has reached; 鬿雀 only from
// 古八, h09). Part of the rules engine; rules.mjs is its one door.
//
// A beast is open from the 回 the game first meets it (creatures.json `hui`, read in book order — h11 is 古七,
// h09 古八); one with no 回 is never sent. A game's level table (levels/<game>.json) names the beasts it plays
// (`beasts`, each worth `power` soldiers; one with a `name` is a boss). A level dealt from the story keeps its
// shape: each beast not yet open stands aside for the latest open one of the table, worth the same (count ×
// power kept), and a boss not yet open for the latest open boss — handed to the page as `deal.over`, laid on
// the row as 兽潮's night is. The 游戏厅 deals no `over`: its ladder plays as made. Nothing here names a beast.
import fs from 'node:fs';
import path from 'node:path';
import { huiNow, huiOrder, sceneHui } from './hui.mjs';
import { creatureOf } from './world.mjs';

/* A game's level table (levels/<game>.json), read once per world; null for a game with none. */
const kits = new Map();
export function kitOf(content, game) {
  const dir = content?.dir;
  if (!dir || !game) return null;
  const key = `${dir}|${game}`;
  if (!kits.has(key)) {
    const file = path.join(dir, 'levels', `${game}.json`);
    kits.set(key, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return kits.get(key);
}

/* The furthest 回 he has reached, as a place in the book (world.mjs reachedAt's reading); none: before the book. */
function reached(content, state) {
  const all = [huiNow(content, state), ...(state.done_scenes ?? []).map(id => sceneHui(content, id))].filter(Boolean);
  return all.length ? Math.max(...all.map(h => huiOrder(content, h))) : -Infinity;
}
const metAt = (content, kind) => huiOrder(content, creatureOf(content, kind)?.hui);
/* A beast of his 回 or before (creatures.json `hui`); one with no 回 is never sent. */
export function beastOpen(content, state, kind) {
  return Boolean(creatureOf(content, kind)?.hui) && metAt(content, kind) <= reached(content, state);
}

/* The table's beasts open to him, the latest met last: the bosses, and the rest. */
function openOf(content, state, kit) {
  const open = Object.entries(kit.beasts ?? {}).filter(([k, b]) => !k.startsWith('_') && b && beastOpen(content, state, k))
    .sort(([a], [b]) => metAt(content, a) - metAt(content, b));
  return { bosses: open.filter(([, b]) => b.name).map(([k]) => k), rank: open.filter(([, b]) => !b.name).map(([k]) => k) };
}

/* A horde's beasts with the closed ones stood aside for `by`, worth the same; kinds met twice are one rank. */
function fitHorde(content, state, kit, beasts, by) {
  const out = new Map();
  for (const [kind, n] of beasts) {
    const to = beastOpen(content, state, kind) || !by ? kind : by;
    const count = to === kind ? n : Math.max(1, Math.round(n * kit.beasts[kind].power / kit.beasts[to].power));
    out.set(to, (out.get(to) ?? 0) + count);
  }
  return [...out];
}

/* The `over` for a level of `game` dealt from the story: its track and boss with only open beasts; null when
   every beast it plays is open (or the game has no table, or the level is not in it). */
export function revealedOver(content, state, game, lv) {
  const kit = kitOf(content, game), levels = kit?.levels ?? [];
  const level = levels.find(l => l.id === lv) ?? (Number.isInteger(lv) ? levels[lv - 1] : null);
  if (!level?.track) return null;
  const { bosses, rank } = openOf(content, state, kit), by = rank.at(-1) ?? null;
  let changed = false;
  const track = level.track.map(it => {
    if (it.type !== 'horde' || it.beasts.every(([k]) => beastOpen(content, state, k))) return it;
    changed = true;
    return { ...it, beasts: fitHorde(content, state, kit, it.beasts, by) };
  });
  const bossBy = level.boss && !beastOpen(content, state, level.boss.beast) ? bosses.at(-1) : null;
  if (bossBy) changed = true;
  if (!changed) return null;
  return { track, ...(bossBy ? { boss: { ...level.boss, beast: bossBy } } : {}) };
}
