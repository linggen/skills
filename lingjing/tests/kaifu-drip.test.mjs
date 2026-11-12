// 开府 (Hanli, 2026-11-02): the first steps, for the devices the player has. Every done row is
// handed in at once; only the hint of an undone row drips — one more a day. 50 灵石 + 20 体力 each.
import { tableStones } from '../scripts/rules/playpay.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest } from '../scripts/rules.mjs';
import { kaifuFit } from '../scripts/rules/chores.mjs';
import { oneRowEach } from '../scripts/rules/files.mjs';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-11-02T10:00:00');
const day = (n, h = 10) => new Date(2026, 10, 2 + n, h);
const start = () => ({ ...newState(content, 'zh', NOW), scene: '00-waimen', place: 'waimen', step: 1 });
const ORDER = content.world.kaifu.order;
// The engine's table (linggen/src/server/milestones.rs) as linggen.json holds it.
const DEVICE = { 'linggen-chat': 'both', 'linggen-ask-news': 'both', 'linggen-voice': 'mac', 'cfo-open': 'both', 'dj-play': 'both',
  'health-open': 'phone', 'linggen-notify': 'phone', 'shifu-scan-first': 'mac', 'linggen-image': 'mac', 'linggen-pair': 'pair' };
const ms = (id, done = false) => ({ id, app: 'linggen', period: 'once', due: true, reward: 50, stamina: 20, device: DEVICE[id], open: '/', how: { zh: `怎么做${id}`, en: `how ${id}` },
  ...(id === 'linggen-ask-news' ? { ask: { zh: '今天有什么大新闻？', en: "What's the big news today?" } } : id === 'linggen-chat' ? { ask: { zh: '', en: '' } } : {}), title: { zh: id, en: id }, done_at: done ? '2026-11-01T15:49:13Z' : null });
const MENU = ORDER.map(id => ms(id));
const withDone = (ids, menu = MENU) => menu.map(q => (ids.includes(q.id) ? { ...q, done_at: '2026-11-01T15:49:13Z' } : q));
const ctx = (now, quests = MENU) => ({ now, quests });
const k = (s, now, quests) => look(s, content, ctx(now, quests)).kaifu;
const rows = (s, now, quests) => quest(s, content, ctx(now, quests), { action: 'kaifu' }).result.kaifu;
const onHost = (host, fn) => { const was = process.env.LINGJING_HOST; process.env.LINGJING_HOST = host; try { return fn(); } finally { if (was == null) delete process.env.LINGJING_HOST; else process.env.LINGJING_HOST = was; } };

test('a Mac-only player sees 7, a phone-only player 6 (no voice on the phone yet), one with both 10', () => {
  const s = start();
  const mac = rows(s, NOW);
  assert.equal(mac.length, 7);
  assert.deepEqual(mac.map(r => r.id), ['linggen-chat', 'linggen-ask-news', 'linggen-voice', 'cfo-open', 'dj-play', 'shifu-scan-first', 'linggen-image']);
  assert.equal(k(s, NOW).of, 7);
  const phone = onHost('phone', () => rows(s, NOW));
  assert.deepEqual(phone.map(r => r.id), ['linggen-chat', 'linggen-ask-news', 'cfo-open', 'dj-play', 'health-open', 'linggen-notify']);
  // paired: 结缘 and the other device's rows appear, on either host
  const paired = withDone(['linggen-pair']);
  assert.equal(rows(s, NOW, paired).length, 10);
  assert.equal(onHost('phone', () => rows(s, NOW, paired)).length, 10);
  assert.equal(k(s, NOW, paired).of, 10);
});

test('every done row is ready at once; one tap hands them all in, the once table\'s 灵石 each and no 体力', () => {
  const s = { ...start(), stamina: 10 };
  // 开府's 灵石: the `once` table's minutes of income × I where he stands (batch 2; 50 flat until 2026-11-10).
  const ONE = tableStones(content, s, 'once');
  const done = withDone(['linggen-chat', 'cfo-open', 'linggen-image']);
  const brief = k(s, NOW, done);
  assert.equal(brief.ready, 3);
  assert.deepEqual(brief.rows.filter(r => r.step === 'ready').map(r => r.id), ['linggen-chat', 'cfo-open', 'linggen-image']);
  // the card says what the hand-in lands — both
  const l = look(s, content, ctx(NOW, done));
  const life = l.quests.find(q => q.id === 'cfo-open');
  // …and no 体力, whatever the row says (rewards.json stamina.refill.quest false — Hanli 11-02: 「完成任务不奖励体力」)
  assert.deepEqual([life.pays.wealth, life.pays.stamina ?? 0], [ONE, 0]);
  const one = quest(s, content, ctx(NOW, done), { action: 'turn', id: 'cfo-open' });
  assert.equal(one.result.paid.wealth, ONE, 'what the card said');
  assert.equal(one.result.stamina, 0);
  const all = quest(s, content, ctx(NOW, done), { action: 'turn', id: 'kaifu' });
  assert.equal(all.result.ok, true);
  assert.deepEqual(all.result.quests.map(q => q.id), ['linggen-chat', 'cfo-open', 'linggen-image']);
  assert.equal(all.result.paid.wealth, 3 * ONE);
  assert.equal(all.state.wealth - s.wealth, 3 * ONE);
  assert.equal(all.result.stamina, 0, 'no 体力 from a quest');
  assert.equal(k(all.state, NOW, done).done, 3);
  assert.equal(quest(all.state, content, ctx(NOW, done), { action: 'turn', id: 'kaifu' }).result.refused, 'not-done');
});

test('only the hint drips: one more undone row a day, in the world order', () => {
  let s = start();
  const open = (st, now) => k(st, now).rows.filter(r => r.step === 'open').map(r => r.id);
  assert.deepEqual(open(s, day(0)), ['linggen-chat']);
  s = kaifuFit(content, s, MENU, day(0));
  assert.deepEqual(s.kaifu, { shown: ['linggen-chat'], shown_on: '2026-11-02' });
  assert.equal(kaifuFit(content, s, MENU, day(0, 22)), s, 'the same day: nothing more');
  assert.deepEqual(open(s, day(0, 22)), ['linggen-chat']);
  assert.deepEqual(open(s, day(1)), ['linggen-chat', 'linggen-ask-news']);
  s = kaifuFit(content, s, MENU, day(1));
  assert.deepEqual(open(s, day(2)), ['linggen-chat', 'linggen-ask-news', 'linggen-voice']);
  // a done row is never held back by the drip, nor takes the day's hint
  const done = withDone(['dj-play']);
  assert.deepEqual(k(s, day(1, 20), done).rows.map(r => [r.id, r.step]), [['dj-play', 'ready'], ['linggen-chat', 'open'], ['linggen-ask-news', 'open']]);
  // every revealed hint done, more waiting: 「下一件明日开」
  const both = withDone(['linggen-chat', 'linggen-ask-news']);
  const t = k(s, day(1, 20), both);
  assert.equal(t.next, undefined);
  assert.equal(t.opens, 'tomorrow');
  assert.equal(t.waiting, 5, 'how many hints wait (the Mac-only list of 7, two done)');
  // the line says the HINT waits, never the hand-in (Hanli 11-02: 「下一件明日开」 read as the next hand-in held a day)
  const book = bookPopHtml({ look: look(s, content, ctx(day(1, 20), both)), lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } });
  assert.match(book, /还有 5 件 · 明日再揭一件，做了随时可交/);
  assert.doesNotMatch(book, /下一件明日开/);
});

test('a retired id an app\'s file still holds is never listed or counted (Hanli 11-02: 「开府 7/11」 with both devices — CFO\'s cfo-first-stock)', () => {
  const stale = { id: 'cfo-first-stock', app: 'cfo', period: 'once', due: true, reward: 50, stamina: 20, device: 'both', title: { zh: '开仓', en: 'stock' }, done_at: '2026-10-16T13:34:43Z' };
  const paired = [...withDone(['linggen-pair']), stale];
  const s = { ...start(), chores: { 'cfo-first-stock': { period: 'once', paid_at: '2026-11-02T18:34:43Z' } } };
  const brief = k(s, NOW, paired);
  assert.equal(brief.of, 10);
  assert.ok(!rows(s, NOW, paired).some(r => r.id === 'cfo-first-stock'));
  assert.ok(content.world.kaifu.retired.includes('cfo-first-stock'));
  assert.ok(s.chores['cfo-first-stock'], 'what it paid is kept');
});

test('a save that handed in the old ones keeps what it was paid; they are no longer listed or counted', () => {
  const s = { ...start(), chores: { 'linggen-model': { period: 'once', paid_at: '2026-10-15T13:51:18Z' }, 'linggen-voice': { period: 'once', paid_at: '2026-10-15T14:17:15Z' } } };
  const brief = k(s, NOW);
  assert.deepEqual([brief.done, brief.of], [1, 7], 'her voice stays paid; the retired model step is not a row');
  assert.ok(s.chores['linggen-model']);
});

test('all done on one device: one uncounted card for the other', () => {
  const macDone = withDone(ORDER);
  let s = start();
  s = quest(s, content, ctx(NOW, macDone.filter(q => q.device !== 'pair')), { action: 'turn', id: 'kaifu' }).state;
  const mac = k(s, NOW, macDone.filter(q => !['pair', 'phone'].includes(q.device)));
  assert.deepEqual([mac.done, mac.of], [7, 7]);
  assert.equal(mac.other.device, 'phone');
  assert.match(mac.other.url, /^https:\/\/apps\.apple\.com\//);
  assert.match(mac.other.title, /App Store/);
  const phoneRows = macDone.filter(q => ['both', 'phone'].includes(q.device));
  const ph = onHost('phone', () => {
    const paid = quest(start(), content, ctx(NOW, phoneRows), { action: 'turn', id: 'kaifu' }).state;
    return k(paid, NOW, phoneRows);
  });
  assert.equal(ph.other.device, 'mac');
  assert.equal(ph.other.url, 'https://linggen.dev');
  // not done yet: no card
  assert.equal(k(start(), NOW).other, undefined);
});

test('the same step from two files counts once, with the latest done_at', () => {
  const mac = ms('linggen-chat'), phone = { ...ms('linggen-chat'), done_at: '2026-11-02T08:00:00Z', title: { zh: 'phone' } };
  const [one] = oneRowEach([mac, phone]);
  assert.equal(one.done_at, '2026-11-02T08:00:00Z');
  assert.equal(one.title.zh, 'linggen-chat', "the first file's words");
});

test('the 事 book: 「开府 n/N」 on its own line, each row its 怎么做, what it pays, and one button', () => {
  const page = (l, extra = {}) => bookPopHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' }, ...extra });
  const s = { ...start(), kaifu: { shown: ['linggen-chat', 'linggen-ask-news', 'cfo-open'], shown_on: '2026-11-02' } };
  const done = withDone(['dj-play', 'linggen-image']);
  const html = page(look(s, content, ctx(NOW, done)));
  assert.match(html, /<div class="tgroup kaifu"[^>]*><div class="thead small dim">开府 0\/7 <button class="act do" data-do="turn" data-id="kaifu">全部交差 · 2<\/button><\/div>/);
  assert.equal((html.match(/tmeta">\d+\/\d+/g) ?? []).length, 0, 'never a count beside one row');
  assert.match(html, new RegExp(`linggen-chat.*怎么做linggen-chat.*灵石 \\+${tableStones(content, s, 'once')}.*data-ask-her`, 's'));
  assert.doesNotMatch(html, /体力 \+\d/, 'no 体力 on a 开府 row');
  assert.match(html, /linggen-ask-news.*data-ask="@银月 今天有什么大新闻？"/s);
  assert.match(html, /cfo-open.*href="\/"/s);
  assert.match(html, /dj-play.*data-do="turn" data-id="dj-play"/s);
  assert.doesNotMatch(html, /data-do="skip"|undefined|\{\w+\}/);
});

test('two files, one row: a done_at ahead of now never outranks a real one', () => {
  const now = new Date('2026-11-12T00:53:33Z');
  const mac = { id: 'lingjing-share', period: 'day', done_at: '2026-11-12T13:10:00.000Z' };
  const phone = { id: 'lingjing-share', period: 'day', done_at: '2026-11-12T00:53:33.000Z' };
  assert.equal(oneRowEach([mac, phone], now)[0].done_at, phone.done_at);
  assert.equal(oneRowEach([mac], now)[0].done_at, null);
  assert.equal(oneRowEach([mac, phone])[0].done_at, mac.done_at, 'no clock given: as before');
});
