#!/usr/bin/env node
// run-formats.mjs — bank CSV format coverage suite.
//
// Each fixture is SYNTHETIC data laid out in a real bank's documented export
// format (sources: bank2ynab format registry, importer projects, bank help
// pages). Run with:  node tests/run-formats.mjs
//
// Canonical expectations: checking fixtures carry income 3400.00 and spend
// 1831.65; card fixtures carry charges 186.59 and a 487.50 payment (income).
// `flip: true` means the bank exports charges as positive and we expect
// orientTransactions to invert the file once the account is typed 'credit'.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCsv, orientTransactions } from '../scripts/analyze.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const CHECKING = { rows: 4, spend: 1831.65, income: 3400 };
const CARD = { rows: 4, spend: 186.59, income: 487.5 };

const CASES = [
  // ── expected to parse correctly today ──
  { file: 'us-chase-card.csv', bank: 'Chase card (US)', type: 'credit', ...CARD, flip: false, fp: false },
  { file: 'us-citi-card.csv', bank: 'Citi card (US)', type: 'credit', ...CARD, flip: false, fp: false },
  { file: 'us-capitalone-card.csv', bank: 'Capital One card (US)', type: 'credit', ...CARD, flip: false, fp: true },
  { file: 'us-discover-card.csv', bank: 'Discover card (US)', type: 'credit', ...CARD, flip: true, fp: false },
  { file: 'us-amex-card.csv', bank: 'Amex card (US)', type: 'credit', ...CARD, flip: true, fp: true },
  { file: 'ca-scotiabank-checking.csv', bank: 'Scotiabank chequing (CA)', type: 'checking', ...CHECKING, flip: false, fp: false },
  { file: 'ca-tangerine-checking.csv', bank: 'Tangerine chequing (CA)', type: 'checking', ...CHECKING, flip: false, fp: false },
  { file: 'ca-rbc-checking.csv', bank: 'RBC chequing (CA)', type: 'checking', ...CHECKING, flip: false, fp: true },
  { file: 'ca-td-checking.csv', bank: 'TD chequing (CA)', type: 'checking', ...CHECKING, flip: false, fp: false },
  { file: 'ca-cibc-checking.csv', bank: 'CIBC chequing (CA)', type: 'checking', ...CHECKING, flip: false, fp: false },
  { file: 'ca-bmo-card.csv', bank: 'BMO card (CA)', type: 'credit', ...CARD, flip: false, fp: true },
  { file: 'us-bofa-checking.csv', bank: 'Bank of America (US)', type: 'checking', ...CHECKING, flip: false, fp: false },
  { file: 'us-wellsfargo-checking.csv', bank: 'Wells Fargo (US)', type: 'checking', ...CHECKING, flip: false, fp: false },
  // fp: ING's IBAN column doubles as the account fingerprint via content inference
  { file: 'nl-ing-checking.csv', bank: 'ING (NL)', type: 'checking', rows: 3, spend: 1776.4, income: 3400, flip: false, fp: true },
  { file: 'revolut-checking.csv', bank: 'Revolut', type: 'checking', ...CHECKING, flip: false, fp: false },
];

const r2 = (n) => Math.round(n * 100) / 100;
let pass = 0, fail = 0, gapsConfirmed = 0, gapsFixed = 0;

for (const c of CASES) {
  const parsed = analyzeCsv(readFileSync(join(FIX, c.file), 'utf8'));
  const { transactions, flipped } = orientTransactions(parsed.transactions || [], c.type);
  const spend = r2(transactions.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0));
  const income = r2(transactions.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0));
  const dated = transactions.filter((t) => t.date).length;
  const problems = [];
  if (transactions.length !== c.rows) problems.push(`rows ${transactions.length}≠${c.rows}`);
  if (spend !== c.spend) problems.push(`spend ${spend}≠${c.spend}`);
  if (income !== c.income) problems.push(`income ${income}≠${c.income}`);
  if (dated !== transactions.length) problems.push(`${transactions.length - dated} undated`);
  if (flipped !== c.flip) problems.push(`flip ${flipped}≠${c.flip}`);
  if (!!parsed.account_fingerprint !== c.fp) problems.push(`fingerprint ${!!parsed.account_fingerprint}≠${c.fp}`);

  const ok = problems.length === 0;
  if (c.gap) {
    if (ok) { gapsFixed++; console.log(`✅ FIXED  ${c.bank} — gap closed (${c.gap})`); }
    else { gapsConfirmed++; console.log(`⚠️  GAP    ${c.bank} — ${problems.join(', ')}  [${c.gap}]`); }
  } else if (ok) { pass++; console.log(`✅ PASS   ${c.bank}`); }
  else { fail++; console.log(`❌ FAIL   ${c.bank} — ${problems.join(', ')}`); }
}

console.log(`\n${pass} supported pass, ${fail} supported FAIL, ${gapsConfirmed} known gaps confirmed, ${gapsFixed} gaps closed.`);
if (gapsFixed) console.log('Gaps marked FIXED: remove their `gap:` field to promote them to supported.');
process.exit(fail ? 1 : 0);
