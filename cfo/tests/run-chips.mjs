#!/usr/bin/env node
// run-chips.mjs — the questions above the chat, written from what each tab
// shows (scripts/chips.js).
//
//   node tests/run-chips.mjs

import {
  MAX_CHIPS, shortName, briefAsk, moverAsk, resultsAsk, weightAsk, watchedAsk, profitAsk, investChips,
  fullMonths, riseAsk, netAsk, budgetAsk, spendChips, reportChips, anomalyAsks, bigChargeAsk, txnChips,
  hikeAsks, priciestAsk, commitChips,
} from '../scripts/chips.js';

let pass = 0, fail = 0;
function t(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const money = (n) => `$${Math.round(n)}`;
const short = (list) => list.every((s) => s.length <= 60);

const row = (symbol, o = {}) => ({
  symbol, shares: 10, value: 1000, currency: 'USD', change_pct: 0, gain_pct: 0, stale: '', earnings_on: null, ...o,
});

console.log('names');
t('a .com is cut', shortName('NETFLIX.COM') === 'Netflix', shortName('NETFLIX.COM'));
t('a * tail is cut', shortName('ADOBE *CREATIVECLOUD') === 'Adobe');
t('a code word is dropped', shortName('SPOTIFY P2E4F8') === 'Spotify');
t('mixed case is kept', shortName('Premium Plan Fee') === 'Premium Plan Fee');

console.log('investments');
const today = '2026-09-23';
const brief = { day: '2026-09-23', items: [{ kind: 'insider', symbol: 'NVDA', side: 'sold' }] };
t('a fresh brief asks about its top line', briefAsk(brief, today) === 'Should NVDA insider selling worry me?');
t('an old brief says nothing', briefAsk({ ...brief, day: '2026-09-20' }, today) === null);
t('an economy line needs no ticker', briefAsk({ day: today, items: [{ kind: 'rate', bank: 'Fed' }] }, today) === 'What does the Fed rate move mean for me?');
t('the biggest mover over 2%', moverAsk([row('A', { change_pct: 1.5 }), row('B', { change_pct: -3.14 }), row('C', { change_pct: 2.5 })]) === 'Why is B down 3.1% today?');
t('no mover under 2%', moverAsk([row('A', { change_pct: 1.9 })]) === null);
t('a watched row is not a mover', moverAsk([row('W', { shares: 0, value: null, change_pct: 9 })]) === null);
t('results within a week', resultsAsk([row('T', { earnings_on: '2026-09-28' })], today) === "What should I watch in T's Sep 28 results?");
t('results a month out say nothing', resultsAsk([row('T', { earnings_on: '2026-10-21' })], today) === null);
t('results already past say nothing', resultsAsk([row('T', { earnings_on: '2026-09-20' })], today) === null);
t('a heavy holding', weightAsk([row('BIG', { value: 9000 }), row('SMALL', { value: 1000 })]) === 'Is BIG too big a share of my money?');
t('a lone holding is not heavy', weightAsk([row('ONLY', { value: 9000 }), row('CAD', { currency: 'CAD' })]) === null);
t('a watched big day', watchedAsk([row('W', { shares: 0, value: null, change_pct: 6 })]) === 'W is up 6% — worth buying?');
t('a big gain', profitAsk([row('G', { gain_pct: 26.3 })]) === 'Should I take some profit on G?');
const rows = [
  row('TSLA', { value: 15156, gain_pct: 26.3, change_pct: 0.96 }),
  row('NVDA', { value: 4577, gain_pct: 27.1, change_pct: 0.66 }),
  row('ZNQ.TO', { currency: 'CAD', value: 2795 }),
  row('SPCX', { shares: 0, value: null, change_pct: 1.9 }),
];
const inv = investChips({ rows, brief, today });
t('his list: brief, weight, profit', eq(inv, ['Should NVDA insider selling worry me?', 'Is TSLA too big a share of my money?', 'Should I take some profit on NVDA?']), JSON.stringify(inv));
t('at most four', investChips({ rows: [...rows, row('X', { change_pct: 5, earnings_on: '2026-09-24' })], brief, today }).length <= MAX_CHIPS);
t('nothing held or watched', eq(investChips({ rows: [], today }), ['Which stocks should I start watching?']));
t('no facts falls back', eq(investChips({ rows: [row('Q')], today }), ['What would you change in my portfolio?']));
t('investment chips stay short', short(inv));

console.log('spending');
const view = {
  by_month: { '2026-04': { net: 100 }, '2026-05': { net: -40 }, '2026-06': { net: 12 }, '2026-07': { net: 5 } },
  forecast: { month: '2026-07' },
  by_category_monthly: {
    housing: { '2026-05': 2100, '2026-06': 2600 },
    groceries: { '2026-05': 200, '2026-06': 330 },
    dining: { '2026-05': 100, '2026-06': 110 },
  },
  by_category: [{ category: 'housing', spend: 6300 }, { category: 'groceries', spend: 1189 }],
  budgets: { categories: [{ category: 'dining', budget: 400, state: 'pacing' }] },
};
t('the open month is left out', eq(fullMonths(view), ['2026-04', '2026-05', '2026-06']));
t('the biggest rise, not rent', riseAsk(view, money) === 'Why did groceries go up $130 in Jun?');
t('a small rise says nothing', riseAsk({ ...view, by_category_monthly: { dining: { '2026-05': 100, '2026-06': 140 } } }, money) === null);
t('a month in the red', netAsk({ ...view, by_month: { ...view.by_month, '2026-06': { net: -40 } } }) === 'Why did I spend more than I earned in Jun?');
t('a month in the black says nothing', netAsk(view) === null);
t('a budget on pace to go over', budgetAsk(view, money) === 'How do I keep dining under $400?');
const sp = spendChips({ view, money });
t('trends: budget, rise, cut', eq(sp, ['How do I keep dining under $400?', 'Why did groceries go up $130 in Jun?', 'How could I spend less on groceries?']), JSON.stringify(sp));
t('no data asks for an import', eq(spendChips({ view: null, money }), ['What should I import first?']));
const anomalies = [
  { type: 'double_charge', merchant: 'AIR CANADA', amount: 389 },
  { type: 'double_charge', merchant: 'AIR CANADA', amount: 389 },
  { type: 'new_recurring', merchant: 'Premium Plan Fee', amount: 30.95 },
];
t('report leads with a flagged charge', reportChips({ view, anomalies, money })[0] === 'Did Air Canada charge me twice?');

console.log('transactions');
t('one question per merchant', eq(anomalyAsks(anomalies, money), ['Did Air Canada charge me twice?', 'What is the new Premium Plan Fee charge?']));
const ledger = [
  ...Array.from({ length: 8 }, (_, i) => ({ date: `2026-06-${10 + i}`, amount: -20, merchant: 'CAFE' })),
  { date: '2026-06-20', amount: -778, merchant: 'AIR CANADA' },
  { date: '2026-06-03', amount: -2100, merchant: 'RENT PROPERTY MGMT' },
  { date: '2026-06-21', amount: -5000, merchant: 'CARD PAYMENT', transfer: true },
];
t('the big one-off charge', bigChargeAsk(ledger, [{ merchant: 'RENT PROPERTY MGMT' }], money) === 'What was the $778 at Air Canada?');
t('a flagged merchant is not asked twice', eq(txnChips({ anomalies: [{ type: 'double_charge', merchant: 'AIR CANADA', amount: 389 }], rows: ledger, recurring: [{ merchant: 'RENT PROPERTY MGMT' }], money }), ['Did Air Canada charge me twice?']));
t('txn with no flags or big charges falls back', eq(txnChips({ anomalies: [], rows: ledger.slice(0, 8), recurring: [], money }), ['Find anything unusual']));

console.log('commitments');
const subs = [
  { merchant: 'RENT PROPERTY MGMT', essential: true, monthly: 2100, active: true },
  { merchant: 'NETFLIX.COM', increased: true, increase_amount: 2, monthly: 18.99, active: true },
  { merchant: 'Premium Plan Fee', monthly: 30.95, active: true },
  { merchant: 'DISNEY PLUS', monthly: 99, active: false },
];
t('a price hike', eq(hikeAsks(subs, money), ['Netflix went up $2 — worth keeping?']));
t('the priciest live subscription', priciestAsk(subs, money) === 'Do I still need Premium Plan Fee at $31/mo?');
const cm = commitChips({ subs, commitments: { pct_of_income: 45, split: { debt: 300 } }, money });
t('hike, priciest, load, debt', cm.length === 4 && cm[2].startsWith('Are my fixed costs too high') && cm[3].includes('debt'), JSON.stringify(cm));
t('commitment chips stay short', short(cm));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
