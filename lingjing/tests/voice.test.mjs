// The page's speech budget (scripts/voice.js): big and asked moments always
// go; small ones wait out 90 s since any line and their own cooldown, unless
// nobody has spoken for 5 min of active play; nothing small during a fight or
// a burst of taps (held, then weighed once calm); the idle word once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_MS, MOMENTS, QUIET_MS, STILL_MS, createVoice, flagsOf } from '../scripts/voice.js';

function rig() {
  let t = 1_000_000;
  const posts = [];
  const seen = { fighting: false, present: true };
  const v = createVoice({ now: () => t, post: (id, fact, flags) => { posts.push({ id, fact, flags }); return true; }, sees: () => seen });
  return { v, posts, seen, at: (ms) => { t += ms; }, ids: () => posts.map((p) => p.id) };
}

test('flags: big moments converse, asked ones are asked, low ones are plain', () => {
  assert.deepEqual(flagsOf('rise'), { big: true, converse: true });
  assert.deepEqual(flagsOf('reading'), { asked: true });
  assert.deepEqual(flagsOf('lost'), { big: true });
  assert.deepEqual(flagsOf('won'), {});
  for (const id of ['rise', 'chapter', 'tamed', 'finale', 'tale_end', 'spent']) assert.equal(MOMENTS[id].priority, 'big', id);
  // 历练, 疗伤, 伤势 and the elite's own rules were cut (redesign-v2 § 四): no moments for them.
  for (const id of ['journey', 'tended', 'wounded', 'elite']) assert.equal(MOMENTS[id], undefined, id);
});

test('big and asked moments always go, even right after a line', () => {
  const r = rig();
  r.v.heard();
  assert.equal(r.v.moment('rise', 'x').verdict, 'sent');
  assert.equal(r.v.moment('reading', 'x').verdict, 'sent');
  assert.deepEqual(r.ids(), ['rise', 'reading']);
});

test('one unprompted line per 90 s: a small moment right after any line is skipped', () => {
  const r = rig();
  r.v.heard(); // Ling just spoke
  r.at(30_000);
  assert.equal(r.v.moment('won', 'x').verdict, 'quiet');
  r.at(QUIET_MS);
  assert.equal(r.v.moment('won', 'x').verdict, 'sent');
  r.at(1_000);
  assert.equal(r.v.moment('gain', 'x').verdict, 'quiet', 'her own line counts too');
});

test('a small moment has its own cooldown — until 5 min of active quiet', () => {
  const r = rig();
  r.at(QUIET_MS);
  assert.equal(r.v.moment('won', 'x').verdict, 'sent');
  r.at(QUIET_MS + 1);
  assert.equal(r.v.moment('won', 'x').verdict, 'cooldown');
  // Active play (a tap every 30 s) with nobody speaking for 5 min: not skipped.
  for (let n = 0; n <= STILL_MS / 30_000; n += 1) { r.at(30_000); r.v.input(); }
  r.at(3_000);
  assert.equal(r.v.moment('won', 'x').verdict, 'sent');
});

test('nothing small in a fight: held, then told once the stage is calm, as one line', () => {
  const r = rig();
  r.at(QUIET_MS);
  r.seen.fighting = true;
  assert.equal(r.v.moment('unleash', 'a').verdict, 'held');
  assert.equal(r.v.moment('hurt', 'b').verdict, 'held');
  assert.equal(r.v.tick(), null, 'still fighting');
  r.seen.fighting = false;
  assert.deepEqual(r.v.tick(), ['unleash', 'hurt']);
  assert.deepEqual(r.ids(), ['unleash', 'hurt']);
  assert.equal(r.v.moment('won', 'x').verdict, 'quiet', 'the held pair was the line');
});

test('a burst of taps holds small moments too', () => {
  const r = rig();
  r.at(QUIET_MS);
  for (let n = 0; n < 4; n += 1) { r.v.input(); r.at(500); }
  assert.equal(r.v.moment('won', 'x').verdict, 'held');
  r.at(6_000);
  assert.deepEqual(r.v.tick(), ['won']);
});

test('idle on the page: she hears it once, only when she is here and nothing else spoke', () => {
  const r = rig();
  r.v.input();
  r.at(IDLE_MS - 1_000);
  assert.equal(r.v.tick({ idleFact: 'quiet' }), null);
  r.at(2_000);
  assert.deepEqual(r.v.tick({ idleFact: 'quiet' }), ['idle']);
  assert.equal(r.posts[0].fact, 'quiet');
  r.at(IDLE_MS);
  assert.equal(r.v.tick({ idleFact: 'quiet' }), null, 'once per idle stretch');
  r.v.input();
  r.at(IDLE_MS + 1_000);
  r.seen.present = false;
  assert.equal(r.v.tick({ idleFact: 'quiet' }), null, 'not while she is away');
  r.seen.present = true;
  assert.equal(r.v.tick({ idleFact: 'quiet', visible: false }), null, 'not on a hidden page');
  assert.deepEqual(r.v.tick({ idleFact: 'quiet' }), ['idle']);
});
