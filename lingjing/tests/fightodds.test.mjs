// 难度 on a beast's card (scripts/fightodds.js; Hanli 2026-10-27: 「后山是设计的打怪的场所吗? 似乎有点难」):
// the door's setup played out over a few fixed deals by the bands' careful line — never a guess. Held here
// to the band's own measure (tools/story-fights.mjs rateOf, many more deals): the chip is never more than one
// grade off, and it moves the right way when he grows stronger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fightOdds, gradeOf, GRADES, GRADE_WORDS, oddsKey } from '../scripts/fightodds.js';
import { content, FIGHTS, foeOf, NOW, rateOf, stateAt } from '../tools/story-fights.mjs';
import { fightSetup } from '../scripts/rules.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const rank = g => GRADES.findIndex(([id]) => id === g);

test('the grades: 易 at three in four, 相当 at half, 稍难 at three in ten, else 难 — named in both languages', () => {
  assert.equal(gradeOf(0.8), 'easy');
  assert.equal(gradeOf(0.5), 'fair');
  assert.equal(gradeOf(0.35), 'hardish');
  assert.equal(gradeOf(0.1), 'hard');
  for (const [id] of GRADES) assert.ok(GRADE_WORDS.zh[id] && GRADE_WORDS.en[id], id);
});

test('the gate\'s 后山 beasts: the chip is within one grade of the band\'s own rate', () => {
  for (const f of FIGHTS.filter(x => x.pool === 'yaoyuan-wai' && x.at === 'h05g')) {
    const setup = fightSetup(content, stateAt('h05g'), foeOf(f), NOW, `haunt:${f.id}`);
    const chip = fightOdds(setup, catalog), band = rateOf(f, 40, 0, 'lookahead');
    assert.ok(Math.abs(rank(chip.grade) - rank(gradeOf(band.win))) <= 1, `${f.id}: chip ${chip.grade} (${chip.win}) vs band ${band.win}`);
  }
});

test('stronger, the chip says easier: the 狼 bare, then with the 外门库房\'s two cards', () => {
  const f = FIGHTS.find(x => x.id === 'lang' && x.pool === 'yaoyuan-wai');
  const bare = stateAt('h05g'), bought = { ...stateAt('h05g') };
  bare.wear = {};
  bought.cards = [...bought.cards, 'caoren', 'sanhuo'];
  const a = fightOdds(fightSetup(content, bare, foeOf(f), NOW, 'haunt:lang'), catalog);
  const b = fightOdds(fightSetup(content, bought, foeOf(f), NOW, 'haunt:lang'), catalog);
  assert.ok(b.win > a.win, `${a.win} → ${b.win}`);
  // Kept by what decides the fight, not by the deal.
  const s = fightSetup(content, bare, foeOf(f), NOW, 'haunt:lang');
  assert.equal(oddsKey(s), oddsKey({ ...s, seed: 'another' }));
});
