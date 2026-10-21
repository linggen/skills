// hint.js — the small frame that stands for the camera's view (Hanli 10-21: never the camera's picture): the hand the
// landmarker sees, drawn in ink, mirrored as in a mirror, and whether it is the 剑诀. A stand-in until the shared
// handHint (games/jieyin) lands — the game calls only hintHtml() and drawHint(), so swapping it is one import.
import { BONES } from '../jieyin/pose.js';

/** The frame: an empty ink box and one line under it. */
export const hintHtml = (label = '') => `<figure class="zd-hint" aria-hidden="true"><svg viewBox="0 0 100 75"><g class="zd-hint-ink"></g></svg>`
  + `<figcaption>${label}</figcaption></figure>`;

/** The hand in the frame (picture points 0…1, mirrored), or none; `ok` inks it in the seal's colour. */
export function drawHint(fig, hand, ok, label) {
  if (!fig) return;
  const g = fig.querySelector('.zd-hint-ink');
  fig.classList.toggle('is-ok', Boolean(ok));
  fig.classList.toggle('is-none', !hand);
  const cap = fig.querySelector('figcaption');
  if (cap && cap.textContent !== label) cap.textContent = label;
  if (!hand) { g.innerHTML = ''; return; }
  const X = (p) => ((1 - p.x) * 100).toFixed(1), Y = (p) => (p.y * 75).toFixed(1);
  g.innerHTML = BONES.map(([a, b]) => `<line x1="${X(hand[a])}" y1="${Y(hand[a])}" x2="${X(hand[b])}" y2="${Y(hand[b])}"/>`).join('')
    + [8, 12].map((i) => `<circle cx="${X(hand[i])}" cy="${Y(hand[i])}" r="2"/>`).join('');
}
