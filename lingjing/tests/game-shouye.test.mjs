// 守夜 — the herb thief is caught within three nights, whatever the player picks;
// a miss teaches its two rules; a deduction on the second night is a sure thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, allowed, html, meta, newGame, SPOTS, wayOf } from '../scripts/games/shouye.js';

/* Every sequence of picks, three nights deep. */
function* picks(depth) {
  if (!depth) { yield []; return; }
  for (const s of SPOTS) for (const rest of picks(depth - 1)) yield [s, ...rest];
}

test('the meta names it in both languages', () => {
  assert.equal(meta.id, 'shouye');
  assert.ok(meta.name.zh && meta.name.en && meta.how.zh && meta.how.en);
});

test('caught within three nights for every seed and every sequence of picks — nothing is lost by missing', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    for (const seq of picks(3)) {
      let g = newGame(`s${seed}`), won = false, n = 0;
      for (const spot of seq) {
        n += 1;
        const r = act(g, { g: 'wait', spot });
        g = r.state;
        if (r.won) { won = true; break; }
      }
      assert.ok(won, `seed ${seed}: ${seq.join(',')}`);
      assert.ok(n <= 3);
    }
  }
});

test('a miss teaches: it never comes where you waited, nor the way it came — the second night is two ways, and one is sure', () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const g = newGame(`k${seed}`), way = wayOf(g);
    const miss = SPOTS.find(s => s !== way);
    const r = act(g, { g: 'wait', spot: miss });
    assert.equal(r.won, false);
    assert.deepEqual(r.state.watched, [miss]);
    assert.deepEqual(r.state.used, [way]);
    const open = allowed(r.state);
    assert.equal(open.length, 2, 'two ways left for tomorrow');
    assert.ok(!open.includes(miss) && !open.includes(way));
    // The night's way is fixed before the pick: waiting there catches it.
    assert.equal(act(r.state, { g: 'wait', spot: wayOf(r.state) }).won, true);
  }
});

test('the board says what happened in the player\'s language — the sign it cannot read, 它在进步', () => {
  let g = newGame('x');
  const way = wayOf(g), miss = SPOTS.find(s => s !== way);
  g = act(g, { g: 'wait', spot: miss }).state;
  const zh = html(g, 'zh'), en = html(g, 'en');
  assert.ok(zh.includes('它在进步') && zh.includes('偷者必究'));
  assert.ok(en.includes('It is improving') && en.includes('Thieves will be pursued'));
  assert.ok(zh.includes('data-g="wait"'));
  // Nonsense and a finished night change nothing.
  assert.equal(act(g, { g: 'wait', spot: 'moon' }).state, g);
  assert.equal(act(g, { g: 'jump' }).state, g);
});
