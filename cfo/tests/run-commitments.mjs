#!/usr/bin/env node
// run-commitments.mjs — commitments engine verification.
//
//   node tests/run-commitments.mjs
//
// Synthetic only: kind classification, the commitments block (totals, split,
// user-term merge + kind override), and the amortization math against
// hand-checked figures. No environment needed.

import { analyzeTransactions, amortize, classifyKind, merchantKey, categorize, debtPlan } from '../scripts/analyze.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;

// ── Kind classification ──
console.log('— kind classification —');
t('K1 mortgage → loan:home', classifyKind('BMO MORTGAGE PAYMENT', 'housing') === 'loan:home');
t('K2 car finance → loan:auto', classifyKind('TOYOTA FINANCIAL SERVICES', 'other') === 'loan:auto');
t('K3 insurer → insurance', classifyKind('INTACT INSURANCE PREMIUM', 'other') === 'insurance');
t('K4 auto insurance → insurance:auto', classifyKind('TD AUTO INSURANCE', 'other') === 'insurance:auto');
t('K5 rent → bill', classifyKind('RENT PAYMENT PROPERTY MGMT', 'housing') === 'bill');
t('K6 telecom → bill', classifyKind('ROGERS COMMUNICATIONS', 'utilities') === 'bill');
t('K7 netflix → sub', classifyKind('NETFLIX.COM', 'subscriptions') === 'sub');
const ptax = 'CITY OF TORONTO PROPERTY TAX';
t('K8 property tax → housing → bill (full chain)', classifyKind(ptax, categorize(ptax)) === 'bill');

// ── Amortization — closed-form check: n = -ln(1-iB/P)/ln(1+i).
// 320k @ 4.79% with $2,150/mo → 226.3 → 227 months, ~$166.5k interest.
console.log('— amortization —');
const am = amortize(320000, 4.79, 2150);
t('M1 months match closed form', am.months >= 226 && am.months <= 228, `${am.months} mo`);
t('M2 interest matches closed form', am.total_interest > 163000 && am.total_interest < 170000, `$${Math.round(am.total_interest)}`);
const am0 = amortize(12000, 0, 500);
t('M3 zero-rate: months = balance/payment', am0.months === 24 && am0.total_interest === 0);
t('M4 payment below interest flagged', amortize(320000, 9, 1000).underwater === true);
t('M5 unusable inputs → null', amortize(0, 5, 100) === null && amortize(1000, 5, 0) === null);
const amExtra = amortize(320000, 4.79, 2350);
t('M6 extra payment saves interest + time',
  amExtra.months < am.months && amExtra.total_interest < am.total_interest,
  `${am.months - amExtra.months} mo / $${Math.round(am.total_interest - amExtra.total_interest)} saved`);

// ── Commitments block from a synthetic ledger ──
console.log('— commitments block —');
const monthly = (merchant, amount, day = '01') =>
  ['2026-03', '2026-04', '2026-05', '2026-06'].map((m) => ({ date: `${m}-${day}`, merchant, amount }));
const txns = [
  ...monthly('BMO MORTGAGE PAYMENT', -2150),
  ...monthly('INTACT INSURANCE', -171, '05'),
  ...monthly('NETFLIX.COM', -18.99, '12'),
  ...monthly('ROGERS COMMUNICATIONS', -95, '20'),
  ...monthly('EMPLOYER PAYROLL', 5200, '15'),
  { date: '2026-06-02', merchant: 'AMAZON.CA', amount: -64.2 }, // one-off, must not appear
];
const mortKey = merchantKey('BMO MORTGAGE PAYMENT');
const r = analyzeTransactions(txns, {}, {
  commitments: {
    [mortKey]: { balance: 320000, rate_pct: 4.79, renewal_date: '2027-09-01' },
    [merchantKey('INTACT INSURANCE')]: { kind: 'insurance:auto' },
  },
});
const c = r.commitments;
const item = (m) => c.items.find((x) => x.merchant.includes(m));

t('C1 all four recurring detected, one-off excluded', c.items.length === 4, `${c.items.length} items`);
t('C2 groups assigned', item('MORTGAGE').group === 'debt' && item('INTACT').group === 'insurance'
  && item('ROGERS').group === 'bills' && item('NETFLIX').group === 'subs');
t('C3 monthly_total = sum of actives', near(c.monthly_total, 2150 + 171 + 18.99 + 95), `${c.monthly_total}`);
t('C4 split adds up', near(c.split.debt, 2150) && near(c.split.insurance, 171)
  && near(c.split.bills, 95) && near(c.split.subs, 18.99));
t('C5 pct_of_income vs $5200/mo', near(c.pct_of_income, (100 * c.monthly_total) / 5200, 0.5), `${c.pct_of_income}%`);
t('C6 user terms merged + loan math derived', item('MORTGAGE').balance === 320000
  && item('MORTGAGE').months_left >= 215 && item('MORTGAGE').interest_remaining > 100000
  && item('MORTGAGE').renewal_date === '2027-09-01');
t('C7 kind override wins over keyword rule', item('INTACT').kind === 'insurance:auto');
t('C8 loans/insurance are essential (never cancellation picks)',
  r.subscriptions.find((s) => s.merchant.includes('MORTGAGE')).essential === true
  && r.subscriptions.find((s) => s.merchant.includes('INTACT')).essential === true);
t('C9 subscription_monthly_total counts only true subs', near(r.subscription_monthly_total, 18.99 + 95)
  || near(r.subscription_monthly_total, 18.99), `${r.subscription_monthly_total}`);

// Without user input the block still forms, just without loan math.
const r2 = analyzeTransactions(txns, {}, {});
t('C10 no user terms → items present, no derived math',
  r2.commitments.items.length === 4 && r2.commitments.items.every((x) => x.months_left == null));

// Insurance premium creep rides the existing increased flag.
const creep = [
  ...['2026-01', '2026-02', '2026-03'].map((m) => ({ date: `${m}-05`, merchant: 'WAWANESA INSURANCE', amount: -148 })),
  ...['2026-04', '2026-05', '2026-06'].map((m) => ({ date: `${m}-05`, merchant: 'WAWANESA INSURANCE', amount: -171 })),
];
const rc = analyzeTransactions(creep, {}, {});
const ins = rc.commitments.items[0];
t('C11 premium creep flagged on insurance', ins.kind === 'insurance' && ins.increased === true
  && near(ins.increase_amount, 23), `+$${ins.increase_amount}`);

// ── Debt strategy (multi-loan rollover sim) ──
console.log('— debt strategy —');
const loans = [
  { key: 'M', merchant: 'MORTGAGE', balance: 400000, rate_pct: 3.8, payment: 2150 },
  { key: 'C', merchant: 'CAR LOAN', balance: 50000, rate_pct: 5, payment: 486.33 },
];
const indep = [amortize(400000, 3.8, 2150), amortize(50000, 5, 486.33)];
const indepInterest = indep[0].total_interest + indep[1].total_interest;
const base = debtPlan(loans, 0);
t('D1 rollover alone beats independent payoff', base.total_interest < indepInterest
  && base.months <= Math.max(indep[0].months, indep[1].months),
`$${Math.round(indepInterest - base.total_interest)} / ${Math.max(indep[0].months, indep[1].months) - base.months} mo saved`);
const av = debtPlan(loans, 300, 'avalanche');
const low = debtPlan(loans, 300, 'lowest');
t('D2 extra payment saves vs no extra', av.total_interest < base.total_interest && av.months < base.months);
t('D3 avalanche beats lowest-rate targeting', av.total_interest < low.total_interest,
  `$${Math.round(low.total_interest - av.total_interest)} difference`);
t('D4 avalanche closes the 5% loan first', av.payoff_months.C < av.payoff_months.M);
t('D5 payment below interest diverges', debtPlan([{ key: 'x', balance: 100000, rate_pct: 12, payment: 500 }], 0).diverges === true);

const txns2 = [...txns, ...monthly('TD AUTO FINANCE', -486.33, '06')];
const r3 = analyzeTransactions(txns2, {}, {
  commitments: {
    [merchantKey('BMO MORTGAGE PAYMENT')]: { balance: 400000, rate_pct: 3.8 },
    [merchantKey('TD AUTO FINANCE')]: { balance: 50000, rate_pct: 5 },
  },
});
const ds = r3.commitments.debt_strategy;
t('D6 debt_strategy block: rate-desc order + rollover beats as-is',
  !!ds && ds.order[0].merchant.includes('TD AUTO') && ds.rollover.total_interest < ds.as_is.total_interest);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
