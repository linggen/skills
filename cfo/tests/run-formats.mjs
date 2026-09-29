#!/usr/bin/env node
// run-formats.mjs — bank CSV format coverage, one line per bank.
//
// Every file in fixtures/csv is SYNTHETIC data laid out in a real bank's
// export format (bank help pages, the bank2ynab registry, importer projects).
// fixtures/csv/cases.json holds what each import must give — rows after sign
// orientation, card or bank, currency, account fingerprint — and is shared
// with linggen-mobile (test/cfo/csv_formats_test.dart answers the same cases),
// so a statement reads the same on the Mac and the phone.
//
// Per bank it also imports the way the review does when clicked straight
// through (accounts.js resolveAccount → orientTransactions → mergeImport):
// the same file again adds nothing, a renamed copy lands on the same account,
// and another bank's file lands on another account.
//
//   node tests/run-formats.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCsv, orientTransactions } from '../scripts/analyze.js';
import { resolveAccount, bestAccountMatch, labelFromFilename } from '../scripts/accounts.js';
import { toLedgerRows, mergeImport } from '../scripts/ledger.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'csv');
const { cases: CASES, accounts: ACCOUNT_CASES } = JSON.parse(readFileSync(join(DIR, 'cases.json'), 'utf8'));
const read = (file) => readFileSync(join(DIR, file), 'utf8');

// A ledger and its accounts, imported into like the review clicked through.
function makeStore() {
  const accounts = {};
  let ledger = [];
  return {
    accounts,
    import(file, filename) {
      const r = analyzeCsv(read(file));
      const acct = resolveAccount(filename, r.account_fingerprint, accounts, r.kind);
      if (acct.isNew) accounts[acct.id] = { label: acct.label, type: acct.type, numbered: acct.numbered };
      const oriented = orientTransactions(r.transactions, accounts[acct.id].type);
      const merge = mergeImport(ledger, toLedgerRows(oriented.transactions, acct.id));
      ledger = merge.merged;
      return { account: acct.id, added: merge.fresh.length, parsed: r, oriented };
    },
  };
}

function parseProblems(c, first) {
  const e = c.expect, r = first.parsed, out = [];
  const rows = first.oriented.transactions.map((t) => [t.date, t.amount, t.merchant]);
  if (JSON.stringify(rows) !== JSON.stringify(e.rows)) out.push(`rows ${JSON.stringify(rows)}`);
  if (r.kind !== e.kind) out.push(`kind ${r.kind}≠${e.kind}`);
  if (first.oriented.flipped !== e.flipped) out.push(`flip ${first.oriented.flipped}≠${e.flipped}`);
  if (r.currency !== e.currency) out.push(`currency ${r.currency}≠${e.currency}`);
  if (r.account_fingerprint !== e.fingerprint) out.push(`fingerprint ${r.account_fingerprint}≠${e.fingerprint}`);
  if (r.notes.some((n) => /check/i.test(n)) !== e.asks) out.push(`asks ≠ ${e.asks}`);
  return out;
}

function importProblems(c, other) {
  const s = makeStore();
  const first = s.import(c.file, c.filename);
  const out = parseProblems(c, first);
  if (s.accounts[first.account].type !== c.expect.type) out.push(`type ${s.accounts[first.account].type}≠${c.expect.type}`);
  if (first.added !== c.expect.rows.length) out.push(`first import added ${first.added}`);
  const again = s.import(c.file, c.filename);
  if (again.added || again.account !== first.account) out.push(`re-import added ${again.added} to ${again.account}`);
  const renamed = s.import(c.file, c.renamed);
  if (renamed.added || renamed.account !== first.account) out.push(`renamed "${c.renamed}" added ${renamed.added} to ${renamed.account}`);
  const theirs = s.import(other.file, other.filename);
  if (theirs.account === first.account) out.push(`${other.bank}'s "${other.filename}" landed on this account`);
  return out;
}

let pass = 0, fail = 0;
CASES.forEach((c, i) => {
  const problems = importProblems(c, CASES[(i + 1) % CASES.length]);
  if (problems.length) { fail++; console.log(`❌ FAIL   ${c.bank} — ${problems.join('; ')}`); }
  else { pass++; console.log(`✅ PASS   ${c.bank}`); }
});
// Which account a file lands on, beyond the per-bank imports above.
for (const c of ACCOUNT_CASES) {
  const match = bestAccountMatch(c.filename, c.accounts, c.kind, c.fingerprint);
  const label = labelFromFilename(c.filename);
  if (match === c.expect.match && label === c.expect.label) { pass++; console.log(`✅ PASS   account: ${c.name}`); }
  else { fail++; console.log(`❌ FAIL   account: ${c.name} — match ${match}, label "${label}"`); }
}

console.log(`\n${pass} pass, ${fail} FAIL (${CASES.length} bank layouts, ${ACCOUNT_CASES.length} account cases).`);
process.exit(fail ? 1 : 0);
