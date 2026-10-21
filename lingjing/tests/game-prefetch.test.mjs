// 台词预取 (games/prefetch.js; Hanli 10-20: 「台词预取, 好主意! 就这么做」, doc/game-kit.md § Game and chat): at a level's
// mount the host asks 银月 once for a short line at each moment; the game shows each the instant its moment comes;
// late, failed or invalid → the level's own data lines. The facts and the request she reads, her reply checked line
// by line, the fallback, and the two plays' own moment code reading her lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { PREFETCH_TITLE, WITHHELD, sweep } from '../scripts/games/prefetch-ling.js';
import { MAX, askedOf, beastsIn, factsFor, factsOf, linesOf, linesView, momentsOf, prefetchLines, promptOf, teaches } from '../scripts/games/prefetch.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const SQ = read('../worlds/jiuding/levels/shouqiang.json');
const SD = read('../worlds/jiuding/levels/sadou.json');
const NAMES = Object.fromEntries(read('../worlds/jiuding/creatures.json').creatures.map((c) => [c.id, c.name]));
const shanmen = SQ.levels[0], yaoyuan1 = SQ.levels[1], road = SD.levels[0];
const factsZh = factsOf({ kit: SQ, level: shanmen, game: 'shouqiang', names: NAMES, lang: 'zh' });
const MOMENTS = ['open', 'wave_cleared', 'low', 'boss', 'win'];
const ASKED = ['wave_cleared', 'low', 'win']; // open and boss teach: the level's own lines, never hers
const GOOD = 'LINES {"open":["先挑一门本事！"],"wave_cleared":["山道暂清，挑道符。","野猪退了，墙还在。"],"low":["墙要被啃穿了！"],"boss":["合窳一哭，就打它！"],"win":["山门守住了。"]}\nSILENT';
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the facts: the level\'s title, scene and beasts by name, and each moment with its meaning, count and own lines', () => {
  assert.deepEqual(momentsOf(shanmen), MOMENTS);
  assert.deepEqual(momentsOf({ moments: { _about: 'x', start: [{ zh: 'a' }], none: [] } }), ['start'], '_about and empty pools are no moments');
  assert.deepEqual(momentsOf({}), [], 'a board with no moments asks nothing');
  assert.deepEqual(beastsIn(shanmen, SQ), ['yezhu', 'zheng', 'qiuyu', 'qique', 'heyu']);
  const onRoad = beastsIn(road, SD);
  assert.ok(onRoad.includes('heyu') && onRoad.every((b) => SD.beasts[b]), 'the road\'s beasts, by the kit\'s ids');
  assert.equal(factsZh.title, '沉鼎观 · 守山门');
  assert.match(factsZh.scene, /山门/);
  assert.doesNotMatch(factsZh.scene, /兽潮来袭/, 'the big banners are not the scene');
  assert.deepEqual(factsZh.beasts, ['野猪', '狰', '犰狳', '鬿雀', '合窳']);
  const wc = factsZh.moments.find((m) => m.name === 'wave_cleared');
  assert.equal(wc.n, 2, 'a moment that comes again gets two lines');
  assert.match(wc.means, /三张符/);
  assert.deepEqual(wc.sample, ['挑一张！', '这波稳了。', '再来多少都一样。']);
  assert.equal(factsZh.moments.find((m) => m.name === 'win').n, 1);
  assert.deepEqual(factsZh.moments.map((m) => m.name), ASKED, 'only the reactions are hers');
  for (const [kit, game] of [[SQ, 'shouqiang'], [SD, 'sadou']]) {
    for (const level of kit.levels) {
      for (const lang of ['zh', 'en']) {
        for (const m of factsOf({ kit, level, game, names: NAMES, lang }).moments) assert.notEqual(m.means, m.name, `${level.id} ${m.name}: she is told what it means`);
      }
    }
  }
  const en = factsOf({ kit: SD, level: road, game: 'sadou', names: NAMES, lang: 'en' });
  assert.equal(en.lang, 'en');
  assert.ok(en.moments.every((m) => m.means && !/[㐀-鿿]/.test(m.means + m.sample.join(''))), 'English facts in English');
});

test('the request: every moment and its count, her own voice, the cap, the reply\'s form — LINES {json}, then SILENT', () => {
  const p = promptOf(factsZh);
  for (const m of ASKED) assert.ok(p.includes(`- ${m}（`), m);
  assert.match(p, /wave_cleared（2句）/);
  assert.match(p, /用你自己的口气/);
  assert.match(p, new RegExp(`不超过${MAX.zh}个字`));
  assert.match(p, /别照抄/);
  assert.match(p, /LINES \{/);
  assert.match(p, /SILENT/);
  assert.match(p, /合窳/);
  const en = promptOf(factsOf({ kit: SQ, level: shanmen, game: 'shouqiang', names: NAMES, lang: 'en' }));
  assert.match(en, /in English/);
  assert.match(en, /Line 2.*SILENT/s);
  assert.doesNotMatch(en, /[㐀-鿿]/, 'an English request holds no Chinese');
});

test('her reply checked line by line: right keys, the cap, no empty lines, the player\'s language; anything else falls back', () => {
  assert.deepEqual(linesOf(GOOD, MOMENTS), {
    open: ['先挑一门本事！'], wave_cleared: ['山道暂清，挑道符。', '野猪退了，墙还在。'], low: ['墙要被啃穿了！'], boss: ['合窳一哭，就打它！'], win: ['山门守住了。'],
  });
  assert.deepEqual(linesOf('```json\n{"win":"守住了。"}\n```\nSILENT', MOMENTS), { win: ['守住了。'] }, 'a fence and a bare string are taken');
  const mixed = linesOf(JSON.stringify({
    win: ['', '   ', '这一句实在是太长了太长了太长了太长了太长了'], // empty, blank, past the cap
    low: [42, '「墙要塌！」'], // not a string; quotes stripped
    boss: ['Strike now!'], // not the player's language
    huge: ['不是这关的时刻'], // not one of the level's moments
    wave_cleared: ['{"x":1}', 'SILENT'], // code
  }), MOMENTS);
  assert.deepEqual(mixed, { low: ['墙要塌！'] });
  assert.deepEqual(linesOf('not json at all', MOMENTS), {});
  assert.deepEqual(linesOf('LINES {broken', MOMENTS), {});
  assert.deepEqual(linesOf('[1,2]', MOMENTS), {});
  assert.deepEqual(linesOf(null, MOMENTS), {});
  assert.deepEqual(linesOf('LINES {"win":["Held.", "守住了"]}', MOMENTS, 'en'), { win: ['Held.'] });
  assert.equal(linesOf(`{"win":["${'x'.repeat(MAX.en + 1)}"]}`, MOMENTS, 'en').win, undefined);
});

test('what a game reads: her pool (守墙关) or one line picked each time (撒豆成兵); nothing before she answers', () => {
  const got = {};
  const pool = linesView(got), one = linesView(got, 'one', () => 0.99);
  assert.equal(pool.win, undefined, 'before her reply the game takes its own');
  got.win = ['甲', '乙'];
  assert.deepEqual(pool.win, ['甲', '乙']);
  assert.equal(one.win, '乙');
  assert.equal(typeof one.win, 'string');
  assert.equal(pool.low, undefined);
  assert.ok('win' in pool && !('low' in pool));
});

test('one ask a level: her lines land in `lines`; failed, late or invalid → the data lines stand, and the game never waits', async () => {
  let asked = 0;
  const ok = prefetchLines({ facts: factsZh, ask: async (text) => { asked += 1; assert.match(text, /LINES/); return GOOD; } });
  assert.equal(ok.lines.win, undefined, 'answers at once, before her reply');
  const r = await ok.done;
  assert.equal(asked, 1);
  assert.equal(r.ok, true);
  assert.equal(r.why, '');
  assert.deepEqual(ok.lines.win, ['山门守住了。']);

  const failed = prefetchLines({ facts: factsZh, ask: async () => { throw new Error('absent'); } });
  assert.deepEqual(await failed.done.then((x) => [x.ok, x.why]), [false, 'failed: absent']);
  assert.equal(failed.lines.win, undefined);

  const bad = prefetchLines({ facts: factsZh, ask: async () => 'SILENT' });
  assert.deepEqual(await bad.done.then((x) => [x.ok, x.why]), [false, 'invalid']);
  const part = prefetchLines({ facts: factsZh, ask: async () => '{"win":["守住了。"]}' });
  assert.equal((await part.done).why, 'partial');
  assert.equal(part.lines.low, undefined, 'a moment she left out keeps its data line');

  let answer;
  const late = prefetchLines({ facts: factsZh, ask: () => new Promise((r) => { answer = r; }), timeoutMs: 20 });
  assert.equal((await late.done).why, 'late');
  assert.equal(late.lines.low, undefined);
  answer(GOOD);
  await tick(); await tick();
  assert.deepEqual(late.lines.low, ['墙要被啃穿了！'], 'a late answer still serves the moments left');

  const stop = new AbortController();
  const left = prefetchLines({ facts: factsZh, ask: () => new Promise(() => {}), signal: stop.signal });
  stop.abort();
  assert.equal((await left.done).why, 'left');
});

test('no moments, no call: a level without moments asks nothing; a game without a level gets no facts', async () => {
  let asked = 0;
  const ask = async () => { asked += 1; return GOOD; };
  assert.equal(prefetchLines({ facts: { moments: [] }, ask }), null);
  const later = prefetchLines({ facts: Promise.resolve({ moments: [] }), ask });
  assert.equal((await later.done).why, 'none');
  assert.equal(asked, 0);
  assert.equal(factsFor({ meta: { id: 'rain' }, html: () => '' }), null, 'a pure board has no levelOf');
  const mod = { meta: { id: 'shouqiang' }, levelOf: async () => ({ kit: SQ, level: shanmen }) };
  const f = await factsFor(mod, { lang: 'zh', names: async () => NAMES });
  assert.deepEqual(f.moments.map((m) => m.name), ASKED);
});

test('teaching moments are the level\'s own: never in the request, never in `lines`, even when her reply holds them', async () => {
  const TEACH = { shouqiang: ['open', 'lane', 'twist', 'boss'], sadou: ['flip', 'rock', 'lane', 'slam'] };
  for (const [game, ms] of Object.entries(TEACH)) for (const m of ms) assert.ok(teaches(game, m), `${game}.${m} teaches`);
  for (const [game, m] of [['shouqiang', 'wave_cleared'], ['shouqiang', 'low'], ['shouqiang', 'huge'], ['shouqiang', 'win'],
    ['sadou', 'start'], ['sadou', 'good'], ['sadou', 'bad'], ['sadou', 'clash'], ['sadou', 'low'], ['sadou', 'boss'], ['sadou', 'won'], ['sadou', 'lost']]) {
    assert.ok(!teaches(game, m), `${game}.${m} is a reaction: hers`);
  }
  assert.ok(!teaches('', 'boss') && !teaches('sadou', 'twist'), 'by kit: a moment teaches only where its kit says so');
  for (const [kit, game] of [[SQ, 'shouqiang'], [SD, 'sadou']]) {
    for (const level of kit.levels) {
      const asked = askedOf(level, game);
      for (const m of TEACH[game]) assert.ok(!asked.includes(m), `${level.id}: ${m} not asked`);
      for (const lang of ['zh', 'en']) {
        const p = promptOf(factsOf({ kit, level, game, names: NAMES, lang }));
        for (const m of TEACH[game]) assert.ok(!p.includes(`- ${m} (`) && !p.includes(`- ${m}（`) && !p.includes(`"${m}"`), `${level.id} ${lang}: ${m} not in the request`);
      }
    }
  }
  const sent = [];
  const every = 'LINES {"open":["先挑！"],"boss":["打！"],"lane":["守中间！"],"twist":["小心！"],"low":["墙要塌！"],"win":["守住了。"]}\nSILENT';
  const y1 = factsOf({ kit: SQ, level: yaoyuan1, game: 'shouqiang', names: NAMES, lang: 'zh' });
  const her = prefetchLines({ facts: y1, ask: async (t) => { sent.push(t); return every; } });
  await her.done;
  assert.doesNotMatch(sent[0], /- (lane|twist)（/);
  for (const m of ['open', 'boss', 'lane', 'twist']) {
    assert.equal(her.lines[m], undefined, `${m}: the game falls to its data line`);
    assert.ok(!(m in her.lines));
  }
  assert.deepEqual([her.lines.low, her.lines.win], [['墙要塌！'], ['守住了。']], 'the reactions are still hers');

  let asked = 0;
  const onlyTeach = { moments: { open: [{ zh: '先挑一门本事！' }], lane: [{ zh: '守住中间。' }] } };
  const f = factsOf({ kit: SQ, level: onlyTeach, game: 'shouqiang', names: NAMES });
  assert.deepEqual(f.moments, []);
  assert.equal(prefetchLines({ facts: f, ask: async () => { asked += 1; return every; } }), null, 'only teaching moments: no call');
  assert.equal(asked, 0);
});

test('the two games read her lines at their moments: 守墙关 from her pool, 撒豆成兵 her one line — else their own', async () => {
  // The plays' own moment code (tools/*/src/play.js), with Phaser stubbed: it is the code the bundles are built from.
  const L = new URL('../', import.meta.url).href;
  const hooks = `const MAP = { phaser: 'data:text/javascript,export class Scene {} export const Math = { Linear: (a, b, t) => a + (b - a) * t };',
    'sadou-core': '${L}scripts/games/sadou/core.js', 'shouqiang-core': '${L}scripts/games/shouqiang/core.js' };
    export async function resolve(s, c, next) { return MAP[s] ? { url: MAP[s], shortCircuit: true } : next(s, c); }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  const sq = (await import('../tools/shouqiang/src/play.js')).PlayScene.prototype;
  const sd = (await import('../tools/sadou/src/play.js')).PlayScene.prototype;

  const her = prefetchLines({ facts: factsZh, ask: async () => GOOD });
  const said = [];
  const scene = { cfg: { lines: her.lines }, g: { level: shanmen }, lang: 'zh', say: (who, text) => said.push([who, text]) };
  sq.moment.call(scene, 'low');
  assert.ok(shanmen.moments.low.some((l) => l.zh === said.pop()[1]), 'not yet answered: the level\'s own line, at once');
  await her.done;
  sq.moment.call(scene, 'low');
  assert.deepEqual(said.pop(), ['yinyue', '墙要被啃穿了！'], 'answered: hers');
  sq.moment.call(scene, 'boss');
  assert.deepEqual(said.pop(), ['yinyue', '合窳来了——它一哭，就打它！'], 'a teaching moment: the level\'s own, even after she answered');

  const facts = factsOf({ kit: SD, level: road, game: 'sadou', names: NAMES, lang: 'zh' });
  const mine = prefetchLines({ facts, ask: async () => 'LINES {"boss":["合窳！扑上去！"]}\nSILENT', shape: 'one' });
  const hud = [];
  const run = { cfg: { lines: mine.lines, level: road }, lang: 'zh', saidAt: -99, time: { now: 0 }, rand: () => 0, hud: { say: (t) => hud.push(t) } };
  sd.say.call(run, 'boss', true);
  assert.equal(hud.pop(), road.moments.boss[0].zh, 'not yet answered: the level\'s own');
  await mine.done;
  sd.say.call(run, 'boss', true);
  assert.equal(hud.pop(), '合窳！扑上去！');
  sd.say.call(run, 'clash', true);
  assert.equal(hud.pop(), road.moments.clash[0].zh, 'a moment she did not write keeps its own');
});

test('the side session: her save tools withheld; one left by a page closed mid-ask is swept, never the day\'s chat', () => {
  assert.deepEqual(WITHHELD, ['AppTool', 'Story']);
  const gone = [];
  const now = 10_000;
  const ids = sweep([
    { id: 'a', title: PREFETCH_TITLE, created_at: now - 600 },
    { id: 'b', title: PREFETCH_TITLE, created_at: now - 10 }, // another page's ask, still running
    { id: 'c', title: 'Lingjing', created_at: now - 600 },
  ], (skill, id) => gone.push([skill, id]), { nowSec: now });
  assert.deepEqual(ids, ['a']);
  assert.deepEqual(gone, [['lingjing', 'a']]);
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /title !== PREFETCH_TITLE/, 'the page never resumes it');
});
