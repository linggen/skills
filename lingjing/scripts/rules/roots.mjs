// rules/roots.mjs — 灵根 from the 生辰: the three pillars' six characters, each an element.
// Part of the rules engine; rules.mjs is its one door.
//
// At the 入门仪式 the abbot asks the birthday (year, month, day — no hour) on
// the page's own card; it is read here, on this machine, and never kept:
// only the roots it gives are. The year pillar turns at 立春, the month
// pillar at each month's 节, the day pillar is its place in the sixty. Of the
// six characters' elements, a lone one on the year branch is the family's,
// not the player's; one element four times or more crowds out every lone
// one; what is left are the roots, the most first (traits.json `_born` has
// the measured spread). Skipped, the same reckoning runs on a day drawn by
// the save's start — the stone reads them itself.
import { cardCatalog } from './cards.mjs';
import { jdn, prng } from './fortune.mjs';
import { hashOf } from './travel.mjs';

const mod = (n, m) => ((n % m) + m) % m;

/* The six elements of a birthday (YYYY-MM-DD), year stem first: year stem,
   year branch, month stem, month branch, day stem, day branch. Null for a
   day that is not one, or outside the 立春 table. */
export function pillarsOf(content, birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  const f = content.traits.fate, lichun = Number(f.lichun.days[y - f.lichun.from]);
  if (!lichun || !f.branches || !f.jie) return null;
  const stem = i => f.stems[i].element, branch = i => f.branches[i];
  const year = mo > 2 || (mo === 2 && d >= lichun) ? y : y - 1;
  const ys = mod(year - 4, 10), yb = mod(year - 4, 12);
  // The month from 寅 (0), turning at its 节: before the day, the month before.
  const jie = mo === 2 ? lichun : f.jie[mo - 1];
  const mi = mod(mo - 2 - (d < jie ? 1 : 0), 12);
  const ms = mod((ys % 5) * 2 + 2 + mi, 10), mb = mod(mi + 2, 12);
  const x = jdn(y, mo, d);
  return [stem(ys), branch(yb), stem(ms), branch(mb), stem(mod(x + 9, 10)), branch(mod(x + 1, 12))];
}

/* The roots in six elements: counted; a lone year branch dropped; one
   element four times or more leaves only the elements seen twice. The most
   first, ties in the order of the five. */
export function rootsFrom(content, six) {
  const order = Object.keys(content.traits.elements), count = {};
  for (const e of six) count[e] = (count[e] ?? 0) + 1;
  const max = Math.max(...Object.values(count));
  const kept = Object.keys(count).filter(e => (max >= 4 ? count[e] >= 2 : !(count[e] === 1 && six[1] === e)));
  return kept.sort((a, b) => count[b] - count[a] || order.indexOf(a) - order.indexOf(b));
}

export const bornRoots = (content, birth) => {
  const six = pillarsOf(content, birth);
  return six ? rootsFrom(content, six) : null;
};

/* Skipped: a day drawn by the save's start (1950–2009), so a reload reads the
   same roots and the spread is the birthdays' own. */
export function drawnRoots(content, state) {
  const rand = prng(hashOf(`${state.created ?? ''}|roots`));
  const y = 1950 + Math.floor(rand() * 60), mo = 1 + Math.floor(rand() * 12), d = 1 + Math.floor(rand() * 28);
  return bornRoots(content, `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}

/* The name the roots go by: 天 · 地 · 真 · 伪, by how many. */
export const rootName = (content, roots, lang) => {
  const pair = content.traits.names[String(roots?.length ?? 0)];
  return pair ? pair[lang] ?? pair.zh : '';
};

/* The first cards a player holds (cards.json `starter`): the ones of their
   roots and the ones no root claims — four roots come to exactly ten — and,
   fewer roots, the starter's 灵兽 of other elements to fill toward ten, since
   a beast answers anyone who holds it (cards.mjs usable). A 功法 of a root
   they lack never comes in. */
export function starterFor(content, roots) {
  const catalog = cardCatalog(content), have = new Set(roots ?? []), starter = content.cards?.starter ?? [];
  const own = starter.filter(id => catalog[id] && (!catalog[id].element || have.has(catalog[id].element)));
  const beasts = starter.filter(id => catalog[id]?.kind === 'minion' && !own.includes(id));
  return [...own, ...beasts].slice(0, Math.max(own.length, 10));
}
