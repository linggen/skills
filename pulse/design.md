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
│    types goal      reviews Inbox      polishes drafts           │
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

## Operator surface: the Inbox

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
│ Pulse + Progress + Drafts                 [daily summary]      │
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
```

State is updated by capabilities (e.g., `monitor-mentions` updates
`account-health.json` after each Reddit fetch; `track-progress`
updates `launches.json` when it sees a launch event in commits).

State is read by:
- Inbox renderer (status strip)
- `monitor-mentions` (which posts to triage replies on)
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

## Run output JSON schema

One file per run, all sections optional:

```json
{
  "run_id": "...",
  "goal": "...",
  "weight": "small|medium|large|skip",
  "summary": [...],

  "market_landscape": [...],          // research-market
  "customer_pain_points": [...],      // discover-customers
  "mentions": [...],                  // monitor-mentions
  "replies_due": [...],               // monitor-mentions
  "progress_digest": [...],           // track-progress
  "external_sources": [...],          // any capability that scored hits
  "comment_candidates": [...],        // discover-customers + monitor-mentions
  "drafts": [...],                    // draft-content

  "skipped": false,
  "skip_reason": null
}
```

Inbox renderer iterates through populated sections in priority order
(mentions, replies, discovery, pulse, progress, drafts).

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
- Operator surfaces (high-level: Inbox, Library, New run, Settings)
- Distribution
- Sequencing

## What lives only in design.md

- This document. Capability protocols, tool catalog, state layer,
  Inbox layout, dispatch rules, JSON schema. Implementation-adjacent
  but not code.
