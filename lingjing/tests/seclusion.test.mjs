// 闭关修炼 (his, 2026-09-24: one pick per seclusion; rules/seclusion.mjs). The
// hours are real, from the save's own stamp to the rules' clock, capped; one
// focus grows; the world holds still until 出关; a ★ is a cheaper 功法 in the
// fight; playing stays better than sitting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { costOf, effectOf, begin, act, offers } from '../scripts/battle.js';
import { WORDS, cardHtml, emergedHtml, say } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, STATE_VERSION } from '../scripts/state.mjs';
import { fightSetup, fightHold, look, seclusionHold, VERBS } from '../scripts/rules.mjs';
import { MOMENTS } from '../scripts/voice.js';

const content = loadContent();
const R = content.rewards.seclusion;
const T0 = new Date('2026-10-05T22:00:00');
const at = h => new Date(T0.getTime() + h * 3600_000);
const ctx = (now = T0) => ({ now, quests: [] });
const seclude = (s, now, args) => VERBS.seclude(s, content, ctx(now), args);

/* A 结丹 player with spells in hand, 体力 low, a 聚气丹 in the bag. */
function player(extra = {}) {
  return {
    ...newState(content, 'zh', T0), name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', step: 0, progress: 100,
    chapter: '03-qing', scene: null, place: 'sishui', ended: ['00-prologue', '01-ji', '02-yan'],
    cards: ['qingteng', 'huodan', 'wulei', 'leiming', 'fuzhu', 'yinyue'], bag: { 'qi-pill': 1 },
    stamina: 5, stamina_at: T0.toISOString(), ...extra,
  };
}
const inAndOut = (s, hours, args) => {
  const inn = seclude(s, T0, { action: 'enter', ...args });
  assert.equal(inn.result.ok, true, JSON.stringify(inn.result));
  return seclude(inn.state, at(hours), { action: 'leave' });
};

test('the numbers: a day away is capped, a short sit grows nothing, and sitting pays less than playing', () => {
  assert.deepEqual([R.cap_hours, R.min_hours, R.rest_hours, R.star_hours, R.star_top, R.treasure_hours], [12, 1, 8, 6, 3, 8]);
  // An hour of play: a pool of 体力 spent on fights (the best 修为 per 体力).
  const hourOfPlay = content.rewards.tables.haunt.progress / content.rewards.stamina.cost.duel * content.rewards.stamina.max;
  const night = R.cap_hours * R.progress_per_hour * Math.max(...Object.values(R.pills));
  assert.ok(night <= content.rewards.tables.seclusion.progress, 'the table caps even a pilled night');
  assert.ok(night < hourOfPlay / 3, `a whole pilled night (${night}) is far under an hour of play (${hourOfPlay})`);
});

test('a spell: a ★ each 6 h counted, the hours over kept for the next seclusion, at most ★3', () => {
  let r = inAndOut(player(), 13, { focus: 'card', id: 'wulei' });
  const e = r.result.emerged;
  assert.equal(e.hours, 12, 'real hours capped at 12');
  assert.deepEqual([e.card.from, e.card.to, e.card.was, e.card.cost], [0, 2, 5, 3]);
  assert.deepEqual(r.state.card_stars, { wulei: 2 });
  assert.equal(r.state.card_study, undefined, 'nothing left over at exactly 12');
  assert.equal(r.state.seclusion, undefined);
  // 4 h more: no star, 4 kept; 3 h more: the third star, and nothing kept at the top.
  r = inAndOut(r.state, 4, { focus: 'card', id: 'wulei' });
  assert.deepEqual([r.result.emerged.card.to, r.state.card_study.wulei], [2, 4]);
  r = inAndOut(r.state, 3, { focus: 'card', id: 'wulei' });
  assert.deepEqual([r.state.card_stars.wulei, r.state.card_study?.wulei], [3, undefined]);
  // At the top it is no longer offered, and refused.
  assert.ok(!seclude(r.state, T0, { action: 'info' }).result.choices.spells.some(x => x.id === 'wulei'));
  assert.equal(seclude(r.state, T0, { action: 'enter', focus: 'card', id: 'wulei' }).result.refused, 'not-a-spell');
  // A beast's card, one not held, or one of a root he lacks is no spell to temper.
  for (const id of ['fuzhu', 'hantan', 'jinzhua']) assert.equal(seclude(player(), T0, { action: 'enter', focus: 'card', id }).result.refused, 'not-a-spell', id);
});

test('under an hour nothing grows; 8 h or more fills 体力 whatever the focus', () => {
  const short = inAndOut(player(), 0.5, { focus: 'card', id: 'wulei' });
  assert.equal(short.result.emerged.grows, false);
  assert.equal(short.state.card_stars, undefined);
  assert.equal(short.result.emerged.rested, undefined);
  const mid = inAndOut(player(), 3, { focus: 'progress' });
  assert.equal(mid.result.emerged.rested, undefined, '3 h rests only by the clock');
  const long = inAndOut(player({ resting: true }), 8, { focus: 'progress' });
  assert.equal(long.result.emerged.rested, true);
  assert.equal(long.state.stamina, content.rewards.stamina.max);
  assert.equal(long.state.resting, undefined);
});

test('修为: per hour counted, through the tables like any grant, held at the realm\'s peak', () => {
  const r = inAndOut(player(), 10, { focus: 'progress' });
  assert.equal(r.result.emerged.progress.paid, 50);
  assert.equal(r.state.progress, 150);
  // At the peak of 结丹 the rest waits for the breakthrough.
  const top = content.ladder.tiers.find(t => t.id === 'core').thresholds;
  const peak = inAndOut(player({ step: top.length - 1, progress: top.at(-1) - 10 }), 12, { focus: 'progress' });
  assert.equal(peak.result.emerged.progress.paid, 10);
  assert.ok(peak.result.emerged.progress.hold);
  assert.equal(peak.state.progress, top.at(-1));
  assert.equal(peak.state.step, top.length - 1);
});

test('本命法宝: one 重 per 8 h, the hours over kept; none bound or at 九重 is refused', () => {
  const t = { name: '青锋', base: 3, element: 'metal', level: 2 };
  let r = inAndOut(player({ treasure: t }), 12, { focus: 'treasure' });
  assert.deepEqual([r.result.emerged.treasure.from, r.result.emerged.treasure.to], [2, 3]);
  assert.equal(r.state.treasure.tempered, 4);
  r = inAndOut(r.state, 4, { focus: 'treasure' });
  assert.deepEqual([r.state.treasure.level, r.state.treasure.tempered], [4, undefined]);
  assert.equal(seclude(player(), T0, { action: 'enter', focus: 'treasure' }).result.refused, 'no-treasure');
  assert.equal(seclude(player({ treasure: { ...t, level: 9 } }), T0, { action: 'enter', focus: 'treasure' }).result.refused, 'treasure-top');
  assert.equal(seclude(player(), T0, { action: 'info' }).result.choices.treasure, null);
});

test('a 聚气丹 taken going in: spent, the hours counted ×1.5 — the cap on real hours stands', () => {
  const inn = seclude(player(), T0, { action: 'enter', focus: 'card', id: 'huodan', pill: 'qi-pill' });
  assert.equal(inn.state.bag['qi-pill'], undefined, 'spent');
  const out = seclude(inn.state, at(20), { action: 'leave' });
  assert.deepEqual([out.result.emerged.hours, out.result.emerged.counted], [12, 18]);
  assert.equal(out.state.card_stars.huodan, 3);
  assert.equal(seclude(player({ bag: {} }), T0, { action: 'enter', focus: 'progress', pill: 'qi-pill' }).result.refused, 'not-in-bag');
  assert.equal(seclude(player(), T0, { action: 'enter', focus: 'progress', pill: 'foundation-pill' }).result.refused, 'not-a-seclusion-pill');
});

test('the clock is the rules\': `since` is ctx.now, and nothing the page passes moves it', () => {
  const inn = seclude(player(), T0, { action: 'enter', focus: 'progress', since: '2026-01-01T00:00:00Z', hours: 99 });
  assert.equal(inn.state.seclusion.since, T0.toISOString());
  assert.equal(seclude(inn.state, at(2), { action: 'leave', hours: 12 }).result.emerged.hours, 2);
  // One at a time; 出关 with none running is refused.
  assert.equal(seclude(inn.state, T0, { action: 'enter', focus: 'progress' }).result.refused, 'in-seclusion');
  assert.equal(seclude(player(), T0, { action: 'leave' }).result.refused, 'not-secluded');
});

test('in 闭关 the world holds still: Look carries it, the stage is its card alone, nothing is asked', () => {
  const s = seclude(player(), T0, { action: 'enter', focus: 'card', id: 'wulei' }).state;
  const l = look(s, content, ctx(at(7)));
  assert.equal(l.seclusion.hours, 7);
  assert.deepEqual([l.seclusion.card.from, l.seclusion.card.to], [0, 1], 'what 出关 would grow now');
  assert.deepEqual(l.stage, [{ card: 'seclusion' }]);
  assert.equal(l.ask, null);
  for (const [verb, args] of [['move', {}], ['resolve', {}], ['duel', {}], ['trade', {}], ['quest', { action: 'take' }], ['tale', { action: 'make' }]]) {
    assert.equal(seclusionHold(s, verb, args)?.result.refused, 'in-seclusion', verb);
  }
  for (const [verb, args] of [['look', {}], ['progress', {}], ['story', {}], ['lang', {}], ['show', {}], ['quest', { action: 'info' }], ['seclude', { action: 'leave' }]]) {
    assert.equal(seclusionHold(s, verb, args), null, verb);
  }
  // A fight open: 入关 waits for it to be settled.
  assert.equal(fightHold({ ...player(), fight: { game: 'x' } }, 'seclude', { action: 'enter' })?.result.refused, 'in-a-fight');
  assert.equal(fightHold({ ...player(), fight: { game: 'x' } }, 'seclude', { action: 'info' }), null);
});

test('the command line: in and out on a save on disk, a Move refused between, what the page did written down', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-seclude-'));
  try {
    fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(player()));
    const cli = (now, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: now.toISOString() }, encoding: 'utf8' }).stdout);
    assert.equal(cli(T0, 'seclude', '--action=enter', '--focus=card', '--id=leiming').ok, true);
    const moved = cli(at(1), 'move', '--place=sibei');
    assert.equal(moved.refused, 'in-seclusion');
    assert.ok(moved.say);
    const l = cli(at(9), 'look', '--for=ling');
    assert.equal(l.seclusion.hours, 9);
    const out = cli(at(9), 'seclude', '--action=leave');
    assert.deepEqual([out.emerged.card.to, out.emerged.rested], [1, true]);
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    assert.equal(saved.version, STATE_VERSION, 'no new version: the fields are new and default absent');
    assert.deepEqual(saved.card_stars, { leiming: 1 });
    assert.ok(saved.page_did.some(d => d.verb === 'seclude' && /came out of seclusion after 9 h: .*★0→★1, 体力 full/.test(d.what)), JSON.stringify(saved.page_did));
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('a ★ in the fight: −1 灵力 a star down to 1, then +1 to its number; only his, only a 功法', () => {
  const c = id => content.cards.cards.find(x => x.id === id);
  const side = { stars: { wulei: 3, qingteng: 2, peiyuan: 1, fuzhu: 3 } };
  assert.deepEqual([costOf(side, c('wulei')), effectOf(side, c('wulei')).damage], [2, 6]);
  assert.deepEqual([costOf(side, c('qingteng')), effectOf(side, c('qingteng')).damage], [1, 4]);
  assert.equal(effectOf(side, c('peiyuan')).buff.atk, 2);
  assert.equal(costOf(side, c('fuzhu')), c('fuzhu').cost, 'a beast is not tempered');
  assert.equal(costOf({}, c('wulei')), 5);
  // The door carries the stars of the ten dealt, and the fight takes the cheaper cost.
  const s = { ...player(), card_stars: { wulei: 3, jinzhua: 3 } };
  const creature = content.creatures.creatures.find(x => x.deck);
  const setup = fightSetup(content, s, creature, T0);
  assert.deepEqual(setup.you.stars, setup.you.deck.includes('wulei') ? { wulei: 3 } : undefined);
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const st = begin({ ...setup, you: { ...setup.you, deck: ['wulei', ...setup.you.deck.filter(id => id !== 'wulei')].slice(0, 10), stars: { wulei: 3 } } }, catalog);
  st.you.hand = ['wulei']; st.you.mana = 2;
  const o = offers(st).find(x => x.id === 'wulei');
  assert.deepEqual([o.cost, o.ok], [2, true]);
  assert.equal(act(st, o.action).ok, true);
  assert.equal(st.you.mana, 0);
});

test('the page: the chooser, the running card with 出关, and 出关\'s count-up — every number the rules\', zh and en', () => {
  for (const lang of ['zh', 'en']) {
    const s = { ...player(), lang };
    const w = WORDS[lang];
    const choices = seclude(s, T0, { action: 'info' }).result.choices;
    const chooser = cardHtml({ card: 'seclude' }, { look: look(s, content, ctx()), lang, words: w, seclude: choices, secludeFocus: { focus: 'card', id: 'wulei' } });
    assert.match(chooser, /data-seclude-focus="card" data-id="wulei"/);
    assert.match(chooser, /data-seclude-pill="qi-pill"/);
    assert.match(chooser, /data-seclude-go/);
    const running = seclude(s, T0, { action: 'enter', focus: 'card', id: 'wulei' }).state;
    const card = cardHtml({ card: 'seclusion' }, { look: look(running, content, ctx(at(7))), lang, words: w });
    assert.match(card, /data-emerge/);
    assert.match(card, /★0 → ★1/);
    const out = seclude(running, at(7), { action: 'leave' }).result.emerged;
    const html = emergedHtml(out, { lang, words: w });
    assert.match(html, /data-countup="7"/);
    // Brief: ≤20 words a line (a zh line, ≤36 characters).
    for (const text of [w.secludeHint, w.secludeRule, w.emergeBtn, w.secludeTooShort, w.secludeHeld].map(t => say(t, { cap: 12, min: 1, rest: 8 }))) {
      assert.ok(lang === 'zh' ? [...text].length <= 36 : text.split(/\s+/).length <= 20, text);
    }
  }
  assert.equal(MOMENTS.seclude.priority, 'asked');
  assert.equal(MOMENTS.emerge.priority, 'asked');
});

test('a save from before 闭关 plays as it was: no stars, no seclusion, the same version', () => {
  const old = player();
  const m = migrate(old, content);
  assert.equal(m.version, STATE_VERSION);
  assert.equal(m.seclusion, undefined);
  assert.equal(m.card_stars, undefined);
  assert.equal(look(m, content, ctx()).seclusion, undefined);
  const creature = content.creatures.creatures.find(x => x.deck);
  assert.equal(fightSetup(content, m, creature, T0).you.stars, undefined);
});

/* 洞府 (his, 2026-09-24): while a 闭关 runs, its card wears the closed stone
   gate — the world's picture, its file on disk — and at 出关 the gate parts
   over the 出关 card; with motion reduced, no doors at all. */
test('洞府: the running card shows the closed gate; 出关 opens it; the picture is there', () => {
  const s = player(), w = WORDS.zh;
  const running = seclude(s, T0, { action: 'enter', focus: 'progress' }).state;
  const seen = look(running, content, ctx(at(3))).seclusion;
  assert.equal(seen.art, content.rewards.seclusion.art);
  assert.ok(fs.statSync(path.resolve(import.meta.dirname, '../worlds/jiuding', seen.art)).size < 120_000, 'kept small');
  assert.match(content.rewards.seclusion.art_source, /FLUX\.2 klein 4B/);
  const card = cardHtml({ card: 'seclusion' }, { look: look(running, content, ctx(at(3))), lang: 'zh', words: w, artBase: '../worlds/jiuding/' });
  assert.match(card, /<div class="dongfu"><img src="\.\.\/worlds\/jiuding\/art\/dongfu-gate\.webp" alt="洞府石门紧闭">/);
  const out = seclude(running, at(3), { action: 'leave' }).result.emerged;
  const gated = emergedHtml({ ...out, art: seen.art }, { lang: 'zh', words: w, artBase: '../worlds/jiuding/' });
  assert.match(gated, /class="card emerged gated"/);
  assert.equal((gated.match(/class="door [lr]"/g) ?? []).length, 2);
  assert.doesNotMatch(emergedHtml(out, { lang: 'zh', words: w }), /gateopen/, 'no gate, no doors');
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '../scripts/lingjing.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.card\.emerged \.gateopen \{ display: none; \}/);
});
