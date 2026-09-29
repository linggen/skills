// Writes fixtures/spend/cases.json (shared with linggen-mobile): the inputs
// below plus the Mac engine's answers — refunds net against spend, a Saved
// outcome, one-off lumps, card bills and transfers to accounts not imported,
// the double-charge and same-day-plan rules, posting dates in merchant names.
// Every bank here is a stand-in for any bank: nothing keys off a name.
// Run `node cfo/tests/lib/spend-cases.mjs` after an intended change, review the
// diff, then `node cfo/tests/lib/shared-fixtures.mjs --write`.
import { writeFileSync } from 'node:fs';
import { viewFromLedger, savingsWording, counterpartyLabel, ruleKey } from '../../scripts/ledger.js';
import { cleanMerchant, categorize } from '../../scripts/analyze.js';
import { currencyForLocale } from '../../scripts/currency.js';
import { project } from './spend-project.mjs';

const row = (id, account, date, merchant, amount, extra = {}) => ({ id, account, date, merchant, amount, category: null, transfer: false, transfer_pair: null, ...extra });
const months = (n, from, fn) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1 + i, 1));
  return fn(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, i);
}).flat();

const reports = [
  {
    name: 'US card refund nets against its category, not income (Chase-style card, no refund word)',
    home: 'USD',
    accounts: { card: { label: 'Sapphire', type: 'credit' }, chk: { label: 'Checking', type: 'checking' } },
    rows: [
      row('a1', 'chk', '2026-08-01', 'PAYROLL ACME INC', 4000),
      row('a2', 'card', '2026-08-03', 'AMAZON MKTPL', -120),
      row('a3', 'card', '2026-08-09', 'AMAZON MKTPL', 40),
      row('a4', 'card', '2026-08-12', 'SUSHI RESTAURANT', -60),
      row('a5', 'card', '2026-08-20', 'PAYMENT THANK YOU', 180),
      row('a6', 'chk', '2026-08-19', 'CHASE CREDIT CRD AUTOPAY', -180),
    ],
  },
  {
    name: 'UK current account: "Refund from" wording nets; a refund with no spend in its category comes off the total',
    home: 'GBP',
    accounts: { cur: { label: 'Monzo', type: 'checking' } },
    rows: [
      row('b1', 'cur', '2026-09-01', 'SALARY WIDGETS LTD', 2800),
      row('b2', 'cur', '2026-09-04', 'ASOS SHOP', -60),
      row('b3', 'cur', '2026-09-10', 'Refund from ASOS SHOP', 25),
      row('b4', 'cur', '2026-09-12', 'TESCO SUPERMARKET', -48.2),
      row('b5', 'cur', '2026-09-15', 'EXPEDIA HOTEL REFUND', 20),
      row('b6', 'cur', '2026-09-18', 'CASHBACK REWARD', 5),
    ],
  },
  {
    name: 'a bank account typed as a card: its deposits stay income',
    home: 'CAD',
    accounts: { acc: { label: 'statement', type: 'credit' } },
    rows: [
      row('m1', 'acc', '2026-06-01', 'ACME PAYROLL', 3400),
      row('m2', 'acc', '2026-06-03', 'CAFE MOCHA', -5.5),
    ],
  },
  {
    name: 'income rule wins over refund wording',
    home: 'USD',
    overrides: { 'tax refund irs': 'income' },
    accounts: { chk: { type: 'checking' } },
    rows: [
      row('c1', 'chk', '2026-04-10', 'TAX REFUND IRS TREAS 310', 1200),
      row('c2', 'chk', '2026-04-11', 'GROCERY OUTLET', -80),
    ],
  },
  {
    name: 'Vanguard and ISA contributions: suggested as savings, never a bare name or "inv"oice',
    home: 'USD',
    accounts: { chk: { type: 'checking' } },
    rows: [
      row('d1', 'chk', '2026-07-02', 'VANGUARD BUY INVESTMENT', -500),
      row('d2', 'chk', '2026-08-02', 'VANGUARD BUY INVESTMENT', -500),
      row('d3', 'chk', '2026-08-05', 'HL STOCKS AND SHARES ISA', -200),
      row('d4', 'chk', '2026-08-06', "Isa's Bakery", -12),
      row('d5', 'chk', '2026-08-07', 'INV 20931 OFFICE DEPOT', -45),
      row('d6', 'chk', '2026-08-08', 'RRSP CONTRIB TD MUTUAL FUNDS', -150),
    ],
  },
  {
    name: 'savings rule: out of spend, into Saved; parallel same-day plans read 420/mo, not a double charge',
    home: 'CAD',
    overrides: { 'acme inv inc. inv/pla': 'savings', 'fonds-m msp': 'savings' },
    accounts: { chq: { type: 'checking' } },
    rows: [
      ...months(3, '2026-07', (m, i) => [
        row(`e${i}a`, 'chq', `${m}-02`, 'ACME INV INC. INV/PLA', -210),
        row(`e${i}b`, 'chq', `${m}-02`, 'ACME INV INC. INV/PLA', -210),
        row(`e${i}c`, 'chq', `${m}-15`, 'M-FUNDS/FONDS-M MSP/DIV', -50),
        row(`e${i}d`, 'chq', `${m}-20`, 'HYDRO QUEBEC', -90),
        row(`e${i}e`, 'chq', `${m}-25`, 'PAYROLL', 3000),
      ]),
    ],
  },
  {
    name: 'same-day plans at a subscription: one line at their sum',
    home: 'USD',
    accounts: { card: { type: 'credit' } },
    rows: months(3, '2026-06', (m, i) => [
      row(`f${i}a`, 'card', `${m}-08`, 'STREAMFLIX.COM', -9.99),
      row(`f${i}b`, 'card', `${m}-08`, 'STREAMFLIX.COM', -4.99),
    ]),
  },
  {
    name: 'UK one-off: a solicitor lump far above a usual month is labelled; totals keep it',
    home: 'GBP',
    accounts: { cur: { type: 'checking' } },
    rows: [
      ...months(4, '2026-05', (m, i) => [
        row(`g${i}a`, 'cur', `${m}-01`, 'RENT HOLDINGS', -1200),
        row(`g${i}b`, 'cur', `${m}-09`, 'SAINSBURYS', -300),
        row(`g${i}c`, 'cur', `${m}-28`, 'SALARY', 3100),
      ]),
      row('g9a', 'cur', '2026-07-14', 'SMITH SOLICITORS LLP', -6000),
      row('g9b', 'cur', '2026-07-14', 'SMITH SOLICITORS LLP', -3500),
    ],
  },
  {
    name: 'a big payee seen every month is not a one-off',
    home: 'USD',
    accounts: { chk: { type: 'checking' } },
    rows: months(4, '2026-05', (m, i) => [
      row(`h${i}a`, 'chk', `${m}-01`, 'MORTGAGE LENDER', i === 3 ? -9000 : -1500),
      row(`h${i}b`, 'chk', `${m}-10`, 'GROCER', -100),
    ]),
  },
  {
    name: 'card bills to cards not imported: one line per card; an imported card pairs instead',
    home: 'USD',
    accounts: { chk: { label: 'Checking', type: 'checking' }, disc: { label: 'Discover', type: 'credit' } },
    rows: [
      row('i1', 'chk', '2026-09-03', 'AMERICAN EXPRESS ACH PMT', -800),
      row('i2', 'chk', '2026-09-17', 'Online Bill Payment, AMERICAN EXPRESS ACH PMT', -350),
      row('i3', 'chk', '2026-09-05', 'CAPITAL ONE MOBILE PMT', -220),
      row('i4', 'chk', '2026-09-10', 'DISCOVER E-PAYMENT', -400),
      row('i5', 'disc', '2026-09-11', 'INTERNET PAYMENT - THANK YOU', 400),
      row('i6', 'disc', '2026-09-02', 'CAFE LUNA', -18),
    ],
  },
  {
    name: 'money moved in from accounts not imported: net per account, asked until answered',
    home: 'EUR',
    accounts: { giro: { type: 'checking' } },
    external: { '4471-02': 'household', '9001': 'mine' },
    rows: [
      row('j1', 'giro', '2026-09-01', 'Online Transfer, TF 4471-02', 1500),
      row('j2', 'giro', '2026-09-15', 'TF 4471-02', 1500),
      row('j3', 'giro', '2026-09-03', 'TRANSFER FROM 9001', 700),
      row('j4', 'giro', '2026-09-20', 'TRANSFER TO 9001', -200),
      row('j5', 'giro', '2026-09-08', 'INTERNAL TRANSFER 55-12', 900),
      row('j6', 'giro', '2026-09-22', 'WIRE TRANSFER 77', -2500),
      row('j7', 'giro', '2026-09-10', 'REWE MARKT', -64.3),
    ],
  },
  {
    name: 'double charges: a repeat of last month or a refund within two weeks is not one',
    home: 'GBP',
    accounts: { cur: { type: 'checking' } },
    rows: [
      row('k1', 'cur', '2026-08-03', 'PUREGYM LTD', -30), row('k2', 'cur', '2026-08-03', 'PUREGYM LTD', -30),
      row('k3', 'cur', '2026-09-03', 'PUREGYM LTD', -30), row('k4', 'cur', '2026-09-03', 'PUREGYM LTD', -30),
      row('k5', 'cur', '2026-09-10', 'CITY PARKING CO', -45), row('k6', 'cur', '2026-09-11', 'CITY PARKING CO', -45),
      row('k7', 'cur', '2026-09-18', 'CITY PARKING CO', 45),
      row('k8', 'cur', '2026-09-20', 'CURRYS PC WORLD', -89), row('k9', 'cur', '2026-09-21', 'CURRYS PC WORLD', -89),
    ],
  },
  {
    name: 'posting dates in names: one merchant, and a rule written with the date still matches',
    home: 'CAD',
    overrides: { 'aug. 5 local bake house': 'treats' },
    accounts: { mc: { type: 'credit' } },
    rows: [
      row('l1', 'mc', '2026-08-04', 'Aug. 5 NEW ASIAN FOOD MARKET', -93.87),
      row('l2', 'mc', '2026-08-11', 'NEW ASIAN FOOD MARKET', -40),
      row('l3', 'mc', '2026-08-26', 'Aug. 27 095 HRM REC ONLINE XP', -117.1),
      row('l4', 'mc', '2026-08-26', 'Aug. 27 095 HRM REC ONLINE XP', -117.1),
      row('l5', 'mc', '2026-08-27', 'HRM REC ONLINE XP', 117.1),
      row('l6', 'mc', '2026-08-28', 'Sep 03 LOCAL BAKE HOUSE', -7.5),
    ],
  },
];

for (const c of reports) {
  const opts = { homeCurrency: c.home, categoryOverrides: c.overrides || null, externalAccounts: c.external || null };
  const rows = c.rows.map((r) => ({ ...r }));
  c.expect = project(viewFromLedger(rows, c.accounts, opts, null), rows);
}

const names = [
  'Aug. 5 NEW ASIAN FOOD MARKET', 'Aug. 14 095 HRM REC ONLINE XP', 'Sep 03 STARBUCKS', 'Sept. 30 SHELL', '5 Aug TESCO STORES',
  '05/08 PRET A MANGER', '2026-08-05 AMAZON', 'March 5, UBER EATS', '7-11 STORE', 'MAY 21', '3 MARKET ST', '12 DECATHLON',
  'Mar 12 3', 'SUBWAY 26321', '[CW]AMEX CARDS',
];
const clean = names.map((m) => ({ in: m, out: cleanMerchant(m), rule_key: ruleKey(m) }));
const words = [
  'BMO INV INC. INV/PLA', 'M-FUNDS/FONDS-M MSP/DIV', 'VANGUARD BUY INVESTMENT', 'Wealthsimple Invest', 'HL STOCKS AND SHARES ISA',
  'ISA CONTRIBUTION', "Isa's Bakery", 'Chase ROTH IRA', 'IRA KITCHEN', 'ISA DELI', 'Schwab IRA CONTRIB', 'INVOICE 1234', 'INV 20931 OFFICE DEPOT', 'Fidelity 401(k)',
  'TRADING 212', 'Trade Republic Sparplan', 'NETFLIX', 'RESP CONTRIBUTION',
].map((m) => ({ in: m, out: savingsWording(m) }));
const counterparty = [
  'Online Transfer, TF 0133-482', 'TF 0133-482', 'Online Bill Payment, ROGERS BK MC', 'AMEX CARDS', 'TRANSFER FROM 9001',
  'INTERNET PAYMENT - THANK YOU', 'AMERICAN EXPRESS ACH PMT', 'CAPITAL ONE MOBILE PMT', '[TF]2335128316 RTCT0000240670', 'WIRE TRANSFER 77',
].map((m) => ({ in: m, out: counterpartyLabel(m) }));
const categorized = [
  { merchant: 'LOCAL BAKE HOUSE', overrides: { 'aug. 5 local bake house': 'treats' } },
  { merchant: 'BMO INV INC. INV/PLA', overrides: { 'bmo inv inc. inv/pla': 'savings' } },
].map((c) => ({ ...c, out: categorize(c.merchant, c.overrides) }));

// A new person's home currency: their locale's region.
const locale = ['en-CA', 'en_CA.UTF-8', 'zh-Hans-CN', 'de-AT', 'en-GB', 'en', 'fr', 'en-US', 'pt-BR', 'ja_JP']
  .map((l) => ({ in: l, out: currencyForLocale(l) }));

writeFileSync(new URL('../fixtures/spend/cases.json', import.meta.url),
  `${JSON.stringify({ clean, savings_wording: words, counterparty, categorize: categorized, locale, reports }, null, 2)}\n`);
console.log('wrote fixtures/spend/cases.json — review the diff: every expect is the Mac engine answer');
