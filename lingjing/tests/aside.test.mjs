// 先放一放 — the book set aside mid-passage and taken up at the same beat (Hanli, 2026-10-26; rules/aside.mjs):
// the place kept on the save, one declared rule for what may be played meanwhile, a later story board and Move
// refused, never inside a key beat's lock, the beats built again from the book in both languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { ASIDE_ALWAYS, ASIDE_KIND_VERBS, ASIDE_REFUSED, ASIDE_KINDS } from '../scripts/rules/aside.mjs';
import { migrate } from '../scripts/state.mjs';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const crawl = crawlRules(content, { boards: 'skip' });
function at(key) {
  const got = crawl.states.get(key);
  assert.ok(got, `the crawl reached ${key}`);
  return { s: { ...got.s, stamina: 100, stamina_at: got.now.toISOString() }, now: got.now };
}
const call = (verb, s, now, args = {}) => VERBS[verb](s, content, { now, quests: [] }, args);
function must(verb, s, now, args) {
  const out = call(verb, s, now, args);
  assert.equal(out.result.ok, true, `${verb} ${JSON.stringify(args)}: ${JSON.stringify(out.result)}`);
  return out;
}
const lookOf = (s, now) => call('look', s, now).result;

test('every verb is in exactly one bucket: always, refused, or a kind\'s — a verb added later cannot slip through', () => {
  for (const verb of Object.keys(VERBS)) {
    const n = [ASIDE_ALWAYS.has(verb), ASIDE_REFUSED.has(verb), ASIDE_KIND_VERBS.has(verb)].filter(Boolean).length;
    assert.equal(n, 1, `${verb}: in ${n} buckets`);
  }
  assert.deepEqual(ASIDE_KINDS.map(k => k.kind), ['replay', 'rerun', 'gongke', 'fantong', 'pool', 'tide', 'seclusion', 'her']);
});

test('set aside → a skipped board played → back at the same beat; the scene\'s own board and Move wait', () => {
  const { s: s0, now } = at('00-prologue/00-baicai');
  assert.ok((s0.skipped ?? []).some(e => e.task === 'rain-basins'), '接雨 was left at 00-shiao');
  // Before: the control has something to offer (接雨, left), and before 入门 nothing else.
  const before = lookOf(s0, now).aside;
  assert.equal(before.on, false);
  assert.deepEqual([...new Set(before.offers.map(o => o.kind))], ['replay']);
  assert.ok(before.offers.some(o => o.id === 'rain-basins'));
  // Set aside at the second (last) beat of 00-baicai's passage, before its board.
  const s1 = must('aside', s0, now, { items: [{ of: 'scene', id: '00-baicai' }], j: 1 }).state;
  assert.deepEqual(s1.aside.items, [{ of: 'scene', id: '00-baicai' }]);
  assert.equal(s1.aside.j, 1);
  const l1 = lookOf(s1, now);
  assert.equal(l1.aside.on, true);
  assert.equal(l1.aside.j, 1);
  // What waits: the scene's own board (the passage leads into it), the way on, a walk.
  const board = (content.chapters['00-prologue'].scenes['00-baicai'].show ?? []).find(c => c.card === 'board').id;
  assert.equal(call('win', s1, now, { id: board }).result.refused, 'aside', 'the scene\'s board waits for its passage');
  assert.equal(call('task', s1, now, { action: 'skip', id: board }).result.refused, 'aside', 'and is never skipped meanwhile');
  const exit = content.chapters['00-prologue'].scenes['00-baicai'].exits[0].id;
  assert.equal(call('resolve', s1, now, { exit }).result.refused, 'aside');
  assert.equal(call('move', s1, now, { place: 'shiao' }).result.refused, 'aside');
  assert.ok(call('resolve', s1, now, { exit }).result.say, 'in the world\'s words');
  // What is open: the skipped board, at once (not only the day's replay), played and counted.
  const s2 = must('task', s1, now, { action: 'replay', id: 'rain-basins' }).state;
  const s3 = must('win', s2, now, { id: 'rain-basins' }).state;
  assert.ok(s3.wins['rain-basins']);
  assert.deepEqual(s3.tell_owed ?? [], s1.tell_owed ?? [], 'a replay owes the box nothing new');
  // Back: the same beat, both languages, and the story open again.
  const back = must('resume', s3, now);
  assert.equal(back.state.aside, undefined);
  assert.equal(back.result.j, 1);
  assert.equal(back.result.items[0].id, '00-baicai');
  assert.equal(back.result.i, 0);
  const { zh, en } = back.result.items[0].beats;
  assert.ok(zh.length === 2 && zh.length === en.length, `${zh.length} beats zh, ${en.length} en`);
  assert.notEqual(call('resolve', back.state, now, { exit }).result.refused, 'aside');
});

test('a passage the book does not hold, a key beat\'s lock, a fight: no setting aside', () => {
  const { s, now } = at('00-prologue/00-baicai');
  assert.equal(call('aside', s, now, { items: [{ of: 'scene', id: 'nowhere' }], j: 0 }).result.refused, 'not-a-passage');
  assert.equal(call('aside', s, now, { items: [], j: 0 }).result.refused, 'not-a-passage');
  const { s: locked, now: t } = at('00-waimen/wm-zhoutian');
  assert.equal(call('aside', locked, t, { items: [{ of: 'scene', id: 'wm-zhoutian' }], j: 0 }).result.refused, 'locked');
  assert.equal(lookOf(locked, t).aside, undefined, 'inside the lock the control is not offered');
  assert.equal(call('aside', { ...s, fight: { game: 'x' } }, now, { items: [{ of: 'scene', id: '00-baicai' }], j: 0 }).result.refused, 'in-a-fight');
});

test('nothing open, no control: a save with no board left and nothing else reachable before 入门', () => {
  const { s, now } = at('00-prologue/00-baicai');
  assert.equal(lookOf({ ...s, skipped: [] }, now).aside, undefined);
});

test('the kinds open only by their own rules: 闭关 and 问卦 wait for their gates, a pool for its place', () => {
  const { s, now } = at('00-prologue/00-baicai');
  const kinds = new Set(lookOf(s, now).aside.offers.map(o => o.kind));
  for (const k of ['rerun', 'gongke', 'fantong', 'pool', 'tide', 'seclusion', 'her']) assert.ok(!kinds.has(k), `${k} is shut before 入门`);
  // After 入门, at a scene of 古五 with the 秘境 behind him: what its systems have open, each by its own rule.
  const { s: w, now: t } = at('00-waimen/wm-laoyin');
  const offers = lookOf({ ...w, aside: { scene: w.scene, items: [{ of: 'scene', id: w.scene }], j: 0 } }, t).aside.offers;
  const view = lookOf(w, t);
  assert.equal(offers.some(o => o.kind === 'seclusion'), !(view.locked ?? []).includes('seclusion') && !w.seclusion);
  assert.equal(offers.some(o => o.kind === 'her' && o.id === 'divine'), !view.divination && !(view.locked ?? []).includes('divine'));
});

test('the place is kept on the save: it survives a load; a record of another scene is let go, so Move is never shut', () => {
  const { s, now } = at('00-prologue/00-baicai');
  const s1 = must('aside', s, now, { items: [{ of: 'scene', id: '00-baicai' }], j: 1 }).state;
  assert.deepEqual(migrate(s1, content).aside, s1.aside);
  const stale = migrate({ ...s1, aside: { ...s1.aside, scene: '00-shiao' } }, content);
  assert.equal(stale.aside, undefined);
});

test('the page keys what it sets aside as the rules do, and takes it up at the same beat (dialogue.js)', async () => {
  const { asidePlace, readingAt, current } = await import('../scripts/dialogue.js');
  const { s, now } = at('00-prologue/00-baicai');
  const s1 = must('aside', s, now, { items: [{ of: 'scene', id: '00-baicai' }], j: 1 }).state;
  const back = must('resume', s1, now).result;
  const r = readingAt(back.items, '00-baicai', null, back.i, back.j);
  assert.equal(current(r, 'zh').beat.text, back.items[0].beats.zh[1].text, 'the beat set aside is the one on show');
  assert.deepEqual(asidePlace(r), { items: [{ of: 'scene', id: '00-baicai' }], i: 0, j: 1 }, 'and set aside again, the same place');
  assert.equal(asidePlace({ ...r, closed: true }), null, 'a box put away has nothing to set aside');
  assert.equal(asidePlace({ ...r, items: [{ of: 'catchup', id: 'x', beats: { zh: [{ text: 'a', recap: true }] } }] }), null, 'nor a catch-up');
});

test('the box offers 先放一放 only with something to play meanwhile; the tray holds what Look offers and 接着读', async () => {
  const { storyHtml, readingAt } = await import('../scripts/dialogue.js');
  const { asideHtml } = await import('../scripts/cards.js');
  const { s, now } = at('00-prologue/00-baicai');
  const back = must('resume', must('aside', s, now, { items: [{ of: 'scene', id: '00-baicai' }], j: 0 }).state, now).result;
  const r = readingAt(back.items, '00-baicai', null, 0, 0);
  assert.match(storyHtml(r, { aside: true }), /data-dlg-aside>先放一放</);
  assert.doesNotMatch(storyHtml(r, { aside: false }), /data-dlg-aside/);
  const look = { aside: { on: true, offers: [{ kind: 'replay', id: 'rain-basins', title: '接雨' }, { kind: 'her', id: 'tale' }] } };
  const words = { asideTitle: 'T', asideHint: 'H', asideNone: 'N', asideResume: 'R', asideKinds: { replay: '再玩 · {title}', tale: '今日传闻' } };
  const html = asideHtml({ look, words });
  assert.match(html, /data-replay-play="rain-basins">再玩 · 接雨</);
  assert.match(html, /<span class="chip">今日传闻<\/span>/, 'a kind with no opener of its own is named, not a dead button');
  assert.match(html, /data-aside-resume/);
  assert.equal(asideHtml({ look: {}, words }), '');
});

test('the passage on show among the scene\'s, kept: set aside in the rest after a board, taken up there with the first before it', () => {
  const { s, now } = at('00-prologue/00-baicai');
  const items = [{ of: 'scene', id: '00-baicai' }, { of: 'after', id: '00-baicai/after' }];
  const s1 = must('aside', s, now, { items, i: 1, j: 3 }).state;
  assert.equal(call('aside', s, now, { items, i: 2, j: 0 }).result.refused, 'bad-beat');
  const back = must('resume', s1, now).result;
  assert.deepEqual([back.i, back.j, back.items.map(x => x.id)], [1, 3, ['00-baicai', '00-baicai/after']]);
});
