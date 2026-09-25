// compose.js — what the first view shows, on the Mac's Report and the phone's
// Overview alike: Brief (the month so far), Focus (one card), Attention (what
// needs them, most urgent first). At most three cards; everything else is one
// tab away. Pure; linggen-mobile's cfo_compose.dart is the same rules, and
// tests/fixtures/compose/cases.json holds both sides to them.
//
// Who decides, strongest first: their pin, then urgency, then Ling's lead
// (`lay:focus`, set with the Focus tool, its "why" said in chat), then the
// rules. A hide is theirs and removes a card from the first view everywhere.
//
// Register cells (lww.js, synced like every other cell):
//   lay:pin            the focus card they pinned (null = none)
//   lay:hide:<id>      true = kept off the first view
//   lay:focus          Ling's lead {id, why}

export const MAX_CARDS = 3;
export const FOCUS_IDS = ['budgets', 'subscriptions', 'trends', 'commitments'];
/// Urgency, most first: a wrong charge, a budget crossed, a card payment not
/// seen, a price rise.
export const URGENCY = ['anomaly', 'budget_over', 'missed_payment', 'price_hike'];
const ANOMALY_TYPES = new Set(['double_charge', 'bill_spike']);

const cents = (n) => Math.round((Number(n) || 0) * 100);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/// Everything that needs them, each with a stable id and its size — ordered
/// by URGENCY, then the larger amount, then id.
export function attentionItems(report) {
  const r = report || {};
  const items = [];
  for (const a of r.anomalies || []) {
    if (!ANOMALY_TYPES.has(a.type)) continue;
    items.push({ id: `anomaly:${a.type}:${a.merchant}:${a.date || ''}`, kind: 'anomaly', size: cents(a.amount), type: a.type, merchant: a.merchant, amount: a.amount, date: a.date || null, prior_date: a.prior_date ?? null, usual: a.usual ?? null });
  }
  const b = r.budgets;
  for (const c of b?.categories || []) {
    if (c.state !== 'over') continue;
    items.push({ id: `budget:${b.month || ''}:${c.category}`, kind: 'budget_over', size: cents(c.mtd) - cents(c.budget), category: c.category, budget: c.budget, mtd: c.mtd });
  }
  for (const p of r.payment_schedule || []) {
    if (!p.missed_in_data) continue;
    items.push({ id: `missed:${p.account}:${p.next_expected || ''}`, kind: 'missed_payment', size: cents(p.last_paid?.amount), card: p.label, expected: p.next_expected || null, last_paid: p.last_paid?.amount ?? null });
  }
  for (const s of r.subscriptions || []) {
    if (!s.active || s.essential || !s.increased) continue;
    items.push({ id: `hike:${s.merchant}:${cents(s.last_amount)}`, kind: 'price_hike', size: cents(s.increase_amount), merchant: s.merchant, from: s.prior_amount, to: s.last_amount });
  }
  const rank = (k) => URGENCY.indexOf(k);
  return items.sort((x, y) => rank(x.kind) - rank(y.kind) || y.size - x.size || cmp(x.id, y.id));
}

/// The focus cards this report can draw.
export function focusCatalog(report) {
  const r = report || {};
  const has = {
    budgets: (r.budgets?.categories || []).length > 0,
    subscriptions: (r.subscriptions || []).some((s) => s.active && !s.essential),
    trends: Object.keys(r.by_month || {}).length >= 2,
    commitments: (r.commitments?.items || []).some((i) => i.active),
  };
  return FOCUS_IDS.filter((id) => has[id]);
}

/// The layout cells of a register (lww.js Register), as plain data.
export function layoutOf(reg) {
  const pin = reg.get('lay:pin');
  const focus = reg.get('lay:focus');
  return {
    pin: typeof pin === 'string' ? pin : null,
    hides: reg.entries('lay:hide:').filter(([, v]) => v === true).map(([k]) => k).sort(),
    focus: focus && typeof focus === 'object' && typeof focus.id === 'string' ? { id: focus.id, why: focus.why || '' } : null,
  };
}

/// The first view. `{brief, focus: {id, by: you|ling|rules, why} | null,
/// attention: [items], more}` — `more` is the attention left for the tab.
export function compose(report, layout = {}, max = MAX_CARDS) {
  if (!report || !Object.keys(report).length) return { brief: false, focus: null, attention: [], more: 0 };
  const hidden = new Set(layout.hides || []);
  const catalog = focusCatalog(report).filter((id) => !hidden.has(id));
  const items = attentionItems(report).filter((i) => !hidden.has(i.id));
  const brief = !hidden.has('brief');
  const pinned = layout.pin && catalog.includes(layout.pin) ? layout.pin : null;
  const room = max - (brief ? 1 : 0);
  const attention = items.slice(0, Math.max(0, room - (pinned ? 1 : 0)));
  let focus = null;
  if (room - attention.length > 0) {
    const ling = layout.focus && catalog.includes(layout.focus.id) ? layout.focus : null;
    if (pinned) focus = { id: pinned, by: 'you', why: '' };
    else if (ling) focus = { id: ling.id, by: 'ling', why: ling.why || '' };
    else if (catalog.length) focus = { id: catalog[0], by: 'rules', why: '' };
  }
  return { brief, focus, attention, more: items.length - attention.length };
}

/// Whether Ling may lead with `id`: refused when they pinned another card or
/// set this one aside — their hands beat hers, and the refusal is final.
export function focusRefusal(report, layout, id) {
  if (id === 'none') return null;
  if (!FOCUS_IDS.includes(id)) return `unknown card: ${id} (one of ${FOCUS_IDS.join(', ')})`;
  if (!focusCatalog(report).includes(id)) return `${id}: nothing in the data to draw it`;
  if ((layout.hides || []).includes(id)) return `${id}: they set it aside`;
  if (layout.pin && layout.pin !== id) return `they pinned ${layout.pin}`;
  return null;
}
