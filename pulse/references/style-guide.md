# Style Guide

Layered on top of `voice-samples.md`. Voice samples teach the agent
how the user *does* write; this file lists what the agent should
*avoid* writing. Both apply to every draft.

## Avoid (hard list — never appears in output)

- "🚀 ..." or any rocket-emoji opener
- "I'm thrilled / excited / honored to share..."
- "TL;DR:" — lazy. Lead with the actual point.
- "Hot take:" — engagement-bait shorthand
- "Game changer", "paradigm shift", "10x", "level up"
- "Pro tip:", "Here's the thing:", "The truth is:"
- "Just shipped" as the post's only content (build-log, not insight)
- Em-dashes that lecture (e.g., "*— and that's why X.*"). Use em-dashes
  for parenthetical thought, not for moral conclusions.
- Bullet lists that are just rephrased single sentences
- "Thread 🧵" — let the thread structure speak for itself
- Hashtags except when the platform actively rewards them (X mostly
  doesn't). Skip unless there's a niche tag the audience uses.
- The word "synergy" or "stack" used as a verb
- "AI-powered" as the descriptor — say what the AI actually does

## Cadence rules

- **One idea per sentence.** Multiple clauses are fine; multiple
  arguments are not. Split.
- **Concrete > abstract.** Always. Say *"the diff was 12 lines"*, not
  *"the change was small"*. Say *"7am Pacific"*, not *"morning"*.
- **Numbers when you have them.** Token counts, line counts, time
  spent, error rates. Vague claims read as marketing; numbers read
  as engineering.
- **Show the trade-off, not the win.** "X is faster but uses 3x
  memory" beats "X is faster". Engineers respect honesty.
- **End on a real question or a real observation, not a CTA.** No
  "what do you think?" tacked on the end if the post doesn't actually
  invite a discussion.

## Length discipline

- X post: 200-280 chars. If it's longer, it should be a thread or a
  medium article, not a stretched tweet.
- Medium article: 500-1000 words. Single concrete claim with 2-3
  pieces of evidence. Not 1500 words of throat-clearing.
- Long blog: 1500-3000 words. Earn the length with depth — code
  excerpts, diagrams, real numbers. Below 1500 = collapse to medium.

## What good looks like (positive examples)

- *"Spent four hours debugging a missing comma. The error was three
  files away from where it manifested. Reminded me why type systems
  exist."* — concrete, self-deprecating without being weak, ends on
  insight not CTA.
- *"Tested Qwen 27B on Apple Silicon — TTFT made it impractical for
  agent loops. Steady-state throughput was fine; the per-turn startup
  killed it."* — specific, technical, names the actual metric.
- *"Wrote a memory layer that splits always-loaded core (identity,
  style) from on-demand RAG. Cuts retrieval cost on stable facts to
  zero."* — concrete trade-off, no marketing language.

## What bad looks like (negative examples)

- *"🚀 Excited to share that I've been building something special!
  Stay tuned for more updates."* — every LLM defaults to this.
- *"AI is changing everything. Here's why."* — vacuous opening.
- *"I built X. It's a game-changer for Y."* — claim with no evidence.
- *"Pro tip: always cache your queries. You'll thank me later 🙏"* —
  patronizing tone, no actual technical content.
