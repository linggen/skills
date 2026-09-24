// What the page did, written down for Ling and Yinyue (rules/did.mjs): the
// page's own verbs append a fact, Ling's do not; each reader keeps its own
// place and reading never clears it for the other; the newest PAGE_KEEP stay;
// and a reader's place is never a move Undo takes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadWorld } from '../scripts/content.mjs';
import { PAGE_KEEP } from '../scripts/rules.mjs';
import { notePage, unseen, markSeen } from '../scripts/rules/did.mjs';

const NOW = new Date('2026-10-02T10:00:00+08:00');
const content = loadWorld('jiuding');

function game() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-did-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  const file = path.join(data, 'state.json');
  const save = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  cli('init', '--lang=zh');
  // Open country in 青州, where the roads lead on.
  const s = save();
  fs.writeFileSync(file, JSON.stringify({ ...s, name: 'Alex', chapter: '03-qing', scene: '03-shore', place: 'linzi', done_scenes: [...s.done_scenes, '03-arrive', '03-town'] }));
  return { cli, save, done: () => fs.rmSync(data, { recursive: true, force: true }) };
}

test("the page's verbs are written down; Ling's are not", () => {
  const g = game();
  assert.equal(g.cli('move', '--place=weishui').ok, true);
  assert.deepEqual(g.save().page_did.map(e => [e.verb, e.what]), [['move', 'moved to 潍水']]);
  assert.equal(g.cli('move', '--place=linzi', '--for=ling').ok, true);
  assert.equal(g.save().page_did.length, 1, 'a Move Ling made is hers already');
  // A read the page makes writes nothing down.
  g.cli('look');
  g.cli('quest', '--action=info', '--id=nope');
  assert.equal(g.save().page_did.length, 1);
  g.done();
});

test("Ling's Look hands over what she has not seen, and never clears it for Yinyue", () => {
  const g = game();
  g.cli('move', '--place=weishui');
  const told = g.cli('look', '--for=ling').page_did;
  assert.deepEqual(told, [{ at: NOW.toISOString(), verb: 'move', what: 'moved to 潍水' }]);
  assert.equal(g.cli('look', '--for=ling').page_did, undefined, 'seen once, not again');
  assert.equal(g.cli('look').page_did, undefined, "the page's own Look is not a reader");
  assert.equal(g.save().page_did.length, 1, 'the log stays');
  // Yinyue has her own place in it.
  const hers = g.cli('progress', '--for=yinyue');
  assert.deepEqual(hers.page_did.map(e => e.what), ['moved to 潍水']);
  assert.deepEqual(g.cli('progress', '--for=yinyue').page_did, []);
  // A new fact reaches both, each once.
  g.cli('move', '--place=linzi');
  assert.deepEqual(g.cli('look', '--for=ling').page_did.map(e => e.what), ['moved to 临淄']);
  assert.deepEqual(g.cli('progress', '--for=yinyue').page_did.map(e => e.what), ['moved to 临淄']);
  assert.deepEqual(g.save().page_seen, { ling: 2, yinyue: 2 });
  g.done();
});

test('Progress is small: the realm, the pool, the place, the book, the day — no stage, no question', () => {
  const g = game();
  const p = g.cli('progress', '--for=yinyue');
  assert.deepEqual(Object.keys(p).sort(), ['book', 'chores', 'her', 'name', 'next', 'ok', 'page_did', 'place', 'practice', 'progress', 'stamina', 'tale', 'tier'].sort());
  assert.deepEqual(p.place, { id: 'linzi', name: '临淄' });
  assert.equal(typeof p.tier, 'string');
  assert.ok(p.stamina.max > 0);
  assert.ok(JSON.stringify(p).length < 1500, `Progress is for a pet: ${JSON.stringify(p).length} chars`);
  g.done();
});

test("a reader's place is not a move: Undo after Ling's Look takes back the page's walk", () => {
  const g = game();
  g.cli('move', '--place=weishui');
  g.cli('look', '--for=ling');
  assert.equal(g.cli('undo').undid, 'move');
  assert.equal(g.save().place, 'linzi');
  g.done();
});

test(`the newest ${PAGE_KEEP} are kept, and a place past the oldest still reads right`, () => {
  let s = { lang: 'zh', page_did: [] };
  for (let i = 0; i < PAGE_KEEP + 5; i++) s = notePage('trade', { action: 'buy' }, { ok: true, item: { name: `物${i}` } }, s, content, NOW);
  assert.equal(s.page_did.length, PAGE_KEEP);
  assert.equal(s.page_did.at(-1).what, `bought 物${PAGE_KEEP + 4}`);
  assert.equal(s.page_did[0].n, 6);
  assert.equal(unseen(s, 'ling').length, PAGE_KEEP, 'Ling had seen none: all that is left');
  assert.equal(unseen(s, 'yinyue', 5).length, 5);
  assert.equal(markSeen(s, 'ling'), true);
  assert.deepEqual(unseen(s, 'ling'), []);
  assert.equal(unseen(s, 'yinyue').length, PAGE_KEEP);
});

test('each verb tells its fact; a call that changed nothing tells none', () => {
  const at = (verb, args, r) => notePage(verb, args, { ok: true, ...r }, { lang: 'zh' }, content, NOW)?.page_did[0].what ?? null;
  assert.equal(at('tame', {}, { tamed: { name: '夔' }, fed: { name: '灵芝' } }), 'tamed 夔 with 灵芝');
  assert.equal(at('refine', {}, { treasure: { name: '青锋' }, refined: { from: '竹剑', with: '精金' } }), 'refined 本命法宝 「青锋」 from 竹剑 with 精金');
  assert.equal(at('quest', { action: 'take' }, { title: '渔人的请托' }), 'took errand 渔人的请托');
  assert.match(at('quest', { action: 'turn' }, { title: '渔人的请托', paid: { progress: 20, wealth: 10 } }), /^handed in 渔人的请托 \(\+20 修为 · \+10 灵石\)$/);
  assert.match(at('task', { action: 'done' }, { done: 'alchemy-first', paid: { progress: 12 } }), /^practice alchemy-first done \(\+12 修为\)$/);
  assert.equal(at('meet', { action: 'pass' }, {}), 'left what lay by the road');
  assert.equal(at('move', {}, { via: [{ name: '潍水' }], place: { name: '稷下' } }), 'moved to 稷下 via 潍水');
  assert.equal(at('move', {}, { here: true, place: { name: '稷下' } }), null);
  assert.equal(at('meet', { action: 'reveal' }, {}), null);
  assert.equal(at('look', {}, {}), null);
  assert.equal(notePage('tame', {}, { ok: false, refused: 'needs-item' }, { lang: 'zh' }, content, NOW), null);
});
