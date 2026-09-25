// pdf-import.js — best-effort PDF statement → redacted transactions, in-browser.
//
// PDF is the universal export (every bank offers it) but the hard parse: layouts
// vary wildly and there's no header row. We extract the text layer with the
// vendored pdf.js (no python/poppler, runs in the webview), reconstruct lines by
// y-position, then heuristically pull `DATE … DESCRIPTION … AMOUNT` rows.
// Treat results as approximate — CSV is always preferred when the bank offers it.
//
// pdf.js (~1.7MB) is lazy-loaded only when a PDF is actually imported, so CSV
// users never download it.

import { parseDate, parseAmount, cleanMerchant } from './analyze.js';
import { detectCurrency } from './currency.js';

const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';
const DATE_RE = new RegExp(
  `\\b\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}\\b` // ISO 2026-07-15
  + `|\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b`
  + `|\\b${MONTH_RE}[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{2,4})?\\b` // "Jul 02" or "Jul 02, 2026"
  + `|\\b\\d{1,2}\\s+${MONTH_RE}[a-z]*(?:,?\\s*\\d{2,4})?\\b`, 'i');
// A money token: 1,234.56 / 2500.00 / $12.00 / -8.99 / +8.99 / 12.00- / 12.00 CR.
// The thousands comma is OPTIONAL (`,?`) — some statements render "$2500.00"
// with no separator; requiring the comma matched "500.00" out of "2500.00".
const MONEY_RE = /[-+]?\$?\d{1,3}(?:,?\d{3})*\.\d{2}[-+]?(?:\s?(?:cr|dr))?/ig;
// Direction, strongest evidence first: an explicit CR/DR/+/- marker on the
// amount, then which column the amount sits in (Withdrawals vs Deposits), and
// only then the description. Words credit a row only for unambiguous inbound
// phrases; an outbound word anywhere ("sent", "bill payment", "to") keeps it
// spend — "BILL PAYMENT HYDRO ONE" and "E-TRANSFER SENT" are money leaving.
const INBOUND_RE = /\b(deposit|refund|reversal|statement credit|credit adjustment|cash\s*back|rebate|(?:payment|pymt)s?\s+received|payment\s*-?\s*thank you|thank you for your payment|transfer in|e-?transfer\s+(received|deposit))\b/i;
const OUTBOUND_RE = /\b(sent|bill\s*pay(ment)?|to|withdrawal|withdraw|pre-?authori[sz]ed (payment|debit))\b/i;
// Money coming back names itself: a refund or reversal is inbound whatever
// preposition follows it ("REFUND TO CARD" — the `to` is where it went).
const RETURNED_RE = /\b(refund|reversal|rebate|cash\s*back|statement credit|credit adjustment|chargeback)\b/i;
// A second date opening the description — the posting date of a two-date row.
const POSTING_RE = new RegExp(`^\\s*(?:${MONTH_RE}[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{4})?|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)(?=\\s)`, 'i');
// A statement's summary box, not a transaction: the balances, limits and
// totals a card or bank prints above its activity. Each carries a date and an
// amount, so without this a card's "Previous total balance" books as money in.
const SUMMARY_RE = /\b(previous (total )?balance|new (total )?balance|opening balance|closing balance|(opening|closing) totals?|balance forward|beginning balance|statement balance|minimum (payment|amount)|payment due|credit limit|available credit|credit available|total (payments|credits|purchases|charges|interest|fees|debits|deposits|withdrawals)|payments (&|and) credits|purchases (&|and) (other )?charges)\b/i;
// A credit-card statement (the words only a card prints). On one, a leading
// minus marks a credit to the card — a payment or refund — not spend.
const TOTAL_RE = /\b(sub)?totals?\b/i;
const FX_RE = /@|exchange rate|foreign currency/i;
const CARD_RE = /\b(credit limit|minimum payment|available credit|credit available|payment due date|annual interest rate)\b/i;
// Column headers of a two-column bank layout.
// BMO chequing prints "Amounts deducted from your account" / "Amounts added to
// your account" instead of Withdrawals / Deposits.
const DEBIT_COL_RE = /\b(withdrawals?|debits?|paid out|charges?|deducted)\b/i;
const CREDIT_COL_RE = /\b(deposits?|credits?|paid in|added)\b/i;

// Reconstruct text lines from a PDF's positioned text items via the vendored
// pdf.js. Returns a flat array of {text, cells:[{x, s}]} lines (all pages).
async function extractPdfText(data) {
  const pdfjsLib = await import('./vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map(); // group text items into lines by rounded y
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      // x = left edge, r = right edge: amounts are right-aligned, so a
      // column is read by where its text SPANS, not where it starts.
      const x = it.transform[4];
      (byY.get(y) || byY.set(y, []).get(y)).push({ x, r: x + (it.width || 0), s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const cells = byY.get(y).sort((a, b) => a.x - b.x);
      const text = cells.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, cells }); // cells keep x for column reading
    }
  }
  await doc.destroy?.();
  return lines;
}

function normalizeDate(token, year) {
  const t = token.trim();
  if (/\b\d{4}\b/.test(t)) { const d = parseDate(t); if (d) return d; } // token already carries a 4-digit year
  if (/\d{2,4}$/.test(t) && /[/-]\d{1,2}[/-]\d{2,4}$/.test(t)) return parseDate(t); // already has a year
  // append the statement year and retry the common shapes
  if (/^\d{1,2}[/-]\d{1,2}$/.test(t)) return parseDate(`${t.replace('-', '/')}/${year}`);
  return parseDate(`${t} ${year}`) || parseDate(`${t}, ${year}`);
}

const hasYear = (t) => /\b\d{4}\b/.test(t) || /[/-]\d{1,2}[/-]\d{2,4}$/.test(t.trim());
const PERIOD_RE = /\b(statement|closing|billing|period|cycle|through|ending)\b/i;
const DATE_RE_G = new RegExp(DATE_RE.source, 'ig');

// The statement's closing {year, month}. Rows print "Dec 15" with no year, so
// a Dec–Jan statement closing in January must book December in the PRIOR
// year. Evidence, best first: a dated period/closing line, any full date in
// the text, a bare year (month unknown → whole year), then today.
export function statementClose(lines) {
  const fullDates = (ls) => ls.flatMap((l) => [...l.matchAll(DATE_RE_G)]
    .map((m) => m[0]).filter(hasYear).map((t) => parseDate(t.trim())).filter(Boolean));
  const labeled = lines.filter((l) => PERIOD_RE.test(l));
  const dates = fullDates(labeled).length ? fullDates(labeled) : fullDates(lines);
  if (dates.length) {
    const last = dates.sort().pop();
    return { year: +last.slice(0, 4), month: +last.slice(5, 7) };
  }
  const ym = lines.join('\n').match(/\b(20\d{2})\b/);
  if (ym) {
    // "Statement period Dec 15 - Jan 14" + a bare "2026": the last month named
    // on the period line is the closing month.
    const named = labeled.flatMap((l) => [...l.matchAll(DATE_RE_G)].map((m) => m[0]));
    const probe = named.length ? normalizeDate(named[named.length - 1], ym[1]) : null;
    return { year: +ym[1], month: probe ? +probe.slice(5, 7) : 12 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// A yearless row date, placed in the statement: a month after the closing
// month belongs to the year before.
function rowDate(token, close) {
  if (hasYear(token)) return normalizeDate(token, close.year);
  const d = normalizeDate(token, close.year);
  if (d && +d.slice(5, 7) > close.month) return normalizeDate(token, close.year - 1);
  return d;
}

// A two-column layout's header ("Withdrawals … Deposits"): where each column
// sits, so an amount's position says which way the money moved. A span is
// {x, r} (left, right); r is null when the reader gave no width.
const span = (c) => ({ x: c.x, r: c.r ?? null });
function findColumns(line) {
  if (!line.cells) return null;
  const debit = line.cells.find((c) => DEBIT_COL_RE.test(c.s));
  const credit = line.cells.find((c) => CREDIT_COL_RE.test(c.s));
  return debit && credit && debit !== credit ? { debit: span(debit), credit: span(credit) } : null;
}

const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
const mid = (a) => (a.x + a.r) / 2;

// Which column an amount sits in. Statements right-align amounts, often under
// a header that is right-aligned too or wraps over two lines, so the left
// edges alone mislead (a withdrawal's left edge can sit nearer the deposits
// header — BMO chequing). With widths: the column the amount OVERLAPS most,
// then the nearer centre. Without widths: the nearer left edge.
function columnSide(line, amtTok, cols) {
  if (!cols || !line.cells) return null;
  const core = amtTok.replace(/\s?(cr|dr)$/i, '').trim();
  const cell = line.cells.find((c) => c.s.split(/\s+/).includes(core)) || line.cells.find((c) => c.s.includes(core));
  if (!cell) return null;
  const { debit, credit } = cols;
  if (cell.r != null && debit.r != null && credit.r != null) {
    const a = { x: cell.x, r: cell.r };
    const od = overlap(a, debit), oc = overlap(a, credit);
    if (od !== oc) return oc > od ? 'credit' : 'debit';
    return Math.abs(mid(a) - mid(credit)) < Math.abs(mid(a) - mid(debit)) ? 'credit' : 'debit';
  }
  return Math.abs(cell.x - credit.x) < Math.abs(cell.x - debit.x) ? 'credit' : 'debit';
}

// true = money in, false = money out.
export function isInbound(line, amtTok, cols = null, card = false) {
  const tok = amtTok.trim();
  if (/cr$/i.test(tok) || /^\+|\+$/.test(tok)) return true;
  // A card prints its credits (payments, refunds) with a minus, leading or
  // trailing ("-400.00" / "$60.00-"); on a bank statement a trailing minus is
  // a withdrawal.
  if (card && (/^-/.test(tok) || /\d\s*-$/.test(tok))) return true;
  if (/dr$/i.test(tok) || /\d\s*-$/.test(tok)) return false;
  const side = columnSide(line, tok, cols);
  if (side) return side === 'credit';
  const text = line.text ?? line;
  return RETURNED_RE.test(text) || (INBOUND_RE.test(text) && !OUTBOUND_RE.test(text));
}

// Pure, testable: statement lines -> [{date, merchant, amount}]. Spend negative.
// A line is a string or {text, cells} (cells carry x for column reading).
export function parseStatementText(input) {
  const lines = input.map((l) => (typeof l === 'string' ? { text: l } : l));
  const close = statementClose(lines.map((l) => l.text));
  const card = lines.some((l) => CARD_RE.test(l.text));

  const txns = [];
  let cols = null;
  let lastDate = null; // a bank prints the date once a day (RBC); later rows inherit it
  for (const l of lines) {
    const line = l.text;
    const header = MONEY_RE.test(line) ? null : findColumns(l);
    MONEY_RE.lastIndex = 0;
    if (header) { cols = header; continue; }
    if (SUMMARY_RE.test(line)) continue;
    const dateMatch = line.match(DATE_RE);
    const money = [...line.matchAll(MONEY_RE)].map((m) => m[0]);
    if (!money.length) continue;
    // A dateless row with an amount belongs to the day above it — on a bank
    // statement only: a card's dateless money lines are foreign-exchange
    // details ("USD 12.00 @ 1.36") and totals, never rows of their own.
    const inherits = !dateMatch && !card && lastDate && !TOTAL_RE.test(line) && !FX_RE.test(line);
    if (!dateMatch && !inherits) continue;

    // Bank rows are `… AMOUNT BALANCE`; take the second-to-last money token as
    // the amount when a trailing balance is present, else the only token.
    const amtTok = money[money.length >= 2 ? money.length - 2 : money.length - 1];
    let amount = parseAmount(amtTok.replace(/(cr|dr)/i, '').trim().replace(/[-+]$/, ''));
    if (amount == null) continue;
    amount = Math.abs(amount);
    amount = isInbound(l, amtTok, cols, card) ? amount : -amount;

    const date = dateMatch ? rowDate(dateMatch[0], close) : lastDate;
    // description = line minus the date and every money token, then redacted
    let desc = dateMatch ? line.replace(dateMatch[0], ' ') : line;
    for (const m of money) desc = desc.replace(m, ' ');
    // Cards print two dates — transaction, then posting. The row keeps the
    // first; the second must not open the merchant ("Aug. 5 GROCER").
    // Only a month-name or slashed date counts: "7-11 STORE" is a merchant.
    desc = desc.replace(POSTING_RE, ' ');
    const merchant = cleanMerchant(desc.replace(/\s+/g, ' '));
    if (!merchant && date == null) continue;

    txns.push({ date, merchant, amount: Math.round(amount * 100) / 100 });
    if (date) lastDate = date;
  }
  return txns;
}

// arrayBuffer -> { transactions, notes }. Notes flag the best-effort nature.
export async function pdfToTransactions(arrayBuffer) {
  const lines = await extractPdfText(arrayBuffer);
  const txns = parseStatementText(lines);
  const notes = ['PDF import is best-effort — verify the figures, and prefer CSV when your bank offers it.'];
  if (!txns.length) {
    notes.push('No transaction rows found. The PDF may be scanned or unusual — try the CSV export.');
  }
  // The account's currency, when the statement names it (currency.js).
  const cur = detectCurrency(lines.map((l) => (typeof l === 'string' ? l : l.text)).join('\n'));
  return { transactions: txns, notes, currency: cur.currency, currency_ambiguous: cur.ambiguous };
}
