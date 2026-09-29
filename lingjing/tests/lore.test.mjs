// 她的来处 — Yinyue's past, given back one 鼎 at a time. Since 2026-09-29 her
// past is 银月的记忆 (memories.json, the fox demon-queen): 「银月记起的」 is the
// memories unlocked — a 鼎 brought home (`memory: n` on the exit) — and the
// old bell-child thread (laid in the water, the 守鼎人's bell, 文命) is retired.
// Nothing ahead ever reaches Look or Progress, nor anything before she joins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, progress } from '../scripts/rules.mjs';
import { recalledOf } from '../scripts/rules/companion.mjs';
import { memoriesOf } from '../scripts/rules/memories.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const MEM = memoriesOf(content).memories;
const NOW = new Date('2026-09-11T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const CHAPTERS = ['01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-jing', '07-liang', '08-yong', '09-yu'];
const withHer = (ended, memories = [], lang = 'zh') => ({ ...newState(content, lang, NOW), companion: { joined: '2026-09-11' }, ended, memories });
const upTo = n => CHAPTERS.slice(0, n);
const firstN = n => MEM.slice(0, n).map(m => m.n);
const ids = s => recalledOf(content, s).map(r => r.id);

test('the lore is well-formed; the bell-child thread is gone and stays gone', () => {
  assert.deepEqual(lint(content).filter(p => p.startsWith('lore')), []);
  assert.equal(content.lore.thread, undefined);
  assert.ok(lint({ ...content, lore: { ...content.lore, thread: [] } }).some(p => /thread is retired/.test(p)));
});

test('nothing of the old backstory is left where the game reads her past', () => {
  const old = /铃童|bell-child|放进水里|laid me in the water|守鼎|文命|Wenming|the-bell|laid-in-water/;
  for (const f of ['worlds/jiuding/companion.json', 'worlds/jiuding/memories.json', 'scripts/rules/companion.mjs', 'scripts/lu.js']) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/"_about":[^\n]*\n/, '');
    const hit = text.split('\n').find(l => old.test(l) && !/retired|was retired/.test(l));
    assert.equal(hit, undefined, `${f}: ${hit}`);
  }
  assert.equal(/铃/.test(JSON.stringify(content.lore.secret.unease)), false, 'the price shows on her without a bell');
});

test('nothing is recalled before she joins, whatever has come back', () => {
  const s = { ...newState(content, 'zh', NOW), ended: upTo(3), memories: firstN(3) };
  assert.deepEqual(recalledOf(content, s), []);
  assert.equal(look(s, content, ctx()).companion, null);
  assert.equal(progress(s, content, ctx()).result.her, null);
});

test('recalled is the memories unlocked, in order: 「title」 and her own lines', () => {
  for (let n = 0; n <= 8; n += 1) {
    const got = ids(withHer(upTo(n), firstN(n)));
    assert.deepEqual(got.filter(id => id !== 'secret' && id !== 'whole'), firstN(n).map(k => `memory-${k}`), `after ${n}`);
  }
  // A chapter ended with no memory brought home recalls nothing — the 鼎 alone gives one.
  assert.deepEqual(ids(withHer(upTo(2), [])), []);
  const one = MEM[0], line = recalledOf(content, withHer(upTo(1), [1])).find(r => r.id === 'memory-1').line;
  assert.equal(line, `「${one.title.zh}」${one.panels.flatMap(p => p.lines.zh).join('')}`);
  assert.equal(recalledOf(content, withHer(upTo(1), [1], 'en'))[0].line, `${one.title.en}: ${one.panels.flatMap(p => p.lines.en).join(' ')}`);
  // Not painted yet: what she knows of it.
  const bare = MEM.find(m => !m.panels.length);
  if (bare) assert.equal(recalledOf(content, withHer([], [bare.n]))[0].line, `「${bare.title.zh}」${bare.knows.zh}`);
});

test('the secret is never handed over before 雍 has ended — Look nor Progress', () => {
  const secret = [content.lore.secret.text.zh, content.lore.secret.resolved.zh];
  for (let n = 0; n <= 7; n += 1) {
    const s = withHer(upTo(n), firstN(n));
    const seen = JSON.stringify({ look: look(s, content, ctx()), her: progress(s, content, ctx()).result.her });
    for (const line of secret) assert.equal(seen.includes(line), false, `leaked after ${n} chapters`);
    assert.equal(ids(s).includes('secret'), false);
  }
  const told = withHer(upTo(8), firstN(8));
  assert.deepEqual(ids(told).slice(-1), ['secret']);
  assert.equal(ids(told).includes('whole'), false);
  assert.deepEqual(ids(withHer(upTo(9), firstN(9))).slice(-2), ['secret', 'whole']);
});

test('no later memory leaks: Look carries exactly what has come back', () => {
  const s = withHer(upTo(1), [1]);
  const brief = look(s, content, ctx());
  assert.deepEqual(brief.companion.recalled.map(r => r.id), ['memory-1']);
  const text = JSON.stringify(brief);
  for (const m of MEM.slice(1)) assert.equal(text.includes(m.knows.zh), false, `memory ${m.n} leaked`);
});

test('Progress gives her the memories, where she stands now, and her fear', () => {
  const her = progress(withHer(upTo(2), [1]), content, ctx()).result.her;
  assert.equal(her.recalled.length, 1);
  assert.equal(her.cauldrons, 2);
  const j = content.lore.joined;
  assert.equal(her.stance, `${j.knows.zh} ${MEM[0].knows.zh} ${j.feels.zh}`);
  assert.equal(her.fear, content.lore.fear.zh);
  // Found, nothing back yet: where she stood when she joined.
  assert.equal(progress(withHer([]), content, ctx()).result.her.stance, `${j.knows.zh} ${j.feels.zh}`);
  // Her private want is never handed to anyone.
  const all = JSON.stringify(progress(withHer(upTo(9), firstN(9)), content, ctx()).result) + JSON.stringify(look(withHer(upTo(9), firstN(9)), content, ctx()));
  assert.equal(all.includes(content.lore.want.zh), false);
});

test('a memory number the world does not have, or a chapter not written yet, breaks nothing', () => {
  assert.deepEqual(ids(withHer(['01-ji', '10-none'], [1, 42])), ['memory-1']);
});
