#!/usr/bin/env node
// run-investments.mjs — the Investments tab's pure half: symbols, positions,
// per-currency totals, the agent's snapshot, and holdings as register cells.
//
//   node tests/run-investments.mjs
//
// No daemon, no network: market.pl's numbers are stubbed as quotes.json entries.

import { Register, investmentsOf } from '../scripts/lww.js';
import {
  canonicalSymbol,
  positionsOf,
  totalsByCurrency,
  snapshotOf,
  parseAmount,
  reportHeading,
  checkNoteOf,
  readPrompt,
  holdingsIn,
  proposalOf,
  holdingAfter,
  proposalPlans,
  changeOf,
} from '../scripts/investments.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ── Symbols ────────────────────────────────────────────────────────────────
t('US ticker is upper-cased', canonicalSymbol(' aapl ') === 'AAPL');
t('TSX forms all become .TO', ['ry.to', 'TSX:RY', 'ry:tsx'].every((s) => canonicalSymbol(s) === 'RY.TO'));
t('class shares keep their dot', canonicalSymbol('brk.b') === 'BRK.B');
t('junk and shell metacharacters are refused', ['', '$(rm)', 'A B', '1ABC', '{{symbols}}'].every((s) => canonicalSymbol(s) === null));

// ── Amounts ────────────────────────────────────────────────────────────────
t('money-formatted input parses', parseAmount('$1,234.50') === 1234.5);
t('blank and zero clear the field', parseAmount('') === null && parseAmount('0') === null);

// ── Positions ──────────────────────────────────────────────────────────────
const quotes = {
  AAPL: { price: 330, change: -3, change_pct: -0.9, currency: 'USD', name: 'Apple Inc.', kind: 'stock', pe: '38.21' },
  'RY.TO': { price: 284, change: 1, change_pct: 0.35, currency: 'CAD', name: 'Royal Bank of Canada' },
  VOO: { price: 695, change: 2, currency: 'USD', kind: 'etf' },
};
const inv = {
  AAPL: { watch: true, shares: 10, avg_cost: 150, account: 'TFSA' },
  'RY.TO': { watch: true, shares: 20 },
  VOO: { watch: true },
  MSFT: { watch: true },
};
const rows = positionsOf(inv, quotes);
t('holdings first, largest value first, then the watchlist A→Z',
  eq(rows.map((r) => r.symbol), ['RY.TO', 'AAPL', 'MSFT', 'VOO']), rows.map((r) => r.symbol).join(','));
const aapl = rows.find((r) => r.symbol === 'AAPL');
t('value, cost and gain from shares × price', aapl.value === 3300 && aapl.cost === 1500 && aapl.gain === 1800);
t('gain percent is over cost', near(aapl.gain_pct, 120));
t("today's move is shares × change", aapl.day === -30);
const ry = rows.find((r) => r.symbol === 'RY.TO');
t('a holding without a cost has no gain', ry.value === 5680 && ry.gain === null);
const msft = rows.find((r) => r.symbol === 'MSFT');
t('a symbol not fetched yet still lists, currency from its exchange', msft.price === null && msft.currency === 'USD');

// ── Totals ─────────────────────────────────────────────────────────────────
const totals = totalsByCurrency(rows);
t('US and Canadian dollars never add', eq(Object.keys(totals).sort(), ['CAD', 'USD']));
t('USD total counts only holdings', totals.USD.value === 3300 && totals.USD.day === -30);
t('gain totals only what has a cost', totals.USD.gain === 1800 && totals.CAD.cost === 0);

// ── Snapshot ───────────────────────────────────────────────────────────────
const snap = snapshotOf(rows, new Date('2026-09-15T12:00:00Z'));
t('snapshot splits holdings and watchlist',
  eq(snap.holdings.map((h) => h.symbol), ['RY.TO', 'AAPL']) && eq(snap.watchlist, ['MSFT', 'VOO']));
t('snapshot keeps the account label', snap.holdings[1].account === 'TFSA' && snap.holdings[0].account === null);

// ── Register cells ─────────────────────────────────────────────────────────
{
  const mac = new Register('mac');
  mac.set('inv:AAPL|watch', true);
  mac.set('inv:AAPL|shares', 10);
  const phone = new Register('phone', mac.toState());
  phone.set('inv:AAPL|account', 'TFSA'); // edited on the phone
  mac.set('inv:AAPL|shares', 12);        // edited on the Mac
  mac.mergeState(phone.toState());
  phone.mergeState(mac.toState());
  t('two devices editing different fields both keep their edit',
    eq(investmentsOf(mac).AAPL, { watch: true, shares: 12, account: 'TFSA' })
    && eq(investmentsOf(phone), investmentsOf(mac)));
  for (const f of ['watch', 'shares', 'account']) mac.remove(`inv:AAPL|${f}`);
  phone.mergeState(mac.toState());
  t('a removal sticks across the merge', !('AAPL' in investmentsOf(phone)));
}

// ── Holdings proposed in chat ──────────────────────────────────────────────
{
  const list = [{ symbol: 'VOO', shares: 50 }];
  t('the holdings list is found however the model wrapped it',
    [{ holdings: list }, { body: { holdings: list } }, { body_patch: { content: { holdings: list } } }].every((a) => holdingsIn(a) === list)
    && holdingsIn({ body: { insights: [] } }) === null && holdingsIn({ body: { suggestions: [] } }) === null);
  t('a proposal reads each kind',
    eq(proposalOf({ symbol: 'voo', shares: '50', avg_cost: 410.25, account: ' TFSA ' }), { symbol: 'VOO', kind: 'shares', amount: 50, cost: 410.25, account: 'TFSA' })
    && proposalOf({ symbol: 'AAPL', bought: 10, price: 182.5 }).kind === 'bought'
    && proposalOf({ symbol: 'TSX:RY', sold: 20 }).symbol === 'RY.TO'
    && proposalOf({ symbol: 'MSFT' }).kind === 'watch');
  t('an unreadable proposal is dropped',
    [{ symbol: '$(rm)', shares: 5 }, { symbol: 'AAPL', shares: -1 }, { symbol: 'AAPL', bought: 0, price: 5 },
      { symbol: 'AAPL', sold: 'lots' }, { symbol: 'AAPL', shares: 5, bought: 5 }, null].every((p) => proposalOf(p) === null));
  t('a watch-only proposal carries no cost', proposalOf({ symbol: 'MSFT', avg_cost: 300 }).cost === null);

  const now = { shares: 10, avg_cost: 150, account: 'TFSA' };
  const step = (item, from = now) => holdingAfter(from, proposalOf(item));
  t('a position as it stands replaces the count and keeps what it omits',
    eq(step({ symbol: 'AAPL', shares: 12 }), { shares: 12, avg_cost: 150, account: 'TFSA' }));
  t('a buy averages the cost', eq(step({ symbol: 'AAPL', bought: 10, price: 170 }), { shares: 20, avg_cost: 160, account: 'TFSA' }));
  t('a buy without a price leaves the cost unknown', step({ symbol: 'AAPL', bought: 5 }).avg_cost === null);
  t('a first buy costs its price',
    eq(step({ symbol: 'AAPL', bought: 4, price: 99.99, account: 'RRSP' }, { shares: null, avg_cost: null, account: null }), { shares: 4, avg_cost: 99.99, account: 'RRSP' }));
  t('a sale keeps the average cost', eq(step({ symbol: 'AAPL', sold: 4 }), { shares: 6, avg_cost: 150, account: 'TFSA' }));
  t('selling it all, or shares 0, clears the holding',
    [{ symbol: 'AAPL', sold: 10 }, { symbol: 'AAPL', sold: 25 }, { symbol: 'AAPL', shares: 0 }]
      .every((i) => eq(step(i), { shares: null, avg_cost: null, account: null })));
  t('fractional shares do not drift', step({ symbol: 'AAPL', sold: 0.3 }, { shares: 10.5, avg_cost: 1, account: null }).shares === 10.2);

  const held = { AAPL: { watch: true, shares: 10, avg_cost: 150, account: 'TFSA' }, MSFT: { watch: true } };
  const plans = proposalPlans([
    { symbol: 'AAPL', bought: 10, price: 170 },
    { symbol: 'VOO', shares: 30, avg_cost: 400, account: 'TFSA' },
    { symbol: 'VOO', bought: 20, price: 425, account: 'TFSA + RRSP' },
    { symbol: 'MSFT' },
    { symbol: 'AAPL', sold: 5 },
    { symbol: 'nope nope', shares: 1 },
  ], held);
  t('plans fold a symbol\'s items in order and drop no-ops',
    eq(plans.map((p) => p.symbol), ['AAPL', 'VOO'])
    && eq(plans[0].after, { shares: 15, avg_cost: 160, account: 'TFSA' })
    && eq(plans[1].after, { shares: 50, avg_cost: 410, account: 'TFSA + RRSP' })
    && plans[1].watched === false);
  t('a plan is worked out once, against the holdings as they stand',
    eq(proposalPlans([{ symbol: 'AAPL', bought: 10, price: 170 }], { AAPL: { watch: true, ...plans[0].after } })[0].after.shares, 25));
  t('watching a new symbol is a plan; re-proposing a held position is not',
    proposalPlans([{ symbol: 'NVDA' }], held).length === 1
    && proposalPlans([{ symbol: 'AAPL', shares: 10, avg_cost: 150, account: 'TFSA' }], held).length === 0);

  const usd = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
  t('a change reads as a few words',
    changeOf(plans[0], 'USD') === `10 → 15 sh · avg ${usd(150)} → ${usd(160)}`
    && changeOf(plans[1], 'USD') === `New · 50 sh at ${usd(410)} · TFSA + RRSP`
    && changeOf(proposalPlans([{ symbol: 'AAPL', sold: 10 }], held)[0], 'USD') === 'Sold all 10 sh'
    && changeOf(proposalPlans([{ symbol: 'NVDA' }], held)[0], 'USD') === 'Watch'
    && changeOf(proposalPlans([{ symbol: 'MSFT', shares: 3, account: 'RRSP' }], held)[0], 'USD') === '3 sh · RRSP'
    && changeOf(proposalPlans([{ symbol: 'AAPL', shares: 10, account: 'RRSP' }], held)[0], 'USD') === '10 sh · TFSA → RRSP');
}

// ── Reports ────────────────────────────────────────────────────────────────
t('a release reads as its quarter', reportHeading({ form: '8-K', period: '2026-06-27' }) === 'Quarter ended Jun 27, 2026 · Earnings release');
t('an annual report reads as its year', reportHeading({ form: '10-K', period: '2025-09-27' }).startsWith('Year ended Sep 27, 2025'));
t('a TSX report reads as its results date', reportHeading({ form: 'earnings', period: '2026-08-27' }) === 'Results out Aug 27, 2026');
const none = { new: [], failed: [], last_checked: null };
t('the first check says what happens from here', checkNoteOf(none).startsWith('Nothing new yet'));
t('a later check says since when', checkNoteOf({ ...none, last_checked: '2026-09-16T12:02:06Z' }).startsWith('Nothing new since Sep 16, 2026'));
t('new reports and failures share the line',
  checkNoteOf({ new: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }], failed: [{ symbol: 'RY.TO' }], last_checked: null })
  === "2 new reports — reading now · couldn't check RY.TO");
const item = { symbol: 'AAPL', name: 'Apple Inc.', form: '8-K', period: '2026-06-27', filed: '2026-07-30', url: 'https://www.sec.gov/x' };
const prompt = readPrompt([item], 'latest');
t('the read prompt names the button and carries the item whole',
  prompt.includes('Latest report for AAPL') && prompt.includes('"Company reports"') && prompt.endsWith(JSON.stringify([item])));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
