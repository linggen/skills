#!/usr/bin/env node
// run-pdf.mjs — PDF statement text parsing: the year each row lands in, and
// which way the money moved. Pure (no pdf.js): feeds reconstructed lines.
//
//   node tests/run-pdf.mjs

import { parseStatementText, statementClose } from '../scripts/pdf-import.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const byMerchant = (txns, re) => txns.find((x) => re.test(x.merchant));

// ── Year: a statement that straddles New Year ──
console.log('— statement year —');
const decJan = [
  'VISA STATEMENT',
  'Statement period Dec 15 - Jan 14, 2026',
  'Dec 18 GROCER HALIFAX NS 82.10',
  'Dec 31 NETFLIX.COM 18.99',
  'Jan 03 SHELL GAS 60.00',
  'Jan 10 PAYMENT - THANK YOU 400.00',
];
const dj = parseStatementText(decJan);
t('P1 Dec row books the PRIOR year', byMerchant(dj, /GROCER/)?.date === '2025-12-18', byMerchant(dj, /GROCER/)?.date);
t('P2 Dec 31 row books the prior year', byMerchant(dj, /NETFLIX/)?.date === '2025-12-31', byMerchant(dj, /NETFLIX/)?.date);
t('P3 Jan row books the closing year', byMerchant(dj, /SHELL/)?.date === '2026-01-03', byMerchant(dj, /SHELL/)?.date);

const bothYears = parseStatementText([
  'Statement period: December 15, 2025 to January 14, 2026',
  'Dec 20 CAFE 5.00',
  'Jan 02 CAFE 6.00',
]);
t('P4 full-dated period: Dec → 2025, Jan → 2026',
  bothYears[0]?.date === '2025-12-20' && bothYears[1]?.date === '2026-01-02', bothYears.map((x) => x.date).join(' '));

const numeric = parseStatementText(['Closing date 01/14/2026', '12/28 BOOKSTORE 20.00', '01/05 BOOKSTORE 21.00']);
t('P5 numeric MM/DD rows straddle the year', numeric[0]?.date === '2025-12-28' && numeric[1]?.date === '2026-01-05',
  numeric.map((x) => x.date).join(' '));

const midYear = parseStatementText(['Statement date Jul 14, 2026', 'Jun 20 CAFE 5.00', 'Jul 02 CAFE 6.00']);
t('P6 an ordinary mid-year statement is unchanged', midYear[0]?.date === '2026-06-20' && midYear[1]?.date === '2026-07-02');

const bare = statementClose(['ACME BANK 2026', 'no dates here']);
t('P7 a bare year alone keeps the whole year', bare.year === 2026 && bare.month === 12, JSON.stringify(bare));

// ── Direction ──
console.log('\n— credit vs debit —');
const dir = parseStatementText([
  'Statement date Jul 31, 2026',
  'Jul 02 BILL PAYMENT HYDRO ONE 120.00',
  'Jul 03 INTERAC E-TRANSFER SENT 500.00',
  'Jul 04 PAYMENT TO VISA 250.00',
  'Jul 05 ATM WITHDRAWAL 60.00',
  'Jul 06 CREDIT CARD PAYMENT 300.00',
  'Jul 07 PAYROLL DEPOSIT 3,400.00',
  'Jul 08 AMAZON REFUND 49.99',
  'Jul 09 PAYMENT - THANK YOU 487.50',
  'Jul 10 INTERAC E-TRANSFER RECEIVED 75.00',
  'Jul 11 TRANSFER IN FROM SAVINGS 1,000.00',
  'Jul 12 STARBUCKS 6.45',
  'Jul 13 MYSTERY CO 10.00 CR',
  'Jul 14 SOMETHING ELSE 11.00+',
  'Jul 15 DIRECT DEPOSIT FEE 2.00 DR',
  'Jul 16 STATEMENT CREDIT ADJUSTMENT 25.00',
  'Jul 17 CASH BACK REWARD 12.00',
]);
const sign = (re) => Math.sign(byMerchant(dir, re)?.amount ?? 0);
t('D1 "BILL PAYMENT HYDRO ONE" is spend', sign(/HYDRO/) === -1);
t('D2 "INTERAC E-TRANSFER SENT" is spend', sign(/SENT/) === -1);
t('D3 "PAYMENT TO VISA" is spend', sign(/TO VISA/) === -1);
t('D4 withdrawal is spend', sign(/WITHDRAWAL/) === -1);
t('D5 bare "credit card payment" is not income', sign(/CREDIT CARD/) === -1);
t('D6 deposit is income', sign(/PAYROLL/) === 1);
t('D7 refund is income', sign(/REFUND/) === 1);
t('D8 "payment - thank you" is income', sign(/THANK YOU/) === 1);
t('D9 "e-transfer received" is income', sign(/RECEIVED/) === 1);
t('D10 "transfer in" is income', sign(/TRANSFER IN/) === 1);
t('D11 plain merchant is spend', sign(/STARBUCKS/) === -1);
t('D12 explicit CR marker is income', sign(/MYSTERY/) === 1);
t('D13 explicit trailing + is income', sign(/SOMETHING ELSE/) === 1);
t('D14 explicit DR beats a deposit word', sign(/DEPOSIT FEE/) === -1);
t('D15 a statement credit is money back', sign(/STATEMENT CREDIT/) === 1);
t('D16 cash back is money back', sign(/CASH BACK/) === 1);

// Column position: a Withdrawals | Deposits layout with no words to go on.
const cell = (x, s) => ({ x, s });
const cols = parseStatementText([
  { text: 'Statement date Jul 31, 2026', cells: [cell(10, 'Statement date Jul 31, 2026')] },
  { text: 'Date Description Withdrawals Deposits Balance',
    cells: [cell(10, 'Date'), cell(60, 'Description'), cell(300, 'Withdrawals'), cell(380, 'Deposits'), cell(460, 'Balance')] },
  { text: 'Jul 02 ACME LTD 900.00 1,900.00',
    cells: [cell(10, 'Jul 02'), cell(60, 'ACME LTD'), cell(385, '900.00'), cell(460, '1,900.00')] },
  { text: 'Jul 03 REFUND DESK 40.00 1,860.00',
    cells: [cell(10, 'Jul 03'), cell(60, 'REFUND DESK'), cell(305, '40.00'), cell(460, '1,860.00')] },
]);
t('C1 amount under Deposits is income', Math.sign(byMerchant(cols, /ACME/)?.amount) === 1);
t('C2 amount under Withdrawals is spend, even beside "refund"', Math.sign(byMerchant(cols, /REFUND DESK/)?.amount) === -1);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
