# Claude Code Instructions

This is the Linggen skills repository — the standalone source of truth for the skills that ship with [Linggen](https://linggen.dev). Most are app skills (SKILL.md + a web UI under `scripts/` served at `/apps/<name>/`).

## Skills

- **`cfo/`** — Personal CFO. Imports bank/credit CSV/PDF exports, builds spend reports, learns categorization rules.
- **`dj/`** — Disc Jockey. Vibe → AI-curated tracklist → download → tagged library → push to phone via VLC.
- **`game-table/`** — Board games against AI (Chinese Chess, Gomoku) plus Snake, Pong, Tetris.
- **`linggen-guide/`** — Built-in Linggen documentation: architecture, features, CLI, skills, tools, agents, config.
- **`pulse/`** — GTM brain for solo founders: gathers signal (X/HN/Reddit/Bluesky), monitors mentions, drafts posts.
- **`shared-memory/`** — Cross-host durable memory on the `ling-mem` daemon. Canonical SKILL.md lives here; host installs are stubs.
- **`skiller/`** — Skill marketplace: search, install, browse library packs (skills.sh + ClawHub).
- **`sys-doctor/`** — System health analyst: disk, apps, caches, system info, interactive dashboard.
- **`xbot/`** — X (Twitter) assistant: post, search, reply, mentions, engagement. User-provided API credentials.

## Edit workflow — three synced surfaces

Edit HERE first, then copy changed files to the other two surfaces (keep all three byte-identical):

1. `skills/<name>/…` — this repo (standalone source of truth)
2. `~/.linggen/skills/<name>/…` — what the running daemon serves (page changes: reload the app iframe; SKILL.md changes: `POST /api/skills/reload` with `Content-Type: application/json` body `{}`, then a NEW chat to bind)
3. `linggen/linggen-app/vendor/skills` — git submodule of this repo. After pushing here: `git pull origin main` inside the submodule, then commit the pointer bump in linggen-app.

Never edit `~/.linggen` or `vendor/skills` directly.

## Conventions

- Syntax-check JS with `node --check` before syncing; there is no build step — files are served as-is.
- Skill JS runs in a sandboxed iframe: no `window.confirm/prompt` (silent no-ops in the app shell) — use the shared dialog helpers.
- Files written via `/api/bash` must end with a trailing newline (sentinel-strip gotcha).
- Chat panels mount through each skill's `chat-bridge.js` (`LinggenUI.mount`); app pages get `?app_mode=1`, and `&in_launcher=1` when hosted inside the unified launcher.
- Don't trust the model for mechanical invariants (ids, schema fields) — derive them page-side at ingest.
