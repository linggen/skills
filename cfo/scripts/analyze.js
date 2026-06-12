// analyze.js — CSV parse + redaction + rollup, entirely in the browser.
//
// Ported from the old ingest.py/rollup.py so the skill needs NO python (macOS
// doesn't ship python3 by default). Runs in the Linggen webview, where JS is
// always available. The PRIVACY GATE lives here: account/card/balance columns
// and long digit runs are stripped before anything is rendered or handed to
// the model — analyzeCsv() returns only {date, merchant, amount} rows plus
// aggregates.

import { accountFingerprint } from './hash.js';

const DATE_KEYS = ['transaction date', 'posting date', 'date posted', 'date'];
const DESC_KEYS = ['description', 'details', 'payee', 'merchant', 'name', 'memo', 'narration'];
const AMOUNT_KEYS = ['amount', 'transaction amount'];
const DEBIT_KEYS = ['debit', 'withdrawal', 'money out', 'paid out'];
const CREDIT_KEYS = ['credit', 'deposit', 'money in', 'paid in'];
const REDACT_KEYS = ['account', 'card', 'number', 'balance', 'iban', 'routing', 'sort code', 'ref'];

const CATEGORY_RULES = [
  // Fees first — they're the leak-detection ground truth and the keywords are specific.
  ['fees', ['nsf fee', 'overdraft', 'interest charge', 'finance charge', 'service charge', 'monthly fee', 'annual fee', 'late fee', 'atm fee', 'foreign transaction', 'wire fee', 'e-transfer fee']],
  ['dining', ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'uber eats', 'doordash', 'grubhub', 'tim hortons', 'pizza', 'grill']],
  ['groceries', ['grocery', 'supermarket', 'loblaws', 'metro', 'costco', 'walmart', 'safeway', 'whole foods', 'trader joe', 'no frills', 'sobeys']],
  ['transport', ['uber', 'lyft', 'transit', 'gas', 'petro', 'shell', 'esso', 'chevron', 'parking', 'presto']],
  ['subscriptions', ['netflix', 'spotify', 'disney', 'youtube', 'icloud', 'apple.com/bill', 'prime', 'hbo', 'patreon', 'substack', 'openai', 'github', 'adobe', 'notion', 'dropbox', 'google storage']],
  ['utilities', ['hydro', 'electric', 'rogers', 'bell', 'telus', 'fido', 'internet', 'water', 'enbridge', 'phone']],
  ['housing', ['rent ', 'mortgage', 'lease', 'landlord', 'property mgmt', 'property management', 'property tax', 'strata', 'hoa ']],
  ['shopping', ['amazon', 'ebay', 'aliexpress', 'best buy', 'ikea', 'shoppers', 'store', 'shop']],
  ['health', ['pharmacy', 'clinic', 'dental', 'gym', 'fitness', 'doctor']],
  ['travel', ['airline', 'air canada', 'hotel', 'airbnb', 'expedia', 'booking.com', 'flight', 'westjet']],
];

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// ── CSV parsing (RFC4180-ish: quoted fields, "" escapes, delimiter/newlines in quotes)
function parseCsv(text, delim = ',') {
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
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// European exports (ING, Sparkasse, …) are semicolon- or tab-delimited.
function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  const count = (ch) => lines.reduce((a, l) => a + l.split(ch).length - 1, 0);
  const commas = count(','), semis = count(';'), tabs = count('\t');
  if (semis > commas && semis > tabs) return ';';
  if (tabs > commas && tabs > semis) return '\t';
  return ',';
}

const findCol = (headersL, keys) => headersL.findIndex((h) => keys.some((k) => h.includes(k)));

function pad2(n) { return String(n).padStart(2, '0'); }

export function parseDate(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  // Drop a trailing time-of-day ("2026-06-01 09:00:12", ISO offsets, tz codes)
  s = s.replace(/[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[+-]\d{2}:?\d{2}|[A-Za-z]{1,5})?$/, '').trim();
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { // compact YYYYMMDD (BMO, ING)
    return +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
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
  s = s.replace(/[()$£€\s]/g, '');
  // European decimal comma ("1.234,56" / "3400,00"): dots are thousands.
  if (/^[+-]?\d+(\.\d{3})*,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, ''); // North-American thousands commas
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

export function merchantKey(m) {
  const up = (m || '').toUpperCase().replace(/\d+/g, '').replace(/[^A-Z& ]/g, ' ');
  const toks = up.split(/\s+/).filter((t) => t.length > 1);
  return toks.slice(0, 3).join(' ') || 'UNKNOWN';
}

export function categorize(m, overrides) {
  const ml = (m || '').toLowerCase();
  if (overrides) {
    for (const [kw, cat] of Object.entries(overrides)) {
      if (kw && ml.includes(kw.toLowerCase())) return cat; // user-configured wins
    }
  }
  for (const [cat, kws] of CATEGORY_RULES) if (kws.some((k) => ml.includes(k))) return cat;
  return 'other';
}

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const round2 = (n) => Math.round(n * 100) / 100;

// ── Header detection + column mapping ──
// Direction-flag columns some banks use instead of signs (ING "Af"/"Bij", DR/CR).
const SIGN_DEBIT = new Set(['af', 'dr', 'd', 'db', 'dbit', 'debit', 'withdrawal']);
const SIGN_CREDIT = new Set(['bij', 'cr', 'c', 'credit', 'deposit']);
const HEADER_HINTS = [...new Set([
  ...DATE_KEYS, ...DESC_KEYS, ...AMOUNT_KEYS, ...DEBIT_KEYS, ...CREDIT_KEYS, ...REDACT_KEYS,
  'cheque', 'category', 'status', 'type', 'memo', 'running bal', 'currency', 'fee', 'state',
])];
const CURRENCY_COL_RE = /^[a-z]{3}\s*\$$|^\$$/; // RBC-style "CAD$" / "USD$" amount columns

// A header row is pure labels — no date- or amount-parseable cells — naming at
// least two known column concepts. Scanning the first rows also skips summary
// preambles (BofA's balance block, BMO's "data is valid as of" line).
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map((c) => String(c).trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.some((c) => parseDate(c) != null || parseAmount(c) != null)) continue;
    const hits = cells.filter((c) => {
      const l = c.toLowerCase();
      return HEADER_HINTS.some((k) => l.includes(k)) || CURRENCY_COL_RE.test(l);
    }).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function mapByHeader(headers, headersL, body, notes) {
  let di = findCol(headersL, DATE_KEYS);
  let pi = findCol(headersL, DESC_KEYS);
  let ai = findCol(headersL, AMOUNT_KEYS);
  const dbi = findCol(headersL, DEBIT_KEYS);
  const cri = findCol(headersL, CREDIT_KEYS);
  if (ai < 0 && dbi < 0 && cri < 0) {
    // Currency-named amount columns (RBC "CAD$"/"USD$") — prefer the fullest.
    const cands = headersL.map((h, i) => (CURRENCY_COL_RE.test(h) ? i : -1)).filter((i) => i >= 0);
    const fill = (i) => body.filter((r) => i < r.length && String(r[i]).trim()).length;
    if (cands.length) ai = cands.sort((a, b) => fill(b) - fill(a))[0];
  }
  if (di < 0) di = 0;
  if (pi < 0) pi = Math.min(1, headers.length - 1);
  if (ai < 0 && dbi < 0 && cri < 0) { ai = headers.length - 1; notes.push('no amount column recognized; guessed the last column'); }
  const redacted = headers.filter((h, i) => REDACT_KEYS.some((k) => headersL[i].includes(k)));

  // Fingerprint the account from its number column (hashed; the raw number is
  // discarded, never stored) so re-imports of the same card auto-group. Try
  // every account/card-named column and keep the first whose values carry
  // enough digits — skips name columns like Amex's "Card Member".
  let account_fingerprint = null;
  for (let i = 0; i < headersL.length && !account_fingerprint; i++) {
    if (!headersL[i].includes('account') && !headersL[i].includes('card')) continue;
    const row = body.find((r) => i < r.length && String(r[i]).trim());
    account_fingerprint = accountFingerprint(row ? row[i] : null);
  }
  return { di, pi, ai, dbi, cri, sgi: -1, redacted, account_fingerprint };
}

// No header row (TD, CIBC, Wells Fargo, foreign-language headers): classify
// every column by its CONTENT — date-parse rate, numeric rate, digit-heavy
// (account numbers / IBANs), direction flags, text length — and assign roles.
function inferColumns(bodyIn, notes) {
  let body = bodyIn;
  // A lone label row on top is an unrecognized (e.g. non-English) header.
  const isLabelRow = (r) => r.filter((c) => String(c).trim()).length >= 2
    && !r.some((c) => parseDate(String(c).trim()) != null || parseAmount(String(c).trim()) != null);
  if (body.length >= 2 && isLabelRow(body[0]) && !isLabelRow(body[1])) {
    body = body.slice(1);
    notes.push('skipped an unrecognized header line');
  }
  const width = Math.max(...body.map((r) => r.length));
  const stats = [];
  for (let i = 0; i < width; i++) {
    const vals = body.map((r) => String(r[i] ?? '').trim()).filter(Boolean);
    const n = vals.length;
    stats.push({
      i, n,
      fillRate: n / body.length,
      dates: n ? vals.filter((v) => parseDate(v) != null).length / n : 0,
      digitHeavy: n > 0 && vals.filter((v) => /\d{6,}/.test(v.replace(/[\s-]/g, ''))).length / n > 0.8,
      nums: n ? vals.filter((v) => parseDate(v) == null && parseAmount(v) != null).length / n : 0,
      flags: n > 0 && vals.every((v) => SIGN_DEBIT.has(v.toLowerCase()) || SIGN_CREDIT.has(v.toLowerCase())),
      avgLen: n ? vals.reduce((a, v) => a + v.length, 0) / n : 0,
      sample: vals[0] || '',
    });
  }
  let di = -1, bestDates = 0.7;
  for (const c of stats) if (c.dates > bestDates) { di = c.i; bestDates = c.dates; }
  const sgi = stats.find((c) => c.i !== di && c.flags)?.i ?? -1;

  let cands = stats.filter((c) => c.i !== di && c.i !== sgi && !c.digitHeavy && c.n > 0 && c.nums >= 0.99);
  // A trailing always-filled numeric column next to sparse ones is the running balance.
  if (cands.length >= 2) {
    const last = cands[cands.length - 1];
    if (last.fillRate >= 0.99 && cands.slice(0, -1).some((c) => c.fillRate < 0.99)) cands = cands.slice(0, -1);
  }
  let ai = -1, dbi = -1, cri = -1;
  if (cands.length === 1) ai = cands[0].i;
  else if (cands.length >= 2) {
    const [a, b] = cands;
    const both = body.filter((r) => String(r[a.i] ?? '').trim() && String(r[b.i] ?? '').trim()).length;
    // Mutually exclusive pair = debit,credit (debit-first convention); else
    // both-filled means amount + running balance — keep the leftmost.
    if (both / body.length <= 0.2) { dbi = a.i; cri = b.i; } else ai = a.i;
  }
  const fp = stats.find((c) => c.i !== di && c.digitHeavy);
  const textish = (c) => c.i !== di && c.i !== sgi && !c.digitHeavy && c.dates < 0.5 && c.nums < 0.5 && c.avgLen >= 3 && c.n > 0;
  const pi = (stats.find((c) => c.i > di && textish(c)) || stats.find(textish) || { i: di + 1 }).i;
  return {
    di: di >= 0 ? di : 0, pi, ai, dbi, cri, sgi, redacted: [],
    account_fingerprint: fp ? accountFingerprint(fp.sample) : null,
    body,
  };
}

// ── Redact + normalize ──
function ingest(text) {
  const rows = parseCsv(text, sniffDelimiter(text));
  if (!rows.length) return { transactions: [], errors: ['empty CSV'] };
  const notes = [];
  const hi = findHeaderRow(rows);
  let map, body;
  if (hi >= 0) {
    const headers = rows[hi];
    body = rows.slice(hi + 1);
    if (hi > 0) notes.push(`skipped ${hi} summary line(s) above the header`);
    map = mapByHeader(headers, headers.map((h) => h.trim().toLowerCase()), body, notes);
  } else {
    notes.push('no header row; columns inferred from content');
    map = inferColumns(rows, notes);
    body = map.body;
  }

  const txns = [], dates = [];
  for (const r of body) {
    const date = map.di >= 0 && map.di < r.length ? parseDate(r[map.di]) : null;
    const merchant = map.pi >= 0 && map.pi < r.length ? cleanMerchant(r[map.pi]) : '';
    let amount;
    if (map.dbi >= 0 || map.cri >= 0) {
      const debit = map.dbi >= 0 && map.dbi < r.length ? parseAmount(r[map.dbi]) || 0 : 0;
      const credit = map.cri >= 0 && map.cri < r.length ? parseAmount(r[map.cri]) || 0 : 0;
      amount = credit - debit;
    } else {
      amount = map.ai >= 0 && map.ai < r.length ? parseAmount(r[map.ai]) : null;
    }
    if (amount == null) continue;
    if (map.sgi >= 0 && map.sgi < r.length) { // direction flag column overrides sign
      const f = String(r[map.sgi] ?? '').trim().toLowerCase();
      if (SIGN_DEBIT.has(f)) amount = -Math.abs(amount);
      else if (SIGN_CREDIT.has(f)) amount = Math.abs(amount);
    }
    txns.push({ date, merchant, amount: round2(amount) });
    if (date) dates.push(date);
  }
  // Only warn about the single-Amount sign when it's genuinely ambiguous — i.e.
  // every row is the same sign. When both spend (−) and income (+) appear, the
  // convention is self-evident, so no need to alarm the user.
  const hasPos = txns.some((t) => t.amount > 0), hasNeg = txns.some((t) => t.amount < 0);
  if (map.ai >= 0 && map.dbi < 0 && map.cri < 0 && map.sgi < 0 && !(hasPos && hasNeg)) {
    notes.push('All amounts share one sign — double-check that spend vs. income looks right.');
  }
  dates.sort();
  return {
    source: 'import.csv', currency: null, row_count: txns.length,
    date_range: { start: dates[0] || null, end: dates[dates.length - 1] || null },
    transactions: txns, redacted_columns: map.redacted,
    account_fingerprint: map.account_fingerprint, notes, errors: [],
  };
}

// ── Sign orientation for credit-card exports ──
// Most banks write card charges as negative, but some (Amex-style) export
// charges positive and payments negative — which silently swaps spend/income.
// We can only tell once the user has identified the account as a credit card:
// on a card, the non-payment rows are overwhelmingly charges, so when most of
// them are positive the convention is inverted and every sign flips. Other
// account types (deposits vs spend both legit) are left alone.
const CARD_PAYMENT_RE = /\b(payment|thank you|autopay|auto pay|pymt)\b/i;
export function orientTransactions(txns, accountType) {
  if ((accountType || '').toLowerCase() !== 'credit') return { transactions: txns, flipped: false };
  const charges = txns.filter((t) => t.amount !== 0 && !CARD_PAYMENT_RE.test(t.merchant));
  if (charges.length < 3) return { transactions: txns, flipped: false };
  const positive = charges.filter((t) => t.amount > 0).length;
  if (positive <= charges.length / 2) return { transactions: txns, flipped: false };
  return { transactions: txns.map((t) => ({ ...t, amount: -t.amount })), flipped: true };
}

// ── Recurring-charge (subscription) detection ──
// Categories whose recurring charges are commitments, not cancellable subs —
// rent recurs monthly with a fixed amount but "cancel your rent" is not advice.
const ESSENTIAL_CATEGORIES = new Set(['housing', 'groceries', 'transport']);

// Commitment kinds — loans and insurance are subscriptions with a term
// attached. Keyword rules give the default; the user can override per
// merchant on the Commitments tab (opts.commitments[key].kind wins).
const KIND_RULES = [
  ['loan:home', ['mortgage', 'home loan', 'homeloan']],
  ['loan:auto', ['auto loan', 'car loan', 'auto finance', 'car finance', 'toyota financial', 'honda financial', 'gm financial', 'ford credit', 'nissan finance', 'vw credit', 'tesla finance']],
  ['loan:student', ['student loan', 'osap', 'navient', 'nelnet', 'mohela', 'sallie mae']],
  ['loan', ['loan payment', 'loan pmt', 'personal loan', 'line of credit', 'lendingclub', 'lending club']],
  ['insurance:auto', ['auto insurance', 'car insurance']],
  ['insurance:home', ['home insurance', 'house insurance', 'tenant insurance', 'renters insurance', 'condo insurance']],
  ['insurance:life', ['life insurance']],
  ['insurance', ['insurance', 'assurance', 'geico', 'allstate', 'state farm', 'progressive ins', 'intact', 'aviva', 'wawanesa', 'belairdirect', 'sonnet ins', 'desjardins ins', 'lemonade ins']],
];

export function classifyKind(merchant, category) {
  const ml = (merchant || '').toLowerCase();
  for (const [kind, kws] of KIND_RULES) if (kws.some((k) => ml.includes(k))) return kind;
  if (category === 'housing' || category === 'utilities') return 'bill';
  if (ESSENTIAL_CATEGORIES.has(category)) return 'bill';
  return 'sub';
}

// Standard amortization by simulation — exact, no closed-form rounding drift.
// Returns {months, total_interest} or {underwater:true} when the payment
// doesn't even cover the interest. null on unusable inputs.
export function amortize(balance, annualRatePct, payment) {
  let b = Number(balance);
  const p = Number(payment), i = (Number(annualRatePct) || 0) / 100 / 12;
  if (!(b > 0) || !(p > 0)) return null;
  if (i > 0 && p <= b * i + 0.01) return { underwater: true, months: null, total_interest: null };
  let months = 0, interest = 0;
  while (b > 0 && months < 1200) {
    const int = b * i;
    interest += int;
    b = b + int - p;
    months++;
  }
  return { underwater: false, months, total_interest: round2(interest) };
}

function detectSubscriptions(txns, lastDate, catOf, kindOf) {
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
    // True subscriptions bill IDENTICAL amounts (a price hike just adds a
    // second exact level). Monthly-cadence variable spend (gas fill-ups,
    // grocery runs) never repeats to the cent — drop it.
    const level = {};
    for (const a of amts) { const k = a.toFixed(2); level[k] = (level[k] || 0) + 1; }
    if (!Object.values(level).some((c) => c >= 2)) continue;
    const first = amts[0], last = Math.abs(items[items.length - 1].amount);
    const prior = items.length >= 2 ? Math.abs(items[items.length - 2].amount) : null;
    const lastChargeDate = items[items.length - 1].date;
    // "stopped" = hasn't billed in 45+ days while newer activity exists. NOT money
    // you can recover (it stopped) — only a "did you cancel this?" signal. Active
    // subs are the ones still charging — those are what you actually pay for.
    const stopped = !!(lastDate && daysBetween(lastChargeDate, lastDate) > 45);
    const merchant = items[items.length - 1].merchant || merchantKey(items[0].merchant);
    const category = catOf ? catOf(merchant) : 'other';
    const kind = (kindOf && kindOf(merchant)) || classifyKind(merchant, category);
    subs.push({
      merchant,
      category,
      kind, // loan:* / insurance* / bill / sub — drives the Commitments view
      // Loans, insurance, and bills are obligations, never "cancel this" picks.
      essential: ESSENTIAL_CATEGORIES.has(category) || kind !== 'sub',
      monthly: round2(last), // current billing level, not the historical average
      cadence_days: Math.round(monthlyish.reduce((a, b) => a + b, 0) / monthlyish.length),
      first_amount: round2(first), last_amount: round2(last),
      prior_amount: prior != null ? round2(prior) : null,
      increased: last > first + 0.01, increase_amount: round2(last - first),
      last_date: lastChargeDate,
      charges: items.length,
      active: !stopped, stopped,
    });
  }
  // Active first, then by monthly cost — the ones you're paying lead the list.
  return subs.sort((a, b) => (Number(b.active) - Number(a.active)) || (b.monthly - a.monthly));
}

// ── Safe-to-spend forecast — flow-based (we never see balances): month-to-date
// in/out plus cadence-predicted remaining income (payroll, monthly or biweekly)
// and remaining fixed charges, anchored on the ledger's last day (as_of), so the
// math is deterministic regardless of wall clock or stale imports.
const addDaysIso = (iso, days) => new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10);

function buildForecast(txns, subs, lastDate) {
  if (!lastDate) return null;
  const month = lastDate.slice(0, 7);
  const lastDom = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const monthEndIso = `${month}-${pad2(lastDom)}`;
  const asOfDay = +lastDate.slice(8, 10);
  const inMonth = txns.filter((t) => t.date && t.date.startsWith(month));
  const income_so_far = round2(inMonth.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0));
  const spend_so_far = round2(inMonth.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0));

  // Fixed charges still expected before month end, predicted per active commitment.
  const upcoming_fixed = [];
  for (const s of subs) {
    if (!s.active || !s.last_date || !s.cadence_days) continue;
    let next = addDaysIso(s.last_date, s.cadence_days);
    for (let i = 0; i < 3 && next <= monthEndIso; i++) {
      if (next > lastDate) upcoming_fixed.push({ merchant: s.merchant, amount: s.monthly, expected: next });
      next = addDaysIso(next, s.cadence_days);
    }
  }

  // Recurring income: ≥2 deposits from one source at a biweekly (12–16d) or
  // monthly (24–35d) cadence; one-off bonuses and refunds never project.
  const incomeGroups = {};
  for (const t of txns) if (t.amount > 0 && t.date) (incomeGroups[merchantKey(t.merchant)] ||= []).push(t);
  const expected_income = [];
  for (const items of Object.values(incomeGroups)) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = items.slice(1).map((it, i) => daysBetween(it.date, items[i].date)).sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    if (!((med >= 12 && med <= 16) || (med >= 24 && med <= 35))) continue;
    const last = items[items.length - 1];
    let next = addDaysIso(last.date, Math.round(med));
    for (let i = 0; i < 3 && next <= monthEndIso; i++) {
      if (next > lastDate) expected_income.push({ merchant: last.merchant, amount: round2(last.amount), expected: next });
      next = addDaysIso(next, Math.round(med));
    }
  }

  const upcoming_fixed_total = round2(upcoming_fixed.reduce((a, u) => a + u.amount, 0));
  const expected_income_total = round2(expected_income.reduce((a, u) => a + u.amount, 0));
  // Spend nothing more on day-to-day and the month closes at safe_to_spend.
  const safe_to_spend = round2(income_so_far + expected_income_total - spend_so_far - upcoming_fixed_total);

  // Day-to-day pace: month-to-date spend at non-commitment merchants.
  const commitKeys = new Set(subs.filter((s) => s.active).map((s) => merchantKey(s.merchant)));
  const fixedSoFar = inMonth.filter((t) => t.amount < 0 && commitKeys.has(merchantKey(t.merchant)))
    .reduce((a, t) => a - t.amount, 0);
  const mtd = round2(spend_so_far - fixedSoFar);
  const daily_avg = asOfDay > 0 ? round2(mtd / asOfDay) : 0;
  const projected_remaining = round2(daily_avg * (lastDom - asOfDay));

  upcoming_fixed.sort((a, b) => a.expected.localeCompare(b.expected));
  expected_income.sort((a, b) => a.expected.localeCompare(b.expected));
  return {
    month, as_of: lastDate,
    income_so_far, spend_so_far,
    expected_income, expected_income_total,
    upcoming_fixed, upcoming_fixed_total,
    safe_to_spend,
    on_track_net: round2(safe_to_spend - projected_remaining),
    variable: { mtd, daily_avg, projected_remaining },
  };
}

// ── Debt strategy: simulate paying ALL loans together with a shared extra
// budget. Freed payments roll over when a loan closes (the part people skip),
// and the extra targets one loan: 'avalanche' = highest rate (optimal),
// 'lowest' = lowest rate (what most people do — kept for the comparison).
// Returns {months, total_interest, payoff_months} or {diverges:true}.
export function debtPlan(loans, extra = 0, strategy = 'avalanche') {
  const ls = (loans || [])
    .map((l) => ({ key: l.key, b: Number(l.balance), i: (Number(l.rate_pct) || 0) / 100 / 12, p: Number(l.payment) }))
    .filter((l) => l.b > 0 && l.p > 0);
  if (!ls.length) return null;
  let months = 0, interest = 0;
  const payoff_months = {};
  while (ls.some((l) => l.b > 0) && months < 1200) {
    months++;
    for (const l of ls) if (l.b > 0) { const int = l.b * l.i; l.b += int; interest += int; }
    let pool = Number(extra) || 0;
    for (const l of ls) {
      if (l.b <= 0) { pool += l.p; continue; }   // freed payment rolls over
      const pay = Math.min(l.p, l.b);
      l.b -= pay;
      if (pay < l.p) pool += l.p - pay;          // final-month surplus rolls too
      if (l.b <= 0) payoff_months[l.key] = months;
    }
    while (pool > 0.005) {
      const open = ls.filter((l) => l.b > 0);
      if (!open.length) break;
      const target = strategy === 'lowest'
        ? open.reduce((a, c) => (c.i < a.i ? c : a))
        : open.reduce((a, c) => (c.i > a.i ? c : a));
      const pay = Math.min(pool, target.b);
      target.b -= pay;
      pool -= pay;
      if (target.b <= 0) payoff_months[target.key] = months;
    }
  }
  if (ls.some((l) => l.b > 0)) return { diverges: true };
  return { months, total_interest: round2(interest), payoff_months };
}

// ── Commitments: every recurring obligation, enriched with the user-entered
// terms (balance / rate / renewal date from data/commitments.json) and the
// derived loan math. All deterministic — the agent only narrates these numbers.
const kindGroup = (k) => (k.startsWith('loan') ? 'debt' : k.startsWith('insurance') ? 'insurance' : k === 'bill' ? 'bills' : 'subs');

function buildCommitments(subs, userMap, monthlyIncome, marketBenchmark) {
  const items = subs.map((s) => {
    const key = merchantKey(s.merchant);
    const u = (userMap && userMap[key]) || {};
    const kind = u.kind || s.kind || 'sub';
    const item = {
      merchant: s.merchant, key, kind, group: kindGroup(kind),
      monthly: s.monthly, cadence_days: s.cadence_days, last_date: s.last_date,
      active: s.active, increased: s.increased,
      first_amount: s.first_amount, last_amount: s.last_amount, increase_amount: s.increase_amount,
    };
    if (u.balance != null && u.balance !== '') item.balance = Number(u.balance);
    if (u.rate_pct != null && u.rate_pct !== '') item.rate_pct = Number(u.rate_pct);
    if (u.renewal_date) item.renewal_date = u.renewal_date;
    if (kind.startsWith('loan') && item.balance > 0) {
      const am = amortize(item.balance, item.rate_pct || 0, s.monthly);
      if (am && am.underwater) item.payment_below_interest = true;
      else if (am) { item.months_left = am.months; item.interest_remaining = am.total_interest; }
    }
    return item;
  });
  const active = items.filter((x) => x.active);
  const split = { debt: 0, insurance: 0, bills: 0, subs: 0 };
  for (const x of active) split[x.group] = round2(split[x.group] + x.monthly);
  const monthly_total = round2(active.reduce((a, x) => a + x.monthly, 0));

  // Strategy snapshot for loans with full terms: as-is (each loan on its own)
  // vs rollover (freed payments cascade) — the agent narrates these; the live
  // extra-payment what-ifs stay on the page's Debt strategy slider.
  let debt_strategy = null;
  const eligible = active.filter((x) => x.group === 'debt' && x.balance > 0 && x.monthly > 0 && !x.payment_below_interest);
  if (eligible.length) {
    const loans = eligible.map((x) => ({ key: x.key, balance: x.balance, rate_pct: x.rate_pct || 0, payment: x.monthly }));
    const rollover = debtPlan(loans, 0);
    if (rollover && !rollover.diverges) {
      const independent = eligible.map((x) => amortize(x.balance, x.rate_pct || 0, x.monthly)).filter((a) => a && !a.underwater);
      debt_strategy = {
        order: [...eligible].sort((a, b) => (b.rate_pct || 0) - (a.rate_pct || 0)).map((x) => ({ merchant: x.merchant, rate_pct: x.rate_pct || 0 })),
        as_is: {
          months: Math.max(...independent.map((a) => a.months)),
          total_interest: round2(independent.reduce((s, a) => s + a.total_interest, 0)),
        },
        rollover: { months: rollover.months, total_interest: rollover.total_interest },
      };
    }
  }

  return {
    monthly_total,
    split,
    pct_of_income: monthlyIncome > 0 ? round2((100 * monthly_total) / monthlyIncome) : null,
    debt_strategy,
    market_benchmark: marketBenchmark || null, // anonymous posted-rate avg, page-fetched
    items,
  };
}

// ── Public: roll up an already-parsed, redacted transactions array.
// Shared by the CSV and PDF import paths. `meta` carries source/currency/notes.
export function analyzeTransactions(txns, meta = {}, opts = {}) {
  if (!txns.length) return { ...meta, transactions: [], errors: ['no transactions found'] };
  const overrides = opts.categoryOverrides || null;

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
    // A category stored on the row (user correction) beats the keyword guess.
    const cat = t.category || categorize(t.merchant, overrides);
    catSpend[cat] = (catSpend[cat] || 0) - t.amount;
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

  const userCommitments = opts.commitments || null; // user-entered terms + kind overrides
  const kindOf = userCommitments ? (m) => (userCommitments[merchantKey(m)] || {}).kind || null : null;
  const subs = detectSubscriptions(txns, lastDate, (m) => categorize(m, overrides), kindOf);
  const active = subs.filter((s) => s.active);
  // The headline is what you're STILL paying for cancellable subscriptions —
  // active, non-essential. Recurring commitments (rent etc.) are reported
  // separately so "you pay $X/mo in subs" stays actionable.
  const activeMonthly = round2(active.filter((s) => !s.essential).reduce((a, s) => a + s.monthly, 0));
  const essentialMonthly = round2(active.filter((s) => s.essential).reduce((a, s) => a + s.monthly, 0));

  return {
    source: meta.source || null, currency: meta.currency || null,
    account_fingerprint: meta.account_fingerprint || null,
    date_range: { start: dates[0] || null, end: lastDate },
    notes: meta.notes || [], redacted_columns: meta.redacted_columns || [],
    totals: { spend, income, net: round2(income - spend), months: Object.keys(byMonth).length },
    by_month: Object.fromEntries(Object.entries(byMonth).sort()),
    by_category: byCategory,
    top_merchants: topMerchants,
    subscriptions: subs,
    subscription_monthly_total: activeMonthly,
    recurring_bills_monthly_total: essentialMonthly,
    commitments: buildCommitments(subs, userCommitments,
      Object.keys(byMonth).length ? income / Object.keys(byMonth).length : 0,
      opts.marketBenchmark || null),
    forecast: buildForecast(txns, subs, lastDate),
    active_subscription_count: active.filter((s) => !s.essential).length,
    stopped_subscription_count: subs.filter((s) => !s.active && !s.essential).length,
    transactions: txns,
    errors: [],
  };
}

// ── Public: CSV text → full redacted analysis ──
export function analyzeCsv(text, opts = {}) {
  const ing = ingest(text);
  return analyzeTransactions(ing.transactions, {
    source: ing.source, currency: ing.currency,
    account_fingerprint: ing.account_fingerprint,
    notes: ing.notes, redacted_columns: ing.redacted_columns,
  }, opts);
}
