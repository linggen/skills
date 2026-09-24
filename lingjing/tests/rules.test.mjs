// The rules decide. These walk the prologue by exit ids alone — no model —
// and check every refusal leaves the state untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { act, battle, begin, effectOf, foeTurn, offers, tokenOf } from '../scripts/battle.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { dayKey, langOf, migrate, newState, weekKey } from '../scripts/state.mjs';
import { VERBS, fightSetup, hpMaxOf, greet, deck, deckFor, advance, meet, tapThen, thenFor, askOf, riddleOf, divine, fate, fateOf, duel, enter, go, heed, judge, lang, leave, look, make, move, parseArgs, quest, refine, resolve, summarize, tame, task, trade, wake, win } from '../scripts/rules.mjs';
import { BEATS, REALMS, costsOf, fight, foeOf, offers as boutOffers, realmStats } from '../scripts/duel.js';

const content = loadContent();
// The shipped chapters carry no `opens` while the game is being built and
// tested (his rule, 2026-09-16: "don't lock it"); the tests keep the serial
// gate exercised with the dates the launch will set.
content.chapters['01-ji'].opens = '2026-10-01';
content.chapters['02-yan'].opens = '2026-11-01';
content.chapters['03-qing'].opens = '2026-12-01';
content.chapters['04-xu'].opens = '2027-01-01';
content.chapters['05-yang'].opens = '2027-02-01';
content.chapters['06-jing'].opens = '2027-03-01';
content.chapters['07-liang'].opens = '2027-04-01';
content.chapters['08-yong'].opens = '2027-05-01';
content.chapters['09-yu'].opens = '2027-06-01';
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
// Today's 机缘 already dealt: for tests that mean "a Look that changes nothing else".
const DEALT = { day: dayKey(NOW), place: 'none', until: NOW.toISOString(), taken: NOW.toISOString() };
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
const fortuneFor = (ask, grade) => content.hexagrams.effects[ask][grade];

/* The riddle a scene's exit asks today, its right answer and a wrong one. */
function riddleAt(state, exitId, c = ctx()) {
  const scene = look(state, content, c).scene;
  const exit = content.chapters[state.chapter].scenes[scene.id].exits.find(e => e.id === exitId);
  const key = riddleOf(state, { id: scene.id }, exit, c.now);
  const r = content.riddles.zh.riddles[key];
  return { key, right: r.a[0], wrong: r.choices.find(x => !r.a.includes(x)), choices: r.choices };
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

/* Play a fight to its end through the rules: start it, then take the blow
   that costs least for what it takes, the way the gate's attentive line
   does (tools/duel-sim.mjs). `line` may name a rote line instead. */
/* Play a whole 斗法 v3 fight and hand the rules what was played. The page does
   exactly this: it replays the fight in the browser and sends the actions back
   as text, and `duel --picks` replays the same list to settle it — one truth,
   two readers. `line: 'pass'` does nothing at all, which is how a test loses. */
function fightOut(state, id, { line = null, c = ctx(), between = s => s } = {}) {
  const started = must(duel, state, { id }, c);
  const { setup } = started.result.duel;
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const st = begin(setup, catalog);
  const actions = [];
  for (let guard = 0; guard < 160 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const can = line === 'pass' ? [] : offers(st).filter(o => o.ok && o.action.kind !== 'end');
    // The most 气血 taken off the beast for the least 灵力, bodies first when
    // they may strike — enough to win most fixed seeds, and deterministic.
    // Worth what it takes off the beast, what it leaves standing, and what it
    // clears — a line that counts damage alone leaves its bodies in hand and
    // loses fights a board would have won.
    const body = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6, 0);
    const before = { hp: st.foe.hp, mine: body(st.you), theirs: body(st.foe) };
    const best = can
      .map(o => {
        const after = battle([...actions, tokenOf(o.action)], setup, catalog);
        const worth = (before.hp - after.foe.hp) * 2
          + (body(after.you) - before.mine) * 1.2
          + (before.theirs - body(after.foe))
          - (o.cost ?? 0) * 0.1;
        return { o, worth };
      })
      .sort((a, b) => b.worth - a.worth)[0]?.o;
    if (!best) { act(st, { kind: 'end' }, 'you'); actions.push('end'); continue; }
    act(st, best.action, 'you');
    actions.push(tokenOf(best.action));
  }
  return { ...must(duel, between(started.state), { id, picks: actions.join(',') }, c), actions, picks: actions, started };
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
  const fz = riddleAt(s, 'riddle');
  missed(resolve, s, { exit: 'riddle', answer: fz.wrong });
  s = must(resolve, s, { exit: 'riddle', answer: fz.right }).state;
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
  assert.equal(named.result.beat[0].text, '墨白。从今日起，这是你的道号。');
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
  assert.equal(resolve(s, content, ctx(), { exit: 'riddle' }).result.refused, 'needs-answer');
  refused(resolve, s, { exit: 'subdue' }, 'game-not-won');
});

test('a creature at its haunt: the bout on the stage pays once a day, and what it likes tames it', async () => {
  // 精卫 at 发鸠山 in 冀, no scene there: the world open, chapter 1 in play
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  const october = () => ctx({ now: new Date('2026-10-05T10:00:00') });
  const l = look(base, content, october());
  assert.equal(l.scene, null);
  assert.equal(l.place.encounter.creature.id, 'jingwei');
  assert.equal(l.place.encounter.game.id, 'haunt:jingwei');
  assert.deepEqual(l.place.encounter.likes, { id: 'jade-fish', name: '玉鱼', held: 0, fed: false });
  // The bout and the feeding are on the creature's card: one clickable place
  // each, so the choice never carries them (his law, 2026-09-17).
  assert.ok(!l.director.choice.options.some(o => o.duel || o.tame), 'the card holds them');
  // the fight: started at the haunt, won by the rules' own replay, paid by the haunt table
  const settled = fightOut(base, 'haunt:jingwei', { c: october() });
  assert.equal(settled.result.outcome, 'won', JSON.stringify(settled.result.log));
  assert.ok(settled.result.paid.progress > 0, 'the rules pay the haunt win');
  assert.equal(settled.result.haunt.id, 'jingwei');
  refused(duel, settled.state, { id: 'haunt:jingwei' }, 'subdued-today', october());
  assert.ok(!look(settled.state, content, october()).director.choice.options.some(o => o.duel));
  // taming: 先降后收 — never before it is beaten, then the thing it likes, once
  refused(tame, { ...base, bag: { ...base.bag, 'jade-fish': 1 } }, { creature: 'jingwei' }, 'not-beaten', october());
  const beaten = settled.state;
  refused(tame, beaten, { creature: 'jingwei' }, 'needs-item', october());
  const fed = { ...beaten, bag: { ...beaten.bag, 'jade-fish': 1 } };
  assert.equal(look(fed, content, october()).place.encounter.likes.held, 1, 'held: the card offers the feeding');
  // …and the offering is the page's own Tame, never a word to Ling (his, 2026-09-24).
  const { cardHtml, WORDS } = await import('../scripts/cards.js');
  const card = cardHtml({ card: 'duel', id: 'haunt:jingwei' }, { look: look(fed, content, october()), lang: 'zh', words: WORDS.zh, content });
  assert.match(card, /<button class="bact feed" data-tame="jingwei">献上玉鱼</);
  assert.doesNotMatch(card, /data-say/);
  const out = must(tame, fed, { creature: '精卫' }, october());
  assert.ok(out.state.cast.includes('jingwei'));
  assert.equal(out.state.bag['jade-fish'], undefined);
  assert.equal(out.result.fed.id, 'jade-fish');
  assert.ok(out.result.paid.progress > 0);
  refused(tame, out.state, { creature: 'jingwei' }, 'already-tamed', october());
  // 得牌: before, 精卫 was nowhere in his ten; tamed, its card is his to take in
  assert.ok(!look(fed, content, october()).place.encounter.game.setup?.you?.deck?.includes('jingwei'));
  assert.ok(!(fed.cards ?? []).includes('jingwei'));
  assert.ok(out.state.cards.includes('jingwei'));
  assert.deepEqual(out.result.paid.cards.map(c => c.id), ['jingwei']);
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
  // Every button but the ones played on their own card (a bout, a board).
  const inChat = l.scene.buttons.filter(b => !l.scene.exits.find(e => e.id === b.id)?.game);
  assert.deepEqual(l.ask.options.map(o => o.label), inChat.map(b => b.label));
  assert.deepEqual(l.ask.options.map(o => o.exit), inChat.map(b => b.id));
  assert.equal(l.ask.question, '何去何从？');
  assert.equal(l.ask.header, l.scene.place);
  assert.ok(l.then.includes('AskUser'));
  // a riddle waiting: the riddle is the question, its answers the options,
  // and a way back to the scene
  const rid = riddleAt(s, 'riddle');
  const asked = resolve(s, content, ctx(), { exit: 'riddle' });
  const r = asked.result;
  assert.equal(r.refused, 'needs-answer');
  assert.deepEqual(asked.state.riddles_seen, [rid.key], 'asked is seen');
  const a = askOf(content, s, ctx(), r);
  assert.equal(r.say, null, 'the riddle is the question, not a line to speak');
  assert.equal(a.question, content.riddles.zh.riddles[rid.key].q);
  assert.deepEqual(a.options.map(o => o.label), [...rid.choices, '先不答']);
  assert.ok(a.options.slice(0, -1).every(o => o.exit === 'riddle' && o.answer === o.label));
  assert.equal(a.options.at(-1).look, true);
  // on the table, it stays the question after a Look or any other word —
  // never the scene's question the player already answered
  const onTable = look(asked.state, content, ctx({ said: '你好' }));
  assert.equal(onTable.scene.exits.find(e => e.id === 'riddle').waiting, true);
  assert.deepEqual(onTable.ask, askOf(content, asked.state, ctx(), r));
  // 先不答 sets it aside: the scene's own question comes back
  const aside = VERBS.look(asked.state, content, ctx({ said: '先不答' }));
  assert.ok(aside.state, 'set aside is kept');
  assert.deepEqual(aside.result.ask.options.map(o => o.label), l.ask.options.map(o => o.label));
  assert.equal(VERBS.look({ ...asked.state, chance: DEALT }, content, ctx({ said: '你好' })).state, null, 'any other word leaves it on the table');
  // a miss: the hint, and the answers left; a second miss shuts it for the day
  const wrongs = rid.choices.filter(x => x !== rid.wrong && !content.riddles.zh.riddles[rid.key].a.includes(x));
  const miss = resolve(asked.state, content, ctx(), { exit: 'riddle', answer: rid.wrong });
  assert.equal(miss.result.refused, 'wrong-answer'); assert.ok(miss.result.hint);
  assert.deepEqual(askOf(content, miss.state, ctx(), miss.result).options.map(o => o.label), [...rid.choices.filter(x => x !== rid.wrong), '先不答']);
  const shut = resolve(miss.state, content, ctx(), { exit: 'riddle', answer: wrongs[0] });
  assert.equal(shut.result.refused, 'riddle-closed'); assert.equal(shut.result.hint, undefined);
  assert.equal(look(miss.state, content, ctx()).ask.question, a.question, 'a miss leaves it on the table');
  assert.equal(look(shut.state, content, ctx()).ask.question, '何去何从？', 'shut, it leaves the table');
  assert.equal(refused(resolve, shut.state, { exit: 'riddle', answer: rid.right }, 'riddle-closed').exit, 'riddle');
  assert.ok(!askOf(content, shut.state, ctx(), shut.result).options.some(o => o.exit === 'riddle'));
  assert.equal(look(shut.state, content, ctx()).scene.exits.find(e => e.id === 'riddle').closed, true);
  // tomorrow: the other riddle of the pool — this play never asks one twice
  const tomorrow = ctx({ now: new Date(NOW.getTime() + 864e5) });
  const next = riddleAt(shut.state, 'riddle', tomorrow);
  assert.notEqual(next.key, rid.key);
  assert.equal(resolve(shut.state, content, tomorrow, { exit: 'riddle', answer: next.right }).result.ok, true);
  // …and once the pool is spent it begins again, never with the last one asked
  const spent = resolve(shut.state, content, tomorrow, { exit: 'riddle' }).state;
  const after = riddleAt({ ...spent, riddles: { ...spent.riddles } }, 'riddle', ctx({ now: new Date(NOW.getTime() + 2 * 864e5) }));
  assert.notEqual(after.key, next.key);
  // the filler never repeats the player's last word, and never offers Yinyue
  const one = { ...l.scene, buttons: l.scene.buttons.slice(0, 1) };
  assert.equal(askOf(content, s, { ...ctx(), said: '说说此地' }).options.at(-1)?.label !== '说说此地', true);
  assert.equal(askOf(content, s, { ...ctx(), said: '看看四周' }).options.at(-1)?.label !== '看看四周', true);
  void one;
  // The world open: the question rides an ARRIVAL, and only onto a stage with
  // nothing waiting on it (his ruling, 2026-09-18 — 何去何从 was asked over a
  // 坊市 holding 银月铃, and a Skip was answered by the same widget one turn
  // later, because every Look handed it back).
  // 泗水北岸 holds the fisherman's errand out: the offer card is the one thing to
  // tap and the chat keeps its question (2026-09-21 — 云龙山 put 接下 on the stage
  // and 何去何从 in the chat at once, because offers were on nobody's list).
  const held = look(toOpenWorld(), content, ctx());
  assert.ok(held.stage.some(c => c.card === 'offer'));
  assert.equal(held.ask, null, 'an errand held out: the chat waits for it');
  // Taken, nothing holds — and the question comes in that same answer.
  const took = quest(toOpenWorld(), content, ctx(), { action: 'take', id: held.offers[0].id });
  assert.ok(askOf(content, took.state, ctx({ verb: 'quest' }), took.result)?.options.some(x => x.move), 'the tap on the first brings the second');
  const o = took.state;
  const lo = look(o, content, ctx());
  assert.deepEqual(lo.ask, lo.director.choice, 'where he has not been asked, it is asked');
  // …once. The rules write down that they asked here, so a question he passed
  // on is not put back a turn later (his Skip, answered by the same widget).
  const again = { ...o, asked_at: `place:${o.place}` };
  assert.equal(look(again, content, { ...ctx(), verb: 'look' }).ask, null, 'a bare Look at a spot already asked says nothing');
  // but anything that moves the world re-arms it — he cast the coins and the
  // turn ended with no way on (2026-09-18: 起卦完成, 任务卡住了)
  assert.ok(look(again, content, { ...ctx(), verb: 'divine' }).ask, 'a cast, a trade, a road: asked again');
  const road = lo.director.choice.options.find(x => x.move);
  const arrived = move(o, content, ctx(), { place: road.move });
  // where he lands, always: the roads — or the traveller's riddle, when that is what the arrival dealt
  const landed = askOf(content, arrived.state, ctx(), arrived.result), dealt = arrived.result.place.meet;
  const holding = look(arrived.state, content, ctx()).stage.some(c => ['offer', 'road', 'item', 'duel'].includes(c.card));
  if (dealt?.kind === 'riddle') assert.equal(landed.question, dealt.riddle);
  else if (holding) assert.equal(landed, null, 'what the arrival holds out comes first');
  else assert.deepEqual(landed, arrived.result.director.choice, 'and where he lands, always');
  // …but not onto a stage holding something out: a shelf, a beast at its haunt
  const shop = { ...arrived.state, place: 'pengcheng' };
  assert.equal(askOf(content, shop, ctx(), { director: true }), null, 'a 坊市 is on the stage — the chat keeps quiet');
  const haunt = { ...arrived.state, place: 'fuli', tier: 'qi' };
  assert.equal(askOf(content, haunt, ctx(), { director: true }), null, 'a beast stands here — its card is the one clickable place');
  const plain = { ...arrived.state, place: 'sishui', meets: null }; // nothing offered, nothing dealt
  assert.ok(askOf(content, plain, ctx(), { director: true })?.options.some(x => x.move), 'and where nothing waits, it asks');
});

test('only the rules decide a fight: a win the exit takes, and pays once', () => {
  const s = toFuzhu();
  refused(resolve, s, { exit: 'subdue', won: true }, 'game-not-won');
  refused(win, s, { id: 'chess-anywhere' }, 'not-here');
  refused(win, s, { id: 'subdue-fuzhu' }, 'not-here', ctx());
  const brief = look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue');
  assert.deepEqual(brief.game, { id: 'subdue-fuzhu', kind: 'duel', creature: 'fuzhu' });
  assert.equal(brief.duel.creature.root, 'water');
  assert.equal(brief.duel.creature.lean, 'quick');
  assert.equal(brief.duel.today, null);
  // Everything that goes through the door, and nothing else (§ 副本契约):
  // the realm, the main root, ten cards of the player's own roots, and the
  // beast's own twelve.
  const { setup } = brief.duel;
  assert.equal(setup.mode, 'pve');
  assert.equal(setup.you.tier, 'qi');
  assert.equal(setup.you.deck.length, 10);
  assert.equal(setup.foe.deck.length, 12);
  assert.equal(setup.foe.root, 'water');
  // start: a fight in the prologue is free
  const started = must(duel, s, { id: 'subdue-fuzhu' });
  assert.equal(started.state.stamina, s.stamina);
  assert.equal(started.result.moves, undefined, 'the creature\'s turns are the rules\' own');
  assert.equal(started.state.duels.fuzhu.outcome, 'open');
  // While a fight is open Ling advances NOTHING, and she knows it from the save
  assert.equal(started.state.fight.game, 'subdue-fuzhu');
  assert.deepEqual(look(started.state, content, ctx()).fight, { open: true, game: 'subdue-fuzhu', creature: '夫诸' });
  // the winning turns, replayed by the rules
  const settled = fightOut(s, 'subdue-fuzhu');
  assert.equal(settled.result.outcome, 'won', JSON.stringify(settled.actions));
  assert.equal(settled.result.foe.hp, 0);
  assert.ok(settled.result.you.hp > 0);
  assert.equal(settled.state.fight, undefined, 'the fight closed, and the world may move again');
  assert.ok(settled.state.wins['subdue-fuzhu']);
  assert.equal(look(settled.state, content, ctx()).scene.exits.find(e => e.id === 'subdue').won, true);
  const out = must(resolve, settled.state, { exit: 'subdue' });
  assert.equal(out.state.scene, '00-north');
  assert.ok(out.state.cast.includes('fuzhu'));
  assert.deepEqual(out.state.wins, {});
});

test('the ten cards are the player\'s own roots (and the ones their arms lend), and a companion teaches nothing', () => {
  const s = { ...toFuzhu(), bag: { 'iron-sword': 1, 'straw-cloak': 1 }, wear: { weapon: 'iron-sword', robe: 'straw-cloak' } };
  const brief = look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel;
  const byId = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const roots = new Set(s.traits);
  // Every 功法 in the deck is of a root they have — born without 金, you cast
  // no 金 spell. A 灵兽 of any element may follow (韩立's 噬金虫, 2026-09-22).
  for (const id of brief.setup.you.deck) {
    const { element: el, kind } = byId[id];
    assert.ok(kind !== 'spell' || !el || roots.has(el), `${id} is a ${el} spell, which is not theirs`);
  }
  const metal = { ...s, wear: { robe: 'straw-cloak' }, cards: [...s.cards, 'jianying', 'suijin'] }; // a 金 beast and a 金 spell
  const metalDeck = look(metal, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you.deck;
  assert.ok(metalDeck.includes('jianying'), 'the 金 beast comes in');
  assert.ok(!metalDeck.includes('suijin'), 'the 金 spell does not');
  // …until the 铁剑 is worn: 佩之借金, and a 金 功法 may be cast (§ 装备入局).
  const lent = look({ ...metal, wear: { weapon: 'iron-sword', robe: 'straw-cloak' } }, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you.deck;
  assert.ok(lent.includes('suijin'), 'the sword lends its root');
  assert.equal(brief.setup.you.deck.length, new Set(brief.setup.you.deck).size, 'ten different cards');
  assert.deepEqual(brief.setup.you.extra, [], '银月 rides along only once she walks with the player');
  // …and once she does, she is in the hand at the door. The fight read a
  // `companion.found` nothing ever wrote, so from 2026-09-18 she never came
  // (his save: companion { joined } — the one mark hasCompanion reads).
  // (a save from before 得牌 holds no `cards`: it is read as what it would hold)
  const withHer = { ...s, companion: { joined: '2026-09-18' }, cards: undefined };
  assert.deepEqual(look(withHer, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you.extra, ['yinyue']);
  // The same player takes the same deck into the same fight, every time
  assert.deepEqual(look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you.deck, brief.setup.you.deck);
  // 法器 stay gear: the 铁剑 (器攻 3) gives 主灵根一击 +2, the 蓑衣 (防 1) 4 护体
  assert.equal(brief.setup.you.power, 2);
  assert.equal(brief.setup.you.armor, 4);
  const bare = { ...s, wear: {} };
  const bareSetup = look(bare, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup;
  assert.equal(bareSetup.you.power, undefined);
  assert.equal(bareSetup.you.armor, undefined);
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  assert.equal(begin(brief.setup, catalog).you.powerHit, begin(bareSetup, catalog).you.powerHit + 2);
  assert.ok(!brief.setup.you.deck.some(id => id === 'iron-sword'), 'a sword is not a card');
  const won = fightOut(bare, 'subdue-fuzhu');
  assert.equal(won.result.outcome, 'won');
  refused(duel, won.started.state, { id: 'subdue-fuzhu', picks: 'attack:3' }, 'not-on-board');
  // A beast walks beside the player; it does not teach (2026-09-18 — his
  // "不要pet教主角功法"). An art comes from a person, in a scene: `grant.art`.
  const out = must(resolve, won.state, { exit: 'subdue' });
  assert.deepEqual(out.state.arts ?? [], []);
  assert.equal(out.result.paid.learned, undefined);
  const old = { ...toOpenWorld(), arts: undefined, chance: DEALT };
  assert.ok(old.cast.includes('fuzhu'));
  const woke = VERBS.look(old, content, ctx());
  assert.equal(woke.state, null, 'a companion in an old save teaches nothing either');
});

test('a loss is free and the creature withdraws until tomorrow', () => {
  const s = toFuzhu();
  // 空手 against a 迅捷 hide: every strike is blunted to one, and the pool
  // runs dry long before the creature does.
  const lost = fightOut(s, 'subdue-fuzhu', { line: 'pass' });
  assert.equal(lost.result.outcome, 'lost', JSON.stringify(lost.result.log));
  assert.equal(lost.result.say, '夫诸隐入雾中。明日再来。');
  assert.equal(lost.state.wealth, s.wealth); assert.equal(lost.state.progress, s.progress);
  assert.equal(refused(resolve, lost.state, { exit: 'subdue' }, 'withdrawn').say, '夫诸隐入雾中。明日再来。');
  assert.equal(refused(duel, lost.state, { id: 'subdue-fuzhu' }, 'withdrawn').say, '夫诸隐入雾中。明日再来。');
  assert.equal(look(lost.state, content, ctx()).scene.exits.find(e => e.id === 'subdue').withdrawn, true);
  // tomorrow the mist clears
  const tomorrow = ctx({ now: new Date('2026-09-12T12:00:00') });
  assert.equal(duel(lost.state, content, tomorrow, { id: 'subdue-fuzhu' }).result.ok, true);
  assert.equal(look(lost.state, content, tomorrow).scene.exits.find(e => e.id === 'subdue').withdrawn, false);
  // The fight is never in the question — its card holds it — and the card is
  // withdrawn today, open again tomorrow.
  assert.ok(!askOf(content, lost.state, ctx()).options.some(o => o.exit === 'subdue'));
  assert.ok(!askOf(content, lost.state, tomorrow).options.some(o => o.exit === 'subdue'));
  assert.equal(look(lost.state, content, ctx()).scene.exits.find(e => e.id === 'subdue').withdrawn, true);
});

test('a fight must be started, a turn must be one the player has, and the same day draws the same creature', () => {
  const s = toFuzhu();
  refused(duel, s, { id: 'subdue-fuzhu', picks: 'cast:wood' }, 'not-started');
  refused(duel, s, { id: 'nothing' }, 'not-here');
  must(duel, { ...s, stamina: 3 }, { id: 'subdue-fuzhu' }); // free in the prologue
  const a = must(duel, s, { id: 'subdue-fuzhu' }), b = must(duel, s, { id: 'subdue-fuzhu' });
  assert.deepEqual(a.result.duel.setup, b.result.duel.setup, 'the same day deals the same fight');
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'play:9' }, 'not-in-hand');
  // A turn that never finished the fight is no answer at all, and a word the
  // rules do not know reads as ending the turn — it settles nothing either.
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'play:0' }, 'unfinished');
  refused(duel, a.state, { id: 'subdue-fuzhu', picks: 'dance' }, 'unfinished');
});

/* ── 斗法: the fight on the shared engine ── */

const FOUR = ['wood', 'water', 'fire', 'earth'];
const kitOf = (extra = {}) => ({ roots: FOUR, tier: 'qi', step: 0, sword: null, weapon: null, charm: { id: 'talisman', held: 0 }, arts: {}, ...extra });
/* A creature that only ever strikes, so a turn's arithmetic stands alone. */
const dummy = (extra = {}) => ({ id: 'dummy', root: 'earth', lean: 'fierce', pattern: ['strike'], start: 0, hp: 40, qi: 40, spell: 4, atk: 1, def: 2, ward: 0, power: 1, ...extra });

test('a creature stands at the player\'s realm and step, and its lean tells the two apart', () => {
  const plain = realmStats('qi', 0);
  const kui = content.creatures.creatures.find(c => c.id === 'kui');       // 厚皮
  const paoxiao = content.creatures.creatures.find(c => c.id === 'paoxiao'); // 凶猛
  const leishen = content.creatures.creatures.find(c => c.id === 'leishen'); // 避法
  const fuzhu = content.creatures.creatures.find(c => c.id === 'fuzhu');     // 迅捷
  const thick = foeOf(kui, 'qi', 0, 'x');
  assert.ok(thick.hp > plain.hp && thick.def > plain.def && thick.spell < plain.spell);
  const fierce = foeOf(paoxiao, 'qi', 0, 'x');
  assert.ok(fierce.atk > plain.atk && fierce.def < plain.def);
  assert.ok(foeOf(leishen, 'qi', 0, 'x').ward > 0, '避法 blunts a 法术 of any element');
  const quick = foeOf(fuzhu, 'qi', 0, 'x');
  assert.ok(quick.power > foeOf({ ...fuzhu, lean: 'hide' }, 'qi', 0, 'x').power - 1 && quick.atk < plain.atk);
  // it climbs with the player, step by step
  assert.equal(foeOf(kui, 'qi', 4, 'x').hp - thick.hp, Math.round((plain.hp + 8) * 1.25) - thick.hp);
  // a made creature writes neither: its id draws them, and they hold
  const made = foeOf({ id: 'made-thing', root: 'fire' }, 'qi', 0, 'x');
  assert.ok(made.lean && made.pattern.length);
  assert.deepEqual(made, foeOf({ id: 'made-thing', root: 'fire' }, 'qi', 0, 'x'));
});

test('斗法: a 法术 doubles into what it overcomes and halves into what overcomes it; 物理 asks no element', () => {
  const kit = kitOf();
  const spell = REALMS.qi.spell;
  // 木克土: double, less the creature's 抗 (none here)
  const over = fight(['cast:wood'], dummy(), kit);
  assert.equal(over.log[0].damage, spell * 2);
  // 土克水 — a 水 cast into a 土 creature is halved
  assert.equal(fight(['cast:water'], dummy(), kit).log[0].damage, spell / 2);
  // neither way: the plain 法术
  assert.equal(fight(['cast:fire'], dummy(), kit).log[0].damage, spell);
  // 物理攻击 is the realm's 攻 less its 防, and never below one
  assert.equal(fight(['strike'], dummy(), kit).log[0].damage, REALMS.qi.atk - 2);
  assert.equal(fight(['strike'], dummy({ def: 99 }), kit).log[0].damage, 1);
  // 抗 blunts a 法术 of that element, 防 does not
  const warded = dummy({ ward: 3 });
  assert.equal(fight(['cast:fire'], warded, kit).log[0].damage, spell - 3);
});

test('every attack spends 灵力: 气血 out or 灵力 out and the fight is lost, but the last blow still wins', () => {
  const kit = kitOf();
  const c = costsOf(REALMS.qi.spell);
  const one = fight(['cast:wood'], dummy(), kit);
  assert.equal(one.you.qi, REALMS.qi.qi - c.cast);
  assert.equal(one.outcome, 'open');
  // 灵力 out with the creature still standing: lost. Five 法术 and a strike
  // is the whole pool at 练气.
  const dry = [...Array(5).fill('cast:fire'), 'strike'];
  const drained = fight(dry, dummy({ hp: 200, atk: 1 }), kit);
  assert.equal(drained.outcome, 'lost');
  assert.equal(drained.you.qi, 0);
  // the same emptying blow, but it finishes the creature: won
  const last = fight(dry, dummy({ hp: REALMS.qi.spell * 5 + 1, def: 0, atk: 1 }), kit);
  assert.equal(last.outcome, 'won');
  assert.equal(last.you.qi, 0);
  // 气血 out: lost
  assert.equal(fight(Array(20).fill('assist:guard'), dummy({ atk: 40 }), kit).outcome, 'lost');
  // a turn there is no 灵力 for is refused by name
  assert.equal(fight([...dry, 'cast:fire'], dummy({ hp: 200, atk: 1 }), kit).refused, null, 'a turn after the end is not played, not refused');
  assert.equal(fight([...Array(5).fill('cast:fire'), 'cast:fire'], dummy({ hp: 200, atk: 1 }), kit).refused.why, 'no-qi');
});

test('the creature keeps its own turns: 蓄 doubles, 护体 halves, 甲 is 防 for a round', () => {
  const kit = kitOf();
  // 蓄 then 击: the blow is doubled
  const gathers = dummy({ pattern: ['gather', 'strike'], atk: 4, def: 0 });
  const f = fight(['assist:focus', 'assist:guard'], gathers, kit);
  assert.equal(f.log.find(t => t.side === 'foe').act, 'gather');
  assert.equal(f.log.find(t => t.side === 'foe' && t.act === 'strike').damage, 4, '8 doubled, halved by 护体');
  // 护体 halves the player's next blow — the one after it is raised
  const guards = dummy({ pattern: ['guard'], atk: 1, def: 0 });
  assert.equal(fight(['cast:wood'], guards, kit).log[0].damage, REALMS.qi.spell * 2, 'nothing raised yet');
  assert.equal(fight(['cast:wood', 'cast:wood'], guards, kit).log[2].damage, REALMS.qi.spell, 'doubled by 相克, halved by 护体');
  // 甲 raises its 防 for one round — a 法术 goes past it, a strike does not
  const armored = dummy({ pattern: ['armor'], atk: 1, def: 0 });
  assert.equal(fight(['strike'], armored, kit).log[0].damage, REALMS.qi.atk, 'no 甲 yet');
  assert.equal(fight(['strike', 'strike'], armored, kit).log[2].damage, REALMS.qi.atk - 2, '甲 up on the second');
  assert.equal(fight(['strike', 'cast:fire'], armored, kit).log[2].damage, REALMS.qi.spell, '甲 is 防, not 抗');
});

test('战力 says who moves first, and a tie goes to the player', () => {
  const kit = kitOf();
  const mine = fight([], dummy({ power: 0 }), kit);
  assert.equal(mine.first, 'you');
  assert.equal(mine.log.length, 0, 'nothing has happened yet');
  const theirs = fight([], dummy({ power: 999 }), kit);
  assert.equal(theirs.first, 'foe');
  assert.equal(theirs.log.length, 1, 'it has already moved');
  assert.equal(fight([], dummy({ power: fight([], dummy(), kit).you.power }), kit).first, 'you', 'a tie is the player\'s');
});

test('a worn weapon: 器攻 for 物理攻击, and its root lends a 法术 at 借器施法', () => {
  const armed = kitOf({ sword: 'metal', weapon: { id: 'iron-sword', atk: 3 } });
  const wood = dummy({ root: 'wood', def: 0 });
  assert.equal(fight(['strike'], wood, armed).log[0].damage, REALMS.qi.atk + 3);
  // 金克木, but borrowed through the sword the 法术 is two the weaker
  assert.equal(fight(['cast:metal'], wood, armed).log[0].damage, (REALMS.qi.spell - 2) * 2);
  assert.equal(fight(['cast:metal'], wood, kitOf()).refused.why, 'not-your-root', 'not worn: not theirs');
  // 御剑 strikes twice for one cost, once a fight
  const rider = { ...armed, arts: { yujian: { effect: 'twice', ready: true } } };
  const twice = fight(['art:yujian'], wood, rider);
  assert.equal(twice.log[0].damage, (REALMS.qi.atk + 3) * 2);
  assert.equal(twice.log[0].hits, 2);
  assert.equal(fight(['art:yujian', 'art:yujian'], wood, rider).refused.why, 'art-used');
  assert.equal(fight(['art:yujian'], wood, { ...kitOf(), arts: { yujian: { effect: 'twice', ready: true } } }).refused.why, 'art-no-sword');
});

test('法衣 and 佩: 防 blunts a strike, 抗 blunts a 法术 of its element', () => {
  const beast = dummy({ pattern: ['strike'], atk: 6, def: 0, root: 'fire' });
  const bare = fight(['assist:focus'], beast, kitOf());
  const robed = fight(['assist:focus'], beast, kitOf({ robe: { id: 'straw-cloak', def: 2 } }));
  assert.equal(bare.log[1].damage - robed.log[1].damage, 2, '防 takes its bite from a strike');
  const caster = dummy({ pattern: ['cast'], root: 'fire', spell: 6 });
  const plain = fight(['assist:focus'], caster, kitOf());
  const worn = fight(['assist:focus'], caster, kitOf({ pendant: { id: 'x', ward: { fire: 3 } } }));
  assert.equal(plain.log[1].damage - worn.log[1].damage, 3, '抗 takes its bite from that element');
  assert.equal(fight(['assist:focus'], caster, kitOf({ pendant: { id: 'x', ward: { water: 3 } } })).log[1].damage, plain.log[1].damage, 'another element, no help');
});

test('a 符 is 法术 ×3, no 防 or 抗 blunts it, once a fight and only when held', () => {
  const held = kitOf({ charm: { id: 'talisman', held: 1 } });
  const hide = dummy({ def: 99, ward: 99 });
  const one = fight(['talisman'], hide, held);
  assert.equal(one.log[0].damage, REALMS.qi.spell * 3);
  assert.equal(one.you.qi, REALMS.qi.qi, 'a 符 spends no 灵力 — the thing itself is spent');
  assert.equal(one.used.charm, true);
  assert.equal(fight(['talisman', 'talisman'], hide, held).refused.why, 'charm-used');
  assert.equal(fight(['talisman'], hide, kitOf()).refused.why, 'no-charm');
  // 符水: the 符 also gives 灵力 back, never over the top
  const water = { ...held, arts: { fushui: { effect: 'charm-refills', ready: true } } };
  assert.equal(fight(['talisman'], hide, water).you.qi, REALMS.qi.qi, 'full already');
  const spent = fight(['cast:fire', 'cast:fire', 'talisman'], hide, water);
  assert.equal(spent.log.find(t => t.act === 'talisman').gave, Math.round(REALMS.qi.spell * 1.5));
});

test('the arts: 五雷法 falls as 木 at double, past any 抗, once a fight', () => {
  const metal = dummy({ root: 'metal', def: 0 });
  const c = costsOf(REALMS.qi.spell);
  // 借势 was cut on 2026-09-18: a root the player lacks is reached through
  // the sword that lends it, or the 符 — never through an art everyone has.
  assert.equal(fight(['borrow:wood'], metal, kitOf()).refused.why, 'bad-token');
  // 五雷法: 木 at double 法术, no 抗 blunts it, once
  const thunder = kitOf({ arts: { wulei: { effect: 'thunder', ready: true } } });
  const struck = fight(['art:wulei'], dummy({ root: 'earth', ward: 99 }), thunder);
  assert.equal(struck.log[0].damage, REALMS.qi.spell * 2 * 2, '木克土, and no 抗');
  assert.equal(fight(['art:wulei', 'art:wulei'], dummy({ root: 'earth' }), thunder).refused.why, 'art-used');
  assert.equal(fight(['art:wulei'], metal, kitOf({ arts: { wulei: { effect: 'thunder', ready: false } } })).refused.why, 'art-needs-tier');
  // 遁法 was cut the same day: it named a way of moving, and this system has
  // no movement — it will come back with the 身法 branch of the skill tree.
  const killer = dummy({ pattern: ['strike'], atk: 99 });
  assert.equal(fight(['assist:focus'], killer, kitOf()).outcome, 'lost');
});

test('聚势 and 护体 are held, not stacked, and the arts a realm has not reached are greyed with why', () => {
  const kit = kitOf({ arts: { wulei: { effect: 'thunder', ready: false } } });
  const beast = dummy({ pattern: ['gather'], atk: 1 });
  assert.equal(fight(['assist:guard', 'assist:guard'], beast, kit).refused.why, 'already-guard');
  assert.equal(fight(['assist:focus', 'assist:focus'], beast, kit).refused.why, 'already-focus');
  // 聚势 lifts the next blow by half
  const lifted = fight(['assist:focus', 'cast:wood'], dummy({ def: 0 }), kit);
  assert.equal(lifted.log.find(t => t.act === 'cast').damage, Math.round(REALMS.qi.spell * 2 * 1.5));
  // the card's buttons carry every why
  const can = boutOffers([], beast, kit);
  assert.equal(can.find(o => o.token === 'art:wulei').why, 'art-needs-tier');
  assert.equal(can.find(o => o.token === 'talisman').why, 'no-charm', 'the button shows with its why');
  assert.ok(can.find(o => o.token === 'strike').ok);
  assert.equal(can.find(o => o.token === 'cast:metal'), undefined, 'not a root of theirs');
  // out of 灵力: the button says so
  const empty = boutOffers(Array(5).fill('cast:fire'), dummy({ hp: 200, atk: 1 }), kitOf());
  assert.equal(empty.find(o => o.token === 'cast:fire').why, 'no-qi');
  assert.ok(empty.find(o => o.token === 'strike').ok, 'two 灵力 left is still a strike');
});

/* ── 本命法宝 ── */

/* A player at 结丹 with a sword in hand and a 天材地宝 in the bag. */
const atCore = (extra = {}) => ({
  ...toOpenWorld(), tier: 'core', step: 0,
  bag: { 'iron-sword': 1, jingjin: 1, 'yaodan-2': 1, ...(extra.bag ?? {}) },
  wear: { weapon: 'iron-sword' }, ...extra,
});

test('炼化本命: once, at 结丹, from the weapon in hand and one 天材地宝 — and the player names it', () => {
  const early = { ...atCore(), tier: 'foundation' };
  assert.equal(refused(refine, early, { material: 'jingjin', name: '青锋' }, 'needs-tier').tier, 'core');
  const s = atCore();
  assert.equal(look(s, content, ctx()).can_refine, true);
  // What a binding would take, held now — the card offers it (his, 2026-09-24).
  assert.deepEqual(look(s, content, ctx()).refine_with, { weapon: '铁剑', materials: [{ id: 'jingjin', name: '精金', element: 'metal', n: 1 }] });
  assert.equal(look(s, content, ctx()).treasure, null);
  refused(refine, { ...s, wear: {} }, { material: 'jingjin', name: '青锋' }, 'no-weapon');
  assert.ok(refused(refine, s, { name: '青锋' }, 'needs-material').materials.some(m => m.id === 'jingjin' && m.element === 'metal'));
  refused(refine, { ...s, bag: { 'iron-sword': 1 } }, { material: 'jingjin', name: '青锋' }, 'not-in-bag');
  refused(refine, s, { material: 'jingjin' }, 'needs-name');
  const bound = must(refine, s, { material: 'jingjin', name: '青锋' });
  assert.deepEqual(bound.state.treasure, { name: '青锋', base: 3, element: 'metal', level: 1 });
  assert.equal(bound.state.bag.jingjin, undefined, 'the material is spent');
  assert.equal(bound.state.bag['iron-sword'], undefined, 'the weapon is spent');
  assert.deepEqual(bound.state.wear, {}, 'and unworn');
  assert.deepEqual(bound.result.show, [{ card: 'treasure' }]);
  assert.equal(bound.result.treasure.step, '一重');
  assert.equal(bound.result.treasure.atk, 4, '器攻 is what it was forged from, and every 重 since');
  // once
  assert.equal(refused(refine, bound.state, { material: 'jingjin', name: '别的' }, 'already-bound').treasure.name, '青锋');
  assert.equal(look(bound.state, content, ctx()).can_refine, undefined);
});

test('the treasure grows with the story — a chapter ended, a rumor\'s finale won — never by a tap; 九重 is the top', () => {
  const s = must(refine, atCore(), { material: 'jingjin', name: '青锋' }).state;
  // No 温养, no 强化 (redesign-v2 § 四): the verb is gone, a 妖丹 is goods.
  assert.equal(VERBS.nourish, undefined);
  refused(trade, { ...s, bag: { 'yaodan-2': 1 } }, { action: 'use', id: 'yaodan-2' }, 'not-usable');
  assert.equal(look(s, content, ctx()).treasure.exp, undefined, 'no exp bar toward the next 重');
  const at = (lvl) => ({ ...s, treasure: { ...s.treasure, level: lvl } });
  // A chapter ended: one 重 (the rules' own growth, rewards.json).
  const growth = content.rewards.growth.treasure;
  assert.equal(growth.chapter, 1); assert.equal(growth.tale_end, 1);
  const ending = { ...at(2), chapter: '03-qing', scene: '03-end', place: content.chapters['03-qing'].scenes['03-end'].at, ended: ['00-prologue', '01-ji', '02-yan'] };
  const ended = must(resolve, ending, { exit: content.chapters['03-qing'].scenes['03-end'].exits.find(e => e.ends).id }, ctx({ now: new Date('2027-03-01T12:00:00') }));
  assert.equal(ended.state.treasure.level, 3);
  assert.deepEqual(ended.result.treasure_grew, { name: '青锋', level: 3, why: 'chapter' });
  // …and at 九重 nothing more.
  const top = must(resolve, { ...ending, treasure: { ...s.treasure, level: 9 } }, { exit: content.chapters['03-qing'].scenes['03-end'].exits.find(e => e.ends).id }, ctx({ now: new Date('2027-03-01T12:00:00') }));
  assert.equal(top.state.treasure.level, 9);
  assert.equal(top.result.treasure_grew, undefined);
  // A 天材地宝 with no treasure yet is kept for the binding.
  refused(trade, { ...atCore(), treasure: null }, { action: 'use', id: 'jingjin' }, 'not-usable');
});

test('a bound treasure is the weapon from then on: it strikes, it lends its element, and 御剑 rides it', () => {
  const s = must(refine, atCore(), { material: 'jingjin', name: '青锋' }).state;
  const kit = look(s, content, ctx()).place.encounter?.duel?.kit
    ?? { roots: s.traits, tier: 'core', step: 0, treasure: s.treasure, weapon: null, sword: 'metal', arts: {} };
  assert.equal(kit.treasure.name, '青锋');
  assert.equal(kit.sword, 'metal', 'it lends its own element');
  const wood = { id: 'x', root: 'wood', lean: 'fierce', pattern: ['guard'], start: 0, hp: 80, qi: 80, spell: 1, atk: 1, def: 0, ward: 0, power: 0 };
  const bare = { ...kit, treasure: null, sword: null };
  // 器攻: what it was forged from, and its 重
  assert.equal(fight(['strike'], wood, kit).log[0].damage - fight(['strike'], wood, bare).log[0].damage, 4);
  // its own element is amplified, 重 by 重 — 金克木, so the 重 doubles too
  const plain = { ...kit, treasure: { ...kit.treasure, element: 'fire' } };
  assert.equal(fight(['cast:metal'], wood, kit).log[0].damage - fight(['cast:metal'], wood, plain).log[0].damage, 2);
  // 御剑 needs something in hand; the treasure is that
  const rider = { ...kit, arts: { yujian: { effect: 'twice', ready: true } } };
  assert.equal(fight(['art:yujian'], wood, rider).log[0].hits, 2);
  assert.equal(fight(['art:yujian'], wood, { ...rider, treasure: null, weapon: null }).refused.why, 'art-no-sword');
});

test('得牌: he fights only with the cards he has obtained — the starter at the root test, then what the world gives', () => {
  // His rule, 2026-09-22: 用户只能使用已经获得的牌, 包括银月, 法术, 武器等.
  const byId = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const beasts = new Set(content.creatures.creatures.map(c => c.id));
  const s = toFuzhu();
  // the root test hands over the starter of his roots, and nothing else
  const starter = content.cards.starter.filter(id => !byId[id].element || s.traits.includes(byId[id].element));
  assert.deepEqual([...s.cards].sort(), [...starter].sort());
  assert.equal(starter.length, 10, 'four roots, ten cards');
  const deck = look(s, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you.deck;
  assert.ok(deck.every(id => s.cards.includes(id)), 'the ten are all his');
  assert.ok(!deck.some(id => beasts.has(id)), 'no 山海经 beast he has not tamed');
  // a save from before 得牌 is read as what it would hold: starter, 银月, its cast
  const old = { ...s, cards: undefined, cast: ['fuzhu', 'paoxiao'], companion: { joined: '2026-09-18' } };
  const setup = look(old, content, ctx()).scene.exits.find(e => e.id === 'subdue').duel.setup.you;
  assert.deepEqual(setup.extra, ['yinyue']);
  assert.ok(setup.deck.includes('fuzhu') && setup.deck.includes('paoxiao'), 'the beasts that walk with him come in');
  assert.ok(!setup.deck.includes('jingwei'));
  // content may only grant a card that exists
  const bent = { ...content, quests: [{ ...content.quests[0], grant: { ...content.quests[0].grant, card: 'nope' } }, ...content.quests.slice(1)] };
  assert.ok(lint(bent).some(p => /unknown card nope/.test(p)));
  assert.ok(!lint(content).some(p => /unknown card/.test(p)));
});

test('a subdued creature leaves what it carries, one new card, and on one win in three a 符 — never a 妖丹', () => {
  // a 结丹 player holds more than the starter by then
  const s = { ...toFuzhu(), tier: 'core', step: 0, cards: [...toFuzhu().cards, 'leiming', 'hantan', 'tunshi', 'luoshi', 'chaoqi'] };
  const won = fightOut(s, 'subdue-fuzhu');
  assert.equal(won.result.outcome, 'won');
  const things = r => r.result.dropped.filter(d => !d.card).map(d => d.id);
  // 夫诸 carries nothing of its own; the 妖丹 went with 强化 (redesign-v2 § 四).
  assert.ok(things(won).every(id => id === 'talisman'), things(won).join());
  assert.equal(won.state.bag['yaodan-2'], undefined);
  // and a card he did not hold, of his roots, never a 山海经 beast (得牌)
  const [card] = won.result.dropped.filter(d => d.card);
  assert.ok(card && !s.cards.includes(card.id) && won.state.cards.includes(card.id));
  assert.ok(!content.creatures.creatures.some(c => c.id === card.id));
  const won_ = content.cards.cards.find(c => c.id === card.id);
  assert.ok(won_.kind !== 'spell' || s.traits.includes(won_.element), 'a spell he can cast, or a beast of any element');
  // A 符 falls on one win in `fight_one_in`, by the day, the beast and the 道号:
  // over many days, about a third — never every time, never none.
  const one = content.rewards.growth.charm.fight_one_in;
  const days = Array.from({ length: 30 }, (_, i) => fightOut(toFuzhu(), 'subdue-fuzhu', { c: ctx({ now: new Date(NOW.getTime() + i * 864e5) }) }));
  const charms = days.filter(d => d.result.outcome === 'won' && d.result.dropped.some(x => x.id === 'talisman')).length;
  const wins = days.filter(d => d.result.outcome === 'won').length;
  assert.ok(charms > 0 && charms < wins, `${charms} of ${wins}`);
  assert.ok(Math.abs(charms / wins - 1 / one) < 0.25, `${charms} of ${wins}, about one in ${one}`);
  // 精卫 carries 火精 besides
  const haunt = { ...toOpenWorld(), place: 'fajiu', traits: ['metal', 'wood', 'water', 'earth'] };
  const there = look(haunt, content, octx()).place.encounter;
  if (there?.creature.id === 'jingwei') {
    const got = fightOut(haunt, there.game.id, { c: octx() });
    if (got.result.outcome === 'won') assert.ok(got.result.dropped.some(d => d.id === 'huojing'));
  }
  // a loss leaves nothing
  const lost = fightOut(toFuzhu(), 'subdue-fuzhu', { line: 'pass' });
  assert.equal(lost.result.dropped, undefined);
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
  // Before she is found, the scene has no companion and her line is narration.
  assert.deepEqual(scene.cast, [{ id: 'fuzhu', name: '夫诸' }]);
  assert.equal(scene.lines[0].name, null);
  const out = must(resolve, s, { exit: 'riddle', answer: riddleAt(s, 'riddle').right });
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

test('no day cap: a day full of play pays every time — 灵气 is the only limit', () => {
  const s = start();
  s.day.progress = 10000; s.day.wealth = 10000;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 20);
  assert.equal(out.result.paid.capped, undefined);
});

test('a later realm pays more for the same task; the day counts base', () => {
  const s = start();
  s.tier = 'deity'; s.step = 0; s.progress = 0; // 化神, pay ×3
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 60); // 20 base × 3
  assert.equal(out.state.progress, 60);
  assert.equal(out.state.day.progress, 20);
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
  const chore = { id: 'shifu-scan', app: 'apple-shifu', period: 'week', due: true, reward: 30, title: { zh: '扫描', en: 'Scan' } };
  const done = ctx({ quests: [{ ...chore, done_at: '2026-09-10T09:00:00' }] });
  const s = start();
  const seen = look(s, content, done).quests[0];
  assert.deepEqual([seen.done, seen.paid], [true, false], 'Look shows the app\'s record before anyone asks');
  const paid = must(task, s, { action: 'check', id: 'shifu-scan' }, done);
  assert.equal(paid.result.paid.progress, 30);
  assert.equal(paid.state.chores['shifu-scan'].period, weekKey(NOW), 'the apps\' 功课 are the chores book; `quests` is 差事 now');
  assert.equal(look(paid.state, content, done).quests[0].paid, true);
  refused(task, paid.state, { action: 'check', id: 'shifu-scan' }, 'already-paid', done);
  const lastWeek = ctx({ quests: [{ ...chore, done_at: '2026-09-02T09:00:00' }] });
  refused(task, s, { action: 'check', id: 'shifu-scan' }, 'not-done', lastWeek);

  // 差事 ⑥: the 功课 ride the book — a line of its own, no slot taken, handed in with the same word
  const line = look(s, content, done).book.find(b => b.id === 'shifu-scan');
  assert.deepEqual([line.need, line.ready, line.chore.app], [[{ kind: 'chore', have: 1, n: 1 }], true, 'apple-shifu']);
  assert.equal(look(s, content, lastWeek).book.find(b => b.id === 'shifu-scan').ready, false, 'due, not done: it waits in the book');
  // Where to do it: the app's door by default, the page it declares when it does — and never a link out.
  assert.equal(line.chore.open, '/apps/apple-shifu/scripts/index.html', 'the app\'s own entry, read from its SKILL.md — /apps/<app>/ alone is the Linggen shell');
  const declared = ctx({ quests: [{ ...chore, open: '/apps/apple-shifu/scripts/index.html?tab=system', done_at: '2026-09-02T09:00:00' }] });
  assert.equal(look(s, content, declared).book.find(b => b.id === 'shifu-scan').chore.open, '/apps/apple-shifu/scripts/index.html?tab=system');
  const outward = ctx({ quests: [{ ...chore, open: 'https://example.com/', done_at: '2026-09-02T09:00:00' }] });
  assert.equal(look(s, content, outward).book.find(b => b.id === 'shifu-scan').chore.open, '/apps/apple-shifu/scripts/index.html');
  const nobody = ctx({ quests: [{ ...chore, app: 'no-such-app', done_at: '2026-09-02T09:00:00' }] });
  assert.equal(look(s, content, nobody).book.find(b => b.id === 'shifu-scan').chore.open, null, 'no entry, no link');
  refused(quest, s, { action: 'turn', id: 'shifu-scan' }, 'not-done', lastWeek);
  const turned = must(quest, s, { action: 'turn', id: 'shifu-scan' }, done);
  assert.equal(turned.result.paid.progress, 30);
  assert.deepEqual(turned.result.book, [], 'paid for its period, it leaves the book');
  refused(quest, turned.state, { action: 'turn', id: 'shifu-scan' }, 'already-paid', done);
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
  const same = must(lang, { ...start('zh'), lang_set: true }, { lang: 'zh' });
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
  assert.equal(en.words.pool, 'Stamina');
  assert.deepEqual(en.words.tiers.slice(0, 3), ['Qi Condensation', 'Foundation Establishment', 'Core Formation']);
  const zh = look(start('zh'), content, ctx());
  assert.equal(zh.words.progress, '修为');
  assert.equal(zh.words.stamina, '灵气');
});

test('a save from before the dictionary migrates to the ids', () => {
  const old = { version: 1, lang: 'zh', daohao: '青玄', root: ['wood'], realm: 'qi', stage: 2, xw: 30, ls: 5, beasts: ['fuzhu'], qi: 40, qi_at: NOW.toISOString(),
    bag: {}, chapter: '00-prologue', scene: '00-practice', done_scenes: [], ended: [], tasks: {}, quests: {}, wins: {}, branch: null, story: '', day: { key: '2026-09-11', xw: 30, ls: 5, branches: 0 } };
  const m = migrate(old);
  assert.equal(m.version, 5);
  assert.equal(m.world, 'jiuding', 'a save from before worlds was playing 《九鼎》');
  assert.equal(m.name, '青玄'); assert.deepEqual(m.traits, ['wood']); assert.equal(m.tier, 'qi'); assert.equal(m.step, 2);
  assert.equal(m.progress, 30); assert.equal(m.wealth, 5); assert.deepEqual(m.cast, ['fuzhu']); assert.equal(m.stamina, 40);
  assert.deepEqual(m.day, { key: '2026-09-11', progress: 30, wealth: 5 });
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
  assert.deepEqual(l.director.choice.options[2], { label: '今日传闻', tale: true }, 'seeds grow here: today\'s rumor is offered');
  assert.equal(look(toFuzhu(), content, ctx()).director.choice, null, 'a scene running has its own buttons');
  assert.equal(l.place.has.creature.name, '夫诸');
  assert.deepEqual(l.place.show, [{ card: 'creature', id: 'fuzhu' }]);
  assert.equal(l.place.places.length, 15, '徐 with 大野泽, 凫丽 and 空桑 — the 禹贡\'s 徐 — and 泗渊 under 彭城');
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
  // named, he is walked there — the whole road, never one leg and a question (his, 2026-09-21)
  const far = must(move, s, { place: 'pengcheng' });
  assert.equal(far.state.place, 'pengcheng');
  assert.deepEqual(far.result.via.map(p => p.id), ['sishui'], 'and the result says what was passed');
  assert.equal(must(move, s, { place: 'huaidu' }).state.place, 'huaidu');
  assert.equal(must(move, s, { place: '云龙山' }).result.via, undefined, 'one road is just a road');
  // a name half said is the one place it can mean — not counting where he stands
  assert.equal(must(move, { ...s, place: 'sishui' }, { place: '泗水' }).state.place, 'sibei', '「去泗水」 on 泗水岸 is 泗水北岸');
  refused(move, s, { place: '彭' }, 'unknown-place'); // one character is not a name
  refused(move, { ...s, place: 'pengcheng' }, { place: '泗水' }, 'unknown-place');
  // the way walks only places the player may enter: 微山 waits behind the rapids and 沛泽
  assert.equal(refused(move, s, { place: 'weishan' }, 'too-hard').here.id, 'sibei');
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

test('the director offers today\'s rumor only where seeds grow, and the pool', () => {
  const s = toOpenWorld();
  const d = look(s, content, ctx()).director;
  assert.ok(d.choice.options.some(o => o.tale));
  assert.equal(d.pool, 'full', 'the prologue asked nothing');
  assert.equal(look({ ...s, stamina: 40 }, content, ctx()).director.pool, 'half');
  assert.equal(look(start(), content, ctx()).director.pool, 'full');
  const moved = must(move, s, { place: 'sishui' }).state;
  const t = must(move, moved, { place: 'huaidu' }).state;
  assert.ok(!look(t, content, ctx()).director.choice.options.some(o => o.tale), 'the ferry has no seeds');
  assert.equal(look({ ...s, stamina: 0 }, content, ctx()).director.pool, 'empty');
  assert.equal(look({ ...s, stamina: 1 }, content, ctx()).director.pool, 'low', 'the last point is not empty');
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
  assert.deepEqual(l.place.shelf.map(i => i.id), ['lingzhi', 'qi-pill', 'ginseng', 'bamboo-sword', 'straw-cloak', 'jade-fish', 'ferry-token', 'wangqi-1', 'jade-ring']);
  assert.equal(l.place.shelf[1].buy, 80);
  assert.deepEqual(l.place.show, [{ card: 'item', ids: ['lingzhi', 'qi-pill', 'ginseng', 'bamboo-sword', 'straw-cloak', 'jade-fish', 'ferry-token', 'wangqi-1', 'jade-ring'] }]);
  const bought = must(trade, s, { action: 'buy', id: 'qi-pill' });
  assert.equal(bought.state.wealth, 20);
  assert.deepEqual(bought.state.bag, { 'moon-bell': 1, 'qi-pill': 1 }); // the bell came from the river
  assert.equal(bought.state.stamina, 100, 'the market costs nothing — a tap, no time (2026-09-23)');
  assert.equal(bought.result.item.held, 1);
  assert.deepEqual(look(bought.state, content, ctx()).bag.map(b => b.id), ['moon-bell', 'qi-pill']);
  const sold = must(trade, bought.state, { action: 'sell', id: 'qi-pill' });
  assert.equal(sold.state.wealth, 40);
  assert.deepEqual(sold.state.bag, { 'moon-bell': 1 });
  refused(trade, sold.state, { action: 'sell', id: 'qi-pill' }, 'not-in-bag');
  const poor = refused(trade, { ...s, wealth: 10 }, { action: 'buy', id: 'qi-pill' }, 'no-stones');
  assert.equal(poor.say, '灵石不够。');
  assert.equal(poor.price, 80);
  assert.deepEqual(refused(trade, s, { action: 'buy', id: 'moon-bell' }, 'not-for-sale-here').shelf.length, 9, 'the old 回春丹 is sold nowhere now');
  refused(trade, s, { action: 'buy', id: 'nothing' }, 'unknown-item');
  assert.equal(must(trade, { ...s, stamina: 0 }, { action: 'buy', id: 'straw-cloak' }).result.ok, true, 'spent 体力 still shops');
});

test('no market away from one; a pill is used anywhere; a wear waits for her', () => {
  const s = toMarket();
  const away = must(move, s, { place: 'sishui' }).state;
  assert.equal(refused(trade, away, { action: 'buy', id: 'ginseng' }, 'no-market').say, '这里没有坊市。');
  const withPill = must(trade, s, { action: 'buy', id: 'qi-pill' }).state;
  const used = must(trade, must(move, withPill, { place: 'sishui' }).state, { action: 'use', id: 'qi-pill' });
  assert.equal(used.result.paid.progress, 20);
  assert.deepEqual(used.state.bag, { 'moon-bell': 1 }); // the river's bell is carried from the prologue
  refused(trade, s, { action: 'use', id: 'qi-pill' }, 'not-in-bag');
  const withSword = must(trade, s, { action: 'buy', id: 'bamboo-sword' }).state;
  // arms used are worn, each in its own slot: a weapon in hand (a fight
  // borrows its root), a 法衣 on the back (2026-09-16, 2026-09-17)
  const armed = must(trade, withSword, { action: 'use', id: 'bamboo-sword' });
  assert.deepEqual(armed.state.wear, { weapon: 'bamboo-sword' });
  assert.deepEqual(armed.result.item.effect, { atk: 2, root: 'wood', root_name: '木' });
  const cloaked = must(trade, must(trade, withSword, { action: 'buy', id: 'straw-cloak' }).state, { action: 'use', id: 'straw-cloak' });
  assert.deepEqual(cloaked.state.wear, { robe: 'straw-cloak' });
  assert.deepEqual(cloaked.result.item.effect, { def: 1 });
  // Her gift waits for her: worn only once she has been found.
  const withBell = { ...s, bag: { 'moon-bell': 1 } };
  refused(trade, withBell, { action: 'use', id: 'moon-bell' }, 'no-companion');
  const worn = must(trade, { ...withBell, companion: { joined: '2026-09-11' } }, { action: 'use', id: 'moon-bell' });
  assert.deepEqual(worn.state.wear, { yinyue: 'moon-bell' });
  assert.equal(worn.result.item.worn, true);
  const bellSold = must(trade, worn.state, { action: 'sell', id: 'moon-bell' }).state;
  assert.deepEqual(bellSold.wear, {}, 'sold, no longer worn');
});

test('写符 is gone: no verb, never a choice — a 符 comes from fights and rumors, and cast in a bout it is spent', () => {
  const s = toMarket();
  const papered = { ...s, bag: { 'sang-paper': 2, talisman: 1 } };
  assert.equal(VERBS.write, undefined);
  assert.ok(!look(papered, content, ctx()).director.choice.options.some(o => o.write), 'the choice never offers it');
  const w = { state: papered };
  // a 符 is not "used"; it has no market price
  assert.equal(refused(trade, w.state, { action: 'use', id: 'talisman' }, 'cast-in-a-bout').say, '符在降妖时掷出，不在此。');
  refused(trade, w.state, { action: 'sell', id: 'talisman' }, 'not-for-sale');
  // A 符 in the bag is a card in hand at the door (§ 装备入局): one a fight
  // however many are held, spent only when it is played.
  const october = () => ctx({ now: new Date('2026-10-05T10:00:00') });
  const base = { ...w.state, bag: { ...w.state.bag, talisman: 2 }, chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, stamina: 50 };
  const opened = must(duel, base, { id: 'haunt:jingwei' }, october());
  assert.equal(opened.result.duel.setup.you.extra.filter(id => id === 'talisman').length, 1, 'one 符 a fight');
  const settled = fightOut(base, 'haunt:jingwei', { c: october() });
  assert.ok(['won', 'lost', 'withdrew'].includes(settled.result.outcome));
  const cast = settled.result.spent?.includes('talisman');
  const fell = settled.result.dropped?.some(d => d.id === 'talisman') ? 1 : 0; // a win may leave one (1 in 3)
  assert.equal(settled.state.bag.talisman, (cast ? 1 : 2) + fell, 'a 符 played is a 符 spent');
  // Held and never played, it stays in the bag.
  const kept = fightOut(base, 'haunt:jingwei', { c: october(), line: 'pass' });
  assert.equal(kept.state.bag.talisman, 2, 'a 符 not played is kept');
  assert.equal(kept.result.spent, undefined);
  assert.equal(settled.result.refilled, undefined);
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
  const rested = { ...toOpenWorld(), chance: DEALT };
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
  assert.equal(r.state.stamina, 97, 'chapter 1 is not free: a step costs three');
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
  assert.deepEqual(ye.place.shelf.map(i => i.id), ['moon-bell', 'iron-sword', 'foundation-pill', 'wangqi-1', 'huojing']);
  s = answer(trade, s, { action: 'buy', id: 'iron-sword' }).state;
  assert.equal(s.wealth, 180);
  s = answer(resolve, s, { exit: 'market' }).state; // stays
  s = answer(resolve, s, { exit: 'shrine' }).state;
  assert.equal(s.place, 'hebo');
  const altar = look(s, content, octx()).scene;
  assert.equal(altar.id, '01-altar');
  assert.ok(altar.exits.find(e => e.id === 'subdue').duel.creature.root === 'earth');
  assert.equal(answer(duel, s, { id: altar.exits.find(e => e.id === 'subdue').game.id }).state.stamina, s.stamina - content.rewards.stamina.cost.duel, 'a bout here costs');
  // the riddle way through
  const wu = riddleAt(s, 'riddle', octx());
  missed(resolve, s, { exit: 'riddle', answer: wu.wrong }, octx());
  r = answer(resolve, s, { exit: 'riddle', answer: wu.right });
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

test('问卦 is the day\'s fight luck alone: its grade turns the lower trigram\'s 功法, reads the beast at 吉 — and never touches pay or a step', () => {
  const castOn = (st, ask, grade, hexagram = 1) => ({ ...st, divination: { day: '2026-10-02', ask, throws: [[3, 2, 2], [3, 2, 2], [3, 2, 2], [3, 2, 2], [3, 2, 2], [3, 2, 2]], hexagram, changed: null, grade } });
  const atShrine = () => answer(resolve, answer(resolve, toJi(), { exit: 'town' }).state, { exit: 'shrine' }).state;
  const paidBy = st => must(resolve, st, { exit: 'send' }, octx()).result.paid;
  const plain = paidBy(atShrine());
  // A cast made before the merge that asked about cultivation or wealth, and a
  // dire one: pay and the story's steps are untouched (redesign-v2 § 四).
  for (const [ask, grade] of [['cultivation', 'great'], ['wealth', 'great'], ['cultivation', 'dire'], [undefined, 'great']]) {
    const paid = paidBy({ ...castOn(atShrine(), ask, grade), last_step_at: new Date(OCT.getTime() - 10_000).toISOString() });
    assert.deepEqual([paid.progress, paid.wealth, paid.fortune], [plain.progress, plain.wealth, undefined], `${ask} ${grade}`);
  }
  // a fight asked about: the lower trigram's root (乾 → 金) lifts or lowers
  // its 法术, all day
  const lift = { roots: ['metal'], tier: 'qi', step: 0, fortune: { root: 'metal', spell: 2 } };
  const woodling = { id: 'x', root: 'wood', lean: 'fierce', pattern: ['guard'], start: 0, hp: 40, qi: 40, spell: 1, atk: 1, def: 0, ward: 0, power: 0 };
  const plainSpell = fight(['cast:metal'], woodling, { roots: ['metal'], tier: 'qi', step: 0 }).log[0].damage;
  assert.equal(fight(['cast:metal'], woodling, lift).log[0].damage, plainSpell + 4, '金克木, so the two are doubled too');
  assert.equal(fight(['cast:metal'], woodling, { ...lift, fortune: { root: 'metal', spell: -2 } }).log[0].damage, plainSpell - 4);
  // …and into 斗法 v3: the same root's 功法 hit harder by the grade's `card`
  // (乾 → 金: 大吉 +2 · 吉 +1 · 凶 −1 · 大凶 −2), printed on the card as it lands
  const fuzhu = content.creatures.creatures.find(c => c.id === 'fuzhu');
  const day = new Date('2026-10-02T12:00:00');
  const youOf = (ask, grade) => fightSetup(content, castOn(toFuzhu(), ask, grade), fuzhu, day).you;
  assert.deepEqual(youOf(undefined, 'great').boost, { element: 'metal', n: 2 });
  assert.deepEqual(youOf(undefined, 'dire').boost, { element: 'metal', n: -2 });
  assert.equal(youOf(undefined, 'even').boost, undefined);
  assert.deepEqual(youOf('cultivation', 'good').boost, { element: 'metal', n: 1 }, 'an older cast reads as the day\'s fight luck too');
  // 望气 at 吉 and 大吉: the beast's next move read for the day, as the scroll's 上卷
  assert.equal(youOf(undefined, 'great').insight, 1);
  assert.equal(youOf(undefined, 'good').insight, 1);
  assert.equal(youOf(undefined, 'ill').insight, undefined);
  assert.equal(fightSetup(content, { ...castOn(toFuzhu(), undefined, 'great'), insight: 2 }, fuzhu, day).you.insight, 2, 'the 下卷 still reads more');
  const byId = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const side = n => ({ boost: { element: 'metal', n } });
  assert.equal(effectOf(side(2), byId.jinzhua).damage, byId.jinzhua.effect.damage + 2);
  assert.equal(effectOf(side(2), byId.jinzhen).sweep, byId.jinzhen.effect.sweep + 2);
  assert.equal(effectOf(side(-2), byId.jinzhua).damage, 1, 'never below one');
  assert.equal(effectOf(side(2), byId.huodan), byId.huodan.effect, 'another element is untouched');
  assert.equal(effectOf(side(2), byId.jinsuo), byId.jinsuo.effect, 'a body is not a 功法');
  const played = battle(['end', 'play:0'], { mode: 'pve', seed: 's', you: { tier: 'qi', root: 'metal', deck: ['xiaoyao', 'qingteng', 'leipu', 'huoya'], extra: ['jinzhua'], boost: { element: 'metal', n: 2 } }, foe: { tier: 'qi', root: 'earth', deck: fuzhu.deck } }, byId);
  const plainHit = battle(['end', 'play:0'], { mode: 'pve', seed: 's', you: { tier: 'qi', root: 'metal', deck: ['xiaoyao', 'qingteng', 'leipu', 'huoya'], extra: ['jinzhua'] }, foe: { tier: 'qi', root: 'earth', deck: fuzhu.deck } }, byId);
  assert.equal(plainHit.foe.hp - played.foe.hp, 2, JSON.stringify(played.log.slice(0, 4)));
});

test('past the prologue a story step costs 灵气; an empty 丹田 refuses with the hour and changes nothing', () => {
  let s = answer(resolve, toJi(), { exit: 'town' }).state; // walked to Ye by the exit
  // the last point buys one more step, and takes him to 0
  const last = answer(resolve, { ...s, stamina: 1, stamina_at: OCT.toISOString() }, { exit: 'shrine' }, octx());
  assert.equal(last.state.stamina, 0);
  s.stamina = 0; s.stamina_at = OCT.toISOString();
  const r = refused(resolve, s, { exit: 'shrine' }, 'no-stamina', octx());
  assert.equal(r.cost, 3);
  // one point back at 20 an hour = 3 minutes
  assert.equal(new Date(r.returns_at).getTime(), OCT.getTime() + 3 * 60_000);
  assert.match(r.say, /体力耗尽了。回到现实里歇一歇/);
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
  const won = fightOut(s, 'subdue-paoxiao', { c: octx() });
  assert.equal(won.result.outcome, 'won', JSON.stringify(won.result.log));
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

test('look carries today\'s cast (none yet) and the offered tasks', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  const seen = look(s, content, ctx());
  assert.equal(seen.divination, null);
  assert.deepEqual(seen.tasks.map(t => [t.id, t.status]), [['alchemy-first', 'offered']]);
});

test('问卦: once a day by three coins — nothing asked first, the same throws all day, and what the grade does to the day\'s fights', () => {
  let s = start();
  s.name = '清玄';
  const c = ctx();
  // no question: the coins fall at once (an `ask` from an older caller is ignored)
  const cast = must(divine, s, {}, c);
  const d = cast.result.divination;
  assert.equal(d.ask, undefined);
  assert.equal(cast.state.divination.ask, undefined);
  assert.equal(d.throws.length, 6); assert.ok(d.throws.every(t => t.length === 3 && t.every(x => x === 2 || x === 3)));
  assert.deepEqual(d.hexagram.lines, d.values.map(v => v % 2));
  assert.deepEqual(d.moving, d.values.flatMap((v, i) => (v === 6 || v === 9 ? [i] : [])));
  assert.equal(Boolean(d.changed), d.moving.length > 0);
  const h = content.hexagrams.hexagrams.find(x => x.id === d.hexagram.id);
  assert.equal(d.grade.id, h.grade);
  // its effect is the day's fights only: the element's 功法 ±card, and 望气 at 吉/大吉
  const e = content.hexagrams.effects.bout[d.grade.id];
  assert.deepEqual(Object.keys(d.effect).filter(k => k !== 'root').sort(), Object.keys(e).sort());
  assert.deepEqual(Object.keys(content.hexagrams.effects), ['bout'], 'no 修为 or 灵石 factor any more');
  // the same day and name fall the same way — no fishing
  assert.deepEqual(must(divine, s, { ask: 'wealth' }, c).result.divination.throws, d.throws);
  // once a day
  assert.equal(refused(divine, cast.state, {}, 'cast-today').divination.hexagram.id, d.hexagram.id);
  assert.equal(look(cast.state, content, c).divination.hexagram.id, d.hexagram.id);
  assert.equal(look(cast.state, content, ctx({ now: new Date(NOW.getTime() + 864e5) })).divination, null);
  // The coins are their own card: 起一卦 is tapped there, never asked here too.
  const open = { ...cast.state, scene: null, chapter: '03-qing', place: 'linzi' };
  assert.ok(!look(open, content, c).director.choice.options.some(o => o.divine));
  assert.ok(!look({ ...open, divination: null }, content, c).director.choice.options.some(o => o.divine));
});

test('命格 from a birthday: 生肖 turns at 立春 by the day, 日主 is the day\'s stem — as lunar-python reads them', () => {
  const sign = (d) => { const f = fateOf(content, d); return f && [f.zodiac, content.traits.fate.stems.find(x => x.id === f.stem).zh]; };
  assert.deepEqual(sign('1984-02-03'), ['pig', '丁']);
  assert.deepEqual(sign('1984-02-04'), ['rat', '戊']);
  assert.deepEqual(sign('1990-01-20'), ['snake', '乙']);
  assert.deepEqual(sign('2000-01-01'), ['rabbit', '戊']);
  assert.deepEqual(sign('1972-02-05'), ['rat', '丙']);
  assert.deepEqual(sign('2026-09-17'), ['horse', '甲']);
  assert.deepEqual(sign('1900-01-31'), ['pig', '甲']);
  assert.deepEqual(sign('2012-12-21'), ['dragon', '丙']);
  assert.equal(fateOf(content, '2023-02-30'), null);
  assert.equal(fateOf(content, '1850-05-01'), null);
  assert.equal(fateOf(content, 'yesterday'), null);
});

test('命格 is set once, keeps no birthday, and leans a bout and the day\'s cast', () => {
  const s = { ...start(), name: '清玄' };
  const set = must(fate, s, { birth: '1990-01-20' });
  assert.deepEqual(Object.keys(set.state.fate).sort(), ['at', 'element', 'source', 'stem', 'zodiac']);
  assert.ok(!JSON.stringify(set.state).includes('1990'), 'the birthday is not kept');
  assert.deepEqual(set.result.fate.element, { id: 'wood', name: '木' });
  assert.equal(refused(fate, set.state, { birth: '2000-01-01' }, 'fate-set').fate.zodiac.id, 'snake');
  refused(fate, s, { birth: '2999-01-01' }, 'birth-invalid');
  refused(fate, s, { birth: '1990-02-30' }, 'birth-invalid');
  const r1 = must(fate, s, { random: 'true' }).state.fate, r2 = must(fate, s, { random: 'true' }).state.fate;
  assert.equal(r1.zodiac, r2.zodiac); assert.equal(r1.source, 'random');
  const declined = must(fate, s, { decline: 'true' }).state;
  assert.deepEqual(look(declined, content, ctx()).fate, { declined: true });
  assert.equal(must(fate, declined, { birth: '1990-01-20' }).result.ok, true, 'a declined sign can still be set');
  // fights: once a fight, a blow of one's 日主 element is halved
  const caster = { id: 'x', root: 'wood', lean: 'fierce', pattern: ['cast'], start: 0, hp: 60, qi: 60, spell: 8, atk: 1, def: 0, ward: 0, power: 999 };
  const kit = { roots: ['wood'], tier: 'qi', step: 0 };
  const bare = fight([], caster, kit).log[0].damage;
  const signed = fight([], caster, { ...kit, fate: { root: 'wood' } });
  assert.equal(signed.log[0].damage, Math.round(bare / 2));
  assert.equal(fight(['assist:guard'], caster, { ...kit, fate: { root: 'wood' } }).log[2].damage, Math.round(bare / 2), 'the 护体 halves the second, the sign is spent');
  // the cast: a lower trigram of one's own element leans the grade
  const day = ctx();
  const plainCast = must(divine, s, {}, day).result.divination;
  const lower = content.hexagrams.trigram_roots[{ 111: 'qian', 110: 'dui', 101: 'li', 100: 'zhen', '011': 'xun', '010': 'kan', '001': 'gen', '000': 'kun' }[plainCast.hexagram.lines.slice(0, 3).join('')]];
  const stem = content.traits.fate.stems.find(x => x.element === lower);
  const leaned = must(divine, { ...s, fate: { zodiac: 'rat', stem: stem.id, element: lower, source: 'random' } }, {}, day).result.divination;
  const up = { great: 'great', good: 'great', even: 'even', ill: 'even', dire: 'ill' };
  assert.equal(leaned.grade.id, up[plainCast.grade.id]);
  assert.equal(leaned.fated, true); assert.equal(plainCast.fated, undefined);
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
  // The chat may hold its tongue (nothing waits, but this was no arrival) and
  // the map card still shows the roads — so a tap on one is still a Move.
  const opened = cli('look');
  assert.equal(opened.ask, null);
  const choice = opened.director.choice;
  const road = choice.options.find(o => o.move);
  assert.ok(road, JSON.stringify(choice));
  assert.match(cli('look', `--said=${road.label}`).then, new RegExp(`Move \\{place: ${road.move}\\}`));
  // …and so is its chip on the map, which says 去X.
  assert.match(cli('look', `--said=去${road.label}`).then, new RegExp(`Move \\{place: ${road.move}\\}`));
  // The coins on the stage, or the cast asked for in words, are Divine —
  // at a scene too, where 起一卦 is none of the scene's options.
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(s));
  for (const words of ['请银月起一卦', '帮我算一卦', 'Yinyue, cast the coins for me']) {
    assert.match(cli('look', `--said=${words}`).then, /call Divine now/, words);
  }
  assert.match(cli('look', '--said=起一卦').then, /Divine/);
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
  const skill = path.resolve(import.meta.dirname, '..');
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
    // every command answer also carries the ready question (`ask`, `then`) and
    // what stands on the stage (`stage`); these compare the verb's own answer
    const own = ({ ask, then, stage, ...r }) => r;
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
    const moved = run('move', '--place=isle'); // the map is the page's
    assert.equal(moved.ok, true);
    assert.equal(run('look', '--for=ling').place.places, undefined, 'Ling is handed no map to draw');
    assert.ok(run('look').place.places.length, 'anyone else — the page — gets it all');
    assert.deepEqual(moved.show, [{ card: 'creature', id: 'jingwei' }, { card: 'map' }], 'a made world draws its own map with every place');
    assert.equal(moved.place.province.start, 'reeds');
    assert.deepEqual(moved.place.places.find(p => p.id === 'isle').roads, ['reeds', 'bell']);
    const walked = run('move', '--place=shrine');
    assert.equal(walked.place.id, 'shrine', 'a place named is walked to, the whole road');
    assert.deepEqual(walked.via.map(p => p.id), ['reeds'], 'by the ford, not the pool beyond the tier');
    // worlds and travel
    assert.deepEqual(run('worlds').worlds.map(w => [w.id, w.playing, w.saved]), [['jiuding', false, true], ['the-yunmeng-marsh', true, true]]);
    const home = run('travel', '--world=jiuding');
    assert.deepEqual(home.travelled, { from: 'the-yunmeng-marsh', to: 'jiuding', fresh: false });
    assert.equal(home.scene.id, '00-river');
    assert.equal(home.building, undefined, 'a shipped world never builds');
    assert.equal(home.stamina.now, 90, 'building cost the save it was built from');
    assert.equal(run('travel', '--world=the-yunmeng-marsh').place.id, 'shrine', 'restored where it stood');
    assert.equal(run('travel', '--world=nowhere').refused, 'unknown-world');
    assert.equal(run('build', `--world=${JSON.stringify(bare)}`).refused, 'world-in-play');
    // undo steps back across the last travel
    assert.equal(run('undo').undid, 'travel');
    // …and puts back the parked save that travel took up, so the world he
    // left is where he left it (review, 2026-09-24: it began again from nothing)
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).world, 'jiuding');
    assert.ok(fs.existsSync(path.join(dir, 'saves/the-yunmeng-marsh.json')), 'the marsh is parked again');
    assert.ok(!fs.existsSync(path.join(dir, 'saves/jiuding.json')), 'the world in play is not also parked');
    const again = run('travel', '--world=the-yunmeng-marsh');
    assert.deepEqual(again.travelled, { from: 'jiuding', to: 'the-yunmeng-marsh', fresh: false });
    assert.equal(again.place.id, 'shrine', 'where he stood');
  } finally {
    fs.rmSync(png, { force: true });
    if (!fs.readdirSync(pictures).length) fs.rmdirSync(pictures);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Amend adds a creature where it haunts, or a place with its roads laid back; never to a shipped world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-amend-'));
  const rules = path.resolve(import.meta.dirname, '../scripts/rules.mjs');
  const run = (...args) => {
    const out = spawnSync(process.execPath, [rules, ...args], { env: { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString() }, encoding: 'utf8' });
    return JSON.parse(out.stdout.trim().split('\n').pop());
  };
  const pictures = path.resolve(import.meta.dirname, '../data/pictures'); fs.mkdirSync(pictures, { recursive: true });
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
  assert.deepEqual(town.place.shelf.map(i => i.id), ['firm-pill', 'wangqi-2', 'sang-paper', 'leijimu', 'xirang']);
  s = answerN(trade, s, { action: 'buy', id: 'sang-paper' }).state;
  assert.equal(s.wealth, 370);
  s = answerN(resolve, s, { exit: 'lake' }).state;
  assert.equal(s.place, 'leize');
  const lake = look(s, content, nctx()).scene;
  assert.equal(lake.id, '02-lake');
  assert.equal(lake.exits.find(e => e.id === 'subdue').duel.creature.root, 'wood');
  // the three ways: the riddle
  const lei = riddleAt(s, 'riddle', nctx());
  missed(resolve, s, { exit: 'riddle', answer: lei.wrong }, nctx());
  r = answerN(resolve, s, { exit: 'riddle', answer: lei.right });
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
  // The Core is formed: the call to find her opens, and chapter 3 has not.
  const called = wake(r.state, content, nctx());
  assert.deepEqual(called.companion, {});
  assert.equal(called.scene, r.state.scene, 'chapter 3 has not opened');
});

const DEC = new Date('2026-12-02T12:00:00');
const dctx = (extra = {}) => ({ now: DEC, quests: [], ...extra });
const answerD = (fn, st, args) => must(fn, st, args, dctx());

/* Chapter 2 behind them, the Core formed, standing at the deeps of Lake Lei. */
function afterYan() {
  return { ...afterJi(), chapter: '02-yan', place: 'leiyuan', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 0, progress: 0, stamina: 100, wealth: 400 };
}

test('in November the road from 凫丽 into 青 is closed', () => {
  const s = { ...afterYan(), place: 'fuli' };
  const r = refused(move, s, { place: 'weishui' }, 'road-closed', nctx());
  assert.ok(r.say.includes('青州'));
  // 定陶 is 豫's by the 禹贡, and no chapter opens 豫 yet
  assert.ok(refused(move, { ...s, place: 'puyang' }, { place: 'dingtao' }, 'road-closed', nctx()).say.includes('豫州'));
});

test('chapter 3 opens in December: the road from Fuli, the Wei, Linzi\'s market, the shore, the seal, the Nascent Soul, the end', () => {
  let s = afterYan();
  // The Core is formed, so waking opens the search for her; the road waits for December.
  assert.deepEqual(wake(s, content, nctx()).companion, {});
  assert.equal(wake(s, content, nctx()).chapter, s.chapter, 'not in November');
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
  assert.deepEqual(town.place.shelf.map(i => i.id), ['wangqi-2', 'qi-salt', 'qi-silk', 'jingjin', 'hanyu']);
  s = answerD(trade, s, { action: 'buy', id: 'qi-salt' }).state;
  assert.equal(s.wealth, 380);
  s = answerD(resolve, s, { exit: 'shore' }).state;
  assert.equal(s.place, 'penglai');
  const shore = look(s, content, dctx()).scene;
  assert.equal(shore.id, '03-shore');
  assert.equal(shore.exits.find(e => e.id === 'subdue').duel.creature.root, 'water');
  // the three ways: the riddle
  const kui = riddleAt(s, 'riddle', dctx());
  missed(resolve, s, { exit: 'riddle', answer: kui.wrong }, dctx());
  r = answerD(resolve, s, { exit: 'riddle', answer: kui.right });
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
  const thread4 = look(r.state, content, dctx()).director.thread;
  assert.equal(thread4.chapter, '04-xu'); assert.equal(thread4.opens, '2027-01-01', 'chapter 4 waits for its month');
});

test('in October the road from Ye into 兖 is closed, and the brief says so', () => {
  const s = afterJi();
  const r = refused(move, s, { place: 'pushui' }, 'road-closed', octx());
  assert.ok(r.say.includes('兖州'));
  assert.deepEqual(look(s, content, octx()).director.closed.map(c => c.id ?? c), look(s, content, octx()).director.closed.map(c => c.id ?? c));
});

test('a win asks for Yinyue\'s glad line last; a trade or a refusal does not', () => {
  const glad = /Yinyue's own, glad/;
  assert.match(thenFor({ ok: true, paid: { progress: 72, wealth: 20 } }), glad);
  assert.match(thenFor({ ok: true, breakthrough: { from: 'a', to: 'b' } }), glad);
  assert.match(thenFor({ ok: true, paid: { progress: 0, wealth: 0, cast: 'fuzhu' } }), glad);
  assert.doesNotMatch(thenFor({ ok: true, sold: 'lingzhi', paid: { wealth: 12 } }), glad);
  assert.doesNotMatch(thenFor({ ok: true, bought: 'lingzhi', paid: { wealth: -12 } }), glad);
  assert.doesNotMatch(thenFor({ ok: false, refused: 'needs-answer' }), glad);
  assert.doesNotMatch(thenFor({ ok: true, paid: { progress: 0, wealth: 0 } }), glad);
});

test('a cauldron the player cannot take yet offers the way back, and says what its breath asks', () => {
  const c = ctx({ now: new Date('2026-12-02T12:00:00') }); // 青 open (the tests date its chapter)
  const s = { ...start(), chapter: '03-qing', scene: '03-cauldron', place: 'liubo', tier: 'core', step: 0, progress: 222, name: '清玄' };
  const l = look(s, content, c);
  const take = l.scene.exits.find(e => e.id === 'take');
  assert.equal(take.breakthrough.ready, false);
  assert.deepEqual(take.breakthrough.need, { step: '结丹后期', progress: 1200, to: '元婴' });
  assert.ok(!l.ask.options.some(o => o.exit === 'take'), 'no breath to tap');
  const back = l.ask.options.find(o => o.move);
  assert.equal(back?.label, '先回蓬莱');
  // walked back, the open world does not lead straight back to the cauldron
  const away = move(s, content, c, { place: back.move });
  assert.equal(away.result.ok, true);
  const choice = look(away.state, content, c).director.choice;
  assert.notEqual(choice.options.find(o => o.move)?.move, 'liubo');
  // and the goal says why the story waits: what the breath asks, where he stands, no road to it
  const waits = look(away.state, content, c).waypoint;
  assert.deepEqual(waits.gate, { step: '结丹后期', progress: 1200, to: '元婴', now: { step: '结丹初期', progress: 222, of: 800 } });
  assert.equal(waits.toward, undefined);
  // at the peak, the breath is the button again
  const peak = { ...s, step: 2, progress: 1200 };
  const ready = look(peak, content, c);
  assert.equal(ready.scene.exits.find(e => e.id === 'take').breakthrough.ready, true);
  assert.ok(ready.ask.options.some(o => o.exit === 'take'));
  assert.ok(!ready.ask.options.some(o => o.move));
});

test('银月 is found, not given: the call at 结丹, the bell, water, her riddle — and until then she is not in the game', () => {
  const core = { ...start(), scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji', '02-yan'],
    tier: 'core', step: 0, progress: 100, name: '清玄', place: 'sishui', bag: { 'moon-bell': 1 } };
  // Before the call she is nowhere: no companion, and her line is the narration's.
  const before = look({ ...core, tier: 'qi' }, content, ctx());
  assert.equal(before.companion, null);
  assert.equal(before.quest, null);
  // The call comes on waking at the realm the world names.
  const called = wake(core, content, ctx());
  assert.deepEqual(called.companion, {});
  const l = look(called, content, ctx());
  assert.equal(l.companion, null);
  assert.equal(l.quest.step, 'ring', '泗水岸 holds a moon');
  assert.ok(l.quest.line);
  // The bell is hers to answer; without it the quest asks for it, and the market sells it.
  const noBell = { ...called, bag: {} };
  assert.equal(look(noBell, content, ctx()).quest.step, 'bell');
  assert.ok(look({ ...noBell, place: 'pengcheng' }, content, ctx()).place.shelf.some(i => i.id === 'moon-bell'));
  refused(VERBS.ring, noBell, {}, 'no-bell');
  refused(VERBS.ring, { ...called, place: 'yunlong' }, {}, 'not-water');
  refused(VERBS.ring, { ...core, companion: { joined: '2026-09-11' } }, {}, 'not-yet');
  // Rung, she asks a riddle of her own — and it is the question until it is answered.
  const rung = VERBS.ring(called, content, ctx(), {});
  assert.equal(rung.result.refused, 'needs-answer');
  assert.ok(rung.result.say && rung.result.choices.length);
  const key = rung.state.companion.riddle.key;
  const riddle = content.riddles.zh.riddles[key];
  assert.equal(askOf(content, rung.state, ctx()).question, riddle.q);
  const wrong = riddle.choices.find(c => !riddle.a.includes(c));
  const missed = VERBS.ring(rung.state, content, ctx(), { answer: wrong });
  assert.equal(missed.result.refused, 'wrong-answer'); assert.ok(missed.result.hint);
  // Answered, she joins: the bell is hers to wear, and her lines are her own again.
  const joined = VERBS.ring(missed.state, content, ctx(), { answer: riddle.a[0] });
  assert.equal(joined.result.ok, true);
  assert.equal(joined.result.joined.name, '银月');
  assert.equal(joined.state.wear.yinyue, 'moon-bell');
  assert.ok(joined.result.paid.progress > 0);
  // Her first words are hers to say (her_beat), never a line in Ling's beat.
  assert.ok(!joined.result.beat.some(b => b.who === 'yinyue'));
  assert.ok(joined.result.her_beat.facts.line.includes('铃是我的'));
  assert.equal(joined.state.node.her_beat.id, 'join/yinyue');
  const after = look(joined.state, content, ctx());
  assert.equal(after.companion.id, 'yinyue');
  assert.equal(after.quest, null);
  // A scene with one button takes its second option from the rules: a look
  // around, found or not — never a word to her, which Ling cannot answer for
  // (she has her own ask box on the stage).
  const lone = { chapter: '00-prologue', scene: '00-stone', place: 'sishui' };
  assert.equal(askOf(content, { ...called, ...lone }, ctx()).options.at(-1).label, '看看四周');
  assert.equal(askOf(content, { ...joined.state, ...lone }, ctx()).options.at(-1).label, '看看四周');
  assert.ok(!askOf(content, { ...joined.state, ...lone }, ctx()).options.some(o => o.ask || /银月|Yinyue/.test(o.label)));
  // A second bell is not sold once she has been found.
  assert.ok(!look({ ...joined.state, place: 'pengcheng', bag: {} }, content, ctx()).place.shelf.some(i => i.id === 'moon-bell'));
});

test('遇: no arrival is empty — a find, a traveller\'s riddle or a beast on the road; once per place per day, never where the place has its own', () => {
  const base = { ...toOpenWorld(), place: 'sishui', tier: 'core', bag: {}, cast: ['fuzhu'], name: '清玄' };
  const day = i => ctx({ now: new Date(2026, 9, 1 + i, 12) });
  const deals = Array.from({ length: 30 }, (_, i) => must(move, base, { place: 'huaidu' }, day(i)));
  const kinds = deals.map(d => d.result.place.meet?.kind);
  assert.ok(kinds.every(Boolean), 'every arrival at an empty place is dealt one');
  // a place says which it may deal: a ferry has travellers and things dropped, never a beast…
  assert.deepEqual([...new Set(kinds)].sort(), ['find', 'riddle', 'trial'], 'the ferry deals what a ferry has — and a 抉择, which fits anywhere');
  // …a marsh has beasts, and a wandering beast is of this province: 蠪侄 of 凫丽山, never 夔 of 蓬莱
  const marsh = Array.from({ length: 30 }, (_, i) => must(move, { ...base, place: 'pengcheng' }, { place: 'peize' }, day(i)));
  assert.deepEqual([...new Set(marsh.map(d => d.result.place.meet.kind))].sort(), ['beast', 'find', 'trial']);
  assert.deepEqual([...new Set(marsh.filter(d => d.result.place.meet.kind === 'beast').map(d => d.result.place.meet.creature.id))].sort(), ['longzhi', 'wuzhiqi']);
  // with every beast of the province walking beside him, the next province's come over the road
  const tamedAll = marsh.map((_, i) => must(move, { ...base, place: 'pengcheng', cast: ['fuzhu', 'longzhi', 'wuzhiqi'] }, { place: 'peize' }, day(i)).result.place.meet);
  assert.ok(tamedAll.filter(m => m.kind === 'beast').every(m => ['paoxiao', 'jingwei', 'leishen', 'kui', 'tongtong'].includes(m.creature.id)));
  // a reload rerolls nothing, and to-and-fro is no farm
  const first = deals[0];
  assert.deepEqual(look(first.state, content, day(0)).place.meet, first.result.place.meet);
  // where the place has its own — a market, a haunt's beast not yet met — nothing is dealt on top
  assert.equal(must(move, base, { place: 'pengcheng' }, day(0)).result.place.meet, undefined);
  assert.equal(must(move, { ...base, cast: [] }, { place: 'sibei' }, day(0)).result.place.meet, undefined, '夫诸 is what is met at 泗水北岸');
  // a seed is an option, not an event: 吕梁洪 is dealt one, and 今日传闻 is still offered
  const seeded = must(move, { ...base, place: 'sibei' }, { place: 'lvliang' }, day(0));
  assert.ok(seeded.result.place.meet, 'a place with only a tale to begin is not an arrival by itself');
  assert.ok(seeded.result.director.choice.options.some(o => o.tale));
  // a place walked THROUGH is not an arrival: 泗水岸 → 圯桥 passes 淮水渡口
  const through = must(move, base, { place: 'yiqiao' }, day(0));
  assert.deepEqual(through.result.via.map(p => p.id), ['huaidu']);
  assert.deepEqual(Object.keys(through.state.meets.places), ['yiqiao']);

  // 拾遗: taken once, and gone
  const found = deals.find(d => d.result.place.meet.kind === 'find'), fd = day(deals.indexOf(found));
  const took = must(meet, found.state, { action: 'take' }, fd);
  assert.ok(took.result.took ? took.state.bag[took.result.took.id] === 1 : took.result.paid.wealth > 0);
  assert.equal(look(took.state, content, fd).place.meet, undefined);
  refused(meet, took.state, { action: 'take' }, 'nothing-here', fd);
  const back = must(move, must(move, took.state, { place: 'sishui' }, fd).state, { place: 'huaidu' }, fd);
  assert.equal(back.result.place.meet, undefined, 'the same place, the same day: just the place');

  // 路人问: the riddle is the question; wrong gives the hint and asks again; right pays and is never asked again
  const veiled = deals.find(d => d.result.place.meet.kind === 'riddle'), rd = day(deals.indexOf(veiled));
  // …but first the mist (his, 2026-09-22: 月黑风高…突然…然后webUI出现怪物卡): the
  // stage holds a veil, nothing is asked, and Ling is told to set the moment
  assert.equal(veiled.result.place.meet.veiled, true);
  const misty = look(veiled.state, content, rd);
  assert.deepEqual(misty.stage.map(c => c.card).filter(k => k === 'road'), ['road'], 'the one road card, in mist');
  assert.equal(misty.ask, null, 'nothing asked in the mist');
  assert.match(thenFor(veiled.result, null), /Meet \{action: reveal\}/);
  const asked = must(meet, veiled.state, { action: 'reveal' }, rd);
  assert.equal(asked.result.revealed, 'riddle');
  refused(meet, asked.state, { action: 'reveal' }, 'not-veiled', rd);
  assert.ok(!look(asked.state, content, rd).stage.some(c => c.card === 'road'), 'a riddle told is the chat\'s question');
  const q = askOf(content, asked.state, rd, asked.result);
  assert.equal(q.question, asked.result.meet.riddle);
  assert.deepEqual(q.options.at(-1), { label: '不答，赶路', meet: 'pass' });
  assert.match(tapThen(q, q.options[0].label), /Meet \{action: answer, answer: /);
  const key = asked.state.meets.places.huaidu.key, right = content.riddles.zh.riddles[key].a[0];
  const wrongChoice = content.riddles.zh.riddles[key].choices.find(c => !content.riddles.zh.riddles[key].a.includes(c));
  const wrong = meet(asked.state, content, rd, { action: 'answer', answer: wrongChoice });
  assert.equal(wrong.result.refused, 'wrong-answer');
  assert.ok(wrong.result.hint && !wrong.result.choices.includes(wrongChoice));
  const answered = must(meet, wrong.state, { action: 'answer', answer: right }, rd);
  assert.equal(answered.result.paid.progress, 20);
  assert.ok(answered.state.riddles_seen.includes(key));
  assert.ok(!askOf(content, answered.state, rd, answered.result).options.some(o => o.meet), 'answered, the roads are the question again');

  // 拦路: the beast stands like a haunt's own — the same card, the same fight
  const hidden = marsh.find(d => d.result.place.meet.kind === 'beast'), bd = day(marsh.indexOf(hidden));
  const cid = hidden.result.place.meet.creature.id;
  assert.equal(hidden.result.place.encounter, null, 'in the mist no beast stands yet');
  assert.ok(!look(hidden.state, content, bd).stage.some(c => c.card === 'duel'));
  const blocked = { state: must(meet, hidden.state, { action: 'reveal' }, bd).state };
  assert.equal(look(blocked.state, content, bd).place.encounter.game.id, `haunt:${cid}`);
  assert.notEqual(cid, 'fuzhu', 'never one that walks with him');
  assert.ok(look(blocked.state, content, bd).stage.some(c => c.card === 'duel' && c.id === `haunt:${cid}`));
  assert.equal(duel(blocked.state, content, bd, { id: `haunt:${cid}` }).result.ok, true, 'and the door opens');
});

test('「我该干点啥」: the rules name the nearest place with work, and the question leads with it', () => {
  // 2026-09-21: the errand handed in, the spine gated, the book holding only life's own — and nothing said where work was.
  const at = ctx({ now: new Date('2026-09-21T12:00:00') });
  const idle = { ...toOpenWorld(), place: 'lvliang', tier: 'core', bag: {}, quests: { 'xu-lvliang-look': { took: '2026-09-21', have: { 0: 1 }, done_at: '2026-09-21T13:27:00Z' } } };
  const seen = look(idle, content, at);
  assert.ok(seen.work && !seen.work.here && seen.work.roads >= 1 && seen.work.titles.length, 'work is somewhere he can walk');
  assert.deepEqual(seen.director.choice.options[0], { label: `${seen.work.place.name} · 有差事`, move: seen.work.place.id });
  assert.equal(seen.director.choice.options.filter(o => o.move === seen.work.place.id).length, 1, 'offered once, not twice');
  // standing where the work is, the offer card is the answer — no lead option
  const there = look({ ...idle, place: seen.work.place.id }, content, at);
  assert.equal(there.work.here, true);
  assert.ok(!there.director.choice?.options.some(o => /有差事/.test(o.label)));
  // a full book wants no more
  const full = { ...idle, quests: { ...idle.quests, a: { took: 'x', have: {} } } };
  for (const id of ['xu-elder-herb', 'xu-yunlong-herbs', 'xu-fuli-longzhi']) full.quests[id] = { took: '2026-09-21', have: {} };
  delete full.quests.a;
  assert.equal(look(full, content, at).work, undefined);
});

test('arriving is an event: the errand met there is told with what is seen, 交差 leads the question, and a tale a week old shuts nothing out', () => {
  // 2026-09-21: he reached 吕梁洪 for the fisherman's errand; the chat said a line and asked 何去何从.
  const at = ctx({ now: new Date('2026-09-21T12:00:00') });
  const base = { ...toOpenWorld(), place: 'sibei', tier: 'core', bag: {} };
  const took = must(quest, base, { action: 'take', id: 'xu-lvliang-look' }, at).state;
  const arrived = must(move, { ...took, place: 'sishui' }, { place: '吕梁洪' }, at);
  assert.deepEqual(arrived.result.met.map(m => m.id), ['xu-lvliang-look']);
  assert.match(arrived.result.met[0].seen, /披发而泅/, 'what the author put there is spoken on arrival');
  // met, it hands itself in (his pick, 2026-09-23): no 交差 is asked, the roads are
  assert.deepEqual(arrived.result.handed.map(h => h.id), ['xu-lvliang-look']);
  assert.ok(arrived.state.quests['xu-lvliang-look'].done_at);
  assert.ok(arrived.result.handed[0].paid.progress > 0);
  assert.ok(!askOf(content, arrived.state, at, arrived.result).options.some(o => o.turn));
  assert.deepEqual(look(arrived.state, content, at).handed.map(h => h.id), ['xu-lvliang-look'], 'the stage shows what it paid');
  // walking on puts the 所得 away, and coming back meets nothing new
  const away = must(move, arrived.state, { place: 'sibei' }, at);
  assert.equal(look(away.state, content, at).handed, undefined);
  const again = must(move, away.state, { place: 'lvliang' }, at);
  assert.equal(again.result.met, undefined);

  // today's rumor is offered here until one is made
  assert.ok(look(arrived.state, content, at).director.choice.options.some(o => o.tale), '今日传闻 is offered');
});

test('榜文: a market posts one templated 差事 a day — near, winnable, rebuilt from its id', () => {
  const base = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', bag: {}, cast: ['fuzhu'] };
  const days = Array.from({ length: 14 }, (_, i) => ctx({ now: new Date(2026, 8, 11 + i, 12) }));
  const posted = days.map(at => look(base, content, at).offers.filter(o => o.id.startsWith('daily-')));
  assert.ok(posted.every(p => p.length === 1), 'one a day, every day');
  assert.ok(new Set(posted.map(p => p[0].id.split('-').slice(2).join('-'))).size > 2, 'and the posting turns with the day');
  const NEAR = new Set(['sishui', 'sibei', 'yunlong', 'huaidu', 'peize', 'weishan', 'xushan', 'lvliang', 'sikou', 'yiqiao', 'siyuan']);
  for (const [o] of posted) {
    assert.doesNotMatch(o.id, /fuzhu|fuli|longzhi|pengcheng/, 'never a beast that walks with him, a place eight roads off, or the market itself');
    if (o.need[0].kind === 'visit') assert.ok(NEAR.has(o.id.split('-').pop()), o.id);
  }
  // away from a market there is no notice
  assert.ok(!(look({ ...base, place: 'sishui' }, content, days[0]).offers ?? []).some(o => o.id.startsWith('daily-')));

  // taken, it is gone from the board; the rules count it; it is handed in where he stands
  const [today] = posted[0], target = today.id.split('-').pop();
  assert.equal(quest(base, content, days[0], { action: 'take', id: today.id.replace(/\d{8}/, '20260101') }).result.refused, 'not-posted', 'only today\'s posting may be taken');
  const took = must(quest, base, { action: 'take', id: today.id }, days[0]);
  // taking one puts up the next, up to three a day at a market (2026-09-23)
  const second = (look(took.state, content, days[0]).offers ?? []).find(o => o.id.startsWith('daily-'));
  assert.ok(second && second.id !== today.id, 'the board posts the next');
  advance(content, took.state, today.need[0].kind === 'visit' ? { kind: 'visit', place: target } : { kind: 'subdue', creature: target });
  const turned = must(quest, { ...took.state, place: 'sishui' }, { action: 'turn', id: today.id }, days[0]);
  assert.ok(turned.result.paid.progress > 0);
  let board = { ...turned.state, place: 'pengcheng' };
  for (let i = 0; i < 2; i += 1) {
    const o = (look(board, content, days[0]).offers ?? []).find(x => x.id.startsWith('daily-'));
    if (!o) break;
    board = must(quest, board, { action: 'take', id: o.id }, days[0]).state;
  }
  assert.ok(!(look(board, content, days[0]).offers ?? []).some(o => o.id.startsWith('daily-')), 'three today, nothing more today');
  // tomorrow a new one — and taking it lets yesterday's leave the save
  const next = look({ ...turned.state, place: 'pengcheng' }, content, days[1]).offers.find(o => o.id.startsWith('daily-'));
  const again = must(quest, { ...turned.state, place: 'pengcheng' }, { action: 'take', id: next.id }, days[1]);
  assert.deepEqual(Object.keys(again.state.quests).filter(id => id.startsWith('daily-')), [next.id]);

  // taken one day, done the next: it rides the book overnight, the board posts
  // today's beside it, and it is still handed in (his save, 2026-09-21 → 22)
  const overnight = look(took.state, content, days[1]);
  assert.ok(overnight.book.some(b => b.id === today.id), 'yesterday\'s stays in the book');
  assert.ok(overnight.offers.some(o => o.id.startsWith('daily-') && o.id !== today.id), 'and today\'s is posted');
  const late = structuredClone(took.state);
  advance(content, late, today.need[0].kind === 'visit' ? { kind: 'visit', place: target } : { kind: 'subdue', creature: target });
  assert.ok(must(quest, late, { action: 'turn', id: today.id }, days[1]).result.paid.progress > 0, 'and paid a day late');
});

test('差事: taken at the giver, counted by the rules, handed in where he stands', () => {
  // 接 · 记 · 追 · 交 (design.md § 差事). His ruling 2026-09-18: 交差 never
  // sends the player back across the map.
  const base = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', bag: {} };
  const at = ctx();
  // nothing may be taken that is not offered here
  assert.equal(quest(base, content, at, { action: 'take', id: 'xu-fuli-longzhi' }).result.refused, 'not-yet', 'a chained errand waits for its first');
  assert.equal(quest({ ...base, place: 'sibei' }, content, at, { action: 'take', id: 'xu-elder-herb' }).result.refused, 'not-here');
  assert.equal(quest(base, content, at, { action: 'take', id: 'nope' }).result.refused, 'no-such-quest');

  const took = must(quest, base, { action: 'take', id: 'xu-elder-herb' }, at);
  assert.equal(took.result.book[0].id, 'xu-elder-herb');
  assert.deepEqual(took.result.book[0].need, [{ kind: 'carry', have: 0, n: 1 }], 'nothing carried yet');
  assert.equal(quest(took.state, content, at, { action: 'take', id: 'xu-elder-herb' }).result.refused, 'already-taken');
  // not done: the rules refuse and say what is left
  assert.equal(quest(took.state, content, at, { action: 'turn', id: 'xu-elder-herb' }).result.refused, 'not-done');

  // the count IS the bag for a carry — buy it and the line is ready
  const withHerb = { ...took.state, bag: { ...took.state.bag, lingzhi: 1 } };
  assert.equal(look(withHerb, content, at).book[0].ready, true);
  // …and it is handed in far from 彭城, which is the whole point
  const turned = must(quest, { ...withHerb, place: 'weishan' }, { action: 'turn', id: 'xu-elder-herb' }, at);
  assert.ok(turned.result.paid.progress > 0);
  assert.equal(turned.state.bag.lingzhi, undefined, 'the herb changed hands');
  assert.equal(turned.state.bag['bamboo-sword'], 1, 'and the sword came back');
  // the giver hands the next step over with it (his pick A, 2026-09-23)
  assert.deepEqual(turned.result.then, { id: 'xu-fuli-longzhi', title: '凫丽山的蠪侄', took: true, at: { id: 'pengcheng', name: '彭城' } });
  assert.deepEqual(turned.result.book.map(b => b.id), ['xu-fuli-longzhi'], 'the finished one leaves, the next is in hand');
  assert.equal(quest(turned.state, content, at, { action: 'turn', id: 'xu-elder-herb' }).result.refused, 'already-done');
  assert.ok(!(look({ ...turned.state, place: 'pengcheng' }, content, at).offers ?? []).some(o => o.id === 'xu-fuli-longzhi'), 'nothing left to take at the giver');

  // a beast subdued ticks its count, and nothing else does
  const hunting = structuredClone(turned.state);
  advance(content, hunting, { kind: 'subdue', creature: 'fuzhu' });
  assert.equal(look(hunting, content, at).book[0].need[0].have, 0, 'the wrong beast moves nothing');
  advance(content, hunting, { kind: 'subdue', creature: 'longzhi' });
  assert.equal(look(hunting, content, at).book[0].ready, true);

  // three at a time
  let full = { ...turned.state, place: 'sibei' };
  full = must(quest, full, { action: 'take', id: 'xu-lvliang-look' }, at).state;
  full = must(quest, { ...full, place: 'yunlong' }, { action: 'take', id: 'xu-yunlong-herbs' }, at).state;
  assert.equal(look(full, content, at).offers, undefined, 'a full book is offered nothing');
  // and one put down makes room
  const lighter = must(quest, full, { action: 'drop', id: 'xu-lvliang-look' }, at).state;
  assert.equal(look(lighter, content, at).book.length, 2);
  // a visit ticks by walking, not by saying so
  const walking = must(quest, { ...lighter, place: 'sibei' }, { action: 'take', id: 'xu-lvliang-look' }, at).state;
  const arrived = must(move, walking, { place: 'lvliang' }, at).state;
  assert.ok(arrived.quests['xu-lvliang-look'].done_at, 'and, met, hands itself in');
});

/* 伤势 (rules § 伤势): what a fight takes stays taken, mends on the 灵气 clock
   or with a pill, and below a quarter nobody walks in. */
/* Cut 2026-09-24 (redesign-v2 § 四): 伤势, the elite's own rules, 羁绊 · 谈心 · 疗伤. */
test('伤势 is gone: every fight begins whole, and a loss costs only the beast, gone for the day', () => {
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const l = look(base, content, c);
  assert.equal(l.health, undefined, 'no 气血 carried between fights');
  assert.equal(l.place.encounter.duel.health, undefined);
  const door = must(duel, base, { id: 'haunt:jingwei' }, c);
  assert.equal(door.result.duel.setup.you.wounds, undefined);
  assert.equal(door.state.fight.wounds, undefined);
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  assert.equal(begin(door.result.duel.setup, catalog).you.hp, hpMaxOf(base), 'whole at the door');
  const lost = fightOut(base, 'haunt:jingwei', { line: 'pass', c });
  assert.ok(['lost', 'withdrew'].includes(lost.result.outcome));
  assert.equal(lost.state.wounds, undefined, 'nothing carried out');
  assert.equal(lost.result.health, undefined);
  if (lost.result.outcome === 'lost') refused(duel, lost.state, { id: 'haunt:jingwei' }, 'withdrawn', c);
  // Nothing mends and nothing is tended: the verbs are gone, an old 回春丹 is goods.
  for (const v of ['tend', 'bond', 'journey', 'nourish', 'write']) assert.equal(VERBS[v], undefined, v);
  refused(trade, { ...base, bag: { 'mend-pill': 1 } }, { action: 'use', id: 'mend-pill' }, 'not-usable', c);
  assert.equal(must(trade, { ...toMarket(), bag: { 'mend-pill': 1 } }, { action: 'sell', id: 'mend-pill' }).state.bag['mend-pill'], undefined, 'it still sells');
});

test('精英 is its harder deck and nothing more: the same share of 气血, the same 体力, the same pay, one card', () => {
  const nov = ctx({ now: new Date('2026-11-05T10:00:00') });
  const base = { ...toOpenWorld(), chapter: '02-yan', scene: null, place: 'leize', tier: 'foundation', step: 0, progress: 0, stamina: 100, stamina_at: new Date('2026-11-05T10:00:00').toISOString() };
  const l = look(base, content, nov);
  assert.equal(l.place.encounter.creature.id, 'leishen');
  assert.equal(l.place.encounter.duel.creature.elite, true, 'still marked on its card: its deck is harder');
  const setup = l.place.encounter.duel.setup;
  assert.equal(setup.foe.elite, undefined, 'no rule of its own at the door');
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const plainAt = begin({ ...setup, foe: { ...setup.foe, deck: content.creatures.creatures.find(c => c.id === 'jingwei').deck } }, catalog).foe.hpMax;
  assert.equal(begin(setup, catalog).foe.hpMax, plainAt, 'the same share of 气血 as a plain beast');
  const door = must(duel, base, { id: 'haunt:leishen' }, nov);
  assert.equal(door.state.stamina, 100 - content.rewards.stamina.cost.duel, "a fight's 体力, no more");
  assert.equal(content.rewards.stamina.cost.elite, undefined);
  assert.equal(content.rewards.tables.elite, undefined);
  // A strong hand, so the win path runs: every card his five roots may hold,
  // its wood cards held back so a win has cards left to give.
  const all = content.cards.cards.filter(x => !x._token && x.element !== 'wood').map(x => x.id);
  const won = fightOut({ ...base, tier: 'core', traits: ['metal', 'wood', 'water', 'fire', 'earth'], cards: all }, 'haunt:leishen', { c: nov });
  assert.equal(won.result.outcome, 'won', JSON.stringify({ o: won.result.outcome, you: won.result.you?.hp, foe: won.result.foe?.hp, turns: won.result.turns }));
  assert.equal(won.result.elite, undefined);
  assert.equal(won.result.paid.wealth, content.rewards.tables.haunt.wealth, 'a haunt\'s pay');
  assert.equal(won.result.dropped.filter(d => d.card).length, 1, JSON.stringify(won.result.dropped));
});

test('银月 beside him: no score, no 谈心 or 疗伤 — her card stands taller as the chapters end', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const alone = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  assert.equal(look(alone, content, c).companion, null);
  const her = { ...alone, companion: { joined: '2026-10-01' }, cards: [...(alone.cards ?? []), 'yinyue'], ended: ['00-prologue', '01-ji', '02-yan'] };
  const seen = look(her, content, c).companion;
  assert.equal(seen.bond, undefined, 'no relationship score is shown');
  assert.equal(seen.tended, undefined); assert.equal(seen.journey, undefined);
  assert.ok(Array.isArray(seen.recalled), 'how close she is shows in what she has recalled');
  // a gift she wears grows nothing but her card
  const gifted = must(trade, { ...her, bag: { ...her.bag, 'moon-bell': 1 } }, { action: 'use', id: 'moon-bell' }, c);
  assert.equal(gifted.result.bond, undefined);
  // her card by the story: the chapters ended (rewards.json bond.lifts), locked at the door
  const jingwei = content.creatures.creatures.find(x => x.id === 'jingwei');
  const at = n => fightSetup(content, { ...her, ended: Array.from({ length: n }, (_, i) => `c${i}`) }, jingwei, c.now).you.lifts;
  assert.equal(at(3), undefined);
  assert.deepEqual(at(4), { yinyue: { atk: 0, hp: 1 } });
  assert.deepEqual(at(5), { yinyue: { atk: 0, hp: 2 } });
  assert.deepEqual(at(7), { yinyue: { atk: 1, hp: 1 } });
  // what she wears lifts her card too: 齐纨 +1 气血
  const silk = { ...her, ended: Array.from({ length: 7 }, (_, i) => `c${i}`), bag: { ...her.bag, 'qi-silk': 1 }, wear: { ...her.wear, yinyue: 'qi-silk' } };
  assert.deepEqual(fightSetup(content, silk, jingwei, c.now).you.lifts, { yinyue: { atk: 1, hp: 2 } });
  const { 'qi-silk': _gone, ...sold } = silk.bag;
  assert.deepEqual(fightSetup(content, { ...silk, bag: sold }, jingwei, c.now).you.lifts, { yinyue: { atk: 1, hp: 1 } }, 'sold, it lifts nothing');
  // before she walks with him, nothing lifts
  assert.equal(fightSetup(content, { ...alone, ended: silk.ended }, jingwei, c.now).you.lifts, undefined);
});

/* 抉择 (rules § 抉择): Ling writes the ways, the rules threw the dice first. */
test('抉择: the dice are thrown when it is dealt and never shown; Ling\'s ways are held to the shape', () => {
  const base = { ...toOpenWorld(), place: 'sishui', tier: 'core', bag: {}, cast: ['fuzhu'], name: '清玄', wealth: 50 };
  const day = i => ctx({ now: new Date(2026, 9, 1 + i, 12) });
  const dealt = Array.from({ length: 30 }, (_, i) => ({ i, d: must(move, base, { place: 'huaidu' }, day(i)) })).find(x => x.d.result.place.meet?.kind === 'trial');
  assert.ok(dealt, 'a 抉择 is dealt within a month of arrivals');
  const c = day(dealt.i), s = dealt.d.state;
  const held = s.meets.places.huaidu;
  assert.equal(held.rolls.length, content.meets.trial.options.max);
  assert.ok(held.rolls.every(r => r >= 1 && r <= 20));
  assert.ok(!JSON.stringify(look(s, content, c).place.meet).includes('rolls'), 'Look never carries the dice');
  const ways = [
    { label: '涉水而过', difficulty: 'hard', stake: 'wound', win: '水冷刺骨，你还是过来了。', lose: '一脚踩空，被急流卷出三丈。' },
    { label: '等船家', difficulty: 'easy', stake: 'coin', win: '船家收了你两个铜板。', lose: '船家趁机多要了价。' },
  ];
  refused(meet, s, { action: 'choose', n: 0 }, 'not-offered', c);
  assert.match(refused(meet, s, { action: 'offer', options: JSON.stringify([ways[0]]) }, 'not-playable', c).why, /2–3/);
  assert.match(refused(meet, s, { action: 'offer', options: JSON.stringify([ways[0], { ...ways[0], label: '再涉' }]) }, 'not-playable', c).why, /same difficulty/);
  assert.match(refused(meet, s, { action: 'offer', options: JSON.stringify([ways[0], { ...ways[1], stake: 'soul' }]) }, 'not-playable', c).why, /stake/);
  assert.match(refused(meet, s, { action: 'offer', options: 'not json' }, 'not-playable', c).why, /JSON/);
  const offered = must(meet, s, { action: 'offer', options: JSON.stringify(ways) }, c);
  const shown = offered.result.meet.options;
  assert.deepEqual(shown.map(o => [o.label, o.difficulty, o.stake]), [['涉水而过', 'hard', 'wound'], ['等船家', 'easy', 'coin']]);
  assert.ok(shown.every(o => o.chance > 0 && o.chance <= 100 && o.win === undefined && o.lose === undefined), 'the odds, never the outcomes');
  assert.equal(look(offered.state, content, c).place.meet.veiled, undefined, 'offering lifts the mist');
  refused(meet, offered.state, { action: 'offer', options: JSON.stringify(ways) }, 'already-offered', c);
  refused(meet, offered.state, { action: 'choose', n: 5 }, 'no-such-way', c);
});

test('抉择: the roll settles it — what was won or lost is the rules\', the words are Ling\'s', () => {
  const c = ctx({ now: new Date(2026, 9, 3, 12) });
  const day = dayKey(c.now);
  const base = { ...toOpenWorld(), place: 'huaidu', tier: 'core', bag: {}, name: '清玄', wealth: 50 };
  const ways = [
    { label: '涉水', difficulty: 'hard', stake: 'wound', win: '过来了。', lose: '被卷走了。' },
    { label: '等船', difficulty: 'easy', stake: 'coin', win: '上了船。', lose: '多给了钱。' },
  ];
  const at = (rolls, extra = {}) => ({ ...base, ...extra, meets: { day, places: { huaidu: { kind: 'trial', rolls, options: ways, companion: Boolean(extra.companion) } } } });
  const won = must(meet, at([15, 1, 1]), { action: 'choose', n: 0 }, c);
  assert.deepEqual([won.result.success, won.result.line], [true, '过来了。']);
  assert.ok(won.result.paid.progress > 0);
  // A wound on the road is 体力 now (伤势 was cut): the share of the pool, after the way's own cost.
  const full = { stamina: 100, stamina_at: c.now.toISOString() };
  const hurt = must(meet, at([14, 1, 1], full), { action: 'choose', n: 0 }, c);
  assert.deepEqual([hurt.result.success, hurt.result.line], [false, '被卷走了。']);
  const wound = Math.ceil(content.rewards.stamina.max * content.meets.trial.lose.wound.hard);
  assert.equal(hurt.result.lost.stamina, wound);
  assert.equal(hurt.state.stamina, 100 - content.rewards.stamina.cost.trial - wound);
  assert.equal(hurt.state.wounds, undefined);
  // near empty already: it takes only what was left, and he rests
  const worn = must(meet, at([14, 1, 1], { stamina: 5, stamina_at: c.now.toISOString() }), { action: 'choose', n: 0 }, c);
  assert.deepEqual([worn.state.stamina, worn.result.lost.stamina, worn.state.resting], [0, 2, true]);
  const poorer = must(meet, at([1, 5, 1]), { action: 'choose', n: 1 }, c);
  assert.deepEqual([poorer.result.success, poorer.result.lost.wealth, poorer.state.wealth], [false, 5, 45]);
  // 银月 at his side: +2 — a 13 now reaches the hard mark of 15
  const beside = must(meet, at([13, 1, 1], { companion: { joined: '2026-10-01' } }), { action: 'choose', n: 0 }, c);
  assert.equal(beside.result.success, true);
  refused(meet, beside.state, { action: 'choose', n: 0 }, 'nothing-here', c);
  // mist lifted with no ways written: it passes, nothing is owed
  const bare = { ...base, meets: { day, places: { huaidu: { kind: 'trial', rolls: [1, 1, 1], veiled: true } } } };
  const lifted = must(meet, bare, { action: 'reveal' }, c);
  assert.equal(lifted.result.revealed, 'nothing');
  assert.equal(look(lifted.state, content, c).place.meet, undefined);
});

test('望气术: two scrolls, learned in order at their realms; the fight knows how far you read', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'qi', step: 0, progress: 0 };
  const bag = ids => ({ ...base.bag, ...Object.fromEntries(ids.map(id => [id, 1])) });
  assert.match(refused(trade, { ...base, bag: bag(['wangqi-1']) }, { action: 'use', id: 'wangqi-1' }, 'needs-tier', c).say, /筑基/);
  refused(trade, { ...base, tier: 'core', bag: bag(['wangqi-2']) }, { action: 'use', id: 'wangqi-2' }, 'needs-before', c);
  const one = must(trade, { ...base, tier: 'foundation', bag: bag(['wangqi-1']) }, { action: 'use', id: 'wangqi-1' }, c);
  assert.equal(one.state.insight, 1);
  assert.equal(one.state.bag['wangqi-1'], undefined);
  refused(trade, { ...one.state, bag: bag(['wangqi-1']) }, { action: 'use', id: 'wangqi-1' }, 'already-known', c);
  const jingwei = content.creatures.creatures.find(x => x.id === 'jingwei');
  assert.equal(fightSetup(content, base, jingwei, c.now).you.insight, undefined);
  assert.equal(fightSetup(content, one.state, jingwei, c.now).you.insight, 1);
  const two = must(trade, { ...one.state, tier: 'core', bag: bag(['wangqi-2']) }, { action: 'use', id: 'wangqi-2' }, c);
  assert.equal(two.state.insight, 2);
  assert.deepEqual(two.result.learned, { id: 'wangqi', level: 2 });
});

test('forLing: Ling gets the reading without the page\'s drawing data — the map\'s places and a shelf\'s pictures', async () => {
  const { forLing } = await import('../scripts/rules.mjs');
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const s = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'pengcheng', tier: 'core' };
  const full = look(s, content, c);
  assert.ok(full.place.places.length && full.place.shelf[0].art, 'the page gets it all');
  const slim = forLing(full);
  assert.equal(slim.place.places, undefined);
  // SKILL.md tells a thing from the shelf's `about` and `effect` (its root) and
  // speaks only the shelf's prices — all of that stays; only the picture goes
  const { art, ...kept } = full.place.shelf[0];
  assert.deepEqual(slim.place.shelf[0], kept);
  for (const k of ['about', 'effect', 'buy', 'sell', 'kind', 'held']) assert.ok(k in slim.place.shelf[0], k);
  assert.equal(slim.place.shelf[0].art, undefined);
  assert.deepEqual(slim.place.roads, full.place.roads, 'the roads stay — they are how she walks');
  assert.equal(slim.book?.length, full.book?.length);
  assert.ok(JSON.stringify(slim).length < JSON.stringify(full).length * 0.75);
});

/* The door holds the whole setup (rules § 降妖): what changes on the save
   while a fight is open — a bond threshold crossed, a scroll learned, a
   问斗法 cast, an hour of mending — does not reach the settle. */
test('降妖: the settle replays the fight the door set up, whatever changed on the save meanwhile', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const jingwei = content.creatures.creatures.find(x => x.id === 'jingwei');
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const her = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, companion: { joined: '2026-10-01' }, cards: [...(toOpenWorld().cards ?? []), 'yinyue'] };
  const meanwhile = st => ({ ...st, ended: ['00-prologue', '01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-x'], insight: 2 });
  const out = fightOut(her, 'haunt:jingwei', { c, between: meanwhile });
  const door = out.started.result.duel.setup;
  assert.deepEqual(out.started.state.fight.setup, door, 'kept on the save at the door');
  assert.equal(door.you.lifts, undefined);
  assert.equal(door.you.insight, undefined);
  const live = fightSetup(content, meanwhile(out.started.state), jingwei, c.now);
  assert.ok(live.you.lifts && live.you.insight === 2, 'the save did change');
  assert.deepEqual(fightSetup(content, meanwhile(out.started.state), jingwei, c.now, 'haunt:jingwei'), door, 'the open fight reads the door');
  const replay = battle(out.actions, door, catalog);
  assert.equal(out.result.outcome ?? out.state.duels.jingwei.outcome, replay.outcome);
  assert.equal(out.state.duels.jingwei.outcome, replay.outcome);
  // an older save's open fight, kept before the setup was: the live reading
  const old = { ...out.started.state, fight: { ...out.started.state.fight, setup: undefined } };
  delete old.fight.setup;
  const settled = must(duel, old, { id: 'haunt:jingwei', picks: out.actions.join(',') }, c);
  assert.equal(settled.state.duels.jingwei.outcome, replay.outcome);
  assert.equal(settled.state.fight, undefined);
  // and it takes the setup on resume
  assert.deepEqual(must(duel, old, { id: 'haunt:jingwei' }, c).state.fight.setup, door);
});

test('降妖: a fight open on another creature lends nothing to this one', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const jingwei = content.creatures.creatures.find(x => x.id === 'jingwei');
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  const other = { ...base, fight: { game: 'haunt:other', creature: 'other', at: c.now.toISOString(), setup: { mode: 'pve', you: { wounds: 30 } } } };
  const mine = fightSetup(content, other, jingwei, c.now, 'haunt:jingwei');
  assert.equal(mine.you.wounds, undefined, 'not the other fight\'s door');
  assert.ok(mine.foe, 'nor its setup');
  assert.deepEqual(fightSetup(content, other, jingwei, c.now), mine, 'no game named, no door read');
});

/* What the page tells her of a fight says what the page measured: the low
   moment fires at a quarter of 气血, so it cannot say 一成多. */
test('降妖: the low-气血 word to 银月 matches the quarter it fires at', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const low = src.match(/st\.you\.hp \* 4 <= st\.you\.hpMax[\s\S]{0,200}?tellYinyue\('hurt', `([^`]*)`, `([^`]*)`\)/);
  assert.ok(low, 'the low moment is a quarter');
  assert.match(low[1], /不到三成/);
  assert.match(low[2], /quarter/);
});

/* 机缘 is one kind of 路上 (rules/road.mjs): set once a day, near, for a few
   real hours; arriving there in time, it is that arrival's one thing. */
test('路上 · 机缘: dealt once a day within two roads; arriving in time it is the one thing met there, veiled, then 收下 — late, it is gone', () => {
  const at = h => ctx({ now: new Date(new Date('2026-10-05T09:00:00').getTime() + h * 3600000) });
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'pengcheng', tier: 'core', wealth: 0 };
  const woke = VERBS.look(base, content, at(0));
  const c = woke.state.chance;
  assert.ok(c && c.place !== 'pengcheng', 'a 机缘 somewhere else');
  const near = new Set(Object.values(content.places).flatMap(d => d.places).filter(p => p.id === 'pengcheng').flatMap(p => p.roads));
  const two = new Set([...near, ...Object.values(content.places).flatMap(d => d.places).filter(p => near.has(p.id)).flatMap(p => p.roads)]);
  assert.ok(two.has(c.place), 'within two roads');
  assert.equal(new Date(c.until) - at(0).now, 3 * 3600000);
  assert.equal(VERBS.look(woke.state, content, at(1)).state, null, 'once a day');
  const brief = look(woke.state, content, at(1)).chance;
  assert.deepEqual([brief.place.id, brief.minutes_left, brief.here], [c.place, 120, undefined]);
  assert.equal(VERBS.chance, undefined, 'no verb of its own: Meet answers it');
  refused(meet, woke.state, { action: 'take' }, 'nothing-here', at(1));
  // Arriving there in time: the 机缘 is what is met, veiled like any 路上 — and nothing else on top.
  const arrived = must(move, { ...woke.state, stamina: 100, stamina_at: at(1).now.toISOString() }, { place: c.place }, at(1));
  assert.deepEqual(arrived.result.place.meet, { kind: 'chance', place: { id: c.place, name: arrived.result.place.name }, until: c.until, minutes_left: 120, here: true, veiled: true });
  assert.equal(arrived.result.chance, undefined, 'one book: the arrival says it as its meet');
  assert.deepEqual(look(arrived.state, content, at(1)).stage.filter(x => x.card === 'road'), [{ card: 'road' }], 'one road card');
  const told = must(meet, arrived.state, { action: 'reveal' }, at(1));
  assert.equal(told.result.revealed, 'chance');
  const took = must(meet, told.state, { action: 'take' }, at(1));
  assert.ok(took.result.paid.wealth > 0);
  assert.ok(took.result.card?.card, 'a card he did not hold');
  assert.equal(took.result.chance, true);
  assert.equal(look(took.state, content, at(1)).chance.taken, true);
  assert.equal(look(took.state, content, at(1)).place.meet, undefined);
  refused(meet, took.state, { action: 'take' }, 'nothing-here', at(1));
  // Late: gone, whatever the road — the same refusal vocabulary as any 路上.
  assert.equal(look(woke.state, content, at(4)).chance.missed, true);
  assert.match(refused(meet, told.state, { action: 'take' }, 'gone', at(4)).say, /来迟了/);
  assert.deepEqual(look(told.state, content, at(4)).stage.filter(x => x.card === 'road'), [], 'missed, the card goes');
  // Stood on without walking there (a scene walked him, a save from before 路上): Look meets it.
  const standing = VERBS.look({ ...woke.state, place: c.place }, content, at(1));
  assert.equal(standing.state.meets.places[c.place].kind, 'chance');
  // tomorrow: a new one
  assert.ok(VERBS.look(took.state, content, at(24)).state.chance.day !== c.day);
});

test('机缘: not before the roots, and never in a made world', () => {
  const c = ctx({ now: new Date('2026-10-05T09:00:00') });
  assert.equal(wake({ ...toOpenWorld(), traits: [], chance: undefined }, content, c)?.chance, undefined);
});

/* 历练 (rules § 历练): she goes out for real hours; away, she is not at his
   side; back, she brings what those roads give. */
test('问候: once a day, hers — the facts of yesterday and today, in the player’s language', () => {
  const c = ctx({ now: new Date('2026-10-06T09:00:00') });
  const base = { ...toOpenWorld(), place: 'pengcheng', companion: { joined: '2026-10-01' }, chance: DEALT,
    duels: { leishen: { day: '2026-10-05', outcome: 'lost' }, kui: { day: '2026-10-01', outcome: 'won' } } };
  refused(greet, { ...base, companion: null }, {}, 'no-companion', c);
  const g = must(greet, { ...base, greeted: '2026-10-05' }, {}, c);
  assert.equal(g.result.first, true);
  assert.ok(g.result.facts.includes('玩家上次来是昨天'), 'she knows it was yesterday');
  assert.ok(must(greet, { ...base, greeted: '2026-09-26' }, {}, c).result.facts.includes('玩家上次来是10 天前'));
  assert.ok(g.result.facts.some(f => f.includes('昨天输给了雷神')), "yesterday's fight");
  assert.ok(!g.result.facts.some(f => f.includes('夔')), 'not an older one');
  assert.ok(!g.result.facts.some(f => /伤|羁绊|历练/.test(f)), 'no wound, no bond, no journey: cut');
  assert.equal(g.state.greeted, '2026-10-06');
  const again = VERBS.greet(g.state, content, c);
  assert.deepEqual([again.state, again.result.first], [null, false], 'once a day');
});

/* 组牌 (rules § 组牌): he picks the ten from 结丹 on; the rules fill what he leaves. */
test('组牌: before 结丹 the roots deal the ten, and a pick kept from before waits unread', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const all = content.cards.cards.filter(x => !x._token && x.id !== 'yinyue').map(x => x.id);
  const early = { ...toOpenWorld(), tier: 'foundation', traits: ['wood', 'water', 'fire', 'earth'], cards: all };
  const dealt = deckFor(content, early);
  assert.equal(refused(deck, early, { action: 'toggle', id: dealt[0] }, 'needs-tier', c).tier, 'core');
  const kept = { ...early, deck: [dealt[1]], deck_out: [dealt[0]] };
  assert.deepEqual(deckFor(content, kept), dealt, 'a pick from before the rule is not read before 结丹');
  const g = VERBS.gear(kept, content, c).result.gear;
  assert.equal(g.can_pick, undefined); assert.equal(g.picking, undefined);
  assert.ok(!g.cards.some(x => x.picked || x.fill), 'the panel shows the ten dealt, nothing to pick');
  // At 结丹 the same pick is his again.
  assert.equal(deckFor(content, { ...kept, tier: 'core' })[0], dealt[1]);
  assert.equal(VERBS.gear({ ...kept, tier: 'core' }, content, c).result.gear.can_pick, true);
});

test('组牌: a tap puts a card in or takes it out, ten at most, the rest filled by the roots — and 自动 gives it back', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const open = toOpenWorld();
  const all = content.cards.cards.filter(x => !x._token && x.id !== 'yinyue').map(x => x.id);
  const base = { ...open, tier: 'core', traits: ['wood', 'water', 'fire', 'earth'], cards: all };
  const dealt = deckFor(content, base);
  assert.equal(dealt.length, 10);
  const out = must(deck, base, { action: 'toggle', id: dealt[0] }, c);
  assert.equal(out.state.deck.length, 9, 'the first tap starts from the ten he was dealt');
  assert.ok(!out.state.deck.includes(dealt[0]));
  const now = deckFor(content, out.state);
  assert.equal(now.length, 10, 'under ten, the roots fill the rest');
  assert.ok(!now.includes(dealt[0]), 'but never with a card he took out');
  assert.ok(now.slice(0, 9).every(id => out.state.deck.includes(id)), 'his picks first');
  refused(deck, base, { action: 'toggle', id: all.find(id => !dealt.includes(id) && content.cards.cards.find(x => x.id === id).kind !== 'spell') }, 'deck-full', c);
  refused(deck, base, { action: 'toggle', id: 'yinyue' }, 'not-held', c);
  const metal = content.cards.cards.find(x => x.kind === 'spell' && x.element === 'metal').id;
  refused(deck, base, { action: 'toggle', id: metal }, 'off-root', c);
  const outsider = all.find(id => !now.includes(id) && content.cards.cards.find(x => x.id === id).element !== 'metal');
  const back = must(deck, out.state, { action: 'toggle', id: outsider }, c);
  assert.ok(deckFor(content, back.state).includes(outsider));
  assert.ok(back.result.gear.cards.find(x => x.id === outsider).picked);
  // a filled card tapped becomes his, it is not thrown out
  const two = must(deck, out.state, { action: 'toggle', id: dealt[1] }, c);
  const filled = two.result.gear.cards.filter(x => x.fill);
  assert.equal(filled.length, 2, 'eight picked: two dashed, filled by the roots');
  assert.ok(!filled.some(x => x.id === dealt[0] || x.id === dealt[1]), 'never what he took out');
  const kept = must(deck, two.state, { action: 'toggle', id: filled[0].id }, c);
  assert.ok(kept.result.gear.cards.find(x => x.id === filled[0].id).picked, 'a tap on a dashed card keeps it');
  assert.equal(kept.state.deck.length, 9);
  assert.equal(back.result.gear.picking, true);
  const auto = must(deck, back.state, { action: 'auto' }, c);
  assert.equal(auto.state.deck, undefined);
  assert.deepEqual(deckFor(content, auto.state), dealt);
  // the fight deals what he picked
  const jingwei = content.creatures.creatures.find(x => x.id === 'jingwei');
  assert.ok(fightSetup(content, back.state, jingwei, c.now).you.deck.includes(outsider));
});

// 云龙山的八味 asks a pill of alchemy-first, done once in the story: the
// errand reopens the furnace, the win pays the errand and not the task again,
// and once met the board is shut (his, 2026-09-23: 没触发差事).
test('an errand reopens a board already done, and pays only the errand', () => {
  const s = { ...start(), place: 'yunlong',
    tasks: { 'alchemy-first': { status: 'done', period: 'once', done_at: '2026-09-01T10:00:00Z' } },
    quests: { 'xu-yunlong-herbs': { took: '2026-09-10', have: {} } } };
  const listed = must(task, s, { action: 'list' }).result.tasks.find(t => t.id === 'alchemy-first');
  assert.equal(listed?.status, 'offered');
  assert.equal(listed.for_errand, true);
  assert.equal(listed.pays, null, 'the errand pays, not the task');
  const won = must(win, s, { id: 'alchemy-first' });
  const done = must(task, won.state, { action: 'done', id: 'alchemy-first' });
  assert.equal(done.result.for, 'errand');
  assert.equal(done.result.line, undefined, 'no 「还剩一株灵芝」 — none is given');
  assert.equal(done.state.bag.lingzhi ?? 0, s.bag.lingzhi ?? 0, 'no second task grant');
  assert.equal(done.state.quests['xu-yunlong-herbs'].have[0], 1);
  // met, the errand hands itself in: its own pay, and the pill
  assert.ok(done.state.quests['xu-yunlong-herbs'].done_at);
  assert.deepEqual(done.result.handed.map(h => h.id), ['xu-yunlong-herbs']);
  assert.equal(done.state.bag['qi-pill'], (s.bag['qi-pill'] ?? 0) + 1);
  assert.equal(must(task, done.state, { action: 'list' }).result.tasks.some(t => t.id === 'alchemy-first'), false, 'met, the board is shut');
  refused(win, done.state, { id: 'alchemy-first' }, 'not-here');
});

// His Chinese game turned English three times on 2026-09-23, each right after
// a page report (`[HIDDEN] [scene] won …`): a machine's line is never the
// player's language, and a language he chose stays chosen.
test('language: machine lines never turn it, and a chosen one holds against words', () => {
  for (const line of ['[HIDDEN] [scene] won alchemy-first', '[scene] meet taken', '[HIDDEN] [scene] opened']) assert.equal(langOf(line), null, line);
  const s = { ...start('zh') };
  assert.equal(heed(s, 'ok go north').lang, 'en', 'unchosen, his words still lead');
  const chosen = must(lang, s, { lang: 'zh' }).state;
  assert.equal(chosen.lang_set, true);
  assert.equal(heed(chosen, 'ok go north').lang, 'zh', 'chosen, words never turn it');
  assert.equal(must(lang, chosen, { lang: 'en' }).state.lang, 'en', 'the toggle still does');
  const guessed = must(lang, s, { lang: 'en', auto: true }).state;
  assert.equal(guessed.lang_set, false, 'a new game\'s guess from the machine is not a choice');
});

// He fed 蠪侄 its 人参 for 凫丽山的蠪侄 (a 降), and the errand stood at 0/1
// with the fight gone: won over either way, it counts (his, 2026-09-23).
test('a beast tamed meets an errand that asked for it subdued', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'fuli', tier: 'core', quests: { 'xu-fuli-longzhi': { took: '2026-09-11', have: {} } } };
  assert.equal(look(s, content, at).book[0].ready, false);
  assert.equal(look({ ...s, cast: [...s.cast, 'longzhi'] }, content, at).book[0].ready, true, 'a save tamed before this counts too');
  const likes = look(s, content, at).place.encounter.likes.id;
  const fed = must(tame, { ...s, wins: { 'haunt:longzhi': at.now.toISOString() }, bag: { ...s.bag, [likes]: 1 } }, { creature: 'longzhi' }, at);
  assert.deepEqual(fed.result.handed.map(h => h.id), ['xu-fuli-longzhi'], 'and hands itself in');
});

// His 聚气丹 on 2026-09-23 went for +0 on a "full" day — no day is full now.
test('a pill pays whatever the day has already paid', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), bag: { 'qi-pill': 1 }, day: { key: dayKey(NOW), progress: 240, wealth: 60, branches: 0 } };
  const took = must(trade, s, { action: 'use', id: 'qi-pill' }, at);
  assert.ok(took.result.paid.progress > 0);
  assert.equal(took.state.bag['qi-pill'], undefined);
});

// 体力 is the only limit (2026-09-23): the road costs by the road, a fight, a
// choice and a taming; a spent pool stops walking. An elite costs a fight's.
test('体力: walking costs by the road, an elite no more than a fight; empty, the road waits', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', stamina: 100, stamina_at: NOW.toISOString() };
  const one = must(move, s, { place: 'sishui' }, at);
  const cost = content.rewards.stamina.cost;
  const roads = (r) => 1 + (r.result.via ?? []).length;
  const trip = (n) => Math.min(cost.move.max, cost.move.base + (n - 1) * cost.move.per_road);
  assert.equal(one.state.stamina, 100 - trip(roads(one)), 'a trip costs its 体力');
  const far = must(move, s, { place: 'lvliang' }, at);
  assert.equal(far.state.stamina, 100 - trip(roads(far)));
  assert.ok(roads(far) > roads(one), 'further is dearer');
  assert.equal(trip(7), cost.move.max, 'seven roads cost no more than the cap');
  assert.equal(must(move, { ...s, stamina: 1 }, { place: 'sishui' }, at).state.stamina, 0, 'the last point walks him there');
  refused(move, { ...s, stamina: 0 }, { place: 'sishui' }, 'no-stamina', at);
  assert.equal(cost.elite, undefined, 'an elite is a fight like any other');
  assert.equal(cost.shop, 0);
});

// The mini-games had no way in (2026-09-23): a place hosts its game, open there
// once a day, won through the same `win` as 炼丹, paid by the task; a market's
// notice may ask for a nearby place's game.
test('a place\'s game is no daily chore: it opens there only for an errand that asks for it, and the errand pays', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'yunlong', tier: 'core', stamina: 100, stamina_at: NOW.toISOString() };
  // No errand asks: the game is not on offer, not even once a day (redesign-v2 § 四).
  assert.equal(look(s, content, at).tasks.find(t => t.id === 'luoshu'), undefined);
  refused(win, s, { id: 'luoshu' }, 'not-here', at);
  // A market's notice asks for it here: now it stands, for the errand.
  const asked = { ...s, quests: { 'daily-20260911-trial-yunlong': { took: '2026-09-11', have: {} } } };
  const seen = look(asked, content, at).tasks.find(t => t.id === 'luoshu');
  assert.equal(seen?.status, 'offered');
  assert.deepEqual([seen.game, seen.level, seen.for_errand, seen.pays], ['luoshu', 2, true, null], '结丹 plays level 2; the errand pays');
  refused(win, { ...asked, place: 'sishui' }, { id: 'luoshu' }, 'not-here', at);
  const won = must(win, asked, { id: 'luoshu' }, at);
  const done = must(task, won.state, { action: 'done', id: 'luoshu' }, at);
  assert.equal(done.result.paid, null, 'the game pays nothing of its own');
  assert.deepEqual(done.result.handed.map(h => h.id), ['daily-20260911-trial-yunlong']);
  assert.ok(done.result.handed[0].paid.progress > 0, 'the notice pays');
  assert.equal(done.state.stamina, 100 - content.rewards.stamina.cost.game, 'a game\'s 体力');
  assert.equal(look(done.state, content, at).tasks.find(t => t.id === 'luoshu'), undefined, 'met, it is gone');
  const tomorrow = ctx({ now: new Date(NOW.getTime() + 86400000) });
  assert.equal(look(done.state, content, tomorrow).tasks.find(t => t.id === 'luoshu'), undefined, 'and not back tomorrow by itself');
});

test('a market notice can ask for a nearby place\'s game, and a win there meets it', () => {
  const base = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', bag: {}, cast: ['fuzhu', 'paoxiao', 'longzhi'] };
  const days = Array.from({ length: 30 }, (_, i) => ctx({ now: new Date(2026, 8, 1 + i, 12) }));
  let found = null;
  for (const d of days) {
    let s = base;
    for (let k = 0; k < 3 && !found; k += 1) {
      const o = (look(s, content, d).offers ?? []).find(x => x.id.startsWith('daily-'));
      if (!o) break;
      if (o.id.includes('-trial-')) found = { o, d, s };
      else s = must(quest, s, { action: 'take', id: o.id }, d).state;
    }
    if (found) break;
  }
  assert.ok(found, 'within a month a market posts a game notice');
  assert.match(found.o.title, /榜文 · 去.+：.+/);
  assert.equal(found.o.need[0].kind, 'board');
});

// 论道 at 稷下: the rules deal and check the form, Ling judges the meaning.
test('论道: dealt at 稷下 when a notice asks for it, the form checked by the rules, three good answers win — and the notice pays', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'jixia', tier: 'core', quests: { 'daily-20260911-trial-jixia': { took: '2026-09-11', have: {} } } };
  refused(VERBS.lundao, { ...s, quests: {} }, { action: 'open' }, 'not-here', at);
  refused(VERBS.lundao, { ...s, place: 'linzi' }, { action: 'open' }, 'not-here', at);
  const open = must(VERBS.lundao, s, { action: 'open' }, at);
  const l = open.state.lundao;
  assert.ok(['feihua', 'chengyu', 'duilian'].includes(l.game));
  assert.deepEqual(look(open.state, content, at).lundao.game, l.game, 'Look carries it');
  // a good answer by form, for whichever game was dealt
  const goodFor = (st) => {
    const x = st.lundao;
    if (x.game === 'feihua') return `${x.prompt}落乌啼霜满天`.slice(0, 7);
    if (x.game === 'duilian') return '甲'.repeat([...x.prompt].length);
    return [...x.last].at(-1) + '天动地';
  };
  const bad = must(VERBS.lundao, open.state, { action: 'turn', answer: 'xyz', ok: 'true' }, at);
  assert.equal(bad.result.good, false);
  assert.ok(bad.result.form, 'the rules name the form it broke');
  let st = bad.state;
  for (let i = 0; i < 3; i += 1) {
    const r = must(VERBS.lundao, st, { action: 'turn', answer: goodFor(st) + (i ? String(i) : ''), ok: 'true' }, at);
    st = r.state;
    if (i === 2) {
      assert.equal(r.result.lundao.outcome, 'won');
      assert.ok(r.result.paid.progress > 0, 'the notice\'s pay');
      assert.deepEqual(r.result.handed.map(h => h.id), ['daily-20260911-trial-jixia']);
    }
  }
  refused(VERBS.lundao, st, { action: 'open' }, 'not-here', at);
  // Ling's judgement counts: form right, meaning wrong, is a miss
  const judged = must(VERBS.lundao, open.state, { action: 'turn', answer: goodFor(open.state), ok: 'false' }, at);
  assert.equal(judged.result.good, false);
  assert.equal(judged.result.judged, false);
});

// His screen 2026-09-23: a notice for 碣石's 洛书 put the board on the stage at 邺城.
test('a notice for a place\'s game opens it only at that place', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'ye', tier: 'core', quests: { 'daily-20260911-trial-jieshi': { took: '2026-09-11', have: {} } } };
  assert.ok(!look(s, content, at).tasks.some(t => t.id === 'luoshu'), 'not at 邺城');
  refused(win, s, { id: 'luoshu' }, 'not-here', at);
  const there = { ...s, place: 'jieshi' };
  assert.equal(look(there, content, at).tasks.find(t => t.id === 'luoshu')?.status, 'offered');
  const done = must(task, must(win, there, { id: 'luoshu' }, at).state, { action: 'done', id: 'luoshu' }, at);
  assert.ok(done.state.quests['daily-20260911-trial-jieshi'].done_at, 'the win there meets the notice');
});

// His 五子棋, 2026-09-23: won at 桑间, handed in by Ling after a queued move to 彭城.
test('a hosted game won is counted even if he has walked on before it is handed in', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'sangjian', tier: 'core', quests: { 'daily-20260911-trial-sangjian': { took: '2026-09-11', have: {} } } };
  const won = must(win, s, { id: 'wuziqi' }, at);
  const paid = must(task, { ...won.state, place: 'pengcheng' }, { action: 'done', id: 'wuziqi' }, at);
  assert.ok(paid.result.handed[0].paid.progress > 0);
  refused(task, { ...paid.state }, { action: 'done', id: 'wuziqi' }, 'not-offered', at);
});

// His screen 2026-09-23: at 0, one point back 3 minutes later started a 12-point
// elite fight. Run to 0, he rests until 20; the last point is once a pool.
test('体力: run to 0, he rests until the pool is back to 20 (when rewards.stamina.rest is set)', () => {
  const at = ctx();
  const saved = content.rewards.stamina.rest;
  content.rewards.stamina.rest = 20;
  try {
  const s = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', stamina: 1, stamina_at: NOW.toISOString() };
  const spent = must(move, s, { place: 'sishui' }, at).state;
  assert.equal(spent.stamina, 0);
  assert.equal(spent.resting, true);
  const later = (m) => ctx({ now: new Date(NOW.getTime() + m * 60_000) });
  refused(move, spent, { place: 'pengcheng' }, 'no-stamina', later(3));
  assert.equal(look(spent, content, later(3)).stamina.empty, true, 'one point back is still resting');
  const back = must(move, spent, { place: 'pengcheng' }, later(61));
  assert.equal(back.state.resting, undefined, 'back to 20, he plays again');
  } finally { content.rewards.stamina.rest = saved; }
});

// His book 2026-09-23: a notice for 碣石's 洛书 had no 去碣石.
test('a game errand in the book names the place that hosts the game', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'pengcheng', tier: 'core', quests: { 'daily-20260911-trial-huaidu': { took: '2026-09-11', have: {} } } };
  const row = look(s, content, at).book.find(b => b.id === 'daily-20260911-trial-huaidu');
  assert.equal(row?.where?.name, '淮水渡口', 'the place the notice named, by name');
  // a carry names its market by name too
  const carry = { ...toOpenWorld(), place: 'sishui', tier: 'core', bag: {}, quests: { 'xu-elder-herb': { took: '2026-09-11', have: {} } } };
  assert.ok(look(carry, content, at).book.find(b => b.id === 'xu-elder-herb').where.name);
});

// ── The review of 2026-09-24: each hole it found, locked ──

test('a made scene grants progress and wealth only, and each of its exits pays once', () => {
  const pricey = [...content.items.items].sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0))[0];
  const well = grant => ({ id: 'made-well', place: { zh: '古井', en: 'Old well' }, setup: { zh: '井边。', en: 'A well.' }, cast: [], lines: [], buttons: ['draw'],
    exits: [{ id: 'draw', label: { zh: '打水', en: 'Draw water' }, means: 'draws water', next: 'made-well', grant }] });
  // the lint refuses a gift the model would give itself
  for (const k of ['item', 'cast', 'card', 'art']) {
    const out = make(toOpenWorld(), content, ctx(), { scene: JSON.stringify(well({ table: 'branch', progress: 20, [k]: k === 'item' ? pricey.id : 'longzhi' })) });
    assert.equal(out.result.refused, 'not-playable', k);
    assert.ok(out.result.problems.some(p => p.includes(`may not give ${k}`)), k);
  }
  // a loop pays its first pass only
  let s = must(make, toOpenWorld(), { scene: JSON.stringify(well({ table: 'branch', progress: 20, wealth: 5 })) }).state;
  s = must(enter, s, { scene: 'made-well' }).state;
  const first = must(resolve, s, { exit: 'draw' });
  assert.ok(first.result.paid.progress > 0);
  const again = must(resolve, first.state, { exit: 'draw' });
  assert.equal(again.result.paid, null, 'the same exit a second time pays nothing');
  // a scene kept from before the lint grants its numbers, never the thing
  const old = structuredClone(s);
  old.made.scenes['made-well'].exits[0].grant = { table: 'branch', progress: 20, item: pricey.id, cast: 'longzhi' };
  const paid = must(resolve, old, { exit: 'draw' });
  assert.equal(paid.state.bag[pricey.id], undefined);
  assert.ok(!paid.state.cast.includes('longzhi'));
});

test('Go back into a chapter already ended plays it for the story: nothing pays, and the prologue is not free again', () => {
  let s = toOpenWorld();
  const bells = s.bag['moon-bell'], stamina = s.stamina;
  s = must(go, s, { scene: '00-river' }).state;
  assert.ok(s.ended.includes('00-prologue'), 'the chapter stays ended');
  const replay = must(resolve, s, { exit: 'reach' });
  assert.equal(replay.result.paid, null, 'the river\'s bell is not handed over twice');
  assert.equal(replay.state.bag['moon-bell'], bells);
  assert.ok(replay.state.stamina < stamina, 'a step costs, as outside the prologue');
  assert.equal(replay.state.done_scenes.filter(id => id === '00-river').length, 1, 'passed once is kept once');
});

test('a creature beaten today is not fought again today — a scene\'s as much as a haunt\'s — and a waiting exit is not re-won', () => {
  const s = toFuzhu();
  const won = fightOut(s, 'subdue-fuzhu');
  assert.equal(won.result.outcome, 'won');
  refused(duel, won.state, { id: 'subdue-fuzhu' }, 'subdued-today');
  // the next day, the exit still waiting: the win stands, no second one
  refused(duel, won.state, { id: 'subdue-fuzhu' }, 'won-already', ctx({ now: new Date(NOW.getTime() + 86_400_000) }));
  // replaying the scene after the exit was taken: the fight is story, it pays nothing
  let t = must(resolve, won.state, { exit: 'subdue' }).state;
  t = must(go, t, { scene: '00-fuzhu' }).state;
  const tomorrow = ctx({ now: new Date(NOW.getTime() + 86_400_000) });
  const replay = fightOut({ ...t, wounds: undefined }, 'subdue-fuzhu', { c: tomorrow });
  assert.equal(replay.result.outcome, 'won');
  assert.equal(replay.result.dropped, undefined, 'no drop, no card');
  assert.equal(replay.result.bond, undefined);
});

test('one fight at a time: another will not start, another\'s picks do not settle it, the world holds still until it ends', async () => {
  const { fightHold, closeStaleFight } = await import('../scripts/rules.mjs');
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0 };
  const open = must(duel, base, { id: 'haunt:jingwei' }, c).state;
  refused(duel, open, { id: 'haunt:other', picks: 'end' }, 'not-here', c);
  refused(duel, { ...open, fight: { ...open.fight, game: 'haunt:other' } }, { id: 'haunt:jingwei', picks: 'end' }, 'not-started', c);
  refused(duel, { ...open, fight: { ...open.fight, game: 'haunt:other' } }, { id: 'haunt:jingwei' }, 'in-a-fight', c);
  // the guard: what changes the world waits; the fight's own verbs and the readers do not
  for (const [verb, args] of [['move', {}], ['go', {}], ['resolve', {}], ['trade', { action: 'use' }], ['tale', { action: 'make' }], ['meet', {}], ['quest', { action: 'take' }], ['deck', {}]]) {
    assert.equal(fightHold(open, verb, args)?.result.refused, 'in-a-fight', verb);
  }
  for (const [verb, args] of [['look', {}], ['duel', { picks: 'end' }], ['show', {}], ['gear', {}], ['quest', { action: 'info' }], ['task', { action: 'list' }], ['lang', {}]]) {
    assert.equal(fightHold(open, verb, args), null, verb);
  }
  assert.equal(fightHold(base, 'move', {}), null, 'no fight, no hold');
  // left open overnight: withdrawn, nothing paid
  assert.equal(closeStaleFight(open, c.now), open, 'today\'s fight stands');
  const next = closeStaleFight(open, new Date('2026-10-06T00:01:00'));
  assert.equal(next.fight, undefined);
  assert.equal(next.duels.jingwei.outcome, 'withdrew');
  assert.equal(next.wins?.['haunt:jingwei'], undefined);
});

test('the command line holds the world still while a fight is open, and closes one left overnight', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-fight-'));
  const cli = (iso, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: iso }, encoding: 'utf8' }).stdout);
  try {
    const c = ctx({ now: new Date('2026-10-05T10:00:00') });
    const open = must(duel, { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, updated: c.now.toISOString() }, { id: 'haunt:jingwei' }, c).state;
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(open));
    const day = '2026-10-05T10:05:00', night = '2026-10-06T08:00:00';
    assert.equal(cli(day, 'move', '--place=taihang').refused, 'in-a-fight');
    assert.equal(cli(day, 'look').fight?.open, true, 'Look still reads');
    assert.equal(cli(night, 'look').fight, undefined, 'the next day the fight is over');
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    assert.equal(saved.fight, undefined, 'and written so');
    assert.equal(saved.duels.jingwei.outcome, 'withdrew');
    assert.notEqual(cli(night, 'move', '--place=taihang').refused, 'in-a-fight');
  } finally { fs.rmSync(data, { recursive: true, force: true }); }
});

test('抉择: a difficulty or a stake the rules do not know is refused, never read as a wound', () => {
  const c = ctx();
  const s = { ...toOpenWorld() };
  s.meets = { day: dayKey(c.now), places: { [s.place]: { kind: 'trial', rolls: [3, 3, 3] } } };
  const way = (difficulty, stake) => ({ label: '甲', difficulty, stake, win: '赢', lose: '输' });
  for (const bad of [[way('constructor', 'coin'), way('easy', 'coin')], [way('hard', 'toString'), way('easy', 'coin')], [way('hard', '__proto__'), way('easy', 'coin')]]) {
    const out = meet(s, content, c, { action: 'offer', options: JSON.stringify(bad) });
    assert.equal(out.result.refused, 'not-playable', JSON.stringify(bad[0]));
  }
});

test('a traveller\'s riddle is missed at most RIDDLE_TRIES times; a beast passed or beaten on the road has left it', () => {
  const c = ctx();
  const s = toOpenWorld();
  const key = content.meets.riddles[0], r = content.riddles.zh.riddles[key];
  const wrong = r.choices.filter(x => !r.a.includes(x));
  s.meets = { day: dayKey(c.now), places: { [s.place]: { kind: 'riddle', key, tried: [] } } };
  const once = meet(s, content, c, { action: 'answer', answer: wrong[0] });
  assert.equal(once.result.refused, 'wrong-answer');
  const twice = meet(once.state, content, c, { action: 'answer', answer: wrong[1] ?? wrong[0] });
  assert.equal(twice.result.refused, 'riddle-closed');
  refused(meet, twice.state, { action: 'answer', answer: r.a[0] }, 'nothing-here');
  // a beast on the road: passed, it is gone; beaten, the same
  const road = { ...toOpenWorld(), place: 'sishui', meets: { day: dayKey(c.now), places: { sishui: { kind: 'beast', creature: 'paoxiao' } } } };
  assert.equal(look(road, content, c).place.encounter?.game.id, 'haunt:paoxiao');
  const passed = must(meet, road, { action: 'pass' }).state;
  assert.equal(look(passed, content, c).place.encounter, null);
  refused(duel, passed, { id: 'haunt:paoxiao' }, 'not-here');
  const beaten = fightOut(road, 'haunt:paoxiao');
  assert.equal(beaten.result.outcome, 'won');
  assert.equal(beaten.state.meets.places.sishui.done, true);
  assert.equal(look(beaten.state, content, c).place.encounter, null);
});

test('where an errand leads is read by the clock asked, not the save\'s last write', () => {
  const c = ctx({ now: new Date('2026-10-05T10:00:00') });
  const q = { id: 'test-far-ye', title: { zh: '远', en: 'Far' }, say: { zh: '去', en: 'Go' }, from: { place: 'sibei' }, need: [{ kind: 'visit', place: 'ye', n: 1 }], grant: { table: 'quest', progress: 10 } };
  content.quests.push(q);
  try {
    // written before 冀州 opened; asked after — the road through it is open
    const s = { ...toOpenWorld(), tier: 'core', updated: '2026-09-01T00:00:00Z', quests: { [q.id]: { took: '2026-10-05', have: {} } } };
    const where = look(s, content, c).book.find(b => b.id === q.id).where;
    assert.equal(where.id, 'ye');
    assert.ok(where.via && where.roads >= 2, JSON.stringify(where));
  } finally { content.quests.pop(); }
});

test('体力 says three hours by name: back to rest (rest_at), full (full_at), and returns_at as before', () => {
  const q = content.rewards.stamina, c = ctx();
  const at = n => new Date(NOW.getTime() + n * (q.refill_hours * 3600_000 / q.max)).toISOString();
  const empty = look({ ...toOpenWorld(), stamina: 0, stamina_at: NOW.toISOString(), resting: true }, content, c).stamina;
  assert.equal(empty.rest_at, at(q.rest ?? 1));
  assert.equal(empty.full_at, at(q.max));
  assert.equal(empty.returns_at, empty.rest_at, 'resting: the old field is the rest hour');
  const half = look({ ...toOpenWorld(), stamina: 50, stamina_at: NOW.toISOString() }, content, c).stamina;
  assert.deepEqual([half.rest_at, half.returns_at, half.full_at], [null, null, at(50)]);
  assert.equal(look({ ...toOpenWorld(), stamina: q.max, stamina_at: NOW.toISOString() }, content, c).stamina.full_at, null);
});

test('an errand shows what it pays (`pays`), the tier and the roots counted — the number that lands', () => {
  const c = ctx();
  // 元婴 pays twice what 练气 does: the card said +20, the rules paid 40
  const s = { ...toOpenWorld(), tier: 'nascent', step: 0, progress: 0 };
  const offer = look(s, content, c).offers.find(o => o.id === 'xu-lvliang-look');
  assert.equal(offer.grant.progress, 20);
  const info = quest(s, content, c, { action: 'info', id: 'xu-lvliang-look' }).result;
  assert.deepEqual(info.pays, offer.pays);
  const taken = must(quest, s, { action: 'take', id: 'xu-lvliang-look' }).state;
  taken.quests['xu-lvliang-look'].have = { 0: 1 };
  const turned = must(quest, taken, { action: 'turn', id: 'xu-lvliang-look' });
  assert.equal(offer.pays.progress, turned.result.paid.progress + (turned.result.paid.hold?.held ?? 0));
  assert.equal(offer.pays.wealth, turned.result.paid.wealth);
  assert.equal(offer.pays.progress, 40);
});

test('a save the world no longer fits comes back fitted, and a bad 体力 clock never becomes NaN', async () => {
  const { settleStamina, fitWorld } = await import('../scripts/state.mjs');
  const s = { ...toOpenWorld(), stamina: 40, stamina_at: 'not a date' };
  settleStamina(content, s, NOW);
  assert.equal(s.stamina, 40);
  assert.equal(s.stamina_at, NOW.toISOString());
  const t = { ...toOpenWorld(), stamina: 'x' };
  settleStamina(content, t, NOW);
  assert.ok(Number.isFinite(t.stamina));
  // renamed ids: tier, chapter, place, a beast — the world's defaults stand in
  const odd = { ...toOpenWorld(), tier: 'renamed', step: 7, chapter: 'gone', scene: 'nowhere', place: 'lost', cast: ['fuzhu', 'ghost'] };
  const fit = migrate(odd, content);
  assert.equal(fit.tier, content.ladder.tiers[0].id);
  assert.equal(fit.step, 0);
  assert.ok(content.chapters[fit.chapter]);
  assert.equal(fit.place, null);
  assert.deepEqual(fit.cast, ['fuzhu']);
  assert.ok(look(fit, content, ctx()).ok, 'Look reads it');
  const scene = migrate({ ...toOpenWorld(), chapter: '00-prologue', scene: 'renamed-scene' }, content);
  assert.equal(scene.scene, null, 'an ended chapter\'s lost scene is no scene');
  const fine = toOpenWorld();
  assert.equal(fitWorld(fine, content), fine, 'a save that fits is untouched');
});

test('two callers at once: the save is locked from read to write, and no change is lost', async () => {
  const { spawn } = await import('node:child_process');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-lock-'));
  const rules = path.resolve(import.meta.dirname, '../scripts/rules.mjs');
  try {
    // at a market with money enough: every buy adds one to the bag
    const market = Object.values(content.places).flatMap(d => d.places.map(p => ({ ...p, province: d.province }))).find(p => p.has?.shop && p.tier === 0);
    const ware = content.items.items.filter(i => (i.sold ?? []).includes(market.province)).sort((a, b) => a.buy - b.buy)[0];
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ ...toOpenWorld(), place: market.id, wealth: 1e6, bag: {}, updated: NOW.toISOString() }));
    const N = 8;
    const loop = `const { spawnSync } = require('node:child_process'); for (let i = 0; i < ${N}; i++) spawnSync(process.execPath, [${JSON.stringify(rules)}, 'trade', '--action=buy', '--id=${ware.id}'], { stdio: 'ignore' });`;
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
    await Promise.all([0, 1, 2].map(() => new Promise(done => spawn(process.execPath, ['-e', loop], { env, stdio: 'ignore' }).on('exit', done))));
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    assert.equal(saved.bag[ware.id], 3 * N, 'every buy counted');
    assert.ok(!fs.existsSync(path.join(data, 'state.json.lock')), 'the lock is let go');
    // a crashed holder's lock goes stale and is taken over
    fs.writeFileSync(path.join(data, 'state.json.lock'), '99999');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(data, 'state.json.lock'), old, old);
    const out = JSON.parse(spawnSync(process.execPath, [rules, 'look'], { env, encoding: 'utf8' }).stdout);
    assert.equal(out.ok, true);
  } finally { fs.rmSync(data, { recursive: true, force: true }); }
});

// ── 装备入局 (2026-09-24, his: make gear count) — each worn thing, one number at the door ──

const fuzhuOf = () => content.creatures.creatures.find(c => c.id === 'fuzhu');
const doorOf = s => fightSetup(content, s, fuzhuOf(), NOW).you;
const wearing = (wear, extra = {}) => ({ ...toFuzhu(), bag: Object.fromEntries(Object.values(wear).map(id => [id, 1])), wear, ...extra });

test('装备入局: the sword by its grade, the robe as 护体, the 佩 as 抗 — nothing worn, nothing added', () => {
  assert.equal(doorOf(wearing({ weapon: 'bamboo-sword' })).power, 1, '竹剑 (器攻 2) → 主灵根一击 +1');
  assert.equal(doorOf(wearing({ weapon: 'iron-sword' })).power, 2, '铁剑 (器攻 3) → +2: the better sword is the better fight');
  assert.equal(doorOf(wearing({ robe: 'straw-cloak' })).armor, 4, '蓑衣 (防 1) → 护体 4');
  assert.deepEqual(doorOf(wearing({ pendant: 'jade-ring' })).ward, { earth: 4 }, '玉珏 (抗土 2) → 土 lands 4 lighter');
  const bare = doorOf(wearing({}));
  for (const k of ['power', 'armor', 'ward']) assert.equal(bare[k], undefined, `${k}: an old setup's shape, untouched`);
  // In the bag but not worn counts for nothing.
  assert.equal(doorOf({ ...toFuzhu(), bag: { 'iron-sword': 1 }, wear: {} }).power, undefined);
});

test('装备入局: the 本命法宝 is the sword it was made of, +1 every four 重 — and one hand holds the bigger', () => {
  const bound = level => ({ ...toFuzhu(), treasure: { name: '青萍', base: 3, element: 'metal', level, exp: 0 } });
  assert.equal(doorOf(bound(1)).power, 2, 'bound from the 铁剑: never weaker than the sword it was');
  assert.equal(doorOf(bound(5)).power, 3, '温养 and 强化 now reach the fight');
  assert.equal(doorOf(bound(9)).power, 4, '九重');
  assert.equal(doorOf({ ...bound(9), bag: { 'bamboo-sword': 1 }, wear: { weapon: 'bamboo-sword' } }).power, 4, 'a sword beside it does not add');
  // Its element is lent like a sword's root: a 金 功法 may be dealt.
  const s = { ...bound(1), cards: [...toFuzhu().cards ?? [], 'suijin'] };
  assert.ok(doorOf({ ...s, cards: [...(s.cards ?? []), 'suijin'] }).deck.includes('suijin'));
  assert.ok(!doorOf({ ...toFuzhu(), cards: [...(toFuzhu().cards ?? []), 'suijin'] }).deck.includes('suijin'), 'without it, no 金 spell');
});

test('装备入局: the gear panel says what the fight takes from each thing', async () => {
  const { gearBrief } = await import('../scripts/rules/errands.mjs');
  const s = wearing({ weapon: 'iron-sword', robe: 'straw-cloak', pendant: 'jade-ring' });
  const fight = gearBrief(content, { ...s, bag: { ...s.bag, talisman: 1 } }).fight;
  assert.deepEqual(fight, { power: 2, armor: 4, ward: { earth: 4 }, charm: 'talisman', lends: ['metal'] });
  assert.deepEqual(gearBrief(content, wearing({})).fight, { power: 0, armor: 0 });
});

test('装备入局: a 符 in the bag is in hand at the door, and a 符 played is taken from the bag at the settle', () => {
  const at = ctx({ now: new Date('2026-10-05T10:00:00') });
  const base = { ...toOpenWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, stamina: 50, bag: { talisman: 1 } };
  const started = must(duel, base, { id: 'haunt:jingwei' }, at);
  const { setup } = started.result.duel;
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const hand = begin(setup, catalog).you.hand;
  const actions = [`play:${hand.indexOf('talisman')}`];
  while (battle(actions, setup, catalog).outcome === 'open' && actions.length < 60) actions.push('end');
  const settled = must(duel, started.state, { id: 'haunt:jingwei', picks: actions.join(',') }, at);
  assert.deepEqual(settled.result.spent, ['talisman']);
  assert.equal(settled.state.bag.talisman, undefined, 'the last one gone from the bag');
  // No 符 in the bag, none in hand.
  const none = must(duel, { ...base, bag: {} }, { id: 'haunt:jingwei' }, at);
  assert.ok(!none.result.duel.setup.you.extra.includes('talisman'));
});

// ── The economy (2026-09-24, his): games cost a little 体力; the card fight pays best per 体力 ──

test('a hosted game costs a step\'s 体力 when it is counted; with the pool empty the win waits, and is counted once it refills', () => {
  const at = ctx();
  const cost = content.rewards.stamina.cost.game;
  assert.equal(cost, content.rewards.stamina.cost.step, 'a little: what a step costs');
  const s = { ...toOpenWorld(), place: 'sangjian', tier: 'core', stamina: 100, stamina_at: NOW.toISOString(), quests: { 'daily-20260911-trial-sangjian': { took: '2026-09-11', have: {} } } };
  const won = must(win, s, { id: 'wuziqi' }, at);
  assert.equal(won.state.stamina, 100, 'the win itself is only witnessed');
  const paid = must(task, won.state, { action: 'done', id: 'wuziqi' }, at);
  assert.equal(paid.state.stamina, 100 - cost);
  assert.ok(paid.result.handed[0].paid.progress > 0);
  // Empty: refused, the win kept; an hour later it is counted.
  const empty = { ...won.state, stamina: 0, resting: true, stamina_at: NOW.toISOString() };
  const r = refused(task, empty, { action: 'done', id: 'wuziqi' }, 'no-stamina', at);
  assert.ok(r.say);
  const later = ctx({ now: new Date(NOW.getTime() + 90 * 60_000) });
  assert.ok(must(task, empty, { action: 'done', id: 'wuziqi' }, later).result.handed[0].paid.progress > 0);
  // A task that is not a hosted game (the story's first furnace) stays free.
  let story = must(resolve, must(resolve, start(), { exit: 'reach' }).state, { exit: 'name', value: '青玄' }).state;
  story = { ...must(resolve, story, { exit: 'touch' }).state, stamina: 100, stamina_at: NOW.toISOString() };
  const first = must(task, must(win, story, { id: 'alchemy-first' }).state, { action: 'done', id: 'alchemy-first' });
  assert.equal(first.state.stamina, 100);
});

test('论道 costs a hosted game\'s 体力 at the door, and a game under way is not charged twice', () => {
  const at = ctx();
  const s = { ...toOpenWorld(), place: 'jixia', tier: 'core', stamina: 100, stamina_at: NOW.toISOString(), quests: { 'daily-20260911-trial-jixia': { took: '2026-09-11', have: {} } } };
  const open = must(VERBS.lundao, s, { action: 'open' }, at);
  assert.equal(open.state.stamina, 100 - content.rewards.stamina.cost.game);
  const again = must(VERBS.lundao, open.state, { action: 'open' }, at);
  assert.equal(again.state, null, 'coming back to it takes nothing');
  refused(VERBS.lundao, { ...s, stamina: 0, resting: true }, { action: 'open' }, 'no-stamina', at);
});

test('the card fight pays the most 修为 per 体力 — every hosted game pays less for what it costs', () => {
  const { tables, stamina } = content.rewards;
  const fight = tables.haunt.progress / stamina.cost.duel; // an elite is a fight like any other
  const hosted = content.tasks.tasks.filter(x => x.hosted);
  for (const t of hosted) {
    const perPoint = Math.min(t.grant.progress, tables[t.grant.table].progress) / stamina.cost.game;
    assert.ok(perPoint < fight, `${t.id} pays ${perPoint.toFixed(2)} a point, the fight ${fight.toFixed(2)}`);
  }
  // …and even at the gate's win rate (~85%) a fight still out-earns any game.
  const board = Math.max(...hosted.map(t => t.grant.progress)) / stamina.cost.game;
  assert.ok(0.85 * tables.haunt.progress / stamina.cost.duel > board);
});
