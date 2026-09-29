// What counts as spend: refunds net against it, a Saved outcome, one-off
// lumps, card bills and transfers to accounts not imported, double charges,
// same-day plans, posting dates in names. fixtures/spend/cases.json is shared
// with linggen-mobile (spend_cases_test.dart) — both engines answer it alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewFromLedger, savingsWording, counterpartyLabel, ruleKey, detectTransfers } from '../scripts/ledger.js';
import { cleanMerchant, categorize } from '../scripts/analyze.js';
import { currencyForLocale } from '../scripts/currency.js';
import { project } from './lib/spend-project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'spend', 'cases.json'), 'utf8'));

for (const c of CASES.reports) {
  test(`SPEND ${c.name}`, () => {
    const rows = c.rows.map((r) => ({ ...r }));
    const opts = { homeCurrency: c.home, categoryOverrides: c.overrides || null, externalAccounts: c.external || null };
    assert.deepEqual(project(viewFromLedger(rows, c.accounts, opts, null), rows), c.expect);
  });
}

// A card's "payment received" stored with a minus (a misread sign) is never
// spend: it pairs with the bank's debit by size, or stands alone as a transfer.
// Stated here by hand, not only as the engine's own recorded answer.
test('SPEND a minus-signed card payment is never spend', () => {
  const byName = (re) => CASES.reports.find((c) => re.test(c.name));
  const paired = byName(/pairs with the bank debit by size/).expect;
  assert.equal(paired.totals.spend, 80);
  assert.deepEqual(paired.transfers, ['w3', 'w4']);
  const twin = byName(/beside its correct twin/).expect;
  assert.equal(twin.totals.spend, 140); // grocer 80 + a reversed payment 60 (owed again)
  assert.deepEqual(twin.transfers, ['x3', 'x4', 'x5', 'x6']);
  // The bank's right-signed row pairs, not the misread one the same day.
  const c = byName(/beside its correct twin/);
  const rows = c.rows.map((r) => ({ ...r }));
  detectTransfers(rows, c.accounts);
  assert.equal(rows.find((r) => r.id === 'x5').transfer_pair, 'x4');
  assert.equal(rows.find((r) => r.id === 'x3').wrong_sign, true);
});

test('SPEND posting dates leave names, rule keys follow', () => {
  for (const c of CASES.clean) {
    assert.equal(cleanMerchant(c.in), c.out, c.in);
    assert.equal(ruleKey(c.in), c.rule_key, c.in);
  }
});

test('SPEND investing wording', () => {
  for (const c of CASES.savings_wording) assert.equal(savingsWording(c.in), c.out, c.in);
});

test('SPEND the account on the other side of a transfer', () => {
  for (const c of CASES.counterparty) assert.equal(counterpartyLabel(c.in), c.out, c.in);
});

test('SPEND categorize: a dated rule still matches, savings is never a category', () => {
  for (const c of CASES.categorize) assert.equal(categorize(c.merchant, c.overrides), c.out, c.merchant);
});

test('SPEND a new person\'s home currency comes from their locale', () => {
  for (const c of CASES.locale) assert.equal(currencyForLocale(c.in), c.out, c.in);
});

test('SPEND a range view: the lines cover the range only', () => {
  const c = CASES.reports.find((x) => x.name.startsWith('savings rule'));
  const rows = c.rows.map((r) => ({ ...r }));
  const v = viewFromLedger(rows, c.accounts, { homeCurrency: c.home, categoryOverrides: c.overrides }, { from: '2026-09', to: '2026-09' });
  assert.equal(v.saved.total, 470);
  assert.equal(v.totals.spend, 90);
});

test('SPEND run flags never outlive the run', () => {
  const rows = [{ id: 'x', account: 'a', date: '2026-01-01', merchant: 'REFUND SHOP', amount: 5, refund: true, one_off: true, via: 'card', saved: true, household: true }];
  detectTransfers(rows, { a: { type: 'checking' } });
  for (const f of ['refund', 'one_off', 'via', 'saved', 'household']) assert.ok(!(f in rows[0]), f);
});
