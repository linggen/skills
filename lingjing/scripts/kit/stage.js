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

/// Each layer's place on the stage: its z among the page's own (story.css: .appear/.spstage 30,
/// the 「新的一回」 seal 32) and the frame rate it wants. `under`: the canvas stands just before that
/// box of the stage (same z, so under it) — a set piece under its beat's words (`piece`, 10-22): the
/// picture where the piece's own box `.spback` stands (z 0), its painted name (`.sptitle`) over the
/// picture, the shade (z 1) and the words (z 4) over both. The box goes see-through while it does
/// (story.css `.spback:has(.ongl)`). The fall in 腾云 is a quick move: 60 fps.
export const LAYERS = { moment: { z: 31, fps: 60 }, piece: { z: 0, fps: 60, under: '.spback' } };
/// The device pixels drawn per CSS pixel, at most (Phaser has no autoDensity: the canvas is drawn
/// at w·dpr and shown at 1/dpr).
export const DPR_CAP = 2;
export const dprOf = (dpr = 1, cap = DPR_CAP) => Math.max(1, Math.min(cap, Number(dpr) || 1));

/// Where the canvas stands for the running layers: the topmost one's z, the fastest one's fps — or
/// null, nothing runs (the loop sleeps).
export function hostFor(running = [], table = LAYERS) {
  const rows = running.map((k) => table[k]).filter(Boolean);
  if (!rows.length) return null;
  const top = rows.reduce((a, r) => (r.z > a.z ? r : a));
  return { z: top.z, fps: Math.max(...rows.map((r) => r.fps)), under: top.under ?? null };
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

function bootGame(Phaser, el, { w, h }, dpr) {
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
  const running = new Map(); // layer → {key, textures}
  let serial = 0, dead = false;

  const awake = () => !document.hidden && !gamePlays();
  /* The canvas where the running layers want it; the loop asleep when nothing runs or a game plays. */
  const refresh = () => {
    if (dead) return;
    const at = hostFor([...running.keys()]);
    el.style.visibility = at ? 'visible' : 'hidden';
    if (at) { el.style.zIndex = String(at.z); game.loop._limitRate = 1000 / at.fps; }
    // Moving the canvas among its siblings keeps its context (only taking it out of the page loses it).
    const box = at?.under ? view.querySelector(`:scope > ${at.under}`) : null;
    if (box && el.nextElementSibling !== box) view.insertBefore(el, box);
    const sleep = !at || !awake();
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
    /// running there ends first. Resolves to the scene once created.
    run(layer, scene, data = {}) {
      host.stop(layer);
      const key = `${layer}#${serial += 1}`;
      running.set(layer, { key, textures: [] });
      refresh();
      if (!game.loop.running) game.loop.wake(); // a scene is made on the loop's next step
      return new Promise((ok) => {
        game.scene.add(key, { ...scene, create(d) { scene.create?.call(this, d); ok(this); } }, true, data);
      });
    },
    /// A texture for `layer`'s run, from an image or canvas; freed when the layer ends. Returns its key.
    texture(layer, source) {
      const run = running.get(layer);
      const key = `${run?.key ?? layer}:t${run?.textures.length ?? 0}`;
      if (source instanceof HTMLCanvasElement) game.textures.addCanvas(key, source);
      else game.textures.addImage(key, source);
      run?.textures.push(key);
      return key;
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
    stats: () => ({ fps: game.loop.running ? Math.round(game.loop.actualFps) : 0, layers: [...running.keys()].join(',') || '—', textures: game.textures.getTextureKeys().length, dpr, boot_ms: fxTimes.boot, phaser_ms: fxTimes.phaser }),
    destroy() {
      if (dead) return;
      dead = true;
      clearInterval(watch);
      ro?.disconnect();
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
