// main.js — 守墙关's play: one Phaser game on the given parent. The engine (core.js) and Phaser come in as externals
// (build.mjs), so the browser loads the one shared Phaser beside every game.
import * as Phaser from 'phaser';
import { W, H, jieyinCool } from 'shouqiang-core';
import { PlayScene, ZOOM_MAX } from './play.js';
import { SIDE } from './lanes.js';

/**
 * start({ parent, base, lang, kit, level, seed, reducedMotion, dev, showFps, lines, onEvent, onEnd, landscape, shell })
 *   → { destroy(), say(who, text), layout(landscape), go(), paused(), picking(), jieyin(), jieyinCool(), fizzle() }
 * `held`: draw the field but stand still until `go()` (the shell's lead card is up over it).
 * `landscape` (a 药园 level only): option A — the same portrait field centred, side panels either side.
 * `base`: the URL of games/shouqiang/ (art beside it). `lines`: 银月's prefetched lines by moment (台词预取), else the
 * level's own. `onEvent`: the facts out (start · opening · wave · wave_cleared · boss · low · end). `onEnd({won, stars, stats})`.
 * `shell` (games/shell.js): the one outer shell — its pause drives the play, and the canvas keeps no pause button or
 * result screen of its own.
 */
export function start(opts) {
  const box = opts.parent.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio || 1;
  // The canvas at (about) the screen's own pixels, capped at 1.5× the board (810×1440): a 3× phone or a wide desk card
  // would otherwise fill 2× (1080×1920, 1.8× the pixels) for a sharpness the painted art doesn't have. The play steps
  // it down further on its own when frames run long (play.js, quality).
  const landscape = Boolean(opts.landscape && opts.level.grid);
  const gw = landscape ? W + 2 * SIDE : W;
  const zoom = Math.max(1, Math.min(ZOOM_MAX, ((box.width || gw) * dpr) / gw, box.height ? (box.height * dpr) / H : Infinity));
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: Math.round(gw * zoom),
    height: Math.round(H * zoom),
    backgroundColor: opts.level.grid ? '#0b1020' : '#1a2416',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
  });
  const hold = { on: Boolean(opts.held) }; // read by the scene as it is made; go() lets it run (it may not be made yet)
  game.scene.add('play', PlayScene, true, { ...opts, zoom, landscape, hold });
  const scene = () => game.scene?.getScene('play');
  if (opts.dev) globalThis.__shouqiang = game; // the 游戏厅 (dev=1) only: a live check reads fps and phase from here
  return {
    destroy: () => game.destroy(true),
    say: (who, text) => game.scene.getScene('play')?.say?.(who, text),
    // `held` was given: the lead-in and the clock start now (the field already stands drawn behind the shell's lead card)
    go: () => { hold.on = false; game.scene.getScene('play')?.go?.(); },
    layout: (l) => game.scene.getScene('play')?.layout?.(Boolean(l && opts.level.grid)),
    // 结印 (games/jieyin/helper.js, only where a camera is): the play's pause, the 火蛋, its cooldown, a 走火.
    paused: () => Boolean(scene()?.paused),
    picking: () => Boolean(scene()?.hud?.modalOpen), // a card pick is up: 结印's corner steps aside
    jieyin: () => Boolean(scene()?.jieyin?.()),
    jieyinCool: () => (scene()?.g ? jieyinCool(scene().g) : 0),
    fizzle: () => scene()?.fizzle?.(),
  };
}
