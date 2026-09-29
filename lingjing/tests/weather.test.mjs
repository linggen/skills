// 天气 (design.md § 真实世界): the engine's weather sense at the player's
// city, else 蒙山's seasons; Look's `weather` and its one `new`; the page's
// chip, popover and the 名字 card's city row. The skill never goes online.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KINDS, seasonKind, senseReading, weatherBrief } from '../scripts/rules/weather.mjs';
import { cityNote, cityRowHtml, draft, wxChipHtml, wxPopHtml } from '../scripts/sky.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const at = (iso) => new Date(`${iso}T10:00:00`);
const open = (now) => ({ ...newState(content, 'zh', now), scene: null, place: 'sibei' });
const SNOW = { kind: 'snow', code: 71, temp_c: -18.4, is_day: true, city: '哈尔滨', at: 1 };

test('the sense\'s reading is read from LINGGEN_WEATHER; anything else is none', () => {
  assert.deepEqual(senseReading(JSON.stringify(SNOW)), SNOW);
  for (const bad of [undefined, '', 'not json', '{"kind":"hail"}', 'null']) assert.equal(senseReading(bad), null, String(bad));
});

test('蒙山\'s seasons: snow on some winter days and never in summer; the same all day', () => {
  const kinds = (m) => Array.from({ length: 28 }, (_, i) => seasonKind({ y: 2026, m, d: i + 1 }));
  const winter = [...kinds(12), ...kinds(1), ...kinds(2)];
  const snowy = winter.filter((k) => k === 'snow').length;
  assert.ok(snowy > 10 && snowy < winter.length - 20, `${snowy} snowy winter days of ${winter.length}`);
  assert.ok(!kinds(7).includes('snow'));
  assert.ok(kinds(4).includes('rain'));
  for (const k of [...winter, ...kinds(7), ...kinds(10)]) assert.ok(KINDS.includes(k));
  assert.equal(seasonKind({ y: 2026, m: 12, d: 3 }), seasonKind({ y: 2026, m: 12, d: 3 }));
});

test('Look carries the weather: the city\'s when the sense has it, else 蒙山\'s; `new` once per change', () => {
  const s = open(at('2026-12-25'));
  const city = look(s, content, { now: at('2026-12-25'), quests: [], weather: SNOW }).weather;
  assert.deepEqual(city, { kind: 'snow', where: '哈尔滨', temp_c: -18, source: 'city', new: true });
  assert.equal(look({ ...s, weather_told: 'snow' }, content, { now: at('2026-12-25'), quests: [], weather: SNOW }).weather.new, undefined);
  const home = look(s, content, { now: at('2026-07-01'), quests: [], weather: null }).weather;
  assert.equal(home.source, 'season');
  assert.equal(home.where, '蒙山');
  assert.equal(look({ ...s, lang: 'en' }, content, { now: at('2026-07-01'), quests: [], weather: null }).weather.where, 'Mengshan');
  // A clear sky is never news.
  assert.equal(weatherBrief(s, { now: at('2026-07-01'), weather: { ...SNOW, kind: 'clear' } }).new, undefined);
});

test('the command line: the engine\'s reading reaches Look; Ling\'s Look keeps what she was told, the page\'s does not', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-wx-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(open(at('2026-12-25'))));
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: at('2026-12-25').toISOString(), LINGGEN_WEATHER: JSON.stringify(SNOW) };
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
    assert.equal(cli('look').weather.new, true);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).weather_told, undefined);
    assert.equal(cli('look', '--said=你好', '--for=ling').weather.new, true);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).weather_told, 'snow');
    assert.equal(cli('look', '--said=你好', '--for=ling').weather.new, undefined);
    assert.equal(fs.existsSync(path.join(data, 'log.jsonl')) && fs.readFileSync(path.join(data, 'log.jsonl'), 'utf8').includes('weather_told'), false);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the page: a chip with the sky, a popover to set or change the city, the 名字 card\'s row', () => {
  assert.equal(wxChipHtml(null), '');
  const chip = wxChipHtml({ kind: 'snow', where: '哈尔滨', temp_c: -18 });
  assert.match(chip, /data-wx[^-]/);
  assert.match(chip, /哈尔滨 · 雪 -18°/);
  assert.match(wxChipHtml({ kind: 'rain', where: 'Mengshan' }, { lang: 'en' }), /Mengshan · Rain/);
  const pop = wxPopHtml({ sense: { city: { name: '哈尔滨' }, off: false } });
  assert.match(pop, /跟着：哈尔滨/);
  assert.match(pop, /data-wx-off="off"/);
  assert.match(pop, /data-wx-clear/);
  assert.doesNotMatch(wxPopHtml({ sense: { city: null, off: false } }), /data-wx-clear/);
  draft.city = '<b>';
  assert.match(cityRowHtml(), /id="city-text"[^>]*value="&lt;b&gt;"/);
  draft.city = '';
  assert.equal(cityNote({ ok: true }), null);
  assert.equal(cityNote({ ok: false, status: 404 }), '没找到这座城。');
});

test('the skill declares the sense and never goes online itself', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.match(md.split('\n---\n')[0], /\nsenses: \[weather\]\n/);
  const scripts = fs.readdirSync(path.join(ROOT, 'scripts'), { recursive: true }).filter((f) => /\.(m?js|html)$/.test(f));
  for (const f of scripts) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    assert.doesNotMatch(src, /open-meteo|fetch\(\s*['"`]https?:/i, f);
  }
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(page, /fetch\('\/api\/senses\/weather'/);
});
