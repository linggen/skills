// rules/engine.mjs — the fight engine's stamp: what the page plays a fight
// with and what the rules replay it with must be the same code and cards.
// A page left open across an install (2026-10-15) played the old battle.js
// and the rules replayed the new one: the win was refused 「这一战没记上」 and
// the stage went blank. The page keeps the stamp its first Look carried; a
// duel answer with another one means the page is older than the rules, and it
// reloads into the same fight (the save holds it open, its deal kept).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BATTLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'battle.js');

/* FNV-1a, hex: a stamp, not a secret. */
function fnv(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

let memo = null;
/* The stamp of battle.js and the world's card rows, once per process. */
export function fightStamp(content) {
  const cards = content?.cards ?? null;
  if (memo?.cards === cards) return memo.stamp;
  let code = '';
  try { code = fs.readFileSync(BATTLE, 'utf8'); } catch { /* no file: the cards alone */ }
  memo = { cards, stamp: `${fnv(code)}${fnv(JSON.stringify(cards))}` };
  return memo.stamp;
}
