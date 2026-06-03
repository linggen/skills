---
type: spec
reader: Coding agent and users
guide: |
  Product specification — what Pulse should do and why.
  Brief; guides design and implementation; not a code reference.
---

# Product Spec: Pulse

## Vision

**Pulse is the go-to-market (GTM) brain for solo founders launching products.** It reads your workspace to know what you're building, watches the communities your customers live in, drafts the posts and replies you don't have time for, and tracks how those posts land — so you spend your time deciding and shipping, not browsing Reddit and writing from scratch.

The workflow is **AI-led**: configure your case once (what you're building, where it lives on disk, which sites to watch, which accounts), and the agent runs on its own — gathering, scoring, drafting. You review, edit, send.

Built as a Linggen skill — installs into Claude Code / OpenClaw / Linggen — but designed to feel like a daily-driver product, not a CLI tool.

## What it does

Five agent-side capabilities, dispatched by a single free-text **goal**:

| Capability | Purpose |
|:-----------|:--------|
| `research-market` | Scan industry signal + trending data + competitors → market landscape, feasibility report |
| `discover-customers` | Scan target communities → ranked pain points + comment candidates (cold) |
| `monitor-mentions` | Watch product / competitor / self names across sources → mentions + reply triage on your own posts |
| `track-progress` | Scan sessions / commits / memory → what shipped, what was learned, where in the launch sequence |
| `draft-content` | Synthesize the above into platform-shaped drafts (X, Reddit, blog, DM, email, …) |

The user types a goal — *"Help me launch Sys Doctor on r/macapps"* / *"Daily X-post if I shipped"* / *"What's happening in local AI agent space"* — and the agent picks which capabilities to invoke. No fixed recipes; no enum.

## Core entity

**Project.** A user has one or more projects. Each owns:
- Identity — name, path, description, audience, stage
- Live **Signal feed** — market state, refreshed daily
- Live **Discovery feed** — pain points + comment candidates
- **Progress log** — auto-built from sessions / commits / memory
- **Library** — every run output, every draft, every research artifact

## Operator surfaces (UI)

| Surface | Purpose |
|:--------|:--------|
| **Pulse** (the page) | The main app surface. Today's state — Mentions, Replies due, Discovery, Signal, Progress + Drafts — plus the agent chat for follow-ups. Lands here on open. |
| **Library** | Sent drafts + tracked mentions, archived. The history of what shipped, not a log of dashboards. |
| **Settings** | Case description, workspace path, brief, target sites, accounts. Configure once. |

The page is the loop. Library is the archive. Settings is plumbing. Three surfaces, no more.

The page reflects **today's pulse** — one persistent state per day, updated by agent runs in place. Yesterday's view is archived; today's is current. No multiple-runs-per-day session model; no run-history tab.

## Data model

```
~/.linggen/skills/pulse/
  config.json                        # sites + targets + workspace_path + brief (string)
  references/
    lane-templates.md                # per-target format constraints
    source-blogs.md                  # legacy curated RSS list
    brief.example.md                 # ships defaults; seeds config.brief on first install (brief itself is the voice anchor)
  data/
    YYYY-MM-DD/<run-id>.json         # one file per run; populated sections only
    manifest-YYYY-MM-DD.json         # collect.sh output (when track-progress is wired)
  state/
    posted.json                      # threads the user posted to (reply tracking)
    watchlist-cache.json             # last-extracted watchlist; diff against brief hash
  scripts/
    pulse.html                       # main Pulse page + history review UI
    settings.html                    # Settings UI (loaded as in-page modal iframe)
    pulse-app.js                     # Pulse page app logic
    settings.js                      # Settings app logic
    collect.sh                       # local-signal collector (sessions, commits, memory)
    sites/                           # site adapters — registered as skill tools
      hackernews.sh
      reddit.sh
      lobsters.sh
      arxiv.sh
      rss.sh
```

**Output JSON schema** (one file per run, all sections optional):

```json
{
  "run_id": "...", "goal": "...", "weight": "small|medium|large|skip",
  "summary": [...],
  "market_landscape": [...],
  "customer_pain_points": [...],
  "progress_digest": [...],
  "external_sources": [...],
  "comment_candidates": [...],
  "drafts": [...],
  "skipped": false, "skip_reason": null
}
```

The page renders whichever sections are populated. Same renderer for any goal.

## Registered tools (current)

Each is a `tier: read` adapter script, called by the agent in `research-market` / `discover-customers`:

- `FetchHackerNews`
- `FetchReddit` (reads `config.json` for subs)
- `FetchLobsters`
- `FetchArxiv`
- `FetchRSS` (reads `config.json` for feeds)
- `FetchGitHubTrending` (always-on Trend anchor; reads `config.json` for optional language)
- `FetchProductHuntRSS`

New site adapters drop into `scripts/sites/<id>.sh` + add a tools entry in SKILL.md frontmatter. No engine change.

## Output lanes (current)

Lanes live as sections in `references/lane-templates.md`. Each defines length, structure, citation rules, JSON shape:

- `x-post` — single-claim post, ≤ 280 chars
- `medium` — 500–1000 word article
- `blog` — 1500–3000 word long-form
- `reddit-comment` — 50–200 word per-thread comment, no domain links
- `linkedin` — 150–350 words, professional tone
- `substack` — 600–1500 words, narrative-driven

New lanes: append a section to `lane-templates.md` and add a `targets[]` entry to `config.json`.

## Brief (load-bearing)

The **brief** is the user's standing context — what they're building, who they're talking to, and the per-user constraints the agent can't infer. It's stored as a string in `config.json` (field: `brief`) and delivered to the agent at turn 0 via a hidden chat-init message on every Pulse open, so it's already in the conversation history before the user types anything. It declares:
- What the user is working on (product, audience, stage)
- Goal of these posts (cold-start awareness / credibility / launch / etc.)
- Per-user rules (self-reference cap, prohibited domains, etc. — generic "no marketing copy" / "no LLM tics" rules live in SKILL.md)
- Active context (what shipped recently, what's hot, what to avoid)
- Optional `## Watchlist` section that overrides auto-extraction for `monitor-mentions`

The brief is the difference between "generic LLM output" and "writing that sounds like the user." It's editable in Settings and never overwritten on upgrade. `references/brief.example.md` ships defaults that seed `config.brief` on first install.

## Workspace (the differentiator)

In addition to the brief, the user points pulse at a **workspace path** (e.g., `/path/to/linggen-monorepo`). The agent reads the workspace on every run — README, docs, recent commits, source — to know the product as well as the user does. Drafts grounded in workspace context read like the founder wrote them, not an AI guessing about a product:

- *Generic AI:* "Excited to share that we just shipped a new feature!"
- *Pulse w/ workspace:* "We just shipped multi-product telemetry — engine, ling-mem, and Sys Doctor share one analytics endpoint with IP-rate-limiting instead of API keys, because OSS clients can't keep secrets. If you've built dev tools you know how this goes."

Reading is **just-in-time** via Linggen's standard `Read` / `Glob` / `Grep` tools, scoped to the configured workspace dir. No pre-ingestion, no vector cache, no file watcher. The agent pulls what it needs in-loop.

## Goals model (no recipes)

A run carries a single free-text goal. The agent uses the brief already in its conversation history + the workspace + the goal + the data on disk and decides:
- which workspace files to read (README, docs, recent commits)
- which collectors to invoke (sessions / commits / project / artifact)
- which site tools to call
- which configured lanes to draft for
- whether to skip if the goal doesn't earn output

**Trigger sources** (the agent doesn't care which — it just sees the goal text):
- Chat — user types a goal in the agent panel
- Mission — Linggen-engine cron fires with a stored goal (set up by the user in Linggen's mission UI; pulse never writes mission files itself)

Pulse does not maintain a saved-runs library or chip-driven goal launcher. AI-led means the agent decides what to do from the brief and workspace; the user steers via natural-language follow-ups in chat.

## Goal examples

| Goal text the user might type | Capabilities the agent invokes |
|:------------------------------|:-------------------------------|
| "Daily short post if I shipped or learned something yesterday" | track-progress + draft-content (x-post only) |
| "Launch Sys Doctor on r/macapps and HN" | research-market + discover-customers + draft-content |
| "Broadcast my blog post at <URL>" | draft-content from artifact + comment-candidates |
| "Find threads worth commenting on this week" | discover-customers (no own posts) |
| "Weekly recap of progress" | track-progress @ 7-day window + draft-content (blog or substack) |
| "What's happening in local AI agent space" | research-market only |
| "Where am I vs CleanMyMac, Hazel, OnyX" | research-market focused on competitors |

Same skill, same protocol, same data shape. Only the goal text changes.

## What Pulse never does

- Auto-post to any external service. Drafts and comments stay on disk; user posts manually.
- Vote, follow, DM, or take any social-graph action through APIs.
- Send analytics or telemetry off the user's machine.
- Treat the user's product as the subject of every draft. Briefs ship with hard rules favoring substance over self-promotion; drafts that violate are dropped.

## Distribution

- **Open source** (Apache 2.0) — installable as a standard `SKILL.md` skill on Claude Code, OpenClaw, Linggen. `bash install.sh` from the public skills repo.
- **Linggen-app surface** (future) — multi-project UI, scheduled saved runs, history charts, premium model access without bring-your-own-key.

## Sequencing

| Phase | Status | Scope |
|:------|:-------|:------|
| 1. Site tools registered, settings page, brief | **done** | sources/targets/brief configured by user |
| 2. Free-text goal field on the run | **done** | replaces hardcoded "scan 24h, draft" with `goal` parameter |
| 3. Workspace ingestion + case description in settings | **next** | drafts grounded in actual product knowledge — the differentiator |
| 4. AI-led single-state Pulse page | next | one dashboard, no multi-session, no chip launcher; chat is the only manual trigger |
| 5. Account auth (Reddit OAuth first) + reply tracking | next | track engagement on user's own posts; draft replies grounded in product knowledge |
| 6. Multi-project model | future | per-project briefs, per-project workspaces, per-project sources |
| 7. Platform-skill extraction (redditBot, xbot, hnBot) | future, not v1 | only when a second consumer earns the abstraction; pulse remains mono-skill until then |
| 8. Linggen-app pulse-branded distribution | future | `pulse.app` bundles engine + skills for the focused founder-GTM audience |

## Related docs

- [`design.md`](design.md) — capability protocols, tool catalog, state layer, Pulse page layout, dispatch rules, run JSON schema
- `SKILL.md` — protocol and tool registration (Linggen skill format)
- `config.json` — user's standing context (editable in Settings; `brief` field)
- `references/lane-templates.md` — per-target format constraints
- `config.json` — per-user enabled sites and targets
- `linggen/doc/skill-spec.md` — host runtime contract for skills
