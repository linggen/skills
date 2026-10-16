// A passage on the stage holds Ling's hands too (Hanli, 2026-10-16: 「把其他都lock, 玩家读完或跳过才能继续」):
// the page says when a passage holds (`reading --hold=1|0`); meanwhile Ling's Look says `reading`
// and her world-changing calls are refused `reading`; ended, the page hears `held` and reports
// `[scene] read` so she does what he asked. A scripted turn through the real command.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pageReading, readingHold, readingNow, READING_TTL_MS } from '../scripts/rules/reading.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = new Date('2026-10-16T10:00:00+08:00');

test('the hold: begun, renewed, lapsed, ended — and only her world-changing calls', () => {
  const on = pageReading({}, { hold: '1' }, NOW).keep;
  assert.ok(readingNow(on, NOW));
  assert.equal(readingNow(on, new Date(NOW.getTime() + READING_TTL_MS + 1)), false, 'a hold nobody ended lapses');
  const r = readingHold(on, 'resolve', { exit: 'x' }, NOW);
  assert.equal(r.result.refused, 'reading');
  assert.match(r.result.then, /words only/);
  assert.equal(r.keep.reading.held, true, 'noted');
  for (const [v, a] of [['move', {}], ['go', {}], ['task', { action: 'take' }], ['trade', {}], ['tame', {}]]) assert.ok(readingHold(on, v, a, NOW), v);
  for (const [v, a] of [['look', {}], ['task', { action: 'list' }], ['undo', {}], ['unstick', {}], ['story', {}]]) assert.equal(readingHold(on, v, a, NOW), null, v);
  assert.equal(readingHold({}, 'resolve', {}, NOW), null, 'no passage: nothing held');
  const renewed = pageReading(r.keep, { hold: '1' }, NOW).keep;
  assert.equal(renewed.reading.held, true, 'renewing keeps what was held');
  const end = pageReading(renewed, { hold: '0' }, NOW);
  assert.deepEqual(end.result, { ok: true, hold: false, held: true });
  assert.equal(end.keep.reading, undefined);
  assert.deepEqual(pageReading({}, { hold: '0' }, NOW), { keep: null, result: { ok: true, hold: false, held: false } }, 'nothing to end: nothing written');
});

test('a scripted turn: Ling held while the passage plays, free once it ends', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-readhold-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'q'), LINGJING_NOW: NOW.toISOString() };
  delete env.LINGJING_SAVE;
  const cli = (...args) => {
    const p = spawnSync(process.execPath, ['scripts/rules.mjs', ...args, '--save=rh'], { cwd: ROOT, env, encoding: 'utf8' });
    return JSON.parse(p.stdout.trim().split('\n').pop());
  };
  try {
    assert.equal(cli('seed', '--at=古三').scene, '00-gate');
    const exit = cli('look').scene.panel.taps.find((t) => t.kind !== 'look')?.id ?? 'steady';
    assert.equal(cli('reading', '--hold=1').hold, true);
    const lk = cli('look', '--for=ling');
    assert.equal(lk.reading, 'playing');
    assert.match(lk.then, /The stage is still playing a passage[^]*change nothing/);
    assert.equal(cli('look').reading, undefined, 'the page\'s own Look carries nothing of it');
    const held = cli('resolve', `--exit=${exit}`, '--for=ling');
    assert.equal(held.refused, 'reading');
    assert.equal(cli('look').scene.id, '00-gate', 'nothing moved');
    assert.deepEqual(cli('reading', '--hold=0'), { ok: true, hold: false, held: true }, 'the page reports [scene] read');
    assert.equal(cli('look', '--for=ling').reading, undefined);
    const free = cli('resolve', `--exit=${exit}`, '--for=ling');
    assert.notEqual(free.refused, 'reading', JSON.stringify(free).slice(0, 300));
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
