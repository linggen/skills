# Dream flow — `/shared-memory dream`

Read this when the user invokes `/shared-memory dream` (or the
dashboard's "Scan / Clean" action on Linggen). One pass — no
continuous encode hook.

```
scan → script-extract → host-LLM judge/write → consolidate + evict
```

Per [design doc §4](../doc/shared-memory-design.md): the skill is the
**per-host in-host encoder** for non-Linggen hosts. It isn't handed a
live exchange (it doesn't own the host's agent loop), so it encodes
by reading *that host's own* session files. This is the sanctioned
per-host wake-encode — not cross-tool log-scraping. Cross-tool memory
still emerges from the one shared store.

## Phase 1 — Scan (script, token-cheap)

Run the collect script with the watermark file so a re-run never
re-processes a handled transcript. NDJSON to stdout, one session per
line, only *new* material since the per-source watermark:

```bash
bash ~/.linggen/skills/shared-memory/scripts/collect_sessions.sh \
     --watermark ~/.linggen/memory/.dream-state.json \
     [YYYY-MM-DD]
```

If the watermark file doesn't exist yet (first run), pass nothing —
the script silently emits everything for the target date. (The
canonical scripts live under `~/.linggen/skills/shared-memory/` on
every host — the per-host CC / Codex / OpenClaw skill dirs only
carry a thin `SKILL.md` that points back here.)

Each manifest line:

```json
{"filepath":"...","source":"CC"|"Codex"|"OpenClaw"|"Linggen","label":"...",
 "date":"YYYY-MM-DD","bytes":N,"user_turns":N}
```

**Verified sources** (per design doc §4):

| Host | Path | Format |
|:--|:--|:--|
| Claude Code | `~/.claude/projects/<enc-cwd>/<uuid>.jsonl` | JSONL |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (+ `archived_sessions/`, `history.jsonl`) | JSONL |
| OpenClaw | `~/.openclaw/logs/` | JSONL |
| Linggen (legacy host install) | `~/.linggen/sessions/<id>/messages.jsonl` | JSONL |

**Per-source watermark.** Stored under the `watermark` key in
`~/.linggen/memory/.dream-state.json`. The script reads it via
`--watermark` and emits only files whose `mtime > watermark[source]`.
Missing host key = no filter for that host (first run sees
everything). The agent advances the watermark in Phase 5.

**Filter empty sessions BEFORE judging.** Skip any manifest line where
`user_turns < 2 AND bytes < 2000`. If stdout is empty: skip Phases 2–3,
write Phase 4 counters all-zero, emit a one-line report.

## Phase 2 — Script-extract (no LLM)

For each manifest line, run:

```bash
bash ~/.linggen/skills/shared-memory/scripts/extract_session.sh <filepath> <source> <date>
```

The script:

1. Strips tool noise (`<system-reminder>`, `<command-*>`, fenced code blocks).
2. Hash-dedups verbatim turns.
3. **Secret-filters** — strips lines matching credential / token /
   API-key / `Authorization: Bearer …` patterns BEFORE the LLM sees
   them (memory-spec §3 r6).
4. Caps total output by byte budget so the host LLM stays under context.

Output: flattened `[role]: text` lines + a `[SESSION_CWD]: <path>`
header. Token-cheap.

## Phase 3 — Host-LLM judge + write (salience routing)

The host LLM applies the engine contract verbatim — see
`extractor-prompt.md` (which is a thin pointer to engine
`agents/ling-mem.md` ENCODE phase). The rules:

- **Exclusions** (memory-spec §4): drop re-derivable-from-workspace,
  secrets (defence-in-depth — script already stripped), pure activity.
- **Write-time usefulness bar**: write only if a future task would
  benefit. When uncertain but content is concrete and durable-shaped,
  write — the consolidator (Phase 4) still makes the terminal call past
  TTL.
- **Salience routing**:
  - Explicit "remember" / standing instruction / stated preference →
    write to **`semantic` table** directly (`--tier core` if a
    person-universal, otherwise default `--tier semantic`).
  - Incidental durable signal → write to **`episodic` staging table**
    (`--episodic`).
- **Read before write — every row**: `ling-mem search "<gist>"
  --format json | jq -c 'del(.vector)'` (also `--episodic`). If an
  equivalent value already exists, skip. If a contradicting value
  exists, write the new row anyway (never drop what the user just
  said); never merge / rewrite / mark-stale.

The binary's `insert_with_dedup` rejects *exact-content* duplicates
mechanically (commit `88da2ae`). Fuzzy "same fact in different
wording" is the LLM's job here, not the binary's.

**Writes go through the daemon.** `ling-mem` will route via HTTP if a
daemon is running, or open the store directly otherwise.

## Phase 4 — Consolidate + evict (same back-half as Linggen dream)

After Phase 3, run the consolidate pass over past-TTL episodic rows.
This is the same contract the Linggen engine `dream` mission runs;
shared back-half:

```bash
ling-mem list --episodic --older-than <TTL> --format json | jq -c 'del(.vector)'
```

For each past-TTL episodic row, make **one terminal decision** —
there is no "leave it" in episodic:

- **Promote**: durable user biography, cross-project preference,
  decision-with-reasoning, or re-hit gotcha →
  `ling-mem add "<content>" --type <type> --from <from> [--context <c>]…`
  (semantic write), then `ling-mem delete <episodic-id> --episodic --yes`.
- **Delete**: not worth keeping → `ling-mem delete <episodic-id>
  --episodic --yes`.

**Read before promote.** Always `ling-mem search` the gist first; if
the value is already in `semantic`, just delete the episodic source.
Promotion is plain append — never destructively edit an existing
semantic row.

**Reconcile floor** (`agents/ling-mem.md` CONSOLIDATE — no-user
branch of memory-spec.md §2):

- Never generalize scattered utterances into a "user always X" rule.
- Never merge distinct facts into a synthesized story.
- Never resolve contradictions between semantic rows. A contradicting
  pair → promote each on its own merits as separate atoms. The
  conflict is left for a later user-present recall to resolve.

## Phase 5 — Persist state, report

Write `~/.linggen/memory/.dream-state.json` (overwrite wholesale).
**Advance the watermark to this run's start time** for every host
that appeared in Phase 1's manifest — that's what closes the loop
so the next dream doesn't re-scan the same files. Hosts absent from
this run keep their prior watermark untouched:

```json
{
  "last_run_at": "<ISO-8601>",
  "duration_ms": <int>,
  "sessions_scanned": <int>,
  "sessions_skipped": <int>,
  "encoded_semantic": <int>,
  "encoded_episodic": <int>,
  "promoted": <int>,
  "evicted": <int>,
  "core_added": <int>,
  "dropped": <int>,
  "watermark": { "CC": "<ISO>", "Codex": "<ISO>",
                 "OpenClaw": "<ISO>", "Linggen": "<ISO>" }
}
```

Emit a terse markdown report (headless) or the State 4 dashboard
layout (Linggen dashboard mode — see `dashboard.md`).

```
## Dream complete — N new memories

Scanned N sessions · skipped N empty · elapsed Ns

**Encoded**
- core: +N · long-term: +N · episodic: +N

**Consolidated**
- promoted: +N · evicted: N

**Dropped (not memory):** N

Row-level edit: http://127.0.0.1:9888 (run `ling-mem start` if not running)
```

## Tool-call hygiene

`ling-mem` argument parser is strict: **omit optional fields** rather
than passing empty strings. `since: ""`, `from: ""`, `outcome: ""`
all cause 422. Enums are lowercase. `limit` is an integer.
