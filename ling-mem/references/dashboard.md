# Dashboard mode — Linggen `/ling-mem` app flow

Read this file when the user invokes `/ling-mem` (the dashboard app
mounts) or clicks any dashboard action. **Linggen-only** — Claude Code
has no `PageUpdate` capability and never enters this flow.

The dashboard is **agent-narrated**: top-to-bottom it reads like a
letter from you — a one-paragraph greeting with inline actions, then
*"Who you are"* (core), then *"What I know"* (RAG), with change feedback
during scans. No top-bar count rail; counts live inline in the greeting.
**Do not emit anything to `top_bar`.**

## The four states

| State | When | What you do |
|:---|:---|:---|
| 1 — Open | First turn after the app mounts | Greet + parallel state-gather + render overview, **all in one turn** |
| 2 — Waiting | After State 1, before any click | Do nothing. Let the user read and click. |
| 3 — Scanning | User clicks Scan / Clean | Render checklist, run extraction protocol, update checklist per phase |
| 4 — Report | Scan finished | Render compact scorecard + delta lists. Don't re-render the full overview. |

## State 1 — Open (single turn, three parts)

On your first turn (the kickoff message `memory-app.js` sends when the
app mounts), do A + B + C as **ONE SINGLE TURN**. Don't end your turn
between them; don't wait for user input. After streaming A's text, you
**must** continue immediately to B's tool calls in the same response.

### (A) Verbatim greeting (stream first, before any tool call)

No paraphrasing. The exact words including "memory skill" (not "memory
agent"):

> *"Hi! I'm Ling, in your memory skill. Let me check what's already in memory — one moment..."*

### (B) Parallel state-gather (same turn, immediately after A)

1. `Read` `~/.linggen/memory/.scan-state.json` — missing file = never scanned; treat gracefully.
2. `Memory_query({verb: "list", type: "<t>", limit: 50})` for each of `fact`, `preference`, `decision`, `tried`, `fixed`, `learned`, `built` (7 parallel calls).
3. `identity.md` / `style.md` are already in your system prompt — count bullet lines there, no `Read` needed.

### (C) Render + close (same turn, after B returns)

1. Emit **one** `PageUpdate` with the overview layout (see *Page layout* below). The greeting widget's `stats` field carries the scan-freshness summary:
   - Never scanned → stats: *"Never scanned — try Scan Today to start"*
   - Scanned < 24h ago → stats: *"Last scan <relative> · <N> facts added"*
   - Scanned > 24h ago → stats: *"Last scan <relative> · ready for a new one"*
2. Stream this closing line VERBATIM:

   > *"You can click Scan Today to extract new facts from recent sessions, or Browse all to view everything."*

**Why single-turn matters:** if you end your turn after the greeting,
the user sees the greeting then silence — the dashboard stays on the JS
placeholder. Tool calls + PageUpdate must land in the SAME turn so the
dashboard populates without a user message in between.

Never pose a yes/no question in chat. The widget buttons ARE the
question. Do not repeat the greeting line after the PageUpdate — the
visible greeting card already carries the stats + actions.

## State 3 — Scanning

Triggered by these button-click messages (the dashboard's action-cards
send them verbatim — don't over-interpret):

| Message | Action |
|:---|:---|
| `Scan today` | Extract today's sessions (calendar day, midnight→now) |
| `Scan this week` | Extract the last 7 days |
| `Scan this month` | Extract the last 30 days |
| `Scan all` | Extract every session (long) |
| `Analyze and clean` | Consolidation pass — no new extract |
| `Help` | Short text reply, no `PageUpdate` |

**For "view all facts / edit / delete everything"**: don't build this
in-app. The daemon already ships a data browser at
`http://127.0.0.1:9888` with full filter / search / edit / delete.
Include a **link button** in the greeting's `actions` array pointing
there — the widget renderer opens `href` in a new tab. Users get full
CRUD without the skill owning the UI.

**Progress-widget labels must match the button text** so users see
"Scan today → SCAN PLAN · TODAY". Never say "last 24 hours" — the
filter is calendar-day, not sliding-window.

### On any scan message

1. Emit a `PageUpdate` replacing `body` with the **`checklist` widget** — user sees the scan plan immediately.
2. Run **Phase 1 (collect)** — see `references/scan-flow.md`.
3. Run **Phase 1.5 (pre-load)** — see `references/scan-flow.md`.
4. Run **Phase 2 (MANDATORY PARALLEL SUBAGENTS)** — see `references/scan-flow.md` for the Task shape and concurrency rules.
5. Run **Phase 3 (merge + write)** — see `references/scan-flow.md` and `references/routing-rules.md` for the routing decisions.
6. Update `~/.linggen/memory/.scan-state.json` (see *Scan-state file* below).
7. Emit the **Report** layout (small — scorecard + deltas only; overview lists render on the NEXT user interaction).

**On `Analyze and clean`:** follow the *Consolidate (user-initiated only)*
section in `SKILL.md`, then emit the Report layout.

### On row-level UI actions

When the user clicks ✎ or × on a row, the dashboard sends you a plain
chat message. These are direct user actions — **do not dedup-search or
second-guess**; just apply and re-render.

| Incoming message pattern | Action |
|:---|:---|
| `Delete the <type> fact with id="<id>" and re-render the dashboard. The fact says: "<content>"` | Call `Memory_write({verb: "delete", id: "<id>"})`, then re-emit the overview PageUpdate with the fresh counts. |
| `Update the <type> fact id="<id>" to content: "<new>". Re-render the dashboard.` | Call `Memory_write({verb: "update", id: "<id>", content: "<new>"})` (keep existing `contexts` / `tags` unchanged), then re-emit the overview PageUpdate. |

For these UI-triggered actions you do NOT need extraction, dedup
search, or any of Phase 1/1.5/2/3 — just the single tool call plus the
re-render. Keep chat text to one sentence: *"Deleted."* or *"Updated."*

If the id lookup fails or the tool returns an error, say so plainly in
chat — don't hide it.

### On `Help`

Reply with a short chat message (no `PageUpdate`). Cover in 3–5 bullets:

- What you scan (Claude Code + Linggen session files from `~/.claude/projects/` and `~/.linggen/sessions/`).
- How routing works (durability test → core vs RAG; project-internal candidates drop, since memory does not write to project files).
- What each action button does.
- The data browser at `http://127.0.0.1:9888` for row-level editing.
- Where scan history is stored (`~/.linggen/memory/.scan-state.json`).

## State 4 — Report

The body shows the scan's scorecard, updated lists with change badges,
and the action-cards so the user can scan again or ask Help. If the
user clicks a scan card from here → back to State 3. If they leave,
you stay in State 4 until they return.

## Page layout

Always call `PageUpdate`. Never emit page JSON as text, code fence, or
HTML comment. Pass `top_bar`, `body`, `footer` as flat top-level
arguments — no `page` wrapper. Omit a section to keep its previous
value.

```
PageUpdate({ "top_bar": [...], "body": [...], "footer": { "text": "..." } })
```

### `body` by state

#### State 1 & 2 (overview)

**1. `greeting` widget** — you speaking directly to the user, one line + stat line + inline action buttons:

```json
{
  "type": "greeting",
  "icon": "🧠",
  "title": "Here's what I know about you.",
  "stats": "42 RAG facts · 5 core bullets · last scan 3h ago, +8 facts",
  "actions": [
    { "label": "Scan Today",  "icon": "✨", "message": "Scan today",         "kind": "primary" },
    { "label": "Week",                       "message": "Scan this week" },
    { "label": "Month",                      "message": "Scan this month" },
    { "label": "All",                        "message": "Scan all" },
    { "label": "Clean",       "icon": "🧹", "message": "Analyze and clean" },
    { "label": "Browse all",  "icon": "🗂️", "href": "http://127.0.0.1:9888" },
    { "label": "Help",        "icon": "❓", "message": "Help" }
  ]
}
```

**User-name rule (important):** NEVER invent or guess a name. The
example greeting above says *"Here's what I know about you."* with no
name — use this shape as the default. A name may be prepended (*"Hi
&lt;name&gt;. Here's…"*) ONLY when that name appears VERBATIM as an
explicit name bullet in `identity.md` (which the engine inlined into
your system prompt). If `identity.md` has no explicit name line, emit
the greeting with NO name. Do NOT infer a name from file paths under
`/Users/<something>/`, the OS username, environment variables, or any
example in this document.

- An action with `href` opens the URL in a new tab. An action with `message` sends the message as if the user typed it.
- **Button label MUST match its `message` verb.** Calendar-day filtering, not sliding-window:
  - ✅ `"Scan Today"` → `"Scan today"` (calendar day, midnight→now)
  - ✅ `"Week"` → `"Scan this week"`
  - ❌ `"Scan last 24h"` → wrong; the filter is calendar-day
- First action MUST be the primary scan (`kind: "primary"`).
- Remaining actions: Week / Month / All / Clean / Help / Browse. Drop any that don't apply.

**2. `fact-list` for identity** (only if `identity.md` has any bullets):

```json
{
  "type": "fact-list",
  "title": "IDENTITY",
  "meta": "core · identity.md",
  "count": 3,
  "source": "identity.md",
  "actions": ["edit", "delete"],
  "items": [
    { "content": "<user's bullet 1>" },
    { "content": "<user's bullet 2>" }
  ]
}
```

(Use the actual bullets from `identity.md` — don't make up examples.)

**3. `fact-list` for style** (only if `style.md` has any bullets): same shape, `"source": "style.md"`, `"title": "STYLE"`.

**4. One `fact-list` per non-empty RAG type**, in this order: `fact`, `preference`, `decision`, `tried`, `fixed`, `learned`, `built`:

```json
{
  "type": "fact-list",
  "title": "FACT",
  "meta": "RAG · fact",
  "count": 12,
  "source": "rag:fact",
  "actions": ["edit", "delete"],
  "items": [
    {
      "id": "<UUID from Memory_query>",
      "content": "Uses Rust + React + Tailwind v4 + TypeScript",
      "context": "code/linggen",
      "added": "2d ago"
    }
  ]
}
```

Up to 10 rows per widget. If a type has more, append a final item
`{ "content": "… +M more — see data browser" }` with no `id` (so no
✎/× appears). Skip empty types entirely.

#### State 3 (scanning)

Replace body with a single **`checklist` widget** — the full scan plan
with per-item status. Re-emit a `PageUpdate` with the updated checklist
at each phase transition.

**Initial checklist (before any work)** — all `pending` except the first which is `active`:

```json
{
  "type": "checklist",
  "title": "SCAN PLAN · TODAY",
  "items": [
    { "label": "Collect session files",            "status": "active" },
    { "label": "Pre-load existing facts for dedup","status": "pending" },
    { "label": "Dispatch extractors in parallel",  "status": "pending" },
    { "label": "Merge & write candidates",         "status": "pending" },
    { "label": "Write .scan-state.json",           "status": "pending" },
    { "label": "Render report",                    "status": "pending" }
  ],
  "footer": "starting..."
}
```

**Update pattern:** flip just-done item to `done` (with concrete
`detail` like `"7 found · 0.8s"`), set the next to `active`, keep the
rest `pending`. Re-emit the whole checklist in one `PageUpdate`.

**Status values:** `"pending"` (○) · `"active"` (→) · `"done"` (✓) · `"skipped"` (—) · `"failed"` (✗).

**Title must match the button label:** `Scan today` → `"SCAN PLAN · TODAY"`, `Scan this week` → `"SCAN PLAN · THIS WEEK"`. Never say "last 24 hours" — the filter is calendar-day.

**Per-item `detail`** (right-aligned): concrete counts + durations (`"7 found · 0.8s"`, `"3 of 12"`). Skip for `pending`. Keep short.

**`sub` field** (below the row, italic): use only on `active` to narrate what's happening (`"Memory_query parallel · writing + / ~ / −"`). Remove when the item flips to `done`.

**`footer`:** live elapsed + ETA (`"elapsed 47s · ≈ 1m 30s remaining"`) or `"completed in <total>"` when all done.

**Emit timing — flip statuses at:**

| Milestone | Flip |
|:---|:---|
| collection done | `Collect…` → done; `Pre-load…` → active |
| Memory_query done | `Pre-load…` → done; `Dispatch…` → active |
| every batch returns | `Dispatch…` stays `active`, just update `detail` (e.g. `"5 of 7 (batch 1 done)"`). Only flip to `done` once **all** batches have returned. |
| subagents all done | `Dispatch…` → done; `Merge…` → active |
| merge+write finished | `Merge…` → done; `Write .scan-state.json` → active |
| scan-state written | `Write .scan-state.json` → done; `Render report` → active |
| PageUpdate sent | `Render report` → done |

**Multi-batch dispatch rule** (>5 sessions): the `Dispatch…` row stays
`active` across ALL batches — do NOT flip it to `done` after batch 1
only. Use `detail` to narrate progress. Final flip to `done` only when
every Task has returned.

**Zero-candidate path:** if every subagent returned empty candidates,
the merge phase DID run (it decided nothing needed writing) — mark
`Merge & write candidates` as `done` with detail
`"0 candidates — nothing to write"`, then proceed normally. Don't use
`skipped` here: `skipped` means "didn't run"; this ran and produced
zero.

#### State 4 (report)

**Keep the report compact.** DO NOT re-emit the full overview
fact-lists — that's what triggered `stream error: error decoding
response body` failures. A tight scorecard + what-changed is enough;
user can click a scan card or reload to refresh the overview.

Stack in this order:

1. `greeting` — same shape as State 1/2 but updated to reflect new totals and `"just now"` recency. Title: *"Scan complete — <N> new facts."*

2. `checklist` — retrospective of the scan. All items `done`, footer `"completed in <total>"`. Reuse the same item list from State 3 with final details.

3. `scorecard` — compact metric grid:

```json
{ "type": "scorecard", "title": "This scan", "items": [
  { "label": "Sessions",   "status": "gray",   "detail": "5 scanned · 2 skipped" },
  { "label": "Duration",   "status": "gray",   "detail": "47s" },
  { "label": "Identity",   "status": "green",  "detail": "+1" },
  { "label": "Style",      "status": "green",  "detail": "+0" },
  { "label": "RAG",        "status": "green",  "detail": "+8" },
  { "label": "Merged",     "status": "yellow", "detail": "~3" },
  { "label": "Dedup skip", "status": "gray",   "detail": "4" },
  { "label": "Dropped",    "status": "gray",   "detail": "12 (not memory)" }
]}
```

4. `fact-list`(s) titled `"ADDED THIS SCAN"` — emit **one list per source** so each row carries the correct edit/delete contract. Do NOT merge core and RAG into a single list.

   - identity bullets added → list with `"source": "identity.md"`, `"meta": "core · identity.md"`.
   - style bullets added → list with `"source": "style.md"`, `"meta": "core · style.md"`.
   - RAG facts added → list with `"source": "rag:mixed"` (or `"rag:<type>"`), `"meta": "RAG · cross-project"`. Each RAG item MUST include `"id": "<uuid>"` from the add response — without it the row gets no ✎/× buttons.

   **Emit every added row — no cap, no overflow placeholder.** The renderer makes long lists scrollable. Each shown row has `"badge": "+"`. Omit any list whose source had zero adds.

5. `fact-list` titled `"MERGED / UPDATED"` — **cap at 5 rows** with `… +M more` overflow. Items with `badge: "~"`. Omit if empty.

**Do NOT** emit a `PROJECT MEMORY ADDED` list or a `recommendations` widget. Memory does not write to project files; project-internal candidates are dropped during extraction. The "Dropped" scorecard tile carries the count for transparency.

**Do NOT** emit overview fact-lists in the report state. They live in State 1/2 and render when the user reopens the dashboard. The report is a delta, not a full refresh.

**Do NOT** emit the CTA widget in the report state — the user just scanned.

### `footer`

`{ "text": "<relative timestamp or status>" }` — e.g. `"Last updated just now"` or `"Scanning..."`.

## Scan-state file

`~/.linggen/memory/.scan-state.json` is the scan record. Read on State 1, write at the end of every scan. Overwrite wholesale — don't try to patch. Missing file means the user has never scanned.

```json
{
  "last_scan_at": "2026-04-23T09:00:00Z",
  "duration_ms": 45000,
  "sessions_scanned": 5,
  "sessions_skipped": 2,
  "rag_added": 8,
  "rag_updated": 3,
  "rag_extended": 1,
  "rag_skipped": 4,
  "identity_added": 1,
  "style_added": 0,
  "dropped": 12
}
```
