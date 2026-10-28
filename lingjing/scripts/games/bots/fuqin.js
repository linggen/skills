// The human-like player for 抚琴 (games/fuqin.js; tools/board-bots.mjs): it hears the tune, so it strikes the next key as
// the hand's delay (`see.lead`) is about to bring it to the bridge — a tap on that lane (a long key is held to its end by
// the rules, Piano Tiles' way). Its hand is the harness's (200 ms ± 40, a beat of rest after a stroke).
export function bot(s, see = {}) {
  if (!s.live || s.won || s.phase !== 'play') return null;
  const when = s.clock + (see.lead ?? 0);
  const n = s.notes.find((x) => s.res[x.i].head == null);
  return n && n.t <= when ? { g: 'tap', lane: n.lane } : null;
}
