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

- **Length**: 50-200 words. Reddit comments that earn upvotes are
  short and substantive. Long comments are skipped or treated as
  monologue.
- **Structure**: answer the OP's question first (one-two sentences),
  then add the texture or trade-off, then optionally a reference. No
  preamble. No "great question".
- **No domain links to user's own marketing pages**. GitHub repo URLs
  for OSS code are acceptable when directly relevant. Bare landing
  pages are not.
- **Self-reference cap**: max ONE mention of user's own project. If
  the comment doesn't naturally need it, drop it.
- **"Author here" framing** if mentioning own project: signals
  honesty, not stealth marketing.
- **Tone**: helpful, specific, opinionated. Reddit penalizes
  "actually I'm building something similar" comments — say *what*
  you've learned, not *that* you're building.
- **JSON output**: include the target sub in the lane payload so the
  user knows where to post:
  ```json
  { "lane": "reddit-comment",
    "sub": "LocalLLaMA",
    "thread_url": "https://reddit.com/r/...",
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
