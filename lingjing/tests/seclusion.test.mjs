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
import { secludeHour } from '../scripts/rules/playpay.mjs';
import { fightSetup, fightHold, look, seclusionHold, VERBS } from '../scripts/rules.mjs';
import { MOMENTS } from '../scripts/voice.js';
import { SECLUDE_FOCI, emergeFacts } from '../scripts/seclude-facts.js';

const content = loadContent();
const R = content.rewards.seclusion;
const T0 = new Date('2026-10-05T22:00:00');
const at = h => new Date(T0.getTime() + h * 3600_000);
const ctx = (now = T0) => ({ now, quests: [] });
const seclude = (s, now, args, c = content) => VERBS.seclude(s, c, ctx(now), args);

/* A 结丹 player with spells in hand, 体力 low, a 聚气丹 in the bag. */
function player(extra = {}) {
  return {
    ...newState(content, 'zh', T0), name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', step: 0, progress: 100,
    chapter: '03-qing', scene: null, place: 'sishui', ended: ['00-prologue', '01-ji', '02-yan'],
    cards: ['qingteng', 'huodan', 'wulei', 'leiming', 'fuzhu', 'yinyue'], bag: { 'qi-pill': 1 },
    stamina: 5, stamina_at: T0.toISOString(), ...extra,
  };
}
const inAndOut = (s, hours, args, c = content) => {
  const inn = seclude(s, T0, { action: 'enter', ...args }, c);
  assert.equal(inn.result.ok, true, JSON.stringify(inn.result));
  return seclude(inn.state, at(hours), { action: 'leave' }, c);
};
/* 闭关 without the 聚灵阵 (balance.json julin `on` false, its neutral value): the night's rate as before 2026-11-12 — with the
   阵 on (the world since the 耗材 numbers) 修为 is 聚灵 then 吐纳, tests/economy-knobs.test.mjs. */
const NIGHT = { ...content, balance: { ...content.balance, julin: { ...content.balance.julin, on: false } } };

test('the numbers: a day away is capped, a short sit grows nothing, and sitting pays less than playing', () => {
  assert.deepEqual([R.cap_hours, R.min_hours, R.rest_hours, R.star_hours, R.star_top, R.treasure_hours], [12, 1, 8, 6, 3, 8]);
  // 2026-11-02: a night (rest_hours) is play_pay.seclusion.night 体力-units at R, as play is; a whole pilled night (cap_hours ×
  // the strongest pill) is still under an hour of play (60 体力, 1 体力 ≈ 1 分钟) — on every layer, since both ride R.
  const pp = content.balance.play_pay, night = pp.seclusion.night * (R.cap_hours / R.rest_hours) * Math.max(...Object.values(R.pills));
  assert.ok(night < 60, `a pilled night ${night} 体力-units under an hour of play`);
  assert.ok(R.cap_hours * secludeHour(content, player()) <= content.rewards.tables.seclusion.progress, 'the table caps nothing a night pays');
});

test('card focus is unavailable and an old card seclusion pays ordinary cultivation', () => {
  const old = player({card_stars: { wulei: 2 }, card_study: { wulei: 3 }, seclusion: {focus: 'card', card: 'wulei', since: T0.toISOString()} });
  assert.equal(seclude(player(), T0, {action: 'enter', focus: 'card'}).result.refused, 'no-such-focus');
  assert.equal(seclude(player(), T0, {action: 'info'}).result.choices.spells, undefined);
  const out = seclude(old, at(4), {action: 'leave'});
  assert.equal(out.result.emerged.focus, 'progress');
  assert.equal(out.result.emerged.progress.paid, Math.floor(4 * secludeHour(content, old)));
  assert.deepEqual(out.state.card_stars, old.card_stars);
  assert.deepEqual(out.state.card_study, old.card_study);
});

test('under an hour nothing grows but 体力: it comes back all through the sitting, the whole pool in refill.seclusion_hours, whatever the focus', () => {
  const Q = content.rewards.stamina, H = Q.refill.seclusion_hours, perHour = Q.max / H;
  // Under min_hours (2 h for the pool since 2026-11-04, Hanli: 「可以, 2小时回满」): a quarter of the pool's hours.
  const short = inAndOut(player(), 0.25 * H, { focus: 'progress' });
  assert.equal(short.result.emerged.grows, false);
  assert.equal(short.state.card_stars, undefined);
  assert.equal(short.state.stamina, 5 + Math.floor(0.25 * H * perHour), 'a quarter of the hours, a quarter of the pool — linear on real minutes');
  assert.equal(short.result.emerged.stamina.gained, short.state.stamina - 5);
  assert.equal(short.result.emerged.rested, undefined, 'not full yet');
  // The whole pool in about an hour of 闭关, ending full — a spent, resting pool wakes.
  const full = inAndOut(player({ stamina: 0, resting: true }), H, { focus: 'progress' });
  assert.equal(full.state.stamina, Q.max);
  assert.equal(full.result.emerged.rested, true);
  assert.equal(full.state.resting, undefined);
  // A pill multiplies the hours 修为 counts, never 体力's (real minutes).
  const pilled = inAndOut(player(), 0.25 * H, { focus: 'progress', pill: 'qi-pill' });
  assert.equal(pilled.state.stamina, short.state.stamina);
  // While it runs Look's pool rises (settled at the 闭关 rate): the chip reads it live.
  const inn = seclude(player({ stamina: 0, resting: true }), T0, { action: 'enter', focus: 'progress' }).state;
  const mid = look(inn, content, ctx(at(0.25 * H)));
  assert.equal(mid.stamina.now, Math.floor(0.25 * H * perHour));
  assert.ok(mid.seclusion.full_at && Math.abs(new Date(mid.seclusion.full_at) - at(H)) < 60_000, 'the card says when it is whole');
  // A stamp older than the sitting never counts from before it began.
  const old = seclude(player({ stamina: 0, stamina_at: at(-5).toISOString() }), T0, { action: 'enter', focus: 'progress' }).state;
  assert.equal(seclude(old, at(0.1 * H), { action: 'leave' }).state.stamina, Math.floor(0.1 * H * perHour));
});

test('修为: per hour counted, through the tables like any grant; at the realm\'s peak the bar stops full and the rest is 灵石 (2026-11-12)', () => {
  const r = inAndOut(player(), 10, { focus: 'progress' }, NIGHT);
  const p0 = player(), hour = secludeHour(NIGHT, p0);
  assert.equal(r.result.emerged.progress.paid, Math.floor(10 * hour), 'ten hours at an hour\'s share of the layer');
  assert.equal(r.state.progress, p0.progress + Math.floor(10 * hour));
  // At the peak of 结丹 the bar fills to its need; the rest is 灵石, and 出关's card says it (`converted`).
  const top = content.ladder.tiers.find(t => t.id === 'core').thresholds;
  const start = player({ step: top.length - 1, progress: top.at(-1) - 10 });
  const peak = inAndOut(start, 12, { focus: 'progress' }, NIGHT);
  const got = Math.floor(12 * secludeHour(NIGHT, player({ step: top.length - 1 })));
  assert.equal(peak.result.emerged.progress.paid, 10, 'what fit');
  assert.deepEqual([peak.result.emerged.progress.converted.progress, peak.result.emerged.progress.converted.wealth > 0], [got - 10, true], 'the rest as 灵石');
  assert.equal(peak.state.progress, top.at(-1), 'full, never past');
  assert.equal(peak.state.wealth - start.wealth, peak.result.emerged.progress.converted.wealth);
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
  const inn = seclude(player(), T0, { action: 'enter', focus: 'progress', pill: 'qi-pill' });
  assert.equal(inn.state.bag['qi-pill'], undefined, 'spent');
  const out = seclude(inn.state, at(20), { action: 'leave' });
  assert.deepEqual([out.result.emerged.hours, out.result.emerged.counted], [12, 18]);
  assert.ok(out.result.emerged.progress.paid > 0);
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
  const s = seclude(player(), T0, { action: 'enter', focus: 'progress' }).state;
  const l = look(s, content, ctx(at(7)));
  assert.equal(l.seclusion.hours, 7);
  assert.ok(l.seclusion.progress.paid > 0);
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

test('old stars do not alter card costs or effects', () => {
  const c = content.cards.cards.find(x => x.id === 'wulei');
  const side = { stars: { wulei: 3 } };
  assert.equal(costOf(side, c), c.cost);
  assert.deepEqual(effectOf(side, c), effectOf({}, c));
  const setup = fightSetup(content, player({card_stars: {wulei: 3}}), content.creatures.creatures.find(x => x.deck), T0);
  assert.equal(setup.you.stars, undefined);
});

test('the page: the chooser, the running card with 出关, and 出关\'s count-up — every number the rules\', zh and en', () => {
  for (const lang of ['zh', 'en']) {
    const s = { ...player(), lang };
    const w = WORDS[lang];
    const choices = seclude(s, T0, { action: 'info' }).result.choices;
    const chooser = cardHtml({ card: 'seclude' }, { look: look(s, content, ctx()), lang, words: w, seclude: choices, secludeFocus: { focus: 'progress' } });
    assert.doesNotMatch(chooser, /data-seclude-focus="card"/);
    assert.match(chooser, /data-seclude-pill="qi-pill"/);
    assert.match(chooser, /data-seclude-go/);
    const running = seclude(s, T0, { action: 'enter', focus: 'progress' }).state;
    const card = cardHtml({ card: 'seclusion' }, { look: look(running, content, ctx(at(7))), lang, words: w });
    assert.match(card, /data-emerge/);
    assert.doesNotMatch(card, /★/);
    const out = seclude(running, at(7), { action: 'leave' }).result.emerged;
    const html = emergedHtml(out, { lang, words: w });
    assert.match(html, /data-countup="7"/);
    // Brief: ≤20 words a line (a zh line, ≤36 characters).
    for (const text of [w.secludeHint, w.secludeRule, w.emergeBtn, w.secludeTooShort].map(t => say(t, { cap: 12, min: 1, rest: 8 }))) {
      assert.ok(lang === 'zh' ? [...text].length <= 36 : text.split(/\s+/).length <= 20, text);
    }
  }
  assert.equal(MOMENTS.seclude.priority, 'asked');
  assert.equal(MOMENTS.emerge.priority, 'asked');
});

test("出关's facts for 银月 (seclude-facts.js, the Mac's page and the phone's bundle): the rules' numbers, never a line", () => {
  const s = player();
  const running = seclude(s, T0, { action: 'enter', focus: 'progress' }).state;
  const e = seclude(running, at(7), { action: 'leave' }).result.emerged;
  const zh = emergeFacts(e, true), en = emergeFacts(e, false);
  assert.ok(zh.startsWith('玩家刚出关：闭关 7 小时，专心修修为'), zh);
  assert.ok(en.startsWith('The player has just come out of seclusion: 7 h'), en);
  const short = emergeFacts({ focus: 'progress', hours: 0.5, grows: false }, true);
  assert.equal(short, '玩家刚出关：闭关 0.5 小时，专心修修为，时辰太短，没长什么。');
  assert.equal(emergeFacts(null, true), null);
  assert.deepEqual(WORDS.zh.secludeFoci, SECLUDE_FOCI.zh, "the chooser's words are the facts' own");
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

test('问签 stands in 闭关 (Hanli 11-03: 「闭关也能摇签」): the day\'s 签 draws, the world stays held', async () => {
  const { seclusionHold } = await import('../scripts/rules/seclusion.mjs');
  const s = { seclusion: { at: '2026-11-03T01:00:00Z', focus: 'progress' }, lang: 'zh' };
  assert.equal(seclusionHold(s, 'divine', {}), null);
  assert.equal(seclusionHold(s, 'move', {})?.result?.refused, 'in-seclusion');
});

test('a chosen quiet button shows its choice: `.act.quiet.on` comes after `.act.quiet` in the stylesheet', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  const quiet = css.search(/^\.act\.quiet \{/m), on = css.search(/^\.act\.quiet\.on \{/m);
  assert.ok(quiet >= 0 && on > quiet, 'the chosen rule exists and wins by order');
  assert.match(css.slice(on, css.indexOf('}', on)), /background:\s*var\(--ling\)/);
});
