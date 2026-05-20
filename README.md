# Linggen Skills

Skills for **[Linggen](https://linggen.dev)** — your personal AI assistant. Ready in seconds, runs locally, works with any model.

## Available Skills

| Skill | Description |
|-------|-------------|
| **[skiller](./skiller/)** | Search, install, and manage skills from the marketplace (skills.sh + ClawHub). Browse library packs. |
| **[shared-memory](./shared-memory/)** | One memory shared across your AI tools. LanceDB RAG store via the `ling-mem` binary. Works in Linggen via typed `Memory_*` tools and in Claude Code / Codex / OpenClaw via the `ling-mem` CLI. |
| **[sys-doctor](./sys-doctor/)** | System health analyst. Scans disk, apps, caches, and system info. `--web` opens an interactive dashboard. |
| **[linggen-guide](./linggen-guide/)** | Built-in documentation for Linggen — architecture, features, CLI, skills, tools, agents, and configuration. |
| **[arcade-game](./arcade-game/)** | Retro arcade games — Snake, Pong, and Tetris in your browser. |
| **[game-table](./game-table/)** | Play board games against AI — Chinese Chess, Gomoku, and more. |
| **[xbot](./xbot/)** | X (Twitter) assistant — post, search, reply, monitor mentions, and track engagement. Uses your own developer app credentials. |

## Install

### Via Linggen Agent

Skills are automatically installed when you run `ling init --global`.

### Manual (Claude Code / Codex)

1. Download this repo (or the specific skill folder you want).

2. Copy the skill into your assistant's skills directory:

- Claude Code: `~/.claude/skills/`
- Codex: `~/.codex/skills/`

## Usage

- **Skiller**: `/skiller find <query>`, `/skiller add <name>`, `/skiller list`
- **Shared Memory**: `/shared-memory` — or call `Memory_query` / `Memory_write` directly in Linggen; `ling-mem add|search|list` from any shell
- **Sys Doctor**: `/sys-doctor` or `/sys-doctor --web` for the interactive dashboard
- **Linggen Guide**: `/linggen-guide` to ask questions about Linggen
- **Arcade**: `/arcade-game` — pick Snake, Pong, or Tetris
- **Game Table**: `/game-table` — Chinese Chess, Gomoku, and more vs. AI
- **X Bot**: `/xbot status`, `/xbot search AI agents`, `/xbot post <text>`, `/xbot reply <url>`

## Notes

- Linggen runs locally (default API URL: `http://localhost:9898`).
- To change the API URL, set `LINGGEN_API_URL` in your environment or in a workspace `.linggen/config` file.
