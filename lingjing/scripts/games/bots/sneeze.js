// The human-like player for 喷嚏符 · 让一拳 (games/sneeze.js; tools/board-bots.mjs).
// Step aside when the shoulder drops; a short press of qi (~0.7 s); push early in the third 「阿——」.
import { AH } from '../sneeze.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase === 'face') return s.note === 'tell' ? { g: 'yield' } : null;
  if (s.phase === 'charm') return s.held == null ? { hold: { g: 'hold' } } : s.t - s.held + lead >= 650 ? { release: true } : null;
  if (s.phase === 'sneeze') return s.k === 2 && s.part === 'ah' && s.t - s.at + lead < AH - 150 ? { g: 'push' } : null;
  return null;
}
