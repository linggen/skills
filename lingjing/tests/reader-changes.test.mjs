// 「只看改动」 (Hanli 2026-10-05): what changed in a 回 since the reader last
// confirmed it, by rule (book-diff.js) — blocks aligned by LCS, a rewritten
// block sentence by sentence, marks ({注=…}{典=…}) and whitespace ignored —
// and the confirmed versions both readers share (rules/changes.mjs): confirm
// clears a 回, 撤销 puts the last one back, a stale confirm is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksOf, changesOf, keyOf, sentencesOf, sentenceDiff } from '../scripts/book-diff.js';
import { renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD = [
  '# 第一回　上联七个字　下联七个字',
  '',
  '小满上山。他背着弓。',
  '',
  '阿禾在[灶台]{注=zao}边等他。她说：「回来了？」',
  '',
  '---',
  '',
  '夜里下了雪。',
  '',
  '鹿皮挂在墙上，干了。',
].join('\n');

test('the same text, or one that differs only in its marks and spaces, has no change', () => {
  assert.equal(changesOf(OLD, OLD).count, 0);
  const marked = OLD.replace('[灶台]{注=zao}', '灶台').replace('小满上山。', '小满 上山。 ').replace('鹿皮', '[鹿皮]{典=lupi}');
  assert.equal(changesOf(OLD, marked).count, 0);
  assert.equal(changesOf(OLD, OLD.replace('他背着弓', '**他背着弓**')).count, 0);
});

test('a new paragraph is marked whole; a rewritten one marks only its new sentences', () => {
  const now = OLD.replace('夜里下了雪。', '夜里下了雪。\n\n白衣人进了村，一家一家地问。').replace('他背着弓。', '他背着一张旧弓。');
  const c = changesOf(OLD, now);
  assert.equal(c.count, 2);
  const [rewritten, added] = c.marks;
  assert.equal(rewritten.kind, 'changed');
  assert.deepEqual(rewritten.s, [1], 'only 「他背着一张旧弓。」 is new');
  assert.deepEqual(rewritten.gone, [{ at: 2, text: ['他背着弓。'] }], 'the old sentence kept to show');
  assert.equal(added.kind, 'new');
  assert.equal(added.key, keyOf('白衣人进了村，一家一家地问。'));
  assert.match(c.items[1].head, /^白衣人进了村/);
});

test('a paragraph taken out leaves a mark before the one now standing there', () => {
  const c = changesOf(OLD, OLD.replace('夜里下了雪。\n\n', ''));
  assert.equal(c.count, 1);
  assert.equal(c.gone.length, 1);
  assert.deepEqual(c.gone[0].text, ['夜里下了雪。']);
  assert.equal(c.gone[0].before.key, keyOf('鹿皮挂在墙上，干了。'));
  assert.equal(c.items[0].kind, 'removed');
});

test('no confirmed version: the whole 回 is one new change; the title line is never one', () => {
  const c = changesOf(null, OLD);
  assert.equal(c.count, 1);
  assert.equal(c.marks.length, blocksOf(OLD).length);
  assert.ok(!blocksOf(OLD).some((b) => b.text.includes('上联')));
  assert.equal(changesOf(OLD, OLD.replace('上联七个字', '上联换了字')).count, 0);
});

test('sentences cut after 。！？ with their closing quotes, and at line breaks', () => {
  assert.deepEqual(sentencesOf('她说：「回来了？」他点头。\n好。'), ['她说：「回来了？」', '他点头。', '好。']);
  assert.deepEqual(sentencesOf('**快跑！**他喊。'), ['**快跑！**', '他喊。']);
  assert.deepEqual(sentenceDiff('甲。乙。丙。', '甲。丙。丁。'), { s: [2], gone: [{ at: 1, text: ['乙。'] }] });
});

test('the page draws the marks where the changes say: ids for the list, new sentences in <mark>', () => {
  const now = OLD.replace('他背着弓。', '他背着一张旧弓。').replace('夜里下了雪。\n\n', '');
  const c = changesOf(OLD, now);
  const html = renderMarkdown(now, { changes: c });
  assert.match(html, /<p class="chg changed" data-chg="1" id="chg-1">小满上山。<mark class="chg-s">他背着一张旧弓。<\/mark><span class="chg-gone in">.*<span class="chg-old" hidden>他背着弓。<\/span>/);
  assert.match(html, /<div class="chg-cut" data-chg="2" id="chg-2">/);
  assert.ok(!/class="chg/.test(renderMarkdown(now, {})), 'no changes, no marks');
});

test('the shared store: no baseline marks nothing; confirm clears a 回, undo puts it back; a stale confirm is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-reader-'));
  process.env.LINGJING_READER = dir;
  const { changes, revOf } = await import('../scripts/rules/changes.mjs');
  try {
    assert.deepEqual(changes({ book: 'jiuding-lu' }), { ok: true, base: null, entries: {} });
    const book = path.join(dir, 'jiuding-lu');
    fs.mkdirSync(book, { recursive: true });
    fs.writeFileSync(path.join(book, 'meta.json'), JSON.stringify({ base: 'test' }));
    const text = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/01-第一回.md'), 'utf8');
    const paras = text.split('\n\n');
    fs.writeFileSync(path.join(book, 'h01.md'), [...paras.slice(0, 3), ...paras.slice(4)].join('\n\n'));
    const before = changes({ book: 'jiuding-lu' });
    assert.equal(before.base, 'test');
    assert.equal(before.entries.h01.count, 1, 'the one paragraph taken out of the old copy reads new');
    assert.ok(before.entries.h02.count >= 1, 'a 回 with no confirmed version reads all new');
    assert.equal(before.entries.h02.items.length, 1);
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', rev: 'stale' }).refused, 'moved');
    const done = changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', rev: revOf(text) });
    assert.equal(done.entries.h01.count, 0);
    assert.equal(done.entries.h01.undo, true);
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01' }).entries.h01.count, 0, 'stays confirmed');
    const back = changes({ book: 'jiuding-lu', id: 'h01', do: 'undo' });
    assert.equal(back.entries.h01.count, 1);
    assert.equal(back.entries.h01.undo, false);
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'undo' }).refused, 'nothing-to-undo');
    // A 回 that had no confirmed version goes back to none.
    changes({ book: 'jiuding-lu', id: 'h02', do: 'confirm', rev: before.entries.h02.rev });
    assert.equal(changes({ book: 'jiuding-lu', id: 'h02' }).entries.h02.count, 0);
    changes({ book: 'jiuding-lu', id: 'h02', do: 'undo' });
    assert.ok(!fs.existsSync(path.join(book, 'h02.md')));
    assert.equal(changes({ book: '../x' }).refused, 'bad-book');
    assert.equal(changes({ book: 'jiuding-lu', id: 'nope', do: 'confirm' }).refused, 'no-entry');
  } finally {
    delete process.env.LINGJING_READER;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
