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
