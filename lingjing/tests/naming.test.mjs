// 名字 (it was 道号 until the prologue rewrite, 2026-09-28) — a scene exit with `value` is named on the page's card, never by
// Ling. Live, 2026-09-28: the chat's AskUser offered 「取一个道号」 as its only
// option; tapped, Ling Resolved it with 青玄 — every player became 青玄. His
// ruling: 给用户一个card with some options, 用户可以选择或者输入一个自定义的,
// 不要默认给青玄. These hold the card, the draw, the chat's silence and the
// refusal; the card is drawn as the page draws it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, cardHtml, valueChoice } from '../scripts/cards.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { fitValue, newState } from '../scripts/state.mjs';
import { askOf, forLing, look, pageNames, resolve } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = { now: NOW, quests: [] };
const waking = (lang = 'zh', created = NOW) => resolve(newState(content, lang, created), content, ctx, { exit: 'reach' }).state;
const scene = content.chapters['00-prologue'].scenes['00-ferry'];
const rule = scene.exits.find(e => e.id === 'name').value;
const exitOf = l => l.scene.exits.find(e => e.id === 'name');

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
  assert.equal(en.label, 'Tell Du Shu your name');
  assert.equal(one.gender, true, 'the card asks 男 · 女 as well');
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
  assert.match(live.then, /\[scene\] named/);
  assert.equal(pageNames(content, s, { exit: 'name', value: '青玄' }).refused, 'page-names', 'no words at all');
  assert.equal(pageNames(content, s, { exit: 'name', value: '青玄', said: '[scene] opened' }).refused, 'page-names', 'a page report is not his words');
  assert.equal(pageNames(content, s, { exit: 'name', value: '墨白', said: '叫我墨白吧' }), null, 'typed by him: his');
  assert.equal(pageNames(content, s, { exit: 'name', value: 'Alex', said: 'call me alex' }), null);
  assert.equal(pageNames(content, newState(content, 'zh', NOW), { exit: 'reach' }), null, 'any other exit is untouched');
});

test('the command line: Ling refused and nothing written; the page names, page_did carries the beat, Ling never sees the offers', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-naming-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const state = () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  cli('init');
  cli('resolve', '--exit=reach');
  const seen = cli('look', '--for=ling');
  assert.equal(exitOf(seen).value.offers, undefined, 'Ling gets no names to pick from');
  assert.equal(exitOf(seen).value.max_chars, 8);
  const before = state();
  const refused = cli('resolve', '--exit=name', '--value=青玄', '--said=取一个道号', '--for=ling');
  assert.equal(refused.refused, 'page-names');
  assert.deepEqual(state(), before, 'a refusal writes nothing');
  const offered = cli('look').scene.exits.find(e => e.id === 'name').value.offers;
  const named = cli('resolve', '--exit=name', `--value=${offered[2].value}`, '--gender=male');
  assert.equal(named.ok, true, JSON.stringify(named));
  assert.deepEqual(named.named, { field: 'name', value: offered[2].value, gender: 'male' });
  assert.equal(state().gender, 'male');
  assert.equal(state().name, offered[2].value);
  const told = cli('look', `--said=[scene] named ${offered[2].value}`, '--for=ling');
  const fact = told.page_did.find(d => d.verb === 'resolve');
  assert.ok(fact, JSON.stringify(told.page_did));
  assert.match(fact.what, new RegExp(`「${offered[2].value}」 \\(a boy\\).*渡叔: ${offered[2].value}。好名字。`));
  assert.equal(told.scene.id, '00-boat');
  fs.rmSync(data, { recursive: true, force: true });
});

/* The page's own drawing of the card (cards.js value), zh and en. */
const pageCtx = (l, extra = {}) => ({ look: l, lang: l.lang, words: WORDS[l.lang], content: {}, artBase: '../worlds/jiuding/', ...extra });
const card = { card: 'value', id: 'name' };

test('the 名字 card draws: 男 · 女, the four names as chips, a field for his own, and a confirm shut until both are chosen', () => {
  for (const lang of ['zh', 'en']) {
    const l = look(waking(lang), content, ctx), offers = exitOf(l).value.offers;
    const html = cardHtml(card, pageCtx(l));
    assert.doesNotMatch(html, /undefined|\{\w+\}|NaN/, html.match(/.{0,30}(undefined|\{\w+\}|NaN).{0,30}/)?.[0]);
    assert.equal((html.match(/data-value-pick=/g) ?? []).length, 4, 'four chips');
    for (const o of offers) assert.match(html, new RegExp(`data-value-pick="${o.value}"`));
    assert.doesNotMatch(html, /namechip on/, 'nothing preselected');
    assert.match(html, /<input type="text" id="value-text" data-value-max="8" maxlength="8"/);
    assert.match(html, /data-value-go="name" disabled>/, 'confirm shut until a name is chosen');
    assert.match(html, lang === 'zh' ? /告诉渡叔你的名字[\s\S]*你是[\s\S]*女[\s\S]*男[\s\S]*选一个，或自己写一个。[\s\S]*至多8字/ : /Tell Du Shu your name[\s\S]*You are[\s\S]*a girl[\s\S]*a boy[\s\S]*Pick one, or write your own\.[\s\S]*up to 8 characters/);
    assert.equal((html.match(/data-gender-pick=/g) ?? []).length, 2, '男 · 女');
    assert.doesNotMatch(html, /namechip on/, 'no gender preselected either');
    const noGender = cardHtml(card, pageCtx(l, { valuePick: offers[1].value }));
    assert.match(noGender, new RegExp(`data-value-go="name" disabled>${lang === 'zh' ? '先选男 · 女' : 'Girl or boy first'}<`), 'a name without 男 · 女 stays shut');
    const picked = cardHtml(card, pageCtx(l, { valuePick: offers[1].value, valueGender: 'female' }));
    assert.match(picked, /namechip on" data-gender-pick="female" aria-pressed="true"/);
    assert.match(picked, new RegExp(`namechip on" data-value-pick="${offers[1].value}" aria-pressed="true"`));
    assert.match(picked, new RegExp(`data-value-go="name">${lang === 'zh' ? `就叫「${offers[1].value}」` : `Be called ${offers[1].label}`}<`));
    const own = cardHtml(card, pageCtx(l, { valuePick: offers[1].value, valueText: 'Alex', valueGender: 'male' }));
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
  const v = bad.chapters['00-prologue'].scenes['00-ferry'].exits.find(e => e.id === 'name').value;
  v.offers.push({ zh: '青玄', en: 'Qingxuan' }, { zh: '一二三四五六七八九', en: 'Toolong' });
  v.draw = 40;
  const errors = lint(bad).join('\n');
  assert.match(errors, /draws 40/);
  assert.match(errors, /offers repeat/);
  assert.match(errors, /offer 一二三四五六七八九 needs zh \+ en within max_chars/);
  assert.equal(lint(content).length, 0);
});
