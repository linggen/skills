// 数据埋点 (rules/analytics.mjs, scripts/track.js, scripts/stats.mjs; Hanli 2026-10-27 「先做数据埋点吧」). Locks:
// what a line may hold (anonymous facts only — never what was typed), where it goes (the save's own dir; a test save
// never in the player's log), the month files and their cap, the off switch, the pay line the rules write, the page's
// tracker (sittings, idle cut, boards, the flush) and the report's arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLines, cleanEvent, cleanLine, KEEP_MONTHS, linesOf, MONTH_CAP, payEvent, readLines } from '../scripts/rules/analytics.mjs';
import { categoryOf, median, report, retention } from '../scripts/stats.mjs';
import { charsOf, createTracker } from '../scripts/track.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES = path.join(ROOT, 'scripts/rules.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lj-analytics-'));
const rules = (data, args) => JSON.parse(execFileSync(process.execPath, [RULES, ...args], { env: { ...process.env, LINGJING_DATA: data, LINGJING_TRACK_SINK: '', LINGJING_TRACK_OFF: '' }, encoding: 'utf8' }).trim().split('\n').pop());

test('a line keeps only its kind\'s named fields, and only numbers, yes/no and short ids — never words', () => {
  const e = cleanEvent({ kind: 'board', id: 'rain-basins', game: 'rain', outcome: 'won', stars: 3, active_s: 91.234, said: '你好，我叫小明', answer: 'secret', text: 'x', retries: '2' });
  assert.deepEqual(e, { kind: 'board', id: 'rain-basins', game: 'rain', outcome: 'won', stars: 3, active_s: 91.23 });
  // A sentence is not an id, even in a field that takes one.
  assert.equal(cleanEvent({ kind: 'board', id: '我 今天 很 累 想 回家' }).id, undefined);
  assert.equal(cleanEvent({ kind: 'chat', text: 'hi' }), null);
  assert.equal(cleanEvent({ kind: 'nope' }), null);
  // An error keeps its message, cut, with anything quoted put away.
  const err = cleanEvent({ kind: 'error', where: 'page:12', msg: 'TypeError: no "我的名字是小明" here' });
  assert.equal(err.msg, 'TypeError: no "…" here');
  assert.ok(cleanEvent({ kind: 'error', msg: 'x'.repeat(500) }).msg.length <= 120);
});

test('a batch is stamped where the save stands, at the page\'s moment when it is sane', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  const [a, b] = linesOf([{ kind: 'ask', to: 'her', t: now.getTime() - 5000 }, { kind: 'ask', to: 'ling', t: 1 }], { now, save: 'x', stamp: { tier: 'qi', layer: 2, hui: 'h07' } });
  assert.equal(a.at, '2026-10-27T09:59:55.000Z');
  assert.equal(b.at, now.toISOString(), 'a moment from long ago is now');
  assert.deepEqual([a.save, a.tier, a.layer, a.hui, a.dev, a.kind], ['x', 'qi', 2, 'h07', 'mac', 'ask']);
  // Another device's line: its event cleaned, its stamp checked, its device fixed.
  const p = cleanLine({ at: '2026-10-27T09:00:00.000Z', kind: 'read', chars: 10, tier: 'qi', layer: 1, dev: 'mac', words: 'no' }, 'phone');
  assert.deepEqual(p, { at: '2026-10-27T09:00:00.000Z', save: 'main', tier: 'qi', layer: 1, dev: 'phone', kind: 'read', chars: 10 });
  assert.equal(cleanLine({ at: 'yesterday', kind: 'read' }, 'phone'), null);
});

test('a month a file; a full month keeps no more; months past the keep are let go', () => {
  const dir = tmp();
  const line = (at) => ({ at, save: 'main', kind: 'ask', to: 'her' });
  const old = new Date('2025-01-10T00:00:00Z').toISOString();
  appendLines(dir, [line(old)], new Date('2025-01-10T00:00:00Z'));
  appendLines(dir, [line('2026-09-30T23:00:00.000Z'), line('2026-10-01T01:00:00.000Z')], new Date('2026-10-27T00:00:00Z'));
  const files = fs.readdirSync(path.join(dir, 'analytics')).sort();
  assert.deepEqual(files, ['2026-09.jsonl', '2026-10.jsonl'], `kept ${KEEP_MONTHS} months: 2025-01 let go`);
  // The cap: a month near it takes no more.
  fs.writeFileSync(path.join(dir, 'analytics', '2026-10.jsonl'), 'x'.repeat(MONTH_CAP - 10) + '\n');
  assert.equal(appendLines(dir, [line('2026-10-02T00:00:00.000Z')], new Date('2026-10-27T00:00:00Z')), 0);
  assert.equal(readLines(dir).length, 1, 'the torn filler is skipped; September\'s line reads');
});

test('track and stats: the page\'s alone, a test save\'s own dir, the off switch, a batch kept once', () => {
  const data = tmp();
  rules(data, ['seed', '--save=an', '--at=古三']);
  const ev = JSON.stringify([{ kind: 'session', op: 'start', sid: 's1' }, { kind: 'board', id: 'x', game: 'rain', outcome: 'won', active_s: 60, said: 'hello' }]);
  assert.equal(rules(data, ['track', '--save=an', `--events=${ev}`, '--batch=b0001']).kept, 2);
  assert.equal(rules(data, ['track', '--save=an', `--events=${ev}`, '--batch=b0001']).again, true, 'sent again after a lost answer: kept once');
  assert.ok(!fs.existsSync(path.join(data, 'analytics')), 'a test save never writes the player\'s log');
  const kept = readLines(path.join(data, 'saves', 'an'));
  assert.equal(kept.length, 2);
  assert.equal(kept[1].hui, 'h04');
  assert.ok(!JSON.stringify(kept).includes('hello'));
  assert.equal(rules(data, ['track', '--save=an', '--for=ling', `--events=${ev}`]).refused, 'page-only');
  // Off: nothing more is kept, and it says so.
  assert.equal(rules(data, ['track', '--save=an', '--action=off']).off, true);
  assert.deepEqual(rules(data, ['track', '--save=an', `--events=${ev}`]), { ok: true, off: true, kept: 0 });
  assert.equal(rules(data, ['track', '--save=an', '--action=on']).off, false);
  // The phone's lines, carried over: kept as the phone's, once a batch.
  const lines = JSON.stringify([{ at: new Date().toISOString(), kind: 'fight', beast: 'lang', outcome: 'won', tier: 'qi', layer: 2 }]);
  assert.equal(rules(data, ['track', '--save=an', '--action=put', `--lines=${lines}`, '--batch=p0001']).kept, 1);
  assert.equal(rules(data, ['track', '--save=an', '--action=put', `--lines=${lines}`, '--batch=p0001']).kept, 0);
  const st = rules(data, ['stats', '--save=an']);
  assert.equal(st.save, 'an');
  assert.deepEqual(st.report.devices.sort(), ['mac', 'phone']);
  assert.equal(st.report.fights[0].won, 100);
});

test('a verb that pays writes a pay line: 修为 and 灵石 by its source; one that pays nothing writes none', () => {
  const data = tmp();
  rules(data, ['seed', '--save=pay', '--at=古五']);
  rules(data, ['win', '--save=pay', '--id=mijing-laonian']);
  const done = rules(data, ['task', '--save=pay', '--action=done', '--id=mijing-laonian']);
  assert.ok(done.ok && done.paid.progress > 0);
  const pays = readLines(path.join(data, 'saves', 'pay')).filter((l) => l.kind === 'pay');
  assert.equal(pays.length, 1, 'the win itself paid nothing');
  assert.deepEqual([pays[0].src, pays[0].id, pays[0].xw, pays[0].ls], ['task:done', 'mijing-laonian', done.paid.progress, done.paid.wealth]);
  assert.equal(categoryOf(pays[0]), 'games');
  // A purchase is 灵石 spent, never income.
  const e = payEvent({ verb: 'trade', args: { action: 'buy', id: 'mend-pill' }, result: { ok: true, paid: { wealth: -15 } }, before: { wealth: 30, tier: 'qi', step: 1, progress: 5 }, after: { wealth: 15, tier: 'qi', step: 1, progress: 5 } });
  assert.deepEqual([e.src, e.xw, e.ls], ['trade:buy', 0, -15]);
  // A step up: the bar starts over, the result's own 修为 is what counts; errands handed in are kept apart.
  const up = payEvent({ verb: 'duel', args: { id: 'lang' }, result: { ok: true, paid: { progress: 40 }, handed: [{ paid: { progress: 10, wealth: 15 } }] }, before: { wealth: 0, tier: 'qi', step: 1, progress: 460 }, after: { wealth: 15, tier: 'qi', step: 2, progress: 30 } });
  assert.deepEqual([up.xw, up.ls, up.errand_xw, up.errand_ls], [40, 0, 10, 15]);
  assert.equal(payEvent({ verb: 'look', result: { ok: true }, before: { wealth: 1 }, after: { wealth: 1 } }), null);
});

/* The page's tracker on a hand-moved clock. */
function rig() {
  let t = Date.parse('2026-10-27T10:00:00Z');
  const sent = [];
  const tr = createTracker({ send: async ({ events }) => { sent.push(...events); return { ok: true }; }, clock: () => t, win: null, doc: null });
  return { tr, sent, at: (ms) => { t += ms; }, get t() { return t; } };
}

test('the tracker: a sitting\'s active time cuts gaps over two minutes; a board open → end with its retries', async () => {
  const r = rig();
  await r.tr.start();
  r.at(30_000); r.tr.input();   // 30 s counted
  r.at(300_000); r.tr.input();  // 5 min away: not counted
  r.at(60_000); r.tr.input();   // 60 s counted
  const g1 = {}, g2 = {};
  r.tr.boardSeen('rain-basins', g1, () => ({ game: 'rain', source: 'story', scene: '00-shiao' }));
  r.tr.boardSeen('rain-basins', g1);
  r.at(20_000); r.tr.input();
  r.tr.boardLost('rain-basins');
  r.tr.boardSeen('rain-basins', g2); // dealt again: a retry
  r.at(10_000); r.tr.input();
  r.tr.boardEnd('rain-basins', 'won', { stars: 2 });
  await r.tr.flush('test');
  const board = r.sent.find((e) => e.kind === 'board');
  assert.deepEqual([board.game, board.source, board.outcome, board.retries, board.stars, board.active_s], ['rain', 'story', 'won', 1, 2, 30]);
  const ticks = r.sent.filter((e) => e.kind === 'session' && e.op !== 'start');
  assert.equal(ticks.reduce((a, e) => a + e.active_s, 0), 120);
  // A board left after a loss is lost; one with no input three minutes is a stall signal, once.
  r.tr.boardSeen('masan', {}, () => ({ game: 'qimai' }));
  r.at(200_000);
  r.tr._stallWatch(); r.tr._stallWatch();
  r.tr.boardLost('masan');
  r.tr.boardEnd('masan', 'left');
  await r.tr.flush('test');
  assert.equal(r.sent.filter((e) => e.kind === 'stall').length, 1);
  assert.equal(r.sent.filter((e) => e.kind === 'board').at(-1).outcome, 'lost');
});

test('the tracker: a passage from start to the next, a gate shut and open, refusals in a streak, off stops it', async () => {
  const r = rig();
  await r.tr.start();
  r.tr.reading('run|0|00-shiao', { scene: '00-shiao', chars: 900 });
  r.at(120_000);
  r.tr.reading('run|0|00-shiao', { scene: '00-shiao', chars: 900 });
  r.tr.readSkipped();
  r.tr.reading(null);
  r.tr.watchLook({ scene: { id: 'a' } }, ['cap']);
  r.at(3_600_000);
  r.tr.watchLook({ scene: { id: 'a' } }, []);
  r.tr.answer('trade', { ok: false, refused: 'too-poor' });
  r.tr.answer('trade', { ok: false, refused: 'too-poor' });
  r.tr.answer('trade', { ok: false, refused: 'busy' });
  await r.tr.flush('test');
  const read = r.sent.find((e) => e.kind === 'read');
  assert.deepEqual([read.scene, read.chars, read.ms, read.skipped], ['00-shiao', 900, 120_000, true]);
  assert.equal(r.sent.find((e) => e.kind === 'gate' && e.op === 'open').waited_s, 3600);
  assert.deepEqual(r.sent.filter((e) => e.kind === 'refused').map((e) => e.streak), [1, 2]);
  const off = createTracker({ send: async () => ({ ok: true, off: true }), win: null, doc: null });
  await off.start({ status: async () => ({ off: true }) });
  off.boardSeen('x', {}); off.boardEnd('x', 'won');
  assert.equal(off.queued, 0);
  assert.equal(charsOf({ beats: { zh: [{ text: '一二三' }, { text: '四五' }] } }, 'zh'), 5);
});

test('the report: medians, streaks and next-day return, a board beside its designed minutes, income by source', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const day = (d, kind, f = {}) => ({ at: `2026-10-${d}T10:00:00.000Z`, kind, ...f });
  const lines = [
    day(20, 'session', { op: 'start' }), day(20, 'session', { op: 'end', active_s: 600, hui: 'h05', tier: 'qi', layer: 1 }),
    day(21, 'session', { op: 'start' }), day(21, 'session', { op: 'tick', active_s: 300, hui: 'h05', tier: 'qi', layer: 1 }),
    day(23, 'session', { op: 'start' }),
    day(21, 'board', { game: 'rain', id: 'rain-basins', outcome: 'won', active_s: 120 }), day(21, 'board', { game: 'rain', id: 'rain-basins', outcome: 'skipped', active_s: 240, retries: 2 }),
    day(21, 'fight', { beast: 'lang', outcome: 'won', odds: 0.5 }), day(21, 'fight', { beast: 'lang', outcome: 'lost', odds: 0.5 }),
    day(21, 'pay', { src: 'task:done', verb: 'task', xw: 60, ls: 5 }), day(21, 'pay', { src: 'duel', verb: 'duel', xw: 30, ls: 0, errand_xw: 10, errand_ls: 15 }),
  ];
  const content = { balance: { model: { bands: { typical: [5, 7.5] }, players: { typical: { minutes: 30 } }, chars_per_min: 450 }, play_pay: { minutes: { 打地鼠: 1, default: 3 } } }, games: { games: [{ id: 'rain', mechanic: '打地鼠' }] } };
  const rep = report(lines, content, { now: new Date('2026-10-23T12:00:00Z') });
  assert.deepEqual([rep.retention.days, rep.retention.sessions, rep.retention.streak.longest, rep.retention.streak.current, rep.retention.next_day], [3, 3, 2, 1, 50]);
  assert.equal(rep.retention.active_min, 15);
  assert.deepEqual(rep.time.hui[0], { hui: 'h05', active_min: 15, days: 2, target_min: [150, 225], first: '2026-10-20T10:00:00.000Z' });
  assert.equal(rep.time.layer[0].target_min, 120, '练气一层: 2 h');
  const b = rep.boards[0];
  assert.deepEqual([b.n, b.median_min, b.designed_min, b.won, b.skipped, b.retries], [2, 3, 1, 50, 50, 1]);
  assert.deepEqual([rep.fights[0].won, rep.fights[0].bot], [50, 50]);
  const by = Object.fromEntries(rep.income.by.map((c) => [c.cat, c.xw]));
  assert.deepEqual(by, { games: 60, fights: 30, errands: 10 });
  assert.equal(rep.income.by.find((c) => c.cat === 'games').share, 60);
  assert.equal(retention([], null).days, 0);
});

test('the tracker: a batch that may not have arrived as the page went is sent again under its own id, so it is kept once', async () => {
  const store = new Map();
  const win = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  const first = createTracker({ send: async () => { throw new Error('page gone'); }, win, doc: null });
  await first.start();
  first.ask('ling', 'wenxun');
  await first.flush('left', { leaving: true });
  const kept = JSON.parse([...store.values()][0]);
  assert.equal(kept.length, 1);
  const seen = [];
  const next = createTracker({ send: async (b) => { seen.push(b.batch); return { ok: true }; }, win, doc: null });
  await next.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, [kept[0].batch], 'the same batch id: the rules keep it once');
  assert.equal(store.size, 0);
  // A blip of a passage (under a second, not skipped) is no read.
  const r = rig();
  await r.tr.start();
  r.tr.reading('k1', { scene: 'a', chars: 100 });
  r.at(200);
  r.tr.reading('k2', { scene: 'b', chars: 100 });
  r.at(5000);
  r.tr.reading(null);
  r.tr.answer('greet', { ok: false, refused: 'no-companion' });
  await r.tr.flush('test');
  assert.deepEqual(r.sent.filter((e) => e.kind === 'read').map((e) => e.scene), ['b']);
  assert.equal(r.sent.filter((e) => e.kind === 'refused').length, 0, 'the page\'s own quiet asks are no refused tap');
});
