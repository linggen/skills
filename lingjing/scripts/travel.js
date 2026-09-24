// travel.js — 行路: a move, shown. The world map framed on the way walked,
// the road drawn stop to stop and a dot going along it (his ask, 2026-09-23:
// 去一个地方的时候, 显示地图和在上面移动的动画). The page only draws: the rules
// already moved him; the way is read back from the roads Look gives.

import { frameOf, within } from './atlas.js';
import { worldPath } from './rules.js';
import { esc } from './esc.js';

/// The places walked through, from → to, over the roads the two Looks know
/// (`points`: id → {map, roads, name}). Null when no road joins them.
export function wayOf(points, from, to) {
  if (!points.has(from) || !points.has(to)) return null;
  const back = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === to) break;
    for (const next of points.get(id).roads ?? []) {
      if (points.has(next) && !back.has(next)) { back.set(next, id); queue.push(next); }
    }
  }
  if (!back.has(to)) return null;
  const way = [];
  for (let id = to; id !== null; id = back.get(id)) way.unshift(id);
  return way;
}

/// The overlay: the map under the way, the road as a line, a name at each
/// end, and the walker (moved by the page).
export function travelHtml(stops, world) {
  const { atlas, dir } = world;
  const frame = frameOf(stops.map((s) => s.map), atlas.aspect);
  const at = (p) => within(frame, p);
  const img = `<img src="${esc(worldPath(dir, atlas.file))}" alt="" style="width:${(100 / frame.w).toFixed(2)}%;left:${(-frame.x / frame.w * 100).toFixed(2)}%;top:${(-frame.y / frame.h * 100).toFixed(2)}%">`;
  // The line in a box shaped like the card (height 100), so a stroke stays round.
  const wide = (frame.w * atlas.aspect * 100) / frame.h;
  const line = stops.map((s) => { const p = at(s.map); return `${(p.left * wide / 100).toFixed(2)},${p.top.toFixed(2)}`; }).join(' ');
  const names = stops.map((s, i) => {
    const p = at(s.map), end = i === 0 || i === stops.length - 1;
    return `<span class="pt${i === stops.length - 1 ? ' here' : ''}${end ? '' : ' via'}" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%"><i></i>${end ? `<span>${esc(s.name)}</span>` : ''}</span>`;
  }).join('');
  return `<div class="travel"><div class="atlas" style="aspect-ratio:${(frame.w * atlas.aspect).toFixed(4)} / ${frame.h.toFixed(4)}">${img}
    <svg viewBox="0 0 ${(frame.w * atlas.aspect * 100 / frame.h).toFixed(2)} 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}" pathLength="100"/></svg>${names}<b class="walker"></b></div></div>`;
}

/// Where the walker stands along the way, as percentages, for keyframes.
export function wayPoints(stops, world) {
  const frame = frameOf(stops.map((s) => s.map), world.atlas.aspect);
  return stops.map((s) => within(frame, s.map));
}
