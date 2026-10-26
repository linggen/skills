// main.js — 开炉's play: one Phaser game on the given parent. Phaser comes in as an external (build.mjs), so the
// browser loads the one shared Phaser beside every game.
import * as Phaser from 'phaser';
import { WINDOW_INPUT, ownWindowInput } from './window-input.js';
import { KailuScene, W, H, ZOOM_MAX } from './play.js';

/**
 * start({ parent, base, lang, data, reducedMotion, dev, showFps, shell, onEnd }) → { destroy(), refresh() }
 * `data`: { brief, roll(ids, lingshi, press) → Promise<result>, icon(id) → url|null } — the rules' brief of the 饭桶 and
 * the one door that feeds it (the page's `fantong feed`, or the 游戏厅's sample roll). The canvas only shows.
 * `onEnd({ won, stars, grade, result })` once the reveal is taken (收下), or `{ won: false, left: true }`.
 */
export function start(opts) {
  const box = opts.parent.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio || 1;
  const zoom = Math.max(0.5, Math.min(ZOOM_MAX, ((box.width || W) * dpr) / W, box.height ? (box.height * dpr) / H : Infinity));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: Math.round(W * zoom),
    height: Math.round(H * zoom),
    backgroundColor: '#2a1a12',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
    input: WINDOW_INPUT, // the page's window, never the shell's (window-input.js)
  });
  ownWindowInput(game);
  game.scene.add('kailu', KailuScene, true, { ...opts, zoom });
  if (opts.dev) globalThis.__kailu = game; // ?dev=1 only: a live check reads fps and the phase from here
  // refresh(): the canvas was laid into a new host (the pouch pane redraws round it) — fit it again.
  return { destroy: () => game.destroy(true), refresh: () => game.scale?.refresh() };
}
