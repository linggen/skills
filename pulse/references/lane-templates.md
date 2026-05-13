# Lane Templates

Format constraints per lane. The agent picks lanes based on the day's
*weight* (see Phase 4 in SKILL.md). Each draft must fit its lane's
constraints.

## x-post

- **Length**: 200-280 chars (X's free-tier limit). Don't pad to fill;
  if the idea is 180 chars, ship 180.
- **Structure**: one claim + one piece of evidence. No bullet lists.
  No threads in the x-post lane — if it needs threading, escalate to
  medium.
- **No URLs in main tweet body** (X downranks links). Citation goes
  in a follow-up reply tweet, surfaced as `citations[]` in JSON for
  the user to post manually after the main one.
- **Opening pattern**: lead with the concrete observation, not a
  setup phrase. *"Tested Qwen 27B on Apple Silicon — TTFT killed it
  for agent loops"* beats *"Today I want to share something about
  Qwen 27B."*
- **No emojis except** when the post is genuinely funny or the emoji
  IS the point (e.g., a literal stethoscope 🩺 for Sys Doctor). Skip
  decorative emojis.

## medium

- **Length**: 500-1000 words. Below 500 = it should be an x-post.
  Above 1000 = it should be a blog.
- **Structure**: opening hook (≤2 sentences) → claim → 2-3 pieces of
  evidence → trade-off / caveat → closing observation (not CTA).
- **External citations**: 1-3 inline markdown links. If you have more
  than 3, prune to the strongest ones.
- **Headers**: optional, max 2-3 H2s. Don't header every paragraph.
- **Code/numbers**: include at least one concrete number or code
  excerpt if technical. Vague claims get skipped by readers.
- **Audience**: assume the reader is technically literate but doesn't
  know your specific stack. Define jargon on first use.

## blog

- **Length**: 1500-3000 words. Below 1500 = collapse to medium.
  Earn the length with depth — this lane is for posts where the
  argument genuinely needs space.
- **Structure**: opening (anecdote or question) → context (why this
  problem) → exploration (multiple approaches considered) → your
  approach + trade-offs → results / what you'd change → conclusion.
- **External citations**: 3-7 inline links to prior art, related
  papers, alternative approaches.
- **Code excerpts**: include real snippets where they clarify the
  argument. Don't paste 200-line files; pick the 5-15 lines that
  matter.
- **Diagrams**: if the post would benefit from one, include an ASCII
  diagram or a textual description ("imagine three boxes connected
  by arrows..."). The agent doesn't render images — leave a
  placeholder for the user to add a graphic if needed.
- **Audience**: same as medium, but with more depth tolerance.
- **Title**: write 3 candidate titles in the JSON output's
  `title_candidates[]` field for blog drafts; the user picks.

## reddit-comment

- **Length**: 1-4 sentences typically, 50-120 words max. Reddit
  comments that earn upvotes are short. Anything longer reads as
  monologue and gets skipped.
- **Voice — first person, from the user.** Write *as* the user, not
  as a neutral advisor. The brief tells you who they are and what
  they're building — let that perspective leak through in which
  questions you ask and which trade-offs you notice. The reader
  should feel that *someone with skin in the game* is talking, not a
  generic expert offering best practices.
- **Three registers — pick one, default to (1):**
  1. **Implicit** (default). Write from the perspective of someone
     who's been thinking about this stuff. No mention of the user's
     project. Most comments land here.
  2. **Contextual.** "Hit the same wall building X" / "we ran into
     this on a similar thing." Used only when the thread topic
     directly overlaps with what the brief describes, so it'd feel
     evasive *not* to ground the opinion in actual experience.
  3. **Explicit.** "We do X in <project> because Y." Only when the
     OP asks "what tools handle this?" or otherwise invites it.
     Basically never in cold discovery.
- **Anonymization test** (use this to decide promo vs. authentic):
  would the comment work just as well if you stripped the project
  name? If yes — fine. If the comment exists to *plant* the name —
  drop the draft. No URLs to landing pages, no CTAs, no "you should
  try X."
- **Anti-AI tics — strip in pass 3:**
  - Diagnostic openers: "X has two problems" / "X comes down to" /
    "the issue is" — humans don't open with whole-problem framings,
    they react.
  - Symmetric clauses: "the model sees too much … and still misses
    …" — parallel construction reads as AI. Make one clause longer.
  - Triple-slash lists: "A / B / C" — a human names one thing they
    actually tried, not a menu.
  - Closing trade-off summary: "It's less X but Y." Delete the
    moral. Stop one sentence earlier.
  - Generic-advisor stance: "I'd try …" with no grounding. Either
    ground it in experience or drop to a question.
- **Open with a reaction or question, not a thesis.** "wait, are you
  running it without the accessibility tree?" beats "Screenshot-only
  desktop agents hit two problems at once."
- **Optionally end with a question back to OP** if the thread invites
  dialogue. Not mandatory.
- **JSON output**: include the target sub in the lane payload so the
  user knows where to post:
  ```json
  { "lane": "reddit-comment",
    "sub": "LocalLLaMA",
    "thread_url": "https://reddit.com/r/...",
    "register": "implicit",
    "content": "..." }
  ```

## linkedin

- **Length**: 800-2000 chars (~150-350 words). LinkedIn truncates
  posts above ~210 words behind a "see more" — front-load the claim.
- **Structure**: hook in the first 2 lines (visible above the fold)
  → 2-3 short paragraphs of substance → closing line that's a
  thought, not a CTA. No bullet lists with single-word items.
- **External citations**: 0-2 links inline. LinkedIn downranks posts
  with multiple external links — be sparing.
- **Tone**: more formal than X, less formal than blog. Plain English,
  no jargon without definition. Avoid LinkedIn-default phrases:
  "thrilled to share", "humbled to announce", "game-changer".
- **No hashtags in the body**. If the user wants tags, they go in a
  trailing line — but skipping them entirely is fine.
- **Audience**: assume professional readers in adjacent fields, not
  hardcore practitioners. Define jargon, link to deeper material if
  the reader wants more.

## substack

- **Length**: 600-1500 words. Mid-length. Substack readers expect
  more depth than X but less than a long blog.
- **Structure**: opening hook (1-2 paragraphs) → 2-3 sections with
  H2 headers → closing observation. Include at least one concrete
  example or anecdote — Substack rewards narrative texture.
- **External citations**: 2-5 inline links to prior art or sources.
- **Audience**: subscribers chose to be there; you can be more
  opinionated than blog. Take a stance.
- **Title**: write 3 candidates in `title_candidates[]` for the user
  to pick. Substack subject lines drive open rates more than any
  other lane.
- **Subtitle**: include a 1-line subtitle in the JSON output as
  `subtitle`. Substack uses it as the email preview.

## Format-specific JSON shape

```json
{
  "lane": "x-post",
  "content": "...",
  "citations": ["https://..."]
}
```

```json
{
  "lane": "medium",
  "title_candidates": ["...", "...", "..."],
  "content": "...",
  "citations": ["https://...", "https://..."]
}
```

```json
{
  "lane": "blog",
  "title_candidates": ["...", "...", "..."],
  "content": "...",
  "citations": ["https://...", "https://...", "https://..."]
}
```
