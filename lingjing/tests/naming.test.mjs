// 名字. Until 2026-09-30 the first scene (石坳村) asked the player's name and
// 男 · 女 on the page's card; now the hero is fixed — 沈小满, a boy (story
// DESIGN § 四) — and no shipped scene names him. The page's value card stays
// for a scene that names a thing, so its tests run on the old exit, put back
// on a copy of the world (tests/fixtures/name-card-exit.json). Live,
// 2026-09-28: Ling once Resolved the card with 青玄 for every player — the
// card is the page's, never Ling's; these hold that too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, cardHtml, valueChoice } from '../scripts/cards.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { fitValue, newState } from '../scripts/state.mjs';
import { askOf, look, pageNames, resolve } from '../scripts/rules.mjs';

const shipped = loadContent();
const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/name-card-exit.json', import.meta.url), 'utf8'));
const content = structuredClone(shipped);
Object.assign(content.chapters['00-prologue'].scenes['00-shiao'], { exits: [FIX.exit], buttons: [FIX.exit.id] });
const NOW = new Date('2026-09-28T12:00:00');
const ctx = { now: NOW, quests: [] };
const waking = (lang = 'zh', created = NOW) => newState(content, lang, created);
const rule = FIX.exit.value;
const exitOf = l => l.scene.exits.find(e => e.id === 'name');

test('the hero is fixed: the shipped first scene asks no name and no 男 · 女; a new save is 沈小满, a boy; the lint refuses a value that asks a gender', () => {
  const s = newState(shipped, 'zh', NOW);
  assert.deepEqual([s.name, s.gender], ['沈小满', 'male']);
  const l = look(s, shipped, ctx);
  assert.ok(!l.stage.some(c => c.card === 'value'), 'no name card');
  assert.ok(!l.scene.exits.some(e => e.value), 'no exit asks a value');
  assert.deepEqual(l.scene.buttons.map(b => b.id), ['begin']);
  const bad = structuredClone(content);
  bad.chapters['00-prologue'].scenes['00-shiao'].exits[0].value.gender = true;
  assert.match(lint(bad).join('\n'), /the hero's gender is fixed/);
});

test('an old save named on the card loads as 沈小满, a boy — on the command line too, and a copy is all it touches', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-hero-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ ...newState(shipped, 'zh', NOW), name: '青玄', gender: 'female', scene: '00-masan', done_scenes: ['00-shiao'] }));
  const seen = cli('look');
  assert.equal(seen.scene.id, '00-masan');
  assert.equal(seen.name, '沈小满');
  assert.equal(seen.gender, 'male');
  fs.rmSync(data, { recursive: true, force: true });
});

test('the opening names from a pool: four drawn per save, the same on a reload, others for another save', () => {
  assert.ok(rule.offers.length >= 12, 'a pool, not three');
  assert.equal(rule.draw, 4);
  const one = exitOf(look(waking(), content, ctx)).value;
  assert.equal(one.offers.length, 4);
  assert.deepEqual(exitOf(look(waking(), content, ctx)).value.offers, one.offers, 'a reload shows the same four');
  for (const o of one.offers) assert.ok(rule.offers.some(p => p.zh === o.value && p.zh === o.label), JSON.stringify(o));
  const draws = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(exitOf(look(waking('zh', new Date(NOW.getTime() + i * 3_600_000)), content, ctx)).value.offers.map(o => o.value).sort())));
  assert.ok(draws.size >= 6, `twelve saves drew only ${draws.size} different sets`);
  const en = exitOf(look(waking('en'), content, ctx)).value;
  for (const o of en.offers) assert.equal(rule.offers.find(p => p.zh === o.value).en, o.label, 'in English: the pinyin shown, the name kept in 汉字');
  assert.equal(en.label, 'What your parents call you');
  assert.equal(one.gender, undefined, 'the card asks no 男 · 女');
});

test('the card stands on the stage; the chat asks nothing and offers no name', () => {
  const l = look(waking(), content, ctx);
  assert.ok(l.stage.some(c => c.card === 'value' && c.id === 'name'), JSON.stringify(l.stage));
  assert.ok(!l.stage.some(c => c.card === 'hexagram'), 'the coins stay away while a name is asked');
  assert.equal(l.ask, null, 'no AskUser for the name');
  assert.match(l.then, /never AskUser for it, never name one for them, never Resolve it/);
  const ungated = askOf(content, waking(), ctx, {}, true);
  assert.ok(!(ungated?.options ?? []).some(o => o.exit === 'name'), 'no naming option, even ungated');
});

test('Ling may not name the player: her Resolve of a value exit is refused unless the name is in their own typed words', () => {
  const s = waking();
  const live = pageNames(content, s, { exit: 'name', value: '青玄', said: '取一个道号' });
  assert.equal(live.refused, 'page-names', 'the bug: a tapped label, a name she chose');
  assert.match(live.then, /the stage goes on by itself/);
  assert.equal(pageNames(content, s, { exit: 'name', value: '青玄' }).refused, 'page-names', 'no words at all');
  assert.equal(pageNames(content, s, { exit: 'name', value: '青玄', said: '[scene] opened' }).refused, 'page-names', 'a page report is not his words');
  assert.equal(pageNames(content, s, { exit: 'name', value: '墨白', said: '叫我墨白吧' }), null, 'typed by him: his');
  assert.equal(pageNames(content, s, { exit: 'name', value: 'Alex', said: 'call me alex' }), null);
  assert.equal(pageNames(content, newState(content, 'zh', NOW), { exit: 'endure' }), null, 'any other exit is untouched');
});

/* The page's own drawing of the card (cards.js value), zh and en. */
const pageCtx = (l, extra = {}) => ({ look: l, lang: l.lang, words: WORDS[l.lang], content: {}, artBase: '../worlds/jiuding/', ...extra });
const card = { card: 'value', id: 'name' };

test('the 名字 card draws: the four names as chips, a field for his own, a confirm shut until one is chosen — and no 男 · 女', () => {
  for (const lang of ['zh', 'en']) {
    const l = look(waking(lang), content, ctx), offers = exitOf(l).value.offers;
    const html = cardHtml(card, pageCtx(l));
    assert.doesNotMatch(html, /undefined|\{\w+\}|NaN/, html.match(/.{0,30}(undefined|\{\w+\}|NaN).{0,30}/)?.[0]);
    assert.equal((html.match(/data-value-pick=/g) ?? []).length, 4, 'four chips');
    for (const o of offers) assert.match(html, new RegExp(`data-value-pick="${o.value}"`));
    assert.doesNotMatch(html, /namechip on/, 'nothing preselected');
    assert.doesNotMatch(html, /data-gender-pick|genderrow|city-text/, 'no 男 · 女, no city row');
    assert.match(html, /<input type="text" id="value-text" data-value-max="8" maxlength="8"/);
    assert.match(html, /data-value-go="name" disabled>/, 'confirm shut until a name is chosen');
    const picked = cardHtml(card, pageCtx(l, { valuePick: offers[1].value }));
    assert.match(picked, new RegExp(`namechip on" data-value-pick="${offers[1].value}" aria-pressed="true"`));
    assert.match(picked, new RegExp(`data-value-go="name">${lang === 'zh' ? `就叫「${offers[1].value}」` : `Be called ${offers[1].label}`}<`));
    const own = cardHtml(card, pageCtx(l, { valuePick: offers[1].value, valueText: 'Alex' }));
    assert.doesNotMatch(own, /namechip on" data-value-pick/, 'his own words win over a chip');
    assert.match(own, /value="Alex"[\s\S]*data-value-go="name">/);
    assert.match(cardHtml(card, pageCtx(l, { valueText: '一二三四五六七八九' })), /data-value-go="name" disabled>/, 'too long: shut');
    assert.match(cardHtml(card, pageCtx(l, { valueText: '   ' })), /data-value-go="name" disabled>/, 'blank: shut');
    assert.match(cardHtml(card, pageCtx(l, { valueNote: 'x' })), /class="donote">x</);
  }
});

test('the card and the rules agree on what is a name (one check, state.mjs fitValue)', () => {
  const s = waking();
  for (const typed of ['墨白', ' 青 ', 'Alex', 'qingxuan', '一二三四五六七八', '一二三四五六七八九', '', '   ', 'a\nb', '🌙月']) {
    const page = valueChoice(null, typed, rule.max_chars);
    const rules = resolve(s, content, ctx, { exit: 'name', value: typed }).result.ok;
    assert.equal(Boolean(page), rules, JSON.stringify(typed));
    assert.equal(fitValue(typed, rule.max_chars), page);
  }
});

test('the content lint holds a value exit\'s pool', () => {
  const bad = structuredClone(content);
  const v = bad.chapters['00-prologue'].scenes['00-shiao'].exits.find(e => e.id === 'name').value;
  v.offers.push({ zh: '青玄', en: 'Qingxuan' }, { zh: '一二三四五六七八九', en: 'Toolong' });
  v.draw = 40;
  const errors = lint(bad).join('\n');
  assert.match(errors, /draws 40/);
  assert.match(errors, /offers repeat/);
  assert.match(errors, /offer 一二三四五六七八九 needs zh \+ en within max_chars/);
  assert.equal(lint(content).length, 0);
});
