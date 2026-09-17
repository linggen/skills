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
  markedHtml,
  latestBrief,
  weekItems,
  briefDayLabel,
  whoOf,
  stakeText,
  askText,
  rankMoves,
  missingNote,
  listingTag,
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

// ── Order ──────────────────────────────────────────────────────────────────
{
  const moved = positionsOf({ ...inv, VOO: { watch: true, rank: 1 }, AAPL: { ...inv.AAPL, rank: 0.5 } }, quotes);
  t('moved rows come first by rank, the rest after them in the usual order',
    eq(moved.map((r) => r.symbol), ['AAPL', 'VOO', 'RY.TO', 'MSFT']), moved.map((r) => r.symbol).join(','));
  const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
  const rows = (ranks) => Object.entries(ranks).map(([symbol, rank]) => ({ symbol, rank }));
  // The same six cases are in linggen-mobile's tests.
  t('a first move ranks every row, the moved one above the top',
    sorted(rankMoves(rows({ A: null, B: null, C: null }), 2, 0)) === sorted({ A: 1, B: 2, C: 0 }));
  t('moved to the bottom → one past the last', sorted(rankMoves(rows({ A: 1, B: 2, C: 3 }), 0, 2)) === sorted({ A: 4 }));
  t('moved between two rows → halfway, one cell', sorted(rankMoves(rows({ A: 1, B: 2, C: 3 }), 0, 1)) === sorted({ A: 2.5 }));
  t('a gap too narrow to halve renumbers the list',
    sorted(rankMoves(rows({ A: 1, B: 1.0000001, C: 3 }), 2, 1)) === sorted({ C: 2, B: 3 }));
  t('rows added after a move get ranks after the ranked ones',
    sorted(rankMoves(rows({ A: 5, B: null, C: null }), 2, 1)) === sorted({ B: 6, C: 5.5 }));
  t('dropped where it was → nothing to write', sorted(rankMoves(rows({ A: 1, B: 2 }), 1, 1)) === '{}');
}

// ── Add ────────────────────────────────────────────────────────────────────
t('a missing ticker points at the suggestions only when there are some',
  missingNote('XYZQ', [{ symbol: 'XYZ' }]) === 'No listing for XYZQ — pick one below.' && missingNote('XYZQ', []) === 'No listing for XYZQ.'
  && missingNote('XYZQ', null) === 'No listing for XYZQ.');
t('a suggestion names its exchange, and ETF when it is one',
  listingTag({ exchange: 'TSX', kind: 'etf' }) === 'TSX · ETF' && listingTag({ exchange: 'US', kind: 'stock' }) === 'US');

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
  phone.set('inv:AAPL|rank', 2); // a move on the phone that raced the removal
  mac.mergeState(phone.toState());
  t('a symbol left with only its rank is not listed', !('AAPL' in investmentsOf(mac)));
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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
t('a summary\'s headline, bullets and take render as lines',
  markedHtml('**Q2 FY27** · revenue $96.2B (+106%)\n- **Data Center** $89.0B\n- **Guidance** Q3 $108.0B\n**Take:** accelerating.', esc)
  === '<p><b>Q2 FY27</b> · revenue $96.2B (+106%)</p><ul><li><b>Data Center</b> $89.0B</li><li><b>Guidance</b> Q3 $108.0B</li></ul><p><b>Take:</b> accelerating.</p>');
t('an old plain summary is one paragraph', markedHtml('Revenue rose 5%. EPS fell.', esc) === '<p>Revenue rose 5%. EPS fell.</p>');
t('markup in a summary stays text',
  markedHtml('<img src=x onerror=alert(1)> **<b>x</b>**', esc) === '<p>&lt;img src=x onerror=alert(1)&gt; <b>&lt;b&gt;x&lt;/b&gt;</b></p>');
t('blank lines and bullet dots are tolerated', markedHtml('\nHead\n\n• one\n  - two\n', esc) === '<p>Head</p><ul><li>one</li><li>two</li></ul>');
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

// ── The Watch ──────────────────────────────────────────────────────────────
{
  const doc = {
    items: [
      { id: 'move:TSLA', symbol: 'TSLA', kind: 'move', at: '2026-09-16T20:00:00Z', held: true, stake: 2173, currency: 'USD', materiality: 'high', line: 'Tesla fell 14.5%.', url: 'https://x/1' },
      { id: 'policy:1', scope: 'economy', kind: 'policy', at: '2026-09-16T12:00:00Z', holdings: ['TSLA', 'NVDA'], held: true, stake: 555, currency: 'USD', materiality: 'medium', line: 'Tariffs.' },
      { id: 'news:ry', symbol: 'RY.TO', kind: 'news', at: '2026-09-15T12:00:00Z', held: false, stake: 0, materiality: 'low', line: 'Royal Bank news.' },
      { id: 'news:old', symbol: 'NVDA', also: ['TSLA', 'NVDA'], kind: 'news', at: '2026-09-14T12:00:00Z', held: true, stake: 42, currency: 'USD', materiality: 'low', line: 'Older.' },
    ],
    briefs: {
      '2026-09-15': { lines: ['news:ry'], quiet: false },
      '2026-09-17': { lines: ['move:TSLA', 'gone', 'policy:1'], quiet: false, level: 'quiet' },
    },
  };
  const brief = latestBrief(doc);
  t('the newest brief, its lines as items (ids no longer kept are skipped)',
    brief.day === '2026-09-17' && brief.level === 'quiet' && eq(brief.items.map((i) => i.id), ['move:TSLA', 'policy:1']));
  t('before the first night there is no brief', latestBrief({}) === null && latestBrief({ briefs: {} }) === null);
  t('the week is the rest, newest first', eq(weekItems(doc, brief).map((i) => i.id), ['news:ry', 'news:old']));
  t('a brief\'s day reads as this morning, yesterday, or its date',
    briefDayLabel('2026-09-17', '2026-09-17') === 'This morning' && briefDayLabel('2026-09-16', '2026-09-17') === 'Yesterday'
    && briefDayLabel('2026-09-01', '2026-09-17') === 'Sep 1, 2026');
  t('who: the ticker and the other holdings it names, an economy event\'s holdings, or the economy',
    whoOf(doc.items[3]) === 'NVDA, TSLA' && whoOf(doc.items[1]) === 'TSLA, NVDA' && whoOf({ scope: 'economy' }) === 'Economy');
  const usd0 = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  t('a holding shows its stake; a watched ticker says so',
    stakeText(doc.items[0]) === `${usd0(2173)} at stake` && stakeText(doc.items[2]) === 'Watching' && stakeText({ held: false, scope: 'economy' }) === '');
  t('Ask CFO quotes the line and its source', askText(doc.items[0]) === 'What does this mean for my holdings? "Tesla fell 14.5%." (https://x/1)'
    && askText(doc.items[1]) === 'What does this mean for my holdings? "Tariffs."');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
