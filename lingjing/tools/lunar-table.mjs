// tools/lunar-table.mjs — writes the lunar table scripts/calendar.js reads.
//
//   node tools/lunar-table.mjs            # print the table for 2025–2051
//   node tools/lunar-table.mjs --icu      # and list where ICU's calendar differs
//
// The Chinese calendar reckoned from the sky, in Beijing time (UTC+8): a month
// begins on the day of the new moon (Meeus, Astronomical Algorithms ch. 49,
// good to well under a minute); the month holding 冬至 is the 11th; a 岁 of 13
// months leaps the first month that holds no 中气 (the sun at a multiple of
// 30°, calendar.js `sunLongitude`). Run once and paste; the game never runs it.
// ICU's own Chinese calendar (Intl `-u-ca-chinese`) is off where a new moon
// falls a few minutes before midnight — 2027-02-06 (春节) is one — so it only
// cross-checks.
import { sunLongitude, jdOfDay, dayOfJd } from '../scripts/calendar.js';

const rad = Math.PI / 180;
const sin = (d) => Math.sin(d * rad);
const deltaT = (year) => (69 + 0.35 * (year - 2026)) / 86400; // days, TT − UT

/* The k-th new moon's instant as a Julian Day (TT). */
function newMoon(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  jde += -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F)
    + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M)
    - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
    - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M)
    + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
    + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
    - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165], [251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056], [34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
  ];
  for (const [a, c] of A) jde += c * sin(a);
  return jde;
}

/* The Beijing day (a day number, calendar.js) an instant (JD, TT) falls on. */
const bjDay = (jde) => {
  const ut = jde - deltaT(2000 + (jde - 2451545) / 365.25);
  return Math.floor(ut + 0.5 + 8 / 24);
};

/* The instant (JD, TT) the sun reaches `deg`, near `guess`, by bisection. */
function sunAt(deg, guess) {
  let lo = guess - 20, hi = guess + 20;
  const past = (jd) => ((sunLongitude(jd) - deg + 540) % 360) - 180 >= 0;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (past(mid)) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/* 冬至 of a Gregorian year, as a Beijing day number. */
const dongzhi = (year) => bjDay(sunAt(270, jdOfDay(year, 12, 21) + 0.5));

/* Every new moon's Beijing day from late `y0 - 1` to early `y1 + 1`. */
function moons(y0, y1) {
  const out = [];
  let k = Math.floor((y0 - 1 - 2000) * 12.3685);
  for (;; k++) {
    const d = bjDay(newMoon(k));
    if (d > jdOfDay(y1 + 1, 3, 1)) break;
    out.push(d);
  }
  return out;
}

/* 中气 days (the sun at a multiple of 30°) across the span. */
function zhongqi(y0, y1) {
  const out = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let m = 1; m <= 12; m++) {
    const deg = (300 + 30 * (m - 1)) % 360; // 大寒 in January … 冬至 in December
    out.push(bjDay(sunAt(deg, jdOfDay(y, m, 20) + 0.5)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/* The months, numbered: [{start, month, leap}] from 冬至(y0-1)'s month on. */
function months(y0, y1) {
  const ms = moons(y0, y1), zq = zhongqi(y0, y1), out = [];
  for (let y = y0 - 1; y <= y1; y++) {
    const a = dongzhi(y), b = dongzhi(y + 1);
    const i = ms.findLastIndex((d) => d <= a), j = ms.findLastIndex((d) => d <= b);
    const leapYear = j - i === 13;
    let leapDone = false, n = 11;
    for (let x = i; x < j; x++) {
      const holds = zq.some((d) => d >= ms[x] && d < ms[x + 1]);
      if (leapYear && !leapDone && !holds && x > i) { out.push({ start: ms[x], month: n, leap: true }); leapDone = true; continue; }
      if (x > i) n = n === 12 ? 1 : n + 1;
      out.push({ start: ms[x], month: n, leap: false });
    }
  }
  return out.map((m, x, all) => ({ ...m, days: all[x + 1] ? all[x + 1].start - m.start : null }));
}

/* Per lunar year: 正月初一 (MMDD), the leap month (0 none), each month 30 (1) or 29 (0). */
export function table(y0 = 2025, y1 = 2051) {
  const ms = months(y0, y1), rows = {};
  for (let y = y0; y <= y1; y++) {
    const at = ms.findIndex((m) => m.month === 1 && !m.leap && dayOfJd(m.start).y === y);
    const next = ms.findIndex((m, x) => x > at && m.month === 1 && !m.leap);
    const run = ms.slice(at, next);
    if (next < 0 || run.some((m) => m.days == null)) continue;
    const { m, d } = dayOfJd(run[0].start);
    rows[y] = `${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}${(run.find((x) => x.leap)?.month ?? 0).toString(16)}${run.map((x) => (x.days === 30 ? 1 : 0)).join('')}`;
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = table();
  console.log(JSON.stringify(rows, null, 1));
  if (process.argv.includes('--icu')) {
    const { lunarOf } = await import('../scripts/calendar.js');
    const f = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
    for (let jd = jdOfDay(2025, 1, 29); jd < jdOfDay(2051, 1, 1); jd++) {
      const { y, m, d } = dayOfJd(jd);
      const parts = Object.fromEntries(f.formatToParts(new Date(Date.UTC(y, m - 1, d))).map((p) => [p.type, p.value]));
      const icu = `${parseInt(parts.month, 10)}${parts.month.endsWith('bis') ? '閏' : ''}/${parts.day}`;
      const l = lunarOf(y, m, d, rows);
      const mine = l ? `${l.month}${l.leap ? '閏' : ''}/${l.day}` : '?';
      if (icu !== mine) console.log(`${y}-${m}-${d} icu ${icu} sky ${mine}`);
    }
  }
}
