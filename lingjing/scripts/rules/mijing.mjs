// rules/mijing.mjs — 秘境探险: a roguelite map run in the classic shape (Slay the Spire's act, Hades' boons; Hanli
// 2026-10-28, option A 秘境令 · 「每个秘境给个名字? 和故事对应上?」). Part of the rules engine; rules.mjs is its one door.
//
// Everything it knows is worlds/jiuding/mijing.json (the nine 重, their rooms, beasts, boons, 奇遇) and balance.json
// `mijing` (derived from `master.mijing`: the key's drops and the day's cap, the hurt a board costs, the pay). Nothing
// here names a 重, a beast or a room.
//
// THE RUN. At a door (`doors`: the stone door) he spends one 秘境令 (`key`) on a 重 open to him: its `after` scene
// passed (the story has reached that place) and the 重 before it cleared. The run is a map drawn from its own seed
// (mapOf: `layers` rows of rooms with branches, every room reached from the first row and reaching the 大妖); he
// picks a room of the next row (`go`), plays it, and walks on. 气血 is the card fight's own (cards.mjs hpMaxOf) and
// carries room to room: a fight hands it to the door as `wounds` and reads it back from the replay; a board costs it by
// its stars; a 奇遇 or a 灵泉 moves it. Run-only boons (秘境加持) lie on what each game already reads. The 大妖 won
// clears the 重 and pays it all; 气血 gone in a fight, or leaving, ends it with part of the loot by the depth reached.
//
// Rooms: a fight room's beast stands at the door as the place's encounter (world.mjs encounterOf → mijingEncounter),
// fought by the page's own 斗法 room through `duel` (tasks.mjs → mijingDuel: no 灵气, no haunt pay, no day's lock —
// the 令 paid for the run); a board room's task is hosted while he stands in it (look.mjs tasksBrief → mijingHosted,
// mijingRow; tasks.mjs win/done → mijingBoardHere, mijingBoardDone); a pick room is answered on the run's own card.
import { dayKey, lockedOf, pick, seedOf } from '../state.mjs';
import { clone, pay, refuse } from './core.mjs';
import { battle, POUCH_MAX, REALMS } from '../battle.js';
import { cardCatalog, deckFor, fightPill, fightSetup, winCard } from './cards.mjs';
import { hashOf } from './travel.mjs';
import { stow, storedLine } from './pouch.mjs';
import { creatureOf, foeOf, meetBeast, passed, placeName, placeOf } from './world.mjs';
import { boardPlay } from './playpay.mjs';
import { duelBrief } from './look.mjs';
import { kitOf } from './reveal.mjs';

const tableOf = content => content.mijing ?? null;
const knobs = content => content.balance?.mijing ?? {};
const tierRow = (content, n) => (tableOf(content)?.tiers ?? []).find(t => t.n === Number(n)) ?? null;
const kindRow = (content, kind) => tableOf(content)?.kinds?.[kind] ?? null;
/* A room's kind by name, for what it holds: a fight room whose foe is a person (creatures.json `person`, or a `gender`)
   takes its kind's `person` name — the 凶兽 room holding 老井 is a 强敌's. */
const isPerson = c => Boolean(c?.person || c?.gender);
const kindName = (content, kind, cid, lang) => pick((isPerson(creatureOf(content, cid)) ? kindRow(content, kind)?.person : null) ?? kindRow(content, kind)?.name, lang);
const boonRow = (content, id) => (tableOf(content)?.boons ?? []).find(b => b.id === id) ?? null;
const runOf = state => state?.mijing?.run ?? null;
const FIGHT = 'mijing:';
export const mijingFightId = room => `${FIGHT}${room}`;
const isFightId = id => String(id ?? '').startsWith(FIGHT);

/* ── Seeded draws ── */
/* A number in [0, 1) for a key: mixed, so neighbouring keys do not walk together. */
export function draw(key) {
  const h = hashOf(key), x = Math.imul(h ^ (h >>> 16), 0x45d9f3b), y = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((y ^ (y >>> 16)) >>> 0) / 4294967296;
}
const u = key => draw(key);
const byWeight = (list, x) => {
  const all = list.reduce((t, i) => t + (i.weight ?? 1), 0);
  let at = x * all;
  return list.find(i => (at -= i.weight ?? 1) < 0) ?? list.at(-1);
};
const between = (range, x) => { const [lo, hi] = Array.isArray(range) ? range : [range, range]; return lo + Math.floor(x * (hi - lo + 1)); };
/* `n` distinct of `list` by a seed (Fisher–Yates on the draws). */
function drawN(list, n, key) {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(u(`${key}|${i}`) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}

/* ── The map ── */

/* How many rooms each row holds: `rooms` spread over `layers`, the middle rows first. */
export function rowsOf(layers, rooms) {
  const base = Math.floor(rooms / layers), extra = rooms % layers, rows = Array(layers).fill(base);
  const order = [...rows.keys()].sort((a, b) => Math.abs(a - (layers - 1) / 2) - Math.abs(b - (layers - 1) / 2));
  for (let i = 0; i < extra; i++) rows[order[i]] += 1;
  return rows.map(n => Math.max(1, n));
}

/* A 重's map from a seed: rows of rooms, each with its kind and its name, the ways from each to the next row, and the
   大妖 past the last. Every room reaches the next row and every room of a row past the first is reached from the one
   before (each room links to the nearest of the next row, every room of the next row takes a link from its nearest, and
   a second link now and then is the branch), so every room is on a way from the first row to the 大妖. The kinds:
   the first row all 妖兽 (the Spire's), a 凶兽 never there, a 灵泉 always in the last row before the 大妖, at least
   one 守关 in the second row and one 奇遇 past the first. */
export function mapOf(content, tier, seed) {
  const kinds = tableOf(content)?.kinds ?? {}, rows = rowsOf(tier.layers, tier.rooms), key = `${seed}|map`;
  const names = tier.rooms_named ?? [];
  const layers = rows.map((n, li) => {
    const named = drawN(names, Math.min(n, names.length), `${key}|${li}|names`);
    return Array.from({ length: n }, (_, i) => ({ id: `${li + 1}${String.fromCharCode(97 + i)}`, row: li, at: n === 1 ? 0.5 : i / (n - 1), name: named[i % Math.max(1, named.length)] ?? null }));
  });
  // The kinds.
  const drawable = row => Object.entries(kinds).filter(([k, r]) => (r.weight ?? 0) > 0 && k !== 'boss' && !(k === 'xiong' && row === 0)).map(([k, r]) => ({ k, weight: r.weight }));
  for (const [li, row] of layers.entries()) for (const room of row) room.kind = li === 0 ? 'yao' : byWeight(drawable(li), u(`${key}|${room.id}|kind`)).k;
  const last = layers.at(-1);
  if (!last.some(r => r.kind === 'quan')) last[Math.floor(u(`${key}|quan`) * last.length)].kind = 'quan';
  // What every map holds (a TD room in the second row, a 奇遇 past the first): laid on a room no other need holds.
  const needs = [['guan', [1]], ['qiyu', layers.slice(1).map((_, i) => i + 1)]], held = new Set();
  for (const [kind, at] of needs) {
    if (!kinds[kind] || layers.length < 2) continue;
    const have = at.flatMap(li => layers[li]).find(r => r.kind === kind && !held.has(r));
    if (have) { held.add(have); continue; }
    const spots = at.flatMap(li => layers[li]).filter(r => !held.has(r) && !(r.kind === 'quan' && r.row === layers.length - 1 && layers[r.row].filter(x => x.kind === 'quan').length === 1));
    if (!spots.length) continue;
    const spot = spots[Math.floor(u(`${key}|${kind}`) * spots.length)];
    spot.kind = kind; held.add(spot);
  }
  // The ways.
  const ways = {};
  const nearest = (x, row) => row.reduce((best, r) => (Math.abs(r.at - x) < Math.abs(best.at - x) ? r : best), row[0]);
  for (let li = 0; li < layers.length - 1; li++) {
    const here = layers[li], next = layers[li + 1];
    for (const r of here) {
      const to = new Set([nearest(r.at, next).id]);
      if (next.length > 1 && u(`${key}|${r.id}|branch`) < 0.5) {
        const others = next.filter(n => !to.has(n.id)).sort((a, b) => Math.abs(a.at - r.at) - Math.abs(b.at - r.at));
        if (others[0]) to.add(others[0].id); // the nearest other: a fork
      }
      ways[r.id] = [...to];
    }
    for (const n of next) if (!here.some(r => ways[r.id].includes(n.id))) ways[nearest(n.at, here).id].push(n.id);
    // A row that leads only straight up is no choice: one of its rooms forks (drawn), whenever the next row has two.
    if (next.length > 1 && here.every(r => ways[r.id].length < 2)) {
      const r = here[Math.floor(u(`${key}|${li}|fork`) * here.length)];
      const other = next.filter(n => !ways[r.id].includes(n.id)).sort((a, b) => Math.abs(a.at - r.at) - Math.abs(b.at - r.at))[0];
      if (other) ways[r.id].push(other.id);
    }
  }
  for (const r of last) ways[r.id] = ['boss'];
  const boss = { id: 'boss', row: layers.length, at: 0.5, kind: 'boss', name: null };
  return { layers: layers.map(row => row.map(({ id, row: r, at, kind, name }) => ({ id, row: r, at, kind, name }))), boss, ways };
}
const roomOf = (map, id) => (id === 'boss' ? map.boss : map.layers.flat().find(r => r.id === id) ?? null);
/* The rooms he may walk to next: the first row before any, else the ways from where he stands. */
export const nextRooms = run => (!run.at ? run.map.layers[0].map(r => r.id) : run.map.ways[run.at] ?? []);
/* Every way from the first row reaches the 大妖 (the map's own check; tests/mijing.test.mjs). */
export function mapReaches(map) {
  const seen = new Set(map.layers[0].map(r => r.id)), queue = [...seen];
  while (queue.length) for (const n of map.ways[queue.shift()] ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  return { boss: seen.has('boss'), all: map.layers.flat().every(r => seen.has(r.id)) };
}

/* ── Which 重 he may enter ── */

/* A 重 open to him: its place reached in the story (`after` passed) and the 重 before it cleared. */
export function tierOpen(content, state, n) {
  const t = tierRow(content, n);
  if (!t) return false;
  if (t.after && !passed(content, state, t.after)) return false;
  return t.n === 1 || (state.mijing?.cleared ?? []).includes(t.n - 1);
}
/* Why not, in the world's words: the story has not got there, or the 重 before is not yet cleared. */
const shutWhy = (content, state, t) => (t.after && !passed(content, state, t.after) ? 'story' : !tierOpen(content, state, t.n) ? 'before' : null);
const atDoor = (content, state) => (tableOf(content)?.doors ?? []).includes(state.place);
const keysHeld = (content, state) => state.bag?.[tableOf(content)?.key] ?? 0;
/* The doors whose road stands open now (world.mjs leaveOf): a run on, or a 秘境令 in the bag and a 重 open to him. */
export const mijingDoors = (content, state) => (tableOf(content) && (runOf(state) || (keysHeld(content, state) > 0 && tierOpen(content, state, 1))) ? tableOf(content).doors ?? [] : []);

/* ── 秘境令: the key, dropped by a win in a cooldown event ── */

/* A win in `source` (balance.json `mijing.drops`: 兽潮 `shouchao`, 比武切磋 `qiecuo`, 妖兽出没 `yaoshou`) may drop a
   秘境令: its chance, under the day's cap (`cap_day`), once the first 重 is open to him. Seeded by the day, the save and
   the tries, so the same win replayed drops the same. Written on `s`; returns what was stowed, or null. */
export function keyDrop(content, s, ctx, source) {
  const k = knobs(content), chance = k.drops?.[source], key = tableOf(content)?.key;
  if (!chance || !key || !tierOpen(content, s, 1)) return null;
  const day = dayKey(ctx.now), n = s.mijing?.drops?.day === day ? s.mijing.drops.n : 0;
  if (n >= (k.cap_day ?? 1)) return null;
  // Drawn by the moment of the win (the same win replayed draws the same), and nothing written on a miss: a save that
  // drew nothing is the save it was.
  if (u(`${ctx.now.toISOString()}|${seedOf(s)}|${source}|${n}|key`) >= chance) return null;
  s.mijing = { ...s.mijing, drops: { day, n: n + 1 } };
  return stow(content, s, key, 1);
}

/* ── The run's numbers ── */

const boonsOf = (content, run) => (run?.boons ?? []).map(id => boonRow(content, id)).filter(Boolean);
const sum = (list, f) => list.reduce((t, x) => t + (f(x) ?? 0), 0);
/* The run's 气血 cap: the fight's own (battle.js sideOf, to the point), a share more by its boons (固本: `hpScale`). */
const hpCap = (content, state, boons) => Math.max(1, Math.round(((REALMS[state.tier] ?? REALMS.qi).hp + (state.step ?? 0) * 0.5) * (1 + sum(boons, b => b.hp_max))));
const hurtOf = (content, run, stars) => {
  const k = knobs(content), share = (k.hurt?.[String(stars)] ?? k.hurt?.['1'] ?? 0.2) * boonsOf(content, run).reduce((m, b) => m * (b.hurt ?? 1), 1);
  return Math.round(run.hp_max * share);
};

/* ── Rooms: what each holds, drawn as he walks in ── */

/* The beast a fight room deals: the 重's `beasts` (妖兽), `xiong` (凶兽, its harder deck), `boss` (大妖), on the mode's
   share grown by the 重's depth (balance.json `mijing.foe_step` a 重 past the first). */
function foeFor(content, run, tier, room) {
  const list = room.kind === 'boss' ? [tier.boss] : room.kind === 'xiong' ? tier.xiong : tier.beasts;
  const pickd = byWeight(list, u(`${run.seed}|${room.id}|foe`));
  const c = creatureOf(content, pickd.creature);
  const grow = 1 + (knobs(content).foe_step ?? 0) * (tier.n - 1) + (room.kind === 'boss' ? knobs(content).boss_more ?? 0 : 0);
  const hp = Math.round((pickd.hp ?? c?.hp ?? 1) * grow * 100) / 100;
  return { creature: pickd.creature, hp, ...(pickd.deck ? { deck: pickd.deck } : {}) };
}
/* A board room's board: one of the 重's `guan` (守关) or `jiguan` (机关), avoiding the one the run played last. */
function boardFor(content, run, tier, room) {
  const list = room.kind === 'guan' ? tier.guan : room.kind === 'jiguan' ? tier.jiguan : tier.xinmo ?? [];
  const fresh = list.filter(b => b.task !== run.last_board);
  const from = fresh.length ? fresh : list;
  return from.length ? { ...from[Math.floor(u(`${run.seed}|${room.id}|board`) * from.length)] } : null;
}
/* A 奇遇 room's situation: one of the 重's `qiyu` not yet met this run. */
function qiyuFor(content, run, tier, room) {
  const met = new Set(run.met ?? []), list = (tier.qiyu ?? []).filter(id => tableOf(content)?.qiyu?.[id] && !met.has(id));
  const from = list.length ? list : (tier.qiyu ?? []).filter(id => tableOf(content)?.qiyu?.[id]);
  return from.length ? from[Math.floor(u(`${run.seed}|${room.id}|qiyu`) * from.length)] : null;
}
/* Three boons he does not hold, for a reward (the Spire's pick of three). */
function boonOffer(content, run, key) {
  const held = new Set(run.boons ?? []);
  return drawN((tableOf(content)?.boons ?? []).filter(b => !held.has(b.id)).map(b => b.id), knobs(content).offer ?? 3, `${run.seed}|${key}|boons`);
}
/* The 功法 a 灵泉 may temper: up to `quan.offer` of the spells in his ten, not yet tempered this run. */
function temperable(content, state, run) {
  const catalog = cardCatalog(content), deck = deckFor(content, state) ?? [];
  const spells = [...new Set(deck)].filter(id => catalog[id]?.kind === 'spell' && (catalog[id]?.cost ?? 0) > 0 && !(run.stars ?? {})[id]);
  return drawN(spells, tableOf(content)?.quan?.offer ?? 3, `${run.seed}|${run.at}|temper`);
}

/* ── Loot: the 重's drop table (rewards.json drop_tables), rolled into the run's pack ── */
function rollLoot(content, run, tier, key, { elite = false, times = 1 } = {}) {
  const table = content.rewards?.drop_tables?.[tier.drops], got = [];
  for (let t = 0; t < times; t++) (table?.rolls ?? []).forEach((roll, k) => {
    const at = `${run.seed}|${key}|${t}|${k}`, chance = elite ? roll.elite_chance ?? roll.chance : roll.chance;
    if (u(at) >= chance) return;
    if (roll.gear) {
      const weights = elite ? table.elite_rarity ?? table.rarity : table.rarity;
      const rarity = byWeight(Object.entries(weights ?? {}).map(([id, weight]) => ({ id, weight })), u(`${at}|rarity`))?.id;
      const arms = (table.gear ?? []).filter(id => content.items.items.find(i => i.id === id)?.rarity === rarity);
      if (arms.length) got.push({ id: arms[Math.floor(u(`${at}|arm`) * arms.length)], n: 1 });
      return;
    }
    const it = byWeight(roll.items ?? [], u(`${at}|item`));
    if (it) got.push({ id: it.item, n: between(it.n, u(`${at}|n`)) });
  });
  for (const g of got) run.loot.items[g.id] = (run.loot.items[g.id] ?? 0) + g.n;
  return got;
}
const addWealth = (run, n) => { run.loot.wealth += Math.max(0, Math.round(n)); return n; };

/* ── In ── */

function enterRun(state, content, ctx, args) {
  if (runOf(state)) return refuse('in-a-run', null);
  if (state.fight) return refuse('in-a-fight', null, { game: state.fight.game });
  if (!atDoor(content, state)) return refuse('not-here', null);
  const n = Number(args.tier ?? 1), t = tierRow(content, n);
  if (!t) return refuse('no-such-tier', null);
  if (!tierOpen(content, state, n)) return refuse('not-open', null, { why: shutWhy(content, state, t) });
  const key = tableOf(content).key;
  if (keysHeld(content, state) < 1) return refuse('no-key', pick({ zh: '没有秘境令，石门不开。', en: 'Without a realm token the stone door will not open.' }, state.lang));
  const s = clone(state);
  s.bag[key] -= 1;
  if (!s.bag[key]) delete s.bag[key];
  const runs = (s.mijing?.runs ?? 0) + 1, seed = `${seedOf(s)}|mijing|${n}|${runs}|${args.seed ?? ''}`;
  const hp = hpCap(content, s, []);
  s.mijing = { ...s.mijing, runs, run: { tier: n, seed, map: mapOf(content, t, seed), at: null, done: [], hp, hp_max: hp, boons: [], stars: {}, loot: { items: {}, wealth: 0 }, minutes: 0, met: [], room: null, started: ctx.now.toISOString() } };
  delete s.mijing.last;
  return { state: s, result: { ok: true, entered: n, name: pick(t.name, s.lang), say: pick(t.say, s.lang) } };
}

/* Into a room of the next row: what it holds is drawn now. */
function goRoom(state, content, ctx, args) {
  const run = runOf(state);
  if (!run) return refuse('not-in-a-run', null);
  if (state.fight) return refuse('in-a-fight', null, { game: state.fight.game });
  if (run.room && run.room.phase !== 'done') return refuse('room-open', null, { room: run.room.id });
  const id = String(args.room ?? '');
  if (!nextRooms(run).includes(id)) return refuse('not-next', null, { next: nextRooms(run) });
  const s = clone(state), r = s.mijing.run, t = tierRow(content, r.tier), room = roomOf(r.map, id);
  r.at = id;
  const play = kindRow(content, room.kind)?.play;
  const here = { id, kind: room.kind, phase: play === 'fight' ? 'fight' : play === 'board' ? 'board' : 'pick' };
  if (play === 'fight') here.foe = foeFor(content, r, t, room);
  if (play === 'board') { here.board = boardFor(content, r, t, room); if (!here.board) here.phase = 'done'; }
  if (room.kind === 'qiyu') { here.qiyu = qiyuFor(content, r, t, room); if (here.qiyu) r.met = [...(r.met ?? []), here.qiyu]; else here.phase = 'done'; }
  if (room.kind === 'quan') here.temper = temperable(content, s, r);
  if (room.kind === 'bao') {
    // A chest: its loot now, and a boon of three to pick (or none).
    here.got = rollLoot(content, r, t, `${id}|chest`, { elite: true, times: knobs(content).chest_rolls ?? 2 });
    here.wealth = addWealth(r, between(knobs(content).wealth?.chest ?? [6, 10], u(`${r.seed}|${id}|chest|wealth`)) * wealthScale(content, t));
    here.offer = boonOffer(content, r, id);
    here.phase = 'reward';
    roomCleared(content, r, room.kind);
  }
  r.room = here;
  return { state: s, result: { ok: true, room: id, kind: room.kind } };
}
const wealthScale = (content, t) => 1 + (knobs(content).wealth?.step ?? 0) * (t.n - 1);
/* A room behind him: counted (its minutes toward the run's 修为, the depth he reached). */
function roomCleared(content, run, kind) {
  if (run.done.includes(run.at)) return;
  run.done.push(run.at);
  run.minutes += kindRow(content, kind)?.minutes ?? 0;
}

/* A 奇遇's way, a 灵泉's rest or temper: the rules decide from the data. */
function choose(state, content, ctx, args) {
  const run = runOf(state), room = run?.room;
  if (!room || room.phase !== 'pick') return refuse('nothing-to-choose', null);
  const s = clone(state), r = s.mijing.run, here = r.room, t = tierRow(content, r.tier);
  if (here.kind === 'quan') {
    const way = String(args.way ?? 'heal');
    if (way === 'card') {
      const card = String(args.card ?? '');
      if (!(here.temper ?? []).includes(card)) return refuse('not-offered', null, { cards: here.temper ?? [] });
      r.stars = { ...r.stars, [card]: (r.stars?.[card] ?? 0) + 1 };
      here.outcome = { way: 'card', card };
    } else {
      const heal = Math.round(r.hp_max * (tableOf(content)?.quan?.heal ?? 0.3)), was = r.hp;
      r.hp = Math.min(r.hp_max, r.hp + heal);
      here.outcome = { way: 'heal', hp: r.hp - was };
    }
    here.phase = 'done';
    roomCleared(content, r, here.kind);
    return { state: s, result: { ok: true, room: here.id, ...here.outcome, hp: r.hp, hp_max: r.hp_max } };
  }
  if (here.kind !== 'qiyu') return refuse('nothing-to-choose', null);
  const q = tableOf(content).qiyu[here.qiyu], i = Number(args.way), way = q?.ways?.[i];
  if (!way) return refuse('no-such-way', null, { ways: (q?.ways ?? []).length });
  const won = way.chance == null || u(`${r.seed}|${here.id}|way|${i}`) < way.chance;
  const side = won ? way.win : way.miss ?? {};
  const fx = applySide(content, r, t, here, side);
  here.outcome = { way: i, won, line: pick(side.line, s.lang) ?? null, ...fx };
  here.phase = fx.offer ? 'reward' : 'done';
  if (fx.offer) here.offer = fx.offer;
  roomCleared(content, r, here.kind);
  // 气血 gone on a way taken: the run is over (a 奇遇 may hurt).
  if (r.hp <= 0) return endRun(s, content, ctx, 'dead', { room: here.id, ...here.outcome });
  return { state: s, result: { ok: true, room: here.id, ...here.outcome, hp: r.hp, hp_max: r.hp_max } };
}
/* What one side of a 奇遇's way does to the run: 气血 by a share, loot rolls, 灵石, a thing, a boon to pick. */
function applySide(content, run, tier, room, side) {
  const out = {};
  if (side.hp) { const was = run.hp; run.hp = Math.max(0, Math.min(run.hp_max, run.hp + Math.round(run.hp_max * side.hp))); out.hp = run.hp - was; }
  if (side.loot) out.got = rollLoot(content, run, tier, `${room.id}|qiyu`, { times: side.loot });
  if (side.wealth) out.wealth = addWealth(run, side.wealth * wealthScale(content, tier));
  if (side.item) { run.loot.items[side.item.id] = (run.loot.items[side.item.id] ?? 0) + (side.item.n ?? 1); out.got = [...(out.got ?? []), { id: side.item.id, n: side.item.n ?? 1 }]; }
  if (side.boon) out.offer = side.boon === 'any' ? boonOffer(content, run, room.id) : [side.boon];
  return out;
}

/* A reward's boon picked (or none: `skip`). */
function takeBoon(state, content, ctx, args) {
  const room = runOf(state)?.room;
  if (!room || room.phase !== 'reward') return refuse('nothing-to-pick', null);
  const s = clone(state), r = s.mijing.run, here = r.room;
  const id = args.skip ? null : String(args.id ?? '');
  if (id && !(here.offer ?? []).includes(id)) return refuse('not-offered', null, { offer: here.offer });
  if (id) {
    r.boons = [...r.boons, id];
    // 固本: the cap grows, and the 气血 with it.
    const cap = hpCap(content, s, boonsOf(content, r));
    r.hp += cap - r.hp_max; r.hp_max = cap;
  }
  here.picked = id;
  here.phase = 'done';
  return { state: s, result: { ok: true, boon: id, boons: r.boons } };
}

/* A board room left unplayed (撤): it costs its share of 气血 (`yield`), and he walks on — never stuck behind a board. */
function yieldRoom(state, content, ctx) {
  const room = runOf(state)?.room;
  if (!room || room.phase !== 'board') return refuse('nothing-to-yield', null);
  const s = clone(state), r = s.mijing.run;
  const hurt = Math.round(r.hp_max * (knobs(content).yield ?? 0.25));
  r.hp = Math.max(0, r.hp - hurt);
  r.room.phase = 'done'; r.room.yielded = true; r.last_board = r.room.board?.task ?? null;
  if (r.done.includes(r.at) === false) r.done.push(r.at);
  if (r.hp <= 0) return endRun(s, content, ctx, 'dead', { room: r.room.id, hp: -hurt });
  return { state: s, result: { ok: true, yielded: r.room.id, hp: -hurt } };
}

/* ── Out: the payout ── */

/* The run over — cleared (the 大妖 won), dead (气血 gone) or left: what it found lands, all of it on a clear, a share by
   the depth reached otherwise (`keep` at least); its minutes of play paid as 修为 at the games' rate (balance.json
   `mijing.pay`), and a clear's own pay — 灵石, pills, an arm, the 大妖's card. The 重 cleared opens the next. */
export function endRun(s, content, ctx, how, extra = {}) {
  const r = s.mijing.run, t = tierRow(content, r.tier), k = knobs(content);
  const reached = r.done.length, of = r.map.layers.length + 1;
  const keep = how === 'clear' ? 1 : Math.max(k.keep_min ?? 0.25, reached / of);
  const items = Object.entries(r.loot.items).map(([id, n]) => ({ id, n: how === 'clear' ? n : Math.floor(n * keep) })).filter(i => i.n > 0);
  let wealth = Math.round(r.loot.wealth * keep);
  if (how === 'clear') {
    wealth += Math.round((k.wealth?.clear ?? 0) * wealthScale(content, t));
    for (const p of k.clear?.items ?? []) if ((p.from ?? 1) <= t.n && (p.to ?? 99) >= t.n) items.push({ id: p.item, n: between(p.n, u(`${r.seed}|clear|${p.item}`)) });
    const arm = rollLoot(content, r, t, 'clear', { elite: true, times: 1 }).find(g => content.items.items.find(i => i.id === g.id)?.rarity);
    if (arm && !items.some(i => i.id === arm.id)) items.push(arm);
  }
  const share = (how === 'clear' ? 1 : k.pay?.short ?? 0.5) * (k.pay?.rate ?? 1);
  const progress = Math.round((boardPlay(content, s, r.minutes) ?? 0) * share);
  const shut = lockedOf(content, s);
  const paid = pay(content, s, ctx, { table: 'play', progress, wealth: shut.includes('wealth') ? 0 : wealth });
  const stowed = items.map(i => stow(content, s, i.id, i.n));
  // A card on a clear: the 大妖's own gift, else the first a beast of this 重 gives that he does not yet hold (cards.json
  // `from: {kind: 'beast'}` — never a card at random; none when he holds them all).
  const card = how === 'clear' ? [t.boss, ...(t.xiong ?? []), ...(t.beasts ?? [])].map(b => creatureOf(content, b.creature)).filter(Boolean)
    .reduce((got, c) => got ?? winCard(content, s, c, ctx.now), null) : null;
  const named = stowed.map((g, i) => ({ id: items[i].id, name: g.name, n: items[i].n, ...(g.stored ? { stored: true } : {}) }));
  const last = { tier: t.n, name: pick(t.name, s.lang), how, reached, of, minutes: r.minutes, paid: { progress: paid.progress, wealth: paid.wealth }, items: named, ...(card ? { card } : {}), at: ctx.now.toISOString() };
  const cleared = how === 'clear' ? [...new Set([...(s.mijing.cleared ?? []), t.n])].sort((a, b) => a - b) : s.mijing.cleared ?? [];
  s.mijing = { ...s.mijing, cleared, last };
  delete s.mijing.run;
  const full = storedLine(s, stowed);
  return { state: s, result: { ok: true, ended: how, ...extra, last, ...(full ? { pouch_full: full } : {}) } };
}
function leaveRun(state, content, ctx) {
  if (!runOf(state)) return refuse('not-in-a-run', null);
  if (state.fight) return refuse('in-a-fight', null, { game: state.fight.game });
  return endRun(clone(state), content, ctx, 'left');
}

/* The verb: `mijing --action=info|enter|go|choose|boon|yield|leave|close`. The page's own (never one of Ling's tools). */
export function mijing(state, content, ctx, args = {}) {
  if (!tableOf(content)) return refuse('no-mijing', null);
  const action = String(args.action ?? 'info');
  if (action === 'info') return { state: null, result: { ok: true, mijing: mijingBrief(content, state, ctx.now) } };
  if (action === 'enter') return enterRun(state, content, ctx, args);
  if (action === 'go') return goRoom(state, content, ctx, args);
  if (action === 'choose') return choose(state, content, ctx, args);
  if (action === 'boon') return takeBoon(state, content, ctx, args);
  if (action === 'yield') return yieldRoom(state, content, ctx);
  if (action === 'leave') return leaveRun(state, content, ctx);
  if (action === 'close') {
    if (!state.mijing?.last) return { state: null, result: { ok: true } };
    const s = clone(state); delete s.mijing.last;
    return { state: s, result: { ok: true, closed: true } };
  }
  return refuse('unknown-action', null, { actions: ['info', 'enter', 'go', 'choose', 'boon', 'yield', 'leave', 'close'] });
}

/* While a run is on, the world outside waits (as a sealed instance holds it): no walking off, no story, no other instance. */
const HOLDS = new Set(['move', 'go', 'travel', 'enter', 'leave', 'seclude', 'meet', 'tame', 'build', 'load', 'make', 'resolve', 'trade']);
export function mijingHold(state, verb) {
  if (!runOf(state) || !HOLDS.has(verb)) return null;
  return refuse('in-mijing', pick({ zh: '人在秘境里，外头的事出去再说。', en: 'You are inside the realm. What waits outside waits.' }, state.lang));
}

/* ── The fight rooms: the page's 斗法 room, the run's door ── */

/* The game a fight room is fought as: the room's beast, weighed by the run (world.mjs foeOf reads `foe`). */
function gameOf(run) {
  const room = run?.room;
  if (!room?.foe) return null;
  return { id: mijingFightId(room.id), kind: 'duel', creature: room.foe.creature, deal: `${run.seed}|${room.id}`, foe: { hp: room.foe.hp, ...(room.foe.deck ? { deck: room.foe.deck } : {}) }, mijing: true };
}
/* The fight's setup: the door's own (cards.mjs fightSetup), his 气血 the run's (`wounds`, `hpScale` for 固本), the
   boons on what a fight reads, the 灵泉's ★ on its 功法. */
export function mijingSetup(content, state, game, now) {
  if (state.fight?.game === game.id && state.fight.setup) return state.fight.setup;
  const run = runOf(state), base = fightSetup(content, state, foeOf(content, game), now, game.id, game.deal);
  const boons = boonsOf(content, run), f = b => b.fight ?? {};
  const scale = 1 + sum(boons, b => b.hp_max);
  const you = { ...base.you };
  you.extra = [...(you.extra ?? []), ...boons.flatMap(b => f(b).extra ?? [])];
  if (sum(boons, b => f(b).power)) you.power = (you.power ?? 0) + sum(boons, b => f(b).power);
  if (sum(boons, b => f(b).armor)) you.armor = (you.armor ?? 0) + sum(boons, b => f(b).armor);
  if (boons.some(b => f(b).insight)) you.insight = Math.max(you.insight ?? 0, ...boons.map(b => f(b).insight ?? 0));
  if (Object.keys(run.stars ?? {}).length) { you.stars = { ...(you.stars ?? {}) }; for (const [id, n] of Object.entries(run.stars)) you.stars[id] = (you.stars[id] ?? 0) + n; }
  if (scale !== 1) you.hpScale = scale;
  // The fight's own cap (battle.js sideOf), less what the run has lost.
  const wounds = hpCap(content, state, boons) - run.hp;
  if (wounds > 0) you.wounds = wounds;
  return { ...base, you };
}
/* The beast up in the room he stands in, as the place's encounter (world.mjs encounterOf): undefined outside a run
   (the place's own reading goes on), null when the room holds no fight to open. */
export function mijingEncounter(content, state, now) {
  const run = runOf(state);
  if (!run) return undefined;
  if (run.room?.phase !== 'fight' || !(tableOf(content)?.doors ?? []).includes(state.place)) return null;
  const game = gameOf(run), creature = creatureOf(content, game.creature);
  if (!creature) return null;
  const brief = duelBrief(content, state, game, now);
  return {
    creature: { id: creature.id, name: pick(creature.name, state.lang) }, game,
    mijing: { kind: run.room.kind, name: kindName(content, run.room.kind, game.creature, state.lang) },
    ...(run.room.kind === 'xiong' ? { elite: true } : {}),
    duel: { ...brief, setup: mijingSetup(content, state, game, now), today: null, stake: pick(tierRow(content, run.tier)?.name, state.lang) },
    won: false, withdrawn: false, tamed: false, beaten: false, likes: null,
  };
}

/* `duel` on a run's fight (tasks.mjs duel hands it here): the door, and the settle the rules replay. No 灵气 (the 令
   paid for the run), no haunt pay, no day's lock: the run pays at its end. */
export function mijingDuel(state, content, ctx, args) {
  const id = String(args.id ?? ''), run = runOf(state), game = gameOf(run);
  if (!run || !game || game.id !== id || run.room.phase !== 'fight') return refuse('not-here', null);
  const creature = creatureOf(content, game.creature);
  if (!args.picks) {
    if (state.fight && state.fight.game !== id) return refuse('in-a-fight', null, { game: state.fight.game });
    const s = clone(state), resuming = s.fight?.game === id;
    if (args.pills != null && !resuming) s.pill_pick = String(args.pills).split(',').map(x => x.trim()).filter(p => fightPill(content, p)).slice(0, POUCH_MAX);
    if (!resuming) s.fight = { game: id, creature: creature.id, at: ctx.now.toISOString(), mijing: true, setup: mijingSetup(content, s, game, ctx.now) };
    return { state: s, result: { ok: true, started: id, ...(resuming ? { resumed: true } : {}), duel: { ...duelBrief(content, s, game, ctx.now, { door: true }), today: null, stake: pick(tierRow(content, run.tier)?.name, s.lang) } } };
  }
  if (state.fight?.game !== id) return refuse('not-started', null, { game: id });
  const s = clone(state), setup = s.fight.setup;
  const played = battle(String(args.picks).split(',').map(x => x.trim()).filter(Boolean), setup, cardCatalog(content));
  if (played.refused) return refuse(played.refused.why, null, { action: played.refused.action });
  if (played.outcome === 'open') return refuse('unfinished', null, { turn: played.turn });
  delete s.fight;
  const won = played.outcome === 'won';
  const firsts = creature.person ? {} : meetBeast(s, creature.id, won, ctx.now);
  // What the fight spent of his own: the pills taken and the 符 played (tasks.mjs duel's rule), win or lose.
  const catalog = cardCatalog(content), charms = new Set((setup.you?.extra ?? []).filter(c => catalog[c]?.charm));
  const used = [...played.log.filter(e => e.act === 'pill' && e.who === 'you').map(e => e.id), ...new Set(played.log.filter(e => e.act === 'played' && e.who === 'you' && charms.has(e.id)).map(e => e.id))];
  for (const p of used) { s.bag[p] = Math.max(0, (s.bag[p] ?? 0) - 1); if (!s.bag[p]) delete s.bag[p]; }
  const playedIds = new Set(played.log.filter(e => e.act === 'played' && e.who === 'you').map(e => e.id));
  if (s.cards_new) { const left = s.cards_new.filter(c => !playedIds.has(c)); if (left.length) s.cards_new = left; else delete s.cards_new; }
  const r = s.mijing.run, here = r.room, t = tierRow(content, r.tier);
  r.hp = Math.max(0, Math.min(r.hp_max, played.you.hp));
  const base = { ok: true, outcome: played.outcome, game: id, you: played.you, foe: played.foe, turns: played.turn, ...(firsts.first_met ? { first_met: true } : {}), ...(firsts.first_win ? { first_win: true } : {}) };
  if (played.outcome === 'lost' || r.hp <= 0) return endRun(s, content, ctx, 'dead', { ...base, room: here.id });
  roomCleared(content, r, here.kind);
  if (!won) { here.phase = 'done'; here.outcome = { withdrew: true }; return { state: s, result: { ...base, mijing: { room: here.id, hp: r.hp } } }; }
  // 灵泉余润: a share of 气血 back after each fight won.
  const heal = Math.round(r.hp_max * sum(boonsOf(content, r), b => b.heal));
  if (heal) r.hp = Math.min(r.hp_max, r.hp + heal);
  if (here.kind === 'boss') return endRun(s, content, ctx, 'clear', { ...base, room: here.id });
  here.got = rollLoot(content, r, t, here.id, { elite: here.kind === 'xiong' });
  here.wealth = addWealth(r, between(knobs(content).wealth?.room ?? [2, 4], u(`${r.seed}|${here.id}|wealth`)) * wealthScale(content, t) * (here.kind === 'xiong' ? 2 : 1));
  if (here.kind === 'xiong') { here.offer = boonOffer(content, r, here.id); here.phase = 'reward'; } else here.phase = 'done';
  return { state: s, result: { ...base, mijing: { room: here.id, hp: r.hp, ...(heal ? { healed: heal } : {}) } } };
}
export const isMijingFight = isFightId;

/* ── The board rooms ── */

/* The board the room he stands in deals (its task id), while it is up. */
const roomBoard = state => { const room = runOf(state)?.room; return room?.phase === 'board' ? room.board?.task ?? null : null; };
export const mijingBoardHere = (content, state, id) => Boolean(id) && roomBoard(state) === id && (tableOf(content)?.doors ?? []).includes(state.place);
/* Look's task list: the room's board, offered. */
export function mijingHosted(content, state) {
  const id = roomBoard(state);
  return id && mijingBoardHere(content, state, id) ? { [id]: { status: 'offered' } } : {};
}
/* …and its row: the room's title, the level the run deals and the knobs it lays on (the 重's depth on the TD level's
   difficulty, the boons' `td` fields by kit; a 拼图 of the 重's own painting). */
export function mijingRow(content, state, id) {
  if (!mijingBoardHere(content, state, id)) return {};
  const run = runOf(state), room = run.room, b = room.board, t = tierRow(content, run.tier), task = content.tasks.tasks.find(x => x.id === id);
  const kit = task?.game ? kitOf(content, task.game) : null, row = kit?.levels?.find(l => l.id === b.lv) ?? null;
  const over = {};
  const step = 1 + (knobs(content).td_step ?? 0) * (t.n - 1);
  if (row?.difficulty != null && step !== 1) over.difficulty = +(row.difficulty * step).toFixed(3);
  for (const boon of boonsOf(content, run)) for (const [field, v] of Object.entries(boon.td?.[task?.game] ?? {})) {
    const was = over[field] ?? row?.[field];
    if (typeof was === 'number') over[field] = field === 'wall' ? Math.round(was * v) : was + v;
  }
  const name = roomOf(run.map, room.id)?.name;
  const title = `${pick(kindRow(content, room.kind)?.name, state.lang)} · ${pick(name, state.lang) ?? pick(task?.title, state.lang)}`;
  if (row) over.title = { zh: `${pick(t.name, 'zh')} · ${pick(name, 'zh') ?? ''}`, en: `${pick(t.name, 'en')} · ${pick(name, 'en') ?? ''}` };
  const deal = { ...(b.lv != null ? { lv: b.lv } : {}), ...(Object.keys(over).length ? { over } : {}), ...(task?.game === 'pintu' && t.backdrop ? { pics: [{ src: `worlds/jiuding/${t.backdrop}`, a: 1.5 }] } : {}) };
  return { mijing: true, title, ...(Object.keys(deal).length ? { deal } : {}) };
}
/* Its win handed in (tasks.mjs taskDone): the 气血 it cost by its stars, a little loot, the room behind him. */
export function mijingBoardDone(state, content, ctx, id) {
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state), r = s.mijing.run, here = r.room, t = tierRow(content, r.tier);
  delete s.wins[id];
  const stars = Math.max(1, Math.min(3, Number(s.play_stars?.[id] ?? s.stars?.[id] ?? 1) || 1));
  if (s.stars) delete s.stars[id]; // the room's, not a best ever
  if (s.play_stars) delete s.play_stars[id];
  // A board never kills: it leaves him at 1 at the worst (a loss is played again in place, never counted).
  const hurt = Math.min(hurtOf(content, r, stars), Math.max(0, r.hp - 1));
  r.hp -= hurt;
  here.got = rollLoot(content, r, t, here.id, {});
  here.wealth = addWealth(r, between(knobs(content).wealth?.room ?? [2, 4], u(`${r.seed}|${here.id}|wealth`)) * wealthScale(content, t));
  here.outcome = { stars, hp: -hurt };
  here.phase = 'done';
  r.last_board = here.board.task;
  roomCleared(content, r, here.kind);
  return { state: s, result: { ok: true, done: id, stars, hp: -hurt, hp_now: r.hp, mijing: { room: here.id } } };
}

/* ── Look ── */

const nameOf = (content, id, lang) => pick(content.items.items.find(i => i.id === id)?.name, lang) ?? id;
const boonBrief = (content, id, lang) => { const b = boonRow(content, id); return b ? { id, name: pick(b.name, lang), does: pick(b.does, lang) } : null; };
function roomBrief(content, state, run) {
  const room = run.room, lang = state.lang;
  if (!room) return null;
  const out = { id: room.id, kind: room.kind, phase: room.phase, name: pick(roomOf(run.map, room.id)?.name, lang) ?? null, kind_name: kindName(content, room.kind, room.foe?.creature, lang) };
  if (room.foe) out.foe = { creature: room.foe.creature, name: pick(creatureOf(content, room.foe.creature)?.name, lang), id: mijingFightId(room.id) };
  if (room.board) out.board = room.board.task;
  if (room.kind === 'qiyu' && room.qiyu) {
    const q = tableOf(content).qiyu[room.qiyu];
    out.qiyu = { id: room.qiyu, frame: pick(q.frame, lang), ways: q.ways.map((w, i) => ({ i, label: pick(w.label, lang), ...(w.chance != null ? { chance: w.chance } : {}) })) };
  }
  if (room.kind === 'quan') out.quan = { heal: Math.round(run.hp_max * (tableOf(content)?.quan?.heal ?? 0.3)), cards: (room.temper ?? []).map(id => ({ id, name: pick(cardCatalog(content)[id]?.name, lang) ?? id })) };
  if (room.offer && room.phase === 'reward') out.offer = room.offer.map(id => boonBrief(content, id, lang)).filter(Boolean);
  if (room.got?.length || room.wealth) out.got = { items: (room.got ?? []).map(g => ({ id: g.id, name: nameOf(content, g.id, lang), n: g.n })), wealth: room.wealth ?? 0 };
  if (room.outcome) out.outcome = { ...room.outcome, ...(room.outcome.card ? { card_name: pick(cardCatalog(content)[room.outcome.card]?.name, lang) } : {}) };
  if (room.yielded) out.yielded = true;
  return out;
}
/* Look's `mijing`: inside a run, the map as it stands (what is behind, where he is, where he may go), his 气血, boons,
   pack and the room's business; at a door, the 重 and which are open, and his 秘境令; after a run, what it paid. */
export function mijingBrief(content, state, now) {
  const tab = tableOf(content);
  if (!tab) return null;
  const lang = state.lang, run = runOf(state), last = state.mijing?.last ?? null;
  if (run) {
    const t = tierRow(content, run.tier), next = new Set(run.room && run.room.phase !== 'done' ? [] : nextRooms(run)), done = new Set(run.done);
    const mark = r => ({ id: r.id, kind: r.kind, mark: kindRow(content, r.kind)?.mark ?? '', name: pick(r.name, lang) ?? null, at: r.at, row: r.row,
      state: r.id === run.at ? 'here' : done.has(r.id) ? 'done' : next.has(r.id) ? 'next' : 'far' });
    return {
      inside: true, tier: { n: t.n, name: pick(t.name, lang), say: pick(t.say, lang), backdrop: t.backdrop ?? null },
      hp: run.hp, hp_max: run.hp_max, boons: run.boons.map(id => boonBrief(content, id, lang)).filter(Boolean),
      stars: Object.entries(run.stars ?? {}).map(([id, n]) => ({ id, n, name: pick(cardCatalog(content)[id]?.name, lang) ?? id })),
      loot: { items: Object.entries(run.loot.items).map(([id, n]) => ({ id, name: nameOf(content, id, lang), n })), wealth: run.loot.wealth },
      map: { layers: run.map.layers.map(row => row.map(mark)), boss: mark(run.map.boss), ways: run.map.ways },
      at: run.at, next: [...next], room: roomBrief(content, state, run), depth: run.done.length, of: run.map.layers.length + 1,
      walked: [...run.done, ...(run.at && !done.has(run.at) ? [run.at] : [])], yield: knobs(content).yield ?? 0.25,
    };
  }
  const door = atDoor(content, state);
  if (!tierOpen(content, state, 1) && !last) return null;
  // Away from the door with a 秘境令 in hand: where the door is (the page's one line and the way there).
  if (!door && !last) {
    const at = tab.doors?.[0], keys = keysHeld(content, state);
    return keys > 0 && at ? { away: true, keys, key_name: nameOf(content, tab.key, lang), door: placeName(content, state, placeOf(content, at)) } : null;
  }
  const tiers = (tab.tiers ?? []).map(t => ({ n: t.n, name: pick(t.name, lang), open: tierOpen(content, state, t.n), cleared: (state.mijing?.cleared ?? []).includes(t.n), ...(tierOpen(content, state, t.n) ? {} : { why: shutWhy(content, state, t) }) }));
  return { door, keys: keysHeld(content, state), key_name: nameOf(content, tab.key, lang), tiers, ...(last ? { last } : {}),
    ...(door ? { place: placeName(content, state, placeOf(content, state.place)) } : {}) };
}
