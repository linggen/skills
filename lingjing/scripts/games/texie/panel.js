// panel.js — when 施法特写's close-up shows (games/texie.js). Pure: one sample a frame in, the panel's phase and what
// changed out; the page turns a phase into a class on the panel, the tests read it.
//
//   hidden → in (a hand seen: it slides in) → shown → thrust (a cast: the hand thrusts, the spell leaves) → out (it
//   fades) → rest → hidden. A shown panel whose hands are gone `goneMs` fades too. After a cast it fades on its own
//   (`afterMs` after the thrust ends) and rests `restMs` before a hand may bring it back.
//
//   startPanel()                                    → state
//   panelStep(state, { now, seen, cast }, knobs)    → { state, events: ['show' | 'thrust' | 'hide' | 'gone'] }
//     now ms · seen: a hand in view · cast: a seal finished or a push this frame

export const PANEL = { inMs: 280, thrustMs: 420, afterMs: 700, outMs: 360, goneMs: 900, restMs: 500 };

export const startPanel = () => ({ phase: 'hidden', since: 0, lastSeen: -Infinity, cast: false });

const go = (s, phase, now, extra = {}) => ({ ...s, phase, since: now, ...extra });

export function panelStep(state, { now, seen = false, cast = false }, knobs = {}) {
  const k = { ...PANEL, ...knobs }, events = [];
  let s = seen ? { ...state, lastSeen: now } : state;
  const age = now - s.since;
  if (cast && s.phase !== 'thrust') {
    // A cast with the panel down (or going) still shows it thrusting: a push can come before the panel is in.
    if (s.phase !== 'in' && s.phase !== 'shown') events.push('show');
    events.push('thrust');
    return { state: go(s, 'thrust', now, { cast: true }), events };
  }
  switch (s.phase) {
    case 'hidden':
      if (seen) { s = go(s, 'in', now, { cast: false }); events.push('show'); }
      break;
    case 'in':
      if (age >= k.inMs) s = go(s, 'shown', now);
      break;
    case 'shown':
      if (s.cast && age >= k.afterMs) { s = go(s, 'out', now); events.push('hide'); }
      else if (now - s.lastSeen >= k.goneMs) { s = go(s, 'out', now); events.push('gone'); }
      break;
    case 'thrust':
      if (age >= k.thrustMs) s = go(s, 'shown', now);
      break;
    case 'out':
      if (age >= k.outMs) s = go(s, 'rest', now);
      break;
    case 'rest':
      if (age >= k.restMs) s = go(s, 'hidden', now, { cast: false });
      break;
    default:
      s = startPanel();
  }
  return { state: s, events };
}
