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
import { forLing, look, owesRecap, resolve, story, VERBS } from '../scripts/rules.mjs';

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

/* ── Her beat (Hanli, 2026-09-24): 银月 says her own words; Ling writes the scene only ── */

const xu = (extra = {}) => {
  const tiers = content.ladder.tiers, below = tiers[tiers.findIndex(t => t.gate === content.chapters['04-xu'].gate) - 1];
  return at('04-xu', ['04-arrive', '04-town'], { tier: below.id, step: 0, progress: 0, stamina: 100, name: '清玄', ...extra });
};
const JOINED = { companion: { joined: '2026-09-11' } };
const hersIn = lines => (lines ?? []).filter(l => l.who === 'yinyue');

test('her beat: a scene line of hers, once she walks along, is hers to say — facts with the line as reference, nothing of hers for Ling to read', () => {
  const s = xu(JOINED);
  assert.equal(s.scene, '04-mouth');
  const r = resolve(s, content, ctx(), { exit: 'swim' });
  assert.equal(r.result.ok, true);
  // Nothing of hers in what Ling reads out: not the exit's beat, not the scene walked into.
  assert.deepEqual(hersIn(r.result.beat), []);
  assert.equal(r.result.scene?.id, '04-deep', 'swam through to 泗渊');
  assert.deepEqual(hersIn(r.result.scene.lines), []);
  // Hers: the exit's line and the deep's, as her reference, with what happened.
  const swim = content.chapters['04-xu'].scenes['04-mouth'].exits.find(e => e.id === 'swim');
  const h = r.result.her_beat;
  assert.equal(h.id, '04-mouth/swim');
  assert.ok(h.facts.line.includes(pz(hersIn(swim.beat)[0].text)));
  assert.ok(h.facts.line.includes(pz(hersIn(content.chapters['04-xu'].scenes['04-deep'].lines)[0].text)));
  assert.ok(h.facts.happened);
  // Ling's copy says she speaks here and what happened — never her line.
  const ling = forLing(r.result);
  assert.deepEqual(Object.keys(ling.her_beat.facts), ['happened']);
  const deep = content.chapters['04-xu'].scenes['04-deep'];
  for (const l of [...hersIn(swim.beat), ...hersIn(deep.lines)]) assert.ok(!JSON.stringify(ling).includes(pz(l.text)), pz(l.text));
  // One node for the page: the scene passed carries her beat — one moment, one line from her.
  assert.equal(r.state.node.kind, 'scene');
  assert.equal(r.state.node.her_beat.id, '04-mouth/swim');
  assert.equal(r.result.node.her_beat, undefined, 'Ling\'s node carries no line of hers');
  const l = look(r.state, content, ctx());
  assert.equal(l.story_node.her_beat.facts.line, h.facts.line);
  assert.equal(forLing(l).story_node, undefined);
  // Look reads the scene without her line too.
  assert.deepEqual(hersIn(l.scene.lines), []);
});

test('her beat: before she is found, her line is the `alone` narration — Ling\'s, as ever — and no beat of hers', () => {
  const s = xu();
  const r = resolve(s, content, ctx(), { exit: 'swim' });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.her_beat, undefined);
  assert.equal(r.state.node.her_beat, undefined);
  const swim = content.chapters['04-xu'].scenes['04-mouth'].exits.find(e => e.id === 'swim');
  const alone = pz(hersIn(swim.beat)[0].alone);
  assert.ok(r.result.beat.some(b => b.who === 'ling' && b.text === alone));
  assert.ok(r.result.scene.lines.some(b => b.who === 'ling' && b.text === pz(hersIn(content.chapters['04-xu'].scenes['04-deep'].lines)[0].alone)));
});

test('her beat: a staying exit gives a node of its own; walking into a scene with her line gives hers; a scene without, nothing', () => {
  // 逃: the scene stays, no story node — her beat is the page's moment by itself.
  const fled = resolve(xu(JOINED), content, ctx(), { exit: 'flee' });
  assert.equal(fled.result.ok, true);
  assert.equal(fled.result.node, undefined);
  assert.equal(fled.state.node.kind, 'beat');
  assert.ok(fled.result.her_beat.facts.line);
  // Move into 泗口 — the mouth's opening line is hers.
  const town = { ...xu(JOINED), scene: '04-mouth', place: 'pengcheng' };
  const moved = VERBS.move(town, content, ctx(), { place: 'sikou' });
  assert.equal(moved.result.ok, true);
  assert.equal(moved.result.scene?.id, '04-mouth');
  assert.equal(moved.result.her_beat.id, '04-mouth');
  assert.deepEqual(hersIn(moved.result.scene.lines), []);
  assert.equal(moved.state.node.kind, 'beat');
  // Unjoined, the same walk is Ling's narration only.
  const alone = VERBS.move({ ...town, companion: undefined }, content, ctx(), { place: 'sikou' });
  assert.equal(alone.result.her_beat, undefined);
});

test('her beat on the page: its own moment is hers alone (big, no converse); with a node it rides in the node\'s moment — one beat, one line', async () => {
  const { flagsOf, nodeMoment } = await import('../scripts/voice.js');
  assert.deepEqual(flagsOf('her_beat'), { big: true });
  const her = { id: '04-mouth/swim', facts: { happened: '你潜下去。', line: '离在南。' } };
  // A beat without a node: her own moment, the line her reference.
  const alone = nodeMoment({ kind: 'beat', at: NOW.toISOString(), her_beat: her });
  assert.equal(alone.id, 'her_beat');
  assert.match(alone.zh, /「离在南。」/); assert.match(alone.zh, /参考/); assert.match(alone.en, /say it your way, same meaning/);
  // With a scene passed: the node's one moment carries it (converse, as ever) — not a second one.
  const plain = nodeMoment({ kind: 'scene', at: NOW.toISOString(), recap: '过了泗口。' });
  const both = nodeMoment({ kind: 'scene', at: NOW.toISOString(), recap: '过了泗口。', her_beat: her });
  assert.equal(both.id, plain.id);
  assert.equal(flagsOf(both.id).converse, true);
  assert.match(both.zh, /过了泗口/); assert.match(both.zh, /「离在南。」/);
  assert.doesNotMatch(plain.zh, /离在南/);
  assert.doesNotMatch(both.zh, /说说你觉得这意味着什么/, 'one line from her: her beat, not a second ask');
  // The page raises a node through nodeMoment only.
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /const m = nodeMoment\(n\);/);
});
