// CFO orchestrator. The page is split in two:
//   FIXED   — everything numeric (cards, charts, lists), rendered HERE from the
//             ledger. Deterministic, free, private; the agent cannot touch it.
//   DYNAMIC — the #insights region, updated ONLY by the agent via PageUpdate
//             (month narratives, goal cards, drafts). See SKILL.md schema.
// Statements are parsed + redacted in-browser; raw files never reach the model.
import './chat-bridge.js'; // sets window.LinggenUI
import { listSkillSessions } from './api.js';
import { analyzeCsv, orientTransactions, categorize, amortize, debtPlan } from './analyze.js';
import { toLedgerRows, mergeLedger, reportFromLedger, viewFromLedger, detectTransfers } from './ledger.js';
import { hashId } from './hash.js';

const SKILL = 'cfo';
const DATA = `$HOME/.linggen/skills/${SKILL}/data`; // $HOME stays literal for bash
let chat = null;
// Branded CFO.app launches the page with ?app_mode=1 → it gets the built-in
// Linggen Cloud model (deepseek-v4-flash). The SAME skill opened in the core
// Linggen app has no app_mode → empty pin → the engine uses the user's own
// global default model (their configured/BYOK model), not the metered cloud.
const APP_MODE = new URLSearchParams(location.search).get('app_mode') === '1';
let MODEL_ID = APP_MODE ? 'deepseek-v4-flash' : '';

// Page state: full ledger + accounts in memory; RANGE drives the fixed view.
let LEDGER = [];
let ACCOUNTS = {};
let RANGE = { preset: '12M', from: null, to: null };
let INSIGHTS = [];
let SUGGESTIONS = []; // agent-teacher proposals awaiting a tap (transfers/income — they move totals)
let LAST_AUTO_APPLIED = 0; // category proposals auto-applied in the last batch (don't move totals)
let LAST_VIEW = null; // most recent computed view — read by announceImport
let FULL_VIEW = null; // full-history view — commitments ignore the range slicer
let COMMITMENTS = {}; // user-entered terms per merchant key (data/commitments.json)
let ANOM_DISMISSED = new Set(); // dismissed anomaly ids (data/anomalies-dismissed.json)

// The page sends this after an import that left uncategorized rows. The agent
// reads the redacted work list (LatestAnalysis.unclassified) + the user's vocab
// (LatestAnalysis.vocab) and replies ONLY via PageUpdate body.suggestions — the
// page validates each against the real ledger before showing the Review card.
const CLASSIFY_PROMPT = 'Categorize my uncategorized transactions. Call LatestAnalysis, then for EACH merchant in `unclassified`: pick the best fit from `vocab.categories`, or "transfer" for a credit-card payment / account transfer, or "income" for money received. If nothing fits, propose a short lowercase new category and set isNew:true. Use ONLY merchant strings exactly as they appear in `unclassified`. Reply by calling PageUpdate with body.suggestions = [{merchant, type, isNew?, reason}] and nothing else — no insight cards, no prose.';

async function runBash(command) {
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  if (body.exit_code && body.exit_code !== 0) throw new Error(body.stderr || `bash exit ${body.exit_code}`);
  return body.stdout || '';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Config-driven: currency symbol + user category overrides (seeded by install.sh).
let CURRENCY = '$';
let CURRENCY_CODE = 'USD';
let CATEGORY_OVERRIDES = null;
const CURRENCY_CODES = ['USD', 'CAD', 'CNY', 'EUR', 'GBP', 'JPY', 'AUD', 'HKD', 'INR', 'KRW'];
const currencySymbol = (code) => ({
  USD: '$', CAD: '$', AUD: '$', GBP: '£', EUR: '€', JPY: '¥',
  CNY: '¥', RMB: '¥', HKD: 'HK$', INR: '₹', KRW: '₩',
}[(code || '').toUpperCase()] || '$');
const money = (n) => `${CURRENCY}${Math.round(Number(n) || 0).toLocaleString()}`;
// Subscription amounts are small and cents-meaningful ($16.49 → $18.99 is the
// whole story of a price hike) — exact for those, whole dollars elsewhere.
const moneyExact = (n) => `${CURRENCY}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const analyzeOpts = () => ({
  categoryOverrides: CATEGORY_OVERRIDES,
  commitments: Object.keys(COMMITMENTS).length ? COMMITMENTS : null,
  marketBenchmark: MARKET,
});

// ── Market benchmark — anonymous public posted-rate averages; no user data
// in the request. CAD: Bank of Canada 5-yr conventional; USD: Freddie Mac
// PMMS 30-yr. Cached a week (both publish weekly). Other currencies: none.
let MARKET = null;
const MARKET_SOURCES = {
  CAD: {
    cmd: 'curl -s --max-time 8 "https://www.bankofcanada.ca/valet/observations/V80691335/json?recent=1"',
    parse: (out) => {
      const o = (JSON.parse(out).observations || [])[0];
      const rate = o && Number(o.V80691335 && o.V80691335.v);
      return rate > 0 ? { rate, date: o.d, label: '5-yr posted avg', source: 'Bank of Canada' } : null;
    },
  },
  USD: {
    cmd: 'curl -s --max-time 8 "https://www.freddiemac.com/pmms/docs/PMMS_history.csv" | tail -1',
    parse: (out) => {
      const f = out.trim().split(',').map((s) => s.replace(/"/g, ''));
      const rate = Number(f[1]);
      return rate > 0 ? { rate, date: f[0], label: '30-yr fixed avg', source: 'Freddie Mac' } : null;
    },
  },
};

async function loadMarketRate() {
  const src = MARKET_SOURCES[CURRENCY_CODE];
  MARKET = null;
  if (!src) return;
  try {
    const cache = await readJson(`${DATA}/market-rates.json`, null);
    if (cache && cache.currency === CURRENCY_CODE && cache.fetched_at
      && Date.now() - new Date(cache.fetched_at).getTime() < 7 * 86400000) {
      MARKET = cache;
      return;
    }
    const m = src.parse(await runBash(src.cmd));
    if (!m) return;
    MARKET = { ...m, currency: CURRENCY_CODE, fetched_at: new Date().toISOString() };
    await writeB64(`${DATA}/market-rates.json`, JSON.stringify(MARKET, null, 2));
    if (LEDGER.length) await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts())); // agent sees it
    if (VIEW_MODE === 'commit') renderCommitView();
  } catch (e) { console.warn('[cfo] market rate', e); }
}

async function loadConfig() {
  try {
    const out = await runBash(`cat "$HOME/.linggen/skills/${SKILL}/config.json" 2>/dev/null || true`);
    const cfg = out.trim() ? JSON.parse(out) : {};
    CURRENCY_CODE = (cfg.currency || 'USD').toUpperCase();
    CURRENCY = currencySymbol(CURRENCY_CODE);
    const ov = cfg.category_overrides;
    CATEGORY_OVERRIDES = ov && Object.keys(ov).length ? ov : null;
  } catch (e) { console.warn('[cfo] config load', e); }
}

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.classList.toggle('error', !!isError);
}

// ── Store: year-partitioned JSONL ledger + accounts + provenance, all via
// /api/bash (coreutils only). Files hold REDACTED data; raw statements never land.
async function readText(path) {
  return (await runBash(`cat "${path}" 2>/dev/null || true`)).trim();
}
async function writeB64(path, text, append) {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  const op = append ? '>>' : '>';
  await runBash(`mkdir -p "$(dirname "${path}")" && printf '%s' "${b64}" | base64 --decode ${op} "${path}"`);
}
async function readJson(path, fallback) {
  const t = await readText(path);
  try { return t ? JSON.parse(t) : fallback; } catch { return fallback; }
}

const loadAccounts = () => readJson(`${DATA}/accounts.json`, {});
const saveAccounts = (a) => writeB64(`${DATA}/accounts.json`, JSON.stringify(a, null, 2));
const loadCommitments = () => readJson(`${DATA}/commitments.json`, {});
const saveCommitmentsFile = () => writeB64(`${DATA}/commitments.json`, JSON.stringify(COMMITMENTS, null, 2));
const loadInsights = () => readJson(`${DATA}/insights.json`, []);
const saveInsights = () => writeB64(`${DATA}/insights.json`, JSON.stringify(INSIGHTS));

async function loadLedger() {
  const out = await runBash(`cat "${DATA}"/ledger/*.jsonl 2>/dev/null || true`);
  const rows = [];
  for (const line of out.split('\n')) {
    const s = line.trim();
    if (s) { try { rows.push(JSON.parse(s)); } catch { /* skip bad line */ } }
  }
  return rows;
}
async function appendLedgerRows(rows) {
  const byYear = {};
  for (const r of rows) { const y = (r.date || '').slice(0, 4) || 'undated'; (byYear[y] ||= []).push(r); }
  for (const [y, rs] of Object.entries(byYear)) {
    await writeB64(`${DATA}/ledger/${y}.jsonl`, rs.map((r) => JSON.stringify(r)).join('\n') + '\n', true);
  }
}
async function appendImport(entry) {
  const log = await readJson(`${DATA}/imports.json`, []);
  log.push(entry);
  await writeB64(`${DATA}/imports.json`, JSON.stringify(log, null, 2));
}

// The single redacted report the agent reads via LatestAnalysis (latest.sh).
// Aggregates (totals/by_month/by_category/top_merchants/subscriptions) cover the
// full ledger, but the raw transaction list is windowed to the recent ~90 days
// so the agent's context doesn't grow with years of history.
const AGENT_TXN_DAYS = 90;
function trimForAgent(r) {
  const txns = r.transactions || [];
  const end = r.date_range && r.date_range.end;
  if (!end || !txns.length) return r;
  const cutoff = new Date(new Date(end).getTime() - AGENT_TXN_DAYS * 86400000).toISOString().slice(0, 10);
  const recent = txns.filter((t) => t.date && t.date >= cutoff);
  return {
    ...r,
    transactions: recent,
    transactions_window: { from: cutoff, to: end, included: recent.length, total: txns.length },
  };
}
// Dismissed anomalies disappear for the agent too — "I said that's fine"
// must stick on both surfaces.
const filterAnomalies = (r) => ({ ...r, anomalies: (r.anomalies || []).filter((a) => !ANOM_DISMISSED.has(a.id)) });

// Distinct spend merchants the deterministic layer left as "other" — the work
// list for the agent-teacher. Computed over the FULL ledger (not the range
// view) so a quiet month doesn't hide them. detectTransfers is idempotent.
function computeResidual() {
  detectTransfers(LEDGER, ACCOUNTS, 5, CATEGORY_OVERRIDES);
  const agg = new Map();
  for (const r of LEDGER) {
    if (r.transfer || r.amount >= 0) continue;
    const cat = r.category || categorize(r.merchant, CATEGORY_OVERRIDES);
    if (cat !== 'other') continue;
    const e = agg.get(r.merchant) || { merchant: r.merchant, count: 0, total: 0 };
    e.count++; e.total = Math.round((e.total - r.amount) * 100) / 100; agg.set(r.merchant, e);
  }
  return [...agg.values()].sort((a, b) => b.total - a.total);
}
// The user's classification vocabulary handed to the agent so it MAPS to what
// exists instead of inventing near-duplicate categories.
const vocabForAgent = () => ({
  categories: knownCategories().filter((c) => c !== 'transfer' && c !== 'income'),
  transfer_keywords: Object.entries(CATEGORY_OVERRIDES || {}).filter(([, v]) => v === 'transfer').map(([k]) => k),
});
const saveReport = (r) => {
  const out = trimForAgent(filterAnomalies(r));
  out.unclassified = computeResidual(); // agent-teacher work list (redacted merchants only)
  out.vocab = vocabForAgent();
  return writeB64(`${DATA}/report.json`, JSON.stringify(out));
};

// ── Account resolution: known fingerprint → silent fast path; anything else
// goes through the import-review staging page (Transactions tab).

// Pre-select the likely account type from the filename so the user usually
// just clicks through (e.g. "...-checking.csv" → Checking, not Credit card).
function guessType(text) {
  const t = (text || '').toLowerCase();
  if (/check|chequing/.test(t)) return 'checking';
  if (/saving/.test(t)) return 'savings';
  return 'credit'; // visa/card/credit/amex/etc. and the default
}

// Suggest (never silently decide): pre-check the existing account whose label
// tokens all appear in the filename — "td-checking-apr-jun.csv" → "td checking".
// The user still confirms; mis-assignment corrupts reconciliation.
function bestAccountMatch(filename, accounts) {
  const ftoks = new Set((filename || '').toLowerCase().replace(/\.(csv|pdf)$/i, '').split(/[^a-z0-9]+/).filter(Boolean));
  let best = null, bestN = 0;
  for (const [id, a] of Object.entries(accounts)) {
    const ltoks = (a.label || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const hit = ltoks.filter((t) => ftoks.has(t)).length;
    if (ltoks.length && hit === ltoks.length && hit > bestN) { best = id; bestN = hit; }
  }
  return best;
}

// ── Import-review staging (replaces the old account modal) ──
// One file at a time; resolves with the chosen accountId or null on cancel.
let STAGING = null;

function stageImport(ctx) {
  return new Promise((resolve) => {
    const match = bestAccountMatch(ctx.filename, ACCOUNTS);
    STAGING = {
      ...ctx,
      // Default to the pre-filled New account (label + type guessed from the
      // filename) so the transaction count + preview show immediately. Leaving
      // it unselected showed "0 / Pick an account to preview", which read as
      // "empty file". The account picker is still right there to switch/merge.
      accountId: match || '__new__',
      newLabel: (ctx.filename || '').replace(/\.(csv|pdf)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 30) || 'Account',
      newType: guessType(ctx.filename),
      catEdits: {},
      resolve,
    };
    switchView('txn');
  });
}

function stagingPreview() {
  const s = STAGING;
  const isNew = s.accountId === '__new__';
  const type = isNew ? s.newType : (ACCOUNTS[s.accountId]?.type || 'credit');
  const id = isNew ? (s.fingerprint || `acct_${hashId(s.newLabel + s.newType)}`) : s.accountId;
  const oriented = s.accountId ? orientTransactions(s.transactions, type).transactions : s.transactions;
  const rows = s.accountId ? toLedgerRows(oriented, id) : [];
  const onFile = new Set(LEDGER.map((r) => r.id));
  return { oriented, rows, dup: rows.filter((r) => onFile.has(r.id)).length, onFile };
}

function renderStaging() {
  const s = STAGING;
  const el = document.getElementById('txn-staging');
  const cats = knownCategories();
  const { oriented, rows, dup, onFile } = stagingPreview();
  const fresh = rows.length - dup;
  const fileTag = s.fileCount > 1 ? ` <span class="hint inline">(file ${s.fileIdx + 1} of ${s.fileCount})</span>` : '';
  el.innerHTML = `
    <h2>Import review — ${esc(s.filename)}${fileTag}</h2>
    <p class="hint">${s.fingerprint ? 'New account detected — label it once and future imports auto-match.' : 'This file has no account number — pick the account it belongs to.'}</p>
    <div class="stage-accts">
      ${Object.entries(ACCOUNTS).map(([id, a]) => `
        <label class="acct-opt"><input type="radio" name="st-acct" value="${esc(id)}" ${s.accountId === id ? 'checked' : ''}> <span>${esc(a.label)}</span> <span class="acct-type">${esc(a.type)}</span></label>`).join('')}
      <label class="acct-opt"><input type="radio" name="st-acct" value="__new__" ${s.accountId === '__new__' ? 'checked' : ''}> New account…
        <input id="st-label" type="text" value="${esc(s.newLabel)}" ${s.accountId === '__new__' ? '' : 'disabled'}>
        <select id="st-type" ${s.accountId === '__new__' ? '' : 'disabled'}>
          ${[['credit', 'Credit card'], ['checking', 'Checking'], ['savings', 'Savings']].map(([v, l]) => `<option value="${v}" ${v === (s.newType) ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>
    ${s.accountId ? `<p class="stage-count">${rows.length} transactions — <b>${fresh} new</b>${dup ? ` · ${dup} already on file (will skip)` : ''}</p>` : '<p class="stage-count hint">Pick an account to preview.</p>'}
    <div id="stage-table">${s.accountId ? `
      <table><thead><tr><th>Date</th><th>Merchant</th><th class="num">Amount</th><th>Category</th></tr></thead><tbody>
      ${oriented.map((t, i) => {
        const isDup = onFile.has(rows[i]?.id);
        const cat = s.catEdits[i] || t.category || (t.amount < 0 ? categorize(t.merchant, CATEGORY_OVERRIDES) : 'income');
        const catCell = isDup ? '<span class="tag">duplicate</span>'
          : (t.amount >= 0 ? '<span class="tag">income</span>'
            : `<select class="cat-sel st" data-i="${i}">${cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new__">✚ New category…</option></select>`);
        return `<tr class="${isDup ? 'dup' : ''}"><td>${esc(t.date || '—')}</td><td class="m">${esc(t.merchant)}</td><td class="num ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '−' : '+'}${moneyExact(Math.abs(t.amount))}</td><td>${catCell}</td></tr>`;
      }).join('')}</tbody></table>` : ''}</div>
    <div class="stage-actions">
      <button class="btn ghost" id="st-cancel">Cancel</button>
      <button class="btn" id="st-import" ${s.accountId ? '' : 'disabled'}>Import ${fresh} transaction${fresh === 1 ? '' : 's'} →</button>
    </div>`;

  el.querySelectorAll('input[name=st-acct]').forEach((rb) => rb.addEventListener('change', () => {
    s.accountId = rb.value;
    renderStaging();
  }));
  el.querySelector('#st-label')?.addEventListener('input', (e) => { s.newLabel = e.target.value; });
  el.querySelector('#st-label')?.addEventListener('focus', () => { if (s.accountId !== '__new__') { s.accountId = '__new__'; renderStaging(); } });
  el.querySelector('#st-type')?.addEventListener('change', (e) => { s.newType = e.target.value; renderStaging(); });
  el.querySelectorAll('.cat-sel.st').forEach((sel) => sel.addEventListener('change', () => {
    let v = sel.value;
    if (v === '__new__') {
      v = (window.prompt('New category name:') || '').trim().toLowerCase();
      if (!v) { renderStaging(); return; }
    }
    s.catEdits[+sel.dataset.i] = v;
    renderStaging();
  }));
  el.querySelector('#st-cancel').addEventListener('click', () => finishStaging(null));
  el.querySelector('#st-import').addEventListener('click', async () => {
    const isNew = s.accountId === '__new__';
    let id = s.accountId;
    if (isNew) {
      const label = (s.newLabel || 'Account').trim();
      id = s.fingerprint || `acct_${hashId(label + s.newType)}`;
      ACCOUNTS[id] = { label, type: s.newType };
      await saveAccounts(ACCOUNTS);
    }
    for (const [i, cat] of Object.entries(s.catEdits)) s.transactions[+i].category = cat;
    finishStaging(id);
  });
}

function finishStaging(result) {
  const s = STAGING;
  STAGING = null;
  document.getElementById('txn-staging').hidden = true;
  document.getElementById('txn-browse').hidden = false;
  switchView('report');
  s.resolve(result);
}

// ── Transactions browse: full ledger table + category corrections ──
let TXN_FILTERS = { month: '', account: '', category: '', q: '' };
const BUILTIN_CATS = ['fees', 'dining', 'groceries', 'transport', 'subscriptions', 'utilities', 'housing', 'shopping', 'health', 'travel', 'other'];

function knownCategories() {
  const set = new Set(BUILTIN_CATS);
  if (CATEGORY_OVERRIDES) Object.values(CATEGORY_OVERRIDES).forEach((c) => set.add(String(c)));
  for (const r of LEDGER) if (r.category) set.add(r.category);
  return [...set].sort();
}

const effCategory = (r) => (r.transfer ? 'transfer' : r.amount >= 0 ? 'income' : (r.category || categorize(r.merchant, CATEGORY_OVERRIDES)));

function renderTxnView() {
  document.getElementById('txn-staging').hidden = !STAGING;
  document.getElementById('txn-browse').hidden = !!STAGING;
  if (STAGING) { renderStaging(); return; }
  renderImportHistory();
  detectTransfers(LEDGER, ACCOUNTS, 5, CATEGORY_OVERRIDES);
  const cats = knownCategories();
  const f = TXN_FILTERS;
  const months = [...new Set(LEDGER.filter((r) => r.date).map((r) => r.date.slice(0, 7)))].sort().reverse();
  let rows = LEDGER.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (f.month) rows = rows.filter((r) => r.date && r.date.startsWith(f.month));
  if (f.account) rows = rows.filter((r) => r.account === f.account);
  if (f.category) rows = rows.filter((r) => effCategory(r) === f.category);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter((r) => r.merchant.toLowerCase().includes(q)); }
  const MAX = 500;
  const shown = rows.slice(0, MAX);

  document.getElementById('txn-filters').innerHTML = `
    <select id="tf-month"><option value="">All months</option>${months.map((m) => `<option value="${m}" ${f.month === m ? 'selected' : ''}>${monthName(m)} ${m.slice(0, 4)}</option>`).join('')}</select>
    <select id="tf-acct"><option value="">All accounts</option>${Object.entries(ACCOUNTS).map(([id, a]) => `<option value="${esc(id)}" ${f.account === id ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select>
    <select id="tf-cat"><option value="">All categories</option>${['income', 'transfer', ...cats].map((c) => `<option ${f.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <input id="tf-q" type="search" placeholder="Search merchant…" value="${esc(f.q)}">
    <span class="hint">${rows.length} record${rows.length === 1 ? '' : 's'}${rows.length > MAX ? ` — showing ${MAX}` : ''}</span>`;
  const re = () => renderTxnView();
  document.getElementById('tf-month').addEventListener('change', (e) => { f.month = e.target.value; re(); });
  document.getElementById('tf-acct').addEventListener('change', (e) => { f.account = e.target.value; re(); });
  document.getElementById('tf-cat').addEventListener('change', (e) => { f.category = e.target.value; re(); });
  document.getElementById('tf-q').addEventListener('change', (e) => { f.q = e.target.value; re(); });

  document.getElementById('txn-table').innerHTML = rows.length ? `
    <table><thead><tr><th>Date</th><th>Merchant</th><th>Account</th><th class="num">Amount</th><th>Category</th></tr></thead><tbody>
    ${shown.map((r) => {
    const lbl = r.transfer ? '⇄ transfer' : effCategory(r);
    // Every row is editable: a transfer can be reclassified back to real spend,
    // any row can be marked a transfer/payment. Click opens the picker combobox.
    const catCell = `<button class="cat-pick${r.transfer ? ' is-transfer' : ''}" data-id="${esc(r.id)}">${esc(lbl)}<span class="caret">▾</span></button>`;
    return `<tr><td>${esc(r.date || '—')}</td><td class="m">${esc(r.merchant)}</td><td>${esc(ACCOUNTS[r.account]?.label || r.account)}</td><td class="num ${r.amount < 0 ? 'neg' : 'pos'}">${r.amount < 0 ? '−' : '+'}${moneyExact(Math.abs(r.amount))}</td><td>${catCell}</td></tr>`;
  }).join('')}</tbody></table>` : '<p class="hint">No matching transactions.</p>';

  document.querySelectorAll('#txn-table .cat-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = LEDGER.find((r) => r.id === btn.dataset.id);
      if (row) openCatPicker(btn, row);
    });
  });
}

// ── Category / transfer picker — a searchable combobox shared across rows ──
// One popover, anchored under the clicked cell. Type to filter the vocab; pick a
// category, mark the row a Transfer/Payment (excluded from spend/income), or add
// a brand-new category. Every pick writes a rule that applies to past + future
// matching rows — this is how CFO learns the user's vocabulary over time.
const TRANSFER_OPT = { value: 'transfer', label: '⇄ Transfer / Payment', special: true };
const INCOME_OPT = { value: 'income', label: 'income', special: true };

function catOptions(row) {
  if (row.amount >= 0) return [INCOME_OPT, TRANSFER_OPT];
  const cats = knownCategories().filter((c) => c !== 'transfer' && c !== 'income');
  return [...cats.map((c) => ({ value: c, label: c })), TRANSFER_OPT];
}

let CAT_POP = null;
function openCatPicker(anchor, row) {
  if (!CAT_POP) { CAT_POP = document.createElement('div'); CAT_POP.id = 'cat-pop'; CAT_POP.hidden = true; document.body.appendChild(CAT_POP); }
  const pop = CAT_POP;
  const opts = catOptions(row);
  const cur = row.transfer ? 'transfer' : effCategory(row);
  let active = 0, items = opts;
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 4}px`;
  pop.hidden = false;
  pop.innerHTML = '<input class="cat-q" type="text" placeholder="Search or add…" autocomplete="off"><ul class="cat-list"></ul>';
  const q = pop.querySelector('.cat-q');
  const list = pop.querySelector('.cat-list');

  const render = () => {
    const term = q.value.trim().toLowerCase();
    items = opts.filter((o) => o.label.toLowerCase().includes(term));
    const exact = opts.some((o) => o.value.toLowerCase() === term);
    if (term && !exact && row.amount < 0) items = [...items, { value: term, label: `✚ Add “${term}”`, isNew: true }];
    active = Math.max(0, Math.min(active, items.length - 1));
    list.innerHTML = items.map((o, i) =>
      `<li class="${o.special ? 'special' : ''}${o.isNew ? ' newcat' : ''}${i === active ? ' active' : ''}${o.value === cur ? ' current' : ''}" data-i="${i}">${esc(o.label)}</li>`).join('');
  };
  render();

  const close = () => { pop.hidden = true; pop.innerHTML = ''; document.removeEventListener('mousedown', onDoc, true); };
  const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  const choose = (o) => {
    close();
    if (!o) return;
    const val = o.isNew ? o.value.toLowerCase() : o.value;
    // transfer/income, and un-transferring a heuristic transfer, all need a RULE
    // (a per-row category would just get re-flagged on the next reload).
    if (val === 'transfer' || val === 'income' || row.transfer) applyRule(row, val);
    else askScope(anchor, row, val); // plain category — offer rule vs this-row
  };
  document.addEventListener('mousedown', onDoc, true);
  q.addEventListener('input', () => { active = 0; render(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(items[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li'); if (!li) return;
    e.preventDefault(); choose(items[+li.dataset.i]);
  });
  q.focus();
}

// Transfer / income picks are always a remembered rule (a per-row transfer can't
// persist — flags are recomputed from the full ledger each load).
async function applyRule(row, val) { return applyRuleByMerchant(row.merchant, val); }

// Write a merchant -> classification rule (a category, or 'transfer'/'income')
// and recompute. `recompute=false` lets a batch apply many then recompute once.
async function applyRuleByMerchant(merchant, val, recompute = true) {
  CATEGORY_OVERRIDES = { ...(CATEGORY_OVERRIDES || {}), [String(merchant).toLowerCase()]: val };
  await saveConfigOverrides();
  if (recompute) await afterCategoriesChanged();
}

// Import history with per-import revert. Imports made before undo existed have
// no recorded ids — shown but marked not-revertible (honest about the limit).
async function renderImportHistory() {
  const el = document.getElementById('import-history');
  const log = (await readJson(`${DATA}/imports.json`, [])).slice().reverse();
  if (!log.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h2>Import history</h2>
    <div class="imports">
      ${log.map((e) => {
    const when = (e.at || '').slice(0, 10);
    const acct = ACCOUNTS[e.account]?.label || e.account || '—';
    const revertible = !e.reverted && Array.isArray(e.added_ids) && e.added_ids.length;
    const tail = e.reverted ? '<span class="tag">reverted</span>'
      : revertible ? `<button class="chip undo" data-id="${esc(e.id)}">Undo</button>`
        : '<span class="hint">—</span>';
    return `<div class="import-row${e.reverted ? ' reverted' : ''}">
        <span class="imp-file">${esc(e.file || 'import')}</span>
        <span class="imp-meta">${esc(acct)} · ${e.added ?? '?'} added · ${esc(when)}</span>
        ${tail}
      </div>`;
  }).join('')}
    </div>`;
  el.querySelectorAll('.undo').forEach((b) => b.addEventListener('click', async () => {
    if (!window.confirm('Undo this import? The transactions it added will be removed from your report.')) return;
    b.disabled = true;
    await undoImport(b.dataset.id);
  }));
}

// "Always for this merchant" writes a config override rule (fixes past AND
// future records); "just this transaction" stores the category on the row.
function askScope(anchor, row, cat) {
  const pop = document.getElementById('scope-pop');
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, r.right + window.scrollX - 280)}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  pop.hidden = false;
  pop.innerHTML = `
    <b>Apply “${esc(cat)}” to:</b>
    <label><input type="radio" name="scope" value="rule" checked> always for “${esc(row.merchant.slice(0, 36))}”</label>
    <label><input type="radio" name="scope" value="row"> just this transaction</label>
    <div class="modal-actions"><button class="btn ghost" id="scope-cancel">Cancel</button><button class="btn" id="scope-apply">Apply</button></div>`;
  const close = () => { pop.hidden = true; pop.innerHTML = ''; };
  pop.querySelector('#scope-cancel').onclick = () => { close(); renderTxnView(); };
  pop.querySelector('#scope-apply').onclick = async () => {
    const scope = pop.querySelector('input[name=scope]:checked').value;
    close();
    if (scope === 'rule') {
      CATEGORY_OVERRIDES = { ...(CATEGORY_OVERRIDES || {}), [row.merchant.toLowerCase()]: cat };
      await saveConfigOverrides();
    } else {
      row.category = cat;
      await rewriteYearFile((row.date || '').slice(0, 4) || 'undated');
    }
    await afterCategoriesChanged();
  };
}

async function saveConfigOverrides() {
  const CONF = `$HOME/.linggen/skills/${SKILL}/config.json`;
  const cfg = await readJson(CONF, {});
  cfg.category_overrides = CATEGORY_OVERRIDES || {};
  await writeB64(CONF, JSON.stringify(cfg, null, 2));
}

// Rewrite one year file in place. Transfer flags persist as false — they are
// recomputed from the full ledger on every load.
async function rewriteYearFile(year) {
  const rows = LEDGER.filter((r) => (((r.date || '').slice(0, 4)) || 'undated') === year);
  const body = rows.map((r) => JSON.stringify({ ...r, transfer: false, transfer_pair: null })).join('\n');
  await writeB64(`${DATA}/ledger/${year}.jsonl`, body ? body + '\n' : '', false);
}

async function afterCategoriesChanged() {
  await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts())); // agent sees corrections too
  refreshView();
  if (VIEW_MODE === 'txn') renderTxnView();
}

// ── Import: parse → resolve account → orient signs → reconcile → render.
async function importFile(file, fileIdx = 0, fileCount = 1) {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  let transactions, fingerprint = null, notes = [];
  if (isPdf) {
    const { pdfToTransactions } = await import('./pdf-import.js');
    const res = await pdfToTransactions(await file.arrayBuffer());
    transactions = res.transactions; notes = res.notes || [];
  } else {
    const r = analyzeCsv(await file.text(), analyzeOpts());
    if (r.errors && r.errors.length) throw new Error([...(r.notes || []), ...r.errors].join(' '));
    transactions = r.transactions; fingerprint = r.account_fingerprint; notes = r.notes || [];
  }
  if (!transactions || !transactions.length) {
    throw new Error([...(notes.length ? notes : ['No transactions found in this file.'])].join(' '));
  }

  ACCOUNTS = await loadAccounts();
  let accountId = fingerprint && ACCOUNTS[fingerprint] ? fingerprint : null; // known → fast path
  if (!accountId) {
    accountId = await stageImport({ transactions, fingerprint, filename: file.name, fileIdx, fileCount });
    if (!accountId) { setStatus(`Skipped ${file.name} — no account chosen.`); return { file: file.name, skipped: true }; }
  }

  // Some cards export charges as positive (Amex style) — orient now that the
  // user has told us the account type, so spend/income don't land swapped.
  const oriented = orientTransactions(transactions, ACCOUNTS[accountId]?.type);
  if (oriented.flipped) notes.push('This statement lists charges as positive amounts — signs were flipped so spend reads correctly.');

  const incoming = toLedgerRows(oriented.transactions, accountId);
  const existing = await loadLedger();
  const { merged, added } = mergeLedger(existing, incoming);
  if (added.length) await appendLedgerRows(added);
  // Record the exact ids this import added so it can be reverted later. id is a
  // local timestamp-ish token (Date.now is fine in the browser; this is UI state).
  const importId = `imp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  await appendImport({ id: importId, file: file.name, account: accountId, added: added.length, rows: incoming.length, added_ids: added.map((r) => r.id), at: new Date().toISOString() });

  LEDGER = merged;
  await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts())); // agent's full-history copy
  refreshView();
  const dup = incoming.length - added.length;
  const head = dup ? `Imported — ${added.length} new, ${dup} already on file.` : `Imported — ${added.length} transactions.`;
  setStatus([head, ...notes].join(' '));
  return { file: file.name, label: ACCOUNTS[accountId]?.label || accountId, added: added.length, dup, importId };
}

// ── Undo import: remove exactly the rows an import added, rewrite affected year
// files, prune a now-empty account, mark the log entry reverted. Deterministic.
async function undoImport(importId) {
  const log = await readJson(`${DATA}/imports.json`, []);
  const entry = log.find((e) => e.id === importId);
  if (!entry || entry.reverted || !Array.isArray(entry.added_ids) || !entry.added_ids.length) return false;
  const remove = new Set(entry.added_ids);
  const years = new Set(LEDGER.filter((r) => remove.has(r.id)).map((r) => ((r.date || '').slice(0, 4)) || 'undated'));
  LEDGER = LEDGER.filter((r) => !remove.has(r.id));
  for (const y of years) await rewriteYearFile(y);
  // Drop the account if this import created it and nothing else uses it.
  if (entry.account && !LEDGER.some((r) => r.account === entry.account)) {
    delete ACCOUNTS[entry.account];
    await saveAccounts(ACCOUNTS);
  }
  entry.reverted = true;
  entry.reverted_at = new Date().toISOString();
  await writeB64(`${DATA}/imports.json`, JSON.stringify(log, null, 2));
  await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts()));
  refreshView();
  if (VIEW_MODE === 'txn') renderTxnView();
  try { chat?.addMessage?.('assistant', `Reverted the import of ${entry.file} — removed ${entry.added_ids.length} transaction${entry.added_ids.length === 1 ? '' : 's'}. Your report is back to where it was.`); } catch { /* ignore */ }
  return true;
}

// Re-render the saved ledger on open, so the user lands on their picture and
// the report survives New-chat / refresh / 24h session rollover.
async function resumeState() {
  try {
    LEDGER = await loadLedger();
    ACCOUNTS = await loadAccounts();
    INSIGHTS = await loadInsights();
    SUGGESTIONS = await loadSuggestions();
    COMMITMENTS = await loadCommitments();
    ANOM_DISMISSED = new Set(await readJson(`${DATA}/anomalies-dismissed.json`, []));
    // Clean up any historical duplicates (pre-dedup saves) + legacy tones.
    const seen = new Set();
    INSIGHTS = INSIGHTS.filter((c) => {
      const k = `${c.title}|${c.body}`;
      if (seen.has(k)) return false;
      seen.add(k);
      c.tone = normalizeTone(c.tone);
      return true;
    });
    if (LEDGER.length) await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts()));
    refreshView();
    renderInsights();
  } catch (e) { console.warn('[cfo] resume failed', e); }
}

// ── Month-range selector ──
const PRESETS = [['1M', 1], ['3M', 3], ['6M', 6], ['12M', 12], ['YTD', 0], ['ALL', -1]];

function monthShift(m, delta) {
  const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + delta;
  const ny = y + Math.floor(mo / 12), nm = ((mo % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, '0')}`;
}
function monthSpan(from, to) {
  const out = [];
  for (let m = from; m <= to && out.length < 240; m = monthShift(m, 1)) out.push(m);
  return out;
}
const monthName = (m) => new Date(m + '-15').toLocaleString(undefined, { month: 'short' });

function currentRange(months) {
  if (!months.length) return null;
  const last = months[months.length - 1];
  if (RANGE.preset === 'custom' && RANGE.from && RANGE.to) return { from: RANGE.from, to: RANGE.to };
  if (RANGE.preset === 'ALL') return null;
  if (RANGE.preset === 'YTD') return { from: `${last.slice(0, 4)}-01`, to: last };
  const n = { '1M': 1, '3M': 3, '6M': 6, '12M': 12 }[RANGE.preset] || 12;
  return { from: monthShift(last, -(n - 1)), to: last };
}

function setRange(next) {
  RANGE = next;
  refreshView();
}

function renderRangeBar(view) {
  const chips = document.getElementById('range-chips');
  chips.innerHTML = PRESETS.map(([p]) =>
    `<button class="chip${RANGE.preset === p ? ' on' : ''}" data-preset="${p}">${p === 'ALL' ? 'All' : p}</button>`).join('');
  chips.querySelectorAll('button').forEach((b) => { b.onclick = () => setRange({ preset: b.dataset.preset }); });
  document.getElementById('range-custom').classList.toggle('on', RANGE.preset === 'custom');

  const r = view.range;
  const months = view.months_available || [];
  const lblEl = document.getElementById('range-label');
  if (r && r.from === r.to && months.length) {
    // Single month → calendar-month stepper, the standard finance-app pattern.
    const first = months[0], last = months[months.length - 1];
    lblEl.innerHTML = `
      <button class="chip step" id="rg-prev" ${r.from <= first ? 'disabled' : ''}>‹</button>
      <b class="rg-month">${monthName(r.from)} ${r.from.slice(0, 4)}</b>
      <button class="chip step" id="rg-next" ${r.to >= last ? 'disabled' : ''}>›</button>`;
    const step = (d) => {
      const m = monthShift(r.from, d);
      if (m >= first && m <= last) setRange({ preset: 'custom', from: m, to: m });
    };
    lblEl.querySelector('#rg-prev')?.addEventListener('click', () => step(-1));
    lblEl.querySelector('#rg-next')?.addEventListener('click', () => step(1));
  } else {
    lblEl.textContent = r ? `${monthName(r.from)} ${r.from.slice(0, 4)} – ${monthName(r.to)} ${r.to.slice(0, 4)}`
      : (months.length ? `${monthName(months[0])} ${months[0].slice(0, 4)} – ${monthName(months[months.length - 1])} ${months[months.length - 1].slice(0, 4)} (all)` : '');
  }

  const pop = document.getElementById('range-pop');
  document.getElementById('range-custom').onclick = () => {
    if (!pop.hidden) { pop.hidden = true; return; }
    const opts = (sel) => months.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthName(m)} ${m.slice(0, 4)}</option>`).join('');
    const cur = r || { from: months[0], to: months[months.length - 1] };
    pop.innerHTML = `
      <label>From <select id="rp-from">${opts(cur.from)}</select></label>
      <label>To <select id="rp-to">${opts(cur.to)}</select></label>
      <button class="btn" id="rp-apply">Apply</button>`;
    pop.hidden = false;
    pop.querySelector('#rp-apply').onclick = () => {
      let from = pop.querySelector('#rp-from').value, to = pop.querySelector('#rp-to').value;
      if (from > to) [from, to] = [to, from];
      pop.hidden = true;
      setRange({ preset: 'custom', from, to });
    };
  };
}

// ── Fixed-section renderers ──
// One owner for section visibility — Report vs Transactions tab.
let VIEW_MODE = 'report';
function applyVisibility() {
  const txn = VIEW_MODE === 'txn';
  const commit = VIEW_MODE === 'commit';
  const away = txn || commit;
  document.getElementById('txn').hidden = !txn;
  document.getElementById('commit').hidden = !commit;
  document.getElementById('report').hidden = away || !LEDGER.length;
  document.getElementById('empty-state').hidden = away || LEDGER.length > 0;
  document.getElementById('insights-wrap').hidden = away || (!LEDGER.length && !INSIGHTS.length);
  renderSuggestions(); // Review card (Report tab only) — self-hides when empty
}

function switchView(mode) {
  if (STAGING && mode !== 'txn') return; // an import review is pending — finish or cancel it
  VIEW_MODE = mode;
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.view === mode));
  applyVisibility();
  if (mode === 'txn') renderTxnView();
  if (mode === 'commit') renderCommitView();
}

function refreshView() {
  applyVisibility();
  if (!LEDGER.length) return;
  // Transfer detection always runs on the full ledger; the range only slices the view.
  const months = [...new Set(LEDGER.filter((r) => r.date).map((r) => r.date.slice(0, 7)))].sort();
  const view = viewFromLedger(LEDGER, ACCOUNTS, analyzeOpts(), currentRange(months));
  LAST_VIEW = view;
  // Commitments always read the full history — a 1-month range can't see a
  // monthly cadence, so the headline card and tab would go blank on short views.
  FULL_VIEW = reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts());
  renderRangeBar(view);
  renderCards(view);
  renderForecast(FULL_VIEW.forecast); // always full-history: cadences need it
  renderAnomalies(FULL_VIEW.anomalies);
  renderTrend(view);
  renderCategories(view);
  renderSubs(view);
  renderPayments(view);
  renderBillCal();
  const cats = view.by_category || [];
  setSecSum('breakdown', [
    cats.length ? `${cats[0].category} leads ${money(cats[0].spend)}` : '',
    `subs ${moneyExact(view.subscription_monthly_total)}/mo`,
  ].filter(Boolean).join(' · '));
  if (VIEW_MODE === 'commit') renderCommitView();
}

// ── Bill calendar: month grid of paid (✓) and expected fixed payments —
// bills out, income in, card payments — this data-month and the next.
let CAL_MONTH = null;
function renderBillCal() {
  const sec = document.querySelector('[data-sec="billcal"]');
  const el = document.getElementById('bill-cal');
  const events = (FULL_VIEW && FULL_VIEW.bill_calendar) || [];
  sec.hidden = !events.length;
  if (!events.length) { el.innerHTML = ''; return; }
  const months = [...new Set(events.map((e) => e.date.slice(0, 7)))].sort();
  if (!CAL_MONTH || !months.includes(CAL_MONTH)) CAL_MONTH = months[0];
  const y = +CAL_MONTH.slice(0, 4), m = +CAL_MONTH.slice(5, 7);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const byDay = {};
  for (const e of events) if (e.date.startsWith(CAL_MONTH)) (byDay[+e.date.slice(8)] ||= []).push(e);

  const tipFor = (e) => `${e.label}\n${moneyExact(Math.abs(e.amount))} — ${e.status === 'paid' ? 'paid' : 'expected ~'}${e.date}`;
  const chip = (e) => `<span class="bc-chip ${esc(e.kind)} ${esc(e.status)}" data-tip="${esc(tipFor(e))}">${e.status === 'paid' ? '✓' : ''}${e.amount > 0 ? '+' : ''}${money(Math.abs(e.amount))}</span>`;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<div class="bc-cell empty"></div>');
  for (let d = 1; d <= dim; d++) {
    const evs = byDay[d] || [];
    const iso = `${CAL_MONTH}-${String(d).padStart(2, '0')}`;
    cells.push(`<div class="bc-cell${iso === today ? ' today' : ''}">
      <span class="bc-day">${d}</span>
      ${evs.slice(0, 2).map(chip).join('')}${evs.length > 2 ? `<span class="bc-more" data-tip="${esc(evs.slice(2).map(tipFor).join('\n'))}">+${evs.length - 2}</span>` : ''}
    </div>`);
  }
  const mi = months.indexOf(CAL_MONTH);
  el.innerHTML = `
    <div class="bc-head">
      <button class="chip step" id="bc-prev" ${mi <= 0 ? 'disabled' : ''}>‹</button>
      <b>${monthName(CAL_MONTH)} ${CAL_MONTH.slice(0, 4)}</b>
      <button class="chip step" id="bc-next" ${mi >= months.length - 1 ? 'disabled' : ''}>›</button>
      <span class="bc-legend"><i class="sw income"></i>income <i class="sw bill"></i>bills <i class="sw card"></i>card payments</span>
    </div>
    <div class="bc-grid">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="bc-dow">${d}</div>`).join('')}
      ${cells.join('')}
    </div>`;
  document.getElementById('bc-prev')?.addEventListener('click', () => { CAL_MONTH = months[mi - 1]; renderBillCal(); });
  document.getElementById('bc-next')?.addEventListener('click', () => { CAL_MONTH = months[mi + 1]; renderBillCal(); });
  const asOf = (FULL_VIEW.forecast && FULL_VIEW.forecast.as_of) || '';
  const nextEv = events.find((e) => e.status === 'expected' && e.date > asOf);
  setSecSum('billcal', nextEv ? `next: ${nextEv.label.slice(0, 24)} ~${nextEv.date.slice(5)}` : '');
}

// ── Safe-to-spend: flow-based month forecast, anchored on the data's last day.
function renderForecast(f) {
  const el = document.getElementById('forecast');
  if (!f) { el.innerHTML = ''; return; }
  const mn = `${monthName(f.month)} ${f.month.slice(0, 4)}`;
  const dom = (iso) => `~${monthName(iso.slice(0, 7))} ${+iso.slice(8)}`;
  const fixedBits = f.upcoming_fixed.slice(0, 3).map((u) => `${esc(u.merchant.slice(0, 22))} ${dom(u.expected)}`).join(' · ');
  const more = f.upcoming_fixed.length > 3 ? ` +${f.upcoming_fixed.length - 3} more` : '';
  const staleDays = Math.round((new Date() - new Date(f.as_of)) / 86400000);
  const pos = f.safe_to_spend >= 0;
  el.innerHTML = `
  <div class="fc-card">
    <div class="fc-head">
      <span class="fc-title">Safe to spend — rest of ${mn}</span>
      <span class="hint">as of ${esc(f.as_of)}</span>
    </div>
    <div class="fc-hero ${pos ? 'pos' : 'neg'}">${pos ? '' : '−'}${money(Math.abs(f.safe_to_spend))}</div>
    <div class="fc-lines">
      <div>So far: <b>+${money(f.income_so_far)}</b> in · <b>−${money(f.spend_so_far)}</b> out${f.expected_income_total ? ` · still expecting <b class="pos-t">+${money(f.expected_income_total)}</b> income` : ''}${f.upcoming_fixed_total ? ` · <b>−${money(f.upcoming_fixed_total)}</b> fixed still due${fixedBits ? ` (${fixedBits}${more})` : ''}` : ''}</div>
      ${f.variable.daily_avg > 0 ? `<div>Day-to-day pace <b>${money(f.variable.daily_avg)}/day</b> → on track to land at <b class="${f.on_track_net >= 0 ? 'pos-t' : 'neg-t'}">${f.on_track_net >= 0 ? '+' : '−'}${money(Math.abs(f.on_track_net))}</b> by month end</div>` : ''}
      ${staleDays > 7 ? `<div class="hint">📥 Data ends ${esc(f.as_of)} — import fresher statements for a live number.</div>` : ''}
    </div>
  </div>`;
}

function renderCards(v) {
  const t = v.totals || {};
  // The commitments figure comes from FULL_VIEW — cadence detection needs the
  // whole history, not the sliced range.
  const c = (FULL_VIEW && FULL_VIEW.commitments) || { monthly_total: 0, pct_of_income: null };
  document.getElementById('cards').innerHTML = `
    <div class="card"><div class="k">Spend</div><div class="v">${money(t.spend)}</div><div class="sub">${t.months || 0} mo</div></div>
    <div class="card"><div class="k">Income</div><div class="v">${money(t.income)}</div></div>
    <div class="card ${(t.net || 0) >= 0 ? 'pos' : 'neg'}"><div class="k">Net</div><div class="v">${money(t.net)}</div></div>
    <div class="card"><div class="k">Subscriptions</div><div class="v">${moneyExact(v.subscription_monthly_total)}<span class="per">/mo</span></div><div class="sub">${v.active_subscription_count || 0} active${v.stopped_subscription_count ? ` · ${v.stopped_subscription_count} stopped` : ''}</div></div>
    <div class="card link" id="card-commit" title="Loans, insurance, bills, subscriptions — open the Commitments tab"><div class="k">Commitments</div><div class="v">${money(c.monthly_total)}<span class="per">/mo</span></div><div class="sub">${c.pct_of_income != null ? `${Math.round(c.pct_of_income)}% of income` : 'fixed monthly'}</div></div>`;
  document.getElementById('card-commit')?.addEventListener('click', () => switchView('commit'));
}

// Hand-rolled SVG: paired spend/income bars per month + net line. No chart lib.
function renderTrend(v) {
  const el = document.getElementById('trend');
  const byM = v.by_month || {};
  const r = v.range || (v.months_available?.length
    ? { from: v.months_available[0], to: v.months_available[v.months_available.length - 1] } : null);
  if (!r) { el.innerHTML = '<p class="hint">No dated transactions yet.</p>'; return; }
  const months = monthSpan(r.from, r.to);
  const data = months.map((m) => ({ m, spend: 0, income: 0, net: 0, ...(byM[m] || {}) }));
  const W = 660, H = 230, L = 46, R = 10, T = 12, B = 28;
  const innerW = W - L - R, innerH = H - T - B;
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.spend, d.income, d.net)));
  const minV = Math.min(0, ...data.map((d) => d.net));
  const y = (val) => T + innerH * (1 - (val - minV) / (maxV - minV));
  const groupW = innerW / data.length;
  const barW = Math.min(22, groupW * 0.3);
  const fmt = (n) => Math.abs(n) >= 1000 ? `${CURRENCY}${(n / 1000).toFixed(1)}k` : `${CURRENCY}${Math.round(n)}`;

  const ticks = [0, 0.5, 1].map((f) => minV + f * (maxV - minV));
  const grid = ticks.map((tv) =>
    `<line x1="${L}" y1="${y(tv)}" x2="${W - R}" y2="${y(tv)}" class="grid"/>
     <text x="${L - 6}" y="${y(tv) + 4}" class="ax" text-anchor="end">${fmt(tv)}</text>`).join('');

  const bars = data.map((d, i) => {
    const cx = L + groupW * (i + 0.5);
    const tip = `${monthName(d.m)} ${d.m.slice(0, 4)} — spend ${moneyExact(d.spend)}, income ${moneyExact(d.income)}, net ${moneyExact(d.net)}`;
    const yearTag = (i === 0 || d.m.endsWith('-01')) ? `<text x="${cx}" y="${H - 2}" class="ax yr" text-anchor="middle">${d.m.slice(0, 4)}</text>` : '';
    return `<g class="mgroup" data-month="${d.m}">
      <title>${esc(tip)}</title>
      <rect x="${cx - barW - 1}" y="${y(d.spend)}" width="${barW}" height="${Math.max(0, y(0) - y(d.spend))}" class="bar spend"/>
      <rect x="${cx + 1}" y="${y(d.income)}" width="${barW}" height="${Math.max(0, y(0) - y(d.income))}" class="bar income"/>
      <text x="${cx}" y="${H - B + 16}" class="ax" text-anchor="middle">${monthName(d.m)}</text>
      ${yearTag}
    </g>`;
  }).join('');

  const netPts = data.map((d, i) => `${L + groupW * (i + 0.5)},${y(d.net)}`).join(' ');
  const netDots = data.map((d, i) =>
    `<circle cx="${L + groupW * (i + 0.5)}" cy="${y(d.net)}" r="3" class="netdot"/>`).join('');
  const zero = minV < 0 ? `<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" class="zero"/>` : '';

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    ${grid}${zero}${bars}
    <polyline points="${netPts}" class="netline"/>${netDots}
  </svg>`;
  el.querySelectorAll('.mgroup').forEach((g) => {
    g.addEventListener('click', () => setRange({ preset: 'custom', from: g.dataset.month, to: g.dataset.month }));
  });
}

function renderCategories(v) {
  const cats = v.by_category || [];
  const maxCat = cats.length ? cats[0].spend : 1;
  document.getElementById('cats').innerHTML = cats.length ? cats.map((c) => `
    <div class="bar-row" data-cat="${esc(c.category)}" title="Show these transactions">
      <span class="bar-label">${esc(c.category)}</span>
      <span class="bar-track"><span class="bar-fill${c.category === 'fees' ? ' fee' : ''}" style="width:${Math.round((100 * c.spend) / maxCat)}%"></span></span>
      <span class="bar-val">${money(c.spend)} <em>${c.pct}%</em></span>
    </div>`).join('') : '<p class="hint">No spending in this range.</p>';
  document.querySelectorAll('#cats .bar-row').forEach((el) => el.addEventListener('click', () => {
    TXN_FILTERS = { month: '', account: '', category: el.dataset.cat, q: '' };
    switchView('txn'); // drill into the records behind this bar
  }));
}

function renderSubs(v) {
  const subs = (v.subscriptions || []).filter((s) => !s.essential);
  const bills = (v.subscriptions || []).filter((s) => s.essential && s.active !== false);
  const active = subs.filter((s) => s.active !== false);
  document.getElementById('subs').innerHTML = subs.length ? subs.map((s) => `
    <div class="sub-row${s.stopped ? ' stopped' : ''}">
      <span class="sub-name">${esc(s.merchant)}</span>
      <span class="sub-amt">${moneyExact(s.monthly)}/mo</span>
      <span class="sub-flags">${s.increased ? '<span class="flag up">↑ price up</span>' : ''}${s.stopped ? '<span class="flag stopped">⏸ stopped</span>' : ''}</span>
    </div>`).join('')
    : '<p class="hint">No recurring charges detected yet — import a few months for better detection.</p>';
  document.getElementById('bills').innerHTML = bills.length
    ? `<p class="hint bills-head">Recurring bills (not counted above)</p>` + bills.map((s) => `
      <div class="sub-row bill"><span class="sub-name">${esc(s.merchant)}</span><span class="sub-amt">${moneyExact(s.monthly)}/mo</span></div>`).join('')
    : '';
  const nudge = active.length
    ? `<p class="hint nudge">You're paying <b>${moneyExact(v.subscription_monthly_total)}/mo</b> across ${active.length} active subscription${active.length === 1 ? '' : 's'} — cancel any you don't use.</p>` : '';
  document.getElementById('bills').insertAdjacentHTML('beforeend', nudge);
}

// ── Collapsible report sections: persisted open/closed, one-line summaries ──
function wireSections() {
  document.querySelectorAll('.rpt-sec').forEach((sec) => {
    const id = sec.dataset.sec;
    let open = sec.dataset.open === '1';
    try { const s = localStorage.getItem(`cfo:sec:${id}`); if (s != null) open = s === '1'; } catch { /* ignore */ }
    sec.classList.toggle('closed', !open);
    sec.querySelector('.sec-h')?.addEventListener('click', () => {
      const closed = sec.classList.toggle('closed');
      try { localStorage.setItem(`cfo:sec:${id}`, closed ? '0' : '1'); } catch { /* ignore */ }
    });
  });
}
function setSecSum(id, text, alert) {
  const el = document.querySelector(`[data-sec="${id}"] .sec-sum`);
  if (el) { el.textContent = text || ''; el.classList.toggle('alert', !!alert); }
}

// ── Shared hover tooltip for [data-tip] elements (native title is too slow) ──
function wireTooltip() {
  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = esc(t.dataset.tip).replace(/\n/g, '<br>');
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + window.innerWidth - 280)}px`;
    tip.style.top = `${r.bottom + window.scrollY + 6}px`;
  });
}

function renderPayments(v) {
  const sec = document.querySelector('[data-sec="payments"]');
  const wrap = document.getElementById('payments-wrap');
  const sched = v.payment_schedule || [];
  sec.hidden = !sched.length;
  if (!sched.length) { wrap.innerHTML = ''; return; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = sched.map((p) => {
    let badge, cls;
    if (p.missed_in_data) {
      badge = `⚠ no payment seen around ${p.next_expected}`; cls = 'warn';
    } else if (p.next_expected && today >= p.next_expected && (!p.data_through || p.data_through < p.next_expected)) {
      badge = `◌ expected ~${p.next_expected} — import your latest statement to check`; cls = 'unknown';
    } else if (p.next_expected && today < p.next_expected) {
      badge = `⏳ next ~${p.next_expected}`; cls = 'ok';
    } else {
      badge = '✓ on track'; cls = 'ok';
    }
    return `<div class="pay-row ${cls}">
      <span class="pay-name">${esc(p.label)}</span>
      <span class="pay-last">✓ paid ${p.last_paid.date} (${moneyExact(p.last_paid.amount)})</span>
      <span class="pay-badge">${esc(badge)}</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="pays">${rows}</div>`;
  const missed = sched.find((p) => p.missed_in_data);
  setSecSum('payments', missed ? `⚠ ${missed.label}: payment not seen` : `${sched.length} card${sched.length === 1 ? '' : 's'} on pattern`, !!missed);
}

// ── Commitments view: detected obligations + user-entered terms + loan math ──
// Inputs persist to data/commitments.json (same path as category corrections);
// saveReport folds them into the agent's report. All math is page-side.
const KIND_OPTIONS = [
  ['loan:home', 'Home loan'], ['loan:auto', 'Car loan'], ['loan:student', 'Student loan'], ['loan', 'Other loan'],
  ['insurance:auto', 'Auto insurance'], ['insurance:home', 'Home insurance'], ['insurance:life', 'Life insurance'], ['insurance', 'Other insurance'],
  ['bill', 'Recurring bill'], ['sub', 'Subscription'],
];
const GROUP_META = [['debt', 'Debt'], ['insurance', 'Insurance'], ['bills', 'Recurring bills'], ['subs', 'Subscriptions']];
const hasTerms = (kind) => kind.startsWith('loan') || kind.startsWith('insurance');
const COMMIT_OPEN = new Map(); // key -> bool; rows with saved terms default open
const isOpen = (it) => (COMMIT_OPEN.has(it.key) ? COMMIT_OPEN.get(it.key) : !!COMMITMENTS[it.key]);
const addMonthsIso = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };

// Exact (fractional) remaining months from the closed form — the stress line
// must NOT use the ceiled months_left, or short horizons show a payment BELOW
// the current one (+$-44 style nonsense).
function exactMonthsLeft(balance, ratePct, payment) {
  const i = (Number(ratePct) || 0) / 100 / 12;
  if (!(balance > 0) || !(payment > 0)) return null;
  if (i <= 0) return balance / payment;
  if (payment <= balance * i) return null;
  return -Math.log(1 - (i * balance) / payment) / Math.log(1 + i);
}

function commitDerived(it) {
  const lines = [];
  if (it.payment_below_interest) {
    lines.push(`<span class="cm-bad">⚠ ${moneyExact(it.monthly)}/mo doesn't cover the interest on ${money(it.balance)} at ${it.rate_pct}% — the balance grows.</span>`);
  } else if (it.months_left != null) {
    lines.push(`Paid off ~<b>${addMonthsIso(it.last_date, it.months_left)}</b> (${it.months_left} payments, ${(it.months_left / 12).toFixed(1)} yr) · remaining interest <b>${money(it.interest_remaining)}</b>`);
  } else if (it.kind.startsWith('loan')) {
    lines.push('<span class="hint">Add the balance (and rate) to see payoff date, remaining interest, and prepayment savings.</span>');
  }
  if (it.renewal_date) {
    const days = Math.round((new Date(it.renewal_date) - new Date()) / 86400000);
    lines.push(days >= 0
      ? `Renews <b>${esc(it.renewal_date)}</b> — in ${days} day${days === 1 ? '' : 's'}${days <= 90 ? ' · <span class="cm-warn">time to shop around — ask the assistant for a draft</span>' : ''}`
      : `Renewal date <b>${esc(it.renewal_date)}</b> has passed — update it`);
  } else if (it.kind.startsWith('insurance')) {
    lines.push('<span class="hint">Add the renewal date to get a shop-around reminder before it auto-renews.</span>');
  }
  if (it.kind === 'loan:home' && it.rate_pct != null && it.balance > 0) {
    const n = exactMonthsLeft(it.balance, it.rate_pct, it.monthly);
    if (n != null) {
      const i = (it.rate_pct + 1) / 100 / 12;
      const p1 = (it.balance * i) / (1 - Math.pow(1 + i, -n));
      if (p1 > it.monthly) lines.push(`If your rate renews +1%: ~<b>${moneyExact(p1)}</b>/mo (+${moneyExact(p1 - it.monthly)})`);
    }
    if (MARKET) {
      const above = it.rate_pct > MARKET.rate;
      lines.push(`Market: <b>${MARKET.rate}%</b> ${esc(MARKET.label)} (${esc(MARKET.source)}, ${esc(MARKET.date)}) — your ${it.rate_pct}% is ${above ? '<span class="cm-warn">above the posted average — strong case to rate-shop</span>' : 'below the posted average (posted runs higher than negotiated)'}`);
    }
  }
  if (it.increased) lines.push(`<span class="cm-warn">↑ Price creep: ${moneyExact(it.first_amount)} → ${moneyExact(it.last_amount)} (+${moneyExact(it.increase_amount)}/mo since first seen)</span>`);
  return lines;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function termFields(it) {
  const u = COMMITMENTS[it.key] || {};
  const f = [];
  if (it.kind.startsWith('loan')) {
    f.push(`<label>Balance <input type="text" inputmode="numeric" class="cm-in" data-key="${esc(it.key)}" data-f="balance" value="${u.balance != null ? esc(money(u.balance)) : ''}" placeholder="e.g. ${esc(CURRENCY)}320,000"></label>`);
    f.push(`<label>Rate % <input type="number" class="cm-in" data-key="${esc(it.key)}" data-f="rate_pct" step="0.01" min="0" max="30" value="${u.rate_pct ?? ''}" placeholder="e.g. 4.79"></label>`);
  }
  if (it.kind.startsWith('insurance') || it.kind === 'loan:home') {
    // Month + year dropdowns — renewal day doesn't matter, and a native date
    // picker makes far-future years a chore to reach. Stored as YYYY-MM.
    const cur = (u.renewal_date || '').slice(0, 7);
    const [cy, cm] = cur ? [cur.slice(0, 4), cur.slice(5, 7)] : ['', ''];
    const y0 = new Date().getFullYear();
    const years = Array.from({ length: 9 }, (_, k) => String(y0 - 1 + k));
    if (cy && !years.includes(cy)) years.push(cy), years.sort();
    f.push(`<label>${it.kind === 'loan:home' ? 'Term renewal' : 'Renewal'}
      <select class="cm-ren" data-key="${esc(it.key)}" data-f="renewal_month"><option value="">month</option>${MONTH_NAMES.map((nm, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${v === cm ? 'selected' : ''}>${nm}</option>`; }).join('')}</select>
      <select class="cm-ren" data-key="${esc(it.key)}" data-f="renewal_year"><option value="">year</option>${years.map((y) => `<option ${y === cy ? 'selected' : ''}>${y}</option>`).join('')}</select>
    </label>`);
  }
  return f.length ? `<div class="cm-fields">${f.join('')}</div>` : '';
}

function sliderHtml(it) {
  if (it.months_left == null) return '';
  return `<div class="cm-slider">
    <label>Extra <b class="cm-extra">${CURRENCY}0</b>/mo</label>
    <input type="range" min="0" max="500" step="25" value="0" data-key="${esc(it.key)}">
    <span class="cm-slider-out hint">drag to see prepayment savings</span>
  </div>`;
}

function commitRow(it) {
  const open = isOpen(it) && hasTerms(it.kind);
  const flags = `${it.increased ? '<span class="flag up">↑ price up</span>' : ''}${!it.active ? '<span class="flag stopped">⏸ stopped</span>' : ''}`;
  const kindSel = `<select class="cat-sel cm-kind" data-key="${esc(it.key)}" title="Reclassify — your choice is remembered">${KIND_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === it.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const toggle = hasTerms(it.kind) ? `<button class="chip cm-toggle" data-key="${esc(it.key)}">${open ? 'Hide ▴' : 'Terms ▾'}</button>` : '';
  const derived = open ? commitDerived(it) : [];
  return `
  <div class="cm-row${it.active ? '' : ' stopped'}">
    <div class="cm-main">
      <span class="cm-name">${esc(it.merchant)}</span>
      <span class="cm-amt">${moneyExact(it.monthly)}/mo</span>
      <span class="cm-flags">${flags}</span>
      <span class="spacer"></span>
      ${kindSel}${toggle}
    </div>
    ${open ? `<div class="cm-terms">
      ${termFields(it)}
      ${derived.length ? `<div class="cm-derived">${derived.map((l) => `<div>${l}</div>`).join('')}</div>` : ''}
      ${sliderHtml(it)}
    </div>` : ''}
  </div>`;
}

function renderCommitView() {
  const head = document.getElementById('commit-head');
  const groupsEl = document.getElementById('commit-groups');
  if (!LEDGER.length) {
    head.innerHTML = '<p class="hint">Import a statement first — commitments are detected from your recurring charges.</p>';
    groupsEl.innerHTML = '';
    return;
  }
  const c = (FULL_VIEW && FULL_VIEW.commitments) || { items: [], monthly_total: 0, split: {}, pct_of_income: null };
  const items = c.items || [];
  head.innerHTML = `
    <div class="cm-summary">
      <span class="cm-total"><b>${moneyExact(c.monthly_total)}</b>/mo fixed</span>
      ${c.pct_of_income != null ? `<span class="cm-pct">${Math.round(c.pct_of_income)}% of income</span>` : ''}
      ${GROUP_META.filter(([g]) => c.split && c.split[g] > 0).map(([g, label]) => `<span class="chip cm-chip">${label} ${money(c.split[g])}/mo</span>`).join('')}
    </div>
    <p class="hint">Every fixed monthly obligation, detected from your statements. Add a balance, rate, or renewal date to unlock the payoff math — computed on this Mac, never by the AI. Want a rate-match or shop-around letter? Ask the assistant.</p>`;
  // Loans with full terms power the cross-loan strategy panel (≥2 — a single
  // loan already has its own prepayment slider on the row).
  const loans = items.filter((it) => it.group === 'debt' && it.active && it.balance > 0 && it.monthly > 0 && !it.payment_below_interest)
    .map((it) => ({ key: it.key, merchant: it.merchant, balance: it.balance, rate_pct: it.rate_pct || 0, payment: it.monthly }));
  groupsEl.innerHTML = items.length
    ? GROUP_META.map(([g, label]) => {
      const rows = items.filter((it) => it.group === g);
      if (!rows.length) return '';
      const strategy = g === 'debt' && loans.length >= 2 ? debtStrategyHtml() : '';
      return `<h2>${label}</h2>` + rows.map(commitRow).join('') + strategy;
    }).join('')
    : '<p class="hint">No recurring obligations detected yet — import a few months of statements so the monthly cadence shows.</p>';
  wireCommitEvents(Object.fromEntries(items.map((it) => [it.key, it])));
  if (loans.length >= 2) {
    const range = document.getElementById('ds-range');
    range?.addEventListener('input', () => {
      document.getElementById('ds-extra').textContent = `${CURRENCY}${range.value}`;
      renderDebtStrategy(loans, +range.value);
    });
    renderDebtStrategy(loans, 0);
    // The message carries the panel's CURRENT numbers — the agent can't see
    // the slider, so the ask itself grounds it with the exact figures.
    document.getElementById('ds-explain')?.addEventListener('click', () => {
      const d = DS_LAST;
      const msg = !d
        ? 'Explain my debt strategy.'
        : (() => {
          const ord = d.order.map((l) => `${l.merchant} (${l.rate_pct}%)`).join(', then ');
          return d.extra > 0
            ? `Explain my debt strategy with an extra ${CURRENCY}${d.extra}/mo: the page computed debt-free in ${(d.plan.months / 12).toFixed(1)} years with total interest ${money(d.plan.total_interest)} — saving ${money(d.saved)} vs each loan on its own — paying ${ord}. Why does this order win?`
            : `Explain my debt strategy: the page computed I'd save ${money(d.saved)} and be debt-free ${d.sooner} months sooner just by rolling freed payments forward, paying ${ord}. Walk me through why.`;
        })();
      try { chat?.send?.(msg); } catch { /* chat not mounted */ }
    });
  }
}

// ── Anomaly watch: deterministic "worth checking" list — double charges,
// fresh recurring charges, trial converts, bill spikes. Dismiss = persisted +
// removed from the agent's report.
function anomalyText(a) {
  switch (a.type) {
    case 'double_charge':
      return `<b>${esc(a.merchant)}</b> charged ${moneyExact(a.amount)} twice within days (${esc(a.prior_date)} and ${esc(a.date)}) — banks do make this error; worth a glance.`;
    case 'new_recurring':
      return `New recurring charge: <b>${esc(a.merchant)}</b> ${moneyExact(a.amount)}/mo since ${esc(a.date)} — intentional?`;
    case 'trial_charge':
      return `First charge from <b>${esc(a.merchant)}</b> (${moneyExact(a.amount)} on ${esc(a.date)}) — a free trial converting?`;
    case 'bill_spike':
      return `<b>${esc(a.merchant)}</b> hit ${moneyExact(a.amount)} on ${esc(a.date)} — usually ~${moneyExact(a.usual)}.`;
    default:
      return esc(a.merchant || '');
  }
}
const ANOM_ICON = { double_charge: '⚠', new_recurring: '🆕', trial_charge: '👀', bill_spike: '📈' };

function renderAnomalies(list) {
  const el = document.getElementById('anomalies');
  const items = (list || []).filter((a) => !ANOM_DISMISSED.has(a.id));
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h2>⚠ Worth checking <span class="hint inline">found by local checks — dismiss what's fine, or ask the assistant to draft a dispute</span></h2>
    <div class="anoms">${items.map((a) => `
      <div class="anom-row ${esc(a.type)}">
        <span class="anom-ic">${ANOM_ICON[a.type] || '•'}</span>
        <span class="anom-text">${anomalyText(a)}</span>
        <button class="anom-x" data-id="${esc(a.id)}" title="Dismiss — this one's fine">×</button>
      </div>`).join('')}</div>`;
  el.querySelectorAll('.anom-x').forEach((b) => b.addEventListener('click', async () => {
    ANOM_DISMISSED.add(b.dataset.id);
    await writeB64(`${DATA}/anomalies-dismissed.json`, JSON.stringify([...ANOM_DISMISSED]));
    renderAnomalies(FULL_VIEW && FULL_VIEW.anomalies);
    if (FULL_VIEW) await saveReport(FULL_VIEW); // agent stops seeing it too
  }));
}

// ── Debt strategy panel: all loans together, freed payments roll over, the
// extra budget targets the highest rate (avalanche). Pure what-if — nothing
// is stored; the agent gets the extra=0 snapshot via commitments.debt_strategy.
function debtStrategyHtml() {
  return `
  <div class="cm-row cm-strategy">
    <div class="cm-main">
      <span class="cm-name">⚖ Debt strategy</span>
      <span class="hint inline">all loans together — freed payments roll into the next loan</span>
      <span class="spacer"></span>
      <button class="chip" id="ds-explain" title="Ask the assistant to walk through this plan">✦ Explain</button>
    </div>
    <div class="cm-terms">
      <div class="cm-slider">
        <label>Extra <b id="ds-extra">${CURRENCY}0</b>/mo across all debt</label>
        <input type="range" id="ds-range" min="0" max="1000" step="25" value="0">
      </div>
      <div class="cm-derived" id="ds-out"></div>
    </div>
  </div>`;
}

let DS_LAST = null; // latest panel computation — the ✦ Explain button quotes it

function renderDebtStrategy(loans, extra) {
  const out = document.getElementById('ds-out');
  if (!out) return;
  const today = new Date().toISOString().slice(0, 10);
  const ind = loans.map((l) => amortize(l.balance, l.rate_pct, l.payment)).filter((a) => a && !a.underwater);
  const asIsInterest = ind.reduce((s, a) => s + a.total_interest, 0);
  const asIsMonths = Math.max(...ind.map((a) => a.months));
  const plan = debtPlan(loans, extra, 'avalanche');
  if (!plan || plan.diverges) {
    DS_LAST = null;
    out.innerHTML = '<span class="cm-bad">⚠ Payments don\'t cover the interest — this plan never closes.</span>';
    return;
  }
  DS_LAST = {
    extra, plan,
    saved: asIsInterest - plan.total_interest,
    sooner: asIsMonths - plan.months,
    order: [...loans].sort((a, b) => b.rate_pct - a.rate_pct),
  };
  const lines = [];
  lines.push(`Debt-free ~<b>${addMonthsIso(today, plan.months)}</b> (${(plan.months / 12).toFixed(1)} yr) · total interest <b>${money(plan.total_interest)}</b>`);
  const saved = asIsInterest - plan.total_interest;
  const sooner = asIsMonths - plan.months;
  if (saved > 0.5 || sooner > 0) {
    lines.push(`vs each loan on its own: save <b class="cm-good">${money(saved)}</b> interest, debt-free <b>${sooner}</b> mo sooner${extra > 0 ? '' : ' — just from rolling freed payments forward'}`);
  }
  lines.push(`Order: ${[...loans].sort((a, b) => b.rate_pct - a.rate_pct).map((l) => `<b>${esc(l.merchant)}</b> (${l.rate_pct}%)`).join(' → ')} — highest rate first`);
  if (extra > 0 && new Set(loans.map((l) => l.rate_pct)).size > 1) {
    const wrong = debtPlan(loans, extra, 'lowest');
    if (wrong && !wrong.diverges) {
      const d = wrong.total_interest - plan.total_interest;
      if (d > 0.5) lines.push(`<span class="cm-warn">Putting the extra on the lowest rate instead would cost ${money(d)} more</span>`);
    }
  }
  out.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
}

function wireCommitEvents(byKey) {
  document.querySelectorAll('.cm-toggle').forEach((b) => b.addEventListener('click', () => {
    COMMIT_OPEN.set(b.dataset.key, !isOpen(byKey[b.dataset.key]));
    renderCommitView();
  }));
  document.querySelectorAll('.cm-kind').forEach((sel) => sel.addEventListener('change', () => saveCommitment(sel.dataset.key, { kind: sel.value })));
  document.querySelectorAll('.cm-in').forEach((inp) => inp.addEventListener('change', () => saveCommitment(inp.dataset.key, { [inp.dataset.f]: inp.value })));
  // Renewal month + year compose one stored YYYY-MM value; either empty clears it.
  document.querySelectorAll('.cm-ren').forEach((sel) => sel.addEventListener('change', () => {
    const lab = sel.closest('label');
    const m = lab.querySelector('[data-f=renewal_month]').value;
    const y = lab.querySelector('[data-f=renewal_year]').value;
    saveCommitment(sel.dataset.key, { renewal_date: m && y ? `${y}-${m}` : '' });
  }));
  document.querySelectorAll('.cm-slider input[type=range]').forEach((r) => r.addEventListener('input', () => {
    const it = byKey[r.dataset.key];
    const wrap = r.closest('.cm-slider');
    const extra = +r.value;
    wrap.querySelector('.cm-extra').textContent = `${CURRENCY}${extra}`;
    const out = wrap.querySelector('.cm-slider-out');
    if (!extra) { out.textContent = 'drag to see prepayment savings'; return; }
    const am = amortize(it.balance, it.rate_pct || 0, it.monthly + extra);
    if (!am || am.months == null) { out.textContent = '—'; return; }
    const saved = (it.interest_remaining || 0) - (am.total_interest || 0);
    const sooner = (it.months_left || 0) - am.months;
    out.innerHTML = `save <b>${money(saved)}</b> interest · paid off <b>${sooner}</b> mo sooner`;
  }));
}

async function saveCommitment(key, patch) {
  const next = { ...(COMMITMENTS[key] || {}), ...patch };
  for (const k of Object.keys(next)) {
    if (next[k] === '' || next[k] == null) { delete next[k]; continue; }
    if (k === 'balance' || k === 'rate_pct') {
      // Balance arrives money-formatted ("$320,000") — strip to the number.
      const n = Number(String(next[k]).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(n) && n > 0) next[k] = n; else delete next[k];
    }
  }
  if (Object.keys(next).length) { COMMITMENTS[key] = next; COMMIT_OPEN.set(key, true); }
  else delete COMMITMENTS[key];
  await saveCommitmentsFile();
  await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts())); // agent sees terms + kind overrides
  refreshView(); // FULL_VIEW + headline card + (when active) this view
}


// ── Dynamic section: agent-owned insights via PageUpdate ──
// Schema (SKILL.md): PageUpdate { insights: [{title, body, tone?}], replace? }
function mdLite(s) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
// Severity levels: alert (act now) > warn (leak/hike) > info > good (wins).
const TONE_RANK = { alert: 0, warn: 1, info: 2, good: 3 };
function normalizeTone(t) {
  const s = String(t || 'info').toLowerCase();
  if (['alert', 'error', 'critical', 'danger', 'urgent'].includes(s)) return 'alert';
  if (['warn', 'warning', 'caution'].includes(s)) return 'warn';
  if (['good', 'success', 'ok', 'positive', 'win'].includes(s)) return 'good';
  return 'info';
}

function renderInsights() {
  applyVisibility();
  const el = document.getElementById('insights');
  const ordered = INSIGHTS.map((c, i) => ({ c, i }))
    .sort((a, b) => (TONE_RANK[a.c.tone] ?? 2) - (TONE_RANK[b.c.tone] ?? 2) || a.i - b.i);
  el.innerHTML = INSIGHTS.length ? ordered.map(({ c, i }) => `
    <div class="insight ${esc(c.tone || 'info')}">
      <div class="insight-head">
        <span class="lvl ${esc(c.tone || 'info')}">${esc((c.tone || 'info').toUpperCase())}</span>
        <span class="insight-title">${esc(c.title || '')}</span>
        <button class="insight-x" data-i="${i}" title="Dismiss this card">×</button>
      </div>
      <div class="insight-body">${mdLite(c.body || '')}</div>
    </div>`).join('')
    : '<p class="hint">Nothing yet — hit <b>✦ Run review</b> or ask the assistant a question, and its findings land here.</p>';
  el.querySelectorAll('.insight-x').forEach((b) => b.addEventListener('click', () => {
    INSIGHTS.splice(+b.dataset.i, 1);
    renderInsights();
    saveInsights().catch(() => {});
  }));
}
// Models wrap tool args unpredictably — the live failure was
// {body:[{insights:[...]}]}. Find the card list wherever it was nested.
function extractInsights(node, depth = 0) {
  if (!node || depth > 4) return null;
  if (typeof node === 'string') return node.trim() ? [{ title: 'Note', body: node }] : null;
  if (Array.isArray(node)) {
    if (node.length && node.every((c) => c && typeof c === 'object' && (c.title || c.body))) return node;
    for (const v of node) { const r = extractInsights(v, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.insights)) return node.insights;
    if (node.insight && typeof node.insight === 'object') return [node.insight];
    for (const k of ['body', 'body_patch', 'cards', 'content']) {
      if (node[k] != null && typeof node[k] !== 'string') {
        const r = extractInsights(node[k], depth + 1);
        if (r) return r;
      }
    }
    if (node.title || typeof node.body === 'string') return [node];
  }
  return null;
}

let lastPageUpdateRaw = null; // streaming phases can deliver the same args twice
function applyPageUpdate(args) {
  const raw = JSON.stringify(args || null);
  if (!args || raw === lastPageUpdateRaw) return;
  // The agent-teacher replies through the same PageUpdate channel but with a
  // `suggestions` body — route it to the Review card, not the insights region.
  // Models wrap args unpredictably, so search recursively (like extractInsights).
  const sugg = extractSuggestions(args);
  if (sugg) { lastPageUpdateRaw = raw; applySuggestions(sugg); return; }
  const cards = extractInsights(args);
  if (!cards) { console.warn('[cfo] PageUpdate args not recognized', args); return; }
  lastPageUpdateRaw = raw;
  // `replace` may ride at the top level or inside the engine's body wrapper.
  const replace = !!(args.replace || args.body?.replace || args.body_patch?.replace);
  if (replace) INSIGHTS = [];
  const seen = new Set(INSIGHTS.map((c) => `${c.title}|${c.body}`));
  for (const c of cards) {
    if (!c || (!c.title && !c.body)) continue;
    const key = `${String(c.title || '')}|${String(c.body || '')}`;
    if (seen.has(key)) continue; // a failed-then-retried tool call delivers twice
    seen.add(key);
    INSIGHTS.push({ title: String(c.title || ''), body: String(c.body || ''), tone: normalizeTone(c.tone), at: new Date().toISOString() });
  }
  renderInsights();
  saveInsights().catch((e) => console.warn('[cfo] insights save', e));
}

// ── Agent-teacher: the "Review N suggestions" card ──
// The agent proposes merchant -> classification rules for the uncategorized
// residual. We VALIDATE every proposal against the real ledger before showing
// it — the model can only confirm rows that exist, never invent merchants or
// move money on its own. Approving writes a deterministic rule (applyRule), so
// the agent's judgement is captured once and never re-run.
const loadSuggestions = () => readJson(`${DATA}/suggestions.json`, []);
const saveSuggestions = () => writeB64(`${DATA}/suggestions.json`, JSON.stringify(SUGGESTIONS));

// Find the suggestions array wherever the model nested it (body, body_patch, …).
function extractSuggestions(node, depth = 0) {
  if (!node || depth > 5 || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    if (node.length && node.every((s) => s && typeof s === 'object' && typeof s.merchant === 'string')) return node;
    for (const v of node) { const r = extractSuggestions(v, depth + 1); if (r) return r; }
    return null;
  }
  if (Array.isArray(node.suggestions)) return node.suggestions;
  for (const k of ['body', 'body_patch', 'content', 'cards', 'data']) {
    if (node[k] != null && typeof node[k] === 'object') { const r = extractSuggestions(node[k], depth + 1); if (r) return r; }
  }
  return null;
}

async function applySuggestions(list) {
  // Resolve each proposed merchant to the EXACT ledger string. Models paraphrase
  // (en-dash vs hyphen, spacing, truncation), so normalize, then accept an
  // unambiguous substring match. A proposal that maps to no real row is dropped
  // (anti-hallucination) and the rule is keyed on the canonical ledger string.
  const norm = (s) => String(s || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();
  const byNorm = new Map();
  for (const r of LEDGER) if (!byNorm.has(norm(r.merchant))) byNorm.set(norm(r.merchant), r.merchant);
  const ledgerNorms = [...byNorm.keys()];
  const resolve = (m) => {
    const n = norm(m);
    if (byNorm.has(n)) return byNorm.get(n);
    const hits = ledgerNorms.filter((ln) => n.length >= 6 && (ln.includes(n) || n.includes(ln)));
    return hits.length === 1 ? byNorm.get(hits[0]) : null;
  };
  const cats = new Set(knownCategories());
  const ovKeys = Object.keys(CATEGORY_OVERRIDES || {});
  const okType = (t, isNew) => t === 'transfer' || t === 'income' || cats.has(t)
    || (isNew && /^[a-z][a-z0-9 &-]{1,23}$/.test(t));
  const out = [], seen = new Set();
  for (const s of list || []) {
    if (!s || typeof s.merchant !== 'string') continue;
    const merchant = resolve(s.merchant);                     // canonical ledger string, or null
    const type = String(s.type || '').trim().toLowerCase();
    if (!merchant) continue;                                  // must map to a real row
    const key = merchant.toLowerCase();
    if (seen.has(key)) continue;
    if (!okType(type, s.isNew)) continue;                     // known category / transfer / income / new slug
    if (ovKeys.some((k) => key.includes(k))) continue;        // already has a rule
    seen.add(key);
    out.push({ merchant, type, isNew: !!s.isNew, reason: String(s.reason || '').slice(0, 120) });
  }
  if (!out.length) { console.warn('[cfo] suggestions: none of', (list || []).length, 'validated'); return; }
  // Stakes-split: a category re-buckets spend but leaves the TOTAL unchanged, so
  // auto-apply it (still reversible in the row combobox). 'transfer'/'income'
  // change spend & income, so they stay in the card for an explicit tap.
  const autoCats = out.filter((s) => s.type !== 'transfer' && s.type !== 'income');
  SUGGESTIONS = out.filter((s) => s.type === 'transfer' || s.type === 'income');
  LAST_AUTO_APPLIED = autoCats.length;
  saveSuggestions().catch((e) => console.warn('[cfo] suggestions save', e));
  if (autoCats.length) {
    for (const s of autoCats) await applyRuleByMerchant(s.merchant, s.type, false);
    await afterCategoriesChanged(); // single recompute; also re-renders the card
  } else {
    renderSuggestions();
  }
}

function renderSuggestions() {
  const el = document.getElementById('suggestions-wrap');
  if (!el) return;
  const n = SUGGESTIONS.length;
  el.hidden = VIEW_MODE !== 'report' || (!n && !LAST_AUTO_APPLIED);
  if (el.hidden) { el.innerHTML = ''; return; }
  // Two states: things that need a tap (transfers/income that move totals) and a
  // note for the categories CFO already auto-applied (they didn't move totals).
  const autoNote = LAST_AUTO_APPLIED
    ? `<span class="hint">✓ auto-sorted ${LAST_AUTO_APPLIED} into categories — change any in Transactions</span>` : '';
  const title = n
    ? `✦ ${n} to confirm <span class="sugg-sub">— affects spend/income</span>`
    : `✓ Auto-sorted ${LAST_AUTO_APPLIED} transaction${LAST_AUTO_APPLIED === 1 ? '' : 's'}`;
  const bulk = n
    ? `<button class="chip" id="sugg-apply-all">Apply all</button><button class="chip ghost" id="sugg-dismiss-all">Dismiss all</button>`
    : `<button class="chip ghost" id="sugg-dismiss-all">Dismiss</button>`;
  el.innerHTML = `
    <div class="sugg-card">
      <div class="sugg-head">
        <span class="sugg-title">${title}</span>
        ${autoNote}
        <span class="sugg-bulk">${bulk}</span>
      </div>
      ${n ? `<ul class="sugg-list">${SUGGESTIONS.map((s, i) => `
        <li>
          <span class="sugg-merch" title="${esc(s.merchant)}">${esc(s.merchant)}</span>
          <span class="sugg-arrow">→</span>
          <span class="tag sugg-type special">${esc(s.type)}</span>
          ${s.reason ? `<span class="sugg-reason" title="${esc(s.reason)}">${esc(s.reason)}</span>` : ''}
          <span class="sugg-row-actions"><button class="chip apply" data-i="${i}">Apply</button><button class="chip ghost dismiss" data-i="${i}" title="Dismiss">✕</button></span>
        </li>`).join('')}</ul>` : ''}
    </div>`;
  const dismissNote = () => { SUGGESTIONS = []; LAST_AUTO_APPLIED = 0; saveSuggestions().catch(() => {}); renderSuggestions(); };
  if (n) {
    el.querySelector('#sugg-apply-all').onclick = () => applyAllSuggestions();
    el.querySelector('#sugg-dismiss-all').onclick = dismissNote;
    el.querySelectorAll('.sugg-list .apply').forEach((b) => b.addEventListener('click', () => applyOneSuggestion(+b.dataset.i)));
    el.querySelectorAll('.sugg-list .dismiss').forEach((b) => b.addEventListener('click', () => {
      SUGGESTIONS.splice(+b.dataset.i, 1); if (!SUGGESTIONS.length) LAST_AUTO_APPLIED = 0; saveSuggestions().catch(() => {}); renderSuggestions();
    }));
  } else {
    el.querySelector('#sugg-dismiss-all').onclick = dismissNote;
  }
}

async function applyOneSuggestion(i) {
  const s = SUGGESTIONS[i]; if (!s) return;
  SUGGESTIONS.splice(i, 1);
  if (!SUGGESTIONS.length) LAST_AUTO_APPLIED = 0; // batch fully handled
  await saveSuggestions().catch(() => {});
  await applyRuleByMerchant(s.merchant, s.type); // recomputes + re-renders the report
  renderSuggestions();
}

async function applyAllSuggestions() {
  const list = SUGGESTIONS.slice();
  SUGGESTIONS = [];
  LAST_AUTO_APPLIED = 0;
  await saveSuggestions().catch(() => {});
  for (const s of list) await applyRuleByMerchant(s.merchant, s.type, false);
  await afterCategoriesChanged(); // single recompute for the whole batch
  renderSuggestions();
}

// ── Chat session ──
// Import one or many files (picker multi-select OR drag-and-drop of several).
// Sequential so each account prompt resolves before the next file.
async function handleImport(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const results = [];
  for (let i = 0; i < list.length; i++) {
    setStatus(list.length > 1 ? `Importing ${i + 1}/${list.length}: ${list[i].name}…` : 'Analyzing… (stays on your Mac)');
    try {
      results.push(await importFile(list[i], i, list.length));
    } catch (e) {
      results.push({ file: list[i].name, error: e.message });
      setStatus(`Error in ${list[i].name}: ${e.message}`, true);
      console.error('[cfo] import failed', list[i].name, e);
    }
  }
  announceImport(results);
}

// The assistant acknowledges every import batch — composed HERE from the real
// numbers and spoken via addMessage (no LLM call: instant, free, can't misquote).
// The model itself only runs when the user actually asks for something.
function announceImport(results) {
  const ok = results.filter((r) => r && r.added != null);
  if (!ok.length) return; // nothing landed — errors/skips are on the status line
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const newTotal = ok.reduce((a, r) => a + r.added, 0);
  const dupTotal = ok.reduce((a, r) => a + r.dup, 0);
  const labels = [...new Set(ok.map((r) => r.label))];

  // Everything was already on file — say so plainly instead of staying mute.
  if (newTotal === 0) {
    const what = ok.length === 1 ? ok[0].file : plural(ok.length, 'statement');
    try { chat?.addMessage?.('assistant', `Nothing new — ${what} is already fully on file (${plural(dupTotal, 'duplicate')} skipped, dedup did its job). Your report is unchanged.`); } catch { /* ignore */ }
    return;
  }

  let msg = ok.length === 1
    ? `Nice — imported ${ok[0].file}: ${plural(ok[0].added, 'new transaction')} on ${ok[0].label}${ok[0].dup ? ` (${ok[0].dup} already on file)` : ''}.`
    : `Nice — imported ${plural(ok.length, 'statement')}: ${plural(newTotal, 'new transaction')} across ${labels.join(', ')}${dupTotal ? ` (${dupTotal} already on file)` : ''}.`;
  const skipped = results.filter((r) => r && r.skipped);
  if (skipped.length) msg += ` I skipped ${skipped.map((s) => s.file).join(', ')} — no account was chosen.`;
  const errs = results.filter((r) => r && r.error);
  if (errs.length) msg += ` ${errs.map((e) => e.file).join(', ')} couldn't be read.`;

  // One deterministic heads-up, straight from the recomputed report.
  if (LAST_VIEW) {
    const hike = (LAST_VIEW.subscriptions || []).find((s) => s.active && !s.essential && s.increased);
    const missed = (LAST_VIEW.payment_schedule || []).find((p) => p.missed_in_data);
    if (hike) msg += `\n\nHeads-up: ${hike.merchant} went up ${moneyExact(hike.first_amount)} → ${moneyExact(hike.last_amount)} (+${moneyExact(hike.increase_amount)}/mo).`;
    else if (missed) msg += `\n\n⚠ ${missed.label}: I'd expect a payment around ${missed.next_expected}, but it isn't in your data yet.`;
  }
  // Proactive tier 2: new data is the one moment insights actually change.
  // If the import left transactions CFO couldn't categorize, the agent-teacher
  // goes first — it proposes rules for the residual, which the user approves in
  // the Review card. A clean import skips straight to the full review.
  if (autoReviewOn()) {
    const residual = computeResidual();
    if (residual.length) {
      msg += `\n\nCharts are updated. I spotted ${plural(residual.length, 'merchant')} I couldn't categorize — sorting them now for your review…`;
      try { chat?.addMessage?.('assistant', msg); } catch { /* chat not mounted */ }
      setTimeout(() => { try { chat?.send?.(CLASSIFY_PROMPT); } catch { /* ignore */ } }, 600);
      return;
    }
    msg += `\n\nCharts are updated — running your full review now…`;
    try { chat?.addMessage?.('assistant', msg); } catch { /* chat not mounted */ }
    setTimeout(() => { try { chat?.send?.('Run my financial review.'); } catch { /* ignore */ } }, 600);
    return;
  }
  msg += `\n\nCharts are updated — take a look. Want a financial review? Hit ✦ Run review or just ask.`;
  try { chat?.addMessage?.('assistant', msg); } catch { /* chat not mounted */ }
  offerUndo(ok);
}

// Inline undo affordance in the status line for the just-completed import(s) —
// the immediate-regret path. The full history lives on the Transactions tab.
function offerUndo(ok) {
  const ids = ok.map((r) => r.importId).filter(Boolean);
  if (!ids.length) return;
  const el = document.getElementById('status');
  const a = document.createElement('a');
  a.href = '#'; a.className = 'undo-link'; a.textContent = ids.length > 1 ? '  Undo all' : '  Undo';
  a.onclick = async (e) => {
    e.preventDefault();
    a.remove();
    for (const id of ids) await undoImport(id);
  };
  el.appendChild(a);
}

const autoReviewOn = () => { try { return localStorage.getItem('cfo:auto-review') !== '0'; } catch { return true; } };

// ── On-open reminders (deterministic, no LLM, no mission needed) ──
// Checks run against the freshly computed view when the page opens; each
// distinct reminder fires ONCE per expected date / stale state (localStorage).
function openReminders() {
  if (!LAST_VIEW || !LEDGER.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = (iso) => Math.round((new Date(iso) - new Date(today)) / 86400000);
  const once = (key) => {
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, '1');
      return true;
    } catch { return true; }
  };
  const lines = [];
  for (const p of LAST_VIEW.payment_schedule || []) {
    if (!p.next_expected) continue;
    if (p.missed_in_data) {
      if (once(`cfo:rem3:miss:${p.account}:${p.next_expected}`)) lines.push(`⚠ ${p.label} — I'd expect a payment around ${p.next_expected}, but none shows in your data. Worth checking you didn't miss it.`);
    } else {
      const d = daysUntil(p.next_expected);
      if (d >= 0 && d <= 3 && once(`cfo:rem3:due:${p.account}:${p.next_expected}`)) {
        lines.push(`⏳ ${p.label} — you usually pay around ${p.next_expected} (${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}). Pattern-based, not an official due date.`);
      }
    }
  }
  const newest = LEDGER.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  if (newest && daysUntil(newest) <= -35 && once(`cfo:rem3:stale:${newest}`)) {
    lines.push(`📥 Your newest data is from ${newest} — drag in fresh statements and I'll re-check everything.`);
  }
  if (lines.length) {
    const text = `Quick check while you were away:\n\n${lines.join('\n\n')}`;
    setTimeout(() => { try { chat?.addMessage?.('assistant', text); } catch { /* ignore */ } }, 1200);
  }
}

// Resume a recent chat: if the latest cfo session had activity within 24h,
// reattach to it; otherwise mint a fresh one. The report is independent of this.
async function recentSessionId() {
  try {
    const sessions = await listSkillSessions(SKILL);
    if (!sessions.length) return null;
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const ageHours = (Date.now() / 1000 - (sessions[0].created_at || 0)) / 3600;
    return ageHours < 24 ? sessions[0].id : null;
  } catch { return null; }
}

async function mountChat(sessionId) {
  try {
    chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
      skillName: SKILL, agentId: 'ling', modelId: MODEL_ID, title: 'CFO',
      sessionId: sessionId || undefined,
      onStreamToken: () => { chatActivity = true; },
      onContentBlock: (payload) => {
        chatActivity = true;
        if (payload?.tool === 'PageUpdate' && payload?.args) {
          try {
            const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
            applyPageUpdate(args);
          } catch (e) { console.warn('[cfo] PageUpdate parse', e); }
        }
      },
    });
  } catch (e) { console.error('[cfo] chat mount failed', e); }
}

// Fresh sessions get a HIDDEN trigger message (pulse/sys-doctor pattern) — the
// agent's actual opening is scripted in SKILL.md § 0. Greeting. One LLM turn
// per new session; resumed sessions stay silent.
const GREETING_TRIGGER = 'The user just opened the CFO app (this message is hidden from them). Greet them now, following the "0. Greeting" section of your instructions.';
let chatActivity = false; // any stream/content event from the embed iframe

// The embed needs its message listener + WebRTC channel up before it can accept
// a posted message — an immediate post-mount send is silently lost. Send after a
// grace delay, then retry ONCE iff the chat has shown no activity at all.
function triggerGreeting() {
  chatActivity = false;
  const send = () => { try { chat?.sendHidden?.(GREETING_TRIGGER); } catch { /* ignore */ } };
  setTimeout(send, 1500);
  setTimeout(() => { if (!chatActivity) send(); }, 8000);
}

async function newChat() {
  try { chat?.destroy?.(); } catch { /* ignore */ }
  await mountChat(null); // fresh session — report (left pane) is untouched
  triggerGreeting();
}

function showHelp() {
  const root = document.getElementById('modal');
  root.hidden = false;
  root.innerHTML = `
    <div class="modal-card">
      <h3>Personal CFO</h3>
      <ol class="help-steps">
        <li><b>Export</b> a statement from your bank's website (CSV or PDF).</li>
        <li><b>Import</b> it here — drag &amp; drop anywhere on the page, or click <b>Import statement</b>.</li>
        <li><b>View &amp; ask</b> — the report builds itself; ask the assistant <i>"why was spend higher last month?"</i> or <i>"run my financial review"</i>.</li>
      </ol>
      <p class="hint">🔒 All your data is local-only — statements never leave this Mac, and account numbers are stripped before the AI sees even the redacted totals.</p>
      <div class="modal-actions"><button id="intro-ok" class="btn">Got it</button></div>
    </div>`;
  root.querySelector('#intro-ok').onclick = () => { root.hidden = true; root.innerHTML = ''; };
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig(); // currency + category overrides, before the first import

  // App mode: per-skill override (localStorage 'cfo:model') or the built-in
  // cloud default. Core mode: empty → the engine uses the user's global default.
  try { MODEL_ID = APP_MODE ? (localStorage.getItem('cfo:model') || 'deepseek-v4-flash') : ''; } catch { /* ignore */ }

  await resumeState();                  // land on the existing financial picture
  loadMarketRate();                     // background; re-renders/saves when it lands
  const sid = await recentSessionId();
  await mountChat(sid);                 // resume <24h chat, else fresh
  if (!sid) triggerGreeting();
  openReminders();                      // payment/staleness checks, once per state

  wireSections();
  wireTooltip();
  document.getElementById('new-chat')?.addEventListener('click', newChat);
  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  document.getElementById('help-btn')?.addEventListener('click', showHelp);

  // Currency: code shown + switchable (CAD vs USD vs CNY…); persists to config.
  const curSel = document.getElementById('currency-sel');
  if (curSel) {
    const codes = CURRENCY_CODES.includes(CURRENCY_CODE) ? CURRENCY_CODES : [CURRENCY_CODE, ...CURRENCY_CODES];
    curSel.innerHTML = codes.map((c) => `<option ${c === CURRENCY_CODE ? 'selected' : ''}>${c}</option>`).join('');
    curSel.addEventListener('change', async () => {
      CURRENCY_CODE = curSel.value;
      CURRENCY = currencySymbol(CURRENCY_CODE);
      const CONF = `$HOME/.linggen/skills/${SKILL}/config.json`;
      const cfg = await readJson(CONF, {});
      cfg.currency = CURRENCY_CODE;
      await writeB64(CONF, JSON.stringify(cfg, null, 2));
      loadMarketRate(); // benchmark is per-currency; nulls now, refills async
      refreshView();
      if (VIEW_MODE === 'txn') renderTxnView();
    });
  }

  // First visit: show the help once, then stay out of the way.
  try {
    if (!localStorage.getItem('cfo:help-seen')) {
      localStorage.setItem('cfo:help-seen', '1');
      showHelp();
    }
  } catch { /* ignore */ }
  const arT = document.getElementById('auto-review-toggle');
  if (arT) {
    arT.checked = autoReviewOn();
    arT.addEventListener('change', () => { try { localStorage.setItem('cfo:auto-review', arT.checked ? '1' : '0'); } catch { /* ignore */ } });
  }
  document.getElementById('insights-clear')?.addEventListener('click', () => {
    INSIGHTS = [];
    renderInsights();
    saveInsights().catch(() => {});
  });
  document.getElementById('run-review')?.addEventListener('click', () => {
    if (!LEDGER.length) { setStatus('Import a statement first — the review needs data.'); return; }
    chat?.send?.('Run my financial review.');
  });

  // The custom-range popover dismisses on click-outside or Escape.
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('range-pop');
    if (!pop || pop.hidden) return;
    if (!pop.contains(e.target) && e.target.id !== 'range-custom') pop.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const pop = document.getElementById('range-pop'); if (pop) pop.hidden = true; }
  });

  const input = document.getElementById('file-input');
  input.addEventListener('change', () => { handleImport(input.files); input.value = ''; });

  // ── Chat panel resizer: drag the divider; width persists; dbl-click resets.
  const app = document.getElementById('app');
  const rz = document.getElementById('pane-resizer');
  const clampW = (w) => Math.min(Math.max(w, 280), Math.round(window.innerWidth * 0.6));
  const applyChatW = (w) => { app.style.gridTemplateColumns = `1fr 6px ${w}px`; };
  let chatW = 380;
  try { chatW = clampW(+localStorage.getItem('cfo:chat-width') || 380); } catch { /* ignore */ }
  applyChatW(chatW);
  rz?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rz.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => { chatW = clampW(window.innerWidth - ev.clientX - 3); applyChatW(chatW); };
    const up = () => {
      document.body.classList.remove('resizing');
      rz.removeEventListener('pointermove', move);
      rz.removeEventListener('pointerup', up);
      try { localStorage.setItem('cfo:chat-width', String(Math.round(chatW))); } catch { /* ignore */ }
    };
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', up);
  });
  rz?.addEventListener('dblclick', () => {
    chatW = 380;
    applyChatW(chatW);
    try { localStorage.setItem('cfo:chat-width', '380'); } catch { /* ignore */ }
  });

  const pane = document.getElementById('report-pane');
  pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('drag'); });
  pane.addEventListener('dragleave', () => pane.classList.remove('drag'));
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    pane.classList.remove('drag');
    handleImport(e.dataTransfer.files);
  });
});
