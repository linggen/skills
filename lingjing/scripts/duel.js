// duel.js — 降妖, the 五行 bout. Pure and shared: the page plays it round by
// round and the rules replay it to decide. No model, no fighting numbers.
//
// 相克: 木克土 · 土克水 · 水克火 · 火克金 · 金克木. The player picks one of
// their roots each round; the creature's move is drawn for the day, leaning
// to its own root. Best of three won rounds, at most five; a draw counts for
// no one.

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];
export const BEATS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
export const ROUNDS = 5;
export const TO_WIN = 2;

/* A small stable hash: the same day, creature and name draw the same bout. */
export function hashOf(text) {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* The creature's five moves for the day: its own root six times in ten,
   else any element. Given the player's roots, at least two of the five are
   moves those roots overcome — a bout is always winnable by reading the
   creature, never lost by birth (a 木水火土 player before a 木 creature
   could only draw or lose, 2026-09-16). Which rounds open is drawn too. */
export function creatureMoves(root, seed, roots = []) {
  const moves = Array.from({ length: ROUNDS }, (_, r) => {
    const h = hashOf(`${seed}|${r}`);
    return h % 10 < 6 ? root : ELEMENTS[Math.floor(h / 10) % ELEMENTS.length];
  });
  const beatable = roots.map((e) => BEATS[e]).filter(Boolean);
  if (!beatable.length) return moves;
  let open = moves.filter((m) => beatable.includes(m)).length;
  const from = hashOf(`${seed}|open`) % ROUNDS;
  for (let k = 0; k < ROUNDS && open < TO_WIN; k += 1) {
    const r = (from + k) % ROUNDS;
    if (beatable.includes(moves[r])) continue;
    moves[r] = beatable[hashOf(`${seed}|open|${r}`) % beatable.length];
    open += 1;
  }
  return moves;
}

/* One round: the player's pick against the creature's move. */
export function roundOf(pick, move) {
  if (BEATS[pick] === move) return 'won';
  if (BEATS[move] === pick) return 'lost';
  return 'draw';
}

/* The bout so far: each round as it fell, the tally, and the outcome —
   `open` while neither side has two and rounds remain. */
export function bout(picks, moves) {
  const rounds = [];
  let won = 0, lost = 0, outcome = 'open';
  for (let r = 0; r < Math.min(picks.length, ROUNDS); r += 1) {
    const result = roundOf(picks[r], moves[r]);
    rounds.push({ pick: picks[r], move: moves[r], result });
    if (result === 'won') won += 1;
    if (result === 'lost') lost += 1;
    if (won >= TO_WIN) { outcome = 'won'; break; }
    if (lost >= TO_WIN) { outcome = 'lost'; break; }
    if (rounds.length === ROUNDS) outcome = won > lost ? 'won' : 'lost';
  }
  return { rounds, won, lost, outcome };
}
