// kit/timeline.js — a seekable timeline, the GSAP subset the stage's moments use (doc/game-kit.md
// § One engine, (d)): Phaser's tweens can't seek a whole timeline or place a tween by GSAP's
// position parameter, and a beat finished by a tap needs `progress(1)`. Pure and engine-free: it
// moves numbers on plain objects (a view, a soak, a sprite's `scale`) and runs on whatever clock
// ticks it (a scene's update, or a test). `clockOf()` is GSAP-shaped (`timeline`, `to`), so
// setpieces/bag.js tweenBag can take it in GSAP's place.
//
//   tl.to(target, { v: 1, duration: 1.1, ease: 'power1.inOut' }, 0)
//     .fromTo(t, { v: 0 }, { v: 1, duration: 1 }, '+=0.2').call(fn, [], '<').set(t, { s: 1 }, 3)
//
// Positions: a number (s), '<' the last one's start, '>' its end, '+=n'/'-=n' after the end,
// '<+=n'/'>-=n' from the last one. A tween's vars: duration, ease, delay, repeat (-1 forever), yoyo,
// stagger (over an array of targets), keyframes ([{…, duration, ease}]); every other key is a number
// it moves.

const SPECIAL = new Set(['duration', 'ease', 'delay', 'repeat', 'yoyo', 'stagger', 'keyframes', 'immediateRender', 'onComplete', 'repeatDelay']);

/* ── Eases by GSAP's names ── */
const outOf = (f) => (t) => 1 - f(1 - t);
const inOutOf = (f) => (t) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2);
const powIn = (p) => (t) => t ** p;
const sineIn = (t) => 1 - Math.cos((t * Math.PI) / 2);
const expoIn = (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1)));
const backIn = (s) => (t) => t * t * ((s + 1) * t - s);
const FAMILIES = { power0: () => (t) => t, power1: () => powIn(2), power2: () => powIn(3), power3: () => powIn(4), power4: () => powIn(5), quad: () => powIn(2), cubic: () => powIn(3), quart: () => powIn(4), sine: () => sineIn, expo: () => expoIn, back: (n) => backIn(Number.isFinite(n) ? n : 1.70158) };

/// The ease named as GSAP names it ('sine.inOut', 'power2.out', 'back.out(2.2)', 'none'); a function passes through.
export function easeOf(name = 'power1.out') {
  if (typeof name === 'function') return name;
  const m = /^(\w+)(?:\.(in|out|inOut))?(?:\(([-\d.]+)\))?$/.exec(String(name));
  if (!m || name === 'none' || name === 'linear') return (t) => t;
  const make = FAMILIES[m[1]];
  if (!make) return (t) => t;
  const f = make(m[3] == null ? undefined : Number(m[3]));
  return m[2] === 'in' ? f : m[2] === 'inOut' ? inOutOf(f) : outOf(f);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const asList = (t) => (Array.isArray(t) ? t : [t]);
const propsOf = (vars) => Object.keys(vars).filter((k) => !SPECIAL.has(k) && typeof vars[k] === 'number');

/* One target's move: from → to over its duration, eased; `from` read when it first starts unless given. */
function trackOf(target, fromVars, toVars, ease) {
  const keys = propsOf(toVars);
  let from = fromVars ? { ...fromVars } : null;
  const startValues = () => { if (!from) from = Object.fromEntries(keys.map((k) => [k, target[k]])); };
  return {
    keys,
    render(p) {
      startValues();
      const e = ease(p);
      for (const k of keys) target[k] = from[k] + (toVars[k] - from[k]) * e;
    },
    /// Before it starts (a seek back): its from-values, if it has run or was given them.
    reset() { if (from) for (const k of keys) target[k] = from[k]; },
  };
}

/* A tween's segments: one, or its keyframes one after another. Each {at, dur, track}. */
function segmentsOf(target, fromVars, vars, baseEase) {
  if (!Array.isArray(vars.keyframes)) return [{ at: 0, dur: vars.duration ?? 0.5, track: trackOf(target, fromVars, vars, baseEase) }];
  let at = 0;
  return vars.keyframes.map((kf) => {
    const dur = kf.duration ?? 0.5;
    const seg = { at, dur, track: trackOf(target, null, kf, kf.ease ? easeOf(kf.ease) : baseEase) };
    at += dur;
    return seg;
  });
}

/* A tween: targets × segments, with its delay, repeats and stagger. Renders at its own local time. */
function tweenOf(targets, fromVars, vars, { immediate = false } = {}) {
  const ease = easeOf(vars.ease ?? 'power1.out');
  const stagger = Number(vars.stagger) || 0;
  const items = asList(targets).map((tg, i) => ({ offset: i * stagger, segs: segmentsOf(tg, fromVars?.[i] ?? fromVars, vars, ease) }));
  const once = items[0] ? items[0].segs.reduce((n, s) => n + s.dur, 0) : 0;
  const repeat = vars.repeat ?? 0;
  const loops = repeat < 0 ? Infinity : repeat + 1;
  const span = once * loops + (items.length - 1) * stagger;
  const renderItem = (it, local) => {
    const t = local - it.offset;
    if (t < 0) { for (const s of [...it.segs].reverse()) s.track.reset(); return; }
    const n = once > 0 ? Math.min(Math.floor(t / once), loops - 1) : 0;
    let u = once > 0 ? Math.min(once, t - n * once) : 0;
    if (vars.yoyo && n % 2 === 1) u = once - u;
    for (const s of it.segs) {
      if (u >= s.at) s.track.render(s.dur > 0 ? clamp01((u - s.at) / s.dur) : 1);
      else s.track.reset();
    }
  };
  const tw = {
    span,
    render: (local) => { for (const it of items) renderItem(it, local); },
    /// Not begun (a seek back before it): its start values, where it knows them.
    reset: () => { for (const it of items) for (const s of [...it.segs].reverse()) s.track.reset(); },
  };
  if (immediate) tw.render(0);
  return tw;
}

/// A timeline. `opts`: { paused, delay (s), onComplete }. `tick(dt)` moves it on (s); `time(t)` /
/// `progress(p)` seek it, rendering every child where it stands then.
export function timeline({ paused = false, delay = 0, onComplete = null } = {}) {
  const kids = []; // {start, span, tw?, fn?, args?}
  // `now` starts a hair before 0, so a callback placed at 0 fires on the way in.
  let last = null, playing = !paused, now = -delay - 1e-9, killed = false, done = false;
  const hooks = { onComplete };
  const endOf = () => kids.reduce((m, k) => Math.max(m, k.start + k.span), 0);
  const place = (pos) => {
    const end = endOf();
    if (pos == null) return end;
    if (typeof pos === 'number') return pos;
    const m = /^([<>])?(?:([+-])=([\d.]+))?$/.exec(String(pos));
    if (!m) return end;
    const base = m[1] === '<' ? last?.start ?? 0 : m[1] === '>' ? (last ? last.start + last.span : 0) : end;
    const off = m[2] ? (m[2] === '+' ? 1 : -1) * Number(m[3]) : 0;
    return Math.max(0, base + off);
  };
  const tween = (tw, pos, delayed = 0) => push({ tw, span: tw.span }, pos, delayed);
  const push = (kid, pos, delayed = 0) => { kid.start = place(pos) + delayed; kids.push(kid); last = kid; return tl; };
  /* Every child where `t` has it: those not yet begun at their start values (latest first), then the rest in order. */
  const renderAt = (t) => {
    const order = kids.map((k, i) => [k, i]).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]);
    for (const [k] of [...order].reverse()) if (k.tw && t < k.start) k.tw.reset();
    for (const [k] of order) if (k.tw && t >= k.start) k.tw.render(Math.min(k.span, t - k.start));
  };
  /* Callbacks the playhead passed going forward (from → to). */
  const fire = (from, to) => { for (const k of kids) if (k.fn && k.start > from && k.start <= to) k.fn(...(k.args ?? [])); };
  const goTo = (t, quiet = false) => {
    if (killed) return;
    const prev = now;
    now = t;
    if (t < 0) return; // still in its delay: nothing moves yet
    const at = t;
    renderAt(at);
    if (!quiet && at > prev) fire(prev, at);
    const end = endOf();
    if (at >= end && !done) { done = true; playing = false; if (!quiet) hooks.onComplete?.(); }
    else if (at < end) done = false;
  };
  const tl = {
    to: (targets, vars, pos) => tween(tweenOf(targets, null, vars), pos, vars.delay ?? 0),
    fromTo: (targets, fromVars, vars, pos) => tween(tweenOf(targets, asList(targets).map(() => fromVars), vars, { immediate: vars.immediateRender !== false }), pos, vars.delay ?? 0),
    from(targets, fromVars, pos) {
      const list = asList(targets);
      const toVars = list.map((tg) => Object.fromEntries(propsOf(fromVars).map((k) => [k, tg[k]])));
      const kid = { tw: null };
      const tws = list.map((tg, i) => tweenOf(tg, fromVars, { ...fromVars, ...toVars[i] }, { immediate: true }));
      kid.span = Math.max(0, ...tws.map((w) => w.span));
      kid.tw = { span: kid.span, render: (l) => { for (const w of tws) w.render(l); }, reset: () => { for (const w of tws) w.reset(); } };
      return push(kid, pos, fromVars.delay ?? 0);
    },
    set: (targets, vars, pos) => tween(tweenOf(targets, null, { ...vars, duration: 0 }), pos),
    call: (fn, args = [], pos) => push({ fn, args, span: 0 }, pos),
    /// A child timeline (it plays on this one's clock) or a callback.
    add(child, pos) {
      if (typeof child === 'function') return tl.call(child, [], pos);
      child.pause();
      return push({ span: child.duration(), tw: { span: child.duration(), render: (l) => child.time(l, true), reset: () => child.time(0, true) } }, pos);
    },
    duration: endOf,
    time(t, quiet = false) { if (t === undefined) return Math.max(0, now); goTo(t, quiet); return tl; },
    progress(p, quiet = false) { const d = endOf(); if (p === undefined) return d ? clamp01(Math.max(0, now) / d) : 1; goTo(p * d, quiet); return tl; },
    tick(dt) { if (playing && !killed) goTo(now + dt); return tl; },
    play() { if (!killed) { playing = true; if (done) { done = false; goTo(0, true); } } return tl; },
    pause() { playing = false; return tl; },
    kill() { killed = true; playing = false; return tl; },
    isActive: () => playing && !killed && !done,
    eventCallback(type, fn) { hooks[type] = fn; return tl; },
    get killed() { return killed; },
  };
  return tl;
}

/// A clock that drives every timeline and loose tween made on it — GSAP-shaped (`timeline`, `to`,
/// `set`), so `tweenBag(clockOf())` holds them as it holds GSAP's. `tick(dt)` each frame (s).
export function clockOf() {
  const live = new Set();
  const keep = (tl) => { live.add(tl); return tl; };
  return {
    timeline: (opts) => keep(timeline(opts)),
    to(targets, vars) { const tl = keep(timeline({ onComplete: vars.onComplete })); return tl.to(targets, vars, 0); },
    set(targets, vars) { timeline().set(targets, vars, 0).time(0); },
    tick(dt) { for (const tl of live) { if (tl.killed || (!tl.isActive() && tl.progress() >= 1)) { live.delete(tl); continue; } tl.tick(dt); } },
    killAll() { for (const tl of live) tl.kill(); live.clear(); },
    get size() { return live.size; },
  };
}
