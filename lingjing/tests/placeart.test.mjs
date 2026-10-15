// The place's painting (placeart.js): declared once per location, found by the scene's place
// and its spot within it, a room says so, a night painting only where one was painted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeArtOf } from '../scripts/placeart.js';

const table = { places: {
  chaifang: { at: 'chaifang', indoor: true, day: 'a/chaifang.webp', night: 'a/chaifang-night.webp' },
  'chaifang-back': { at: 'chaifang', match: ['柴房后面', '后院'], day: 'a/back.webp' },
  'chaifang-door': { at: 'chaifang', match: ['柴房'], day: 'a/door.webp' },
  'jin-stacks': { scape: ['stacks'], indoor: true, day: 'a/stacks.webp' },
  'jin-dark': { scape: ['dark'], indoor: true, night: 'a/stacks-night.webp' },
} };

test('a scene takes its spot\'s painting, else the place\'s own', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 柴房后面 · 泥地里' }).id, 'chaifang-back');
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 外门后院 · 柴堆' }).id, 'chaifang-back');
  // the longest token wins: 柴房后面 over 柴房
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '沉鼎观 · 柴房' }).id, 'chaifang-door');
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '' }).id, 'chaifang');
  assert.equal(placeArtOf(table, { at: 'chaifang' }).id, 'chaifang');
  assert.equal(placeArtOf(table, { at: 'nowhere', name: '柴房' }), null);
  assert.equal(placeArtOf(null, { at: 'chaifang' }), null);
});

test('a room says so; outdoors is the default', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang' }).indoor, true);
  assert.equal(placeArtOf(table, { at: 'chaifang', name: '柴房后面' }).indoor, false);
});

test('night: its own painting where one was painted, else the day one; a night-only place by day too', () => {
  assert.deepEqual(placeArtOf(table, { at: 'chaifang' }, false), { id: 'chaifang', src: 'a/chaifang-night.webp', indoor: true, night: true });
  assert.equal(placeArtOf(table, { at: 'chaifang' }, true).src, 'a/chaifang.webp');
  assert.deepEqual(placeArtOf(table, { at: 'chaifang', name: '柴房后面' }, false), { id: 'chaifang-back', src: 'a/back.webp', indoor: false, night: false });
  assert.equal(placeArtOf(table, { scape: 'dark' }, true).src, 'a/stacks-night.webp');
});

test('a 今线 scene goes by its scape, not its place', () => {
  assert.equal(placeArtOf(table, { at: 'chaifang', scape: 'stacks' }).id, 'jin-stacks');
  assert.equal(placeArtOf(table, { scape: 'track' }), null);
});
