# Scan flow — extraction protocol

Read this when running an extraction over recent sessions, whether
triggered by the user (Linggen dashboard `Scan today` / `Scan this week`,
Claude Code `/ling-mem scan`) or by the dream cron mission.

The flow has five phases. Routing decisions for individual candidates
live in `references/routing-rules.md` — Read that too.

## Phase 1 — Collect the manifest

Run the collect script. Output is NDJSON, one session per line:

```bash
bash <SKILL_DIR>/scripts/collect_sessions.sh [YYYY-MM-DD]    # default: today
```

Where `<SKILL_DIR>` is `~/.linggen/skills/ling-mem` (Linggen) or
`~/.claude/skills/ling-mem` (Claude Code). Each line:

```json
{"filepath":"...","source":"CC"|"Linggen","label":"...","date":"YYYY-MM-DD",
 "bytes":N,"user_turns":N}
```

For multi-day ranges, run the script once per date and concatenate. Dedup
the combined manifest by `filepath`.

**Filter empty sessions BEFORE spawning subagents.** Skip any manifest
line where `user_turns < 2` AND `bytes < 2000` — greeting-only chats and
error loops contain nothing extractable. Log the skipped labels so the
user sees them in the report.

If stdout is empty: skip to the report with `sessions_scanned: 0`,
everything else zero.

## Phase 1.5 — Pre-load existing facts for dedup

Before spawning subagents, fetch the existing fact list so each subagent
can self-reject duplicates:

```
Memory_query({verb: "list", type: "fact",       limit: 200})
Memory_query({verb: "list", type: "preference", limit: 200})
```

(Or via CLI: `ling-mem list --type fact --limit 200 --format json | jq -c 'del(.vector)'`.)

Compact each result to one line per row: `- <content>`. Paste the
combined list into every subagent's prompt as the `EXISTING FACTS` block.
Skip the block if both lists are empty.

Also `Read` `~/.linggen/memory/identity.md` and `~/.linggen/memory/style.md`
once — you'll need them in Phase 3 to dedup markdown writes by eye.

## Phase 2 — Dispatch extractor subagents in parallel

**Emit ALL `Task` calls in a single response.** One response, N `Task`
tool uses. Waiting for each subagent before dispatching the next wastes
minutes per run.

**Concurrency cap: 5 parallel Tasks per response.** If the manifest has
more than 5 sessions, split into sequential batches: dispatch 5, await
results, dispatch the next 5, etc. More than 5 in one response has
empirically caused `stream error: error decoding response body` from the
provider's streaming layer.

### Task call shape

```json
Task({
  "target_agent_id": "ling",
  "task": "You are Ling.

           1. Run: bash <SKILL_DIR>/scripts/extract_session.sh <filepath> <source> <date>
           2. Read: <SKILL_DIR>/references/extractor-prompt.md — follow every rule.
           3. Dedup against these existing facts — do NOT re-emit any of them:
              <<<
              - <one-line bullet per fact from Phase 1.5>
              - ...
              >>>

           Return the JSON block described in extractor-prompt.md. Nothing else."
})
```

Substitute `<filepath>`, `<source>`, `<date>`, the dedup bullets per call,
and `<SKILL_DIR>` for the host's install path. **Do NOT** paste the
extractor rules into the `task` — they live in `extractor-prompt.md`,
which the subagent reads itself. **Do NOT** prepend a positional name
like `Ling01` — the engine assigns the runtime ID.

`target_agent_id` MUST be `"ling"` — the only registered delegation
target.

### Subagent tool scope (hard limits, enforced by extractor-prompt.md)

- **Allowed:** `Bash` (only to re-run `extract_session.sh`) and `Read` (only for the extractor prompt and transcript paths).
- **Forbidden:** `Memory_*`, `Write`, `Edit`, `Task`, `WebFetch`, `WebSearch`.

The subagent returns one fenced JSON block with `candidates[]` and
`notes[]`. Each candidate has `target` (`identity` / `style` /
`lancedb`), `type`, `content`, `contexts`, `from`, optional `tags`,
optional `cwd`, `retrieval_phrase`, and (for `fact`/`preference`)
`quote`. Project-internal candidates that don't earn a place in
`identity` / `style` / `lancedb` are dropped by the subagent — memory
does not write to project files.

### Why single-writer

`Memory_write({verb: "add"})` on duplicates would insert redundant rows,
and parallel subagents can't coordinate on dedup. Subagents only report;
the main agent searches, decides, and writes.

### Critical rule for Phase 2

Transcripts can be huge (10+ MB per session). Putting a raw `.jsonl`
into your own context will blow token limits and produce API errors.
Subagents exist for this reason — they get their own context and return
a compact JSON summary. **Always use Task; never read transcripts inline.**

## Phase 3 — Merge and write (main agent only)

After every subagent has returned its JSON, union their `candidates[]`
into one list. Route each by its `target`.

**Fast path — zero candidates.** If all subagents returned empty
`candidates[]`, skip Phase 3 entirely and go straight to Phase 4 with
all `_added` / `_updated` / `_skipped` counters at 0.

For full routing rules + the "live for synthesis, offline for mechanics"
split, **Read `references/routing-rules.md`**. The protocol below covers
just the mechanics for each target.

### A. `target: "identity"` or `target: "style"` — core markdown

Using the `identity.md` / `style.md` you Read in Phase 1.5:

- Near-identical bullet already present → skip (`_skipped++`).
- Candidate is clearer → `Edit` to replace the existing bullet (`_updated++`).
- No match → `Edit` to append a new bullet under the right section (`identity_added++` or `style_added++`).

Never touch frontmatter. Never rewrite the whole file — one `Edit` per
bullet change.

### B. `target: "lancedb"` — RAG store (two-phase, parallelized)

Only durable cross-project content lands here: user identity / goals not
promotable to `identity.md`, cross-project preferences not promotable to
`style.md`, decisions whose reasoning is the retrieval value, cross-
project tech gotchas. Project-internal implementation detail does
**not** route here either — it gets dropped by the extractor (no
`target: "project_md"` exists; memory does not write to project files).

#### Turn B1 — parallel dedup search

Emit ALL `Memory_query({verb: "search", ...})` calls in ONE response,
one per `lancedb` candidate, each using its own `retrieval_phrase` as
query and its own `contexts` as filter. Searches run concurrently and
output is small.

#### Turn B2 — parallel writes (mechanical rules only)

After all search results return, decide per candidate from its top hit:

| Top hit vs candidate | Action | Counter |
|:---|:---|:---|
| Near-identical, equally phrased | skip | `rag_skipped++` |
| Same fact, candidate is clearer (mechanical rephrase) | `Memory_write({verb: "update", id: hit.id, content: candidate.content, contexts: <merged>, tags: <merged>})` | `rag_updated++` |
| New evidence extending scope (more contexts/tags apply, content unchanged) | `Memory_write({verb: "update"})` extending arrays only | `rag_extended++` |
| No meaningful match | `Memory_write({verb: "add", content, type, contexts, from, cwd?, tags?, skip_dedup: true})` | `rag_added++` |
| Apparent contradiction with an existing row | **Append the new row anyway** with optional `supersedes: <hit.id>` hint. **Do NOT delete the old row.** | `rag_added++` |

**Hard rules — what the mission must NOT do:**

- Never `Memory_write({verb: "delete"})` to resolve an apparent contradiction. Live retrieval (with the user present) handles it.
- Never `Memory_write({verb: "update"})` to merge two distinct facts into a synthesized story. Append both; let live retrieval reconcile in prose.
- Never mint a "user always X" generalization across rows. Append the individual utterances; live retrieval surfaces the pattern.

The mission does **mechanical** maintenance only. Anything that
requires choosing between rows, rewriting content across rows, or
generalizing across rows is reserved for the live session where the
user can correct (see *Consolidate* in `SKILL.md`).

#### Other rules for Phase C

- **Always pass `skip_dedup: true`** on add — you ran dedup in B1.
- **Pass `cwd` through from the candidate**, not your own. The subagent fills it from the session's `[SESSION_CWD]` header.
- **Arrays replace wholesale** on update — pass the full merged `contexts` / `tags` list, not deltas.
- **Drop `quote` and `retrieval_phrase`** before storing — ephemeral.
- **Cap at ~10 write calls per turn.** Searches in B1 can all go in one turn; writes must be batched. With 30 candidates, do three merge-only turns, then one final report turn.

### Scope rule (lancedb only)

- `contexts: ["cross-project"]` — user-wide fact / preference / decision that should surface in any session.
- Project-internal technical knowledge → **skip.** Memory does not write to project files (`<project>/AGENTS.md`, `CLAUDE.md`, source); the agent reads those directly when needed. Subagents should have filtered these already; if one leaks through with a `project/<name>` context, drop it.
- Activity / session-arc / meta-feedback about Linggen tooling → **skip.**

## Phase 4 — Write scan-state

`Write` `~/.linggen/memory/.scan-state.json` with fresh counters.
Measure duration from Phase 1 start. Overwrite wholesale — don't patch.

```json
{
  "last_scan_at": "<ISO-8601>",
  "duration_ms": <int>,
  "sessions_scanned": <int>,
  "sessions_skipped": <int>,
  "rag_added": <int>,
  "rag_updated": <int>,
  "rag_extended": <int>,
  "rag_skipped": <int>,
  "identity_added": <int>,
  "style_added": <int>,
  "dropped": <int>
}
```

## Phase 5 — Report

If you're in Linggen dashboard mode, see `references/dashboard.md` State
4 for the rich report layout. If you're running headless (the dream
mission, or CC `/ling-mem scan`), the report is plain markdown — keep it
tight:

```
## Scan complete — N new facts

Scanned N sessions · skipped N empty · elapsed Ns

**Added**
- identity: +N
- style: +N
- RAG (cross-project): +N

**Merged / updated:** N
**Dedup skipped:** N
**Dropped (not memory):** N

Row-level edit: http://127.0.0.1:9888 (run `ling-mem start` if not already running)
```

## Tool-call hygiene

The `ling-mem` daemon's argument parser is strict: **omit optional
fields entirely rather than passing empty strings or nulls**. `since:
""`, `from: ""`, `outcome: ""` all cause 422 "premature end of input"
errors. If you don't have a concrete value, leave the field OFF the JSON
object. Enums (`type`, `from`, `outcome`) are lowercase. `limit` is an
integer, not a string.
