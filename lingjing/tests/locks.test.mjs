// Story gates (his ruling, 2026-09-28: 「修行是遇见yinyue, 加入宗门开始的, 先不要
// 出现开府任务, 增长修为等. 先走剧情.」): the prologue keeps cultivation, 灵石,
// 功课, 开府, 问卦, 差事, the road and 闭关 shut until the outer court
// (chapter.json `locks`) — Look carries none of it, the page draws none of it,
// the rules refuse its verbs, and an old save's carried 修为 and 灵石 go.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, bookChipHtml, cardHtml } from '../scripts/cards.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { lockedOf, migrate, newState } from '../scripts/state.mjs';
import { VERBS, look, progress, resolve } from '../scripts/rules.mjs';
import { greet } from '../scripts/rules/daily.mjs';
import { stageCards } from '../scripts/stage.mjs';
import { TO_HALL, TO_VALLEY, TO_WAIMEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ROOT = path.resolve(import.meta.dirname, '..');
const SHUT = ['cultivation', 'wealth', 'chores', 'kaifu', 'divine', 'errands', 'road', 'seclusion'];

/* The apps' menus: a pool chore, the fixed workout (done today), and 开府's milestones, one done. */
const T = id => ({ zh: `做${id}`, en: `Do ${id}` });
const MENU = [
  { id: 'shifu-scan', app: 'apple-shifu', period: 'week', due: true, reward: 20, stamina: 10, device: 'mac', pool: true, done_at: '2026-09-28T09:00:00', title: T('scan') },
  { id: 'health-workout', app: 'health', period: 'day', due: true, reward: 20, stamina: 10, device: 'phone', done_at: '2026-09-28T08:00:00', title: T('workout') },
  { id: 'linggen-pair', app: 'linggen', period: 'once', reward: 50, stamina: 20, device: 'phone', done_at: '2026-09-01T00:00:00Z', title: T('pair') },
  { id: 'linggen-models', app: 'linggen', period: 'once', reward: 50, stamina: 20, device: 'mac', done_at: '2026-09-02T00:00:00Z', title: T('models') },
];
const ctx = (quests = MENU) => ({ now: NOW, quests });

/* A new game at 马三's rent (the scene of his screenshot); and one past the gate. */
const masan = () => walk(newState(content, 'zh', NOW), TO_VALLEY.slice(0, 1), content, NOW);
const waimen = () => walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);

/* His live save as it stood on 2026-09-28, in shape: the v3 restart put him at
   石坳村 with 练气一层 40/50, 灵石 20, a cast of the coins and a 开府 chore paid. */
const hisSave = () => ({
  version: 5, world: 'jiuding', lang: 'zh', name: '青玄', gender: 'male', traits: ['wood', 'water', 'fire', 'earth'],
  tier: 'qi', step: 0, progress: 40, wealth: 20, bag: { 'moon-bell': 1 }, cast: [], wear: {}, duels: {}, arts: [],
  chapter: '00-prologue', scene: '00-masan', done_scenes: ['00-river', '00-waking', '00-stone', '00-shiao'], ended: [], place: 'shiao',
  tasks: {}, chores: { 'linggen-pair': { period: 'once', paid_at: '2026-09-28T10:00:00Z' } }, quests: {}, wins: {}, story: '', seeds_used: [],
  made: { scenes: {}, at: null }, day: { key: '2026-09-28', progress: 40, wealth: 20 }, stamina: 80, stamina_at: NOW.toISOString(),
  divination: { day: '2026-09-28', throws: [[3, 3, 3], [2, 2, 3], [2, 2, 3], [2, 2, 2], [3, 3, 2], [3, 2, 2]], hexagram: 26, changed: 50, grade: 'good', at: '2026-09-28T12:19:32.756Z' },
  created: '2026-09-11T00:00:00Z', updated: NOW.toISOString(),
});

test('the prologue declares its gate: the outer court opens it, and every lint passes', () => {
  const ch = content.chapters['00-prologue'];
  assert.equal(ch.locks.until, '00-waimen');
  assert.deepEqual(ch.locks.systems, SHUT);
  assert.deepEqual(lint(content), []);
  // A gate on no scene of its own, or a system the engine does not know, is caught.
  const bad = structuredClone(content);
  bad.chapters['00-prologue'].locks = { until: '00-nowhere', systems: ['cultivation', 'flying'], say: { zh: '不' } };
  const problems = lint(bad).join('\n');
  assert.match(problems, /locks until 00-nowhere/);
  assert.match(problems, /unknown system flying/);
  assert.match(problems, /no refusal line/);
});

test('shut on every scene before 00-waimen, open on it and after, and once the chapter is left', () => {
  for (const id of Object.keys(content.chapters['00-prologue'].scenes)) {
    const open = id === '00-waimen' || id === '00-mijing';
    assert.deepEqual(lockedOf(content, { chapter: '00-prologue', scene: id, ended: [] }), open ? [] : SHUT, id);
  }
  assert.deepEqual(lockedOf(content, { chapter: '00-prologue', scene: null, ended: ['00-prologue'] }), []);
  assert.deepEqual(lockedOf(content, { chapter: '03-qing', scene: null, ended: ['00-prologue'] }), []);
});

test('a prologue save: Look carries no realm, 修为, 灵石, coins, chores, 开府, 事 or road — and `locked` says so', () => {
  const s = { ...masan(), chance: { day: '2026-09-28', place: 'shiao', until: '2026-09-28T18:00:00Z' } };
  const l = look(s, content, ctx());
  assert.equal(l.scene.id, '00-masan');
  assert.deepEqual(l.locked, SHUT);
  for (const k of ['tier', 'progress', 'next', 'wealth', 'divination', 'chance', 'tale', 'offers', 'work', 'practice_hint', 'kaifu', 'seclusion']) assert.equal(k in l, false, k);
  assert.deepEqual(l.quests, [], 'no 人间功课, though the apps report them done');
  assert.deepEqual(l.book, [], 'no 事: no chore, no errand, no rumor');
  assert.ok(!l.stage.some(c => c.card === 'hexagram'), 'no coins on the stage');
  // What stays: 体力, the bag, the name, the scene.
  assert.equal(l.stamina.max, content.rewards.stamina.max);
  assert.ok(Array.isArray(l.bag));
  // Progress for Yinyue: no realm, no chores.
  const p = progress(s, content, ctx()).result;
  assert.equal(p.tier, undefined);
  assert.deepEqual(p.chores.today, []);
  assert.equal(p.chores.kaifu, undefined);
  assert.deepEqual(p.book, []);
});

test('the page draws none of it: no 事 chip, no 闭关 on an empty pool, no coins filling an empty stage', () => {
  const l = look(masan(), content, ctx());
  const c = { look: l, lang: 'zh', words: WORDS.zh, qi: { st: 'empty' } };
  assert.equal(bookChipHtml(c, false, false), '');
  const empty = cardHtml({ card: 'empty' }, c);
  assert.match(empty, /体力|灵气/);
  assert.doesNotMatch(empty, /data-seclude-open/);
  // A bare stage (no panel) before the gate still gets no coins.
  assert.ok(!stageCards({ ...l, scene: null, locked: SHUT }).some(x => x.card === 'hexagram'));
  // The strip: a mortal, no 修为 bar, no 灵石 — read from the page's own source.
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /isShut\(look, 'cultivation'\) \? `<span class="realm">\$\{esc\(w\.mortal\)\}<\/span>`/);
  assert.match(src, /isShut\(look, 'wealth'\) \? ''/);
  assert.match(src, /look\.seclusion \|\| isShut\(look, 'seclusion'\)/);
  assert.equal(WORDS.zh.mortal, '凡人');
});

test('a prologue save refuses every shut verb `not-yet`, in the world\'s words; the story\'s own moves go on', () => {
  const s = masan();
  const tries = [
    ['divine', {}, 'divine'], ['seclude', { focus: 'progress' }, 'seclusion'], ['meet', { action: 'take' }, 'road'],
    ['tale', { action: 'seed' }, 'errands'], ['trade', { action: 'buy', item: 'huichun-dan' }, 'wealth'],
    ['quest', { action: 'kaifu' }, 'kaifu'], ['quest', { action: 'turn', id: 'linggen-models' }, 'kaifu'],
    ['quest', { action: 'turn', id: 'health-workout' }, 'chores'], ['quest', { action: 'take', id: 'xu-anything' }, 'errands'],
    ['task', { action: 'check', id: 'shifu-scan' }, 'chores'],
  ];
  for (const [verb, args, system] of tries) {
    const out = VERBS[verb](s, content, ctx(), args);
    assert.equal(out.state, null, verb);
    assert.deepEqual([out.result.ok, out.result.refused, out.result.system], [false, 'not-yet', system], `${verb} ${JSON.stringify(args)}`);
    assert.match(out.result.say, /凡人/);
  }
  assert.equal(VERBS.divine({ ...s, lang: 'en' }, content, ctx(), {}).result.say, content.chapters['00-prologue'].locks.say.en);
  // The story walks on, and the page's reads still answer.
  assert.equal(VERBS.resolve(s, content, ctx(), { exit: 'endure' }).result.ok, true);
  assert.equal(VERBS.look(s, content, ctx(), {}).result.ok, true);
  assert.equal(VERBS.task(s, content, ctx(), { action: 'list' }).result.ok, true);
});

test('before the gate nothing pays 修为 or 灵石: the trial board pays none; the hall\'s three stones land in the outer court', () => {
  const luoshu = walk(newState(content, 'zh', NOW), TO_HALL.slice(0, TO_HALL.findIndex(([v, a]) => v === 'win' && a.id === 'gate-luoshu') + 1), content, NOW);
  assert.equal(look(luoshu, content, ctx()).tasks.find(t => t.id === 'gate-luoshu').pays, null, 'the tray promises no 修为');
  const done = VERBS.task(luoshu, content, ctx(), { action: 'done', id: 'gate-luoshu' });
  assert.equal(done.result.ok, true);
  assert.deepEqual([done.result.paid.progress, done.state.progress], [0, 0]);
  const s = waimen();
  assert.deepEqual([s.scene, s.tier, s.step, s.progress, s.wealth], ['00-waimen', 'qi', 0, 0, 3], 'the gate opens on 练气一层 at 0, the hall\'s three stones in hand');
});

test('after the gate every system is there: realm, 灵石, chores, 开府, the 事 chip, the coins', () => {
  const s = waimen();
  const l = look(s, content, ctx());
  assert.equal(l.locked, undefined);
  assert.equal(l.tier.name, '练气一层');
  assert.deepEqual([l.progress, l.wealth], [0, 3]);
  assert.ok(l.quests.some(q => q.id === 'health-workout'), 'the workout');
  assert.ok(l.book.some(b => b.chore), 'chores ride the book');
  assert.equal(l.kaifu.of, 2);
  assert.notEqual(bookChipHtml({ look: l, lang: 'zh', words: WORDS.zh }, false, false), '');
  assert.equal(VERBS.divine(s, content, ctx(), {}).result.ok, true);
  assert.equal(VERBS.task(s, content, ctx(), { action: 'check', id: 'health-workout' }).result.ok, true);
  assert.equal(VERBS.quest(s, content, ctx(), { action: 'kaifu' }).result.ok, true);
  assert.ok(progress(s, content, ctx()).result.tier);
});

test('Yinyue\'s greeting before the gate says nothing of a realm', () => {
  const asleep = { ...masan(), companion: { joined: '2026-09-27', awake: true }, greeted: '2026-09-27' };
  const facts = greet(asleep, content, ctx()).result.facts.join(' ');
  assert.doesNotMatch(facts, /练气|玩家如今是/);
  const joined = { ...waimen(), companion: { joined: '2026-09-27', awake: true }, greeted: '2026-09-27' };
  assert.match(greet(joined, content, ctx()).result.facts.join(' '), /玩家如今是练气一层/);
});

test('his save, restarted at 石坳村 with 修为 40 and 灵石 20: both go, the bag and the book stay; the gate opens clean', () => {
  const m = migrate(hisSave(), content);
  assert.equal(m.scene, '00-masan', 'restarted by v3 already, and walking it');
  assert.deepEqual([m.tier, m.step, m.progress, m.wealth], ['qi', 0, 0, 0]);
  assert.deepEqual(m.day, { key: '2026-09-28', progress: 0, wealth: 0 });
  assert.deepEqual(m.bag, { 'moon-bell': 1 }, 'the bag is kept');
  assert.deepEqual(m.chores, hisSave().chores, 'what was paid stays paid — 开府 never pays twice');
  const l = look(m, content, ctx());
  for (const k of ['tier', 'progress', 'wealth', 'divination']) assert.equal(k in l, false, k);
  // A save already past the gate keeps what it has.
  const past = migrate({ ...hisSave(), scene: '00-mijing', done_scenes: ['00-shiao', '00-masan', '00-waimen'] }, content);
  assert.deepEqual([past.progress, past.wealth], [40, 20]);
  // A seclusion left running before the gate is let go.
  assert.equal('seclusion' in migrate({ ...hisSave(), seclusion: { focus: 'progress', at: NOW.toISOString() } }, content), false);
});

test('the command line on a copy of his save: Look shows none of it, Divine refuses, the first move writes it clean', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-locks-'));
  const quests = path.join(data, 'quests');
  fs.mkdirSync(quests);
  fs.writeFileSync(path.join(quests, 'linggen.json'), JSON.stringify({ app: 'linggen', quests: MENU.filter(q => q.app === 'linggen') }));
  fs.writeFileSync(path.join(quests, 'health.json'), JSON.stringify({ app: 'health', quests: MENU.filter(q => q.app === 'health') }));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: quests, LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(hisSave()));
  const l = cli('look', '--for=ling');
  assert.deepEqual(l.locked, SHUT);
  for (const k of ['tier', 'progress', 'wealth', 'divination', 'kaifu']) assert.equal(k in l, false, k);
  assert.deepEqual(l.quests, []);
  const d = cli('divine', '--for=ling');
  assert.deepEqual([d.ok, d.refused], [false, 'not-yet']);
  assert.equal(cli('quest', '--action=kaifu').refused, 'not-yet');
  assert.equal(cli('resolve', '--exit=endure').ok, true);
  const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  assert.deepEqual([saved.scene, saved.progress, saved.wealth], ['00-dawn', 0, 0]);
  assert.deepEqual(saved.bag, { 'moon-bell': 1 });
  fs.rmSync(data, { recursive: true, force: true });
});
