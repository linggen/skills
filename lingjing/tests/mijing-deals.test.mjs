// 秘境探险's deals (rules/mijing.mjs mapOf · dealRooms · boardFor · mijingRow; worlds/jiuding/mijing.json `deals`; Hanli
// 2026-11-10: 「秘境里面每一步随机游戏类型吧, 每次都玩不同的游戏」): every room with something to play draws its game from
// one pool, each game once a run, seeded by the run; the room takes the game's flavour; every deal plays at a valid
// level in every 重; the phone never draws what it cannot host; a lost board is the room's, as a lost 守关's was.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState, boardMinutes } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { dealPool, mapOf, nextRooms } from '../scripts/rules/mijing.mjs';
import { boardVaries } from '../scripts/rules/pool.mjs';
import { kitOf } from '../scripts/rules/reveal.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { cardCatalog } from '../scripts/rules/cards.mjs';
import { TIDES } from '../scripts/games/tide.js';

const content = loadContent();
const M = content.mijing, D = M.deals;
const NOW = new Date(2026, 10, 10, 10, 0);
const ctx = () => ({ now: NOW, quests: [] });
const call = (verb, s, args) => VERBS[verb](s, content, ctx(), args);
const taskOf = id => content.tasks.tasks.find(t => t.id === id);
const gameOf = d => (d.task ? taskOf(d.task)?.game : 'duel');
const plays = r => M.kinds[r.kind]?.play !== 'pick';
const SEEDS = 200;

let cached = null;
function inRun(tier = 1, seed = 'deals') {
  if (!cached) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cached = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(cached);
  s.place = 'shimen';
  s.bag[M.key] = 3;
  const out = call('mijing', s, { action: 'enter', tier: 1, seed }).state;
  out.mijing.run.tier = tier;
  return out;
}
/* Walk him into a room dealt `deal` (the second row's first, its way from the first row's). */
function intoDeal(s, deal, id = '2a') {
  const r = s.mijing.run;
  r.at = '1a'; r.room = { id: '1a', kind: 'yao', phase: 'done' }; r.done = ['1a'];
  r.map.layers[1][0] = { ...r.map.layers[1][0], id, kind: deal.room, deal: deal.id };
  r.map.ways['1a'] = [id];
  const out = call('mijing', s, { action: 'go', room: id });
  assert.ok(out.result.ok, JSON.stringify(out.result));
  return out.state;
}
const maps = (host = 'mac', c = content) => M.tiers.flatMap(t => Array.from({ length: SEEDS }, (_, k) => ({ t, map: mapOf(c, t, `deal-${t.n}-${k}`, { host }) })));

test('the pool: each deal a kind\'s flavour and a 秘境 task (the card duel none), nine cells by the 重, varying each play — no one-answer board (洛书), no 结印', () => {
  assert.ok(D.weight > 0 && D.elite >= 0 && D.elite < 1);
  const ids = D.pool.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, 'one row a game');
  assert.equal(new Set(D.pool.map(gameOf)).size, D.pool.length, 'one deal a game');
  for (const d of D.pool) {
    const kind = M.kinds[d.room];
    assert.ok(kind && kind.play !== 'pick' && d.room !== 'boss', `${d.id}: ${d.room} is a play kind`);
    assert.ok((d.weight ?? 1) > 0, d.id);
    if (!d.task) { assert.equal(kind.play, 'fight', `${d.id}: only the card duel has no task`); continue; }
    const t = taskOf(d.task);
    assert.ok(t?.mijing && t.kind === 'board' && t.game, `${d.id}: ${d.task} is a 秘境 board`);
    assert.equal(kind.play, 'board', `${d.id}: a board's room is a board kind`);
    assert.notEqual(t.game, 'jieyin', '结印 alone needs a camera');
    assert.notEqual(t.game, 'luoshu', 'every 九宫 is the one square (Hanli 10-19: 「9宫格出现一次就可以了」)');
    for (const f of ['lv', 'level', 'ai']) if (Array.isArray(d[f])) assert.equal(d[f].length, M.tiers.length, `${d.id}.${f}: a cell a 重`);
    // Varies by pool.mjs's own notion (boardVaries), or by the run: a kit's tide maker, or a ladder across the 重.
    const cells = new Set(['lv', 'level', 'ai'].flatMap(f => [d[f]].flat(2)).filter(v => v != null));
    assert.ok(boardVaries(t) || TIDES[t.game] || cells.size > 1, `${d.id}: a board that plays the same each time`);
  }
  // The kinds the deals brought in (阵 · 古乐 · 险道): their minutes the measured minutes of their games (state.mjs boardMinutes).
  for (const k of ['zhen', 'yue', 'xian']) {
    const games = D.pool.filter(d => d.room === k).map(d => content.games.games.find(g => g.id === gameOf(d) && !g.cut && !g.replaced) ?? { id: gameOf(d) });
    assert.ok(games.length, k);
    assert.equal(M.kinds[k].minutes, Math.round(games.reduce((t, g) => t + boardMinutes(content, g), 0) / games.length), `${k}: minutes as its games play`);
    for (const lang of ['zh', 'en']) assert.ok(M.kinds[k].name[lang], k);
    assert.ok([...M.kinds[k].name.zh].length <= 20 && M.kinds[k].mark, k);
  }
});

test('every deal plays at a valid level in every 重: Look\'s row for the room, dealt to the module itself', async () => {
  const mods = {};
  for (const d of D.pool.filter(x => x.task)) {
    const t = taskOf(d.task);
    for (const tier of M.tiers) {
      const s = intoDeal(inRun(tier.n, `lint-${d.id}`), d);
      const b = s.mijing.run.room.board;
      assert.equal(b?.task, d.task, `${d.id} at ${tier.n}: its board`);
      const row = look(s, content, ctx()).tasks.find(x => x.id === d.task);
      assert.ok(row?.mijing && row.deal, `${d.id} at ${tier.n}: on Look`);
      const where = `${d.id} at 重 ${tier.n}`;
      if (TIDES[t.game]) {
        // A 塔防 room: made by the kit's maker, else its `lv` a level of the kit.
        const kit = kitOf(content, t.game) ?? content.games.games.find(g => g.id === t.game && Array.isArray(g.levels));
        assert.ok(b.made || kit?.levels?.some(l => l.id === b.lv), `${where}: ${b.lv}`);
        continue;
      }
      if (t.game === 'fighter') { assert.equal(row.deal.levels?.[0]?.id, b.lv, where); continue; }
      mods[t.game] ??= await import(`../scripts/games/${t.game}.js`);
      const g = mods[t.game].newGame(`lint|${row.deal.seed}`, row.level ?? 1, row.deal);
      const said = JSON.stringify(row.deal.levels ?? null);
      assert.ok(!/药园|沈小满|秘境开门/.test(said), `${where}: no story row's words — ${said.slice(0, 120)}`);
      if (t.game === 'huarong') assert.equal(g.level, b.lv, where);
      else if (t.game === 'pintu') assert.equal(g.level, b.lv, where);
      else if (t.game === 'xiangqi') { assert.equal(row.level, b.level, where); assert.equal(g.level, b.level, where); }
      else if (t.game === 'wuziqi') assert.equal(g.ai, b.ai, where);
      else if (t.game === 'rain') assert.equal(row.deal.levels?.[0]?.id, b.lv, where);
      else if (t.game === 'dash') { assert.ok(g.live && g.level?.id === b.lv, `${where}: ${b.lv} plays`); assert.ok(!g.level.say && !g.level.end, `${where}: the story's lines off`); }
      else if (t.game === 'taiko' || t.game === 'fuqin') assert.ok(g.live && g.level?.id === b.lv, `${where}: ${b.lv} plays`);
      else assert.fail(`${where}: a game the lint does not know (${t.game}) — add its check`);
    }
  }
});

test('a run deals each game once, seeded: the same seed the same games, a reload the same room; runs differ in their order', () => {
  const orders = new Set();
  for (const { t, map } of maps()) {
    const dealt = map.layers.flat().filter(r => r.deal).map(r => r.deal);
    assert.equal(new Set(dealt).size, dealt.length, `${t.id}: no game twice`);
    for (const r of map.layers.flat()) assert.equal(Boolean(r.deal), plays(r), `${r.id}: play rooms dealt, pick rooms not`);
    for (const r of map.layers.flat().filter(x => x.deal)) {
      const d = D.pool.find(x => x.id === r.deal);
      assert.ok(r.kind === d.room || (d.room === 'yao' && r.kind === 'xiong' && r.row > 0), `${r.id}: ${r.kind} is ${d.id}'s flavour`);
    }
    if (t.n === 1) orders.add(dealt.join(','));
  }
  assert.ok(orders.size > SEEDS * 0.9, `runs differ: ${orders.size} orders in ${SEEDS}`);
  const t = M.tiers[3];
  assert.deepEqual(mapOf(content, t, 'again'), mapOf(content, t, 'again'), 'the same seed, the same map');
  // Into a room twice from the same save (a reload): the same board at the same level.
  const s = inRun(4, 'reload'), first = nextRooms(s.mijing.run)[0];
  const a = call('mijing', s, { action: 'go', room: first }).state.mijing.run.room, b = call('mijing', s, { action: 'go', room: first }).state.mijing.run.room;
  assert.deepEqual(a, b);
});

test('over 200 seeds a 重: the card duel is one game of the pool (was about two rooms in three); the pick rooms keep their share', () => {
  const games = {}, kinds = {};
  let rooms = 0, played = 0;
  for (const { map } of maps()) for (const r of map.layers.flat()) {
    rooms += 1; kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
    if (r.deal) { played += 1; games[r.deal] = (games[r.deal] ?? 0) + 1; }
  }
  const N = D.pool.length;
  for (const d of D.pool) {
    const share = (games[d.id] ?? 0) / played;
    assert.ok(share > 0.6 / N && share < 1.4 / N, `${d.id}: ${(share * 100).toFixed(1)}% of play rooms, one of ${N} is ${(100 / N).toFixed(1)}%`);
  }
  const duels = ((kinds.yao ?? 0) + (kinds.xiong ?? 0)) / played;
  assert.ok(duels < 1.4 / N, `card duels ${(duels * 100).toFixed(1)}% of play rooms`);
  // Before (2026-11-10, the same 200 seeds × nine 重): play 68.4% · 奇遇 14.8% · 灵泉 14.6% · 宝箱 2.2% of rooms; the guaranteed
  // 守关 of the second row is gone (the game is drawn), so play moves a little to the picks.
  const at = k => (kinds[k] ?? 0) / rooms;
  assert.ok(played / rooms > 0.62 && played / rooms < 0.72, `play ${(100 * played / rooms).toFixed(1)}%`);
  assert.ok(at('qiyu') > 0.12 && at('qiyu') < 0.19, `奇遇 ${(100 * at('qiyu')).toFixed(1)}%`);
  assert.ok(at('quan') > 0.12 && at('quan') < 0.18, `灵泉 ${(100 * at('quan')).toFixed(1)}%`);
  assert.ok(at('bao') > 0.01 && at('bao') < 0.05, `宝箱 ${(100 * at('bao')).toFixed(1)}%`);
});

test('a run longer than the pool draws it again — each round once, never the game of a room that leads in', () => {
  const small = { ...content, mijing: { ...M, deals: { ...D, pool: D.pool.filter(d => ['duel', 'huarong', 'xiangqi'].includes(d.id)) } } };
  const big = { ...M.tiers[8], layers: 4, rooms: 8 };
  for (let k = 0; k < 100; k++) {
    const map = mapOf(small, big, `small-${k}`), rooms = map.layers.flat();
    for (const r of rooms.filter(x => x.deal)) for (const p of rooms.filter(x => (map.ways[x.id] ?? []).includes(r.id) && x.deal)) assert.notEqual(p.deal, r.deal, `${k}: ${p.id}→${r.id} the same game`);
    const dealt = rooms.filter(r => r.deal).map(r => r.deal);
    assert.equal(new Set(dealt.slice(0, 3)).size, Math.min(3, dealt.length), `${k}: the first round each once`);
  }
});

test('the phone: a game it cannot host is never drawn into a run begun there; what the pool says agrees with board-kit.json', () => {
  const kit = JSON.parse(fs.readFileSync(new URL('../tools/phone/board-kit.json', import.meta.url), 'utf8')).games;
  for (const d of D.pool) {
    const game = gameOf(d);
    // The card duel is the app's own fight room (linggen-mobile; tests/phone-fight-room.test.mjs), not a webview board.
    const hosts = game === 'duel' || Boolean(kit[game]);
    assert.equal(d.phone !== false, hosts, `${d.id}: phone ${d.phone !== false} but board-kit ${hosts ? 'hosts' : 'lacks'} ${game}`);
  }
  // A pool with one the phone lacks: never on the phone, still on the Mac.
  const off = { ...content, mijing: { ...M, deals: { ...D, pool: D.pool.map(d => (d.id === 'taiko' ? { ...d, phone: false } : d)) } } };
  assert.ok(!dealPool(off, 'phone').some(d => d.id === 'taiko') && dealPool(off, 'mac').some(d => d.id === 'taiko'));
  const phone = maps('phone', off).flatMap(m => m.map.layers.flat()), mac = maps('mac', off).flatMap(m => m.map.layers.flat());
  assert.ok(!phone.some(r => r.deal === 'taiko'), 'none on the phone');
  assert.ok(mac.some(r => r.deal === 'taiko'), 'some on the Mac');
  // …and the run's door reads the host: the phone's bundle sets LINGJING_HOST (tools/phone/entry.mjs).
  const was = process.env.LINGJING_HOST;
  process.env.LINGJING_HOST = 'phone';
  try {
    const s = inRun(1, 'x');
    delete s.mijing.run;
    for (let k = 0; k < 30; k++) {
      const out = VERBS.mijing({ ...s, mijing: { ...s.mijing, runs: k } }, off, ctx(), { action: 'enter', tier: 1, seed: `p${k}` });
      assert.ok(out.result.ok, JSON.stringify(out.result));
      assert.ok(!out.state.mijing.run.map.layers.flat().some(r => r.deal === 'taiko'), `run ${k}`);
    }
  } finally { if (was == null) delete process.env.LINGJING_HOST; else process.env.LINGJING_HOST = was; }
});

test('a lost drawn board is the room\'s, as a lost 守关\'s: played again in place (no 气血), or left by 撤 at its cost — never a dead run', () => {
  for (const d of D.pool.filter(x => x.task)) {
    const s = intoDeal(inRun(2, `lost-${d.id}`), d), hp = s.mijing.run.hp;
    const lost = task(s, content, ctx(), { action: 'lost', id: d.task });
    assert.ok(lost.result.ok, `${d.id}: ${JSON.stringify(lost.result)}`);
    const after = lost.state ?? s;
    assert.equal(after.mijing.run.room.phase, 'board', `${d.id}: still up`);
    assert.equal(after.mijing.run.hp, hp, `${d.id}: a loss costs no 气血`);
    assert.ok(look(after, content, ctx()).tasks.some(t => t.id === d.task), `${d.id}: played again in place`);
    const y = call('mijing', after, { action: 'yield' });
    assert.ok(y.result.ok && y.state.mijing.run.hp < hp && y.state.mijing.run.room.phase === 'done', `${d.id}: 撤`);
  }
});

/* The walk the play bot does not take (tools/playbot never enters a run): every 重, each room played as dealt, on to the
   大妖's door — the 大妖 is the 重's card duel as before (its winnability: tests/mijing.test.mjs at 一重). The player is the
   bands' (rules/progress.mjs makeRunner `pouch`): a card duel no line wins bare is entered with two pills from his bag. A
   card fight is weighed to be won about 60% of first deals (tests/fight-band.test.mjs) — a deal no line wins is a deal
   lost, by design — so a duel he cannot win is lost here as in the game: the run ends dead (its partial loot), and he
   comes back with the next 令 (the next seed), as the story's runner tries the next day's deal. Every 重 must be walked
   to its 大妖 three times within eight runs, and the duels lost stay inside the band. */
test('the walk-through: every 重 walked to the 大妖\'s door three times, whatever each room was dealt (a board won, a duel fought or honestly lost, a pick taken)', () => {
  let boards = 0, duels = 0, lost = 0;
  const pillsOf = s => Object.entries(s.bag ?? {}).filter(([id, n]) => n > 0 && /pill/.test(id) && content.items.items.find(i => i.id === id)?.effect).flatMap(([id, n]) => Array(Math.min(n, 2)).fill(id)).slice(0, 2).join(',');
  for (const tier of M.tiers) {
    let reached = 0;
    for (let k = 0; k < 8 && reached < 3; k++) {
      const seed = `walk-${tier.n}-w${k + 1}`;
      let s = inRun(tier.n, seed);
      s.mijing.run.map = mapOf(content, tier, seed);
      s.mijing.run.hp = s.mijing.run.hp_max = 999; // the walk, not the 气血 balance: rooms never wear it out
      let atBoss = false, died = false;
      for (let guard = 0; guard < 12 && s.mijing?.run; guard++) {
        const next = nextRooms(s.mijing.run), id = next[guard % next.length];
        if (id === 'boss') {
          const out = call('mijing', s, { action: 'go', room: 'boss' });
          assert.equal(out.state.mijing.run.room.phase, 'fight');
          assert.equal(out.state.mijing.run.room.foe.creature, tier.boss.creature, `${tier.id}: the 大妖 is the 重's`);
          atBoss = true; break;
        }
        let out = call('mijing', s, { action: 'go', room: id });
        assert.ok(out.result.ok, `go ${id}: ${JSON.stringify(out.result)}`);
        s = out.state;
        const room = s.mijing.run.room;
        if (room.phase === 'fight') {
          const fid = `mijing:${id}`, cat = cardCatalog(content);
          let door = call('duel', s, { id: fid });
          assert.ok(door.result.ok, JSON.stringify(door.result));
          let picks = winningPicks(door.state.fight.setup, cat, 60);
          const pills = pillsOf(s);
          if (!picks && pills) { door = call('duel', s, { id: fid, pills }); picks = winningPicks(door.state.fight.setup, cat, 60); }
          duels += 1;
          if (!picks) {
            // No line wins this deal: lost as a player loses it — the run ends dead, the loot by the depth reached.
            lost += 1;
            out = call('duel', door.state, { id: fid, picks: Array(80).fill('end').join(',') });
            assert.equal(out.result.ended, 'dead', `${tier.id} ${id}: a lost duel ends the run`);
            assert.ok(!out.state.mijing.run && out.state.mijing.last?.how === 'dead');
            died = true; break;
          }
          out = call('duel', door.state, { id: fid, picks: picks.join(',') });
          s = out.state;
          assert.ok(s.mijing.run, `${tier.id} ${id}: the run goes on — ${JSON.stringify(out.result).slice(0, 160)}`);
        } else if (room.phase === 'board') {
          const w = win(s, content, ctx(), { id: room.board.task, stars: 3 });
          assert.ok(w.result.ok, `win ${room.board.task}: ${JSON.stringify(w.result)}`);
          out = task(w.state, content, ctx(), { action: 'done', id: room.board.task });
          assert.ok(out.result.ok, `done ${room.board.task}: ${JSON.stringify(out.result)}`);
          s = out.state; boards += 1;
        } else if (room.phase === 'pick') {
          s = call('mijing', s, { action: 'choose', way: room.kind === 'qiyu' ? 0 : 'heal' }).state ?? s;
        }
        if (s.mijing.run?.room?.phase === 'reward') s = call('mijing', s, { action: 'boon', skip: true }).state;
      }
      assert.ok(atBoss || died, `${tier.id} ${seed}: walked to the 大妖, or out by a lost duel`);
      if (atBoss) reached += 1;
    }
    assert.equal(reached, 3, `${tier.id}: three runs to the 大妖 in eight`);
  }
  assert.ok(boards > 50, `${boards} boards played`);
  assert.ok(lost <= Math.ceil(duels * 0.45), `duels lost ${lost} of ${duels}: past the bands' ~40%`);
});
