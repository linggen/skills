---
name: dream
description: >-
  Nightly memory consolidation. Collects Claude Code + Linggen sessions from
  the last 24h, extracts durable facts, dedupes against existing memory, and
  routes candidates into core markdown (identity.md, style.md) or the RAG
  store via Memory_*.

# Schedule — nightly at 23:00 local time.
schedule: "0 23 * * *"
enabled: true
cwd: ~/.linggen
policy: strict
entry: scripts/collect.sh

# Skill delegation — dream uses Memory_* tools directly; no Skill tool needed.
allow-skills: []

# Capability dependency — dream needs the memory skill installed so Memory_*
# tools resolve. Engine validates at load; mission is disabled if missing.
requires: [memory]

# Explicit tool allowlist. No AskUser / EnterPlanMode — headless.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - Memory_add
  - Memory_get
  - Memory_search
  - Memory_list
  - Memory_update
  - Memory_delete

# Admin on the three dirs the skill genuinely reads/writes. Cwd is ~/.linggen
# so every grant below composes by longest-path match.
permission:
  mode: admin
  paths:
    - ~/.linggen/memory
    - ~/.claude/projects
    - ~/.linggen/sessions
  warning: >-
    Reads session files from ~/.claude/projects and ~/.linggen/sessions,
    edits ~/.linggen/memory/{identity,style}.md, and writes RAG rows via the
    ling-mem daemon.
---

You are **Ling**, running the silent nightly memory consolidation. No UI — your
final message IS the run report.

## Step 1 — Read the entry-stage manifest

The entry script (`scripts/collect.sh`) already scanned the last 24h of
Claude Code + Linggen sessions and wrote the manifest to
`$MISSION_OUTPUT_DIR/manifest.ndjson` — one JSON object per line:

```
{"filepath":"...","source":"CC"|"Linggen","label":"...","date":"YYYY-MM-DD",
 "bytes":N,"user_turns":N}
```

`Read` the manifest and filter: skip any line where `user_turns < 2` AND
`bytes < 2000` — greeting-only and error-loop sessions have nothing extractable.
If the manifest is empty or every line is skipped, stop here and report
`sessions_scanned: 0`.

## Step 2 — Pre-load existing RAG for dedup

Before spawning subagents, pull the current fact list so each subagent can
self-reject duplicates:

- `Memory_list({type: "fact", limit: 200})`
- `Memory_list({type: "preference", limit: 200})`

Compact to one line per row: `- <content>`. Paste into every subagent's prompt
as the `EXISTING FACTS` block. Skip this block if both lists are empty.

## Step 3 — Extract in parallel via Task subagents

Emit ALL `Task` calls in a single response — one response, many `Task` tool
uses. Each subagent **reads and extracts** only; the main agent (you) writes.

Use the extraction prompt in the `memory` skill's SKILL.md (Extraction — Phase
2). The subagent:

- runs `bash ~/.linggen/skills/memory/scripts/extract_session.sh <filepath> <source> <date>`
- applies the durability test, taxonomy, source-quote, meta-feedback, and
  confidence gates
- returns ONLY a fenced JSON block with `candidates`, `suggest_claude_md`, `notes`

TOOL SCOPE for subagents: Bash + Read only. No Memory_*, Write, Edit, Task,
WebFetch, WebSearch — those belong to the main agent.

## Step 4 — Merge and write (you only)

After every subagent returns:

- `Read` `~/.linggen/memory/identity.md` and `~/.linggen/memory/style.md` once
  so you can dedup markdown writes by eye.
- For each candidate, route by `target`:
  - `identity` / `style` — `Edit` the markdown file (skip, update, or append a
    bullet).
  - `lancedb` — `Memory_search` by `retrieval_phrase`; then skip / `Memory_update`
    / `Memory_delete + Memory_add` / `Memory_add` based on the top hit.
- Drop `quote` and `retrieval_phrase` before storing — ephemeral.

See `memory/SKILL.md` → Extraction Phase 3 for the full decision table.

## Step 5 — Write scan state + run report

Write `~/.linggen/memory/.scan-state.json` with:

```json
{
  "last_scan_at": "<ISO-8601>",
  "duration_ms": <int>,
  "sessions_scanned": <int>,
  "sessions_skipped": <int>,
  "rag_added": <int>,
  "rag_updated": <int>,
  "rag_merged": <int>,
  "rag_skipped": <int>,
  "identity_added": <int>,
  "style_added": <int>,
  "suggest_claude_md": <int>,
  "expired_deleted": 0
}
```

Your final agent message is the run report — terse summary of counts above,
plus any notable findings or blockers. This is the run log users will see.
