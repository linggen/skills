// battle-drag.js — 斗法 by drag, on the Mac (Hanli, 2026-10-15: tap first, drag
// as well). A card, a body of yours or the 主灵根一击 seal can be picked up with
// the mouse and let go on what it is for; an ink line follows the pointer from
// it. Nothing depends on this: a drag is the same two taps (battle-card.js
// dropOf), and a touch never starts one — on a phone the hand scrolls and the
// taps do it all.

const LIFTS = '[data-spot="hand"].can, [data-spot="mine"].can, [data-spot="power"].can';
const START_PX = 8;

const spotOf = el => (el ? { kind: el.dataset.spot, index: Number(el.dataset.index ?? -1) } : null);
const centre = (el, host) => {
  const a = el.getBoundingClientRect(), h = host.getBoundingClientRect();
  return { x: a.left - h.left + a.width / 2, y: a.top - h.top + a.height / 2 };
};

/* The line from what is held to the pointer: one rotated stroke in the room. */
function drawLine(line, from, x, y) {
  const dx = x - from.x, dy = y - from.y;
  line.style.left = `${from.x}px`;
  line.style.top = `${from.y}px`;
  line.style.width = `${Math.hypot(dx, dy)}px`;
  line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
}

/// Listen once, for the life of the page. `onDrop(from, to)` gets two places
/// (`{ kind, index }`; `to` null when let go on nothing); `active()` says a
/// fight is open and may be played.
export function wireDrag({ onDrop, active }) {
  let g = null;
  const end = () => {
    g?.line?.remove();
    g?.el?.classList.remove('dragging');
    g?.over?.classList.remove('dropover');
    g = null;
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !active()) return;
    const el = e.target.closest?.(LIFTS);
    const room = el?.closest('.battle');
    if (!el || !room) return;
    g = { el, room, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!g) return;
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < START_PX) return;
      g.moved = true;
      g.el.classList.add('dragging');
      g.from = centre(g.el, g.room);
      g.line = Object.assign(document.createElement('i'), { className: 'bdragline' });
      g.room.appendChild(g.line);
    }
    const h = g.room.getBoundingClientRect();
    drawLine(g.line, g.from, e.clientX - h.left, e.clientY - h.top);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-spot]:not([data-spot="stage"])');
    if (over !== g.over) { g.over?.classList.remove('dropover'); over?.classList.add('dropover'); g.over = over; }
  });
  document.addEventListener('pointerup', (e) => {
    if (!g) return;
    const { moved, el } = g;
    const to = moved ? document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-spot]') : null;
    end();
    if (!moved) return;
    // The click that follows a real drag is the drag's, not a tap.
    document.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
    onDrop(spotOf(el), to && to.dataset.spot !== 'stage' ? spotOf(to) : { kind: 'stage', index: -1 });
  });
  document.addEventListener('pointercancel', end);
}
