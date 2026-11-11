// The sun and the moon in the weather layer (sky-bodies.js): the moon's true phase (checked against the game's own
// lunar calendar), its lit outline, the hour's arc and cross-fade, what each sky lets show — and the layer's place:
// behind every card, in the page's one weather layer. The phone's twin (lib/services/lingjing/sky_bodies.dart) pins the
// same SAMPLES to the same names.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKY_SHOW, SYNODIC, applySky, arcAt, moonAt, moonPath, phaseNameOf, showOf, skyHtml, skyOf, sunShare } from '../scripts/sky-bodies.js';
import { SKY_WORDS, skyMark, wxChipHtml } from '../scripts/sky.js';
import { lunarOf } from '../scripts/calendar.js';
import { KINDS } from '../scripts/rules/weather.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
/// Noon UTC of a date → [date, age in days (2 places), name] — the same table is in the phone's test.
export const SAMPLES = [
  ['2026-01-03', 14.85, 'full'], ['2026-01-18', 29.22, 'new'], ['2026-02-17', 29.53, 'new'], ['2026-03-03', 14.78, 'full'],
  ['2026-06-29', 14.32, 'full'], ['2026-09-26', 14.56, 'full'], ['2026-11-09', 0.19, 'new'], ['2026-11-16', 6.48, 'first-quarter'],
  ['2026-11-24', 14.62, 'full'], ['2026-12-01', 22.4, 'last-quarter'], ['2026-12-09', 0.41, 'new'], ['2026-12-23', 14.1, 'full'],
  ['2027-01-06', 28.33, 'waning-crescent'], ['2027-02-06', 29.38, 'new'], ['2027-02-20', 14.23, 'full'], ['2027-03-22', 14.83, 'full'],
  ['2027-06-20', 16.1, 'waning-gibbous'], ['2027-09-15', 14.34, 'full'], ['2027-10-08', 8.28, 'first-quarter'], ['2027-12-25', 27.32, 'waning-crescent'],
];
const noon = (iso) => Date.parse(`${iso}T12:00:00Z`);

test('the moon: the sample dates keep their ages and names (the phone pins the same table)', () => {
  for (const [d, age, name] of SAMPLES) {
    const m = moonAt(noon(d));
    assert.ok(Math.abs(m.age - age) < 0.006, `${d}: age ${m.age.toFixed(3)} ≠ ${age}`);
    assert.equal(m.name, name, d);
  }
});

test('the moon agrees with the game\'s own lunar calendar on every day of 2026–2027: 初一 new, 十五 · 十六 full', () => {
  const byDay = {};
  for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2028, 0, 1); ms += 86400000) {
    const t = new Date(ms), y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
    const l = lunarOf(y, m, d);
    if (!l) continue;
    // Beijing noon (04:00 UTC): the day's middle, as the calendar reckons it. The moon's age is (lunar day − 1) there.
    const age = moonAt(Date.UTC(y, m - 1, d, 4)).age;
    let dev = age - (l.day - 1);
    if (dev > 15) dev -= SYNODIC;
    if (dev < -15) dev += SYNODIC;
    assert.ok(Math.abs(dev) < 1.6, `${y}-${m}-${d} (${l.month}月${l.day}): ${dev.toFixed(2)} days off`);
    (byDay[`${l.year}-${l.month}${l.leap ? 'r' : ''}`] ??= {})[l.day] = moonAt(Date.UTC(y, m - 1, d, 4));
  }
  const months = Object.values(byDay).filter((m) => m[1] && m[15]);
  assert.ok(months.length >= 23, `${months.length} months checked`);
  for (const m of months) {
    assert.ok(m[1].phase < 0.06 || m[1].phase > 0.94, `初一 new: ${m[1].age.toFixed(2)}`);
    assert.ok(m[15].fraction > 0.9 && m[16].fraction > 0.9, `十五 · 十六 lit: ${m[15].fraction.toFixed(2)}, ${m[16].fraction.toFixed(2)}`);
    assert.ok([14, 15, 16, 17].some((d) => m[d]?.name === 'full'), 'one of 十四…十七 is the full moon');
  }
});

test('the phases: eight names over the cycle, the waxing ones before the full moon', () => {
  const seen = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.99].map(phaseNameOf);
  assert.deepEqual(seen, ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent', 'new']);
  for (const lang of ['zh', 'en']) for (const n of new Set(seen)) assert.ok(SKY_WORDS[lang].moon[n], `${lang} ${n}`);
  for (const n of new Set(seen)) assert.ok([...SKY_WORDS.zh.moon[n]].length <= 4, `${n} fits a chip`);
  assert.deepEqual(['new', 'first-quarter', 'full', 'waning-crescent'].map((n) => SKY_WORDS.zh.moon[n]), ['新月', '上弦', '满月', '残月']);
});

test('the lit outline: waxing lit on the right, waning on the left, the terminator an ellipse', () => {
  assert.equal(moonPath(36, 0), '', 'a new moon has no lit part');
  const arcs = (d) => [...d.matchAll(/A([\d.]+) ([\d.]+) 0 0 (\d) 0 (-?\d+)/g)].map(([, rx, ry, sweep]) => ({ rx: +rx, ry: +ry, sweep: +sweep }));
  // [phase, lit-side sweep, terminator sweep, terminator x-radius]
  const want = [[0.125, 1, 0, 25.46], [0.25, 1, 0, 0], [0.375, 1, 1, 25.46], [0.5001, 0, 0, 36], [0.625, 0, 0, 25.46], [0.75, 0, 0, 0], [0.875, 0, 1, 25.46]];
  for (const [p, side, back, rx] of want) {
    const [lit, term] = arcs(moonPath(36, p));
    assert.equal(lit.sweep, side, `phase ${p}: lit half`);
    assert.equal(lit.rx, 36);
    assert.equal(term.sweep, back, `phase ${p}: terminator`);
    assert.ok(Math.abs(term.rx - rx) < 0.02, `phase ${p}: terminator width ${term.rx}`);
  }
  // A crescent's terminator bulges into the lit side: waxing (lit right) → by the right going up (counter-clockwise, 0).
  assert.equal(arcs(moonPath(36, 0.1))[1].sweep, 0);
  assert.equal(arcs(moonPath(36, 0.9))[1].sweep, 1, 'a waning crescent: by the left going up');
  // The half moons: a straight terminator on the right side's mirror.
  assert.equal(arcs(moonPath(36, 0.25))[0].sweep, 1);
  assert.equal(arcs(moonPath(36, 0.75))[0].sweep, 0);
});

test('day and night by the clock: the sun 6–18 crossing left to right, the moon the night; dusk and dawn cross-fade', () => {
  const at = (hour, extra = {}) => skyOf({ ms: noon('2026-11-24'), hour, ...extra });
  assert.ok(at(12).sun && !at(12).moon, 'noon: the sun only');
  assert.ok(at(23).moon && !at(23).sun, 'night: the moon only');
  assert.ok(at(3).moon && !at(3).sun);
  assert.ok(at(18).sun && at(18).moon, 'dusk: both, crossing');
  assert.ok(at(6).sun && at(6).moon, 'dawn: both');
  assert.ok(sunShare(5) === 0 && sunShare(7) === 1 && sunShare(17) === 1 && sunShare(19) === 0);
  assert.ok(at(17.8).sun.alpha > at(18.2).sun.alpha, 'the sun fades as dusk deepens');
  // Left (east) to right (west): the sun from 6 to 18, then the moon from 18 to 6; highest at the middle.
  assert.ok(at(8).sun.x < at(12).sun.x && at(12).sun.x < at(16).sun.x);
  assert.ok(at(20).moon.x < at(0).moon.x && at(0).moon.x < at(4).moon.x);
  assert.ok(at(12).sun.y < at(8).sun.y && at(12).sun.y < at(16).sun.y, 'higher at noon');
  // Always in the upper part, clear of the middle where the cards stand.
  for (let t = 0; t <= 1; t += 0.05) { const p = arcAt(t); assert.ok(p.x >= 10 && p.x <= 90 && p.y >= 7 && p.y <= 17, JSON.stringify(p)); }
  // The stage's own word wins over the clock (a sealed night, a city's sense): daytime on the stage by night's clock.
  assert.ok(at(23, { isDay: true }).sun && !at(23, { isDay: true }).moon);
  assert.ok(at(12, { isDay: false }).moon && !at(12, { isDay: false }).sun);
  assert.ok(at(12, { isDay: true }).sun, 'agreeing changes nothing');
  // The moon carries the real phase of the date.
  const full = skyOf({ ms: noon('2026-11-24'), hour: 22 }).moon, crescent = skyOf({ ms: noon('2026-11-13'), hour: 22 }).moon;
  assert.equal(full.name, 'full');
  assert.ok(full.fraction > 0.99 && crescent.fraction < 0.25 && crescent.waxing);
});

test('weather decides what shows: clear shows, haze dims, cloud · fog · rain · snow leave a glow, a storm none; no sky in a room', () => {
  for (const k of KINDS) assert.ok(Object.hasOwn(SKY_SHOW, k), `${k} has a row`);
  const sun = (extra) => skyOf({ ms: noon('2026-11-14'), hour: 12, ...extra }).sun;
  assert.equal(sun({ weather: 'clear' }).mode, 'full');
  assert.equal(sun({ weather: 'clear' }).alpha, 1);
  assert.equal(sun({ weather: 'clear', haze: true }).mode, 'dim');
  assert.ok(sun({ weather: 'clear', haze: true }).alpha < 1);
  assert.equal(sun({}).mode, 'full', 'no sky named is a clear one');
  const glow = ['cloudy', 'fog', 'snow', 'rain'];
  for (const k of glow) { const s = sun({ weather: k }); assert.equal(s.mode, 'glow', k); assert.ok(s.alpha > 0 && s.alpha < 0.6, k); }
  assert.ok(sun({ weather: 'rain' }).alpha < sun({ weather: 'cloudy' }).alpha, 'rain hides it more than an overcast');
  assert.equal(sun({ weather: 'storm' }), null);
  assert.deepEqual(showOf('hail'), SKY_SHOW.clear);
  assert.deepEqual(skyOf({ ms: noon('2026-11-14'), hour: 12, none: true }), { sun: null, moon: null }, 'a room, 今线, a sealed instance');
  assert.equal(skyOf({ ms: noon('2026-11-24'), hour: 22, noMoon: true }).moon, null, 'the 中秋 festival draws its own moon');
  // A new moon is a faint disc only, with almost no glow.
  const nu = skyOf({ ms: noon('2026-12-09'), hour: 22 }).moon;
  assert.equal(nu.name, 'new');
  assert.equal(moonPath(36, nu.phase) === '' || nu.fraction < 0.01, true);
});

test('the markup: SVG drawn in code, a disc and its glow, nothing to fetch; rewritten only when it changes', () => {
  const html = skyHtml(skyOf({ ms: noon('2026-11-24'), hour: 22, weather: 'clear' }));
  assert.match(html, /class="skybody sky-moon"[^>]*data-mode="full"/);
  assert.match(html, /<path d="M0 -36A36 36/);
  assert.doesNotMatch(html, /<img|url\((?!#)/, 'no image files');
  assert.doesNotMatch(skyHtml(skyOf({ ms: noon('2026-11-24'), hour: 12, weather: 'rain' })), /<circle r="36"/, 'in rain only a glow');
  const box = { dataset: {}, innerHTML: '', writes: 0 };
  Object.defineProperty(box, 'innerHTML', { set(v) { box.writes += 1; box._h = v; }, get: () => box._h });
  const sky = skyOf({ ms: noon('2026-11-24'), hour: 22 });
  applySky(box, sky);
  applySky(box, sky);
  assert.equal(box.writes, 1);
  applySky(box, skyOf({ ms: noon('2026-11-24'), hour: 12 }));
  assert.equal(box.writes, 2);
});

test('the chip: a clear night is the phase\'s moon, and the title names the phase (zh and en)', () => {
  const w = (name, waxing, extra = {}) => ({ kind: 'clear', where: '蒙山', temp_c: 3, is_day: false, moon: { name, waxing }, ...extra });
  assert.equal(skyMark(w('full', true)), '☽');
  assert.equal(skyMark(w('last-quarter', false)), '☾');
  assert.equal(skyMark({ ...w('full', true), is_day: true }), '☀︎');
  assert.match(wxChipHtml(w('full', false)), /title="蒙山 · 晴 3° · 满月"/);
  assert.match(wxChipHtml(w('waxing-gibbous', true), { lang: 'en' }), /title="蒙山 · Clear 3° · Waxing gibbous"/);
  assert.doesNotMatch(wxChipHtml({ ...w('full', true), is_day: true }), /满月/, 'by day, no phase');
});

test('the layer: one box inside the weather layer, which stays behind every card; painted with it and on a minute', () => {
  const html = fs.readFileSync(path.join(ROOT, 'scripts/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.css'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(html, /<div class="atmos" id="atmos"[^>]*>.*<div class="skybox" id="atmosSky"><\/div><div id="atmosPts">/s, 'the sky is inside .atmos');
  const z = (sel) => Number(new RegExp(`${sel.replace(/\./g, '\\.')} \\{[^}]*z-index: (\\d+)`).exec(css)?.[1]);
  assert.ok(z('.atmos') < z('.slots'), 'the weather layer is behind the cards (Hanli 11-05)');
  assert.match(css, /\.atmos \{[^}]*pointer-events: none/);
  assert.match(css, /body\.fighting \.atmos \{ display: none/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^]*\.atmos \.skybody \{ transition: none; \}/, 'no drift for reduced motion');
  assert.match(page, /applySky\(box, skyOf\(\{ ms: nowMs\(\), isDay: dayOnStage\(\)/, 'one day/night source: the stage\'s');
  assert.match(page, /setInterval\(\(\) => paintSky\(\), 60000\)/);
  assert.match(page, /skyHaze = a\.particles\.includes\('haze'\);\n\s*paintSky\(jin, indoor\);/, 'painted before the early return: the weather layer\'s key does not hold the hour');
});
