// rules/almanac.mjs — 黄历: the day's 干支, its 建除 officer, the 冲 and the 煞, and the officer's 宜 · 忌.
// Part of the rules engine; rules.mjs is its one door. Pure, deterministic, no network: a civil date in, facts out
// (问签 v1, Hanli 2026-11-02: 「可以, 按你说的做」). The tables are worlds/<id>/qian.json `almanac`, each cited there.
//
//   日柱  — the day's place in the sixty, from its Julian Day Number (甲子 = 1949-10-01, as every almanac has it);
//   月建  — the month branch from the 节: 立春 opens 寅, every 30° of the sun after it the next branch. The day a 节
//           falls on belongs to the new month (the 节 day's 干支 month, as the printed almanacs label it);
//   年柱  — turns at 立春 (fortune.mjs fateOf reads the year the same way);
//   建除  — 建 is the day whose branch is the month's (協紀辨方書 卷四: 「正月建寅，則寅日起建，順行十二辰」), so at
//           each 节 one officer stands two days running (「每月交節，則疊兩值日」);
//   冲    — the branch opposite the day's, and its animal;
//   煞    — 三煞 by the day's branch: 申子辰 南 · 寅午戌 北 · 亥卯未 西 · 巳酉丑 东.
import { jdOfDay, sunLongitude } from '../calendar.js';

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const mod = (n, m) => ((n % m) + m) % m;
const deltaT = y => (69 + 0.35 * (y - 2026)) / 86400;

/* The sun at the end of a civil day in Beijing time (calendar.js termOf reads a 节 the same way). */
const sunAtDayEnd = (y, m, d) => sunLongitude(jdOfDay(y, m, d) - 0.5 - 8 / 24 + deltaT(y) + 1);

/* The month from 寅 (0 = 寅, 立春 → 惊蛰; 11 = 丑, 小寒 → 立春): a 节 falling during the day makes it the new month's. */
export const monthIndexOf = ({ y, m, d }) => Math.floor(mod(sunAtDayEnd(y, m, d) - 315, 360) / 30);

/* The four facts the rest is read from — indices into the stems (甲 0) and branches (子 0). */
export function pillarsOfDay({ y, m, d }) {
  const x = jdOfDay(y, m, d), mi = monthIndexOf({ y, m, d });
  // Before 立春 (the 子 and 丑 months of January and February), the year is still the last one.
  const year = m <= 2 && mi >= 10 ? y - 1 : y;
  const ys = mod(year - 4, 10), yb = mod(year - 4, 12);
  return {
    year: { stem: ys, branch: yb },
    month: { stem: mod((ys % 5) * 2 + 2 + mi, 10), branch: mod(mi + 2, 12) },
    day: { stem: mod(x + 9, 10), branch: mod(x + 1, 12) },
  };
}
export const ganzhi = p => STEMS[p.stem] + BRANCHES[p.branch];

/* 三煞 by the day's branch group. */
const SHA = { 8: 'south', 0: 'south', 4: 'south', 2: 'north', 6: 'north', 10: 'north', 11: 'west', 3: 'west', 7: 'west', 5: 'east', 9: 'east', 1: 'east' };

const pickOf = (pair, lang) => (pair && typeof pair === 'object' ? pair[lang] ?? pair.zh : pair);

/* The day's 黄历 as facts: `book` is qian.json's `almanac`, `zodiac` traits.json's twelve (子 = 鼠 first). */
export function almanacOf(book, zodiac, day, lang = 'zh') {
  if (!book || !day) return null;
  const p = pillarsOfDay(day);
  const officer = book.officers[mod(p.day.branch - p.month.branch, 12)];
  const chong = mod(p.day.branch + 6, 12), sha = SHA[p.day.branch];
  const words = list => (list ?? []).map(id => ({ id, name: pickOf(book.acts?.[id], lang) ?? id }));
  return {
    ganzhi: { year: ganzhi(p.year), month: ganzhi(p.month), day: ganzhi(p.day) },
    officer: { id: officer.id, name: pickOf(officer.name, lang) },
    chong: { branch: BRANCHES[chong], zodiac: zodiac?.[chong]?.id ?? null, name: pickOf(zodiac?.[chong], lang) ?? null },
    sha: { id: sha, name: pickOf(book.directions?.[sha], lang) ?? sha },
    yi: words(officer.yi),
    ji: words(officer.ji),
  };
}

export { BRANCHES, STEMS };
