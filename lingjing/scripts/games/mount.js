// mount.js — the one contract a small game keeps (Hanli, 2026-10-16: each small game is built
// standalone, then embedded):
//
//   mount(container, { data, lang, reducedMotion, seed, level, signal, winHold }) → Promise<{ won, grade?, stars?, left? }>
//
// A game knows nothing of the story, the save or the pay: it draws itself into `container`, takes
// the player's hands there, and settles with how it went. What the result means — the story's way
// on, the pay, the 得牌 card — is the beat wrapper's (lingjing.js, beat-won.js), never the game's.
// `signal` (an AbortSignal) takes it down early: it settles { won: false, left: true }.
//
// `mountPure(mod)` gives that contract to any pure board module (games/<id>.js: meta · newGame ·
// act · html, and `tick` when it runs in time): it runs the module's clock, its taps (on pointerdown
// while it runs in time, as live-games.js does), its holds and its strokes — all scoped to the
// container, so a game on the 游戏厅 page and the same game on the story's stage play alike.
// Nothing here knows a game.
import { morph, sceneAt, tapGate, tapInk } from '../live-games.js';
import { crosses, stroke } from './swipe.js';

const STEP = 50;
const WIN_HOLD = 1600; // the won frame (its seal) stands this long before the game settles

const live = (mod, s) => Boolean(mod.tick && s?.live && !s.won && !s.wait);
const settled = (s, left = false) => (left ? { won: false, left: true } : { won: true, ...(s.grade != null ? { grade: s.grade } : {}), ...(s.stars != null ? { stars: s.stars } : {}) });


/** The contract for a pure module: answers `mount(container, opts)`. */
export function mountPure(mod) {
  return (container, opts = {}) => run(mod, container, opts);
}

function run(mod, container, { data = {}, lang = 'zh', seed = String(Date.now()), level = 1, signal, winHold = WIN_HOLD } = {}) {
  const doc = container.ownerDocument;
  const host = doc.createElement('div');
  host.className = 'game g-mounted';
  container.replaceChildren(host);
  const g = { state: mod.newGame(seed, level, data), held: null };
  const paint = () => morph(host, mod.html(g.state, lang));
  return new Promise((resolve) => {
    let last = performance.now(), done = false;
    const gate = tapGate();
    const off = [];
    const on = (el, type, fn, o) => { el.addEventListener(type, fn, o); off.push(() => el.removeEventListener(type, fn, o)); };
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(clock);
      off.forEach((f) => f());
      resolve(result);
    };
    const check = () => { if (g.state?.won && !done) { done = true; clearInterval(clock); off.forEach((f) => f()); setTimeout(() => resolve(settled(g.state)), winHold); } };
    const apply = (d) => {
      const r = mod.act(g.state, d);
      g.state = r.state ?? g.state;
      paint();
      check();
    };
    const clock = setInterval(() => {
      const now = performance.now(), dt = Math.min(250, now - last);
      last = now;
      if (!live(mod, g.state) || doc.visibilityState !== 'visible') return;
      g.state = mod.tick(g.state, dt);
      paint();
      check();
    }, STEP);
    on(host, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      const hold = e.target.closest?.('[data-g-hold],[data-g-drag]');
      const tap = e.target.closest?.('[data-g]');
      const el = hold ?? tap;
      if (!el || el.disabled || !host.contains(el)) return;
      tapInk(doc, e.clientX, e.clientY);
      if (hold) {
        e.preventDefault();
        g.held = { drag: hold.hasAttribute('data-g-drag'), x: e.clientX, y: e.clientY };
        if (g.held.drag) try { host.setPointerCapture(e.pointerId); } catch { /* the document still hears it */ }
        apply({ ...hold.dataset, g: 'hold', ...sceneAt(host, e) });
        return;
      }
      if (!live(mod, g.state)) return; // a board not in time acts on its click, below
      gate.down('m');
      apply({ ...tap.dataset });
    });
    on(host, 'click', (e) => {
      const el = e.target.closest?.('[data-g]');
      if (!el || el.disabled || !host.contains(el)) return;
      if (gate.click('m') && e.detail !== 0) return; // already acted on as the finger went down
      apply({ ...el.dataset });
    });
    // A pressed pointer drawn across a [data-g-swipe] control acts on it, once per control per
    // stroke (喂饼's vines, 2026-10-16: 割绳子's cut); the press itself went the tap's way.
    // What a stroke cuts is swipe.js's: a finger that moves, the first vine a quick flick crosses.
    let swipe = null;
    on(host, 'pointerdown', (e) => {
      swipe = e.button === 0 ? stroke(e.clientX, e.clientY, e.target.closest?.('[data-g-swipe]') ?? null) : null;
    }, true);
    on(doc, 'pointermove', (e) => {
      if (!swipe || !(e.buttons & 1) || !live(mod, g.state)) return;
      const el = doc.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-g-swipe]');
      if (crosses(swipe, e.clientX, e.clientY, el && host.contains(el) ? el : null)) apply({ ...el.dataset });
    });
    on(doc, 'pointerup', () => { swipe = null; });
    on(doc, 'pointermove', (e) => {
      if (!g.held?.drag) return;
      const d = Math.hypot(e.clientX - g.held.x, e.clientY - g.held.y);
      g.held.x = e.clientX;
      g.held.y = e.clientY;
      if (d) apply({ g: 'move', d, ...sceneAt(host, e) });
    });
    const up = () => { if (!g.held) return; g.held = null; apply({ g: 'release' }); };
    on(doc, 'pointerup', up);
    on(doc, 'pointercancel', up);
    on(host, 'contextmenu', (e) => { if (e.target.closest?.('[data-g-hold],[data-g-drag]')) e.preventDefault(); });
    if (signal) {
      if (signal.aborted) return finish(settled(g.state, true));
      signal.addEventListener('abort', () => finish(settled(g.state, true)), { once: true });
    }
    paint();
  });
}
