# Commitments module — spec

One module for every large fixed recurring payment: loans (home/auto), insurance,
rent/bills, subscriptions. Loans and insurance are subscriptions with a term
attached — same detection, richer per-kind actions.

## Detection (analyze.js)

- Reuse the subscription detector (cadence + clustered amount). Add a `kind`
  field per recurring merchant via keyword rules on merchant_key:
  `loan:home`, `loan:auto`, `insurance:auto|home|life`, `bill`, `sub` (default).
- The existing `increased` price-hike flag applies to every kind — insurance
  premium creep is first-class, same as a Netflix hike.

## UI (cfo.html / cfo.js — no new page)

- Third tab `data-view="commit"` → hidden `<section id="commit">`, same
  pattern as Transactions.
- Report view gets ONE headline card: "Fixed commitments $X/mo · N% of income"
  with a debt / insurance / bills / subs split. Clicking it opens the tab.
- Commitments tab: rows grouped by kind. Each row shows detected merchant,
  monthly amount, cadence — plus **editable fields**: balance, rate %,
  term/renewal date. Kind-override dropdown (same UX as category corrections).
- Inputs persist to `data/commitments.json` keyed by merchant_key (written via
  /api/bash, same as corrections). `saveReport()` merges them into the report
  so the agent sees them through LatestAnalysis.
- Page-side deterministic math (zero LLM):
  - loans → remaining interest, payoff date, prepayment slider
    ("+$200/mo → save $X interest, done Y years early")
  - mortgage → renewal countdown badge + "+1% → +$Z/mo" stress line
  - insurance → renewal countdown, premium-creep delta

## Privacy

- Statement balance columns: still stripped (unchanged).
- User-ENTERED balance/rate/term: included in the redacted report's
  `commitments` block — voluntarily provided, needed for advice. Account
  numbers never, from any source.

## Agent layer (SKILL.md — add only when the data ships)

- LatestAnalysis description += `commitments` block.
- "Subscription assassin" generalizes to **bill assassin**: insurance premium
  creep → shop-around quote-request draft; mortgage renewal ≤6 months →
  rate-match draft; car loan → total-remaining-interest reveal. Same rails:
  draft only, user sends; ask, never assert overpriced/unused.
- Review rubric gains a "Commitments" item.

## MVP order

1. analyze.js `kind` classifier + `commitments` block in the report
2. Commitments tab + editable fields + persistence
3. Loan math, prepayment slider, renewal countdowns
4. SKILL.md additions (daemon restart to re-register)

Deferred: live rate fetch, "can I afford X" affordability what-if.
