# Dream flow — `/shared-memory dream`

Read this when the user invokes `/shared-memory dream` (or the
dashboard's **Hippocampus** action on Linggen). One LLM pass — no
continuous encode hook.

```
read .scan-output.jsonl → judge & write → consolidate + evict → state + report
```

The dream is **judgment only**. The mechanical extraction step lives
in `scripts/scan.sh` and runs separately (see `SKILL.md` →
*Slash commands* → `scan`). Dream reads the cleaned transcripts that
scan already produced; it does not collect or denoise session files
itself.

If `.scan-output.jsonl` is missing or empty, the dream still runs —
it just skips Phase 2 (judge + write) and goes straight to Phase 3
(consolidate past-TTL episodic rows). The user can re-trigger
`/shared-memory scan` to refresh the candidate set.

## Phase 1 — Read candidates

```bash
cat ~/.linggen/memory/.scan-output.jsonl
```

Line 1 is the meta header (already produced by `scan.sh`):

```json
{"_meta": true, "started_at": "...", "finished_at": "...",
 "window": "today|7d|30d",
 "sessions_found": N, "sessions_scanned": N, "skipped_empty": N,
 "bytes_total": N, "duration_ms": N}
```

Lines 2..N are one cleaned session per line:

```json
{"filepath": "...", "source": "CC|Codex|OpenClaw|Linggen",
 "date": "YYYY-MM-DD", "user_turns": N, "bytes": N,
 "transcript": "[SESSION_CWD]: ...\n[user]: ...\n[assistant]: ..."}
```

Already filtered: empty / greeting-only sessions are dropped, tool
calls + system reminders stripped, secrets filtered. You receive a
clean `[role]: text` transcript and can move straight to judging.

If `.scan-output.jsonl` doesn't exist, skip to Phase 3.

## Phase 2 — Judge + write (salience routing)

Apply the engine contract verbatim — see `extractor-prompt.md` (thin
pointer to engine `agents/ling-mem.md` ENCODE phase). Rules:

- **Exclusions** (memory-spec §4): drop re-derivable-from-workspace,
  secrets (already stripped — defence in depth), pure activity.
- **Write-time usefulness bar**: write only if a future task would
  benefit. When uncertain but content is concrete and durable-shaped,
  write — the consolidator (Phase 3) still makes the terminal call
  past TTL.
- **Salience routing — pick a tier per row, by confidence:**
  - **`core`** (`tier=core`) — narrow universals about the *person*:
    name, role, location, timezone, languages, pets / family,
    commitment-language standing preferences. Keep tight.
  - **`semantic`** (default) — long-term goals / vision, cross-project
    preferences, decisions whose reasoning is the retrieval value,
    cross-project tech gotchas, explicit "remember X" requests.
  - **`episodic`** — incidental durable signal, single-mention
    candidates, anything you're not yet sure earns long-term shelf
    space. Consolidator (Phase 3) promotes or evicts past-TTL.
- **Read before write — every row**: `Memory_query({verb: "search",
  query: "<gist>"})` (or `ling-mem search "<gist>" --format json |
  jq -c 'del(.vector)'`). If an equivalent value exists, skip. If a
  contradicting value exists, write anyway — never drop what the
  source said. Don't merge / rewrite / mark-stale.

The binary's `insert_with_dedup` rejects *exact-content* duplicates
mechanically. Fuzzy "same fact, different wording" is the LLM's job
here, not the binary's.

## Phase 3 — Consolidate + evict (same back-half as the Linggen dream mission)

For each past-TTL episodic row, make **one terminal decision** — there
is no "leave it" in episodic:

```bash
ling-mem list --episodic --older-than <TTL> --format json | jq -c 'del(.vector)'
```

- **Promote** (durable user biography, cross-project preference,
  decision-with-reasoning, re-hit gotcha):
  `Memory_write({verb: "add", content: "<text>", type: "<t>",
  tier: "semantic"|"core", from: "<from>", contexts: [...]})`,
  then `Memory_write({verb: "delete", id: "<episodic-id>"})`.
- **Delete** (not worth keeping):
  `Memory_write({verb: "delete", id: "<episodic-id>"})`.

**Read before promote.** Search the gist first; if the value is already
in `semantic`, just delete the episodic source. Promotion is plain
append — never destructively edit an existing semantic row.

**Reconcile floor** (`agents/ling-mem.md` CONSOLIDATE — no-user branch
of memory-spec §2):

- Never generalize scattered utterances into a "user always X" rule.
- Never merge distinct facts into a synthesized story.
- Never resolve contradictions between semantic rows. A contradicting
  pair → promote each on its own merits as separate atoms. The
  conflict is left for a later user-present recall to resolve.

## Phase 4 — Persist state, report

Write `~/.linggen/memory/.dream-state.json` (overwrite wholesale):

```json
{
  "last_run_at": "<ISO-8601>",
  "duration_ms": <int>,
  "sessions_judged": <int>,
  "encoded_core": <int>,
  "encoded_semantic": <int>,
  "encoded_episodic": <int>,
  "promoted": <int>,
  "evicted": <int>,
  "dropped": <int>
}
```

(The per-host watermark from `scan.sh` is a different file
concern — scan handles its own dedup; dream doesn't have to advance
it.)

### Report — dashboard mode (Linggen)

The skill's web app expects ONE `PageUpdate` with this body shape.
Do **not** touch `top_bar` — JS owns it (tier counts auto-refresh
post-PageUpdate via `refreshTierCounts`).

```json
{
  "body": [
    {
      "type": "greeting",
      "icon": "🧠",
      "title": "Hippocampus done — N new memories",
      "stats": "Judged N sessions · +N core · +N semantic · +N episodic · ↑N promoted · −N evicted · elapsed Ns",
      "actions": [
        { "label": "Open in ling-mem console ↗",
          "href": "http://127.0.0.1:9888/?session=<this-engine-session-id>&since=<run-started-at>",
          "kind": "primary" },
        { "label": "Scan again", "icon": "🔍", "message": "Scan today" }
      ]
    },
    {
      "type": "fact-list",
      "title": "JUST WRITTEN",
      "count": N,
      "source": "rag:mixed",
      "items": [
        { "id": "<id>", "content": "<text>", "context": "core",
          "added": "now", "badge": "+" },
        { "id": "<id>", "content": "<text>", "context": "semantic",
          "added": "now", "badge": "+" },
        { "id": "<id>", "content": "<text>", "context": "episodic",
          "added": "now", "badge": "+" }
      ]
    },
    {
      "type": "fact-list",
      "title": "PROMOTED",
      "count": N,
      "source": "rag:mixed",
      "items": [
        { "id": "<new-semantic-id>", "content": "<text>",
          "context": "ep→sem", "added": "now", "badge": "~" }
      ]
    }
  ]
}
```

- `<this-engine-session-id>` = the session this dream runs in. Pull
  from your engine context; it's the `source_session` you stamp on
  each `Memory_write({verb:"add"})` call.
- `<run-started-at>` = the ISO timestamp at the top of Phase 1, in
  full RFC-3339 form. The dashboard accepts both ISO and bare
  `YYYY-MM-DD`.
- `context` on each fact-list item carries the tier label (`"core"` /
  `"semantic"` / `"episodic"`) so the user can tell at a glance where
  a row landed.
- Cap rows per section at ~10 with a trailing "+N more" item if
  there are more — the user goes to the daemon's console for the
  full list.

### Report — headless mode (Claude Code / Codex / OpenClaw)

These hosts have no `PageUpdate` canvas; emit a terse markdown report
as your final agent message instead:

```
## Hippocampus complete — N new memories

Judged N sessions · elapsed Ns

**Encoded**
- core: +N · semantic: +N · episodic: +N

**Consolidated**
- promoted: +N · evicted: N

**Dropped (not memory):** N

Row-level edit: http://127.0.0.1:9888/?since=<run-started-at>
(run `ling-mem start` if not running)
```

## Tool-call hygiene

`ling-mem` argument parser is strict: **omit optional fields** rather
than passing empty strings. `since: ""`, `from: ""`, `outcome: ""`
all cause 422. Enums are lowercase. `limit` is an integer.
