// rules/dandu.mjs — 丹毒 and 补转 (design.md § 丹药; story DESIGN § 六·五: 下品吃多了积毒，体力上限一时降低，
// 闭关可排；上品无毒；九转反能化毒). Part of the rules engine; rules.mjs is its one door.
//
// A pill eaten leaves the turns its furnace left out owing (`state.dandu`, turns): balance.json `dandu.owed` by
// its 转; a pill of `clears` 转 or more clears them all. Each turn owed takes a little off the top of the 体力 pool
// (state.mjs staminaMax). 闭关 is 补转: the body makes the turns up, `cure_per_hour` an hour of any focus. Every
// door that eats a pill calls eatPill — 服用 from the pouch, the 闭关 pill, a breakthrough's pill — so the rule
// stays one place. The 丹囊's fight pills do not come through here (balance.json `_dandu`).
import { pick, staminaMax } from '../state.mjs';
import { itemOf } from './errands.mjs';

const RULE = content => content.balance?.dandu ?? null;
const turnsOf = state => Math.max(0, Number(state.dandu) || 0);

/* A pill eaten, on the state in hand: the turns it leaves owing, or the old ones it clears.
   Returns what changed ({ owed } or { cleared }), or null when nothing did. */
export function eatPill(content, s, id) {
  const D = RULE(content), item = itemOf(content, id);
  if (!D || item?.kind !== 'pill' || !item.zhuan) return null;
  const had = turnsOf(s);
  if (item.zhuan >= (D.clears ?? Infinity)) {
    if (!had) return null;
    delete s.dandu;
    return { cleared: had };
  }
  const owed = D.owed?.[item.zhuan] ?? 0;
  if (!owed) return null;
  s.dandu = had + owed;
  return { owed };
}

/* 闭关 · 补转: `hours` of sitting make up their turns, on the state in hand. Returns the turns made up. */
export function cureDandu(content, s, hours) {
  const D = RULE(content), had = turnsOf(s);
  if (!D || !had || !(hours > 0)) return 0;
  const made = Math.min(had, Math.floor(hours * (D.cure_per_hour ?? 0)));
  const left = had - made;
  if (left > 0) s.dandu = left; else delete s.dandu;
  return made;
}

const SAY = {
  zh: (n, cut) => `丹毒未清：还欠${n}转，体力上限少了${cut}。闭关可补。`,
  en: (n, cut) => `Pill poison: ${n} turn${n === 1 ? '' : 's'} still owed; the stamina pool is ${cut} short at the top. Seclusion makes them up.`,
};
/* Look's `dandu`: the turns owed, what they take off the pool, the hours of 闭关 that clear them, in the world's words. */
export function danduBrief(content, state) {
  const D = RULE(content), turns = turnsOf(state);
  if (!D || !turns) return null;
  const cut = content.rewards.stamina.max - staminaMax(content, state);
  return { turns, cut, hours: Math.ceil(turns / Math.max(1, D.cure_per_hour ?? 1)), say: pick({ zh: SAY.zh(turns, cut), en: SAY.en(turns, cut) }, state.lang) };
}
