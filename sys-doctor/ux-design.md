# Sys Doctor — UX Design

## Core principle

**The agent is the interface.** There are no menus, no "click to start" buttons, no traditional app chrome. You open sys-doctor and the agent greets you, assesses the situation, and drives the experience. Panels and charts appear as the agent discovers things — they're the agent's output, not pre-built forms.

The feeling: you walked into a doctor's office. The doctor speaks first.

## Opening experience

### First-time user

Full screen. Clean. A single chat-style area centered on screen. No dashboard yet — nothing to show.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                         🩺                                │
│                                                          │
│    Hi, I'm Sys Doctor. I help you understand and         │
│    manage your computer.                                 │
│                                                          │
│    I can scan your system, find wasted disk space,       │
│    check for security issues, and give you a health      │
│    score — like a checkup for your Mac.                  │
│                                                          │
│    Ready for your first scan?                            │
│                                                          │
│    [Quick checkup — 10s]  [Full scan — 30s]  [Deep scan — 3min]
│                                                          │
│    ┌─────────────────────────────────────────┐           │
│    │ Or ask me anything...                   │           │
│    └─────────────────────────────────────────┘           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

The buttons are suggestions, not navigation. User can also type "just check my disk" or "is my battery ok?" and the agent figures out what to do.

### Returning user

The agent remembers. Greeting adapts based on context:

**Healthy system, recent scan:**
```
    Welcome back. Last checkup was 2 days ago — score 87.
    Everything looked good. Want me to check again, or
    is something bothering you?

    [Quick checkup]  [Ask me something]
```

**Score dropped, been a while:**
```
    Hey — it's been 3 weeks since your last scan.
    Score was 73 and trending down. Your disk was filling
    up last time. Want me to check how things look now?

    [Full scan]  [Just check disk]
```

**First time after Deep scan found issues:**
```
    Last time I found 34GB of reclaimable space.
    You cleaned up the Xcode cache (nice, 12GB back)
    but the duplicate videos are still there.

    Want to pick up where we left off?

    [Show last report]  [Fresh scan]
```

**Score is critical:**
```
    Heads up — last scan showed your disk at 94% and
    battery health at 71%. Both need attention.
    Let me run a quick check to see the current state.

    [Scan now]  [Show me the details]
```

## Scan experience — the agent builds the dashboard

This is the key UX innovation. The dashboard doesn't exist as a pre-built layout. It assembles itself as the agent works — panels slide in as data arrives.

### Phase 1: Agent starts working

User says "yes" or clicks a scan button. The centered chat area stays, but shifts left to make room. A subtle progress narrative appears:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Let me take a look...                                   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Disk     │ │ Memory   │ │ CPU      │ │ System   │   │
│  │ ██████░░ │ │ ████░░░░ │ │ █░░░░░░░ │ │ macOS    │   │
│  │ 78%      │ │ 62%      │ │ 8%       │ │ 15.3     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│  Checking disk usage...                                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Cards animate in one by one as data arrives (200ms stagger). Each card has a brief "loading" shimmer, then snaps to real data. The agent narrates below:

```
  Disk is at 78% — up 3% from last time.
  Memory looks fine. Checking what's using space...
```

### Phase 2: Dashboard builds out

As deeper data comes in, panels slide in below the cards:

```
┌──────────────────────────────────────────────────────────┐
│ Health: 73                                    [Re-scan]  │
├────────────────────────────────────┬─────────────────────┤
│                                    │                     │
│  Summary cards (row 1)             │  Agent Chat         │
│  Hardware cards (row 2)            │                     │
│                                    │  "Your disk is 78%  │
│  ┌──────────────────────────────┐  │   used. The biggest │
│  │ Disk Usage                    │  │   growth since last │
│  │ ███████████░░░ ~/Library 45GB │  │   scan is Docker   │
│  │ ████████░░░░░░ ~/Documents   │  │   images — up 4GB. │
│  │ ██████░░░░░░░░ ~/workspace   │  │                     │
│  └──────────────────────────────┘  │   I found 3 things  │
│                                    │   worth cleaning..." │
│  ┌──────────────────────────────┐  │                     │
│  │ Recommendations (appearing)   │  │                     │
│  │ [SAFE] Xcode cache — 12 GB   │  │                     │
│  │ [SAFE] Docker dangling — 4GB  │  │                     │
│  │ [REVIEW] Old downloads — 8GB  │  │                     │
│  └──────────────────────────────┘  │  ┌───────────────┐  │
│                                    │  │ Ask me...     │  │
│                                    │  └───────────────┘  │
├────────────────────────────────────┴─────────────────────┤
│ Score: 73 (↓9 from last month)  •  macOS 15.3  •  M4    │
└──────────────────────────────────────────────────────────┘
```

The layout transition:
1. **Start**: Centered single column (agent greeting)
2. **Scanning**: Cards appear top, agent narration below (still single column)
3. **Data flowing**: Split into two columns — dashboard left, chat right
4. **Complete**: Full dashboard + chat. Agent delivers summary.

The transition should feel organic — the interface grows as the agent has more to show you.

### Phase 3: Agent delivers the verdict

Once all data is in, the agent gives a conversational summary — not a formatted report, but how a doctor would talk:

```
  OK, here's the picture.

  Your Mac is in decent shape — score 73 — but disk is
  the main concern. You're at 78% and climbing.

  Three quick wins:
  1. Xcode DerivedData: 12GB, safe to nuke
  2. Docker dangling images: 4GB, safe
  3. Old Downloads: 8GB, worth reviewing

  That's 24GB back if you clean all three.

  One thing I noticed — your battery has 847 cycles and
  78% health. Still fine, but it's entering the decline
  zone. Worth keeping an eye on.

  Want me to look deeper at anything? I can scan for
  duplicate files, check security, or break down what's
  eating your Library folder.
```

The agent ends with an offer, not a dead end. Always an invitation to go deeper.

## Conversation-driven navigation

There are no tabs. The user explores by talking to the agent.

| User says | Agent does |
|:----------|:-----------|
| "check security" | Runs security checks, security scorecard panel slides in |
| "what about performance?" | Checks processes/startup items, performance panel appears |
| "scan my files deeply" | Starts deep file index, file type chart + large files table appear |
| "tell me about that Docker situation" | Expands Docker section with detailed image list |
| "should I buy a new Mac?" | Hardware assessment + personalized recommendation |
| "show me duplicates" | Runs duplicate detection, duplicates panel appears |
| "what's safe to delete?" | Highlights all safe-labeled items across panels |

Each response may add new panels to the dashboard OR update existing ones. The dashboard is a living document the agent builds through conversation.

### Quick action chips

After the agent's messages, show contextual action chips — shortcuts for common follow-ups. These change based on context:

After initial scan:
```
  [Go deeper — scan files]  [Check security]  [What should I clean?]
```

After security scan:
```
  [Fix the firewall]  [Update outdated packages]  [Check performance]
```

After finding duplicates:
```
  [Show me the duplicates]  [How much can I save?]  [What's safe?]
```

Chips are suggestions, not menus. The user can always type freely.

## Dashboard panels as agent output

Panels are not pre-built UI components waiting to be filled. They are rendered output from the agent's work. This means:

- **Panels appear when relevant.** Security panel only shows if user asks about security or runs a full scan. No empty "Security: not scanned yet" states.
- **Panels can be updated.** Agent says "let me check Docker more carefully" — the existing apps panel expands with Docker details.
- **Panels can be reordered.** Most important findings float to top. If security is critical, it jumps above disk usage.
- **Panels have agent commentary.** Each panel can have a small agent note: "This is where most of your space is going."

## Health score — front and center

The health score is the anchor. It's the first thing users see and the reason they come back.

### On the lobby (before scan)

Big, prominent, with trend:
```
    73
    ↓ from 82 last month

    "Your score dropped mainly because disk is
     filling up. Want me to check what's new?"
```

### On the dashboard (during/after scan)

Top-left corner, always visible. Color-coded:
- 80-100: Green — "Healthy"
- 60-79: Yellow — "Needs attention"
- 0-59: Red — "Take action"

### Score breakdown (expandable)

User clicks the score or asks "why is my score 73?"

```
  Health Score: 73/100

  Disk space     ████████░░  26/30  (78% used, want <80%)
  Memory         ██████████  15/15  (62%, fine)
  Battery        ██████░░░░   9/15  (78% health, aging)
  Security       ███████░░░  14/20  (firewall off)
  Cleanliness    █████░░░░░   5/10  (24GB reclaimable)
  Software       ████████░░   4/10  (17 outdated packages)
```

## Deep scan — file explorer experience

When user asks for a deep scan or says "scan my files", a richer UI appears:

### Progress (deep scan takes minutes)

```
  Scanning your files... this takes a few minutes.

  📂 Indexed: 47,832 files (still scanning...)
  📊 Found: 12 files over 1GB
  🔍 Checking for duplicates...

  I'll tell you what I find as I go.
```

Agent gives interim updates:
```
  Interesting — you have 23GB of video files in
  ~/Documents/Projects. Are those project recordings?
  They're your biggest space consumer after Library.
```

### File type breakdown (when ready)

```
  Here's how your space breaks down:

  ┌─────────────────────────────┐
  │ ████████████ Photos   45 GB │
  │ ████████     Video    30 GB │
  │ ██████       Code     22 GB │
  │ █████        Docs     18 GB │
  │ ████         Archives 14 GB │
  │ ███          Apps     11 GB │
  │ ██           Other     7 GB │
  └─────────────────────────────┘

  Photos are your biggest category. Most are in
  ~/Pictures (38GB) but I found 7GB scattered in
  Desktop and Downloads. Want me to list those?
```

### Large files table

```
  ┌──────┬──────────────────────────────────┬──────┬────────┐
  │ Size │ File                             │ Age  │ Action │
  ├──────┼──────────────────────────────────┼──────┼────────┤
  │ 4.2G │ ~/Downloads/ubuntu-24.04.iso     │ 4mo  │ [SAFE] │
  │ 2.8G │ ~/Movies/screen-recording.mov    │ 1yr  │ [BKUP] │
  │ 1.9G │ ~/Documents/project-backup.zip   │ 8mo  │ [REVIEW]│
  │ 1.2G │ ~/Desktop/presentation-v3.key    │ 2wk  │ [KEEP] │
  └──────┴──────────────────────────────────┴──────┴────────┘
```

Agent comments on findings rather than just listing:
```
  That Ubuntu ISO in Downloads — you already have Ubuntu
  on a VM, right? The ISO is just the installer, safe to
  delete.

  The screen recording in Movies is 2.8GB and a year old.
  Might be worth backing up to an external drive if you
  want to keep it.
```

## Agent personality

The agent should feel like a knowledgeable, slightly casual tech-savvy friend — not a corporate tool and not an overly enthusiastic assistant.

### Tone guidelines

- **Direct, not wordy.** "Disk is at 78%" not "I've completed my analysis of your disk utilization metrics."
- **Opinionated but respectful.** "I'd delete this" not "you may consider potentially removing this file."
- **Notices patterns.** "You have 5 node_modules from projects you haven't touched in months" — shows understanding, not just scanning.
- **Admits uncertainty.** "Not sure what this 2GB file in ~/Library is — might be app data. Worth checking before deleting."
- **Uses humor sparingly.** One light comment per session max. "Your Trash has been holding onto 8GB of memories. Time to let go?"

### What the agent never does

- Never uses corporate speak ("optimize your workflow", "enhance your experience")
- Never uses filler ("Great question!", "I'd be happy to help!")
- Never lists things it can't do — just does what it can
- Never shows raw command output — always interprets it
- Never says "as an AI" — it's a doctor, not a disclaimer

## Mobile / remote experience

Via WebRTC from phone, the layout adapts:

- Single column. Chat-first. Dashboard panels inline between messages.
- Agent greeting → scan → cards appear inline → summary → chips for follow-up.
- Feels like a chat conversation with rich cards, not a dashboard.

```
┌──────────────────┐
│    Sys Doctor     │
├──────────────────┤
│                  │
│ Your Mac scored  │
│ 73 — down from   │
│ 82 last month.   │
│                  │
│ ┌──────────────┐ │
│ │Disk 78% ████ │ │
│ │Mem  62% ███  │ │
│ │Batt 78% ███  │ │
│ └──────────────┘ │
│                  │
│ 3 things to      │
│ clean: 24GB      │
│ total. Want      │
│ details?         │
│                  │
│ [Yes] [Security] │
│                  │
│ ┌──────────────┐ │
│ │ Type here... │ │
│ └──────────────┘ │
└──────────────────┘
```

## State management

### What's stored (localStorage)

- Last scan results (per session ID) — for instant restore on refresh
- Health score history — `[{ date, score, disk_free_gb }]` — for trends
- User's preferred model
- Last scan date — for greeting context

### What's stored (linggen session)

- Chat history — the conversation is the report
- Scan data sent to model — can be re-analyzed with follow-up questions

### Session resume

User returns to a past session:
- Dashboard restores instantly from localStorage cache
- Chat history loads from linggen session
- Agent context is preserved — user can continue asking questions
- "This report is from 5 days ago. Want a fresh scan or have questions about this one?"

## Summary: traditional app vs agent app

| Aspect | Traditional (v1 lobby) | Agent-driven (v2) |
|:-------|:----------------------|:-------------------|
| First screen | Buttons: Quick / Full / Deep | Agent greeting, contextual |
| Starting a scan | User clicks button | Agent suggests, user agrees |
| During scan | Progress bar | Agent narrates, panels build live |
| Results | Pre-built dashboard fills in | Dashboard assembles organically |
| Navigation | Tabs: Health / Files / Security | Conversation: "check security" |
| Follow-up | Click another tab | Ask a question |
| Empty states | "Not scanned yet" | Doesn't exist — panels appear when relevant |
| Personality | None — it's a dashboard | Knowledgeable friend |
| Return visit | Same lobby every time | "Welcome back, score dropped..." |
