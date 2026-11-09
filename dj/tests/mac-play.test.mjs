// mac-play: a play sent to the Mac rides the topic to the app's DJ page and
// the tool says "playing" only on that page's answer to THIS ask. The topic
// door is a fake here; a fake page answers (or doesn't).
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveQueue, parseTracks, resultOf, ask, main, NO_PAGE } from '../scripts/mac-play.mjs';

const LIB = {
  tracks: [
    { id: '周杰伦|以父之名', artist: '周杰伦', title: '以父之名', file: '/m/周杰伦 - 以父之名.mp3' },
    { artist: 'Beyond', title: '海闊天空', file: '/m/Beyond - 海闊天空.mp3' },
    { artist: 'Gone', title: 'Lost', file: '/m/Gone - Lost.mp3' },
  ],
  playlists: [],
};
const onDisk = (f) => f !== '/m/Gone - Lost.mp3';

test('resolves artist+title, a file name and a bare string, in the order asked', () => {
  const { queue, missing } = resolveQueue(LIB, [
    { artist: 'beyond', title: '海闊天空' },
    { file: '周杰伦 - 以父之名.mp3' },
    'Beyond - 海闊天空.mp3',
  ], onDisk);
  assert.deepEqual(queue.map((t) => t.title), ['海闊天空', '以父之名', '海闊天空']);
  assert.deepEqual(missing, []);
});

test('names what it cannot play: not in the library, or gone from disk', () => {
  const { queue, missing } = resolveQueue(LIB, [
    { artist: '周杰伦', title: '以父之名' },
    { artist: 'Nobody', title: 'Nothing' },
    { artist: 'Gone', title: 'Lost' },
  ], onDisk);
  assert.equal(queue.length, 1);
  assert.deepEqual(missing, ['Nobody - Nothing: not in the library', 'Gone - Lost: file is missing on disk']);
});

test('tracks arrive as an array, a page-style {tracks}, one object or a file name', () => {
  assert.equal(parseTracks('[{"artist":"a","title":"b"}]').length, 1);
  assert.equal(parseTracks('{"tracks":[{"file":"x"},{"file":"y"}]}').length, 2);
  assert.deepEqual(parseTracks('{"artist":"a","title":"b"}'), [{ artist: 'a', title: 'b' }]);
  assert.deepEqual(parseTracks('A - B.mp3'), ['A - B.mp3']);
  assert.throws(() => parseTracks('{{tracks}}'), /missing tracks/);
  assert.throws(() => parseTracks(''), /missing tracks/);
});

test('only an answer to this ask counts, and only `playing` is playing', () => {
  assert.equal(resultOf({ nonce: 'old', state: 'playing' }, 'new'), null, 'a retained answer to an earlier ask');
  assert.equal(resultOf(null, 'n'), null);
  assert.equal(resultOf({ nonce: 'n', state: 'playing', track: { title: 't' } }, 'n').playing, true);
  for (const state of ['blocked', 'failed', 'weird']) {
    const r = resultOf({ nonce: 'n', state, error: 'x' }, 'n');
    assert.equal(r.playing, false);
    assert.equal(r.ok, false);
    assert.ok(r.error);
  }
  assert.equal(resultOf({ nonce: 'n', state: 'stopped' }, 'n').stopped, true);
});

/// A topic door with a page behind it: `page(ask)` returns its reply, or null for no page.
function door(page) {
  const box = {};
  return {
    sent: box,
    io: {
      async publish(op, payload) { box[op] = payload; const r = page(payload); if (r) box['mac-playing'] = { nonce: payload.nonce, ...r }; },
      async latest(op) { return box[op] ?? null; },
    },
  };
}

test('a page that starts the song: playing, with the track it reports', async () => {
  const d = door(() => ({ state: 'playing', track: { artist: '周杰伦', title: '以父之名' } }));
  const r = await main(['play', '[{"artist":"周杰伦","title":"以父之名"}]'], { io: d.io, lib: LIB, exists: onDisk, wait: 1000 });
  assert.equal(r.playing, true);
  assert.equal(r.track.title, '以父之名');
  const sent = d.sent['mac-play'];
  assert.equal(sent.action, 'play');
  assert.equal(sent.tracks[0].file, '/m/周杰伦 - 以父之名.mp3');
  assert.ok(sent.deadline > sent.at, 'the ask carries its deadline, so a late page leaves it');
});

test('no page answering: an honest failure after the wait, never "playing"', async () => {
  const d = door(() => null);
  d.io.latest = async () => ({ nonce: 'an-earlier-ask', state: 'playing' }); // stale retained answer
  const t0 = Date.now();
  const r = await ask({ action: 'play', tracks: [] }, { io: d.io, wait: 600 });
  assert.equal(r.playing, false);
  assert.equal(r.error, NO_PAGE);
  assert.ok(Date.now() - t0 >= 550);
});

test('a song not in the library never reaches the page', async () => {
  const d = door(() => { throw new Error('should not be asked'); });
  const r = await main(['play', '[{"artist":"Nobody","title":"Nothing"}]'], { io: d.io, lib: LIB, exists: onDisk, wait: 300 });
  assert.equal(r.playing, false);
  assert.deepEqual(r.missing, ['Nobody - Nothing: not in the library']);
  assert.equal(d.sent['mac-play'], undefined);
});

test('the engine unreachable says so', async () => {
  const io = { publish: async () => { throw new Error('ECONNREFUSED'); }, latest: async () => null };
  const r = await ask({ action: 'stop' }, { io, wait: 300 });
  assert.match(r.error, /Could not reach Linggen/);
});

test('stop: the page answers stopped', async () => {
  const d = door((a) => (a.action === 'stop' ? { state: 'stopped', was_playing: true } : null));
  const r = await main(['stop'], { io: d.io, wait: 1000 });
  assert.deepEqual({ ok: r.ok, stopped: r.stopped, was: r.was_playing }, { ok: true, stopped: true, was: true });
});
