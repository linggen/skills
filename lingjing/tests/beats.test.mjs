// The page's beats (scripts/beats.js): 体力 spent is held, then counted
// down after the walk / the fight room; a 抉择 Ling left unwritten gets ONE
// nudge after the mist and a turn of hers, never a loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DRAIN_MS, drainAt, drainOf, trialNudge } from '../scripts/beats.js';

test('a drain waits for the latest hold (the walk on the map), then counts down to the new 体力', () => {
  const d = drainOf({ from: 30, to: 26, at: 1000, holds: [0, 4200] });
  assert.deepEqual(d, { from: 30, to: 26, spent: 4, start: 4200 });
  assert.deepEqual(drainAt(d, 1000), { value: 30, held: true, done: false }, 'the old count while he watches the walk');
  assert.deepEqual(drainAt(d, 4199), { value: 30, held: true, done: false });
  const mid = drainAt(d, 4200 + DRAIN_MS / 2);
  assert.ok(mid.value < 30 && mid.value >= 26 && !mid.held && !mid.done, 'ticking down');
  assert.deepEqual(drainAt(d, 4200 + DRAIN_MS), { value: 26, held: false, done: true });
});

test('no hold in the future: the drain starts at once; a stale walk does not hold it', () => {
  assert.equal(drainOf({ from: 10, to: 9, at: 5000, holds: [100, 200] }).start, 5000);
});

test('no drain for a rise, no change, reduced motion or an unknown count — shown at once', () => {
  assert.equal(drainOf({ from: 10, to: 12, at: 0 }), null);
  assert.equal(drainOf({ from: 10, to: 10, at: 0 }), null);
  assert.equal(drainOf({ from: 10, to: 4, at: 0, still: true }), null);
  assert.equal(drainOf({ from: undefined, to: 4, at: 0 }), null);
});

test('a drain on a drain starts from the count on the strip now, and says the whole spend', () => {
  const d = drainOf({ from: 26, to: 20, shown: 28, at: 0 });
  assert.equal(d.from, 28);
  assert.equal(d.spent, 6);
  assert.equal(drainOf({ from: 5, to: 0, at: 0 }).to, 0, 'down to empty too');
});

const meet = { kind: 'trial', waiting: true, veiled: true };
const veilOf = (o = {}) => ({ place: 'ford', key: 'd|ford', misted: true, turns: 1, ...o });

test('a trial still unwritten after the mist and a turn of hers: nudge once, under its key', () => {
  const nudged = new Set();
  const key = trialNudge({ meet, place: 'ford', veil: veilOf(), nudged, busy: false });
  assert.equal(key, 'd|ford');
  nudged.add(key);
  assert.equal(trialNudge({ meet, place: 'ford', veil: veilOf({ turns: 2 }), nudged, busy: false }), null, 'never twice — no loop');
});

test('no nudge before the mist ends, before her turn, while she talks, elsewhere, or once offered', () => {
  const nudged = new Set();
  const at = (o) => trialNudge({ meet, place: 'ford', veil: veilOf(), nudged, busy: false, ...o });
  assert.equal(at({ veil: veilOf({ misted: false }) }), null);
  assert.equal(at({ veil: veilOf({ turns: 0 }) }), null);
  assert.equal(at({ busy: true }), null);
  assert.equal(at({ place: 'inn' }), null, 'walked on');
  assert.equal(at({ veil: null }), null);
  assert.equal(at({ meet: { kind: 'trial', options: [{ n: 1 }] } }), null, 'offered');
  assert.equal(at({ meet: { kind: 'find', veiled: true } }), null, 'the page reveals the others itself');
  assert.equal(at({ meet: null }), null, 'passed or taken');
});

test('the page wires both: the drain before the strip is drawn, the nudge after a turn — hidden, once', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const draw = src.slice(src.indexOf('function draw()'), src.indexOf('riseStats();', src.indexOf('function draw()')));
  assert.ok(draw.indexOf('watchTravel()') < draw.indexOf('watchDrain()') && draw.indexOf('watchDrain()') < draw.indexOf('statusHtml()'), 'walk known, drain set, then the strip drawn');
  assert.match(src, /travelEnd = performance\.now\(\) \+ walk/);
  assert.match(src, /holds: \[riseAfter, travelEnd\]/);
  const nudge = src.slice(src.indexOf('function nudgeTrial()'), src.indexOf('}', src.indexOf('report(', src.indexOf('function nudgeTrial()'))));
  assert.match(nudge, /nudgedTrials\.add\(key\);\s*report\('\[scene\] trial waiting'\)/);
  const end = src.slice(src.indexOf('onStreamEnd:'), src.indexOf('onContentBlock:'));
  assert.match(end, /veil\.turns \+= 1/);
  assert.match(end, /nudgeTrial\(\)/);
});
