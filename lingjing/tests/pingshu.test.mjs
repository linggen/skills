// 评书 heard (Hanli, 2026-10-01): the dialogue box voices each beat with its
// book paragraph's clip, and a 回 finished can be listened to whole (录, the
// reader). The clips live on the CDN; story/jiuding-lu/audio.json maps a
// paragraph's key to its file. The key is computed twice — by the publisher
// in Python (tools/pingshu-publish.py para_key) from the book, by the page in
// JS (scripts/pingshu.js paraKey) from a beat's text — and must agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { beatsOf, passageFor } from '../scripts/rules/tell.mjs';
import { dialogHtml, withTold } from '../scripts/dialogue.js';
import { luHtml } from '../scripts/lu.js';
import { EMPTY, clipOf, createNarrator, fullOf, hasAudio, keepListenAt, listenAt, listenHtml, loadManifest, normPara, paraKey, setVoice, voiceOn, withBase } from '../scripts/pingshu.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOOK = path.join(ROOT, 'story/jiuding-lu');
// Every 古 回's file, as book.json names it (01-第一回.md … 08-第八回.md).
const GU_FILES = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8')).volumes.flatMap((v) => v.hui).filter((h) => h.line === 'gu').map((h) => h.file);
const mdOf = (file) => fs.readFileSync(path.join(BOOK, file), 'utf8');
const bookParas = (md) => md.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^(-{3,}|\*{3,})$/.test(l));
const manifest = JSON.parse(fs.readFileSync(path.join(BOOK, 'audio.json'), 'utf8'));

/* The publisher's keys for these texts, from Python. */
function pyKeys(texts) {
  const code = `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('pub',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps([m.para_key(t) for t in json.load(sys.stdin)]))`;
  return JSON.parse(execFileSync('python3', ['-c', code, path.join(ROOT, 'tools/pingshu-publish.py')], { input: JSON.stringify(texts), encoding: 'utf8' }));
}

test('the page and the publisher make the same key from the same text — every paragraph of the book, every beat of the scenes', () => {
  const tricky = ['[这个少年]{注=xiaoman}，姓沈——名小满。', '《史记》{典=shiji}说：「一、二、三……」', '**天人合一**', 'ABC 123 ok', '', '——', '𠀀字外'];
  const texts = [...tricky, ...GU_FILES.map((f) => bookParas(mdOf(f))).flat(), ...playedBeats().map((b) => b.text)];
  assert.deepEqual(texts.map(paraKey), pyKeys(texts));
  assert.equal(paraKey('——'), '', 'nothing to say, no key');
  assert.equal(normPara('[娘]{注=mama}说：「好。」'), '娘说好');
  assert.equal(paraKey('「好」——他说。'), paraKey('“好”，他说'), 'quotes and dashes never decide a match (pingshu.py spoken)');
});

/* Every scene's passage as the box plays it (zh), beat by beat, with its 回 —
   through the rules' own passageFor (fills, ⟪⟫) and beatsOf. */
const BRANCHES = new Set(fs.readFileSync(path.join(ROOT, 'tests/scene-book-sync.test.mjs'), 'utf8').match(/const BRANCHES = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[^']+'/g).map((q) => q.slice(1, -1)));
function playedBeats() {
  const content = loadContent(), s = newState(content, 'zh', new Date('2026-09-28T12:00:00'));
  const out = [];
  for (const ch of Object.values(content.chapters)) {
    for (const sc of Object.values(ch.scenes ?? {})) {
      const stories = [[sc.id, sc.story], ...(sc.exits ?? []).map((x) => [`${sc.id}/${x.id}`, x.story])];
      for (const [where, pair] of stories) {
        if (!pair?.zh || !sc.hui) continue;
        const text = passageFor(content, s, pair);
        for (const b of beatsOf(content, s, { of: 'scene', id: sc.id, text })) out.push({ where, hui: sc.hui, text: b.text, branch: BRANCHES.has(where) });
      }
    }
  }
  return out;
}
const played = playedBeats();

test('the manifest: its shape, and every clip a beat the box plays today, found from the beat\'s own text', () => {
  assert.equal(manifest.base, 'https://media.linggen.dev/jiuding-lu/');
  const live = new Map();
  for (const b of played) live.set(`${b.hui}:${paraKey(b.text)}`, b);
  // A scene edited since the publish leaves its old clip unused (harmless, silent);
  // most must be live, or the publisher's key and the page's have drifted apart.
  let all = 0, stale = 0;
  for (const [hui, h] of Object.entries(manifest.hui)) {
    for (const [k, c] of Object.entries(h.paras ?? {})) {
      all++;
      if (!live.has(`${hui}:${k}`)) stale++;
      assert.match(c.file, /^p\/[0-9a-f]{16}\.m4a$/);
      assert.ok(c.secs > 0);
    }
    if (h.full) assert.match(h.full.file, new RegExp(`^h/${hui}-[0-9a-f]{16}\\.m4a$`));
  }
  if (stale) console.log(`[pingshu] ${stale}/${all} clips no longer a beat of their scenes — rerun tools/pingshu-publish.py`);
  assert.ok(!all || stale / all <= 0.2, `${stale}/${all} clips match no beat: the keys have drifted`);
});

test('a beat finds its clip — the hit rate on the scenes\' own text', () => {
  const beats = played.filter((b) => !b.branch);
  assert.ok(beats.length > 1000, `only ${beats.length} beats`);
  const rate = (xs) => (xs.length ? `${((xs.filter((b) => clipOf(manifest, b.hui, b.text)).length / xs.length) * 100).toFixed(1)}%` : '—');
  const byHui = Object.keys(manifest.hui).map((h) => `${h} ${rate(beats.filter((b) => b.hui === h))}`).join(', ');
  console.log(`[pingshu] non-branch beats ${beats.length}; with a clip ${rate(beats)} overall; by 回 with audio: ${byHui || 'none yet'}`);
  // A 回 rendered whole: nearly every beat is heard (the rest: no clean pause to cut at, or not the book's sentences).
  for (const [hui, h] of Object.entries(manifest.hui)) {
    if (!h.full) continue;
    const mine = beats.filter((b) => b.hui === hui), heard = mine.filter((b) => clipOf(manifest, hui, b.text));
    assert.ok(heard.length / mine.length >= 0.85, `${hui}: only ${heard.length}/${mine.length} beats voiced`);
  }
  const one = beats.find((b) => clipOf(manifest, b.hui, b.text));
  if (one) assert.match(clipOf(manifest, one.hui, one.text).url, /^https:\/\/media\.linggen\.dev\/jiuding-lu\/p\/[0-9a-f]{16}\.m4a$/);
});

test('no manifest, no audio: nothing breaks, nothing shows', async () => {
  assert.equal(clipOf(EMPTY, 'h01', '小满醒了。'), null);
  assert.equal(fullOf(EMPTY, 'h01'), null);
  assert.equal(hasAudio(EMPTY), false);
  assert.equal(listenHtml(EMPTY, 'h01'), '');
  assert.equal(clipOf(null, 'h01', 'x'), null);
  assert.deepEqual(withBase(null), EMPTY);
  assert.deepEqual(withBase({ base: 'x' }), EMPTY, 'no hui: empty');
  assert.deepEqual(await loadManifest('jiuding-lu', { fetcher: async () => { throw new Error('offline'); } }), EMPTY);
  assert.deepEqual(await loadManifest('jiuding-lu', { fetcher: async () => ({ ok: false }) }), EMPTY);
  assert.deepEqual(await loadManifest('jiuding-lu', { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }) }), EMPTY);
  // the box: no audio, no switch
  const r = withTold(null, [{ of: 'scene', id: 'x', beats: [{ text: 'a' }] }], 's');
  assert.doesNotMatch(dialogHtml(r), /data-dlg-voice/);
  assert.match(dialogHtml(r, { voice: true }), /data-dlg-voice aria-pressed="true"[^>]*>有声</);
  assert.match(dialogHtml(r, { voice: false, lang: 'en' }), /aria-pressed="false"[^>]*>Voice off</);
  // 录: a 回 done with no audio has no 听书
  const book = { ok: true, chapters: [{ id: 'h01', title: '第一回', state: 'done', recap: [] }, { id: 'h02', title: '第二回', state: 'current', recap: [] }] };
  assert.doesNotMatch(luHtml(book, { listen: (h) => listenHtml(EMPTY, h) }), /data-listen/);
  assert.doesNotMatch(luHtml(book), /data-listen/);
});

test('听书: a 回 done with its whole telling shows the player in 录; one not done does not', () => {
  const m = withBase({ base: 'https://cdn.example/x', hui: { h01: { full: { file: 'h/h01-aa.m4a', secs: 1500 }, paras: {} }, h02: { full: { file: 'h/h02-bb.m4a' }, paras: {} } } }, 'http://127.0.0.1:8000/jiuding-lu');
  assert.equal(fullOf(m, 'h01').url, 'http://127.0.0.1:8000/jiuding-lu/h/h01-aa.m4a', '?audio_base= overrides, a slash added');
  const book = { ok: true, chapters: [{ id: 'h01', title: '第一回', state: 'done', recap: [] }, { id: 'h02', title: '第二回', state: 'current', recap: [] }] };
  const html = luHtml(book, { listen: (h) => listenHtml(m, h) });
  assert.match(html, /data-listen-slot="h01"/);
  assert.match(html, /data-listen-url="http:\/\/127\.0\.0\.1:8000\/jiuding-lu\/h\/h01-aa\.m4a"/);
  assert.doesNotMatch(html, /data-listen-slot="h02"/, 'the 回 being played is not yet heard whole');
});

test('per viewer: the voice switch and the place listened to, with or without storage', () => {
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(voiceOn(store), true, 'on until turned off');
  setVoice(false, store);
  assert.equal(voiceOn(store), false);
  keepListenAt('h03', 123.7, store);
  assert.equal(listenAt('h03', store), 123);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(voiceOn(broken), true);
  assert.equal(setVoice(false, broken), false);
  assert.equal(listenAt('h03', broken), 0);
  assert.equal(voiceOn(undefined), true);
});

test('the narrator: a beat plays once, a repaint never restarts it, the next beat or none stops it', () => {
  const log = [];
  const fake = () => ({ pause: () => log.push('pause'), removeAttribute: () => {}, load: () => {}, play: () => { log.push('play'); return Promise.reject(new Error('NotAllowed')); }, set src(u) { log.push(`src ${u}`); } });
  const n = createNarrator(fake);
  n.sync('a.m4a', 'beat1');
  n.sync('a.m4a', 'beat1');
  assert.deepEqual(log, ['src a.m4a', 'play'], 'a repaint plays nothing again; a refused play is silence');
  n.sync('b.m4a', 'beat2');
  assert.deepEqual(log.slice(2), ['pause', 'src b.m4a', 'play']);
  n.sync(null);
  assert.equal(n.playing, null);
  assert.equal(log.at(-1), 'pause');
  n.sync(null);
  assert.equal(log.filter((l) => l === 'pause').length, 2, 'stopping twice is once');
});
