// investments.js — the Investments tab: a watchlist and holdings (stocks and
// ETFs listed in the US or on the TSX) with live numbers from market.pl.
//
// Holdings are register cells (`inv:<symbol>|<field>`, lww.js), so a paired
// phone merges them per field. data/quotes.json holds the numbers;
// data/investments.json is the agent's copy of the list. No model call here.

import { investmentsOf } from './lww.js';

const MARKET = '"$HOME/.linggen/skills/cfo/scripts/market.pl"';
const REFRESH_MS = 5 * 60 * 1000;
const FIELDS = ['watch', 'shares', 'avg_cost', 'account'];

let deps = null;
let quotes = {};     // symbol -> data/quotes.json entry
let timer = null;
let editing = null;  // symbol whose holding form is open
let menuFor = null;  // symbol whose ⋯ menu is open
let loading = false;
let again = false;   // a refresh was asked for while one ran
let failure = '';

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
    currency: q.currency || (symbol.endsWith('.TO') ? 'CAD' : 'USD'),
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

// ── Drawing ────────────────────────────────────────────────────────────────

const rowsNow = () => positionsOf(investmentsOf(deps.edits()), quotes);

function draw() {
  const rows = rowsNow();
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
  const state = loading ? 'Updating…' : failure || (stamp ? `Prices ${stamp}` : '');
  return `<div class="inv-summary">${totals.join('')}<span class="spacer"></span>
    <span class="hint inline">${deps.esc(state)}</span>
    ${rows.length ? `<button class="chip" data-act="refresh" ${loading ? 'disabled' : ''}>Refresh</button>` : ''}</div>`;
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
  return `<div class="inv-row" data-sym="${sym}">
    <div class="inv-main">
      <div class="inv-id"><b>${sym}</b> <span class="inv-name">${esc(r.name)}</span>
        <div class="inv-sub">${esc(subline(r))}</div></div>
      <div class="inv-price">${price}</div>
      <div class="inv-hold">${hold}</div>
      <button class="chip inv-more" data-act="menu" data-sym="${sym}" aria-label="More for ${sym}">⋯</button>
    </div>
    ${menuFor === r.symbol ? menuHtml(r) : ''}
    ${editing === r.symbol ? formHtml(r) : ''}
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
    if (menuFor && !e.target.closest('.inv-menu')) { menuFor = null; draw(); }
    return;
  }
  const sym = btn.dataset.sym;
  const acts = {
    refresh: () => refresh(),
    menu: () => { menuFor = menuFor === sym ? null : sym; draw(); },
    edit: () => { menuFor = null; editing = sym; drawList(); focusForm(sym); },
    remove: () => removeSymbol(sym),
    save: () => saveHolding(sym, btn.closest('.inv-form')),
    cancel: () => { editing = null; draw(); },
  };
  acts[btn.dataset.act]?.();
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
  const next = { shares: parseAmount(read('shares')), avg_cost: parseAmount(read('avg_cost')), account: read('account').trim() || null };
  const reg = deps.edits();
  const current = investmentsOf(reg)[sym] || {};
  // One cell per field: shares edited here and the account on the phone must
  // not clobber each other on merge.
  for (const [field, value] of Object.entries(next)) {
    if (value === null) { if (current[field] !== undefined) reg.remove(`inv:${sym}|${field}`); }
    else if (value !== current[field]) reg.set(`inv:${sym}|${field}`, value);
  }
  if (!current.watch) reg.set(`inv:${sym}|watch`, true); // cleared shares keep it watched
  editing = null;
  await persist();
  draw();
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

async function fetchInto(verb, symbols) {
  const out = await deps.runBash(`perl ${MARKET} ${verb} ${symbols.join(' ')}`);
  Object.assign(quotes, JSON.parse(out));
}
