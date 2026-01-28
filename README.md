# Linggen Skills

Use Linggen skills to bootstrap and operate **Linggen** (a local “memory DB” + context server) from your coding assistant.

Learn more at [linggen.dev](https://linggen.dev).

## Install (Claude / Codex)

1. Download this repo (or the specific skill folder you want).

2. Copy the skill into your assistant’s skills directory:

- Claude: `~/.claude/skills/`
- Codex: `~/.codex/skills/`

> If you’ve been using `~/.cluade/skills/`, that’s likely a typo—Claude’s default folder is `~/.claude/skills/`.

## Use it (prompts)

In your assistant, use natural-language prompts like:

- **Start Linggen (local server / memory DB):** “start linggen by skills”
- **Install a skill:** “install pdf skill by linggen skills”

## Notes

- Linggen runs locally (default API URL: `http://localhost:8787`).
- If you need to change the API URL, set `LINGGEN_API_URL` in your environment, or in a workspace `.linggen/config` file.
