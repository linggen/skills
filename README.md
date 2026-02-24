# Linggen Skills

Skills for **Linggen** — a local-first coding assistant with memory, context, and multi-agent capabilities.

Learn more at [linggen.dev](https://linggen.dev).

## Available Skills

| Skill | Description |
|-------|-------------|
| **[linggen](./linggen/)** | Cross-project code search, indexed context, prompt enhancement, and server management. |
| **[memory](./memory/)** | Semantic memory and RAG — index codebases, search semantically, store and retrieve memories. |
| **[skiller](./skiller/)** | Search, install, and manage skills from the marketplace. |
| **[discord](./discord/)** | Social messaging with Discord friends. Send and receive messages via `@@friend_name`. |

## Install

### Via Linggen Agent

Skills are automatically installed when you run `ling init --global`.

### Manual (Claude / Codex)

1. Download this repo (or the specific skill folder you want).

2. Copy the skill into your assistant's skills directory:

- Claude: `~/.claude/skills/`
- Codex: `~/.codex/skills/`

## Usage

- **Linggen**: Use natural-language prompts like "search across projects for auth middleware"
- **Skill Manager**: `/skill find <query>`, `/skill add <name>`, `/skill list`
- **Discord**: Type `@@tom hello!` to message your friend Tom on Discord

## Notes

- Linggen runs locally (default API URL: `http://localhost:8787`).
- If you need to change the API URL, set `LINGGEN_API_URL` in your environment, or in a workspace `.linggen/config` file.
