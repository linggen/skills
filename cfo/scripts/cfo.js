// CFO orchestrator. The page is split in two:
//   FIXED   — everything numeric (cards, charts, lists), rendered HERE from the
//             ledger. Deterministic, free, private; the agent cannot touch it.
//   DYNAMIC — the #insights region, updated ONLY by the agent via PageUpdate
//             (month narratives, goal cards, drafts). See SKILL.md schema.
// Statements are parsed + redacted in-browser; raw files never reach the model.
import './chat-bridge.js'; // sets window.LinggenUI
import { listSkillSessions } from './api.js';
import { analyzeCsv, orientTransactions, categorize } from './analyze.js';
import { toLedgerRows, mergeLedger, reportFromLedger, viewFromLedger, detectTransfers } from './ledger.js';
import { hashId } from './hash.js';

const SKILL = 'cfo';
const DATA = `$HOME/.linggen/skills/${SKILL}/data`; // $HOME stays literal for bash
let chat = null;
let MODEL_ID = 'deepseek-chat';

// Page state: full ledger + accounts in memory; RANGE drives the fixed view.
let LEDGER = [];
let ACCOUNTS = {};
let RANGE = { preset: '12M', from: null, to: null };
let INSIGHTS = [];
let LAST_VIEW = null; // most recent computed view — read by announceImport

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
let CATEGORY_OVERRIDES = null;
const currencySymbol = (code) => ({ USD: '$', CAD: '$', AUD: '$', GBP: '£', EUR: '€', JPY: '¥' }[(code || '').toUpperCase()] || '$');
const money = (n) => `${CURRENCY}${Math.round(Number(n) || 0).toLocaleString()}`;
// Subscription amounts are small and cents-meaningful ($16.49 → $18.99 is the
// whole story of a price hike) — exact for those, whole dollars elsewhere.
const moneyExact = (n) => `${CURRENCY}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const analyzeOpts = () => ({ categoryOverrides: CATEGORY_OVERRIDES });

async function loadConfig() {
  try {
    const out = await runBash(`cat "$HOME/.linggen/skills/${SKILL}/config.json" 2>/dev/null || true`);
    const cfg = out.trim() ? JSON.parse(out) : {};
    CURRENCY = currencySymbol(cfg.currency);
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
const saveReport = (r) => writeB64(`${DATA}/report.json`, JSON.stringify(trimForAgent(r)));

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
      accountId: match || (Object.keys(ACCOUNTS).length ? null : '__new__'),
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
  detectTransfers(LEDGER, ACCOUNTS);
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
    const cat = effCategory(r);
    const catCell = r.transfer ? '<span class="tag">⇄ transfer</span>'
      : r.amount >= 0 ? '<span class="tag">income</span>'
        : `<select class="cat-sel" data-id="${esc(r.id)}">${cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new__">✚ New category…</option></select>`;
    return `<tr><td>${esc(r.date || '—')}</td><td class="m">${esc(r.merchant)}</td><td>${esc(ACCOUNTS[r.account]?.label || r.account)}</td><td class="num ${r.amount < 0 ? 'neg' : 'pos'}">${r.amount < 0 ? '−' : '+'}${moneyExact(Math.abs(r.amount))}</td><td>${catCell}</td></tr>`;
  }).join('')}</tbody></table>` : '<p class="hint">No matching transactions.</p>';

  document.querySelectorAll('#txn-table .cat-sel').forEach((sel) => {
    sel.dataset.prev = sel.value;
    sel.addEventListener('change', () => {
      const row = LEDGER.find((r) => r.id === sel.dataset.id);
      if (!row) return;
      let cat = sel.value;
      if (cat === '__new__') {
        cat = (window.prompt('New category name:') || '').trim().toLowerCase();
        if (!cat) { sel.value = sel.dataset.prev; return; }
      }
      askScope(sel, row, cat);
    });
  });
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
  await appendImport({ file: file.name, account: accountId, added: added.length, rows: incoming.length, at: new Date().toISOString() });

  LEDGER = merged;
  await saveReport(reportFromLedger(LEDGER, ACCOUNTS, analyzeOpts())); // agent's full-history copy
  refreshView();
  const dup = incoming.length - added.length;
  const head = dup ? `Imported — ${added.length} new, ${dup} already on file.` : `Imported — ${added.length} transactions.`;
  setStatus([head, ...notes].join(' '));
  return { file: file.name, label: ACCOUNTS[accountId]?.label || accountId, added: added.length, dup };
}

// Re-render the saved ledger on open, so the user lands on their picture and
// the report survives New-chat / refresh / 24h session rollover.
async function resumeState() {
  try {
    LEDGER = await loadLedger();
    ACCOUNTS = await loadAccounts();
    INSIGHTS = await loadInsights();
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
  document.getElementById('txn').hidden = !txn;
  document.getElementById('report').hidden = txn || !LEDGER.length;
  document.getElementById('empty-state').hidden = txn || LEDGER.length > 0;
  document.getElementById('insights-wrap').hidden = txn || (!LEDGER.length && !INSIGHTS.length);
}

function switchView(mode) {
  if (STAGING && mode !== 'txn') return; // an import review is pending — finish or cancel it
  VIEW_MODE = mode;
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.view === mode));
  applyVisibility();
  if (mode === 'txn') renderTxnView();
}

function refreshView() {
  applyVisibility();
  if (!LEDGER.length) return;
  // Transfer detection always runs on the full ledger; the range only slices the view.
  const months = [...new Set(LEDGER.filter((r) => r.date).map((r) => r.date.slice(0, 7)))].sort();
  const view = viewFromLedger(LEDGER, ACCOUNTS, analyzeOpts(), currentRange(months));
  LAST_VIEW = view;
  renderRangeBar(view);
  renderCards(view);
  renderTrend(view);
  renderCategories(view);
  renderSubs(view);
  renderPayments(view);
}

function renderCards(v) {
  const t = v.totals || {};
  document.getElementById('cards').innerHTML = `
    <div class="card"><div class="k">Spend</div><div class="v">${money(t.spend)}</div><div class="sub">${t.months || 0} mo</div></div>
    <div class="card"><div class="k">Income</div><div class="v">${money(t.income)}</div></div>
    <div class="card ${(t.net || 0) >= 0 ? 'pos' : 'neg'}"><div class="k">Net</div><div class="v">${money(t.net)}</div></div>
    <div class="card"><div class="k">Subscriptions</div><div class="v">${moneyExact(v.subscription_monthly_total)}<span class="per">/mo</span></div><div class="sub">${v.active_subscription_count || 0} active${v.stopped_subscription_count ? ` · ${v.stopped_subscription_count} stopped` : ''}</div></div>`;
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

function renderPayments(v) {
  const wrap = document.getElementById('payments-wrap');
  const sched = v.payment_schedule || [];
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
  wrap.innerHTML = `<h2>Card payments <span class="hint inline">pattern-based — statements carry no due dates</span></h2><div class="pays">${rows}</div>`;
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
  // Proactive tier 2: new data is the one moment insights actually change —
  // run the full review unprompted (toggle in the Insights header).
  if (autoReviewOn()) {
    msg += `\n\nCharts are updated — running your full review now…`;
    try { chat?.addMessage?.('assistant', msg); } catch { /* chat not mounted */ }
    setTimeout(() => { try { chat?.send?.('Run my financial review.'); } catch { /* ignore */ } }, 600);
    return;
  }
  msg += `\n\nCharts are updated — take a look. Want a financial review? Hit ✦ Run review or just ask.`;
  try { chat?.addMessage?.('assistant', msg); } catch { /* chat not mounted */ }
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
      if (once(`cfo:rem:miss:${p.account}:${p.next_expected}`)) lines.push(`⚠ ${p.label} — I'd expect a payment around ${p.next_expected}, but none shows in your data. Worth checking you didn't miss it.`);
    } else {
      const d = daysUntil(p.next_expected);
      if (d >= 0 && d <= 3 && once(`cfo:rem:due:${p.account}:${p.next_expected}`)) {
        lines.push(`⏳ ${p.label} — you usually pay around ${p.next_expected} (${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}). Pattern-based, not an official due date.`);
      }
    }
  }
  const newest = LEDGER.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  if (newest && daysUntil(newest) <= -35 && once(`cfo:rem:stale:${newest}`)) {
    lines.push(`📥 Your newest data is from ${newest} — drag in fresh statements and I'll re-check everything.`);
  }
  if (lines.length) {
    try { chat?.addMessage?.('assistant', `Quick check while you were away:\n\n${lines.join('\n\n')}`); } catch { /* ignore */ }
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

  // Default to DeepSeek (cheap, provisioned). Per-skill override in
  // localStorage('cfo:model'); engine falls back if it isn't configured.
  try { MODEL_ID = localStorage.getItem('cfo:model') || 'deepseek-chat'; } catch { /* ignore */ }

  await resumeState();                  // land on the existing financial picture
  const sid = await recentSessionId();
  await mountChat(sid);                 // resume <24h chat, else fresh
  if (!sid) triggerGreeting();
  openReminders();                      // payment/staleness checks, once per state

  document.getElementById('new-chat')?.addEventListener('click', newChat);
  document.querySelectorAll('#tabs .tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  document.getElementById('help-btn')?.addEventListener('click', showHelp);

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

  const pane = document.getElementById('report-pane');
  pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('drag'); });
  pane.addEventListener('dragleave', () => pane.classList.remove('drag'));
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    pane.classList.remove('drag');
    handleImport(e.dataTransfer.files);
  });
});
