// The stage's one-at-a-time rule (scripts/queue.js, 2026-10-01): the passage
// that leads into a board, a fight, a set piece or a seal finishes in the box
// first, then that thing opens; the page's moments come one at a time, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterBook, bookAhead, BOX_FIRST, boxGivesWay, MOMENTS, momentMay } from '../scripts/queue.js';

const cards = [{ card: 'panel' }, { card: 'people' }, { card: 'board', id: 'deer-wind' }, { card: 'duel', id: 'longzhi' }, { card: 'tale' }, { card: 'lundao' }, { card: 'offer' }];

test('the games wait for the book: while a passage is ahead, no board, duel, 传闻 or 论道 stands; after it, all of them', () => {
  assert.deepEqual(afterBook(cards, true).map(c => c.card), ['panel', 'people', 'offer']);
  assert.deepEqual(afterBook(cards, false), cards);
  for (const k of ['board', 'duel', 'tale', 'lundao']) assert.ok(BOX_FIRST.has(k));
});

test('the book is ahead while passages are owed, being drawn or playing — but not while paused at a 回\'s turn', () => {
  assert.equal(bookAhead({ owed: true }), true, 'owed, not yet drawn (the choice\'s passage is coming)');
  assert.equal(bookAhead({ drawing: true }), true);
  assert.equal(bookAhead({ playing: true }), true);
  assert.equal(bookAhead({ playing: true, huiTurn: true }), false, 'its 「完」, the seal and the new title go first there');
  assert.equal(bookAhead({}), false);
});

test('the box gives the stage away only to what is UP — never to a game or a moment that waits for it (no deadlock)', () => {
  assert.equal(boxGivesWay({}), false, 'a board in main no longer hides the box');
  assert.equal(boxGivesWay({ bout: true }), true, 'a fight in play');
  assert.equal(boxGivesWay({ appearing: true }), true, 'a beast\'s first sight');
  assert.equal(boxGivesWay({ up: true }), true, 'a moment already on the stage');
  assert.equal(boxGivesWay({ huiTurn: true }), true, 'a 回\'s 「完」 and the new title');
});

test('the moments come after the book, one at a time, in their order: set piece, doors, seal, memory, 鼎归', () => {
  assert.deepEqual(MOMENTS, ['piece', 'doors', 'feat', 'memory', 'homing']);
  assert.equal(momentMay('piece', { ahead: true }), false, 'the passage first (漳水立起 after 巫祝投河)');
  assert.equal(momentMay('feat', { up: true }), false, 'never a seal over the doors (突破 over 五门俱开)');
  assert.equal(momentMay('feat', { pending: ['doors', 'feat'] }), false, 'the doors are on their way: they go first');
  assert.equal(momentMay('memory', { pending: ['feat', 'memory'] }), false, 'the seal before her memory');
  assert.equal(momentMay('doors', { pending: ['feat', 'memory', 'doors'] }), true, 'a later moment never holds an earlier one');
  assert.equal(momentMay('homing', {}), true);
});

test('the page asks queue.js: the games are held, every moment waits its turn, a gain waits for a quiet stage', () => {
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /cards = afterBook\(cards, boxAhead\(\)\);\s*watchAppear\(cards\);/, 'a beast\'s first sight only for a card that is drawn');
  for (const m of MOMENTS) assert.match(page, new RegExp(`momentTurn\\('${m}'`), `${m} waits its turn`);
  assert.match(page, /async function gainBurst[\s\S]{0,200}boxAhead\(\) \|\| momentUp\(\) \|\| momentPending\.size/, '修为 +n never floats over her memory');
  assert.match(page, /slots\.main\.some\(\(c\) => c\.card === 'closed'\) \? '' : toastsHtml\(\)/, '「完」 stands alone (所得 waits)');
});
