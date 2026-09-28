// rules/roots.mjs — 灵根 from the 生辰: the three pillars' six characters, each an element.
// Part of the rules engine; rules.mjs is its one door.
//
// The hero is always 五行杂灵根 — all five roots, each weak (Hanli,
// 2026-09-28: 「别跟凡人一样, 5灵根也挺好」). At the 入门仪式 the abbot asks the
// birthday (year, month, day — no hour) on the page's own card; it is read
// here, on this machine, and never kept: only what it gives is. The birthday
// decides only the DOMINANT root — the brightest colour on the stone: the
// element seen most in the six characters (the year pillar turns at 立春, the
// month pillar at each month's 节, the day pillar is its place in the sixty),
// a tie broken by a seed from the save's start. Skipped, the stone shows five
// even colours and none leads. The 天 · 地 · 真 · 伪 names stay in traits.json
// only for saves read under the retired rules.
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

/* The dominant element of six: the one seen most, a tie broken by `seed`
   (the save's start) so a reload reads the same. */
export function dominantFrom(content, six, seed = '') {
  const order = Object.keys(content.traits.elements), count = Object.fromEntries(order.map(e => [e, 0]));
  for (const e of six) count[e] += 1;
  const most = Math.max(...Object.values(count)), top = order.filter(e => count[e] === most);
  return top.length === 1 ? top[0] : top[Math.floor(prng(hashOf(`${seed}|roots`))() * top.length)];
}

/* All five roots, in the order of the five. */
export const allFive = content => Object.keys(content.traits.elements);

/* The birthday's reading: the five roots and the one that leads — or null
   for a day that is not one. Skipped: the five, none leading. */
export const bornRoots = (content, birth, seed = '') => {
  const six = pillarsOf(content, birth);
  return six ? { roots: allFive(content), main: dominantFrom(content, six, seed) } : null;
};
export const stoneRoots = content => ({ roots: allFive(content), main: null });

/* The root that leads: the dominant one of a five-root save (null when the
   stone read five even); an old save read under the retired rules leads with
   its first. */
export const mainRoot = state => (state?.traits?.length === 5 ? state.root_main ?? null : state?.traits?.[0] ?? null);

/* The roots an affinity reads (渡劫's 五行, the day's chance): five weak roots
   count only through the one that leads; an old save's roots as they are. */
export const strongRoots = state => (state?.traits?.length === 5 ? (state.root_main ? [state.root_main] : []) : state?.traits ?? []);

/* The name the roots go by, by how many — 五行杂灵根, and which leads (an old
   save read under the retired rules keeps its 天 · 地 · 真 · 伪). */
export const rootName = (content, state, lang) => {
  const roots = state?.traits, pair = content.traits.names[String(roots?.length ?? 0)];
  if (!pair) return '';
  const name = pair[lang] ?? pair.zh, main = roots.length === 5 ? state.root_main : null;
  if (!main) return name;
  const el = content.traits.elements[main];
  return lang === 'en' ? `${name} · ${el.en} leads` : `${name} · ${el.zh}为主`;
};

/* The first cards a player holds (cards.json `starter`), ten at most: the
   ones of their roots and the ones no root claims — four roots and five come
   to the same ten (the starter's 金 cards stand last and fall off) — and,
   fewer roots, the starter's 灵兽 of other elements to fill toward ten, since
   a beast answers anyone who holds it (cards.mjs usable). A 功法 of a root
   they lack never comes in. */
export function starterFor(content, roots) {
  const catalog = cardCatalog(content), have = new Set(roots ?? []), starter = content.cards?.starter ?? [];
  const own = starter.filter(id => catalog[id] && (!catalog[id].element || have.has(catalog[id].element)));
  const beasts = starter.filter(id => catalog[id]?.kind === 'minion' && !own.includes(id));
  return [...own, ...beasts].slice(0, 10);
}
