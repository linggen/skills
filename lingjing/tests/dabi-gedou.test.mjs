// 古六's 宗门大比 as 格斗 (Hanli 10-28: 「故事里的战斗可以用格斗」; 2026-10-31): every bout of the contest a fighter board with
// its own opponent — 何七 · 卢方 · 秦雁 (三十招, then 迎剑) · 马小宝 (the bout, then 接镜) · 祁长松 (the final, lost in the book:
// stood through until the wind turns). Ids, pay and marks kept; only the play kind changed. Each bout is won by a
// human-like hand (and a slower one) within three tries, while a masher, a wall of blocks and an idle hand go down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as F from '../scripts/games/fighter.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule } from '../tools/board-bots.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const REG = read('../worlds/jiuding/games.json');
const TASKS = [...read('../worlds/jiuding/tasks/world.json').tasks, ...read('../worlds/jiuding/tasks/h08.json').tasks];
const scene = (id) => read(`../worlds/jiuding/chapters/00-waimen/scenes/${id}.json`);

/* scene · task · level · the foe's name · his sheet */
const BOUTS = [
  ['wm-dabi', 'dabi-sneeze', 'heqi', '何七', 'heqi'],
  ['wm-fushi', 'dabi-lu', 'fushi-lufang', '卢方', 'lufang'],
  ['wm-lun2', 'dabi-shijie', 'lun2-qinyan', '秦雁', 'qinyan'],
  ['wm-yingjian', 'yingjian-hook', 'qinyan', '秦雁', 'qinyan'],
  ['wm-juesai', 'dabi-ma', 'juesai-ma', '马小宝', 'maxiaobao'],
  ['wm-jiejing', 'jiejing-mirror', 'jiejing-ma', '马小宝', 'maxiaobao'],
  ['wm-fengtou', 'fengtou-pig', 'fengtou', '祁长松', 'qichangsong'],
];
const rowOf = (task) => REG.games.find((g) => g.task === task && !g.replaced);

test('every 大比 bout is a 格斗 board with its own opponent: the scene shows it, the way on waits on it, no card duel left', () => {
  for (const [sc, task, level, foe, sheet] of BOUTS) {
    const r = rowOf(task), t = TASKS.find((x) => x.id === task), s = scene(sc);
    assert.deepEqual([r.id, r.mechanic, r.scene, r.group, r.levels[0].id], ['fighter', '格斗', sc, 'h08', level], task);
    assert.deepEqual([t.kind, t.game], ['board', 'fighter'], task);
    assert.equal(r.levels[0].foe.name.zh, foe, task);
    assert.equal(r.levels[0].foe.look.sheet, `art/games/fighter/${sheet}`, task);
    assert.ok(fs.statSync(new URL(`../worlds/jiuding/art/games/fighter/${sheet}.webp`, import.meta.url)).size > 1000, `${sheet}'s frames`);
    assert.ok(s.show.some((c) => c.card === 'board' && c.id === task), `${sc} shows ${task}`);
    assert.ok(s.exits.some((e) => e.needs?.task === task), `${sc}'s way on waits on ${task}`);
    assert.ok(!s.exits.some((e) => e.game?.kind === 'duel'), `${sc}: no card duel`);
    for (const [k, v] of Object.entries(r.levels[0].lines ?? {})) assert.ok(v.zh && v.en, `${level} line ${k}`);
    assert.ok(r.levels[0].ready.zh && r.levels[0].ready.en, level);
  }
  // the old kinds stay in the 游戏厅's 旧版, replaced
  for (const task of ['dabi-sneeze', 'jiejing-mirror', 'fengtou-pig']) assert.ok(REG.games.some((g) => g.task === task && g.replaced === 'fighter'), task);
});

test('pay and marks kept: the boards pay as the story\'s boards, 何七\'s marks hold by the grade (clumsy under half his 血)', () => {
  for (const [, task] of BOUTS) assert.equal(TASKS.find((x) => x.id === task).grant.table, 'task', task);
  const t = TASKS.find((x) => x.id === 'dabi-sneeze');
  assert.deepEqual(t.marks, { clean: 'sneeze-clean', clumsy: 'sneeze-clumsy' });
  const L = rowOf('dabi-sneeze').levels[0];
  let s = F.newGame('marks', 1, { levels: [L] });
  s = { ...s, foe: { ...s.foe, bal: 0 } }; // his 稳 gone: he walks off
  s = F.tick(s, 3000);
  assert.deepEqual([s.won, s.grade], [true, 'clean']);
  let c = F.newGame('marks', 1, { levels: [L] });
  c = { ...c, me: { ...c.me, hp: 30 }, foe: { ...c.foe, bal: 0 } };
  c = F.tick(c, 3000);
  assert.deepEqual([c.won, c.grade], [true, 'clumsy']);
  assert.equal(L.moves.fuwen.zh, '喷嚏符', 'the 符文 is the sneezing charm');
  assert.ok(L.lines.bind.zh.includes('嚏'));
});

test('each pair of one foe differs by its win: 秦雁\'s thirty moves stood, then the edge; 马小宝 winded, then six beams; the final stood, never won', () => {
  const L = (task) => rowOf(task).levels[0];
  assert.equal(L('dabi-shijie').outlast.moves, 30);
  assert.equal(L('yingjian-hook').outlast, undefined, '迎剑 over the slick');
  assert.equal(L('dabi-ma').stage.win, 'yield');
  assert.ok(L('jiejing-mirror').outlast.moves >= 5, 'five dodged, the sixth caught');
  assert.ok(L('fengtou-pig').outlast.moves >= 16);
  assert.doesNotMatch(L('fengtou-pig').won.clean.zh, /胜/, 'the final is lost in the book: no win line');
  assert.ok(L('fengtou-pig').foe.rules.armor < 1, '护体灵光');
  assert.ok(L('dabi-lu').stage.oil, 'the tallow on the rim');
});

test('马小宝\'s mirror: no guard stops the beam (「光是躲不掉的」) — ducked or jumped only; his blotches flush before it', () => {
  const L = rowOf('dabi-ma').levels[0];
  assert.equal(L.foe.rules.moves.ice.kind, 'beam');
  assert.equal(L.foe.rules.moves.ice.pierce, true);
  assert.ok(L.lines.foe_ice.zh.includes('斑'));
  let s = F.newGame('beam', 1, { levels: [L] });
  s.me.x = 300; s.foe.x = 700; s.foe.think = 0; s.foe.cd.ice = 0;
  s = F.act(s, { g: 'block', on: true }).state;
  for (let t = 0; t < 4000 && !s.shots.some((x) => x.kind === 'beam'); t += 10) s = F.tick(s, 10);
  assert.equal(s.line?.key, 'foe_ice', 'the tell');
  const hp = s.me.hp;
  for (let t = 0; t < 1000 && s.shots.some((x) => x.kind === 'beam'); t += 10) s = F.tick(s, 10);
  assert.ok(s.me.hp <= hp - L.foe.rules.moves.ice.dmg * 0.5, 'through the guard');
});

test('a foe pinned by a chain breaks out (`ai.burst`): mashing never holds him down for good', () => {
  const L = rowOf('dabi-ma').levels[0];
  let s = F.newGame('burst', 1, { levels: [L] });
  s.me.x = 400; s.foe.x = 470; s.foe.think = 1e9;
  for (let i = 0; i < 12 && !s.snd.block; i += 1) { s = F.act(s, { g: 'light' }).state; s = F.tick(s, 150); }
  assert.ok(s.combo.n < L.foe.rules.ai.burst, 'the chain broken before it ran on');
});

test('every bout: a human-like hand and a slower one win within three tries; a masher, a wall of blocks and an idle hand go down', () => {
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const [, task] of BOUTS) {
    const d = { levels: [rowOf(task).levels[0]] }, o = { tries: 3, deal: d, limit: 180000 };
    assert.ok(playModule(F, bot, o).won, `${task}: a human-like hand`);
    assert.ok(playModule(F, bot, { ...o, reaction: 320 }).won, `${task}: a 320 ms hand`);
    for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, o).won, `${task}: ${name} won`);
  }
});

/* Old saves (Hanli plays on his own): one standing in a 大比 round from before — the board never offered, a card duel left
   open, or the duel already won — goes on through the board, never shut in. */
test('an old save inside a 大比 round: the board is offered, an open card duel is let go, a duel already won hands the board in', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState, fitWorld } = await import('../scripts/state.mjs');
  const { look, resolve, task, win, playTo } = await import('../scripts/rules.mjs');
  const content = loadContent(), now = new Date(2026, 9, 31, 10), ctx = { now, quests: [] };
  process.env.LINGJING_STAMINA_LIMIT = '0';
  let base;
  try { base = playTo(content, newState(content, 'zh', now), 'wm-fushi', { now }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  base.stamina = 100; base.stamina_at = now.toISOString();
  const { ['dabi-lu']: _, ...tasks } = base.tasks;
  // a card duel open when the save was set down
  let s = fitWorld({ ...base, tasks, fight: { game: 'dabi-lu', creature: 'foe-lufang', at: now.toISOString() }, duels: { ...base.duels, 'foe-lufang': { day: '2026-10-31', outcome: 'open' } } }, content);
  assert.equal(s.fight, undefined, 'the open duel let go');
  assert.equal(s.duels['foe-lufang'], undefined);
  assert.equal(s.tasks['dabi-lu']?.status, 'offered', 'the board offered');
  assert.equal(look(s, content, ctx).tasks.find((t) => t.id === 'dabi-lu')?.deal?.levels?.[0]?.id, 'fushi-lufang');
  const w = win(s, content, ctx, { id: 'dabi-lu', stars: 3 });
  const d = task(w.state, content, ctx, { action: 'done', id: 'dabi-lu' });
  assert.ok(d.result.ok, JSON.stringify(d.result));
  assert.equal(resolve(d.state, content, ctx, { exit: 'flip' }).state.scene, 'wm-shuigang');
  // the duel already won before the change: the board stands won, handed in at once
  const old = fitWorld({ ...base, tasks, wins: { ...base.wins, 'dabi-lu': now.toISOString() } }, content);
  const h = task(old, content, ctx, { action: 'done', id: 'dabi-lu' });
  assert.ok(h.result.ok, JSON.stringify(h.result));
});
