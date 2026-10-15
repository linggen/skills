// The human-like player for 讲堂三日 · 掐、咒、扣 (games/qiajue.js; tools/board-bots.mjs).
// Day one he knows the marks (火午 水子 木卯 金酉 土中); day two the chant in order; day three, grip when the sweat shows.
import { SPELLS } from '../qiajue.js';

export function bot(s) {
  if (s.won) return null;
  if (['ready', 'chant-ready', 'kou-ready', 'kou-out'].includes(s.phase)) return { g: 'start' };
  if (s.phase === 'pinch') return { g: 'pinch', w: SPELLS.find((x) => x.id === s.order[s.k]).wen };
  if (s.phase === 'chant') return { g: 'say', i: String(s.said) };
  if (s.phase === 'kou' && s.note === 'sweat') return { g: 'grip' };
  return null;
}
