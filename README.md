# Linggen Skills

Skills for **[Linggen](https://linggen.dev)** — your personal AI assistant. Ready in seconds, runs locally, works with any model.

## Available Skills

| Skill | Description |
|-------|-------------|
| **[skiller](./skiller/)** | Search, install, and manage skills from the marketplace. |
| **[sys-doctor](./sys-doctor/)** | System health analyst. Scans disk, apps, caches, and system info. |
| **[mission](./mission/)** | Autonomous mission mode. Runs scheduled tasks without human interaction. |
| **[discord](./discord/)** | Social messaging with Discord friends. Send and receive messages via `@@friend_name`. |
| **[linggen-guide](./linggen-guide/)** | Built-in documentation and usage guide for Linggen itself. |
| **[arcade-game](./arcade-game/)** | Retro arcade games — Snake, Pong, and Tetris in your browser. |
| **[game-table](./game-table/)** | Play board games against AI — Chinese Chess, Gomoku, and more. |
| **[xbot](./xbot/)** | X (Twitter) assistant — post, search, reply, monitor mentions, and track engagement. |

## Install

### Via Linggen Agent

Skills are automatically installed when you run `ling init --global`.

### Manual (Claude Code / Codex)

1. Download this repo (or the specific skill folder you want).

2. Copy the skill into your assistant's skills directory:

- Claude Code: `~/.claude/skills/`
- Codex: `~/.codex/skills/`

## Usage

- **Skill Manager**: `/skill find <query>`, `/skill add <name>`, `/skill list`
- **Sys Doctor**: `/sys-doctor` or `/sys-doctor --web` for interactive dashboard
- **Discord**: Type `@@tom hello!` to message your friend Tom on Discord
- **Linggen Guide**: `/linggen-guide` to ask questions about Linggen
- **X Bot**: `/xbot status`, `/xbot search AI agents`, `/xbot post <text>`, `/xbot reply <url>`

## Notes

- Linggen runs locally (default API URL: `http://localhost:8787`).
- To change the API URL, set `LINGGEN_API_URL` in your environment or in a workspace `.linggen/config` file.
