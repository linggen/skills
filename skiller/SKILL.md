---
name: skiller
description: Search, install, and manage skills from the marketplace. Browse library packs.
user-invocable: true
allowed-tools: [Bash, Read]
argument-hint: "find <query> | add <name> | list | packs | pack <id>"
---

# Skiller — Skill Marketplace Manager

Search, install, and manage skills from the online registry and GitHub.

## When To Use This Skill

- Use when the user wants to find, install, or manage skills
- Use when browsing the skill marketplace or library packs
- Use when the user asks about available skills

## Script Location

```bash
SKILLER_SCRIPTS_DIR="$PWD/.claude/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$PWD/.codex/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="${CODEX_HOME:-$HOME/.codex}/skills/skiller/scripts"
[ -d "$SKILLER_SCRIPTS_DIR" ] || SKILLER_SCRIPTS_DIR="$HOME/.claude/skills/skiller/scripts"
```

## Core Workflows

### 1. Search For Skills

Search for skills in the Linggen registry and GitHub (via skills.sh):

- `bash "$SKILLER_SCRIPTS_DIR/lookup_skills.sh" "<query>"`

Searches the Linggen registry first, falls back to skills.sh if fewer than 10 results. Merges and de-duplicates.

### 2. Install A Skill

Install a skill from the marketplace (with confirmation):

- `bash "$SKILLER_SCRIPTS_DIR/install_skill.sh" "<skill name or keyword>"`

Downloads the skill from GitHub, extracts it to `.claude/skills/<name>/`, and records the install in the registry.

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

- `lookup_skills.sh` (uses online registries; optionally queries local server for library packs)
- `install_skill.sh` (uses GitHub directly)
- `config.sh`

## Operational Notes

- Skills are installed to `.claude/skills/<name>/` in the current project.
- The Linggen registry at `linggen-analytics.liangatbc.workers.dev` is the primary source.
- GitHub skills via `skills.sh` are used as a fallback.
- Install recording requires `LINGGEN_SKILLS_REGISTRY_API_KEY` environment variable.
