// The human-like player for the 时机 kit (games/sneeze.js; tools/board-bots.mjs), any level the state plays.
// A tell: press a little into the window, aiming ahead by the hand's delay. A hold: let go at the
// window's middle. A count: press early in the last beat's first part.
import { guardOf, stepOf } from '../sneeze.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const step = stepOf(s), since = s.t - s.at;
  if (step.kind === 'tell') {
    const open = guardOf(s) + Math.min(150, step.tell * 0.3);
    return since + lead >= open && since + lead < guardOf(s) + step.tell * 0.7 ? { g: 'yield' } : null;
  }
  if (step.kind === 'hold') return s.held == null ? { hold: { g: 'hold' } } : s.t - s.held + lead >= (step.window[0] + step.window[1]) / 2 ? { release: true } : null;
  if (step.kind === 'count') return s.k === step.k - 1 && s.part === 'ah' && since + lead < step.ah - Math.min(150, step.ah * 0.25) ? { g: 'push' } : null;
  return null;
}
