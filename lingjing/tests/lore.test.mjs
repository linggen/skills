// 她的来处 — Yinyue's past, given back one cauldron at a time. What she has
// recalled is a function of the chapters ended (and whether she has joined);
// nothing ahead ever reaches Look or Progress. Chapters 4–9 may not be written
// yet: the rules key off chapter ids and tolerate their absence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, progress } from '../scripts/rules.mjs';
import { recalledOf } from '../scripts/rules/companion.mjs';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const CHAPTERS = ['01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-jing', '07-liang', '08-yong', '09-yu'];
const withHer = (ended, lang = 'zh') => ({ ...newState(content, lang, NOW), companion: { joined: '2026-09-11' }, ended });
const upTo = n => CHAPTERS.slice(0, n);
const ids = s => recalledOf(content, s).map(r => r.id);

test('the lore is well-formed and matches the world', () => {
  assert.deepEqual(lint(content).filter(p => p.startsWith('lore')), []);
  assert.deepEqual(content.lore.thread.map(e => e.chapter), CHAPTERS);
});

test('nothing is recalled before she joins, whatever has ended', () => {
  const s = { ...newState(content, 'zh', NOW), ended: upTo(3) };
  assert.deepEqual(recalledOf(content, s), []);
  assert.equal(look(s, content, ctx()).companion, null);
  assert.equal(progress(s, content, ctx()).result.her, null);
});

test('recalled grows with the chapters ended, one memory each, in order', () => {
  for (let n = 0; n <= 9; n += 1) {
    const got = ids(withHer(upTo(n)));
    const want = content.lore.thread.slice(0, n).map(e => e.memory.id);
    assert.deepEqual(got.filter(id => id !== 'secret' && id !== 'whole'), want, `after ${n} chapters`);
  }
  // Joining late tells the first two at once (she was not there for them).
  assert.deepEqual(ids(withHer(upTo(2))), ['laid-in-water', 'the-hand']);
});

test("chapter 3's memory is the line the spine scene already gives her", () => {
  const scene = content.chapters['03-qing'].scenes['03-cauldron'].lines.find(l => l.who === 'yinyue');
  const r = recalledOf(content, withHer(upTo(3))).find(x => x.id === 'salt-water');
  assert.equal(r.line, scene.text.zh);
  assert.equal(recalledOf(content, withHer(upTo(3), 'en')).find(x => x.id === 'salt-water').line, scene.text.en);
});

test('the secret is never handed over before 雍 has ended — Look nor Progress', () => {
  const secret = [content.lore.secret.text.zh, content.lore.secret.resolved.zh];
  for (let n = 0; n <= 7; n += 1) {
    const s = withHer(upTo(n));
    const seen = JSON.stringify({ look: look(s, content, ctx()), her: progress(s, content, ctx()).result.her });
    for (const line of secret) assert.equal(seen.includes(line), false, `leaked after ${n} chapters`);
    assert.equal(ids(s).includes('secret'), false);
  }
  const told = withHer(upTo(8));
  assert.deepEqual(ids(told).slice(-1), ['secret']);
  assert.equal(ids(told).includes('whole'), false);
  assert.deepEqual(ids(withHer(upTo(9))).slice(-2), ['secret', 'whole']);
});

test('no later memory leaks: Look carries exactly what has been recalled', () => {
  const s = withHer(upTo(4));
  const brief = look(s, content, ctx());
  assert.deepEqual(brief.companion.recalled.map(r => r.id), ['laid-in-water', 'the-hand', 'salt-water', 'the-bell']);
  const text = JSON.stringify(brief);
  for (const e of content.lore.thread.slice(4)) assert.equal(text.includes(e.memory.text.zh), false, `${e.chapter} leaked`);
});

test('Progress gives her the memories, where she stands now, and her fear', () => {
  const her = progress(withHer(upTo(5)), content, ctx()).result.her;
  assert.equal(her.recalled.length, 5);
  assert.equal(her.cauldrons, 5);
  const at = content.lore.thread[4];
  assert.equal(her.stance, `${at.knows.zh} ${at.feels.zh}`);
  assert.equal(her.fear, content.lore.fear.zh);
  // Found, nothing ended yet (a save that joined before any chapter ended): the joined stance.
  assert.equal(progress(withHer([]), content, ctx()).result.her.stance, `${content.lore.joined.knows.zh} ${content.lore.joined.feels.zh}`);
  // Her private want is never handed to anyone.
  const all = JSON.stringify(progress(withHer(upTo(9)), content, ctx()).result) + JSON.stringify(look(withHer(upTo(9)), content, ctx()));
  assert.equal(all.includes(content.lore.want.zh), false);
});

test('an ended chapter whose data is not written yet gives nothing and breaks nothing', () => {
  const s = withHer(['01-ji', '10-none']);
  assert.deepEqual(ids(s), ['laid-in-water']);
});
