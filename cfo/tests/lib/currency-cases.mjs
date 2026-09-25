// Writes fixtures/currency/cases.json (shared with linggen-mobile): the inputs
// below plus the Mac engine's answers. Run `node cfo/tests/lib/currency-cases.mjs`
// after an intended change, review the diff, then `shared-fixtures.mjs --write`.
import { writeFileSync } from 'node:fs';
import { viewFromLedger } from '../../scripts/ledger.js';
import { project } from './currency-project.mjs';

const FX = { base: 'EUR', date: '2026-09-24', source: 'ECB', rates: { USD: 1.14, CAD: 1.61, JPY: 179.7, CNY: 7.66, GBP: 0.86 } };
const row = (id, account, date, merchant, amount, extra = {}) => ({ id, account, date, merchant, amount, category: null, transfer: false, transfer_pair: null, ...extra });

const reports = [
  {
    name: 'USD card + CAD chequing: grouped, one ≈ line in CAD, an FX card payment paired',
    home: 'CAD', fx: FX,
    accounts: { chq: { label: 'Chequing', type: 'checking', currency: 'CAD', currency_source: 'detected' }, visa: { label: 'US Visa', type: 'credit', currency: 'USD', currency_source: 'detected' } },
    budgets: { dining: 300 },
    rows: [
      row('c1', 'chq', '2026-09-01', 'PAYROLL ACME', 5000),
      row('c2', 'chq', '2026-09-03', 'RENT PROPERTY MGMT', -2000),
      row('c3', 'chq', '2026-09-10', 'SUSHI RESTAURANT', -120),
      row('c4', 'chq', '2026-09-15', 'ONLINE PAYMENT TO VISA', -700),
      row('v1', 'visa', '2026-09-05', 'AMAZON.COM', -150),
      row('v2', 'visa', '2026-09-12', 'CAFE LA', -80),
      row('v3', 'visa', '2026-09-16', 'PAYMENT THANK YOU', 495),
    ],
  },
  {
    name: 'EUR-only user: one currency, no conversion, report as before',
    home: 'CAD', fx: FX,
    accounts: { ing: { label: 'ING', type: 'checking', currency: 'EUR', currency_source: 'detected' } },
    rows: [
      row('e1', 'ing', '2026-09-01', 'SALARIS', 3200),
      row('e2', 'ing', '2026-09-04', 'ALBERT HEIJN', -84.2),
      row('e3', 'ing', '2026-09-09', 'NS REIZIGERS', -23.5),
    ],
  },
  {
    name: 'lead: 100 CAD + 99 USD → CAD (the raw number)',
    home: 'USD', fx: FX,
    accounts: { a: { currency: 'CAD', currency_source: 'detected', type: 'credit' }, b: { currency: 'USD', currency_source: 'detected', type: 'credit' } },
    rows: [row('l1', 'a', '2026-09-02', 'BOOKSHOP', -100), row('l2', 'b', '2026-09-02', 'RECORD STORE', -99)],
  },
  {
    name: 'lead: 100 CAD + 120 USD → USD',
    home: 'CAD', fx: FX,
    accounts: { a: { currency: 'CAD', currency_source: 'detected', type: 'credit' }, b: { currency: 'USD', currency_source: 'detected', type: 'credit' } },
    rows: [row('m1', 'a', '2026-09-02', 'BOOKSHOP', -100), row('m2', 'b', '2026-09-02', 'RECORD STORE', -120)],
  },
  {
    name: 'lead: a tie goes to the home currency',
    home: 'USD', fx: FX,
    accounts: { a: { currency: 'CAD', currency_source: 'detected', type: 'credit' }, b: { currency: 'USD', currency_source: 'detected', type: 'credit' } },
    rows: [row('t1', 'a', '2026-09-02', 'BOOKSHOP', -100), row('t2', 'b', '2026-09-02', 'RECORD STORE', -100)],
  },
  {
    name: 'JPY-heavy mix: the raw number leads, the ≈ line is in JPY',
    home: 'USD', fx: FX,
    accounts: { jp: { currency: 'JPY', currency_source: 'detected', type: 'credit' }, us: { currency: 'USD', currency_source: 'detected', type: 'checking' } },
    rows: [
      row('j1', 'jp', '2026-09-03', 'LAWSON', -10000),
      row('j2', 'jp', '2026-09-06', 'SUICA', -2500),
      row('u1', 'us', '2026-09-01', 'PAYROLL', 400),
      row('u2', 'us', '2026-09-05', 'TRADER JOE', -100),
    ],
  },
  {
    name: 'no rate for a currency: per-currency only, the gap named',
    home: 'CAD', fx: FX,
    accounts: { a: { currency: 'CAD', currency_source: 'detected', type: 'checking' }, k: { currency: 'KRW', currency_source: 'user', type: 'credit' } },
    budgets: { groceries: 500 },
    rows: [
      row('n1', 'a', '2026-09-01', 'NO FRILLS', -90),
      row('n2', 'k', '2026-09-02', 'EMART', -45000),
    ],
  },
  {
    name: 'same-currency pairing unchanged beside an FX pair',
    home: 'CAD', fx: FX,
    accounts: { chq: { label: 'Chequing', type: 'checking', currency: 'CAD', currency_source: 'detected' }, mc: { label: 'MC', type: 'credit', currency: 'CAD', currency_source: 'detected' }, us: { label: 'US card', type: 'credit', currency: 'USD', currency_source: 'detected' } },
    rows: [
      row('s1', 'chq', '2026-08-10', 'PAYMENT TO MASTERCARD', -300),
      row('s2', 'mc', '2026-08-11', 'PAYMENT RECEIVED THANK YOU', 300),
      row('s3', 'chq', '2026-08-12', 'TRANSFER TO US ACCOUNT', -1400),
      row('s4', 'us', '2026-08-13', 'PAYMENT THANK YOU', 1000),
      row('s5', 'us', '2026-08-14', 'HOTEL', -400),
      row('s6', 'chq', '2026-08-20', 'GROCER', -60),
    ],
  },
  {
    name: 'FX pair with no rate: date window and wording alone',
    home: 'CAD', fx: null,
    accounts: { chq: { type: 'checking', currency: 'CAD', currency_source: 'detected' }, us: { type: 'credit', currency: 'USD', currency_source: 'detected' } },
    rows: [
      row('w1', 'chq', '2026-08-12', 'ONLINE PAYMENT US CARD', -1400),
      row('w2', 'us', '2026-08-14', 'PAYMENT THANK YOU', 1000),
      row('w3', 'us', '2026-08-15', 'DINER', -40),
      row('w4', 'chq', '2026-08-15', 'GROCER', -70),
    ],
  },
];

for (const c of reports) {
  const opts = { homeCurrency: c.home, fx: c.fx, budgets: c.budgets || null };
  const rows = c.rows.map((r) => ({ ...r }));
  c.expect = project(viewFromLedger(rows, c.accounts, opts, null), rows);
}

const detect = [
  { name: 'ISO code', text: 'Account currency: USD\nDate Description Amount', expect: { currency: 'USD', ambiguous: [] } },
  { name: 'currency word', text: 'All amounts are in Canadian dollars', expect: { currency: 'CAD', ambiguous: [] } },
  { name: 'FX detail lines never count', text: 'AMAZON.COM\nUSD 12.00 @ 1.3612\nFOREIGN CURRENCY USD 30.00', expect: { currency: null, ambiguous: [] } },
  { name: 'country-prefixed symbols', text: 'Balance HK$1,200.00\nPayment HK$300.00', expect: { currency: 'HKD', ambiguous: [] } },
  { name: '€ and £', text: 'Saldo €1.234,56', expect: { currency: 'EUR', ambiguous: [] } },
  { name: '¥ alone is ambiguous', text: 'Total ¥12,000\nPaid ¥3,000', expect: { currency: null, ambiguous: ['CNY', 'JPY'] } },
  { name: '¥ with 人民币 is CNY', text: '币种: 人民币\n余额 ¥12,000', expect: { currency: 'CNY', ambiguous: [] } },
  { name: '¥ with 円 is JPY', text: 'ご利用額 ¥12,000 (円)', expect: { currency: 'JPY', ambiguous: [] } },
  { name: '¥ with RMB is CNY', text: 'RMB account ¥500', expect: { currency: 'CNY', ambiguous: [] } },
  { name: 'a tie between two codes stays open', text: 'C$ 45.00 and US$ 3.00', expect: { currency: null, ambiguous: ['CAD', 'USD'] } },
  { name: 'nothing decides', text: 'Payment $45.00', expect: { currency: null, ambiguous: [] } },
  { name: 'lowercase letters never read as a code', text: 'Decadent cadillac eurostar', expect: { currency: null, ambiguous: [] } },
];

const csv = [
  { name: 'currency column', csv: 'Date,Description,Amount,Currency\n2026-09-01,Cafe,-4.50,GBP\n2026-09-02,Train,-12.00,GBP\n', expect: { currency: 'GBP', ambiguous: [] } },
  { name: 'currency-named amount column', csv: 'Date,Description,USD$\n9/1/2026,Cafe,-4.50\n', expect: { currency: 'USD', ambiguous: [] } },
  { name: 'header says the code', csv: 'Date,Description,Amount (EUR)\n2026-09-01,Cafe,-4.50\n', expect: { currency: 'EUR', ambiguous: [] } },
  { name: 'nothing in the file', csv: 'Date,Description,Amount\n2026-09-01,Cafe,-4.50\n', expect: { currency: null, ambiguous: [] } },
  { name: '¥ amounts', csv: 'Date,Description,Amount\n2026-09-01,Cafe,¥450\n2026-09-02,Train,¥1200\n', expect: { currency: null, ambiguous: ['CNY', 'JPY'] } },
];

const importCells = [
  { name: 'new account, statement decides', acc: null, detected: { currency: 'USD', ambiguous: [] }, home: 'CAD', expect: { currency: 'USD', currency_source: 'detected' } },
  { name: 'new account, statement silent', acc: null, detected: { currency: null, ambiguous: [] }, home: 'CAD', expect: { currency: 'CAD', currency_source: 'assumed' } },
  { name: '¥ ambiguous, home not a candidate', acc: null, detected: { currency: null, ambiguous: ['CNY', 'JPY'] }, home: 'CAD', expect: { currency: 'CNY', currency_source: 'ambiguous' } },
  { name: '¥ ambiguous, home JPY', acc: null, detected: { currency: null, ambiguous: ['CNY', 'JPY'] }, home: 'JPY', expect: { currency: 'JPY', currency_source: 'ambiguous' } },
  { name: 'assumed upgraded by a statement that decides', acc: { currency: 'CAD', currency_source: 'assumed' }, detected: { currency: 'USD', ambiguous: [] }, home: 'CAD', expect: { currency: 'USD', currency_source: 'detected' } },
  { name: 'the user\'s choice sticks', acc: { currency: 'EUR', currency_source: 'user' }, detected: { currency: 'USD', ambiguous: [] }, home: 'CAD', expect: {} },
  { name: 'first detection sticks', acc: { currency: 'USD', currency_source: 'detected' }, detected: { currency: 'CAD', ambiguous: [] }, home: 'CAD', expect: {} },
];

const migrate = [
  {
    name: 'old ledger: accounts seeded, rows stamped, ids untouched, second run a no-op',
    home: 'CAD',
    accounts: { a1: { label: 'BMO USD Mastercard', type: 'credit' }, a2: { label: 'Chequing', type: 'checking' }, a3: { label: 'Card', type: 'credit', currency: 'EUR', currency_source: 'user' } },
    imports: [{ account: 'a2', file: 'statement.csv' }, { account: 'a4', file: 'HSBC HK$ savings.csv' }],
    ledger: [
      '{"id":"r1","account":"a1","date":"2026-07-01","merchant":"CAFE","amount":-5,"category":null,"transfer":false,"transfer_pair":null}',
      '{"id":"r2","account":"a2","date":"2026-07-02","merchant":"PAYROLL","amount":3000,"category":null,"transfer":false,"transfer_pair":null}',
      '{"id":"r3","account":"a3","date":"2026-07-03","merchant":"BISTRO","amount":-20,"category":null,"transfer":false,"transfer_pair":null}',
      '{"id":"r4","account":"a4","date":"2026-07-04","merchant":"TEA","amount":-30,"category":null,"transfer":false,"transfer_pair":null}',
      'not json — kept as it is',
      '',
    ].join('\n'),
    expect: {
      seeded: 3,
      accounts: {
        a1: { currency: 'USD', currency_source: 'detected' },
        a2: { currency: 'CAD', currency_source: 'assumed' },
        a3: { currency: 'EUR', currency_source: 'user' },
        a4: { currency: 'HKD', currency_source: 'detected' },
      },
      rows: { r1: 'USD', r2: 'CAD', r3: 'EUR', r4: 'HKD' },
    },
  },
];

writeFileSync(new URL('../fixtures/currency/cases.json', import.meta.url), `${JSON.stringify({ fx: FX, detect, csv, import_cells: importCells, migrate, reports }, null, 2)}\n`);
console.log('wrote fixtures/currency/cases.json — review the diff: every expect is the Mac engine answer');
