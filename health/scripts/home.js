// home.js — the composition behind Home's Focus and Attention, as the Mac
// reads it. Pure functions, no I/O: ingest.mjs writes, the page renders.
//
// The phone composes `layout.home`: a bounded CATALOG of components, each
// with every value it needs already computed, plus which one leads and why.
// A Mac may choose among those entries — a pin, a period, the agent's pick —
// and may never invent a value or a kind. The rules below are the phone's
// `HealthHome.change` written a second time in JavaScript, and the two must
// agree: a change made here reaches the phone on the next sync as the newer
// register, and a phone that read it differently would undo it.

export const VERSION = 2;

/// The component kinds the page draws. Anything else is refused whole.
export const KINDS = new Set(['line', 'bars', 'share', 'nights', 'weeks', 'progress']);

export const ACTIONS = new Set(['select', 'agent', 'pin', 'unpin', 'hide', 'unhide', 'kind']);

/// At most this many cards on the page, the phone's `HealthHome.maxHighlights`.
export const MAX_HIGHLIGHTS = 6;

export const candidatesOf = (home) => (Array.isArray(home?.candidates) ? home.candidates : []);

/// The page as composed: card ids in order. Empty when nothing has composed.
export const cardsOf = (home) => {
  const c = home?.highlights?.cards;
  return Array.isArray(c) ? c.map((x) => `${x}`) : [];
};

/// One dismissal — the phone's `HealthHome.dismiss` written a second time, and
/// the two must agree: this lands as the newer `layout.json` and the phone
/// adopts it whole. A card is dismissed FOR ITS FACT, so the same subject comes
/// back the moment the fact changes; the freed slot is refilled from the rules'
/// order rather than left as a hole.
export function dismissCard(home, id, now = new Date()) {
  const cand = candidatesOf(home).find((c) => `${c.id}` === id);
  if (!cand) throw new Error(`${id} is not on the page`);
  if (cand.dismissable !== true) throw new Error(`${cand.label || id} stays until it passes`);
  const dismissed = { ...(home.dismissed || {}), [id]: cand.fact };
  const cards = cardsOf(home).filter((x) => x !== id);
  for (const c of candidatesOf(home)) {
    if (cards.length >= MAX_HIGHLIGHTS) break;
    const cid = `${c.id}`;
    if (cards.includes(cid)) continue;
    if (c.dismissable === true && dismissed[cid] === c.fact) continue;
    cards.push(cid);
  }
  return {
    ...home,
    dismissed,
    highlights: { ...(home.highlights || {}), cards },
    changed_at: now.toISOString(),
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (s) => typeof s === 'string' && s.length > 0;

/// Why an entry cannot be drawn, or null.
export function validEntry(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  for (const k of ['id', 'subject', 'kind', 'title', 'question', 'period']) {
    if (!nonEmpty(e[k])) return `${k} missing`;
  }
  if (!KINDS.has(e.kind)) return `unknown kind ${e.kind}`;
  const ks = e.kinds;
  if (!Array.isArray(ks) || !ks.length || !ks.includes(e.kind) || !ks.every((k) => KINDS.has(k))) {
    return `kinds do not include ${e.kind}`;
  }
  const { values, labels } = e;
  if (!Array.isArray(values) || !Array.isArray(labels) || !values.length || values.length !== labels.length) {
    return 'values and labels disagree';
  }
  if (!labels.every((l) => typeof l === 'string')) return 'a label is not text';
  if (!values.every((v) => v === null || isNum(v))) return 'a value is not a number';
  if (!values.some(isNum)) return 'no values at all';
  if ((ks.includes('bars') || ks.includes('share')) && values.some((v) => isNum(v) && v < 0)) {
    return 'a share cannot be negative';
  }
  if (ks.includes('share') && (values.length > 6 || !values.every(isNum))) {
    return 'a share needs at most six whole parts';
  }
  if (ks.includes('nights')) {
    const nights = e.nights;
    if (!Array.isArray(nights) || nights.length !== values.length) return 'nights disagree with values';
    for (const n of nights) {
      if (n === null) continue;
      if (!n || typeof n !== 'object' || !isNum(n.bed) || !isNum(n.wake)) return 'a night has no bed or wake';
    }
  }
  if (ks.includes('progress')) {
    if (!isNum(e.target) || e.target <= 0) return 'a progress needs a target';
    if (typeof e.target_source !== 'string') return 'a target needs its source';
  }
  if (ks.includes('weeks') && Array.isArray(e.sessions) && e.sessions.length !== values.length) {
    return 'sessions disagree with weeks';
  }
  return null;
}

/// Why a whole composition cannot be shown, or null.
export function validHome(home) {
  if (!home || typeof home !== 'object') return 'no composition';
  if (home.version !== VERSION) return 'composed by another version';
  if (!Array.isArray(home.catalog)) return 'no catalog';
  const ids = new Set();
  for (const e of home.catalog) {
    const err = validEntry(e);
    if (err) return `${e?.id}: ${err}`;
    if (ids.has(e.id)) return `duplicate id ${e.id}`;
    ids.add(e.id);
  }
  if (home.selected != null && !ids.has(home.selected)) return 'selected is not in the catalog';
  if (!Array.isArray(home.hidden)) return 'no hidden list';
  return null;
}

/// The composition to draw: the phone's when it is valid, else a plain one
/// built from the review's own series — a phone from before the composition
/// still has fortnights worth a line, and the Mac shows those rather than
/// nothing. Never a guess at anything the review did not carry.
export function homeOf(report) {
  const held = report?.layout?.home;
  if (held && !validHome(held)) return held;
  const r = report?.review;
  const catalog = (Array.isArray(r?.verdicts) ? r.verdicts : []).flatMap((f) => {
    if (f.verdict === 'thin' || !Array.isArray(f.series)) return [];
    if (f.series.filter(isNum).length < 2) return [];
    const end = new Date(`${f.series_to || r.date}T12:00:00Z`);
    if (!Number.isFinite(end.getTime())) return [];
    const n = f.series.length;
    const e = {
      id: `${f.type}#line14`,
      subject: f.type,
      kind: 'line',
      kinds: ['line'],
      title: f.label,
      question: `Is my ${f.label} where it usually is?`,
      period: `Last ${n} days`,
      periods: [`${f.type}#line14`],
      values: f.series.map((v) => (isNum(v) ? v : null)),
      labels: f.series.map((_, i) =>
        new Date(end.getTime() - (n - i - 1) * 86400000).toISOString().slice(0, 10)),
      coverage: `${f.series.filter(isNum).length} of ${n} days measured`,
      source: `review/${r.date}.json`,
      relevance: 0.5,
      tier: 'ranked',
    };
    if (typeof f.unit === 'string') e.unit = f.unit;
    if (isNum(f.normal)) e.normal = f.normal;
    return validEntry(e) ? [] : [e];
  });
  const picked = catalog.find((c) => c.subject === r?.index?.picked) || catalog[0];
  return {
    version: VERSION,
    by: 'mac',
    catalog,
    selected: picked?.id ?? null,
    why: picked
      ? 'Drawn from the examination: this phone has not composed a Focus yet.'
      : 'Nothing to draw until the phone has examined something.',
    hidden: [],
    kinds: {},
    opened: {},
    attention: [],
    fallback: true,
  };
}

/// The entry that leads, drawn as the kind the person chose for it.
export function entryOf(home, id) {
  if (!home || validHome(home)) return null;
  const e = home.catalog.find((c) => c.id === id);
  if (!e) return null;
  const chosen = home.kinds?.[e.id];
  return chosen && e.kinds.includes(chosen) ? { ...e, kind: chosen } : e;
}

export const selectedOf = (home) => entryOf(home, home?.selected);

const words = (subject, catalog) =>
  (catalog.find((e) => e.subject === subject)?.title || subject).toLowerCase();

/// One change, the phone's rules exactly. Throws a sentence when refused.
export function changeFocus(home, { action, id, kind, why } = {}, now = new Date()) {
  if (validHome(home)) throw new Error('Nothing composed yet — the phone has to examine first');
  if (!ACTIONS.has(action)) throw new Error(`Unknown action ${action}`);
  const out = { ...home };
  const catalog = home.catalog;
  const hidden = new Set(home.hidden);
  const today = now.toISOString().slice(0, 10);
  const entry = (x) => (x ? catalog.find((e) => e.id === x) : undefined);
  const current = entry(home.selected);
  const target =
    entry(id) || (action === 'pin' || action === 'unpin' || action === 'kind' ? current : undefined);
  if (!target && action !== 'unhide' && action !== 'unpin') {
    throw new Error(id ? `No "${id}" in the catalog — Report lists what there is` : 'Say which one — Report lists the catalog');
  }
  const subject = target ? target.subject : id;

  switch (action) {
    case 'select':
    case 'agent': {
      if (action === 'agent') {
        if (typeof home.pinned === 'string' && home.pinned !== subject) {
          throw new Error(`They pinned ${words(home.pinned, catalog)} — a pin is theirs to lift`);
        }
        if (hidden.has(subject)) throw new Error(`They asked to see less of ${words(subject, catalog)}`);
      } else {
        hidden.delete(subject);
        if (typeof home.pinned === 'string' && home.pinned !== subject) delete out.pinned;
      }
      out.selected = target.id;
      out.selected_by = action === 'agent' ? 'agent' : 'user';
      out.selected_on = today;
      out.why =
        action === 'agent'
          ? (typeof why === 'string' && why.trim() ? why.trim() : 'The agent chose it for you.')
          : 'You chose it.';
      break;
    }
    case 'pin':
      out.pinned = subject;
      hidden.delete(subject);
      out.selected = target.id;
      out.selected_by = 'user';
      out.selected_on = today;
      out.why = 'You pinned it.';
      break;
    case 'unpin':
      delete out.pinned;
      out.why = 'You unpinned it; the rules choose again tomorrow.';
      break;
    case 'hide': {
      hidden.add(subject);
      if (home.pinned === subject) delete out.pinned;
      if (current && current.subject === subject) {
        const next = catalog.find((e) => !hidden.has(e.subject));
        if (next) out.selected = next.id;
        else delete out.selected;
        out.selected_by = 'rules';
        out.selected_on = today;
        out.why = next
          ? `The next in line, after you set ${words(subject, catalog)} aside.`
          : 'Everything with something to show is hidden.';
      }
      break;
    }
    case 'unhide':
      if (!subject || !hidden.has(subject)) throw new Error(`${subject || 'That'} is not hidden`);
      hidden.delete(subject);
      break;
    case 'kind': {
      if (!kind || !target.kinds.includes(kind)) {
        throw new Error(`${target.title} can be drawn as ${target.kinds.join(' or ')}`);
      }
      out.kinds = { ...(home.kinds || {}), [target.id]: kind };
      break;
    }
    default:
      break;
  }
  out.hidden = [...hidden].sort();
  out.changed_at = now.toISOString();
  return out;
}
