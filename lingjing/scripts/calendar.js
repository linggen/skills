// calendar.js — the player's real calendar, reckoned on the device (no
// network): the festival of the day and the 节气 (design.md § 真实世界).
// Pure; the rules (Look) and the page both import it.
//
// Lunar dates come from a table (LUNAR, 2025–2051, written by
// tools/lunar-table.mjs from the sky in Beijing time); the 二十四节气 by
// formula — the sun's apparent longitude (Meeus ch. 25, ~0.01°), the day in
// Beijing time the sun crosses the next 15°.

/* Day numbers: the Julian Day Number of a civil date (noon), and back. */
export function jdOfDay(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
export function dayOfJd(n) {
  const a = n + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
  const d0 = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d0 / 4), m0 = Math.floor((5 * e + 2) / 153);
  return { y: 100 * b + d0 - 4800 + Math.floor(m0 / 10), m: m0 + 3 - 12 * Math.floor(m0 / 10), d: e - Math.floor((153 * m0 + 2) / 5) + 1 };
}

const rad = Math.PI / 180;
/// The sun's apparent longitude in degrees at a Julian Day (TT).
export function sunLongitude(jde) {
  const T = (jde - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const om = (125.04 - 1934.136 * T) * rad;
  return (((L0 + C - 0.00569 - 0.00478 * Math.sin(om)) % 360) + 360) % 360;
}

/// The twenty-four terms from 春分 (0°), 15° apart.
export const TERMS = [
  ['chunfen', '春分', 'Spring Equinox'], ['qingming', '清明', 'Clear and Bright'], ['guyu', '谷雨', 'Grain Rain'],
  ['lixia', '立夏', 'Start of Summer'], ['xiaoman', '小满', 'Grain Buds'], ['mangzhong', '芒种', 'Grain in Ear'],
  ['xiazhi', '夏至', 'Summer Solstice'], ['xiaoshu', '小暑', 'Minor Heat'], ['dashu', '大暑', 'Major Heat'],
  ['liqiu', '立秋', 'Start of Autumn'], ['chushu', '处暑', 'End of Heat'], ['bailu', '白露', 'White Dew'],
  ['qiufen', '秋分', 'Autumn Equinox'], ['hanlu', '寒露', 'Cold Dew'], ['shuangjiang', '霜降', 'Frost\'s Descent'],
  ['lidong', '立冬', 'Start of Winter'], ['xiaoxue', '小雪', 'Minor Snow'], ['daxue', '大雪', 'Major Snow'],
  ['dongzhi', '冬至', 'Winter Solstice'], ['xiaohan', '小寒', 'Minor Cold'], ['dahan', '大寒', 'Major Cold'],
  ['lichun', '立春', 'Start of Spring'], ['yushui', '雨水', 'Rain Water'], ['jingzhe', '惊蛰', 'Awakening of Insects'],
].map(([id, zh, en]) => ({ id, name: { zh, en } }));

const deltaT = (y) => (69 + 0.35 * (y - 2026)) / 86400;

/// The 节气 that falls on this date (Beijing time), or null.
export function termOf(y, m, d) {
  const start = jdOfDay(y, m, d) - 0.5 - 8 / 24 + deltaT(y);
  const a = Math.floor(sunLongitude(start) / 15), b = Math.floor(sunLongitude(start + 1) / 15);
  return a === b ? null : TERMS[b];
}

/* Per lunar year: 正月初一 as MMDD, the leap month in hex (0 none), then each
   month in order, 1 = 30 days, 0 = 29 (tools/lunar-table.mjs). 2027 and 2030's
   正月初一 fall minutes either side of Beijing midnight; ICU's own Chinese
   calendar gets both a day wrong, this table has them as published. */
export const LUNAR = {
  2025: '012961010010101110', 2026: '02170101001001110', 2027: '02060110100100110', 2028: '012651110100100110',
  2029: '02130110101010011', 2030: '02030010110101010', 2031: '012330110101101010', 2032: '02110100101101101',
  2033: '0131b0100101011101', 2034: '02190010010101101', 2035: '02080101001001101', 2036: '012861101001001011',
  2037: '02150110100100101', 2038: '02040110101010010', 2039: '012451101101010100', 2040: '02120101101011010',
  2041: '02010010101101101', 2042: '012220100101011011', 2043: '02100010010011011', 2044: '013071010010010111',
  2045: '02170101001001011', 2046: '02060101010100101', 2047: '012651011010100101', 2048: '02140011011010010',
  2049: '02020101011011010', 2050: '012330101010110110', 2051: '02110100100110111',
};

/// The lunar date of a civil date — {year, month, day, leap} — or null
/// outside the table.
export function lunarOf(y, m, d, rows = LUNAR) {
  const n = jdOfDay(y, m, d);
  for (const year of [y, y - 1]) {
    const row = rows[year];
    if (!row) continue;
    let at = jdOfDay(year, Number(row.slice(0, 2)), Number(row.slice(2, 4)));
    if (n < at) continue;
    const leap = parseInt(row[4], 16), lens = row.slice(5);
    let month = 0;
    for (let i = 0; i < lens.length; i++) {
      const isLeap = leap > 0 && i === leap; // the leap month follows month `leap`
      if (!isLeap) month++;
      const len = lens[i] === '1' ? 30 : 29;
      if (n < at + len) return { year, month, day: n - at + 1, leap: isLeap };
      at += len;
    }
  }
  return null;
}

/// A lunar date's civil date {y, m, d} (the regular month, never the leap).
export function solarOf(year, month, day, rows = LUNAR) {
  const row = rows[year];
  if (!row) return null;
  const leap = parseInt(row[4], 16), lens = row.slice(5);
  let at = jdOfDay(year, Number(row.slice(0, 2)), Number(row.slice(2, 4))), n = 0;
  for (let i = 0; i < lens.length; i++) {
    const isLeap = leap > 0 && i === leap;
    if (!isLeap) n++;
    if (n === month && !isLeap) return dayOfJd(at + day - 1);
    at += lens[i] === '1' ? 30 : 29;
  }
  return null;
}

/* The festivals by date: lunar (month/day) and civil. 除夕 is the last day of
   the year; 春节's span runs 除夕 → 元宵, one festival (design: the custom). */
const LUNAR_DAYS = { '1/1': 'chunjie', '1/15': 'yuanxiao', '5/5': 'duanwu', '7/7': 'qixi', '8/15': 'zhongqiu', '9/9': 'chongyang', '12/8': 'laba' };
const CIVIL_DAYS = { '1/1': 'yuandan', '12/24': 'shengdan', '12/25': 'shengdan' };

/// Today's festival — {id, key, gift, day?} — or null. `key` names this
/// year's one (its task is done once); `gift` the span its gift belongs to
/// (除夕 → 元宵 is one 春节); `day` is where in that span it stands.
export function festivalOn(y, m, d, rows = LUNAR) {
  const civil = CIVIL_DAYS[`${m}/${d}`];
  if (civil) return { id: civil, key: `${civil}-${y}`, gift: `${civil}-${y}` };
  const l = lunarOf(y, m, d, rows);
  if (!l) return null;
  const n = jdOfDay(y, m, d), next = rows[l.year + 1];
  const spring = (id, year, day = null) => ({ id, key: `${id}-${year}`, gift: `chunjie-${year}`, ...(day ? { day } : {}) });
  if (next && n === jdOfDay(l.year + 1, Number(next.slice(0, 2)), Number(next.slice(2, 4))) - 1) return spring('chuxi', l.year + 1);
  if (l.leap) return null;
  const id = LUNAR_DAYS[`${l.month}/${l.day}`];
  if (id === 'chunjie' || id === 'yuanxiao') return spring(id, l.year);
  if (id) return { id, key: `${id}-${l.year}`, gift: `${id}-${l.year}` };
  if (l.month === 1 && l.day < 15) return spring('chunjie', l.year, l.day);
  return null;
}

/// The player's local date as {y, m, d}: a Date read in its own time zone.
export const localDay = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

/// A `YYYY-MM-DD` (the page's test override) as {y, m, d}, or null.
export function parseDay(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s ?? '').trim());
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

/// What the calendar says of a day: {date, festival, term, lunar}.
export function dayOf({ y, m, d }, rows = LUNAR) {
  const pad = (x) => String(x).padStart(2, '0');
  const l = lunarOf(y, m, d, rows);
  return { date: `${y}-${pad(m)}-${pad(d)}`, festival: festivalOn(y, m, d, rows), term: termOf(y, m, d), lunar: l && { month: l.month, day: l.day, leap: l.leap } };
}
