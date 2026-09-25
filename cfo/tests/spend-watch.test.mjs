// The Watch's spending pass: code finds, Ling writes the line, code keeps the
// brief — and nothing is handed over twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spendEvents, scan, save } from '../scripts/spend-watch.js';

const REPORT = {
  currency: 'CAD',
  date_range: { start: '2026-07-01', end: '2026-09-20' },
  transactions: [
    { date: '2026-09-10', merchant: 'GROCER', amount: -80 },
    { date: '2026-09-19', merchant: 'CAFE', amount: -12.5 },
    { date: '2026-09-20', merchant: 'PAY', amount: 2000 },
  ],
  budgets: { month: '2026-09', projection_ready: true, categories: [
    { category: 'dining', budget: 400, mtd: 430, projected: 610, state: 'over' },
    { category: 'groceries', budget: 600, mtd: 200, projected: 450, state: 'ok' },
  ] },
  subscriptions: [
    { merchant: 'NETFLIX', active: true, essential: false, increased: true, prior_amount: 16.49, last_amount: 18.99, increase_amount: 2.5 },
    { merchant: 'RENT', active: true, essential: true, increased: true, prior_amount: 1800, last_amount: 1900, increase_amount: 100 },
  ],
  anomalies: [{ type: 'new_recurring', merchant: 'GYM', amount: 49, date: '2026-09-15', id: 'new|GYM' }],
  payment_schedule: [{ account: 'a1', label: 'Visa', next_expected: '2026-09-12', missed_in_data: true, last_paid: { date: '2026-08-12', amount: 900 } }],
};

test('SW1 every kind of event, essential bills never a hike', () => {
  const { events } = spendEvents(REPORT, '2026-09-15');
  assert.deepEqual(events.map((e) => e.kind), ['new_transactions', 'budget_over', 'price_hike', 'new_subscription', 'missed_payment']);
  const t = events[0];
  assert.equal(t.count, 2);
  assert.equal(t.spend, 12.5);
  assert.equal(events[1].projected, 610);
});

test('SW2 saved once, never again; a quiet night still has its counts', () => {
  const s1 = scan(REPORT, {}, '2026-09-21T05:00:00Z');
  assert.equal(s1.quiet, false);
  const st = save({}, s1, [{ id: 'budget:2026-09:dining', line: 'Dining is at $430 of its $400 cap.' }], '2026-09-21');
  assert.equal(st.briefs['2026-09-21'].lines.length, 1);
  assert.equal(st.data_through, '2026-09-20');
  const s2 = scan(REPORT, st, '2026-09-22T05:00:00Z');
  assert.equal(s2.quiet, true);
  assert.deepEqual(s2.events, []);
  assert.equal(s2.checked.budgets, 2);
  assert.equal(s2.checked.cards, 1);
  const st2 = save(st, s2, [], '2026-09-22');
  assert.equal(st2.briefs['2026-09-22'].quiet, true);
});

test('SW3 a new price on the same subscription is news again', () => {
  const st = save({}, scan(REPORT, {}, 'n'), [], '2026-09-21');
  const hiked = { ...REPORT, subscriptions: [{ ...REPORT.subscriptions[0], prior_amount: 18.99, last_amount: 20.99, increase_amount: 2 }] };
  assert.deepEqual(scan(hiked, st, 'n2').events.map((e) => e.kind), ['price_hike']);
});

test('SW4 CLI: scan → save → last, against a temp skill dir', () => {
  const d = mkdtempSync(join(tmpdir(), 'cfo-sw-'));
  mkdirSync(join(d, 'data'));
  writeFileSync(join(d, 'data', 'report.json'), JSON.stringify(REPORT));
  const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'spend-watch.js');
  const run = (...a) => JSON.parse(execFileSync('node', [cli, ...a], { env: { ...process.env, SKILL_DIR: d }, encoding: 'utf8' }));
  assert.equal(run('scan').events.length, 5);
  const brief = run('save', 'lines=[{"id":"missed:a1:2026-09-12","line":"No Visa payment since 12 Aug."}]');
  assert.equal(brief.lines[0].kind, 'missed_payment');
  assert.equal(run('scan').quiet, true);
  assert.equal(run('last').spending.lines.length, 1);
  assert.equal(run('last').market, null);
});
