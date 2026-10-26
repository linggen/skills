// tests/device-lines.test.mjs — a game line that names a key, a mouse button or a click has a desk face and a touch
// face (scripts/games/kit/device.js); the phone's host page reads the touch face. 10-26: 「空格亦可」 on the phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forInput, howFor, inputKind } from '../scripts/games/kit/device.js';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a pair answers its face; a plain line is the same everywhere; the host has the last word', () => {
  assert.equal(forInput({ desk: 'a（空格亦可）', touch: 'a' }, 'touch'), 'a');
  assert.equal(forInput({ desk: 'a（空格亦可）', touch: 'a' }, 'desk'), 'a（空格亦可）');
  assert.equal(forInput('same', 'touch'), 'same');
  assert.equal(howFor({ zh: { desk: 'd', touch: 't' }, en: 'e' }, 'zh', 'touch'), 't');
  assert.equal(howFor({ zh: { desk: 'd', touch: 't' }, en: 'e' }, 'en', 'touch'), 'e');
  assert.equal(inputKind({ documentElement: { dataset: { input: 'touch' } } }), 'touch');
  assert.equal(inputKind({ documentElement: { dataset: {} } }), 'desk'); // node: no matchMedia
  assert.match(fs.readFileSync(path.join(SKILL, 'scripts/games/phone/host.js'), 'utf8'), /dataset\.input = 'touch'/);
});

// The words a touch face must never say: a key, a mouse button, the keyboard.
const DESK_ONLY = /空格亦可|右键|左键|鼠标|键盘|WASD|方向键|QWER|按 ?1|\bSpace\b|right-click|mouse|keyboard|arrow keys|press 1|\bEsc\b/;

test('every game line that names a key or a mouse button is a pair, and its touch face names none', async () => {
  const dir = path.join(SKILL, 'scripts/games');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    // Player-facing string literals only (comments and code are not read).
    const code = text.replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const l = m[1];
      if (!DESK_ONLY.test(l) || !/[\u4e00-\u9fff]|\w+ \w+ \w+/.test(l)) continue; // a sentence, not a key code
      assert.match(code.slice(Math.max(0, m.index - 12), m.index), /desk:\s*$/, `${f}: 「${l.slice(0, 40)}」 names a key or the mouse outside a desk face`);
    }
  }
});
