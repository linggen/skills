// The health check (rules/health.mjs) and Ling's Unstick (rules/unstick.mjs): the problems
// a save can be stuck in, each found; only the safe repairs applied, after the one AskUser,
// nothing paid, the scene never skipped, and Undo takes it back (Hanli, 2026-10-15:
// 「最好游戏的问题能让ling解决, 用户就不会卡住了」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { health } from '../scripts/rules/health.mjs';
import { plan, unstick } from '../scripts/rules/unstick.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const ids = (ps, level = 'error') => ps.filter(p => p.level === level).map(p => p.id);
const fresh = () => newState(content, 'zh', NOW);

test('a fight open against a beast he has tamed is found and closed — nobody won, nothing paid', () => {
  const s = { ...fresh(), cast: ['zheng'], fight: { game: 'yaoyuan-zheng', creature: 'zheng', at: NOW.toISOString() }, duels: { zheng: { day: '2026-09-29', outcome: 'open' } } };
  assert.ok(ids(health(content, s, NOW)).includes('fight-tamed'));
  const r = unstick(s, content, { now: NOW });
  assert.equal(r.result.ok, true);
  assert.ok(r.result.fixed.some(f => f.kind === 'close-fight'));
  assert.equal(r.state.fight, undefined);
  assert.equal(r.state.duels.zheng.outcome, 'withdrew');
  assert.equal(r.state.progress, s.progress);
  assert.equal(r.state.wealth, s.wealth);
});

test('a scene\'s fight against a beast already tamed: offered as a problem, passed with no drop', () => {
  const at = walk(fresh(), TO_OPEN, content, NOW);
  // 狰 at 药园 (wm-yaoyuan) with 小狰 already at his feet.
  const sc = content.chapters['00-waimen'].scenes['wm-yaoyuan'];
  const duel = sc.exits.find(e => e.game?.kind === 'duel');
  const s = { ...at, chapter: '00-waimen', scene: 'wm-yaoyuan', place: sc.at, cast: [...at.cast, duel.game.creature] };
  const ps = health(content, s, NOW);
  const p = ps.find(x => x.id === 'tamed-offered');
  assert.ok(p, JSON.stringify(ps));
  assert.deepEqual(p.repair, { kind: 'pass-fight', game: duel.game.id });
  const r = unstick(s, content, { now: NOW });
  assert.ok(r.state.wins[duel.game.id]);
  assert.deepEqual(r.state.cards, s.cards, 'no card dealt');
  assert.equal(r.state.scene, 'wm-yaoyuan', 'the scene is not skipped: its way on is still his to take');
});

test('at a scene but somewhere with no road to its place: moved there, nothing else', () => {
  const at = walk(fresh(), TO_OPEN, content, NOW);
  const sc = content.chapters[at.chapter].scenes[at.scene];
  // 漳南 is on another province's map: no road from it to 外门 while 卷一 holds him.
  const s = { ...at, place: 'zhangnan' };
  const p = health(content, s, NOW).find(x => x.id === 'wrong-place');
  assert.deepEqual(p?.repair, { kind: 'move', place: sc.at });
  const r = unstick(s, content, { now: NOW });
  assert.equal(r.state.place, sc.at);
  assert.equal(r.state.scene, s.scene);
  assert.equal(r.state.progress, s.progress);
});

test('an owed passage the book no longer has is let go', () => {
  const s = { ...fresh(), tell_owed: ['gone-scene/gone-exit'] };
  const p = health(content, s, NOW).find(x => x.id === 'owed-missing');
  assert.deepEqual(p.repair, { kind: 'drop-owed', key: 'gone-scene/gone-exit' });
  assert.ok(!unstick(s, content, { now: NOW }).state.tell_owed.includes('gone-scene/gone-exit'));
});

test('a skip pays nothing: no 修为, no 灵石, no grade, no mark — and the board is done', () => {
  const s = fresh();
  const { repairs } = plan(content, s, NOW);
  assert.equal(repairs[0].repair.kind, 'skip-board');
  const r = unstick(s, content, { now: NOW });
  assert.equal(r.state.tasks['rain-basins'].status, 'done');
  assert.equal(r.state.tasks['rain-basins'].skipped, true);
  assert.equal(r.state.progress, s.progress);
  assert.equal(r.state.wealth, s.wealth);
  assert.equal(r.state.grades?.['rain-basins'], undefined);
  assert.deepEqual(r.state.marks ?? [], s.marks ?? []);
  assert.equal(r.state.scene, s.scene);
});

test('nothing to mend: nothing changes, nothing asked', () => {
  const s = { ...fresh(), tasks: Object.fromEntries(Object.keys(fresh().tasks).map(id => [id, { status: 'done' }])) };
  const r = unstick(s, content, { now: NOW });
  assert.equal(r.state, null);
  assert.deepEqual(r.result.fixed, []);
});

/* ── Through the command line, as Ling calls it ── */
function game() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-unstick-'));
  const cli = (...args) => {
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: '2026-09-11T12:00:00', LINGGEN_SESSION_ID: 's1', LINGGEN_LANGUAGE: 'zh-Hans' };
    return JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  cli('init');
  return { data, cli, state };
}

test('Ling\'s Unstick asks first, in the world\'s words; its first option tapped, it mends; 悔棋 takes it back', () => {
  const g = game();
  const asked = g.cli('unstick', '--for=ling');
  assert.equal(asked.refused, 'not-confirmed');
  assert.equal(asked.ask.question, '这一关先放下，往下走？不得好处，也不失什么。');
  assert.deepEqual(asked.ask.options.map(o => o.label), ['就这么办', '再想想']);
  assert.equal(asked.ask.options[0].unstick, true);
  assert.match(asked.then, /Call Unstick only if "就这么办"/);
  assert.equal(g.state().tasks['rain-basins'].status, 'offered', 'asking changed nothing');
  assert.match(g.cli('look', '--said=就这么办', '--for=ling').then, /call Unstick now/);
  const r = g.cli('unstick', '--for=ling');
  assert.equal(r.ok, true);
  assert.deepEqual(r.fixed.map(f => f.kind), ['skip-board']);
  assert.equal(r.fixed[0].board, 'rain-basins');
  assert.equal(g.state().tasks['rain-basins'].status, 'done');
  assert.equal(g.state().confirm, undefined, 'the asking is used up');
  assert.equal(g.cli('undo').ok, true);
  assert.equal(g.state().tasks['rain-basins'].status, 'offered');
});

test('「卡住了」 to Look carries the one question; 再想想 lets it be', () => {
  const g = game();
  const asked = g.cli('look', '--said=这关我卡住了', '--for=ling');
  assert.equal(asked.ask.options[0].unstick, true);
  assert.equal(g.state().confirm.what, 'unstick');
  g.cli('look', '--said=再想想', '--for=ling');
  assert.equal(g.state().confirm, undefined);
  assert.equal(g.state().tasks['rain-basins'].status, 'offered');
});

test('Unstick is never held by a fight: a fight against a tamed beast is what it closes', () => {
  const g = game();
  const s = g.state();
  fs.writeFileSync(path.join(g.data, 'state.json'), JSON.stringify({ ...s, cast: ['zheng'], fight: { game: 'yaoyuan-zheng', creature: 'zheng', at: '2026-09-11T15:00:00.000Z' } }));
  const asked = g.cli('unstick', '--for=ling');
  assert.match(asked.ask.question, /这一架就此作罢/);
  g.cli('look', '--said=就这么办', '--for=ling');
  const r = g.cli('unstick', '--for=ling');
  assert.ok(r.fixed.some(f => f.kind === 'close-fight'));
  assert.equal(g.state().fight, undefined);
});
