# Game Table — Design Document

## Overview

`game-table` is a skill that lets users play turn-based strategy and card games against the LLM. Starting with **Chinese Chess (Xiangqi)**, expandable to Chess, Go, Poker, etc.

The AI is a **conversational game partner** — it plays moves AND teaches strategy, explains reasoning, answers questions, and banters during the game. It's like sitting across the table from a friend who happens to be really good at chess.

---

## Architecture: Ling as Jarvis

### One Agent, Infinite Roles

Ling is Jarvis — one general-purpose agent that adapts to any context. We do NOT create separate agents per skill. Instead, **skills shape ling's behavior** through:

1. **Skill body** → injected into system prompt as active skill instructions
2. **Skill `allowed-tools`** → narrows ling's `tools: ["*"]`
3. **Dynamic prompt composition** → engine only includes instructions for capabilities the agent actually has

### Session-Bound Skills

Skills have two activation modes:

| Mode | Trigger | Scope | When tools restore |
|------|---------|-------|--------------------|
| **Transient** | User types `/translate hello` | Single invocation | Immediately after skill completes |
| **Session-bound** | Session created with `skill: "game-table"` | Entire session lifetime | When user switches to a different session |

App skills are naturally session-bound. When the game iframe creates a session, it binds the skill. **Every message** in that session activates the skill — tool restrictions, skill body injection, everything.

```
┌─────────────────────────────────────────────────┐
│ Ling (agent)            tools: ["*"]   (always) │
│                                                 │
│ ┌─── Session A: coding ──────────────────────┐  │
│ │ bound skill: (none)                        │  │
│ │ effective tools: ["*"]                     │  │
│ │ system prompt: ling + tools + memory       │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ ┌─── Session B: xiangqi game ────────────────┐  │
│ │ bound skill: game-table                    │  │
│ │ effective tools: []                        │  │
│ │ system prompt: ling + game-table skill     │  │
│ │ (no tool schemas, no tool guidelines)      │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ ┌─── Session C: code review ─────────────────┐  │
│ │ bound skill: code-reviewer                 │  │
│ │ effective tools: [Read, Glob, Grep]        │  │
│ │ system prompt: ling + reviewer skill +     │  │
│ │                 read-only tool schemas      │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

No "recovery" mechanism needed. Sessions are isolated. Ling is always ling — the session shapes the context.

### System Prompt Composition

The system prompt is assembled dynamically from layers. What's included depends on available tools:

```
When game-table session:             When normal coding session:

1. personality  (from frontmatter)   1. personality  (from frontmatter)
2. agent body   (from ling.md)       2. agent body   (from ling.md)
3. skill frame  (game-table body)    3. environment block
4. environment block                 4. project instructions (CLAUDE.md)
                                     5. auto memory
                                     6. tool schemas + usage guidelines
                                     7. delegation targets
                                     8. plan mode instructions
```

**Key rule: if no tools, skip all tool-related prompt sections.** This saves ~1500 tokens and prevents the model from being confused by instructions about tools it can't use.

### Reusable Pattern for Any Skill

| Skill | `allowed-tools` | Ling becomes... |
|-------|-----------------|-----------------|
| `game-table` | `[]` | Game partner + teacher |
| `email-manager` | `[Bash, Read]` | Email triage assistant |
| `study-buddy` | `[]` | Patient tutor |
| `system-monitor` | `[Bash, Read, Glob]` | Sysadmin assistant |
| `code-reviewer` | `[Read, Glob, Grep]` | Code reviewer |

No new agents. No new endpoints. No code changes per skill.

---

## Ling Agent Definition

### Simplified Frontmatter

Agent frontmatter keeps only what's intrinsic to the agent. Everything else is runtime.

```yaml
---
name: ling
description: Versatile personal AI assistant. Helps with coding, games, teaching, research, planning, and anything else.
tools: ["*"]
personality: |
  Concise and direct — lead with the answer, not the reasoning.
  Confident but honest — don't hedge when you know, admit when you don't.
  Adaptive — match the user's energy and the task's demands.
  Action-oriented — when the path is clear, act without asking.
  Format with Markdown — headings, bullets, code blocks. Never a wall of text.
  Keep reasoning internal — never output chain-of-thought.
---
```

**Removed from frontmatter** (now runtime/session-level):

| Field | Where it goes |
|-------|---------------|
| `model` | User picks per session (model picker) |
| `work_globs` | Workspace-level config |
| `policy` | Skill or session-level config |
| `idle_prompt` | Mission config |
| `idle_interval_secs` | Mission config |

### Frontmatter Fields (all agents)

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | yes | Agent identity |
| `description` | yes | What the agent does (used for discovery) |
| `tools` | yes | Default tool access (skill can narrow) |
| `personality` | no | Response style guide — HOW the agent communicates |

The `personality` field is injected early in the system prompt as a concise style directive. It's the one constant regardless of skill or context.

### Agent Body (Jarvis-style)

The body is tool-agnostic. Tool-specific instructions live in `response-format.toml` and are only injected when tools are present.

```markdown
You are Ling — a versatile, resourceful AI assistant built by Linggen.

You're curious, sharp, and genuinely enjoy helping people figure things out.
You can be a coding partner, a game opponent, a patient teacher, a researcher,
a creative collaborator, or whatever the moment calls for.

## How You Adapt

- **When a skill is active**, follow its instructions as your primary directive.
  You become what the skill needs. Your personality carries through.
- **When you have tools**, use them proactively. Don't talk about what you
  could do — do it.
- **When you have no tools**, focus on reasoning and conversation.
- **Respect the user.** They're smart. Don't over-explain obvious things.
  Don't repeat what they said. Don't be a sycophant.
```

### What Moved Where

| Content | Before (in ling.md) | After |
|---------|---------------------|-------|
| "Use Glob/Grep/Read/Bash..." | Agent body | `response-format.toml` (only when tools exist) |
| Workflow (Research → Act) | Agent body | `response-format.toml` |
| Delegation targets | Agent body | Dynamically injected (only when Task tool available) |
| Plan mode instructions | Agent body | `response-format.toml` (already there) |
| Personality / style | 1 line | `personality` frontmatter field |
| Adaptiveness | Not present | Agent body ("How You Adapt") |

### Other Agents (same simplification)

```yaml
# explorer.md
---
name: explorer
description: Read-only codebase exploration. Maps structure, patterns, dependencies.
tools: [Read, Glob, Grep, Bash]
personality: |
  Thorough and structured. Report findings with file paths.
  Use headings and bullet lists. Don't editorialize.
---
```

---

## Game Table Skill

### `SKILL.md`

```yaml
---
name: game-table
description: Play chess, Go, poker against AI — with teaching and chat
allowed-tools: []
app:
  launcher: web
  entry: scripts/index.html
  width: 1000
  height: 750
---
```

```markdown
You are a friendly, conversational game partner. You play board games and card
games against human players while also teaching, explaining, and chatting.

You handle two kinds of messages:

## Board Move Messages (prefixed with [BOARD_MOVE])

The user made a move on the board. You receive the game state and their move.
Respond with your move in a [MOVE] tag, followed by natural commentary:

[MOVE]{"from": [row, col], "to": [row, col]}[/MOVE]

Nice opening! I'm developing my horse to the center — this is the classic
Screen Horse Defense (屏风马).

Your move MUST be legal. Think carefully about all game rules.

## Chat Messages (no prefix)

The user is asking a question or chatting. Respond naturally:
- Explain the current position and suggest moves
- Discuss strategy, openings, endgame principles
- Share history and culture of the game
- Be encouraging and educational

Do NOT make a game move during chat — only respond to [BOARD_MOVE] with [MOVE].

Adapt your teaching level to the user.
```

---

## Game Flow

### Session Creation: Bind Skill

```javascript
// Game UI creates a skill-bound session
const session = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_root: '~/.linggen',
    name: `xiangqi-${Date.now()}`,
    skill: 'game-table'              // ← bind skill to session
  })
}).then(r => r.json());
```

Every subsequent `/api/run` call in this session automatically:
- Loads game-table SKILL.md
- Injects skill body into system prompt
- Restricts tools to `allowed-tools: []`
- Skips all tool-related prompt sections

### SSE Connection

```javascript
const es = new EventSource(`/api/events?session_id=${session.id}`);
let buffer = '';
es.onmessage = (e) => {
  const item = JSON.parse(e.data);
  if (item.kind === 'Token') {
    buffer += item.text;
    showStreaming(buffer);
  }
  if (item.kind === 'Message' && item.role === 'agent') {
    handleResponse(buffer);
    buffer = '';
  }
};
```

### Board Move (user clicks on board)

```javascript
async function onBoardMove(board, move) {
  await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_root: '~/.linggen',
      agent_id: 'ling',
      session_id: session.id,
      model_id: selectedModel,
      message: buildBoardMessage(board, move)  // [BOARD_MOVE] prefix
    })
  });
  // Response arrives via SSE
}
```

### Chat (user types in chat box)

```javascript
async function onChat(text) {
  await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_root: '~/.linggen',
      agent_id: 'ling',
      session_id: session.id,
      model_id: selectedModel,
      message: text  // plain text, no prefix
    })
  });
}
```

### Parse Response

```javascript
function handleResponse(text) {
  const moveMatch = text.match(/\[MOVE\](.*?)\[\/MOVE\]/s);
  if (moveMatch) {
    const move = JSON.parse(moveMatch[1]);
    applyAIMove(move);
    const commentary = text.replace(/\[MOVE\].*?\[\/MOVE\]/s, '').trim();
    appendChat('ai', commentary);
  } else {
    appendChat('ai', text);
  }
}
```

### Session Lifecycle

- Sessions are **never cleared** — full conversation history stays in context
- The model remembers every move, question, and teaching moment
- Game ends → user starts a new session for next game
- Old session can be kept for review

---

## Board Move Message Template (Xiangqi)

```
[BOARD_MOVE]
## Chinese Chess (Xiangqi)
You play BLACK. I play RED.

### Rules
- 10×9 board. Row 0=top (Black), Row 9=bottom (Red).
- K=King, A=Advisor, E=Elephant, R=Rook, H=Horse, C=Cannon, P=Pawn.
  Uppercase=Red, lowercase=Black, .=empty.
- King: 1 orthogonal, palace only. No flying general (kings facing).
- Advisor: 1 diagonal, palace only.
- Elephant: 2 diagonal (田), no river cross, blocked if 田-center occupied.
- Rook: any orthogonal.
- Horse: L-shape (日), blocked if adjacent orthogonal occupied.
- Cannon: moves like Rook, captures by jumping over exactly 1 piece.
- Pawn: before river 1 forward; after river also left/right. Never backward.

### Board
r . . a k a . h r
. . . . . . . . .
. c . . e . e c .
p . p . p . p . p
. . . . . . . . .
. . . . . . . . .
P . P . P . P . P
. C . . . . . C .
. . . . . . . . .
R H E A K A E H R

### My Move
Horse [9,1] → [7,2]

Respond: [MOVE]{json}[/MOVE] then commentary.
```

---

## Chinese Chess — Game Specifics

### Board (JS internal)

```javascript
const INITIAL_BOARD = [
  ['r','h','e','a','k','a','e','h','r'],
  ['.','.','.','.','.','.','.','.','.'],
  ['.','c','.','.','.','.','.','c','.'],
  ['p','.','p','.','p','.','p','.','p'],
  ['.','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.'],
  ['P','.','P','.','P','.','P','.','P'],
  ['.','C','.','.','.','.','.','C','.'],
  ['.','.','.','.','.','.','.','.','.'],
  ['R','H','E','A','K','A','E','H','R'],
];
```

### Piece Encoding

| Piece | Red | Black | Chinese |
|-------|:---:|:---:|:---:|
| King | `K` | `k` | 帥 / 將 |
| Advisor | `A` | `a` | 仕 / 士 |
| Elephant | `E` | `e` | 相 / 象 |
| Rook | `R` | `r` | 車 / 車 |
| Horse | `H` | `h` | 馬 / 馬 |
| Cannon | `C` | `c` | 炮 / 砲 |
| Pawn | `P` | `p` | 兵 / 卒 |

Red = User (bottom), Black = AI (top). User moves first.

### Move Validation (client-side)

Full rules in `xiangqi.js`:
- **King (K/k)**: 1 step orthogonal, palace only. Flying general rule.
- **Advisor (A/a)**: 1 step diagonal, palace only.
- **Elephant (E/e)**: 2 diagonal (田), no river cross, blocked if 田-center occupied.
- **Rook (R/r)**: Any steps orthogonal.
- **Horse (H/h)**: L-shape (日), blocked if adjacent orthogonal occupied.
- **Cannon (C/c)**: Moves like rook, captures by jumping over exactly 1 piece.
- **Pawn (P/p)**: Before river: 1 forward. After river: forward/left/right. Never backward.

AI move validation: if illegal, send error message and retry once. If still illegal, show error to user.

---

## Model Selection

User **directly picks a model** — the model IS the difficulty.

### Pre-game

```
┌─────────────────────────────────────────┐
│  ← Back            中国象棋              │
│                  Chinese Chess           │
│                                          │
│   Choose your opponent                   │
│                                          │
│   Model:  [ claude-haiku-4-5 ▾ ]        │
│           ┌──────────────────────┐      │
│           │ claude-haiku-4-5     │      │
│           │ claude-sonnet-4-5    │      │
│           │ claude-opus-4-6      │      │
│           │ llama-3.3-70b        │      │
│           └──────────────────────┘      │
│                                          │
│   You play Red (first move)             │
│                                          │
│   [     Start Game     ]                │
└─────────────────────────────────────────┘
```

### Mid-game: switchable in header

```
┌───────────────────────────────────────────────┐
│  ← Menu    Chinese Chess    [haiku-4-5 ▾] 📋 │
```

Switching model takes effect on next AI turn. Same session, same context.

---

## UI Design

### Game Board + Chat Panel

```
┌───────────────────────────────────────────────────────────────┐
│  ← Menu        Chinese Chess                [haiku-4-5 ▾] 📋│
│───────────────────────────────────────────────────────────────│
│                                                               │
│  ┌─────────────────────────┐  ┌────────────────────────────┐ │
│  │                         │  │ Chat                        │ │
│  │   車──馬──象──士──將      │  │                            │ │
│  │   │  │  │ ＼│／         │  │ AI: Let's play! I'm Black. │ │
│  │   ├──┼──┼──┼──┼──       │  │ Your move first.           │ │
│  │   │  │  │  │  │         │  │                            │ │
│  │   ├──砲─┼──┼──┼──       │  │ You moved: 炮二平五         │ │
│  │   │  │  │  │  │         │  │                            │ │
│  │   卒─┼──卒─┼──卒─       │  │ AI: Classic Central Cannon!│ │
│  │   │  │  │  │  │         │  │ I'll respond with Screen   │ │
│  │   ├──┼──┼──┼──┼──       │  │ Horse Defense — one of the │ │
│  │   │ 楚 河    汉 界      │  │ most solid setups against  │ │
│  │   ├──┼──┼──┼──┼──       │  │ your opening.              │ │
│  │   │  │  │  │  │         │  │                            │ │
│  │   兵─┼──兵─┼──兵─       │  │ You: Why not the cannon?   │ │
│  │   │  │  │  │  │         │  │                            │ │
│  │   ├──炮─┼──┼──┼──       │  │ AI: Cannon counter is also │ │
│  │   │  │  │  │  │         │  │ viable! But the horse gives│ │
│  │   ├──┼──┼──┼──┼──       │  │ more flexibility in the    │ │
│  │   │  │  │ ／│＼         │  │ middle game...             │ │
│  │   車──馬──相──仕──帥      │  │                            │ │
│  │                         │  ├────────────────────────────┤ │
│  └─────────────────────────┘  │ [Type a message...]   Send │ │
│                               └────────────────────────────┘ │
│  [ New Game ]   [ Resign ]                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

- **Left**: Board (canvas) — click to select, click to move
- **Right**: Chat — streaming AI responses, user can type questions anytime
- **Header**: Back, game name, model picker, system prompt inspector (📋)
- **Footer**: New Game, Resign

---

## File Structure

```
skills/game-table/
├── SKILL.md                    # App skill (allowed-tools: [], game prompt)
├── design.md                   # This document
└── scripts/
    ├── index.html              # Game lobby
    ├── style.css               # Shared styles
    ├── main.js                 # Navigation, model picker
    ├── api.js                  # Linggen API client (models, sessions, run, SSE)
    ├── xiangqi.html            # Chinese Chess game + chat layout
    ├── xiangqi.css             # Board + chat styles
    └── xiangqi.js              # Board state, validation, rendering, game flow
```

No separate agent file. Skill body in SKILL.md shapes ling's behavior.

---

## System Prompt Transparency: API + UI

### API: `GET /api/system-prompt`

```
GET /api/system-prompt?session_id=xxx&agent_id=ling
```

```json
{
  "layers": [
    { "source": "personality", "label": "ling (personality)", "tokens": 80 },
    { "source": "agent", "label": "ling.md", "tokens": 200 },
    { "source": "skill", "label": "game-table", "tokens": 600 },
    { "source": "environment", "label": "Environment", "tokens": 60 },
    { "source": "tools", "label": "Tool Schemas", "tokens": 0, "note": "skipped (no tools)" }
  ],
  "total_tokens": 940,
  "effective_tools": [],
  "bound_skill": "game-table"
}
```

### UI: System Prompt Inspector

Accessible via 📋 icon in session header. Shows each layer with token count, expandable to view content. "Copy Full Prompt" and "View Raw" buttons.

---

## Engine Changes Summary

| Change | File | Description |
|--------|------|-------------|
| **Session-bound skills** | `server/mod.rs`, `project_store/` | `POST /api/sessions` accepts `skill` field; session stores bound skill |
| **Skill activation per session** | `engine/prompt.rs` | Check `session.bound_skill` before transient `active_skill` |
| **Skip tool prompt when no tools** | `engine/prompt.rs` | Don't inject response format / tool guidelines when effective tools is empty |
| **`personality` frontmatter field** | `skills/mod.rs`, `engine/prompt.rs` | Parse `personality` from agent frontmatter, inject early in system prompt |
| **Simplified agent frontmatter** | `skills/mod.rs` | Remove `policy`, `idle_*`, `work_globs`, `model` from agent parsing (move to runtime config) |
| **System prompt API** | `server/mod.rs` | `GET /api/system-prompt` endpoint |
| **System prompt UI** | `ui/src/` | Inspector component |

---

## Implementation Phases

### Phase 1: Engine Foundation
- [ ] Session-bound skills (`POST /api/sessions` with `skill` field)
- [ ] Skill activation from session (check `bound_skill` in prompt assembly)
- [ ] Skip tool prompt when effective tools is empty
- [ ] `personality` frontmatter field (parse + inject)
- [ ] Simplify agent frontmatter (remove runtime fields)
- [ ] Rewrite `ling.md` (Jarvis-style, tool-agnostic)

### Phase 2: Chinese Chess Game
- [ ] `game-table/SKILL.md` with game partner instructions
- [ ] `api.js` — fetchModels, createSession (with skill), sendMessage, connectSSE
- [ ] Game lobby (index.html + style.css + main.js)
- [ ] Xiangqi board rendering (canvas) with Chinese characters
- [ ] Click-to-move with legal move highlighting
- [ ] Full move validation (all piece rules)
- [ ] Chat panel with streaming AI responses
- [ ] Response parsing ([MOVE] extraction)
- [ ] Model picker (pre-game + mid-game)

### Phase 3: Transparency + Polish
- [ ] `GET /api/system-prompt` endpoint
- [ ] System Prompt Inspector UI
- [ ] Move animation (smooth sliding)
- [ ] Check/checkmate detection and UI
- [ ] Mid-game model switching
- [ ] Captured pieces display

### Phase 4: More Games
- [ ] International Chess
- [ ] Go (9×9)
- [ ] Texas Hold'em
