// analyze.js — CSV parse + redaction + rollup, entirely in the browser.
//
// Ported from the old ingest.py/rollup.py so the skill needs NO python (macOS
// doesn't ship python3 by default). Runs in the Linggen webview, where JS is
// always available. The PRIVACY GATE lives here: account/card/balance columns
// and long digit runs are stripped before anything is rendered or handed to
// the model — analyzeCsv() returns only {date, merchant, amount} rows plus
// aggregates.

import { accountFingerprint } from './hash.js';
import { csvCurrency } from './currency.js';

// Column words, in the languages banks export in (EN, FR, DE, NL, ES). Order
// is priority: a header equal to a key wins, then the first key a header
// contains (see findCol).
const DATE_KEYS = ['transaction date', 'posting date', 'date posted', 'date', 'buchungstag', 'buchungsdatum', 'datum', 'fecha'];
const DESC_KEYS = [
  'description', 'details', 'payee', 'counter party', 'counterparty', 'merchant', 'name', 'memo', 'narrative', 'narration',
  'libellé', 'libelle', 'beguenstigter', 'begünstigter', 'zahlungsempfänger', 'empfänger', 'auftraggeber',
  'naam', 'omschrijving', 'verwendungszweck', 'concepto', 'descripción',
];
const AMOUNT_KEYS = ['amount', 'transaction amount', 'montant', 'betrag', 'bedrag', 'umsatz', 'importe'];
const DEBIT_KEYS = ['debit', 'withdrawal', 'money out', 'paid out', 'funds out', 'débit', 'retrait', 'sortie', 'soll', 'ausgang'];
const CREDIT_KEYS = ['credit', 'deposit', 'money in', 'paid in', 'funds in', 'crédit', 'dépôt', 'depot', 'entrée', 'haben', 'eingang'];
const BALANCE_KEYS = ['balance', 'saldo', 'solde', 'kontostand'];
const REDACT_KEYS = ['account', 'card', 'number', 'iban', 'routing', 'sort code', 'ref', 'konto', 'rekening', 'compte', ...BALANCE_KEYS];
// Columns that may carry the account's own number (fingerprinted, see mapByHeader).
const ACCOUNT_KEYS = ['account', 'card', 'konto', 'iban', 'rekening', 'compte'];
// The words only a credit card's statement prints (pdf-import.js reads them too).
export const CARD_WORDS_RE = /\b(credit limit|minimum payment|available credit|credit available|payment due date|annual interest rate)\b/i;

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

// The column a list of keys names: the first key (in priority order) a
// header equals, else contains — "Betrag" beats "Lastschrift
// Ursprungsbetrag", "Description" beats Chase's DEBIT/CREDIT "Details".
// `skip(header, index)` rules out a column that belongs to something else.
function findCol(headersL, keys, skip = () => false) {
  const ok = (j) => !skip(headersL[j], j);
  for (const k of keys) {
    const exact = headersL.findIndex((h, j) => h === k && ok(j));
    if (exact >= 0) return exact;
    const part = headersL.findIndex((h, j) => h.includes(k) && ok(j));
    if (part >= 0) return part;
  }
  return -1;
}
const namesAny = (keys) => (h) => keys.some((k) => h.includes(k));

function pad2(n) { return String(n).padStart(2, '0'); }

const TIME_RE = /[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[+-]\d{2}:?\d{2}|[A-Za-z]{1,5})?$/;
const NUMERIC_DATE_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;
const validDate = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad2(mo)}-${pad2(d)}` : null);
const fullYear = (y) => (+y < 100 ? +y + 2000 : +y);

// "03/06/2026": `order` says which number is the month — 'dmy' or 'mdy', as
// the whole file reads (dateOrder); without one a first number over 12 is a
// day, else the month (North America).
function numericDate(m, order) {
  const a = +m[1], b = +m[2], y = fullYear(m[3]);
  const dayFirst = order ? order === 'dmy' : a > 12;
  return dayFirst ? validDate(y, b, a) : validDate(y, a, b);
}

export function parseDate(raw, order = null) {
  let s = (raw || '').trim();
  if (!s) return null;
  // Drop a trailing time-of-day ("2026-06-01 09:00:12", ISO offsets, tz codes)
  s = s.replace(TIME_RE, '').trim();
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return validDate(m[1], +m[2], +m[3]); // compact YYYYMMDD (BMO, ING)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return validDate(m[1], +m[2], +m[3]);
  if ((m = s.match(NUMERIC_DATE_RE))) return numericDate(m, order);
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*\.?[ -](\d{4}|\d{2})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) return validDate(fullYear(m[3]), mo + 1, +m[1]);
  }
  if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]; if (mo != null) return validDate(m[3], mo + 1, +m[2]);
  }
  return null;
}

// Day-first currencies: everywhere but North America writes 03/06 as 3 June.
const MONTH_FIRST_CURRENCIES = new Set(['USD', 'CAD']);

/// How a file's numeric dates read: { order: 'dmy' | 'mdy' | null, guessed }.
/// A first number over 12 anywhere makes the file day-first, a second one
/// month-first, a dotted date ("03.06.2026") day-first. With no such date the
/// currency decides (`guessed`: every date could be read either way — the
/// import review should say so); no currency keeps month-first.
export function dateOrder(values, currency = null) {
  let dmy = 0, mdy = 0, loose = 0;
  for (const v of values) {
    const d = String(v || '').trim().replace(TIME_RE, '');
    const m = d.match(NUMERIC_DATE_RE);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 || d.includes('.')) dmy++;
    else if (b > 12) mdy++;
    else if (a !== b) loose++;
  }
  if (dmy && !mdy) return { order: 'dmy', guessed: false };
  if (mdy && !dmy) return { order: 'mdy', guessed: false };
  if (!loose) return { order: null, guessed: false };
  const dayFirst = currency && !MONTH_FIRST_CURRENCIES.has(currency);
  return { order: dayFirst ? 'dmy' : 'mdy', guessed: true };
}

// A sign written after the number: "12.34 DR" / "12.34 CR" / "12.34-".
const TRAILING_SIGN_RE = /(?<=[\d)])\s*(cr|dr|-|\+)\.?$/i;
export const markedCredit = (raw) => /(?<=[\d)])\s*cr\.?$/i.test(String(raw || '').trim());
export const markedDebit = (raw) => /(?<=[\d)])\s*(dr|-)\.?$/i.test(String(raw || '').trim());

export function parseAmount(raw) {
  let s = String(raw || '').trim().replace(/−/g, '-');
  if (!s) return null;
  let sign = 1;
  const tail = TRAILING_SIGN_RE.exec(s);
  if (tail) { sign = /^(dr|-)$/i.test(tail[1]) ? -1 : 1; s = s.slice(0, tail.index); }
  s = s.replace(/[$£€'\s]/g, '');
  if (s.startsWith('(') && s.endsWith(')')) sign = -sign;
  s = s.replace(/[()]/g, '');
  // European decimal comma ("1.234,56" / "3400,00"): dots are thousands.
  if (/^[+-]?\d+(\.\d{3})*,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, ''); // North-American thousands commas
  if (s === '' || s === '-' || s === '+') return null;
  const v = parseFloat(s);
  if (Number.isNaN(v)) return null;
  return sign * v;
}

// Canadian province codes banks append as a location suffix. US states are
// deliberately omitted — too many collide with real words (IN, OR, OK, ME, …).
const CA_PROVINCES = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT';

export function cleanMerchant(raw) {
  const orig = (raw || '').trim();
  let s = orig;
  // Leading bank type-code — BMO "[CW]"/"[DN]"/"[SC]"/"[IN]"/"[DS]" and similar
  // bracketed 2-4 letter codes. The amount sign already encodes in/out, so the
  // code is pure noise: strip it, never interpret it.
  s = s.replace(/^[[(][A-Za-z]{2,4}[\])]\s*/, '');
  s = s.replace(/^(?:0\d{1,5}|\d{4,6})\s+(?=\D)/, '');   // leading store number ("095 HRM REC")
  // Long digit-heavy tokens = transaction references (BMO e-transfer ids), not names.
  s = s.replace(/\b[\dA-Za-z]{8,}\b/g, (t) => {
    const digits = (t.match(/\d/g) || []).length;
    return digits >= 6 && digits / t.length >= 0.5 ? '' : t;
  });
  s = s.replace(/\b\d{6,}\b/g, '');     // long pure-digit runs (card/acct fragments)
  s = s.replace(/[*#]+\d+/g, '');       // *1234 / #0099 store/card tails
  // Trailing "CITY <PROV>" location suffix: drop the province + the city word
  // before it, but only when ≥2 tokens remain (never reduce a name to nothing,
  // which also guards against "ON"/"PE" matching a real trailing word).
  const stripped = s.replace(new RegExp(`\\s+[A-Za-z][A-Za-z.'-]+\\s+(?:${CA_PROVINCES})\\s*$`), '').trim();
  if (stripped.split(/\s+/).filter(Boolean).length >= 2) s = stripped;
  s = s.replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
  return (s || orig).slice(0, 80); // never blank — a code-only merchant ("[IN]") keeps its original
}

export function merchantKey(m) {
  const up = (m || '').toUpperCase().replace(/\d+/g, '').replace(/[^A-Z& ]/g, ' ');
  const toks = up.split(/\s+/).filter((t) => t.length > 1);
  return toks.slice(0, 3).join(' ') || 'UNKNOWN';
}

// Word-boundary keyword matcher. Critical for short tokens used as transfer
// signals: a substring "tf" would match inside "neTFlix" and silently erase
// real spend. A "boundary" here is any non-alphanumeric char (or string edge),
// so "amex" matches "[CW]AMEX CARDS" but "tf" never matches "netflix".
export function keywordRe(kw) {
  const e = String(kw).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${e}([^a-z0-9]|$)`, 'i');
}

// Reserved override values that are NOT spend categories — they live in the same
// user map (config.category_overrides) but mean "exclude from money math"
// (transfer) or "force-treat-as-income" (income). Handled in ledger.js, skipped
// here so they never leak into the category breakdown.
const RESERVED_CLASS = new Set(['transfer', 'income']);

export function categorize(m, overrides) {
  const ml = (m || '').toLowerCase();
  if (overrides) {
    // Longest matching keyword wins — a specific rule ("uber eats") must beat a
    // broader earlier one ("uber") regardless of object-key insertion order.
    // Mirrors ledger.js userTransferRule; the two must not disagree.
    let best = null, len = -1;
    for (const [kw, cat] of Object.entries(overrides)) {
      if (kw && !RESERVED_CLASS.has(cat) && kw.length > len && ml.includes(kw.toLowerCase())) { best = cat; len = kw.length; }
    }
    if (best != null) return best; // user-configured wins
  }
  for (const [cat, kws] of CATEGORY_RULES) if (kws.some((k) => ml.includes(k))) return cat;
  return 'other';
}

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const round2 = (n) => Math.round(n * 100) / 100;

// ── Header detection + column mapping ──
// Direction-flag columns some banks use instead of signs (ING "Af"/"Bij", DR/CR,
// the German "S"/"H" of Soll/Haben).
const SIGN_DEBIT = new Set(['af', 'dr', 'd', 'db', 'dbit', 'debit', 'withdrawal', 's', 'soll']);
const SIGN_CREDIT = new Set(['bij', 'cr', 'c', 'credit', 'deposit', 'h', 'haben']);
const HEADER_HINTS = [...new Set([
  ...DATE_KEYS, ...DESC_KEYS, ...AMOUNT_KEYS, ...DEBIT_KEYS, ...CREDIT_KEYS, ...REDACT_KEYS,
  'cheque', 'category', 'status', 'type', 'memo', 'running bal', 'currency', 'fee', 'state',
  'time', 'valuta', 'wertstellung', 'währung', 'waehrung', 'devise',
])];
const CURRENCY_COL_RE = /^[a-z]{3}\s*\$$|^\$$/; // RBC-style "CAD$" / "USD$" amount columns
// A header naming what a direction-flag column holds.
const FLAG_HEADER_RE = /type|direction|soll|haben|dr\s*\/\s*cr|cr\s*\/\s*dr|af\s*bij|debit\s*\/\s*credit/;

const cellAt = (r, i) => (i >= 0 && i < r.length ? String(r[i] ?? '') : '');
const filledValues = (body, i) => body.map((r) => cellAt(r, i).trim()).filter(Boolean);
const isAmountCell = (v) => parseDate(v) == null && parseAmount(v) != null;

// A header row is pure labels — no date- or amount-parseable cells — naming a
// date column and at least one more known column concept. Scanning the first
// rows also skips summary preambles (BofA's balance block, BMO's "data is
// valid as of" line, DKB's "Kontonummer:" lines).
function findHeaderRow(rows) {
  const hint = (l) => HEADER_HINTS.some((k) => l.includes(k)) || CURRENCY_COL_RE.test(l);
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c).trim().toLowerCase()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.some((c) => parseDate(c) != null || parseAmount(c) != null)) continue;
    if (cells.filter(hint).length >= 2 && cells.some(namesAny(DATE_KEYS))) return i;
  }
  return -1;
}

// The value (nearly) every row repeats — the account's own number. A
// counterparty's number (N26 "Account number", Sparkasse "Kontonummer/IBAN",
// Wise "Payee Account Number") changes row to row, or is blank on most rows,
// and names no account of yours. `values` is the column, one cell per row.
function steadyValue(values) {
  const n = new Map();
  let top = null, best = 0;
  for (const v of values.map((c) => String(c ?? '').trim()).filter(Boolean)) {
    n.set(v, (n.get(v) || 0) + 1);
    if (n.get(v) > best) { top = v; best = n.get(v); }
  }
  return values.length && best / values.length >= 0.6 ? top : null;
}

// A column holding one value on every row (three or more) — the account
// holder's own name, never the merchant.
function constantColumn(body, i) {
  const vals = body.map((r) => cellAt(r, i).trim());
  return body.length >= 3 && !!vals[0] && vals.every((v) => v === vals[0]);
}

// A direction-flag column: every value a flag, and the header says so or the
// column holds both directions (a lone "C" column may just mean "cleared").
function flagColumn(headersL, body, taken) {
  const width = Math.max(0, ...body.map((r) => r.length));
  for (let i = 0; i < width; i++) {
    if (taken.includes(i)) continue;
    const vals = filledValues(body, i).map((v) => v.toLowerCase());
    if (!vals.length || !vals.every((v) => SIGN_DEBIT.has(v) || SIGN_CREDIT.has(v))) continue;
    const both = vals.some((v) => SIGN_DEBIT.has(v)) && vals.some((v) => SIGN_CREDIT.has(v));
    if (both || FLAG_HEADER_RE.test(headersL?.[i] || '')) return i;
  }
  return -1;
}

// No amount header: the rightmost column that reads as money and is not a
// balance, account or reference column.
function guessAmountColumn(headersL, body) {
  for (let i = headersL.length - 1; i >= 0; i--) {
    if (namesAny(REDACT_KEYS)(headersL[i])) continue;
    const vals = filledValues(body, i);
    if (vals.length && vals.filter(isAmountCell).length / vals.length >= 0.9) return i;
  }
  return headersL.length - 1;
}

function mapByHeader(headers, headersL, body, notes) {
  let di = findCol(headersL, DATE_KEYS);
  let pi = findCol(headersL, DESC_KEYS, (h, j) => constantColumn(body, j));
  // One signed amount column wins over a debit/credit pair; "Debit Amount" and
  // "Credit Amount" (Lloyds) are the pair, not the amount.
  let ai = findCol(headersL, AMOUNT_KEYS, namesAny([...DEBIT_KEYS, ...CREDIT_KEYS, ...BALANCE_KEYS]));
  let dbi = ai >= 0 ? -1 : findCol(headersL, DEBIT_KEYS, namesAny(BALANCE_KEYS));
  let cri = ai >= 0 ? -1 : findCol(headersL, CREDIT_KEYS, namesAny(BALANCE_KEYS));
  if (dbi >= 0 && dbi === cri) { dbi = -1; cri = -1; } // one "Soll/Haben" column is a flag, not money
  if (ai < 0 && dbi < 0 && cri < 0) {
    // Currency-named amount columns (RBC "CAD$"/"USD$") — prefer the fullest.
    const cands = headersL.map((h, i) => (CURRENCY_COL_RE.test(h) ? i : -1)).filter((i) => i >= 0);
    const fill = (i) => filledValues(body, i).length;
    if (cands.length) ai = cands.sort((a, b) => fill(b) - fill(a))[0];
  }
  if (di < 0) di = 0;
  if (pi < 0) pi = Math.min(1, headers.length - 1);
  if (ai < 0 && dbi < 0 && cri < 0) { ai = guessAmountColumn(headersL, body); notes.push('no amount column recognized; guessed one'); }
  const redacted = headers.filter((h, i) => namesAny(REDACT_KEYS)(headersL[i]));

  // Fingerprint the account from its number column (hashed; the raw number is
  // discarded, never stored) so re-imports of the same card auto-group. Try
  // every account/card-named column and keep the first whose steady value
  // carries enough digits — skips name columns like Amex's "Card Member" and
  // a counterparty's number.
  let account_fingerprint = null;
  for (let i = 0; i < headersL.length && !account_fingerprint; i++) {
    if (namesAny(ACCOUNT_KEYS)(headersL[i])) account_fingerprint = accountFingerprint(steadyValue(body.map((r) => cellAt(r, i))));
  }
  const sgi = flagColumn(headersL, body, [di, pi, ai, dbi, cri]);
  const balance = headersL.some(namesAny(BALANCE_KEYS));
  return { di, pi, ai, dbi, cri, sgi, redacted, account_fingerprint, balance };
}

// Does column `bi` move by column `ai`'s amounts, row to row, in either
// statement order? Then `bi` is the running balance and `ai` the amount.
function runsAsBalance(body, bi, ai) {
  const pairs = body.map((r) => [parseAmount(cellAt(r, bi)), parseAmount(cellAt(r, ai))]);
  if (pairs.length < 2 || pairs.some(([b, a]) => b == null || a == null)) return false;
  const near = (x) => Math.abs(x) < 0.005;
  const oldestFirst = pairs.slice(1).every(([b, a], i) => near(b - pairs[i][0] - a));
  const newestFirst = pairs.slice(1).every(([b], i) => near(pairs[i][0] - b - pairs[i][1]));
  return oldestFirst || newestFirst;
}

// Leading rows shaped unlike the rest (PNC's one-line account summary above
// headerless rows) are not transactions.
function dropOddLeadingRows(body, notes) {
  const count = new Map();
  for (const r of body) count.set(r.length, (count.get(r.length) || 0) + 1);
  const usual = [...count.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  let k = 0;
  while (k < 3 && body.length - k > 2 && body[k].length !== usual) k++;
  if (k) notes.push(`skipped ${k} summary line(s) shaped unlike the rows`);
  return body.slice(k);
}

// No header row (TD, CIBC, Wells Fargo, foreign-language headers): classify
// every column by its CONTENT — date-parse rate, numeric rate, digit-heavy
// (account numbers / IBANs), direction flags, text length — and assign roles.
function inferColumns(bodyIn, notes) {
  let body = dropOddLeadingRows(bodyIn, notes);
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
    const vals = filledValues(body, i);
    const n = vals.length;
    stats.push({
      i, n,
      fillRate: n / body.length,
      dates: n ? vals.filter((v) => parseDate(v) != null).length / n : 0,
      digitHeavy: n > 0 && vals.filter((v) => /\d{6,}/.test(v.replace(/[\s-]/g, ''))).length / n > 0.8,
      nums: n ? vals.filter(isAmountCell).length / n : 0,
      flags: n > 0 && vals.every((v) => SIGN_DEBIT.has(v.toLowerCase()) || SIGN_CREDIT.has(v.toLowerCase())),
      avgLen: n ? vals.reduce((a, v) => a + v.length, 0) / n : 0,
      steady: steadyValue(body.map((r) => cellAt(r, i))),
    });
  }
  let di = -1, bestDates = 0.7;
  for (const c of stats) if (c.dates > bestDates) { di = c.i; bestDates = c.dates; }
  const sgi = stats.find((c) => c.i !== di && c.flags)?.i ?? -1;

  let cands = stats.filter((c) => c.i !== di && c.i !== sgi && !c.digitHeavy && c.n > 0 && c.nums >= 0.99);
  let balance = false;
  // A trailing always-filled numeric column next to sparse ones is the running balance.
  if (cands.length >= 2) {
    const last = cands[cands.length - 1];
    if (last.fillRate >= 0.99 && cands.slice(0, -1).some((c) => c.fillRate < 0.99)) { cands = cands.slice(0, -1); balance = true; }
  }
  let ai = -1, dbi = -1, cri = -1;
  if (cands.length === 1) ai = cands[0].i;
  else if (cands.length >= 2) {
    const [a, b] = cands;
    const both = body.filter((r) => cellAt(r, a.i).trim() && cellAt(r, b.i).trim()).length;
    // Mutually exclusive pair = debit,credit (debit-first convention); else
    // both-filled means amount + running balance — the balance is the column
    // that moves by the other's amounts, else the rightmost.
    if (both / body.length <= 0.2) { dbi = a.i; cri = b.i; } else {
      const aIsBalance = runsAsBalance(body, a.i, b.i);
      ai = aIsBalance ? b.i : a.i;
      balance = aIsBalance || runsAsBalance(body, b.i, a.i);
    }
  }
  const fp = stats.find((c) => c.i !== di && c.digitHeavy && c.steady);
  const textish = (c) => c.i !== di && c.i !== sgi && !c.digitHeavy && c.dates < 0.5 && c.nums < 0.5 && c.avgLen >= 3 && c.n > 0;
  const pi = (stats.find((c) => c.i > di && textish(c)) || stats.find(textish) || { i: di + 1 }).i;
  return {
    di: di >= 0 ? di : 0, pi, ai, dbi, cri, sgi, redacted: [],
    account_fingerprint: fp ? accountFingerprint(fp.steady) : null,
    balance, body,
  };
}

// ── What the statement is: a card's or a bank's ──
// 'credit' when only card signs show (card words, a card-number column, a
// "payment — thank you" row), 'bank' when only bank signs do (a balance
// column, an IBAN, BMO's "First Bank Card", payroll or e-transfer rows), else null
// and the file name decides (accounts.js guessType).
const CARD_COLUMN_RE = /\bcard\s*(#|no\b|no\.|number|member)|cardmember|cardholder/;
const BANK_COLUMN_RE = /balance|saldo|solde|kontostand|iban|sort code|first bank card|cheque|check or slip|check #|check number/;
const CARD_PAYMENT_ROW_RE = /\bpayment\s*(received|-?\s*thank you)|thank you for your payment/i;
const BANK_ROW_RE = /\b(payroll|salary|salaire|salaris|gehalt|lohn|direct dep(osit)?|direct debit|e-?transfer|interac|atm withdrawal|virement)\b/i;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
export function csvKind(headersL, body, merchants, text, balance) {
  const heads = headersL || [];
  const iban = body.some((r) => r.some((c) => IBAN_RE.test(String(c).replace(/\s/g, ''))));
  const credit = CARD_WORDS_RE.test(text) || heads.some((h) => CARD_COLUMN_RE.test(h)) || merchants.some((m) => CARD_PAYMENT_ROW_RE.test(m));
  const bank = !!balance || iban || heads.some((h) => BANK_COLUMN_RE.test(h)) || merchants.some((m) => BANK_ROW_RE.test(m));
  if (credit === bank) return null;
  return credit ? 'credit' : 'bank';
}

// ── Redact + normalize ──
// A row's signed amount: its amount column (an unmarked amount in a column
// that marks only its credits "CR" is a debit), else credit − debit, then a
// direction flag, when there is one, sets the sign.
function rowAmount(r, map, unmarkedDebit) {
  let amount = null;
  if (map.ai >= 0) {
    const cell = cellAt(r, map.ai);
    amount = parseAmount(cell);
    if (amount != null && unmarkedDebit && !markedCredit(cell)) amount = -Math.abs(amount);
  } else if (map.dbi >= 0 || map.cri >= 0) {
    amount = Math.abs(parseAmount(cellAt(r, map.cri)) || 0) - Math.abs(parseAmount(cellAt(r, map.dbi)) || 0);
  }
  if (amount == null || map.sgi < 0) return amount;
  const f = cellAt(r, map.sgi).trim().toLowerCase();
  if (SIGN_DEBIT.has(f)) return -Math.abs(amount);
  if (SIGN_CREDIT.has(f)) return Math.abs(amount);
  return amount;
}

// The amount column marks only its credits ("3,400.00 CR"): the rest are debits.
function creditsOnlyMarked(body, ai) {
  if (ai < 0) return false;
  const vals = filledValues(body, ai);
  return vals.some(markedCredit) && !vals.some(markedDebit);
}

function ingest(textIn) {
  const text = String(textIn || '').replace(/^﻿/, ''); // a UTF-8 byte-order mark
  const rows = parseCsv(text, sniffDelimiter(text));
  if (!rows.length) return { transactions: [], errors: ['empty CSV'] };
  const notes = [];
  const hi = findHeaderRow(rows);
  let map, body, headersL = null;
  if (hi >= 0) {
    const headers = rows[hi];
    body = rows.slice(hi + 1);
    if (hi > 0) notes.push(`skipped ${hi} summary line(s) above the header`);
    headersL = headers.map((h) => h.trim().toLowerCase());
    map = mapByHeader(headers, headersL, body, notes);
  } else {
    notes.push('no header row; columns inferred from content');
    map = inferColumns(rows, notes);
    body = map.body;
  }

  // The statement's own currency, when it says (see currency.js) — it also
  // settles how "03/06" reads when no date in the file does.
  const cur = csvCurrency(headersL, body, map.ai, text);
  const order = dateOrder(body.map((r) => cellAt(r, map.di)), cur.currency);
  if (order.guessed) notes.push(`Dates like 03/06 could be day or month first — read as ${order.order === 'dmy' ? 'day/month' : 'month/day'}; check them.`);
  const unmarkedDebit = creditsOnlyMarked(body, map.ai);
  const txns = [], dates = [];
  for (const r of body) {
    const amount = rowAmount(r, map, unmarkedDebit);
    if (amount == null) continue;
    const date = parseDate(cellAt(r, map.di), order.order);
    txns.push({ date, merchant: cleanMerchant(cellAt(r, map.pi)), amount: round2(amount) });
    if (date) dates.push(date);
  }
  // Only warn about the single-Amount sign when it's genuinely ambiguous — i.e.
  // every row is the same sign. When both spend (−) and income (+) appear, the
  // convention is self-evident, so no need to alarm the user.
  const hasPos = txns.some((t) => t.amount > 0), hasNeg = txns.some((t) => t.amount < 0);
  if (map.ai >= 0 && map.sgi < 0 && !(hasPos && hasNeg)) {
    notes.push('All amounts share one sign — double-check that spend vs. income looks right.');
  }
  dates.sort();
  return {
    source: 'import.csv', currency: cur.currency, currency_ambiguous: cur.ambiguous, row_count: txns.length,
    date_range: { start: dates[0] || null, end: dates[dates.length - 1] || null },
    transactions: txns, redacted_columns: map.redacted,
    account_fingerprint: map.account_fingerprint,
    kind: csvKind(headersL, body, txns.map((t) => t.merchant), text, map.balance),
    notes, errors: [],
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
  ['loan:home', ['mortgage', 'home loan', 'homeloan', 'mtg', 'hypotheque', 'hypothèque']],
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
    if (avg === 0) continue;
    // True subscriptions bill IDENTICAL amounts and cluster on a few exact
    // levels — a price hike just adds a second exact level. Monthly-cadence
    // variable spend (gas fill-ups, grocery runs) rarely repeats to the cent.
    // Gate on level STRUCTURE, not on the max/avg spread: a genuine hike
    // ([8,8,20]) has a wide spread but is still a clean two-level series, and a
    // spread guard would wrongly drop it — and its price-creep alert with it.
    const level = {};
    for (const a of amts) { const k = a.toFixed(2); level[k] = (level[k] || 0) + 1; }
    // Most charges must sit on a repeated exact level; otherwise it's variable
    // spend that merely happens to recur monthly.
    const onLevel = Object.values(level).filter((c) => c >= 2).reduce((a, c) => a + c, 0);
    if (onLevel < amts.length * 0.6) continue;
    const first = amts[0], last = Math.abs(items[items.length - 1].amount);
    const firstChargeDate = items[0].date;
    const lastChargeDate = items[items.length - 1].date;
    // Baseline for hike detection = the price LEVEL just before the current one.
    // Walk back over the trailing run of charges equal to `last`; the charge
    // before that run is the prior level. Comparing `last` to the immediately
    // preceding charge misses a sustained rise once the new price repeats
    // (148,148,148 → 171,171,171 reads as no change); comparing to the all-time
    // first charge falsely flags a promo/partial first month. This does both
    // right: it tracks the level change and stays flagged while it holds.
    const eqAmt = (a, b) => Math.abs(a - b) <= 0.01;
    let ri = amts.length - 1;
    while (ri > 0 && eqAmt(amts[ri - 1], last)) ri--;
    let baseline = ri > 0 ? amts[ri - 1] : null;
    // Ignore a lone promo/partial first charge (a $1 trial before a steady $8):
    // it's the very first charge, never recurs, and is a fraction of the
    // current price — not a real prior level. A modest first step (16.49 →
    // 18.99) is a genuine hike and is kept.
    if (baseline != null && ri - 1 === 0
      && amts.filter((a) => eqAmt(a, baseline)).length === 1
      && baseline < last * 0.6) baseline = null;
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
      // `prior_amount` = the prior price LEVEL (the display's "from" baseline),
      // not merely the charge before last, so the creep line reads level→level.
      prior_amount: baseline != null ? round2(baseline) : null,
      increased: baseline != null && last > baseline + 0.01,
      increase_amount: round2(baseline != null && last > baseline ? last - baseline : 0),
      first_date: firstChargeDate,
      last_date: lastChargeDate,
      charges: items.length,
      active: !stopped, stopped,
    });
  }
  // Active first, then by monthly cost — the ones you're paying lead the list.
  return subs.sort((a, b) => (Number(b.active) - Number(a.active)) || (b.monthly - a.monthly));
}

// ── Anomaly watch — deterministic detectors for money leaks. Every item is a
// QUESTION for the user, not an accusation: legit same-amount pairs exist.
// id is stable so dismissals persist across recomputes.
function detectAnomalies(txns, subs, lastDate, catOf) {
  if (!lastDate) return [];
  const out = [];
  const charges = txns.filter((t) => t.amount < 0 && t.date);
  const groups = {};
  for (const t of charges) (groups[merchantKey(t.merchant)] ||= []).push(t);
  for (const items of Object.values(groups)) items.sort((a, b) => a.date.localeCompare(b.date));

  // Double charges: same merchant, same amount (≥$20), ≤3 days apart.
  const byKeyAmt = {};
  for (const t of charges) {
    if (-t.amount < 20) continue; // two same-day coffees are life, not fraud
    (byKeyAmt[`${merchantKey(t.merchant)}|${(-t.amount).toFixed(2)}`] ||= []).push(t);
  }
  for (const [k, items] of Object.entries(byKeyAmt)) {
    items.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < items.length; i++) {
      if (daysBetween(items[i].date, items[i - 1].date) <= 3) {
        out.push({
          type: 'double_charge', merchant: items[i].merchant, amount: round2(-items[i].amount),
          date: items[i].date, prior_date: items[i - 1].date,
          id: `double|${k}|${items[i].date}`,
        });
      }
    }
  }

  // New recurring: a confirmed subscription whose first charge is recent.
  for (const s of subs) {
    if (!s.active || !s.first_date || s.essential) continue;
    if (daysBetween(s.first_date, lastDate) <= 75 && s.charges >= 2) {
      out.push({
        type: 'new_recurring', merchant: s.merchant, amount: s.monthly,
        date: s.first_date, id: `newrec|${merchantKey(s.merchant)}|${s.first_date}`,
      });
    }
  }

  // Trial converts: a single-ever, recent, subscription-looking charge.
  for (const [key, items] of Object.entries(groups)) {
    if (items.length !== 1) continue;
    const t = items[0];
    if (daysBetween(t.date, lastDate) > 40 || -t.amount > 60) continue;
    if ((catOf ? catOf(t.merchant) : categorize(t.merchant, null)) !== 'subscriptions') continue;
    out.push({
      type: 'trial_charge', merchant: t.merchant, amount: round2(-t.amount),
      date: t.date, id: `trial|${key}|${t.date}`,
    });
  }

  // Bill spikes: a monthly-cadence merchant charging ≥3× its usual (and ≥$30
  // over). Computed independently of the sub detector — a spike is exactly
  // what disqualifies a merchant from "stable subscription".
  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 4) continue;
    const gaps = items.slice(1).map((it, i) => daysBetween(it.date, items[i].date)).sort((a, b) => a - b);
    const medGap = gaps[Math.floor(gaps.length / 2)];
    if (medGap < 20 || medGap > 40) continue;
    for (const t of items) {
      if (daysBetween(t.date, lastDate) > 60) continue;
      const others = items.filter((o) => o !== t).map((o) => -o.amount).sort((a, b) => a - b);
      const med = others[Math.floor(others.length / 2)];
      if (med > 0 && -t.amount >= 3 * med && -t.amount - med >= 30) {
        out.push({
          type: 'bill_spike', merchant: t.merchant, amount: round2(-t.amount),
          usual: round2(med), date: t.date, id: `spike|${key}|${t.date}`,
        });
      }
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
}

// ── Safe-to-spend forecast — flow-based (we never see balances): month-to-date
// in/out plus cadence-predicted remaining income (payroll, monthly or biweekly)
// and remaining fixed charges, anchored on the ledger's last day (as_of), so the
// math is deterministic regardless of wall clock or stale imports.
const addDaysIso = (iso, days) => new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10);

// ≥2 deposits from one source at a biweekly (12–16d) or monthly (24–35d)
// cadence. Shared by the forecast and the bill calendar.
function detectRecurringIncome(txns) {
  const groups = {};
  for (const t of txns) if (t.amount > 0 && t.date) (groups[merchantKey(t.merchant)] ||= []).push(t);
  const out = [];
  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = items.slice(1).map((it, i) => daysBetween(it.date, items[i].date)).sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    if (!((med >= 12 && med <= 16) || (med >= 24 && med <= 35))) continue;
    const last = items[items.length - 1];
    out.push({ key, merchant: last.merchant, amount: round2(last.amount), cadence_days: Math.round(med), last_date: last.date });
  }
  return out;
}

// ── Bill calendar — paid + expected fixed-payment events for the as_of month
// and the month after: commitments (out), recurring income (in). Card-payment
// events join at the ledger layer, where accounts and transfers are known.
function buildBillCalendar(txns, subs, lastDate) {
  if (!lastDate) return [];
  const month = lastDate.slice(0, 7);
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  const windowEnd = `${nextMonth}-${pad2(new Date(Date.UTC(+nextMonth.slice(0, 4), +nextMonth.slice(5, 7), 0)).getUTCDate())}`;
  const events = [];

  const recs = detectRecurringIncome(txns);
  const incomeKeys = new Set(recs.map((r) => r.key));
  const commitKeys = new Set(subs.filter((s) => s.active).map((s) => merchantKey(s.merchant)));

  // Actuals within the current month.
  for (const t of txns) {
    if (!t.date || !t.date.startsWith(month) || t.date > lastDate) continue;
    const key = merchantKey(t.merchant);
    if (t.amount < 0 && commitKeys.has(key)) events.push({ date: t.date, label: t.merchant, amount: round2(t.amount), kind: 'bill', status: 'paid' });
    else if (t.amount > 0 && incomeKeys.has(key)) events.push({ date: t.date, label: t.merchant, amount: round2(t.amount), kind: 'income', status: 'paid' });
  }
  // Expected, stepped per cadence through the end of next month.
  for (const s of subs) {
    if (!s.active || !s.last_date || !s.cadence_days) continue;
    let next = addDaysIso(s.last_date, s.cadence_days);
    for (let i = 0; i < 5 && next <= windowEnd; i++) {
      if (next > lastDate) events.push({ date: next, label: s.merchant, amount: -s.monthly, kind: 'bill', status: 'expected' });
      next = addDaysIso(next, s.cadence_days);
    }
  }
  for (const rec of recs) {
    let next = addDaysIso(rec.last_date, rec.cadence_days);
    for (let i = 0; i < 5 && next <= windowEnd; i++) {
      if (next > lastDate) events.push({ date: next, label: rec.merchant, amount: rec.amount, kind: 'income', status: 'expected' });
      next = addDaysIso(next, rec.cadence_days);
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

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

  // Recurring income: one-off bonuses and refunds never project.
  const expected_income = [];
  for (const rec of detectRecurringIncome(txns)) {
    let next = addDaysIso(rec.last_date, rec.cadence_days);
    for (let i = 0; i < 3 && next <= monthEndIso; i++) {
      if (next > lastDate) expected_income.push({ merchant: rec.merchant, amount: rec.amount, expected: next });
      next = addDaysIso(next, rec.cadence_days);
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

// ── Per-category monthly budgets: deterministic current-month state against
// the user's caps (config.budgets — the UI is the only writer; the agent only
// narrates). Same anchoring law as the forecast: everything is relative to the
// ledger's last day, never the wall clock, so stale imports stay honest.
function buildBudgets(txns, subs, budgets, lastDate, catOf) {
  if (!lastDate || !budgets) return null;
  const caps = Object.entries(budgets).filter(([, cap]) => Number(cap) > 0);
  if (!caps.length) return null;
  const month = lastDate.slice(0, 7);
  const lastDom = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const monthEndIso = `${month}-${pad2(lastDom)}`;
  const asOfDay = +lastDate.slice(8, 10);
  const commitKeys = new Set(subs.filter((s) => s.active).map((s) => merchantKey(s.merchant)));

  // Month-to-date per category, split variable vs committed: only the variable
  // part paces forward — rent already paid must not multiply.
  const mtd = {}, variable = {};
  for (const t of txns) {
    if (t.amount >= 0 || !t.date || !t.date.startsWith(month)) continue;
    const cat = catOf(t);
    mtd[cat] = (mtd[cat] || 0) - t.amount;
    if (!commitKeys.has(merchantKey(t.merchant))) variable[cat] = (variable[cat] || 0) - t.amount;
  }

  // Fixed charges still expected this month, bucketed to the committed
  // merchant's category — a cap on recreation should see Netflix coming.
  // The category is the one its newest charge reads as, per-row correction
  // included: bucketing by merchant alone put a corrected Netflix's next bill
  // back under "subscriptions" while its paid ones sat in the user's category.
  // `>=` keeps the last of a same-day tie, the row detectSubscriptions' stable
  // sort ends on.
  const lastCharge = {};
  for (const t of txns) {
    if (t.amount >= 0 || !t.date) continue;
    const k = merchantKey(t.merchant);
    if (!lastCharge[k] || t.date >= lastCharge[k].date) lastCharge[k] = t;
  }
  const upcoming = {};
  for (const s of subs) {
    if (!s.active || !s.last_date || !s.cadence_days) continue;
    const cat = catOf(lastCharge[merchantKey(s.merchant)] || { merchant: s.merchant, category: null });
    let next = addDaysIso(s.last_date, s.cadence_days);
    for (let i = 0; i < 3 && next <= monthEndIso; i++) {
      if (next > lastDate) upcoming[cat] = (upcoming[cat] || 0) + s.monthly;
      next = addDaysIso(next, s.cadence_days);
    }
  }

  const projection_ready = asOfDay >= 7; // pace on day 2 is noise — totals still show
  const rank = { over: 0, pacing: 1, ok: 2 };
  const categories = caps.map(([category, cap]) => {
    const spent = round2(mtd[category] || 0);
    const vari = variable[category] || 0;
    const fixedSoFar = (mtd[category] || 0) - vari;
    const projected = round2((asOfDay > 0 ? (vari / asOfDay) * lastDom : 0)
      + fixedSoFar + (upcoming[category] || 0));
    const state = spent >= cap ? 'over'
      : (projection_ready && projected > cap ? 'pacing' : 'ok');
    return { category, budget: round2(+cap), mtd: spent, projected, state };
  }).sort((a, b) => (rank[a.state] - rank[b.state]) || b.mtd - a.mtd);

  return { month, as_of: lastDate, projection_ready, categories };
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
      first_amount: s.first_amount, last_amount: s.last_amount,
      prior_amount: s.prior_amount, increase_amount: s.increase_amount,
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

// ── Budgets alone, over rows already in ONE currency — the ledger's
// multi-currency view converts other currencies' spending into the budget
// currency first (approximate, and marked so), then asks here.
export function budgetsFor(txns, opts = {}) {
  if (!txns.length || !opts.budgets) return null;
  const overrides = opts.categoryOverrides || null;
  txns = txns.map((t) => ({ ...t, merchant: cleanMerchant(t.merchant) }));
  const dates = txns.filter((t) => t.date).map((t) => t.date).sort();
  const lastDate = dates[dates.length - 1] || null;
  const userCommitments = opts.commitments || null;
  const kindOf = userCommitments ? (m) => (userCommitments[merchantKey(m)] || {}).kind || null : null;
  const subs = detectSubscriptions(txns, lastDate, (m) => categorize(m, overrides), kindOf);
  return buildBudgets(txns, subs, opts.budgets, lastDate, (t) => t.category || categorize(t.merchant, overrides));
}

// ── Public: roll up an already-parsed, redacted transactions array.
// Shared by the CSV and PDF import paths. `meta` carries source/currency/notes.
export function analyzeTransactions(txns, meta = {}, opts = {}) {
  if (!txns.length) return { ...meta, transactions: [], errors: ['no transactions found'] };
  const overrides = opts.categoryOverrides || null;
  // Normalize merchant names once, here — so top-merchants, subscription keys,
  // categories, and the transactions the agent sees are all clean. The ledger
  // keeps its raw strings (txn ids stay stable); this only shapes the computed
  // view, and so it cleans already-imported rows too, not just new ones.
  txns = txns.map((t) => ({ ...t, merchant: cleanMerchant(t.merchant) }));

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

  const catSpend = {}, merch = {}, catMonthly = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    // A category stored on the row (user correction) beats the keyword guess.
    const cat = t.category || categorize(t.merchant, overrides);
    catSpend[cat] = (catSpend[cat] || 0) - t.amount;
    if (t.date) {
      const m = t.date.slice(0, 7);
      (catMonthly[cat] ||= {})[m] = (catMonthly[cat][m] || 0) - t.amount;
    }
    const mk = merchantKey(t.merchant);
    (merch[mk] ||= { spend: 0, count: 0 });
    merch[mk].spend -= t.amount; merch[mk].count += 1;
  }
  const byCategoryMonthly = Object.fromEntries(Object.entries(catMonthly).map(([c, ms]) =>
    [c, Object.fromEntries(Object.entries(ms).sort().map(([m, v]) => [m, round2(v)]))]));
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
    budgets: buildBudgets(txns, subs, opts.budgets || null, lastDate,
      (t) => t.category || categorize(t.merchant, overrides)),
    by_category_monthly: byCategoryMonthly,
    anomalies: detectAnomalies(txns, subs, lastDate, (m) => categorize(m, overrides)),
    bill_calendar: buildBillCalendar(txns, subs, lastDate),
    active_subscription_count: active.filter((s) => !s.essential).length,
    stopped_subscription_count: subs.filter((s) => !s.active && !s.essential).length,
    transactions: txns,
    errors: [],
  };
}

// ── Public: CSV text → full redacted analysis ──
export function analyzeCsv(text, opts = {}) {
  const ing = ingest(text);
  const out = analyzeTransactions(ing.transactions, {
    source: ing.source, currency: ing.currency,
    account_fingerprint: ing.account_fingerprint,
    notes: ing.notes, redacted_columns: ing.redacted_columns,
  }, opts);
  out.currency_ambiguous = ing.currency_ambiguous || [];
  out.kind = ing.kind || null;
  return out;
}
