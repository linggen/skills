// main.js — 撒豆成兵's play: one Phaser game on the given parent. The engine (core.js) and Phaser come in as externals
// (build.mjs), so the browser loads the one shared Phaser beside every game.
import * as Phaser from 'phaser';
import { WINDOW_INPUT, ownWindowInput } from './window-input.js';
import { W, H } from 'sadou-core';
import { PlayScene } from './play.js';

/**
 * start({ parent, base, lang, kit, level, seed, reducedMotion, showFps, lines, onEvent, onEnd, shell, held })
 *   → { destroy(), say(who, text), go() }
 * `held`: draw the road but stand still until `go()` (the shell's lead card is up over it).
 * `base`: the URL of games/sadou/ (art beside it). `lines`: 银月's prefetched lines by moment (台词预取), else the
 * level's own. `onEvent`: the facts out (start · go · gate · clash · boss · low · end). `onEnd({won, stars, stats})`.
 * `shell` (games/shell.js): the one outer shell — its pause freezes the play (the scene: loop, clock, tweens), and the
 * canvas shows no result screen of its own.
 */
export function start(opts) {
  const box = opts.parent.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio || 1;
  // The canvas at (about) the screen's own pixels, capped at 1.6× the board (864×1536): crisp enough on a phone or a
  // Retina desk, and the fill-rate stays in budget (守墙关 ran at 16 fps on Hanli's Mac at full DPR, 10-20).
  const zoom = Math.max(1, Math.min(1.6, ((box.width || W) * dpr) / W));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: Math.round(W * zoom),
    height: Math.round(H * zoom),
    backgroundColor: '#22301c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance', batchSize: 4096 },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
    input: WINDOW_INPUT, // the page's window, never the shell's (window-input.js)
  });
  ownWindowInput(game);
  const hold = { on: Boolean(opts.held) }; // read by the scene as it is made; go() lets it run (it may not be made yet)
  game.scene.add('play', PlayScene, true, { ...opts, zoom, hold });
  if (opts.dev) globalThis.__sadou = game; // the 游戏厅 (dev=1) only: a live check reads fps and the engine from here
  return {
    destroy: () => game.destroy(true),
    say: (who, text) => game.scene.getScene('play')?.sayLine?.(who, text),
    // `held` was given: the lead-in (the beans, the 3-2-1) starts now; the road already stands drawn behind the lead card
    go: () => { hold.on = false; game.scene.getScene('play')?.release?.(); },
  };
}
