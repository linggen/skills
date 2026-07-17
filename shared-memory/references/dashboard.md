# Dashboard mode — JS-driven now

The memory skill's web page (`scripts/memory.html`) renders its
dashboard from JS **without an agent round-trip**. On open,
`memory-app.js` does in parallel:

1. `POST /api/memory/count` three times (`tier=core`, `tier=semantic`,
   `episodic=true`) against the local `ling-mem` daemon (proxied
   through `/api/bash` curl).
2. `POST /api/memory/days` for the per-day dream-state rollup — the
   daemon's `.days.json` sidecar is the single source of truth (the
   old `.dream-state.json` / `.dream-history.jsonl` files are
   retired; never read or write them).

It then paints the page deterministically:

- **`top_bar`** — three tier cards (`CORE` / `SEMANTIC` / `EPISODIC`)
  with row counts and `latest Xh ago` subtitles. Episodic card flips
  amber when `count > 50` (staging filling up).
- **`body`** — one `greeting` widget (title + primary CTA rule-picked
  by `pickGreeting()` from current state — *"Welcome — your memory's
  empty"*, pending-days nudge, *"All caught up — last dream Xh ago"*;
  no LLM) plus the **`dream-calendar`** widget, a per-day rendering
  of the `days` rollup (pending / staging / remembered / forgotten).
- **`footer`** — *"last dream Xh ago · N rows"*.

The skill **does not** ask the agent to render the dashboard. The
agent runs in chat-mode for the whole session.

## When the agent IS involved

Dream has two entry points, both landing as plain chat messages via
`_chatSend`:

| Control | Chat message sent | Agent action |
|:---|:---|:---|
| `🧠 Run dream` header button | `/shared-memory dream` | Follow `dream-flow.md`: `days` worklist → remember the oldest pending day(s) → `remember_day` stamp → one `sweep` at the end. |
| Calendar day-click (popover confirm) | `/shared-memory dream <YYYY-MM-DD>` | Same flow scoped to that day; a gap day (no episodic rows) is a harvest — scan + encode first. |
| `Browse ↗` | (link, not a message) | Opens `http://127.0.0.1:9528` in a new tab. |

`/shared-memory dream` typed in chat is the slash-command form of the
button — all routes converge on `dream-flow.md`.

## After a dream run — no report PageUpdate

The page watches the tool stream (`Memory_write` / `Bash` blocks) and
re-fetches the `days` rollup itself, repainting the calendar and
footer in place. The agent must **not** emit a `PageUpdate`:

- **Do NOT emit `top_bar`.** JS owns it and re-fetches counts itself
  (`refreshTierCounts`); an agent-emitted snapshot would overwrite
  the live numbers with a mid-run view of the world.
- End the run with the one-line totals from `dream-flow.md` as a
  plain chat reply — that's the whole report.

## Row-level UI actions

When the user clicks ✎ / × on a fact-list row, the dashboard sends
the agent a plain chat message — direct user action, no dedup
search:

| Incoming message pattern | Action |
|:---|:---|
| `Delete the <type> fact with id="<id>" and re-render the dashboard. The fact says: "<content>"` | `ling-mem delete <id> --yes`. Then re-emit the report (or omit if the dashboard's JS already removed the row visually). |
| `Update the <type> fact id="<id>" to content: "<new>". Re-render the dashboard.` | `ling-mem edit <id> --content "<new>"`. |

Don't second-guess: apply the single write and move on.

## Session resume — disk-backed cache

Per-session page state lives at
`~/.linggen/skills/shared-memory/data/<sid>/page.json`. When the user
clicks a past session in the sidebar:

1. The page reloads with `?session=<sid>`.
2. `memory-app.js` reads the cached page from disk via `/api/bash`
   `cat ...`.
3. If found and non-empty, `restorePage()` paints it — **no
   boot prompt fires.**
4. Tier counts refresh in the background so the user sees current
   numbers even on resume.

Pulse pattern — survives across browsers, private windows, and
WebRTC remote-access clients.

## What used to be here

This file used to spec a five-state dashboard flow (Open / Waiting /
Scanning / Report) with verbose A+B+C agent rendering instructions
and 7× parallel `Memory_query({verb:"list", type:T})` calls. That
whole flow was retired in the rebuild — JS does the on-open render,
and dream produces the post-action report. If you find references
to the old states elsewhere, treat this file as the source of truth.
