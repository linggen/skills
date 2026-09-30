// The prologue's machinery (built for the v1 prologue, retired; kept for prologue-v3): the name card's
// 男 · 女 and what the rules fill from it, the 生辰 read into 灵根 and let go,
// the people a scene brings on, the trial fight that may be fought again, the
// toil that costs 体力 in a free chapter, 夫诸's first sight, and an old save
// whose scene the rewrite took away.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, appearHtml, cardHtml } from '../scripts/cards.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { fill, migrate, newState } from '../scripts/state.mjs';
import { VERBS, duel, forLing, look, pageNames, resolve } from '../scripts/rules.mjs';
import { bornRoots, dominantFrom, mainRoot, pillarsOf, rootName, starterFor, stoneRoots, strongRoots } from '../scripts/rules/roots.mjs';
import { TO_WAIMEN, TO_HALL, TO_VALLEY, V1_BIRTH, walk } from './prologue.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { portraitOf } from '../scripts/rules/codex.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const start = (lang = 'zh', created = NOW) => newState(content, lang, created);
const hall = (lang = 'zh', gender = 'female') => walk(start(lang), TO_HALL.map(([v, a]) => [v, a.exit === 'name' ? { ...a, gender } : a]), content, NOW);
const born = (s, args) => resolve(s, content, ctx(), { exit: 'born', ...args });
const ROOT = path.resolve(import.meta.dirname, '..');

/* ── 生辰 → 灵根 ── */

test('the three pillars: 2000-01-01 is 己卯年 丙子月 戊午日; the month turns at its 节, the year at 立春', () => {
  assert.deepEqual(pillarsOf(content, '2000-01-01'), ['earth', 'wood', 'fire', 'water', 'earth', 'fire']);
  // 2000-02-04 is 立春: 庚辰年 戊寅月; the day before is still 己卯年 丁丑月
  assert.deepEqual(pillarsOf(content, '2000-02-04').slice(0, 4), ['metal', 'earth', 'earth', 'wood']);
  assert.deepEqual(pillarsOf(content, '2000-02-03').slice(0, 4), ['earth', 'wood', 'fire', 'earth']);
  for (const bad of ['2000-02-30', '1899-06-01', 'yesterday', '', null]) assert.equal(pillarsOf(content, bad), null, String(bad));
});

const FIVE = ['metal', 'wood', 'water', 'fire', 'earth'];

test('the roots: always all five; the element seen most in the six leads; a tie by the seed', () => {
  // 1985-03-03: 土 ×3 — 土 leads, whatever the seed
  for (const seed of ['a', 'b', 'c']) assert.deepEqual(bornRoots(content, '1985-03-03', seed), { roots: FIVE, main: 'earth' }, seed);
  assert.equal(dominantFrom(content, ['metal', 'metal', 'metal', 'metal', 'wood', 'earth']), 'metal');
  // 2000-01-01: 火 ×2 and 土 ×2 tie — the seed picks, the same every time, one of the two
  const tie = pillarsOf(content, '2000-01-01');
  const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(seed => dominantFrom(content, tie, seed)));
  assert.deepEqual([...picks].sort(), ['earth', 'fire'], 'both reachable by seed, nothing else');
  assert.equal(dominantFrom(content, tie, 'x'), dominantFrom(content, tie, 'x'));
  assert.deepEqual(stoneRoots(content), { roots: FIVE, main: null }, 'skipped: five even, none leads');
  assert.equal(rootName(content, { traits: FIVE, root_main: 'fire' }, 'zh'), '五行杂灵根 · 火为主');
  assert.equal(rootName(content, { traits: FIVE, root_main: 'water' }, 'en'), 'Mixed five-element root · Water leads');
  assert.equal(rootName(content, { traits: FIVE }, 'zh'), '五行杂灵根');
  assert.equal(rootName(content, { traits: ['wood', 'water', 'fire', 'earth'] }, 'zh'), '四灵根 · 伪灵根', 'an old save keeps its retired name');
  // what an affinity reads: the leader of five, none when even; an old save's own
  assert.deepEqual(strongRoots({ traits: FIVE, root_main: 'fire' }), ['fire']);
  assert.deepEqual(strongRoots({ traits: FIVE }), []);
  assert.deepEqual(strongRoots({ traits: ['wood', 'water'] }), ['wood', 'water']);
  assert.equal(mainRoot({ traits: FIVE }), null);
  assert.equal(mainRoot({ traits: ['wood', 'water', 'fire', 'earth'] }), 'wood');
});

test('every birthday 1950–2015 gives all five; each of the five can lead', () => {
  const n = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  let all = 0;
  for (const seed of ['a', 'b', 'c']) for (let y = 1950; y <= 2015; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d += 3) {
    const read = bornRoots(content, `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, seed);
    assert.deepEqual(read.roots, FIVE);
    n[read.main] += 1; all += 1;
  }
  // 土 leads most (辰戌丑未 are four of the twelve branches); every other one leads at least one in ten
  for (const [e, k] of Object.entries(n)) assert.ok(k / all > 0.1 && k / all < 0.45, `${e} ${((100 * k) / all).toFixed(1)}%`);
  assert.equal(content.traits.names['5'].zh, '五行杂灵根');
});

test('the starter: five roots and four are the old ten exactly; fewer roots fill with beasts, never a 功法 of a root they lack', () => {
  const TEN = ['xiaoyao', 'qingteng', 'leipu', 'luying', 'shuiwu', 'huoya', 'huodan', 'tuou', 'shanjing', 'huiqi'];
  assert.deepEqual(starterFor(content, ['wood', 'water', 'fire', 'earth']), TEN);
  assert.deepEqual(starterFor(content, FIVE), TEN, 'the starter\'s 金 cards stand last and fall off');
  const one = starterFor(content, ['metal']), catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  assert.equal(one.length, 9);
  assert.ok(one.every(id => catalog[id].kind !== 'spell' || !catalog[id].element || catalog[id].element === 'metal'), one.join());
  for (const roots of [['fire', 'water'], ['wood', 'water', 'fire']]) assert.equal(starterFor(content, roots).length, 10, roots.join());
});

test('生辰 at the 入门仪式: the roots are read and the day let go — never on the save, in the result, in the log', () => {
  const s = hall();
  assert.equal(s.scene, '00-hall');
  const out = born(s, { birth: '1985-03-03' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.deepEqual(out.state.traits, FIVE, 'all five, each weak');
  assert.equal(out.state.root_main, 'earth', '土 is the one the six hold most');
  assert.deepEqual(out.result.born, { read: 'birth', roots: { ids: FIVE, name: '五行杂灵根 · 土为主', elements: ['金', '木', '水', '火', '土'], main: '土' } });
  assert.equal(look(out.state, content, ctx()).traits.main, 'earth');
  // the stone's verdict is the player's roots, told in the passage the choice owes
  // owed since Ling last read — every beat walked here, the root test last but the scene
  const told = tellOf(content, out.state).tell, rite = told.find(t => t.id === "00-hall/born");
  assert.deepEqual(told.slice(-2).map(t => t.id), ['00-hall/born', '00-waimen']);
  assert.match(rite.text, /念道：「金、木、水、火、土——五行俱全。五行杂灵根。下下之资。」/);
  assert.match(rite.text, /金、青、黑、红、黄，五种颜色，一样不少[\s\S]*拼成的一块抹布。只有黄的那一点，比别的亮一些。/);
  assert.match(rite.text, /杂灵根也配进山门？/);
  assert.doesNotMatch(rite.text, /[{}]|伪灵根|缺[金木水火土]/);
  const waimen = tellOf(content, resolve(out.state, content, ctx(), { exit: 'pay' }).state).tell.find(t => t.id === '00-waimen/pay');
  assert.match(waimen.text, /摸出一块灵石，交了。/);
  assert.match(rite.text, /腿稳。心细。/);
  assert.deepEqual(out.result.show, [{ card: 'traits' }]);
  assert.equal(out.state.fate, undefined, 'the 命格 stays the coins card\'s own choice');
  assert.equal(out.state.bag['grey-robe'], 1);
  assert.equal(out.state.wealth - s.wealth, 3, 'three spirit stones: the month\'s allowance');
  assert.equal(out.state.scene, '00-waimen');
  for (const text of [JSON.stringify(out.state), JSON.stringify(out.result), JSON.stringify(told)]) assert.doesNotMatch(text, /1985-03-03|1985|03-03/);
  // a day that is not one, or one still to come, is refused and changes nothing
  assert.equal(born(s, { birth: '2000-02-30' }).result.refused, 'birth-invalid');
  assert.equal(born(s, { birth: '2027-01-01' }).result.refused, 'birth-invalid');
  assert.equal(born(s, {}).result.refused, 'birth-invalid', 'neither a day nor 不填');
});

test('不填: the stone reads five even — none leads — and the starter is the old ten', () => {
  for (const lang of ['zh', 'en']) {
    const s = hall(lang);
    const a = born(s, { skip: 'true' });
    assert.deepEqual(a.state.traits, FIVE);
    assert.equal(a.state.root_main, undefined);
    assert.equal(a.result.born.read, 'stone');
    assert.equal(a.result.born.roots.name, lang === 'zh' ? '五行杂灵根' : 'Mixed five-element root');
    for (const id of starterFor(content, a.state.traits)) assert.ok(a.state.cards.includes(id), id);
    const rite = tellOf(content, a.state).tell.find(t => t.id === '00-hall/born').text;
    assert.match(rite, lang === 'zh' ? /念道：「金、木、水、火、土——五行俱全。五行杂灵根。下下之资。」/ : /Metal, wood, water, fire, earth — all five elements\. A mixed five-element root\. The lowest of the low\./);
    assert.match(rite, lang === 'zh' ? /拼成的一块抹布。\n/ : /five kinds of leftover scraps\.\n/, 'even: no colour brighter, no gap left');
  }
});

test('a save that already holds its roots (v1) keeps them: no card, the exit a plain step, Ling may walk it', () => {
  const s = { ...hall(), traits: ['wood', 'water', 'fire', 'earth'] };
  const l = look(s, content, ctx());
  assert.ok(!l.stage.some(c => c.card === 'born'));
  assert.ok(l.ask.options.some(o => o.exit === 'born'), 'the chat offers the step');
  assert.equal(pageNames(content, s, { exit: 'born' }), null);
  const out = born(s, {});
  assert.equal(out.result.ok, true);
  assert.deepEqual(out.state.traits, ['wood', 'water', 'fire', 'earth']);
  assert.equal(out.result.born.kept, true);
});

test('the 生辰 card stands on the stage; the chat never asks the day, and Ling\'s Resolve of it is refused', () => {
  for (const lang of ['zh', 'en']) {
    const l = look(hall(lang), content, ctx());
    assert.ok(l.stage.some(c => c.card === 'born' && c.id === 'born'), JSON.stringify(l.stage));
    assert.equal(l.ask, null);
    assert.match(l.then, /never ask the date in the chat/);
    const html = cardHtml({ card: 'born', id: 'born' }, { look: l, lang, words: WORDS[lang], content: {}, now: NOW });
    assert.match(html, /<input type="date" id="born-date" min="1900-01-31" max="2026-09-28"/);
    assert.match(html, /data-born="birth" disabled>/, 'shut until a day is typed');
    assert.match(html, /data-born="skip">/);
    assert.match(html, lang === 'zh' ? /不入存档，不入对话/ : /never saved, never said in the chat/);
    assert.match(cardHtml({ card: 'born', id: 'born' }, { look: l, lang, words: WORDS[lang], bornDraft: '2000-01-01', bornError: true }), /value="2000-01-01"[\s\S]*data-born="birth">[\s\S]*class="small seal"/);
  }
  const refused = pageNames(content, hall(), { exit: 'born', said: '我生于2000年1月1日' });
  assert.equal(refused.refused, 'page-born', 'even typed: the day is never the chat\'s');
});

test('the command line: the birthday never reaches the log, and page_did tells Ling the roots only', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-born-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(hall()));
  const r = cli('resolve', '--exit=born', '--birth=1985-03-03');
  assert.equal(r.ok, true, JSON.stringify(r));
  const told = cli('look', '--said=[scene] born 五行杂灵根 · 土为主', '--for=ling');
  const fact = told.page_did.find(d => d.verb === 'resolve');
  assert.match(fact.what, /gave their birthday on the page's card: 五行杂灵根 · 土为主 \(金 木 水 火 土\)/);
  for (const f of ['state.json', 'log.jsonl']) assert.doesNotMatch(fs.readFileSync(path.join(data, f), 'utf8'), /1985-03-03|1985/, f);
  assert.doesNotMatch(JSON.stringify(told), /1985/);
  fs.rmSync(data, { recursive: true, force: true });
});

/* ── 男 · 女: the address and the companion ── */

test('the hero is fixed (2026-09-30): {兄姐} is 师兄, {伴} is 阿禾, a girl, {name} is 沈小满 in the text\'s language', () => {
  const at = s => look(s, content, ctx());
  const s = walk(start(), [['resolve', { exit: 'begin' }], ['resolve', { exit: 'endure' }]], content, NOW);
  const dawn = at(s).scene;
  assert.equal(dawn.id, '00-dawn');
  assert.equal(dawn.people[0].name, '阿禾');
  assert.equal(dawn.people[0].role, '邻家姑娘，比你小一岁；她家也欠马家的租');
  assert.match(tellOf(content, s).tell.at(-1).text, /隔壁的阿禾/);
  const egg = resolve(s, content, ctx(), { exit: 'egg' });
  assert.deepEqual(egg.result.ledger.map(e => [e.who, e.kind]), [['ahe', '恩']]);
  assert.match(tellOf(content, egg.state).tell.find(t => t.id === '00-dawn/egg').text, /阿禾把手缩回袖子里，一本正经地道：「那记账。/);
  // an old save named on the card, or never named: the same words
  for (const old of [{ ...start(), name: '墨白', gender: 'female' }, { ...start(), name: null, gender: null }]) {
    assert.equal(fill('从此观里的人叫你「{name}{兄姐}」。是{伴}。', old, content), '从此观里的人叫你「沈小满师兄」。是阿禾。');
    assert.equal(fill('The temple calls you {兄姐} {name}.', { ...old, lang: 'en' }, content), 'The temple calls you Brother Shen Xiaoman.');
  }
  assert.equal(fill('{name}', { name: '墨白' }), '墨白', 'without the world only the save\'s {name} is filled');
});

/* ── The people ── */

test('people speak as themselves: a line names them, Look carries their voice for Ling and the portrait for the page', () => {
  const s = walk(start(), [['resolve', { exit: 'begin' }]], content, NOW);
  const l = look(s, content, ctx());
  assert.deepEqual(l.scene.people.map(p => p.id), ['masan', 'maxiaobao', 'baba']);
  assert.equal(l.scene.people[0].name, '马三');
  assert.match(l.scene.people[0].voice, /破锣/);
  // The portrait is the 图鉴's: a good one, or none (a name card) while it is refused.
  const masanArt = portraitOf(content, s, 'masan');
  assert.equal(l.scene.people[0].art, masanArt);
  assert.ok(l.stage.some(c => c.card === 'people'));
  const hers = forLing(l);
  assert.equal(hers.scene.people[0].art, undefined, 'the portrait is the page\'s');
  assert.match(hers.scene.people[0].voice, /破锣/);
  const html = cardHtml({ card: 'people' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, masanArt ? /<img src="\.\.\/worlds\/jiuding\/art\/people\/masan\.webp" alt="马三">[\s\S]*<b>马三<\/b>/ : /<span class="namecard" aria-hidden="true"><b>马三<\/b><\/span>[\s\S]*<b>马三<\/b>/);
  // 老周's role names {伴}, filled for this player
  const cliff = look(walk(s, [...TO_VALLEY.slice(1), ['resolve', { exit: 'follow' }]], content, NOW), content, ctx()).scene;
  assert.equal(cliff.people.find(p => p.id === 'laozhou').role, '邻居，种地的，阿禾的爹');
  // before she walks with the player she is the story's fox, her face in the people card
  const fox = look(walk(s, TO_VALLEY.slice(1, -2), content, NOW), content, ctx()).scene;
  assert.equal(fox.id, '00-fox');
  assert.deepEqual(fox.people.map(p => [p.id, p.name]), [['yinyue', '小银狐']]);
  for (const p of content.people.people) assert.ok(fs.existsSync(path.join(content.dir, p.art)), p.art);
});

test('the lint holds people.json: a home, a portrait, a voice, a slot that names a person, the fixed hero', () => {
  const bad = structuredClone(content);
  bad.people.people[0].home = 'atlantis';
  bad.people.people[1].art = 'art/people/nobody.webp';
  delete bad.people.people[2].voice;
  bad.people.slots.ban = 'nobody';
  bad.people.hero.gender = 'robot';
  bad.chapters['00-prologue'].scenes['00-shiao'].lines = [{ who: 'stranger', text: { zh: '……', en: '…' } }];
  const errors = lint(bad).join('\n');
  assert.match(errors, /person dushu: home atlantis is not a place/);
  assert.match(errors, /person ahe: art art\/people\/nobody\.webp is missing/);
  assert.match(errors, /person qulao: voice needs zh and en/);
  assert.match(errors, /slot ban: nobody is no person/);
  assert.match(errors, /hero: needs a name in zh and en and a gender/);
  assert.match(errors, /scene 00-shiao: unknown speaker stranger/);
  assert.deepEqual(lint(content), []);
});

/* ── The trials: toil, a mark, a fight fought again ── */

test('the 三试\'s fight may be fought again the same day: a loss withdraws nothing', () => {
  let s = walk(start(), TO_HALL.slice(0, TO_HALL.findIndex(([v]) => v === 'won')), content, NOW);
  assert.equal(s.scene, '00-longzhi');
  s = { ...s, duels: { longzhi: { day: '2026-09-28', outcome: 'lost' } } };
  assert.equal(resolve(s, content, ctx(), { exit: 'subdue' }).result.refused, 'game-not-won', 'not withdrawn: just not yet won');
  assert.equal(look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue').withdrawn, false);
  const again = duel(s, content, ctx(), { id: 'gate-longzhi' });
  assert.equal(again.result.ok, true, JSON.stringify(again.result));
});

test('the choices are marked on the save; the storm\'s other branch is the harder fall', () => {
  const s = walk(start(), TO_HALL, content, NOW);
  for (const m of ['kept-count', 'took-egg', 'three-rules', 'turned-back', 'shared-bread', 'played-dumb', 'marrow-washed', 'steps-steady']) assert.ok(s.marks.includes(m), m);
  assert.deepEqual(look(s, content, ctx()).marks, s.marks);
  const storm = walk(start(), TO_VALLEY.slice(0, 8), content, NOW);
  assert.equal(storm.scene, '00-storm');
  const turned = resolve(storm, content, ctx(), { exit: 'turn' }).state, chased = resolve(storm, content, ctx(), { exit: 'chase' }).state;
  assert.equal(storm.stamina - turned.stamina, 4);
  assert.equal(storm.stamina - chased.stamina, 10, 'half a li more: the harder fall');
  assert.deepEqual(chased.marks.at(-1), 'chased');
  assert.equal(chased.scene, '00-fall');
});

/* ── 夫诸出水 ── */

test('蠪侄\'s first sight: played on the stage in full, the classic line last, then kept on the save', () => {
  const c = content.creatures.creatures.find(x => x.id === 'longzhi');
  assert.equal(c.appear.zh.length, c.appear.en.length);
  const html = appearHtml({ ...c, dir: 'worlds/jiuding' }, { lang: 'zh', words: WORDS.zh, look: { world: { dir: 'worlds/jiuding' } } });
  const order = [...c.appear.zh, c.quote.zh].map(t => html.indexOf(t));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'every line, in order, the quote last');
  assert.match(html, /class="struck">它叫了。九个声音/);
  assert.match(html, /data-appear-done="longzhi"/);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/lingjing.css'), 'utf8'), /prefers-reduced-motion: reduce\) \{\s*\.appear,/);
  // the page keeps it seen: once, then never again; a beast without one is refused
  const s = walk(start(), TO_HALL.slice(0, TO_HALL.findIndex(([v]) => v === 'won')), content, NOW);
  assert.equal(s.scene, '00-longzhi');
  const first = VERBS.appear(s, content, ctx(), { id: 'longzhi' });
  assert.deepEqual(first.state.appeared, ['longzhi']);
  assert.equal(VERBS.appear(first.state, content, ctx(), { id: 'longzhi' }).result.seen, true);
  assert.equal(VERBS.appear(s, content, ctx(), { id: 'jingwei' }).result.refused, 'no-appear');
  // met again: one line of it on the card
  const l = look(first.state, content, ctx());
  const card = cardHtml({ card: 'creature', id: 'longzhi' }, { look: l, lang: 'zh', words: WORDS.zh, content: { creatures: [{ ...c, dir: 'worlds/jiuding' }] } });
  assert.match(card, /class="appearline small dim">山门外的林子里，放着一只妖兽。/);
  assert.doesNotMatch(cardHtml({ card: 'creature', id: 'longzhi' }, { look: look(s, content, ctx()), lang: 'zh', words: WORDS.zh, content: { creatures: [c] } }), /appearline/);
});

/* ── An old save ── */

test('an old save whose prologue scene the rewrite took away lands on the nearest new one — his save among them', () => {
  // As his live save stood on 2026-09-28: named, the four roots read, at the first practice.
  const his = { ...start(), version: 5, name: '青玄', traits: ['wood', 'water', 'fire', 'earth'], scene: '00-practice', place: 'sishui',
    done_scenes: ['00-river', '00-waking', '00-stone'], tasks: { 'alchemy-first': { status: 'offered' } }, bag: { 'moon-bell': 1 },
    cards: ['xiaoyao', 'qingteng', 'leipu', 'luying', 'shuiwu', 'huoya', 'huodan', 'tuou', 'shanjing', 'huiqi'] };
  // prologue-v3: the story begins again at 石坳村 — the v3 outer court assumes the fox he never met
  const m = migrate(his, content);
  assert.equal(m.scene, '00-shiao');
  assert.deepEqual(m.traits, his.traits, 'his roots are kept');
  assert.equal(m.name, '沈小满', 'and the hero is the book\'s now (fixed, 2026-09-30) — his card name gives way');
  assert.equal(m.gender, 'male');
  assert.deepEqual(m.tasks, {}, 'the old practice, never done, is let go');
  const l = look(m, content, ctx());
  assert.equal(l.scene.id, '00-shiao');
  assert.equal(l.place.id, 'shiao');
  assert.ok(!l.stage.some(c => c.card === 'value'), 'no name card: the hero is fixed');
  for (const [old, now] of [['00-waking', '00-shiao'], ['00-stone', '00-shiao'], ['00-river', '00-shiao'], ['00-ferry', '00-shiao'], ['00-boat', '00-shiao'], ['00-shanlu', '00-shiao'],
    ['00-gate', '00-shiao'], ['00-hall', '00-shiao'], ['00-waimen', '00-shiao'], ['00-fuzhu', '00-mijing'], ['00-north', '00-mijing'], ['nowhere', '00-shiao']]) {
    assert.equal(migrate({ ...his, scene: old }, content).scene, now, old);
  }
  // as the live save stood by the afternoon: the v1 alias had already put it at 00-waimen — a scene the rewrite kept
  const moved = migrate({ ...his, scene: '00-waimen', place: 'waimen' }, content);
  assert.equal(moved.scene, '00-shiao', 'played only the retired scenes: the rewrite begins at its start');
  const v3 = { ...start(), scene: '00-waimen', done_scenes: ['00-shiao', '00-masan'] };
  assert.equal(migrate(v3, content).scene, '00-waimen', 'a v3 save stays where it is');
  assert.equal(migrate({ ...start(), scene: '00-gate' }, content).scene, '00-gate', 'a Go to a kept scene stays');
  // walked on from there as the ordinary way: the root test later keeps his roots
  const s = walk(m, [...TO_HALL, ['resolve', { exit: 'born' }]], content, NOW);
  assert.equal(s.scene, '00-waimen');
  assert.deepEqual(s.traits, his.traits);
  // the command line reads it the same (a copy on disk, never his)
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-old-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(his));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const out = JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', 'look'], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  assert.equal(out.scene.id, '00-shiao');
  fs.rmSync(data, { recursive: true, force: true });
});

/* ── 「你爷爷的」 (Hanli, 2026-09-28): the hero's catchphrase, as the book has it ── */

test('the catchphrase rides the book\'s beats: the bowl night first, the bow, the vine on his own grandfather, the beam, nine heads', () => {
  const scenes = content.chapters['00-prologue'].scenes;
  const story = (id, exit) => (exit ? scenes[id].exits.find(e => e.id === exit) : scenes[id]).story;
  const beats = [['00-masan', 'endure', /在心里骂得极响：\*\*你爷爷的。\*\*/], ['00-masan', 'strike', /在心里骂得极响：\*\*你爷爷的。\*\*/],
    ['00-notice', null, /「你爷爷的。你拿着。」[\s\S]*「……爹，这话听着像骂人。」[\s\S]*「你爷爷的弓。」/],
    ['00-fall', 'check', /藤断了。\n\n「你爷爷的——」[\s\S]*「……爷爷，不是说你。」/], ['00-sleep', 'bath', /顶梁。「你爷爷的——」/],
    ['00-longzhi', 'subdue', /心里想：你爷爷的，九个脑袋。/]];
  for (const [id, exit, zh] of beats) {
    const exitId = exit;
    const s = story(id, exitId);
    assert.match(s.zh, zh, `${id}/${exitId}`);
    assert.match(s.en, /Your grandpa's/, `${id}/${exitId} en`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'guide/tell.md'), 'utf8'), /「你爷爷的」[\s\S]*night of the broken bowl[\s\S]*sparingly/);
});

/* ── The companion in the trials, half-recognised and never named ── */

test('the companion\'s cameos: 阿禾, a girl — braids, the red nose and notebook, known to him and dodging him; an old save named a girl reads the same', () => {
  const scenes = content.chapters['00-prologue'].scenes;
  const texts = () => [scenes['00-gate'].exits.find(e => e.id === 'steady').story, scenes['00-gate'].exits.find(e => e.id === 'rush').story, scenes['00-luoshu'].exits[0].story, scenes['00-hall'].story];
  for (const gender of ['male', 'none', 'female']) {
    const s = { ...start(), name: '墨白', gender };
    for (const t of texts()) {
      for (const lang of ['zh', 'en']) {
        const out = fill(t[lang], { ...s, lang }, content);
        assert.doesNotMatch(out, /\{伴|「石头|石头（|Shitou/, `${gender} ${lang}: filled`);
      }
      assert.match(fill(t.zh, s, content), /小辫子|红鼻头|小本子/, gender);
      assert.doesNotMatch(fill(t.zh, s, content), /翘起来的头发|翘头发|结巴|红脸蛋/, gender);
    }
    const hallText = fill(scenes['00-hall'].story.zh, s, content);
    // Since the 2026-09-30 review round he knows her (she asked him the road in 第三回) and she dodges him all day: named, never answering
    assert.match(hallText, /排在小满前面第三个的，是阿禾。她把两根小辫子[\s\S]*木、水、土，三灵根——真灵根。中上之资。[\s\S]*没敢喊出声来。/);
  }
});

test('渡劫\'s 五行 reads the root that leads: five even give it nothing, a leader of the realm\'s element matches', async () => {
  const { oddsOf } = await import('../scripts/rules/breakthrough.mjs');
  const base = { ...start(), traits: FIVE, tier: 'qi', step: 0, progress: 0, stamina: 100, stamina_at: NOW.toISOString() };
  const el = st => oddsOf(content, st, NOW, 'foundation').parts.find(p => p.id === 'element');
  assert.equal(el(base).how, null, 'five even: no leader, no 五行 bonus');
  assert.equal(el({ ...base, root_main: 'earth' }).how, 'match', '筑基 is 土');
  assert.equal(el({ ...base, root_main: 'fire' }).how, 'feeds', '火生土');
  assert.equal(el({ ...base, root_main: 'water' }).how, null);
});
