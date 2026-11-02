// The human-like player for 格斗 (games/fighter.js; tools/board-bots.mjs): it reads what a person reads — her point
// at his throat, the green in her palm going dim, her blade drawn back — and answers a beat late, as a hand does.
// v2 (10-27): it chains 拳 拳 腿 when the first lands, throws 掌心火 from range and the 绝 when its 气 is full, as the
// phone's buttons give them (技 · 绝), so the playtest sees every new move. v4 (10-31): the 飞剑 and the 符文 as they cool.
// v7 (11-01, KOF '97): her sweep stood off low (↙), her jump-in standing, her throw broken with 重 as her hands come;
// it runs in from far, throws her guard up close, sweeps her long recovery, mixes a low 腿, spends a stock on 爆气 when
// two are full, and guard-cancels out of a pressed guard.
import { FOE, ME, QI } from '../fighter/core.js';

const side = (s) => s.order ?? (Math.sign(s.foe.x - s.me.x) || 1);

/** One look at the bout, one hand (or none). `see.lead`: how late the hand lands. */
export function bot(s, see = {}) {
  if (!s?.live || s.end) return null;
  const lead = see.lead ?? 200, t = s.t, me = s.me, foe = s.foe, d = Math.abs(foe.x - me.x), sd = side(s);
  const M = s.R?.foe?.moves ?? FOE.moves;
  if (s.in.crouch && !s.in.block) return { g: 'crouch', on: false };
  const fa0 = foe.act, Me0 = s.R?.me ?? ME;
  // Held in her throw: 重 breaks it; her hands coming (her reach out): 重 pressed as they land breaks it too.
  if (s.grab) return { g: 'heavy' };
  if (fa0?.k === 'throw' && !fa0.hit && t - fa0.at >= fa0.m.startup - lead + 20) return me.act ? null : { g: 'heavy', dir: 0 };
  // Her sweep coming: the low guard (↙). Her jump in: the guard standing.
  const lowComing = fa0?.k === 'sweep' && t - fa0.at < fa0.m.startup + fa0.m.active && d < (M.sweep?.reach ?? 220) + 40;
  if (lowComing) return s.in.block && s.in.crouch ? null : { g: 'block', on: true, crouch: true };
  if (foe.air && d < 320 && !me.air) return s.in.block && !s.in.crouch ? null : { g: 'block', on: true, crouch: false };
  // A guard pressed hard (its meter near full) with a stock: the guard cancel roll, out from under her.
  if (s.in.block && me.stun > t && (me.gp ?? 0) >= 60 && me.qi >= QI) return { g: 'ying' };
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
  // A flying sword coming down on him: stand it off as it lands.
  if (s.shots.some((x) => x.who === 'foe' && x.kind === 'feijian' && x.land - t < 260 + lead / 2)) return s.in.block ? null : { g: 'block', on: true };
  // A beam no guard stops (马小宝's mirror): his face flushes in its wind-up — be in the air when it comes.
  const fa = foe.act;
  if (fa?.k === 'ice' && M.ice?.pierce && !fa.hit && t - fa.at >= fa.m.startup - 200 - lead / 2 && !me.air) return { g: 'jump' };
  // Ice coming: hop it.
  if (s.shots.some((x) => x.who === 'foe' && Math.abs(x.x - me.x) < 150 && Math.sign(x.vx) === -sd) && !me.air) return { g: 'jump' };
  // Her blade drawn back within reach: stand it off.
  const a = foe.act, coming = a && ['poke', 'thrust', 'jianqi', 'aa'].includes(a.k) && t - a.at < a.m.startup + a.m.active && d < (M[a.k]?.reach ?? 240) + 40;
  if (coming) return s.in.block && !s.in.crouch ? null : { g: 'block', on: true, crouch: false };
  if (s.in.block) return { g: 'block', on: false, crouch: false };
  if (foe.down > t || foe.air) return s.in.dir ? { g: 'walk', dir: 0 } : null; // she is down (no blow lands) or up: wait
  const Mt = Me0.throw, freeFoe = foe.stun <= t && !foe.down;
  // Close, her guard up or her hands idle: the throw (← or → with 重).
  if (Mt && d <= Mt.reach - 4 && freeFoe && (!a || a.k === 'block') && !me.act && !me.air) return { g: 'heavy', dir: sd };
  // Her long blow gone by (her recovery): the sweep under it.
  if (Me0.cheavy && a && ['thrust', 'sweep'].includes(a.k) && t - a.at > a.m.startup + a.m.active && d <= Me0.cheavy.reach - 8 && !me.act) return { g: 'heavy', crouch: true };
  // His reach, as his blows have it (v5, 11-01: the 拳 and 腿 longer, the heavies a 上步 walking at her).
  const Me = s.R?.me ?? ME, far = Me.heavy.reach + (Me.heavy.lunge ?? 0);
  // A chain: the first 拳 landed and she reels — 拳 again, then 腿.
  if (s.combo.n >= 1 && foe.stun > t && d < Me.light.reach + 10) return { g: s.combo.n >= 2 ? 'heavy' : 'light' };
  // A blow of his gone by her: out of her reach a beat, as a hand does (KOF's footsies).
  if (me.act?.whiff && !me.act.landed) return s.in.dir === -sd ? null : { g: 'walk', dir: -sd };
  if (me.qi >= 2 * QI && !(me.max > t) && d < 400 && !me.act) return { g: 'max' }; // two stocks: 爆气, then the 绝 in it
  if ((me.qi >= QI || me.max > t) && d < 300 && !me.act) return { g: 'super' };
  // Past twenty moves, lead her to the corner with the slick, where her point at his throat comes (a foe with no edge
  // push — 卢方 — is driven onto the slick instead, by the blows as they come) (the book's: 「往台子的西北角上挪了七步」), backing off as he blocks.
  const toOil = -1, atEdge = me.x - (s.R?.stage?.left ?? 40) < 70;
  if (s.R?.foe?.ai?.edge !== false && foe.moves >= (M.edge.after ?? 24) - 6 && sd === -toOil && !atEdge) return s.in.dir === toOil ? null : { g: 'walk', dir: toOil };
  // The spells (v4, 10-31): the 飞剑 from range, the 符文 under her while she is busy with a move.
  if (s.R?.me?.feijian && (me.cdFj ?? 0) <= 0 && d > 220 && !me.act && !me.air) return s.in.dir ? { g: 'walk', dir: 0 } : { g: 'feijian' };
  if (s.R?.me?.fuwen && (me.cdFw ?? 0) <= 0 && foe.act && foe.act.k !== 'block' && d < 300 && !me.act && !me.air) return s.in.dir ? { g: 'walk', dir: 0 } : { g: 'fuwen' };
  if (me.cdPf <= 0 && d > 240 && d < 520 && !me.act) return s.in.dir ? { g: 'walk', dir: 0 } : { g: 'skill' };
  if (d > far + 90 && !me.running && !me.act && !s.shots.some((x) => x.who === 'foe')) return { g: 'run' }; // far: run in
  if (d > far - 8) return s.in.dir === sd ? null : { g: 'walk', dir: sd };
  // past his 腿, inside the heavy's step: walking at her, the 上步 heavy
  if (d > Me.lkick.reach - 6) return s.in.dir !== sd ? { g: 'walk', dir: sd } : me.act ? null : { g: 'heavy' };
  if (s.in.dir) return { g: 'walk', dir: 0 };
  if (me.act) return null;
  // a low 腿 now and then, under her guard (every third of her moves)
  if (Me.clkick && foe.moves % 3 === 1 && d <= Me.clkick.reach - 6) return { g: 'lkick', crouch: true };
  return { g: d <= Me.light.reach - 6 ? 'light' : 'lkick' };
}
