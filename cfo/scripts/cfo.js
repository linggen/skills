// CFO orchestrator — imports a statement, runs the redacting ingest + rollup
// via /api/bash (no LLM, deterministic, private), renders the report, and
// mounts the chat panel where the agent does the smart layer (ask-why,
// cancellation drafts, advice).
import './chat-bridge.js'; // sets window.LinggenUI
import { listSkillSessions } from './api.js';
import { analyzeCsv, orientTransactions } from './analyze.js';
import { toLedgerRows, mergeLedger, reportFromLedger } from './ledger.js';
import { hashId } from './hash.js';

const SKILL = 'cfo';
const DATA = `$HOME/.linggen/skills/${SKILL}/data`; // $HOME stays literal for bash
let chat = null;
let MODEL_ID = 'deepseek-chat';

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

// ── Account resolution: known fingerprint → silent; new/none → prompt label+type.
async function resolveAccount(fingerprint, accounts, filename) {
  if (fingerprint && accounts[fingerprint]) return fingerprint;
  const picked = await promptAccount({ fingerprint, accounts, filename });
  if (!picked) return null;
  if (!accounts[picked.id]) { accounts[picked.id] = { label: picked.label, type: picked.type }; await saveAccounts(accounts); }
  return picked.id;
}

// Pre-select the likely account type from the filename so the user usually
// just clicks through (e.g. "...-checking.csv" → Checking, not Credit card).
function guessType(text) {
  const t = (text || '').toLowerCase();
  if (/check|chequing/.test(t)) return 'checking';
  if (/saving/.test(t)) return 'savings';
  return 'credit'; // visa/card/credit/amex/etc. and the default
}

function promptAccount({ fingerprint, accounts, filename }) {
  return new Promise((resolve) => {
    const existing = Object.entries(accounts);
    const guess = (filename || '').replace(/\.(csv|pdf)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 30);
    const newDefault = !!fingerprint || existing.length === 0;
    const typeGuess = guessType(filename);
    const TYPES = [['credit', 'Credit card'], ['checking', 'Checking'], ['savings', 'Savings']];
    const root = document.getElementById('modal');
    root.hidden = false;
    root.innerHTML = `
      <div class="modal-card">
        <h3>Which account is this?</h3>
        <p class="hint">${fingerprint ? 'New account detected — label it once and future imports auto-match.' : 'This file has no account number — pick an account or add one.'}</p>
        <div class="acct-list">
          ${existing.map(([id, a]) => `<label class="acct-opt"><input type="radio" name="acct" value="${esc(id)}"> <span>${esc(a.label)}</span> <span class="acct-type">${esc(a.type)}</span></label>`).join('')}
          <label class="acct-opt"><input type="radio" name="acct" value="__new__" ${newDefault ? 'checked' : ''}> New account…</label>
        </div>
        <div class="acct-new" ${newDefault ? '' : 'hidden'}>
          <input id="acct-label" type="text" placeholder="Name (e.g. Visa ···1234)" value="${esc(guess)}">
          <select id="acct-type">
            ${TYPES.map(([v, label]) => `<option value="${v}" ${v === typeGuess ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button id="acct-cancel" class="btn ghost">Cancel</button>
          <button id="acct-ok" class="btn">Use account</button>
        </div>
      </div>`;
    const newBox = root.querySelector('.acct-new');
    root.querySelectorAll('input[name=acct]').forEach((rb) => rb.addEventListener('change', () => {
      newBox.hidden = root.querySelector('input[name=acct]:checked').value !== '__new__';
    }));
    const close = (val) => { root.hidden = true; root.innerHTML = ''; resolve(val); };
    root.querySelector('#acct-cancel').onclick = () => close(null);
    root.querySelector('#acct-ok').onclick = () => {
      const sel = root.querySelector('input[name=acct]:checked');
      if (!sel) return close(null);
      if (sel.value !== '__new__') { const a = accounts[sel.value]; return close({ id: sel.value, label: a.label, type: a.type }); }
      const label = (root.querySelector('#acct-label').value || guess || 'Account').trim();
      const type = root.querySelector('#acct-type').value;
      return close({ id: fingerprint || `acct_${hashId(label + type)}`, label, type });
    };
  });
}

// ── Import: parse → resolve account → reconcile into the ledger → report.
async function importFile(file) {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const opts = { categoryOverrides: CATEGORY_OVERRIDES };
  let transactions, fingerprint = null, notes = [];
  if (isPdf) {
    const { pdfToTransactions } = await import('./pdf-import.js');
    const res = await pdfToTransactions(await file.arrayBuffer());
    transactions = res.transactions; notes = res.notes || [];
  } else {
    const r = analyzeCsv(await file.text(), opts);
    if (r.errors && r.errors.length) throw new Error([...(r.notes || []), ...r.errors].join(' '));
    transactions = r.transactions; fingerprint = r.account_fingerprint; notes = r.notes || [];
  }
  if (!transactions || !transactions.length) {
    throw new Error([...(notes.length ? notes : ['No transactions found in this file.'])].join(' '));
  }

  const accounts = await loadAccounts();
  const accountId = await resolveAccount(fingerprint, accounts, file.name);
  if (!accountId) { setStatus(''); return; } // user cancelled the prompt

  // Some cards export charges as positive (Amex style) — orient now that the
  // user has told us the account type, so spend/income don't land swapped.
  const oriented = orientTransactions(transactions, accounts[accountId]?.type);
  if (oriented.flipped) notes.push('This statement lists charges as positive amounts — signs were flipped so spend reads correctly.');

  const incoming = toLedgerRows(oriented.transactions, accountId);
  const existing = await loadLedger();
  const { merged, added } = mergeLedger(existing, incoming);
  if (added.length) await appendLedgerRows(added);
  await appendImport({ file: file.name, account: accountId, added: added.length, rows: incoming.length, at: new Date().toISOString() });

  const report = reportFromLedger(merged, accounts, opts);
  report.notes = notes;
  await saveReport(report);
  renderReport(report);
  const dup = incoming.length - added.length;
  setStatus(dup ? `Imported — ${added.length} new, ${dup} already on file` : `Imported — ${added.length} transactions`);
}

// Re-render the saved ledger on open, so the user lands on their picture and
// the report survives New-chat / refresh / 24h session rollover.
async function resumeReport() {
  try {
    const rows = await loadLedger();
    if (!rows.length) return;
    const accounts = await loadAccounts();
    const report = reportFromLedger(rows, accounts, { categoryOverrides: CATEGORY_OVERRIDES });
    await saveReport(report); // keep the agent's LatestAnalysis fresh even with no new import
    renderReport(report);
  } catch (e) { console.warn('[cfo] resume failed', e); }
}

function renderReport(r) {
  const t = r.totals || {};
  const cats = r.by_category || [];
  const subs = r.subscriptions || [];
  const active = subs.filter((s) => s.active !== false); // tolerate older saved rollups
  const stopped = subs.filter((s) => s.stopped);
  const maxCat = cats.length ? cats[0].spend : 1;

  const recs = [];
  for (const s of active) {
    if (s.increased) recs.push(`↑ <b>${esc(s.merchant)}</b> rose ${moneyExact(s.first_amount)} → ${moneyExact(s.last_amount)} (+${moneyExact(s.increase_amount)}/mo).`);
  }
  for (const s of stopped) {
    recs.push(`⏸ <b>${esc(s.merchant)}</b> — no charge since ${s.last_date}. Did you cancel it, or is it billed yearly?`);
  }

  const notes = (r.notes || []).filter(Boolean);
  const notesHtml = notes.length ? `<div class="notes">${notes.map((n) => esc(n)).join(' ')}</div>` : '';

  document.getElementById('empty-state').hidden = true;
  const el = document.getElementById('report');
  el.hidden = false;
  el.innerHTML = `
    ${notesHtml}
    <div class="cards">
      <div class="card"><div class="k">Spend</div><div class="v">${money(t.spend)}</div><div class="sub">${t.months || 0} mo</div></div>
      <div class="card"><div class="k">Income</div><div class="v">${money(t.income)}</div></div>
      <div class="card ${(t.net || 0) >= 0 ? 'pos' : 'neg'}"><div class="k">Net</div><div class="v">${money(t.net)}</div></div>
      <div class="card"><div class="k">Subscriptions</div><div class="v">${moneyExact(r.subscription_monthly_total)}<span class="per">/mo</span></div><div class="sub">${active.length} active${stopped.length ? ` · ${stopped.length} stopped` : ''}</div></div>
    </div>

    <h2>Where it goes</h2>
    <div class="bars">
      ${cats.map((c) => `
        <div class="bar-row">
          <span class="bar-label">${esc(c.category)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.round((100 * c.spend) / maxCat)}%"></span></span>
          <span class="bar-val">${money(c.spend)} <em>${c.pct}%</em></span>
        </div>`).join('')}
    </div>

    <h2>Subscriptions</h2>
    <div class="subs">
      ${subs.length ? subs.map((s) => `
        <div class="sub-row${s.stopped ? ' stopped' : ''}">
          <span class="sub-name">${esc(s.merchant)}</span>
          <span class="sub-amt">${moneyExact(s.monthly)}/mo</span>
          <span class="sub-flags">${s.increased ? '<span class="flag up">↑ price up</span>' : ''}${s.stopped ? '<span class="flag stopped">⏸ stopped</span>' : ''}</span>
        </div>`).join('') : '<p class="hint">No recurring charges detected yet — import a few months for better detection.</p>'}
    </div>
    ${active.length ? `<p class="hint nudge">You're paying <b>${moneyExact(r.subscription_monthly_total)}/mo</b> across ${active.length} active subscription${active.length === 1 ? '' : 's'} — cancel any you don't use.</p>` : ''}

    ${recs.length ? `<h2>Worth a look</h2><ul class="recs">${recs.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="hint">Ask the assistant: <i>"draft a cancellation for ${esc((active.find((s) => s.increased) || stopped[0] || active[0])?.merchant || 'a sub')}"</i> or <i>"why did my spend change?"</i></p>` : ''}
  `;
  setStatus('');
}

// Import one or many files (picker multi-select OR drag-and-drop of several).
// Sequential so each account prompt resolves before the next file.
async function handleImport(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  for (let i = 0; i < list.length; i++) {
    setStatus(list.length > 1 ? `Importing ${i + 1}/${list.length}: ${list[i].name}…` : 'Analyzing… (stays on your Mac)');
    try {
      await importFile(list[i]);
    } catch (e) {
      setStatus(`Error in ${list[i].name}: ${e.message}`, true);
      console.error('[cfo] import failed', list[i].name, e);
    }
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
    });
  } catch (e) { console.error('[cfo] chat mount failed', e); }
}

async function newChat() {
  try { chat?.destroy?.(); } catch { /* ignore */ }
  await mountChat(null); // fresh session — report (left pane) is untouched
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig(); // currency + category overrides, before the first import

  // Default to DeepSeek (cheap, provisioned). Per-skill override in
  // localStorage('cfo:model'); engine falls back if it isn't configured.
  try { MODEL_ID = localStorage.getItem('cfo:model') || 'deepseek-chat'; } catch { /* ignore */ }

  await resumeReport();                 // land on the existing financial picture
  await mountChat(await recentSessionId()); // resume <24h chat, else fresh

  document.getElementById('new-chat')?.addEventListener('click', newChat);

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
