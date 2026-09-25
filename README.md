# Linggen Skills

Skills for **[Linggen](https://linggen.dev)** — your personal AI assistant. Ready in seconds, runs locally, works with any model.

## Available Skills

| Skill | Description |
|-------|-------------|
| **[cfo](./cfo/)** | Personal CFO — a private, on-device finance analyst. Import bank/credit CSV or PDF exports for spend reports and insights. |
| **[dj](./dj/)** | Disc Jockey — describe a vibe and DJ curates the tracklist, downloads it into a tagged library, and pushes it to your phone. |
| **[pulse](./pulse/)** | GTM brain for solo founders — gathers signal from X/HN/Reddit/Bluesky, monitors mentions, drafts posts. |
| **[shared-memory](./shared-memory/)** | One memory shared across your AI tools. LanceDB RAG store via the `ling-mem` binary. Works in Linggen via typed `Memory_*` tools and in Claude Code / Codex / OpenClaw via the `ling-mem` CLI. |
| **[apple-shifu](./apple-shifu/)** | System health analyst. Scans disk, apps, caches, and system info. `--web` opens an interactive dashboard. |

## Install

### Via Linggen Agent

Skills are automatically installed when you run `ling init --global`.

### Manual (Claude Code / Codex)

1. Download this repo (or the specific skill folder you want).

2. Copy the skill into your assistant's skills directory:

- Claude Code: `~/.claude/skills/`
- Codex: `~/.codex/skills/`

## Usage

- **Shared Memory**: `/shared-memory` — or call the `memory_*` tools directly on any MCP host; `ling-mem add|search|list` from any shell
- **Apple Shifu**: `/apple-shifu` or `/apple-shifu --web` for the interactive dashboard

## Notes

- Linggen runs locally (default API URL: `http://localhost:9527`).
- To change the API URL, set `LINGGEN_API_URL` in your environment or in a workspace `.linggen/config` file.
