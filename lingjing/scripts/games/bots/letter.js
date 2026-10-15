// The human-like player for 写信 · 擦了又写 (games/letter.js; tools/board-bots.mjs).
// Writes as the book has it: the two lines he rubs out, then the real letter; 孙二狗's, the line that stays.
import { BODY } from '../letter.js';

export function bot(s) {
  if (s.won) return null;
  const verb = {
    ready: () => ({ g: 'start' }),
    first: () => ({ g: 'write', l: ['xian', 'ma'].find((id) => !s.rubbed.includes(id)) ?? 'men' }),
    body: () => { const x = BODY.find((b) => !s.sheet.includes(b.id)); return x ? { g: 'write', l: x.id } : { g: 'sign' }; },
    fold: () => ({ g: 'add' }),
    sun: () => ({ g: 'write', l: 'qi' }),
  }[s.phase];
  return verb ? verb() : null;
}
