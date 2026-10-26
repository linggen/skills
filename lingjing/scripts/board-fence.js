// board-fence.js — a board takes only the taps that land on it (Hanli, 2026-10-26, the 事 popover open over 兽潮's
// 先选一门本事: 「这里点交差按钮时, 触发了小游戏的开始」).
//
// The cause: Phaser listens on the WINDOW for mousedown · mouseup · touchstart · touchend · touchcancel (its
// `input.windowEvents`, on by default, so a drag released off the canvas still ends) and hit-tests each one in its
// canvas's own coordinates. A tap on a popover, a sheet or a dialog lying over the canvas reached the window too, at a
// point over the canvas: 守墙关's talisman card takes `pointerup`, so the tap on 交 差 picked it as well.
//
// The fence, for every board on the page and any to come (no game's bundle is touched): the document — which hears a
// bubbling event before the window does — stops such an event on its way to the window when it lands OVER a board's
// field but not ON it, unless the press began on the board (its own drag, released wherever). An event off every field
// goes on as ever (the chat's own drags end on the window). Never preventDefault: a touch's click still follows.
// Pure parts first, for the tests; `fenceBoards` wires them.

/* A board's field: the host its play is mounted in (beat-host.js `data-mount`), or a page-drawn board's (`data-game`). */
export const FIELD = '[data-mount], [data-game]';
export const onField = (target) => Boolean(target?.closest?.(FIELD));

/* Is the point over a rect? */
export const over = (r, x, y) => Boolean(r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

/* Should this event be kept from the window? It lands over a field (`fields`: their rects), not on one, and the press
   it ends did not begin on one. */
export const fenced = ({ target, x, y, fields = [], began = false }) => !began && !onField(target) && fields.some((r) => over(r, x, y));

const DOWN = ['mousedown', 'touchstart'];
const UP = ['mouseup', 'touchend', 'touchcancel'];
const pointOf = (e) => { const t = e.changedTouches?.[0] ?? e; return { x: t.clientX, y: t.clientY }; };

export function fenceBoards(doc = globalThis.document) {
  const fields = () => [...doc.querySelectorAll('[data-mount]')].filter((h) => h.querySelector('canvas')).map((h) => h.getBoundingClientRect());
  let began = false;
  const guard = (e) => { const { x, y } = pointOf(e); if (fenced({ target: e.target, x, y, fields: fields(), began })) e.stopPropagation(); };
  for (const t of DOWN) doc.addEventListener(t, (e) => { began = false; guard(e); began = onField(e.target); });
  for (const t of UP) doc.addEventListener(t, (e) => { guard(e); if (!e.touches?.length) began = false; });
}
