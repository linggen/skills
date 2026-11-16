// 所得 after a won fight (design.md § 所得, the builder 2026-11-16: 「赢了给的都要显示」): ONE card holds what the win gave —
// the fight's settle and, for a story fight, the story step after it. Two halves held together here: what the play bot
// calls owed (tools/playbot/spoils.mjs) and what the page's card holds (battle-card.js winSpoils, spoilsHtml).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inPrologue, missingOn, owedLines, owedOf, settleGave, stepAfter, stepGave } from '../tools/playbot/spoils.mjs';
import { WORDS, spoilsHtml, winSpoils } from '../scripts/battle-card.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const won = (more = {}) => ({ ok: true, outcome: 'won', game: 'fox-bite', ...more });
// 09-lingcao's way on after the 犰狳: a cultivation stretch's whole 修为 (Look `gained`) and the exit's 20 灵石.
const lingcaoStep = { exit: 'fight', paid: { wealth: 20, progress: 12 }, cards: [], gained: { n: 3, scene: '09-lingcao', items: [], wealth: 20, progress: 30, earlier: 18 } };

test('owed: a win that gave nothing owes nothing (the story fox, 蠪侄 without the 符)', () => {
  assert.equal(owedOf(won()), null);
  assert.equal(owedOf(won({ first_win: true, first_met: true })), null);
  assert.equal(owedOf(won({ paid: { progress: 0, wealth: 0 } })), null);
  assert.equal(owedOf(won(), { exit: 'fight', paid: null, cards: [], gained: null }), null);
});

test('owed: the settle alone — a drop, a card, 修为, 灵石, a 符 spent, a haunt variety', () => {
  assert.deepEqual(owedOf(won({ dropped: [{ id: 'talisman', name: '符', n: 1 }] })).things, ['符']);
  assert.deepEqual(owedOf(won({ dropped: [{ id: 'hantan', name: '寒潭指', card: true }] })).cards, ['寒潭指']);
  assert.equal(owedOf(won({ paid: { progress: 40 } })).progress, 40);
  assert.equal(owedOf(won({ paid: { wealth: 3 }, variety: { paid: { wealth: 2 } } })).wealth, 5);
  assert.deepEqual(owedOf(won({ spent: [{ id: 'talisman', name: '火符' }] })).spent, ['火符']);
  assert.equal(owedOf(won({ dropped: [{ id: 'bag', name: '储物袋', offered: true }] })), null, 'what waits at the door is not in hand');
  assert.equal(settleGave(null), null);
  assert.equal(owedOf({ ok: true, outcome: 'lost', dropped: [{ id: 'x' }] }), null);
});

test('owed: a story fight adds its step — the stretch\'s whole 修为 once (Look gained), not the resolve\'s part', () => {
  const o = owedOf(won(), lingcaoStep);
  assert.equal(o.progress, 30);
  assert.equal(o.wealth, 20);
  assert.deepEqual(owedLines(o), ['修为 +30', '灵石 +20']);
  // No Look read after it: the resolve's own paid, its item and the cards it handed.
  const s = stepGave({ paid: { progress: 5, item: { id: 'egg', name: '鸡蛋' } }, cards: [{ id: 'tuna', name: '吐纳', card: true }], gained: null });
  assert.deepEqual(s, { things: ['鸡蛋'], cards: ['吐纳'], spent: [], progress: 5, wealth: 0 });
  // Both pay: summed, every name kept.
  const both = owedOf(won({ dropped: [{ id: 'talisman', name: '符' }] }), lingcaoStep);
  assert.deepEqual(owedLines(both), ['符', '修为 +30', '灵石 +20']);
});

test('inPrologue: the prologue\'s lock in force at the fight (Look `locked` names cultivation) owes nothing — the builder, 2026-11-16', () => {
  const at = (locked) => [{ verb: 'look', out: { ok: true, locked } }, { verb: 'duel', out: won() }];
  assert.equal(inPrologue(at(['kaifu', 'cultivation', 'wealth']), 1), true);
  assert.equal(inPrologue(at([]), 1), false, 'from 入门 on: listed when empty');
  assert.equal(inPrologue(at(['kaifu']), 1), false, 'only 开府 shut (00-yinyue → 00-waimen keeps cultivation shut too, so this is past it)');
  assert.equal(inPrologue([], 0), false);
});

test('missingOn: names and amounts read off the card\'s text', () => {
  const o = owedOf(won({ dropped: [{ id: 'talisman', name: '符' }] }), lingcaoStep);
  assert.deepEqual(missingOn(o, '所得 · 修为 +30 · 灵石 +20 · 已入 · 收入储物袋：符'), []);
  assert.deepEqual(missingOn(o, '所得 · 收入储物袋：符'), ['修为 +30', '灵石 +20']);
  assert.deepEqual(missingOn(o, '所得 · 修为 +300 · 灵石 +20 · 符'), ['修为 +30'], '+300 is not +30');
  assert.deepEqual(missingOn(o, 'Spoils · Cultivation +30 · Spirit stones +20 · 符'), []);
});

test('stepAfter: the first way taken after the settle, and the Look after it — its gained only when new', () => {
  const verbs = [
    { verb: 'look', out: { ok: true, gained: { n: 2, scene: 'x' } } },
    { verb: 'duel', flags: ['--picks=a'], out: won() },
    { verb: 'resolve', flags: ['--exit=fight'], out: { ok: true, took: 'fight', paid: { wealth: 20 } } },
    { verb: 'look', out: { ok: true, gained: { n: 3, scene: '09-lingcao', progress: 30, wealth: 20, items: [] } } },
  ];
  const s = stepAfter(verbs, 1);
  assert.equal(s.exit, 'fight');
  assert.equal(s.gained.progress, 30);
  assert.ok(s.read);
  assert.equal(stepAfter(verbs.slice(0, 2), 1), null, 'no way taken yet');
  const stale = [...verbs.slice(0, 3), { verb: 'look', out: { ok: true, gained: { n: 2, scene: 'x' } } }];
  assert.equal(stepAfter(stale, 1).gained, null, 'an old gained is not this step\'s');
  assert.equal(stepAfter([...verbs.slice(0, 2), { verb: 'resolve', out: { ok: false, refused: 'stamina' } }], 1), null, 'a refusal took no way');
});

test('the page\'s card for a won story fight holds both pays (winSpoils → spoilsHtml), in both languages', () => {
  const fight = { cards: [], items: [{ id: 'talisman', name: '符', n: 1 }], paid: null, spent: [], line: null };
  const s = winSpoils(fight, lingcaoStep.gained, [{ id: 'tuna', name: '吐纳', card: true }]);
  assert.deepEqual(s.paid, { progress: 30, wealth: 20 });
  assert.deepEqual(s.items.map((i) => i.id), ['talisman']);
  assert.deepEqual(s.cards.map((c) => c.id), ['tuna']);
  for (const lang of ['zh', 'en']) {
    const w = WORDS[lang];
    const html = spoilsHtml(s, { catalog: { tuna: { id: 'tuna', name: '吐纳', cost: 1 } }, lang, words: w, artBase: '' });
    assert.match(html, new RegExp(`${w.xw} \\+30 · ${w.ls} \\+20`));
    assert.match(html, /符/);
    assert.match(html, new RegExp(w.spoils));
    assert.doesNotMatch(html, /undefined|\{[a-z]+\}/);
  }
});

test('the page\'s card: only the step paid (an empty settle) — still one card; nothing at all — none', () => {
  const empty = { cards: [], items: [], paid: null, spent: [], line: null };
  assert.deepEqual(winSpoils(empty, lingcaoStep.gained).paid, { progress: 30, wealth: 20 });
  assert.equal(winSpoils(empty, null), null);
  assert.equal(winSpoils(empty, { n: 4, scene: 'x', items: [] }, []), null);
  assert.equal(winSpoils(null), null);
  // A step's things join the fight's; a card both dealt and handed is one face.
  const both = winSpoils({ ...empty, cards: [{ id: 'tuna', name: '吐纳', card: true }] }, { items: [{ id: 'egg', name: '鸡蛋', n: 12 }] }, [{ id: 'tuna', name: '吐纳' }]);
  assert.equal(both.cards.length, 1);
  assert.deepEqual(both.items.map((i) => i.id), ['egg']);
  // The cap's line rides along (rules/cap.mjs `converted`).
  assert.ok(winSpoils(empty, { progress: 5, converted: { progress: 3, wealth: 6, say: '…' } }).paid.converted);
});

// The page's wiring (lingjing.js has no DOM-free entry): read from its source, so a change that undoes the rule fails here.
test('lingjing.js: a won story fight holds its 所得 for the step, shows one card, and floats no burst of its own', () => {
  const src = fs.readFileSync(path.join(HERE, '../scripts/lingjing.js'), 'utf8');
  // settleBout: a story exit's win waits (storyWin); only a field fight's settle sheet stands at once.
  assert.match(src, /const storyExit = r\.outcome === 'won' \? storyExitOf\(id\) : null;/);
  assert.match(src, /if \(storyExit\) storyWin = \{[^}]*fight: fightGave/);
  assert.match(src, /else if \(got\.length \|\| paid \|\| spent\.length\) keep\(\{ spoils:/);
  // gainedThings: the step's gained joins it, before any burst or reveal is queued.
  const gt = src.slice(src.indexOf('function gainedThings('), src.indexOf('function gainedCards('));
  assert.ok(gt.indexOf('storyWin.step = g; return;') > 0 && gt.indexOf('storyWin.step = g; return;') < gt.indexOf('gainBurst('));
  // Every Look may show it (however the way on was taken); gainBurst stays quiet while it is owed.
  const ro = src.slice(src.indexOf('async function readOnce('), src.indexOf('let contentStale'));
  assert.match(ro, /storyWinFlush\(\);\n {2}watchTell\(\);/);
  assert.match(src, /storyWin\?\.exit === exitId\) \{ storyWinFlush\(true\);/);
  const gb = src.slice(src.indexOf('async function gainBurst('), src.indexOf('async function gainBurst(') + 600);
  assert.match(gb, /if \(storyWinOpen\(\) \|\| view\.spoils\?\.paid\) return;/);
  assert.match(src, /const s = winSpoils\(w\.fight, w\.step, w\.cards \?\? \[\]\);\n {2}if \(!s\) return;/);
});
