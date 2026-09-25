// Per-account currency: detection, the import's account cells, the migration,
// and the grouped report. fixtures/currency/cases.json is shared with
// linggen-mobile (test/cfo/currency_test.dart answers the same cases), so the
// Mac and the phone detect, migrate and group alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectCurrency, importCurrencyCells, seedAccountCurrencies, accountHints, migrateLedgerText,
  accountCurrency, leadCurrency, fxRate, parseEcbXml, parseBocValet,
} from '../scripts/currency.js';
import { analyzeCsv } from '../scripts/analyze.js';
import { viewFromLedger, toLedgerRows } from '../scripts/ledger.js';
import { Register, accountsOf } from '../scripts/lww.js';
import { project } from './lib/currency-project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'currency', 'cases.json'), 'utf8'));

for (const c of CASES.detect) {
  test(`CUR detect: ${c.name}`, () => assert.deepEqual(detectCurrency(c.text), c.expect));
}

for (const c of CASES.csv) {
  test(`CUR csv: ${c.name}`, () => {
    const r = analyzeCsv(c.csv);
    assert.deepEqual({ currency: r.currency, ambiguous: r.currency_ambiguous }, c.expect);
  });
}

for (const c of CASES.import_cells) {
  test(`CUR import cells: ${c.name}`, () => assert.deepEqual(importCurrencyCells(c.acc, c.detected, c.home), c.expect));
}

function registerOf(accounts) {
  const reg = new Register('mac-t', null);
  for (const [id, a] of Object.entries(accounts)) for (const [f, v] of Object.entries(a)) reg.set(`acc:${id}|${f}`, v);
  return reg;
}

for (const c of CASES.migrate) {
  test(`CUR migrate: ${c.name}`, () => {
    const reg = registerOf(c.accounts);
    const rowIds = c.ledger.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    const ids = [...Object.keys(c.accounts), ...rowIds.map((r) => r.account)];
    const hint = (id) => accountHints(id, accountsOf(reg)[id], c.imports);
    assert.equal(seedAccountCurrencies(reg, ids, c.home, hint), c.expect.seeded);
    const accs = accountsOf(reg);
    for (const [id, want] of Object.entries(c.expect.accounts)) {
      assert.deepEqual({ currency: accs[id].currency, currency_source: accs[id].currency_source }, want, id);
    }
    const text = migrateLedgerText(c.ledger, accs, c.home);
    assert.ok(text != null);
    const after = text.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    assert.deepEqual(Object.fromEntries(after.map((r) => [r.id, r.currency])), c.expect.rows);
    assert.deepEqual(after.map((r) => r.id), rowIds.map((r) => r.id), 'ids never change');
    assert.ok(text.includes('not json — kept as it is'));
    assert.ok(text.endsWith('\n'), 'the trailing newline survives');
    // Idempotent: a second run seeds nothing and rewrites nothing.
    assert.equal(seedAccountCurrencies(reg, ids, c.home, hint), 0);
    assert.equal(migrateLedgerText(text, accountsOf(reg), c.home), null);
  });
}

for (const c of CASES.reports) {
  test(`CUR report: ${c.name}`, () => {
    const rows = c.rows.map((r) => ({ ...r }));
    const report = viewFromLedger(rows, c.accounts, { homeCurrency: c.home, fx: c.fx, budgets: c.budgets || null }, null);
    assert.deepEqual(project(report, rows), c.expect);
  });
}

test('CUR a single-currency report carries no multi-currency fields', () => {
  const c = CASES.reports.find((x) => x.name.startsWith('EUR-only'));
  const r = viewFromLedger(c.rows.map((x) => ({ ...x })), c.accounts, { homeCurrency: c.home, fx: c.fx }, null);
  for (const k of ['by_currency', 'combined', 'fx_missing']) assert.equal(k in r, false, k);
  assert.equal(r.currency, 'EUR');
});

test('CUR a ledger with no currency anywhere reports exactly as before', () => {
  const rows = toLedgerRows([{ date: '2026-03-01', merchant: 'PAYROLL', amount: 3000 }, { date: '2026-03-03', merchant: 'RENT', amount: -1200 }], 'chk');
  const r = viewFromLedger(rows, { chk: { type: 'checking' } }, {}, null);
  assert.equal(r.currency, null);
  assert.equal('currencies' in r, false);
  assert.equal('currency' in rows[0], false);
});

test('CUR the combined total never adds raw amounts across currencies', () => {
  const c = CASES.reports[0];
  const rows = c.rows.map((r) => ({ ...r }));
  const r = viewFromLedger(rows, c.accounts, { homeCurrency: c.home, fx: c.fx }, null);
  const raw = r.by_currency.CAD.totals.spend + r.by_currency.USD.totals.spend;
  assert.notEqual(r.combined.totals.spend, raw);
  const k = fxRate(c.fx, 'USD', 'CAD');
  assert.equal(r.combined.totals.spend, Math.round((r.by_currency.CAD.totals.spend + r.by_currency.USD.totals.spend * k) * 100) / 100);
  assert.equal(r.combined.approx, true);
  assert.ok(r.subscriptions.every((s) => s.currency));
  assert.ok(r.transactions.every((t) => t.currency));
});

test('CUR lead currency: the raw number, a tie to home', () => {
  assert.equal(leadCurrency({ CAD: { amount: 100, rows: 1 }, USD: { amount: 99, rows: 1 } }, null, 'USD'), 'CAD');
  assert.equal(leadCurrency({ CAD: { amount: 100, rows: 1 }, USD: { amount: 120, rows: 1 } }, null, 'CAD'), 'USD');
  assert.equal(leadCurrency({ CAD: { amount: 100, rows: 1 }, USD: { amount: 100, rows: 1 } }, null, 'USD'), 'USD');
  assert.equal(leadCurrency({ CAD: { amount: 100, rows: 1 }, USD: { amount: 100, rows: 1 } }, null, 'EUR'), 'CAD');
});

test('CUR an assumed currency follows the home setting; a detected one does not', () => {
  assert.deepEqual(accountCurrency({ currency: 'USD', currency_source: 'assumed' }, 'CAD'), { currency: 'CAD', source: 'assumed' });
  assert.deepEqual(accountCurrency({ currency: 'USD', currency_source: 'detected' }, 'CAD'), { currency: 'USD', source: 'detected' });
  assert.deepEqual(accountCurrency(undefined, 'CAD'), { currency: 'CAD', source: 'assumed' });
});

test('CUR seed cells lose to any real edit', () => {
  const reg = new Register('mac-a', null);
  seedAccountCurrencies(reg, ['x'], 'CAD');
  const phone = new Register('phone-b', null);
  phone.set('acc:x|currency', 'USD');
  phone.set('acc:x|currency_source', 'user');
  reg.mergeState(phone.toState());
  assert.deepEqual(accountsOf(reg).x, { currency: 'USD', currency_source: 'user' });
});

test('CUR rate parsers: ECB XML and Bank of Canada Valet', () => {
  const ecb = parseEcbXml(`<Cube><Cube time='2026-09-24'><Cube currency='USD' rate='1.1403'/><Cube currency='CAD' rate='1.6127'/></Cube></Cube>`);
  assert.deepEqual(ecb, { base: 'EUR', date: '2026-09-24', source: 'ECB', rates: { USD: 1.1403, CAD: 1.6127 } });
  const boc = parseBocValet({ observations: [{ d: '2026-09-24', FXUSDCAD: { v: '1.3800' }, FXEURCAD: { v: '1.6100' } }] });
  assert.equal(boc.base, 'CAD');
  assert.ok(Math.abs(fxRate(boc, 'USD', 'CAD') - 1.38) < 1e-9);
  assert.equal(parseEcbXml('<html>blocked</html>'), null);
  assert.equal(parseBocValet('nope'), null);
});
