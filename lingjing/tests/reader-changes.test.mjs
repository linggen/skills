// 「只看改动」 (Hanli 2026-10-05): what changed in a 回 since the reader last
// confirmed it, by rule (book-diff.js) — blocks aligned by LCS, a rewritten
// block sentence by sentence, marks ({注=…}{典=…}) and whitespace ignored —
// and the confirmed versions both readers share (rules/changes.mjs): each
// change confirmed on its own (逐条), the rest still marked; 撤销 takes back
// the last confirm, one at a time; a stale confirm is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksMd, blocksOf, changesOf, confirmItem, keyOf, sentencesOf, sentenceDiff } from '../scripts/book-diff.js';
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
  // Each change ends on its own 「确认这一处」: after change 1's paragraph, after change 2's cut.
  assert.match(html, /<\/p>\n<div class="chg-okrow" data-chg-end="1"><button type="button" class="chg-okone" data-chg-ok="1">/);
  assert.match(html, /删去 1 段<\/span><\/div>\n<div class="chg-okrow" data-chg-end="2">/);
  assert.equal((html.match(/chg-okrow/g) ?? []).length, 2);
  assert.ok(!/class="chg/.test(renderMarkdown(now, {})), 'no changes, no marks');
});

test('one change confirmed on its own: the others stay marked, and confirming each in turn clears the 回', () => {
  const now = OLD.replace('他背着弓。', '他背着一张旧弓。').replace('夜里下了雪。\n\n', '').replace('鹿皮挂在墙上，干了。', '鹿皮挂在墙上，干了。\n\n白衣人进了村。');
  const c = changesOf(OLD, now);
  assert.equal(c.count, 3);
  for (const it of c.items) {
    const after = changesOf(confirmItem(OLD, now, it.n), now);
    assert.deepEqual(after.items.map((x) => x.head), c.items.filter((x) => x.n !== it.n).map((x) => x.head), `confirming ${it.n} clears it alone`);
  }
  let base = OLD;
  while (changesOf(base, now).count) base = confirmItem(base, now, 1);
  assert.equal(changesOf(base, now).count, 0);
  assert.equal(confirmItem(OLD, now, 9), null);
  // A confirmed version kept as blocks reads back to the same blocks.
  assert.deepEqual(blocksOf(blocksMd(blocksOf(now))).map((b) => b.key), blocksOf(now).map((b) => b.key));
});

test('the shared store: no baseline marks nothing; one change confirmed, then undone; a stale confirm is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-reader-'));
  process.env.LINGJING_READER = dir;
  const { changes } = await import('../scripts/rules/changes.mjs');
  try {
    assert.deepEqual(changes({ book: 'jiuding-lu' }), { ok: true, base: null, entries: {} });
    const book = path.join(dir, 'jiuding-lu');
    fs.mkdirSync(book, { recursive: true });
    fs.writeFileSync(path.join(book, 'meta.json'), JSON.stringify({ base: 'test' }));
    const text = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/01-第一回.md'), 'utf8');
    const paras = text.split('\n\n');
    const old = [...paras.slice(0, 3), ...paras.slice(4, 9), ...paras.slice(10)].join('\n\n');
    fs.writeFileSync(path.join(book, 'h01.md'), old);
    const before = changes({ book: 'jiuding-lu' }).entries;
    assert.equal(before.h01.count, 2, 'the two paragraphs taken out of the old copy read new');
    assert.equal(before.h01.undo, null);
    assert.equal(before.h02.items.length, 1, 'a 回 with no confirmed version reads all new, one change');
    const at = (e) => ({ rev: e.rev, crev: e.crev });
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', item: 1, rev: 'stale', crev: before.h01.crev }).refused, 'moved');
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', item: 1, rev: before.h01.rev, crev: 'stale' }).refused, 'moved');
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', item: 7, ...at(before.h01) }).refused, 'no-item');
    const one = changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', item: 1, ...at(before.h01) }).entries.h01;
    assert.equal(one.count, 1, 'the other change still marked');
    assert.equal(one.items[0].head, before.h01.items[1].head);
    assert.equal(one.undo.head, before.h01.items[0].head);
    const both = changes({ book: 'jiuding-lu', id: 'h01', do: 'confirm', item: 1, ...at(one) }).entries.h01;
    assert.equal(both.count, 0);
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'undo' }).entries.h01.count, 1, 'undo takes back the last confirm only');
    const back = changes({ book: 'jiuding-lu', id: 'h01', do: 'undo' }).entries.h01;
    assert.equal(back.count, 2);
    assert.equal(back.undo, null);
    assert.equal(fs.readFileSync(path.join(book, 'h01.md'), 'utf8'), old, 'the first confirmed text back, as it was');
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'undo' }).refused, 'nothing-to-undo');
    // A 回 that had no confirmed version goes back to none.
    changes({ book: 'jiuding-lu', id: 'h02', do: 'confirm', item: 1, ...at(before.h02) });
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

test('改回原文: the change goes back in the checkout\'s book and the scene that quotes it, committed by path; refused over uncommitted work', async () => {
  const { execFileSync } = await import('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-revert-'));
  const repo = path.join(tmp, 'repo'), inst = path.join(tmp, 'inst'), reader = path.join(tmp, 'reader');
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  const text = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/01-第一回.md'), 'utf8');
  const paras = text.split('\n\n');
  const k = paras.findIndex((p, i) => i > 2 && /。$/.test(p) && !p.startsWith('#') && p.length > 30);
  const old = paras.map((p, i) => (i === k ? `${p}他又回头看了一眼。` : p)).join('\n\n');
  const sceneDir = path.join(repo, 'lingjing/worlds/jiuding/chapters/00-test/scenes');
  const scene = { version: 1, id: 't-scene', hui: 'h01', story: { zh: `${paras[k]}`, en: 'He went.' }, exits: [{ id: 'go', story: { zh: '别的话。', en: 'Other.' } }] };
  for (const d of [path.join(repo, 'lingjing/story/jiuding-lu'), sceneDir, path.join(inst, 'story/jiuding-lu'), path.join(inst, 'worlds/jiuding/chapters/00-test/scenes')]) fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'story/jiuding-lu/book.json'), path.join(repo, 'lingjing/story/jiuding-lu/book.json'));
  fs.writeFileSync(path.join(repo, 'lingjing/story/jiuding-lu/01-第一回.md'), text);
  fs.writeFileSync(path.join(sceneDir, 't-scene.json'), `${JSON.stringify(scene, null, 1)}\n`);
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('add', '.'); git('commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(reader, 'jiuding-lu'), { recursive: true });
  fs.writeFileSync(path.join(reader, 'jiuding-lu/meta.json'), '{"base":"test"}');
  fs.writeFileSync(path.join(reader, 'jiuding-lu/h01.md'), old);
  Object.assign(process.env, { LINGJING_READER: reader, LINGJING_DEV_REPO: repo, LINGJING_INSTALL_DIR: inst });
  const { changes } = await import('../scripts/rules/changes.mjs');
  try {
    const shown = changes({ book: 'jiuding-lu', id: 'h01' });
    assert.equal(shown.dev, true);
    const e = shown.entries.h01;
    // Listed by what changed in it: the sentence that went.
    assert.equal(e.count, 1);
    assert.match(e.items[0].head, /^删：他又回头看了一眼/);
    const n = e.items[0].n;
    // Shown first: nothing written.
    const pre = changes({ book: 'jiuding-lu', id: 'h01', do: 'preview', item: n, rev: e.rev });
    assert.equal(pre.ok, true);
    assert.equal(pre.swapped[0].was, `${paras[k]}他又回头看了一眼。`);
    assert.deepEqual(pre.scenes, ['lingjing/worlds/jiuding/chapters/00-test/scenes/t-scene.json']);
    assert.equal(fs.readFileSync(path.join(repo, 'lingjing/story/jiuding-lu/01-第一回.md'), 'utf8'), text);
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'revert', item: n, rev: 'other' }).refused, 'out-of-sync');
    // Someone's uncommitted change in the scene: refused, nothing written.
    fs.appendFileSync(path.join(sceneDir, 't-scene.json'), ' ');
    assert.equal(changes({ book: 'jiuding-lu', id: 'h01', do: 'revert', item: n, rev: e.rev }).refused, 'dirty');
    assert.equal(fs.readFileSync(path.join(repo, 'lingjing/story/jiuding-lu/01-第一回.md'), 'utf8'), text);
    git('checkout', '-q', '--', 'lingjing/worlds');
    const done = changes({ book: 'jiuding-lu', id: 'h01', do: 'revert', item: n, rev: e.rev });
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(fs.readFileSync(path.join(repo, 'lingjing/story/jiuding-lu/01-第一回.md'), 'utf8'), old, 'the book back to its original words, every other line as it was');
    const s2 = JSON.parse(fs.readFileSync(path.join(sceneDir, 't-scene.json'), 'utf8'));
    assert.equal(s2.story.zh, `${paras[k]}他又回头看了一眼。`, 'the scene quotes the book again');
    assert.equal(s2.exits[0].story.zh, '别的话。');
    assert.equal(git('status', '--porcelain').trim(), '', 'committed');
    assert.match(git('log', '-1', '--format=%s').trim(), /^lingjing 九鼎录 第一回: 改回原文（Hanli 在阅读器里）$/);
    assert.equal(fs.readFileSync(path.join(inst, 'story/jiuding-lu/01-第一回.md'), 'utf8'), old, 'the installed copy brought level');
    const pending = JSON.parse(fs.readFileSync(path.join(reader, 'en-pending.json'), 'utf8'));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].where, 't-scene');
    assert.equal(pending[0].en, 'He went.');
  } finally {
    for (const k2 of ['LINGJING_READER', 'LINGJING_DEV_REPO', 'LINGJING_INSTALL_DIR']) delete process.env[k2];
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a confirmed change stays confirmed: another paragraph edited later never brings it back', () => {
  const v1 = OLD.replace('他背着弓。', '他背着一张旧弓。').replace('鹿皮挂在墙上，干了。', '鹿皮挂在墙上，干透了。');
  const c1 = changesOf(OLD, v1);
  assert.equal(c1.count, 2);
  const conf = confirmItem(OLD, v1, 1); // 「他背着一张旧弓」 confirmed
  assert.match(conf, /^# 第一回　上联七个字　下联七个字\n/, 'the title line kept');
  const v2 = v1.replace('阿禾在[灶台]{注=zao}边等他。', '阿禾在[灶台]{注=zao}边等了他一夜。');
  const c2 = changesOf(conf, v2);
  assert.deepEqual(c2.items.map((it) => it.head), ['阿禾在灶台边等了他一夜。', '鹿皮挂在墙上，干透了。']);
  assert.ok(!c2.marks.some((m) => m.key === keyOf('小满上山。他背着一张旧弓。')), 'the confirmed paragraph is not marked');
});

test('a confirmed paragraph edited again: only the sentence newly changed is marked, listed by its own words', () => {
  const para = '小满上山。他背着弓。山风很大。他走得很慢。';
  const old = `# 第一回　上　下\n\n${para}\n\n别的。`;
  const v1 = old.replace('他背着弓。', '他背着一张旧弓。');
  const conf = confirmItem(old, v1, 1);
  assert.equal(changesOf(conf, v1).count, 0);
  const v2 = v1.replace('山风很大。', '山风很冷。');
  const c = changesOf(conf, v2);
  assert.equal(c.count, 1);
  assert.deepEqual(c.marks[0].s, [2], 'only 「山风很冷。」');
  assert.deepEqual(c.marks[0].gone, [{ at: 3, text: ['山风很大。'] }]);
  assert.equal(c.items[0].head, '山风很冷。');
  const html = renderMarkdown(v2, { changes: c });
  assert.match(html, /<p class="chg changed"[^>]*>小满上山。他背着一张旧弓。<mark class="chg-s">山风很冷。<\/mark>/);
});
