// main.js — 守墙关's play: one Phaser game on the given parent. The engine (core.js) and Phaser come in as externals
// (build.mjs), so the browser loads the one shared Phaser beside every game.
import * as Phaser from 'phaser';
import { W, H } from 'shouqiang-core';
import { PlayScene, ZOOM_MAX } from './play.js';

/**
 * start({ parent, base, lang, kit, level, seed, reducedMotion, dev, showFps, lines, onEvent, onEnd })
 *   → { destroy(), say(who, text) }
 * `base`: the URL of games/shouqiang/ (art beside it). `lines`: 银月's prefetched lines by moment (台词预取), else the
 * level's own. `onEvent`: the facts out (start · wave · wave_cleared · boss · low · end). `onEnd({won, stars, stats})`.
 */
export function start(opts) {
  const box = opts.parent.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio || 1;
  // The canvas at (about) the screen's own pixels, capped at 1.5× the board (810×1440): a 3× phone or a wide desk card
  // would otherwise fill 2× (1080×1920, 1.8× the pixels) for a sharpness the painted art doesn't have. The play steps
  // it down further on its own when frames run long (play.js, quality).
  const zoom = Math.max(1, Math.min(ZOOM_MAX, ((box.width || W) * dpr) / W));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: Math.round(W * zoom),
    height: Math.round(H * zoom),
    backgroundColor: '#1a2416',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
  });
  game.scene.add('play', PlayScene, true, { ...opts, zoom });
  if (opts.dev) globalThis.__shouqiang = game; // the 游戏厅 (dev=1) only: a live check reads fps and phase from here
  return {
    destroy: () => game.destroy(true),
    say: (who, text) => game.scene.getScene('play')?.say?.(who, text),
  };
}
