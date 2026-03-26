---
name: skiller
description: Search, install, and manage skills from the marketplace (skills.sh + ClawHub). Browse library packs.
user-invocable: true
allowed-tools: [Bash, Read]
argument-hint: "find <query> | add <name> | list | packs | pack <id>"
---

# Skiller — Skill Marketplace Manager

Search, install, and manage skills from GitHub via skills.sh and ClawHub.

## When To Use This Skill

- Use when the user wants to find, install, or manage skills
- Use when browsing the skill marketplace or library packs
- Use when the user asks about available skills

## Script Location

```bash
SKILLER_SCRIPTS_DIR="$PWD/.linggen/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$HOME/.linggen/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$PWD/.claude/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$PWD/.codex/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="${CODEX_HOME:-$HOME/.codex}/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$HOME/.claude/skills/skiller/scripts"
```

## Core Workflows

### 1. Search For Skills

Search for skills on GitHub (via skills.sh) and ClawHub:

- `bash "$SKILLER_SCRIPTS_DIR/lookup_skills.sh" "<query>"`

### 2. Install A Skill

Install a skill from the marketplace (with confirmation):

- `bash "$SKILLER_SCRIPTS_DIR/install_skill.sh" "<skill name or keyword>"`

Downloads the skill from GitHub, extracts it to `.linggen/skills/<name>/` (project) or `~/.linggen/skills/<name>/` (global).

### 3. Browse Library Packs

List all library packs available on the memory server:

- `bash "$SKILLER_SCRIPTS_DIR/list_library_packs.sh"`

### 4. Read A Library Pack

Get the content of a specific library pack:

- `bash "$SKILLER_SCRIPTS_DIR/get_library_pack.sh" "<pack_id>"`

## Server Dependency Matrix

Requires Linggen Memory server:

- `list_library_packs.sh`
- `get_library_pack.sh`

Does not require server:

- `lookup_skills.sh` (uses skills.sh)
- `install_skill.sh` (uses GitHub directly)
- `config.sh`

## Operational Notes

- Skills are installed to `.linggen/skills/<name>/` (project) or `~/.linggen/skills/<name>/` (global).
- GitHub skills are discovered via `skills.sh`.
- Community skills also search ClawHub (clawhub.ai).
- ClawHub skills include security scan data (VirusTotal + LLM analysis).
- Set `LINGGEN_SKILL_SOURCE=clawhub` to install directly from ClawHub.
