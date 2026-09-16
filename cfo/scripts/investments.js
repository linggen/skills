// investments.js — the Investments tab: a watchlist and holdings (stocks and
// ETFs listed in the US or on the TSX) with live numbers from market.pl.
//
// Holdings are register cells (`inv:<symbol>|<field>`, lww.js), so a paired
// phone merges them per field. data/quotes.json holds the numbers;
// data/investments.json is the agent's copy of the list; data/reports.json
// holds report summaries, written only by the agent's SaveReport. The page
// finds reports itself (market.pl) and calls the model only to read one.
// Holdings the agent proposes in chat (PageUpdate body.holdings) wait on the
// tab until the user applies them — the agent never writes a cell.

import { investmentsOf } from './lww.js';

const MARKET = '"$HOME/.linggen/skills/cfo/scripts/market.pl"';
const REFRESH_MS = 5 * 60 * 1000;
const READ_WAIT_MS = 3 * 60 * 1000; // a read that saves nothing by then has stopped
const NOTE_MS = 15 * 1000;
const FIELDS = ['watch', 'shares', 'avg_cost', 'account'];

let deps = null;
let quotes = {};     // symbol -> data/quotes.json entry
let reports = {};    // symbol -> data/reports.json entry {since, reports[]}
let timer = null;
let editing = null;  // symbol whose holding form is open
let menuFor = null;  // symbol whose ⋯ menu is open
let open = null;     // symbol whose company card is open
let loading = false;
let again = false;   // a refresh was asked for while one ran
let failure = '';
let checking = false;
let checkNote = '';  // what the last Check reports found
const reading = new Map(); // symbol -> {note, at, busy} for its report line
let proposed = [];   // holdings proposed in chat, waiting for Apply
const unlisted = new Set(); // proposed symbols the lookup found no listing for

/**
 * Wire the tab once, at page load.
 * @param {object} d
 * @param {(cmd: string) => Promise<string>} d.runBash
 * @param {(path: string, fallback: any) => Promise<any>} d.readJson
 * @param {(path: string, text: string) => Promise<void>} d.writeB64
 * @param {() => import('./lww.js').Register} d.edits the live register
 * @param {() => Promise<void>} d.saveEdits
 * @param {(message: string) => Promise<boolean>} d.confirm
 * @param {(s: string) => string} d.esc
 * @param {(text: string) => boolean} d.ask a hidden message to the CFO agent;
 *   false when the chat isn't up
 * @param {string} d.data data dir, `$HOME` left literal for bash
 */
export function initInvestments(d) {
  deps = d;
  const root = document.getElementById('invest');
  root.addEventListener('click', onClick);
  root.addEventListener('contextmenu', onContextMenu);
  root.addEventListener('keydown', onKeydown);
  document.getElementById('inv-add').addEventListener('submit', onAdd);
}

/// Entering the tab: draw what's cached, then fetch fresh numbers, and keep
/// them fresh while the tab is open.
export async function renderInvestView() {
  quotes = (await deps.readJson(`${deps.data}/quotes.json`, {})).symbols || {};
  await loadReports();
  draw();
  refresh();
  if (!timer) timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
}

export function leaveInvestView() {
  clearInterval(timer);
  timer = null;
  editing = null;
  menuFor = null;
}

/// The agent's SaveReport ran (seen in the chat stream): show what it saved.
export async function reportSaved() {
  await loadReports();
  for (const [sym, r] of reading) {
    if (r.busy && latestSavedAt(sym) > r.at) reading.delete(sym);
  }
  if (!document.getElementById('invest').hidden) draw();
}

/// Holdings CFO proposed in chat (PageUpdate body.holdings). They wait on the
/// tab for Apply; a symbol proposed again replaces its row. Returns how many
/// arrived, so the page can bring the tab forward.
export function proposeHoldings(list) {
  const inv = investmentsOf(deps.edits());
  const plans = proposalPlans(list, inv);
  const fresh = new Set(plans.map((p) => p.symbol));
  proposed = [...proposed.filter((p) => !fresh.has(p.symbol)), ...plans];
  lookUp(plans.map((p) => p.symbol).filter((sym) => !inv[sym]));
  return plans.length;
}

async function loadReports() {
  reports = (await deps.readJson(`${deps.data}/reports.json`, {})).symbols || {};
}

const latestSavedAt = (sym) =>
  Math.max(0, ...(reports[sym]?.reports || []).map((r) => Date.parse(r.saved_at) || 0));

// ── Pure: symbols, positions, totals ───────────────────────────────────────

/// "aapl" → AAPL; "ry.to", "TSX:RY", "RY:TSX" → RY.TO; anything else → null.
/// Mirrors canonical() in market.pl. The result is also shell-safe.
export function canonicalSymbol(raw) {
  let s = String(raw || '').trim().toUpperCase();
  const tsx = s.match(/^TSX:([A-Z0-9.-]+)$/) || s.match(/^([A-Z0-9.-]+):TSX$/);
  if (tsx) s = `${tsx[1]}.TO`;
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(s) ? s : null;
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const currencyOf = (symbol, q = {}) => q.currency || (symbol.endsWith('.TO') ? 'CAD' : 'USD');

/// One row per listed symbol: the holding joined with the latest numbers.
/// Holdings first (largest value first), then the watchlist A→Z.
export function positionsOf(inv, quoteMap) {
  const rows = Object.entries(inv).map(([symbol, cell]) => positionOf(symbol, cell, quoteMap[symbol] || {}));
  const held = rows.filter((r) => r.shares > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const watched = rows.filter((r) => !(r.shares > 0)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return [...held, ...watched];
}

function positionOf(symbol, cell, q) {
  const shares = num(cell.shares) || 0;
  const avg = num(cell.avg_cost);
  const price = num(q.price);
  const change = num(q.change);
  const value = shares && price !== null ? shares * price : null;
  const cost = shares && avg !== null ? shares * avg : null;
  const gain = value !== null && cost !== null ? value - cost : null;
  return {
    symbol,
    shares,
    avg_cost: avg,
    account: cell.account || '',
    currency: currencyOf(symbol, q),
    name: q.name || '',
    kind: q.kind || '',
    price,
    change,
    change_pct: num(q.change_pct),
    value,
    cost,
    gain,
    gain_pct: gain !== null && cost ? (gain / cost) * 100 : null,
    day: shares && change !== null ? shares * change : null,
    pe: q.pe || null,
    forward_pe: q.forward_pe || null,
    earnings_date: q.earnings_date || null,
    expense_ratio: q.expense_ratio || null,
    price_time: q.price_time || '',
    error: q.error || '',
  };
}

/// Holdings summed per currency — US and Canadian dollars never add up.
export function totalsByCurrency(rows) {
  const out = {};
  for (const r of rows) {
    if (!(r.shares > 0) || r.value === null) continue;
    const t = (out[r.currency] ||= { value: 0, day: 0, cost: 0, gain: 0 });
    t.value += r.value;
    t.day += r.day || 0;
    if (r.cost !== null) { t.cost += r.cost; t.gain += r.gain; }
  }
  return out;
}

/// data/investments.json — what's held and watched, with the numbers as of the
/// last refresh.
export function snapshotOf(rows, now = new Date()) {
  const held = rows.filter((r) => r.shares > 0).map((r) => ({
    symbol: r.symbol, name: r.name, shares: r.shares, avg_cost: r.avg_cost, account: r.account || null,
    currency: r.currency, price: r.price, value: r.value, gain: r.gain, gain_pct: r.gain_pct,
  }));
  return {
    updated_at: now.toISOString(),
    holdings: held,
    watchlist: rows.filter((r) => !(r.shares > 0)).map((r) => r.symbol),
  };
}

/// "$1,234.50" / "1 234,5" → 1234.5; blank or not a positive number → null.
export function parseAmount(raw) {
  const n = num(String(raw ?? '').replace(/[^0-9.]/g, ''));
  return n !== null && n > 0 ? n : null;
}

// ── Pure: holdings proposed in chat ────────────────────────────────────────

const PROPOSAL_KINDS = ['shares', 'bought', 'sold'];
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const positive = (v) => { const n = num(v); return n !== null && n > 0 ? n : null; };

/// The `holdings` array of a PageUpdate, wherever the model nested it; null
/// when there is none.
export function holdingsIn(node, depth = 0) {
  if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 5) return null;
  if (Array.isArray(node.holdings)) return node.holdings;
  for (const k of ['body', 'body_patch', 'content', 'data']) {
    const found = holdingsIn(node[k], depth + 1);
    if (found) return found;
  }
  return null;
}

/// One proposed item, or null when it can't be read. At most one of `shares`
/// (the position as it stands; 0 = sold it all), `bought` (with `price`) or
/// `sold`; none of them = just watch it.
export function proposalOf(item) {
  const symbol = canonicalSymbol(item?.symbol);
  if (!symbol) return null;
  const kinds = PROPOSAL_KINDS.filter((k) => item[k] !== undefined && item[k] !== null);
  if (kinds.length > 1) return null;
  const kind = kinds[0] || 'watch';
  const amount = kind === 'shares' ? num(item.shares) : kind === 'watch' ? null : positive(item[kind]);
  if (kind !== 'watch' && (amount === null || amount < 0)) return null;
  const account = typeof item.account === 'string' && item.account.trim() ? item.account.trim().slice(0, 40) : null;
  const cost = kind === 'bought' ? positive(item.price) : kind === 'shares' ? positive(item.avg_cost) : null;
  return { symbol, kind, amount, cost, account };
}

const holdingOf = (cell = {}) => ({
  shares: num(cell.shares) || null,
  avg_cost: num(cell.avg_cost),
  account: cell.account || null,
});

const NO_HOLDING = { shares: null, avg_cost: null, account: null };

/// The holding `{shares, avg_cost, account}` (null = none) after one
/// proposal. The page does the trade math, never the model.
export function holdingAfter(now, p) {
  const shares = now.shares || 0;
  const account = p.account ?? now.account;
  const steps = {
    watch: () => now,
    shares: () => (p.amount === 0 ? NO_HOLDING
      : { shares: p.amount, avg_cost: p.cost ?? now.avg_cost, account }),
    bought: () => {
      const total = shares + p.amount;
      const known = p.cost !== null && (shares === 0 || now.avg_cost !== null);
      const avg = known ? (shares * (now.avg_cost || 0) + p.amount * p.cost) / total : null;
      return { shares: round(total, 6), avg_cost: avg === null ? null : round(avg, 4), account };
    },
    sold: () => {
      const left = round(shares - p.amount, 6);
      return left > 0 ? { shares: left, avg_cost: now.avg_cost, account } : NO_HOLDING;
    },
  };
  return steps[p.kind]();
}

const sameHolding = (a, b) => a.shares === b.shares && a.avg_cost === b.avg_cost && a.account === b.account;

/// What a PageUpdate proposed, against the holdings as they stand (`inv`, from
/// investmentsOf): [{symbol, before, after, watched}], one per symbol, items
/// for the same symbol applied in order, no-ops dropped. `after` is worked out
/// once, here, so applying a plan twice changes nothing.
export function proposalPlans(list, inv) {
  const plans = new Map();
  for (const p of (Array.isArray(list) ? list : []).map(proposalOf).filter(Boolean)) {
    const cell = inv[p.symbol];
    const plan = plans.get(p.symbol) || { symbol: p.symbol, before: holdingOf(cell), watched: !!cell?.watch };
    plan.after = holdingAfter(plan.after || plan.before, p);
    plans.set(p.symbol, plan);
  }
  return [...plans.values()].filter((p) => !p.watched || !sameHolding(p.before, p.after));
}

/// A plan in a few words: "New · 50 sh at $410.25 · TFSA", "10 → 15 sh · avg
/// $150.00 → $160.00", "Sold all 10 sh".
export function changeOf(plan, currency) {
  const { before: b, after: a } = plan;
  const cost = (n) => (n === null ? 'unknown' : money(n, currency));
  if (!a.shares) {
    if (b.shares) return `Sold all ${b.shares} sh`;
    return plan.watched ? '' : 'Watch';
  }
  const parts = [];
  if (!b.shares) parts.push(`${plan.watched ? '' : 'New · '}${a.shares} sh${a.avg_cost !== null ? ` at ${cost(a.avg_cost)}` : ''}`);
  else {
    parts.push(b.shares === a.shares ? `${a.shares} sh` : `${b.shares} → ${a.shares} sh`);
    if (b.avg_cost !== a.avg_cost) parts.push(b.avg_cost === null ? `at ${cost(a.avg_cost)}` : `avg ${cost(b.avg_cost)} → ${cost(a.avg_cost)}`);
  }
  if (a.account !== b.account) parts.push(b.account && b.shares ? `${b.account} → ${a.account || 'no account'}` : a.account);
  else if (a.account && !b.shares) parts.push(a.account);
  return parts.filter(Boolean).join(' · ');
}

// ── Pure: reports ──────────────────────────────────────────────────────────

/// "2026-06-27" → "Jun 27, 2026"; a timestamp keeps its time of day.
export function dayOf(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d\d-\d\d$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return withTime ? d.toLocaleString(undefined, { ...opts, hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, opts);
}

const ANNUAL = new Set(['10-K', '20-F', '40-F']);

/// A saved report's heading: "Quarter ended Jun 27, 2026 · Earnings release".
export function reportHeading(r) {
  if (r.form === 'earnings') return `Results out ${dayOf(r.period)}`;
  const span = `${ANNUAL.has(r.form) ? 'Year' : 'Quarter'} ended ${dayOf(r.period)}`;
  const form = r.form === '8-K' ? 'Earnings release' : r.form;
  return [span, form].filter(Boolean).join(' · ');
}

/// The line under Check reports. `result` is market.pl reports-check's output.
export function checkNoteOf(result) {
  const n = result.new.length;
  const failed = result.failed.map((f) => f.symbol);
  const parts = [];
  if (n) parts.push(`${n} new report${n === 1 ? '' : 's'} — reading now`);
  if (failed.length) parts.push(`couldn't check ${failed.join(', ')}`);
  if (parts.length) return parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
  return result.last_checked ? `Nothing new since ${dayOf(result.last_checked, true)}` : 'Nothing new yet — reports from today on will show here';
}

/// The hidden message that hands reports to the agent. Its runbook lives in
/// SKILL.md ("Company reports"); this carries only the items.
export function readPrompt(items, why) {
  const lead = why === 'latest'
    ? `The user pressed Latest report for ${items[0].symbol} on the Investments tab (this message is hidden from them).`
    : 'Check reports on the Investments tab found new company reports (this message is hidden from the user).';
  return `${lead} Read and save each one as "Company reports" in your instructions says, then tell the user what matters in a few sentences.\n\n${JSON.stringify(items)}`;
}

// ── Drawing ────────────────────────────────────────────────────────────────

const rowsNow = () => positionsOf(investmentsOf(deps.edits()), quotes);

function draw() {
  const rows = rowsNow();
  document.getElementById('inv-proposals').innerHTML = proposalsHtml();
  document.getElementById('inv-summary').innerHTML = summaryHtml(rows);
  if (editing) return; // never wipe a form mid-typing
  document.getElementById('inv-list').innerHTML = rows.length
    ? rows.map(rowHtml).join('')
    : '<p class="hint">Add a ticker to watch it. Add shares and your average cost to track value and gain.</p>';
}

function money(n, currency, digits = 2) {
  if (n === null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n);
}

/// "+$12.30 (+1.20%)" in green, "−…" in red. `digits` matches the figure
/// it sits beside: cents next to a price, whole dollars next to a value.
function moveHtml(n, currency, pct, digits = 2) {
  if (n === null) return '';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  const p = pct === null || pct === undefined ? '' : ` (${sign}${Math.abs(pct).toFixed(2)}%)`;
  return `<span class="inv-move ${cls}">${sign}${money(Math.abs(n), currency, digits)}${p}</span>`;
}

function summaryHtml(rows) {
  const totals = Object.entries(totalsByCurrency(rows)).map(([cur, t]) => `
    <span class="inv-total"><b>${money(t.value, cur, 0)}</b>
      ${moveHtml(t.day, cur, null, 0)} today${t.cost ? ` · ${moveHtml(t.gain, cur, (t.gain / t.cost) * 100, 0)} overall` : ''}</span>`);
  const stamp = rows.map((r) => r.price_time).find(Boolean);
  const state = checking ? 'Checking reports…' : checkNote || (loading ? 'Updating…' : failure || (stamp ? `Prices ${stamp}` : ''));
  return `<div class="inv-summary">${totals.join('')}<span class="spacer"></span>
    <span class="hint inline">${deps.esc(state)}</span>
    ${rows.length ? `<button class="chip" data-act="refresh" ${loading ? 'disabled' : ''}>Refresh</button>
      <button class="chip" data-act="check" ${checking ? 'disabled' : ''}>Check reports</button>` : ''}</div>`;
}

function subline(r) {
  const parts = r.kind === 'etf'
    ? ['ETF', r.pe && `P/E ${r.pe}`, r.expense_ratio && `Expense ${r.expense_ratio}`]
    : [r.pe && `P/E ${r.pe}`, r.forward_pe && `Fwd P/E ${r.forward_pe}`, r.earnings_date && `Earnings ${r.earnings_date}`];
  return parts.filter(Boolean).join(' · ');
}

function rowHtml(r) {
  const { esc } = deps;
  const sym = esc(r.symbol);
  const price = r.price === null
    ? `<span class="hint inline">${esc(r.error || '…')}</span>`
    : `${money(r.price, r.currency)} ${moveHtml(r.change, r.currency, r.change_pct)}`;
  const hold = r.shares > 0
    ? `<div>${r.shares} sh${r.account ? ` · ${esc(r.account)}` : ''}</div>
       <div>${money(r.value, r.currency, 0)} ${moveHtml(r.gain, r.currency, r.gain_pct, 0)}</div>`
    : `<button class="chip" data-act="edit" data-sym="${sym}">Add shares</button>`;
  return `<div class="inv-row${open === r.symbol ? ' open' : ''}" data-sym="${sym}">
    <div class="inv-main" tabindex="0" aria-expanded="${open === r.symbol}">
      <div class="inv-id"><b>${sym}</b> <span class="inv-name">${esc(r.name)}</span>
        <div class="inv-sub">${esc(subline(r))}</div></div>
      <div class="inv-price">${price}</div>
      <div class="inv-hold">${hold}</div>
      <button class="chip inv-more" data-act="menu" data-sym="${sym}" aria-label="More for ${sym}">⋯</button>
    </div>
    ${menuFor === r.symbol ? menuHtml(r) : ''}
    ${editing === r.symbol ? formHtml(r) : ''}
    ${open === r.symbol ? cardHtml(r) : ''}
  </div>`;
}

/// The company card: the numbers, the earnings date, and report summaries
/// newest first.
function cardHtml(r) {
  const { esc } = deps;
  const q = quotes[r.symbol] || {};
  const etf = q.kind === 'etf';
  const range = q.low_52w != null && q.high_52w != null ? `${money(num(q.low_52w), r.currency)} – ${money(num(q.high_52w), r.currency)}` : null;
  const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  const earnings = q.earnings_on
    ? [q.earnings_on >= today ? 'Next earnings' : 'Last earnings', dayOf(q.earnings_on)]
    : null;
  const stats = (etf
    ? [['Assets', q.aum], ['Expense ratio', q.expense_ratio], ['P/E', q.pe], ['Yield', q.dividend_yield], ['Beta', q.beta], ['52-week', range]]
    : [['Market cap', q.market_cap], ['P/E', q.pe], ['Fwd P/E', q.forward_pe], ['EPS', q.eps], ['Dividend', q.dividend],
      ['Beta', q.beta], ['52-week', range], ['Analysts', q.analysts], ['Target', q.target], earnings])
    .filter((s) => s && s[1] != null && s[1] !== '');
  const held = r.shares > 0 && r.avg_cost !== null
    ? `<p class="hint">${r.shares} sh at ${money(r.avg_cost, r.currency)} · cost ${money(r.cost, r.currency, 0)}</p>` : '';
  const statsHtml = stats.length
    ? `<div class="inv-stats">${stats.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div>`
    : '<p class="hint">Numbers load with the next refresh.</p>';
  return `<div class="inv-card">${statsHtml}${held}${etf ? '' : reportsHtml(r.symbol)}</div>`;
}

function reportsHtml(symbol) {
  const { esc } = deps;
  const sym = esc(symbol);
  const line = reading.get(symbol);
  const list = reports[symbol]?.reports || [];
  const items = list.map((rep) => `<div class="inv-report">
      <div class="inv-report-h">${esc(reportHeading(rep))}
        ${/^https:\/\//.test(rep.url || '') ? `<button class="link" data-act="link" data-url="${esc(rep.url)}">Source ↗</button>` : ''}</div>
      <p>${esc(rep.summary || '')}</p>
    </div>`).join('');
  return `<div class="inv-reports">
    <div class="inv-reports-h"><span>Reports</span>
      <span class="hint inline">${esc(line?.note || '')}</span><span class="spacer"></span>
      <button class="chip" data-act="latest" data-sym="${sym}" ${line?.busy ? 'disabled' : ''}>Latest report</button></div>
    ${items || '<p class="hint">No summaries yet. Latest report has CFO read the newest one.</p>'}
  </div>`;
}

/// Still waiting: a plan the holdings already match (applied, or edited to
/// the same by hand or on the phone) is gone.
const waiting = () => {
  const inv = investmentsOf(deps.edits());
  return proposed.filter((p) => !(inv[p.symbol]?.watch && sameHolding(holdingOf(inv[p.symbol]), p.after)));
};

const notFound = (sym) => unlisted.has(sym);

/// The card for holdings proposed in chat — nothing is saved until Apply.
function proposalsHtml() {
  const { esc } = deps;
  const plans = waiting();
  if (!plans.length) return '';
  const rows = plans.map((p) => {
    const sym = esc(p.symbol);
    const missing = notFound(p.symbol);
    const what = missing ? 'Not found — check the ticker' : changeOf(p, currencyOf(p.symbol, quotes[p.symbol]));
    return `<div class="inv-prop">
      <b>${sym}</b> <span class="inv-name">${esc(quotes[p.symbol]?.name || '')}</span>
      <span class="inv-prop-what">${esc(what)}</span><span class="spacer"></span>
      <button class="chip" data-act="prop-apply" data-sym="${sym}" ${missing ? 'disabled' : ''}>Apply</button>
      <button class="chip ghost" data-act="prop-drop" data-sym="${sym}" aria-label="Dismiss ${sym}">✕</button>
    </div>`;
  }).join('');
  const all = plans.length > 1 ? '<button class="chip" data-act="prop-apply-all">Apply all</button>' : '';
  return `<div class="inv-props">
    <div class="inv-props-h"><b>✦ From chat</b><span class="hint inline">Saved only when you apply</span><span class="spacer"></span>
      ${all}<button class="chip ghost" data-act="prop-drop-all">Dismiss${plans.length > 1 ? ' all' : ''}</button></div>
    ${rows}
  </div>`;
}

function menuHtml(r) {
  const sym = deps.esc(r.symbol);
  return `<div class="inv-menu">
    <button class="chip" data-act="edit" data-sym="${sym}">${r.shares > 0 ? 'Edit holding' : 'Add shares'}</button>
    <button class="chip" data-act="remove" data-sym="${sym}">Remove</button>
  </div>`;
}

function formHtml(r) {
  const { esc } = deps;
  const sym = esc(r.symbol);
  const val = (v) => (v === null || v === 0 ? '' : esc(String(v)));
  return `<div class="inv-form" data-sym="${sym}">
    <label>Shares <input data-f="shares" inputmode="decimal" value="${val(r.shares)}"></label>
    <label>Avg cost <input data-f="avg_cost" inputmode="decimal" value="${val(r.avg_cost)}"></label>
    <label>Account <input data-f="account" placeholder="TFSA, RRSP…" value="${esc(r.account)}"></label>
    <button class="btn" data-act="save" data-sym="${sym}">Save</button>
    <button class="chip" data-act="cancel">Cancel</button>
  </div>`;
}

// ── Actions ────────────────────────────────────────────────────────────────

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) {
    if (menuFor && !e.target.closest('.inv-menu')) { menuFor = null; draw(); return; }
    const main = e.target.closest('.inv-main');
    if (main && !editing) toggleCard(main.closest('.inv-row').dataset.sym);
    return;
  }
  const sym = btn.dataset.sym;
  const acts = {
    refresh: () => refresh(),
    check: () => checkReports(),
    latest: () => latestReport(sym),
    link: () => openLink(btn.dataset.url),
    menu: () => { menuFor = menuFor === sym ? null : sym; draw(); },
    edit: () => { menuFor = null; editing = sym; drawList(); focusForm(sym); },
    remove: () => removeSymbol(sym),
    save: () => saveHolding(sym, btn.closest('.inv-form')),
    cancel: () => { editing = null; draw(); },
    'prop-apply': () => applyProposals([sym]),
    'prop-apply-all': () => applyProposals(waiting().map((p) => p.symbol)),
    'prop-drop': () => { proposed = proposed.filter((p) => p.symbol !== sym); draw(); },
    'prop-drop-all': () => { proposed = []; draw(); },
  };
  acts[btn.dataset.act]?.();
}

function toggleCard(sym) {
  open = open === sym ? null : sym;
  draw();
}

/// Long-press / right-click opens the same ⋯ menu.
function onContextMenu(e) {
  const row = e.target.closest('.inv-row');
  if (!row || e.target.closest('input')) return;
  e.preventDefault();
  menuFor = row.dataset.sym;
  draw();
}

function onKeydown(e) {
  if (e.target.classList.contains('inv-main') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleCard(e.target.closest('.inv-row').dataset.sym);
    return;
  }
  const form = e.target.closest('.inv-form');
  if (!form) return;
  if (e.key === 'Enter') saveHolding(form.dataset.sym, form);
  if (e.key === 'Escape') { editing = null; draw(); }
}

function drawList() {
  document.getElementById('inv-list').innerHTML = rowsNow().map(rowHtml).join('');
}

function focusForm(sym) {
  document.querySelector(`.inv-form[data-sym="${sym}"] input`)?.focus();
}

async function onAdd(e) {
  e.preventDefault();
  const input = document.getElementById('inv-symbol');
  const msg = document.getElementById('inv-add-msg');
  const sym = canonicalSymbol(input.value);
  if (!sym) { msg.textContent = 'Use a ticker like AAPL, or RY.TO for the TSX.'; return; }
  msg.textContent = '';
  input.value = '';
  if (!investmentsOf(deps.edits())[sym]) {
    deps.edits().set(`inv:${sym}|watch`, true);
    await persist();
  }
  draw();
  refresh([sym]);
}

async function saveHolding(sym, form) {
  const read = (f) => form.querySelector(`[data-f=${f}]`).value;
  writeHolding(sym, { shares: parseAmount(read('shares')), avg_cost: parseAmount(read('avg_cost')), account: read('account').trim() || null });
  editing = null;
  await persist();
  draw();
}

/// Holdings proposed in chat, applied. Symbols the lookup couldn't find stay
/// on the card.
async function applyProposals(symbols) {
  const plans = waiting().filter((p) => symbols.includes(p.symbol) && !notFound(p.symbol));
  if (!plans.length) return;
  for (const p of plans) writeHolding(p.symbol, p.after);
  proposed = proposed.filter((p) => !plans.includes(p));
  await persist();
  draw();
  refresh(plans.map((p) => p.symbol));
}

/// One holding `{shares, avg_cost, account}` (null = clear) into the register.
/// One cell per field, written only when it changed: shares edited here and
/// the account on the phone must not clobber each other on merge.
function writeHolding(sym, next) {
  const reg = deps.edits();
  const current = investmentsOf(reg)[sym] || {};
  for (const [field, value] of Object.entries(next)) {
    if (value === null) { if (current[field] !== undefined) reg.remove(`inv:${sym}|${field}`); }
    else if (value !== current[field]) reg.set(`inv:${sym}|${field}`, value);
  }
  if (!current.watch) reg.set(`inv:${sym}|watch`, true); // cleared shares keep it watched
}

async function removeSymbol(sym) {
  menuFor = null;
  if (!(await deps.confirm(`Remove ${sym} from Investments?`))) { draw(); return; }
  const reg = deps.edits();
  for (const field of FIELDS) if (reg.get(`inv:${sym}|${field}`) != null) reg.remove(`inv:${sym}|${field}`);
  await persist();
  draw();
}

async function persist() {
  await deps.saveEdits();
  await writeSnapshot();
}

const writeSnapshot = () =>
  deps.writeB64(`${deps.data}/investments.json`, `${JSON.stringify(snapshotOf(rowsNow()), null, 2)}\n`);

/// Fetch prices, then the valuation numbers (market.pl caches those a day).
async function refresh(only) {
  const symbols = only || Object.keys(investmentsOf(deps.edits()));
  if (!symbols.length) return;
  if (loading) { again = true; return; }
  loading = true;
  failure = '';
  draw();
  try {
    await fetchInto('quotes', symbols);
    draw();
    await fetchInto('stats', symbols);
    await writeSnapshot();
  } catch (err) {
    console.warn('[cfo] market refresh failed', err);
    failure = 'Prices unavailable — check the connection';
  } finally {
    loading = false;
    draw();
    if (again) { again = false; refresh(); }
  }
}

/// Name and listing for symbols not on the tab yet, so a proposal shows the
/// company, or that the ticker doesn't exist.
async function lookUp(symbols) {
  if (!symbols.length) return;
  try {
    const found = await fetchInto('quotes', symbols);
    for (const sym of symbols) {
      if (found[sym]?.error === 'not found') unlisted.add(sym); else unlisted.delete(sym);
    }
    draw();
    const listed = symbols.filter((sym) => !unlisted.has(sym));
    if (listed.length) await fetchInto('stats', listed);
  } catch (err) {
    console.warn('[cfo] look up failed', err);
  }
  draw();
}

async function fetchInto(verb, symbols) {
  const out = JSON.parse(await deps.runBash(`perl ${MARKET} ${verb} ${symbols.join(' ')}`));
  Object.assign(quotes, out);
  return out;
}

// ── Reports ────────────────────────────────────────────────────────────────

/// Look for reports out since each symbol was first checked. Nothing new
/// costs no model call; anything new goes to the agent to read and save.
async function checkReports() {
  const symbols = Object.keys(investmentsOf(deps.edits()));
  if (!symbols.length || checking) return;
  checking = true;
  checkNote = '';
  draw();
  try {
    const result = JSON.parse(await deps.runBash(`perl ${MARKET} reports-check ${symbols.join(' ')}`));
    if (result.new.length && !deps.ask(readPrompt(result.new, 'check'))) {
      checkNote = 'Chat is still starting — try again in a moment';
    } else {
      checkNote = checkNoteOf(result);
      for (const item of result.new) startReading(item.symbol);
    }
    await loadReports();
  } catch (err) {
    console.warn('[cfo] reports check failed', err);
    checkNote = "Couldn't check reports — check the connection";
  } finally {
    checking = false;
    draw();
    const note = checkNote;
    clearLater(() => { if (checkNote === note) checkNote = ''; });
  }
}

/// The newest report for one company. Already summarized → nothing to do;
/// otherwise the agent reads it.
async function latestReport(sym) {
  setLine(sym, { note: 'Looking…', busy: true });
  try {
    const item = JSON.parse(await deps.runBash(`perl ${MARKET} reports-latest ${sym}`));
    if (item.saved) {
      setLine(sym, { note: 'Already read — it’s the top one' });
    } else if (!deps.ask(readPrompt([item], 'latest'))) {
      setLine(sym, { note: 'Chat is still starting — try again in a moment' });
    } else {
      startReading(sym);
      return;
    }
  } catch (err) {
    setLine(sym, { note: String(err.message || err).trim().split('\n')[0] || "Couldn't reach the report source" });
  }
  forgetLater(sym);
}

function startReading(sym) {
  const at = Date.now();
  setLine(sym, { note: 'Reading…', busy: true, at });
  setTimeout(() => {
    if (reading.get(sym)?.at !== at) return;
    setLine(sym, { note: 'Nothing saved — ask CFO about it in chat' });
    forgetLater(sym);
  }, READ_WAIT_MS);
}

function setLine(sym, line) {
  reading.set(sym, { at: 0, busy: false, ...line });
  draw();
}

/// Drop a symbol's note after a while, unless a newer one replaced it.
function forgetLater(sym) {
  const line = reading.get(sym);
  clearLater(() => { if (reading.get(sym) === line) reading.delete(sym); });
}

function clearLater(clear) {
  setTimeout(() => { clear(); if (!document.getElementById('invest').hidden) draw(); }, NOTE_MS);
}

/// Sources open in the default browser — links inside the app window go nowhere.
function openLink(url) {
  if (!/^https:\/\/[^\s'"\\]+$/.test(url || '')) return;
  deps.runBash(`open '${url}'`).catch((err) => console.warn('[cfo] open link', err));
}
