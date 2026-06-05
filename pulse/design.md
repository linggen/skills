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
┌──────────────────────────────────────────────────────────────────────┐
│  User                                                                │
│    configures (case + workspace + sites + accounts)                  │
│    reviews Pulse, polishes drafts, sends                             │
└──────────┬─────────────────────────────────┬──────────────────────┘
           ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Pulse skill (the agent)                                             │
│    receives brief via hidden init  +  reads workspace  +  goal text  │
│    + state layer  · dispatches capabilities  ──▶  emits body_patches │
└──────────┬──────────────────────┬──────────────────┬────────────────┘
           ▼                      ▼                  ▼
┌──────────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ Site tools           │  │ Workspace        │  │ Local collectors    │
│ (registered, read)   │  │ (Read/Glob/Grep) │  │ (iframe-side bash)  │
│                      │  │                  │  │                     │
│ Reddit, HN, Lobsters │  │ ~/path/to/repo:  │  │ sessions, commits,  │
│ arxiv, RSS,          │  │ README, /doc/,   │  │ memory rows         │
│ GitHub Trending,     │  │ recent commits,  │  │                     │
│ Product Hunt RSS     │  │ source           │  │                     │
└──────────────────────┘  └──────────────────┘  └─────────────────────┘
```

The skill is a small dispatcher. The intelligence lives in the brief
+ workspace + goal + capability protocols. Tools are dumb data sources;
collectors are dumb shell scripts; workspace ingestion is just-in-time
filesystem reads against the user's product directory.

## Architectural scope (v1): mono-skill

Every platform integration (Reddit OAuth, HN cookies, X API, draft-reply,
post tracking) lives **inside pulse** in v1. No platform-skill extraction
yet — no `redditBot`, no `xbot`-as-capability-provider, no `hnBot`. The
clean cut line is preserved (each `scripts/sites/*.sh` adapter is small
and replaceable), so **extraction to platform skills is a v2 refactor
when a second consumer earns the abstraction**. Today there's exactly
one consumer (pulse itself), and skill-to-skill capability dispatch is
overhead the user count doesn't justify.

This applies even when auth comes in: Reddit OAuth tokens, X cookies,
and the post-tracking state all live under `~/.linggen/skills/pulse/`,
not in a separate skill's data dir. If/when "support-watcher" or
"launch-monitor" or another vertical wants Reddit access, *that's* when
we extract.

## Capabilities (engine-internal)

Five capabilities. Dispatched by the agent based on the goal text.
Capabilities do NOT appear in the UI; users never pick one.

### `research-market`
- Anchor on GitHub Trending (always called), supplemented by HN top
  and X (when enabled). Lobsters / arxiv / RSS / Product Hunt remain
  available supplements.
- Score each hit 0–1 for technical relevance to the brief's topics.
- Output → `trend` section cards + entries in `external_sources[]`.

### `discover-customers`
- Pull from: configured Reddit subs (`/new` RSS), HN, Lobsters, Bluesky keywords, and X target accounts (when enabled).
- Filter for posts asking questions / describing pain that brief-extracted
  expertise can answer.
- Output → `customer_pain_points[]` + `comment_candidates[]` (with
  draft starter, target sub, thread URL).

### `monitor-mentions`
- Watchlist auto-derived from the brief text (delivered via hidden
  chat init from `config.brief`): own product names, named
  competitors, user's GitHub login / handles. User can override by
  adding an explicit `## Watchlist` section to the brief.
- Pull from: same sources as `discover-customers` plus any past Pulse
  threads the user has posted to (for reply triage).
- Two outputs:
  - `mentions[]` — *"@user mentioned Sys Doctor in r/macapps thread X"*
  - `replies_due[]` — unanswered comments on the user's recent posts,
    each with a draft reply.

### `track-progress`
- Pull from: sessions (Claude Code + Linggen), git commits in
  `~/workspace/*` repos, ling-mem rows, the **workspace** configured in
  settings (reads README, /doc/*, recent commits, package metadata).
- Window: 24h by default; configurable via goal text or scope hint.
- Cross-references the **launch timeline** in the state layer to know
  where the user is in the launch sequence (week-1 vs week-3 etc.).
- Output → `progress_digest[]`.

### Workspace ingestion (cross-cutting)

Every capability that produces drafts (`draft-content`) or scores
relevance (`research-market`, `discover-customers`) reads from the
configured workspace **just-in-time** via Linggen's standard
`Read` / `Glob` / `Grep` tools. Implementation:

- Settings stores `workspace_path` (e.g., `/Users/foo/workspace/myproduct`).
- The pulse agent has a permission grant on that path (mode: read).
- The agent decides what to read based on the goal — typically:
  - `README.md` and `doc/` for product description
  - `git log --oneline -20` for recent shipping
  - `Cargo.toml` / `package.json` / `pyproject.toml` for stack/version
  - `Grep` for specific feature names from the brief
- No pre-ingestion, no vector cache, no file watcher. Cost: a few
  hundred tokens per run for the basics. Cheap and always fresh.

Why this matters: **drafts grounded in the actual product knowledge**
read like the founder wrote them. Generic LLMs guess; pulse cites.
This is the core differentiator versus Buffer / Hootsuite / generic AI
writers and it costs almost nothing to implement.

### `draft-content`
- Synthesizes input from the other capabilities into platform-shaped
  drafts. Lane catalog in `references/lane-templates.md` (x-post,
  reddit-comment, blog, medium, linkedin, substack, plus future:
  dm, email).
- Multi-pass drafting: structural → voice rewrite (matching the
  brief's cadence) → tic-check (deletes "thrilled", "game-changer",
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
| `FetchReddit` | `/r/<sub>/new.rss` per configured sub (`.json` API closed Nov 2025) | discover-customers, monitor-mentions |
| `FetchLobsters` | `/newest.json` | research-market, discover-customers |
| `FetchArxiv` | OAI/Atom for CS.AI/LG/CL | research-market |
| `FetchRSS` | configured RSS/Atom feeds | research-market, discover-customers |
| `FetchGitHubTrending` | scrape `github.com/trending/<lang>?since=daily` | research-market (always-on Trend anchor) |
| `FetchProductHuntRSS` | `producthunt.com/feed` | research-market, discover-customers |

### Planned

| Tool | Source | Capability uses |
|:-----|:-------|:----------------|
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
│ Trend + Progress + Drafts                 [daily summary]      │
│ ─ trending repos / threads cards                                │
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
  watchlist-cache.json    # last-extracted watchlist (for diff against the brief text)
  posted.json             # threads the user posted to (for follow-up reply tracking)
```

State is updated by capabilities (e.g., `monitor-mentions` writes
`watchlist-cache.json` and `posted.json`) AND by the page (the `Mark
posted` card action writes a new entry to `posted.json` directly).

### `watchlist-cache.json`

```json
{
  "extracted_from": "config.brief",
  "brief_hash": "sha1:9fa3e1c2…",
  "extracted_at": "2026-05-06T08:00:00Z",
  "products": ["Sys Doctor", "Linggen", "ling-mem"],
  "competitors": ["CleanMyMac", "Hazel", "DevonThink", "DaisyDisk"],
  "self": ["@Linggen77", "linggen on GitHub"]
}
```

Re-extracted by `monitor-mentions` when the SHA-1 of the brief text
in the current init message differs from `brief_hash`. If the brief
has an explicit `## Watchlist` section, that's parsed verbatim
(override path); otherwise the agent extracts via LLM.

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

On each run, the agent extracts from the brief text already in its
conversation history (delivered via hidden chat init from
`config.brief`):
- **Product names** — the user's own products (e.g., "Sys Doctor",
  "Linggen", "ling-mem")
- **Competitors named** — anything called out in a comparison or rule
  ("Hazel", "DevonThink", "CleanMyMac")
- **User identifiers** — GitHub login, X/Twitter handle, real name *only
  if explicitly stated*

Result is cached in `state/watchlist-cache.json`; re-extracted when
the brief hash changes.

Override path: user adds an explicit `## Watchlist` section to the
brief text. Pulse merges (override > extracted).

## Page state and JSON schema

Two JSON shapes: the **session file** that lives on disk, and the
**body_patch** the agent emits on each run. The page renders the
session file; the agent updates it via patches.

### Session file

```
data/YYYY-MM-DD/session.json
```

**One session per day.** Today's session = today's file. New goal runs
through the day **accumulate** patches into this single file
(sys-doctor body_patch model — the dashboard updates in place; no
multi-session-per-day fan-out). Yesterday's session is its own file in
yesterday's date dir; it stays as an archive but is not the active view.

The earlier multi-session-per-day model (multiple `<session-id>.json`
files per date dir) is gone — one user, one daily pulse, one file.

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
    "trend":          { "cards": [...], "last_updated": "..." },
    "progress_drafts":{ "cards": [...], "last_updated": "..." }
  },

  "runs": [
    {
      "run_id": "...",
      "trigger": "chat|mission",
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

`runs[]` is an append-only event log inside the day's session file —
each agent invocation appends one entry. Dashboard sections are still
updated in place via body_patches (current-state model); `runs[]`
captures provenance for "why is this card here?" auditing.

The renderer iterates `sections` in fixed priority order:
mentions → replies_due → discovery → trend → progress_drafts.
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

**`trend`** — what's trending in the user's space (was "signal")
```json
{ "type": "trend", "id": "...",
  "source": "github-trending|hn|x|product-hunt",
  "title": "GitHub trending (Rust)",
  "url": "https://github.com/trending/rust?since=daily",
  "items": ["2 new agent-runtime repos today", "..."],
  "actions": ["open"] }
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

Concrete: a chat goal like *"find threads worth commenting on"* runs
only `discover-customers`. The agent emits:

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
