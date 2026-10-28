// The human-like player for 太鼓 (games/taiko.js; tools/board-bots.mjs): it hears the beat, so it strikes a mark as the
// hand's delay (`see.lead`) is about to bring it to the ring — 咚 or 咔 as the mark is, both keys on a big one; on a roll
// it drums 咚, on a balloon 咚 and 咔 in turn. Its hand is the harness's (200 ms ± 40, a beat of rest after a stroke).
export function bot(s, see = {}) {
  if (!s.live || s.won || s.phase !== 'play') return null;
  const when = s.clock + (see.lead ?? 0);
  const long = s.notes.find((n) => n.kind !== 'hit' && when >= n.t && when <= n.end && !(n.kind === 'balloon' && s.res[n.i].done));
  if (long) return { g: 'hit', side: long.kind === 'balloon' && s.res[long.i].last === 'don' ? 'ka' : 'don' };
  for (let k = s.next; k < s.hits.length; k += 1) {
    const n = s.notes[s.hits[k]];
    if (s.res[n.i].grade != null) continue;
    return n.t <= when ? { g: 'hit', side: n.side, ...(n.big ? { both: true } : {}) } : null;
  }
  return null;
}
