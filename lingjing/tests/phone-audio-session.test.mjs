import test from 'node:test';
import assert from 'node:assert/strict';
import { enablePlayback } from '../scripts/games/phone/audio-session.js';

test('the phone page requests WebKit playback and tolerates unsupported or refused APIs', () => {
  const nav = { audioSession: { type: 'ambient' } };
  assert.equal(enablePlayback(nav), true);
  assert.equal(nav.audioSession.type, 'playback');
  assert.equal(enablePlayback({}), false);
  assert.equal(enablePlayback({ get audioSession() { throw new Error('not supported'); } }), false);
  assert.equal(enablePlayback({ audioSession: { get type() { return 'ambient'; }, set type(_) { throw new Error('denied'); } } }), false);
});
