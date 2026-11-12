// 修为 never past the cap; what would go over is 灵石 (Hanli, 2026-11-12: 「修为不要超过上限, 超过后换算为灵石奖励」 — he saw
// 修为 1413/1216 after the daily 传音 on the phone). rules/cap.mjs landProgress is the one way onto the bar (barCap: the layer's
// need, or a share mark), overStones the rate (balance.json `convert`, playpay.mjs convertRate), settleCap the once-on-load
// conversion of a save that holds a bank or a bar past its need.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { VERBS, look, trade } from '../scripts/rules.mjs';
import { spawnSync } from 'node:child_process';
import { pay, paysOf } from '../scripts/rules/core.mjs';
import { barCap, overStones, settleCap, settleHeld, underCap } from '../scripts/rules/cap.mjs';
import { convertRate, incomeAt, rateOfLevel } from '../scripts/rules/playpay.mjs';
import { linePay } from '../scripts/rules/lines.mjs';
import { SHARE } from '../scripts/quest.mjs';
import { TO_WAIMEN, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-11-10T12:00:00');
const ctx = { now: NOW, quests: [] };
/* 外门, 练气一层, its stage quest (一层圆满) ahead: the next step held. */
const held = (progress) => ({ ...walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW), step: 1, progress, wealth: 100 });
const need = s => threshold(content, s);
const rate = s => convertRate(content, s);

test('the save stands where the next step is held (the fixture the rest reads)', () => {
  const s = held(0);
  assert.equal(underCap(content, s, s.tier, 2), false, '二层 shut behind 一层\'s stage quest');
  assert.equal(barCap(content, s), need(s), 'the cap is the layer\'s need — the bar\'s right-hand number');
});

test('the rate comes off the curve: share × I(L) ÷ (R(L) × board) — the same at every level (R and I share their shape)', () => {
  const B = content.balance, share = B.convert.share, board = B.play_pay.xiuwei.board;
  for (const L of [1, 5, 9, 10]) {
    const want = (share * incomeAt(content, L)) / (rateOfLevel(content, L) * board);
    assert.ok(Math.abs(want - 0.25) < 1e-9, `L${L}: ${want}`);
  }
  assert.equal(B.convert.tables, undefined, 'no table list: every source converts');
  assert.equal(overStones(content, held(0), 1), 1, 'never 0 灵石 for a non-zero excess');
  assert.equal(overStones(content, held(0), 0), 0);
  assert.equal(overStones(content, held(0), 10), Math.round(10 * rate(held(0))));
});

test('a reward that fits lands whole as 修为, nothing converted', () => {
  const s = held(0), w0 = s.wealth;
  const paid = pay(content, s, ctx, { table: 'seclusion', progress: 50 });
  assert.deepEqual([paid.progress, paid.converted, s.progress, s.wealth], [50, undefined, 50, w0]);
});

test('a reward that crosses the cap: the part that fits as 修为, the rest 灵石 at the rate, rounded (at least 1)', () => {
  const s = held(0);
  s.progress = need(s) - 30;
  const w0 = s.wealth;
  const paid = pay(content, s, ctx, { table: 'seclusion', progress: 127 });
  assert.equal(s.progress, need(s), 'full, never past');
  assert.equal(paid.progress, 30, 'what fit');
  assert.deepEqual(paid.converted, { progress: 97, wealth: Math.round(97 * rate(s)), say: content.ladder.caps.convert.zh });
  assert.equal(s.wealth - w0, paid.wealth, 'paid.wealth carries the converted 灵石');
  assert.equal(s.day.progress, 30, 'the day counts what landed');
  // One 修为 over: one 灵石, never 0.
  const t = held(0); t.progress = need(t) - 1;
  assert.equal(pay(content, t, ctx, { table: 'seclusion', progress: 2 }).converted.wealth, 1);
});

test('a reward at an already-full bar: all 灵石', () => {
  const s = held(0); s.progress = need(s);
  const paid = pay(content, s, ctx, { table: 'seclusion', progress: 80 });
  assert.deepEqual([paid.progress, paid.converted.progress, paid.converted.wealth, s.progress], [0, 80, 20, need(s)]);
  // The preview says the same (paysOf: what fits, the 灵石, `full`).
  assert.deepEqual(paysOf(content, s, NOW, { table: 'seclusion', progress: 80 }), { progress: 0, wealth: 20, full: true });
});

test('every 修为 source goes through the cap: each pay table, at a full bar, lands nothing past it', () => {
  const tables = Object.keys(content.rewards.tables).filter(t => !t.startsWith('_'));
  assert.ok(tables.length > 15, tables.join(' '));
  for (const table of tables) {
    const s = held(0); s.progress = need(s);
    const paid = pay(content, s, ctx, { table, units: 10 });
    assert.equal(s.progress, need(s), `${table}: never past the need`);
    assert.equal(paid.progress, 0, `${table}: nothing landed past it`);
    assert.equal(s.banked, undefined, `${table}: nothing banked`);
    if (paid.converted) assert.ok(paid.converted.wealth >= 1 && paid.wealth >= paid.converted.wealth, `${table}: the rest as 灵石`);
  }
});

test('the reported case: the daily 传音 at a near-full bar — what fits as 修为, the rest as 灵石, the answer says both', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-capw-'));
  const was = process.env.LINGJING_QUESTS;
  process.env.LINGJING_QUESTS = dir;
  try {
    const s = held(0); s.progress = need(s) - 10;
    const r = VERBS.quest(s, content, ctx, { action: 'share' });
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    assert.equal(r.result.turned, SHARE);
    assert.equal(r.state.progress, need(r.state), 'full, never past (was 1413/1216)');
    assert.equal(r.result.paid.progress, 10);
    assert.ok(r.result.paid.converted.progress > 0 && r.result.paid.converted.wealth >= 1);
    assert.equal(r.state.wealth - s.wealth, r.result.paid.wealth);
  } finally {
    if (was === undefined) delete process.env.LINGJING_QUESTS; else process.env.LINGJING_QUESTS = was;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a pill that lands part of its 修为 goes down (the rest 灵石, as its card says); one that would land none stays in the bag', () => {
  const pill = content.items.items.find(i => i.effect?.units > 0 && !i.effect.level && !i.zhuan) ?? content.items.items.find(i => i.effect?.units > 0);
  const s = held(0); s.bag = { [pill.id]: 2 }; s.progress = need(s) - 1;
  const r = trade(s, content, ctx, { action: 'use', id: pill.id });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual([r.state.progress, r.result.paid.progress, r.result.paid.converted.progress > 0], [need(r.state), 1, true]);
  const full = trade(r.state, content, ctx, { action: 'use', id: pill.id });
  assert.equal(full.result.refused, 'xw-full', 'kept: nothing would land');
});

test('another line\'s bar (今) stops at its top too; the rest is the save\'s 灵石', () => {
  const s = held(0), L = 'jin', top = content.ladder.lines[L].tiers.at(-1);
  s.lines = { [L]: { tier: top.id, step: top.thresholds.length - 1, progress: top.thresholds.at(-1) - 5 } };
  const w0 = s.wealth;
  const got = linePay(content, s, L, { progress: 40 });
  assert.equal(s.lines[L].progress, top.thresholds.at(-1));
  assert.deepEqual([got.progress, got.converted.progress, s.wealth - w0], [5, 35, got.converted.wealth]);
});

test('a save past its cap (a bank, or a bar past its need) is settled once on load: kept up to the cap, the rest 灵石 — idempotent', () => {
  const s = held(0); s.progress = need(s) + 88; s.banked = 27;
  const once = settleCap(content, s);
  assert.deepEqual([once.progress, once.banked, once.wealth - s.wealth], [need(s), undefined, Math.round(115 * rate(s))]);
  assert.equal(settleCap(content, once), once, 'twice: nothing more');
  assert.equal(settleHeld(content, once), once);
  const fine = held(40);
  assert.equal(settleCap(content, fine), fine, 'a save within its cap comes back as it was');
});

test('Look never shows the bar past the cap — the door settles the save as it loads (a scratch save)', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-capl-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString(), LINGJING_CLOUD: '0' };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  try {
    const s = held(0); s.progress = need(s) + 197; s.banked = 30;
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(s));
    const l = cli('look');
    assert.ok(l.progress <= l.next, `${l.progress}/${l.next}`);
    assert.equal(l.wealth, s.wealth + Math.round(227 * rate(s)), 'the rest paid as 灵石');
    assert.equal(cli('look').wealth, l.wealth, 'once: a second Look pays nothing more');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('Look on a settled save: progress never above next', () => {
  const s = settleCap(content, { ...held(0), progress: 5000 });
  const l = look(s, content, ctx);
  assert.equal(l.progress, l.next);
});
