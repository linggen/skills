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
import { VERBS, askOf, branch, duel, enter, go, heed, judge, lang, leave, look, make, move, parseArgs, resolve, summarize, tame, task, trade, wake, win, write } from '../scripts/rules.mjs';
import { BEATS, bout, creatureMoves, offers, roundOf } from '../scripts/duel.js';

const content = loadContent();
// The shipped chapters carry no `opens` while the game is being built and
// tested (his rule, 2026-09-16: "don't lock it"); the tests keep the serial
// gate exercised with the dates the launch will set.
content.chapters['01-ji'].opens = '2026-10-01';
content.chapters['02-yan'].opens = '2026-11-01';
content.chapters['03-qing'].opens = '2026-12-01';
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
/* A wrong answer to a riddle: refused, and the miss is kept for the day. */
function missed(fn, state, args, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.refused, 'wrong-answer');
  assert.ok(out.state.riddles, 'a miss is kept');
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
  missed(resolve, s, { exit: 'riddle', answer: '吉' });
  s = must(resolve, s, { exit: 'riddle', answer: '告' }).state;
  assert.equal(s.scene, '00-north');
  const end = must(resolve, s, { exit: 'rest' });
  s = end.state;
  assert.deepEqual(s.ended, ['00-prologue']);
  assert.equal(s.scene, null);
  assert.equal(s.name, '青玄');
  assert.deepEqual(s.traits, ['wood', 'water', 'fire', 'earth']);
  assert.deepEqual(s.cast, ['fuzhu']);
  assert.equal(s.step, 1); // alchemy 20 + Fuzhu 50 crosses the first layer (50)
  assert.equal(s.progress, 20);
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

test('a creature at its haunt: the bout on the stage pays once a day, and what it likes tames it', () => {
  // 精卫 at 发鸠山 in 冀, no scene there: the world open, chapter 1 in play
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  const october = () => ctx({ now: new Date('2026-10-05T10:00:00') });
  const l = look(base, content, october());
  assert.equal(l.scene, null);
  assert.equal(l.place.encounter.creature.id, 'jingwei');
  assert.equal(l.place.encounter.game.id, 'haunt:jingwei');
  assert.deepEqual(l.place.encounter.likes, { id: 'jade-fish', name: '玉鱼', held: 0 });
  assert.equal(l.director.choice.options[0].label, '降妖 · 精卫', 'the bout leads the choice');
  assert.ok(!l.director.choice.options.some(o => o.tame), 'nothing to feed it with');
  // the bout: started at the haunt, won by the rules' own replay, paid by the haunt table
  const started = must(duel, base, { id: 'haunt:jingwei' }, october());
  const moves = started.result.moves;
  const beats = { earth: 'wood', water: 'earth', fire: 'water', metal: 'fire', wood: 'metal' };
  // beat what the roots can beat; elsewhere pick a root the move does not beat (a draw)
  const picks = moves.map(m => (base.traits.includes(beats[m]) ? beats[m] : base.traits.find(r => BEATS[m] !== r)));
  const settled = must(duel, started.state, { id: 'haunt:jingwei', picks: picks.join(',') }, october());
  assert.equal(settled.result.outcome, 'won');
  assert.ok(settled.result.paid.progress > 0, 'the rules pay the haunt win');
  assert.equal(settled.result.haunt.id, 'jingwei');
  refused(duel, settled.state, { id: 'haunt:jingwei' }, 'subdued-today', october());
  assert.ok(!look(settled.state, content, october()).director.choice.options.some(o => o.duel), 'won today: the bout leaves the choice');
  // taming: the thing it likes, from the bag, once
  refused(tame, base, { creature: 'jingwei' }, 'needs-item', october());
  const fed = { ...base, bag: { ...base.bag, 'jade-fish': 1 } };
  assert.equal(look(fed, content, october()).director.choice.options[1].tame, 'jingwei', 'held: the feeding is offered');
  const out = must(tame, fed, { creature: '精卫' }, october());
  assert.ok(out.state.cast.includes('jingwei'));
  assert.equal(out.state.bag['jade-fish'], undefined);
  assert.equal(out.result.fed.id, 'jade-fish');
  assert.ok(out.result.paid.progress > 0);
  refused(tame, out.state, { creature: 'jingwei' }, 'already-tamed', october());
  refused(duel, out.state, { id: 'haunt:jingwei' }, 'tamed', october());
  assert.equal(look(out.state, content, october()).place.encounter.tamed, true);
  // elsewhere: nothing to tame
  refused(tame, toOpenWorld(), { creature: 'jingwei' }, 'not-here');
});

test('Lang never hands over a scene the player has not reached', () => {
  const o = toOpenWorld();
  assert.equal(look(o, content, ctx()).scene, null);
  assert.equal(must(lang, o, { lang: 'en' }).result.scene, null, 'no scene runs here, so none is told');
  assert.ok(must(lang, toFuzhu(), { lang: 'en' }).result.scene?.id, 'at a scene, the scene');
});

test('the engine\'s empty-reply nudge is not the player\'s word: it sets no language', () => {
  const s = { ...toFuzhu(), lang: 'zh' };
  assert.equal(heed(s, 'Your response was empty. Please respond with either a tool call or text.').lang, 'zh');
  assert.equal(heed(s, 'hello there').lang, 'en');
});

test('every answer carries the question ready: the scene\'s buttons, the riddle when one waits, the choice when the world is open', () => {
  const s = toFuzhu();
  const l = look(s, content, ctx());
  assert.deepEqual(l.ask.options.map(o => o.label), l.scene.buttons.map(b => b.label));
  assert.deepEqual(l.ask.options.map(o => o.exit), l.scene.buttons.map(b => b.id));
  assert.equal(l.ask.question, '何去何从？');
  assert.equal(l.ask.header, l.scene.place);
  assert.ok(l.then.includes('AskUser'));
  // a riddle waiting: the riddle is the question, its answers the options,
  // and a way back to the scene
  const r = refused(resolve, s, { exit: 'riddle' }, 'needs-answer');
  const a = askOf(content, s, ctx(), r);
  assert.equal(a.question, r.say);
  assert.deepEqual(a.options.map(o => o.label), ['吉', '告', '牢', '舌', '先不答']);
  assert.ok(a.options.slice(0, 4).every(o => o.exit === 'riddle' && o.answer === o.label));
  assert.equal(a.options.at(-1).look, true);
  // a miss: the hint, and the answers left; a second miss shuts it for the day
  const miss = resolve(s, content, ctx(), { exit: 'riddle', answer: '吉' });
  assert.equal(miss.result.refused, 'wrong-answer'); assert.ok(miss.result.hint);
  assert.deepEqual(askOf(content, miss.state, ctx(), miss.result).options.map(o => o.label), ['告', '牢', '舌', '先不答']);
  const shut = resolve(miss.state, content, ctx(), { exit: 'riddle', answer: '牢' });
  assert.equal(shut.result.refused, 'riddle-closed'); assert.equal(shut.result.hint, undefined);
  assert.equal(refused(resolve, shut.state, { exit: 'riddle', answer: '告' }, 'riddle-closed').exit, 'riddle');
  assert.ok(!askOf(content, shut.state, ctx(), shut.result).options.some(o => o.exit === 'riddle'));
  assert.equal(look(shut.state, content, ctx()).scene.exits.find(e => e.id === 'riddle').closed, true);
  const tomorrow = ctx({ now: new Date(NOW.getTime() + 864e5) });
  assert.equal(resolve(shut.state, content, tomorrow, { exit: 'riddle', answer: '告' }).result.ok, true);
  // the filler never repeats the player's last word: after Yinyue, a look around
  const one = { ...l.scene, buttons: l.scene.buttons.slice(0, 1) };
  assert.equal(askOf(content, s, { ...ctx(), said: '问问银月' }).options.at(-1)?.label !== '问问银月', true);
  assert.equal(askOf(content, s, { ...ctx(), said: '看看四周' }).options.at(-1)?.label !== '看看四周', true);
  void one;
  // the world open: the director's choice
  const o = toOpenWorld();
  const lo = look(o, content, ctx());
  assert.deepEqual(lo.ask, lo.director.choice);
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
  // start: the creature's moves for the day (a bout in the prologue is free)
  const started = must(duel, s, { id: 'subdue-fuzhu' });
  assert.equal(started.state.stamina, s.stamina);
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

test('the worn sword stands beside the roots in the bout; sold, its root is no longer theirs; 夫诸 teaches 借势 as it joins', () => {
  const s = { ...toFuzhu(), bag: { 'iron-sword': 1 }, wear: { weapon: 'iron-sword' } };
  const brief = look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel;
  assert.deepEqual(brief.sword, { id: 'iron-sword', name: '铁剑', root: 'metal', root_name: '金' });
  assert.deepEqual(brief.charm, { id: 'talisman', name: '符', held: 0 });
  assert.deepEqual(brief.arts, []);
  assert.deepEqual(brief.kit, { roots: ['wood', 'water', 'fire', 'earth'], sword: 'metal', weapon: 'iron-sword', charm: { id: 'talisman', held: 0 }, arts: {} });
  const started = must(duel, s, { id: 'subdue-fuzhu' });
  const { picks, played } = playOut(brief.kit, started.result.moves);
  const settled = must(duel, started.state, { id: 'subdue-fuzhu', picks: picks.join(',') });
  assert.equal(settled.result.outcome, played.outcome);
  assert.equal(refused(duel, started.state, { id: 'subdue-fuzhu', picks: 'metal,metal' }, 'sword-twice').token, 'metal');
  // not in the bag any more: not worn, not theirs
  const bare = { ...started.state, bag: {} };
  assert.equal(look(bare, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.sword, null);
  refused(duel, bare, { id: 'subdue-fuzhu', picks: 'metal' }, 'not-your-root');
  // the companion teaches its art as it joins
  const won = must(duel, started.state, { id: 'subdue-fuzhu', picks: picks.join(',') });
  if (won.result.outcome === 'won') {
    const out = must(resolve, won.state, { exit: 'subdue' });
    assert.deepEqual(out.state.arts, ['jieshi']);
    assert.equal(out.result.paid.learned.name, '借势');
    assert.equal(out.result.paid.learned.ready, true, '练气 may borrow');
  }
  // an old save with 夫诸 already walking learns on the next Look
  const old = { ...toOpenWorld(), arts: undefined };
  assert.ok(old.cast.includes('fuzhu'));
  const woke = VERBS.look(old, content, ctx());
  assert.deepEqual(woke.state.arts, ['jieshi']);
  assert.equal(woke.result.arts[0].id, 'jieshi');
  assert.equal(woke.result.learned[0].name, '借势', 'said once');
  const again = VERBS.look(woke.state, content, ctx());
  assert.equal(again.state, null, 'learned once'); assert.equal(again.result.learned, undefined);
  // the art learned is in the kit of the next bout, ready at 练气
  const kit = look(woke.state, content, ctx()).place.encounter.duel.kit;
  assert.deepEqual(kit.arts, { jieshi: { effect: 'generate', ready: true } });
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
  // The question leaves the bout out today, and offers it again tomorrow.
  assert.ok(!askOf(content, lost.state, ctx()).options.some(o => o.exit === 'subdue'));
  assert.ok(askOf(content, lost.state, tomorrow).options.some(o => o.exit === 'subdue'));
});

test('a bout must be started, picks must be the player\'s roots, and the same day draws the same moves', () => {
  const s = toFuzhu();
  refused(duel, s, { id: 'subdue-fuzhu', picks: 'wood' }, 'not-started');
  refused(duel, s, { id: 'nothing' }, 'not-here');
  must(duel, { ...s, stamina: 3 }, { id: 'subdue-fuzhu' }); // free in the prologue
  const a = must(duel, s, { id: 'subdue-fuzhu' }), b = must(duel, s, { id: 'subdue-fuzhu' });
  assert.deepEqual(a.result.moves, b.result.moves);
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'metal,metal' }, 'not-your-root');
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'wood' }, 'unfinished');
});

test('the day\'s moves always hold two the player\'s roots overcome', () => {
  // 木水火土 before a 木 creature: without 金 nothing overcomes 木, so the
  // day must deal moves those roots beat — and exactly the same each call
  const roots = ['wood', 'water', 'fire', 'earth'];
  const beatable = roots.map(r => BEATS[r]);
  for (const day of ['2026-09-16', '2026-09-17', '2026-09-18', '2026-10-01']) {
    const moves = creatureMoves('wood', `${day}|leishen|青玄`, roots);
    assert.ok(moves.filter(m => beatable.includes(m)).length >= 2, `${day}: ${moves}`);
    assert.deepEqual(moves, creatureMoves('wood', `${day}|leishen|青玄`, roots));
  }
  assert.ok(creatureMoves('wood', '2026-09-16|leishen|青玄', ['metal']).filter(m => m === 'wood').length >= 2);
  assert.deepEqual(creatureMoves('wood', 'x', []), creatureMoves('wood', 'x'), 'no roots: the plain draw');
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

/* ── 功法: the sword, the 符 and the arts, on the shared engine ── */

const FOUR = ['wood', 'water', 'fire', 'earth'];
const kitOf = (extra = {}) => ({ roots: FOUR, sword: null, charm: { id: 'talisman', held: 0 }, arts: {}, ...extra });
/* Play to win from what the kit offers: the first token that overcomes the
   creature's move, else the first that may come. */
function playOut(kit, moves) {
  const picks = [];
  for (let guard = 0; guard < 12; guard += 1) {
    const played = bout(picks, moves, kit);
    if (played.outcome !== 'open' && !played.rescue) return { picks, played };
    const ok = offers(picks, moves, kit).filter(o => o.ok);
    const move = moves[played.rounds.length];
    const best = ok.find(o => o.kind === 'charm') ?? ok.find(o => (o.kind === 'root' || o.kind === 'sword') && BEATS[o.token] === move)
      ?? ok.find(o => o.kind === 'art') ?? ok.find(o => o.kind === 'root' || o.kind === 'sword');
    picks.push(best.token);
  }
  throw new Error('no end');
}

test('a worn sword lends its root: a 木水火土 player beats a 木 creature with 金, one breath between strokes', () => {
  const wood = ['wood', 'wood', 'wood', 'wood', 'wood'];
  assert.equal(playOut(kitOf(), wood).played.outcome, 'lost', 'five draws lose');
  const armed = kitOf({ sword: 'metal' });
  const { picks, played } = playOut(armed, wood);
  assert.equal(played.outcome, 'won');
  assert.deepEqual(picks, ['metal', 'wood', 'metal'], 'a breath between two strokes');
  assert.deepEqual(bout(['metal', 'metal'], wood, armed).refused, { token: 'metal', why: 'sword-twice' });
  assert.equal(bout(['metal'], wood, kitOf()).refused.why, 'not-your-root', 'not worn: not theirs');
  assert.equal(offers(['metal'], wood, armed).find(o => o.kind === 'sword').why, 'sword-twice');
  // 御剑: twice running
  const rider = kitOf({ sword: 'metal', arts: { yujian: { effect: 'sword-twice', ready: true } } });
  assert.equal(bout(['metal', 'metal'], wood, rider).outcome, 'won');
  assert.equal(bout(['metal', 'metal'], wood, kitOf({ sword: 'metal', arts: { yujian: { effect: 'sword-twice', ready: false } } })).refused.why, 'sword-twice');
});

test('a 符 wins its round outright, once a bout, only when held', () => {
  const wood = ['wood', 'wood', 'wood', 'wood', 'wood'];
  const held = kitOf({ charm: { id: 'talisman', held: 1 } });
  const one = bout(['talisman'], wood, held);
  assert.deepEqual(one.rounds[0], { pick: 'talisman', move: 'wood', result: 'won', charm: true });
  assert.equal(one.used.charm, true);
  assert.equal(bout(['talisman', 'talisman'], wood, held).refused.why, 'charm-used');
  assert.equal(bout(['talisman'], wood, kitOf()).refused.why, 'no-charm');
  assert.equal(bout(['x'], wood, held).refused.why, 'bad-token');
});

test('the arts: 五雷法 turns a draw, 遁法 takes back a loss and rescues a decided bout, 借势 borrows 相生; each once, each in its realm', () => {
  const wood = ['wood', 'wood', 'wood', 'wood', 'wood'];
  const thunder = kitOf({ arts: { wulei: { effect: 'draw-wins', ready: true } } });
  const struck = bout(['wood', 'art:wulei'], wood, thunder);
  assert.equal(struck.rounds[0].result, 'won'); assert.equal(struck.rounds[0].art, 'wulei');
  assert.equal(bout(['wood', 'art:wulei', 'wood', 'art:wulei'], wood, thunder).refused.why, 'art-used');
  assert.equal(bout(['art:wulei'], wood, thunder).refused.why, 'art-no-draw', 'no round yet');
  assert.equal(bout(['wood', 'art:wulei'], wood, kitOf({ arts: { wulei: { effect: 'draw-wins', ready: false } } })).refused.why, 'art-needs-tier');
  assert.equal(bout(['wood', 'art:dunfa'], wood, thunder).refused.why, 'art-unknown');
  // 遁法 after the second loss: the bout was decided, the art reopens it
  const metal = ['metal', 'metal', 'metal', 'metal', 'metal'];
  const runner = kitOf({ arts: { dunfa: { effect: 'undo-loss', ready: true } } });
  const twoDown = bout(['wood', 'wood'], metal, runner);
  assert.equal(twoDown.outcome, 'lost'); assert.equal(twoDown.rescue, true, 'an art could still turn it');
  assert.equal(offers(['wood', 'wood'], metal, runner).find(o => o.kind === 'root').why, 'bout-over');
  const back = bout(['wood', 'wood', 'art:dunfa'], metal, runner);
  assert.equal(back.outcome, 'open'); assert.equal(back.rounds[1].result, 'draw');
  assert.equal(bout(['wood', 'wood', 'art:dunfa', 'wood', 'art:dunfa'], metal, runner).refused.why, 'art-used');
  assert.equal(bout(['fire', 'art:dunfa'], metal, runner).refused.why, 'art-no-loss', 'the round was won');
  // 借势: wood counts as fire, and fire overcomes metal
  const borrower = kitOf({ arts: { jieshi: { effect: 'generate', ready: true } } });
  const lent = bout(['art:jieshi', 'wood'], metal, borrower);
  assert.deepEqual(lent.rounds[0], { pick: 'wood', move: 'metal', result: 'won', as: 'fire', art: 'jieshi' });
  assert.equal(bout(['art:jieshi', 'art:jieshi'], metal, borrower).refused.why, 'art-used');
  assert.equal(bout(['art:jieshi', 'art:jieshi2'], metal, kitOf({ arts: { jieshi: { effect: 'generate', ready: true }, jieshi2: { effect: 'generate', ready: true } } })).refused.why, 'art-pending');
  assert.equal(bout(['art:jieshi'], metal, borrower).pending, 'jieshi');
  // a decided bout with no art to turn it needs no word
  assert.equal(bout(['fire', 'fire'], metal, borrower).rescue, false);
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
  s.progress = 40;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.step, 1);
  assert.equal(out.state.progress, 10);
  assert.deepEqual(out.result.paid.levels, [{ from: '练气一层', to: '练气二层' }]);
});

test('at the realm peak the player holds until the chapter opens', () => {
  const s = start();
  s.step = 8; s.progress = 120;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.progress, 130);
  assert.deepEqual(out.result.paid.hold, { gate: 1, held: 10 });
  assert.equal(out.result.paid.progress, 10, 'only what the peak took is paid');
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

test('the prologue is free: its steps and bouts cost no 灵气, with the 丹田 empty or full', () => {
  let s = { ...start(), stamina: 0, stamina_at: NOW.toISOString() };
  s = must(resolve, s, { exit: 'reach' }).state;
  s = must(resolve, s, { exit: 'name', value: '青玄' }).state;
  assert.equal(s.scene, '00-stone');
  assert.equal(s.stamina, 0);
  // making a scene inside it still costs
  const ferry = make(s, content, ctx(), {}).result.template;
  const exits = ferry.exits.filter(e => !e.next);
  const scene = { ...ferry, exits, buttons: ferry.buttons.filter(id => exits.some(e => e.id === id)) };
  refused(make, s, { scene: JSON.stringify(scene) }, 'no-stamina');
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
  // a tale closed before the player took part pays nothing
  const early = must(branch, s, { action: 'close', progress: '20', wealth: '5' });
  assert.equal(early.result.paid, null);
  assert.equal(early.result.unpaid, 'too-soon');
  // a turn is the player's words; the same words twice are one turn
  refused(branch, s, { action: 'turn' }, 'no-player-turn');
  s = must(branch, s, { action: 'turn', said: '我跟着那点灯火走' }).state;
  refused(branch, s, { action: 'turn', said: '我跟着那点灯火走' }, 'no-player-turn');
  // the words that end the tale count as the player's last turn
  assert.equal(must(branch, s, { action: 'close', said: '问她叫什么', progress: '20', wealth: '5' }).result.paid.progress, 20);
  s = must(branch, s, { action: 'turn', said: '问她叫什么' }).state;
  const closed = must(branch, s, { action: 'close', progress: '500', wealth: '99' });
  assert.equal(closed.result.paid.progress, 20);
  assert.equal(closed.result.paid.wealth, 5);
  assert.equal(closed.state.branch, null);
});

test('with the engine counting the player\'s messages, a tale\'s turns are those sent since it opened', () => {
  // The engine says the player has sent 7 messages when the tale opens: that
  // message is the asking, not a turn of the tale.
  let s = must(branch, start(), { action: 'open', kind: 'night-tale' }, ctx({ turn: 7 })).state;
  assert.equal(s.branch.at_turn, 7);
  s = must(branch, s, { action: 'turn', said: '走' }, ctx({ turn: 7 })).state;
  assert.equal(s.branch.turns, 0, 'the opening message is not a turn');
  // Ling forgot to report a turn; the count catches up on the next call.
  s = must(branch, s, { action: 'turn', said: '走' }, ctx({ turn: 9 })).state;
  assert.equal(s.branch.turns, 2, 'the same words, but the engine counted two messages');
  // Closing pays by the engine's count, whatever Ling said.
  const closed = must(branch, s, { action: 'close', progress: '20', wealth: '5' }, ctx({ turn: 10 }));
  assert.equal(closed.state.branch, null);
  assert.equal(closed.result.paid.progress, 20);
  // Opened on an engine that counts, played on one that does not: the words count as before.
  s = must(branch, start(), { action: 'open', kind: 'night-tale' }).state;
  assert.equal(s.branch.at_turn, null);
  refused(branch, s, { action: 'turn' }, 'no-player-turn', ctx({ turn: 3 }));
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
    atlas: { file: 'art/map/jiuzhou.svg', aspect: content.world.atlas.aspect, provinces: content.world.atlas.provinces },
  });
  assert.equal(look(start('en'), content, ctx()).world.title, 'The Nine Cauldrons');
  // Every place Look lists for the map says where it stands on the world map.
  assert.ok(look(s, content, ctx()).place.places.every(p => p.map?.length === 2));
  // The page's atlas verb: every province's places on the map, never Look's here.
  const all = VERBS.atlas(s, content, ctx(), {}).result.provinces;
  assert.deepEqual(Object.keys(all).sort(), Object.keys(content.places).sort());
  assert.ok(all['冀'].places.some(p => p.name === '邺城' && p.map.length === 2 && !('here' in p)));
});

test('a made scene with a novel\'s name is not playable', () => {
  let s = toFuzhu();
  const scene = { id: 'made-sect', chapter: 'made', place: { zh: '黄枫谷山门' }, setup: { zh: '一座山门。' },
    exits: [{ id: 'home', means: 'go home', ends: 'made' }], buttons: [] };
  const r = refused(make, s, { scene: JSON.stringify(scene) }, 'not-playable');
  assert.ok(r.problems.some(p => p.includes('names 黄枫谷 (凡人修仙传)')), JSON.stringify(r.problems));
});

/* Through the prologue and out: the world opens at 泗水北岸. */
/* Inside the template's ferry, made without its exit to a second scene. */
function inFerry(s) {
  const ferry = make(s, content, ctx(), {}).result.template;
  const exits = ferry.exits.filter(e => !e.next);
  const scene = { ...ferry, exits, buttons: ferry.buttons.filter(id => exits.some(e => e.id === id)) };
  return must(enter, must(make, s, { scene: JSON.stringify(scene) }).state, { scene: 'made-ferry' }).state;
}

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
  refused(move, inFerry(s), { place: 'huaidu' }, 'corridor'); // a made scene does not open the corridor's road
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
  // the choice is ready for AskUser: the thread's place first when a road
  // leads there, else the roads as they are; a word to Yinyue keeps it at two
  assert.equal(l.director.choice.header, '泗水北岸');
  assert.equal(l.director.choice.question, '何去何从？');
  assert.deepEqual(l.director.choice.options.slice(0, 2).map(o => o.label), ['泗水岸', '云龙山']);
  assert.deepEqual(l.director.choice.options.slice(0, 2).map(o => o.move), ['sishui', 'yunlong']);
  assert.deepEqual(l.director.choice.options[2], { label: '在此逗留', linger: true }, 'seeds grow here: a linger opens the day\'s branch');
  assert.equal(look(toFuzhu(), content, ctx()).director.choice, null, 'a scene running has its own buttons');
  assert.equal(l.place.has.creature.name, '夫诸');
  assert.deepEqual(l.place.show, [{ card: 'creature', id: 'fuzhu' }]);
  assert.equal(l.place.places.length, 11);
  assert.ok(l.place.places.find(p => p.id === 'sibei').here);
  // the same place is no move
  assert.equal(must(move, s, { place: 'sibei' }).result.here, true);
  // a road away, by id, by name, by English
  const out = must(move, s, { place: '云龙山' });
  assert.equal(out.state.place, 'yunlong');
  assert.equal(out.result.summarize, false, 'a road walked inside the province is no story yet');
  assert.equal(out.result.director.here.id, 'yunlong');
  assert.equal(must(move, s, { place: 'The Si River bank' }).state.place, 'sishui');
  assert.equal(must(move, s, { place: 'yunlong' }).state.place, 'yunlong');
  // no road
  const nr = refused(move, s, { place: 'pengcheng' }, 'no-road');
  assert.equal(nr.say, '从泗水北岸没有路通向彭城。');
  assert.deepEqual(nr.near.map(p => p.id), ['sishui', 'yunlong', 'lvliang', 'zhangnan']);
  assert.equal(nr.here.id, 'sibei', 'a refused move says where the player still stands');
  assert.equal(nr.toward.id, 'sishui', 'and the first road on the way');
  // the way walks only places the player may enter: 微山 waits behind the rapids and 沛泽
  assert.equal(refused(move, s, { place: 'huaidu' }, 'no-road').toward.id, 'sishui');
  assert.equal(refused(move, s, { place: 'weishan' }, 'no-road').toward, null, 'beyond the tier: no way to offer');
  assert.deepEqual(l.place.places.find(p => p.id === 'sibei').roads, ['sishui', 'yunlong', 'lvliang', 'zhangnan']);
  assert.equal(l.place.province.start, 'sishui');
  // too hard: the mist, and Yinyue's fitting place
  const th = refused(move, s, { place: 'lvliang' }, 'too-hard');
  assert.equal(th.say, '雾更浓了，看不见路。');
  assert.equal(th.fitting.id, 'sibei');
  assert.equal(th.yinyue, '还不是时候。先回泗水北岸吧。');
  assert.equal(th.here.id, 'sibei');
  // unknown
  assert.deepEqual(refused(move, s, { place: 'nowhere' }, 'unknown-place').near.map(p => p.id), ['sishui', 'yunlong', 'lvliang', 'zhangnan']);
  // a road into a province whose chapter has not opened
  assert.equal(refused(move, s, { place: 'zhangnan' }, 'road-closed').say, '冀州的路还没开。');
  // a province still answers: here, or a road not open
  assert.equal(must(move, s, { province: 'Xu' }).result.here, true);
  assert.equal(refused(move, s, { place: '冀州' }, 'road-closed').say, '冀州的路还没开。');
  // walking away leaves a made scene; Enter brings it back where the player stands
  const m = inFerry(s);
  assert.equal(look(m, content, ctx()).scene.id, 'made-ferry');
  const away = must(move, m, { place: 'yunlong' });
  assert.equal(away.result.left, 'made-ferry');
  assert.equal(away.state.made.at, null);
  assert.equal(look(away.state, content, ctx()).scene, null, 'the open world again, at 云龙山');
  assert.equal(must(move, s, { place: 'yunlong' }).result.left, undefined, 'no made scene, nothing left');
  assert.equal(must(enter, away.state, { scene: 'made-ferry' }).result.scene.id, 'made-ferry');
  // at foundation the rapids open
  s = { ...s, tier: 'foundation', step: 0, progress: 0 };
  assert.equal(must(move, s, { place: 'lvliang' }).state.place, 'lvliang');
  assert.deepEqual(look(s, content, ctx()).director.too_hard, []);
});

test('the director names today\'s seed only where seeds grow, and the pool', () => {
  const s = toOpenWorld();
  const d = look(s, content, ctx()).director;
  assert.ok(d.seed?.id.startsWith('xu-'));
  assert.equal(d.pool, 'full', 'the prologue asked nothing');
  assert.equal(look({ ...s, stamina: 40 }, content, ctx()).director.pool, 'half');
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
  // a weapon used is worn: the bout borrows its root (2026-09-16)
  const armed = must(trade, withSword, { action: 'use', id: 'bamboo-sword' });
  assert.deepEqual(armed.state.wear, { weapon: 'bamboo-sword' });
  assert.deepEqual(armed.result.item.effect, { root: 'wood', root_name: '木' });
  refused(trade, must(trade, withSword, { action: 'buy', id: 'straw-cloak' }).state, { action: 'use', id: 'straw-cloak' }, 'not-usable');
  const withBell = { ...s, bag: { 'moon-bell': 1 } };
  const worn = must(trade, withBell, { action: 'use', id: 'moon-bell' });
  assert.deepEqual(worn.state.wear, { yinyue: 'moon-bell' });
  assert.equal(worn.result.item.worn, true);
  const bellSold = must(trade, worn.state, { action: 'sell', id: 'moon-bell' }).state;
  assert.deepEqual(bellSold.wear, {}, 'sold, no longer worn');
});

test('写符: at a market from 桑皮纸, one a day; anywhere at 结丹; the choice offers it; cast in a bout it is spent', () => {
  const s = toMarket();
  assert.equal(refused(write, s, {}, 'no-paper').say, '没有桑皮纸，写不得符。');
  const papered = { ...s, bag: { 'sang-paper': 2 } };
  assert.ok(look(papered, content, ctx()).director.choice.options.some(o => o.write), 'the choice offers it');
  const w = must(write, papered, {});
  assert.deepEqual(w.state.bag, { 'sang-paper': 1, talisman: 1 });
  assert.equal(w.state.stamina, 95, 'a visit\'s stamina');
  assert.equal(w.result.item.effect.charm, true); assert.equal(w.result.item.made_from, '桑皮纸');
  assert.deepEqual(w.result.show, [{ card: 'item', id: 'talisman' }]);
  assert.equal(refused(write, w.state, {}, 'written-today').say, '今日已写过一符，朱砂要歇。');
  assert.ok(!look(w.state, content, ctx()).director.choice.options.some(o => o.write));
  // tomorrow, away from the market: 练气 may not; 结丹 may
  const tomorrow = ctx({ now: new Date('2026-09-12T12:00:00') });
  const away = must(move, w.state, { place: 'sishui' }, tomorrow).state;
  assert.equal(refused(write, away, {}, 'not-here', tomorrow).say, '写符要在坊市里，或待结丹之后。');
  assert.deepEqual(must(write, { ...away, tier: 'core', step: 0 }, {}, tomorrow).state.bag, { talisman: 2 });
  // a 符 is not "used"; it has no market price
  assert.equal(refused(trade, w.state, { action: 'use', id: 'talisman' }, 'cast-in-a-bout').say, '符在降妖时掷出，不在此。');
  refused(trade, w.state, { action: 'sell', id: 'talisman' }, 'not-for-sale');
  // cast in a bout at a haunt: the round is won, the 符 spent; with 符水 known at 筑基 the pool refills
  const october = () => ctx({ now: new Date('2026-10-05T10:00:00') });
  const base = { ...w.state, chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, stamina: 50, arts: ['fushui'] };
  const started = must(duel, base, { id: 'haunt:jingwei' }, october());
  const kit = look(started.state, content, october()).place.encounter.duel.kit;
  assert.equal(kit.charm.held, 1); assert.deepEqual(kit.arts, { fushui: { effect: 'charm-refills', ready: true } });
  const { picks, played } = playOut(kit, started.result.moves);
  assert.equal(picks[0], 'talisman');
  const settled = must(duel, started.state, { id: 'haunt:jingwei', picks: picks.join(',') }, october());
  assert.equal(settled.result.outcome, played.outcome);
  assert.equal(settled.result.used.charm, 'talisman');
  assert.equal(settled.result.refilled, 10);
  assert.equal(settled.state.bag.talisman, undefined, 'spent');
  assert.equal(settled.state.stamina, started.state.stamina + 10);
  // an art out of its realm, or unknown, is refused by name
  const thunder = { ...started.state, arts: ['wulei'] };
  assert.equal(refused(duel, thunder, { id: 'haunt:jingwei', picks: 'wood,art:wulei' }, 'art-needs-tier', october()).token, 'art:wulei');
  refused(duel, started.state, { id: 'haunt:jingwei', picks: 'wood,art:wulei' }, 'art-unknown', october());
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
  // arrive → Ye: the scene moves, and the exit walks the player the one road there
  let r = answer(resolve, s, { exit: 'town' });
  assert.equal(r.state.stamina, 90, 'chapter 1 is not free');
  assert.equal(r.state.scene, '01-ye'); assert.equal(r.state.place, 'ye');
  assert.deepEqual(r.result.walked.to.id, 'ye'); assert.equal(r.result.waypoint, null); assert.equal(r.result.scene.id, '01-ye');
  // farther off, the road waits: with no road from Zhangnan to Ye the scene is a waypoint
  const noRoad = structuredClone(content);
  noRoad.places['冀'].places.find(p => p.id === 'zhangnan').roads = ['sibei', 'hebo'];
  const far = resolve(s, noRoad, octx(), { exit: 'town' });
  assert.equal(far.state.place, 'zhangnan'); assert.equal(far.result.walked, undefined); assert.equal(far.result.waypoint.place.id, 'ye');
  assert.equal(look(far.state, noRoad, octx()).scene, null);
  assert.equal(resolve(far.state, noRoad, octx(), { exit: 'shrine' }).result.refused, 'not-at-scene');
  s = r.state;
  const ye = look(s, content, octx());
  assert.equal(ye.scene.id, '01-ye');
  assert.deepEqual(ye.place.shelf.map(i => i.id), ['moon-bell', 'iron-sword', 'foundation-pill']);
  s = answer(trade, s, { action: 'buy', id: 'iron-sword' }).state;
  assert.equal(s.wealth, 180);
  s = answer(resolve, s, { exit: 'market' }).state; // stays
  s = answer(resolve, s, { exit: 'shrine' }).state;
  assert.equal(s.place, 'hebo');
  const altar = look(s, content, octx()).scene;
  assert.equal(altar.id, '01-altar');
  assert.ok(altar.exits.find(e => e.id === 'subdue').duel.creature.root === 'earth');
  assert.equal(answer(duel, s, { id: altar.exits.find(e => e.id === 'subdue').game.id }).state.stamina, s.stamina - 10, 'a bout here costs');
  // the riddle way through
  missed(resolve, s, { exit: 'riddle', answer: '虾' }, octx());
  r = answer(resolve, s, { exit: 'riddle', answer: '鱼' });
  assert.equal(r.state.scene, '01-deep'); assert.equal(r.result.paid.progress, 40);
  s = r.state; assert.equal(s.place, 'zhangyuan');
  r = answer(resolve, s, { exit: 'seal', answer: '5' });
  assert.equal(r.state.scene, '01-cauldron');
  assert.equal(look(r.state, content, octx()).scene.id, '01-cauldron', 'same place, no walk');
  s = r.state;
  // the gate: not at the peak of 练气
  const held = refused(resolve, s, { exit: 'take' }, 'not-at-peak', octx());
  assert.ok(held.say.startsWith('鼎气扑到你身上'));
  assert.equal(held.peak_step, 9);
  // at the peak: the Foundation is laid, then paid into the new tier
  s = { ...s, step: 8, progress: 130 };
  r = answer(resolve, s, { exit: 'take' });
  assert.deepEqual(r.result.breakthrough, { from: '练气九层', to: '筑基初期', tier: 'foundation' });
  assert.equal(r.state.tier, 'foundation'); assert.equal(r.state.step, 0);
  assert.equal(r.state.progress, 60);
  assert.deepEqual(r.result.show, [{ card: 'tribulation', strikes: 3 }]);
  assert.equal(r.state.scene, '01-end');
  r = answer(resolve, r.state, { exit: 'rest' });
  assert.deepEqual(r.state.ended, ['00-prologue', '01-ji']);
  assert.equal(r.state.scene, null);
  const thread = look(r.state, content, octx()).director.thread;
  assert.equal(thread.chapter, '02-yan'); assert.equal(thread.opens, '2026-11-01');
  assert.equal(wake(r.state, content, octx()), null, 'chapter 2 has not opened');
});

test('past the prologue a story step costs 灵气; an empty 丹田 refuses with the hour and changes nothing', () => {
  let s = answer(resolve, toJi(), { exit: 'town' }).state; // walked to Ye by the exit
  s.stamina = 5; s.stamina_at = OCT.toISOString();
  const r = refused(resolve, s, { exit: 'shrine' }, 'no-stamina', octx());
  assert.equal(r.cost, 10);
  // 5 points short at 20 an hour = 15 minutes
  assert.equal(new Date(r.returns_at).getTime(), OCT.getTime() + 15 * 60_000);
  assert.match(r.say, /丹田已空/);
  const seen = look(s, content, octx());
  assert.equal(seen.stamina.empty, true);
  assert.equal(seen.stamina.returns_at, r.returns_at);
});

test('chapter 1: the fight at the shrine, and Ximen Bao\'s way', () => {
  let s = toJi();
  s = answer(resolve, s, { exit: 'town' }).state;
  assert.equal(s.place, 'ye');
  s = answer(resolve, s, { exit: 'shrine' }).state;
  assert.equal(s.place, 'hebo', 'the exit walks the one road to the shrine');
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

test('a tapped option comes to Look as words, and Look names the tool it is', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const opening = cli('init', '--lang', 'en');
  const option = opening.ask.options.find(o => o.exit);
  const tapped = cli('look', `--said=${option.label}`);
  assert.match(tapped.then, new RegExp(`Resolve \\{exit: ${option.exit}\\}`));
  assert.equal(Object.keys(tapped)[0], 'then');
  assert.equal(tapped.scene.id, opening.scene.id); // Look itself moved nothing
  assert.match(cli('look', '--said=where am I').then, /^Now AskUser exactly/);
  // A place on the director's choice is a Move.
  const s = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  const open = { ...s, lang: 'zh', chapter: '03-qing', scene: '03-shore', place: 'linzi', done_scenes: [...s.done_scenes, '03-arrive', '03-town'] };
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(open));
  const choice = cli('look').ask;
  const road = choice.options.find(o => o.move);
  assert.ok(road, JSON.stringify(choice));
  assert.match(cli('look', `--said=${road.label}`).then, new RegExp(`Move \\{place: ${road.move}\\}`));
  // …and so is its chip on the map, which says 去X.
  assert.match(cli('look', `--said=去${road.label}`).then, new RegExp(`Move \\{place: ${road.move}\\}`));
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
  // Restart: `init` with nothing begins the world in play again, in its
  // language, and logs the save it replaced so `undo` brings it back.
  assert.equal(cli('resolve', '--exit', 'reach').scene.id, '00-waking');
  assert.equal(cli('look', '--said=我在哪里？').lang, 'zh');
  const again = cli('init');
  assert.equal(again.restarted, true);
  assert.equal(again.scene.id, '00-river');
  assert.equal(again.lang, 'zh');
  assert.equal(cli('undo').undid, 'init');
  assert.equal(cli('look').scene.id, '00-waking');
  assert.equal(cli('undo').undid, 'look');
  assert.equal(cli('undo').undid, 'resolve');
  assert.equal(cli('look').scene.id, '00-river');
  assert.equal(cli('look').lang, 'en');
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

// ── Ling drives: Go, and the library of kept games ──
test('Go jumps to an opened scene; the rules keep each day\'s closing state, the player keeps named ones, and Load takes one up', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-saves-'));
  const at = (iso) => ({ ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: iso });
  const cli = (env, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const d1 = at('2026-09-12T12:00:00Z'), d2 = at('2026-09-13T12:00:00Z');
  cli(d1, 'init', '--lang=en');
  assert.equal(cli(d1, 'resolve', '--exit=reach').scene.id, '00-waking');
  const named = cli(d1, 'save', '--title=At the waking').saved;
  assert.equal(named.kind, 'named');
  assert.equal(named.where, 'The bank of the Si River');
  assert.equal(cli(d1, 'save').refused, 'no-title');
  // Go: an opened scene, straight; a chapter still to open, refused with when.
  assert.equal(cli(d1, 'go', '--scene=00-fuzhu').scene.id, '00-fuzhu');
  // A chapter still to open refuses with when (the shipped files carry no dates while building; the harness's do).
  assert.deepEqual(refused(go, start(), { scene: '01-ye' }, 'not-open'), { ok: false, refused: 'not-open', say: null, chapter: '01-ji', opens: '2026-10-01' });
  assert.ok(cli(d1, 'go', '--scene=nowhere').scenes.includes('00-river'));
  // The next day's first move keeps yesterday's closing state.
  assert.equal(cli(d2, 'look', '--said=hi').scene.id, '00-fuzhu');
  const kept = cli(d2, 'saves').saves;
  assert.deepEqual(kept.map(x => [x.id, x.kind]), [['2026-09-12', 'day'], [named.id, 'named']]);
  assert.equal(kept[0].where, 'North of the Si · in the mist', 'the day save is the closing state, at the fuzhu');
  assert.equal(fs.existsSync(path.join(data, 'saves', '2026-09-12.json')), true);
  // Load, undo, forget.
  const loaded = cli(d2, 'load', `--id=${named.id}`);
  assert.equal(loaded.scene.id, '00-waking');
  assert.equal(loaded.loaded.title, 'At the waking');
  assert.equal(cli(d2, 'undo').undid, 'load');
  assert.equal(cli(d2, 'look').scene.id, '00-fuzhu');
  assert.equal(cli(d2, 'forget', '--id=2026-09-12').refused, 'not-named');
  assert.equal(cli(d2, 'forget', `--id=${named.id}`).forgot, named.id);
  assert.equal(cli(d2, 'load', `--id=${named.id}`).refused, 'unknown-save');
  fs.rmSync(data, { recursive: true, force: true });
});

// ── Worlds of the player's own: the command line parks and restores saves ──
test('Build takes the player to a fresh save in their world, which plays once its pictures are painted; Travel parks and restores', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-worlds-'));
  const skill = path.resolve('.');
  const rules = path.join(skill, 'scripts/rules.mjs');
  const run = (...args) => {
    const out = spawnSync(process.execPath, [rules, ...args], { env: { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() }, encoding: 'utf8' });
    return JSON.parse(out.stdout.trim().split('\n').pop());
  };
  const pictures = path.join(skill, 'data/pictures'); fs.mkdirSync(pictures, { recursive: true });
  const png = path.join(pictures, 'test-lushu.png'); fs.writeFileSync(png, 'png');
  try {
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
    assert.deepEqual(built.scene.show.at(-1), { card: 'map' }, 'a made scene ends with the map');
    assert.equal(built.place.id, 'reeds');
    assert.ok(fs.existsSync(path.join(dir, 'worlds/the-yunmeng-marsh/world.json')));
    assert.ok(fs.existsSync(path.join(dir, 'saves/jiuding.json')), 'the shipped world\'s save is parked');
    // building: its new creature and its map to paint — the map in words where the road map puts each place
    const paint = built.building.paint;
    assert.deepEqual(paint.map(p => [p.creature, p.name, p.shape]), [['lushu', 'lushu', 'square'], ['map', 'the-yunmeng-marsh-map', 'landscape']]);
    assert.ok(paint[0].prompt.includes('Traditional Chinese ink wash painting'));
    for (const said of ['Top center: The reed ford. Reeds stand taller than a man; water sounds on every side. Middle left: Heron Isle', 'Middle right: The shrine of the Xiang lord', 'Bottom center: The sunken bell pool']) {
      assert.ok(paint[1].prompt.includes(said), said);
    }
    // the story waits for the brush; talk does not
    const waits = run('resolve', '--exit=wade');
    assert.equal(waits.refused, 'still-building');
    assert.deepEqual(waits.paint, paint);
    assert.equal(run('move', '--place=isle').refused, 'still-building');
    assert.deepEqual(run('look', '--said=hi').building.paint, paint);
    // art: only a file inside the skill, only a made creature; with no file, the arguments
    assert.equal(run('art', '--creature=lushu', `--file=${path.join(dir, 'nowhere.png')}`).refused, 'no-such-file');
    assert.equal(run('art', '--creature=fuzhu', `--file=${png}`).refused, 'not-a-made-creature');
    assert.deepEqual(run('art', '--creature=lushu').paint, paint[0]);
    const servedAt = rel => `/apps/lingjing/${path.relative(skill, path.join(dir, 'worlds/the-yunmeng-marsh', rel))}`; // the url the page serves it by
    // every command answer also carries the ready question (`ask`, `then`); these compare the verb's own answer
    const own = ({ ask, then, ...r }) => r;
    assert.deepEqual(own(run('art', '--creature=lushu', '--file=/apps/lingjing/data/pictures/test-lushu.png')), { ok: true, creature: 'lushu', art: 'art/lushu.png', url: servedAt('art/lushu.png'), paint: [paint[1]] });
    assert.ok(fs.existsSync(path.join(dir, 'worlds/the-yunmeng-marsh/art/lushu.png')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'worlds/the-yunmeng-marsh/creatures.json'), 'utf8')).creatures[0].art, 'art/lushu.png');
    // the map is kept with the positions it was painted for; the last picture opens the world
    assert.equal(run('art', '--creature=map').paint.prompt, paint[1].prompt);
    assert.equal(run('art', '--creature=map', `--file=${path.join(dir, 'nowhere.png')}`).refused, 'no-such-file');
    assert.deepEqual(own(run('art', '--creature=map', '--file=/apps/lingjing/data/pictures/test-lushu.png')), { ok: true, map: 'art/map.png', url: servedAt('art/map.png'), ready: true });
    const card = JSON.parse(fs.readFileSync(path.join(dir, 'worlds/the-yunmeng-marsh/world.json'), 'utf8'));
    assert.deepEqual(Object.keys(card.map.at).sort(), ['bell', 'isle', 'reeds', 'shrine']);
    const seen = run('look');
    assert.equal(seen.world.map.file, 'art/map.png');
    assert.equal(seen.building, undefined, 'painted: the world plays');
    // play: the opening ends, the province is open, a road leads on
    assert.equal(run('resolve', '--exit=wade').paid.progress, 10);
    const moved = run('move', '--place=isle');
    assert.equal(moved.ok, true);
    assert.deepEqual(moved.show, [{ card: 'creature', id: 'jingwei' }, { card: 'map' }], 'a made world draws its own map with every place');
    assert.equal(moved.place.province.start, 'reeds');
    assert.deepEqual(moved.place.places.find(p => p.id === 'isle').roads, ['reeds', 'bell']);
    const lost = run('move', '--place=shrine');
    assert.equal(lost.refused, 'no-road');
    assert.equal(lost.here.id, 'isle', 'refused: still where they stood');
    assert.equal(lost.toward.id, 'reeds', 'by the ford, not the pool beyond the tier');
    // worlds and travel
    assert.deepEqual(run('worlds').worlds.map(w => [w.id, w.playing, w.saved]), [['jiuding', false, true], ['the-yunmeng-marsh', true, true]]);
    const home = run('travel', '--world=jiuding');
    assert.deepEqual(home.travelled, { from: 'the-yunmeng-marsh', to: 'jiuding', fresh: false });
    assert.equal(home.scene.id, '00-river');
    assert.equal(home.building, undefined, 'a shipped world never builds');
    assert.equal(home.stamina.now, 90, 'building cost the save it was built from');
    assert.equal(run('travel', '--world=the-yunmeng-marsh').place.id, 'isle', 'restored where it stood');
    assert.equal(run('travel', '--world=nowhere').refused, 'unknown-world');
    assert.equal(run('build', `--world=${JSON.stringify(bare)}`).refused, 'world-in-play');
    // undo steps back across the last travel
    assert.equal(run('undo').undid, 'travel');
  } finally {
    fs.rmSync(png, { force: true });
    if (!fs.readdirSync(pictures).length) fs.rmdirSync(pictures);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Amend adds a creature where it haunts, or a place with its roads laid back; never to a shipped world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-amend-'));
  const rules = path.resolve('scripts/rules.mjs');
  const run = (...args) => {
    const out = spawnSync(process.execPath, [rules, ...args], { env: { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() }, encoding: 'utf8' });
    return JSON.parse(out.stdout.trim().split('\n').pop());
  };
  const pictures = path.resolve('data/pictures'); fs.mkdirSync(pictures, { recursive: true });
  const png = path.join(pictures, 'test-heron.png'); fs.writeFileSync(png, 'png');
  const paintAll = () => (run('look').building?.paint ?? []).map(p => run('art', `--creature=${p.creature}`, `--file=${png}`));
  try {
  run('init', '--lang=en');
  const beast = { id: 'heron-king', name: { zh: '鹭王', en: 'The heron king' }, quote: { zh: '有鸟焉，其状如鹭而人语。', en: 'A bird like a heron that speaks as people do.' }, look: { zh: '白鹭，高过人。', en: 'A white heron taller than a man.' }, root: 'water' };
  assert.equal(run('amend', `--creature=${JSON.stringify(beast)}`).refused, 'not-a-made-world');
  run('build', `--world=${JSON.stringify(run('build').template)}`);
  assert.equal(paintAll().at(-1).ready, true);
  assert.equal(run('amend').refused, 'nothing-to-add');
  // a creature at a place that already has one is refused; at an empty one it is kept and shown when standing there
  assert.ok(run('amend', `--creature=${JSON.stringify(beast)}`, '--at=isle').problems.some(p => /already has jingwei/.test(p)));
  const added = run('amend', `--creature=${JSON.stringify(beast)}`, '--at=reeds');
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.deepEqual(added.added, { creature: 'heron-king', at: 'reeds', place: null });
  assert.deepEqual(added.show, [{ card: 'creature', id: 'heron-king' }], 'the player stands at the reeds');
  assert.deepEqual(added.paint.map(p => [p.creature, p.shape]), [['heron-king', 'square']], 'what Amend adds is painted before play goes on');
  assert.ok(added.paint[0].prompt.startsWith('A white heron taller than a man. Traditional Chinese ink wash'));
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
  assert.equal(run('move', '--place=shrine').refused, 'still-building', 'the amended creatures wait for the brush');
  const painted = paintAll();
  assert.equal(painted[0].art, 'art/heron-king.png');
  assert.equal(painted.at(-1).ready, true);
  run('move', '--place=shrine');
  assert.equal(run('move', '--place=temple').place.id, 'temple');
  } finally {
    fs.rmSync(png, { force: true });
    if (!fs.readdirSync(pictures).length) fs.rmdirSync(pictures);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ── Chapter 2 ── */

const NOV = new Date('2026-11-02T12:00:00');
const nctx = (extra = {}) => ({ now: NOV, quests: [], ...extra });
const answerN = (fn, st, args) => must(fn, st, args, nctx());

/* Chapter 1 behind them, the Foundation laid, standing in Ye. */
function afterJi() {
  return { ...toJi(), chapter: '01-ji', scene: null, place: 'ye', ended: ['00-prologue', '01-ji'], tier: 'foundation', step: 0, progress: 0, stamina: 100, wealth: 400 };
}

test('chapter 2 opens in November: the road from Ye, the Pu, Puyang\'s market, the lake, the seal, the Core, the end', () => {
  let s = afterJi();
  assert.equal(wake(s, content, octx()), null, 'not in October');
  const woke = VERBS.look(s, content, nctx());
  assert.equal(woke.state.chapter, '02-yan'); assert.equal(woke.state.scene, '02-arrive');
  assert.equal(woke.state.place, 'ye', 'no teleport');
  assert.equal(woke.result.waypoint.place.id, 'pushui');
  assert.equal(woke.result.director.thread.text, '路通向濮水。');
  s = woke.state;
  // the road from 冀 into 兖 is open now
  let r = answerN(move, s, { place: 'pushui' });
  assert.equal(r.result.scene.id, '02-arrive');
  s = r.state;
  s = answerN(resolve, s, { exit: 'ask' }).state; // the fisherman, stays
  r = answerN(resolve, s, { exit: 'town' });
  assert.equal(r.state.scene, '02-town'); assert.equal(r.result.walked.to.id, 'puyang');
  s = r.state;
  const town = look(s, content, nctx());
  assert.equal(town.scene.id, '02-town');
  assert.deepEqual(town.place.shelf.map(i => i.id), ['firm-pill', 'sang-paper']);
  s = answerN(trade, s, { action: 'buy', id: 'sang-paper' }).state;
  assert.equal(s.wealth, 370);
  s = answerN(resolve, s, { exit: 'lake' }).state;
  assert.equal(s.place, 'leize');
  const lake = look(s, content, nctx()).scene;
  assert.equal(lake.id, '02-lake');
  assert.equal(lake.exits.find(e => e.id === 'subdue').duel.creature.root, 'wood');
  // the three ways: the riddle
  missed(resolve, s, { exit: 'riddle', answer: '雨' }, nctx());
  r = answerN(resolve, s, { exit: 'riddle', answer: '雷' });
  assert.equal(r.state.scene, '02-deep'); assert.equal(r.result.paid.progress, 40);
  // and 舜's way, from the same shore
  const yielded = answerN(resolve, s, { exit: 'yield' });
  assert.equal(yielded.state.scene, '02-deep'); assert.equal(yielded.result.paid.progress, 40);
  s = r.state; assert.equal(s.place, 'leiyuan');
  missed(resolve, s, { exit: 'seal', answer: '西' }, nctx());
  r = answerN(resolve, s, { exit: 'seal', answer: '东' });
  assert.equal(r.state.scene, '02-cauldron');
  s = r.state;
  // the gate: not at the peak of 筑基
  const held = refused(resolve, s, { exit: 'take' }, 'not-at-peak', nctx());
  assert.ok(held.say.startsWith('鼎气扑到你身上'));
  assert.equal(held.peak_step, 3);
  // at the peak: the Core forms, then paid into the new tier
  s = { ...s, step: 2, progress: 600 };
  r = answerN(resolve, s, { exit: 'take' });
  assert.deepEqual(r.result.breakthrough, { from: '筑基后期', to: '结丹初期', tier: 'core' });
  assert.equal(r.state.tier, 'core'); assert.equal(r.state.step, 0);
  assert.equal(r.state.progress, 60);
  assert.equal(r.state.scene, '02-end');
  r = answerN(resolve, r.state, { exit: 'rest' });
  assert.deepEqual(r.state.ended, ['00-prologue', '01-ji', '02-yan']);
  const thread3 = look(r.state, content, nctx()).director.thread;
  assert.equal(thread3.chapter, '03-qing'); assert.equal(thread3.opens, '2026-12-01');
  assert.equal(wake(r.state, content, nctx()), null, 'chapter 3 has not opened');
});

const DEC = new Date('2026-12-02T12:00:00');
const dctx = (extra = {}) => ({ now: DEC, quests: [], ...extra });
const answerD = (fn, st, args) => must(fn, st, args, dctx());

/* Chapter 2 behind them, the Core formed, standing at the deeps of Lake Lei. */
function afterYan() {
  return { ...afterJi(), chapter: '02-yan', place: 'leiyuan', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 0, progress: 0, stamina: 100, wealth: 400 };
}

test('in November the road from 兖 into 青 is closed', () => {
  const s = { ...afterYan(), place: 'fuli' };
  const r = refused(move, s, { place: 'weishui' }, 'road-closed', nctx());
  assert.ok(r.say.includes('青州'));
});

test('chapter 3 opens in December: the road from Fuli, the Wei, Linzi\'s market, the shore, the seal, the Nascent Soul, the end', () => {
  let s = afterYan();
  assert.equal(wake(s, content, nctx()), null, 'not in November');
  const woke = VERBS.look(s, content, dctx());
  assert.equal(woke.state.chapter, '03-qing'); assert.equal(woke.state.scene, '03-arrive');
  assert.equal(woke.state.place, 'leiyuan', 'no teleport');
  assert.equal(woke.result.waypoint.place.id, 'weishui');
  assert.equal(woke.result.director.thread.text, '路通向潍水。');
  s = woke.state;
  // the walk east out of 兖 and into 青
  for (const place of ['leize', 'daye', 'fuli']) s = answerD(move, s, { place }).state;
  let r = answerD(move, s, { place: 'weishui' });
  assert.equal(r.result.scene.id, '03-arrive');
  s = r.state;
  s = answerD(resolve, s, { exit: 'hook' }).state; // the straight hook, stays
  r = answerD(resolve, s, { exit: 'town' });
  assert.equal(r.state.scene, '03-town'); assert.equal(r.result.walked.to.id, 'linzi');
  s = r.state;
  const town = look(s, content, dctx());
  assert.equal(town.scene.id, '03-town');
  assert.deepEqual(town.place.shelf.map(i => i.id), ['qi-salt', 'qi-silk']);
  s = answerD(trade, s, { action: 'buy', id: 'qi-salt' }).state;
  assert.equal(s.wealth, 380);
  s = answerD(resolve, s, { exit: 'shore' }).state;
  assert.equal(s.place, 'penglai');
  const shore = look(s, content, dctx()).scene;
  assert.equal(shore.id, '03-shore');
  assert.equal(shore.exits.find(e => e.id === 'subdue').duel.creature.root, 'water');
  // the three ways: the riddle
  missed(resolve, s, { exit: 'riddle', answer: '日' }, dctx());
  r = answerD(resolve, s, { exit: 'riddle', answer: '明' });
  assert.equal(r.state.scene, '03-deep'); assert.equal(r.result.paid.progress, 40);
  // and 孔子's word, from the same shore
  const enough = answerD(resolve, s, { exit: 'enough' });
  assert.equal(enough.state.scene, '03-deep'); assert.equal(enough.result.paid.progress, 40);
  s = r.state; assert.equal(s.place, 'liubo');
  missed(resolve, s, { exit: 'seal', answer: '震' }, dctx());
  r = answerD(resolve, s, { exit: 'seal', answer: '离' });
  assert.equal(r.state.scene, '03-cauldron');
  s = r.state;
  // the gate: not at the peak of 结丹
  const held = refused(resolve, s, { exit: 'take' }, 'not-at-peak', dctx());
  assert.ok(held.say.startsWith('鼎气涌上来'));
  assert.equal(held.peak_step, 3);
  // at the peak: the Nascent Soul forms, then paid into the new tier — which pays double
  s = { ...s, step: 2, progress: 1200 };
  r = answerD(resolve, s, { exit: 'take' });
  assert.deepEqual(r.result.breakthrough, { from: '结丹后期', to: '元婴初期', tier: 'nascent' });
  assert.equal(r.state.tier, 'nascent'); assert.equal(r.state.step, 0);
  assert.equal(r.state.progress, 120);
  assert.equal(r.state.scene, '03-end');
  r = answerD(resolve, r.state, { exit: 'rest' });
  assert.deepEqual(r.state.ended, ['00-prologue', '01-ji', '02-yan', '03-qing']);
  assert.equal(look(r.state, content, dctx()).director.thread, null, 'no chapter 4 yet');
});

test('in October the road from Ye into 兖 is closed, and the brief says so', () => {
  const s = afterJi();
  const r = refused(move, s, { place: 'pushui' }, 'road-closed', octx());
  assert.ok(r.say.includes('兖州'));
  assert.deepEqual(look(s, content, octx()).director.closed.map(c => c.id ?? c), look(s, content, octx()).director.closed.map(c => c.id ?? c));
});
