// 节日 · 节气 (design.md § 真实世界): the player's real calendar, reckoned on
// the device — the lunar table and the 节气 formula against published dates,
// the festival of a day, festivals.json linted, Look's `today`, and the gift
// paid once per festival per year.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dayOf, festivalOn, jdOfDay, dayOfJd, LUNAR, lunarOf, solarOf, termOf } from '../scripts/calendar.js';
import { atmosClasses, atmosOf, FRAMES, PARTICLES, particlesHtml } from '../scripts/atmos.js';
import { FESTIVAL_IDS, lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, task } from '../scripts/rules.mjs';

const content = loadContent();
const ROOT = path.resolve(import.meta.dirname, '..');
const at = (iso) => new Date(`${iso}T10:00:00`);
const ymd = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const fest = (iso) => festivalOn(...iso.split('-').map(Number))?.id ?? null;
const open = (now) => ({ ...newState(content, 'zh', now), scene: null, place: 'sibei' });

test('day numbers go and come back', () => {
  for (let n = jdOfDay(2025, 1, 1); n < jdOfDay(2051, 12, 31); n += 37) {
    const { y, m, d } = dayOfJd(n);
    assert.equal(jdOfDay(y, m, d), n);
  }
  assert.equal(jdOfDay(2000, 1, 1), 2451545);
});

test('正月初一, 2025–2051, as published (2027 and 2030 fall minutes from midnight)', () => {
  const cny = { 2025: '0129', 2026: '0217', 2027: '0206', 2028: '0126', 2029: '0213', 2030: '0203', 2031: '0123', 2032: '0211', 2033: '0131', 2034: '0219', 2035: '0208', 2036: '0128', 2037: '0215', 2038: '0204', 2039: '0124', 2040: '0212', 2041: '0201', 2042: '0122', 2043: '0210', 2044: '0130', 2045: '0217', 2046: '0206', 2047: '0126', 2048: '0214', 2049: '0202', 2050: '0123', 2051: '0211' };
  for (const [y, mmdd] of Object.entries(cny)) assert.equal(LUNAR[y].slice(0, 4), mmdd, `${y}`);
  // The leap months: 2025 六, 2028 五, 2031 三, 2033 十一, 2036 六, 2039 五, 2042 二, 2044 七, 2047 五, 2050 三.
  const leaps = { 2025: 6, 2028: 5, 2031: 3, 2033: 11, 2036: 6, 2039: 5, 2042: 2, 2044: 7, 2047: 5, 2050: 3 };
  for (let y = 2025; y <= 2051; y++) {
    assert.equal(parseInt(LUNAR[y][4], 16), leaps[y] ?? 0, `${y} leap`);
    assert.equal(LUNAR[y].length - 5, leaps[y] ? 13 : 12, `${y} months`);
    // A year runs to the next 正月初一 exactly.
    if (LUNAR[y + 1]) {
      const days = [...LUNAR[y].slice(5)].reduce((n, b) => n + (b === '1' ? 30 : 29), 0);
      const next = jdOfDay(y + 1, Number(LUNAR[y + 1].slice(0, 2)), Number(LUNAR[y + 1].slice(2, 4)));
      assert.equal(jdOfDay(y, Number(LUNAR[y].slice(0, 2)), Number(LUNAR[y].slice(2, 4))) + days, next, `${y} length`);
    }
  }
});

test('the festivals on their published days', () => {
  assert.equal(fest('2027-02-06'), 'chunjie');
  assert.equal(fest('2027-02-05'), 'chuxi');
  assert.equal(fest('2026-02-17'), 'chunjie');
  assert.equal(fest('2026-02-16'), 'chuxi');
  assert.equal(fest('2026-03-03'), 'yuanxiao');
  assert.equal(fest('2026-06-19'), 'duanwu');
  assert.equal(fest('2026-08-19'), 'qixi');
  assert.equal(fest('2026-09-25'), 'zhongqiu');
  assert.equal(fest('2026-10-18'), 'chongyang');
  assert.equal(fest('2027-01-15'), 'laba');
  assert.equal(fest('2027-09-15'), 'zhongqiu');
  assert.equal(fest('2030-02-03'), 'chunjie');
  assert.equal(fest('2030-02-02'), 'chuxi');
  assert.equal(fest('2050-01-23'), 'chunjie');
  assert.equal(fest('2027-01-01'), 'yuandan');
  assert.equal(fest('2026-12-24'), 'shengdan');
  assert.equal(fest('2026-12-25'), 'shengdan');
  assert.equal(fest('2026-09-29'), null);
  // 初二 to 十四 is still 春节, one span with 除夕 and 元宵: one gift key.
  const mid = festivalOn(2027, 2, 10);
  assert.deepEqual(mid, { id: 'chunjie', key: 'chunjie-2027', gift: 'chunjie-2027', day: 5 });
  assert.equal(festivalOn(2027, 2, 5).gift, 'chunjie-2027');
  assert.equal(festivalOn(2027, 2, 20).gift, 'chunjie-2027');
  assert.notEqual(festivalOn(2027, 2, 5).key, festivalOn(2027, 2, 6).key, 'each day of the span has its own task');
  // A leap month's fifteenth is no festival: 2028 has a leap fifth month.
  const leapFifth = solarOf(2028, 5, 5);
  assert.deepEqual(lunarOf(leapFifth.y, leapFifth.m, leapFifth.d), { year: 2028, month: 5, day: 5, leap: false });
  assert.equal(fest(`${leapFifth.y}-${leapFifth.m}-${leapFifth.d}`), 'duanwu');
  const l = lunarOf(leapFifth.y, leapFifth.m, leapFifth.d + 30);
  assert.equal(l.leap, true);
  assert.equal(festivalOn(leapFifth.y, leapFifth.m, leapFifth.d + 30), null);
});

test('the 二十四节气 by formula, on their published days', () => {
  const terms = {
    '2026-02-04': '立春', '2026-03-20': '春分', '2026-04-05': '清明', '2026-06-21': '夏至', '2026-08-07': '立秋', '2026-09-23': '秋分',
    '2026-10-08': '寒露', '2026-12-22': '冬至', '2027-01-05': '小寒', '2027-02-04': '立春', '2027-12-22': '冬至', '2028-02-04': '立春',
  };
  for (const [iso, name] of Object.entries(terms)) assert.equal(termOf(...iso.split('-').map(Number))?.name.zh, name, iso);
  assert.equal(termOf(2026, 9, 29), null);
  // Every year has all twenty-four, each once.
  for (const y of [2026, 2035, 2050]) {
    const seen = [];
    for (let n = jdOfDay(y, 1, 1); n < jdOfDay(y + 1, 1, 1); n++) { const { m, d } = dayOfJd(n); const t = termOf(y, m, d); if (t) seen.push(t.id); }
    assert.equal(new Set(seen).size, 24, `${y}`);
    assert.equal(seen.length, 24, `${y}`);
  }
});

test('festivals.json: one entry per festival, words in both languages, dressing the page draws, a small gift', () => {
  assert.deepEqual(lint(content).filter((p) => p.startsWith('festival')), []);
  assert.deepEqual(content.festivals.festivals.map((f) => f.id).sort(), [...FESTIVAL_IDS].sort());
  const broken = structuredClone(content);
  broken.festivals.festivals[0].gift.wealth = 99;
  broken.festivals.festivals[1].dressing.frame = 'neon';
  broken.festivals.festivals[2].line = { zh: '只有中文' };
  broken.festivals.festivals.pop();
  const problems = lint(broken).filter((p) => p.startsWith('festival'));
  assert.ok(problems.some((p) => /gift 99 is over/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /unknown frame neon/.test(p)));
  assert.ok(problems.some((p) => /line needs zh and en/.test(p)));
  assert.ok(problems.some((p) => /has no entry/.test(p)));
  // 圣诞 and 元旦 are the 西域胡商's, a wink — never 道统 lore.
  for (const id of ['shengdan', 'yuandan']) assert.match(content.festivals.festivals.find((f) => f.id === id).line.zh, /胡商/);
});

test('Look carries today: the date, a 节气 when one falls, the festival with its line, task and gift', () => {
  const plain = look(open(at('2026-09-29')), content, { now: at('2026-09-29'), quests: [] });
  assert.deepEqual(plain.today, { date: '2026-09-29' });
  const autumn = look(open(at('2026-09-23')), content, { now: at('2026-09-23'), quests: [] });
  assert.deepEqual(autumn.today.term, { id: 'qiufen', name: '秋分' });
  const s = open(at('2027-02-06'));
  const t = look(s, content, { now: at('2027-02-06'), quests: [] }).today;
  assert.equal(t.festival.id, 'chunjie');
  assert.equal(t.festival.name, '春节');
  assert.match(t.festival.line, /春联/);
  assert.equal(t.festival.task.id, 'festival');
  assert.equal(t.festival.task.done, false);
  assert.deepEqual(t.festival.gift, { wealth: 8, given: false });
  assert.deepEqual(t.festival.dressing, { frame: 'chunlian', particles: 'sparks' });
  // Told once a day: the line is gone once the save says so.
  assert.equal(look({ ...s, festival_told: '2027-02-06' }, content, { now: at('2027-02-06'), quests: [] }).today.festival.line, undefined);
  // The page's preview (`--day`) moves only `today`.
  const preview = look(open(at('2026-09-29')), content, { now: at('2026-09-29'), quests: [], day: '2026-12-25' }).today;
  assert.equal(preview.festival.id, 'shengdan');
  assert.match(preview.festival.line, /胡商/);
  // In English, in English.
  assert.equal(look({ ...open(at('2026-12-25')), lang: 'en' }, content, { now: at('2026-12-25'), quests: [] }).today.festival.name, 'Christmas');
});

test('the festival task pays its gift once a year; 除夕 to 元宵 is one gift; before the gate there is none', () => {
  const now = at('2027-02-05');
  let s = open(now);
  const w0 = s.wealth;
  const first = task(s, content, { now, quests: [] }, { action: 'done', id: 'festival' });
  assert.equal(first.result.ok, true);
  assert.equal(first.result.wealth, 8);
  assert.match(first.result.gift, /灵石/);
  s = first.state;
  assert.equal(s.wealth, w0 + 8);
  assert.deepEqual(s.festivals, ['chuxi-2027', 'gift:chunjie-2027']);
  assert.equal(task(s, content, { now, quests: [] }, { action: 'done', id: 'festival' }).result.refused, 'already-done');
  // 初一: its own task, the span's gift already given.
  const day1 = task(s, content, { now: at('2027-02-06'), quests: [] }, { action: 'done', id: 'festival' });
  assert.equal(day1.result.ok, true);
  assert.equal(day1.result.wealth, 0);
  assert.equal(day1.state.wealth, w0 + 8);
  assert.equal(look(day1.state, content, { now: at('2027-02-06'), quests: [] }).today.festival.gift.given, true);
  // No festival, no task.
  assert.equal(task(s, content, { now: at('2027-03-30'), quests: [] }, { action: 'done', id: 'festival' }).result.refused, 'no-festival');
  // Before the prologue's gate 灵石 are shut: the day is kept, no gift.
  const young = newState(content, 'zh', at('2026-12-25'));
  assert.equal(look(young, content, { now: at('2026-12-25'), quests: [] }).today.festival.gift, undefined);
  const kept = task(young, content, { now: at('2026-12-25'), quests: [] }, { action: 'done', id: 'festival' });
  assert.equal(kept.result.wealth, 0);
  assert.equal(kept.state.wealth, young.wealth);
});

test('Ling\'s Look marks the line told (never logged); the page\'s Look does not', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-fest-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(open(at('2026-09-25'))));
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: at('2026-09-25').toISOString() };
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
    assert.match(cli('look').today.festival.line, /中秋/);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).festival_told, undefined, 'the page reads, never marks');
    assert.match(cli('look', '--said=你好', '--for=ling').today.festival.line, /饼/);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).festival_told, '2026-09-25');
    assert.equal(cli('look', '--said=你好', '--for=ling').today.festival.line, undefined);
    assert.equal(fs.existsSync(path.join(data, 'log.jsonl')) && fs.readFileSync(path.join(data, 'log.jsonl'), 'utf8').includes('festival_told'), false);
    // The page's preview reads another day and writes nothing.
    const before = fs.readFileSync(file, 'utf8');
    assert.equal(cli('look', '--day=2027-02-06').today.festival.id, 'chunjie');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the atmosphere: a festival\'s dressing and the weather share one layer', () => {
  const a = atmosOf({ frame: 'chunlian', particles: 'sparks' }, 'snow');
  assert.deepEqual(a, { frame: 'chunlian', particles: ['snow', 'sparks'], weather: 'snow', key: 'chunlian|snow,sparks|snow' });
  assert.deepEqual(atmosClasses(a), ['fest-chunlian', 'wx-snow']);
  assert.deepEqual(atmosOf(null, 'cloudy').particles, []);
  assert.deepEqual(atmosOf({ frame: 'neon', particles: 'confetti' }, 'hail'), { frame: null, particles: [], weather: null, key: '||' });
  const html = particlesHtml(['snow'], 'x');
  assert.equal(html, particlesHtml(['snow'], 'x'), 'the same layer on every redraw');
  assert.equal((html.match(/class="pt"/g) ?? []).length, 36);
  // Every kind the data may name is drawn by the stylesheet, and motion is reduced there.
  const css = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.css'), 'utf8');
  for (const f of FRAMES) assert.match(css, new RegExp(`\\.fest-${f}\\b`), f);
  for (const p of PARTICLES) assert.match(css, new RegExp(`\\.p-${p}\\b`), p);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\.atmos/);
});

test('dayOf names the date the player lives in', () => {
  assert.equal(dayOf(ymd('2026-09-25')).date, '2026-09-25');
  assert.deepEqual(dayOf(ymd('2026-09-25')).lunar, { month: 8, day: 15, leap: false });
});
