// The human-like player for 格斗 (games/fighter.js; tools/board-bots.mjs): it reads what a person reads — her point
// at his throat, the green in her palm going dim, her blade drawn back — and answers a beat late, as a hand does.
// v2 (10-27): it chains 拳 拳 腿 when the first lands, throws 掌心火 from range and the 绝 when its 气 is full, as the
// phone's buttons give them (技 · 绝), so the playtest sees every new move.
import { FOE, QI } from '../fighter/core.js';

const side = (s) => s.order ?? (Math.sign(s.foe.x - s.me.x) || 1);

/** One look at the bout, one hand (or none). `see.lead`: how late the hand lands. */
export function bot(s, see = {}) {
  if (!s?.live || s.end) return null;
  const lead = see.lead ?? 200, t = s.t, me = s.me, foe = s.foe, d = Math.abs(foe.x - me.x), sd = side(s);
  const M = s.R?.foe?.moves ?? FOE.moves;
  if (s.in.crouch) return { g: 'crouch', on: false };
  // Her point at his throat: wait out the guard, then step in on the push.
  if (s.edge) {
    if (s.in.block) return { g: 'block', on: false };
    if (s.in.dir) return { g: 'walk', dir: 0 };
    return s.edge.phase === 'tell' ? { g: 'ying' } : null;
  }
  // The palm: the hook as the green dims (it lands a startup later), or after it lands while she is still loose.
  if (s.palm) {
    if (s.in.block) return { g: 'block', on: false };
    const e = t - s.palm.at, hookAt = M.palm.glow - 170 - lead;
    if (s.palm.phase === 'glow' && e >= hookAt && !me.act) return { g: 'heavy' };
    if ((s.palm.phase === 'hold' || s.palm.phase === 'after') && !me.act) return { g: 'heavy' };
    return s.in.dir ? { g: 'walk', dir: 0 } : null;
  }
  // Ice coming: hop it.
  if (s.shots.some((x) => x.who === 'foe' && Math.abs(x.x - me.x) < 150 && Math.sign(x.vx) === -sd) && !me.air) return { g: 'jump' };
  // Her blade drawn back within reach: stand it off.
  const a = foe.act, coming = a && ['poke', 'thrust', 'jianqi'].includes(a.k) && t - a.at < a.m.startup + a.m.active && d < (M[a.k]?.reach ?? 240) + 40;
  if (coming) return s.in.block ? null : { g: 'block', on: true };
  if (s.in.block) return { g: 'block', on: false };
  // A chain: the first 拳 landed and she reels — 拳 again, then 腿.
  if (s.combo.n >= 1 && foe.stun > t && d < 140) return { g: s.combo.n >= 2 ? 'heavy' : 'light' };
  if (me.qi >= QI && d < 300 && !me.act) return { g: 'super' };
  // Past twenty moves, lead her to the corner with the slick (the book's: 「往台子的西北角上挪了七步」), backing off as he blocks.
  const toOil = -1, atEdge = me.x - (s.R?.stage?.left ?? 40) < 70;
  if (foe.moves >= (M.edge.after ?? 24) - 6 && sd === -toOil && !atEdge) return s.in.dir === toOil ? null : { g: 'walk', dir: toOil };
  if (me.cdPf <= 0 && d > 240 && d < 520 && !me.act) return s.in.dir ? { g: 'walk', dir: 0 } : { g: 'skill' };
  if (d > 120) return s.in.dir === sd ? null : { g: 'walk', dir: sd };
  if (s.in.dir) return { g: 'walk', dir: 0 };
  if (me.act) return null;
  return { g: 'light' };
}
