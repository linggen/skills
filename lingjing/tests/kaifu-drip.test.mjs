// 开府 drips (Hanli, 2026-10-15): one milestone open at a time, in the world's
// order; handed in or skipped, the next opens on the next calendar day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest, task } from '../scripts/rules.mjs';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-15T10:00:00');
const day = (n, h = 10) => new Date(2026, 9, 15 + n, h);
const start = () => ({ ...newState(content, 'zh', NOW), scene: '00-waimen', place: 'waimen', step: 1 });
const ORDER = content.world.kaifu.order;
const ms = (id, done = true) => ({ id, app: 'linggen', period: 'once', due: true, reward: 50, stamina: 20, device: 'mac', open: '/settings', title: { zh: id, en: id }, done_at: done ? '2026-09-24T15:49:13Z' : null });
// The menu in the app's own file order — not the world's: the world's order wins.
const MENU = [...ORDER].reverse().map(id => ms(id));
const ctx = (now, quests = MENU) => ({ now, quests });
const openOf = (s, now, quests) => look(s, content, ctx(now, quests)).kaifu.next?.id ?? null;
const kaifuRows = (s, now, quests) => quest(s, content, ctx(now, quests), { action: 'kaifu' }).result.kaifu;

test('one open at a time, in the world order, whatever the file order', () => {
  const s = start();
  const k = look(s, content, ctx(NOW)).kaifu;
  assert.equal(k.next.id, ORDER[0]);
  assert.deepEqual([k.done, k.of, k.ready], [0, ORDER.length, 1]);
  // Look carries ONE quest of 开府 — the open one, done — never the ten
  assert.deepEqual(look(s, content, ctx(NOW)).quests.filter(q => q.period === 'once').map(q => q.id), [ORDER[0]]);
  const rows = kaifuRows(s, NOW);
  assert.deepEqual(rows.map(r => r.id), ORDER);
  assert.deepEqual(rows.filter(r => r.step === 'open').map(r => r.id), [ORDER[0]]);
  // one not open yet is refused, done or not
  const r = quest(s, content, ctx(NOW), { action: 'turn', id: ORDER[1] }).result;
  assert.deepEqual([r.ok, r.refused], [false, 'not-open']);
  assert.equal(task(s, content, ctx(NOW), { action: 'check', id: ORDER[1] }).result.refused, 'not-open');
});

test('handed in, the next opens only on the next calendar day', () => {
  const paid = quest(start(), content, ctx(NOW), { action: 'turn', id: ORDER[0] });
  assert.equal(paid.result.ok, true);
  const s = paid.state;
  assert.equal(s.kaifu.closed, '2026-10-15');
  // later the same day: nothing open
  const late = look(s, content, ctx(day(0, 23))).kaifu;
  assert.equal(late.next, undefined);
  assert.equal(late.opens, 'tomorrow');
  assert.equal(late.done, 1);
  assert.equal(quest(s, content, ctx(day(0, 23)), { action: 'turn', id: ORDER[1] }).result.refused, 'not-open');
  // just after midnight, local: the next is open — already done in real life, handed in at once
  assert.equal(openOf(s, day(1, 0)), ORDER[1]);
  const next = quest(s, content, ctx(day(1, 0)), { action: 'turn', id: ORDER[1] });
  assert.equal(next.result.ok, true);
  assert.equal(openOf(next.state, day(1, 22)), null);
  assert.equal(openOf(next.state, day(2)), ORDER[2]);
});

test('an undone open one stays open across days; done later, it is handed in then', () => {
  const quests = MENU.map(q => (q.id === ORDER[0] ? { ...q, done_at: null } : q));
  const s = start();
  assert.equal(openOf(s, day(0), quests), ORDER[0]);
  assert.equal(openOf(s, day(3), quests), ORDER[0], 'never jumps ahead on its own');
  assert.equal(quest(s, content, ctx(day(3), quests), { action: 'turn', id: ORDER[0] }).result.refused, 'not-done');
  assert.equal(look(s, content, ctx(day(3), quests)).kaifu.ready, 0);
});

test('a save from before the drip keeps every milestone paid; the next unpaid opens per the rule', () => {
  // Hanli's save: two handed in today, no `kaifu` record yet
  const s = { ...start(), chores: { [ORDER[4]]: { period: 'once', paid_at: '2026-10-15T13:51:18Z' }, [ORDER[0]]: { period: 'once', paid_at: '2026-10-15T14:17:15Z' } } };
  const today = look(s, content, ctx(day(0, 22))).kaifu;
  assert.deepEqual([today.done, today.next, today.opens], [2, undefined, 'tomorrow']);
  assert.equal(openOf(s, day(1)), ORDER[1], 'the first unpaid in order, tomorrow');
  // paid on an earlier day: the next is open now
  const old = { ...start(), chores: Object.fromEntries(ORDER.slice(0, 5).map(id => [id, { period: 'once', paid_at: '2026-09-24T16:00:00Z' }])) };
  assert.equal(openOf(old, NOW), ORDER[5]);
  assert.equal(look(old, content, ctx(NOW)).kaifu.done, 5);
  assert.deepEqual(kaifuRows(old, NOW).filter(r => r.paid).map(r => r.id), ORDER.slice(0, 5), 'nothing taken back');
});

test('跳过: no pay, the next opens tomorrow; skipped and done later, it is handed in any day', () => {
  const quests = MENU.map(q => (q.id === ORDER[0] ? { ...q, done_at: null } : q));
  const s0 = start();
  // only the open one may be skipped
  assert.equal(quest(s0, content, ctx(NOW, quests), { action: 'skip', id: ORDER[1] }).result.refused, 'not-open');
  const sk = quest(s0, content, ctx(NOW, quests), { action: 'skip', id: ORDER[0] });
  assert.equal(sk.result.ok, true);
  assert.equal(sk.state.wealth, s0.wealth, 'a skip pays nothing');
  assert.deepEqual(sk.state.kaifu, { closed: '2026-10-15', skipped: [ORDER[0]] });
  assert.equal(openOf(sk.state, day(0, 22), quests), null);
  assert.equal(look(sk.state, content, ctx(day(0, 22), quests)).kaifu.skipped, 1);
  assert.equal(openOf(sk.state, day(1), quests), ORDER[1]);
  // done in real life a few days on: the skipped one is handed in at once, and the open one stays open
  const later = quests.map(q => (q.id === ORDER[0] ? { ...q, done_at: '2026-10-16T08:00:00Z' } : q));
  const k = look(sk.state, content, ctx(day(1), later)).kaifu;
  assert.equal(k.ready, 2, 'the open one and the skipped one, both done');
  const back = quest(sk.state, content, ctx(day(1), later), { action: 'turn', id: ORDER[0] });
  assert.equal(back.result.ok, true);
  assert.ok(back.state.wealth > s0.wealth);
  assert.deepEqual(back.state.kaifu.skipped, []);
  assert.equal(openOf(back.state, day(1), later), ORDER[1], 'a skipped one handed in leaves the open one open');
});

test('skipped ones come back at the end, in the order skipped — never stuck', () => {
  const two = [ms('linggen-model', false), ms('linggen-account', false)];
  let s = start();
  s = quest(s, content, ctx(day(0), two), { action: 'skip', id: 'linggen-model' }).state;
  s = quest(s, content, ctx(day(1), two), { action: 'skip', id: 'linggen-account' }).state;
  assert.equal(openOf(s, day(2), two), 'linggen-model', 'all skipped: the first skipped comes back');
  s = quest(s, content, ctx(day(2), two), { action: 'skip', id: 'linggen-model' }).state;
  assert.equal(openOf(s, day(3), two), 'linggen-account');
  s = quest(s, content, ctx(day(3), two), { action: 'skip', id: 'linggen-account' }).state;
  assert.equal(openOf(s, day(4), two), 'linggen-model');
});

test('an id the world does not list comes after, in the app order', () => {
  const quests = [ms('linggen-new'), ...MENU];
  const rows = kaifuRows(start(), NOW, quests);
  assert.deepEqual(rows.map(r => r.id), [...ORDER, 'linggen-new']);
});

test('the 事 book: the open 一次 step is one row with its tag, the count and 跳过; the next day waits in a line', () => {
  const page = (l, extra = {}) => bookPopHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' }, ...extra });
  const quests = MENU.map(q => (q.id === ORDER[0] ? { ...q, done_at: null } : q));
  const s = start();
  const html = page(look(s, content, ctx(NOW, quests)));
  assert.match(html, /已接 · 1/);
  assert.match(html, new RegExp(`t-once">一次</span>.*linggen-model.*0/${ORDER.length}.*灵石 \\+\\d+.*data-do="skip" data-id="linggen-model">跳过`, 's'));
  assert.equal((html.match(/t-once/g) ?? []).length, 1, 'one 一次 row, never the ten');
  // done: 可交, 交差 and no 跳过
  const done = page(look(s, content, ctx(NOW)));
  assert.match(done, /可交 · 1.*linggen-model.*data-do="turn" data-id="linggen-model"/s);
  assert.doesNotMatch(done, /data-do="skip"/);
  // handed in: the row says what came in, in place; then tomorrow waits in a dim line, the paid one folded
  const paid = quest(s, content, ctx(NOW), { action: 'turn', id: ORDER[0] });
  const l = look(paid.state, content, ctx(NOW));
  const rows = quest(paid.state, content, ctx(NOW), { action: 'kaifu' }).result.kaifu;
  const turned = page(l, { kaifu: rows, turned: { id: ORDER[0], title: ORDER[0], paid: paid.result.paid, at: Date.now() } });
  assert.match(turned, /role="status" class="bookrow trow turned".*已交 ✓/s);
  const after = page(l, { kaifu: rows });
  assert.match(after, new RegExp(`下一件明日开.*1/${ORDER.length}`, 's'));
  assert.match(after, /<details class="tgroup tdone"><summary[^>]*>已交 1<\/summary>.*linggen-model/s);
  assert.doesNotMatch(after, /undefined|\{\w+\}/);
});
