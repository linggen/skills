// Mention policy — how and where a draft may name the user's product. Pure
// functions (no DOM, no fetch) so pulse-app.js can build the same MENTION
// POLICY block for every goal and node can test it.
//
// Config (config.json `mention`):
//   product  — the product's name as it should appear in a sentence
//   domain   — its site, said as PLAIN TEXT ("linggen.dev"); never a URL
//   default  — "disclosed" | "implicit": the register a lane may reach for
//   sites    — per-lane overrides, e.g. { hackernews: "implicit" }
//
// RELEVANCE IS THE ONLY GATE (Hanli, 2026-09-08: "the most important thing
// is mention linggen when necessary … if all discovery is about linggen, we
// can mention linggen on all drafts, but if zero relative, 0 mention").
// There used to be a `ratio` quota — Reddit's 1-per-10 self-promotion rule,
// counted by the page from the user's own recent comments and able to force
// a lane implicit for a whole run. It is deleted, not merely relaxed: a
// count cannot tell a thread the product genuinely answers from one it does
// not, and silencing the former is the expensive mistake. On 2026-09-08
// three of his own comments spent the budget — two of them answers under
// his OWN announcement thread, which is not self-promotion at all — and
// every draft went implicit, including threads squarely about agent memory.
//
// Do NOT reintroduce a quota as a safety net "because a human reviews every
// draft". Review is where Pulse is today, not what it is for: the goal is
// auto-posting, held back only until drafts stop reading as machine-written
// (Hanli, 2026-09-08 — "if it is very like human's message, I will build
// auto post for sure, that is the goal"). What keeps a mention safe under
// auto-post is not a counter but the relevance test below — a comment that
// answers the OP and names the product because it is the answer is the one
// shape that survives both a mod and a reader.

export const MENTION_LANES = ['reddit', 'hackernews', 'x', 'bluesky'];
export const REGISTERS = ['disclosed', 'implicit'];

export const MENTION_DEFAULTS = Object.freeze({
  product: '',
  domain: '',
  default: 'disclosed',
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
  const sites = {};
  for (const lane of MENTION_LANES) {
    const v = m.sites && m.sites[lane];
    if (REGISTERS.includes(v)) sites[lane] = v;
  }
  return {
    product: String(m.product || '').trim(),
    domain: plainDomain(m.domain),
    default: def,
    sites,
  };
}

// The highest register a lane may reach for. Whether a given draft actually
// gets there is decided per thread by the relevance test, never here.
export function effectiveRegister(lane, policy) {
  return policy.sites[lane] || policy.default;
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

// The test that replaced the quota. It has to be answerable in one concrete
// sentence, because "is this relevant?" on its own is a question a model
// says yes to.
export const RELEVANCE_TEST = [
  'THE TEST, thread by thread: name the ONE concrete thing the product does that answers THIS OP.',
  'Say that thing to yourself before you draft. If the best you can reach is a category ("it is an',
  'agent system", "it does memory"), or the sentence you wrote would fit fifty other threads, the',
  'thread FAILS — draft implicit. Judge it against the PRODUCT DIGEST above: if the digest does not',
  'describe the thing, the thing does not exist and you may not claim it.',
].join('\n');

// The hidden block prepended to every drafting goal. Everything the model
// needs to decide a register is here; the one judgment left to it is the
// relevance test, which is the judgment that actually needs a reader.
export function buildMentionBlock(policy) {
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
    '',
    'RELEVANCE IS THE ONLY GATE. There is no quota and no per-run limit: every thread is judged on',
    'its own. If ten threads this run are squarely what the product does, all ten drafts name it. If',
    'none are, none do. Never name it to fill a slot; never withhold it from a thread it truly answers.',
    RELEVANCE_TEST,
    '',
    'Registers:',
    `  disclosed — the thread PASSED the test. Answer the OP on the merits FIRST, then ONE sentence of this shape: "${oneLiner(policy)}" ${ONE_LINER_RULE} At most once per comment. Never a link, never a feature list. Never pose as a user of it — you built it, and saying so is what makes the mention allowed. If the comment would not stand as a good answer with that sentence deleted, you are planting a name — drop to implicit.`,
    '  implicit  — the thread FAILED the test, or the lane is implicit-only. No product and no site named at all; still a full, useful answer.',
    'Per lane, the highest register available this run:',
  ];
  for (const lane of MENTION_LANES) {
    const reg = effectiveRegister(lane, policy);
    lines.push(`  ${lane}: ${reg}${reg === 'implicit' ? ' — never name the product on this lane' : ' — may name the product on threads that pass the test'}`);
  }
  lines.push(
    'HN flags promotion hardest, which is why its lane is usually implicit-only.',
    'Set `register` on every drafted card to the register you actually used.',
    '',
  );
  return lines.join('\n');
}
