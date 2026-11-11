// 数值系统 batch 3 — fights on the level (Hanli 2026-11-10; balance.json master.fight, rules/power.mjs, battle.js § unitOf):
// P(L) = 21 × 1.05^(L−1) × 1.2^realm; his 气血 at full is P(his level); a fight is reckoned in his units (练气一层's numbers, a
// realm's length class) and shown × P(L) ÷ the anchor; a beast stands at its story fight's level or at his own held in its
// place's band, P's ratio on its 气血 and blows; fight_length's cap on the level; levels as data, linted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, levelLint } from '../scripts/content.mjs';
import { act, battle, begin, foeTurn, offers, shown, tokenOf, view } from '../scripts/battle.js';
import { WORDS, battleHtml } from '../scripts/battle-card.js';
import { lookahead } from '../scripts/fightline.js';
import { anchorOf, fightSetup, hpMaxOf, levelState, lengthRule, unitAt } from '../scripts/rules/cards.mjs';
import { clampTo, powerOf, realmOf } from '../scripts/rules/power.mjs';
import { hardErrors } from '../tools/numbers.mjs';
import { FIGHTS, setupOf, stateAt, NOW } from '../tools/story-fights.mjs';

const content = loadContent();
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const P = content.balance.power;
const play = (setup, seed) => {
  const st = begin({ ...setup, seed }, catalog);
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, lookahead(st), 'you'); }
  return st;
};
/* A setup's two sides moved to level L (the classes as they were: the same tier, decks, gear, shares). */
const atL = (setup, L, Lf = L) => ({ ...setup, you: { ...setup.you, level: L, pow: powerOf(P, L) }, foe: { ...setup.foe, level: Lf, pow: powerOf(P, Lf) } });

test('P(L): the curve, its realm step, and his 气血 at full on it — 练气一层 21 as it was, 零层 outside', () => {
  assert.deepEqual([P.first, P.growth, P.realm], [21, 1.05, 1.2]);
  assert.equal(powerOf(P, 0), null, '零层 has no level');
  assert.equal(hpMaxOf({ tier: 'qi', step: 1 }, content), 21, '练气一层 as before (20 and half a point)');
  assert.equal(hpMaxOf({ tier: 'qi', step: 0 }, content), 20, '零层 keeps its 20');
  assert.equal(realmOf(9), 0); assert.equal(realmOf(10), 1); assert.equal(realmOf(19), 2);
  const hp = L => hpMaxOf(levelState(content, L), content);
  for (let L = 2; L <= 27; L += 1) assert.ok(hp(L) > hp(L - 1), `气血 rises at L${L}`);
  assert.deepEqual([1, 5, 9, 10, 12, 18, 27].map(hp), [21, 26, 31, 39, 43, 58, 108]);
  // The realm's step: × 1.2 on top of the 1.05.
  assert.ok(Math.abs(powerOf(P, 10) / powerOf(P, 9) - 1.05 * 1.2) < 1e-9);
});

test('same level, any level: a fight at L1 and the same classes at L9, L12, L27 is the same fight, turn for turn', () => {
  for (const f of FIGHTS.filter(x => ['h05', 'h08', 'h11'].includes(x.at)).slice(0, 6)) {
    const base = setupOf(f);
    for (const L of [9, 12, 27]) {
      for (let k = 0; k < 6; k += 1) {
        const a = play(atL(base, 1), `inv|${k}`), b = play(atL(base, L), `inv|${k}`);
        assert.equal(b.outcome, a.outcome, `${f.id} L${L} seed ${k}`);
        assert.equal(b.turn, a.turn, `${f.id} L${L} seed ${k}: turns`);
        assert.equal(b.you.hp, a.you.hp, `${f.id} L${L} seed ${k}: his 气血 in his units`);
      }
    }
  }
});

test('…while the page shows the level: 气血 and blows × P(L) ÷ the anchor', () => {
  const f = FIGHTS.find(x => x.at === 'h05' && x.pool), base = setupOf(f);
  const st1 = begin(atL(base, 1), catalog), st9 = begin(atL(base, 9), catalog);
  assert.equal(shown(st1, st1.you.hpMax), 21);
  assert.equal(shown(st9, st9.you.hpMax), Math.round(powerOf(P, 9)), 'his 气血 on the page is P(his level)');
  assert.ok(shown(st9, st9.foe.hpMax) > shown(st1, st1.foe.hpMax));
  assert.equal(view(st9).unit, powerOf(P, 9) / base.anchor);
  // The room as the page draws it (battle-card.js battleHtml, no DOM): his 气血 bar reads P(9), the beast's its shown share.
  const html = battleHtml(view(st9), offers(st9), { lang: 'zh', words: WORDS.zh, catalog, board: 4 });
  assert.match(html, new RegExp(`data-now="${Math.round(powerOf(P, 9))}" data-max="${Math.round(powerOf(P, 9))}"`));
  assert.match(html, new RegExp(`data-max="${shown(st9, st9.foe.hpMax)}"`));
  assert.doesNotMatch(html, /\d+\.\d+ · 2/, 'the root strike shows a whole number');
  // The rules' result carries the shown numbers: the door's setup at a real 九层 and its settle.
  const s = { ...stateAt('h09') };
  assert.equal(unitAt(content, s).toFixed(4), (powerOf(P, 7) / anchorOf(content, s)).toFixed(4));
});

test('a level apart: the beast above is stronger by P\'s ratio, below weaker — and 境界压制 multiplies on a realm', () => {
  const f = FIGHTS.find(x => x.id === 'lang' && x.pool === 'mengshan'), base = setupOf(f);
  const rate = (L, Lf) => { let w = 0; for (let k = 0; k < 40; k += 1) w += play(atL(base, L, Lf), `gap|${k}`).outcome === 'won' ? 1 : 0; return w / 40; };
  const same = rate(5, 5), above = rate(5, 8), below = rate(5, 2);
  assert.ok(above < same && same < below, `below ${below} · same ${same} · above ${above}`);
  const st = begin(atL(base, 5, 6), catalog);
  assert.ok(Math.abs(st.scale.foe / (powerOf(P, 6) / powerOf(P, 5)) - (base.foe.might ?? 1)) < 1e-9, 'its blows × P(6) ÷ P(5)');
  // A pool's beast meets him at his level held in its place's band; a story fight at its own.
  assert.equal(clampTo(14, [1, 12]), 12); assert.equal(clampTo(3, [2, 4]), 3); assert.equal(clampTo(1, [10, 12]), 10);
  const s = stateAt('h05'), lv = fightSetup(content, { ...s, tier: 'foundation', step: 5 }, { root: 'fire', deck: base.foe.deck, levels: [1, 12] }, NOW);
  assert.equal(lv.foe.level, 12, 'L15 at a place of 1–12 meets an L12 beast');
  assert.equal(lv.foe.tier, 'foundation');
  const story = fightSetup(content, { ...s, tier: 'qi', step: 9 }, { root: 'water', deck: [], level: 5 }, NOW);
  assert.equal(story.foe.level, 5, 'a story fight stands at its exit\'s level');
});

test('fight_length on the level: 练气\'s rows reproduced, 筑基一层 within rounding, rising smoothly', () => {
  for (let s = 0; s <= 9; s += 1) assert.ok(Math.abs(lengthRule(content, { tier: 'qi', step: s }).dpt - (2.5 + 0.6 * s)) < 1e-9, `练气 ${s}: ${2.5 + 0.6 * s}`);
  assert.ok(Math.abs(lengthRule(content, { tier: 'foundation', step: 0 }).dpt - 6.5) < 0.05, '筑基一层 6.5');
  // 筑基二 · 三层 (today's 6.8 · 7.1): the line runs +0.46 a level where the row ran +0.3 — a finding, not hidden.
  assert.ok(Math.abs(lengthRule(content, { tier: 'foundation', step: 1 }).dpt - 6.8) < 0.25);
  assert.ok(Math.abs(lengthRule(content, { tier: 'foundation', step: 2 }).dpt - 7.1) < 0.4);
  const d = L => lengthRule(content, levelState(content, L)).dpt;
  for (let L = 2; L <= 27; L += 1) if (realmOf(L) === realmOf(L - 1)) assert.ok(d(L) > d(L - 1), `the cap rises inside a realm at L${L}`);
});

test('a fight kept from before levels finishes on its old numbers', () => {
  const f = FIGHTS.find(x => x.at === 'h08' && x.pool), now = setupOf(f);
  const old = { ...now, you: { ...now.you }, foe: { ...now.foe } };
  delete old.anchor; for (const k of ['level', 'pow']) { delete old.you[k]; delete old.foe[k]; }
  old.foe.tier = old.you.tier;
  const st = begin({ ...old, seed: 'kept' }, catalog);
  assert.equal(st.unit, undefined, 'no unit: shown as it was');
  assert.equal(st.you.hpMax, Math.round(20 + old.you.step * 0.5), 'the realm\'s row and half a point a step');
  assert.equal(shown(st, 7), 7);
  // Replayed from its kept picks, as the settle does.
  const live = begin({ ...old, seed: 'kept' }, catalog), picks = [];
  for (let g = 0; g < 300 && live.outcome === 'open'; g += 1) {
    if (live.whose === 'foe') { foeTurn(live); continue; }
    const a = lookahead(live); picks.push(tokenOf(a)); act(live, a, 'you');
  }
  const replay = battle(picks, { ...old, seed: 'kept' }, catalog);
  assert.ok(!replay.refused, 'the old setup replays');
  assert.equal(replay.outcome, live.outcome); assert.equal(replay.you.hp, live.you.hp, 'on the old numbers, as it was played');
});

test('the levels are data: every 卷一 place banded inside its map, every listed beast made for it, 卷二 onwards skipped', () => {
  const r = levelLint(content);
  assert.deepEqual(r.errors, []);
  assert.ok(r.checked > 100);
  for (const id of ['02-yan', '09-yu', 'mijing:leize']) assert.ok(r.skipped.includes(id), `${id} has no band yet`);
  // A beast out of its band, a place outside its map, a story fight with no level, a thing above the place: each is red.
  const bad = structuredClone(content);
  bad.creatures.creatures.find(c => c.id === 'xiong').levels = [13, 20];
  bad.places['徐'].places.find(p => p.id === 'fangshi').levels = [4, 15];
  delete Object.values(bad.chapters['00-zhuji'].scenes).find(s => s.id === '09-lingcao').exits.find(e => e.id === 'fight').game.foe.level;
  bad.items.items.find(i => i.id === 'iron-sword').level = 30;
  // …a beast made for a later level than the listing meets it at: 天马 (筑基's) in 秘境 一重 (练气二层 on), 狼 from 四层 on 蒙山.
  bad.mijing.tiers.find(t => t.id === 'xiongya').beasts.push({ creature: 'tianma', weight: 1 });
  bad.creatures.creatures.find(c => c.id === 'lang').levels = [4, 12];
  const says = levelLint(bad).errors.map(e => `${e.where}: ${e.say}`).join('\n');
  assert.match(says, /mijing xiongya · tianma: made for 10–12, met in the 重 from 2–12/);
  assert.match(says, /place mengshan · lang: made for 4–12, met here from 1 to 12/);
  // A 回's entry lets a beast in later: 鬿雀 (from 第八回) made for 练气六层 on is in band at 后山.
  assert.doesNotMatch(says, /qique/);
  assert.match(says, /xiong.*made for 13–20/);
  assert.match(says, /place fangshi: band 4–15 outside map/);
  assert.match(says, /09-lingcao\/fight: a story fight on a banded map/);
  assert.match(says, /iron-sword: a level-30 thing/);
  // …and a reason clears one.
  bad.creatures.creatures.find(c => c.id === 'xiong').levels_why = 'a test: the bear is older than the map';
  assert.doesNotMatch(levelLint(bad).errors.map(e => e.where).join(' '), /· xiong\b/);
});

test('no fight number by hand: a worn thing\'s 攻 · 防 · 抗 from its 品, a beast\'s 气血 a class share', () => {
  const sword = content.items.items.find(i => i.id === 'iron-sword'), ring = content.items.items.find(i => i.id === 'anhe-yu');
  assert.equal(sword.effect.atk, 3); assert.equal(sword.pin, 3);
  assert.deepEqual(ring.effect.ward, { earth: 2, water: 2 });
  assert.deepEqual(hardErrors(content).filter(e => /攻 · 防 · 抗|class share/.test(e.say)), []);
  const bad = structuredClone(content);
  bad.items.items.find(i => i.id === 'grey-robe')._hand_fight = true;
  bad.creatures.creatures.find(c => c.id === 'xiong').hp = 28;
  const says = hardErrors(bad).map(e => `${e.where}: ${e.say}`).join('\n');
  assert.match(says, /item grey-robe: a 攻 · 防 · 抗 by hand/);
  assert.match(says, /creature xiong: a 气血 of 28/);
});

test('power.things: a worn thing and a heal pill count at the wearer\'s level (\'wearer\', the master\'s pick) or at their own (\'own\')', () => {
  const f = FIGHTS.find(x => x.at === 'h09' && x.pool), s = stateAt('h09'); // 练气七层 in the 灰袍 (L1) with 火柴 (L4)
  const pills = { ...s, bag: { ...s.bag, 'mend-pill': 1 }, pill_pick: ['mend-pill'] };
  const at = things => {
    const c = { ...content, balance: { ...content.balance, power: { ...content.balance.power, things } } };
    return fightSetup(c, pills, setupOf(f).foe.deck ? { root: 'wood', deck: [] } : {}, NOW);
  };
  const wearer = at('wearer'), own = at('own');
  assert.equal(content.balance.power.things, 'wearer');
  assert.equal(wearer.you.armor, 4, 'the robe\'s 防 1 × 4, as before batch 3');
  assert.ok(own.you.armor < wearer.you.armor, `at its own level the 练气一层 robe is less at 七层 (${own.you.armor})`);
  assert.ok(own.you.power < wearer.you.power, 'and the 练气四层 sword');
  assert.ok(own.you.pouch[0].heal < wearer.you.pouch[0].heal, 'and the 练气一层 回春丹');
});
