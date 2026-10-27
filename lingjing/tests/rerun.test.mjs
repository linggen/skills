// 刷副本 (Hanli, 2026-10-15): the 秘境's outer rooms again, every 3 hours after the last run
// ended — the story's run unchanged, the inner rooms never. Each run rolled from its own seed
// (beasts per room, an occasional elite, the 拾遗 finds, a hidden cache), beasts drop from a
// table in data (materials, 符, arms in three rarities), fights pay the haunt table under the
// 回's cap and, at 圆满, 灵石 instead (rewards.json xiuwei_to_lingshi). Sealed mode as the
// story's: the errands, the 令 and the 机缘 frozen, back on the way out. Declared in data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, layerPayOf, newState, threshold } from '../scripts/state.mjs';
import { duel, look, move, playTo, rerun, rollRun, runsPay, task, win, VERBS } from '../scripts/rules.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { fightSetup, gearFight } from '../scripts/rules/cards.mjs';
import { rerunHere } from '../scripts/rules/rerun.mjs';
import { act, battle, begin, foeTurn, offers, tokenOf } from '../scripts/battle.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const CH = content.chapters['00-waimen'];
const BEAT = CH.beats.find(b => b.sealed?.rerun);
const RERUN = BEAT.sealed.rerun;
const T = content.rewards.tables;
const HOUR = 3600000;
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
const at = (now) => ({ now, quests: [] });
const fresh = (s, now) => ({ ...s, stamina: 100, stamina_at: now.toISOString() });

/* 古六's door (wm-qianye): the 秘境 story behind him, played forward by the rules. */
const PLAYED = (() => {
  const start = new Date('2026-10-15T09:00:00+08:00');
  const out = playTo(content, newState(content, 'zh', start), 'wm-qianye', { now: start });
  return { state: out.state, now: out.now };
})();
const past = () => structuredClone(PLAYED.state);
const endedAt = () => new Date(past().reruns[BEAT.id].ended_at);
/* The rooms open again: 3 hours after the story's run. */
const openAt = () => new Date(endedAt().getTime() + RERUN.every_h * HOUR);
function must(fn, s, args, now) {
  const out = fn(s, content, at(now), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}@${s.place}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
}
/* At the door, the rooms open, a 令 held and a 机缘 live. */
function atDoor(now = openAt()) {
  const s = fresh(past(), now);
  s.place = RERUN.door;
  s.chance = { day: dayKey(now), place: 'shanlu', until: new Date(now.getTime() + 2 * HOUR).toISOString() };
  return s;
}
const inside = (now = openAt()) => must(rerun, atDoor(now), { action: 'enter' }, now);

/* A fight started and played out as the page would, then settled (tests/sealed.test.mjs fightOut). */
function fightOut(state, id, now) {
  const started = duel(state, content, at(now), { id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  // A winning line when one is there (rules/progress.mjs, as seed --at plays), else the page-like greedy line.
  const line = winningPicks(started.result.duel.setup, catalog);
  if (line) return duel(started.state, content, at(now), { id, picks: line.join(',') });
  const { setup } = started.result.duel, st = begin(setup, catalog), actions = [];
  for (let guard = 0; guard < 160 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const can = offers(st).filter(o => o.ok && o.action.kind !== 'end');
    const body = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6, 0);
    const before = { hp: st.foe.hp, mine: body(st.you), theirs: body(st.foe) };
    const best = can.map(o => {
      const after = battle([...actions, tokenOf(o.action)], setup, catalog);
      return { o, worth: (before.hp - after.foe.hp) * 2 + (body(after.you) - before.mine) * 1.2 + (before.theirs - body(after.foe)) - (o.cost ?? 0) * 0.1 };
    }).sort((x, y) => y.worth - x.worth)[0]?.o;
    if (!best) { act(st, { kind: 'end' }, 'you'); actions.push('end'); continue; }
    act(st, best.action, 'you');
    actions.push(tokenOf(best.action));
  }
  const settled = duel(started.state, content, at(now), { id, picks: actions.join(',') });
  assert.equal(settled.result.ok, true, JSON.stringify(settled.result));
  return settled;
}
/* Fight the room's beast until one is won (a loss leaves it standing). */
function winHere(s, now) {
  for (let k = 0; k < 8; k += 1) {
    const enc = look(fresh(s, now), content, at(now)).place.encounter;
    assert.ok(enc?.run, `a run beast stands at ${s.place}`);
    const out = fightOut(fresh(s, now), enc.game.id, now);
    s = out.state;
    if (out.result.outcome === 'won') return out;
  }
  throw new Error('eight losses in a row');
}

test('declared in data: the outer rooms only, the door is the story\'s, every 3 hours; no rule names the 秘境', () => {
  assert.deepEqual(RERUN.rooms, ['mijing-kou', 'mijing-xiongya', 'mijing-anhe']);
  assert.equal(RERUN.every_h, 3);
  assert.equal(RERUN.door, CH.scenes[BEAT.scenes[0]].at, 'entered at the story\'s own door');
  for (const id of RERUN.rooms) assert.ok(BEAT.sealed.places.includes(id), `${id} is a room of the instance`);
  // Never a room a story scene stands in (崖壁, 石室, 断崖下): the book is not played again.
  const story = BEAT.scenes.slice(1).map(id => CH.scenes[id].at);
  for (const id of RERUN.rooms) assert.ok(!story.includes(id), `${id} holds no story scene`);
  for (const [room, list] of Object.entries(RERUN.roads)) for (const to of list) assert.ok(RERUN.rooms.includes(room) && RERUN.rooms.includes(to), `${room} → ${to} inside the run`);
  const code = fs.readFileSync(new URL('../scripts/rules/rerun.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/秘境|mijing|shimen|qiuyu|heyu|dingtai/.test(code), 'no rule names the instance, its beasts or its finds');
});

test('reopen timing: shut for 3 hours after the story\'s run, then open; the next clock starts when a run ends', () => {
  const s = past();
  assert.ok(rerunHere(content, s), 'the beat behind him, his chapter still the 外门');
  const shut = endedAt().getTime() + RERUN.every_h * HOUR - 60000;
  const before = look(fresh(s, new Date(shut)), content, at(new Date(shut)));
  assert.equal(before.rerun.open, false);
  assert.equal(before.rerun.wait_min, 1);
  assert.equal(rerun(atDoor(new Date(shut)), content, at(new Date(shut)), { action: 'enter' }).result.refused, 'shut');
  const l = look(fresh(s, openAt()), content, at(openAt()));
  assert.equal(l.rerun.open, true);
  assert.equal(l.rerun.say, '秘境外圈的裂缝又松了。');
  assert.equal(l.rerun.door.id, RERUN.door);
  // The road to the door opens with the rooms (the 外门 is walled: 无令不得下山).
  const walk = move(fresh(s, openAt()), content, at(openAt()), { place: RERUN.door });
  assert.equal(walk.result.ok, true, JSON.stringify(walk.result));
  assert.equal(move(fresh(s, new Date(shut)), content, at(new Date(shut)), { place: RERUN.door }).result.refused, 'road-closed');
  // A run left 20 minutes in: shut again for 3 hours from then.
  const t0 = openAt(), t1 = new Date(t0.getTime() + 20 * 60000);
  const out = must(rerun, inside(t0), { action: 'leave' }, t1);
  assert.equal(out.reruns[BEAT.id].ended_at, t1.toISOString());
  assert.equal(look(out, content, at(new Date(t1.getTime() + 3 * HOUR - 60000))).rerun.open, false);
  assert.equal(look(out, content, at(new Date(t1.getTime() + 3 * HOUR))).rerun.open, true);
});

test('inside: sealed mode on the outer rooms only — the inner ones never named, the way out refused, the world outside frozen', () => {
  const now = openAt(), s = inside(now);
  assert.equal(s.place, RERUN.home);
  assert.equal(s.sealed.run, true);
  assert.equal(s.rerun.n, 1);
  const l = look(s, content, at(now));
  assert.deepEqual(l.place.plate.spots.map(p => p.id).sort(), [...RERUN.rooms].sort());
  for (const id of ['mijing-duanya', 'mijing-yabi', 'mijing-shishi']) {
    assert.ok(!JSON.stringify(l.place).includes(id), `${id} is not named`);
    assert.equal(move(s, content, at(now), { place: id }).result.ok, false, id);
  }
  assert.equal(l.sealed.header, '沉鼎秘境 · 外圈');
  assert.equal(l.sealed.run, true);
  assert.equal(l.waypoint.text, RERUN.goal.zh);
  assert.equal(l.waypoint.place, undefined, 'the goal points nowhere outside');
  for (const key of ['offers', 'work', 'chance', 'quests']) assert.equal(l[key], undefined, key);
  assert.deepEqual(l.book, []);
  assert.equal(move(s, content, at(now), { place: 'waimen' }).result.say, RERUN.say.zh);
  assert.equal(VERBS.quest(s, content, at(now), { action: 'take', id: 'xu-sun-charm' }).result.refused, 'sealed');
  assert.equal(l.rerun.inside, true);
  // The ways between the rooms are the run's own: the cliff stair leads down to the dry river.
  const walked = must(move, fresh(s, now), { place: 'mijing-anhe' }, now);
  assert.equal(walked.place, 'mijing-anhe');
});

test('leaving ends the run: back at the 外门 with the run\'s line, errands, 令 and 机缘 back — its time kept', () => {
  const t0 = openAt(), s0 = atDoor(t0);
  s0.quests = { ...s0.quests, 'xu-ahe-lixi': { took: '2026-10-15', have: {} } };
  s0.pass = { quest: 'xu-ahe-lixi', to: 'fangshi', places: ['fangshi', 'shanlu', 'dukou'] };
  const s = must(rerun, s0, { action: 'enter' }, t0);
  assert.deepEqual(s.pass, s0.pass, 'the 令 frozen, not lost');
  const t1 = new Date(t0.getTime() + 40 * 60000);
  const out = must(rerun, s, { action: 'leave' }, t1);
  assert.equal(out.rerun, undefined);
  assert.equal(out.sealed, undefined);
  assert.equal(out.place, CH.map.home);
  assert.deepEqual(out.pass, s0.pass);
  assert.equal(new Date(out.chance.until) - t1, 2 * HOUR, 'the 机缘 keeps the two hours it had at the door');
  const l = look(out, content, at(t1));
  assert.equal(l.place.returned, RERUN.back.zh);
  assert.ok(l.book.some(q => q.id === 'xu-ahe-lixi'), 'the errand is in the book again');
});

test('a run left standing past its time ends at the next settle; inside a key beat it is not entered', () => {
  const t0 = openAt(), s = inside(t0);
  const late = new Date(t0.getTime() + (RERUN.lasts_min + 1) * 60000);
  const woke = VERBS.look(s, content, at(late), {});
  assert.equal(woke.state.rerun, undefined, 'ended');
  assert.equal(woke.state.place, CH.map.home);
  // Mid-大比 (a key beat's corridor): the door does not open.
  const dabi = { ...atDoor(t0), scene: 'wm-zhaojing' };
  const shut = rerun(dabi, content, at(t0), { action: 'enter' }).result;
  assert.equal(shut.ok, false);
  // …in that beat's own words, never the 秘境 door's 「三天后才开」 (review 2026-10-21).
  const beat = CH.beats.find(b => b.scenes.indexOf('wm-zhaojing') > 0);
  assert.equal(shut.refused, 'corridor');
  assert.equal(shut.beat, beat.id);
  assert.equal(shut.say, beat.say.zh);
  assert.equal(look(dabi, content, at(t0)).rerun, undefined);
});

test('each run is rolled from its seed: the same seed the same rooms, other seeds other beasts, counts, elites, finds and caches', () => {
  const r = rerunHere(content, past()), s = past();
  assert.deepEqual(rollRun(content, s, r, 'a|1'), rollRun(content, s, r, 'a|1'));
  const rolls = Array.from({ length: 120 }, (_, i) => rollRun(content, s, r, `seed|${i}`));
  for (const rooms of rolls) {
    for (const [id, spawn] of Object.entries(RERUN.spawns)) {
      const n = rooms[id].foes.length;
      assert.ok(n >= spawn.n[0] && n <= spawn.n[1], `${id}: ${n} beasts in ${spawn.n}`);
      const pool = content.places['徐'].pools[spawn.pool].beasts.map(b => b.creature);
      for (const f of rooms[id].foes) assert.ok(pool.includes(f.creature), `${f.creature} of ${spawn.pool}`);
    }
    assert.ok(RERUN.finds['mijing-anhe'].some(f => f.item === rooms['mijing-anhe'].find.item));
  }
  const counts = new Set(rolls.map(x => Object.values(x).reduce((t, room) => t + room.foes.length, 0)));
  assert.ok(counts.size >= 3, `beast counts vary: ${[...counts]}`);
  const elites = rolls.flatMap(x => Object.values(x).flatMap(room => room.foes)).filter(f => f.elite).length;
  assert.ok(elites > 0 && elites < rolls.length, `an occasional elite: ${elites}`);
  const finds = new Set(rolls.map(x => x['mijing-anhe'].find.item));
  assert.ok(finds.has('dingtai') && finds.size >= 3, `finds vary: ${[...finds]}`);
  const caches = rolls.filter(x => Object.values(x).some(room => room.cache)).length;
  assert.ok(caches > 0 && caches < rolls.length / 2, `a small chance of a cache: ${caches}/120`);
  // Two runs of one save are two rolls: the run number is in the seed.
  const first = inside(), left = must(rerun, first, { action: 'leave' }, openAt());
  const later = new Date(openAt().getTime() + 3 * HOUR), second = must(rerun, { ...left, place: RERUN.door }, { action: 'enter' }, later);
  assert.equal(second.rerun.n, 2);
  assert.notEqual(second.rerun.seed, first.rerun.seed);
});

test('the drop table lints: 卷一 things that exist, weights and chances sane, every arm with a rarity', () => {
  const tables = content.rewards.drop_tables, items = new Map(content.items.items.map(i => [i.id, i]));
  assert.ok(tables[RERUN.drops], 'the run names a table that exists');
  for (const [id, t] of Object.entries(tables)) {
    for (const roll of t.rolls) {
      assert.ok(roll.chance > 0 && roll.chance <= 1 && (roll.elite_chance ?? roll.chance) <= 1, `${id}: chances in (0, 1]`);
      if (roll.gear) continue;
      for (const x of roll.items) {
        assert.ok(items.has(x.item), `${id}: ${x.item} exists`);
        assert.equal(items.get(x.item).juan ?? 1, 1, `${id}: ${x.item} is 卷一's`);
        assert.ok(x.weight > 0 && x.n[0] >= 1 && x.n[1] >= x.n[0], `${id}: ${x.item} weight and count`);
      }
    }
    for (const w of [t.rarity, t.elite_rarity]) for (const r of Object.keys(w)) assert.ok(content.items.rarities[r], `${id}: rarity ${r} is named`);
    for (const g of t.gear) {
      const item = items.get(g);
      assert.ok(item, `${g} exists`);
      assert.ok(['weapon', 'robe', 'pendant'].includes(item.kind), `${g} is an arm`);
      assert.ok(content.items.rarities[item.rarity], `${g} has a rarity`);
      assert.equal(item.juan ?? 1, 1);
      assert.deepEqual(item.sold, [], `${g} is a drop, never sold`);
    }
  }
  for (const f of [...RERUN.finds['mijing-anhe'], ...RERUN.cache.picks.filter(p => p.item)]) assert.ok(items.has(f.item) && (items.get(f.item).juan ?? 1) === 1, f.item);
  assert.ok(RERUN.finds['mijing-anhe'].some(f => f.item === 'dingtai'), '鼎苔 among the finds (古五: scraped from the pits\' cracks)');
});

test('arms in three rarities, small and rising: 器攻, 护体, 抗 through the fight\'s own rates — never one that makes the stair trivial', () => {
  const table = content.rewards.drop_tables[RERUN.drops], items = content.items.items.filter(i => table.gear.includes(i.id));
  const order = ['common', 'fine', 'rare'];
  const size = i => i.effect.atk ?? i.effect.def ?? Object.values(i.effect.ward ?? {}).reduce((t, n) => t + n, 0);
  for (const r of order) assert.ok(items.some(i => i.rarity === r), `some arm is ${r}`);
  for (const kind of ['weapon', 'robe', 'pendant']) {
    const list = order.map(r => items.find(i => i.kind === kind && i.rarity === r)).filter(Boolean);
    assert.ok(list.length >= 2, `${kind}: at least two rarities`);
    for (let k = 1; k < list.length; k += 1) assert.ok(size(list[k]) > size(list[k - 1]), `${kind}: ${list[k].id} over ${list[k - 1].id}`);
  }
  // 卷一's scale (no 法宝), and the balance measured 2026-10-15 (a 防 3 or a wood 抗 took the 犰狳 from ~50% to 80–90%).
  assert.ok(items.every(i => (i.effect.atk ?? 0) <= 3 && (i.effect.def ?? 0) <= 2 && Object.values(i.effect.ward ?? {}).every(n => n <= 2)), 'small');
  assert.ok(items.every(i => !i.effect.ward?.wood), 'no wood 抗: the stair\'s beast is wood');
  // Worn, each turns into the fight's numbers at the door.
  const s = { ...past(), bag: { ...past().bag, 'qingtong-jian': 1, 'heyu-ao': 1, 'anhe-yu': 1 }, wear: { weapon: 'qingtong-jian', robe: 'heyu-ao', pendant: 'anhe-yu' } };
  const g = gearFight(content, s), rates = content.cards.gear;
  assert.equal(g.power, Math.round(3 * rates.weapon_power));
  assert.equal(g.armor, Math.round(2 * rates.armor_per_def));
  assert.deepEqual(g.ward, { earth: 2 * rates.ward_per_point, water: 2 * rates.ward_per_point });
  const setup = fightSetup(content, s, content.creatures.creatures.find(c => c.id === 'heyu'), openAt());
  assert.ok(setup.you.power > 0 && setup.you.armor > 0 && setup.you.ward.earth > 0);
});

test('a fight in the run: the room\'s beast, paid as a haunt, the room moves on, the drop table rolls — the same for the same run', () => {
  const now = openAt();
  let s = must(move, fresh(inside(now), now), { place: 'mijing-xiongya' }, now);
  const enc = look(s, content, at(now)).place.encounter;
  assert.ok(['qiuyu'].includes(enc.creature.id), 'the stair\'s pool');
  assert.equal(enc.run.of, s.rerun.rooms['mijing-xiongya'].foes.length);
  const out = winHere(s, now);
  assert.equal(out.result.paid?.progress > 0 || out.result.paid?.converted?.progress > 0, true, 'a haunt\'s 修为 (or its 灵石)');
  assert.equal(out.state.rerun.rooms['mijing-xiongya'].beaten, 1);
  // Deterministic: the same run's same beast drops the same.
  const again = winHere(s, now);
  assert.deepEqual(again.result.dropped, out.result.dropped);
  // Many runs: arms come, of every rarity, and an elite drops better.
  const r = rerunHere(content, past());
  const got = { common: 0, fine: 0, rare: 0 }, eliteGot = { common: 0, fine: 0, rare: 0 };
  for (let i = 0; i < 400; i += 1) {
    const t = structuredClone(past());
    t.rerun = { id: BEAT.id, n: i, seed: `drops|${i}`, since: now.toISOString(), rooms: { 'mijing-anhe': { foes: [{ creature: 'heyu' }], beaten: 0 } } };
    for (const elite of [false, true]) {
      const u = structuredClone(t);
      const list = runSpoilsOf(u, { run: { room: 'mijing-anhe', i: 0 }, ...(elite ? { elite: true } : {}) });
      for (const d of list.filter(x => x.rarity)) (elite ? eliteGot : got)[d.rarity] += 1;
    }
  }
  assert.ok(got.common > got.fine && got.fine > got.rare && got.rare > 0, `rarities as weighted: ${JSON.stringify(got)}`);
  assert.ok(eliteGot.rare > got.rare && eliteGot.fine + eliteGot.rare > got.fine + got.rare, `an elite drops better: ${JSON.stringify(eliteGot)}`);
  assert.ok(r);
});
import { runSpoils } from '../scripts/rules/rerun.mjs';
import { chorePlay, convertRate, fightPlay } from '../scripts/rules/playpay.mjs';
const runSpoilsOf = (state, game) => runSpoils(content, state, game);

// The run's board is a short 守炉 since 2026-10-20 (was 割藤, deleted with the 饭桶's old play): the room's find is its pay,
// the cache is found on three stars (chapter.json rerun.cache `stars`), and each run deals the next 秘境 level after the
// last he won (rules/climb.mjs; games.json shoulu `realm: mijing`).
test('守火 in the dry river: the run\'s find in the bag, once a run, the next level each win; a cache under it on a three-star play when the run hid one', () => {
  const now = openAt();
  let s = must(move, fresh(inside(now), now), { place: 'mijing-anhe' }, now);
  const board = RERUN.board;
  const row = look(s, content, at(now)).tasks.find(t => t.id === board);
  assert.equal(row?.game, 'shoulu', 'the short 守炉 stands in the room');
  assert.equal(row.deal.lv, 'mijing-1', 'the first time: the first 秘境 level');
  assert.ok(row.deal.levels.some(l => l.id === 'mijing-1') && !row.deal.levels.some(l => l.id === 'shiao'), 'the 秘境\'s levels, never the 游戏厅\'s ladder');
  const find = s.rerun.rooms['mijing-anhe'].find, before = s.bag[find.item] ?? 0;
  s = must(win, s, { id: board, stars: 2 }, now);
  assert.equal(s.climb.shoulu, 1, 'won: the next deal climbs');
  assert.equal(look(s, content, at(now)).tasks.find(t => t.id === board).deal.lv, 'mijing-2');
  const done = task(s, content, at(now), { action: 'done', id: board });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  assert.equal(done.state.bag[find.item], before + find.n, `the find: ${find.item} ×${find.n}`);
  assert.equal(done.result.found[0].id, find.item);
  assert.equal(done.state.marks?.includes('gather-rich') ?? false, s.marks?.includes('gather-rich') ?? false, 'a rerun writes no story mark');
  assert.ok(!look(done.state, content, at(now)).tasks.some(t => t.id === board && t.status === 'offered'), 'once a run');
  assert.equal(win(done.state, content, at(now), { id: board }).result.ok, false);
  assert.equal(done.state.stars?.[board], undefined, 'the round\'s stars go with it');
  // A run that hid a cache: found on a rich play.
  const r = rerunHere(content, past());
  let seed = null;
  for (let i = 0; i < 400 && !seed; i += 1) if (rollRun(content, past(), r, `cache|${i}`)['mijing-anhe'].cache) seed = `cache|${i}`;
  assert.ok(seed, 'some run hides one');
  let c = structuredClone(s);
  c.rerun = { ...c.rerun, seed, rooms: rollRun(content, past(), r, seed) };
  const cache = c.rerun.rooms['mijing-anhe'].cache;
  const two = task(must(win, structuredClone(c), { id: board, stars: 2 }, now), content, at(now), { action: 'done', id: board });
  assert.ok(!two.result.cache, 'two 灵光: no cache');
  c = must(win, c, { id: board, stars: 3 }, now);
  const rich = task(c, content, at(now), { action: 'done', id: board });
  assert.equal(rich.result.cache, true);
  assert.ok(rich.result.found.some(f => f.id === cache.item), 'the cache\'s thing');
  assert.match(rich.result.line, /石板/);
});

test('修为 at 圆满 is 灵石 (Hanli: 「圆满之后走剧情到下一个阶段. 刷副本或者打怪奖励的修为改为灵石」): below the mark up to full, the rest converted; other sources unchanged', () => {
  const conv = content.rewards.xiuwei_to_lingshi;
  assert.ok(conv.rate > 0 && conv.tables.includes('haunt'));
  const s0 = { ...past(), step: 4, progress: 0 }; // at 古六's cap, 四层 — ground since 2026-10-16 (息壤 no longer lifts him there)
  const need = threshold(content, s0);
  // 修为 by the layer (balance.json layer_pay): what a fight and the 功课 are worth on 四层 — converted as it is paid.
  // 2026-10-27: a fight its minutes of play at the layer's share, the 功课 a day's 10% of the layer (play_pay).
  const H = fightPlay(content, s0), G = chorePlay(content, s0, 'day');
  // Full at the 回's cap (古六: 四层): a fight pays 灵石, no 修为, no held line.
  const full = { ...structuredClone(s0), progress: need };
  const w0 = full.wealth;
  const paid = pay(content, full, at(openAt()), { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(paid.progress, 0);
  assert.equal(paid.converted.progress, H);
  // 灵石 per 修为 read at 练气一层 (playpay.mjs convertRate, 数值系统 phase 2): the same 灵石 at every layer.
  const rate = convertRate(content, s0);
  assert.equal(paid.wealth, T.haunt.wealth + Math.round(H * rate));
  assert.equal(full.progress, need, 'nothing past the mark: no carry into the next layer');
  assert.equal(full.wealth, w0 + paid.wealth);
  assert.equal(paid.hold, null, 'never a held-back 修为 line');
  // Ten short of full: ten 修为, the rest 灵石.
  const near = { ...structuredClone(s0), progress: need - 10 };
  const p2 = pay(content, near, at(openAt()), { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(p2.progress, 10);
  assert.equal(near.progress, need);
  assert.equal(p2.wealth, T.haunt.wealth + Math.round((H - 10) * rate));
  // Well below: all 修为.
  const low = { ...structuredClone(s0), progress: 0 };
  assert.equal(pay(content, low, at(openAt()), { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth }).progress, H);
  // The day's 功课 (not a fight) at full still counts on past the mark, as before.
  const g = { ...structuredClone(s0), progress: need };
  assert.equal(pay(content, g, at(openAt()), { table: 'gongke', progress: G }).progress, G);
  assert.equal(g.progress, need + G);
  // A run's fight at full: the win card's pay is 灵石.
  const now = openAt();
  let s = must(move, fresh(inside(now), now), { place: 'mijing-xiongya' }, now);
  s.step = 4; s.progress = threshold(content, s); // at 古六's cap (四层, ground)
  const out = winHere(s, now);
  assert.equal(out.result.paid.progress, 0);
  assert.ok(out.result.paid.wealth > T.haunt.wealth, '灵石 + the converted 修为');
  assert.equal(out.state.progress, threshold(content, out.state));
});

test('the economy reads a run\'s worth from the data (rules/rerun.mjs runsPay, tools/balance.mjs)', () => {
  const [r] = runsPay(content);
  assert.equal(r.beat, BEAT.id);
  assert.equal(r.every_h, 3);
  assert.equal(r.beasts, Object.values(RERUN.spawns).reduce((t, sp) => t + (sp.n[0] + sp.n[1]) / 2, 0));
  assert.equal(r.progress, r.beasts * T.haunt.progress);
});

test('the stage: at the door the run\'s card offers the way in over the story\'s boards; inside, the rooms and the way out, the story\'s boards waiting outside', async () => {
  const { stageCards } = await import('../scripts/stage.mjs');
  const now = openAt(), door = atDoor(now);
  const ld = look(door, content, at(now));
  assert.equal(ld.rerun.here, true);
  assert.ok(stageCards(ld).some(c => c.card === 'rerun'), 'the way in stands at the door');
  const away = look(fresh(past(), now), content, at(now));
  assert.ok(!stageCards(away).some(c => c.card === 'rerun'), 'away from the door: only 下一步\'s quiet line');
  const s = inside(now), l = look(s, content, at(now));
  assert.ok(stageCards(l).some(c => c.card === 'rerun'));
  assert.ok((l.tasks ?? []).every(t => t.id === RERUN.board), 'only the run\'s own board');
  const { stageSlots } = await import('../scripts/stage.mjs');
  const river = look(must(move, fresh(s, now), { place: 'mijing-anhe' }, now), content, at(now));
  const slots = stageSlots(river, stageCards(river));
  assert.ok(slots.main.some(c => c.card === 'rerun'), 'the run\'s card rides under what stands (a beast, the 拾遗), never queued');
  assert.ok(!slots.queue.some(q => q.cards.some(c => c.card === 'rerun')));
});
