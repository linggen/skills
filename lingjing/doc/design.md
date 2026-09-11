---
type: design
reader: coding agent, contributors
guide: |
  How Lingjing is built. What it is and does is product-spec.md; how it looks
  and plays is prototype.html (scripted, no model). This file is the build.
status: Design only, 2026-09-11. Nothing built.
---

# Lingjing — design

## The shape in one diagram

```
 Mac: the app page                              Phone: the chat is everything
 ┌─ scene (scripts/index.html) ─┬─ stock chat ─┐  ┌─ phone chat (Flutter) ─┐
 │ status · Yinyue in the place │ Ling's words │  │ Ling's words           │
 │ focus card: creature, board, │ AskUser      │  │ the same cards, inline │
 │ map … · today's tasks        │ choices      │  │ choices · free text    │
 │ puzzles run here, no model   │ free text    │  │ puzzles, no model      │
 └──────▲───────────────────────┴──────┬───────┘  └───────────┬────────────┘
        │ content_block (Show)         │ messages             │
        │                              ▼                      ▼
 ┌─ session: Ling, skill lingjing ────────────────────────────────────────┐
 │  SKILL.md = the game-master rules                                      │
 │  context = rules + state brief + story + THIS scene only               │
 └──────┬─────────────────────────────────────────────────────────────────┘
        │ shell tools              data tool Show → a card on the scene
        ▼                          (Mac) or inline (phone)
 ┌─ scripts/rules.mjs ───────────────┐
 │  reads  content/  (authored)       │
 │  writes data/     (this player)    │
 │  refuses what the state disallows  │
 └───────────────────────────────────┘
```

Three rules hold the whole build together:

1. **Content is data, never prompt.** Chapters, scenes, creatures, rewards and
   answer keys are files. The model sees one scene at a time.
2. **The model proposes, the rules decide.** Ling changes the game only by
   calling a tool; `rules.mjs` checks every call against the state and the
   content, and its answer is final.
3. **The context holds only the moment.** Rules, a state brief, the story so
   far, the current scene, the last few messages. Never the game.

## Where things live

```
skills/lingjing/
  SKILL.md                 Ling's game-master rules + tool declarations
  scripts/
    index.html, game.js    the page (from prototype.html)
    chat-bridge.js, api.js the shared bridge copies
    rules.mjs              the rules engine, a CLI: node rules.mjs <verb> …
    content.mjs            loads + validates content/
  content/                 authored; ships with the skill
    realms.json            the ladder: 练气 1–9, 筑基 … with 修为 thresholds
    roots.json             灵根 kinds and their 修为 multiplier
    rewards.json           reward tables and caps (scene, branch, task, day)
    creatures.json         山海经 entries: name{zh,en}, source, quote{zh,en}, province
    herbs.json             alchemy tiles
    hexagrams.json         the day's omen (the eight doubled trigrams so far)
    art/<creature>.webp    one picture per creature, ink style (sketches as .svg)
    riddles/zh.json, en.json   answer keys the rules check
    tasks/world.json       in-world tasks
    chapters/00-prologue/  chapter.json · beats.md · scenes/*.json
    chapters/01-ji/        …
  data/                    this player; never in the repo
    state.json · story.md · log.jsonl · days/<date>.json
  tests/
```

## Content

### A chapter

`chapter.json`:

```json
{ "id": "01-ji", "opens": "2026-10-01", "province": "冀", "gate": 1,
  "first_scene": "01-ji-arrive",
  "title": { "zh": "第一章 · 冀州之鼎", "en": "Chapter 1 · The Cauldron of Ji" },
  "summary": { "zh": "…", "en": "…" } }
```

`beats.md` is the one-page beat sheet the author edits. Scenes are cut from
it; the model never reads the whole sheet.

- **Opening dates are local.** Chapters ship inside the skill through
  Linggen's normal skill update; `rules.mjs` refuses a chapter before its
  `opens`. The skill downloads nothing.
- **A realm gate** holds the player at the peak until the chapter opens: the
  realm in `realms.json` names its chapter (`foundation` has `gate: 1`). The
  prologue has none (`opens: null`, `gate: null`).

### A scene

A scene is a setup and its exits. Each exit has plain words (`means`) — what
Ling matches the player's text against — and the rules that apply.

```json
{ "id": "00-fuzhu", "chapter": "00-prologue",
  "place": { "zh": "泗水北岸 · 雾中", "en": "North of the Si · in the mist" },
  "setup": { "zh": "你沿泗水北行。雾里立着一只白鹿，头生四角。", "en": "…" },
  "cast": ["yinyue", "fuzhu"],
  "show": [{ "card": "creature", "id": "fuzhu" }],
  "lines": [{ "who": "yinyue", "text": { "zh": "是夫诸……", "en": "That's Fuzhu…" } }],
  "buttons": ["duel", "riddle", "around"],
  "exits": [
    { "id": "gift", "means": "gives or feeds it an herb, especially the lingzhi",
      "needs": { "bag": "lingzhi" }, "take": { "bag": "lingzhi" },
      "refuse": { "zh": "你身上没有灵芝。", "en": "You have no lingzhi on you." },
      "grant": { "table": "scene", "xw": 50, "ls": 10, "beast": "fuzhu" },
      "beat": [{ "who": "fuzhu", "text": { "zh": "……我跟你走。", "en": "…I will go with you." } }],
      "next": "00-north" },
    { "id": "around", "label": { "zh": "绕行", "en": "Go around" },
      "means": "avoids it or goes around it", "stay": true } ] }
```

The fields, as `scripts/content.mjs` checks them:

| Field | Means |
|---|---|
| `place`, `setup` | Where it is; what Ling narrates on entry — paraphrased, facts unchanged. `{daohao}` fills in the player's name. |
| `cast` | Who is present: `yinyue`, creature ids. |
| `show` | Cards `Show`n on entry: `creature`, `root`, `map`, `board`, `hexagram`, `gate`, `tribulation`. |
| `lines` | Hand-written spine lines spoken on entry, near verbatim. |
| `offers` | Tasks set here, and whether due quests appear beside them. |
| `buttons` | The exits shown as choices; every other exit is found only by typing. |
| exit `label` | The button's words. Required for a button. |
| exit `means` | Plain words Ling matches the player's text against. |
| exit `needs` / `take` | What must be in hand (`bag`) or done (`task`); what it uses up. A need carries a `refuse` line. |
| exit `grant` | 修为, 灵石, a creature — never over its table's cap. |
| exit `key` | A riddle; the rules check the answer, the model only extracts it. |
| exit `value` | A value the player gives — the 道号 — with offered choices. |
| exit `set` | State the rules set, e.g. `root: v1`. |
| exit `game` | A puzzle or duel whose win the page reports. |
| exit `beat` | Lines spoken when the exit is taken. |
| exit `next` · `stay` · `ends` | Exactly one: the next scene, stay here, or end the chapter. |

The lint also refuses a scene nobody can reach, a chapter with no ending, a
grant over its cap, a string missing a language and a creature without its
picture.

### Branch stories (奇遇)

Not authored scene by scene. A branch is a template:

```json
{ "kind": "province-tale", "max_turns": 6, "table": "branch",
  "may_not": ["spine", "cauldron", "yinyue-memory", "realm"] }
```

Ling writes the tale; the rules count its turns and pay from the capped
branch table when it closes.

## Player state

`state.json`:

```json
{ "version": 1, "lang": "zh", "daohao": "青玄",
  "root": ["wood", "water", "fire", "earth"],
  "realm": "qi-2", "xw": 40, "ls": 10,
  "bag": { "lingzhi": 1 }, "beasts": ["fuzhu"],
  "chapter": "00-prologue", "scene": "00-hook", "done": ["00-fuzhu"],
  "tasks": { "shifu-scan": { "period": "2026-W37", "status": "done" } },
  "branch": null }
```

- `story.md` — the story so far, ≤300 words, rewritten at each scene's end by
  Ling through `Summarize`. The rules store it; they never read it.
- `log.jsonl` — every rules call `{at, verb, args, result}`: the audit, and
  the undo.
- `days/<date>.json` — the day's task ledger and reward totals (for caps).

## A turn — what the context holds

| Part | From | ~tokens | Cached |
|---|---|---|---|
| Ling's game-master rules | SKILL.md | 1,200 | yes |
| Tools | frontmatter | 600 | yes |
| State brief | `Look` | 150 | no |
| Story so far | story.md via `Look` | 400 | no |
| Current scene: setup + exits' `means` | `Look` / `Resolve` | 300 | no |
| Last ~10 messages | the session | 800 | no |

About 3.5k tokens a turn, half of it cached. The next scene arrives inside
`Resolve`'s result and replaces this one.

- **One session per game day** (the app session rule: resume the latest under
  24 h, else fresh). A fresh session begins with `Look`.
- Long days fall to the engine's compaction; `story.md` survives either way.

## Tools

Shell tools — `node $SKILL_DIR/scripts/rules.mjs <verb>`; each returns JSON.

| Tool | Does | Refuses |
|---|---|---|
| `Look` | State brief, story, current scene. Call at session start and when unsure. | — |
| `Resolve {exit}` | Takes an exit: checks `needs`, applies `take`, pays `grant` within caps, advances; returns the next scene. | unknown exit, unmet `needs`, a closed chapter |
| `Judge {key, answer}` | Checks an answer against the key. | — |
| `Task {action: list \| offer \| check}` | Today's due tasks; `check` reads the owning app's quest record. | a task already paid this period |
| `Branch {action: open \| close, kind}` | Opens or closes a 奇遇; pays on close. | a second open branch, an exhausted daily cap |
| `Summarize {text}` | Replaces `story.md`. | over 300 words |
| `Move {province}` | Travels. | a province whose chapter has not opened |

Data tool — `Show {card, …}` (no `cmd`): its args reach the page as a
`content_block` and render as a card — creature, task, board, map, hexagram,
root test, chapter gate, tribulation. Choices are not cards: they go through
AskUser.

Prompt rules that ride in SKILL.md:

- Never state a number the rules did not return.
- Every change goes through a tool; words alone change nothing.
- Map the player's words to an exit's `means`; if none fits, answer and offer
  the way forward.
- Refuse out-of-bounds asks in the world's voice, never as a system message.
- End every reply with a way forward — choices, usually, through AskUser.
- Real-life requests belong to Yinyue outside the game.

## The screens

The look and flow are `prototype.html`. **One set of cards, two placements:**
the Mac shows them on a scene beside the chat, the phone inline in the chat.

**Mac — the scene on the left, the conversation on the right.** No engine
change.

- **The scene is the skill's app page:** the status strip, Yinyue's 3D model
  standing in the current place, the focus card (creature, board, map, root
  test, hexagram, chapter gate, tribulation) and today's tasks.
- **Ling drives it with `Show`,** a data tool: its args reach the page as a
  `content_block`, the way `PageUpdate` does today.
- **The conversation is the stock chat panel:** Ling's narration, the
  player's words, and choices through **AskUser** — its options are the
  buttons, its *Other* field is free text. A tapped option returns to Ling as
  the answer, so `Resolve` gets the exit exactly; *Other* text goes through
  Ling's matching.
- **Puzzles never touch the model.** The scene runs 连连看, 七巧板 and 华容道
  and reports the result to `rules.mjs` through the same door Health's page
  uses for its writes; the rules pay and log it.
- The board grows to 6×6 on the Mac; the map runs wide.

**Phone — the chat is everything.** The phone's own chat (Flutter) draws the
same cards inline, shows choices as buttons that send `[choice scene:exit]`,
and runs the same `rules.mjs` contract. Later.

## Pictures

A creature is never named without its picture — a player cannot know 夫诸
from its name.

- **One picture per creature,** `content/art/<id>.webp`, shipped in the skill.
- **One style:** ink wash. Where a classical woodblock illustration of the
  creature exists — the Ming and Qing illustrated editions of the 山海经 are
  old enough to be public — it is the source; otherwise the picture is drawn
  to match.
- `creatures.json` carries `art` and `art_source` for every entry; the content
  lint refuses a creature without both.
- **Shown on both screens:** large in the scene's focus card on the Mac,
  inline in the creature card on the phone.

## Real-life tasks — quests

Each app publishes its quest facts; the game only reads them.

`~/.linggen/quests/<app>.json`, written by the app itself when its state
changes:

```json
{ "app": "apple-shifu", "quests": [
  { "id": "shifu-scan", "title": { "zh": "清扫洞府 · 用 Shifu 扫描一次磁盘", "en": "…" },
    "period": "week", "due": true, "done_at": "2026-09-11T09:40:00-03:00", "reward": 30 } ] }
```

- **The game names no app.** An app joins by writing its file.
- **Done means the app's own record** — Shifu's last scan time, the night in
  Health's mirror. Never self-reported.
- **Only these facts cross** — due, done, when. No raw health or money data.
- `Task check` pays when `done_at` falls in the current period and the period
  is unpaid.

## 灵气 — the budget

- **The proxy enforces it.** Linggen Cloud meters the game as its own product,
  `lingjing`, on a rolling 5-hour window, apart from the monthly quota.
  Nothing in the skill counts or enforces.
- **The host reports it** the way it reports the quota today; the page draws
  the 丹田 from that reading.
- **A turn costs what it costs** — typed or tapped, one model turn. Puzzles
  cost nothing.

## Memory

- `memory-context: lingjing` — the game's own facts stay in the game.
- Game events live in `data/`, not in ling-mem.
- Yinyue reads the player's name from core memory; the game writes nothing
  into her memory.

## Languages

`lang` is in the state; every authored string is `{zh, en}`; Ling answers in
the player's language. Word games and riddles keep a set per language. English
uses the fandom's terms (Qi Condensation, Foundation Establishment, Core
Formation, Nascent Soul).

## Testing

- **`rules.mjs` is pure** and node-tested: exits, needs, caps, chapter gates,
  once-per-period, refusals.
- **A content lint**: every `next` exists, every `grant` fits its table, every
  string has both languages, every `key` exists, every creature has its
  picture.
- **A playthrough without a model**: the prologue driven by exit ids alone,
  asserting the state at the end.

## Build order

1. Content schemas and the prologue (泗水 → 测灵根 → first tasks → 夫诸) as data.
2. `rules.mjs` with its tests and the content lint.
3. SKILL.md — Ling's rules and the tools.
4. The Mac scene page and its `Show` cards; choices through AskUser.
5. Quests: Shifu's scan first, then Health's night.
6. The `lingjing` window in the proxy.
7. Chapter 1 — 冀州.

## Open

- 灵气 refills from a workout or a deep night need the proxy to accept a
  host-reported event.
- 灵气 for players on their own key or a ChatGPT login.
- The phone.
