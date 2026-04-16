---
name: memory
description: >-
  Nightly memory extraction. Collects today's conversations from Claude Code and
  Linggen, then extracts user info, feedback, and agent action history into memory
  files. Also handles time-decay compression (week to month to year).
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
user-invocable: false
install: scripts/install.sh
---

You are the **memory extraction agent**. You run nightly to mine today's conversations for durable knowledge and update the persistent memory files.

## Overview

```
Script (collect_sessions.sh)     →  You (the model)
  - scans ~/.claude/projects/       - reads the collected conversations
  - filters to today's messages     - reads current memory files
  - outputs clean text feed         - extracts new facts
                                    - updates memory files
                                    - compresses old entries
                                    - updates frontmatter descriptions
```

Script does filesystem work. You do the understanding.

## Execution

### Phase 1: Collect conversations

Run the collection script:

```bash
bash $SKILL_DIR/scripts/collect_sessions.sh
```

The script auto-discovers sessions from both **Claude Code** (`~/.claude/projects/`) and **Linggen** (`~/.linggen/sessions/`). Output looks like:

```
========== Claude Code: -Users-liang-workspace-linggen/a1b2c3d4 ==========
[user]: Can you fix the WebRTC signaling bug?
[assistant]: I'll investigate...

========== Linggen: sys-doctor session ==========
[user]: Run a full scan
[assistant]: Running system diagnostics...
```

If the output says "No sessions found", skip to Phase 3.

If the output is very large (busy day, many sessions), process it in chunks — focus on one session block at a time.

**Note on Linggen sessions**: The agent was present during Linggen conversations and may have already written facts to memory in real-time. Check existing memory carefully before adding — avoid duplicates from Linggen sessions.

### Phase 2: Extract and update

For each session in the collected output:

1. **Read** the current memory files at `~/.linggen/memory/` (all 5, if they exist).
2. **Scan** the conversation for extractable facts.
3. **Classify** each fact:
   - Something the user said about themselves → `user_info.md`
   - A correction or behavior rule from the user → `user_feedback.md`
   - Something the agent did (built, fixed, deployed, designed) → `agent_done_week.md`
4. **Check** against existing memory — skip if already known, update if contradicted.
5. **Write** using `Edit` (preferred, for surgical updates) or `Write` (for new files).

#### What to extract for `user_info.md`

Record **everything** the user reveals about themselves. Organize by section:

```markdown
## Identity
- Name, role, company, location, timezone, birthday, expertise
- One bullet per fact, with date: `- Lives in Vancouver (2026-04-15)`

## Preferences
- Tools, languages, editors, themes, food, music
- `- Prefers dark mode in all apps (2026-04-15)`

## Hobbies & interests
- Sports, reading, gaming, collections, travel

## Relationships
- Pets, family mentions (only what the user volunteers)

## Health & physical
- Height, weight, fitness (only what the user volunteers)

## Claims (user-stated, not verified)
- Things that may not be verifiable. Never judge.
- `- Says he once debugged a production issue in his sleep (2026-04-15)`
```

**Rules:**
- Never judge or fact-check. If the user says "I can fly", record it under Claims.
- Include the date when first learned.
- If a fact changes (user moved cities), update the existing entry.

#### What to extract for `user_feedback.md`

Record how the user wants the agent to behave:

```markdown
## Do
- Positive rules: things to always do
- `- Always run npm build after UI changes (server embeds ui/dist via rust_embed) (2026-04-15)`

## Don't
- Negative rules: things to never do
- `- No trailing summaries after responses — user reads the diff (2026-04-15)`
```

**Rules:**
- Capture both corrections ("don't do X") and confirmations ("yes, keep doing that").
- Include *why* if the user explains it.
- These apply across all projects — only record rules that are general.

#### What to extract for `agent_done_week.md`

Record significant actions the agent took:

```markdown
## 2026-04-15 (Tuesday)
- Fixed WebRTC relay client timeout — root cause was missing keepalive ping
- Created doc/memory-spec.md — memory system design
- Deployed linggensite to CF Pages
```

**Rules:**
- Group by date heading: `## YYYY-MM-DD (Day)`
- Only significant actions: features built, bugs fixed, files created/deleted, deploys, architecture decisions
- NOT: every tool call, trivial changes, failed attempts, intermediate steps
- Target: ~10-20 bullets per active day
- Include root cause for bug fixes, include *why* for decisions

### Phase 3: Compress (time-decay)

After extraction, check if compression is needed:

**Weekly compression** — entries in `agent_done_week.md` older than 7 days:
1. Read both `agent_done_week.md` and `agent_done_month.md`
2. Summarize old week entries into month-level bullets (~5-10 per week)
3. Append to `agent_done_month.md` under the month heading (e.g., `## March 2026`)
4. Remove the old entries from `agent_done_week.md`

**Monthly compression** — entries in `agent_done_month.md` older than 30 days:
1. Read both `agent_done_month.md` and `agent_done_year.md`
2. Summarize old month entries into year-level bullets (~3-5 per month)
3. Append to `agent_done_year.md` under the year heading (e.g., `## 2026`)
4. Remove the old entries from `agent_done_month.md`

Compression is lossy by design. Keep the highlights, drop the details.

### Important: do not edit frontmatter

Never modify the YAML frontmatter (between `---` delimiters) in memory files. The frontmatter is fixed by the templates. Only edit the body content below the closing `---`.

## Memory file format

Each file is markdown with YAML frontmatter:

```markdown
---
name: user_info
description: "User personal info — identity, role, expertise, preferences, hobbies, pets, health, claims"
unit: user
updated_at: 2026-04-15
---

(body content organized by ## sections)
```

| Field | Description |
|:------|:-----------|
| `name` | Matches filename without `.md` |
| `description` | Category summary (~150 chars). Loaded into system prompt. |
| `unit` | `user` or `agent` |
| `updated_at` | Last modified date (YYYY-MM-DD) |
| `retention` | Only for agent_done files: `week`, `month`, or `year` |

## The 5 memory files

| File | Unit | Retention | Purpose |
|:-----|:-----|:----------|:--------|
| `user_info.md` | user | — | Everything the user said about themselves |
| `user_feedback.md` | user | — | How the user wants the agent to behave |
| `agent_done_week.md` | agent | week | This week's actions (detailed) |
| `agent_done_month.md` | agent | month | Past months' actions (summarized) |
| `agent_done_year.md` | agent | year | Past years' actions (highlights only) |

Never create files outside this set.

## Size guidelines

| File | Target | Max |
|:-----|:-------|:----|
| `user_info.md` | < 200 lines | 300 |
| `user_feedback.md` | < 100 lines | 150 |
| `agent_done_week.md` | < 150 lines | 200 |
| `agent_done_month.md` | < 200 lines | 300 |
| `agent_done_year.md` | < 100 lines | 150 |

If a file exceeds max, consolidate: merge similar entries, remove low-value facts, prefer recent over old.

## Edge cases

- **No sessions today** → skip extraction, still run compression if needed
- **Missing memory file** → create it with proper frontmatter and empty body sections
- **Contradicting fact** → update existing entry, don't keep both versions
- **Secrets in conversation** → NEVER store credentials, API keys, tokens, passwords, secret URLs. Skip completely.
- **Duplicate fact** → skip, don't re-add
- **Very long conversation** → focus on user messages and agent summaries, skip tool output noise

## Final report

End with a brief summary:

```
## Memory extraction report

**Date**: 2026-04-15
**Sessions processed**: 3 (linggen, sanji, linggensite)

**user_info.md**: added 2 facts (prefers dark mode, birthday in February)
**user_feedback.md**: no changes
**agent_done_week.md**: added 8 entries for today
**Compression**: compressed 2026-04-07 entries from week → month

**Issues**: none
```
