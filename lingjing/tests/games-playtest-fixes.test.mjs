// The 古一/古二 play-test's game fixes (2026-10-15 backlog, items 25 26 27 29 30 31):
// the carry's header at the end, the feather's pace read over a window (the climb's grip went with 攀,
// cut 10-16; the herb tiles, the village pins went with 石坳村's map, cut 10-16).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sneeze from '../scripts/games/sneeze.js';
import { STUCK_MS, stuckNow } from '../scripts/stuck.js';

// (The carry and feather fixes' tests went with their games, deleted 2026-10-19: 「没用在游戏中的, 都删了吧」.)

test('stuck: a board that opts out of the clock is never left by it; other boards keep it', () => {
  const optOut = { mod: { meta: { stuckClock: false } }, state: { won: false }, shownAt: 0 };
  assert.equal(stuckNow(optOut, STUCK_MS * 3), false, 'no 「算了」 on a board with its own way out');
  const d = { mod: sneeze, state: sneeze.newGame('d'), shownAt: 0 };
  assert.equal(stuckNow(d, STUCK_MS), true);
});
