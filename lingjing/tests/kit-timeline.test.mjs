// kit/timeline.js — the seekable GSAP subset the stage's moments run on (game-kit.md § One engine):
// positions, seeks both ways, a tap's progress(1), callbacks once, eases by GSAP's names, and the
// GSAP-shaped clock tweenBag takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clockOf, easeOf, timeline } from '../scripts/kit/timeline.js';
import { tweenBag } from '../scripts/setpieces/bag.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≈ ${b}`);

test('timeline: eases keep GSAP’s names and ends', () => {
  for (const n of ['none', 'sine.inOut', 'sine.out', 'sine.in', 'power1.inOut', 'power2.out', 'power2.in', 'power3.inOut', 'back.out(2.2)', 'back.out(3)']) {
    const e = easeOf(n);
    near(e(0), 0, n);
    near(e(1), 1, n);
  }
  near(easeOf('power1.inOut')(0.5), 0.5, 'symmetric');
  assert.ok(easeOf('back.out(2.2)')(0.6) > 1, 'back overshoots');
  assert.ok(easeOf('power2.in')(0.5) < 0.5 && easeOf('power2.out')(0.5) > 0.5);
});

test('timeline: positions — number, end, <, >, +=, -=', () => {
  const o = { a: 0, b: 0, c: 0, d: 0 };
  const tl = timeline({ paused: true })
    .to(o, { a: 1, duration: 1 }, 0)
    .to(o, { b: 1, duration: 1 }) // at the end: 1
    .to(o, { c: 1, duration: 0.5 }, '<') // with the last: 1
    .to(o, { d: 1, duration: 0.5 }, '+=0.5'); // 0.5 after the end (2): 2.5
  near(tl.duration(), 3);
  tl.time(1.25);
  near(o.a, 1);
  assert.ok(o.b > 0 && o.b < 1 && o.c > 0 && o.d === 0);
  tl.time(3);
  for (const k of 'abcd') near(o[k], 1, k);
});

test('timeline: a seek back puts every value where that moment had it; fromTo is laid at once', () => {
  const soak = { v: 5 }, back = { v: 5 };
  const tl = timeline({ paused: true })
    .fromTo(soak, { v: 0 }, { v: 1, duration: 1, ease: 'none' }, 0)
    .fromTo(back, { v: 0 }, { v: 1, duration: 1, ease: 'none' }, 2);
  near(back.v, 0, 'fromTo renders its from at once (immediateRender)');
  tl.progress(1);
  near(soak.v, 1); near(back.v, 1);
  tl.time(0.5);
  near(soak.v, 0.5); near(back.v, 0, 'not begun again: its from');
  const view = { s: 1.04 };
  const t2 = timeline({ paused: true }).to(view, { s: 1, duration: 1, ease: 'none' }, 1);
  t2.time(1.5); near(view.s, 1.02);
  t2.time(0.2); near(view.s, 1.04, 'a to() seeks back to the value it started from');
});

test('timeline: ticks with a delay, calls once going forward, completes once, keyframes, repeat + yoyo', () => {
  const o = { x: 0, k: 0, r: 0 };
  let calls = 0, done = 0;
  const tl = timeline({ delay: 0.5, onComplete: () => { done += 1; } })
    .call(() => { calls += 1; }, [], 0)
    .to(o, { x: 1, duration: 1, ease: 'none' }, 0)
    .to(o, { keyframes: [{ k: 1, duration: 0.5, ease: 'none' }, { k: 0.2, duration: 0.5, ease: 'none' }] }, 0)
    .to(o, { r: 1, duration: 0.25, repeat: 1, yoyo: true, ease: 'none' }, 0);
  tl.tick(0.4);
  assert.equal(calls, 0, 'nothing in the delay');
  near(o.x, 0);
  tl.tick(0.6); // 0.5 in
  assert.equal(calls, 1);
  near(o.x, 0.5); near(o.k, 1); near(o.r, 0, 'yoyo back at 0.5');
  tl.tick(0.25);
  near(o.k, 0.6);
  tl.tick(5);
  near(o.x, 1); near(o.k, 0.2);
  assert.equal(done, 1);
  assert.equal(calls, 1);
  assert.equal(tl.isActive(), false);
});

test('timeline: a tap jumps ahead (time) and finishes (progress 1); kill stops it', () => {
  const o = { v: 0 };
  let done = 0;
  const tl = timeline({ paused: true }).to(o, { v: 1, duration: 2, ease: 'none' }, 1);
  tl.eventCallback('onComplete', () => { done += 1; });
  tl.play();
  tl.tick(0.5);
  tl.time(2);
  near(o.v, 0.5);
  tl.progress(1);
  near(o.v, 1);
  assert.equal(done, 1);
  const p = { v: 0 };
  const t2 = timeline().to(p, { v: 1, duration: 1 }, 0);
  t2.kill();
  t2.tick(0.5);
  near(p.v, 0, 'killed: never moves');
});

test('timeline: stagger over a list, from(), set, a child timeline', () => {
  const a = { y: 0 }, b = { y: 0 }, c = { alpha: 1 }, d = { s: 0 };
  const child = timeline().to(d, { s: 1, duration: 1, ease: 'none' }, 0);
  const tl = timeline({ paused: true })
    .to([a, b], { y: 1, duration: 1, stagger: 0.5, ease: 'none' }, 0)
    .from(c, { alpha: 0, duration: 1, ease: 'none' }, 0)
    .set(c, { alpha: 0.3 }, 2)
    .add(child, 1);
  near(c.alpha, 0, 'from() lays its from at once');
  tl.time(1);
  near(a.y, 1); near(b.y, 0.5); near(c.alpha, 1); near(d.s, 0);
  tl.time(1.5);
  near(d.s, 0.5);
  tl.time(2);
  near(c.alpha, 0.3);
});

test('timeline: the clock is GSAP-shaped — tweenBag holds and kills what it makes', () => {
  const clock = clockOf();
  const bag = tweenBag(clock);
  const o = { v: 0 }, q = { v: 0 };
  const tl = bag.timeline({ paused: true });
  tl.to(o, { v: 1, duration: 1, ease: 'none' }, 0);
  bag.to(q, { v: 1, duration: 1, ease: 'none' });
  tl.play();
  clock.tick(0.5);
  near(o.v, 0.5); near(q.v, 0.5);
  assert.equal(bag.size, 2);
  assert.equal(bag.live, 2);
  bag.killAll();
  clock.tick(0.5);
  near(o.v, 0.5); near(q.v, 0.5);
  assert.equal(bag.live, 0);
});
