// 九鼎录 · 前情提要 · story nodes (redesign-v2 § 六; rules/story.mjs). The book
// is the authored recap of what the player has DONE, in the order done; a
// chapter not reached is a dark cauldron and nothing more. The ending marks
// the save once; 前情提要 is owed after a while away and handed to Ling once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, owesRecap, resolve, story } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const CH = ['01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-jing', '07-liang', '08-yong', '09-yu'];
const scenesOf = id => Object.keys(content.chapters[id].scenes);
const pz = (pair, lang = 'zh') => pair[lang];

/* A save standing in `chapter` with `done` of its scenes passed and every chapter before it ended. */
function at(chapter, done = [], extra = {}) {
  const i = CH.indexOf(chapter);
  const before = ['00-prologue', ...CH.slice(0, Math.max(0, i))];
  const passed = before.flatMap(scenesOf);
  const scene = content.chapters[chapter].scenes[done.length ? nextOf(chapter, done.at(-1)) : content.chapters[chapter].first_scene];
  return { ...newState(content, 'zh', NOW), chapter, scene: scene.id, place: scene.at, ended: before, done_scenes: [...passed, ...done], ...extra };
}
const nextOf = (chapter, id) => content.chapters[chapter].scenes[id].exits.find(e => e.next)?.next;
const roadOf = chapter => {
  const out = [];
  for (let id = content.chapters[chapter].first_scene; id && !out.includes(id); id = nextOf(chapter, id)) out.push(id);
  return out;
};

test('a new game: nine dark cauldrons, the prologue current, nothing of what lies ahead', () => {
  const r = story(newState(content, 'zh', NOW), content, ctx()).result;
  assert.equal(r.ok, true);
  assert.equal(r.cauldrons.length, 9);
  assert.ok(r.cauldrons.every(c => c.state === 'dark' && !c.title), 'a dark cauldron gives only its province');
  assert.deepEqual(r.chapters.map(c => [c.id, c.state]), [['00-prologue', 'current']]);
  assert.deepEqual(r.chapters[0].recap, []);
  assert.equal(r.her, null);
  assert.deepEqual(r.open, [pz(content.chapters['00-prologue'].mystery)]);
  const text = JSON.stringify(r);
  for (const id of CH) for (const k of ['title', 'intro', 'mystery']) assert.equal(text.includes(pz(content.chapters[id][k])), false, `${id} ${k}`);
});

test('mid-chapter: the chapters ended and the current one, recaps in the order played, never a scene not reached', () => {
  const road = roadOf('02-yan');
  const s = at('02-yan', road.slice(0, 2));
  const r = story(s, content, ctx()).result;
  assert.deepEqual(r.cauldrons.map(c => c.state), ['found', 'current', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark']);
  assert.equal(r.found, 1);
  assert.deepEqual(r.chapters.map(c => [c.id, c.state]), [['00-prologue', 'done'], ['01-ji', 'done'], ['02-yan', 'current']]);
  const cur = r.chapters.at(-1);
  assert.deepEqual(cur.recap, road.slice(0, 2).map(id => pz(content.chapters['02-yan'].scenes[id].recap)));
  assert.ok(cur.now, 'the current chapter says where it stands');
  assert.equal(cur.intro, pz(content.chapters['02-yan'].intro));
  const text = JSON.stringify(r);
  for (const id of road.slice(2)) assert.equal(text.includes(pz(content.chapters['02-yan'].scenes[id].recap)), false, `${id} leaked`);
  for (const id of CH.slice(2)) for (const k of ['title', 'intro', 'mystery']) assert.equal(text.includes(pz(content.chapters[id][k])), false, `${id} ${k}`);
  for (const sc of Object.values(content.chapters['03-qing'].scenes)) assert.equal(text.includes(pz(sc.recap)), false);
});

test('the people met: the scenes\' cast, beasts tamed and fought, rumor folk — and her memories once she walks along', () => {
  const s = at('02-yan', [], { cast: ['fuzhu'], duels: { paoxiao: { day: '2026-09-10', outcome: 'won' } }, known: [{ id: 'old-li', name: '老李', role: '渔夫', voice: '慢', from: '河上灯' }] });
  const r = story(s, content, ctx()).result;
  const kinds = Object.fromEntries(r.people.map(p => [p.id, p.kind]));
  assert.equal(kinds.fuzhu, 'tamed');
  assert.equal(kinds.paoxiao, 'story', 'met in 冀 before it was fought');
  assert.equal(kinds['known:old-li'], 'known');
  assert.ok(!r.people.some(p => p.id === 'yinyue'), 'she is her own page');
  const her = story({ ...s, companion: { joined: '2026-09-01' } }, content, ctx()).result.her;
  assert.deepEqual(her, [pz(content.lore.thread[0].memory.text)]);
});

test("Ling's Story is small — every chapter ended, in Chinese, under ~3 KB", () => {
  const s = { ...at('09-yu', roadOf('09-yu').slice(0, -1)), done_scenes: [...at('09-yu').done_scenes, ...roadOf('09-yu')], ended: ['00-prologue', ...CH], scene: null, companion: { joined: '2026-09-01' }, ending: { id: 'dingding', at: NOW.toISOString() } };
  const full = story(s, content, ctx()).result;
  const short = forLing(story(s, content, ctx(), { short: 'true' }).result);
  assert.equal(full.chapters.length, 10);
  assert.ok(Buffer.byteLength(JSON.stringify(short)) <= 3200, `${Buffer.byteLength(JSON.stringify(short))} bytes`);
  assert.ok(Buffer.byteLength(JSON.stringify(short)) < Buffer.byteLength(JSON.stringify(full)));
  assert.deepEqual(short.ending, { id: 'dingding', title: '定鼎', at: NOW.toISOString() });
  assert.deepEqual(short.open, []);
});

test('the ending: the chapter that carries it marks the save once; Look and Story name it', () => {
  const road = roadOf('09-yu');
  const s = at('09-yu', road.slice(0, -1), { tier: 'nascent', stamina: 100 });
  const end = content.chapters['09-yu'].scenes[road.at(-1)];
  const out = resolve(s, content, ctx(), { exit: end.exits.find(e => e.ends).id });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.equal(out.state.ending.id, 'dingding');
  assert.equal(out.result.node.kind, 'cauldron');
  assert.equal(out.result.node.ending, '定鼎');
  assert.equal(out.result.node.found, 9);
  assert.deepEqual(look(out.state, content, ctx()).ending, { id: 'dingding', title: '定鼎' });
  assert.equal(story(out.state, content, ctx()).result.ending.title, '定鼎');
  assert.equal(look(s, content, ctx()).ending, undefined, 'not before');
});

test('story nodes: a scene passed carries its recap; a cauldron its memory once she walks along; a replay nothing', () => {
  const s = at('01-ji', [], { stamina: 100 });
  const first = content.chapters['01-ji'].scenes[s.scene];
  const step = resolve(s, content, ctx(), { exit: first.exits.find(e => e.next && !e.game && !e.key && !e.needs).id });
  assert.equal(step.result.ok, true, JSON.stringify(step.result));
  assert.equal(step.result.node.kind, 'scene');
  assert.equal(step.result.node.recap, pz(first.recap));
  assert.equal(step.result.node.mystery, pz(content.chapters['01-ji'].mystery));
  assert.equal(look(step.state, content, ctx()).story_node.kind, 'scene', 'the page sees it on Look');
  assert.equal(look(step.state, content, ctx(new Date(NOW.getTime() + 3600000))).story_node, undefined, 'only while fresh');

  const road = roadOf('01-ji');
  const last = { ...at('01-ji', road.slice(0, -1), { stamina: 100, companion: { joined: '2026-09-01' } }) };
  const endScene = content.chapters['01-ji'].scenes[road.at(-1)];
  const found = resolve(last, content, ctx(), { exit: endScene.exits.find(e => e.ends).id });
  assert.equal(found.result.ok, true, JSON.stringify(found.result));
  assert.equal(found.result.node.kind, 'cauldron');
  assert.equal(found.result.node.found, 1);
  assert.deepEqual(found.result.node.memory, [pz(content.lore.thread[0].memory.text)]);
  assert.equal(found.result.node.next.id, '02-yan');

  // Walked back into an ended chapter, a scene is story only: no node.
  const replay = { ...at('02-yan'), chapter: '01-ji', scene: first.id, place: first.at, stamina: 100 };
  const again = resolve(replay, content, ctx(), { exit: first.exits.find(e => e.next && !e.game && !e.key && !e.needs).id });
  assert.equal(again.result.node, undefined);
});

test('Look: a chapter just begun carries its intro (the title card); one scene in, it does not', () => {
  const s = at('02-yan');
  assert.deepEqual(look(s, content, ctx()).chapter, { id: '02-yan', title: pz(content.chapters['02-yan'].title), fresh: true, intro: pz(content.chapters['02-yan'].intro) });
  const on = at('02-yan', roadOf('02-yan').slice(0, 1));
  assert.deepEqual(look(on, content, ctx()).chapter, { id: '02-yan', title: pz(content.chapters['02-yan'].title) });
});

test('前情提要 is owed after a while away, not after a short break, and never with no story', () => {
  const day = h => new Date(NOW.getTime() + h * 3600000);
  const played = () => ({ ...at('01-ji', roadOf('01-ji').slice(0, 2)), updated: NOW.toISOString() });
  assert.equal(owesRecap(played(), day(2)), false, 'two hours, same day');
  assert.equal(owesRecap(played(), day(13)), true, 'thirteen hours');
  const late = { ...played(), updated: new Date('2026-09-11T22:00:00').toISOString() };
  assert.equal(owesRecap(late, new Date('2026-09-12T00:30:00')), false, 'past midnight after a short break');
  assert.equal(owesRecap(late, new Date('2026-09-12T08:00:00')), true, 'the next morning');
  assert.equal(owesRecap({ ...newState(content, 'zh', NOW), updated: NOW.toISOString() }, day(48)), false, 'nothing to recap yet');
  const s = played();
  owesRecap(s, day(30));
  const r = look(s, content, ctx(day(30)));
  assert.equal(r.recap_due, true);
  const recapOf = id => Object.values(content.chapters).find(c => c.scenes[id]).scenes[id].recap;
  assert.deepEqual(r.recap.lines, s.done_scenes.map(id => pz(recapOf(id))).slice(-3), 'the last three lines lived, in order');
  assert.equal(r.recap.mystery, pz(content.chapters['01-ji'].mystery));
  // Told, it is not owed again right away.
  const told = { ...s, recap: { told: day(30).toISOString() } };
  assert.equal(owesRecap(told, day(31)), false);
  assert.equal(look(told, content, ctx(day(31))).recap_due, undefined);
});

test('the command line: owed on the first call after a while away, kept without a log line, handed to Ling once', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-recap-'));
  try {
    const file = path.join(data, 'state.json');
    const away = new Date('2026-09-13T09:00:00');
    fs.writeFileSync(file, JSON.stringify({ ...at('01-ji', roadOf('01-ji').slice(0, 2)), updated: NOW.toISOString() }));
    const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], {
      cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8',
      env: { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: away.toISOString() },
    }).stdout);
    const page = cli('look');
    assert.equal(page.recap_due, true);
    assert.ok(page.recap.lines.length >= 2);
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).recap.owed, 'kept on the save');
    const log = path.join(data, 'log.jsonl');
    assert.equal(fs.existsSync(log) ? fs.readFileSync(log, 'utf8').includes('"verb":"look"') : false, false, 'no log line: Undo is for moves');
    // The book is a read — the page's Verb and Ling's short one.
    const book = cli('story');
    assert.equal(book.ok, true);
    assert.equal(book.chapters.at(-1).id, '01-ji');
    const ling = cli('look', '--for=ling');
    assert.equal(ling.recap_due, true);
    assert.equal(ling.story_node, undefined);
    assert.equal(cli('look', '--for=ling').recap_due, undefined, 'handed over once');
    assert.equal(cli('look').recap_due, undefined);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the page\'s book draws the read as it is — every word escaped, a dark cauldron its province only', async () => {
  const { luHtml, titleCardHtml } = await import('../scripts/lu.js');
  const s = at('02-yan', roadOf('02-yan').slice(0, 1), { companion: { joined: '2026-09-01' }, known: [{ id: 'x', name: '<img src=x onerror=alert(1)>', role: 'r', voice: 'v', from: '"t"' }] });
  const book = story(s, content, ctx()).result;
  const html = luHtml(book, { lang: 'zh', her: '银月' });
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
  assert.equal((html.match(/class="ding dark"/g) ?? []).length, 7);
  assert.ok(html.includes(pz(content.chapters['02-yan'].scenes[roadOf('02-yan')[0]].recap)));
  assert.ok(html.includes('银月记起的'));
  assert.equal(luHtml(null).includes('九鼎录'), true, 'a failed read still draws a closable book');
  const card = titleCardHtml(look(at('02-yan'), content, ctx()).chapter, 'zh');
  assert.ok(card.includes(pz(content.chapters['02-yan'].intro)) && card.includes('data-titlecard="02-yan"'));
  assert.equal(titleCardHtml(look(s, content, ctx()).chapter, 'zh'), '', 'one scene in, no card');
});
