// run-tracklist.mjs — sanity checks for the pure helpers that don't need a
// browser or daemon: track identity/dedupe and the bash quoting/path helpers.
// Run: node tests/run-tracklist.mjs

import assert from 'node:assert';

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`  ok  ${name}`); };

// trackId / isOwned (mirrors library.js, kept inline so the test has no DOM deps)
const trackId = (t) =>
  `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;
const isOwned = (lib, t) => {
  const id = trackId(t);
  return lib.tracks.some((x) => x.id === id || trackId(x) === id);
};

ok('trackId normalizes case + whitespace', () => {
  assert.equal(trackId({ artist: ' Beyond ', title: '海闊天空' }), 'beyond|海闊天空');
  assert.equal(
    trackId({ artist: 'beyond', title: '海闊天空' }),
    trackId({ artist: 'BEYOND', title: ' 海闊天空 ' }),
  );
});

ok('isOwned matches by id and by recomputed key', () => {
  const lib = { tracks: [{ id: 'beyond|海闊天空', artist: 'Beyond', title: '海闊天空' }] };
  assert.equal(isOwned(lib, { artist: 'BEYOND', title: '海闊天空' }), true);
  assert.equal(isOwned(lib, { artist: 'Faye Wong', title: '夢中人' }), false);
});

// sq (mirrors bash.js) — single-quote safety
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
ok('sq escapes embedded single quotes', () => {
  assert.equal(sq("Guns N' Roses"), `'Guns N'\\'' Roses'`);
  assert.equal(sq('plain'), `'plain'`);
});

// resolvePath shape (pure part: ~ → home, leave the rest)
const resolveWith = (home, p) => String(p).replace(/^~(?=\/|$)/, home);
ok('resolvePath expands a leading ~ only', () => {
  assert.equal(resolveWith('/Users/x', '~/Music/DJ'), '/Users/x/Music/DJ');
  assert.equal(resolveWith('/Users/x', '/abs/Music'), '/abs/Music');
  assert.equal(resolveWith('/Users/x', '~name/x'), '~name/x'); // not a home ref
});

console.log(`\n${pass} passed`);
