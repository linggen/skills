# Apple Shifu — Design Doc

## Vision

A system health analyst skill for Linggen. Runs as an interactive session or autonomous mission. Collects system data via parallel tasks, renders a live dashboard with charts and data panels, and provides an AI chat sidebar for diagnosis and advice — all powered by the LinggenUI SDK.

**Name**: `apple-shifu`

## Use Cases

1. **On-demand**: User runs `/apple-shifu` — opens dashboard, scans system, chat for advice
2. **Scheduled mission**: Weekly cron scan, user opens report later with chat context preserved
3. **Targeted**: "why is my disk full?" — agent focuses on disk, updates dashboard in real-time

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Header: ← Back │ Apple Shifu │ Model Picker │ Scan / Re-scan │
├─────────────────────────────────────┬───────────────────────┤
│                                     │                       │
│  Dashboard (left, flex)             │  Chat Panel (right)   │
│                                     │  LinggenUI SDK        │
│  ┌───────────────────────────────┐  │                       │
│  │ Summary Cards                 │  │  AI diagnosis         │
│  │ Disk: 412/500 GB  RAM: 82%   │  │  "Your biggest win    │
│  │ CPU: 4%   OS: macOS 15.3     │  │   is clearing 12GB    │
│  └───────────────────────────────┘  │   of Xcode cache..."  │
│                                     │                       │
│  ┌───────────────────────────────┐  │  User can ask:        │
│  │ Disk Usage Chart              │  │  "What's safe to      │
│  │ (horizontal bar / treemap)    │  │   delete?"            │
│  └───────────────────────────────┘  │  "Show me Docker      │
│                                     │   images"             │
│  ┌───────────────────────────────┐  │  "Why is /usr/local   │
│  │ Recommendations               │  │   so big?"            │
│  │ [SAFE] Trash: 8.2 GB    [cp] │  │                       │
│  │ [SAFE] npm cache: 3.1GB [cp] │  │  Agent can update     │
│  │ [WARN] Downloads: 14GB  [cp] │  │  dashboard via        │
│  └───────────────────────────────┘  │  [DASHBOARD_UPDATE]   │
│                                     │  tags in responses     │
│  ┌───────────────────────────────┐  │                       │
│  │ App Inventory                 │  │                       │
│  │ brew: 47 pkgs (2.3GB)        │  │                       │
│  │ Docker: 12 images (8.1GB)    │  │                       │
│  │ npm global: 23 pkgs          │  │                       │
│  └───────────────────────────────┘  │                       │
│                                     │                       │
├─────────────────────────────────────┴───────────────────────┤
│ Status bar: Last scanned 2 min ago │ macOS 15.3 │ M4 Pro   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```text
1. User opens /apps/apple-shifu/ (or agent launches via RunApp)
2. UI mounts LinggenUI chat panel on right
3. Chat auto-sends: "[SYS_SCAN] full" (hidden message)
4. Agent receives, runs parallel Bash tasks to collect data
5. Agent responds with:
   - [DASHBOARD_UPDATE]{json}[/DASHBOARD_UPDATE]  ← parsed by onStreamEnd
   - Plus natural language summary in chat
6. UI parses JSON, renders dashboard panels
7. User asks follow-up questions in chat
8. Agent can send more [DASHBOARD_UPDATE] tags to add/update data
```

## LinggenUI SDK Integration

Following the game-table pattern exactly:

### Mount (in `doctor.js`)

```javascript
const chat = LinggenUI.mount(document.getElementById('chat-panel'), {
  skillName: 'apple-shifu',
  agentId: 'ling',
  modelId: selectedModel,
  sessionId: existingSessionId,     // resume from URL param
  title: 'Diagnosis',
  placeholder: 'Ask about your system...',
  onSessionCreated: (sid) => {
    const url = new URL(location.href);
    url.searchParams.set('session', sid);
    history.replaceState({}, '', url);
  },
  onStreamEnd: handleStreamEnd,
});

// Auto-trigger initial scan
setTimeout(() => chat.send('[SYS_SCAN] full'), 200);
```

### Response Parsing (in `handleStreamEnd`)

```javascript
function handleStreamEnd(text) {
  // Extract dashboard data from structured tags
  const match = text.match(/\[DASHBOARD_UPDATE\]([\s\S]*?)\[\/DASHBOARD_UPDATE\]/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      updateDashboard(data);
    } catch (e) {
      console.error('Failed to parse dashboard update', e);
    }
  }

  // Extract recommendations
  const recsMatch = text.match(/\[RECOMMENDATIONS\]([\s\S]*?)\[\/RECOMMENDATIONS\]/);
  if (recsMatch) {
    try {
      const recs = JSON.parse(recsMatch[1]);
      renderRecommendations(recs);
    } catch (e) {}
  }
}
```

## Dashboard Update JSON Schema

The agent sends structured data via `[DASHBOARD_UPDATE]`:

```json
{
  "system": {
    "os": "macOS 15.3 Sequoia",
    "cpu": "Apple M4 Pro (12 cores)",
    "memory": { "total_gb": 36, "used_gb": 29.5, "percent": 82 },
    "uptime": "14 days",
    "hostname": "MacBook-Pro"
  },
  "disk": {
    "total_gb": 500,
    "used_gb": 412,
    "free_gb": 88,
    "percent": 82,
    "mount_points": [
      { "mount": "/", "size_gb": 500, "used_gb": 412, "fs": "apfs" }
    ],
    "top_dirs": [
      { "path": "/Users/liang", "size_gb": 280 },
      { "path": "/Applications", "size_gb": 45 },
      { "path": "/Library", "size_gb": 32 },
      { "path": "/System", "size_gb": 15 }
    ],
    "large_files": [
      { "path": "~/Downloads/ubuntu.iso", "size_mb": 4200, "age_days": 120 }
    ]
  },
  "apps": {
    "brew": { "count": 47, "size_gb": 2.3 },
    "docker": { "images": 12, "size_gb": 8.1, "dangling_gb": 3.2 },
    "npm_global": { "count": 23 },
    "pip": { "count": 156 }
  },
  "garbage": [
    { "path": "~/.Trash", "size_gb": 8.2, "category": "trash", "risk": "safe" },
    { "path": "~/Library/Caches", "size_gb": 6.7, "category": "cache", "risk": "safe" },
    { "path": "~/Library/Developer/Xcode/DerivedData", "size_gb": 12.1, "category": "dev-cache", "risk": "safe" },
    { "path": "~/Downloads (files > 6mo)", "size_gb": 14.3, "category": "stale", "risk": "review" },
    { "path": "node_modules (5 abandoned projects)", "size_gb": 4.8, "category": "dev-cache", "risk": "safe" }
  ]
}
```

## Recommendations JSON Schema

```json
[
  {
    "title": "Empty Trash",
    "description": "8.2 GB of deleted files sitting in Trash",
    "savings_gb": 8.2,
    "risk": "safe",
    "command": "rm -rf ~/.Trash/*",
    "category": "quick-win"
  },
  {
    "title": "Clear Xcode DerivedData",
    "description": "Build artifacts from 23 projects, all regeneratable",
    "savings_gb": 12.1,
    "risk": "safe",
    "command": "rm -rf ~/Library/Developer/Xcode/DerivedData/*",
    "category": "quick-win"
  },
  {
    "title": "Review old Downloads",
    "description": "47 files older than 6 months in ~/Downloads",
    "savings_gb": 14.3,
    "risk": "review",
    "command": "open ~/Downloads",
    "category": "stale-files"
  }
]
```

## UI Components (Vanilla JS, no build step)

### File Structure

```text
apple-shifu/
├── SKILL.md
├── design.md
└── scripts/
    ├── index.html          # Lobby: scan type selector + past sessions
    ├── doctor.html         # Dashboard + chat layout
    ├── doctor.js           # Dashboard logic, LinggenUI mount, data parsing
    ├── charts.js           # Chart rendering (canvas-based, no deps)
    ├── style.css           # Shared theme (same vars as game-table)
    └── doctor.css          # Dashboard-specific layout
```

### index.html (Lobby)

```text
┌────────────────────────────────────┐
│         🩺 Apple Shifu              │
│                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ Full │ │ Disk │ │Quick │      │
│  │ Scan │ │ Only │ │Check │      │
│  └──────┘ └──────┘ └──────┘      │
│                                    │
│  Model: [claude-sonnet-4-6  ▾]    │
│                                    │
│  ── Past Scans ──                  │
│  Mar 17, 2026 - Full   [Open][🗑] │
│  Mar 10, 2026 - Disk   [Open][🗑] │
│                                    │
└────────────────────────────────────┘
```

### doctor.html (Dashboard + Chat)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apple Shifu</title>
  <link rel="icon" type="image/svg+xml" href="/logo.svg">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="doctor.css">
</head>
<body>
  <div class="header">
    <button class="btn-back" id="back-btn">← Menu</button>
    <h1>Apple Shifu</h1>
    <div class="header-actions">
      <span class="scan-status" id="scan-status">Ready</span>
      <button class="btn btn-primary btn-sm" id="scan-btn">Scan</button>
      <select id="model-switcher"></select>
    </div>
  </div>

  <div class="doctor-container">
    <!-- Left: Dashboard -->
    <div class="dashboard-panel" id="dashboard">
      <!-- Summary cards -->
      <div class="summary-cards" id="summary-cards">
        <div class="card" id="card-disk">
          <div class="card-label">Disk</div>
          <div class="card-value">--</div>
          <div class="card-bar"><div class="card-bar-fill"></div></div>
        </div>
        <div class="card" id="card-memory">
          <div class="card-label">Memory</div>
          <div class="card-value">--</div>
          <div class="card-bar"><div class="card-bar-fill"></div></div>
        </div>
        <div class="card" id="card-cpu">
          <div class="card-label">CPU</div>
          <div class="card-value">--</div>
        </div>
        <div class="card" id="card-os">
          <div class="card-label">OS</div>
          <div class="card-value">--</div>
        </div>
      </div>

      <!-- Disk usage chart -->
      <div class="panel" id="disk-panel">
        <h3>Disk Usage</h3>
        <canvas id="disk-chart" width="600" height="300"></canvas>
      </div>

      <!-- Recommendations -->
      <div class="panel" id="recs-panel">
        <h3>Recommendations</h3>
        <div id="recs-list"></div>
      </div>

      <!-- App inventory -->
      <div class="panel" id="apps-panel">
        <h3>Installed Software</h3>
        <div id="apps-grid"></div>
      </div>
    </div>

    <!-- Right: Chat -->
    <div class="chat-panel" id="chat-panel"></div>
  </div>

  <script src="/sdk/linggen-ui.umd.js"></script>
  <script type="module" src="doctor.js"></script>
</body>
</html>
```

### doctor.css (Layout)

```css
.doctor-container {
  display: flex;
  height: calc(100vh - 52px);
  gap: 0;
}

.dashboard-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-panel {
  width: 380px;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--border);
}

/* Summary cards row */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.card-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.card-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-top: 4px;
}

.card-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.card-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease;
}

/* Panels */
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.panel h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

/* Recommendation cards */
.rec-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  margin-bottom: 8px;
  transition: background 0.15s;
}

.rec-item:hover {
  background: var(--bg-hover);
}

.rec-risk {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.rec-risk.safe { background: #dcfce7; color: #166534; }
.rec-risk.review { background: #fef3c7; color: #92400e; }
.rec-risk.caution { background: #fee2e2; color: #991b1b; }

.rec-info {
  flex: 1;
  min-width: 0;
}

.rec-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.rec-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.rec-savings {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}

.rec-copy {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.rec-copy:hover {
  background: var(--bg-hover);
  color: var(--text);
}

/* App inventory grid */
.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}

.app-item {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  text-align: center;
}

.app-name { font-size: 12px; font-weight: 600; color: var(--text); }
.app-stat { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* Scan status */
.scan-status {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}

.scan-status.scanning {
  background: #dbeafe;
  color: #1d4ed8;
  animation: pulse 1.5s ease-in-out infinite;
}

.scan-status.done {
  background: #dcfce7;
  color: #166534;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

## Charts (canvas-based, zero deps)

### charts.js

Minimal chart library — horizontal bar chart for disk usage:

```javascript
export function drawDiskChart(canvas, topDirs, totalGb) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const barH = 28, gap = 8, labelW = 140, barAreaW = W - labelW - 80;
  const maxGb = totalGb;
  const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

  topDirs.forEach((dir, i) => {
    const y = i * (barH + gap) + 20;
    const barW = (dir.size_gb / maxGb) * barAreaW;

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(dir.path.replace(/^\/Users\/\w+/, '~'), labelW - 8, y + 18);

    // Bar
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.roundRect(labelW, y, barW, barH, 4);
    ctx.fill();

    // Size label
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(`${dir.size_gb.toFixed(1)} GB`, labelW + barW + 8, y + 18);
  });
}
```

## SKILL.md (Full Draft)

```yaml
---
name: apple-shifu
description: >-
  System health analyst. Scans disk, apps, caches, and system info.
  Opens interactive dashboard with charts and AI-powered diagnosis chat.
allowed-tools: [Bash, Read, Glob, Grep, Task, Write]
user-invocable: true
argument-hint: "[full | disk | apps | quick]"
app:
  launcher: web
  entry: scripts/index.html
  width: 1100
  height: 800
---

You are Apple Shifu, a system health analyst for Linggen.

## Your Job

When the user invokes you (or a [SYS_SCAN] message arrives), collect system data
and respond with structured dashboard updates + natural language diagnosis.

## Response Format

Always include dashboard data in your response using these tags:

[DASHBOARD_UPDATE]
{json object matching the dashboard schema}
[/DASHBOARD_UPDATE]

[RECOMMENDATIONS]
[{recommendation objects}]
[/RECOMMENDATIONS]

After the tags, write a concise natural language summary:
- Top 3 findings
- Biggest space savings opportunity
- Any system health concerns

## Data Collection

Run these commands (use Task for parallelism when doing full scan):

### Disk
- `df -h` for mount points
- `du -sh ~/Desktop ~/Documents ~/Downloads ~/Library ~/Pictures ~/Music ~/Movies 2>/dev/null`
- `du -sh ~/.Trash 2>/dev/null`
- `find ~ -maxdepth 4 -type f -size +100M 2>/dev/null | head -20`

### System
- `sw_vers` (macOS) or `cat /etc/os-release` (Linux)
- `sysctl -n hw.ncpu hw.memsize` (macOS) or `nproc && free -h` (Linux)
- `uptime`
- `uname -m`

### Apps
- `brew list --versions 2>/dev/null | wc -l` + `du -sh $(brew --prefix) 2>/dev/null`
- `docker images --format '{{.Size}}' 2>/dev/null | wc -l`
- `npm ls -g --depth=0 2>/dev/null | wc -l`
- `pip list 2>/dev/null | wc -l`

### Garbage
- `du -sh ~/Library/Caches 2>/dev/null`
- `du -sh ~/Library/Developer/Xcode/DerivedData 2>/dev/null`
- `find ~ -maxdepth 4 -name node_modules -type d 2>/dev/null | head -20`
- `docker system df 2>/dev/null`

## Safety Rules

1. NEVER execute delete commands — only recommend them
2. NEVER use sudo
3. NEVER scan ~/.ssh, ~/.gnupg, or keychain files
4. All suggested commands must be safe to copy-paste (dry-run where possible)
5. Detect platform (macOS vs Linux) and adjust commands accordingly
```

## Interaction Patterns

### Pattern 1: Initial Scan

```text
User opens dashboard → auto-sends [SYS_SCAN] full
Agent: runs commands → responds with [DASHBOARD_UPDATE] + summary
Dashboard: renders charts, cards, recommendations
Chat: shows "Your system looks healthy overall. Biggest opportunity:
       12GB of Xcode DerivedData. Here are my top recommendations..."
```

### Pattern 2: Follow-up Question

```text
User types: "What are those node_modules?"
Agent: (has full context from initial scan)
       responds with details about the 5 abandoned projects
       optionally sends [DASHBOARD_UPDATE] with expanded node_modules section
```

### Pattern 3: Targeted Scan

```text
User types: "Scan Docker specifically"
Agent: runs docker-focused commands
       sends [DASHBOARD_UPDATE] with detailed Docker breakdown
       "You have 12 images totaling 8.1GB. 3 are dangling (3.2GB)..."
```

### Pattern 4: Mission Mode

```text
Cron triggers → creates session with skill: apple-shifu
Agent auto-runs full scan (no user interaction needed)
Sends [DASHBOARD_UPDATE] + summary as final message
User opens session later → sees dashboard + can chat with full context
```

## v1 Scope

- macOS focus (Linux fallback commands included)
- 4 summary cards (disk, memory, CPU, OS)
- Horizontal bar chart for disk usage
- Recommendation cards with copy-paste commands
- App inventory grid
- LinggenUI chat sidebar
- Session persistence via URL param
- Model switching

## Future (v2+)

- Scan history + trend charts ("you freed 20GB this month")
- Live-updating dashboard (periodic re-scan via interval)
- Treemap visualization for disk usage
- Docker deep analysis (layers, volumes, build cache)
- Process monitor (top CPU/memory consumers)
- Network diagnostics panel
- Linux + WSL full support
- Export report as PDF/HTML
