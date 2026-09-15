// The rules decide. These walk the prologue by exit ids alone — no model —
// and check every refusal leaves the state untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { langOf, migrate, newState, weekKey } from '../scripts/state.mjs';
import { VERBS, branch, duel, enter, heed, judge, lang, leave, look, make, move, parseArgs, resolve, summarize, task, trade, wake, win } from '../scripts/rules.mjs';
import { BEATS, bout, creatureMoves, roundOf } from '../scripts/duel.js';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const start = (lang = 'zh') => newState(content, lang, NOW);

/* Apply a verb and insist it was allowed. */
function must(fn, state, args, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
}
function refused(fn, state, args, code, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.refused, code);
  assert.equal(out.state, null, 'a refusal never changes state');
  return out.result;
}

/* The first task offered, its board already won on the page. */
function offerWon(s) {
  s.tasks['alchemy-first'] = { status: 'offered' };
  s.wins['alchemy-first'] = NOW.toISOString();
}

/* Walk to 夫诸 the ordinary way. */
function toFuzhu() {
  let s = start();
  s = must(resolve, s, { exit: 'reach' }).state;
  s = must(resolve, s, { exit: 'name', value: '青玄' }).state;
  s = must(resolve, s, { exit: 'touch' }).state;
  s = must(win, s, { id: 'alchemy-first' }).state;
  s = must(task, s, { action: 'done', id: 'alchemy-first' }).state;
  return must(resolve, s, { exit: 'set-out' }).state;
}

test('a new game starts at the river, 练气一层, nothing in hand', () => {
  const s = start();
  assert.equal(s.scene, '00-river');
  const seen = look(s, content, ctx());
  assert.equal(seen.tier.name, '练气一层');
  assert.equal(seen.scene.buttons.length, 2);
  assert.equal(seen.scene.exits.find(e => e.id === 'leave').button, true);
});

test('the prologue walks from the river to its end by exits alone', () => {
  let s = toFuzhu();
  refused(resolve, s, { exit: 'riddle', answer: '吉' }, 'wrong-answer');
  s = must(resolve, s, { exit: 'riddle', answer: '告' }).state;
  assert.equal(s.scene, '00-north');
  const end = must(resolve, s, { exit: 'rest' });
  s = end.state;
  assert.deepEqual(s.ended, ['00-prologue']);
  assert.equal(s.scene, null);
  assert.equal(s.name, '青玄');
  assert.deepEqual(s.traits, ['wood', 'water', 'fire', 'earth']);
  assert.deepEqual(s.cast, ['fuzhu']);
  assert.equal(s.progress, 70); // alchemy 20 + Fuzhu 50
  assert.equal(s.wealth, 10);
  assert.equal(end.result.ended, '00-prologue');
});

test('the name fills the lines that follow', () => {
  let s = must(resolve, start(), { exit: 'reach' }).state;
  const named = must(resolve, s, { exit: 'name', value: '墨白' });
  assert.equal(named.result.beat[0].text, '墨白。好名字，我记住了。');
  assert.match(named.result.scene.setup, /^墨白，入道之前/);
});

test('a name must be 1 to 8 characters', () => {
  const s = must(resolve, start(), { exit: 'reach' }).state;
  refused(resolve, s, { exit: 'name', value: '   ' }, 'value-invalid');
  refused(resolve, s, { exit: 'name', value: '一二三四五六七八九' }, 'value-invalid');
});

test('the road waits until the practice is done', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  const r = refused(resolve, s, { exit: 'set-out' }, 'needs');
  assert.match(r.say, /丹还没炼成/);
});

test('feeding Fuzhu the leftover lingzhi tames it and uses the herb up', () => {
  const s = toFuzhu();
  assert.equal(s.bag.lingzhi, 1);
  const fed = must(resolve, s, { exit: 'gift' });
  assert.equal(fed.state.bag.lingzhi, undefined);
  assert.deepEqual(fed.state.cast, ['fuzhu']);
  assert.equal(fed.result.beat[1].who, 'fuzhu');
});

test('without the herb the gift is refused in the world', () => {
  const s = toFuzhu();
  delete s.bag.lingzhi;
  const r = refused(resolve, s, { exit: 'gift' }, 'needs');
  assert.equal(r.say, '你身上没有灵芝。');
});

test('staying exits narrate and keep the scene', () => {
  const out = must(resolve, start(), { exit: 'leave' });
  assert.equal(out.state.scene, '00-river');
  assert.equal(out.result.summarize, false);
  assert.equal(must(resolve, start(), { exit: 'reach' }).result.summarize, true);
  assert.match(out.result.beat[0].text, /银光追着你的影子/);
});

test('an unknown exit, a missing answer and an unfought duel are refused', () => {
  const s = toFuzhu();
  refused(resolve, s, { exit: 'fly' }, 'unknown-exit');
  refused(resolve, s, { exit: 'riddle' }, 'needs-answer');
  refused(resolve, s, { exit: 'subdue' }, 'game-not-won');
});

test('only the rules decide a fight: a win the exit takes, and pays once', () => {
  const s = toFuzhu();
  refused(resolve, s, { exit: 'subdue', won: true }, 'game-not-won');
  refused(win, s, { id: 'chess-anywhere' }, 'not-here');
  refused(win, s, { id: 'subdue-fuzhu' }, 'not-here', ctx());
  const brief = look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue');
  assert.deepEqual(brief.game, { id: 'subdue-fuzhu', kind: 'duel', creature: 'fuzhu' });
  assert.equal(brief.duel.creature.root, 'water');
  assert.deepEqual(brief.duel.roots.map(r => r.id), ['wood', 'water', 'fire', 'earth']);
  assert.equal(brief.duel.today, null);
  // start: a bout's stamina, the creature's moves for the day
  const started = must(duel, s, { id: 'subdue-fuzhu' });
  assert.equal(started.state.stamina, s.stamina - 10);
  assert.equal(started.result.moves.length, 5);
  assert.equal(started.state.duels.fuzhu.outcome, 'open');
  // the winning picks, replayed by the rules
  const moves = started.result.moves;
  const beat = m => Object.keys(BEATS).find(k => BEATS[k] === m);
  const picks = moves.map(beat).map(x => (['wood', 'water', 'fire', 'earth'].includes(x) ? x : 'wood'));
  const settled = must(duel, started.state, { id: 'subdue-fuzhu', picks: picks.join(',') });
  assert.equal(settled.result.outcome, 'won', JSON.stringify(settled.result.rounds));
  assert.ok(settled.state.wins['subdue-fuzhu']);
  assert.equal(look(settled.state, content, ctx()).scene.exits.find(e => e.id === 'subdue').won, true);
  const out = must(resolve, settled.state, { exit: 'subdue' });
  assert.equal(out.state.scene, '00-north');
  assert.ok(out.state.cast.includes('fuzhu'));
  assert.deepEqual(out.state.wins, {});
});

test('a loss is free and the creature withdraws until tomorrow', () => {
  const s = toFuzhu();
  const started = must(duel, s, { id: 'subdue-fuzhu' });
  const moves = started.result.moves;
  const loseTo = m => BEATS[m]; // the pick the creature's move beats
  const picks = moves.map(loseTo).map(x => (['wood', 'water', 'fire', 'earth'].includes(x) ? x : 'earth'));
  const lost = must(duel, started.state, { id: 'subdue-fuzhu', picks: picks.join(',') });
  assert.equal(lost.result.outcome, 'lost', JSON.stringify(lost.result.rounds));
  assert.equal(lost.result.say, '夫诸隐入雾中。明日再来。');
  assert.equal(lost.state.wealth, s.wealth); assert.equal(lost.state.progress, s.progress);
  assert.equal(refused(resolve, lost.state, { exit: 'subdue' }, 'withdrawn').say, '夫诸隐入雾中。明日再来。');
  assert.equal(refused(duel, lost.state, { id: 'subdue-fuzhu' }, 'withdrawn').say, '夫诸隐入雾中。明日再来。');
  assert.equal(look(lost.state, content, ctx()).scene.exits.find(e => e.id === 'subdue').withdrawn, true);
  // tomorrow the mist clears
  const tomorrow = ctx({ now: new Date('2026-09-12T12:00:00') });
  assert.equal(duel(lost.state, content, tomorrow, { id: 'subdue-fuzhu' }).result.ok, true);
  assert.equal(look(lost.state, content, tomorrow).scene.exits.find(e => e.id === 'subdue').withdrawn, false);
});

test('a bout must be started, picks must be the player\'s roots, and the same day draws the same moves', () => {
  const s = toFuzhu();
  refused(duel, s, { id: 'subdue-fuzhu', picks: 'wood' }, 'not-started');
  refused(duel, s, { id: 'nothing' }, 'not-here');
  refused(duel, { ...s, stamina: 3 }, { id: 'subdue-fuzhu' }, 'no-stamina');
  const a = must(duel, s, { id: 'subdue-fuzhu' }), b = must(duel, s, { id: 'subdue-fuzhu' });
  assert.deepEqual(a.result.moves, b.result.moves);
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'metal,metal' }, 'not-your-root');
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'wood' }, 'unfinished');
});

test('the 五行 bout: 相克 wins, the reverse loses, else a draw; best of three in five', () => {
  assert.equal(roundOf('wood', 'earth'), 'won');
  assert.equal(roundOf('earth', 'wood'), 'lost');
  assert.equal(roundOf('fire', 'wood'), 'draw');
  assert.equal(bout(['wood', 'wood'], ['earth', 'earth', 'x', 'x', 'x']).outcome, 'won');
  assert.equal(bout(['wood', 'wood', 'wood'], ['earth', 'metal', 'metal', 'x', 'x']).outcome, 'lost');
  assert.equal(bout(['wood'], ['earth', 'earth']).outcome, 'open');
  const five = bout(['wood', 'fire', 'fire', 'fire', 'wood'], ['earth', 'fire', 'fire', 'fire', 'wood']);
  assert.equal(five.rounds.length, 5); assert.equal(five.outcome, 'won', 'one win and four draws');
  const moves = creatureMoves('water', '2026-09-11|fuzhu|青玄');
  assert.deepEqual(moves, creatureMoves('water', '2026-09-11|fuzhu|青玄'));
  assert.ok(moves.filter(m => m === 'water').length >= 2, 'leans to its root');
});

test('an in-world task pays only after the page recorded its win', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  refused(task, s, { action: 'done', id: 'alchemy-first' }, 'not-won');
  s = must(win, s, { id: 'alchemy-first' }).state;
  assert.equal(look(s, content, ctx()).tasks[0].won, true);
  const done = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(done.state.bag.lingzhi, 1);
  refused(win, done.state, { id: 'alchemy-first' }, 'not-here');
});

test('every line carries its speaker’s name; Ling narrates unnamed', () => {
  const s = toFuzhu();
  const scene = look(s, content, ctx()).scene;
  assert.deepEqual(scene.cast, [{ id: 'yinyue', name: '银月' }, { id: 'fuzhu', name: '夫诸' }]);
  assert.equal(scene.lines[0].name, '银月');
  const out = must(resolve, s, { exit: 'riddle', answer: '告' });
  assert.equal(out.result.beat[0].name, '夫诸');
  assert.equal(must(resolve, start('en'), { exit: 'leave' }).result.beat[0].name, null);
});

test('answers are judged in either language, punctuation and articles aside', () => {
  const s = start('en');
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: 'An egg!' }).result.right, true);
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: '告' }).result.right, true);
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: 'a promise' }).result.right, false);
});

test('a layer fills and the next begins, the rest carried over', () => {
  const s = start();
  s.progress = 90;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.step, 1);
  assert.equal(out.state.progress, 10);
  assert.deepEqual(out.result.paid.levels, [{ from: '练气一层', to: '练气二层' }]);
});

test('at the realm peak the player holds until the chapter opens', () => {
  const s = start();
  s.step = 8; s.progress = 250;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.progress, 260);
  assert.deepEqual(out.result.paid.hold, { gate: 1 });
});

test('the day caps what can be earned', () => {
  const s = start();
  s.day.progress = 230; // cap 240
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 10);
  assert.equal(out.result.paid.capped, true);
});

test('a later realm pays more for the same task; the day cap counts base', () => {
  const s = start();
  s.tier = 'deity'; s.step = 0; s.progress = 0; // 化神, pay ×3
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 60); // 20 base × 3
  assert.equal(out.state.progress, 60);
  assert.equal(out.state.day.progress, 20);
  assert.equal(out.result.paid.capped, false);
});

test('a story step costs 灵气; an empty 丹田 refuses with the hour and changes nothing', () => {
  let s = start();
  assert.equal(s.stamina, 100);
  s = must(resolve, s, { exit: 'reach' }).state;
  assert.equal(s.stamina, 90);
  s.stamina = 5; s.stamina_at = NOW.toISOString();
  const r = refused(resolve, s, { exit: 'name', value: '青玄' }, 'no-stamina');
  assert.equal(r.cost, 10);
  // 5 points short at 20 an hour = 15 minutes
  assert.equal(new Date(r.returns_at).getTime(), NOW.getTime() + 15 * 60_000);
  assert.match(r.say, /丹田已空/);
  const seen = look(s, content, ctx());
  assert.equal(seen.stamina.empty, true);
  assert.equal(seen.stamina.returns_at, r.returns_at);
});

test('灵气 refills by the clock, whole points, never over the top', () => {
  const s = start();
  s.stamina = 40; s.stamina_at = NOW.toISOString();
  const later = look(s, content, ctx({ now: new Date(NOW.getTime() + 90 * 60_000) }));
  assert.equal(later.stamina.now, 70); // 1.5 h × 20
  const full = look(s, content, ctx({ now: new Date(NOW.getTime() + 24 * 3600_000) }));
  assert.equal(full.stamina.now, 100);
  // an old save with no 灵气 wakes full
  delete s.stamina; delete s.stamina_at;
  assert.equal(look(s, content, ctx()).stamina.now, 100);
});

test('a checked quest refills 灵气 — the app\'s own amount, capped', () => {
  const s = start();
  s.stamina = 80; s.stamina_at = NOW.toISOString();
  const quests = [{ id: 'health-workout', app: 'health', period: 'day', due: true, done_at: NOW.toISOString(), reward: 20, stamina: 30 }];
  const out = must(task, s, { action: 'check', id: 'health-workout' }, ctx({ quests }));
  assert.equal(out.result.stamina, 20); // 80 + 30, capped at 100
  assert.equal(out.state.stamina, 100);
});

test('a 奇遇 grows from a seed of the province — by the day, unused first', () => {
  let s = start();
  s.name = '青玄';
  const one = must(branch, s, { action: 'open', kind: 'province-tale' });
  const seed = one.result.seed;
  assert.match(seed.id, /^xu-/);
  assert.ok(seed.line && seed.source);
  assert.deepEqual(one.state.seeds_used, [seed.id]);
  assert.equal(one.state.branch.seed, seed.id);
  // the same day, the same player: the same seed
  const again = must(branch, s, { action: 'open', kind: 'province-tale' });
  assert.equal(again.result.seed.id, seed.id);
  // once used, the day moves to another
  s = must(branch, one.state, { action: 'close', progress: 5, wealth: 0 }).state;
  const next = must(branch, s, { action: 'open', kind: 'province-tale' });
  assert.notEqual(next.result.seed.id, seed.id);
  // a seed with a creature shows its card
  const withCard = content.seeds['徐'].seeds.find(x => x.creature);
  assert.equal(withCard.creature, 'fuzhu');
});

test('Make with nothing is the template; a scene in its shape is kept and played; a bad one is refused with its problems', () => {
  let s = start('en');
  const t = make(s, content, ctx(), {}).result;
  assert.equal(t.ok, true);
  assert.equal(t.template.id, 'made-ferry');
  assert.ok(Array.isArray(t.rules) && t.rules.length);
  assert.equal(JSON.stringify(t.template).includes('"_'), false, 'notes are stripped');
  // the template itself is playable — its `gift` exit needs a second scene, so make that first
  const second = { id: 'made-ferry-2', chapter: 'made', place: { en: 'Midstream' }, setup: { en: 'The boat is midstream.' },
    exits: [{ id: 'land', label: { en: 'Land' }, means: 'lands, steps off', ends: 'made' }] };
  s = must(make, s, { scene: JSON.stringify(second) }).state;
  s = must(make, s, { scene: JSON.stringify(t.template) }).state;
  assert.equal(s.stamina, 90); // 5 each
  assert.deepEqual(Object.keys(s.made.scenes).sort(), ['made-ferry', 'made-ferry-2']);
  // enter it; the spine keeps its place
  s = must(enter, s, { scene: 'made-ferry' }).state;
  assert.equal(look(s, content, ctx()).scene.id, 'made-ferry');
  assert.equal(s.scene, '00-river');
  // an exit that stays, then one that ends: home again, paid within the branch table
  s = must(resolve, s, { exit: 'ask' }).state;
  const out = must(resolve, s, { exit: 'cross' });
  assert.equal(out.result.paid.progress, 10);
  assert.equal(out.state.made.at, null);
  assert.equal(look(out.state, content, ctx()).scene.id, '00-river');
  // refusals: a forbidden field, a grant off the branch table, a next that does not exist
  const bad = { ...second, id: 'made-bad', exits: [{ id: 'x', means: 'x', key: 'riddle', grant: { table: 'scene', progress: 50 }, next: 'made-nowhere' }] };
  const r = refused(make, s, { scene: JSON.stringify(bad) }, 'not-playable');
  assert.ok(r.problems.some(p => /may not use key/.test(p)));
  assert.ok(r.problems.some(p => /grant only from branch/.test(p)));
  refused(make, s, { scene: '{not json' }, 'not-json');
  refused(enter, s, { scene: 'made-nowhere' }, 'unknown-scene');
  refused(leave, out.state, {}, 'not-in-made'); // home already
  assert.equal(must(leave, s, {}).state.made.at, null); // from inside, straight home
});

test('a task pays once; one never offered cannot be claimed', () => {
  refused(task, start(), { action: 'done', id: 'alchemy-first' }, 'not-offered');
  const s = toFuzhu();
  refused(task, s, { action: 'done', id: 'alchemy-first' }, 'already-done');
});

test('a quest pays when its app says it was done this period, once', () => {
  const quest = { id: 'shifu-scan', app: 'apple-shifu', period: 'week', due: true, reward: 30, title: { zh: '扫描', en: 'Scan' } };
  const done = ctx({ quests: [{ ...quest, done_at: '2026-09-10T09:00:00' }] });
  const s = start();
  const seen = look(s, content, done).quests[0];
  assert.deepEqual([seen.done, seen.paid], [true, false], 'Look shows the app\'s record before anyone asks');
  const paid = must(task, s, { action: 'check', id: 'shifu-scan' }, done);
  assert.equal(paid.result.paid.progress, 30);
  assert.equal(paid.state.quests['shifu-scan'].period, weekKey(NOW));
  assert.equal(look(paid.state, content, done).quests[0].paid, true);
  refused(task, paid.state, { action: 'check', id: 'shifu-scan' }, 'already-paid', done);
  const lastWeek = ctx({ quests: [{ ...quest, done_at: '2026-09-02T09:00:00' }] });
  refused(task, s, { action: 'check', id: 'shifu-scan' }, 'not-done', lastWeek);
});

test('a branch opens alone, counts its turns and pays within its cap', () => {
  let s = must(branch, start(), { action: 'open', kind: 'night-tale' }).state;
  refused(branch, s, { action: 'open', kind: 'province-tale' }, 'branch-open');
  s = must(branch, s, { action: 'turn' }).state;
  const closed = must(branch, s, { action: 'close', progress: '500', wealth: '99' });
  assert.equal(closed.result.paid.progress, 20);
  assert.equal(closed.result.paid.wealth, 5);
  assert.equal(closed.state.branch, null);
});

test('the story summary has a length limit', () => {
  refused(summarize, start(), { text: '字'.repeat(601) }, 'too-long');
  assert.equal(must(summarize, start(), { text: '青玄在泗水边醒来。' }).state.story, '青玄在泗水边醒来。');
});

test('switching language returns the scene in it; the same language writes nothing', () => {
  const out = must(lang, start('zh'), { lang: 'en' });
  assert.equal(out.state.lang, 'en');
  assert.equal(out.result.changed, true);
  assert.equal(out.result.scene.place, 'The bank of the Si River');
  const same = must(lang, start('zh'), { lang: 'zh' });
  assert.equal(same.state, null);
  assert.equal(same.result.changed, false);
  assert.equal(same.result.scene.place, '泗水之畔');
});

test('the player’s words set the language; a tap, an emoji or the page’s report do not', () => {
  assert.equal(langOf('我伸手去摸那道光'), 'zh');
  assert.equal(langOf('call me Mobai'), 'en');
  assert.equal(langOf('hi'), 'en');
  assert.equal(langOf('ok 好'), 'zh');
  for (const quiet of ['', '👍', '42', '[scene] won alchemy-first', null]) assert.equal(langOf(quiet), null);
  const zh = start('zh');
  assert.equal(heed(zh, '伸手入水'), zh, 'a tapped Chinese label leaves a Chinese game alone');
  assert.equal(heed(zh, 'where am I?').lang, 'en');
  assert.equal(zh.lang, 'zh', 'heed never mutates');
});

test('Look carries the world’s words for the harness’s ids, in the player’s language', () => {
  const en = look(start('en'), content, ctx());
  assert.equal(en.words.progress, 'cultivation');
  assert.equal(en.words.wealth, 'spirit stones');
  assert.equal(en.words.pool, 'dantian');
  assert.deepEqual(en.words.tiers.slice(0, 3), ['Qi Condensation', 'Foundation Establishment', 'Core Formation']);
  const zh = look(start('zh'), content, ctx());
  assert.equal(zh.words.progress, '修为');
  assert.equal(zh.words.stamina, '灵气');
});

test('a save from before the dictionary migrates to the ids', () => {
  const old = { version: 1, lang: 'zh', daohao: '青玄', root: ['wood'], realm: 'qi', stage: 2, xw: 30, ls: 5, beasts: ['fuzhu'], qi: 40, qi_at: NOW.toISOString(),
    bag: {}, chapter: '00-prologue', scene: '00-practice', done_scenes: [], ended: [], tasks: {}, quests: {}, wins: {}, branch: null, story: '', day: { key: '2026-09-11', xw: 30, ls: 5, branches: 0 } };
  const m = migrate(old);
  assert.equal(m.version, 3);
  assert.equal(m.world, 'jiuding', 'a save from before worlds was playing 《九鼎》');
  assert.equal(m.name, '青玄'); assert.deepEqual(m.traits, ['wood']); assert.equal(m.tier, 'qi'); assert.equal(m.step, 2);
  assert.equal(m.progress, 30); assert.equal(m.wealth, 5); assert.deepEqual(m.cast, ['fuzhu']); assert.equal(m.stamina, 40);
  assert.deepEqual(m.day, { key: '2026-09-11', progress: 30, wealth: 5, branches: 0 });
  assert.equal(m.xw, undefined);
  assert.equal(look(m, content, ctx()).tier.name, '练气三层');
});

test('a new save says its world, and Look carries the world card', () => {
  const s = start();
  assert.equal(s.world, 'jiuding');
  assert.deepEqual(look(s, content, ctx()).world, {
    id: 'jiuding', title: '九鼎', style: '修仙 · 凡人流', premise: '大禹铸九鼎，周亡而鼎失。九州为图，九境为梯，每寻回一鼎，便破一境。',
    made: false, base: null, dir: 'worlds/jiuding',
  });
  assert.equal(look(start('en'), content, ctx()).world.title, 'The Nine Cauldrons');
});

test('a made scene with a novel\'s name is not playable', () => {
  let s = toFuzhu();
  const scene = { id: 'made-sect', chapter: 'made', place: { zh: '黄枫谷山门' }, setup: { zh: '一座山门。' },
    exits: [{ id: 'home', means: 'go home', ends: 'made' }], buttons: [] };
  const r = refused(make, s, { scene: JSON.stringify(scene) }, 'not-playable');
  assert.ok(r.problems.some(p => p.includes('names 黄枫谷 (凡人修仙传)')), JSON.stringify(r.problems));
});

/* Through the prologue and out: the world opens at 泗水北岸. */
function toOpenWorld() {
  let s = toFuzhu();
  s = must(resolve, s, { exit: 'gift' }).state;
  s = must(resolve, s, { exit: 'rest' }).state;
  assert.equal(s.scene, null);
  return s;
}

test('the corridor walks the player from place to place, and Move waits', () => {
  let s = start();
  assert.equal(s.place, 'sishui');
  assert.equal(look(s, content, ctx()).place.name, '泗水岸');
  const r = refused(move, s, { place: 'pengcheng' }, 'corridor');
  assert.equal(r.say, '先把眼前的事做完。');
  s = toFuzhu();
  assert.equal(s.place, 'sibei');
  assert.equal(look(s, content, ctx()).director.corridor, true);
  assert.equal(look(s, content, ctx()).director.thread.scene, '00-fuzhu');
});

test('Move for real: roads, tiers, a fitting place, the names', () => {
  let s = toOpenWorld();
  assert.equal(s.place, 'sibei');
  const l = look(s, content, ctx());
  assert.equal(l.scene, null);
  assert.deepEqual(l.director.near.map(p => p.id), ['sishui', 'yunlong']);
  assert.deepEqual(l.director.too_hard.map(p => p.id), ['lvliang']);
  assert.deepEqual(l.director.closed.map(p => p.id), ['zhangnan'], 'the road north waits for chapter 1');
  assert.equal(l.director.thread.chapter, '01-ji');
  assert.equal(l.director.thread.opens, '2026-10-01');
  assert.equal(l.director.thread.place.id, 'zhangnan');
  assert.equal(l.director.corridor, false);
  assert.equal(l.place.has.creature.name, '夫诸');
  assert.deepEqual(l.place.show, [{ card: 'creature', id: 'fuzhu' }]);
  assert.equal(l.place.places.length, 11);
  assert.ok(l.place.places.find(p => p.id === 'sibei').here);
  // the same place is no move
  assert.equal(must(move, s, { place: 'sibei' }).result.here, true);
  // a road away, by id, by name, by English
  const out = must(move, s, { place: '云龙山' });
  assert.equal(out.state.place, 'yunlong');
  assert.equal(out.result.summarize, true);
  assert.equal(out.result.director.here.id, 'yunlong');
  assert.equal(must(move, s, { place: 'The Si River bank' }).state.place, 'sishui');
  assert.equal(must(move, s, { place: 'yunlong' }).state.place, 'yunlong');
  // no road
  const nr = refused(move, s, { place: 'pengcheng' }, 'no-road');
  assert.equal(nr.say, '从泗水北岸没有路通向彭城。');
  assert.deepEqual(nr.near.map(p => p.id), ['sishui', 'yunlong', 'lvliang', 'zhangnan']);
  // too hard: the mist, and Yinyue's fitting place
  const th = refused(move, s, { place: 'lvliang' }, 'too-hard');
  assert.equal(th.say, '雾更浓了，看不见路。');
  assert.equal(th.fitting.id, 'sibei');
  assert.equal(th.yinyue, '还不是时候。先回泗水北岸吧。');
  // unknown
  assert.deepEqual(refused(move, s, { place: 'nowhere' }, 'unknown-place').near.map(p => p.id), ['sishui', 'yunlong', 'lvliang', 'zhangnan']);
  // a road into a province whose chapter has not opened
  assert.equal(refused(move, s, { place: 'zhangnan' }, 'road-closed').say, '冀州的路还没开。');
  // a province still answers: here, or a road not open
  assert.equal(must(move, s, { province: 'Xu' }).result.here, true);
  assert.equal(refused(move, s, { place: '冀州' }, 'road-closed').say, '冀州的路还没开。');
  // at foundation the rapids open
  s = { ...s, tier: 'foundation', step: 0, progress: 0 };
  assert.equal(must(move, s, { place: 'lvliang' }).state.place, 'lvliang');
  assert.deepEqual(look(s, content, ctx()).director.too_hard, []);
});

test('the director names today\'s seed only where seeds grow, and the pool', () => {
  const s = toOpenWorld();
  const d = look(s, content, ctx()).director;
  assert.ok(d.seed?.id.startsWith('xu-'));
  assert.equal(d.pool, 'half', 'six story steps of ten from a hundred');
  assert.equal(look(start(), content, ctx()).director.pool, 'full');
  const moved = must(move, s, { place: 'sishui' }).state;
  const t = must(move, moved, { place: 'huaidu' }).state;
  assert.equal(look(t, content, ctx()).director.seed, null, 'the ferry has no seeds');
  assert.equal(look({ ...s, stamina: 5 }, content, ctx()).director.pool, 'empty');
});

test('a save from before places starts where its province starts', () => {
  const s = { ...toOpenWorld(), place: undefined };
  assert.equal(look(s, content, ctx()).place.id, 'sishui');
});

/* Out of the prologue and into 彭城's market, with stones to spend. */
function toMarket(wealth = 100) {
  let s = toOpenWorld();
  s = must(move, s, { place: 'sishui' }).state;
  s = must(move, s, { place: 'pengcheng' }).state;
  return { ...s, wealth, stamina: 100 };
}

test('the market: the shelf on the place, buying, selling, the visit\'s stamina', () => {
  const s = toMarket();
  const l = look(s, content, ctx());
  assert.equal(l.place.has.shop, true);
  assert.deepEqual(l.place.shelf.map(i => i.id), ['lingzhi', 'qi-pill', 'ginseng', 'bamboo-sword', 'straw-cloak', 'jade-fish', 'ferry-token']);
  assert.equal(l.place.shelf[1].buy, 80);
  assert.deepEqual(l.place.show, [{ card: 'item', ids: ['lingzhi', 'qi-pill', 'ginseng', 'bamboo-sword', 'straw-cloak', 'jade-fish', 'ferry-token'] }]);
  const bought = must(trade, s, { action: 'buy', id: 'qi-pill' });
  assert.equal(bought.state.wealth, 20);
  assert.deepEqual(bought.state.bag, { 'qi-pill': 1 });
  assert.equal(bought.state.stamina, 95, 'a visit costs five');
  assert.equal(bought.result.item.held, 1);
  assert.deepEqual(look(bought.state, content, ctx()).bag, [{ id: 'qi-pill', name: '聚气丹', n: 1 }]);
  const sold = must(trade, bought.state, { action: 'sell', id: 'qi-pill' });
  assert.equal(sold.state.wealth, 40);
  assert.deepEqual(sold.state.bag, {});
  refused(trade, sold.state, { action: 'sell', id: 'qi-pill' }, 'not-in-bag');
  const poor = refused(trade, { ...s, wealth: 10 }, { action: 'buy', id: 'qi-pill' }, 'no-stones');
  assert.equal(poor.say, '灵石不够。');
  assert.equal(poor.price, 80);
  assert.deepEqual(refused(trade, s, { action: 'buy', id: 'moon-bell' }, 'not-for-sale-here').shelf.length, 7);
  refused(trade, s, { action: 'buy', id: 'nothing' }, 'unknown-item');
  refused(trade, { ...s, stamina: 2 }, { action: 'buy', id: 'straw-cloak' }, 'no-stamina');
});

test('no market away from one; a pill is used anywhere; a wear goes on Yinyue', () => {
  const s = toMarket();
  const away = must(move, s, { place: 'sishui' }).state;
  assert.equal(refused(trade, away, { action: 'buy', id: 'ginseng' }, 'no-market').say, '这里没有坊市。');
  const withPill = must(trade, s, { action: 'buy', id: 'qi-pill' }).state;
  const used = must(trade, must(move, withPill, { place: 'sishui' }).state, { action: 'use', id: 'qi-pill' });
  assert.equal(used.result.paid.progress, 20);
  assert.deepEqual(used.state.bag, {});
  refused(trade, s, { action: 'use', id: 'qi-pill' }, 'not-in-bag');
  const withSword = must(trade, s, { action: 'buy', id: 'bamboo-sword' }).state;
  refused(trade, withSword, { action: 'use', id: 'bamboo-sword' }, 'not-usable');
  const withBell = { ...s, bag: { 'moon-bell': 1 } };
  const worn = must(trade, withBell, { action: 'use', id: 'moon-bell' });
  assert.deepEqual(worn.state.wear, { yinyue: 'moon-bell' });
  assert.equal(worn.result.item.worn, true);
  const bellSold = must(trade, worn.state, { action: 'sell', id: 'moon-bell' }).state;
  assert.deepEqual(bellSold.wear, {}, 'sold, no longer worn');
});

test('a key the story still needs cannot be sold', () => {
  // At the market with the prologue not yet done: 夫诸 still needs the lingzhi.
  const s = { ...toMarket(), chapter: '00-prologue', scene: null, ended: [], done_scenes: ['00-river'], bag: { lingzhi: 1 } };
  const r = refused(trade, s, { action: 'sell', id: 'lingzhi' }, 'key-in-use');
  assert.equal(r.say, '这东西还有用处，先留着。');
  const done = { ...s, ended: ['00-prologue'] };
  assert.equal(must(trade, done, { action: 'sell', id: 'lingzhi' }).state.wealth, 110);
});

test('an exit can grant a thing', () => {
  const c = structuredClone(content);
  c.chapters['00-prologue'].scenes['00-river'].exits[0].grant = { table: 'scene', item: 'straw-cloak' };
  const out = resolve(start(), c, ctx(), { exit: 'reach' });
  assert.equal(out.result.ok, true);
  assert.equal(out.result.paid.item, 'straw-cloak');
  assert.deepEqual(out.state.bag, { 'straw-cloak': 1 });
});

/* ── Chapter 1 ── */

const OCT = new Date('2026-10-02T12:00:00');
const octx = (extra = {}) => ({ now: OCT, quests: [], ...extra });
const answer = (fn, st, args) => must(fn, st, args, octx());

test('the chapter opens on its day: Look wakes the story, the road north opens, the scene waits at its place', () => {
  const rested = toOpenWorld();
  assert.equal(wake(rested, content, ctx()), null, 'not before October');
  assert.equal(VERBS.look(rested, content, ctx()).state, null);
  const woke = VERBS.look(rested, content, octx());
  assert.equal(woke.state.chapter, '01-ji');
  assert.equal(woke.state.scene, '01-arrive');
  assert.equal(woke.state.place, 'sibei', 'no teleport outside a corridor');
  assert.equal(woke.result.scene, null, 'the scene waits at 漳水南岸');
  assert.equal(woke.result.waypoint.place.id, 'zhangnan');
  assert.equal(woke.result.director.thread.text, '路通向漳水南岸。');
  assert.deepEqual(woke.result.director.closed, []);
  // the exit cannot be taken from here
  assert.equal(refused(resolve, woke.state, { exit: 'town' }, 'not-at-scene', octx()).say, '你还没到漳水南岸。');
  const there = answer(move, woke.state, { place: 'zhangnan' });
  assert.equal(there.result.scene.id, '01-arrive');
  assert.equal(there.result.director.thread.scene, '01-arrive');
});

/* Wake and walk to the Zhang. */
function toJi() {
  const woke = VERBS.look(toOpenWorld(), content, octx()).state;
  return { ...answer(move, woke, { place: 'zhangnan' }).state, stamina: 100, wealth: 300 };
}

test('chapter 1: waypoints, the market of Ye, the shrine, the seal, the cauldron\'s gate, the end', () => {
  let s = toJi();
  // arrive → Ye: the scene moves, the player must walk
  let r = answer(resolve, s, { exit: 'town' });
  assert.equal(r.state.scene, '01-ye'); assert.equal(r.result.scene, null); assert.equal(r.result.waypoint.place.id, 'ye');
  s = r.state;
  assert.equal(look(s, content, octx()).scene, null);
  refused(resolve, s, { exit: 'shrine' }, 'not-at-scene', octx());
  s = answer(move, s, { place: 'ye' }).state;
  const ye = look(s, content, octx());
  assert.equal(ye.scene.id, '01-ye');
  assert.deepEqual(ye.place.shelf.map(i => i.id), ['moon-bell', 'iron-sword', 'foundation-pill']);
  s = answer(trade, s, { action: 'buy', id: 'iron-sword' }).state;
  assert.equal(s.wealth, 180);
  s = answer(resolve, s, { exit: 'market' }).state; // stays
  s = answer(resolve, s, { exit: 'shrine' }).state;
  s = answer(move, s, { place: 'hebo' }).state;
  const altar = look(s, content, octx()).scene;
  assert.equal(altar.id, '01-altar');
  assert.ok(altar.exits.find(e => e.id === 'subdue').duel.creature.root === 'earth');
  // the riddle way through
  refused(resolve, s, { exit: 'riddle', answer: '虾' }, 'wrong-answer', octx());
  r = answer(resolve, s, { exit: 'riddle', answer: '鱼' });
  assert.equal(r.state.scene, '01-deep'); assert.equal(r.result.paid.progress, 40);
  s = answer(move, r.state, { place: 'zhangyuan' }).state;
  r = answer(resolve, s, { exit: 'seal', answer: '5' });
  assert.equal(r.state.scene, '01-cauldron');
  assert.equal(look(r.state, content, octx()).scene.id, '01-cauldron', 'same place, no walk');
  s = r.state;
  // the gate: not at the peak of 练气
  const held = refused(resolve, s, { exit: 'take' }, 'not-at-peak', octx());
  assert.ok(held.say.startsWith('鼎气扑到你身上'));
  assert.equal(held.peak_step, 9);
  // at the peak: the Foundation is laid, then paid into the new tier
  s = { ...s, step: 8, progress: 260 };
  r = answer(resolve, s, { exit: 'take' });
  assert.deepEqual(r.result.breakthrough, { from: '练气九层', to: '筑基初期', tier: 'foundation' });
  assert.equal(r.state.tier, 'foundation'); assert.equal(r.state.step, 0);
  assert.equal(r.state.progress, 60);
  assert.deepEqual(r.result.show, [{ card: 'tribulation', strikes: 3 }]);
  assert.equal(r.state.scene, '01-end');
  r = answer(resolve, r.state, { exit: 'rest' });
  assert.deepEqual(r.state.ended, ['00-prologue', '01-ji']);
  assert.equal(r.state.scene, null);
  assert.equal(look(r.state, content, octx()).director.thread, null, 'no chapter 2 yet');
  assert.equal(wake(r.state, content, octx()), null);
});

test('chapter 1: the fight at the shrine, and Ximen Bao\'s way', () => {
  let s = toJi();
  s = answer(resolve, s, { exit: 'town' }).state;
  s = answer(move, s, { place: 'ye' }).state;
  s = answer(resolve, s, { exit: 'shrine' }).state;
  s = answer(move, s, { place: 'hebo' }).state;
  const started = answer(duel, s, { id: 'subdue-paoxiao' });
  const beat = m => Object.keys(BEATS).find(k => BEATS[k] === m);
  const picks = started.result.moves.map(beat).map(x => (['wood', 'water', 'fire', 'earth'].includes(x) ? x : 'wood'));
  const won = answer(duel, started.state, { id: 'subdue-paoxiao', picks: picks.join(',') });
  assert.equal(won.result.outcome, 'won');
  const r = answer(resolve, won.state, { exit: 'subdue' });
  assert.equal(r.state.scene, '01-deep'); assert.equal(r.result.paid.progress, 60);
  const sent = answer(resolve, s, { exit: 'send' });
  assert.equal(sent.state.scene, '01-deep');
});

test('a province is known by its character, its name or its English', () => {
  for (const province of ['徐', '徐州', 'Xu', 'xu']) assert.equal(must(move, start(), { province }).result.here, true);
  assert.equal(refused(move, start('en'), { province: 'Ji' }, 'road-closed').say, 'That road has not opened yet.');
});

test('a closed road is refused in the world', () => {
  const r = refused(move, start(), { province: '冀州' }, 'road-closed');
  assert.equal(r.say, '冀州的路还没开。');
});

test('look carries the day’s omen and the offered tasks', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  const seen = look(s, content, ctx());
  assert.ok(seen.omen.name && seen.omen.lines.length === 6);
  assert.deepEqual(seen.tasks.map(t => [t.id, t.status]), [['alchemy-first', 'offered']]);
});

test('placeholder arguments the agent left unfilled are dropped', () => {
  assert.deepEqual(parseArgs(['--exit', 'riddle', '--answer', '{{answer}}', '--won', 'true']), { exit: 'riddle', won: true });
});

test('--key=value is read whole, and an omitted arg (empty) is dropped', () => {
  assert.deepEqual(parseArgs(['--exit=riddle', '--value=', '--answer=一口 = 告', '--text=a\nb']), { exit: 'riddle', answer: '一口 = 告', text: 'a\nb' });
});

test('the command line keeps state on disk, logs it and undoes it', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  assert.deepEqual(cli('init', '--world=nowhere'), { ok: false, refused: 'unknown-world', world: 'nowhere', worlds: ['jiuding'] });
  assert.equal(cli('init', '--lang', 'en').world.id, 'jiuding');
  assert.equal(cli('look').scene.id, '00-river');
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8')).world, 'jiuding');
  assert.equal(cli('resolve', '--exit', 'reach', '--answer', '{{answer}}').scene.id, '00-waking');
  assert.equal(cli('look').scene.id, '00-waking');
  assert.equal(cli('resolve', '--exit', 'nowhere').refused, 'unknown-exit');
  assert.equal(cli('undo').undid, 'resolve');
  assert.equal(cli('look').scene.id, '00-river');
  // What the engine renders for an omitted optional arg: an empty --key=.
  const sh = spawnSync('sh', ['-c', `"${process.execPath}" scripts/rules.mjs resolve --exit='reach' --value= --answer=`], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' });
  assert.equal(JSON.parse(sh.stdout).scene.id, '00-waking');
  // Words in the other language switch the game before the verb reads it.
  const heard = cli('look', '--said=我在哪里？');
  assert.equal(heard.lang, 'zh');
  assert.equal(heard.lang_set, 'zh');
  assert.equal(cli('look', '--said=伸手').lang_set, undefined);
  fs.rmSync(data, { recursive: true, force: true });
});

// ── Worlds of the player's own: the command line parks and restores saves ──
test('Build takes the player to a fresh save in their world; Travel parks and restores; Art paints a made creature', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-worlds-'));
  const skill = path.resolve('.');
  const rules = path.join(skill, 'scripts/rules.mjs');
  const run = (...args) => {
    const out = spawnSync(process.execPath, [rules, ...args], { env: { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() }, encoding: 'utf8' });
    return JSON.parse(out.stdout.trim().split('\n').pop());
  };
  assert.equal(run('init', '--lang=en').world.id, 'jiuding');
  const t = run('build');
  assert.equal(t.template.id, 'yunmeng');
  assert.ok(t.rules.length && t.cost === 10);
  const bare = { ...t.template }; delete bare.base; delete bare.id;
  const built = run('build', `--world=${JSON.stringify(bare)}`); // base and id are the only answers there are
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.deepEqual(built.travelled, { from: 'jiuding', to: 'the-yunmeng-marsh', fresh: true }, 'no id given: the title becomes one');
  assert.equal(built.world.made, true);
  assert.equal(built.world.dir, 'data/worlds/the-yunmeng-marsh');
  assert.equal(built.scene.id, 'made-yunmeng-reeds', 'the opening scene is entered at once');
  assert.equal(built.place.id, 'reeds');
  assert.ok(fs.existsSync(path.join(dir, 'worlds/the-yunmeng-marsh/world.json')));
  assert.ok(fs.existsSync(path.join(dir, 'saves/jiuding.json')), 'the shipped world\'s save is parked');
  // play: the opening ends, the province is open, a road leads on
  assert.equal(run('resolve', '--exit=wade').paid.progress, 10);
  const moved = run('move', '--place=isle');
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.show, [{ card: 'creature', id: 'jingwei' }]);
  // worlds and travel
  assert.deepEqual(run('worlds').worlds.map(w => [w.id, w.playing, w.saved]), [['jiuding', false, true], ['the-yunmeng-marsh', true, true]]);
  const home = run('travel', '--world=jiuding');
  assert.deepEqual(home.travelled, { from: 'the-yunmeng-marsh', to: 'jiuding', fresh: false });
  assert.equal(home.scene.id, '00-river');
  assert.equal(home.stamina.now, 90, 'building cost the save it was built from');
  assert.equal(run('travel', '--world=the-yunmeng-marsh').place.id, 'isle', 'restored where it stood');
  assert.equal(run('travel', '--world=nowhere').refused, 'unknown-world');
  assert.equal(run('build', `--world=${JSON.stringify(bare)}`).refused, 'world-in-play');
  // art: only a file inside the skill, only a made creature
  const pictures = path.join(skill, 'data/pictures'); fs.mkdirSync(pictures, { recursive: true });
  const png = path.join(pictures, 'test-lushu.png'); fs.writeFileSync(png, 'png');
  try {
    assert.equal(run('art', '--creature=lushu', `--file=${path.join(dir, 'nowhere.png')}`).refused, 'no-such-file');
    assert.equal(run('art', '--creature=fuzhu', `--file=${png}`).refused, 'not-a-made-creature');
    assert.deepEqual(run('art', '--creature=lushu', '--file=/apps/lingjing/data/pictures/test-lushu.png'), { ok: true, creature: 'lushu', art: 'art/lushu.png' });
    assert.ok(fs.existsSync(path.join(dir, 'worlds/the-yunmeng-marsh/art/lushu.png')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'worlds/the-yunmeng-marsh/creatures.json'), 'utf8')).creatures[0].art, 'art/lushu.png');
  } finally {
    fs.rmSync(png, { force: true });
    if (!fs.readdirSync(pictures).length) fs.rmdirSync(pictures);
  }
  // undo steps back across the last travel
  assert.equal(run('undo').undid, 'travel');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Amend adds a creature where it haunts, or a place with its roads laid back; never to a shipped world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-amend-'));
  const rules = path.resolve('scripts/rules.mjs');
  const run = (...args) => {
    const out = spawnSync(process.execPath, [rules, ...args], { env: { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() }, encoding: 'utf8' });
    return JSON.parse(out.stdout.trim().split('\n').pop());
  };
  run('init', '--lang=en');
  const beast = { id: 'heron-king', name: { zh: '鹭王', en: 'The heron king' }, quote: { zh: '有鸟焉，其状如鹭而人语。', en: 'A bird like a heron that speaks as people do.' }, look: { zh: '白鹭，高过人。', en: 'A white heron taller than a man.' }, root: 'water' };
  assert.equal(run('amend', `--creature=${JSON.stringify(beast)}`).refused, 'not-a-made-world');
  run('build', `--world=${JSON.stringify(run('build').template)}`);
  assert.equal(run('amend').refused, 'nothing-to-add');
  // a creature at a place that already has one is refused; at an empty one it is kept and shown when standing there
  assert.ok(run('amend', `--creature=${JSON.stringify(beast)}`, '--at=isle').problems.some(p => /already has jingwei/.test(p)));
  const added = run('amend', `--creature=${JSON.stringify(beast)}`, '--at=reeds');
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.deepEqual(added.added, { creature: 'heron-king', at: 'reeds', place: null });
  assert.deepEqual(added.show, [{ card: 'creature', id: 'heron-king' }], 'the player stands at the reeds');
  const look = run('look', '--said=hi');
  assert.equal(look.place.has.creature.id, 'heron-king');
  assert.equal(look.stamina.now, 95, 'the build was paid by the save it was built from; the amend by this one');
  assert.ok(run('amend', `--creature=${JSON.stringify(beast)}`, '--at=shrine').problems.some(p => /id already taken/.test(p)));
  // as a model hands it over: quotes escaped, bare strings for words, the existing place under `place` meaning where
  const bare = JSON.stringify({ id: 'marsh-ox', name: 'The marsh ox', quote: '泽中有牛，其角如芦。', look: 'An ox with reed-like horns.', root: 'earth' }).replace(/"/g, '\\"');
  const hint = run('amend', `--creature=${bare}`, `--place=${JSON.stringify({ id: 'shrine', name: 'shrine' })}`);
  assert.deepEqual(hint.added, { creature: 'marsh-ox', at: 'shrine', place: null }, JSON.stringify(hint));
  assert.equal(run('amend', `--creature=${JSON.stringify({ ...beast, id: 'lost' })}`).problems[0], 'at: a creature needs the place it haunts');
  // a place: roads must exist; the road back is laid; the new place is walkable
  const temple = { id: 'temple', name: { zh: '水神庙', en: 'The water god\'s temple' }, tier: 0, roads: ['shrine'], line: { zh: '庙门半开。', en: 'The temple door stands half open.' } };
  assert.ok(run('amend', `--place=${JSON.stringify({ ...temple, roads: ['nowhere'] })}`).problems.some(p => /not a place of this world/.test(p)));
  assert.deepEqual(run('amend', `--place=${JSON.stringify(temple)}`).added, { creature: null, at: null, place: 'temple' });
  const places = JSON.parse(fs.readFileSync(path.join(dir, 'worlds/yunmeng/places/yunmeng.json'), 'utf8')).places;
  assert.ok(places.find(p => p.id === 'shrine').roads.includes('temple'), 'the road runs back');
  run('move', '--place=shrine');
  assert.equal(run('move', '--place=temple').place.id, 'temple');
  // art for the amended creature works like any made creature
  const pictures = path.resolve('data/pictures'); fs.mkdirSync(pictures, { recursive: true });
  const png = path.join(pictures, 'test-heron.png'); fs.writeFileSync(png, 'png');
  try {
    assert.equal(run('art', '--creature=heron-king', `--file=${png}`).art, 'art/heron-king.png');
  } finally {
    fs.rmSync(png, { force: true });
    if (!fs.readdirSync(pictures).length) fs.rmdirSync(pictures);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
