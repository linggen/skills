// The story's last person fights as 格斗 (Hanli 10-28: 「故事里的战斗可以用格斗」; 2026-10-31, the calls delegated): 邹青松 in 古五's
// 秘境 (a chase outlasted: his shield breaks for nothing short of 结丹), 九层师兄 at 古八's 腊八 final (won: one blade, one breath),
// 老井 on 古九's 河滩 (outlasted: that layer of light won't break; the finger and the mirror's beam dodged). Each its own painted
// sheet (tools/fighter-frames.py), its own stage and moves from the book. Ids, pay and the exits' grants kept; the card duels gone
// from the scenes. Each bout is won by a human-like hand (and a slower one) within three tries; a masher, a wall of blocks and an
// idle hand go down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as F from '../scripts/games/fighter.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const REG = content.games;
const sceneOf = (id) => Object.values(content.chapters).map((c) => c.scenes[id]).find(Boolean);

/* scene · exit · task · level · the foe · his sheet · how it is won */
const BOUTS = [
  ['wm-xirang', 'swallow', 'mijing-zou', 'zou-chase', '邹青松', 'zouqingsong', 'outlast'],
  ['09-laba', 'dabi', 'dabi-final', 'laba-jiuceng', '九层师兄', 'jiuceng', 'yield'],
  ['01-laojing', 'dodge', 'laojing-trial', 'laojing-hetan', '老井', 'laojing', 'outlast'],
];
const rowOf = (task) => REG.games.find((g) => g.task === task && !g.replaced);

test('each is a 格斗 board with its own painted opponent: the scene shows it, the way on waits on it, no card duel left', () => {
  for (const [sc, exit, task, level, foe, sheet, win] of BOUTS) {
    const r = rowOf(task), t = content.tasks.tasks.find((x) => x.id === task), s = sceneOf(sc), L = r.levels[0];
    assert.deepEqual([r.id, r.mechanic, r.scene, L.id, r.data.level], ['fighter', '格斗', sc, level, level], task);
    assert.deepEqual([t.kind, t.game, t.grant.table], ['board', 'fighter', 'task'], task);
    assert.equal(L.foe.name.zh, foe);
    assert.equal(L.foe.look.sheet, `art/games/fighter/${sheet}`);
    const meta = JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/art/games/fighter/${sheet}.json`, import.meta.url), 'utf8'));
    assert.equal(Object.keys(meta.frames).length, 33, `${sheet}: 33 frames`);
    for (const c of Object.values(meta.clips)) for (const f of c.frames) assert.ok(meta.frames[f], `${sheet}: ${f}`);
    assert.ok(fs.statSync(new URL(`../worlds/jiuding/art/games/fighter/${sheet}.webp`, import.meta.url)).size > 1000);
    assert.ok(fs.existsSync(new URL(`../worlds/jiuding/${L.foe.face}`, import.meta.url)), `${foe}'s face`);
    assert.ok(s.show.some((c) => c.card === 'board' && c.id === task), `${sc} shows ${task}`);
    const e = s.exits.find((x) => x.id === exit);
    assert.deepEqual([e.needs, e.game], [{ task }, undefined], `${sc}/${exit}`);
    assert.ok(e.refuse.zh && e.refuse.en);
    if (win === 'outlast') assert.ok(L.outlast.moves >= 20, task); else assert.equal(L.stage.win, 'yield', task);
    for (const [k, v] of Object.entries(L.lines)) assert.ok(v.zh && v.en, `${level} line ${k}`);
    for (const k of ['ready', 'name']) assert.ok(L[k].zh && L[k].en, `${level} ${k}`);
    for (const k of ['clean', 'clumsy', 'skipped']) assert.ok(L.won[k].zh && L.won[k].en, `${level} won.${k}`);
    assert.deepEqual(t.how, r.how, `${task}: one how-line`);
  }
});

test('each feels like its own fight in the book: the fire snakes, the blade-and-breath, the finger and the mirror', () => {
  const L = (task) => rowOf(task).levels[0];
  const zou = L('mijing-zou').foe.rules, jc = L('dabi-final').foe.rules, lj = L('laojing-trial').foe.rules;
  // 邹青松: fire from the gourd no guard stops (四面火蛇), a shield that throws off spells (结丹以下，无人能破)
  assert.deepEqual([zou.moves.ice.kind, zou.moves.ice.pierce, zou.moves.jianqi.name.zh], ['fire', true, '四蛇合围']);
  assert.ok(zou.armor < 0.5);
  // 九层师兄: the metal blade low along the boards (jumped), and the long breath after it (发一道，喘一口)
  assert.deepEqual([jc.moves.ice.kind, jc.moves.ice.low], ['blade', true]);
  assert.ok(jc.moves.ice.recover > 1000, 'the breath');
  assert.equal(jc.moves.jianqi.name.zh, '第十一道');
  // 老井: the finger first (the glow runs to its tip: the tell), the mirror's beam no guard stops, that layer of light
  assert.match(L('laojing-trial').lines.foe_poke.zh, /指尖/);
  assert.deepEqual([lj.moves.ice.kind, lj.moves.ice.pierce], ['beam', true]);
  assert.ok(lj.armor < 0.5);
  // three stages: the 秘境's dark, the 演武场 in a north wind, the river under the moon
  const looks = ['mijing-zou', 'dabi-final', 'laojing-trial'].map((t) => JSON.stringify(L(t).stage.look));
  assert.equal(new Set(looks).size, 3);
});

test('邹青松\'s 储物袋 and the gourd\'s 火蛇 still come to hand: the exit grants what the duel\'s win dropped', () => {
  const zou = content.creatures.creatures.find((c) => c.id === 'foe-zou');
  const g = sceneOf('wm-xirang').exits.find((e) => e.id === 'swallow').grant;
  const drops = {};
  for (const d of zou.drops) drops[d] = (drops[d] ?? 0) + 1;
  for (const [id, n] of Object.entries(drops)) assert.equal(g.more[id], n, id);
  assert.equal(g.card, 'huoshe');
});

test('every bout: a human-like hand and a slower one win within three tries; a masher, a wall of blocks and an idle hand go down', () => {
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const [, , task] of BOUTS) {
    const o = { tries: 3, deal: { levels: [rowOf(task).levels[0]] }, limit: 180000 };
    assert.ok(playModule(F, bot, o).won, `${task}: a human-like hand`);
    assert.ok(playModule(F, bot, { ...o, reaction: 320 }).won, `${task}: a 320 ms hand`);
    for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, o).won, `${task}: ${name} won`);
  }
});
