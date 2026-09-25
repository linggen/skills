// 首领有台词 (redesign-v2 § 五, step 5 part 2): a fight opens with the beast
// speaking one line and ends with one line from it, and the fight's header
// names why it is fought. A haunt's and a road beast's lines are the
// creature's own (creatures.json `says`); a 传闻 finale's are Ling's, written
// with the tale (`finale.boss`), and win over the creature's for that fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { duel, look, resolve, tale, task, win } from '../scripts/rules.mjs';
import { battleHtml, boutSays, WORDS } from '../scripts/battle-card.js';
import { begin, offers, view } from '../scripts/battle.js';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const october = () => ctx({ now: new Date('2026-10-05T10:00:00') });

function must(fn, state, args, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
}

/* The spine to 夫诸's scene, then the world open (as rules.test.mjs walks it). */
function toFuzhu(lang = 'zh') {
  let s = newState(content, lang, NOW);
  s = must(resolve, s, { exit: 'reach' }).state;
  s = must(resolve, s, { exit: 'name', value: '青玄' }).state;
  s = must(resolve, s, { exit: 'touch' }).state;
  s = must(win, s, { id: 'alchemy-first' }).state;
  s = must(task, s, { action: 'done', id: 'alchemy-first' }).state;
  return must(resolve, s, { exit: 'set-out' }).state;
}
function openWorld() {
  let s = toFuzhu();
  s = must(resolve, s, { exit: 'gift' }).state;
  s = must(resolve, s, { exit: 'rest' }).state;
  return s;
}
/* 精卫 at 发鸠山, chapter 1 in play, nothing else going on. */
const atFajiu = (extra = {}) => ({ ...openWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, ...extra });
const door = (s, id, c = october()) => must(duel, s, { id }, c).result.duel;

const DIGIT = /[0-9０-９]/;
const GAME_WORDS = /修为|灵力|卡牌|灵石|体力|气血/;

test('every creature speaks: open, won, lost in both languages, short, no digits, no game words', () => {
  const all = content.creatures.creatures.filter(c => !c.made);
  assert.equal(all.length, 18);
  for (const c of all) {
    for (const k of ['open', 'won', 'lost']) {
      const line = c.says?.[k];
      assert.ok(line?.zh && line?.en, `${c.id}.says.${k}`);
      assert.ok([...line.zh].length <= 24, `${c.id}.says.${k}.zh ≤ 24: ${line.zh}`);
      assert.ok(line.en.length <= 80, `${c.id}.says.${k}.en short: ${line.en}`);
      assert.doesNotMatch(line.zh + line.en, DIGIT, `${c.id}.says.${k}: no digits`);
      assert.doesNotMatch(line.zh, GAME_WORDS, `${c.id}.says.${k}: no game words`);
      assert.match(line.zh, /\p{Script=Han}/u);
      assert.doesNotMatch(line.en, /\p{Script=Han}/u);
    }
    assert.notEqual(c.says.open.zh, c.quote.zh, 'the quote describes it; it is not its speech');
  }
});

test('a haunt: 降妖 · the place, and the creature\'s own lines at the door — Look keeps them off', () => {
  const s = atFajiu();
  const brief = door(s, 'haunt:jingwei');
  assert.equal(brief.stake, '降妖 · 发鸠山');
  const own = content.creatures.creatures.find(c => c.id === 'jingwei').says;
  assert.deepEqual(brief.says, { foe: own.open.zh, won: own.won.zh, lost: own.lost.zh });
  const l = look(s, content, october());
  assert.equal(l.place.encounter.duel.stake, '降妖 · 发鸠山', 'the reason rides Look');
  assert.equal(l.place.encounter.duel.says, undefined, 'the lines only at the door');
});

test('in English, the stake and the lines are English', () => {
  const s = { ...atFajiu(), lang: 'en' };
  const brief = door(s, 'haunt:jingwei');
  assert.match(brief.stake, /^Subdue · /);
  assert.equal(brief.says.foe, content.creatures.creatures.find(c => c.id === 'jingwei').says.open.en);
});

test('a road beast: 路上 · the place', () => {
  const c = october(), day = dayKey(c.now);
  const base = atFajiu({ chapter: '02-yan', place: 'huaidu', meets: { day, places: { huaidu: { kind: 'beast', creature: 'changyou' } } } });
  const l = look(base, content, c);
  assert.equal(l.place.encounter?.road, true, JSON.stringify(l.place.encounter));
  const brief = door(base, 'haunt:changyou', c);
  assert.equal(brief.stake, `路上 · ${l.place.name}`);
  assert.equal(brief.says.foe, content.creatures.creatures.find(x => x.id === 'changyou').says.open.zh);
});

test('an errand that asks for the beast: 差事 · its title', () => {
  const c = october();
  const base = atFajiu({ place: 'fuli', chapter: '02-yan', quests: { 'xu-fuli-longzhi': { have: [0], taken: c.now.toISOString() } } });
  const l = look(base, content, c);
  assert.equal(l.place.encounter?.creature.id, 'longzhi', JSON.stringify(l.place.encounter));
  assert.equal(door(base, 'haunt:longzhi', c).stake, '差事 · 凫丽山的蠪侄');
  // handed in, it is only the haunt again
  const done = { ...base, quests: { 'xu-fuli-longzhi': { have: [1], done_at: c.now.toISOString() } } };
  assert.match(door(done, 'haunt:longzhi', c).stake, /^降妖 · /);
});

test('a spine scene\'s duel: its chapter\'s title', () => {
  const s = toFuzhu();
  const exit = look(s, content, ctx()).scene.exits.find(e => e.duel);
  assert.equal(exit.duel.stake, content.chapters[s.chapter].title.zh);
});

/* 今日传闻 — the finale's beast speaks Ling's lines. */
const taleOpen = () => ({ ...newState(content, 'zh', NOW), name: '青玄', traits: ['water', 'wood'], scene: null, ended: ['00-prologue'], place: 'sishui', cast: [] });
const example = () => structuredClone(content.tale.example.zh);
const make = (t, s = taleOpen()) => tale(s, content, ctx(), { action: 'make', tale: JSON.stringify(t) });
/* Made, and walked straight to its finale at 夫诸's haunt. */
function atFinale(t) {
  const out = make(t);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  const s = out.state;
  s.tale.n = s.tale.chain.length - 1;
  return { ...s, place: 'sibei' };
}

test('a 传闻 finale: 传闻 · title · 终局, and the tale\'s lines over the beast\'s own', () => {
  const t = example();
  const s = atFinale(t);
  const brief = must(duel, s, { id: 'haunt:fuzhu' }).result.duel;
  assert.equal(brief.stake, `传闻 · ${t.title} · 终局`);
  assert.deepEqual(brief.says, { foe: t.finale.boss.open, won: t.finale.boss.won, lost: t.finale.boss.lost });
  // a line left out falls back to the beast's own
  const partial = example();
  delete partial.finale.boss.lost;
  const b2 = must(duel, atFinale(partial), { id: 'haunt:fuzhu' }).result.duel;
  assert.equal(b2.says.lost, content.creatures.creatures.find(c => c.id === 'fuzhu').says.lost.zh);
  // no boss at all: the beast's own lines, and the tale is fine
  const none = example();
  delete none.finale.boss;
  const b3 = must(duel, atFinale(none), { id: 'haunt:fuzhu' }).result.duel;
  assert.equal(b3.says.foe, content.creatures.creatures.find(c => c.id === 'fuzhu').says.open.zh);
});

test('tale make: bad boss lines are not playable, each problem named', () => {
  const problems = (fn) => { const t = example(); fn(t); const r = make(t).result; assert.equal(r.refused, 'not-playable'); return r.problems; };
  const has = (list, re) => assert.ok(list.some(p => re.test(p)), list.join('\n'));
  has(problems(t => { t.finale.boss.open = '水'.repeat(41); }), /finale\.boss\.open: at most 40/);
  has(problems(t => { t.finale.boss.won = '吾退了3步'; }), /finale\.boss\.won: no digits/);
  has(problems(t => { t.finale.boss.lost = '  '; }), /finale\.boss\.lost: words/);
  has(problems(t => { t.finale.boss.lost = 'Go home.'; }), /finale\.boss\.lost: in the player's language/);
  has(problems(t => { t.finale.boss = '井是吾的'; }), /finale\.boss: an object/);
  has(problems(t => { t.finale.boss.after = '再会'; }), /finale\.boss\.after: only open, won, lost/);
  assert.equal(make(Object.assign(example(), { finale: { ...example().finale, boss: undefined } })).result.ok, true, 'no boss is fine');
});

/* The card: the open line under the beast, the last word in the seal. */
function card(outcome, says) {
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const foe = content.creatures.creatures.find(c => c.id === 'leishen');
  const setup = { mode: 'pve', seed: 'x|leishen', you: { tier: 'core', step: 0, root: 'wood', deck: ['jixiao', 'huoya', 'houtu', 'luying', 'leiming', 'jingwei', 'zhennu', 'luoshi', 'fenghuo', 'linmu'] }, foe: { tier: 'core', root: 'wood', deck: foe.deck } };
  const st = begin(setup, catalog);
  if (outcome !== 'open') st.outcome = outcome;
  return battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog, board: 5, title: '降妖', foeName: '雷神', youName: '青玄', herName: '银月', stake: '降妖 · 雷泽', says: boutSays(says, outcome) });
}

test('the fight\'s card: the open bubble, the stake, and the end line inside the seal — none when it walked away', () => {
  const says = { foe: '雷泽是吾的鼓。', won: '鼓声歇了。', lost: '这声雷，是为汝擂的。' };
  const opening = card('open', says);
  assert.match(opening, /<div class="bsay foe">雷泽是吾的鼓。<\/div>/);
  assert.match(opening, /<small class="bstake">降妖 · 雷泽<\/small>/);
  assert.doesNotMatch(opening, /bover/);
  assert.doesNotMatch(opening, /bsay her/, '银月\'s words are hers — no line authored for her');
  const seal = html => /<div class="bover [a-z]+">([\s\S]*?)<\/div>\s*<\/div>\s*$/.exec(html)?.[1] ?? '';
  assert.match(seal(card('won', says)), /bsay foe">鼓声歇了。/);
  assert.match(seal(card('lost', says)), /bsay foe">这声雷，是为汝擂的。/);
  assert.doesNotMatch(card('withdrew', says), /bover withdrew[^]*bsay foe/);
  assert.match(card('withdrew', says), /bover withdrew/);
  assert.equal(boutSays(null, 'won'), null);
  assert.deepEqual(boutSays(says, 'withdrew'), { foe: says.foe, end: null });
});
