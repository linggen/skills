// 人间功课 — one a day from the apps' menus, the workout fixed; 开府 once ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest, task, progress } from '../scripts/rules.mjs';
import { dailyPick, phoneReady } from '../scripts/rules/chores.mjs';
import { readQuests } from '../scripts/rules/files.mjs';

const content = loadContent();
const NOW = new Date('2026-09-24T10:00:00'); // a Thursday
const day = (n, h = 10) => new Date(2026, 8, 24 + n, h);
const start = () => newState(content, 'zh', NOW);
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
  // Look for Ling: today's two and the milestones done-unpaid — never the menu
  assert.equal(l.quests.filter(q => q.period !== 'once').length, 2);
  assert.deepEqual(l.kaifu, { done: 4, of: 13, ready: 4, next: { id: 'linggen-m4', title: '做linggen-m4', device: 'mac' } });
  // Yinyue's Progress carries the same, compactly
  const p = progress(s, content, ctx(quests)).result;
  assert.equal(p.chores.kaifu, '4/13');
  assert.ok(p.chores.today.length <= 2 + 4);
});

test('only the pick and the fixed pay; another pool chore done anyway is shown nowhere and pays nothing', () => {
  const s = start();
  const pickId = dailyPick(s, MENU, NOW).pick.id;
  const other = MENU.find(q => q.id !== pickId && q.device !== 'phone');
  const allDone = [...MENU, workout()].map(q => ({ ...q, done_at: new Date(NOW - 60e3).toISOString() }));
  const b = look(s, content, ctx(allDone)).book;
  assert.deepEqual(chores(b).map(x => x.id).sort(), [pickId, 'health-workout'].sort());
  const r = quest(s, content, ctx(allDone), { action: 'turn', id: other.id }).result;
  assert.deepEqual([r.ok, r.refused], [false, 'not-today']);
  assert.equal(task(s, content, ctx(allDone), { action: 'check', id: other.id }).result.refused, 'not-today');
  const paid = quest(s, content, ctx(allDone), { action: 'turn', id: pickId });
  assert.equal(paid.result.ok, true);
  assert.equal(quest(paid.state, content, ctx(allDone), { action: 'turn', id: 'health-workout' }).result.ok, true);
});

test('开府: done_at null is not done; a done one pays once ever — capped, on any device, in any week', () => {
  const s = start();
  const m = milestone(1, { reward: 500, stamina: 20 });
  refused(quest(s, content, ctx([m]), { action: 'turn', id: m.id }), 'not-done');
  assert.equal(look(s, content, ctx([m])).kaifu.done, 0);
  const done = [{ ...m, done_at: '2026-09-20T09:00:00Z' }];
  const out = quest(s, content, ctx(done), { action: 'turn', id: m.id });
  assert.equal(out.result.ok, true);
  const cap = content.rewards.tables.once;
  assert.ok(out.result.paid.progress <= cap.progress * 1 && out.result.paid.progress > 0, 'capped by the once table');
  assert.equal(out.result.paid.wealth, cap.wealth);
  assert.deepEqual(out.state.chores[m.id].period, 'once');
  // the synced save, a month on: still paid
  const synced = JSON.parse(JSON.stringify(out.state));
  refused(quest(synced, content, ctx(done, new Date('2026-10-30T10:00:00')), { action: 'turn', id: m.id }), 'already-paid');
  // never a book line; its own section, read by the page
  assert.equal(chores(look(s, content, ctx(done)).book).length, 0);
  const list = quest(synced, content, ctx(done), { action: 'kaifu' });
  assert.equal(list.state, null, 'a read');
  assert.deepEqual(list.result.kaifu.map(k => [k.id, k.done, k.paid, k.device, k.open]), [[m.id, true, true, 'phone', '/settings?tab=models']]);
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
