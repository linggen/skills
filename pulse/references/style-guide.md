# Style Guide

Layered on top of the user's brief. The brief teaches the agent how
the user *does* write (cadence anchor); this file lists what the
agent should *avoid* writing. Both apply to every draft.

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

## Lead artifact + mode (the most important section)

Drafts come in three shapes. The Draft step picks one per lane based on
what's on the page. The shape decides where the post *opens* — which is
what determines whether anyone reads past the first line.

### local-led (use when the local artifact is publicly legible)

Opens with the artifact. Signal / discovery cards are supporting
evidence at most. Works when the local thing speaks for itself — a
vivid bug, a measurable change, a benchmark a stranger can grok.

> *"`/api/bash` glued `__LINGGEN_CWD__` onto JSON whenever `cat` ended
> with `}` and no newline. `JSON.parse` choked; past sessions looked
> empty. Fix: substring-strip, not line-strip."*

Why it works: triggering condition first, named identifiers (`/api/bash`,
`__LINGGEN_CWD__`, `JSON.parse`), concrete symptom, the fix is the
punchline. An engineer who's written shell wrappers feels the bug in
their bones — they don't need to know what Pulse is.

### web-led + local proof (best — use whenever both exist)

Opens with the web hook (the question the public is already asking),
then pivots to the local artifact as the proof point. The hook earns
attention from people who've never heard of the project; the local
artifact gives the post a stake nobody else has.

> *"Every plugin system hits the same question: how much UI does a
> plugin bring with it? Yesterday I deleted 350 lines from a Pulse
> skill — replaced a custom session sidebar with `<iframe
> src=/sessions?skill=pulse>`. Net −562 / +74. The host's running-agent
> spinner came for free."*

Why it works: the opening line is a question someone on Claude
skills / ChatGPT plugins / Cursor extensions is *already asking*. The
local detail (numbers, specific iframe URL, "spinner came for free")
proves the writer actually did the work, not just had an opinion.

### web-only (use sparingly — no personal stake)

Opens with an observation about something the audience is talking
about. No "I shipped this" anchor. Works only when the observation
itself is specific and contested.

> *"Three new desktop-agent demos this week on r/LocalLLaMA, all
> tripped on the same wall: small VLMs choke on dense UIs. Visual
> token count per screenshot is way higher than people expect — that's
> the real ceiling on screenshot-only agents, not the model size."*

Why it works (barely): named source (r/LocalLLaMA), a count (three),
a specific metric (visual token count), and a contested claim
("that's the real ceiling … not the model size"). Use this mode
twice in a row and the feed starts feeling like industry commentary.
Pivot back to local-led or web-led + local proof.

### Lead test

Before shipping any draft: read the first sentence in isolation. Could
a stranger in the lane's audience (r/<sub> for reddit-comment, the X
feed of the user's peers for x-post) tell what this post is about in 3
seconds, AND would they care? If "no" on either — drop down a mode.
Empty is fine. Fabricating a hook is not.

## Anti-AI tics (apply to every lane, not just reddit-comment)

These are the moves an LLM defaults to and a human almost never makes.
Strip them in Pass 3 of the draft loop.

- **Aphorism openers.** "A skill should not rebuild the host around
  itself" / "Good architecture is about boundaries" / "The best code
  is the code you don't write." Humans don't open with axioms; they
  open with a thing that happened. Replace with the thing.
- **Diagnostic openers.** "X has two problems" / "X comes down to" /
  "the issue is..." Same family as aphorisms — whole-problem framings
  the writer didn't actually need to state.
- **Symmetric / parallel clauses.** "Less product code, fewer cache
  bugs, and one clearer boundary." "The model sees too much and
  still misses the point." Parallel triplets read as AI. Pick one,
  make it concrete, drop the rhythm.
- **Triple-slash menus.** "A / B / C." A human names *one* thing they
  actually tried, not a menu of three abstractions.
- **Closing moral / trade-off summary.** "It's less X but Y." "Simpler
  is better." Delete the moral. Stop one sentence earlier and let the
  evidence land.
- **Abstract-noun framings.** "boundary", "intent", "ownership",
  "alignment", "principle", "approach", "primitive". If a sentence
  could describe any refactor in any codebase, it has no signal.
  Replace the abstract noun with the specific artifact (file path,
  function name, number).
- **Generic-advisor stance.** "I'd try X." "You should consider Y."
  Either ground it in something you actually did, or drop to a
  question.

**Opener test.** Read the first sentence in isolation. Could it open
a post about a completely different project? If yes — rewrite. Real
openers name a specific thing: a number, a file, a metric, a moment.

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
