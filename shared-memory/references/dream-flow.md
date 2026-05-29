# Dream flow — `/shared-memory dream [window]`

Read this when the user invokes `/shared-memory dream` (or the
dashboard's **Hippocampus** action on Linggen). One LLM pass — no
continuous encode hook.

```
scan(window) → read .scan-output.jsonl → judge & write → consolidate + evict → state + report
```

The dream owns the whole pipeline: it runs the mechanical scan first
(Phase 0, zero LLM), then does the judgment (Phases 2–3). The scan
step lives in `scripts/scan.sh` (no standalone verb — `dream` is the
only caller) and refreshes the candidate set itself, so a normal
`dream` no longer depends on a prior manual scan.

**Window argument** — `/shared-memory dream [window]` selects how far
back the Phase 0 scan walks. Defaults to **24h**. Accepts the same
grammar as `scan.sh`:

| Invocation | Window |
|:---|:---|
| `/shared-memory dream` | 24h (last 1 day) |
| `/shared-memory dream week` | 7 days |
| `/shared-memory dream month` | 30 days |
| `/shared-memory dream 14d` | 14 days |
| `/shared-memory dream 2m` | 60 days (2×30) |
| `/shared-memory dream 2026-05-20` | **only that one day** |

Grammar: `today`/`24h`, `week`, `month`, `<n><unit>` (unit
`d`/`w`/`m`(=30d)/`y`(=365d)), or a literal `YYYY-MM-DD` to scan
exactly that calendar day. The dashboard heatmap sends the date form
when the user clicks a specific day.

## Phase 0 — Scan (refresh candidates)

Run the mechanical walk for the requested window. This is zero-LLM —
it just collects, denoises, and secret-filters host sessions into
`.scan-output.jsonl`:

```bash
bash ~/.linggen/skills/shared-memory/scripts/scan.sh <window>
```

`<window>` is whatever the user passed after `dream` (default `24h`).
The one-line stdout (`window=… found=… scanned=…`) tells you how many
sessions landed. If the scan finds nothing, `.scan-output.jsonl` will
contain only the `_meta` header — the dream still proceeds to Phase 3
(consolidate past-TTL episodic rows).

If `scan.sh` fails (missing `jq`, no session dirs, etc.), don't abort —
fall through to Phase 1 reading whatever `.scan-output.jsonl` already
exists, and note the scan failure in the final report.

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
- **Read before write — every row**: `ling-mem search "<gist>" --format
  json | jq -c 'del(.vector)'`. If an equivalent value exists, skip.
  If a contradicting value exists, write anyway — never drop what the
  source said. Don't merge / rewrite / mark-stale.

The binary's `insert_with_dedup` rejects *exact-content* duplicates
mechanically. Fuzzy "same fact, different wording" is the LLM's job
here, not the binary's.

## Phase 3 — Consolidate + evict (same back-half as the Linggen dream mission)

For each past-TTL episodic row, make **one terminal decision** — there
is no "leave it" in episodic.

**TTL is user-configurable** via the daemon's `/api/config` endpoint
(defaults to 7 days; dashboard gear icon at `http://127.0.0.1:9888/`
edits it). Read it once at the start of Phase 3 so every host honors
the same value:

```bash
TTL_DAYS=$(curl -s http://127.0.0.1:9888/api/config 2>/dev/null \
           | jq -r '.data.episodic_ttl_days // 7')

# Worklist: what's past-TTL, for the LLM to inspect / promote.
ling-mem list --episodic --older-than "${TTL_DAYS}d" --format json \
  | jq -c 'del(.vector)'

# Bulk-evict past-TTL rows the LLM doesn't promote (this replaces
# the old `ling-mem evict --before <ts>` verb — same semantics, now
# the bulk-forget path with a duration filter):
ling-mem --episodic forget --older-than "${TTL_DAYS}d" --yes
```

`--older-than` accepts `<n><unit>` for `s|m|h|d|w`; the CLI computes
the cutoff date and applies it as `--until <now-duration>` to the
request, so the skill never has to know about RFC-3339 timestamps.

Headless override (no daemon reachable): set
`LING_MEM_EPISODIC_TTL_DAYS=30` before invoking the dream — read it
into `$TTL_DAYS` before the `curl` line. Falls back to 7 if neither
source is available.

- **Promote** (durable user biography, cross-project preference,
  decision-with-reasoning, re-hit gotcha):
  `ling-mem add "<text>" --type <t> --from <from> [--tier core] --context <c> [...]`,
  then `ling-mem delete <episodic-id> --yes`.
- **Delete** (not worth keeping):
  `ling-mem delete <episodic-id> --yes`.

**Search before promote.** For each candidate, search the gist in
semantic *and* in any other episodic rows you haven't processed yet:

```bash
ling-mem search "<gist>" --limit 8 --format json | jq -c 'del(.vector)'
ling-mem search "<gist>" --limit 8 --tier episodic --format json | jq -c 'del(.vector)'
```

Then act on what you find — **dream is the cleanup pass, not the
"never resolve" pass.** See `SKILL.md` → *Memory hygiene* for the
universal rule; the dream-specific application:

| You see | If confident | If not |
|:---|:---|:---|
| Candidate matches an existing semantic row (same meaning) | Skip the promote, **delete the episodic source.** | AskUser ("are these the same?") → act on answer. |
| Two episodic candidates this pass are dups of each other | Pick the better-phrased one, promote it, delete the other. | AskUser before merging. |
| Candidate contradicts an existing semantic row (same subject, incompatible value) | **Don't pick silently.** Always AskUser → on the user's pick, `ling-mem add "<winner>" --type <t> --from <f>` then `ling-mem delete <loser-id> --yes` (write first, then delete — the CLI has no atomic replace verb). | Same — always ask. |
| Three+ rows on one subject (cluster) | AskUser once with the cluster, then write the winner once and `ling-mem delete <id> --yes` each loser. | Same. |

**Asking when the host has no structured AskUser tool:** dream is
user-invoked, so the user is reachable. Write the question in plain
chat text with numbered options, stop the pass, and pick up on the
next turn — read the answer, apply the resolve, finish remaining rows.
A small state file (`~/.linggen/memory/.dream-cursor.json`) recording
the unprocessed worklist makes resume safe.

**Still forbidden:**
- Never generalize scattered utterances into a "user always X" rule.
  Append the individual rows; live retrieval surfaces the pattern.
- Never merge two distinct facts into one synthesized story.
- Never promote a contradicting pair as separate atoms hoping live
  recall fixes it later. That's the old rule — it accumulates drift.
  Ask now.

## Phase 4 — Persist state, report

Write `~/.linggen/memory/.dream-state.json` (overwrite wholesale):

```json
{
  "last_run_at": "<ISO-8601>",
  "window": "<window>",
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

`window` is the normalized scan window this pass used (read it from
the `_meta.window` field of `.scan-output.jsonl`, e.g. `24h`, `7d`,
`30d`, `14d`) so the dashboard can show *"last dream: 2h ago · 1-day
window"*.

**Also append one history row** to
`~/.linggen/memory/.dream-history.jsonl` (append, never overwrite —
this is the only durable per-run log; the dashboard's year heatmap
reads it):

```bash
printf '%s\n' '{"date":"<YYYY-MM-DD>","run_at":"<ISO-8601>","window":"<window>","scanned_from":"<YYYY-MM-DD>","scanned_to":"<YYYY-MM-DD>","sessions":<int>,"encoded_total":<int>,"encoded_core":<int>,"encoded_semantic":<int>,"encoded_episodic":<int>,"promoted":<int>,"evicted":<int>,"dropped":<int>,"duration_ms":<int>}' \
  >> ~/.linggen/memory/.dream-history.jsonl
```

`date` is the run's local calendar day. `scanned_from`/`scanned_to`
are the calendar-day range the scan actually walked — **copy them
verbatim from the `_meta.scanned_from` / `_meta.scanned_to` fields of
`.scan-output.jsonl`**. The heatmap greens every day in that inclusive
range, so a `dream week` lights 7 cells and a `dream 2026-05-20`
lights one. `encoded_total` = core + semantic + episodic. One line per
run; multiple runs are separate lines (the dashboard merges them).

(The per-host watermark from `scan.sh` is a different file
concern — scan handles its own dedup; dream doesn't have to advance
it.)

### Report — dashboard mode (Linggen)

Emit ONE `PageUpdate` whose `body` is a **report card** (`dream-report`)
followed by one `fact-list` per operation. Do **not** touch `top_bar`
(tier counts auto-refresh via `refreshTierCounts`) and do **not** include
a `dream-calendar` — the web app re-reads `.dream-history.jsonl` and
re-appends the refreshed calendar automatically after this report (see
`memory-app.js` → `refreshCalendarAfterReport`), so the just-dreamed
day turns green with no manual reload.

```json
{
  "body": [
    {
      "type": "dream-report",
      "title": "Dream complete — N new memories",
      "window": "<window>",
      "elapsed_s": N,
      "scan": { "sessions": N, "from": "<YYYY-MM-DD>", "to": "<YYYY-MM-DD>" },
      "encoded": { "core": N, "semantic": N, "episodic": N },
      "promoted": N, "evicted": N, "dropped": N
    },
    {
      "type": "fact-list",
      "title": "ENCODED",
      "count": N,
      "source": "rag:mixed",
      "actions": ["edit", "delete"],
      "items": [
        { "id": "<row-id>", "content": "<text>", "context": "semantic",
          "added": "now", "badge": "+" }
      ]
    },
    {
      "type": "fact-list",
      "title": "PROMOTED",
      "count": N,
      "source": "rag:mixed",
      "actions": ["edit", "delete"],
      "items": [
        { "id": "<new-semantic-id>", "content": "<text>",
          "context": "ep→sem", "added": "now", "badge": "~" }
      ]
    },
    {
      "type": "fact-list",
      "title": "EVICTED",
      "count": N,
      "source": "rag:mixed",
      "actions": [],
      "items": [
        { "content": "<text>", "context": "episodic", "badge": "−" }
      ]
    }
  ]
}
```

- `dream-report` carries the **scan result** (sessions + date range +
  window + elapsed) and the **operation counts**. `scan.from/to` come
  from `_meta.scanned_from/to`; `window` from `_meta.window`.
- Each `fact-list` row is a memory record with its operation badge:
  `+` encoded, `~` promoted, `−` evicted. Rows with a real `id` get
  per-row **edit / delete** affordances (delete dispatches
  `Memory_write{verb:"delete"}` directly — no LLM roundtrip). Omit `id`
  and use `actions: []` for EVICTED rows (already gone — nothing to act
  on).
- `context` carries the tier label (`core` / `semantic` / `episodic`,
  or `ep→sem` for a promotion) so the user sees where each row landed.
- Cap each list at ~10 rows with a trailing `{ "content": "+N more" }`
  placeholder; the full set lives in the ling-mem console.

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
