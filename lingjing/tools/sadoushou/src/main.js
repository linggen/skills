// main.js — 守山门's play: one Phaser game on the given parent. The engine (core.js) and Phaser come in as externals
// (build.mjs), so the browser loads the one shared Phaser beside every game.
import * as Phaser from 'phaser';
import { W, H } from './view.js';
import { PlayScene } from './play.js';

/**
 * start({ parent, base, lang, kit, level, seed, reducedMotion, showFps, dev, onEvent, onEnd, shell, held })
 *   → { destroy(), say(who, text), go() }
 * `held`: draw the road but stand still until `go()` (the shell's lead card is up over it).
 * `base`: the URL of games/sadoushou/ (the shared art beside it, ../sadou/ and ../shouqiang/). `onEvent`: the facts
 * out (start · go · wave · boss · charge · low · end). `onEnd({ won, stars, stats })`. `shell` (games/shell.js): its
 * pause freezes the scene, and the canvas shows no result screen of its own.
 */
export function start(opts) {
  const box = opts.parent.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio || 1;
  // the canvas at (about) the screen's own pixels, capped at 1.6× the board: crisp, and the fill-rate stays in budget
  const zoom = Math.max(1, Math.min(1.6, ((box.width || W) * dpr) / W));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: Math.round(W * zoom),
    height: Math.round(H * zoom),
    backgroundColor: '#cfd3c6',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance', batchSize: 4096 },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
  });
  const hold = { on: Boolean(opts.held) };
  game.scene.add('play', PlayScene, true, { ...opts, zoom, hold });
  if (opts.dev) globalThis.__sadoushou = game; // the 游戏厅 (dev=1) only: a live check reads fps and the engine here
  return {
    destroy: () => game.destroy(true),
    say: (who, text) => game.scene.getScene('play')?.sayLine?.(who, text),
    go: () => { hold.on = false; game.scene.getScene('play')?.release?.(); },
  };
}
