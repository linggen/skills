// A page left open across an install played its old battle.js while the rules replayed the new one:
// the win was refused 「这一战没记上」 over a blank stage (2026-10-15). The page's Look and duel answers
// carry the fight engine's stamp (rules/engine.mjs); a duel answer with a stamp other than the one the
// page loaded with reloads the page into the same fight, once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fightStamp } from '../scripts/rules/engine.mjs';
import { loadContent } from '../scripts/content.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('the stamp follows the card rows: tuned cards are another engine', () => {
  const content = loadContent();
  const a = fightStamp(content);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(fightStamp(content), a, 'the same content, the same stamp');
  const tuned = { ...content, cards: { ...content.cards, cards: content.cards.cards.map((c, i) => (i ? c : { ...c, atk: (c.atk ?? 0) + 1 })) } };
  assert.notEqual(fightStamp(tuned), a);
});

test('the page\'s Look and duel answers carry the stamp; Ling\'s do not', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-engine-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'q') };
  delete env.LINGJING_SAVE;
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout.trim().split('\n').pop());
  try {
    cli('seed', '--save=eng');
    const stamp = fightStamp(loadContent());
    assert.equal(cli('look', '--save=eng').engine, stamp);
    const d = cli('duel', '--save=eng', '--id=nope');
    assert.equal(d.ok, false);
    assert.equal(d.engine, stamp, 'a refusal carries it too — the settle that was refused is where the page looks');
    assert.equal(cli('look', '--save=eng', '--for=ling').engine, undefined);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the page reloads into the fight when the stamp moved — at the door and on a refused settle, once per stamp', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /if \(look\?\.engine && !engineAt\) engineAt = look\.engine;/);
  assert.match(src, /if \(engineMoved\(r\)\) return reloadForEngine\(r\);\n\s+const brief = r\.duel;/);
  assert.match(src, /if \(!r\.ok && engineMoved\(r\)\) return reloadForEngine\(r\);\n\s+if \(!r\.ok\) \{/);
  assert.match(src, /sessionStorage\.setItem\(ENGINE_KEY, r\.engine\)/);
});
