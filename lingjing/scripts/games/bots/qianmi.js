// The human-like player for 一千米补测 · 先吐 (games/qianmi.js; tools/board-bots.mjs).
// Breathe deep and whole: hold 吐 till the lungs bar is near empty, then hold 吸 till it is
// near full — no pants, never drawing on full lungs.
export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.failed) return { g: 'again' };
  if (!s.started) return { g: 'start' };
  if (s.mode === 'out') return s.lungs - 0.00045 * lead <= 0.03 ? { hold: { gHold: 'in' } } : null;
  if (s.mode === 'in') return s.lungs + 0.0005 * lead >= 0.96 ? { hold: { gHold: 'out' } } : null;
  return { hold: { gHold: 'out' } };
}
