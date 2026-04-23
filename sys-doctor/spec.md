---
type: spec
guide: |
  Product specification for sys-doctor v2.
  Describes what to build and why. Avoid implementation details.
---

# Sys Doctor v2 — Your AI System Manager

## Vision

Sys-doctor becomes linggen's flagship non-coding skill. It replaces $40/year Mac cleaners (CleanMyMac, DaisyDisk) with something smarter: an AI agent that understands your system, not just scans it.

Traditional cleaners find junk by rules. Sys-doctor understands context: "this node_modules belongs to a project you committed to yesterday — keep it. That one hasn't been touched in 8 months — safe to delete."

### Goals

- Beat CleanMyMac in usefulness — free, smarter, conversational.
- Attract non-developer users to linggen — prove it's a platform, not just a coding agent.
- Work as a demo: "this is what an AI agent in a traditional app looks like."
- Useful enough that people run it weekly (or schedule it as a mission).

### Non-goals

- Auto-delete anything. Always recommend, never act without the user.
- Replace Activity Monitor for real-time process monitoring.
- Windows support (macOS first, Linux second).

## What's new in v2

v1 (shipped) does: system info cards, disk summary, known garbage locations, AI recommendations.

v2 adds five modules that turn it from a quick health check into a comprehensive system manager.

## Modules

### 1. System Health (v1 — enhance)

Already shipped. Enhance with:

- **Health score** (0–100) — weighted composite of disk, memory, battery, security. Shown prominently on the lobby and dashboard. Gives users one number to care about.
- **Trend tracking** — store scores in localStorage. "Your health score dropped from 82 to 67 this month — disk is filling up."
- **Hardware age detection** — parse model identifier, estimate machine age. When old: "This is a 2019 MacBook Pro (6 years old). Battery at 78% health. A MacBook Air M4 starts at $1,099 — ask me for a buyer's guide."

### 2. Deep File Scanner (new)

The big addition. Not just "how much is ~/Library" — actually index files and understand them.

#### What it scans

- **Large files** (>50MB) — path, size, last accessed, file type.
- **File type breakdown** — photos, videos, documents, code, archives, databases, disk images, installers. Group by type, sum sizes, show percentages.
- **Duplicate detection** — files with identical size + first-4KB hash. Group duplicates, show total wasted space.
- **Stale files** — not accessed in >6 months. Especially in Downloads, Desktop.
- **Media files not backed up** — photos/videos outside iCloud Photos or known backup locations.
- **Scattered files** — same project's files spread across Desktop, Downloads, Documents. Suggest consolidation.

#### AI labeling

For each large/stale/duplicate file, AI assigns:

| Label | Meaning | Example |
|:------|:--------|:--------|
| safe | Delete without worry | `.dmg` installer after app is installed |
| backup-first | Valuable but taking space | Photos not in iCloud |
| review | Might be important | Old project archives |
| keep | Active or important | Recent documents |

AI uses file type, age, location, and name to judge. Not just rules — context matters. `wedding-photos-2024.zip` in Downloads gets "backup-first", not "stale file."

#### Dashboard UI

- **File type donut chart** — photos: 45GB, videos: 30GB, code: 15GB, etc.
- **Large files table** — sortable by size, age, type. AI label badge on each row.
- **Duplicates panel** — grouped sets, total waste shown.
- **"Buried treasure"** — files AI thinks are valuable but forgotten (old photos in random folders, documents in Downloads).

### 3. Security & Risk (new)

Check for common security issues. Not a security product — just flag obvious risks.

#### What it checks

- **Gatekeeper status** — is it on?
- **SIP status** — System Integrity Protection enabled?
- **Firewall status** — on/off?
- **FileVault** — disk encryption enabled?
- **Open ports** — anything listening that shouldn't be?
- **Outdated software** — brew outdated, macOS updates available.
- **Known risky configs** — remote login enabled? Screen sharing on?
- **SSH keys without passphrase** — scan `~/.ssh/` for unprotected keys (check file permissions, not contents).

#### AI assessment

Not just "firewall is off" but: "Your firewall is off. You're on a home network (Wi-Fi: MyHomeNetwork), so the risk is low. But if you ever use coffee shop Wi-Fi, turn it on: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on`."

#### Dashboard UI

- **Security scorecard** — green/yellow/red per check.
- **Risk summary** — "3 issues found, 1 needs attention."

### 4. Performance (new)

Help users understand what's slowing their machine.

#### What it checks

- **Login/startup items** — LaunchAgents, LoginItems. How many, which ones.
- **Top memory consumers** — processes using >500MB.
- **Top CPU consumers** — processes averaging high CPU.
- **Uptime** — suggest restart if >30 days.
- **Swap usage** — is the machine paging heavily?
- **Chrome/Electron bloat** — count helper processes, total memory.

#### AI assessment

"Slack, Discord, and Spotify are using 4.2GB combined — that's 25% of your RAM. Consider using web versions or quitting when not needed. Chrome has 47 helper processes using 3.1GB — try closing unused tabs."

#### Dashboard UI

- **Process table** — top 10 by memory, top 10 by CPU.
- **Memory breakdown** — pie chart: apps vs system vs available.
- **Startup items list** — with AI recommendation (keep/remove) per item.

### 5. Smart Advisor (new — the AI differentiator)

This is what makes sys-doctor an agent, not a scanner. After collecting all data, AI synthesizes a personalized report.

#### What it covers

- **Overall health narrative** — 3-5 sentences on system state.
- **Prioritized action plan** — numbered steps, biggest impact first. Total reclaimable space.
- **Hardware advice** — if machine is old or struggling, suggest upgrades with specific recommendations.
- **Usage patterns** — "You seem to be a developer (Xcode, Docker, VS Code all present). Your biggest disk consumers are dev tools."
- **Proactive warnings** — "Your battery is at 78% health with 847 cycles. Apple considers it consumed at 80% degradation. You have about 150 cycles left before noticeable decline."
- **Conversational follow-up** — user can ask "tell me more about the Docker situation" or "give me a buyer's guide for a new MacBook."

## Scan modes (revised)

| Mode | Time | What it does |
|:-----|:-----|:-------------|
| Quick | ~10s | System info + disk summary + health score |
| Full | ~30s | Quick + garbage + security + performance |
| Deep | 2-5min | Full + file indexing + duplicates + media scan |

Quick and Full are fast enough for casual use. Deep is the "CleanMyMac replacement" experience — run it monthly.

## Health score

A single number (0–100) that summarizes system health. Shown on the lobby card and dashboard header.

### Weights

| Factor | Weight | Scoring |
|:-------|:-------|:--------|
| Disk free | 30% | >20% free = 100, <5% = 0, linear |
| Memory pressure | 15% | <70% used = 100, >95% = 0 |
| Battery health | 15% | >90% = 100, <70% = 0 (skip on desktop) |
| Security checks | 20% | % of checks passing |
| Garbage ratio | 10% | Reclaimable as % of used — less is better |
| Software freshness | 10% | % of packages up to date |

### Trend

Store `{ date, score, disk_free_gb }` in localStorage after each scan. Show a sparkline on the lobby: "82 → 75 → 67 over 3 months."

## Mission mode

Scheduled scans via linggen's mission system.

- Weekly or monthly cron.
- Runs full scan automatically (no user interaction).
- Stores results in session.
- User opens the session later — sees dashboard + can chat.
- If health score drops below threshold, could trigger a notification (future: via P2P to phone).

## UI Architecture

### Layout

Always two-column. Chat panel fixed on right. Left panel is entirely model-driven — the model emits a **page layout JSON** that defines what's shown.

```
┌───────────────────────────────────────────────────────────┐
│ Header: 🩺 Sys Doctor                           [Model ▾] │
├─────────────────────────────────┬─────────────────────────┤
│                                 │                         │
│  TOP BAR (model-defined)        │  CHAT PANEL (fixed)     │
│  ┌─────┐┌─────┐┌─────┐┌─────┐ │                         │
│  │ CPU ││ Mem ││Disk ││Batt │ │  Agent greeting,         │
│  └─────┘└─────┘└─────┘└─────┘ │  narration, verdicts.    │
│                                 │                         │
│  BODY (model-defined)           │  User types or clicks.   │
│  ┌───────────────────────────┐ │  Model responds →        │
│  │                           │ │  Page layout updates.    │
│  │  Any combination of       │ │                         │
│  │  widget types, stacked.   │ │                         │
│  │                           │ │                         │
│  └───────────────────────────┘ │                         │
│                                 │                         │
│  FOOTER (model-defined)        │  ┌───────────────────┐  │
│  MacBook Pro · M4 Pro · 15.3   │  │ Ask me anything... │  │
│                                 │  └───────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### Page Layout JSON

The model controls the entire left panel by emitting a `page` JSON block in its response. The renderer parses it and draws the layout.

````
```page
{
  "top_bar": [...],
  "body": [...],
  "footer": {...}
}
```
````

When the model emits a new `page` block, the left panel replaces its content. Chat panel is never affected — it's always fixed.

### Page schema

```json
{
  "top_bar": [
    { "widget": "cpu", "data": { "value": 12, "label": "M4 Pro · 12 cores" } },
    { "widget": "memory", "data": { "value": 62, "used": 22, "total": 36 } },
    { "widget": "disk", "data": { "value": 78, "used": 370, "total": 476 } },
    { "widget": "battery", "data": { "value": 81, "cycles": 847, "status": "AC" } }
  ],
  "body": [
    { "type": "action-cards", "items": [...] }
  ],
  "footer": {
    "text": "MacBook Pro · M4 Pro · macOS 15.3 Sequoia"
  }
}
```

- **`top_bar`** — array of small metric widgets. Rendered as a row of compact cards. The model picks which metrics to show and provides data.
- **`body`** — array of content widgets, rendered stacked vertically. This is where the main content lives — charts, tables, action cards, recommendations.
- **`footer`** — optional status line at the bottom.

All three sections are model-defined. Different contexts produce different layouts.

### Top bar widgets

Small, compact metric cards. The model picks which ones to show.

| Widget ID | Display |
|:----------|:--------|
| `cpu` | Usage %, core count, progress bar |
| `memory` | Used/total GB, %, bar |
| `disk` | Used/total GB, %, bar, color-coded |
| `battery` | Health %, cycles, charging status, bar |
| `network` | Wi-Fi name, IP address |
| `gpu` | Core count, Metal version |
| `io` | MB/s, ops/s |
| `score` | Health score 0-100, color ring |

Each top bar widget is a known component with optimized rendering. The model provides `data` — the renderer knows how to display a `cpu` widget vs a `battery` widget.

Different skills use different top bars:

```json
// sys-doctor
"top_bar": [
  { "widget": "cpu", "data": {...} },
  { "widget": "memory", "data": {...} },
  { "widget": "disk", "data": {...} },
  { "widget": "battery", "data": {...} }
]

// photo-organizer
"top_bar": [
  { "widget": "disk", "data": {...} },
  { "widget": "custom", "data": { "label": "Photos", "value": "12,847", "sub": "45 GB" } },
  { "widget": "custom", "data": { "label": "Backed Up", "value": "78%", "color": "green" } }
]

// network-monitor
"top_bar": [
  { "widget": "network", "data": {...} },
  { "widget": "custom", "data": { "label": "Latency", "value": "23ms" } },
  { "widget": "custom", "data": { "label": "Bandwidth", "value": "94 Mbps" } }
]
```

The `custom` widget type renders any `label` / `value` / `sub` / `color` — a generic metric card for skill-specific data.

### Body widgets

Content widgets rendered stacked in the body area. The model composes any combination.

#### `action-cards` — Feature menu with Start buttons

Shown on open. Each card lights up as the agent mentions it in chat.

```json
{
  "type": "action-cards",
  "items": [
    {
      "id": "disk-scan",
      "icon": "🔍",
      "title": "Scan Disk & Cleanup",
      "description": "Find garbage, caches, old files.",
      "active": true
    },
    {
      "id": "photos",
      "icon": "📸",
      "title": "Organise Photos",
      "description": "Find scattered photos, check backup status.",
      "active": false
    }
  ]
}
```

When user clicks Start, it sends a chat message (e.g. "scan disk"). The model responds with a new `page` block for the results view.

#### `bars` — Horizontal bar chart

```json
{
  "type": "bars",
  "title": "Disk Usage",
  "badge": "106 GB free",
  "items": [
    { "label": "~/Library", "value": 45, "max": 476, "color": "#6366f1" },
    { "label": "~/workspace", "value": 34, "max": 476, "color": "#8b5cf6" }
  ]
}
```

#### `table` — Data table with optional badges

```json
{
  "type": "table",
  "title": "Large Files",
  "badge": "12 files over 1 GB",
  "columns": ["Size", "File", "Age", "Label"],
  "rows": [
    ["4.2 GB", "~/Downloads/ubuntu.iso", "4 months", { "badge": "safe", "color": "green" }],
    ["2.8 GB", "~/Movies/recording.mov", "1 year", { "badge": "backup", "color": "blue" }]
  ]
}
```

#### `scorecard` — Status grid with colored dots

```json
{
  "type": "scorecard",
  "title": "Security",
  "badge": "5/6 passing",
  "items": [
    { "label": "Gatekeeper", "status": "green", "detail": "enabled" },
    { "label": "Firewall", "status": "yellow", "detail": "off" }
  ]
}
```

#### `recommendations` — Cleanup list with risk + commands

```json
{
  "type": "recommendations",
  "title": "Cleanup Recommendations",
  "badge": "~28 GB reclaimable",
  "items": [
    {
      "title": "Clear Xcode DerivedData",
      "description": "Build artifacts, all regeneratable",
      "savings_gb": 12,
      "risk": "safe",
      "command": "rm -rf ~/Library/Developer/Xcode/DerivedData"
    }
  ]
}
```

#### `donut` — Donut chart with legend

```json
{
  "type": "donut",
  "title": "File Type Breakdown",
  "badge": "147 GB · 48,291 files",
  "items": [
    { "label": "Photos", "value": 45, "color": "#6366f1" },
    { "label": "Video", "value": 30, "color": "#8b5cf6" }
  ]
}
```

#### `info` — Key-value info card

```json
{
  "type": "info",
  "title": "Machine",
  "icon": "💻",
  "fields": [
    { "label": "Model", "value": "MacBook Pro (2024)" },
    { "label": "Chip", "value": "Apple M4 Pro" }
  ]
}
```

#### `progress` — Scan progress indicator

```json
{
  "type": "progress",
  "title": "Scanning...",
  "steps": [
    { "label": "System info", "status": "done" },
    { "label": "Disk usage", "status": "done" },
    { "label": "Security", "status": "active" },
    { "label": "AI analysis", "status": "pending" }
  ]
}
```

#### `hero` — Highlight card (hardware advice, alerts)

```json
{
  "type": "hero",
  "icon": "💡",
  "title": "Time to consider an upgrade?",
  "body": "This is a 2019 MacBook Pro — about 7 years old...",
  "cta": { "label": "Ask me for a buyer's guide", "message": "buyer's guide" }
}
```

### Full page examples

#### On open (hardware detected, offering actions)

```json
{
  "top_bar": [
    { "widget": "cpu", "data": { "value": 12, "label": "M4 Pro · 12 cores" } },
    { "widget": "memory", "data": { "value": 62, "used": 22, "total": 36 } },
    { "widget": "disk", "data": { "value": 78, "used": 370, "total": 476 } },
    { "widget": "battery", "data": { "value": 81, "cycles": 847, "status": "AC" } }
  ],
  "body": [
    {
      "type": "info",
      "icon": "💻",
      "title": "User_name's MacBook Pro",
      "fields": [
        { "label": "Chip", "value": "Apple M4 Pro" },
        { "label": "OS", "value": "macOS 15.3 Sequoia" },
        { "label": "Uptime", "value": "14 days" }
      ]
    },
    {
      "type": "action-cards",
      "items": [
        { "id": "disk", "icon": "🔍", "title": "Scan Disk & Cleanup", "description": "Find garbage, caches, old files.", "active": true },
        { "id": "photos", "icon": "📸", "title": "Organise Photos", "description": "Find scattered photos, check backup.", "active": true },
        { "id": "large", "icon": "📦", "title": "Find Large Files", "description": "Deep scan, AI labels each file.", "active": false },
        { "id": "security", "icon": "🔒", "title": "Security Check", "description": "Firewall, encryption, open ports.", "active": false }
      ]
    }
  ],
  "footer": { "text": "MacBook Pro · M4 Pro · macOS 15.3 Sequoia" }
}
```

#### After disk scan (results view)

```json
{
  "top_bar": [
    { "widget": "cpu", "data": { "value": 12, "label": "M4 Pro" } },
    { "widget": "memory", "data": { "value": 62, "used": 22, "total": 36 } },
    { "widget": "disk", "data": { "value": 78, "used": 370, "total": 476 } },
    { "widget": "battery", "data": { "value": 81, "cycles": 847 } }
  ],
  "body": [
    {
      "type": "bars",
      "title": "Disk Usage",
      "badge": "106 GB free",
      "items": [
        { "label": "~/Library", "value": 45, "max": 476, "color": "#6366f1" },
        { "label": "~/workspace", "value": 34, "max": 476, "color": "#8b5cf6" },
        { "label": "~/Documents", "value": 25, "max": 476, "color": "#a78bfa" },
        { "label": "~/Downloads", "value": 18, "max": 476, "color": "#c4b5fd" }
      ]
    },
    {
      "type": "recommendations",
      "title": "Cleanup Recommendations",
      "badge": "~28 GB reclaimable",
      "items": [
        { "title": "Clear Xcode DerivedData", "savings_gb": 12, "risk": "safe", "command": "rm -rf ~/Library/Developer/Xcode/DerivedData" },
        { "title": "Docker dangling images", "savings_gb": 4.2, "risk": "safe", "command": "docker image prune -f" },
        { "title": "Old Downloads (47 files)", "savings_gb": 8.1, "risk": "review" },
        { "title": "Empty Trash", "savings_gb": 3.8, "risk": "safe", "command": "rm -rf ~/.Trash/*" }
      ]
    }
  ],
  "footer": { "text": "MacBook Pro · M4 Pro · macOS 15.3" }
}
```

#### Old machine (upgrade advice)

```json
{
  "top_bar": [
    { "widget": "cpu", "data": { "value": 45, "label": "Intel i5 · 4 cores" } },
    { "widget": "memory", "data": { "value": 89, "used": 7.1, "total": 8 } },
    { "widget": "disk", "data": { "value": 94, "used": 236, "total": 251 } },
    { "widget": "battery", "data": { "value": 71, "cycles": 1203 } }
  ],
  "body": [
    {
      "type": "info",
      "icon": "💻",
      "title": "Old MacBook Pro",
      "fields": [
        { "label": "Chip", "value": "Intel Core i5 (2019)" },
        { "label": "Age", "value": "~7 years" },
        { "label": "OS", "value": "macOS 14.2" }
      ]
    },
    {
      "type": "hero",
      "icon": "💡",
      "title": "Time to consider an upgrade?",
      "body": "8GB RAM and 256GB disk are both maxed out. Battery past rated lifespan.\n\n**MacBook Air M4 — $1,299** (recommended)\n16GB RAM, 512GB SSD. 3x faster, 2x battery.",
      "cta": { "label": "Ask me for a buyer's guide", "message": "buyer's guide" }
    }
  ],
  "footer": { "text": "MacBook Pro (2019) · Intel i5 · macOS 14.2" }
}
```

### How the flow works

1. **Open**: Hardware probe runs (~2s). Client-side JS collects data. Model receives hardware data and emits the first `page` block — top bar with vitals, body with machine info + action cards. Agent greets in chat. As agent mentions each feature, the corresponding action card's `active` flag becomes true (card lights up with animation).

2. **User picks action**: Clicks Start button (sends chat message) or types directly. Model runs scan commands, then emits a new `page` block. Top bar stays the same (or updates values), body switches to results widgets. Left panel transitions smoothly.

3. **User asks follow-up**: "Find large files" → model emits new `page` with `donut` + `table` in body. Top bar persists. View switches.

4. **User says "go back" or clicks ← Overview**: Model emits the original `page` with `action-cards` → back to feature menu.

5. **Partial updates**: If the model only wants to update the body (not top bar), it can emit just `{ "body": [...] }` — the renderer merges it with the existing page. Top bar and footer stay unless explicitly replaced.

### Why this architecture

- **Fully model-driven**: The model defines the entire layout. No hardcoded views, tabs, or page navigation.
- **Skill-agnostic**: Any skill app can use the same page/widget renderer. Sys-doctor, photo organizer, network monitor — different top bars, different body widgets, same renderer.
- **Progressive**: The page evolves through conversation. Open → action cards → results → deeper analysis. No page reloads, no routing — just JSON swaps.
- **Simple for the model**: Emit a JSON block. No HTML, no CSS, no component APIs. The model thinks in data, the renderer thinks in pixels.
- **Extensible**: Add new widget types by adding a renderer function. The model can use it immediately — no coordination needed.

## Safety rules (unchanged)

1. NEVER execute delete/cleanup commands — only recommend with copy-paste commands.
2. NEVER use sudo (except in recommended commands where user chooses to run them).
3. NEVER read file contents — only metadata (size, path, date, type, hash of first 4KB).
4. NEVER scan `~/.ssh` private key contents, `~/.gnupg`, keychains, or credential files.
5. All recommended commands must be safe to copy-paste.
6. Detect platform (macOS vs Linux) and adjust.
7. Duplicate detection uses only size + partial hash — never reads full file content.

## Privacy

- All data stays local. No telemetry, no upload.
- Scan results cached in localStorage per session.
- File paths shown in dashboard — user should be aware if screen-sharing.
- AI model sees file paths and sizes (needed for analysis) but never file contents.

## Implementation phases

### Phase 1: Health score + trends

Add health score calculation to existing scan. Store history in localStorage. Show score on lobby + dashboard header. Sparkline trend.

Small change, high visibility. Users now have a reason to re-scan.

### Phase 2: Security + Performance tabs

Add security checks and performance analysis to the Full scan. New dashboard tabs. AI includes security and performance in its analysis.

### Phase 3: Deep File Scanner

The big feature. File indexing, type breakdown, duplicate detection, AI labeling. New "Deep Scan" mode. Files tab on dashboard.

This is the CleanMyMac killer. Takes the most effort but delivers the most value.

### Phase 4: Smart Advisor polish

Hardware age detection and upgrade advice. Usage pattern analysis. Proactive warnings (battery, disk trajectory). Buyer's guide conversation.

Makes the AI feel genuinely helpful, not just a data formatter.
