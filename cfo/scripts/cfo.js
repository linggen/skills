// CFO orchestrator — imports a statement, runs the redacting ingest + rollup
// via /api/bash (no LLM, deterministic, private), renders the report, and
// mounts the chat panel where the agent does the smart layer (ask-why,
// cancellation drafts, advice).
import './chat-bridge.js'; // sets window.LinggenUI
import { analyzeCsv, analyzeTransactions } from './analyze.js';

const SKILL = 'cfo';
let chat = null;

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
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const slug = (name) => (name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 60) || 'statement.csv');

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.classList.toggle('error', !!isError);
}

async function importFile(file) {
  // Parse + redact + roll up entirely in the browser — no python, no subprocess.
  // CSV is parsed directly; PDF lazy-loads pdf.js (only then) to extract text.
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  let r;
  if (isPdf) {
    const { pdfToTransactions } = await import('./pdf-import.js');
    const { transactions, notes } = await pdfToTransactions(await file.arrayBuffer());
    r = analyzeTransactions(transactions, { source: file.name, notes });
  } else {
    r = analyzeCsv(await file.text());
  }
  if (r.errors && r.errors.length) throw new Error([...(r.notes || []), ...r.errors].join(' '));
  renderReport(r);

  const base = slug(file.name.replace(/\.csv$/i, '')) || 'statement';
  // Persist the REDACTED rollup (not the raw CSV) for month-over-month history.
  // Pure coreutils (base64) — universal, no python.
  saveRollup(base, r).catch((e) => console.warn('[cfo] save failed', e));

  // Hand the agent the redacted analysis so it can answer "why", draft
  // cancellations, and advise. Account numbers were already stripped in JS.
  chat?.sendHidden(buildAgentContext(r));
}

async function saveRollup(base, r) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(r))));
  await runBash(
    `DIR="$HOME/.linggen/skills/${SKILL}/data"; mkdir -p "$DIR"; ` +
    `printf '%s' "${b64}" | base64 --decode > "$DIR/${base}.rollup.json"`,
  );
}

function buildAgentContext(r) {
  const ctx = {
    totals: r.totals, by_month: r.by_month, by_category: r.by_category,
    top_merchants: r.top_merchants, subscriptions: r.subscriptions,
    subscription_monthly_total: r.subscription_monthly_total, recoverable: r.recoverable,
    transactions: (r.transactions || []).slice(-400), // redacted; capped for tokens
  };
  return 'The user just imported a statement. The page already shows the report — do NOT '
    + 're-summarize it. Below is the REDACTED analysis (account numbers already stripped). '
    + 'Use it to answer the user\'s questions, draft cancellations, or give advice per your '
    + 'instructions. Wait for the user to ask.\n\n```json\n' + JSON.stringify(ctx) + '\n```';
}

function renderReport(r) {
  const t = r.totals || {};
  const cats = r.by_category || [];
  const subs = r.subscriptions || [];
  const maxCat = cats.length ? cats[0].spend : 1;

  const recs = [];
  for (const s of subs) {
    if (s.increased) recs.push(`↑ <b>${esc(s.merchant)}</b> rose ${money(s.first_amount)} → ${money(s.last_amount)} (+${money(s.increase_amount)}/mo).`);
    if (s.stale) recs.push(`⚠ <b>${esc(s.merchant)}</b> — no charge since ${s.last_date}; possibly forgotten (${money(s.monthly)}/mo).`);
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
      <div class="card"><div class="k">Subscriptions</div><div class="v">${money(r.subscription_monthly_total)}<span class="per">/mo</span></div><div class="sub">${subs.length} found</div></div>
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
        <div class="sub-row">
          <span class="sub-name">${esc(s.merchant)}</span>
          <span class="sub-amt">${money(s.monthly)}/mo</span>
          <span class="sub-flags">${s.increased ? '<span class="flag up">↑ price up</span>' : ''}${s.stale ? '<span class="flag stale">⚠ stale</span>' : ''}</span>
        </div>`).join('') : '<p class="hint">No recurring charges detected yet — import a few months for better detection.</p>'}
    </div>

    ${recs.length ? `<h2>Worth a look</h2><ul class="recs">${recs.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="hint">Ask the assistant: <i>"draft a cancellation for ${esc(subs.find((s) => s.increased || s.stale)?.merchant || 'this')}"</i> or <i>"why did my spend change?"</i></p>` : ''}
  `;
  setStatus('');
}

async function handleImport(file) {
  setStatus('Analyzing… (stays on your Mac)');
  try {
    await importFile(file);
  } catch (e) {
    setStatus(`Error: ${e.message}`, true);
    console.error('[cfo] import failed', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Default to DeepSeek (cheap, provisioned). Per-skill override in
  // localStorage('cfo:model'); engine falls back if it isn't configured.
  let modelId = 'deepseek-chat';
  try { modelId = localStorage.getItem('cfo:model') || 'deepseek-chat'; } catch { /* ignore */ }

  try {
    chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
      skillName: SKILL, agentId: 'ling', modelId, title: 'CFO',
    });
  } catch (e) {
    console.error('[cfo] chat mount failed', e);
  }

  const input = document.getElementById('file-input');
  input.addEventListener('change', () => { if (input.files[0]) handleImport(input.files[0]); });

  const pane = document.getElementById('report-pane');
  pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('drag'); });
  pane.addEventListener('dragleave', () => pane.classList.remove('drag'));
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    pane.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) handleImport(f);
  });
});
