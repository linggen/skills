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

// ── Safe-to-spend forecast (anchored at as_of = last txn date, 2026-06-10) ──
console.log('— forecast —');
const ftx = [
  // biweekly payroll: May 5/19, Jun 2 → next Jun 16 + Jun 30 expected (2× $1,900)
  { date: '2026-05-05', merchant: 'ACME PAYROLL', amount: 1900 },
  { date: '2026-05-19', merchant: 'ACME PAYROLL', amount: 1900 },
  { date: '2026-06-02', merchant: 'ACME PAYROLL', amount: 1900 },
  // mortgage paid Jun 1 → next ~Jul, NOT in June
  ...['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'].map((date) => ({ date, merchant: 'BMO MORTGAGE PAYMENT', amount: -2150 })),
  // netflix bills ~12th, last May 12 → expected ~Jun 11, after as_of → upcoming
  ...['2026-03-12', '2026-04-12', '2026-05-12'].map((date) => ({ date, merchant: 'NETFLIX.COM', amount: -18.99 })),
  { date: '2026-06-10', merchant: 'AMAZON.CA', amount: -100 }, // variable; also sets as_of
];
const fr = analyzeTransactions(ftx, {}, {}).forecast;
t('F1 anchored at last txn date', fr.as_of === '2026-06-10' && fr.month === '2026-06');
t('F2 upcoming fixed = netflix only (mortgage already paid)',
  fr.upcoming_fixed.length === 1 && fr.upcoming_fixed[0].merchant === 'NETFLIX.COM'
  && fr.upcoming_fixed[0].expected > '2026-06-10' && fr.upcoming_fixed[0].expected <= '2026-06-30',
fr.upcoming_fixed.map((u) => `${u.merchant}@${u.expected}`).join(','));
t('F3 biweekly payroll projects twice (Jun 16 + Jun 30)',
  fr.expected_income.length === 2 && near(fr.expected_income_total, 3800), `${fr.expected_income_total}`);
// so far: in 1900, out 2150+100=2250 → safe = 1900+3800-2250-18.99
t('F4 safe_to_spend math', near(fr.safe_to_spend, 1900 + 3800 - 2250 - 18.99), `${fr.safe_to_spend}`);
t('F5 variable pace: $100 over 10 days, $10/day, $200 to month end',
  near(fr.variable.daily_avg, 10) && near(fr.variable.projected_remaining, 200)
  && near(fr.on_track_net, fr.safe_to_spend - 200));
t('F6 one-off income never projects', !fr.expected_income.some((i) => i.merchant.includes('AMAZON')));

// ── Anomaly watch ──
console.log('— anomalies —');
const atx = [
  // double charge: $89.99 twice, one day apart
  { date: '2026-06-01', merchant: 'GYM EQUIPMENT CO', amount: -89.99 },
  { date: '2026-06-02', merchant: 'GYM EQUIPMENT CO', amount: -89.99 },
  // NOT a double: two same-day coffees under the $20 floor
  { date: '2026-06-03', merchant: 'STARBUCKS', amount: -6.45 },
  { date: '2026-06-03', merchant: 'STARBUCKS', amount: -6.45 },
  // new recurring: first charge 35 days back, 2 identical at monthly cadence
  { date: '2026-05-06', merchant: 'DISNEY PLUS', amount: -11.99 },
  { date: '2026-06-05', merchant: 'DISNEY PLUS', amount: -11.99 },
  // trial convert: single-ever, recent, subscription-looking
  { date: '2026-06-04', merchant: 'OPENAI *CHATGPT SUBSCR', amount: -24.00 },
  // bill spike: usually $95, hits $310
  ...['2026-03-15', '2026-04-15', '2026-05-15'].map((date) => ({ date, merchant: 'BELL CANADA', amount: -95 })),
  { date: '2026-06-15', merchant: 'BELL CANADA', amount: -310 },
];
const an = analyzeTransactions(atx, {}, {}).anomalies;
const byType = (ty) => an.filter((a) => a.type === ty);
t('A1 double charge flagged once, coffees ignored',
  byType('double_charge').length === 1 && byType('double_charge')[0].merchant === 'GYM EQUIPMENT CO');
t('A2 new recurring flagged', byType('new_recurring').some((a) => a.merchant === 'DISNEY PLUS'));
t('A3 trial convert flagged', byType('trial_charge').some((a) => a.merchant.includes('OPENAI')));
t('A4 bill spike flagged with usual amount',
  byType('bill_spike').length === 1 && byType('bill_spike')[0].amount === 310 && byType('bill_spike')[0].usual === 95);
t('A5 ids are stable for dismissal', an.every((a) => typeof a.id === 'string' && a.id.includes('|')));
// steady bills never spike-flag
const calm = analyzeTransactions(
  ['2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'].map((date) => ({ date, merchant: 'BELL CANADA', amount: -95 })), {}, {});
t('A6 steady bill stays quiet', calm.anomalies.filter((a) => a.type === 'bill_spike').length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
