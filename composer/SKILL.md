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
permission:
  mode: admin
  paths:
    - ~/.linggen/skills/composer
    - /tmp
  warning: >-
    Composer reads its references + the page-collected context manifest
    from /tmp, drafts posts in memory, and writes the output JSON to its
    own data dir. Bash collection (sessions, commits, memories) runs in
    the skill webpage's iframe, not in the agent — so the agent itself
    never needs filesystem access beyond its own skill dir and /tmp.
tools:
  - name: FetchHackerNews
    description: >-
      Fetch the 30 current top HN stories. Returns JSON array of
      {id, title, url, score, by, descendants, hn_url, age_hours}.
      Call during Phase 3 to scan HN for posts that overlap with
      today's themes. Filter the result by theme keyword in your
      reasoning and score 0-1 for technical specificity.
    cmd: "$SKILL_DIR/scripts/sites/hackernews.sh"
    tier: read
    timeout_ms: 30000
  - name: FetchReddit
    description: >-
      Fetch the 25 newest threads from each subreddit listed in
      ~/.linggen/skills/composer/config.json (sites.reddit.subs).
      Returns JSON array of {sub, title, url, comments, age_hours,
      summary}. Call during Phase 3. Filter by theme keyword and
      score for relevance.
    cmd: "$SKILL_DIR/scripts/sites/reddit.sh"
    tier: read
    timeout_ms: 30000
  - name: FetchLobsters
    description: >-
      Fetch the lobste.rs newest feed. Returns JSON array of
      {title, url, comments_url, score, tags, submitter_user,
      created_at, description}. Call during Phase 3.
    cmd: "$SKILL_DIR/scripts/sites/lobsters.sh"
    tier: read
    timeout_ms: 30000
  - name: FetchArxiv
    description: >-
      Fetch the 30 most recently submitted arxiv papers from CS.AI /
      CS.LG / CS.CL. Returns JSON array of {title, summary, url,
      authors, published}. Call during Phase 3 only when a theme is
      research-adjacent.
    cmd: "$SKILL_DIR/scripts/sites/arxiv.sh"
    tier: read
    timeout_ms: 30000
  - name: FetchRSS
    description: >-
      Fetch each RSS/Atom feed listed in
      ~/.linggen/skills/composer/config.json (sites.rss.feeds).
      Returns JSON array of {feed, title, url, summary, date}.
      Call during Phase 3 if RSS sources are configured.
    cmd: "$SKILL_DIR/scripts/sites/rss.sh"
    tier: read
    timeout_ms: 30000
---

# Composer

Two modes — same skill, two entry paths:

- **Draft mode** — invoked headless by the `influencer` mission (or
  by the user with *"Generate today's drafts"*). Runs the protocol
  below end-to-end and writes `~/.linggen/skills/composer/data/YYYY-MM-DD.json`.
- **Review mode** — user opens the skill webpage. The page reads the
  most recent `data/YYYY-MM-DD.json` and renders it. If the user opened
  the page (no `source=mission` query param) and there is no data file
  for today, the page auto-starts a drafting session in an embedded
  Linggen chat panel — the agent runs the protocol below and the page
  swaps to the rendered drafts when the JSON file lands. Mission
  notifications always include `source=mission` so the deep-link only
  shows existing data and never spawns a second run.

If you (the agent) are reading this because you were invoked, you're
in **draft mode**. Run the protocol below.

---

## Read these first (load-bearing)

Before any drafting, **Read** these files. Match them; do not
paraphrase.

1. `~/.linggen/skills/composer/references/brief.md` — user's
   self-described purpose, audience, voice rules, and active context.
   This is the most load-bearing file — it tells you what the user is
   trying to accomplish, who reads their work, and what hard rules to
   honor. Re-anchor to it after every phase.
2. `~/.linggen/skills/composer/references/voice-samples.md` — user's
   actual past writing. Anchor cadence, word choice, rhythm. If empty
   or sparse, use plain technical English; do NOT default to
   "🚀 I'm thrilled to share..." LLM cadence.
3. `~/.linggen/skills/composer/references/style-guide.md` — explicit
   avoid-list and cadence rules layered on top of voice samples.
4. `~/.linggen/skills/composer/references/lane-templates.md` — format
   constraints per lane (X 280 chars, medium 500-1000 words, blog
   1500-3000 words, reddit-comment, linkedin, substack).
5. `~/.linggen/skills/composer/references/source-blogs.md` — curated
   personal-blog feeds beyond HN/lobste.rs.

## Drafting protocol

> Drafts ground real work in current conversation. Not "I shipped X
> today" build-logs. Not "HN is wrong about X" hot takes. The post
> earns its place when (a) the user did real work, AND (b) that work
> connects to something currently being discussed externally — and the
> connection is *technical*, not topical.

### Phase 1 — Gather context

The skill webpage runs `scripts/collect.sh` for you (client-side, via
the iframe's `/api/bash` channel — not gated by agent permissions) and
passes the manifest path in the kickoff prompt as `MANIFEST_PATH`. Open
it with **Read**. The manifest contains:
- `sessions[]` — last 24h sessions (path, user-turn count, byte size)
- `commits[]` — last 24h git logs from `~/workspace/*` repos
- `memories[]` — ling-mem rows added/updated in last 24h (use
  `Memory_query` to fetch more if needed)
- `voice_samples` — preloaded text of voice-samples.md

You do NOT have Bash. If the kickoff prompt is missing `MANIFEST_PATH`,
ask the user to refresh the page rather than trying to shell out.

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

Sources are configured by the user in `~/.linggen/skills/composer/config.json`
under the `sites` block. Read that file first to discover which sites
are enabled, then call the corresponding **registered tool** for each:

| Site (config key)    | Tool to call       | Notes                              |
|----------------------|--------------------|------------------------------------|
| `hackernews`         | `FetchHackerNews`  | Returns top 30 HN stories          |
| `reddit`             | `FetchReddit`      | Reads `subs[]` from config         |
| `lobsters`           | `FetchLobsters`    | Lobsters newest feed               |
| `arxiv`              | `FetchArxiv`       | Recent CS.AI / CS.LG / CS.CL       |
| `rss`                | `FetchRSS`         | Reads `feeds[]` from config        |

Dispatch the enabled tools in parallel. Each tool returns a JSON array;
read its output, then filter by theme keyword in your own reasoning.
Do **not** fall back to raw `WebSearch` / `WebFetch` for sites covered
by a tool — the tools run pre-approved (no permission prompt) and are
the configured source of truth. `WebSearch` is reserved for one-off
research outside the configured site set.

If a theme is research-adjacent and `arxiv` is enabled, prefer
`FetchArxiv` over generic web search.

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

Read `~/.linggen/skills/composer/config.json`'s `targets` block to
discover which lanes the user has enabled. Only draft for targets
where `enabled: true`. Match each draft to the lane spec in
`references/lane-templates.md`.

Pick which enabled targets get drafts based on weight:
- `small` → 1 short-form draft (pick the shortest enabled target —
  typically `x-post`; skip if no enabled target fits the signal level)
- `medium` → 1 short-form + 1 mid-length draft (e.g. `x-post` +
  `medium` or `linkedin`)
- `large` → draft for every enabled target

If a weight calls for a lane that's not enabled, skip it (don't draft
into a disabled target). Reddit-comment is a special case: only draft
one if a Phase 3 source surfaced a high-relevance Reddit thread
(score ≥ 0.8) that directly invites a comment from your expertise.

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
