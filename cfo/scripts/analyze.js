// analyze.js — CSV parse + redaction + rollup, entirely in the browser.
//
// Ported from the old ingest.py/rollup.py so the skill needs NO python (macOS
// doesn't ship python3 by default). Runs in the Linggen webview, where JS is
// always available. The PRIVACY GATE lives here: account/card/balance columns
// and long digit runs are stripped before anything is rendered or handed to
// the model — analyzeCsv() returns only {date, merchant, amount} rows plus
// aggregates.

const DATE_KEYS = ['transaction date', 'posting date', 'date posted', 'date'];
const DESC_KEYS = ['description', 'details', 'payee', 'merchant', 'name', 'memo', 'narration'];
const AMOUNT_KEYS = ['amount', 'transaction amount'];
const DEBIT_KEYS = ['debit', 'withdrawal', 'money out', 'paid out'];
const CREDIT_KEYS = ['credit', 'deposit', 'money in', 'paid in'];
const REDACT_KEYS = ['account', 'card', 'number', 'balance', 'iban', 'routing', 'sort code', 'ref'];

const CATEGORY_RULES = [
  ['dining', ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'uber eats', 'doordash', 'grubhub', 'tim hortons', 'pizza', 'grill']],
  ['groceries', ['grocery', 'supermarket', 'loblaws', 'metro', 'costco', 'walmart', 'safeway', 'whole foods', 'trader joe', 'no frills', 'sobeys']],
  ['transport', ['uber', 'lyft', 'transit', 'gas', 'petro', 'shell', 'esso', 'chevron', 'parking', 'presto']],
  ['subscriptions', ['netflix', 'spotify', 'disney', 'youtube', 'icloud', 'apple.com/bill', 'prime', 'hbo', 'patreon', 'substack', 'openai', 'github', 'adobe', 'notion', 'dropbox', 'google storage']],
  ['utilities', ['hydro', 'electric', 'rogers', 'bell', 'telus', 'fido', 'internet', 'water', 'enbridge', 'phone']],
  ['shopping', ['amazon', 'ebay', 'aliexpress', 'best buy', 'ikea', 'shoppers', 'store', 'shop']],
  ['health', ['pharmacy', 'clinic', 'dental', 'gym', 'fitness', 'doctor']],
  ['travel', ['airline', 'air canada', 'hotel', 'airbnb', 'expedia', 'booking.com', 'flight', 'westjet']],
];

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// ── CSV parsing (RFC4180-ish: quoted fields, "" escapes, commas/newlines in quotes)
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const findCol = (headersL, keys) => headersL.findIndex((h) => keys.some((k) => h.includes(k)));

function pad2(n) { return String(n).padStart(2, '0'); }

export function parseDate(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/))) {
    let [, a, b, y] = m;
    a = +a; b = +b; y = +y; if (y < 100) y += 2000;
    // a/b ambiguous: if a>12 it's D/M, else assume M/D (North America)
    const month = a > 12 ? b : a, day = a > 12 ? a : b;
    return `${y}-${pad2(month)}-${pad2(day)}`;
  }
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) return `${m[3]}-${pad2(mo + 1)}-${pad2(+m[1])}`;
  }
  if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]; if (mo != null) return `${m[3]}-${pad2(mo + 1)}-${pad2(+m[2])}`;
  }
  return null;
}

export function parseAmount(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  const neg = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[(),$£€\s]/g, '');
  if (s === '' || s === '-' || s === '+') return null;
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return neg ? -v : v;
}

export function cleanMerchant(raw) {
  let s = (raw || '').trim();
  s = s.replace(/\b\d{6,}\b/g, '');     // long digit runs (card/acct fragments)
  s = s.replace(/[*#]+\d+/g, '');       // *1234 / #0099 store/card tails
  s = s.replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
  return s.slice(0, 80);
}

function merchantKey(m) {
  const up = (m || '').toUpperCase().replace(/\d+/g, '').replace(/[^A-Z& ]/g, ' ');
  const toks = up.split(/\s+/).filter((t) => t.length > 1);
  return toks.slice(0, 3).join(' ') || 'UNKNOWN';
}

function categorize(m) {
  const ml = (m || '').toLowerCase();
  for (const [cat, kws] of CATEGORY_RULES) if (kws.some((k) => ml.includes(k))) return cat;
  return 'other';
}

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const round2 = (n) => Math.round(n * 100) / 100;

// ── Redact + normalize ──
function ingest(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { transactions: [], errors: ['empty CSV'] };
  const headers = rows[0];
  const headersL = headers.map((h) => h.trim().toLowerCase());
  const body = rows.slice(1);

  let di = findCol(headersL, DATE_KEYS);
  let pi = findCol(headersL, DESC_KEYS);
  let ai = findCol(headersL, AMOUNT_KEYS);
  const dbi = findCol(headersL, DEBIT_KEYS);
  const cri = findCol(headersL, CREDIT_KEYS);
  const notes = [];
  if (di < 0 || pi < 0 || (ai < 0 && dbi < 0 && cri < 0)) {
    notes.push('header not recognized; guessed columns by position');
    if (di < 0) di = 0; if (pi < 0) pi = 1;
    if (ai < 0 && dbi < 0 && cri < 0) ai = headers.length - 1;
  }
  const redacted = headers.filter((h, i) => REDACT_KEYS.some((k) => headersL[i].includes(k)));

  const txns = [], dates = [];
  for (const r of body) {
    const date = di >= 0 && di < r.length ? parseDate(r[di]) : null;
    const merchant = pi >= 0 && pi < r.length ? cleanMerchant(r[pi]) : '';
    let amount;
    if (dbi >= 0 || cri >= 0) {
      const debit = dbi >= 0 && dbi < r.length ? parseAmount(r[dbi]) || 0 : 0;
      const credit = cri >= 0 && cri < r.length ? parseAmount(r[cri]) || 0 : 0;
      amount = credit - debit;
    } else {
      amount = ai >= 0 && ai < r.length ? parseAmount(r[ai]) : null;
    }
    if (amount == null) continue;
    txns.push({ date, merchant, amount: round2(amount) });
    if (date) dates.push(date);
  }
  if (ai >= 0 && dbi < 0 && cri < 0) notes.push('single Amount column — sign kept as-is');
  dates.sort();
  return {
    source: 'import.csv', currency: null, row_count: txns.length,
    date_range: { start: dates[0] || null, end: dates[dates.length - 1] || null },
    transactions: txns, redacted_columns: redacted, notes, errors: [],
  };
}

// ── Recurring-charge (subscription) detection ──
function detectSubscriptions(txns, lastDate) {
  const groups = {};
  for (const t of txns) {
    if (t.amount < 0 && t.date) (groups[merchantKey(t.merchant)] ||= []).push(t);
  }
  const subs = [];
  for (const items of Object.values(groups)) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = items.slice(1).map((it, i) => daysBetween(it.date, items[i].date));
    const monthlyish = gaps.filter((g) => g >= 24 && g <= 35);
    if (!monthlyish.length) continue;
    const amts = items.map((i) => Math.abs(i.amount));
    const avg = amts.reduce((a, b) => a + b, 0) / amts.length;
    if (avg === 0 || Math.max(...amts) > avg * 1.5) continue; // variable spend, not a sub
    const first = amts[0], last = Math.abs(items[items.length - 1].amount);
    const prior = items.length >= 2 ? Math.abs(items[items.length - 2].amount) : null;
    subs.push({
      merchant: items[items.length - 1].merchant || merchantKey(items[0].merchant),
      monthly: round2(avg),
      cadence_days: Math.round(monthlyish.reduce((a, b) => a + b, 0) / monthlyish.length),
      first_amount: round2(first), last_amount: round2(last),
      prior_amount: prior != null ? round2(prior) : null,
      increased: last > first + 0.01, increase_amount: round2(last - first),
      last_date: items[items.length - 1].date,
      charges: items.length,
      stale: !!(lastDate && daysBetween(items[items.length - 1].date, lastDate) > 45),
    });
  }
  return subs.sort((a, b) => b.monthly - a.monthly);
}

// ── Public: roll up an already-parsed, redacted transactions array.
// Shared by the CSV and PDF import paths. `meta` carries source/currency/notes.
export function analyzeTransactions(txns, meta = {}) {
  if (!txns.length) return { ...meta, transactions: [], errors: ['no transactions found'] };

  const dates = txns.filter((t) => t.date).map((t) => t.date).sort();
  const lastDate = dates[dates.length - 1] || null;

  const spend = round2(txns.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0));
  const income = round2(txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0));

  const byMonth = {};
  for (const t of txns) {
    const m = t.date ? t.date.slice(0, 7) : null;
    if (!m) continue;
    (byMonth[m] ||= { spend: 0, income: 0, net: 0 });
    if (t.amount < 0) byMonth[m].spend -= t.amount; else byMonth[m].income += t.amount;
    byMonth[m].net += t.amount;
  }
  for (const m of Object.keys(byMonth)) for (const k of Object.keys(byMonth[m])) byMonth[m][k] = round2(byMonth[m][k]);

  const catSpend = {}, merch = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    catSpend[categorize(t.merchant)] = (catSpend[categorize(t.merchant)] || 0) - t.amount;
    const mk = merchantKey(t.merchant);
    (merch[mk] ||= { spend: 0, count: 0 });
    merch[mk].spend -= t.amount; merch[mk].count += 1;
  }
  const byCategory = Object.entries(catSpend)
    .map(([category, v]) => ({ category, spend: round2(v), pct: spend ? round2((100 * v) / spend) : 0 }))
    .sort((a, b) => b.spend - a.spend);
  const topMerchants = Object.entries(merch)
    .map(([merchant, v]) => ({ merchant, spend: round2(v.spend), count: v.count }))
    .sort((a, b) => b.spend - a.spend).slice(0, 10);

  const subs = detectSubscriptions(txns, lastDate);
  const subTotal = round2(subs.reduce((a, s) => a + s.monthly, 0));
  const staleTotal = round2(subs.filter((s) => s.stale).reduce((a, s) => a + s.monthly, 0));

  return {
    source: meta.source || null, currency: meta.currency || null,
    date_range: { start: dates[0] || null, end: lastDate },
    notes: meta.notes || [], redacted_columns: meta.redacted_columns || [],
    totals: { spend, income, net: round2(income - spend), months: Object.keys(byMonth).length },
    by_month: Object.fromEntries(Object.entries(byMonth).sort()),
    by_category: byCategory,
    top_merchants: topMerchants,
    subscriptions: subs,
    subscription_monthly_total: subTotal,
    recoverable: { stale_monthly: staleTotal, note: 'stale = no charge in 45+ days; likely forgotten or cancelable' },
    transactions: txns,
    errors: [],
  };
}

// ── Public: CSV text → full redacted analysis ──
export function analyzeCsv(text) {
  const ing = ingest(text);
  return analyzeTransactions(ing.transactions, {
    source: ing.source, currency: ing.currency,
    notes: ing.notes, redacted_columns: ing.redacted_columns,
  });
}
