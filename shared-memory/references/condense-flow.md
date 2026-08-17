# Condense flow — collapse stale chains (canonical runbook)

Stage 4 of the memory pipeline: **semantic-at-rest maintenance**, the
only pass whose input is old long-term rows. Every other merge point
gates entry (write-time dedup, the dream's promotion judgment) or works
a recall window; condense cures what no recall ever touches.

- **Linggen** — the last stage of the nightly `dream` mission (the
  `memory` agent): once the remember worklist is clear, one capped
  fetch of **cited** chains (`derived_only`, limit 10) merges
  unattended — the engine snapshots the store first. `marker`
  candidates merge unattended only on the completion bar (a strictly
  newer same-subject derived neighbor asserts the marked work done —
  see the dream flow's audit pass); below the bar they are queued.
  `subject` clusters never run unattended; they wait for an attended
  pass where the user can be asked.
- **Claude Code / Codex / OpenClaw** — no mission runtime; the host
  agent runs the steps below via the `ling-mem` CLI (or the
  `memory_chains` / `memory_add` MCP tools), on demand — this is also
  the attended deep pass for marker/subject clusters.

## Before the first run — back up

```bash
ling-mem export ~/condense-backup-$(date +%F).ndjson
```

Condense retires rows (atomically, via `replace_ids`), and the first
runs should be supervised: watch the `MERGE` lines, spot-check a few
survivors, keep the export until you trust the pass.

Retiring is **archiving, not deleting** (2026-08-17): a semantic loser
gets `expired_at` + `superseded_by = <survivor id>` — it leaves search,
list, scans, and counts, but stays on disk. Every merge and digest is
reversible: `ling-mem list --superseded-by <survivor-id>` unpacks one;
`--include-expired` widens any list to the archive. (Episodic losers
are still hard-deleted — staging is disposable.)

## The scan — `chains`

```bash
ling-mem chains --derived-only --limit 3                  # cited chains
ling-mem chains --kind marker --derived-only --limit 5    # marker candidates
ling-mem chains --kind subject --derived-only --limit 2   # subject clusters (v2)
```

(MCP: `memory_chains {"kind":"cited","derived_only":true,"limit":3}`.)

Three kinds, one law:

- **`cited`** — rows citing another row's id verbatim, grouped into
  chains. Pre-confirmed: an id citation is proof of reference;
  collapse without re-litigating.
- **`marker`** — rows with provisional-state language ("OPEN:",
  "uncommitted", …) plus nearest-neighbor rows. Guesses: collapse only
  after confirming a neighbor is the same subject AND one row
  completes or obsoletes the other; otherwise skip.
- **`subject`** (digests) — same-subject vector clusters, 3+ rows.
  Parallel notes on one subject, not a newest-wins chain: write one
  focused per-subject **digest** row, tagged `digest`. Vector neighbors
  carry boundary noise — digest the largest genuinely-one-subject
  subset (`replace_ids` only its ids), leave outliers untouched; never
  one mega state row. The scan serves only **quiet** subjects (newest
  member >30 days old — a live subject keeps its detail; `live_skipped`
  reports how many were withheld) and skips clusters a prior ruling
  covers (`ruled_skipped`). Cap: 5 digests per run. **Attended only,
  early era**: confirm each digest with the user before writing. When
  the user says keep-separate, RECORD THE RULING so the cluster stops
  re-serving: `ling-mem issue-add --kind subject --row <id> [--row
  <id> …] "<subject>: ruled keep-separate <date>"` listing EVERY member
  id, then `ling-mem issue-resolve <issue-id> dismissed` — the ruling
  is the user's, not an open question.

**Always pass `derived_only`** on an unattended or semi-attended pass —
it filters to clusters that are entirely the agent's own notes
(`from=derived`, `tier=semantic`), which the merge law allows merging
without the user. A user-voice cluster is the user's to resolve
(surface it in chat; never auto-merge).

## The collapse — one current-truth row per chain

One atomic write per chain (MCP/HTTP):

```json
memory_add {
  "content": "<current state first; history as a short dated span; keep lessons, drop dead provisional markers>",
  "type": "<most current member's type>",
  "contexts": [<union of members'>],
  "cwd": "<the members' shared value when they agree; omit otherwise>",
  "replace_ids": ["<every member id>"]
}
```

CLI hosts (no atomic replace verb): `ling-mem add` the survivor first,
then `ling-mem delete <member-id> --yes` each member — write before
delete.

Drafting rules (same as the memory agent's):

- Lead with the current state; carry history as a dated narrative
  span. Keep re-hit lessons and decision reasoning; drop per-event
  noise and provisional markers that no longer hold.
- Never invent — every claim must come from a member row. On conflict,
  keep the newest claim and note the change.
- **Never cite raw row ids in the new content** — the members leave
  live memory, and `superseded_by` already carries the lineage; an id
  in prose would only confuse the next reader.
- `replace_ids` may list only `from=derived, tier=semantic` rows.
  Never a user-voice row, a core row, or an episodic id — one in the
  cluster means skip the whole cluster.

## Loop shape

Cited chains: re-fetch at offset 0 after each batch — merged chains
vanish from the next scan, so the front of the list is always fresh
work; stop at `total: 0`. Marker candidates and subject clusters:
page by offset; skipped ones linger (next month re-examines them). A
partial pass is fine — oldest-first keeps progress monotone.

**Stall guard.** If a fresh cited fetch returns a chain you already
merged this run, your merge did not take — reply exactly `STALLED`
and stop (the mission ends the run there; a human looks). Never
re-merge the same chain twice in one pass.

## Status lines

Same audit-trail contract as dream: `MERGE <new-id> replaces=<k>
"<gist>"` per collapsed chain, `SKIP <id> unrelated` per rejected
marker candidate, and never print a line for a call you didn't make.

## Order of passes

Cited first (provable), then markers (confirm supersession), then
subject digests (v2) — chains should collapse before the digest pass
sees their subjects. The `subject` scan itself excludes rows still in
cited chains for the same reason.
