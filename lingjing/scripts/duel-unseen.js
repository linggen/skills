// Determinize hidden cards from either seat without changing the visible position.
import { shuffle, simCopy } from './battle.js';

// `blind`: the hidden cards are put in one order before the shuffle, so the copy cannot depend on the true hidden order (the lines,
// fightline.js). Without it the copy is shuffled from the order they lie in — the coach's draw, as it has always been (duelcoach.js).
export function unseen(st, seed, who = 'you', { blind = false } = {}) {
  const order = xs => (blind ? [...xs].sort() : [...xs]);
  const copy = simCopy(st);
  const other = who === 'you' ? 'foe' : 'you';
  const handSize = copy[other].hand.length;
  const pool = shuffle(order([...copy[other].hand, ...copy[other].deck]), `${seed}|${other}`);
  copy[other].hand = pool.slice(0, handSize);
  copy[other].deck = pool.slice(handSize);
  copy[who].deck = shuffle(order(copy[who].deck), `${seed}|${who}`);
  return copy;
}
