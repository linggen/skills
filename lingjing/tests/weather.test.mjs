// 天气 (design.md § 真实世界): the engine's weather sense at the player's
// city, else 蒙山's seasons; Look's `weather` and its one `new`; the page's
// chip, popover and the 名字 card's city row. The skill never goes online.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KINDS, seasonBrief, seasonKind, senseReading, weatherBrief, windBrief, windLevel } from '../scripts/rules/weather.mjs';
import { cityNote, draft, wxChipHtml, wxPopHtml } from '../scripts/sky.js';
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

/* The plot never follows the real weather (Hanli, 2026-10-14): a scene whose
   story names its sky declares `weather`; there Look's is the story's. */
const RAIN = { kind: 'rain', code: 61, temp_c: 11.2, is_day: true, city: '杭州', at: 1 };
const startAt = (now) => newState(content, 'zh', now); // 00-shiao, at 石坳村

test('a scene that names its sky shows the story\'s, not the real one: 00-shiao is overcast under a real rain', () => {
  const s = startAt(at('2026-10-14'));
  assert.equal(s.scene, '00-shiao');
  const wx = look(s, content, { now: at('2026-10-14'), quests: [], weather: RAIN }).weather;
  assert.deepEqual(wx, { kind: 'cloudy', where: '蒙山', source: 'story' }); // 「那天一直阴着」 — no temp (that is the city's), never `new`
  // The page: the chip reads the story's sky, no degrees; the layer draws no rain.
  assert.equal(wxChipHtml({ ...wx, where: '石坳村' }).includes('title="石坳村 · 阴"'), true);
  assert.match(wxChipHtml({ ...wx, where: '石坳村' }), />\u2601\uFE0E 阴<\/button>/, 'no degrees: the sky\'s mark and its word');
  // A fog-tagged scene draws fog under a real rain (the path the data takes, whatever the kind).
  const foggy = { ...content, chapters: { ...content.chapters, '00-prologue': { ...content.chapters['00-prologue'], scenes: { ...content.chapters['00-prologue'].scenes, '00-shiao': { ...content.chapters['00-prologue'].scenes['00-shiao'], weather: 'fog' } } } } };
  assert.deepEqual(look(s, foggy, { now: at('2026-10-14'), quests: [], weather: RAIN }).weather, { kind: 'fog', where: '蒙山', source: 'story' });
  assert.equal(weatherBrief({ ...s, weather_told: 'rain' }, { now: at('2026-10-14'), weather: RAIN }, 'fog').new, undefined);
});

test('a scene that names no sky shows the real one; off the scene, the real one too', () => {
  const s = { ...startAt(at('2026-10-14')), scene: '00-dawn' };
  assert.equal(content.chapters['00-prologue'].scenes['00-dawn'].weather, undefined);
  assert.deepEqual(look(s, content, { now: at('2026-10-14'), quests: [], weather: RAIN }).weather, { kind: 'rain', where: '杭州', temp_c: 11, source: 'city', new: true });
  // No scene running (out on the map): the real one.
  assert.equal(look(open(at('2026-10-14')), content, { now: at('2026-10-14'), quests: [], weather: RAIN }).weather.source, 'city');
  // A kind outside KINDS is no story sky.
  assert.equal(weatherBrief(s, { now: at('2026-10-14'), weather: RAIN }, 'hail').source, 'city');
});

test('every scene\'s `weather` is one of KINDS, and the lint refuses any other', async () => {
  const { lint } = await import('../scripts/content.mjs');
  const tagged = Object.values(content.chapters).flatMap(c => Object.values(c.scenes)).filter(sc => sc.weather != null);
  assert.ok(tagged.length > 20);
  for (const sc of tagged) assert.ok(KINDS.includes(sc.weather), `${sc.id}: ${sc.weather}`);
  for (const sc of tagged) assert.equal(typeof sc._weather, 'string', `${sc.id} quotes its phrase in _weather`);
  const ch = content.chapters['00-prologue'];
  const bent = { ...content, chapters: { ...content.chapters, '00-prologue': { ...ch, scenes: { ...ch.scenes, '00-shiao': { ...ch.scenes['00-shiao'], weather: 'hail' } } } } };
  assert.ok(lint(bent).some(p => p.startsWith('scene 00-shiao: weather hail')));
});

test('the command line: Ling\'s Look over a story sky says nothing of the weather and keeps nothing told', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-wx-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(startAt(at('2026-10-14'))));
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: at('2026-10-14').toISOString(), LINGGEN_WEATHER: JSON.stringify(RAIN) };
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
    const wx = cli('look', '--said=你好', '--for=ling').weather;
    assert.equal(wx.source, 'story');
    assert.equal(wx.new, undefined);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).weather_told, undefined);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the page: a chip with the sky, a popover to set or change the city, the 名字 card\'s row', () => {
  assert.equal(wxChipHtml(null), '');
  const chip = wxChipHtml({ kind: 'snow', where: '哈尔滨', temp_c: -18 });
  assert.match(chip, /data-wx[^-]/);
  assert.match(chip, /title="哈尔滨 · 雪 -18°"/);
  assert.match(chip, />\u2744\uFE0E -18°<\/button>/, 'on the footer: the mark and the degrees (Hanli, 2026-10-15)');
  assert.match(wxChipHtml({ kind: 'rain', where: 'Mengshan' }, { lang: 'en' }), /title="Mengshan · Rain"/);
  assert.match(wxChipHtml({ kind: 'clear', is_day: false, where: 'x', temp_c: 3 }), />\u263E 3°</, 'a clear night is the moon');
  const pop = wxPopHtml({ sense: { city: { name: '哈尔滨' }, off: false } });
  assert.match(pop, /跟着：哈尔滨/);
  assert.match(pop, /data-wx-off="off"/);
  assert.match(pop, /data-wx-clear/);
  assert.doesNotMatch(wxPopHtml({ sense: { city: null, off: false } }), /data-wx-clear/);
  draft.city = '<b>';
  assert.match(wxPopHtml({ sense: { city: null, off: false } }), /id="wx-city"[^>]*value="&lt;b&gt;"/);
  draft.city = '';
  assert.equal(cityNote({ ok: true }), null);
  assert.equal(cityNote({ ok: false, status: 404 }), '没找到这座城。');
});

test('the skill declares the sense and never goes online itself', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.match(md.split('\n---\n')[0], /\nsenses: \[weather(, [a-z_]+)*\]\n/);
  const scripts = fs.readdirSync(path.join(ROOT, 'scripts'), { recursive: true }).filter((f) => /\.(m?js|html)$/.test(f));
  for (const f of scripts) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    assert.doesNotMatch(src, /open-meteo|fetch\(\s*['"`]https?:/i, f);
  }
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(page, /fetch\('\/api\/senses\/weather'/);
});

/* 季节 · 风 (Hanli, 2026-10-15): the same rule as the sky — the book's, then
   the real place's, then a default; wind is a dimension, never a kind. */
const HALIFAX = { kind: 'clear', code: 0, temp_c: 9, is_day: true, city: 'Halifax', at: 1, wind_kmh: 30.4, gust_kmh: 62.6, wind_dir: 317, latitude: 44.64, country_code: 'CA' };

test('the wind: the city\'s where the sky is the city\'s — 30 km/h gusting 62 is windy, clear stays clear', () => {
  assert.equal(windLevel(30.4, 62.6), 'windy');
  assert.equal(windLevel(5, 9), 'calm');
  assert.equal(windLevel(70, 95), 'gale');
  assert.equal(windLevel(undefined, undefined), null);
  const s = { ...startAt(at('2026-10-15')), scene: '00-dawn' };
  const lk = look(s, content, { now: at('2026-10-15'), quests: [], weather: HALIFAX });
  assert.equal(lk.weather.kind, 'clear');
  assert.deepEqual(lk.wind, { level: 'windy', force: 0.7, source: 'city', kmh: 30, gust_kmh: 63, dir: 317 });
  // A story sky keeps the story's air (a breeze, unless the scene names a wind); no reading: a breeze.
  assert.equal(look(startAt(at('2026-10-15')), content, { now: at('2026-10-15'), quests: [], weather: HALIFAX }).wind.source, 'default');
  assert.deepEqual(windBrief({ weather: null }), { level: 'breeze', force: 0.3, source: 'default' });
  assert.equal(windBrief({ weather: HALIFAX }, { weather: null, wind: 'gale' }).level, 'gale');
  assert.equal(weatherBrief(s, { now: at('2026-10-15'), weather: HALIFAX }).new, undefined, 'a windy clear day is still clear: no news');
});

test('the season: the scene\'s, else its 回\'s from the book, else where the player is (hemisphere), else 蒙山\'s', () => {
  // 古一 (h01, 「这一年秋天」) in spring by the real date: the book's autumn.
  const s = startAt(at('2026-04-15'));
  assert.equal(content.chapters['00-prologue'].scenes[s.scene].hui, 'h01');
  assert.deepEqual(look(s, content, { now: at('2026-04-15'), quests: [], weather: HALIFAX }).season, { kind: 'autumn', source: 'story' });
  // 00-halfyear's own winter wins over 古二's autumn.
  assert.deepEqual(look({ ...s, scene: '00-halfyear' }, content, { now: at('2026-04-15'), quests: [] }).season, { kind: 'winter', source: 'story' });
  // Off a scene: the city's hemisphere, else 蒙山's.
  assert.deepEqual(seasonBrief({ now: at('2026-10-15'), weather: HALIFAX }), { kind: 'autumn', source: 'city' });
  assert.deepEqual(seasonBrief({ now: at('2026-10-15'), weather: { ...HALIFAX, latitude: -33.9 } }), { kind: 'spring', source: 'city' });
  assert.deepEqual(seasonBrief({ now: at('2026-10-15'), weather: null }), { kind: 'autumn', source: 'home' });
  assert.deepEqual(seasonBrief({ now: at('2026-10-15'), day: '2027-02-06', weather: null }), { kind: 'spring', source: 'home' }, 'the preview day moves the season too');
  // 古三 is 九月初九: the book dates it autumn.
  assert.equal(content.book.volumes.flatMap(v => v.hui).find(h => h.id === 'h04').season, 'autumn');
});

test('the lint holds a scene\'s season and wind, and a 回\'s season', async () => {
  const { lint } = await import('../scripts/content.mjs');
  const ch = content.chapters['00-prologue'];
  const bent = { ...content, chapters: { ...content.chapters, '00-prologue': { ...ch, scenes: { ...ch.scenes, '00-shiao': { ...ch.scenes['00-shiao'], season: 'monsoon', wind: 'hurricane' } } } } };
  const problems = lint(bent);
  assert.ok(problems.some(p => p.startsWith('scene 00-shiao: season monsoon')));
  assert.ok(problems.some(p => p.startsWith('scene 00-shiao: wind hurricane')));
});

// Live 2026-10-15: the sky popover read 「跟着：Halifax」 on a Chinese page — the geocoder's own spelling alone.
test('the city followed is named with its country in the page\'s language', async () => {
  const { cityLabel, wxPopHtml } = await import('../scripts/sky.js');
  const city = { name: 'Halifax', country: '加拿大', country_code: 'CA' };
  assert.equal(cityLabel(city, 'zh'), 'Halifax · 加拿大');
  assert.equal(cityLabel(city, 'en'), 'Halifax · Canada');
  assert.match(wxPopHtml({ lang: 'zh', sense: { city } }), /跟着：Halifax · 加拿大/);
});
