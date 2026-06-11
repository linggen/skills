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

const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';
const DATE_RE = new RegExp(
  `\\b\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}\\b` // ISO 2026-07-15
  + `|\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b`
  + `|\\b${MONTH_RE}[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{2,4})?\\b` // "Jul 02" or "Jul 02, 2026"
  + `|\\b\\d{1,2}\\s+${MONTH_RE}[a-z]*(?:,?\\s*\\d{2,4})?\\b`, 'i');
// A money token: 1,234.56 / $12.00 / -8.99 / 12.00- / 12.00 CR
const MONEY_RE = /-?\$?\d{1,3}(?:,\d{3})*\.\d{2}-?(?:\s?(?:cr|dr))?/ig;
const CREDIT_HINT = /\b(payment|deposit|refund|credit|reversal|transfer in|e-?transfer)\b/i;

// Reconstruct text lines from a PDF's positioned text items via the vendored
// pdf.js. Returns a flat array of line strings (all pages).
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
      (byY.get(y) || byY.set(y, []).get(y)).push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const line = byY.get(y).sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
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

// Pure, testable: statement lines -> [{date, merchant, amount}]. Spend negative.
export function parseStatementText(lines) {
  const text = lines.join('\n');
  const ym = text.match(/\b(20\d{2})\b/);
  const year = ym ? ym[1] : String(new Date().getFullYear());

  const txns = [];
  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    const money = [...line.matchAll(MONEY_RE)].map((m) => m[0]);
    if (!money.length) continue;

    // Bank rows are `… AMOUNT BALANCE`; take the second-to-last money token as
    // the amount when a trailing balance is present, else the only token.
    const amtTok = money[money.length >= 2 ? money.length - 2 : money.length - 1];
    let amount = parseAmount(amtTok.replace(/(cr|dr)/i, '').trim());
    if (amount == null) continue;
    amount = Math.abs(amount);

    const isCredit = /cr\b/i.test(amtTok) || CREDIT_HINT.test(line) || /\+\s*$/.test(amtTok);
    const isExplicitDebit = /dr\b/i.test(amtTok) || /\d\s*-$/.test(amtTok.trim());
    amount = (isCredit && !isExplicitDebit) ? amount : -amount;

    const date = normalizeDate(dateMatch[0], year);
    // description = line minus the date and every money token, then redacted
    let desc = line.replace(dateMatch[0], ' ');
    for (const m of money) desc = desc.replace(m, ' ');
    const merchant = cleanMerchant(desc.replace(/\s+/g, ' '));
    if (!merchant && date == null) continue;

    txns.push({ date, merchant, amount: Math.round(amount * 100) / 100 });
  }
  return txns;
}

// arrayBuffer -> { transactions, notes }. Notes flag the best-effort nature.
export async function pdfToTransactions(arrayBuffer) {
  const lines = await extractPdfText(arrayBuffer);
  const txns = parseStatementText(lines);
  const notes = ['PDF import is best-effort — layouts vary; verify the figures, '
    + 'and prefer the CSV export when your bank offers one.'];
  if (!txns.length) {
    notes.push('No transaction rows recognized. This PDF may be scanned (no text '
      + 'layer) or use an unusual layout — try the CSV export instead.');
  }
  return { transactions: txns, notes };
}
