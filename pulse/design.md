---
type: design
reader: Coding agent and contributors
guide: |
  Architectural design — capability protocols, tool catalog, data model,
  state layer, dispatch rules. Companion to product-spec.md (which is
  vision-and-surfaces). Brief; no code; no roadmap copy.
---

# Design: Pulse

## Architecture in one diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  User                                                           │
│    types goal      reviews Pulse      polishes drafts           │
└──────────┬──────────────┬──────────────────┬──────────────────┘
           ▼              ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Pulse skill (the agent)                                        │
│    reads brief.md  +  goal text  +  state layer                 │
│    dispatches capabilities  ──▶  emits one run JSON             │
└──────────┬──────────────────────────────┬────────────────────┘
           ▼                              ▼
┌──────────────────────┐         ┌─────────────────────────┐
│ Site tools           │         │ Local collectors        │
│ (registered, read)   │         │ (iframe-side bash)      │
│                      │         │                         │
│ Reddit, HN, Lobsters │         │ sessions, commits,      │
│ arxiv, RSS,          │         │ memory, project-path,   │
│ Google Trends RSS,   │         │ artifact URL            │
│ GitHub Trending,     │         │                         │
│ Product Hunt RSS,    │         │                         │
│ Wikipedia pageviews  │         │                         │
└──────────────────────┘         └─────────────────────────┘
```

The skill is a small dispatcher. The intelligence lives in the brief
+ goal + capability protocols. Tools are dumb data sources; collectors
are dumb shell scripts.

## Capabilities (engine-internal)

Five capabilities. Dispatched by the agent based on the goal text.
Capabilities do NOT appear in the UI; users never pick one.

### `research-market`
- Pull from: HN top, Lobsters newest, arxiv recent, configured RSS,
  Google Trends Daily RSS, GitHub Trending, Product Hunt RSS,
  Wikipedia pageviews for brief-extracted topics.
- Score each hit 0–1 for technical relevance to the brief's topics.
- Output → `market_landscape[]` + entries in `external_sources[]`.

### `discover-customers`
- Pull from: configured Reddit subs (`/new` and `/rising`), HN, Lobsters.
- Filter for posts asking questions / describing pain that brief-extracted
  expertise can answer.
- Output → `customer_pain_points[]` + `comment_candidates[]` (with
  draft starter, target sub, thread URL).

### `monitor-mentions`
- Watchlist auto-derived from `brief.md`: own product names, named
  competitors, user's GitHub login / handles. User can override by
  adding an explicit `## Watchlist` section to brief.md.
- Pull from: same sources as `discover-customers` plus any past Pulse
  threads the user has posted to (for reply triage).
- Two outputs:
  - `mentions[]` — *"@user mentioned Sys Doctor in r/macapps thread X"*
  - `replies_due[]` — unanswered comments on the user's recent posts,
    each with a draft reply.

### `track-progress`
- Pull from: sessions (Claude Code + Linggen), git commits in
  `~/workspace/*` repos, ling-mem rows, optional `project_path` (reads
  README + recent docs).
- Window: 24h by default; configurable via goal text or scope hint.
- Cross-references the **launch timeline** in the state layer to know
  where the user is in the launch sequence (week-1 vs week-3 etc.).
- Output → `progress_digest[]`.

### `draft-content`
- Synthesizes input from the other capabilities into platform-shaped
  drafts. Lane catalog in `references/lane-templates.md` (x-post,
  reddit-comment, blog, medium, linkedin, substack, plus future:
  dm, email).
- Multi-pass drafting: structural → voice rewrite (matching
  voice-samples.md) → tic-check (deletes "thrilled", "game-changer",
  closing CTA, etc.).
- Output → `drafts[]`.

## Site tools (registered)

Each is a `tier: read` script under `scripts/sites/`, registered in
SKILL.md frontmatter. The agent calls them by name; no permission
prompts.

### Currently shipped

| Tool | Source | Capability uses |
|:-----|:-------|:----------------|
| `FetchHackerNews` | `topstories.json` (Firebase) | research-market, discover-customers, monitor-mentions |
| `FetchReddit` | `/r/<sub>/new.json` per configured sub | discover-customers, monitor-mentions, track-progress (replies) |
| `FetchLobsters` | `/newest.json` | research-market, discover-customers |
| `FetchArxiv` | OAI/Atom for CS.AI/LG/CL | research-market |
| `FetchRSS` | configured RSS/Atom feeds | research-market, discover-customers |

### Planned (v1.5)

| Tool | Source | Capability uses |
|:-----|:-------|:----------------|
| `FetchGoogleTrendsDaily` | `trends.google.com/trending/rss?geo=<region>` | research-market |
| `FetchGitHubTrending` | scrape `github.com/trending/<lang>?since=daily` | research-market |
| `FetchProductHuntRSS` | `producthunt.com/feed` | research-market, discover-customers |
| `FetchWikipediaPageviews` | `wikimedia.org/api/rest_v1/metrics/pageviews/...` for brief-derived topics | research-market |
| `FetchRedditRising` | `/r/<sub>/rising.json` (extends FetchReddit) | discover-customers |

Each new tool: ~30 lines of bash, one entry in SKILL.md frontmatter,
no engine change.

## Operator surface: the Pulse page

Three vertical sections, top-to-bottom:

```
┌─────────────────────────────────────────────────────────────────┐
│ Status strip                                                    │
│ "r/macapps 47/50 · HN warm · X up · 8d since launch ·           │
│  week-2 follow-up due"                                          │
├─────────────────────────────────────────────────────────────────┤
│ Mentions  +  Replies due                  [highest priority]   │
│ ─ "@user named Sys Doctor in r/macapps thread"                  │
│ ─ "3 unanswered replies on your HN post"                        │
├─────────────────────────────────────────────────────────────────┤
│ Discovery                                 [cold opportunities] │
│ ─ "r/LocalLLaMA: 'how do I add tool calling to Ollama?' "       │
├─────────────────────────────────────────────────────────────────┤
│ Signal + Progress + Drafts                [daily summary]      │
│ ─ market landscape cards                                        │
│ ─ "yesterday you shipped X, drafted Y"                          │
│ ─ drafts pending review                                         │
└─────────────────────────────────────────────────────────────────┘
```

Mentions + Replies always rank above cold Discovery — *"responding to
existing engagement converts higher than starting new conversations."*

## State layer

State that persists *across* runs. Distinct from per-run output.

```
~/.linggen/skills/pulse/state/
  account-health.json     # per-platform karma, throttle status, last-post-at
  launches.json           # active launches: artifact, launch-date, follow-up cadence
  audience.json           # derived: who responds to your posts, common topics
  watchlist-cache.json    # last-extracted watchlist (for diff against brief.md)
  posted.json             # threads the user posted to (for follow-up reply tracking)
```

State is updated by capabilities (e.g., `monitor-mentions` writes
`watchlist-cache.json` and `posted.json`) AND by the page (the `Mark
posted` card action writes a new entry to `posted.json` directly).

### `watchlist-cache.json`

```json
{
  "extracted_from": "brief.md",
  "brief_mtime": "2026-05-06T10:24:00Z",
  "extracted_at": "2026-05-06T08:00:00Z",
  "products": ["Sys Doctor", "Linggen", "ling-mem"],
  "competitors": ["CleanMyMac", "Hazel", "DevonThink", "DaisyDisk"],
  "self": ["@Linggen77", "linggen on GitHub"]
}
```

Re-extracted by `monitor-mentions` when `brief.md` mtime is newer than
`brief_mtime`. If `brief.md` has an explicit `## Watchlist` section,
that's parsed verbatim (override path); otherwise the agent extracts
via LLM.

### `posted.json`

```json
{
  "$schema_version": 1,
  "posts": [
    {
      "id": "post-abc123",
      "draft_id": "draft-xyz789",
      "url": "https://news.ycombinator.com/item?id=48025509",
      "platform": "hn",
      "title": "Rewriting CleanMyMac as an AI-native app",
      "posted_at": "2026-05-05T14:22:00Z",
      "last_checked": "2026-05-06T08:00:00Z",
      "comment_ids_seen": ["c-id-1", "c-id-2"],
      "responses": []
    }
  ]
}
```

Written when:
- The user clicks `✓ Posted` on a draft card (the page prompts for the
  URL inline and writes the new entry).
- `monitor-mentions` updates `last_checked` and `comment_ids_seen`
  after re-polling each thread.

Read by `monitor-mentions` to know which threads to poll for new
replies; surfaced in the Pulse page as `reply` cards (with optional
`follow_up` blocks for replies-to-your-reply).

### `account-health.json`, `launches.json`, `audience.json`

Defined here for completeness; writers land in later phases.

```json
// account-health.json
{
  "reddit": {
    "subs": {
      "macapps":     { "karma": 47, "karma_threshold": 50, "status": "warm" },
      "LocalLLaMA":  { "karma":  4, "karma_threshold": 50, "status": "cold" }
    },
    "site_throttle": "ok"
  },
  "hn":  { "status": "warm", "last_submit_at": "..." },
  "x":   { "status": "ok" }
}

// launches.json
[
  {
    "name": "Sys Doctor",
    "artifact_url": "https://linggen.dev/apps/sys-doctor",
    "launch_date": "2026-04-28",
    "days_since": 8,
    "followup_due": "week-2",
    "stage": "launching"
  }
]

// audience.json (derived; later)
{ "tags": ["mac power user", "rust dev"], "active_responders": [...] }
```

State is read by:
- Pulse renderer (status strip)
- `monitor-mentions` (watchlist + posted-thread polling)
- `track-progress` (where in launch sequence)
- `draft-content` (audience-aware tone calibration over time)

## Auto-derived mentions watchlist

On each run, the agent extracts from `brief.md`:
- **Product names** — the user's own products (e.g., "Sys Doctor",
  "Linggen", "ling-mem")
- **Competitors named** — anything called out in a comparison or rule
  ("Hazel", "DevonThink", "CleanMyMac")
- **User identifiers** — GitHub login, X/Twitter handle, real name *only
  if explicitly stated*

Result is cached in `state/watchlist-cache.json`; re-extracted when
brief.md mtime changes.

Override path: user adds an explicit `## Watchlist` section to
`brief.md`. Pulse merges (override > extracted).

## Page state and JSON schema

Two JSON shapes: the **session file** that lives on disk, and the
**body_patch** the agent emits on each run. The page renders the
session file; the agent updates it via patches.

### Session file

```
data/YYYY-MM-DD/<session-id>.json
```

Today's session = today's file. New goal runs through the day
**accumulate** patches into this file (sys-doctor body_patch model).
Yesterday's session is its own file.

```json
{
  "session_id": "2026-05-06-08-00",
  "started_at": "2026-05-06T08:00:00Z",
  "last_run_at": "2026-05-06T11:14:23Z",

  "status_strip": [
    { "label": "r/macapps", "value": "47/50", "tone": "ok" },
    { "label": "HN", "value": "warm", "tone": "ok" },
    { "label": "8d since Sys Doctor launch", "tone": "neutral" },
    { "label": "week-2 follow-up due", "tone": "due" }
  ],

  "sections": {
    "mentions":       { "cards": [...], "last_updated": "..." },
    "replies_due":    { "cards": [...], "last_updated": "..." },
    "discovery":      { "cards": [...], "last_updated": "..." },
    "signal":         { "cards": [...], "last_updated": "..." },
    "progress_drafts":{ "cards": [...], "last_updated": "..." }
  },

  "runs": [
    {
      "run_id": "...",
      "trigger": "saved-run|manual|chip|chat",
      "goal": "Daily X-post if I shipped or learned",
      "started_at": "...",
      "completed_at": "...",
      "capabilities_invoked": ["track-progress", "draft-content"],
      "summary": ["Shipped pulse settings page", "Drafted X-post"],
      "skipped": false,
      "skip_reason": null
    }
  ]
}
```

The renderer iterates `sections` in fixed priority order:
mentions → replies_due → discovery → signal → progress_drafts.
Empty section means *not touched yet*; renderer hides it. A "found
nothing" outcome is represented by an empty-state card *inside* the
section, not by an absent section.

### body_patch (what the agent emits)

After each capability runs, the agent emits one JSON block:

```json
{
  "body_patch": {
    "section": "discovery",
    "last_updated": "2026-05-06T11:14:23Z",
    "cards": [...]
  }
}
```

If a run touches multiple sections (e.g. `monitor-mentions` populates
both `mentions` and `replies_due`), the agent emits multiple
`body_patch` blocks. The session file applies them in order.

The agent may also emit a `status_strip_patch` to update the strip,
and a `run_log` block to append to the session's `runs[]` array.

### Card type schemas

All cards share the scaffold: `{ type, id, actions[] }`. Type-specific
fields below.

**`mention`** — somebody named your watchlist
```json
{ "type": "mention", "id": "...",
  "watched_term": "Sys Doctor",
  "actor": "@cedricchase",
  "source": "reddit", "sub": "macapps",
  "thread_url": "...", "thread_title": "...",
  "quote": "...", "age_hours": 2,
  "actions": ["draft-reply", "open", "dismiss"] }
```

**`reply`** — unanswered comments on your own posts (replies due);
optional `follow_up` carries new reactions to a reply you already made
```json
{ "type": "reply", "id": "...",
  "your_post_url": "...", "your_post_title": "...",
  "platform": "hn|reddit|x|...",
  "posted_at": "...", "unanswered_count": 3,
  "score": 47, "ratio": 0.92,
  "actions": ["draft-replies", "open", "dismiss"],
  "follow_up": {
    "comment_url": "...", "quote": "...", "age_hours": 1,
    "actions": ["reply-back", "view", "dismiss"]
  }
}
```

**`discovery`** — cold thread worth commenting on
```json
{ "type": "discovery", "id": "...",
  "source": "reddit|hn|lobsters",
  "sub": "LocalLLaMA", "thread_url": "...", "thread_title": "...",
  "comments": 12, "age_hours": 4,
  "match_reason": "matches: skills format, agent runtime",
  "score": 0.85,
  "draft_starter": "...",
  "actions": ["draft-starter", "open", "dismiss"] }
```

**`signal`** — market intelligence (was "pulse")
```json
{ "type": "signal", "id": "...",
  "source": "github-trending|google-trends|hn|wikipedia|product-hunt",
  "title": "GitHub trending (Rust)",
  "items": ["2 new agent-runtime repos today", "..."],
  "actions": ["expand"] }
```

**`progress`** — what shipped + what learned
```json
{ "type": "progress", "id": "...",
  "window": "24h|7d|30d",
  "items": [
    { "kind": "shipped", "text": "pulse settings page + 5 site adapters" },
    { "kind": "learned", "text": "config persistence via /api/bash" },
    { "kind": "fixed",   "text": "..." }
  ],
  "actions": [] }
```

**`draft`** — generated content to review and post
```json
{ "type": "draft", "id": "...",
  "lane": "x-post|reddit-comment|blog|medium|linkedin|substack",
  "content": "...",
  "char_count": 178, "char_limit": 280,
  "title_candidates": ["..."],
  "subtitle": "...",
  "sub": "macapps",
  "thread_url": "...",
  "citations": [...],
  "source_progress_id": "...",
  "posted": false,
  "posted_url": null,
  "posted_at": null,
  "actions": ["polish", "copy", "discard", "mark-posted"] }
```

### Empty-state cards

Inside a section that ran-and-found-nothing, the agent emits a single
empty-state card:

```json
{ "type": "empty", "section_hint": "discovery",
  "message": "No new threads matching your brief today." }
```

The renderer treats `empty` as a regular card type, just visually
muted. Distinguishes "ran, nothing to show" from "didn't run."

## Partial runs and PageUpdate body_patch

A run does NOT always touch every section. A goal like *"find threads"*
invokes only `discover-customers`; a *"check mentions"* run touches only
`mentions[]` and `replies_due[]`. The Pulse page must handle this
without losing prior content.

The contract — same as Sys Doctor's dashboard:

- **Each capability emits a PageUpdate `body_patch`** scoped to the
  sections it produced. Missing sections in a patch mean *not touched —
  leave existing render in place*.
- **The session's data file accumulates patches** throughout the day.
  Today's session starts empty; each goal run adds/updates its
  affected sections; the file's final shape is the union.
- **A new session starts empty.** Yesterday's mentions don't carry
  into today; each day is its own page state. Cross-session
  persistence lives in the state layer (account health, launches,
  posted, watchlist-cache), not in per-session data.
- **The renderer applies patches incrementally** — like sys-doctor
  swapping the Security scorecard when `ScanSecurity` finishes,
  Pulse swaps the Mentions section when `monitor-mentions` finishes,
  even if Discovery wasn't re-run.

Concrete: clicking the `🔍 Find threads` chip dispatches a goal that
runs only `discover-customers`. The agent emits:

```json
{
  "body_patch": [
    { "match": { "section": "discovery" },
      "items": [...] }
  ]
}
```

Discovery cards refresh; everything else (mentions from this morning's
run, drafts pending review) stays in place.

This eliminates the "empty section means not-scanned vs found-nothing"
ambiguity. *"Found nothing"* gets its own empty-state card inside the
section (*"No new threads matching your brief today"*). *"Not
scanned"* leaves the section as-is.

## Goal → capability dispatch (examples)

| Goal text | Capabilities invoked |
|:----------|:---------------------|
| *"Daily X-post if I shipped or learned"* | track-progress + draft-content (lane: x-post) |
| *"Launch Sys Doctor on r/macapps and HN"* | research-market + discover-customers + draft-content |
| *"Find threads worth commenting on"* | discover-customers (no draft) |
| *"Anyone talking about me/my product"* | monitor-mentions |
| *"Reply to comments on my posts"* | monitor-mentions (replies_due only) |
| *"What's happening in local AI agent space"* | research-market |
| *"Where am I vs CleanMyMac, Hazel, OnyX"* | research-market focused on competitors |
| *"Weekly recap"* | track-progress @ 7d window + draft-content (lane: blog or substack) |

The agent reads the goal text and picks. The mapping is in the
SKILL.md "Goal dispatch" section (loose; the agent has discretion).

## What stays in product-spec.md

- Vision (one paragraph)
- The five capabilities table (high-level)
- Core entity (Project)
- Operator surfaces (high-level: the Pulse page, Library, New run, Settings)
- Distribution
- Sequencing

## What lives only in design.md

- This document. Capability protocols, tool catalog, state layer,
  Pulse page layout, dispatch rules, JSON schema. Implementation-adjacent
  but not code.
