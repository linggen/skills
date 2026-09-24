// redesign v2 (doc/redesign-v2.md § 四 and § 十, steps 2–4): what was merged,
// what was cut, and how a save from before comes across. A player keeps
// everything they HOLD — the bag, the cards, the treasure and its 重; what only
// a cut system read goes, and never takes anything with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, STATE_VERSION } from '../scripts/state.mjs';
import { deckFor, look, VERBS } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });

/* A v4 save in the shape the cut systems left it: hurt, a bond, 银月 out on a
   历练, the day's 温养 and 写符 marked, a treasure halfway to its next 重, and
   a deck picked by hand before 结丹. */
function oldSave(extra = {}) {
  const s = newState(content, 'zh', NOW);
  return {
    ...s, version: 4, name: '清玄', traits: ['wood', 'water', 'fire', 'earth'], tier: 'foundation', step: 1, progress: 40,
    chapter: '01-ji', scene: null, place: 'fajiu', ended: ['00-prologue'], done_scenes: ['00-river'],
    bag: { 'mend-pill': 2, 'yaodan-1': 3, talisman: 1, 'sang-paper': 2, jingjin: 1 },
    cards: ['qingteng', 'yinyue', 'fuzhu'], cast: ['fuzhu'],
    companion: { joined: '2026-10-01T09:00:00.000Z' },
    wounds: { n: 12, at: '2026-10-05T09:00:00.000Z' },
    bond: { n: 37, day: '2026-10-05', today: 3, talked: '2026-10-05', keys: ['gift:moon-bell'] },
    tended: '2026-10-05',
    journey: { day: '2026-10-05', place: 'weishan', hours: 8, from: '2026-10-05T08:00:00.000Z', until: '2026-10-05T16:00:00.000Z' },
    day: { key: '2026-10-05', progress: 20, wealth: 5, nourished: '2026-10-05', written: 1 },
    treasure: { name: '青锋', base: 3, element: 'metal', level: 3, exp: 12 },
    deck: ['qingteng'], deck_out: ['fuzhu'],
    ...extra,
  };
}

test('a save from before the cut migrates: what is held stays, what only the cut systems read goes', () => {
  const old = oldSave();
  const m = migrate(old, content);
  assert.equal(m.version, STATE_VERSION);
  assert.equal(STATE_VERSION, 5);
  // Kept: the bag (an old 回春丹 and 妖丹 are goods now), the cards, the cast,
  // the treasure and its 重, her joining, the realm.
  assert.deepEqual(m.bag, old.bag);
  assert.deepEqual(m.cards, old.cards);
  assert.deepEqual(m.cast, old.cast);
  assert.deepEqual(m.treasure, { name: '青锋', base: 3, element: 'metal', level: 3 }, 'its 重 kept, the 温养 exp gone');
  assert.deepEqual(m.companion, old.companion);
  assert.deepEqual([m.tier, m.step, m.progress], ['foundation', 1, 40]);
  // Gone: the wound, the bond and its marks, her tending, the day's 温养 and 写符.
  for (const k of ['wounds', 'bond', 'tended', 'journey']) assert.equal(m[k], undefined, k);
  assert.deepEqual(m.day, { key: '2026-10-05', progress: 20, wealth: 5 });
  // Never on the save it was handed.
  assert.ok(old.wounds && old.journey && old.treasure.exp === 12, 'migrate copies, never mutates');
  // Again changes nothing.
  assert.deepEqual(migrate(m, content), m);
});

test('a 历练 still out when the cut came: she is simply back at his side, bringing nothing, never lost on the road', () => {
  for (const journey of [
    { day: '2026-10-05', place: 'weishan', hours: 8, from: '2026-10-05T08:00:00.000Z', until: '2026-10-05T16:00:00.000Z' },
    { day: '2026-10-04', place: 'weishan', hours: 2, from: '2026-10-04T08:00:00.000Z', until: '2026-10-04T10:00:00.000Z' },
  ]) {
    const m = migrate(oldSave({ journey }), content);
    assert.equal(m.journey, undefined);
    const l = look(m, content, ctx());
    assert.equal(l.companion.journey, undefined);
    assert.equal(l.companion.name, '银月', 'she is here');
    const jingwei = content.creatures.creatures.find(c => c.id === 'jingwei');
    const setup = VERBS.duel(m, content, ctx(), { id: 'haunt:jingwei' }).result.duel?.setup;
    assert.ok(setup ? setup.you.extra.includes('yinyue') : jingwei, 'in his hand at the next fight');
    assert.deepEqual(m.bag, oldSave().bag, 'what she was bringing is not invented');
  }
});

test('a migrated save plays: whole at the next fight, no bond shown, the treasure without a bar, the deck dealt by the roots', () => {
  const m = migrate(oldSave(), content);
  const l = look(m, content, ctx());
  assert.equal(l.health, undefined);
  assert.equal(l.companion.bond, undefined);
  assert.deepEqual(Object.keys(l.treasure).sort(), ['atk', 'element', 'element_name', 'level', 'name', 'step', 'top']);
  assert.equal(l.treasure.level, 3);
  const door = VERBS.duel(m, content, ctx(), { id: 'haunt:jingwei' });
  assert.equal(door.result.ok, true, JSON.stringify(door.result));
  assert.equal(door.result.duel.setup.you.wounds, undefined, 'whole: the old wound is not carried in');
  // 组牌 before 结丹 is the roots' deal: the hand-picked ten waits for 结丹.
  assert.deepEqual(deckFor(content, m), deckFor(content, { ...m, deck: undefined, deck_out: undefined }));
  assert.deepEqual(m.deck, ['qingteng'], 'kept for 结丹, unread till then');
});

test('the command line migrates the save on disk once, on the first call, and the next reads it as written', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-v5-'));
  try {
    const file = path.join(data, 'state.json');
    fs.writeFileSync(file, JSON.stringify(oldSave()));
    const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
    const l = cli('look');
    assert.equal(l.ok, true);
    assert.equal(l.health, undefined);
    assert.equal(l.companion.journey, undefined);
    // A Look that changes nothing else may not write; the first verb that writes writes it at v5.
    cli('move', '--place=fajiu');
    cli('lang', '--lang=zh');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.version, 5);
    for (const k of ['wounds', 'bond', 'tended', 'journey']) assert.equal(saved[k], undefined, k);
    assert.equal(saved.treasure.exp, undefined);
    assert.deepEqual(saved.bag, oldSave().bag);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the cut verbs are gone from the rules and from Ling\'s tools', () => {
  for (const v of ['tend', 'bond', 'journey', 'nourish', 'write']) assert.equal(VERBS[v], undefined, v);
  const md = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const fm = md.split('\n---\n')[0];
  for (const tool of ['Inscribe', 'Bond']) assert.ok(!new RegExp(`- name: ${tool}\\b`).test(fm), tool);
  for (const verb of ['write', 'bond', 'tend', 'journey', 'nourish']) assert.ok(!new RegExp(`rules\\.mjs ${verb}\\b`).test(fm), verb);
});
