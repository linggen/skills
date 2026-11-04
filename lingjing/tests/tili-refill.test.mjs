// 体力 comes back only in 闭关 (Hanli 2026-11-02: 「体力不要自动回, 只有闭关才回. 或者体力卡」 · 「如果体力用完, 用户没有点闭关
// 就下线, 我们可以自动给用户闭关吗? 完成任务不奖励体力」 · 「给用户100体力, 1体力玩大约1分钟?」). No clock; a real 闭关
// fills the pool in refill.seclusion_hours, linear; time away (refill.away_min with no player verb) counts as 闭关 for
// 体力 alone, told once; 闭关 on a spent pool stands behind every gate; each act costs its minutes. State.mjs, rules.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, trayHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { lockedOf, newState, staminaCost } from '../scripts/state.mjs';
import { VERBS, look } from '../scripts/rules.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const Q = content.rewards.stamina;
const T0 = new Date('2026-11-02T15:00:00');
const at = m => new Date(T0.getTime() + m * 60_000);
const ROOT = path.resolve(import.meta.dirname, '..');

/* A 结丹 player in the open world, the pool half spent. */
const player = (extra = {}) => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', step: 0, progress: 100,
  chapter: '03-qing', scene: null, place: 'sishui', ended: ['00-prologue', '01-ji', '02-yan'],
  cards: ['qingteng', 'huodan', 'wulei', 'leiming'], bag: {}, stamina: 50, stamina_at: T0.toISOString(), updated: T0.toISOString(), ...extra,
});
/* The command line on a save on disk, at a given moment. */
function onDisk(state) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-tili-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(state));
  const cli = (now, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT,
    env: { ...process.env, LINGJING_STAMINA_LIMIT: '1', LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: now.toISOString() }, encoding: 'utf8' }).stdout);
  const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  return { cli, saved, done: () => fs.rmSync(data, { recursive: true, force: true }) };
}

test('the pool: 100, no rest lock (what comes back plays — Hanli 11-02: 「回多少就能玩多少」), no clock, no quest pays it — every number declared', () => {
  assert.deepEqual([Q.max, Q.rest, Q.per_minute], [100, 0, 1]);
  // 闭关 fills the pool in two hours (Hanli 2026-11-04: 「刚刚闭关12分钟, 体力加20, 这个调整一下吧」 · 「可以, 2小时回满」; was 1).
  assert.deepEqual(Q.refill, { clock_hours: null, seclusion_hours: 2, away_min: 10, quest: false });
});

test('1 体力 ≈ 1 分钟: each act costs the balance model\'s minutes — a fight 2, a board its own, a road 1, a scene\'s reading nothing', () => {
  const m = content.balance.model;
  assert.equal(staminaCost(content, 'duel'), m.minutes.fight);
  assert.equal(staminaCost(content, 'game'), content.balance.play_pay.minutes.default, 'a board with none named: the default (each board its own: tests/stamina-cost.test.mjs)');
  assert.equal(staminaCost(content, 'move', 1), 1, 'one road about 1');
  assert.equal(staminaCost(content, 'shop'), 0, 'the shop stays free');
  const sc = { story: '字'.repeat(m.chars_per_min * 3) };
  assert.equal(staminaCost(content, 'step', 1, sc, {}), 0, 'reading the story is free (Hanli 2026-11-04: 「剧情保持不扣」)');
  // A full pool is about a hundred minutes of the acts that spend it (an even mix of fights, boards, roads).
  const mix = ['duel', 'game', 'move'].map(k => ({ k, c: staminaCost(content, k) }));
  const minutes = { duel: m.minutes.fight, game: content.balance.play_pay.minutes.default, move: 1 };
  const perMinute = mix.reduce((n, x) => n + x.c, 0) / mix.reduce((n, x) => n + minutes[x.k], 0);
  assert.ok(Math.abs(Q.max / perMinute - 100) <= 10, `${Q.max / perMinute} minutes a pool`);
});

test('no clock refill over hours of active play: verbs five minutes apart for two hours bring nothing back', () => {
  const { cli, saved, done } = onDisk(player());
  try {
    for (let m = 0; m <= 120; m += 5) assert.equal(cli(at(m), 'look').stamina.now, 50, `minute ${m}`);
    assert.equal(saved().stamina, 50);
    assert.equal(saved().last_seen, at(120).toISOString(), 'every player call stamps last_seen');
  } finally { done(); }
});

test('away while partly spent: the gap counts as 闭关 for 体力, told once on the page\'s Look — never on another call\'s', () => {
  const { cli, saved, done } = onDisk(player());
  try {
    cli(T0, 'look');
    // Yinyue's read is not him: no stamp, no credit.
    cli(at(15), 'look', '--for=yinyue');
    assert.equal(saved().last_seen, T0.toISOString());
    const back = cli(at(20), 'look');
    const gained = Math.floor(20 * Q.max / (Q.refill.seclusion_hours * 60));
    assert.equal(back.stamina.now, 50 + gained);
    assert.deepEqual([back.away.minutes, back.away.gained], [20, gained]);
    assert.equal(cli(at(21), 'look').away, undefined, 'told once');
    assert.equal(saved().away, undefined);
    // Only 修为's 闭关 pays 修为: the progress is untouched.
    assert.equal(saved().progress, 100);
    // Long away: capped at the top.
    assert.equal(cli(at(300), 'look').stamina.now, Q.max);
  } finally { done(); }
});

test('spent and away for an hour: full again, and he plays', () => {
  const { cli, done } = onDisk(player({ stamina: 0, resting: true }));
  try {
    cli(T0, 'look');
    const half = cli(at(30 * Q.refill.seclusion_hours), 'look');
    assert.ok(half.stamina.now >= 45 && half.stamina.empty === false, 'half the fill away: half back, and it plays at once (no rest to full)');
    const back = cli(at(30 * Q.refill.seclusion_hours + 60 * Q.refill.seclusion_hours), 'look');
    assert.equal(back.stamina.now, Q.max);
    assert.equal(back.stamina.empty, false);
  } finally { done(); }
});

test('a real 闭关 on the command line: the pool rises while it runs and is full at two hours; the away rule never counts it twice', () => {
  const { cli, saved, done } = onDisk(player({ stamina: 0, resting: true }));
  try {
    assert.equal(cli(T0, 'seclude', '--action=enter', '--focus=progress').ok, true);
    const mid = cli(at(30), 'look');
    assert.equal(mid.stamina.now, Math.floor(30 * Q.max / (Q.refill.seclusion_hours * 60)), 'the chip reads it live');
    assert.ok(mid.seclusion.full_at);
    const out = cli(at(60 * Q.refill.seclusion_hours + 5), 'seclude', '--action=leave');
    assert.equal(out.emerged.rested, true);
    assert.equal(saved().stamina, Q.max);
    assert.equal(saved().resting, undefined);
    assert.equal(cli(at(60 * Q.refill.seclusion_hours + 30), 'look').away, undefined, 'no away credit on top of the 闭关');
  } finally { done(); }
});

test('an empty pool: 闭关 is one tap away — the tray\'s card says so, and behind a story gate it stands too', () => {
  const l = look(player({ stamina: 0, resting: true }), content, { now: T0, quests: [] });
  assert.equal(l.stamina.empty, true);
  assert.equal(l.stamina.refill, 'seclusion');
  assert.equal(l.stamina.fill_min, 60 * Q.refill.seclusion_hours);
  const tray = trayHtml({ look: l, lang: 'zh', words: WORDS.zh });
  assert.match(tray, /体力耗尽 · 闭关约 120 分钟回满/);
  assert.match(tray, /data-seclude-open/);
  // 马三's road (the prologue keeps 闭关 shut): spent there, 闭关 opens all the same, stands, and fills.
  const ctx = (now) => ({ now, quests: [] });
  const gated = { ...walk(newState(content, 'zh', T0), [...TO_VALLEY.slice(0, 2), ['played']], content, T0), stamina: 0, resting: true, stamina_at: T0.toISOString() };
  assert.ok(lockedOf(content, gated).includes('seclusion'));
  assert.equal(VERBS.seclude({ ...gated, stamina: 50, resting: false }, content, ctx(T0), { action: 'info' }).result.refused, 'not-yet', 'unspent, the gate holds');
  assert.equal(VERBS.seclude(gated, content, ctx(T0), { action: 'info' }).result.ok, true);
  const inn = VERBS.seclude(gated, content, ctx(T0), { action: 'enter', focus: 'progress' });
  assert.equal(inn.result.ok, true, JSON.stringify(inn.result));
  assert.equal(inn.state.seclusion.spent, true);
  assert.ok(look(inn.state, content, ctx(at(30))).seclusion, 'its card stands behind the gate');
  const out = VERBS.seclude(inn.state, content, ctx(at(60 * Q.refill.seclusion_hours)), { action: 'leave' });
  assert.equal(out.result.ok, true);
  assert.equal(out.state.stamina, Q.max);
});
