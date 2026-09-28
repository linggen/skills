// The prologue of 2026-09-28 (doc/drafts/prologue-v1.md): the name card's
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
import { bornRoots, drawnRoots, pillarsOf, rootsFrom, starterFor } from '../scripts/rules/roots.mjs';
import { TO_WAIMEN, TO_HALL, TO_VALLEY, V1_BIRTH, walk } from './prologue.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';

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

test('the roots: a lone year branch is the family\'s; four of one crowd out the lone; the most first', () => {
  assert.deepEqual(rootsFrom(content, ['earth', 'wood', 'fire', 'water', 'earth', 'fire']), ['fire', 'earth', 'water'], 'wood only on the year branch: dropped');
  assert.deepEqual(rootsFrom(content, ['water', 'water', 'water', 'water', 'fire', 'wood']), ['water'], '天灵根');
  assert.deepEqual(rootsFrom(content, ['water', 'fire', 'water', 'water', 'water', 'fire']), ['water', 'fire']);
  assert.deepEqual(bornRoots(content, V1_BIRTH), ['wood', 'water', 'fire', 'earth']);
});

test('天 · 地 · 真 · 伪 over every birthday 1950–2015: 天 rare, 伪 and 真 the most, every grade reachable', () => {
  const n = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let all = 0;
  for (let y = 1950; y <= 2015; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d += 3) {
    n[bornRoots(content, `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).length] += 1; all += 1;
  }
  const pct = k => (100 * n[k]) / all;
  assert.ok(pct(1) > 3 && pct(1) < 12, `天 ${pct(1).toFixed(1)}%`);
  assert.ok(pct(2) > 3 && pct(2) < 15, `地 ${pct(2).toFixed(1)}%`);
  assert.ok(pct(3) > 30 && pct(3) < 55, `真 ${pct(3).toFixed(1)}%`);
  assert.ok(pct(4) + pct(5) > 30 && pct(4) + pct(5) < 55, `伪 ${(pct(4) + pct(5)).toFixed(1)}%`);
  // the speed gap stays mild: 天 about 1.3× 伪
  assert.equal(content.traits.speed['1'] / content.traits.speed['4'], 1.3);
  assert.equal(content.traits.names['2'].zh, '地灵根');
  assert.equal(content.traits.names['3'].zh, '真灵根');
});

test('the starter: four roots are the old ten exactly; fewer roots fill with beasts, never a 功法 of a root they lack', () => {
  assert.deepEqual(starterFor(content, ['wood', 'water', 'fire', 'earth']), ['xiaoyao', 'qingteng', 'leipu', 'luying', 'shuiwu', 'huoya', 'huodan', 'tuou', 'shanjing', 'huiqi']);
  const one = starterFor(content, ['metal']), catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  assert.equal(one.length, 9);
  assert.ok(one.every(id => catalog[id].kind !== 'spell' || !catalog[id].element || catalog[id].element === 'metal'), one.join());
  for (const roots of [['fire', 'water'], ['wood', 'water', 'fire']]) assert.equal(starterFor(content, roots).length, 10, roots.join());
});

test('生辰 at the 入门仪式: the roots are read and the day let go — never on the save, in the result, in the log', () => {
  const s = hall();
  assert.equal(s.scene, '00-hall');
  const out = born(s, { birth: '2000-01-01' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.deepEqual(out.state.traits, ['fire', 'earth', 'water']);
  assert.deepEqual(out.result.born, { read: 'birth', roots: { ids: ['fire', 'earth', 'water'], name: '真灵根', elements: ['火', '土', '水'] } });
  // the stone's verdict is the player's roots, told in the passage the choice owes
  // owed since Ling last read — every beat walked here, the root test last but the scene
  const told = tellOf(content, out.state).tell, rite = told.find(t => t.id === "00-hall/born");
  assert.deepEqual(told.slice(-2).map(t => t.id), ['00-hall/born', '00-waimen']);
  assert.match(rite.text, /「真灵根，」一个执事念道/);
  assert.match(rite.text, /腿稳，心细/);
  assert.deepEqual(out.result.show, [{ card: 'traits' }]);
  assert.equal(out.state.fate, undefined, 'the 命格 stays the coins card\'s own choice');
  assert.equal(out.state.bag['grey-robe'], 1);
  assert.equal(out.state.wealth - s.wealth, 3, 'three spirit stones: the month\'s allowance');
  assert.equal(out.state.scene, '00-waimen');
  for (const text of [JSON.stringify(out.state), JSON.stringify(out.result)]) assert.doesNotMatch(text, /2000-01-01/);
  // a day that is not one, or one still to come, is refused and changes nothing
  assert.equal(born(s, { birth: '2000-02-30' }).result.refused, 'birth-invalid');
  assert.equal(born(s, { birth: '2027-01-01' }).result.refused, 'birth-invalid');
  assert.equal(born(s, {}).result.refused, 'birth-invalid', 'neither a day nor 不填');
});

test('不填: the stone reads them — a day drawn by the save\'s start, the same on a reload', () => {
  const s = hall();
  const a = born(s, { skip: 'true' }), b = born(s, { skip: 'true' });
  assert.deepEqual(a.state.traits, drawnRoots(content, s));
  assert.deepEqual(a.state.traits, b.state.traits);
  assert.equal(a.result.born.read, 'stone');
  assert.ok(a.state.cards.length >= 9);
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
  const r = cli('resolve', '--exit=born', '--birth=2000-01-01');
  assert.equal(r.ok, true, JSON.stringify(r));
  const told = cli('look', '--said=[scene] born 真灵根', '--for=ling');
  const fact = told.page_did.find(d => d.verb === 'resolve');
  assert.match(fact.what, /gave their birthday on the page's card: 真灵根 \(火 土 水\)/);
  for (const f of ['state.json', 'log.jsonl']) assert.doesNotMatch(fs.readFileSync(path.join(data, f), 'utf8'), /2000-01-01/, f);
  fs.rmSync(data, { recursive: true, force: true });
});

/* ── 男 · 女: the address and the companion ── */

test('{兄姐} and {伴} follow the name card: a girl walks with 阿禾 as 师姐, a boy with 石头 as 师兄', () => {
  const at = s => look(s, content, ctx());
  for (const [gender, ban, id] of [['female', '阿禾', 'ahe'], ['male', '石头', 'shitou']]) {
    const s = walk(start(), [['resolve', { exit: 'name', value: '墨白', gender }], ['resolve', { exit: 'endure' }]], content, NOW);
    const dawn = at(s).scene;
    assert.equal(dawn.id, '00-dawn');
    assert.equal(dawn.people[0].name, ban);
    assert.match(tellOf(content, s).tell.at(-1).text, new RegExp(`是隔壁的${ban}`));
    const egg = resolve(s, content, ctx(), { exit: 'egg' });
    assert.deepEqual(egg.result.ledger.map(e => [e.who, e.kind]), [[id, '恩']]);
    assert.match(tellOf(content, egg.state).tell.find(t => t.id === '00-dawn/egg').text, new RegExp(`「那记账，」${ban}把手缩回袖子里`));
  }
  // never said (a name typed in the chat, an old save): no address, and 阿禾 walks along
  const none = { ...start(), name: '墨白', gender: null };
  assert.equal(fill('从此观里的人叫你「{name}{兄姐}」。是{伴}。', none, content), '从此观里的人叫你「墨白」。是阿禾。');
  assert.equal(fill('The temple calls you {兄姐} {name}.', { ...none, lang: 'en' }, content), 'The temple calls you 墨白.');
  assert.equal(fill('The temple calls you {兄姐} {name}.', { ...none, lang: 'en', gender: 'male' }, content), 'The temple calls you Brother 墨白.');
  assert.equal(fill('{name}', none), '墨白', 'without the world only {name} is filled');
});

/* ── The people ── */

test('people speak as themselves: a line names them, Look carries their voice for Ling and the portrait for the page', () => {
  const s = walk(start(), [['resolve', { exit: 'name', value: '墨白', gender: 'male' }]], content, NOW);
  const l = look(s, content, ctx());
  assert.deepEqual(l.scene.people.map(p => p.id), ['masan', 'maxiaobao', 'baba']);
  assert.equal(l.scene.people[0].name, '马三');
  assert.match(l.scene.people[0].voice, /破锣/);
  assert.equal(l.scene.people[0].art, 'art/people/masan.webp');
  assert.ok(l.stage.some(c => c.card === 'people'));
  const hers = forLing(l);
  assert.equal(hers.scene.people[0].art, undefined, 'the portrait is the page\'s');
  assert.match(hers.scene.people[0].voice, /破锣/);
  const html = cardHtml({ card: 'people' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, /<img src="\.\.\/worlds\/jiuding\/art\/people\/masan\.webp" alt="马三">[\s\S]*<b>马三<\/b>/);
  // 老周's role names {伴}, filled for this player
  const cliff = look(walk(s, [...TO_VALLEY.slice(1), ['resolve', { exit: 'follow' }]], content, NOW), content, ctx()).scene;
  assert.equal(cliff.people.find(p => p.id === 'laozhou').role, '邻居，种地的，石头的爹');
  // before she walks with the player she is the story's fox, her face in the people card
  const fox = look(walk(s, TO_VALLEY.slice(1, -2), content, NOW), content, ctx()).scene;
  assert.equal(fox.id, '00-fox');
  assert.deepEqual(fox.people.map(p => [p.id, p.name]), [['yinyue', '小银狐']]);
  for (const p of content.people.people) assert.ok(fs.existsSync(path.join(content.dir, p.art)), p.art);
});

test('the lint holds people.json: a home, a portrait, a voice, and a slot for every gender', () => {
  const bad = structuredClone(content);
  bad.people.people[0].home = 'atlantis';
  bad.people.people[1].art = 'art/people/nobody.webp';
  delete bad.people.people[2].voice;
  bad.people.slots.ban.male = 'nobody';
  bad.chapters['00-prologue'].scenes['00-shiao'].lines = [{ who: 'stranger', text: { zh: '……', en: '…' } }];
  const errors = lint(bad).join('\n');
  assert.match(errors, /person dushu: home atlantis is not a place/);
  assert.match(errors, /person ahe: art art\/people\/nobody\.webp is missing/);
  assert.match(errors, /person shitou: voice needs zh and en/);
  assert.match(errors, /slot ban: male names no person/);
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
  const storm = walk(start(), TO_VALLEY.slice(0, 7), content, NOW);
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
  assert.equal(m.name, '青玄', 'and his name, until the card asks it again');
  assert.deepEqual(m.tasks, {}, 'the old practice, never done, is let go');
  const l = look(m, content, ctx());
  assert.equal(l.scene.id, '00-shiao');
  assert.equal(l.place.id, 'shiao');
  assert.ok(l.stage.some(c => c.card === 'value'), 'the name card, with 男 · 女 this time');
  for (const [old, now] of [['00-waking', '00-shiao'], ['00-stone', '00-shiao'], ['00-river', '00-shiao'], ['00-ferry', '00-shiao'], ['00-boat', '00-shiao'], ['00-shanlu', '00-shiao'],
    ['00-gate', '00-gate'], ['00-hall', '00-hall'], ['00-waimen', '00-waimen'], ['00-fuzhu', '00-mijing'], ['00-north', '00-mijing'], ['nowhere', '00-shiao']]) {
    assert.equal(migrate({ ...his, scene: old }, content).scene, now, old);
  }
  // walked on from there as the ordinary way: the root test later keeps his roots
  const s = walk(m, [...TO_HALL.map(([v, a]) => [v, a.exit === 'name' ? { ...a, value: '青玄', gender: 'male' } : a]), ['resolve', { exit: 'born' }]], content, NOW);
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
