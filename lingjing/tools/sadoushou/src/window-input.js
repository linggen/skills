// window-input.js — Phaser hears a press or release off its canvas on THIS page's window, never the top one.
// Phaser's `input.windowEvents` (on by default) listens on `window.top` for mousedown · mouseup · touchstart ·
// touchend · touchcancel, so a drag released off the canvas still ends. Inside the Linggen launcher (same origin)
// `window.top` is the shell: a tap anywhere in the shell reached a running board, hit-tested in its canvas's own
// coordinates — past the page's board fence (scripts/board-fence.js), which only sees the page. So the config turns
// windowEvents off (WINDOW_INPUT) and ownWindowInput hangs Phaser's own window handlers on the page's window: a drag
// begun on the board still ends wherever it is released on the page (the browser keeps a press's events in the frame
// it began in). The same file sits in each Phaser game's src (each bundle hashes only its own src).
export const WINDOW_INPUT = { windowEvents: false };

const HANDLERS = [
  ['mouse', 'mousedown', 'onMouseDownWindow', { passive: true }],
  ['mouse', 'mouseup', 'onMouseUpWindow', { passive: true }],
  ['touch', 'touchstart', 'onTouchStartWindow', { passive: false }],
  ['touch', 'touchend', 'onTouchEndWindow', { passive: false }],
  ['touch', 'touchcancel', 'onTouchCancelWindow', { passive: false }],
];

/// After boot, Phaser's window handlers on `win` (the page's own); taken off again when the game is destroyed.
export function ownWindowInput(game, win = globalThis.window) {
  if (!win) return;
  const on = [];
  game.events.once('ready', () => {
    for (const [mgr, type, name, opts] of HANDLERS) {
      const fn = game.input?.[mgr]?.[name];
      if (typeof fn !== 'function') continue;
      win.addEventListener(type, fn, opts);
      on.push([type, fn]);
    }
  });
  game.events.once('destroy', () => { for (const [type, fn] of on) win.removeEventListener(type, fn); });
}
