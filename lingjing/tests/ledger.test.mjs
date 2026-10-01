// 恩仇簿 — 「世界记得你」 (哇时刻 5, his 2026-09-29: 「Ling可以自己记，go」).
// Entries keep the player's own words (`said`) and when; a 诺 kind that is
// settled kept or broken; Ling writes through Remember and the rules check
// who, once per person per scene, and that the quote is really what the
// player typed (the engine's LINGGEN_USER_WORDS — never the model's copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, ledgerChipHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { fill, newState } from '../scripts/state.mjs';
import { forLing, look, remember, resolve, writeLedger } from '../scripts/rules.mjs';
import { TO_WAIMEN, walk } from './prologue.mjs';
import { huiLabel } from '../scripts/rules/hui.mjs';
import { bookNo } from './book-num.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = (words = null, extra = {}) => ({ now: NOW, quests: [], words, ...extra });
/* At 马三's rent (00-masan): 马三, 马小宝 and 爹 on the scene. */
const atMasan = (lang = 'zh') => resolve(newState(content, lang, NOW), content, ctx(), { exit: 'begin' }).state;
/* When, as a reader is told it: the 回 of the scene written in (古一 — a small place, the short label), from the book. */
const H1 = huiLabel(content, 'h01', 'zh', 'short'), H1_EN = huiLabel(content, 'h01', 'en', 'short');
const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPED = ['[scene] took 照他的话，原样说回去', '马三，这账  我记着。', '阿禾，等我回来'];

test('Remember writes a real moment in the player\'s own words — who, kind, what, said, when', () => {
  const s = atMasan();
  const out = remember(s, content, ctx(TYPED), { who: '马三', kind: '仇', what: '一脚踹开柴门，逼租', quote: '「这账 我记着」' });
  assert.equal(out.result.ok, true);
  const e = out.state.ledger.at(-1);
  assert.deepEqual(e, { who: 'masan', kind: '仇', what: { zh: '一脚踹开柴门，逼租' }, chapter: '00-prologue', day: '2026-09-28', at: '00-masan', by: 'ling', said: '这账 我记着' });
  assert.equal(out.result.wrote.said, '这账 我记着', 'whitespace made one, the quote marks off');
  assert.equal(out.result.wrote.chapter, H1);
  assert.equal(H1, bookNo(content, 'h01'), 'the 回, short, the book\'s number — never 章 (the header keeps 卷 and 回目)');
  // by id, a slot, a named creature, the companion
  assert.equal(remember(s, content, ctx(TYPED), { who: 'ban', kind: '诺', what: '说好回来' }).state.ledger.at(-1).who, 'ahe');
  assert.equal(remember(s, content, ctx(), { who: '银月', kind: '恩', what: '救命' }).result.ok, true);
  assert.equal(remember(s, content, ctx(), { who: content.creatures.creatures[0].id, kind: '仇', what: '咬了一口' }).result.ok, true);
});

test('Remember refuses: an unknown person, a bad kind, a second entry here, a quote not typed, no typed words at all', () => {
  const s = atMasan();
  const r = (args, words = TYPED, state = s) => remember(state, content, ctx(words), { what: '一件事', kind: '恩', ...args }).result;
  assert.equal(r({ who: '张三' }).refused, 'unknown-person');
  assert.equal(r({ who: 'masan', kind: '怨' }).refused, 'bad-kind');
  assert.equal(r({ who: 'masan', what: '' }).refused, 'bad-what');
  assert.equal(r({ who: 'masan', quote: '我一定杀了你' }).refused, 'not-said', 'Ling cannot put words in their mouth');
  assert.equal(r({ who: 'masan', quote: '照他的话' }).refused, 'not-said', 'a page report is not their words');
  assert.equal(r({ who: 'masan', quote: '这账我记着' }).refused, 'not-said', 'verbatim: only whitespace is forgiven');
  assert.equal(r({ who: 'masan', quote: '这账 我记着' }, null).refused, 'unheard', 'no typed words (the page, an old engine): a quote is refused, never trusted');
  assert.equal(r({ who: 'masan', quote: '一'.repeat(31) }, ['一'.repeat(40)]).refused, 'quote-too-long');
  for (const x of [r({ who: '张三' }), r({ who: 'masan', quote: '我一定杀了你' })]) assert.equal(x.say, null, 'said to Ling alone');
  const once = remember(s, content, ctx(TYPED), { who: 'masan', kind: '仇', what: '逼租', quote: '这账 我记着' }).state;
  const again = r({ who: '马三', kind: '仇' }, TYPED, once);
  assert.equal(again.refused, 'written-here', 'one entry per person per scene');
  assert.equal(again.entry.said, '这账 我记着');
  assert.equal(r({ who: 'maxiaobao' }, TYPED, once).ok, true, 'another person in the same scene is written');
  assert.equal(remember(s, content, ctx(TYPED), { who: 'masan', action: 'hug' }).result.refused, 'unknown-action');
});

test('the story\'s own entry here takes the player\'s words once — never over another quote', () => {
  // The story wrote 马三 at his rent; the player's words, typed in the same scene, join it.
  const s = atMasan();
  s.ledger = [{ who: 'masan', kind: '仇', what: { zh: '逼租', en: 'Rent' }, chapter: '00-prologue', day: '2026-09-28', at: '00-masan' }];
  const q = remember(s, content, ctx(TYPED), { who: 'masan', kind: '仇', what: '逼租', quote: '这账 我记着' });
  assert.equal(q.result.quoted.said, '这账 我记着');
  assert.equal(q.state.ledger.length, 1);
  assert.equal(remember(q.state, content, ctx(TYPED), { who: 'masan', kind: '仇', what: '逼租', quote: '马三' }).result.refused, 'written-here');
});

test('诺: kept or broken — by Remember or by an exit\'s `settles`; Look lists the open ones to Ling wherever she is', () => {
  let s = atMasan();
  s = remember(s, content, ctx(TYPED), { who: '阿禾', kind: '诺', what: '说好会回来', quote: '等我回来' }).state;
  // 阿禾 is not at 马三's rent, but the promise is open: Ling holds it
  const hers = forLing(look(s, content, ctx()));
  assert.deepEqual(hers.ledger.map(e => [e.name, e.kind, e.said]), [['阿禾', '诺', '等我回来']]);
  assert.equal(remember(s, content, ctx(), { who: '马三', action: 'keep' }).result.refused, 'no-promise');
  const kept = remember(s, content, ctx(), { who: 'ahe', action: 'keep' });
  assert.equal(kept.result.settled.kept, true);
  assert.deepEqual(kept.state.ledger.at(-1).settled, { chapter: '00-prologue', day: '2026-09-28' });
  assert.equal(forLing(look(kept.state, content, ctx())).ledger, undefined, 'kept, and 阿禾 not here: nothing for Ling');
  assert.equal(remember(kept.state, content, ctx(), { who: 'ahe', action: 'break' }).result.refused, 'no-promise', 'settled once');
  // an authored exit settles it too
  const t = structuredClone(s);
  const wrote = writeLedger(content, t, { settles: [{ who: 'ban', kept: false }] }, ctx());
  assert.equal(wrote[0].kept, false);
  assert.equal(t.ledger.at(-1).kept, false);
});

test('an authored entry with `said: true` keeps the player\'s last typed line when it fits — never a tapped label', () => {
  const exit = { label: { zh: '收下鸡蛋', en: 'Take the egg' }, ledger: [{ who: 'ban', kind: '恩', what: { zh: '一个鸡蛋', en: 'An egg' }, said: true }] };
  const with_ = words => { const s = atMasan(); writeLedger(content, s, exit, ctx(words)); return s.ledger.at(-1); };
  assert.equal(with_(['谢谢你，阿禾']).said, '谢谢你，阿禾');
  assert.equal(with_(['收下鸡蛋']).said, undefined, 'the tap\'s own label');
  assert.equal(with_(['一'.repeat(31)]).said, undefined, 'too long: none rather than a cut');
  assert.equal(with_(null).said, undefined, 'the page: no typed words');
  assert.equal(with_(['谢谢', '[scene] took 收下鸡蛋']).said, '谢谢', 'a page report is skipped');
});

test('scene text fills {恩人} {仇人} and their words from the 簿 — empty, and gone, when there are none', () => {
  let s = walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);
  assert.equal(fill('{仇人}的脸。', s, content), '马小宝的脸。', 'most 仇, first written on a tie');
  assert.equal(fill('{恩人}笑了。你当年说过——{恩人·said}', s, content), '阿禾笑了。你当年说过——', 'no words kept: the slot is empty');
  s = remember(s, content, ctx(['阿禾，等我回来']), { who: 'ahe', kind: '诺', what: '说好会回来', quote: '等我回来' }).state;
  assert.equal(fill('你当年说过——{恩人·said}', s, content), '你当年说过——「等我回来」');
  assert.equal(fill('You said it: {恩人·said}', { ...s, lang: 'en' }, content), 'You said it: "等我回来"');
  const none = newState(content, 'zh', NOW);
  assert.equal(fill('{恩人} {仇人·said}来了', none, content), '来了');
});

test('Look: the page gets the whole 簿; Ling only the people present and the open 诺', () => {
  const s = walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);
  const l = look(s, content, ctx());
  assert.equal(l.ledger.length, 4, 'the page draws every entry');
  const present = new Set((l.scene?.people ?? []).map(p => p.id));
  const hers = forLing(l).ledger ?? [];
  assert.deepEqual(hers.map(e => e.name), l.ledger.filter(e => present.has(e.who) || e.who === 'yinyue').map(e => e.name));
  for (const e of hers) assert.deepEqual(Object.keys(e).filter(k => ['here', 'who', 'day', 'by'].includes(k)), [], 'compact');
  // at 马三's rent, with 马三 written: he is here, so Ling holds him
  const m = remember(atMasan(), content, ctx(TYPED), { who: '马三', kind: '仇', what: '逼租', quote: '这账 我记着' }).state;
  assert.deepEqual(forLing(look(m, content, ctx())).ledger, [{ name: '马三', kind: '仇', what: '逼租', said: '这账 我记着', chapter: H1 }]);
});

test('the 恩 chip: each entry\'s quote 「『…』 —— 你对马三说 · 第N回」 (古一\'s number), a 诺 marked, kept or broken', () => {
  let s = atMasan();
  s = remember(s, content, ctx(TYPED), { who: '马三', kind: '仇', what: '逼租', quote: '这账 我记着' }).state;
  s = remember(s, content, ctx(TYPED), { who: '阿禾', kind: '诺', what: '说好会回来', quote: '等我回来' }).state;
  let html = ledgerChipHtml({ look: look(s, content, ctx()), lang: 'zh', words: WORDS.zh }, true);
  assert.match(html, new RegExp(`<div class="ledgersaid">『这账 我记着』<span class="small dim"> —— 你对马三说 · ${re(H1)}</span></div>`));
  assert.match(html, /ledgerrow nuo"><span class="ledgerkind">诺<\/span><div><b>阿禾<\/b>/);
  assert.doesNotMatch(html, /ledgerkept/, 'open: no mark yet');
  s = remember(s, content, ctx(), { who: '阿禾', action: 'break' }).state;
  html = ledgerChipHtml({ look: look(s, content, ctx()), lang: 'zh', words: WORDS.zh }, true);
  assert.match(html, /<span class="ledgerkept broken">负诺<\/span>/);
  const en = ledgerChipHtml({ look: look({ ...s, lang: 'en' }, content, ctx()), lang: 'en', words: WORDS.en }, true);
  assert.match(en, new RegExp(`『这账 我记着』<span class="small dim"> —— you said to Ma San · ${re(H1_EN)}<`));
  assert.equal(H1_EN, bookNo(content, 'h01', 'en'));
  assert.match(en, /ledgerkept broken">broken</);
  assert.doesNotMatch(html + en, /undefined|NaN|\{who\}/);
});

test('the command line: Ling\'s Remember reads LINGGEN_USER_WORDS; the page\'s call never has typed words', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-ledger-'));
  const base = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  delete base.LINGGEN_USER_WORDS;
  const cli = (env, ...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env: { ...base, ...env }, encoding: 'utf8' }).stdout);
  try {
    cli({}, 'init', '--lang=zh');
    cli({}, 'resolve', '--exit=begin');
    const args = ['remember', '--who=马三', '--kind=仇', '--what=逼租', '--quote=这账我记着'];
    assert.equal(cli({}, ...args, '--for=ling').refused, 'unheard', 'no env: refused');
    assert.equal(cli({ LINGGEN_USER_WORDS: JSON.stringify(['马三，这账我记着！']) }, ...args).refused, 'unheard', 'the page\'s call: never trusted');
    assert.equal(cli({ LINGGEN_USER_WORDS: '{not json' }, ...args, '--for=ling').refused, 'unheard');
    assert.equal(cli({ LINGGEN_USER_WORDS: JSON.stringify(['我走了']) }, ...args, '--for=ling').refused, 'not-said');
    const ok = cli({ LINGGEN_USER_WORDS: JSON.stringify(['马三，这账我记着！']) }, ...args, '--for=ling');
    assert.equal(ok.ok, true);
    assert.equal(ok.wrote.said, '这账我记着');
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
    assert.equal(saved.ledger.at(-1).said, '这账我记着', 'in the save — it travels with the cloud save, never ling-mem');
    assert.equal(cli({}, 'look').ledger.at(-1).said, '这账我记着', 'the page reads it back');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
