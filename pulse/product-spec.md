---
type: spec
reader: Coding agent and users
guide: |
  Product specification — what Pulse should do and why.
  Brief; guides design and implementation; not a code reference.
---

# Product Spec: Pulse

## Vision

**Pulse is a daily intelligence layer for solo founders launching products.** It keeps you aware of your market, surfaces the people who'd care, tracks what you shipped, and produces the writing you don't have time for.

Built as a Linggen skill — installs into Claude Code / OpenClaw / Linggen — but designed to feel like a daily-driver product, not a CLI tool.

## What it does

Four agent-side capabilities, dispatched by a single free-text **goal**:

| Capability | Purpose |
|:-----------|:--------|
| `research-market` | Scan industry signal + competitors → market landscape, feasibility report |
| `discover-customers` | Scan target communities → ranked pain points + comment candidates |
| `track-progress` | Scan sessions / commits / memory → what shipped, what was learned |
| `draft-content` | Synthesize the above into platform-shaped drafts (X, Reddit, blog, …) |

The user types a goal — *"Help me launch Sys Doctor on r/macapps"* / *"Daily X-post if I shipped"* / *"What's happening in local AI agent space"* — and the agent picks which capabilities to invoke. No fixed recipes; no enum.

## Core entity

**Project.** A user has one or more projects. Each owns:
- Identity — name, path, description, audience, stage
- Live **Pulse** — market state, refreshed daily
- Live **Discovery feed** — pain points + comment candidates
- **Progress log** — auto-built from sessions / commits / memory
- **Library** — every run output, every draft, every research artifact

## Operator surfaces (UI)

| Surface | Purpose |
|:--------|:--------|
| **Inbox** | Today's actionable cards across Pulse, Discovery, Progress + Drafts. Lands here on open. |
| **Library** | Browse past runs by project + date. The history archive. |
| **New run** | Free-text goal + scope hints (project path, artifact URL, window) + targets. Manual trigger. |
| **Settings** | Projects, brief, voice samples, sources, targets, schedules. |

Inbox is the loop. Library is the archive. Settings is plumbing. Three surfaces, no more.

## Data model

```
~/.linggen/skills/pulse/
  config.json                        # sites + targets enabled, per-project (future)
  references/
    brief.md                         # standing identity, voice rules, hard constraints
    voice-samples.md                 # past writing for cadence anchoring
    lane-templates.md                # per-target format constraints
    source-blogs.md                  # legacy curated RSS list
    brief.example.md                 # ships defaults; copied to brief.md on first install
  data/
    YYYY-MM-DD/<run-id>.json         # one file per run; populated sections only
  scripts/
    pulse.html                       # Inbox + history review UI
    settings.html                    # Settings UI
    pulse-app.js                     # Inbox app logic
    settings.js                      # Settings app logic
    collect.sh                       # local-signal collector (sessions, commits, memory)
    sites/                           # site adapters — registered as skill tools
      hackernews.sh
      reddit.sh
      lobsters.sh
      arxiv.sh
      rss.sh
    # (saved-run entry script — future, generated per saved run from settings)
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

`references/brief.md` is the user's standing context. The agent reads it on every run **before** the goal text. It declares:
- What the user is working on (product, audience, stage)
- Goal of these posts (cold-start awareness / credibility / launch / etc.)
- Voice rules (cadence, openings to avoid, closing pattern)
- Hard rules (self-reference cap, prohibited domains, drop-vs-publish floor)
- Active context (what shipped recently, what's hot, what to avoid)

The brief is the difference between "generic LLM output" and "writing that sounds like the user." It's editable in Settings and never overwritten on upgrade.

## Goals model (no recipes)

A run carries a single free-text goal. The agent reads `brief.md` + the goal + the data on disk and decides:
- which collectors to invoke (sessions / commits / project / artifact)
- which site tools to call
- which configured lanes to draft for
- whether to skip if the goal doesn't earn output

Saved runs (settings page) are *named goal templates* with optional cadence — the daily trigger is just a saved run scheduled at 08:00. There is no separate "daily mission" concept; missions are generated from saved runs that have a cron set.

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
| 2. Free-text goal field on the run | next | replaces hardcoded "scan 24h, draft" with `goal` parameter |
| 3. Project entity + project-aware scopes | next | `project.sh` collector reads README/docs/structure |
| 4. Inbox UI (cards across feeds) | next | replaces the current single-day review page |
| 5. Saved runs + per-run scheduling | next | unifies missions and ad-hoc into one model |
| 6. Multi-project model | future | per-project briefs, per-project sources |
| 7. Linggen-app premium tier | future | managed sources, scheduled runs, history retention |

## Related docs

- `SKILL.md` — protocol and tool registration (Linggen skill format)
- `references/brief.md` — user's standing context (editable)
- `references/lane-templates.md` — per-target format constraints
- `config.json` — per-user enabled sites and targets
- `linggen/doc/skill-spec.md` — host runtime contract for skills
