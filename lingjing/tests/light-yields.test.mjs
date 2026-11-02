// 本王考考你 is light (rules/kao.mjs): it stands only on an empty stage — and yields to any other game standing here, so
// an open 对对子 round is never hidden behind it (11-02, found by the 对对子 run; Hanli: one place for one thing, and a round
// he started stays in reach). Chosen: the other game wins the slot; the light board waits in the tray.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageCards, stageSlots } from '../scripts/stage.mjs';

const kao = { id: 'benwang-kao', kind: 'board', light: true, status: 'offered' };
const base = { qian: { day: '2026-11-02' }, tasks: [kao] };

test('an empty stage: the light board stands', () => {
  assert.ok(stageCards(base).some((c) => c.card === 'board' && c.id === 'benwang-kao'));
});

test('an open 对对子 round: it wins the slot, the light board is not on the stage', () => {
  const look = { ...base, duizi: { open: true, round: { n: 1 } } };
  const cards = stageCards(look);
  assert.ok(cards.some((c) => c.card === 'duizi'));
  assert.ok(!cards.some((c) => c.card === 'board' && c.id === 'benwang-kao'));
  const main = stageSlots(look, cards).main ?? [];
  assert.ok(main.some((c) => c.card === 'duizi'), 'the round is what stands');
});
