// 人间功课 — one a day from the apps' menus, the workout fixed; 开府 once ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { monthKey, newState, periodKey, periodStart } from '../scripts/state.mjs';
import { chorePlay, tableStones } from '../scripts/rules/playpay.mjs';
import { look, quest, task, progress } from '../scripts/rules.mjs';
import { dailyPick, fitsDevices, phoneReady, playerDevices } from '../scripts/rules/chores.mjs';
import { readQuests } from '../scripts/rules/files.mjs';

const content = loadContent();
const NOW = new Date('2026-09-24T10:00:00'); // a Thursday
const day = (n, h = 10) => new Date(2026, 8, 24 + n, h);
// Joined (the outer court): before the prologue's story gate there are no 功课 and no 开府 (chapter.json `locks`).
const start = () => ({ ...newState(content, 'zh', NOW), scene: '00-waimen', place: 'waimen', step: 1 }); // 一层: 零层 takes no 修为
const T = id => ({ zh: `做${id}`, en: `Do ${id}` });

const entry = (id, extra = {}) => ({ id, app: id.split('-')[0], period: 'week', due: true, reward: 20, stamina: 10, device: 'mac', pool: true, done_at: null, title: T(id), ...extra });
const workout = (extra = {}) => entry('health-workout', { period: 'day', device: 'phone', pool: undefined, ...extra });
const milestone = (n, extra = {}) => entry(`linggen-m${n}`, { app: 'linggen', period: 'once', pool: undefined, reward: 50, stamina: 20, device: n % 2 ? 'phone' : 'mac', open: '/settings?tab=models', ...extra });
const paired = { ...milestone(0), id: 'linggen-pair', device: 'phone', done_at: '2026-09-01T00:00:00Z' };
const MENU = [
  entry('cfo-import'), entry('cfo-review', { period: 'day' }), entry('cfo-sort'),
  entry('shifu-scan', { device: 'both' }), entry('shifu-clear'),
  entry('dj-fetch', { period: 'day', device: 'phone' }), entry('health-report', { device: 'phone' }), entry('dj-sync', { device: 'both' }),
];
const ctx = (quests, now = NOW) => ({ now, quests });
const chores = b => b.filter(x => x.chore);

test('the pick is the same all day, on any device, whatever order the menus are read in', () => {
  const s = start(), quests = [...MENU, paired];
  const a = dailyPick(s, quests, day(0, 8)).pick.id;
  assert.equal(dailyPick(s, [...quests].reverse(), day(0, 23)).pick.id, a);
  assert.equal(dailyPick(JSON.parse(JSON.stringify(s)), quests, day(0, 12)).pick.id, a, 'the synced save picks alike');
  // over a fortnight the pick moves — not one chore forever
  assert.ok(new Set([...Array(14).keys()].map(n => dailyPick(s, quests, day(n)).pick.id)).size >= 3);
});

test('days alternate mac and phone once a phone is paired; with none, only the Mac', () => {
  const s = start(), quests = [...MENU, paired];
  const devices = [...Array(6).keys()].map(n => dailyPick(s, quests, day(n)).device);
  for (let n = 1; n < 6; n += 1) assert.notEqual(devices[n], devices[n - 1], 'day by day');
  for (let n = 0; n < 6; n += 1) {
    const { pick, device } = dailyPick(s, quests, day(n));
    assert.ok([device, 'both'].includes(pick.device), `day ${n}: ${pick.id} fits ${device}`);
  }
  // no pairing and no phone chore ever done: never a phone one
  assert.equal(phoneReady(MENU), false);
  for (let n = 0; n < 14; n += 1) assert.notEqual(dailyPick(s, MENU, day(n)).pick.device, 'phone');
  // a phone chore once seen done is proof enough
  assert.equal(phoneReady([...MENU, workout({ done_at: '2026-09-20T08:00:00Z' })]), true);
});

test('the pick skips what is done this period, what no file offers, and a phone day with nothing falls to the Mac', () => {
  const s = start();
  // everything but one done earlier this week: that one is the pick, every day left
  const doneMon = '2026-09-21T09:00:00';
  const quests = MENU.map(q => (q.id === 'cfo-sort' || q.period === 'day' ? q : { ...q, done_at: doneMon })).filter(q => q.period !== 'day');
  for (let n = 0; n < 3; n += 1) assert.equal(dailyPick(s, quests, day(n)).pick.id, 'cfo-sort');
  // an app whose file is missing offers nothing
  const noCfo = MENU.filter(q => q.app !== 'cfo');
  for (let n = 0; n < 14; n += 1) assert.notEqual(dailyPick(s, noCfo, day(n)).pick?.app, 'cfo');
  // a pick done TODAY stays the pick — doing it never re-rolls the day
  const today = dailyPick(s, MENU, NOW).pick;
  const did = MENU.map(q => (q.id === today.id ? { ...q, done_at: new Date(NOW - 3600e3).toISOString() } : q));
  assert.equal(dailyPick(s, did, NOW).pick.id, today.id);
  // nothing to pick at all
  assert.equal(dailyPick(s, [workout()], NOW).pick, null);
});

test('a flood of menu entries: the book holds the workout and the one pick — two lines', () => {
  const s = start();
  const flood = [...Array(40).keys()].map(n => entry(`app${n % 5}-c${n}`, { device: ['mac', 'phone', 'both'][n % 3], done_at: n % 4 ? null : NOW.toISOString() }));
  const quests = [...flood, workout(), paired, ...[...Array(12).keys()].map(n => milestone(n + 1, { done_at: n < 3 ? '2026-09-02T00:00:00Z' : null }))];
  const l = look(s, content, ctx(quests));
  const lines = chores(l.book);
  assert.ok(lines.length <= 2, `${lines.length} lines`);
  assert.deepEqual(lines.map(b => b.chore.kind).sort(), ['fixed', 'pick']);
  assert.equal(lines.find(b => b.chore.kind === 'fixed').id, 'health-workout');
  assert.ok(lines.every(b => ['mac', 'phone', 'both'].includes(b.chore.device)), 'each line says where it is done');
  // Look for Ling: today's two; 开府 as every done row to hand in and the ONE hint of the day (kaifu-drip.test.mjs) — never the menu
  assert.equal(l.quests.filter(q => q.period !== 'once').length, 2);
  const { pays, ...next } = l.kaifu.next;
  assert.deepEqual([l.kaifu.done, l.kaifu.of, l.kaifu.ready], [0, 13, 4]);
  assert.deepEqual(next, { id: 'linggen-m4', title: '做linggen-m4', device: 'mac', done: false, open: '/settings?tab=models' });
  assert.deepEqual(l.kaifu.rows.map(r => [r.id, r.step]), [['linggen-pair', 'ready'], ['linggen-m1', 'ready'], ['linggen-m2', 'ready'], ['linggen-m3', 'ready'], ['linggen-m4', 'open']]);
  assert.ok(pays.wealth > 0 && !pays.stamina, 'the open step says what it pays: 灵石, and no 体力 (rewards.json stamina.refill.quest false, Hanli 11-02)');
  // Yinyue's Progress carries the same, compactly
  const p = progress(s, content, ctx(quests)).result;
  assert.equal(p.chores.kaifu, '0/13');
  assert.ok(p.chores.today.length <= 2 + 4);
});

test('only the pick and the fixed pay; another pool chore done anyway is shown nowhere and pays nothing', () => {
  const s = start();
  const allDone = [...MENU, workout()].map(q => ({ ...q, done_at: new Date(NOW - 60e3).toISOString() }));
  // The pick is read off the same menu Look sees: a phone chore done makes the
  // phone known, which can move the day's device — and with it the pick.
  const pickId = dailyPick(s, allDone, NOW).pick.id;
  const other = MENU.find(q => q.id !== pickId && q.device !== 'phone');
  const b = look(s, content, ctx(allDone)).book;
  assert.deepEqual(chores(b).map(x => x.id).sort(), [pickId, 'health-workout'].sort());
  const r = quest(s, content, ctx(allDone), { action: 'turn', id: other.id }).result;
  assert.deepEqual([r.ok, r.refused], [false, 'not-today']);
  assert.equal(task(s, content, ctx(allDone), { action: 'check', id: other.id }).result.refused, 'not-today');
  const paid = quest(s, content, ctx(allDone), { action: 'turn', id: pickId });
  assert.equal(paid.result.ok, true);
  assert.equal(quest(paid.state, content, ctx(allDone), { action: 'turn', id: 'health-workout' }).result.ok, true);
});

test('a month\'s 功课: keyed YYYY-MM from the 1st at local midnight; paid once a month (its 体力-units × R); last month\'s done does not count', () => {
  const oct = new Date(2026, 9, 27, 10), first = new Date(2026, 9, 1, 0, 0, 0), lastOfSep = new Date(2026, 8, 30, 23, 59);
  assert.equal(monthKey(oct), '2026-10');
  assert.equal(periodKey('month', oct), '2026-10');
  assert.equal(periodKey('month', new Date(2027, 0, 3)), '2027-01');
  assert.equal(periodKey('month', lastOfSep), '2026-09', 'the last minute of a month is still its own');
  assert.equal(periodStart('month', oct).getTime(), first.getTime());
  assert.equal(periodStart('month', first).getTime(), first.getTime(), 'the 1st at midnight starts it');
  const s = start();
  const imp = entry('cfo-import', { period: 'month', device: 'both', kind: 'ledger' });
  // done on the 30th of September: not this month's
  const sept = [{ ...imp, done_at: lastOfSep.toISOString() }];
  const stale = chores(look(s, content, ctx(sept, oct)).book).find(x => x.id === imp.id);
  assert.ok(stale, 'still this month\'s to do');
  assert.equal(stale.chore.done_at, null);
  refused(quest(s, content, ctx(sept, oct), { action: 'turn', id: imp.id }), 'not-done');
  // done this morning: the book's line, a month's, paid its 体力-units × R
  const done = [{ ...imp, done_at: new Date(2026, 9, 27, 9).toISOString() }];
  const line = chores(look(s, content, ctx(done, oct)).book).find(x => x.id === imp.id);
  assert.equal(line.chore.period, 'month');
  const out = quest(s, content, ctx(done, oct), { action: 'turn', id: imp.id });
  assert.equal(out.result.ok, true);
  assert.equal(content.balance.play_pay.chore.month, content.balance.master.xiuwei.units.chore.month, 'a month\'s 体力-units (2026-11-02)');
  assert.ok(chorePlay(content, s, 'month') > chorePlay(content, s, 'week'), 'rarer, so more than a week\'s');
  assert.equal(out.result.paid.progress, chorePlay(content, s, 'month'));
  assert.equal(out.state.chores[imp.id].period, '2026-10');
  // once a month: again later in October it is spent; in November, done again, it pays again
  refused(quest(out.state, content, ctx(done, new Date(2026, 9, 30, 10)), { action: 'turn', id: imp.id }), 'already-paid');
  const nov = new Date(2026, 10, 3, 10), doneNov = [{ ...imp, done_at: new Date(2026, 10, 3, 9).toISOString() }];
  refused(quest(out.state, content, ctx(done, nov), { action: 'turn', id: imp.id }), 'not-done');
  assert.equal(quest(out.state, content, ctx(doneNov, nov), { action: 'turn', id: imp.id }).result.ok, true);
});

test('开府: done_at null is not done; a done one pays once ever — capped, on any device, in any week', () => {
  const s = start();
  const m = milestone(1, { reward: 500, stamina: 20, device: 'mac' });
  refused(quest(s, content, ctx([m]), { action: 'turn', id: m.id }), 'not-done');
  assert.equal(look(s, content, ctx([m])).kaifu.done, 0);
  const done = [{ ...m, done_at: '2026-09-20T09:00:00Z' }];
  const out = quest(s, content, ctx(done), { action: 'turn', id: m.id });
  assert.equal(out.result.ok, true);
  const cap = content.rewards.tables.once;
  assert.equal(out.result.paid.progress, 0, '开府 pays stones, no 修为 (Hanli, 2026-10-15: 修为 comes from cultivation)');
  assert.equal(out.result.paid.wealth, tableStones(content, s, 'once'), 'the once table\'s minutes × I where he stands (batch 2), whatever the row\'s `reward`');
  assert.deepEqual(out.state.chores[m.id].period, 'once');
  // the synced save, a month on: still paid
  const synced = JSON.parse(JSON.stringify(out.state));
  refused(quest(synced, content, ctx(done, new Date('2026-10-30T10:00:00')), { action: 'turn', id: m.id }), 'already-paid');
  // never a book line; its own section, read by the page
  assert.equal(chores(look(s, content, ctx(done)).book).length, 0);
  const list = quest(synced, content, ctx(done), { action: 'kaifu' });
  assert.equal(list.state, null, 'a read');
  assert.deepEqual(list.result.kaifu.map(k => [k.id, k.done, k.paid, k.device, k.open]), [[m.id, true, true, 'mac', '/settings?tab=models']]);
});

test('menus are read from the quests folder; a missing or half-written file is skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-quests-'));
  const was = process.env.LINGJING_QUESTS;
  try {
    process.env.LINGJING_QUESTS = dir;
    fs.writeFileSync(path.join(dir, 'cfo.json'), JSON.stringify({ app: 'cfo', quests: [entry('cfo-sort')] }));
    fs.writeFileSync(path.join(dir, 'dj.json'), '{"app": "dj", "quests": [');
    assert.deepEqual(readQuests().map(q => q.id), ['cfo-sort']);
    assert.equal(dailyPick(start(), readQuests(), NOW).pick.id, 'cfo-sort');
  } finally {
    if (was === undefined) delete process.env.LINGJING_QUESTS; else process.env.LINGJING_QUESTS = was;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function refused(out, code) {
  assert.equal(out.result.ok, false);
  assert.equal(out.result.refused, code);
  assert.equal(out.state, null);
}

test('the devices the player has: the host, and the other once a pair row (or its own row) is done', () => {
  const pair = { id: 'p', period: 'once', device: 'pair', done_at: null };
  assert.deepEqual(playerDevices([pair], 'mac'), { mac: true, phone: false });
  assert.deepEqual(playerDevices([pair], 'phone'), { mac: false, phone: true });
  assert.deepEqual(playerDevices([{ ...pair, done_at: '2026-11-01T00:00:00Z' }], 'phone'), { mac: true, phone: true });
  assert.deepEqual(playerDevices([{ id: 'x', device: 'mac', done_at: '2026-11-01T00:00:00Z' }], 'phone'), { mac: true, phone: true });
  const mac = { mac: true, phone: false }, both = { mac: true, phone: true };
  assert.equal(fitsDevices({ device: 'mac' }, mac), true);
  assert.equal(fitsDevices({ device: 'phone' }, mac), false);
  assert.equal(fitsDevices({ device: 'both' }, mac), true);
  assert.equal(fitsDevices({}, mac), true);
  assert.equal(fitsDevices({ device: 'pair' }, mac), false);
  assert.equal(fitsDevices({ device: 'pair' }, both), true);
});

// 2026-11-02 (Hanli 「任务设计可以, 按你说的做」): the new set — six dailies, due published by the apps, device-filtered.
const daily = (id, extra = {}) => entry(id, { period: 'day', pool: undefined, device: 'both', ...extra });
const NEW_SET = [
  daily('linggen-greet', { kind: 'greet', how: { zh: '跟银月说句话', en: 'Say a word to Yinyue' } }),
  daily('health-steps', { device: 'phone', kind: 'body' }), daily('health-sleep', { device: 'phone', kind: 'rest', due: false }),
  daily('cfo-review', { kind: 'ledger' }), daily('dj-listen', { kind: 'song' }), daily('shifu-glance', { device: 'mac', kind: 'sweep' }),
  entry('shifu-scan'), entry('shifu-clear', { device: 'both', due: false }), entry('health-report', { device: 'phone' }),
  entry('cfo-sort', { device: 'both' }), entry('dj-pick', { device: 'both' }),
];
const ids = rows => rows.map(q => q.id);

test('a Mac-only player: the Mac and both dailies, never a phone one, and the pick is one he can do on the Mac', async () => {
  const { todayChores } = await import('../scripts/rules/chores.mjs');
  const s = start();
  for (let n = 0; n < 10; n += 1) {
    const today = todayChores(s, NEW_SET, day(n));
    assert.deepEqual(ids(today).slice(0, 4), ['linggen-greet', 'cfo-review', 'dj-listen', 'shifu-glance'], `day ${n}`);
    for (const q of today) assert.notEqual(q.device, 'phone', `day ${n}: ${q.id}`);
  }
});

test('a two-device player gets the phone dailies too; a due:false row is hidden as a daily and never the pick', async () => {
  const { todayChores } = await import('../scripts/rules/chores.mjs');
  const s = start(), quests = [...NEW_SET, paired];
  const today = todayChores(s, quests, day(0));
  assert.ok(ids(today).includes('health-steps'));
  assert.ok(!ids(today).includes('health-sleep'), 'the app says sleep cannot be done: hidden');
  for (let n = 0; n < 30; n += 1) assert.notEqual(dailyPick(s, quests, day(n)).pick?.id, 'shifu-clear');
  // done anyway in its period: shown as done
  const slept = quests.map(q => (q.id === 'health-sleep' ? { ...q, done_at: day(0, 7).toISOString() } : q));
  assert.ok(ids(todayChores(s, slept, day(0))).includes('health-sleep'));
});

test('the book row carries the app\'s how; only shares_per_day dailies pay their share of the layer', async () => {
  const { choreGrant } = await import('../scripts/rules/chores.mjs');
  const s = start(), q = NEW_SET[0];
  const book = look(s, content, ctx(NEW_SET, day(0))).book ?? [];
  const row = book.find(b => b.id === 'linggen-greet');
  assert.equal(row?.chore?.how, '跟银月说句话');
  const n = content.gongke.shares_per_day;
  assert.ok(Number.isFinite(n));
  const paidToday = Object.fromEntries([...Array(n).keys()].map(i => [`x-${i}`, { period: periodKey('day', day(0)), paid_at: day(0, 9).toISOString() }]));
  assert.ok(choreGrant(content, q, s, day(0)).progress > 0, 'the first pays its share');
  assert.equal(choreGrant(content, q, { ...s, chores: paidToday }, day(0)).progress, 0, 'past the day\'s shares, no 修为');
  // Its 灵石 still: a daily (the `gongke` table, none of its own) pays its meaning's (gongke.json kinds `ls`) — batch 2: the
  // grant carries what lands, never an app's `reward` number (it was 20 raw, capped to 0 by the table).
  const { meaningGrant } = await import('../scripts/rules/gongke.mjs');
  assert.ok(meaningGrant(content, { ...s, chores: paidToday }, q, day(0)).ls > 0, 'its 灵石 still (its meaning\'s)');
  const week = { ...NEW_SET[6] };
  assert.ok(choreGrant(content, week, { ...s, chores: paidToday }, day(0)).progress > 0, 'a weekly is not a daily share');
});

// Hanli 11-09: 问安 is 银月's — a plain 「早上好」 went to Ling and the row stayed undone. The row (milestones.rs) says
// whom its line goes to (`to`) and asks nothing set (`ask` empty): the book's button opens the box to her, never a link out.
test('问安 opens the chat addressed to her: the book row carries `to` and `ask`, its button the box to 银月', async () => {
  const { WORDS, bookPopHtml } = await import('../scripts/cards.js');
  const greet = { ...NEW_SET[0], open: '/', ask: { zh: '', en: '' }, to: 'yinyue' };
  const quests = [greet, ...NEW_SET.slice(1)];
  const l = look(start(), content, ctx(quests, day(0)));
  const row = (l.book ?? []).find(b => b.id === 'linggen-greet');
  assert.equal(row?.chore?.to, 'yinyue');
  assert.equal(row?.chore?.ask, '');
  const html = bookPopHtml({ look: l, lang: 'zh', words: { ...WORDS.zh, xw: '修为', ls: '灵石', qi: '体力' } });
  const at = html.indexOf('linggen-greet'), next = html.indexOf('data-bookrow', at + 1);
  const its = html.slice(at, next < 0 ? undefined : next);
  assert.match(its, /data-ask-her/, its);
  assert.doesNotMatch(its, /href="\/"/, 'no link out to the home page');
  // a `to` that is no agent's id is dropped
  const odd = look(start(), content, ctx([{ ...greet, to: 'x y' }, ...NEW_SET.slice(1)], day(0)));
  assert.equal((odd.book ?? []).find(b => b.id === 'linggen-greet')?.chore?.to, undefined);
});
