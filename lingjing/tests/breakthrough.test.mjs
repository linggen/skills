// 渡劫 — a realm's breakthrough is ONE throw that can fail (Hanli, 2026-09-28:
// 红检, "you pick"). The page's card shows the chance and what feeds it; the
// rules throw, seeded so a reload, an Undo and a replay land alike; a failure
// wounds, takes a share of the peak step's 修为 and shuts the cauldron for real
// hours, and never takes the realm, the save or anything but the pill carried.
// Ling tells the 雷劫 and never decides it. Every number is ladder.json's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, cardHtml } from '../scripts/cards.js';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, oddsOf, pageThrows, resolve, rollOf } from '../scripts/rules.mjs';
import { notePage } from '../scripts/rules/did.mjs';

const content = loadContent();
const rule = content.ladder.breakthrough;
const NOW = new Date('2026-09-28T12:00:00');
const ctx = { now: NOW, quests: [] };
const HOUR = 3600_000;

/* At 冀鼎, the peak of 练气, full 体力, the four roots — nothing prepared. */
const atJi = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-cauldron', place: 'zhangyuan', ended: ['00-prologue'],
  tier: 'qi', step: 8, progress: 130, name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], stamina: 100, stamina_at: NOW.toISOString(),
  wealth: 300, bag: { lingzhi: 2 }, ...extra,
});
/* At 青鼎, the peak of 结丹, 银月 found — the third cauldron's gift is hers. */
const atQing = (extra = {}) => ({
  ...atJi(), chapter: '03-qing', scene: '03-cauldron', place: 'liubo', ended: ['00-prologue', '01-ji', '02-yan'],
  tier: 'core', step: 2, progress: 1200, companion: { joined: '2026-09-20' }, ...extra,
});
/* The try whose die lands (or not) under the chance. */
function tryThat(state, to, lands) {
  for (let k = 0; ; k += 1) {
    const t = { ...state, breakthrough: { ...state.breakthrough, tries: { [to]: k } } };
    if ((rollOf(t, to) < oddsOf(content, t, NOW, to).chance) === lands) return t;
  }
}
const oddsAt = s => look(s, content, ctx).scene.exits.find(e => e.id === 'take').breakthrough;
const part = (o, id) => o.parts.find(p => p.id === id);

test('the chance is the realm\'s base and what feeds it, held between floor and cap — every number the content\'s', () => {
  const o = oddsAt(atJi()).odds;
  assert.equal(o.base, rule.base.foundation);
  assert.equal(part(o, 'pill').on, false, 'no pill carried');
  assert.equal(part(o, 'pill').item.id, 'foundation-pill', 'the realm\'s own pill');
  assert.equal(part(o, 'body').n, rule.body.whole, 'unhurt');
  assert.equal(part(o, 'seclusion').n, 0);
  assert.equal(part(o, 'element').how, 'match', 'an earth root for 筑基');
  assert.equal(part(o, 'her'), undefined, 'before she is found she is not even a row');
  assert.equal(o.chance, rule.base.foundation + rule.body.whole + rule.element.match);
  assert.deepEqual(o.risk, { stamina: Math.ceil(content.rewards.stamina.max * rule.fail.wound), progress: Math.round(130 * rule.fail.progress), hours: rule.fail.cooldown_hours });

  const pill = oddsAt(atJi({ bag: { 'foundation-pill': 1 } })).odds;
  assert.equal(pill.chance, Math.min(rule.cap, o.chance + rule.pill.bonus), 'a pill carried');
  const hurt = oddsAt(atJi({ stamina: 20 })).odds;
  assert.equal(hurt.chance, o.chance - rule.body.whole + rule.body.hurt, '伤势 is 体力: under half is hurt');
  const sat = oddsAt(atJi({ last_seclusion: { at: new Date(NOW - 3 * HOUR).toISOString(), hours: 4 } })).odds;
  assert.equal(part(sat, 'seclusion').n, rule.seclusion.bonus, 'out of 闭关 three hours ago');
  assert.equal(part(oddsAt(atJi({ last_seclusion: { at: new Date(NOW - 30 * HOUR).toISOString(), hours: 4 } })).odds, 'seclusion').n, 0, 'too long ago');
  assert.equal(part(oddsAt(atJi({ last_seclusion: { at: new Date(NOW - HOUR).toISOString(), hours: 0.2 } })).odds, 'seclusion').n, 0, 'too short a sitting');
  assert.equal(part(oddsAt(atJi({ traits: ['fire'] })).odds, 'element').how, 'feeds', '火生土');
  assert.equal(part(oddsAt(atJi({ traits: ['metal'] })).odds, 'element').n, 0, '金 neither is nor feeds 土');
  const all = oddsAt(atJi({ bag: { 'foundation-pill': 1 }, last_seclusion: { at: NOW.toISOString(), hours: 5 } })).odds;
  assert.equal(all.chance, rule.cap, 'held at the cap');
  assert.ok(all.raw > rule.cap);

  const q = oddsAt(atQing()).odds;
  assert.equal(part(q, 'her').gifts, 0, 'found, no gift until the third cauldron is found');
  assert.equal(part(q, 'her').n, rule.her.joined);
  assert.equal(part(q, 'pill').item.id, 'pojing-pill', 'past the Core: the breach pill');
  assert.equal(part(q, 'element').element.id, rule.element.of.nascent);
  const low = oddsAt(atQing({ stamina: 5, traits: ['metal'], companion: undefined })).odds;
  assert.ok(low.low, `${low.chance} is under ${rule.low}`);
  assert.ok(low.chance >= rule.floor);
});

test('nothing in a later world breaks its content: the rule lints, and a bad one is caught', () => {
  assert.deepEqual(lint(content), []);
  const bad = structuredClone(content);
  bad.ladder.breakthrough.base.core = 140;
  bad.ladder.breakthrough.pill.items.core = 'no-such-pill';
  bad.ladder.breakthrough.fail.wound = 3;
  const problems = lint(bad).join('\n');
  assert.match(problems, /base for core/);
  assert.match(problems, /unknown item no-such-pill/);
  assert.match(problems, /shares of 0–1/);
});

test('the throw lands: the realm moves, the pill carried is spent, the tribulation card comes up', () => {
  const s = tryThat(atJi({ bag: { 'foundation-pill': 1, lingzhi: 2 } }), 'foundation', true);
  const r = resolve(s, content, ctx, { exit: 'take' });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.breakthrough.success, true);
  assert.equal(r.result.breakthrough.chance, oddsAt(s).odds.chance, 'the chance the card showed');
  assert.deepEqual(r.result.breakthrough.pill, { id: 'foundation-pill', name: '筑基丹' });
  assert.equal(r.state.tier, 'foundation');
  assert.equal(r.state.bag['foundation-pill'], undefined, 'spent');
  assert.equal(r.state.bag.lingzhi, 2, 'nothing else taken');
  assert.equal(r.state.scene, '01-end');
  assert.deepEqual(r.result.show, [{ card: 'tribulation', strikes: 3 }]);
  assert.deepEqual(r.state.breakthrough.last, { to: 'foundation', chance: r.result.breakthrough.chance, success: true, at: NOW.toISOString() });
});

test('the throw fails: hurt, a share of the peak step\'s 修为, the cauldron shut for real hours — the realm and the rest kept', () => {
  const s = tryThat(atJi({ bag: { 'foundation-pill': 1, lingzhi: 2 }, wealth: 300 }), 'foundation', false);
  const r = resolve(s, content, ctx, { exit: 'take' });
  const b = r.result.breakthrough;
  assert.equal(r.result.ok, true, 'a throw thrown is a move, written and logged');
  assert.equal(b.success, false);
  assert.equal(r.result.took, null);
  const step = content.rewards.stamina.cost.step;
  assert.deepEqual(b.lost, { stamina: Math.ceil(100 * rule.fail.wound), progress: Math.round(130 * rule.fail.progress) });
  assert.equal(r.state.stamina, 100 - step - b.lost.stamina);
  assert.equal(r.state.progress, 130 - b.lost.progress);
  assert.equal(r.state.tier, 'qi', 'the realm is never lost');
  assert.equal(r.state.step, 8, 'nor the step');
  assert.equal(r.state.scene, '01-cauldron', 'the scene stays');
  assert.equal(r.state.wealth, 300);
  assert.deepEqual(r.state.bag, { lingzhi: 2 }, 'only the pill carried is spent');
  assert.equal(b.again_at, new Date(NOW.getTime() + rule.fail.cooldown_hours * HOUR).toISOString());
  assert.equal(r.result.summarize, false);

  // Shut: the card waits with the hour, the chat offers the way back, a Resolve hears why.
  const back = { ...r.state, progress: 130 };
  const shut = resolve(back, content, { ...ctx, now: new Date(NOW.getTime() + HOUR) }, { exit: 'take' });
  assert.equal(shut.result.refused, 'breakthrough-cooling');
  assert.match(shut.result.say, /雷劫的余威/);
  assert.equal(shut.state, null, 'a refusal writes nothing');
  const l = look(back, content, { ...ctx, now: new Date(NOW.getTime() + HOUR) });
  const bt = l.scene.exits.find(e => e.id === 'take').breakthrough;
  assert.equal(bt.ready, false);
  assert.equal(bt.cooling, b.again_at);
  assert.ok(l.stage.some(c => c.card === 'breakthrough'), 'the card stays up, shut');
  assert.doesNotMatch(l.then, /the player throws there/, 'Ling is not told to invite a throw that cannot be made');
  // Open again, a new try is a new die.
  const later = new Date(NOW.getTime() + (rule.fail.cooldown_hours + 1) * HOUR);
  assert.equal(oddsAt({ ...back }).ready, false);
  assert.equal(look(back, content, { ...ctx, now: later }).scene.exits.find(e => e.id === 'take').breakthrough.ready, true);
  assert.equal(back.breakthrough.tries.foundation, s.breakthrough.tries.foundation + 1);
});

test('the die is the save\'s: the same try lands the same way, whatever the hour it is thrown', () => {
  const s = atJi();
  const a = resolve(s, content, ctx, { exit: 'take' }).result.breakthrough;
  const b = resolve(s, content, { ...ctx, now: new Date(NOW.getTime() + 5 * 60_000) }, { exit: 'take' }).result.breakthrough;
  assert.equal(a.success, b.success);
  assert.equal(rollOf(s, 'foundation'), rollOf(structuredClone(s), 'foundation'));
  const other = new Set(Array.from({ length: 40 }, (_, k) => rollOf({ ...s, breakthrough: { tries: { foundation: k } } }, 'foundation')));
  assert.ok(other.size > 20, 'each try is a new die');
});

test('Ling never throws it: her Resolve of a cauldron ready to take is refused; not ready, she still hears why', () => {
  const ready = pageThrows(content, atJi(), { exit: 'take', now: NOW });
  assert.equal(ready.refused, 'page-throws');
  assert.match(ready.then, /\[scene\] breakthrough won\|failed/);
  assert.equal(pageThrows(content, atJi({ step: 3, progress: 0 }), { exit: 'take', now: NOW }), null, 'below the peak: not-at-peak is hers to hear');
  assert.equal(pageThrows(content, atJi(), { exit: 'wait', now: NOW }), null, 'any other exit is untouched');
});

test('the card stands on the stage; the chat offers no throw and Ling is told the card holds it', () => {
  const l = look(atJi(), content, ctx);
  assert.ok(l.stage.some(c => c.card === 'breakthrough' && c.id === 'take'), JSON.stringify(l.stage));
  assert.ok(!(l.ask?.options ?? []).some(o => o.exit === 'take'));
  assert.match(l.then, /never Resolve it; the page tells you `\[scene\] breakthrough won\|failed`/);
  const ling = forLing(l);
  assert.ok(ling.scene.exits.find(e => e.id === 'take').breakthrough.odds, 'Ling may read the odds she tells around');
  assert.ok(!look(atJi({ step: 3, progress: 0 }), content, ctx).stage.some(c => c.card === 'breakthrough'), 'not at the peak: no card');
});

test('the odds card draws: the chance, each row, the price of failing, the throw — and shut, the hour', () => {
  for (const lang of ['zh', 'en']) {
    const l = look(atQing({ lang, bag: { 'pojing-pill': 1 }, stamina: 30 }), content, ctx);
    const pageCtx = (extra = {}) => ({ look: l, lang, words: WORDS[lang], content: {}, ...extra });
    const html = cardHtml({ card: 'breakthrough', id: 'take' }, pageCtx());
    const o = l.scene.exits.find(e => e.id === 'take').breakthrough.odds;
    assert.doesNotMatch(html, /undefined|\{\w+\}|NaN/, html.match(/.{0,30}(undefined|\{\w+\}|NaN).{0,30}/)?.[0]);
    assert.match(html, new RegExp(`<b>${o.chance}%</b>`));
    assert.equal((html.match(/<li /g) ?? []).length, 1 + o.parts.length, 'the base and a row a factor');
    assert.match(html, lang === 'zh' ? /渡劫 · 元婴[\s\S]*破境丹[\s\S]*带伤 · 体力不足一半[\s\S]*−10[\s\S]*银月相伴[\s\S]*失手：体力 −30 · 修为 −360/ : /Tribulation · Nascent Soul[\s\S]*Breach pill[\s\S]*Hurt · stamina under half[\s\S]*Yinyue beside you[\s\S]*If it fails: Stamina −30 · cultivation −360/);
    assert.match(html, /data-throw="take">/, 'the throw, open');
    const shut = look({ ...atQing({ lang }), breakthrough: { until: new Date(NOW.getTime() + 2 * HOUR).toISOString() } }, content, ctx);
    const shutHtml = cardHtml({ card: 'breakthrough', id: 'take' }, { ...pageCtx(), look: shut });
    assert.match(shutHtml, /btcard cooling/);
    assert.match(shutHtml, /data-throw="take" disabled/);
    assert.match(shutHtml, lang === 'zh' ? /雷劫余威未散 · / : /The lightning still runs in you · again after /);
    assert.match(cardHtml({ card: 'breakthrough', id: 'take' }, pageCtx({ throwNote: 'x' })), /class="donote">x</);
  }
  // Before 银月 is found, the card never names her.
  const alone = cardHtml({ card: 'breakthrough', id: 'take' }, { look: look(atJi(), content, ctx), lang: 'zh', words: WORDS.zh, content: {} });
  assert.doesNotMatch(alone, /银月/);
});

test('the page writes what fell down for Ling and Yinyue, and Undo takes the throw back to the same die', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-bt-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const file = path.join(data, 'state.json'), state = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const start = tryThat(atJi(), 'foundation', false);
  fs.writeFileSync(file, JSON.stringify(start));
  const ling = cli('resolve', '--exit=take', '--said=渡劫', '--for=ling');
  assert.equal(ling.refused, 'page-throws');
  const { guided, ...kept } = state(); // the guides handed to her session are remembered, never a move
  assert.deepEqual(kept, start, 'her refusal writes nothing');
  const first = cli('resolve', '--exit=take');
  assert.equal(first.breakthrough.success, false);
  const after = state();
  assert.match(after.page_did.at(-1).what, /tried the breakthrough to 筑基初期 on the page's card \(\d+% chance\) and the tribulation threw them back: 体力 −30, −39 修为; the cauldron is shut until .*The realm is kept/);
  assert.equal(cli('undo').ok, true);
  assert.equal(state().progress, 130, 'taken back');
  const again = cli('resolve', '--exit=take');
  assert.deepEqual(again.breakthrough, first.breakthrough, 'the same die');
  // A fresh chat hears the report first: the story guide comes with it.
  const fresh = spawnSync(process.execPath, ['scripts/rules.mjs', 'look', '--said=[scene] breakthrough failed 75%', '--for=ling'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...env, LINGGEN_SESSION_ID: 'fresh' }, encoding: 'utf8' });
  const told = JSON.parse(fresh.stdout);
  assert.ok(told.guide?.story, 'the 雷劫 is told by the story guide');
  assert.match(told.guide.story, /渡劫 — the breakthrough is a throw/);
  fs.rmSync(data, { recursive: true, force: true });

  const won = notePage('resolve', {}, { ok: true, breakthrough: { success: true, chance: 42, low: true, to: '筑基初期' }, beat: [{ text: '三道雷。' }] }, { lang: 'zh' }, content, NOW);
  assert.match(won.page_did.at(-1).what, /broke through to 筑基初期 on the page's card \(42% chance, against the odds\) — beat: 三道雷。/);
});
