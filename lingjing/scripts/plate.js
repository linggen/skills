// plate.js — a painted map of one small area (观内, 2026-10-15: 沉鼎观, tools/paint-guan.py
// seed 47): the 去往 list opens on it while he stands on one of its places. The rules say
// where each place is painted and whether it is open (Look's place.plate, rules/world.mjs
// plateBrief); the page only draws. A spot is the same tap as a road (`data-go`, a Move
// that walks the whole way); a shut one is drawn greyed and does nothing; his own is marked.
import { esc } from './esc.js';

const pct = (v) => `${Math.round(v * 1000) / 10}%`;

/// The painting and its spots. `src` is the picture's URL (worldPath), `here` the word for 「此处」.
/// A plate with no painting (沉鼎秘境's rooms) is drawn in ink: its seals on paper, at the same places.
export function plateHtml(plate, { src = null, here = '' } = {}) {
  if (!plate?.spots?.length) return '';
  const spots = plate.spots.map((s) => {
    const at = `left:${pct(s.at[0])};top:${pct(s.at[1])}`;
    // A visiting shop there today (rules/visiting.mjs): the seal wears a small mark.
    const cls = `spot${s.here ? ' here' : ''}${s.closed ? ' shut' : ''}${s.visitor ? ' visitor' : ''}`;
    // In ink (one instance's rooms) the seal says the room alone: 「沉鼎秘境 · 石室」 → 石室.
    const label = `<span class="spotname">${esc(src ? s.name : String(s.name).split(' · ').pop())}</span>`;
    return s.here || s.closed
      ? `<span class="${cls}" style="${at}" title="${esc(s.here ? `${s.name} · ${here}` : s.name)}" aria-disabled="true">${label}</span>`
      : `<button class="${cls}" style="${at}" data-go="${esc(s.id)}" title="${esc(s.name)}">${label}</button>`;
  }).join('');
  const bg = src ? `;background-image:url('${esc(src)}')` : '';
  return `<div class="plate${src ? '' : ' ink'}" style="aspect-ratio:${plate.aspect ?? 1.5}${bg}" role="group" aria-label="${esc(plate.name ?? '')}">${spots}</div>`;
}
