// A beast played by a line (斗法 v4): battle.js plays it by itself — the page and the rules that replay its fight read the same
// beast whichever modules they loaded — and it shows no plan it would not keep (意图).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paperTable, parTen, sheetSetup } from '../tools/duel-audit.mjs';
import { begin, act, foeStep } from '../scripts/battle.js';
import { carefulFor } from '../scripts/fightline.js';
import { content } from '../tools/story-fights.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const opened = (ai, seed) => {
  const ten = parTen(paperTable()), setup = sheetSetup(ten, ten, seed);
  setup.foe.ai = ai;
  const st = begin(setup, catalog);
  if (st.whose === 'you') act(st, { kind: 'end' }, 'you');
  return st;
};

test('a careful beast plays carefulFor and shows no intent', () => {
  for (let i = 0; i < 4; i++) {
    const st = opened('careful', `seat|${i}`), want = carefulFor(st, 'foe') ?? { kind: 'end' };
    assert.equal(st.foe.intent, null);
    assert.deepEqual(foeStep(st), want);
  }
});

test('battle.js alone (no fightline.js imported first) plays the same line', () => {
  const battle = fileURLToPath(new URL('../scripts/battle.js', import.meta.url));
  const tools = fileURLToPath(new URL('../tools/duel-audit.mjs', import.meta.url));
  const code = `const b = await import(${JSON.stringify(battle)}); const a = await import(${JSON.stringify(tools)});
    const ten = a.parTen(a.paperTable()), s = a.sheetSetup(ten, ten, 'seat|0'); s.foe.ai = 'careful';
    const cat = Object.fromEntries(a.paperTable().length ? (await import(${JSON.stringify(fileURLToPath(new URL('../tools/story-fights.mjs', import.meta.url)))})).content.cards.cards.map(c => [c.id, c]) : []);
    const st = b.begin(s, cat); if (st.whose === 'you') b.act(st, { kind: 'end' }, 'you'); console.log(JSON.stringify(b.foeStep(st)));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).trim().split('\n').at(-1));
  const st = opened('careful', 'seat|0');
  assert.deepEqual(out, JSON.parse(JSON.stringify(carefulFor(st, 'foe') ?? { kind: 'end' })));
});

test('a beast with no line keeps its plan as before', () => {
  const st = opened(null, 'seat|1');
  act(st, { kind: 'end' }, 'foe');
  assert.ok(st.foe.intent, 'the foe policy plans at the start of his turn');
});
