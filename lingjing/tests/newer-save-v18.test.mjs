// The round trip of 2026-11-11, on the 2.0 line (Mac 2.0.x, iOS 2.0.x): a v18 save made by skills main's rules (a scratch save seeded at 古五 —
// tests/fixtures/saves/v18-main.json) given to these v17 rules. Before the guard they took it as their own: 闭关 paid
// 24 修为 where v18 pays 10 and the save went back still saying 18. Now every verb of that walk is refused and the file
// is left byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_VERSION } from '../scripts/state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAVE = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', 'v18-main.json'), 'utf8');

test('these rules are older than the save main writes', () => {
  assert.ok(JSON.parse(SAVE).version > STATE_VERSION, `${JSON.parse(SAVE).version} > ${STATE_VERSION}`);
});

test('the walk of 2026-11-11 on a real v18 save: every verb refused, the save byte for byte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-v18-'));
  fs.writeFileSync(path.join(dir, 'state.json'), SAVE);
  const walk = [
    ['look', '--said=看看'], ['seclude', '--action=enter', '--focus=progress'], ['seclude', '--action=leave'],
    ['win', '--id=mijing-laonian'], ['resolve', '--exit=pay'], ['look', '--said=看看', '--for=ling'], ['progress', '--for=yinyue'],
  ];
  const at = ['2026-11-11T22:05:00Z', '2026-11-11T22:05:00Z', '2026-11-12T02:05:00Z', '2026-11-12T02:05:00Z', '2026-11-12T02:05:00Z', '2026-11-12T02:10:00Z', '2026-11-12T02:10:00Z'];
  walk.forEach((args, i) => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'rules.mjs'), ...args], {
      env: { ...process.env, LINGJING_DATA: dir, LINGJING_QUESTS: path.join(dir, 'q'), LINGJING_NOW: at[i], LINGJING_SAVE: '', LINGJING_CLOUD: '0' },
      encoding: 'utf8',
    });
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.equal(r.refused, 'newer-save', args.join(' '));
    assert.equal(r.save_version, 18);
    assert.equal(r.rules_version, STATE_VERSION);
  });
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), SAVE);
  assert.deepEqual(fs.readdirSync(dir), ['state.json'], 'no log, no lock, no parked save left behind');
});
