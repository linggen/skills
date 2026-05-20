# Dashboard mode — Linggen `/ling-mem` app flow

Read this file when the user invokes `/ling-mem` (the dashboard app
mounts) or clicks any dashboard action. **Linggen-only** — Claude Code
has no `PageUpdate` capability and never enters this flow.

The dashboard is **agent-narrated**: top-to-bottom it reads like a
letter from you — a one-paragraph greeting with inline actions, then
*"Who you are"* (core), then *"What I know"* (long-term), with change feedback
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

1. `Read` `~/.linggen/memory/.dream-state.json` — missing file = never scanned; treat gracefully.
2. `Memory_query({verb: "list", tier: "core", limit: 100})` — the always-loaded set, rendered as the CORE widget.
3. `Memory_query({verb: "list", type: "<t>", limit: 50})` for each of `fact`, `preference`, `decision`, `tried`, `fixed`, `learned`, `built` (7 parallel calls), each implicitly filtered to `tier=semantic` (default) — rendered as the long-term per-type widgets.

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

### On any scan / dream message

The dashboard's "Scan today / week / month / all" and "Analyze and
clean" buttons all map to the same single pass — `/shared-memory
dream`. Run the full §4 dream contract:

1. Emit a `PageUpdate` replacing `body` with the **`checklist` widget** — user sees the dream plan immediately.
2. Run **Phase 1 (scan)** — `dream-flow.md` §1: `collect_sessions.sh --watermark ~/.linggen/memory/.dream-state.json [date]`.
3. Run **Phase 2 (script-extract)** — `dream-flow.md` §2: extract_session.sh (strip noise + secret-filter).
4. Run **Phase 3 (host-LLM judge + write)** — `dream-flow.md` §3: salience routing (explicit → semantic, incidental → episodic). Read `extractor-prompt.md` and `routing-rules.md`.
5. Run **Phase 4 (consolidate + evict)** — `dream-flow.md` §4: promote-or-delete past-TTL episodic rows.
6. Update `~/.linggen/memory/.dream-state.json` — advance the `watermark[host]` to this run's start time for every host seen in the manifest (see *Dream-state file* below).
7. Emit the **Report** layout (small — scorecard + deltas only; overview lists render on the NEXT user interaction).

### On row-level UI actions

When the user clicks ✎ or × on a row, the dashboard sends you a plain
chat message. These are direct user actions — **do not dedup-search or
second-guess**; just apply and re-render.

| Incoming message pattern | Action |
|:---|:---|
| `Delete the <type> fact with id="<id>" and re-render the dashboard. The fact says: "<content>"` | Call `Memory_write({verb: "delete", id: "<id>"})`, then re-emit the overview PageUpdate with the fresh counts. |
| `Update the <type> fact id="<id>" to content: "<new>". Re-render the dashboard.` | Call `Memory_write({verb: "update", id: "<id>", content: "<new>"})` (keep existing `contexts` / `tags` unchanged), then re-emit the overview PageUpdate. |

For these UI-triggered actions you do NOT need extraction, dedup
search, or any of the dream phases — just the single tool call plus
the re-render. Keep chat text to one sentence: *"Deleted."* or
*"Updated."*

If the id lookup fails or the tool returns an error, say so plainly in
chat — don't hide it.

### On `Help`

Reply with a short chat message (no `PageUpdate`). Cover in 3–5 bullets:

- What you scan (Claude Code + Linggen session files from `~/.claude/projects/` and `~/.linggen/sessions/`).
- How routing works (durability test → core vs long-term tier; project-internal candidates drop, since memory does not write to project files).
- What each action button does.
- The data browser at `http://127.0.0.1:9888` for row-level editing.
- Where scan history is stored (`~/.linggen/memory/.dream-state.json`).

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
  "stats": "42 long-term · 5 core · last scan 3h ago, +8 facts",
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
&lt;name&gt;. Here's…"*) ONLY when a `tier=core` row exists whose
content explicitly states the user's name (e.g. *"User is Liang"*).
If no such core row exists, emit the greeting with NO name. Do NOT
infer a name from file paths under `/Users/<something>/`, the OS
username, environment variables, or any example in this document.

- An action with `href` opens the URL in a new tab. An action with `message` sends the message as if the user typed it.
- **Button label MUST match its `message` verb.** Calendar-day filtering, not sliding-window:
  - ✅ `"Scan Today"` → `"Scan today"` (calendar day, midnight→now)
  - ✅ `"Week"` → `"Scan this week"`
  - ❌ `"Scan last 24h"` → wrong; the filter is calendar-day
- First action MUST be the primary scan (`kind: "primary"`).
- Remaining actions: Week / Month / All / Clean / Help / Browse. Drop any that don't apply.

**2. `fact-list` for core** (only if any `tier=core` rows exist):

```json
{
  "type": "fact-list",
  "title": "CORE",
  "meta": "core · always loaded",
  "count": 3,
  "source": "rag:core",
  "actions": ["edit", "delete"],
  "items": [
    { "id": "<uuid>", "content": "<core row content>", "added": "2d ago" }
  ]
}
```

(Use the actual rows from `Memory_query({verb: "list", tier: "core"})` —
don't make up examples. Each row MUST include `"id"` so ✎/× wire up.)

**3. One `fact-list` per non-empty long-term type**, in this order: `fact`, `preference`, `decision`, `tried`, `fixed`, `learned`, `built`:

```json
{
  "type": "fact-list",
  "title": "FACT",
  "meta": "long-term · fact",
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
  "title": "DREAM · TODAY",
  "items": [
    { "label": "Scan sessions (watermark + manifest)", "status": "active" },
    { "label": "Script-extract (strip noise + secret-filter)", "status": "pending" },
    { "label": "Host-LLM judge + write (salience routing)", "status": "pending" },
    { "label": "Consolidate + evict (past-TTL episodic)", "status": "pending" },
    { "label": "Write .dream-state.json", "status": "pending" },
    { "label": "Render report", "status": "pending" }
  ],
  "footer": "starting..."
}
```

**Update pattern:** flip just-done item to `done` (with concrete
`detail` like `"7 found · 0.8s"`), set the next to `active`, keep the
rest `pending`. Re-emit the whole checklist in one `PageUpdate`.

**Status values:** `"pending"` (○) · `"active"` (→) · `"done"` (✓) · `"skipped"` (—) · `"failed"` (✗).

**Title must match the button label:** `Scan today` → `"DREAM · TODAY"`, `Scan this week` → `"DREAM · THIS WEEK"`. Never say "last 24 hours" — the filter is calendar-day.

**Per-item `detail`** (right-aligned): concrete counts + durations (`"7 found · 0.8s"`, `"3 of 12"`). Skip for `pending`. Keep short.

**`sub` field** (below the row, italic): use only on `active` to narrate what's happening (`"Memory_query parallel · writing + / ~ / −"`). Remove when the item flips to `done`.

**`footer`:** live elapsed + ETA (`"elapsed 47s · ≈ 1m 30s remaining"`) or `"completed in <total>"` when all done.

**Emit timing — flip statuses at:**

| Milestone | Flip |
|:---|:---|
| manifest done | `Scan…` → done; `Script-extract…` → active |
| extracts done | `Script-extract…` → done; `Host-LLM judge…` → active |
| writes done | `Host-LLM judge…` → done; `Consolidate…` → active |
| consolidate done | `Consolidate…` → done; `Write .dream-state.json` → active |
| state written | `Write .dream-state.json` → done; `Render report` → active |
| PageUpdate sent | `Render report` → done |

**Multi-batch host-LLM rule** (>5 sessions): the `Host-LLM judge…`
row stays `active` across ALL batches — do NOT flip it to `done`
after batch 1 only. Use `detail` to narrate progress. Final flip to
`done` only when every batch's writes have completed.

**Zero-candidate path:** if every host-LLM judge returned empty
candidates, the host-LLM phase DID run (it decided nothing needed
writing) — mark `Host-LLM judge + write` as `done` with detail
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
  { "label": "Core",       "status": "green",  "detail": "+1" },
  { "label": "Long-term",  "status": "green",  "detail": "+8" },
  { "label": "Merged",     "status": "yellow", "detail": "~3" },
  { "label": "Dedup skip", "status": "gray",   "detail": "4" },
  { "label": "Dropped",    "status": "gray",   "detail": "12 (not memory)" }
]}
```

4. `fact-list`(s) titled `"ADDED THIS SCAN"` — emit **one list per tier** so each row carries the correct edit/delete contract. Do NOT merge core and long-term into a single list.

   - core rows added → list with `"source": "rag:core"`, `"meta": "core · always loaded"`.
   - long-term rows added → list with `"source": "rag:mixed"` (or `"rag:<type>"`), `"meta": "long-term · cross-project"`.

   Every item MUST include `"id": "<uuid>"` from the add response — without it the row gets no ✎/× buttons.

   **Emit every added row — no cap, no overflow placeholder.** The renderer makes long lists scrollable. Each shown row has `"badge": "+"`. Omit any list whose source had zero adds.

5. `fact-list` titled `"MERGED / UPDATED"` — **cap at 5 rows** with `… +M more` overflow. Items with `badge: "~"`. Omit if empty.

**Do NOT** emit a `PROJECT MEMORY ADDED` list or a `recommendations` widget. Memory does not write to project files; project-internal candidates are dropped during extraction. The "Dropped" scorecard tile carries the count for transparency.

**Do NOT** emit overview fact-lists in the report state. They live in State 1/2 and render when the user reopens the dashboard. The report is a delta, not a full refresh.

**Do NOT** emit the CTA widget in the report state — the user just scanned.

### `footer`

`{ "text": "<relative timestamp or status>" }` — e.g. `"Last updated just now"` or `"Scanning..."`.

## Dream-state file

`~/.linggen/memory/.dream-state.json` is the dream record. Read on State 1, write at the end of every dream pass. Overwrite wholesale — don't try to patch. Missing file means the user has never run a dream.

```json
{
  "last_run_at": "2026-04-23T09:00:00Z",
  "duration_ms": 45000,
  "sessions_scanned": 5,
  "sessions_skipped": 2,
  "encoded_semantic": 5,
  "encoded_episodic": 9,
  "promoted": 3,
  "evicted": 4,
  "core_added": 1,
  "dropped": 12,
  "watermark": {
    "CC": "2026-04-23T09:00:00Z",
    "Codex": "2026-04-23T09:00:00Z",
    "OpenClaw": "2026-04-23T09:00:00Z",
    "Linggen": "2026-04-23T09:00:00Z"
  }
}
```
