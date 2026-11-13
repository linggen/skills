// Determinize hidden cards from either seat without changing the visible position.
import { shuffle, simCopy } from './battle.js';

export function unseen(st, seed, who = 'you') {
  const copy = simCopy(st);
  const other = who === 'you' ? 'foe' : 'you';
  const handSize = copy[other].hand.length;
  const pool = shuffle([...copy[other].hand, ...copy[other].deck].sort(), `${seed}|${other}`);
  copy[other].hand = pool.slice(0, handSize);
  copy[other].deck = pool.slice(handSize);
  copy[who].deck = shuffle([...copy[who].deck].sort(), `${seed}|${who}`);
  return copy;
}
