// currency.js — which currency an account's money is in, and how two
// currencies compare. Pure functions, no I/O; the page and the phone
// (linggen-mobile engine/currency.dart, cell for cell) fetch rates themselves.
//
// The law: amounts in different currencies are never added. A row carries its
// account's currency; a report groups by currency; the one combined figure is a
// conversion at a stated day's rate, always marked approximate.
//
// Where the currency comes from, strongest first:
//   1. the user said so (acc:<id>|currency_source = 'user') — never overridden;
//   2. the statement: a currency column, a currency-named amount column
//      ("USD$"), an ISO code or currency word, a symbol that names its country
//      (US$, C$, HK$, €, £). ¥ alone is CNY or JPY — other text decides, or it
//      stays 'ambiguous' and the page asks;
//   3. nothing decides → the home currency (config `currency`), 'assumed', so
//      the page can offer a one-tap fix.

export const CURRENCY_CODES = [
  'USD', 'CAD', 'EUR', 'GBP', 'CNY', 'JPY', 'HKD', 'AUD', 'NZD', 'CHF',
  'SGD', 'INR', 'KRW', 'MXN', 'SEK', 'NOK', 'DKK', 'TWD',
];

// A statement's foreign-exchange detail lines name the OTHER currency
// ("USD 12.00 @ 1.3612") — they say nothing about the account's own.
const FX_LINE_RE = /@|exchange rate|foreign currency|conversion rate|fx rate/i;

// Uppercase ISO codes only: "cad" inside a word never counts.
const ISO_RE = /(?<![A-Za-z])(USD|CAD|EUR|GBP|CNY|RMB|JPY|HKD|AUD|NZD|CHF|SGD|INR|KRW|MXN|SEK|NOK|DKK|TWD)(?![A-Za-z])/g;

// [pattern, code] — words and country-prefixed symbols. Every pattern is
// global; each match is one vote.
const SIGNALS = [
  [/(?<![A-Za-z])(?:U\.?S\.?|American) dollars?/gi, 'USD'],
  [/Canadian dollars?/gi, 'CAD'],
  [/Australian dollars?/gi, 'AUD'],
  [/Hong Kong dollars?/gi, 'HKD'],
  [/New Zealand dollars?/gi, 'NZD'],
  [/Singapore dollars?/gi, 'SGD'],
  [/pounds? sterling|British pounds?/gi, 'GBP'],
  [/(?<![A-Za-z])euros(?![A-Za-z])/gi, 'EUR'],
  [/renminbi|Chinese yuan/gi, 'CNY'],
  [/Japanese yen/gi, 'JPY'],
  [/人民币/g, 'CNY'],
  [/美元/g, 'USD'],
  [/加元|加币/g, 'CAD'],
  [/欧元/g, 'EUR'],
  [/英镑/g, 'GBP'],
  [/港元|港币/g, 'HKD'],
  [/澳元/g, 'AUD'],
  [/日元|円/g, 'JPY'],
  [/(?<![日港美欧加澳新台])元/g, 'CNY'],
  [/(?<![A-Za-z])US\$/g, 'USD'],
  [/(?<![A-Za-z])(?:C|CA|CDN)\$/g, 'CAD'],
  [/(?<![A-Za-z])(?:A|AU)\$/g, 'AUD'],
  [/(?<![A-Za-z])HK\$/g, 'HKD'],
  [/(?<![A-Za-z])NZ\$/g, 'NZD'],
  [/(?<![A-Za-z])S\$/g, 'SGD'],
  [/€/g, 'EUR'],
  [/£/g, 'GBP'],
  [/₹/g, 'INR'],
  [/₩/g, 'KRW'],
];
const YEN_RE = /[¥￥]/g;
const YEN = ['CNY', 'JPY'];

const normCode = (c) => {
  const u = String(c || '').trim().toUpperCase();
  return u === 'RMB' ? 'CNY' : u;
};
const count = (re, s) => (s.match(re) || []).length;

/// Statement text → { currency, ambiguous }. `currency` is an ISO code when
/// the text decides it, else null; `ambiguous` lists the codes it could not
/// choose between (¥ with nothing else to go on → ['CNY', 'JPY']).
export function detectCurrency(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => !FX_LINE_RE.test(l));
  const s = lines.join('\n');
  const votes = {};
  const vote = (code, n) => { if (n > 0) votes[code] = (votes[code] || 0) + n; };
  for (const m of s.matchAll(ISO_RE)) vote(normCode(m[1]), 1);
  for (const [re, code] of SIGNALS) vote(code, count(re, s));
  let yen = count(YEN_RE, s);
  // ¥ is shared by the renminbi and the yen: another word decides.
  if (yen > 0 && (votes.CNY || votes.JPY)) {
    vote((votes.CNY || 0) >= (votes.JPY || 0) ? 'CNY' : 'JPY', yen);
    yen = 0;
  }
  const entries = Object.entries(votes);
  if (yen > 0) entries.push(['¥', yen]);
  if (!entries.length) return { currency: null, ambiguous: [] };
  const top = Math.max(...entries.map(([, n]) => n));
  const tied = entries.filter(([, n]) => n === top).map(([c]) => c);
  const expand = (cs) => [...new Set(cs.flatMap((c) => (c === '¥' ? YEN : [c])))].sort();
  if (tied.length === 1 && tied[0] !== '¥') return { currency: tied[0], ambiguous: [] };
  return { currency: null, ambiguous: expand(tied) };
}

/// A CSV's own say: a currency column's dominant value, else a currency-named
/// amount column ("USD$"), else the file's text. `headersL` are lowercased
/// headers; `ai` the amount column the parser chose.
export function csvCurrency(headersL, body, ai, text) {
  const ci = (headersL || []).findIndex((h) => /^(currency|currency code|ccy|curr\.?)$/.test(String(h).trim()) || /\bcurrency\b/.test(String(h)));
  if (ci >= 0) {
    const n = {};
    for (const r of body || []) {
      const c = normCode(r[ci]);
      if (CURRENCY_CODES.includes(c)) n[c] = (n[c] || 0) + 1;
    }
    const best = Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) return { currency: best[0], ambiguous: [] };
  }
  const named = ai >= 0 && headersL ? /^([a-z]{3})\s*\$$/.exec(String(headersL[ai] || '').trim()) : null;
  if (named && CURRENCY_CODES.includes(normCode(named[1]))) return { currency: normCode(named[1]), ambiguous: [] };
  return detectCurrency(text);
}

// ── Accounts ────────────────────────────────────────────────────────────────

/// An account's currency and how it was decided. No cell yet → the home
/// currency, 'assumed'. An ASSUMED currency follows the home setting: it was
/// only ever "your home currency", so changing home moves it too.
export function accountCurrency(acc, home) {
  if (acc && acc.currency) {
    const source = acc.currency_source || 'detected';
    return { currency: source === 'assumed' && home ? home : acc.currency, source };
  }
  return { currency: home || null, source: 'assumed' };
}

/// Only these want the person's one tap.
export const currencyUnconfirmed = (source) => source === 'assumed' || source === 'ambiguous';

/// The account cells an import writes, given what its statement said.
/// A user's choice is never touched; the first detection sticks; an assumed
/// or ambiguous currency is upgraded by a statement that decides it.
export function importCurrencyCells(acc, detected, home) {
  const cur = acc && acc.currency, src = acc && acc.currency_source;
  if (src === 'user') return {};
  const d = detected || {};
  if (d.currency) {
    if (cur && src !== 'assumed' && src !== 'ambiguous') return {};
    return cur === d.currency && src === 'detected' ? {} : { currency: d.currency, currency_source: 'detected' };
  }
  const amb = d.ambiguous || [];
  if (amb.length && (!cur || src === 'assumed')) {
    return { currency: amb.includes(home) ? home : amb[0], currency_source: 'ambiguous' };
  }
  if (cur || !home) return {};
  return { currency: home, currency_source: 'assumed' };
}

/// Migration for accounts made before currencies existed: every account
/// without a currency cell gets one — detected from what is stored about it
/// (its label, the files imported into it), else the home currency, assumed.
/// Written as SEED cells (ts 1), so any real edit on either device outranks
/// them. Idempotent: an account that has a cell (even a tombstone) is skipped.
/// Returns how many accounts it seeded.
export function seedAccountCurrencies(reg, accountIds, home, hintOf = () => '') {
  let n = 0;
  for (const id of [...new Set(accountIds)].sort()) {
    if (!id || reg.has(`acc:${id}|currency`)) continue;
    const d = detectCurrency(hintOf(id) || '');
    const cells = d.currency
      ? { currency: d.currency, currency_source: 'detected' }
      : (home ? { currency: home, currency_source: 'assumed' } : null);
    if (!cells) continue;
    for (const [f, v] of Object.entries(cells)) reg.seed(`acc:${id}|${f}`, v);
    n++;
  }
  return n;
}

/// What is stored about an account that may name its currency.
export function accountHints(id, acc, importLog) {
  const files = (importLog || []).filter((e) => e && e.account === id).map((e) => e.file || '');
  return [acc && acc.label ? acc.label : '', ...files].join('\n');
}

/// Each row's currency = its account's. Returns a NEW array (rows that
/// changed are copies) and how many changed. Ids are never touched.
export function rowsWithCurrency(rows, accountsById, home) {
  let changed = 0;
  const out = (rows || []).map((r) => {
    const want = accountCurrency((accountsById || {})[r.account], home).currency;
    if (!want || r.currency === want) return r;
    changed++;
    return { ...r, currency: want };
  });
  return { rows: out, changed };
}

/// One ledger year file (JSONL) with every row carrying its account's
/// currency. null when nothing changes — the migration's idempotence: a
/// second run writes nothing. Unparseable lines are kept byte for byte.
export function migrateLedgerText(text, accountsById, home) {
  let changed = 0;
  const lines = String(text || '').split('\n').map((line) => {
    const s = line.trim();
    if (!s) return line;
    let r;
    try { r = JSON.parse(s); } catch { return line; }
    if (!r || typeof r !== 'object') return line;
    const want = accountCurrency((accountsById || {})[r.account], home).currency;
    if (!want || r.currency === want) return line;
    changed++;
    return JSON.stringify({ ...r, currency: want });
  });
  return changed ? lines.join('\n') : null;
}

// ── Exchange rates ─────────────────────────────────────────────────────────
// fx = { base, date, source, rates: { CODE: units of CODE per 1 base } }.

/// The ECB's daily reference rates (eurofxref-daily.xml): ~30 currencies
/// against the euro, keyless.
export function parseEcbXml(xml) {
  const s = String(xml || '');
  const date = (/time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(s) || [])[1];
  const rates = {};
  for (const m of s.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const v = Number(m[2]);
    if (v > 0) rates[m[1]] = v;
  }
  if (!date || !Object.keys(rates).length) return null;
  return { base: 'EUR', date, source: 'ECB', rates };
}

/// The Bank of Canada's Valet observations for FX<CODE>CAD series (the
/// fallback; CFO's market code already reads FXUSDCAD from it).
export function parseBocValet(json) {
  let o;
  try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const obs = (o && o.observations) || [];
  const last = obs[obs.length - 1];
  if (!last) return null;
  const rates = {};
  for (const [k, cell] of Object.entries(last)) {
    const m = /^FX([A-Z]{3})CAD$/.exec(k);
    const v = Number(cell && cell.v);
    if (m && v > 0) rates[m[1]] = 1 / v;
  }
  if (!Object.keys(rates).length) return null;
  return { base: 'CAD', date: last.d, source: 'Bank of Canada', rates };
}

export const BOC_SERIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'HKD', 'AUD', 'NZD', 'CHF', 'SGD', 'INR', 'KRW', 'MXN', 'SEK', 'NOK', 'TWD']
  .map((c) => `FX${c}CAD`).join(',');
export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const BOC_URL = `https://www.bankofcanada.ca/valet/observations/${BOC_SERIES}/json?recent=1`;

/// Units of `to` per 1 `from`, or null when the table lacks either side.
export function fxRate(fx, from, to) {
  if (!from || !to) return null;
  if (from === to) return 1;
  if (!fx || !fx.rates) return null;
  const r = (c) => (c === fx.base ? 1 : fx.rates[c]);
  const a = r(from), b = r(to);
  return a > 0 && b > 0 ? b / a : null;
}

export function convert(amount, from, to, fx) {
  const k = fxRate(fx, from, to);
  return k == null ? null : amount * k;
}

/// Which currency the combined figure is shown in: the one holding the
/// largest amount as written — the raw number, not converted (Hanli,
/// 2026-09-25: 100 CAD + 99 USD → CAD). A tie goes to the home currency, then
/// the alphabetically first. `activity` = { CODE: { amount, rows } }.
/// The one place this is decided — switch the comparison here and nowhere else.
export function leadCurrency(activity, fx, home) {
  const codes = Object.keys(activity || {}).sort();
  if (!codes.length) return home || null;
  const top = Math.max(...codes.map((c) => activity[c].amount));
  const tied = codes.filter((c) => Math.abs(activity[c].amount - top) < 0.005);
  return tied.includes(home) ? home : tied[0];
}
