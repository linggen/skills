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
