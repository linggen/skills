// Look always answers, in 闭关 too (live 2026-11-02, scratch save dc4-1102 on 9527: while he sat in 闭关 both of Ling's Look
// calls with the player's words came back as an error — core.mjs setRiddleAside read `ask.options` where askOf is null in
// 闭关 — and she told the player 「the world isn't answering when I look」; after 出关 Look worked). In 闭关 Look says he is in
// it and the time left (`seclusion.left_min`), asks nothing and changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { THEN_SECLUSION } from '../scripts/rules/ask.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';

const content = loadContent();
const NOW = new Date('2026-11-02T21:00:00');
const ctx = (now = NOW, said = null) => ({ now, quests: [], said });
const SCENE = content.chapters['00-waimen'].scenes['wm-koujue'];
/* 古六 at its scene (as dc4-1102 stood: 00-waimen · wm-koujue, 练气四层), 体力 low. */
const atScene = () => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-koujue', place: SCENE.at, ended: ['00-prologue'],
  tier: 'qi', step: 4, progress: 300, traits: ['wood', 'water', 'fire', 'earth'], stamina: 10, stamina_at: NOW.toISOString() });
const secluded = () => VERBS.seclude(atScene(), content, ctx(), { action: 'enter', focus: 'progress' }).state;

test('in 闭关, Look with the player\'s words answers — no error — and says he is in it, with the time left', () => {
  const s = secluded();
  assert.ok(s.seclusion, 'in 闭关');
  for (const said of ['你好', '看看四周', null]) {
    const out = VERBS.look(s, content, ctx(NOW, said), said == null ? {} : { said });
    const r = out.result;
    assert.notEqual(r.ok, false, `said ${said}: ${JSON.stringify(r).slice(0, 200)}`);
    assert.equal(r.seclusion?.running, true);
    assert.ok(Number.isInteger(r.seclusion.left_min) && r.seclusion.left_min > 0, 'the minutes until 体力 is whole');
  }
  // An hour on, less left; whole, 0.
  const later = VERBS.look(s, content, ctx(new Date(NOW.getTime() + 3600_000)), {}).result.seclusion.left_min;
  assert.ok(later < VERBS.look(s, content, ctx(), {}).result.seclusion.left_min);
});

test('through the command line, as Ling calls it: Look answers in 闭关 with its own `then`, no question; after 出关 as ever', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-seclook-'));
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(secluded()));
  const cli = (...args) => {
    const r = spawnSync(process.execPath, ['scripts/rules.mjs', ...args, '--for=ling'], { cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, LINGJING_DATA: dir, LINGJING_QUESTS: path.join(dir, 'none'), LINGJING_NOW: new Date(NOW.getTime() + 600_000).toISOString() }, encoding: 'utf8' });
    return JSON.parse(r.stdout);
  };
  const r = cli('look', '--said=你好', '--at=');
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  assert.ok(r.then.includes(THEN_SECLUSION), r.then);
  assert.match(r.then, /闭关[\s\S]*left_min/);
  assert.equal(r.ask, null);
  assert.ok(r.seclusion?.left_min >= 0);
  cli('seclude', '--action=leave');
  const after = cli('look', '--said=你好', '--at=');
  assert.equal(after.ok, true);
  assert.equal(after.seclusion, undefined);
  assert.ok(!after.then.includes(THEN_SECLUSION));
});
