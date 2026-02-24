---
name: memory
description: Semantic memory, RAG, code search, and prompt enhancement via the Linggen Memory server. Index codebases, search semantically, store and retrieve memories.
user-invocable: true
argument-hint: "[query]"
allowed-tools: [Bash, Read, Write]
---

# Memory Skill

Interact with the Linggen Memory server (`ling-mem`) for semantic code search, memory storage, prompt enhancement, and codebase indexing.

## When To Use This Skill

- Use when the user needs semantic search across indexed codebases
- Use when storing or retrieving architectural decisions, patterns, or context
- Use when indexing a new codebase for the first time
- Use for cross-project code discovery and knowledge retrieval
- Use when the task is ambiguous and could benefit from prompt enhancement with indexed context
- If `.linggen/` exists in the project, treat it as project-specific guidance and review relevant memory files
- If code comments contain `// linggen memory: <file>.md`, read `.linggen/memory/<file>.md` immediately
- If code comments contain `// linggen anchor: <repo/relative/path>`, open that referenced repository file

## Script Location

```bash
MEMORY_SCRIPTS_DIR="$PWD/.claude/skills/memory/scripts"
[ -d "$MEMORY_SCRIPTS_DIR" ] || MEMORY_SCRIPTS_DIR="$PWD/.codex/skills/memory/scripts"
[ -d "$MEMORY_SCRIPTS_DIR" ] || MEMORY_SCRIPTS_DIR="${CODEX_HOME:-$HOME/.codex}/skills/memory/scripts"
[ -d "$MEMORY_SCRIPTS_DIR" ] || MEMORY_SCRIPTS_DIR="$HOME/.claude/skills/memory/scripts"
```

## Core Workflows

### 1. Local Memory And Context

- If present, inspect local guidance with `ls -R .linggen/`.
- Prioritize `.linggen/memory/` for architectural decisions.

### 2. Semantic Memory Search

Search stored memories (architectural decisions, ADRs, patterns) by meaning:

- `bash "$MEMORY_SCRIPTS_DIR/search_memory.sh" "<query>" [limit] [source_id]`

### 3. Memory Storage

Store a memory (architectural decision, pattern, context) with metadata:

- `bash "$MEMORY_SCRIPTS_DIR/store_memory.sh" "<title>" "<content>" [tags]`

### 4. Memory Retrieval

Fetch stored memories by metadata key/value:

- `bash "$MEMORY_SCRIPTS_DIR/fetch_memory.sh" "<key>" "<value>"`

### 5. Code Search

Search across all indexed sources for relevant code chunks:

- `bash "$MEMORY_SCRIPTS_DIR/search_codebase.sh" "<query>" [strategy] [limit] [source_id]`
- Deep metadata search: `bash "$MEMORY_SCRIPTS_DIR/query_codebase.sh" "<query>" [limit] [exclude_source_id]`

### 6. Prompt Enhancement

Use when the task is ambiguous, cross-project, or likely to benefit from indexed context:

- `bash "$MEMORY_SCRIPTS_DIR/enhance_prompt.sh" "<query>" [strategy] [source_id]`

### 7. Codebase Indexing

Index a directory for semantic search:

- `bash "$MEMORY_SCRIPTS_DIR/index_source.sh" "<path>" [mode]`

### 8. Source Management

List all indexed sources:

- `bash "$MEMORY_SCRIPTS_DIR/list_sources.sh"`

### 9. Server Status And Bootstrap

Check if the memory server is running:

- `bash "$MEMORY_SCRIPTS_DIR/server_status.sh"`

Start the server if not running:

- `bash "$MEMORY_SCRIPTS_DIR/start_server.sh"`

## Server Dependency Matrix

Requires Linggen Memory server (`API_URL` / `http://localhost:8787`):

- `search_memory.sh`
- `store_memory.sh`
- `fetch_memory.sh`
- `search_codebase.sh`
- `query_codebase.sh`
- `enhance_prompt.sh`
- `index_source.sh`
- `list_sources.sh`
- `server_status.sh`

Does not require server:

- `start_server.sh` (starts the server; may install `ling-mem` if not found)
- `config.sh` (configuration only)

## Operational Notes

- Scripts use network calls; ensure network permission when required by the environment.
- The memory server runs locally — no data leaves your machine.
- Index sources before searching them.
- Omit `source_id` to search across all indexed projects.
- Start the server with: `ling-mem serve` (standalone) or `ling memory start` (via Linggen Agent).
