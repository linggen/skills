// 剧情 × 开放世界 (design.md; his, 2026-09-28: 「关键剧情的时候关闭开放世界探索，走剧情；
// 走完之后才开放地图探索。」): every key beat a chapter declares (chapter.json `beats`) shuts
// the map from the scene after its entry to its last — the save carries `lock: {beat, since}`,
// Look says why, Move refuses `corridor` in the beat's words, the page greys every walk — and
// opens it again on the scene after. And the threads: gold 主线, silver 人物线, grey 杂务, data
// on every errand, drawn in the 事 book and on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint, THREADS } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, move, playTo, targetOf } from '../scripts/rules.mjs';
import { WORDS, bookPopHtml, cardHtml, threadsAt } from '../scripts/cards.js';
import { plateHtml } from '../scripts/plate.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-15T09:00:00+08:00');

/* Every lock a chapter declares (a sealed beat is held by its walls instead): its scenes, and the one after. */
const LOCKS = Object.values(content.chapters).flatMap(ch => (ch.beats ?? []).filter(b => !b.sealed).map(b => {
  const last = ch.scenes[b.scenes.at(-1)];
  return { ch, beat: b, after: last.exits.find(e => e.next)?.next ?? null };
}));

test('the picks: 外门\'s five, 筑基 on the cliff, the 河伯 wedding night', () => {
  assert.deepEqual(LOCKS.map(l => `${l.ch.id}/${l.beat.id}`), ['00-waimen/rumen', '00-waimen/chaifang', '00-waimen/dabi', '00-waimen/baishi', '00-zhuji/zhuji', '01-ji/hebo']);
  for (const { beat } of LOCKS) assert.ok(beat.say?.zh && beat.say?.en, `${beat.id} says why in both languages`);
});

/* One forward run by the rules (rules/progress.mjs), a snapshot at each beat's scenes and the scene after. */
function forward() {
  const at = new Map(), targets = [];
  for (const { beat, after } of LOCKS) for (const id of [...beat.scenes, ...(after ? [after] : [])]) targets.push([id, targetOf(content, id)]);
  playTo(content, newState(content, 'zh', NOW), null, { now: NOW, policy: 'win', targets, onAt: (label, s, r) => at.set(label, { s, now: r.now }) });
  return at;
}

test('every key beat: the entry walked to, the rest locked with the save\'s stamp and the beat\'s own words, the scene after open', () => {
  const at = forward();
  for (const { ch, beat, after } of LOCKS) {
    const [entry, ...held] = beat.scenes;
    const e = at.get(entry);
    assert.ok(e, `${entry} reached`);
    assert.equal(e.s.lock, undefined, `${entry}: the entry is a waypoint`);
    assert.equal(look(e.s, content, { now: e.now, quests: [] }).lock, undefined);
    let since = null;
    for (const id of held) {
      const h = at.get(id);
      assert.ok(h, `${id} reached`);
      assert.equal(h.s.lock?.beat, beat.id, `${id}: the save carries ${beat.id}`);
      since ??= h.s.lock.since;
      assert.equal(h.s.lock.since, since, `${id}: since the beat began, not since this scene`);
      const lk = look(h.s, content, { now: h.now, quests: [] });
      assert.deepEqual(lk.lock, { beat: beat.id, title: beat.title.zh, say: beat.say.zh, since });
      assert.equal(lk.director.corridor, true, `${id}: the stage keeps the roads off`);
      const elsewhere = ch.map.places.find(p => p !== h.s.place);
      const out = move(h.s, content, { now: h.now, quests: [] }, { place: elsewhere });
      assert.equal(out.result.refused, 'corridor', `${id}: Move to ${elsewhere} refused`);
      assert.equal(out.result.beat, beat.id);
      assert.equal(out.result.say, beat.say.zh);
    }
    if (after) {
      const a = at.get(after);
      assert.ok(a, `${after} reached`);
      assert.equal(a.s.lock, undefined, `${after}: the beat over, the save lets go`);
      assert.equal(look(a.s, content, { now: a.now, quests: [] }).lock, undefined);
    }
  }
});

test('the page greys every walk while a beat runs: the map\'s dots, the 事 book\'s 去 — each with the beat\'s reason', () => {
  const at = forward(), h = at.get('09-cliff');
  const lk = look(h.s, content, { now: h.now, quests: [] });
  const ctx = { look: lk, words: WORDS.zh, lang: 'zh', content };
  const map = cardHtml({ card: 'map' }, ctx);
  assert.match(map, /maplock/, 'the map says the story is under way');
  assert.doesNotMatch(map, /data-go=/, 'no dot walks anywhere');
  assert.match(map, new RegExp(`class="pt[^"]* held[^"]*"[^>]*title="[^"]*${lk.lock.say}`), 'a greyed dot says why');
});

test('threads: every errand of the world declares one of three; the lint refuses a fourth', () => {
  for (const q of [...content.quests, ...content.notices]) assert.ok(THREADS.includes(q.thread), `${q.id}: ${q.thread}`);
  const people = content.quests.filter(q => q.thread === 'person').map(q => q.id);
  assert.ok(people.includes('xu-ahe-lixi') && people.includes('xu-sun-charm'), '阿禾 and 孙二狗 are their own threads');
  assert.equal(content.quests.find(q => q.id === 'guan-chaifang-wood').thread, 'chore', 'a wall tag is 杂务');
  const bad = structuredClone(content);
  bad.quests[0].thread = 'side';
  assert.ok(lint(bad).some(e => /thread is one of/.test(e)));
});

test('threads drawn: the 事 book\'s rows and goal line in their colour, the map\'s places ringed, the strongest wins', () => {
  const lk = {
    waypoint: { scene: 'x', place: { id: 'zhengdian', name: '正殿' }, text: '外门大比 · 腊月初八。' },
    book: [
      { id: 'xu-ahe-lixi', title: '阿禾的利息', thread: 'person', need: [{ kind: 'visit', have: 0, n: 1 }], where: { id: 'fangshi', name: '坊市' } },
      { id: 'guan-chaifang-wood', title: '码柴', thread: 'chore', need: [{ kind: 'board', have: 0, n: 1 }], where: { id: 'chaifang', name: '柴房' } },
      { id: 'guan-zhengdian', title: '扫殿', thread: 'chore', need: [{ kind: 'board', have: 0, n: 1 }], where: { id: 'zhengdian', name: '正殿' } },
    ],
    offers: [{ id: 'xu-sun-charm', title: '孙二狗的护身符', thread: 'person', need: [], pays: null }],
  };
  assert.deepEqual(threadsAt(lk), { fangshi: 'person', chaifang: 'chore', zhengdian: 'main' });
  const pop = bookPopHtml({ look: lk, words: WORDS.zh, lang: 'zh' });
  assert.match(pop, /bookgoal th-main/);
  assert.match(pop, /trow th-person"[^>]*data-bookrow="xu-ahe-lixi"/);
  assert.match(pop, /trow th-chore"[^>]*data-bookrow="guan-chaifang-wood"/);
  assert.match(pop, /trow th-person"[^>]*data-offerrow="xu-sun-charm"/);
  const plate = plateHtml({ spots: [{ id: 'chaifang', name: '柴房', at: [0.2, 0.3] }, { id: 'zhengdian', name: '正殿', at: [0.5, 0.5] }] }, { threads: threadsAt(lk) });
  assert.match(plate, /spot th-chore"[^>]*data-go="chaifang"/);
  assert.match(plate, /spot th-main"[^>]*data-go="zhengdian"/);
});
