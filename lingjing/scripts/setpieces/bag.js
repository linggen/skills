// setpieces/bag.js — every GSAP tween a set piece makes, kept so it can be
// killed. A piece's timelines and the loose tweens its callbacks start (the
// mud flung in the trial) run on GSAP's own clock; when the stage is put away
// (跳过, the last tap, a new scene) the Pixi objects they move are destroyed,
// and a tween still running writes to nothing: `Cannot set properties of null
// (setting 'y')`, seen live at 01-altar (2026-09-30). The bag kills them all.
export function tweenBag(gsap) {
  const made = [];
  const keep = (t) => { made.push(t); return t; };
  return {
    timeline: (opts) => keep(gsap.timeline(opts)),
    to: (...args) => keep(gsap.to(...args)),
    /// Kill every tween made through the bag; none of them runs again.
    killAll() { for (const t of made.splice(0)) t.kill(); },
    /// How many are still running (for a test).
    get live() { return made.filter((t) => t.isActive()).length; },
    get size() { return made.length; },
  };
}
