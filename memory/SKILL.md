---
name: memory
description: >-
  Semantic memory store. Remembers facts about the user and their work across
  every session, backed by LanceDB with MiniLM-L6-v2 embeddings. Handles
  add, search, list, update, delete, forget, collect, extract via the
  ling-mem binary bundled with this skill.
provides: [memory]
install: install.sh
permission:
  mode: admin
  paths: ["~/.linggen", "~/.claude/projects"]
  warning: >-
    The memory skill stores facts at $LINGGEN_DATA_DIR/memory/facts.lancedb/
    and may read Claude Code + Linggen session transcripts during extraction.
---

# Memory

This skill provides Linggen's `Memory.*` tool family. Linggen core dispatches those tool calls to the `ling-mem` binary shipped in this skill's `bin/` directory.

Think of memory as **what helps you work better later**. Not a conversation log. A curated store of durable facts, preferences, and lessons — each one anchored to a context, each one retrievable by meaning, not just keyword.

## When to use `Memory.*`

- **`Memory.add`** when the user says something durable about themselves, or when you complete a specific piece of work worth recording (a fix, a decision, a lesson). See "What kind of fact" below — be picky.
- **`Memory.search`** at the start of a task when the user's request echoes past work — "how did we fix X before?", "what did I decide about Y?". Relevance is semantic, not literal; phrase the query naturally.
- **`Memory.list`** when the user asks to browse or audit ("show me all my preferences", "what did I do last week in sanji?"). Use metadata filters (`--type`, `--context`, `--since`), not semantic relevance.
- **`Memory.update`** / **`Memory.delete`** when the user corrects or retracts a fact.
- **`Memory.forget`** only on explicit user request and only with a specific filter ("forget everything about the Japan trip"). Never bulk-delete without a scoped filter.

## What kind of fact is worth saving

Seven canonical types. Each has a clear reason to resurface later:

| Type | For | Retrieval trigger |
|:--|:--|:--|
| `fact` | Stable truths about the user / their world | Any session touching that domain |
| `preference` | Cross-project behavioral rules for the agent | Any task where the rule applies |
| `decision` | A choice + its reasoning | A similar decision arises |
| `tried` | An attempt (pair with `outcome`) | About to try something similar |
| `fixed` | A bug + symptoms + fix | A future bug with overlapping symptoms |
| `learned` | Cross-project env / tool gotcha | Same tool / environment again |
| `built` | A specific thing shipped | Asked "what's shipped for X?" |

**Do NOT save:**
- Weekly status updates or activity logs.
- Current in-progress state.
- Conversation micro-details.
- Anything that reads like "today the user said X" — that's a session, not memory.

## Contexts and tags

- `contexts: [...]` — hierarchical path-like scope tags (`code/linggen`, `music/piano`, `trip-japan-2026`). A fact can span multiple. Primary filter dimension.
- `tags: [...]` — free-form metadata with prefix convention (`intent:learn`, `topic:networking`, `person:maria`). Everything else.

A fact usually has 1-3 contexts and 0-5 tags.

## Interaction patterns

- **The user hands you a durable preference** → `Memory.add {content, type: "preference", from: "user"}`.
- **You fixed a bug with a memorable symptom** → `Memory.add {content, type: "fixed", outcome: "positive", contexts: [<project>]}`. Include the symptom keywords in `content` — they're the future retrieval key.
- **Before a non-trivial task in a known context** → `Memory.search {query: "<user intent>", contexts: [<that-context>]}`.
- **User says "remember that I …"** → `Memory.add` with an explicit type, don't let it default.

## Where facts live

- Store: `$LINGGEN_DATA_DIR/memory/facts.lancedb/` (Linggen sets the env var).
- Core universals (identity, working style) live in `~/.linggen/core/identity.md` + `style.md` — not here. Those are plain markdown; edit them with the `Edit` tool when the user expresses a durable identity fact.

## Binary

The `ling-mem` CLI that backs `Memory.*` is downloaded to `$SKILL_DIR/bin/ling-mem` by `install.sh`. You never invoke it directly — Linggen's `Memory.*` dispatch shells out to it with `LINGGEN_DATA_DIR` already set.

If you're running in Claude Code (or any tool without `Memory.*` dispatch), you can invoke the binary via Bash directly — every subcommand accepts `--format=json` (default NDJSON) or `--format=text`, and all errors go to stderr as JSON with a `code` field.

Source + spec: https://github.com/linggen/linggen-memory
