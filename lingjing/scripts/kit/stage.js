// kit/stage.js — the stage's one Phaser game (doc/game-kit.md § One engine, 1(a); Hanli 10-21
// 「go」: one persistent transparent stage). One `Phaser.Game` per stage box, made on first need and
// kept: every drawn layer of the stage is a Scene on it — `moment` (the 回 turn now; 鼎归 and the set
// pieces when they port), then `alive` (画活) and `weather` as they move over — so the stage holds one
// WebGL context however many layers draw, and Phaser boots once. The canvas is transparent and takes
// no input (`pointer-events: none`, Phaser's input off); the words are the page's DOM, never painted.
//
// A layer starts as its own scene and is removed when it ends, its textures freed with it; the game
// stays. With no layer running, or while a small game plays (its own Phaser, `.gshell`), or with the
// tab hidden, the loop sleeps. The canvas sits at the z of the topmost running layer (LAYERS), at the
// frame rate of the fastest. No WebGL, reduced motion: never made — the caller keeps its CSS/SVG.
//
// `?perf=1` on the page: a corner readout of the stage (fps, layers, textures) and the page's live
// WebGL contexts — every one, the stage's and any other library's.
import { fxTimes, glOK, loadPhaser } from '../fx.js';

/// Each layer's place on the stage, bottom to top: `under` — it draws with the painting, so the canvas
/// stands in the painting's own box (#backdrop, after the .bd's, under the season tint, the shade, the
/// cards and the words); else its z among the page's (story.css: .appear/.spstage 30, the 「新的一回」
/// seal 32). `covers`: the layers it hides while it runs (asleep, woken after). The fps it wants.
export const LAYERS = {
  alive: { under: true, fps: 30 },
  weather: { under: true, fps: 30 },
  moment: { z: 31, fps: 60, covers: ['alive', 'weather'] },
};
/// The device pixels drawn per CSS pixel, at most (Phaser has no autoDensity: the canvas is drawn
/// at w·dpr and shown at 1/dpr).
export const DPR_CAP = 2;
export const dprOf = (dpr = 1, cap = DPR_CAP) => Math.max(1, Math.min(cap, Number(dpr) || 1));

/// Where the canvas stands for the running layers — or null, nothing runs (the loop sleeps):
/// the topmost one's place (`under`, else its z), the fastest awake one's fps, and the layers
/// asleep under a cover.
export function hostFor(running = [], table = LAYERS) {
  const order = Object.keys(table).filter((k) => running.includes(k));
  if (!order.length) return null;
  const asleep = new Set(order.flatMap((k) => table[k].covers ?? []));
  const awake = order.filter((k) => !asleep.has(k));
  const top = table[order.at(-1)];
  return { under: Boolean(top.under), z: top.under ? null : top.z, fps: Math.max(...awake.map((k) => table[k].fps)), asleep: order.filter((k) => asleep.has(k)) };
}

/* ── ?perf=1: every WebGL context the page makes, counted as it is made ── */
const perfOn = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1';
const contexts = new Set();
if (perfOn() && typeof HTMLCanvasElement === 'function') {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    const ctx = get.call(this, type, ...rest);
    if (ctx && /webgl/.test(type)) contexts.add(ctx);
    return ctx;
  };
}
/// The page's WebGL contexts alive now: on a canvas still in the page, not lost.
export const liveContexts = () => [...contexts].filter((g) => g.canvas?.isConnected && !g.isContextLost()).length;

const hosts = new Map(); // view → Promise<host|null>
const gamePlays = () => Boolean(document.querySelector('.gshell'));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/// The stage game of `view` (the stage box, #view), made on first ask. Resolves to the host or null
/// (no WebGL, reduced motion, it failed to boot).
export function stageOf(view) {
  if (!view || reduced() || !glOK()) return Promise.resolve(null);
  if (!hosts.has(view)) hosts.set(view, makeHost(view).catch((e) => { hosts.delete(view); console.warn('[lingjing] stage — no Phaser stage', e); return null; }));
  return hosts.get(view);
}

/* The box's size in CSS px. */
const sizeOf = (el) => ({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });

/// A Phaser game made for drawing only, in `el`: transparent, WebGL, no input or sound, drawn at
/// w·dpr shown at 1/dpr. The stage's own, and a short-lived one beside it (a beast's 出场). Resolves when ready.
export function bootGame(Phaser, el, { w, h }, dpr, scene = []) {
  const t = performance.now();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: el,
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
    transparent: true,
    banner: false,
    autoFocus: false,
    disableContextMenu: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    fps: { target: 60, limit: 60, smoothStep: true },
    render: { antialias: true, powerPreference: 'low-power' },
    scene,
  });
  return new Promise((ok, no) => {
    const late = setTimeout(() => no(new Error('the stage game did not boot')), 8000);
    game.events.once('ready', () => { clearTimeout(late); fxTimes.boot = Math.round(performance.now() - t); ok(game); });
  });
}

async function makeHost(view) {
  const Phaser = await loadPhaser();
  const el = document.createElement('div');
  el.className = 'stagegl';
  Object.assign(el.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0', visibility: 'hidden' });
  view.appendChild(el);
  let size = sizeOf(view), dpr = dprOf(globalThis.devicePixelRatio);
  const game = await bootGame(Phaser, el, size, dpr);
  Object.assign(game.canvas.style, { display: 'block', pointerEvents: 'none' });
  game.canvas.setAttribute('aria-hidden', 'true');
  const running = new Map(); // layer → {key, textures, idle}
  // Frames drawn a second (Phaser's actualFps counts the browser's frames, not the ones under the limit).
  let drawn = 0, fps = 0, fpsAt = performance.now();
  game.events.on('postrender', () => { drawn += 1; const now = performance.now(); if (now - fpsAt >= 1000) { fps = Math.round((drawn * 1000) / (now - fpsAt)); drawn = 0; fpsAt = now; } });
  let serial = 0, dead = false, under = null, keepLast = null;

  const awake = () => !document.hidden && !gamePlays();
  /* The host's place: in the painting's box (last there, so a new .bd lays under it) or over the stage at a z. */
  const placeAt = (parent, z) => {
    if (el.parentElement !== parent || (z === null && parent.lastElementChild !== el)) parent.appendChild(el);
    el.style.zIndex = z === null ? 'auto' : String(z);
    keepLast?.disconnect();
    keepLast = null;
    if (z === null && typeof MutationObserver === 'function') {
      keepLast = new MutationObserver(() => { if (parent.lastElementChild !== el) parent.appendChild(el); });
      keepLast.observe(parent, { childList: true });
    }
  };
  /* The scenes in the layers' order, those under a cover asleep. */
  const order = (at) => {
    for (const k of Object.keys(LAYERS)) {
      const run = running.get(k);
      if (!run || !game.scene.getScene(run.key)) continue;
      game.scene.bringToTop(run.key);
      const sleepIt = at.asleep.includes(k);
      if (sleepIt && game.scene.isActive(run.key)) game.scene.sleep(run.key);
      else if (!sleepIt && game.scene.isSleeping(run.key)) game.scene.wake(run.key);
    }
  };
  /* The canvas where the running layers want it; the loop asleep when nothing runs or draws, or a game plays. */
  const refresh = () => {
    if (dead) return;
    const at = hostFor([...running.keys()]);
    el.style.visibility = at ? 'visible' : 'hidden';
    if (at) {
      placeAt(at.under ? (under?.isConnected ? under : view) : view, at.z);
      game.loop._limitRate = 900 / at.fps; // a hair under: a 60 Hz frame pair is not cut to every third
      order(at);
    }
    const busy = at && [...running].some(([k, r]) => !r.idle && !at.asleep.includes(k));
    const sleep = !busy || !awake();
    if (sleep && game.loop.running) game.loop.sleep();
    else if (!sleep && !game.loop.running) game.loop.wake();
  };
  const resize = () => {
    if (dead) return;
    const now = sizeOf(view), d = dprOf(globalThis.devicePixelRatio);
    if (now.w === size.w && now.h === size.h && d === dpr) return;
    size = now;
    dpr = d;
    game.scale.setZoom(1 / dpr);
    game.scale.resize(Math.round(size.w * dpr), Math.round(size.h * dpr));
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(view);
  // Twice a second: the stage taken down → the game goes; a game playing or the tab hidden → asleep.
  const watch = setInterval(() => (view.isConnected ? refresh() : host.destroy()), 500);

  const host = {
    Phaser, game, el,
    /// CSS px of the box, and device px per CSS px: a layer draws at `size.w × dpr`.
    get size() { return { ...size, dpr }; },
    /// Run `scene` ({create(data), update(time, delta)}, `this` the Phaser scene) as `layer`: the one
    /// running there ends first. `opts.under`: the painting's box, for a layer drawn with the painting.
    /// Resolves to the scene once created.
    run(layer, scene, data = {}, opts = {}) {
      host.stop(layer);
      if (opts.under) under = opts.under;
      const key = `${layer}#${serial += 1}`;
      running.set(layer, { key, textures: [], idle: false });
      if (!game.loop.running) game.loop.wake(); // a scene is made on the loop's next step
      return new Promise((ok) => {
        game.scene.add(key, { ...scene, create(d) { scene.create?.call(this, d); ok(this); refresh(); } }, true, data);
      });
    },
    /// The scene `layer` runs now, or null.
    sceneOf: (layer) => (running.has(layer) ? game.scene.getScene(running.get(layer).key) : null),
    /// A layer with nothing to draw for now (a weather hidden by a fight, a painting covered): the
    /// loop may sleep for it.
    idle(layer, yes) { const r = running.get(layer); if (r && r.idle !== Boolean(yes)) { r.idle = Boolean(yes); refresh(); } },
    /// A texture for `layer`'s run, from an image or canvas; freed when the layer ends (or `free`). Returns its key.
    texture(layer, source) {
      const run = running.get(layer);
      const key = `${run?.key ?? layer}:t${serial += 1}`;
      if (source instanceof HTMLCanvasElement) game.textures.addCanvas(key, source);
      else game.textures.addImage(key, source);
      run?.textures.push(key);
      return key;
    },
    /// Free one texture of `layer`'s now.
    free(layer, key) {
      const run = running.get(layer);
      if (run) run.textures = run.textures.filter((t) => t !== key);
      if (!dead && game.textures.exists(key)) game.textures.remove(key);
    },
    /// End `layer` (its scene removed, its textures freed). The game stays.
    stop(layer) {
      const run = running.get(layer);
      if (!run) return;
      running.delete(layer);
      if (!dead) {
        game.scene.remove(run.key);
        for (const t of run.textures) if (game.textures.exists(t)) game.textures.remove(t);
      }
      refresh();
    },
    /// Whether `layer` is running the run that `scene` belongs to (a late callback of an ended run does nothing).
    owns: (layer, scene) => running.get(layer)?.key === scene?.sys?.settings?.key,
    layers: () => [...running.keys()],
    stats: () => ({ fps: game.loop.running ? fps : 0, layers: [...running.keys()].join(',') || '—', textures: game.textures.getTextureKeys().length, dpr, boot_ms: fxTimes.boot, phaser_ms: fxTimes.phaser }),
    destroy() {
      if (dead) return;
      dead = true;
      clearInterval(watch);
      ro?.disconnect();
      keepLast?.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      running.clear();
      game.destroy(true);
      el.remove();
      hosts.delete(view);
    },
  };
  document.addEventListener('visibilitychange', refresh);
  refresh();
  return host;
}

/* The ?perf=1 readout: one line per stage, and the page's live contexts. */
let readout = null;
function perfReadout() {
  if (readout) return;
  readout = document.createElement('div');
  readout.className = 'perfreadout';
  Object.assign(readout.style, { position: 'fixed', left: '6px', bottom: '6px', zIndex: '9999', pointerEvents: 'none', font: '11px/1.35 ui-monospace, monospace', color: '#e8e2d2', background: 'rgba(20,22,24,.78)', padding: '4px 7px', borderRadius: '4px', whiteSpace: 'pre-wrap', maxWidth: 'calc(100vw - 12px)', boxSizing: 'border-box' });
  document.body.appendChild(readout);
  const line = (s) => Object.entries(s).map(([k, v]) => `${k} ${v ?? '—'}`).join(' · ');
  setInterval(async () => {
    const stages = (await Promise.all([...hosts.values()])).filter(Boolean);
    readout.textContent = [`webgl contexts ${liveContexts()}`, ...stages.map((h) => `stage ${line(h.stats())}`)].join('\n');
  }, 500);
}
if (perfOn() && typeof document !== 'undefined') {
  if (document.body) perfReadout();
  else document.addEventListener('DOMContentLoaded', perfReadout, { once: true });
}
