// setpiece.js — 大场面 (哇时刻 ②): one per 卷 at most, the whole stage. The
// runner; each piece lives in setpieces/<id>.js and hands back one paused
// GSAP timeline per beat (卷一's is `zhang`, 漳水立起).
//
// A piece moves with the dialogue box: a beat plays, then holds until a tap
// (the box's next passage) — or runs on by itself with `auto`. A tap during a
// beat finishes it; `skip()` jumps to the last frame and ends. Reduced motion
// shows each beat's last frame; no WebGL shows an SVG still per beat. Words
// are never painted: `onBeat(i, beat)` names the beat and the book line it
// goes with, and the caller says it. Pixi and GSAP come from fx.js's loaders
// (vendored, loaded only now); one Application per piece, destroyed after.
import { glOK, loadGsap, loadPixi } from './fx.js';

const ART_BASE = new URL('../worlds/jiuding/', import.meta.url).href;

/// The beats as a state machine, apart from any drawing (the tests drive it).
/// Events: {start: i} play beat i · {finish: i} jump beat i to its end ·
/// {hold: i} beat i ended, waiting · {done: true} the piece is over.
export function beatStepper(beats) {
  let i = -1, phase = 'idle';
  const next = () => {
    if (i + 1 < beats.length) { i += 1; phase = 'play'; return { start: i }; }
    phase = 'done';
    return { done: true };
  };
  return {
    get i() { return i; },
    get phase() { return phase; },
    get beat() { return beats[i] ?? null; },
    total: beats.reduce((a, b) => a + b.ms, 0),
    start: () => (phase === 'idle' ? next() : {}),
    ended: () => (phase === 'play' ? (phase = 'hold', { hold: i }) : {}),
    tap: () => (phase === 'play' ? (phase = 'hold', { finish: i }) : phase === 'hold' ? next() : {}),
    skip: () => (phase === 'done' ? {} : (phase = 'done', { skip: i, done: true })),
  };
}

/// The piece named `id` from a story node or a scene: `"setpiece": "zhang"` or
/// `{ "id": "zhang" }` (the declaration, doc/design.md § 哇时刻).
export const setpieceOf = (node) => {
  const s = node?.setpiece;
  const id = typeof s === 'string' ? s : s?.id;
  return typeof id === 'string' && /^[a-z]+$/.test(id) ? id : null;
};

const loadImage = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error(`no picture: ${src}`)); im.src = src; });

/// Play piece `id` in `host` (an empty box the caller sized). Resolves to
/// {tap(), skip(), destroy(), get i(), get phase()}.
export async function playSetPiece(host, id, { lang = 'zh', still = false, auto = false, hold = 900, artBase = ART_BASE, onBeat, onDone } = {}) {
  if (!/^[a-z]+$/.test(id)) throw new Error(`bad set piece: ${id}`);
  const def = await import(`./setpieces/${id}.js`);
  const steps = beatStepper(def.BEATS);
  const box = document.createElement('div');
  box.className = 'sphost';
  host.appendChild(box);
  const Wpx = Math.max(240, host.clientWidth || 480), Hpx = Math.max(240, host.clientHeight || Math.round(Wpx * 0.75));
  const W = 1000, H = Math.round(W * Math.min(1.6, Math.max(0.6, Hpx / Wpx)));
  const art = {};
  for (const [k, p] of Object.entries(def.ART ?? {})) art[k] = await loadImage(new URL(p, artBase).href).catch(() => null);

  let app = null, scene = null, tl = null, timer = null, gone = false;
  const gl = glOK();
  if (gl) {
    const [PIXI, gsap] = await Promise.all([loadPixi(), loadGsap()]);
    app = new PIXI.Application();
    await app.init({ width: Wpx, height: Math.round(Wpx * H / W), backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    box.appendChild(app.canvas);
    const root = new PIXI.Container();
    root.scale.set(Wpx / W);
    app.stage.addChild(root);
    scene = def.build({ PIXI, gsap, app, root, W, H, art });
  }

  const say = (i) => onBeat?.(i, { ...def.BEATS[i], text: def.BEATS[i].line?.[lang] ?? def.BEATS[i].line?.zh });
  const react = (ev) => {
    if (gone) return;
    clearTimeout(timer);
    if ('start' in ev) {
      const b = def.BEATS[ev.start];
      say(ev.start);
      if (!scene) { box.innerHTML = def.stillSvg(b.id, { W, H, art: art.bingyi?.src }); return react(steps.ended()); }
      tl = scene.beat(b.id);
      tl.eventCallback('onComplete', () => react(steps.ended()));
      if (still) tl.progress(1); else tl.play();
    } else if ('finish' in ev) {
      tl?.progress(1);
      react({ hold: ev.finish });
    } else if ('hold' in ev) {
      if (auto) timer = setTimeout(() => react(steps.tap()), hold);
    } else if ('skip' in ev) {
      // The last frame: every beat left, run to its end in order.
      if (scene) { tl?.progress(1); for (let k = Math.max(0, ev.skip + 1); k < def.BEATS.length; k += 1) scene.beat(def.BEATS[k].id).progress(1); } else box.innerHTML = def.stillSvg(def.BEATS.at(-1).id, { W, H, art: art.bingyi?.src });
      onDone?.();
    } else if (ev.done) onDone?.();
  };
  react(steps.start());

  return {
    get i() { return steps.i; },
    get phase() { return steps.phase; },
    tap: () => react(steps.tap()),
    /// A look at beat `k` at progress `p` (0–1), drawn at once: for checking frames
    /// where the page's clock does not run (a hidden tab). Not for play.
    seek(k, p = 1) {
      if (!scene) { box.innerHTML = def.stillSvg(def.BEATS[k].id, { W, H, art: art.bingyi?.src }); return; }
      tl?.kill();
      for (let j = 0; j < k; j += 1) scene.beat(def.BEATS[j].id).progress(1);
      tl = scene.beat(def.BEATS[k].id);
      tl.progress(p);
      for (let f = 0; f < 90; f += 1) scene.step(16);
      app.renderer.render(app.stage);
    },
    skip: () => react(steps.skip()),
    destroy() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      tl?.kill();
      scene?.destroy();
      app?.destroy(true, { children: true });
      box.remove();
    },
  };
}
