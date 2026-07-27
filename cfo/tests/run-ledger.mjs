#!/usr/bin/env node
// run-ledger.mjs — correctness + dedup verification suite.
//
//   node tests/run-ledger.mjs
//
// Part A: synthetic cases — dedup semantics and transfer detection from first
//         principles (no environment needed).
// Part B: LIVE audit of ~/.linggen/skills/cfo/data — internal invariants of the
//         real ledger (unique ids, transfer pairing, totals/by_month/by_category
//         agreement) plus a source-fidelity check: every transaction in the
//         original ~/Downloads/cfo-bank-tests CSVs must appear in the ledger
//         EXACTLY once, no matter how many overlapping files were imported.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeCsv, orientTransactions, cleanMerchant } from '../scripts/analyze.js';
import { toLedgerRows, mergeLedger, detectTransfers, reportFromLedger } from '../scripts/ledger.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const r2 = (n) => Math.round(n * 100) / 100;
const near = (a, b) => Math.abs(a - b) < 0.02; // per-bucket rounding tolerance

// ── Part A: synthetic ──
console.log('— Part A: synthetic dedup + transfer semantics —');

const dup = [
  { date: '2026-05-03', merchant: 'STARBUCKS', amount: -6.45 },
  { date: '2026-05-03', merchant: 'STARBUCKS', amount: -6.45 },
];
t('A1 genuine same-day duplicates BOTH kept', mergeLedger([], toLedgerRows(dup, 'a')).added.length === 2);

const first = toLedgerRows(dup, 'a');
t('A2 re-importing the same statement adds 0', mergeLedger(first, toLedgerRows(dup, 'a')).added.length === 0);

const fileA = [
  { date: '2026-01-05', merchant: 'RENT', amount: -1000 },
  { date: '2026-01-12', merchant: 'GROCER', amount: -80 },
  { date: '2026-01-19', merchant: 'GAS', amount: -50 },
];
const fileB = [...fileA.slice(1), { date: '2026-01-26', merchant: 'CAFE', amount: -10 }, { date: '2026-02-02', merchant: 'GROCER', amount: -90 }];
const afterA = mergeLedger([], toLedgerRows(fileA, 'a')).merged;
const { added: overlapAdded } = mergeLedger(afterA, toLedgerRows(fileB, 'a'));
t('A3 overlapping statement adds ONLY new rows', overlapAdded.length === 2, `${overlapAdded.length} of ${fileB.length}`);

t('A4 control: same file on a DIFFERENT account does not dedup',
  mergeLedger(afterA, toLedgerRows(fileA, 'b')).added.length === 3);

const pair = [
  { id: 'p1', account: 'chk', date: '2026-05-15', merchant: 'PAYMENT TO VISA', amount: -487.5, transfer: false, transfer_pair: null },
  { id: 'p2', account: 'visa', date: '2026-05-16', merchant: 'PAYMENT - THANK YOU', amount: 487.5, transfer: false, transfer_pair: null },
  { id: 'p3', account: 'chk', date: '2026-05-10', merchant: 'AMAZON PURCHASE', amount: -49.99, transfer: false, transfer_pair: null },
  { id: 'p4', account: 'visa', date: '2026-05-12', merchant: 'AMAZON REFUND', amount: 49.99, transfer: false, transfer_pair: null },
];
detectTransfers(pair, { visa: { type: 'credit' }, chk: { type: 'checking' } });
t('A5 card payment pair excluded, refund pair NOT', pair[0].transfer && pair[1].transfer && !pair[2].transfer && !pair[3].transfer);

const synth = mergeLedger(
  mergeLedger([], toLedgerRows([
    { date: '2026-03-01', merchant: 'PAYROLL', amount: 3000 },
    { date: '2026-03-03', merchant: 'RENT', amount: -1200 },
    { date: '2026-03-15', merchant: 'PAYMENT TO VISA', amount: -250 },
    { date: '2026-04-01', merchant: 'PAYROLL', amount: 3000 },
  ], 'chk')).merged,
  toLedgerRows([
    { date: '2026-03-05', merchant: 'NETFLIX', amount: -20 },
    { date: '2026-03-16', merchant: 'PAYMENT THANK YOU', amount: 250 },
  ], 'visa'),
).merged;
const sRep = reportFromLedger(synth, { chk: { type: 'checking' }, visa: { type: 'credit' } });
t('A6 totals exclude the transfer on BOTH sides', sRep.totals.spend === 1220 && sRep.totals.income === 6000,
  `spend ${sRep.totals.spend} income ${sRep.totals.income}`);

// ── Part A1b: the pairing must not depend on row order ─────────────────────
//
// The Mac walks the ledger in file order; the phone walks it sorted by (date,
// id). Any choice left to "whichever came first in the list" makes the two
// devices report different numbers from the SAME ledger — this cost $900 of
// June income on 2026-07-27, when a -$900 card payment sat exactly one day from
// two different +$900 credits and each side paired a different one.

const ambiguous = [
  { id: 'zz-before', account: 'chk', date: '2026-06-23', merchant: 'Online Bill Payment, AMEX CARDS', amount: 900, transfer: false, transfer_pair: null },
  { id: 'mm-debit', account: 'visa', date: '2026-06-24', merchant: 'PAYMENT TO VISA', amount: -900, transfer: false, transfer_pair: null },
  { id: 'aa-after', account: 'card2', date: '2026-06-25', merchant: 'PAYMENT THANK YOU', amount: 900, transfer: false, transfer_pair: null },
];
const pairedWith = (order) => {
  const rows = order.map((r) => ({ ...r }));
  detectTransfers(rows, {});
  return rows.find((r) => r.id === 'mm-debit').transfer_pair;
};
const orders = [
  ambiguous,
  [...ambiguous].reverse(),
  [ambiguous[1], ambiguous[0], ambiguous[2]],
  [ambiguous[2], ambiguous[1], ambiguous[0]],
];
const picks = new Set(orders.map(pairedWith));
t('A5b equidistant credits pair the same way in every row order', picks.size === 1, [...picks].join(' / '));
// The id ordering is deliberately hostile here: 'aa-after' sorts FIRST, so a
// bare smallest-id tiebreak would also pass the test above while picking the
// credit that landed before the payment. The stated rule is date-direction.
t('A5c the credit ON/AFTER the debit wins the tie', [...picks][0] === 'aa-after', [...picks][0]);

// ── Part A2: single-row transfer signals + learning rules (issue #1) ──
// These fire when the counterparty account was never imported, so pairing can't.
console.log('\n— Part A2: transfer signals + learning rules —');
const acc2 = { chk: { type: 'checking' }, card: { type: 'credit' } };
const sig = (merchant, amount, account, overrides) => {
  const rows = toLedgerRows([{ date: '2026-06-15', merchant, amount }], account);
  detectTransfers(rows, acc2, 5, overrides);
  return rows[0].transfer;
};
t('A7 card payment to an un-imported card → transfer', sig('[CW]AMEX CARDS', -900, 'chk'));
t('A8 "TF" account-transfer token → transfer', sig('[CW] TF 0133-482', -20000, 'chk'));
t('A9 word-boundary: "tf" vocab does NOT eat NETFLIX', !sig('NETFLIX.COM', -18.99, 'card'));
t('A10 ambiguous INTERAC e-transfer kept (not auto-excluded)', !sig('[CW]INTERAC ETRNSFR SENT BETTY RO', -240, 'chk'));
t('A11 user "transfer" rule excludes a kept row', sig('[CW]INTERAC ETRNSFR CANADIAN TIRE BANK', -2822, 'chk', { 'canadian tire bank': 'transfer' }));
t('A12 user category rule un-flags a heuristic transfer (kept as real spend)', !sig('[CW]AMEX CARDS', -900, 'chk', { 'amex cards': 'shopping' }));
t('A13 real card charge stays spend (credit-account debit, not a payment)', !sig('SHANGHAI 360 HALIFAX NS', -18.78, 'card'));

// ── Part A3: merchant cleanup (issue #3) ──
console.log('\n— Part A3: merchant cleanup —');
const cm = (raw) => cleanMerchant(raw);
t('A14 strips leading bank code [CW]', cm('[CW]AMEX CARDS') === 'AMEX CARDS', cm('[CW]AMEX CARDS'));
t('A15 strips leading store number + trailing city/prov', cm('095 HRM REC ONLINE XP DARTMOUTH NS') === 'HRM REC ONLINE XP', cm('095 HRM REC ONLINE XP DARTMOUTH NS'));
t('A16 strips trailing "CITY PROV"', cm('ALLSTATE INS OF CANADA MARKHAM ON') === 'ALLSTATE INS OF CANADA', cm('ALLSTATE INS OF CANADA MARKHAM ON'));
t('A17 strips e-transfer ref id', cm('[CW]INTERAC ETRNSFR SENT BETTY RO 20260941456V5FRHY') === 'INTERAC ETRNSFR SENT BETTY RO', cm('[CW]INTERAC ETRNSFR SENT BETTY RO 20260941456V5FRHY'));
t('A18 leaves a clean name untouched', cm('NETFLIX.COM') === 'NETFLIX.COM');
t('A19 no over-strip: 2-token name ending province-like word', cm('GAME ON') === 'GAME ON', cm('GAME ON'));
t('A20 keeps digit-led brand (not a ref)', cm('1PASSWORD') === '1PASSWORD', cm('1PASSWORD'));
t('A21 idempotent', cm(cm('[CW]095 ROGERS BK MC TORONTO ON')) === cm('[CW]095 ROGERS BK MC TORONTO ON'));

// ── Part B: live ledger audit ──
const DATA = join(process.env.HOME, '.linggen/skills/cfo/data');
if (!existsSync(join(DATA, 'ledger'))) {
  console.log('\n(no live ledger found — Part B skipped)');
} else {
  console.log('\n— Part B: LIVE ledger audit —');
  const rows = [];
  for (const f of readdirSync(join(DATA, 'ledger'))) {
    for (const l of readFileSync(join(DATA, 'ledger', f), 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l));
  }
  const accounts = JSON.parse(readFileSync(join(DATA, 'accounts.json'), 'utf8'));

  const ids = rows.map((r) => r.id);
  t('B1 all ledger row ids unique (THE dedup invariant)', new Set(ids).size === ids.length, `${ids.length} rows`);

  const rep = reportFromLedger(rows, accounts); // recomputes transfer flags in place
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const transfers = rows.filter((r) => r.transfer);
  // Single-row signals (card payment to an un-imported card, "TF" tokens) now
  // produce valid UNPAIRED transfers (transfer_pair === null). Only rows that
  // claim a pair must have a valid opposite-sign cross-account partner.
  const paired = transfers.filter((r) => r.transfer_pair);
  const badPair = paired.find((r) => {
    const p = byId[r.transfer_pair];
    return !p || !p.transfer || p.transfer_pair !== r.id || p.account === r.account || Math.abs(p.amount + r.amount) > 0.005;
  });
  t('B2 every PAIRED transfer has a valid opposite-sign cross-account pair', paired.length % 2 === 0 && !badPair,
    `${transfers.length} transfers (${paired.length} paired, ${transfers.length - paired.length} single-row)`);

  const spendable = rows.filter((r) => !r.transfer);
  const spend = r2(spendable.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0));
  const income = r2(spendable.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0));
  t('B3 report totals == independent row sum', near(spend, rep.totals.spend) && near(income, rep.totals.income),
    `spend ${rep.totals.spend} income ${rep.totals.income}`);

  const mSpend = r2(Object.values(rep.by_month).reduce((a, m) => a + m.spend, 0));
  const mIncome = r2(Object.values(rep.by_month).reduce((a, m) => a + m.income, 0));
  t('B4 by_month sums == totals (dated rows)', near(mSpend, rep.totals.spend) && near(mIncome, rep.totals.income));

  const cSpend = r2(rep.by_category.reduce((a, c) => a + c.spend, 0));
  t('B5 by_category sums == total spend', near(cSpend, rep.totals.spend));

  // Source fidelity: re-parse each demo CSV and require every transaction id
  // to exist in the ledger (and B1 already proves nothing exists twice).
  const demo = join(process.env.HOME, 'Downloads/cfo-bank-tests');
  if (existsSync(demo) && existsSync(join(DATA, 'imports.json'))) {
    const log = JSON.parse(readFileSync(join(DATA, 'imports.json'), 'utf8'));
    const fileAcct = {};
    for (const e of log) fileAcct[e.file] = e.account;
    const idSet = new Set(ids);
    for (const f of readdirSync(demo).filter((x) => x.endsWith('.csv'))) {
      const acct = fileAcct[f];
      if (!acct) { console.log(`   (skip ${f} — never imported)`); continue; }
      const parsed = analyzeCsv(readFileSync(join(demo, f), 'utf8'));
      const oriented = orientTransactions(parsed.transactions, (accounts[acct] || {}).type);
      const want = toLedgerRows(oriented.transactions, acct);
      const missing = want.filter((w) => !idSet.has(w.id));
      t(`B6 ${f}: all ${want.length} source rows in ledger exactly once`, missing.length === 0,
        missing.length ? `${missing.length} MISSING` : `account "${accounts[acct]?.label}"`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
