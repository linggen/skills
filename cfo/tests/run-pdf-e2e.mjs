#!/usr/bin/env node
// run-pdf-e2e.mjs — real PDF files end to end: synthetic statements (every
// name and number invented; tests/fixtures/pdf/gen.py writes them) go through
// pdf.js and the parser exactly as an import does, each checked row by row
// against its `.truth.json`; then the ledger's transfer detection runs over
// all the accounts together. The phone is held to the same truth by
// linggen-mobile test/cfo/pdf_e2e_test.dart.
//
//   node tests/run-pdf-e2e.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pdfToTransactions } from '../scripts/pdf-import.js';
import { toLedgerRows, detectTransfers } from '../scripts/ledger.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pdf');
const DATE_LEAD = /^\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2})\b/i;

// pdf.js warns once per standard font it cannot fetch in node; the text layer
// does not need the glyphs.
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('standardFontDataUrl')) warn(...a); };
const log = console.log;
console.log = (...a) => { if (!String(a[0]).includes('standardFontDataUrl')) log(...a); };

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).map((f) => f.slice(0, -4)).sort();
t('E0 fixtures present', names.length >= 4, names.join(', '));

const rows = [], accounts = {}, truthOf = new Map();
for (const n of names) {
  const truth = JSON.parse(fs.readFileSync(path.join(DIR, `${n}.truth.json`), 'utf8'));
  const { transactions: got } = await pdfToTransactions(new Uint8Array(fs.readFileSync(path.join(DIR, `${n}.pdf`))));
  t(`${n}: row count`, got.length === truth.rows.length, `${got.length} of ${truth.rows.length}`);
  const bad = [];
  truth.rows.forEach((w, i) => {
    const g = got[i];
    const ok = g && g.date === w.date && Math.abs(g.amount - w.amount) < 0.005
      && g.merchant.toUpperCase().includes(w.merchant.toUpperCase()) && !DATE_LEAD.test(g.merchant);
    if (!ok) bad.push(`[${i}] want ${w.date} ${w.amount} "${w.merchant}" got ${g ? `${g.date} ${g.amount} "${g.merchant}"` : 'nothing'}`);
  });
  t(`${n}: every row's date, signed amount and merchant`, !bad.length, bad.join('; '));
  const acct = `acct_${n}`;
  accounts[acct] = { type: truth.account_type };
  toLedgerRows(got, acct).forEach((r, i) => { rows.push(r); truthOf.set(r.id, truth.rows[i]); });
}

detectTransfers(rows, accounts);
const wrong = rows.filter((r) => truthOf.get(r.id) && r.transfer !== truthOf.get(r.id).transfer)
  .map((r) => `${r.merchant} ${r.amount} → ${r.transfer}`);
t('E1 card payments and own-account moves are transfers, nothing else is', !wrong.length, wrong.join('; '));
const pay = rows.find((r) => /BMO MASTERCARD/.test(r.merchant));
const recv = rows.find((r) => /AUTOMATIC PYMT/.test(r.merchant));
t('E2 the chequing payment pairs with the card\'s payment received',
  pay && recv && pay.transfer_pair === recv.id && recv.transfer_pair === pay.id);

log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
