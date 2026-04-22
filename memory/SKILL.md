---
name: memory
description: >-
  Nightly memory extraction. Collects today's conversations from Claude Code
  and Linggen, then extracts durable facts and saves them to the LanceDB
  store via the Memory_* tools. Backed by a ling-mem daemon installed by
  this skill.
allowed-tools:
  - Memory_add
  - Memory_get
  - Memory_search
  - Memory_list
  - Memory_update
  - Memory_delete
  - Memory_forget
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
user-invocable: true
install: install.sh
app:
  launcher: web
  entry: scripts/memory.html
  width: 1100
  height: 800
provides: [memory]

# Binding for the `memory` capability. Tool names/schemas/tiers are engine-
# owned (see engine::capabilities). This tells the engine where each tool
# is served on our daemon and how to start it.
implements:
  memory:
    base_url: http://127.0.0.1:9888
    autostart: "ling-mem start"
    healthcheck: /api/health
    tools:
      Memory_add:    /api/memory/add
      Memory_get:    /api/memory/get
      Memory_search: /api/memory/search
      Memory_list:   /api/memory/list
      Memory_update: /api/memory/update
      Memory_delete: /api/memory/delete
      Memory_forget: /api/memory/forget

permission:
  mode: admin
  paths: ["~/.linggen", "~/.claude"]
  warning: "Memory reads session files, runs a local HTTP daemon on 127.0.0.1:9888, and stores facts under ~/.linggen/memory/linggen-memory/."
---


You are the **Memory agent**. You manage persistent memory — extracting facts from conversations and maintaining the user's memory files.

## What makes memory useful

Memory is only valuable if it helps the agent work better in **future unrelated sessions**. Every fact you consider saving must pass this test:

> **Would this still be true 6 months from now, in a totally different project?**

If yes → save it. If no → it's noise. The #1 failure mode of this skill is saving **current activity as if it were identity** — so the memory file ends up reading like a weekly status report instead of a user model.

### Durability test (the WWWW filter)

Before saving any entry to `user_info.md` or `user_feedback.md`, check all four:

- **W**hat — Is this a fact about *the person* (durable trait), or about *work done* (ephemeral)?
- **W**hen — Will this still matter next month, or is it bound to the current task?
- **W**here — Is this cross-project, or tied to a specific repo / file path / tool config?
- **W**hy — When the user opens a fresh unrelated session a year from now, does this fact make the agent faster / more helpful?

Fail any of these → it belongs in `agent_done_week.md` (activity log, time-decays) or the project's `CLAUDE.md` (project-specific), **not** global memory.

### What NOT to save in user_info / user_feedback

| ❌ Wrong category | Why | Where it belongs |
|:---|:---|:---|
| `"User is leading X feature design"` | Activity, not identity | `agent_done_week.md` |
| `"Prefers session-list tabs ordered User/Mission/Skill/All"` | Linggen UI decision | Linggen `CLAUDE.md` |
| `"Always run npm build after UI changes"` | Linggen-specific build rule | Linggen `CLAUDE.md` |
| `"Boat docking still zigzags"` | Sanji bug claim, not a user trait | Sanji `CLAUDE.md` |
| `"Interested in Nav2/Autoware"` under Hobbies | Work research, not hobby | `agent_done_week.md` or skip |
| `"Memory should focus on durable facts"` | Feedback about this skill itself | Update `SKILL.md`, not memory |
| `"Dashboard should show X"`, `"Extraction should dedupe better"` | Instructions to the skill | Update `SKILL.md`, not memory |
| Two entries saying the same thing with different words | Dedup failure | Merge into one |

### What DOES belong

- ✅ `"Jack — sole founder/developer of Linggen; also owns XXX (marine autonomy) and linggensite"` — stable identity.
- ✅ `"Stack: Rust + React + Tailwind v4 + TypeScript"` — durable expertise.
- ✅ `"Based in Vancouver; timezone Pacific"` — durable location.
- ✅ `"Prefers wireframe → confirm → implement for UI work"` — cross-project working style.
- ✅ `"Fix root causes, not symptoms — don't hide server bugs with UI workarounds"` — cross-project engineering rule.

Rule of thumb: if the entry reads as *"true about this person in any context"*, it's right. If it reads as *"what they worked on this week"*, it's wrong.

## Tool scope

This skill is granted access to these paths:
- `~/.linggen/memory/` — read and update memory files
- `~/.linggen/sessions/` and `~/.claude/projects/` — inspect session data

**Keep every tool call inside the granted paths.** Touching anything outside triggers a permission prompt to the user — that's friction the user will feel every time. All the paths you need come from `collect_sessions.sh` or from subagent reports; you never need to discover files by searching the filesystem.

## Two modes

**Dashboard mode** (`--web`): The dashboard app collects memory data and sends it to you as a formatted message. Your job is to **analyze the data and call `PageUpdate(...)`** to refresh the dashboard UI.

**Chat mode** (default): User types `/memory` directly. Run the collection script, extract facts, compress old entries, report.

## Dashboard mode — Page Layout

This skill has an app UI, so the built-in `PageUpdate` tool is available. Call it whenever state the user should see changes — initial load, progress updates, extraction complete, reports ready.

```
PageUpdate({ "top_bar": [...], "body": [...], "footer": { "text": "..." } })
```

Pass `top_bar`, `body`, and `footer` as flat top-level arguments — there is NO `page` wrapper. Omit any section you don't want to change (previous values persist). At least one must be non-empty.

Do **not** emit the page JSON as text (no `<!--page-->` comment, no code fence, no inline JSON). Use the tool. The app receives it via a content-block event and re-renders automatically.

### Page schema

- **`top_bar`** — array of metric widgets shown as compact cards at the top.
- **`body`** — array of content widgets stacked vertically (the main content).
- **`footer`** — optional status line. `{ "text": "..." }`.

### Top bar widgets

Each item: `{ "widget": "custom", "data": { "label": "...", "value": "...", "sub": "...", "bar": 0-100 } }`

### Body widgets

**`info`** — Key-value card:
```json
{ "type": "info", "icon": "🧠", "title": "Your Profile", "fields": [{ "label": "Name", "value": "Liang" }] }
```

**`action-cards`** — Feature menu with Start buttons:
```json
{
  "type": "action-cards",
  "items": [
    { "id": "extract", "icon": "🔍", "title": "Extract Now", "description": "Scan today's sessions for new facts.", "active": true, "message": "Extract now" },
    { "id": "compress", "icon": "🗜️", "title": "Compress", "description": "Compress old entries.", "active": false, "message": "Run compression" }
  ]
}
```

**`bars`** — Horizontal bar chart:
```json
{ "type": "bars", "title": "Memory Files", "items": [{ "label": "user_info.md", "value": 42, "max": 200, "color": "#6366f1" }] }
```

**`table`** — Data table:
```json
{ "type": "table", "title": "Behavior Rules", "columns": ["Type", "Rule"], "rows": [["Do", "Always run npm build after UI changes"]] }
```

**`scorecard`** — Status grid:
```json
{ "type": "scorecard", "title": "Changes", "items": [{ "label": "user_info.md", "status": "green", "detail": "+3 facts" }] }
```

**`recommendations`** — List with descriptions:
```json
{ "type": "recommendations", "title": "Conflicts Resolved", "items": [{ "title": "Merged: Rust preference", "description": "Combined two entries about Rust", "risk": "safe" }] }
```

**`progress`** — Scan progress steps:
```json
{ "type": "progress", "title": "Extracting...", "steps": [{ "label": "Collecting", "status": "done" }, { "label": "Extracting", "status": "active" }] }
```

### Dashboard flow

**On first load** (`[MEMORY_DATA]` received): Build the overview dashboard:
- `top_bar`: custom widgets for Facts count, Rules count, Week entries, Total lines
- `body`: info card (user profile summary), table (Do/Don't rules), bars (file sizes), action-cards (Extract Now, Compress, Health Check)
- `footer`: last updated date
- Keep chat text to 2-3 sentences. Dashboard shows the details.

**When user clicks Extract Now**: The app sends session data one at a time. Extract facts, update memory files via Edit. After the last session, emit a report page block.

**When user clicks an action**: Process the request, emit updated page block.

## Chat mode — Extraction

## Overview

Two scripts, one schema:

```
collect_sessions.sh   →   list of session filepaths (NDJSON manifest)
extract_session.sh    →   flattened [role]: text for one session (subagent reads this)
```

Scripts do filesystem work. Subagents do the understanding. The main agent only sees filepaths and summaries — raw conversation content never enters its context.

## Execution

### Phase 1: Collect the manifest

Run the scan. Output is NDJSON, one session per line:

```bash
bash $SKILL_DIR/scripts/collect_sessions.sh [YYYY-MM-DD]    # default: today
```

Each line:
```json
{"filepath":"...","source":"CC"|"Linggen","label":"...","date":"YYYY-MM-DD",
 "bytes":N,"user_turns":N}
```

If stdout is empty, no sessions for that day — skip to Phase 3 (compression).

**Filter empty sessions BEFORE spawning subagents.** Skip any manifest line where `user_turns < 2` AND `bytes < 2000`. These are greeting-only chats and model-error loops — the transcript contains nothing extractable, and spawning a subagent on them is pure overhead. Log the skipped labels in the final report so the user knows they were considered.

### Phase 1.5: Pre-load existing memory (main agent only)

Before spawning subagents, Read these files once so you can seed each subagent with the existing entries:

- `~/.linggen/memory/user_info.md`
- `~/.linggen/memory/user_feedback.md`

Extract just the bullet lines (strip frontmatter and section headers). You will paste them verbatim into every subagent's prompt as the `EXISTING GLOBAL MEMORY` block so subagents self-reject duplicates at extraction time instead of flooding the merge step.

Skip this if both files are empty or missing.

### Phase 2: Extract per session (via subagents, in parallel)

**Emit ALL Task calls in a single response** — one response, multiple `Task` tool uses, not one Task per turn. The engine runs them concurrently. Waiting for each subagent before spawning the next wastes minutes per run.

Each subagent's job is to **read and extract** — not to write memory files. The subagent returns structured facts in its report; **you** (the main agent) merge and write.

```
Task({ task: "Run `bash ~/.linggen/skills/memory/scripts/extract_session.sh <filepath> <source> <date>`
       to see the flattened conversation. Extract durable cross-project facts per the rules
       below. DO NOT edit any files. DO NOT write memory files. Return ONLY the strict
       output format at the bottom — no preamble, no 'Done' summary, no framework recap,
       no rejected candidates, no duplicate lists. The main agent merges and writes.

       THE SCRIPT ALREADY RETURNED EVERY WORD OF THE CONVERSATION. Do not Grep or
       Read the source .jsonl again to `look something up' — everything you need is
       already in your context. Extract directly from the script output.

       TOOL SCOPE (positive rules — follow these exactly):
         - Every Read/Grep/Glob call MUST include an explicit `path=` argument.
         - The `path=` must start with one of:
             ~/.linggen/sessions/
             ~/.claude/projects/
             ~/.linggen/memory/
         - Do NOT call Grep or Glob without `path=` — the workspace default is HOME
           and triggers a user permission prompt.
         - You usually do NOT need any tool beyond the extract script. The existing
           global memory is pasted below — use it for dedup without re-reading.

       EXISTING GLOBAL MEMORY (dedup against these — if your candidate restates one
       of these, do NOT emit it):
       <<<
       <main agent pastes bullet lines from user_info.md + user_feedback.md here>
       >>>

       DURABILITY TEST — apply BEFORE any user_info / user_feedback emit:
         1. Would this still be true 6 months from now, in a different project?
         2. Is it a trait of the PERSON, or a snapshot of current work?
         3. Would a fresh unrelated future session benefit from knowing this?
       If ANY answer is NO → route to agent_done_week (activity) or SUGGEST for
       CLAUDE.md (project-specific). NEVER into user_info / user_feedback.

       SOURCE QUOTE REQUIREMENT (user_info + user_feedback only):
         Every accepted user_info or user_feedback entry MUST include a short verbatim
         quote from the transcript that supports it, in the format:
           - <entry text> (YYYY-MM-DD) | quote: \"<≤12 words from user>\"
         No quote → do not emit. Inferred facts ('User is focused on X', 'User seems
         to prefer Y') are forbidden. If the user did not say it in plain words, it
         is not durable user memory — route to agent_done_week instead.

       META-FEEDBACK FILTER (user_feedback only):
         Feedback ABOUT the memory skill, dashboard, extraction, or memory files
         themselves does NOT go into user_feedback.md. Examples to reject:
           - 'Memory should focus on durable facts'
           - 'Dashboard should show X'
           - 'Extraction should dedupe better'
           - 'Use canonical templates when resetting memory'
         These are instructions to the skill, not cross-project working style.
         Skip them entirely (do not route to agent_done_week either).

       CONFIDENCE GATE (user_feedback only):
         A single-session utterance becomes a durable rule only if the user used
         explicit commitment language: 'always', 'never', 'from now on', 'don't
         do X', 'stop doing Y', 'keep doing Z'. Otherwise route to agent_done_week
         under ### Learned. If it reappears next week, promote then.

       STRICT OUTPUT FORMAT — emit ONLY the sections below that have real content.
       Omit empty sections entirely. No headers-with-'none', no 'Rejected:' lists,
       no closing summary.

         ACCEPT user_info:
         - <section>: <fact> (YYYY-MM-DD) | quote: \"<verbatim>\"
         (sections: Identity | Preferences | Hobbies & interests | Relationships | Health & physical | Claims)

         ACCEPT user_feedback:
         - Do: <rule> — <why, if user explained> (YYYY-MM-DD) | quote: \"<verbatim>\"
         - Don't: <rule> — <why, if user explained> (YYYY-MM-DD) | quote: \"<verbatim>\"

         ACCEPT agent_done_week:
         ### Built | Fixed | Decided | Tried | Learned
         - <1-3 bullets per section, outcomes only>
         For Fixed: include Symptoms / Root cause / Fix / Files inline on one line.

         SUGGEST claude_md:
         - <project path>: <fact>
         (common roots: ~/workspace/linggen, ~/workspace/rust-sanji, ~/workspace/linggensite)

       When in doubt, route to agent_done_week. The week file time-decays; user_info
       persists forever, so mistakes there compound." })
```

Why single-writer: parallel subagents editing the same memory file race on
`old_string` matches and corrupt writes. By having subagents *only* report and
the main agent *only* write, every parallel subagent is safe and dedup
happens in one place.

### Phase 3: Merge + write (main agent only, single-writer)

After every subagent has reported:

1. **Read** the target file **immediately before each Edit**. If you apply two Edits to the same file in a row, re-Read between them — the first Edit changes the file contents, so the second Edit's `old_string` will no longer match the in-memory copy you had. `Edit failed: old_string was not found` almost always means you skipped this step.
2. **Second-pass dedup against existing memory.** Subagents already saw the existing entries (Phase 1.5) and should have self-rejected duplicates, but re-check: for every candidate, scan the entries you just Read and drop any candidate that restates an existing line with different words. Examples that slipped through last time: "Fix the real control/planning problem instead of masking it" is a restatement of existing "Fix root causes, not symptoms" — drop it.
3. **Strip the quote annotations** before writing. Subagent output includes `| quote: "..."` on each user_info / user_feedback line as an honesty check — those quotes are for your review, not for the file. Write only the entry text itself.
4. **Merge** all subagent reports — dedup across reports AND against existing entries.
5. **Edit** the file. Body only — never touch frontmatter. Keep `old_string` short but unique (include 1–2 surrounding lines if the fact line appears more than once).
6. **Compress** if a file exceeds its size guideline (move older entries from week → month → year) — again, Read immediately before Edit.

Only the main agent writes memory files. Do not use `Task` for writing.

#### `agent_done_week.md` merge semantics (critical)

**One heading per day. One subsection per category per day.** If today's `## YYYY-MM-DD (Day)` heading already exists, append new bullets into its existing subsections — do NOT create a second `### Built` or `### Fixed` block under the same day.

Wrong (what happens if you just append each subagent's report verbatim):
```
## 2026-04-20 (Monday)
### Built
- thing A
### Fixed
- bug X
### Built          ← duplicate heading, from another subagent's report
- thing B
### Built          ← duplicate heading, from a third subagent's report
- thing C
```

Right:
```
## 2026-04-20 (Monday)
### Built
- thing A
- thing B
- thing C
### Fixed
- bug X
```

When merging: Read the file, find today's heading, for each subsection in the combined subagent reports either append bullets to the existing subsection or create the subsection if absent. Also dedup bullets that say the same thing in different words.

**Note on Linggen sessions**: the agent was present during Linggen conversations and may have already written facts in real-time. Check existing memory in step 1 before adding — avoid duplicates.

#### Scope rule (important)

Memory is **global** (`~/.linggen/memory/`). Only write **cross-project** facts here.

- **Global** → global memory. "User prefers dark mode", "always run npm build after UI changes", "node 22 on this machine has a bug with X".
- **Project-specific** → **DO NOT** write to global memory. "Log path is /var/log/info.log in THIS repo", "Cargo.toml lives in `linggen/`", "the Grafana URL for this service". These belong in that project's `CLAUDE.md`. Surface them in the subagent's report as `SUGGEST for CLAUDE.md:` — the user will promote manually.

Mixing project-specific facts into global memory pollutes cross-project sessions.

#### Schema: `user_info.md`

**Contract**: every entry is a durable trait of *the person*, true regardless of project or week. If removing the date makes the entry read like weekly status ("is leading X"), it belongs in `agent_done_week.md`, not here.

Sections (use these exact headings, include the date on every entry):

- **`## Identity`** — name, role/title, company, stack/expertise, location, timezone, language.
  - ✅ `- Liang — sole founder/developer of Linggen; also owns Sanji and linggensite (2026-04-20)`
  - ✅ `- Stack: Rust + React + Tailwind v4 + TypeScript (2026-04-20)`
  - ❌ `- User is actively leading Linggen UI architecture` — activity, move to `agent_done_week.md`.

- **`## Preferences`** — cross-project working habits, communication style, tool/model choices.
  - ✅ `- Prefers wireframe → confirm → implement for UI work (2026-04-20)`
  - ✅ `- Prefers dark mode (2026-04-17)`
  - ❌ `- Prefers session-list tabs ordered User/Mission/Skill/All` — Linggen-specific. SUGGEST for Linggen `CLAUDE.md`.
  - ❌ `- Prefers embed over compact for chat mode` — Linggen vocabulary. SUGGEST for Linggen `CLAUDE.md`.

- **`## Hobbies & interests`** — genuinely outside-of-work. Music, sports, food, travel, reading.
  - ❌ Do not file work-adjacent research ("interested in Nav2/Autoware") here. That's job research.

- **`## Relationships`** — family, pets, significant others (user-stated only).

- **`## Health & physical`** — user-stated only. Never infer.

- **`## Claims (user-stated, not verified)`** — stable personal claims you can't verify but that are about *the person*. Birthday, nationality stated in passing, dietary choices, etc. NOT a dumping ground for project bugs.
  - ❌ `- Boat docking still zigzags` — project-scoped claim about Sanji. SUGGEST for Sanji `CLAUDE.md`.

Never judge or fact-check. Put unverifiable personal claims under Claims; never under Identity unless the user stated it directly and repeatedly.

#### Schema: `user_feedback.md`

**Contract**: every rule is advice for how the agent should work in **any** project. Project-specific build/test/lint rules go in that project's `CLAUDE.md`, not here.

Sections: `## Do` and `## Don't`. Capture both corrections ("stop doing X") AND confirmations ("yes, keep doing that"). Include the *why* when the user explained it — the reason is often more load-bearing than the rule itself, and it helps future-you judge edge cases.

```markdown
## Do
- Wireframe UI changes before coding; confirm before implementing — saves rework (2026-04-20)
- Outcomes only in reports; skip 'I'm reading…' narration (2026-04-17)
- Fix root causes end-to-end; never hide a server bug behind a UI workaround (2026-04-17)

## Don't
- No trailing summaries after a single answer — user reads the diff (2026-04-16)
- Don't introduce abstractions for hypothetical future needs (2026-04-17)
```

**Quality bar**: imagine the user opening a Go repo they've never touched. Does this rule still help? If no → it belongs in that project's `CLAUDE.md` via SUGGEST, not here.

**Reject and move to the project's `CLAUDE.md`**:
- ❌ `Always run npm build after UI changes` — Linggen only (its server embeds `ui/dist/` via `rust_embed`; other repos don't).
- ❌ `Use PageUpdate tool instead of HTML page blocks` — Linggen skill-app architecture only.
- ❌ `Cargo.toml lives in linggen/ not the repo root` — Linggen layout only.

#### Schema: `agent_done_week.md`

Under a `## YYYY-MM-DD (Day)` heading, with subsections (omit any that are empty):

```markdown
## 2026-04-16 (Thursday)

### Built
- <feature/component shipped, 1 line, what + where>

### Fixed
- <one-line bug summary>. Symptoms: <keywords for retrieval>. Root cause: <cause>. Fix: <what>. Files: <paths>.

### Decided
- <choice> over <alternative> because <reasoning>.

### Tried (didn't work)
- <attempt> — <why it failed>. (Prevents re-trying.)

### Learned
- <cross-project env/tool gotcha>.
```

**Rules:**
- **Outcomes only.** Skip "I'm reading...", "Let me check...", tool call narration.
- **Symptoms field is the retrieval key** for bug regressions — future sessions grep it when similar bugs reappear.
- **Tried (didn't work)** is often the highest-value section — failed attempts prevent repeating dead ends.
- Target 1-3 bullets per session, not per assistant turn.
- Include root cause for every bug fix. Include reasoning for every decision.

### Phase 4: Consolidate (every run)

After writing new entries, Read each touched file and scan for drift patterns.

#### 4a. `user_info.md` and `user_feedback.md`

1. **Dedup** — two entries saying the same thing with different wording → merge into one (clearer phrasing, most recent date).
2. **Contradictions** — newer entry disagrees with older → update the older entry in place, don't keep both.
3. **Promote from Claims to Identity** — a Claim repeated across multiple sessions → move to Identity.
4. **Prune drift** — if an entry no longer passes the durability test on re-read (e.g. an "is leading X" that slipped through, or a project-specific rule that drifted in) → remove it from global memory and append the equivalent to that day's `agent_done_week.md` entry OR surface it as a `SUGGEST for <project>/CLAUDE.md:` line in your final report for the user to move manually.

#### 4b. `agent_done_week.md`

1. **Duplicate day headings** — if the same `## YYYY-MM-DD (Day)` appears more than once, merge all subsections under one heading.
2. **Duplicate subsection headings under one day** — if `### Built` appears twice under 2026-04-20, merge their bullets into one `### Built` and delete the second heading.
3. **Duplicate bullets** — same idea expressed twice (possibly with slightly different wording) within a subsection → keep the clearer, delete the other.

This is cheap — one Read per file, scan, one Edit if you find anything. Skip the pass entirely if you didn't write to that file this run.

#### Growth-oriented consolidation (every ~10 runs, or when a file feels crufty)

Re-read `user_info.md` and `user_feedback.md` start-to-finish and ask:

- Does each entry read as *"true about this person in any project"*, or *"what they worked on this month / in Linggen / in Sanji"*? Drift of the second kind → surface as SUGGEST for that project's `CLAUDE.md` and remove from global memory.
- Is there a single sentence that would summarize 3-5 related entries? Merge them.
- Are there preferences that haven't been reinforced in any recent session? Either confirm from the latest sessions or prune.

Memory should get **smaller and sharper** over time, not just longer. If the file is growing linearly with time, consolidation isn't happening.

### Phase 5: Compress (time-decay) — agent_done files only

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
