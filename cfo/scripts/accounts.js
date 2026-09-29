// accounts.js — which account a statement with no account number belongs to,
// read from its file name. Pure; the import review (cfo.js) and the phone
// (cfo_local_store.dart) answer the same way, held to fixtures/import/cases.json.
//
// A file name carries the account ("td-visa", "Chase Checking") and noise that
// changes every month — dates, months, years, "statement", "export", a "(1)"
// copy suffix. Only the account part names it, so the noise is dropped before
// a label is made or matched: "statement-2026-08.pdf" and "Statement Sept
// 2026.pdf" are one account. Numbers of 3–4 digits that aren't years stay —
// they are how people tell two cards apart ("visa-4521" vs "visa-9876").

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NOISE_RES = [
  new RegExp(`^${MONTH}$`),
  new RegExp(`^${MONTH}\\d{2,4}$`), // aug2026, sept26
  new RegExp(`^\\d{2,4}${MONTH}$`), // 2026aug
  /^(?:19|20)\d{2}$/, // a year
  /^\d{1,2}$|^\d{5,}$/, // a day, a month, a copy index, a packed date (20260831)
  /^q[1-4]$/,
  /^(?:e?statements?|stmts?|exports?|exported|downloads?|downloaded|transactions?|txns?|activity|history|copy|final|report|account|accounts|to|thru|through|from)$/,
];
const isNoise = (tok) => NOISE_RES.some((re) => re.test(tok.toLowerCase()));

// The file name without its extension or a "Copy of " prefix.
const stem = (filename) => String(filename || '').replace(/\.(csv|pdf)$/i, '').replace(/^copy of\s+/i, '');

// The words that name the account, as written (case kept for the label).
function accountWords(text) {
  return stem(text).split(/[^A-Za-z0-9]+/).filter((w) => w && !isNoise(w));
}
const tokens = (text) => new Set(accountWords(text).map((w) => w.toLowerCase()));

// The account type the file name suggests; when it says nothing, what the
// statement itself is (`kind`: 'credit' for a card's statement, 'bank' for a
// bank's — a PDF knows, a CSV passes nothing), else credit (that default
// decides the sign flip, so the phone's must match).
export function guessType(text, kind = null) {
  const t = (text || '').toLowerCase();
  if (/check|chequing/.test(t)) return 'checking';
  if (/saving/.test(t)) return 'savings';
  if (kind === 'bank') return 'checking';
  return 'credit'; // visa/card/credit/amex/etc. and the default
}

// The label a new account gets from its file name: its account words, or
// "Account" when the name is all noise.
export function labelFromFilename(filename) {
  return accountWords(filename).join(' ').slice(0, 30).trim() || 'Account';
}

// Suggest (never silently decide): the account labelled with this very file
// name ("July 6, 2026.pdf", or a "(1)" copy of it, is the account its first
// import made); else the existing account whose label's account words all
// appear in the file name — "td-checking-apr-jun.csv" → "td checking"; the
// most words wins, the first seen breaks a tie. A name with no account words
// ("statement-2026-08.pdf") can only be a labelled account whose label has
// none either, and only of the type the name — or, when it says nothing, the
// statement (`kind`, see guessType) — gives: a bank statement never lands on a
// card, nor a card's on a chequing account. A file that carries its account
// number (`fingerprint`) is that account, so a bare name ("statement.csv")
// never hands it to some other account that has no number.
export function bestAccountMatch(filename, accounts, kind = null, fingerprint = null) {
  const same = sameName(filename, accounts);
  if (same) return same;
  const ftoks = tokens(filename);
  if (!ftoks.size) return fingerprint ? null : genericMatch(guessType(filename, kind), accounts);
  let best = null, bestN = 0;
  for (const [id, a] of Object.entries(accounts || {})) {
    const ltoks = [...tokens(a?.label)];
    const hit = ltoks.filter((t) => ftoks.has(t)).length;
    if (ltoks.length && hit === ltoks.length && hit > bestN) { best = id; bestN = hit; }
  }
  return best;
}

// A file name as a whole, for "is this the file that account was named from":
// no extension, "Copy of" or "(1)" copy suffix, case or punctuation.
const nameKey = (text) => stem(text).replace(/\s*\(\d+\)$/, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ');

function sameName(filename, accounts) {
  const key = nameKey(filename);
  if (!key) return null;
  const hit = Object.entries(accounts || {}).find(([, a]) => a?.label && nameKey(a.label) === key);
  return hit ? hit[0] : null;
}

function genericMatch(type, accounts) {
  const hit = Object.entries(accounts || {}).find(([, a]) => a?.label && !tokens(a.label).size && (a.type || 'credit') === type);
  return hit ? hit[0] : null;
}
