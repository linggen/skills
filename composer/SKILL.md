---
name: composer
description: >-
  Daily content drafting studio. When invoked (typically by the
  `influencer` mission at 08:00, but also runnable on demand), this
  skill scans the last 24h of work — sessions across Claude Code +
  Linggen, git logs across the user's repos, ling-mem facts — finds
  external context (HN top, lobste.rs newest, arxiv recent, curated
  blogs) that genuinely overlaps with that work, and drafts posts in
  one or more lanes (X post / medium article / long blog). Writes the
  result as a JSON file the composer webpage renders. Never auto-posts.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebSearch
  - WebFetch
  - Memory_query
user-invocable: true
cwd: ~/.linggen
install: install.sh
app:
  launcher: web
  entry: scripts/composer.html
  width: 1200
  height: 900
---

# Composer

Two modes — same skill, two entry paths:

- **Draft mode** — invoked headless by the `influencer` mission (or
  by the user with *"Generate today's drafts"*). Runs the protocol
  below end-to-end and writes `~/.linggen/skills/composer/data/YYYY-MM-DD.json`.
- **Review mode** — user opens the skill webpage. The page reads the
  most recent `data/YYYY-MM-DD.json` and renders it. No agent runs in
  this mode; the data is already on disk from the most recent draft
  pass.

If you (the agent) are reading this because you were invoked, you're
in **draft mode**. Run the protocol below.

---

## Read these first (load-bearing)

Before any drafting, **Read** these files. Match them; do not
paraphrase.

1. `~/.linggen/skills/composer/references/voice-samples.md` — user's
   actual past writing. Anchor cadence, word choice, rhythm. If empty
   or sparse, use plain technical English; do NOT default to
   "🚀 I'm thrilled to share..." LLM cadence.
2. `~/.linggen/skills/composer/references/style-guide.md` — explicit
   avoid-list and cadence rules layered on top of voice samples.
3. `~/.linggen/skills/composer/references/lane-templates.md` — format
   constraints per lane (X 280 chars, medium 500-1000 words, blog
   1500-3000 words).
4. `~/.linggen/skills/composer/references/source-blogs.md` — curated
   personal-blog feeds beyond HN/lobste.rs.

## Drafting protocol

> Drafts ground real work in current conversation. Not "I shipped X
> today" build-logs. Not "HN is wrong about X" hot takes. The post
> earns its place when (a) the user did real work, AND (b) that work
> connects to something currently being discussed externally — and the
> connection is *technical*, not topical.

### Phase 1 — Gather context

Run `scripts/collect.sh` via Bash. It writes
`/tmp/composer-manifest-<date>.json` containing:
- `sessions[]` — last 24h sessions (path, user-turn count, byte size)
- `commits[]` — last 24h git logs from `~/workspace/*` repos
- `memories[]` — ling-mem rows added/updated in last 24h (use
  `Memory_query` to fetch, with `since: <yesterday-iso>`)
- `voice_samples` — preloaded text of voice-samples.md

If the manifest shows fewer than 2 substantive sessions (`user_turns
< 2 AND bytes < 2000`) AND zero meaningful commits AND zero new
memories → jump to **skip output** (Phase 5b).

### Phase 2 — Extract themes (cap: 3)

Identify 1-3 distinct themes from the day. A theme is one of:
- A shipped feature (commits + landing-page changes + session
  activity aligned around one thing)
- A technical insight or trade-off encountered (look in ling-mem rows
  of type `learned` / `fixed` / `tried`)
- A design decision or architecture pivot (`decision` type +
  related session content)

Drop themes that are pure ops chores (renamed branches, merged a
trivial PR, version bumps). They don't generate posts.

### Phase 2b — Fallback mode (when no themes emerged)

If Phase 2 found 0 themes worth posting, switch to **fallback mode**:
write a generalizable technical-pattern piece grounded in something
the user has built. Pick ONE primitive from the running system the
user knows deeply:

- Cron-scheduled autonomous agents (the mission pattern)
- Dual-tier memory: always-loaded core + on-demand RAG
- "Recommends, doesn't act" agent design
- Skill-as-app file-format conventions (SKILL.md frontmatter)
- Per-fact memory files vs single mega-doc
- Headless agent runs with file-based output (no UI)
- Voice anchoring via samples for LLM-generated content (this very
  skill is an example, but write about the pattern, not the skill)

**Critical framing rule for fallback**: the post is about the
*pattern*, not the user's product. The user's implementation is *one
example among others*. Compare to alternative approaches; cite at
least one external source (HN/lobste.rs/arxiv) of someone discussing
the same primitive. The pattern is the subject; Linggen / Sys Doctor
/ ling-mem appear at most once each, as illustration.

Wrong framing (drop): *"How Linggen's mission system works"*
Right framing (use): *"Cron-driven autonomous agents: a pattern for
nightly consolidation work"* — Linggen mentioned once, two other
implementations cited for contrast.

Fallback always produces ONE draft (medium-length article, ~600-800
words). No X-post or blog-length output in fallback mode — those
need fresh signal.

### Phase 3 — Find external signal (cap: 8 sources scanned)

For each theme, dispatch parallel `WebSearch` + `WebFetch` calls:

1. **HN top** — `WebSearch "site:news.ycombinator.com <theme keyword>"`
   filtered to last 7 days. Pick top 1-2 hits per theme.
2. **lobste.rs newest** — `WebFetch https://lobste.rs/newest` and grep
   the result for theme keywords in titles/tags.
3. **arxiv recent** — `WebSearch "site:arxiv.org <theme keyword>"`
   filtered to last 30 days, only if theme is research-adjacent.
4. **Curated blogs** — `WebFetch` each URL listed in
   `references/source-blogs.md` (cap 5 URLs total) and look for posts
   mentioning theme keywords.

For each external hit, score on a 0-1 scale:
- 1.0 = the article makes a specific technical claim that user's work
  directly addresses, contradicts, or extends
- 0.5 = topically related, no specific overlap
- 0.0 = same broad domain (AI, agents) but no real connection

**Hard cutoff: drop everything below 0.6.** Topical-but-thin links
poison the post.

### Phase 4 — Draft posts

Determine the day's *weight* from manifest signal:
- `small` = 1-2 small commits, no shipped feature, 1 weak insight
- `medium` = feature shipped or major learning + at least one strong
  external source (score ≥ 0.7)
- `large` = multiple aligned themes + strong external sources + a
  user insight worth deep treatment

Generate drafts per weight:
- `small` → 1 X-post draft (or skip if even that's a stretch)
- `medium` → 1 X-post + 1 medium-length article draft
- `large` → all three (X + medium + blog)

Each draft MUST:
- Open with the user's lived experience or technical observation, not
  with the external article. The user is the protagonist; external
  content provides context.
- Cite every external reference inline as a markdown link.
- Match voice samples — read 3 samples before writing each draft and
  silently mimic their cadence.
- Avoid LLM defaults: NO "🚀", NO "I'm thrilled to share", NO
  "TL;DR:", NO em-dash sentences that lecture.
- Stay within length limits per lane (see `lane-templates.md`).

#### Multi-pass drafting (per draft, in this order)

1. **Pass 1 — structural draft.** Write the post focused only on
   claim + evidence + structure. Voice doesn't matter yet; just get
   the argument right. Output to scratch.
2. **Pass 2 — voice rewrite.** Re-read 3 voice samples. Rewrite the
   structural draft sentence-by-sentence in matching cadence. Apply
   style-guide.md hard rules (avoid-list).
3. **Pass 3 — tic check.** Re-read the rewritten draft. Find and
   delete: any "🚀" / "I'm thrilled" / "TL;DR" / "Hot take" / "game
   changer" / "level up" / "AI-powered" / opening hashtag / closing
   "what do you think?". Replace with concrete prose.

The user reviews and polishes after; drafts are ~80% of the post,
not 100%. Realistic framing — don't try to ship zero-edit output.

### Phase 5 — Write output

Write `~/.linggen/skills/composer/data/$(date +%Y-%m-%d).json`:

```json
{
  "date": "YYYY-MM-DD",
  "weight": "small|medium|large|skip",
  "summary": ["bullet 1 (what user did)", "bullet 2", "..."],
  "external_sources": [
    {
      "url": "https://...",
      "title": "...",
      "source": "hn | lobste.rs | arxiv | blog",
      "score": 0.85,
      "why": "shared trade-off on agent memory cache invalidation"
    }
  ],
  "drafts": [
    {
      "lane": "x-post | medium | blog",
      "content": "...",
      "citations": ["https://..."]
    }
  ],
  "skipped": false,
  "skip_reason": null
}
```

Also update `~/.linggen/skills/composer/data/latest.json` to be a
copy or symlink of today's file, so the webpage can read "today" by
default.

### Phase 5b — Skip output

When nothing earns a post:

```json
{
  "date": "YYYY-MM-DD",
  "weight": "skip",
  "summary": ["bullet 1 (what happened, even if small)"],
  "external_sources": [],
  "drafts": [],
  "skipped": true,
  "skip_reason": "no shipped feature; no insight earning a post; no strong external connection"
}
```

### Phase 6 — Return

Final agent message — exactly one of:
- `drafts written: N` (where N is the count of generated drafts)
- `skipped: <one-phrase reason>`

The mission wrapper reads this line to compose the notification body.
Do NOT include any other commentary; the mission's logic is exact-string-matching this line.

## Hard safety rails

- NEVER call any external posting API (X, Mastodon, Bluesky, etc.).
  Drafts go to disk only.
- NEVER follow links the search returns that aren't on the curated
  source list, HN, lobste.rs, or arxiv. Don't WebFetch arbitrary URLs.
- NEVER include the user's name or identifying details from sessions
  in drafts unless they appear in voice-samples.md.
- If a draft accidentally promotes Linggen / Sys Doctor / ling-mem,
  **drop the draft.** Self-promotion is what got the user filtered on
  HN. This skill exists to AVOID that pattern, not reproduce it.
  Build-in-public posts about user's *technical* work are fine;
  thinly-disguised marketing is not.
