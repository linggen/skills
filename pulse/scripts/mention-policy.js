// Mention policy — how, where and how often a draft may name the user's
// product. Pure functions (no DOM, no fetch) so pulse-app.js can build the
// same MENTION POLICY block for every goal and node can test it.
//
// Config (config.json `mention`):
//   product  — the product's name as it should appear in a sentence
//   domain   — its site, said as PLAIN TEXT ("linggen.dev"); never a URL
//   default  — "disclosed" | "implicit": the register on threads where the
//              product is the direct answer to the OP
//   ratio    — max share of the user's recent comments that may carry the
//              product (Reddit's 10% self-promotion guideline → 0.1)
//   sites    — per-lane overrides, e.g. { hackernews: "implicit" }
//
// The budget is counted by the page from the user's own recent comments —
// the model never estimates it. A lane over budget drafts implicit this run.

export const MENTION_LANES = ['reddit', 'hackernews', 'x', 'bluesky'];
export const MENTION_WINDOW = 10;
export const REGISTERS = ['disclosed', 'implicit'];

export const MENTION_DEFAULTS = Object.freeze({
  product: '',
  domain: '',
  default: 'disclosed',
  ratio: 0.1,
  sites: {},
});

// Strip anything that would make the domain a link when pasted.
export function plainDomain(s) {
  return String(s || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

export function normalizeMention(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const def = REGISTERS.includes(m.default) ? m.default : MENTION_DEFAULTS.default;
  const ratio = Number.isFinite(m.ratio) && m.ratio >= 0 && m.ratio <= 1
    ? m.ratio : MENTION_DEFAULTS.ratio;
  const sites = {};
  for (const lane of MENTION_LANES) {
    const v = m.sites && m.sites[lane];
    if (REGISTERS.includes(v)) sites[lane] = v;
  }
  return {
    product: String(m.product || '').trim(),
    domain: plainDomain(m.domain),
    default: def,
    ratio,
    sites,
  };
}

// Does this comment/post body name the product? Case-insensitive, either the
// name or the domain — that's what a subreddit's self-promo count sees.
export function mentionsProduct(text, policy) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const needles = [policy.product, policy.domain].map(s => s.toLowerCase()).filter(Boolean);
  return needles.some(n => t.includes(n));
}

// bodies: the user's own recent comments/posts on one lane, NEWEST FIRST.
// The window is always MENTION_WINDOW — the rule is "n per 10", so a young
// account with 3 comments is judged against 10, not 3.
export function laneBudget(bodies, policy) {
  const recent = (Array.isArray(bodies) ? bodies : []).slice(0, MENTION_WINDOW);
  const used = recent.filter(b => mentionsProduct(b, policy)).length;
  const allowed = Math.floor(policy.ratio * MENTION_WINDOW + 1e-9);
  return {
    window: MENTION_WINDOW,
    seen: recent.length,
    used,
    allowed,
    open: used < allowed,
    known: recent.length > 0,
  };
}

export function computeMentionBudgets(policy, bodiesByLane) {
  const out = {};
  for (const lane of MENTION_LANES) {
    out[lane] = laneBudget((bodiesByLane || {})[lane], policy);
  }
  return out;
}

// The register a lane drafts in THIS run: the configured one, forced to
// implicit when its budget is spent.
export function effectiveRegister(lane, policy, budgets) {
  const configured = policy.sites[lane] || policy.default;
  const b = budgets && budgets[lane];
  if (configured === 'disclosed' && b && !b.open) return { register: 'implicit', why: 'budget spent' };
  return { register: configured, why: '' };
}

export function oneLiner(policy) {
  const site = policy.domain ? ` (${policy.domain})` : '';
  return `I built ${policy.product}${site} for this — it does <the one concrete thing that answers the OP>.`;
}

// The sentence is a SHAPE, not a string: the same line in every comment is
// its own tell. Three parts stay fixed — the disclosure that I built it, the
// name with the site as plain text, the one concrete thing — the wording moves.
export const ONE_LINER_RULE =
  'Vary the wording from comment to comment ("I built X for exactly this", "disclosure: X is mine", "I\'m the author of X") — keep the three parts, never the same sentence twice.';

// The hidden block prepended to every drafting goal. Everything the model
// needs to decide a register is here; nothing is left to its judgment except
// "is the product the direct answer to this OP".
export function buildMentionBlock(policy, budgets) {
  if (!policy.product) {
    return [
      'MENTION POLICY — no product is configured (Settings → Mentions), so every',
      'draft is register (1) implicit: never name a product or a site.',
      '',
    ].join('\n');
  }
  const lines = [
    'MENTION POLICY — how to name my product in drafts. Read before drafting.',
    `Product: ${policy.product}.` + (policy.domain
      ? ` Its site is said as PLAIN TEXT — "${policy.domain}" — never as a URL: no https://, no www., no markdown link, no "check out".`
      : ' No site is configured — name the product only.'),
    'Registers:',
    `  disclosed — ONLY on a thread where the product is the direct answer (the OP's problem is what it does). Answer the OP on the merits FIRST, then ONE sentence of this shape: "${oneLiner(policy)}" ${ONE_LINER_RULE} At most once per comment. Never a link, never a feature list. Never pose as a user of it — you built it, and saying so is what makes the mention allowed. If the comment would not stand without that sentence, you are planting a name — drop to implicit.`,
    '  implicit  — no product and no site named at all.',
    'Per lane this run (configured register, then the budget the page counted from my own recent comments):',
  ];
  for (const lane of MENTION_LANES) {
    const eff = effectiveRegister(lane, policy, budgets);
    const b = budgets && budgets[lane];
    const configured = policy.sites[lane] || policy.default;
    let budget;
    if (!b || !b.known) budget = 'no comment history on file → budget OPEN';
    else budget = `${b.used} of my last ${b.window} carry the product (${b.allowed} allowed) → budget ${b.open ? 'OPEN' : 'SPENT'}`;
    const note = eff.why ? ` → draft IMPLICIT this run (${eff.why})` : '';
    lines.push(`  ${lane}: ${configured}; ${budget}${note}`);
  }
  lines.push(
    `Ratio ${policy.ratio} per ${MENTION_WINDOW} is Reddit's self-promotion rule (posts AND comments count); HN flags promo hardest, so its default stays implicit unless the thread is squarely about what the product does.`,
    'Set `register` on every drafted card to the register you actually used.',
    '',
  );
  return lines.join('\n');
}
