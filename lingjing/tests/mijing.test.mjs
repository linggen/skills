// 秘境探险 — the roguelite map run (rules/mijing.mjs, worlds/jiuding/mijing.json; Hanli 2026-10-28, option A 秘境令):
// the map (connected, the 大妖 reachable, the room mix per 重), the run (气血 carried, boons, death and its partial loot,
// the clear's pay), the 秘境令 spent and dropped under the day's cap, and the 重 opened by the story's places.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { endRun, keyDrop, mapOf, mapReaches, mijingBrief, mijingHold, nextRooms, rowsOf, tierOpen } from '../scripts/rules/mijing.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { cardCatalog } from '../scripts/rules/cards.mjs';
import { huiOrder, sceneHui } from '../scripts/rules/hui.mjs';
import { begin } from '../scripts/battle.js';
import { stageCards, CARD_KINDS } from '../scripts/stage.mjs';

const content = loadContent();
const M = content.mijing;
const NOW = new Date(2026, 9, 28, 10, 0);
const ctx = (now = NOW) => ({ now, quests: [] });
const call = (verb, s, args, now = NOW) => VERBS[verb](s, content, ctx(now), args);

let cached = null;
/* A save past 古五's 秘境 passage (the story's own walk to 古六), at the stone door with 秘境令 in the bag. */
function atDoor(keys = 3) {
  if (!cached) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cached = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  const s = structuredClone(cached);
  s.place = 'shimen';
  s.bag[M.key] = keys;
  return s;
}
const run = s => s.mijing?.run;

/* Walk one room: go in, play what it holds (a fight to a win, a board won with `stars`, a pick's first way), take no boon. */
function playRoom(s, id, { stars = 3, way = 0 } = {}) {
  let out = call('mijing', s, { action: 'go', room: id });
  assert.ok(out.result.ok, `go ${id}: ${JSON.stringify(out.result)}`);
  s = out.state;
  const room = run(s).room;
  if (room.phase === 'fight') {
    const fid = `mijing:${id}`, door = call('duel', s, { id: fid });
    assert.ok(door.result.ok, `door ${fid}: ${JSON.stringify(door.result)}`);
    s = door.state;
    const picks = winningPicks(s.fight.setup, cardCatalog(content), 40);
    assert.ok(picks, `a line that wins ${room.foe.creature}`);
    out = call('duel', s, { id: fid, picks: picks.join(',') });
    assert.ok(out.result.ok, `settle: ${JSON.stringify(out.result)}`);
    return { s: out.state, r: out.result };
  }
  if (room.phase === 'board') {
    const w = win(s, content, ctx(), { id: room.board.task, stars });
    assert.ok(w.result.ok, `win ${room.board.task}: ${JSON.stringify(w.result)}`);
    out = task(w.state, content, ctx(), { action: 'done', id: room.board.task });
    assert.ok(out.result.ok, `done: ${JSON.stringify(out.result)}`);
    return { s: out.state, r: out.result };
  }
  if (room.phase === 'pick' && room.kind === 'qiyu') { out = call('mijing', s, { action: 'choose', way }); return { s: out.state ?? s, r: out.result }; }
  if (room.phase === 'pick') { out = call('mijing', s, { action: 'choose', way: 'heal' }); return { s: out.state ?? s, r: out.result }; }
  return { s, r: out.result };
}
const skipReward = s => (run(s)?.room?.phase === 'reward' ? call('mijing', s, { action: 'boon', skip: true }).state : s);

test('the table: nine 重, each named from the book with its source, 3–4 rows and 6–8 rooms, every beast of its 回 or before', () => {
  assert.equal(M.tiers.length, 9);
  const fightsAt = new Map();
  for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes ?? {})) for (const e of sc.exits ?? []) {
    const g = e.game; if (g?.kind === 'duel' && g.creature) fightsAt.set(g.creature, Math.min(fightsAt.get(g.creature) ?? Infinity, huiOrder(content, sc.hui)));
  }
  const firstMet = cid => Math.min(huiOrder(content, content.creatures.creatures.find(c => c.id === cid)?.hui), fightsAt.get(cid) ?? Infinity);
  const chapterOf = id => Object.values(content.chapters).find(c => c.scenes?.[id]);
  M.tiers.forEach((t, i) => {
    assert.equal(t.n, i + 1);
    assert.ok(t.name.zh.startsWith(['一', '二', '三', '四', '五', '六', '七', '八', '九'][i] + '重 · '), t.name.zh);
    assert.ok(t.source?.scene && t.source.book, `${t.id}: its story source`);
    assert.ok(chapterOf(t.after), `${t.id}: opens after a scene of the world (${t.after})`);
    assert.ok(t.layers >= 3 && t.layers <= 4 && t.rooms >= 6 && t.rooms <= 8, t.id);
    const at = huiOrder(content, sceneHui(content, t.after));
    for (const b of [...t.beasts, ...t.xiong, t.boss]) {
      assert.ok(content.creatures.creatures.some(c => c.id === b.creature), `${t.id}: ${b.creature} is a creature`);
      // A 重 of a 卷 not yet written (its scene has no 回) only checks the beast is one of the world's fights or 回.
      if (Number.isFinite(at)) assert.ok(firstMet(b.creature) <= at, `${t.id}: ${b.creature} is met by ${sceneHui(content, t.after)}`);
    }
    for (const b of [...t.guan, ...t.jiguan]) assert.ok(content.tasks.tasks.find(x => x.id === b.task)?.mijing, `${t.id}: ${b.task} is a 秘境 board`);
    for (const q of t.qiyu) assert.ok(M.qiyu[q]?.ways?.length >= 2, `${t.id}: 奇遇 ${q} has two ways or three`);
  });
  for (const k of Object.keys(M.kinds)) assert.ok(M.kinds[k].minutes > 0 && M.kinds[k].mark, k);
});

test('the map: connected, the 大妖 reached from every first room, the room mix per 重', () => {
  for (const t of M.tiers) for (let k = 0; k < 40; k++) {
    const map = mapOf(content, t, `seed-${t.id}-${k}`);
    assert.deepEqual(map.layers.map(r => r.length), rowsOf(t.layers, t.rooms));
    assert.equal(map.layers.flat().length, t.rooms);
    const reach = mapReaches(map);
    assert.ok(reach.boss && reach.all, `${t.id} ${k}: every room is on a way to the 大妖`);
    for (const [li, row] of map.layers.entries()) for (const r of row) {
      assert.ok(map.ways[r.id]?.length >= 1, `${r.id} leads on`);
      if (li > 0) assert.ok(map.layers[li - 1].some(p => map.ways[p.id].includes(r.id)), `${r.id} is reached`);
    }
    assert.ok(map.layers[0].every(r => r.kind === 'yao'), 'the first row: 妖兽');
    assert.ok(map.layers.at(-1).some(r => r.kind === 'quan'), 'a 灵泉 before the 大妖');
    assert.ok(!map.layers[0].some(r => r.kind === 'xiong'), 'no 凶兽 in the first row');
    assert.ok(map.layers[1].some(r => r.kind === 'guan'), 'a 守关 in the second row');
    assert.ok(map.layers.slice(1).flat().some(r => r.kind === 'qiyu'), 'a 奇遇 past the first row');
    assert.deepEqual(map, mapOf(content, t, `seed-${t.id}-${k}`), 'the same seed, the same map');
  }
});

test('a run is 15–25 minutes: a way through, by the rooms\' minutes', () => {
  const K = M.kinds, w = Object.entries(K).filter(([k, r]) => r.weight > 0 && k !== 'boss');
  const mean = w.reduce((t, [, r]) => t + r.weight * r.minutes, 0) / w.reduce((t, [, r]) => t + r.weight, 0);
  for (const t of M.tiers) {
    const minutes = K.yao.minutes + (t.layers - 1) * mean + K.boss.minutes;
    assert.ok(minutes >= 15 && minutes <= 25, `${t.id}: ${minutes.toFixed(1)} min`);
  }
});

test('the 重 open as the story reaches their places: 一重 after 古五\'s 秘境, the next once the one before is cleared', () => {
  const fresh = newState(content, 'zh', NOW);
  assert.equal(tierOpen(content, fresh, 1), false, 'not before the story\'s 秘境');
  const s = atDoor();
  assert.equal(tierOpen(content, s, 1), true);
  assert.equal(tierOpen(content, s, 2), false, '二重 waits on 一重');
  assert.equal(tierOpen(content, { ...s, mijing: { cleared: [1] } }, 2), true);
  assert.equal(tierOpen(content, { ...s, mijing: { cleared: [1, 2, 3] } }, 4), false, '灵草谷 waits for 古七\'s 灵草谷');
  assert.equal(tierOpen(content, { ...s, mijing: { cleared: [1, 2, 3] }, done_scenes: [...s.done_scenes, '09-lingcao'] }, 4), true);
  assert.equal(tierOpen(content, { ...s, mijing: { cleared: [1, 2, 3, 4, 5, 6, 7] } }, 8), false, '雷泽: 卷二 not yet reached');
  assert.doesNotThrow(() => tierOpen(content, s, 9));
  const b = mijingBrief(content, s, NOW);
  assert.equal(b.door, true);
  assert.deepEqual(b.tiers.filter(t => t.open).map(t => t.n), [1]);
});

test('秘境令: one spent at the door; none, the door stays shut; the run holds the world still', () => {
  const none = call('mijing', atDoor(0), { action: 'enter', tier: 1 });
  assert.equal(none.result.refused, 'no-key');
  assert.equal(call('mijing', atDoor(), { action: 'enter', tier: 2 }).result.refused, 'not-open');
  const away = { ...atDoor(), place: 'waimen' };
  assert.equal(call('mijing', away, { action: 'enter', tier: 1 }).result.refused, 'not-here');
  const out = call('mijing', atDoor(2), { action: 'enter', tier: 1 });
  assert.ok(out.result.ok);
  assert.equal(out.state.bag[M.key], 1, 'one 秘境令 spent');
  assert.ok(mijingHold(out.state, 'move'), 'no walking off mid-run');
  assert.equal(mijingHold(out.state, 'look'), null);
  assert.equal(call('mijing', out.state, { action: 'enter', tier: 1 }).result.refused, 'in-a-run');
  assert.ok(CARD_KINDS.mijing, 'the stage knows the card');
  const l = look(out.state, content, ctx());
  assert.ok(l.mijing?.inside && l.mijing.map.layers[0].every(r => r.state === 'next'));
  assert.ok(stageCards(l).some(c => c.card === 'mijing'));
});

test('秘境令 drops: a 兽潮 night always, a pool\'s beast now and then — never past the day\'s cap, never before the 秘境', () => {
  const k = content.balance.mijing;
  assert.ok(k.cap_day >= 1 && k.drops.shouchao > 0 && k.drops.yaoshou > 0);
  const s = atDoor(0);
  let got = 0;
  for (let i = 0; i < 10; i++) if (keyDrop(content, s, ctx(), 'shouchao')) got += 1;
  assert.equal(got, k.cap_day, 'the day\'s cap');
  assert.equal(s.bag[M.key], k.cap_day);
  const tomorrow = ctx(new Date(2026, 9, 29, 10));
  assert.ok(keyDrop(content, s, tomorrow, 'shouchao'), 'a new day, a new drop');
  const before = newState(content, 'zh', NOW);
  assert.equal(keyDrop(content, before, ctx(), 'shouchao'), null, 'before the 秘境 opens, nothing');
  assert.equal(keyDrop(content, s, ctx(), 'nothing'), null);
});

test('a run: 气血 carried from fight to fight, a board\'s stars cost it, a 灵泉 heals, the 大妖 clears it and pays', () => {
  let s = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'clear' }).state;
  const r0 = run(s);
  assert.equal(r0.hp, r0.hp_max);
  let hpSeen = [];
  for (let guard = 0; guard < 12 && run(s); guard++) {
    const next = nextRooms(run(s));
    const id = next.find(n => n === 'boss') ?? next.find(n => ['guan', 'jiguan'].includes(run(s).map.layers.flat().find(r => r.id === n)?.kind)) ?? next[0];
    const before = run(s).hp;
    if (id !== 'boss') {
      const kind = run(s).map.layers.flat().find(r => r.id === id).kind;
      const out = playRoom(s, id, { stars: 1 });
      s = skipReward(out.s);
      if (['yao', 'xiong'].includes(kind)) {
        assert.equal(run(s).hp, out.r.you.hp, 'the fight\'s 气血 left is the run\'s');
        // The next fight's door hands it back as wounds.
        hpSeen.push(run(s).hp);
      }
      if (['guan', 'jiguan'].includes(kind)) assert.equal(run(s).hp, Math.max(1, before - Math.round(run(s).hp_max * content.balance.mijing.hurt['1'])), 'one ★: a fifth of 气血');
      if (kind === 'quan') assert.ok(run(s).hp >= before);
      continue;
    }
    // The 大妖's door: the run's 气血 is the fight's.
    s = call('mijing', s, { action: 'go', room: 'boss' }).state;
    const door = call('duel', s, { id: 'mijing:boss' });
    assert.ok(door.result.ok);
    const st = begin(door.state.fight.setup, cardCatalog(content));
    assert.equal(st.you.hp, run(door.state).hp, 'wounds: the fight opens at the run\'s 气血');
    assert.equal(door.state.stamina, s.stamina, 'no 灵气 at a run\'s door');
    const picks = winningPicks(door.state.fight.setup, cardCatalog(content), 60);
    assert.ok(picks, 'the 大妖 can be won');
    const before2 = { wealth: door.state.wealth, progress: door.state.progress };
    const out = call('duel', door.state, { id: 'mijing:boss', picks: picks.join(',') });
    assert.equal(out.result.ended, 'clear');
    s = out.state;
    assert.ok(!run(s));
    assert.deepEqual(s.mijing.cleared, [1]);
    const last = s.mijing.last;
    assert.ok(last.paid.wealth > 0 && (last.paid.progress > 0 || s.wealth > before2.wealth), `a clear pays: ${JSON.stringify(last.paid)}`);
    assert.ok(last.items.some(i => i.id === 'mend-pill'), 'its pills');
    assert.ok(tierOpen(content, s, 2), '二重 opens');
  }
  assert.ok(!run(s), 'the run was walked to its end');
  assert.ok(hpSeen.length >= 1);
});

test('boons lie on what the fight reads; death ends the run with loot by the depth; leaving keeps a share too', () => {
  let s = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'boons' }).state;
  s.mijing.run.boons = ['li', 'hu', 'tuna', 'gu'];
  s.mijing.run.hp_max = 30; s.mijing.run.hp = 12;
  const first = nextRooms(run(s))[0];
  s = call('mijing', s, { action: 'go', room: first }).state;
  const door = call('duel', s, { id: `mijing:${first}` });
  const you = door.state.fight.setup.you;
  assert.ok(you.extra.includes('tuna'), '吐纳在手');
  assert.ok(you.power >= 1 && you.armor >= 1, '力 · 护');
  assert.equal(begin(door.state.fight.setup, cardCatalog(content)).you.hp, 12, 'the run\'s 气血, the 固本 cap over the fight\'s');
  // Lose it on purpose: end every turn.
  const lose = Array(80).fill('end').join(',');
  const lost = call('duel', door.state, { id: `mijing:${first}`, picks: lose });
  if (lost.result.refused === 'unfinished') return; // a beast too soft to kill him in 80 turns: nothing to check
  assert.equal(lost.result.ended, 'dead');
  assert.ok(!run(lost.state));
  assert.equal(lost.state.mijing.last.how, 'dead');
  assert.deepEqual(lost.state.mijing.cleared ?? [], []);
  // Leaving with loot in the pack keeps a share by the depth (the floor).
  let t = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'leave' }).state;
  t.mijing.run.loot = { items: { tongkuang: 8 }, wealth: 40 };
  t.mijing.run.done = ['1a'];
  const out = endRun(structuredClone(t), content, ctx(), 'left');
  const of = t.mijing.run.map.layers.length + 1, keep = Math.max(content.balance.mijing.keep_min, 1 / of);
  assert.equal(out.result.last.items.find(i => i.id === 'tongkuang')?.n, Math.floor(8 * keep));
});

test('a 奇遇 is decided by the data, a reward\'s boon picked, a board room may be left at its cost', () => {
  let s = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'qiyu' }).state;
  const map = run(s).map, q = map.layers.slice(1).flat().find(r => r.kind === 'qiyu');
  // Walk straight to it: put him in the row before, its room behind him.
  s.mijing.run.at = map.layers[q.row - 1].find(r => map.ways[r.id].includes(q.id)).id;
  s.mijing.run.room = { id: s.mijing.run.at, kind: 'yao', phase: 'done' };
  s = call('mijing', s, { action: 'go', room: q.id }).state;
  const brief = look(s, content, ctx()).mijing.room;
  assert.ok(brief.qiyu.frame && brief.qiyu.ways.length >= 2);
  const a = call('mijing', s, { action: 'choose', way: 0 }), b = call('mijing', s, { action: 'choose', way: 0 });
  assert.deepEqual(a.result, b.result, 'the same run, the same outcome');
  assert.ok(a.result.line, 'its line from the data');
  // A boon offered (a chest's three) is taken.
  let c = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'chest' }).state;
  c.mijing.run.room = { id: '1a', kind: 'bao', phase: 'reward', offer: ['li', 'hu', 'gu'] };
  const before = run(c).hp_max;
  c = call('mijing', c, { action: 'boon', id: 'gu' }).state;
  assert.ok(run(c).boons.includes('gu') && run(c).hp_max > before, '固本 raises the cap');
  // A board room left (撤): its share of 气血, and the way on.
  let d = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'yield' }).state;
  d.mijing.run.at = '2a'; d.mijing.run.room = { id: '2a', kind: 'guan', phase: 'board', board: { task: 'mijing-guan-shouqiang', lv: 'shouchao-1' } };
  const hp = run(d).hp, y = call('mijing', d, { action: 'yield' });
  assert.ok(y.result.ok && run(y.state).hp < hp && run(y.state).room.phase === 'done');
});

test('a board room: hosted while he stands in it, dealt the run\'s level, its 气血 by its stars, never paid by its grant', () => {
  let s = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'board' }).state;
  s.mijing.run.at = '1a'; s.mijing.run.room = { id: '1a', kind: 'yao', phase: 'done' };
  const map = run(s).map, g = map.layers[1].find(r => r.kind === 'guan');
  s.mijing.run.map.ways['1a'] = [g.id];
  s = call('mijing', s, { action: 'go', room: g.id }).state;
  const id = run(s).room.board.task, row = look(s, content, ctx()).tasks.find(t => t.id === id);
  assert.ok(row && row.mijing && row.deal, `the room's board on Look: ${id}`);
  assert.equal(row.deal.lv, run(s).room.board.lv);
  const w = win(s, content, ctx(), { id, stars: 2 });
  const before = { wealth: w.state.wealth, progress: w.state.progress };
  const done = task(w.state, content, ctx(), { action: 'done', id });
  assert.ok(done.result.ok);
  assert.equal(done.state.wealth, before.wealth, 'the run pays at its end');
  assert.equal(run(done.state).hp, run(s).hp - Math.round(run(s).hp_max * content.balance.mijing.hurt['2']));
  assert.ok(!look(done.state, content, ctx()).tasks.some(t => t.id === id), 'the board leaves with the room');
});

test('the card: the ink map with the lit rooms a tap, 气血, the room\'s business; the door\'s 重; a run\'s pay', async () => {
  const { mijingCardHtml } = await import('../scripts/cards.js').then(() => import('../scripts/mijing.js'));
  const s = call('mijing', atDoor(), { action: 'enter', tier: 1, seed: 'card' }).state;
  const l = look(s, content, ctx());
  const html = mijingCardHtml({ card: 'mijing' }, { look: l, lang: 'zh' });
  assert.match(html, /一重 · 凶崖/);
  assert.match(html, /<svg class="mj-map"/);
  assert.equal((html.match(/data-mijing="go"/g) ?? []).length, run(s).map.layers[0].length, 'the first row lit');
  assert.match(html, /data-mijing="leave"/);
  const door = mijingCardHtml({ card: 'mijing' }, { look: look(atDoor(), content, ctx()), lang: 'zh' });
  assert.match(door, /data-mijing="enter" data-tier="1"/);
  assert.doesNotMatch(door, /data-tier="2"/, 'a 重 not open has no way in');
  const out = endRun(structuredClone(s), content, ctx(), 'left');
  const last = mijingCardHtml({ card: 'mijing' }, { look: look(out.state, content, ctx()), lang: 'zh' });
  assert.match(last, /退出/);
  assert.match(last, /data-mijing="close"/);
});

test('a day\'s 秘境 never breaks the pace: the day\'s cap of runs, cleared, is under a fifth of a layer at every 练气 layer and above', async () => {
  const { boardPlay, needOf } = await import('../scripts/rules/playpay.mjs');
  const k = content.balance.mijing, K = M.kinds;
  const w = Object.entries(K).filter(([x, r]) => r.weight > 0 && x !== 'boss');
  const mean = w.reduce((t, [, r]) => t + r.weight * r.minutes, 0) / w.reduce((t, [, r]) => t + r.weight, 0);
  const min = K.yao.minutes + 3 * mean + K.boss.minutes; // the longest run, four rows
  for (const s of [...Array.from({ length: 9 }, (_, i) => ({ tier: 'qi', step: i + 1 })), { tier: 'foundation', step: 0 }, { tier: 'core', step: 0 }]) {
    const day = k.cap_day * boardPlay(content, s, min) * k.pay.rate / needOf(content, s);
    assert.ok(day < 0.2, `${s.tier} ${s.step}: a day's 秘境 is ${(day * 100).toFixed(1)}% of the layer`);
  }
});

test('the map forks: across many seeds some room leads two ways', () => {
  const t = M.tiers[0];
  const forks = Array.from({ length: 20 }, (_, k) => mapOf(content, t, `fork-${k}`)).filter(m => m.layers.slice(0, -1).flat().some(r => m.ways[r.id].length > 1)).length;
  assert.ok(forks >= 15, `${forks}/20 maps fork`);
});
