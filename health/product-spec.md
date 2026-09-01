---
type: spec
reader: Liang, coding agent, contributors
guide: |
  Product specification for Health Keeper — what it is, every feature we
  could build, the v1 cut, the surfaces, and the workflows. Design.md is the
  companion (data, sync, tools, storage). Brief; not a code reference.
status: draft 2026-09-01 — for Liang's review; nothing built yet
---

# Product Spec: Health Keeper

## Vision

**The health app for people whose job is a computer.** It takes everything
Apple Health holds, keeps months of it on your own Mac, and does the one thing
a wrist tracker cannot: it knows what you were *doing* when the number moved.

The agent drives it. Nobody opens a dashboard. Each morning the agent has
already read the night, joined it to your work, found what tracks with what,
and either acted or proposed one action. The screens exist to show the
evidence and to let you answer.

Three things no incumbent can match at once:

1. **The join.** Linggen alone holds body data *and* life data — git, sessions,
   calendar, screen time, listening, launches. "Resting HR is up 4 bpm every
   release week since June" is a sentence only Linggen can say.
2. **Agency.** It acts through apps that already exist: moves the 9am, starts
   the DJ wind-down at 22:30, tells Yinyue to go quiet, refuses to plan a long
   run after a five-hour night.
3. **Memory.** Months of history in ling-mem, so this week is compared to *your*
   normal, not a population's, and a pattern from March is still known in
   September.

Persona depth comes free from memory: a lifter gets tonnage and deload weeks
because the workouts show lifting; a desk worker gets back and eye breaks
because the Mac shows nine hours in an IDE. No onboarding quiz, no per-persona
code. The app says out loud what it inferred.

## Positioning

- **Not a score.** Apple rings, Oura, Whoop own the score. We rebuild any score
  from raw data with the formula visible, and we never lead with it.
- **Not a chat with your data.** Chat exists (Yinyue on the phone, Ling on the
  Mac) but the front door is the brief.
- **Wellness only.** Activity, sleep, load, habits, patterns. Never diagnosis,
  never medication advice. Medications are read as context, never commented on.
- **Local.** Health data goes phone → Mac over WebRTC and stays there. The
  cloud model sees a day's summary only when the user has consented to cloud.

## Who pays, and how

An **attach**, not a standalone subscription: the app is free on the store,
the payment is the linggen.dev plan. Health Keeper is what makes someone keep
the plan: the daily brief, the patterns pass and the nudges burn Paid tokens
every day, and phone → Mac away from home needs the relay.

Proposed split (open — Liang's call):

- **Free:** full import, sync, the raw data browser, workout and sleep detail,
  one weekly brief.
- **Paid:** the daily brief, patterns, agency (calendar writes, nudges,
  cross-app actions), ask-anything over months of history.

## Everything we could build

Grouped. **v1** marks the first cut; the rest is ordered by how much of v1 it
reuses. Nothing here is a dashboard number.

### A. Data — get everything

| # | Feature | v1 |
|:--|:--------|:--:|
| A1 | Import every readable HealthKit type, incremental with anchors, deletions honored | v1 |
| A2 | Watch workouts in full: HR series, laps, pauses, multisport, GPS route + elevation, HR recovery, effort score | v1 |
| A3 | Running metrics (power, cadence, stride, ground contact, vertical oscillation); cycling power, FTP; swim strokes | v1 |
| A4 | Third-party passthrough: Oura, Garmin, Whoop, Strava, Withings write to HealthKit, so they arrive free | v1 |
| A5 | Background wake: a workout ends or the night's sleep lands → the phone pushes to the Mac without being opened | v1 |
| A6 | Phone → Mac sync over WebRTC; phone is truth, Mac is the mirror; queue while the Mac is away | v1 |
| A7 | Full history backfill on first run (years of Watch data), with progress on the tasks strip | v1 |
| A8 | Typed context by voice or chat: "knee hurts", "travelling", "two coffees", "wine" — never a form | v1 |
| A9 | Life signals join: commits and sessions (git, Linggen sessions), calendar, screen time and IDE hours (Apple Shifu), DJ listening, Pulse launches | v1 (commits + sessions + calendar) |
| A10 | Medications and doses as context (iOS 26), state of mind (iOS 18), clinical FHIR records | later |
| A11 | Weather and air quality joined by day | later |
| A12 | Android via Health Connect | later |

### B. Understanding — better than Apple, AI native

| # | Feature | v1 |
|:--|:--------|:--:|
| B1 | **Morning brief**: one sentence, the evidence, one action taken or proposed | v1 |
| B2 | Personal baselines, not population ranges; every number shown as a delta from *your* normal | v1 |
| B3 | Pattern memory across months: "every release week", "after 23:00 commits", "when travelling", with evidence and confidence | v1 |
| B4 | Sleep: stages, debt, consistency, overnight HRV and wrist temperature, and what tracks with a bad night | v1 |
| B5 | Workout report per session: zones, splits, recovery, effort, "vs your last five", what to do next | v1 |
| B6 | Desk-worker health: sitting streaks from stand hours + Mac activity, late work vs sleep, eye and back breaks tied to real IDE hours | v1 |
| B7 | Ask anything over all history: "my resting HR the week of the launch" | v1 |
| B8 | Weekly written report on Mac and phone | v1 |
| B9 | Honest uncertainty: "not enough data yet" said out loud; a pattern needs weeks, never one night | v1 |
| B10 | Early-illness signal: overnight temperature + HRV + respiratory rate drift vs baseline, said as a hunch | v1 |
| B11 | Our own scores rebuilt from raw with the formula visible: sleep, readiness, training load, VO2max trend | later |
| B12 | Race and pace prediction from VO2max and recent runs | later |
| B13 | Gym: sets, reps, weight by voice; progressive overload plan; tonnage trends; deload weeks | later |
| B14 | Nutrition by voice or photo into HealthKit dietary types | later |
| B15 | Monthly and yearly review in Yinyue's voice | later |

### C. Agency — the agent drives the app

| # | Feature | v1 |
|:--|:--------|:--:|
| C1 | Act on the cause: move a meeting, refuse a long run after a bad night, propose a lighter day | v1 (propose; calendar write behind a tier) |
| C2 | Nudges through Yinyue's herald: stand, wind down, water — rule-gated, model-judged, quiet while you are enjoying something | v1 |
| C3 | Cross-app actions: DJ wind-down playlist at bedtime, Yinyue goes quiet, Pulse waits | v1 (DJ + Yinyue) |
| C4 | Plan the week: workouts as calendar events that adapt to sleep and load | v1 (propose), later (write) |
| C5 | Goals as conversation, kept in memory, tracked in the brief | v1 |
| C6 | Log by voice: "ran 5k, knee sore" → workout note + typed context | v1 |
| C7 | Write back to HealthKit: water, caffeine, mindful minutes, planned or logged workouts | later |
| C8 | Watch: morning one-liner complication, one-tap answers to the agent's questions, start the planned workout | later (watch target not built yet) |
| C9 | Family: several phones, one Mac; each person's rows carry `by`; the brief is per person | later |

### D. Surfaces

| # | Feature | v1 |
|:--|:--------|:--:|
| D1 | Phone: Health under ON THIS PHONE — Brief, Today, Workouts, Sleep, Patterns, Data, Settings | v1 |
| D2 | Mac: Health Keeper page — months of trend, patterns board with evidence, reports, sync state, chat panel | v1 |
| D3 | "Right now" block on the Mac carries the body state (slept 5h40, HR elevated) | v1 |
| D4 | Data browser: every type, count, last sample, source, granted / silent-empty — show everything | v1 |
| D5 | Export everything as CSV and Markdown; it is the user's data | v1 |
| D6 | Watch complication and glance | later |
| D7 | CarPlay: none — health is not a driving surface | never |

### E. Trust

| # | Feature | v1 |
|:--|:--------|:--:|
| E1 | Local only; phone → Mac; never in iCloud, never sold, never for ads (App Review terms) | v1 |
| E2 | Permission ledger on screen: which types were granted, which return nothing, since when | v1 |
| E3 | Every agent action visible as a chip; every mutation behind the tool tier; destructive and calendar writes confirm on the device | v1 |
| E4 | Wellness scope written into the skill and the UI; the agent declines diagnosis and says who to ask | v1 |

## v1 in one paragraph

Import everything, sync to the Mac, one morning brief that joins last night to
yesterday's work, personal baselines, one pattern board that says "not enough
data yet" until it can prove something, workout and sleep detail, a data
browser that hides nothing, nudges through Yinyue, DJ wind-down, and a weekly
report. Calendar writes are proposed, not written, until the tier is built.

## Surfaces (UI)

### Phone — Health, under ON THIS PHONE

Drawer row shows the last sync ("2 min ago") and a pulse while a sync runs.
Title ▾ lists **Today / This week / This month**; ⋮ carries **Sync now / Log
a note / Permissions / Export**. Lists use the ⋯ item menu; nothing swipes.

1. **Brief** (home). The sentence, the evidence chips beneath it, then the
   action: *Done* with Undo, or *Proposed* with Do it / Not today. A text and
   mic field at the bottom goes to Yinyue with the brief as context.
2. **Today.** Six tiles, each a value and a delta from the personal baseline:
   sleep, resting HR, HRV, steps, stand hours, exercise. A seventh, **Work**,
   shows IDE hours and commits after 23:00 — the join, visible every day.
3. **Workouts.** List; detail has the route, HR zones, splits, recovery,
   effort, "vs your last five", and the agent's one paragraph.
4. **Sleep.** Stage bar, debt, consistency, overnight HRV and wrist temp, and
   "what tracks with it".
5. **Patterns.** Cards: claim, confidence ("4 of 5 release weeks since June"),
   evidence rows, first seen. A grey card reads "Not enough data yet — 2 of 4
   weeks" so the user sees it forming.
6. **Data.** Every type: samples, last sample, source, granted or
   silent-empty. Tap a type to browse raw samples.
7. **Settings.** Which types to read, brief time, nudges on/off and quiet
   hours, how blunt the voice is, sync state per Mac, export.

### Mac — Health Keeper page

Web app at `/apps/health/`, same launcher as DJ. Left: months of trend as
small multiples (sleep, resting HR, HRV, load, IDE hours on one time axis),
the patterns board, reports, sync state per device. Right: the chat panel
(LinggenUI). The agent updates the page through PageUpdate, so a question
asked in chat lands on the page, not only in the thread.

### Watch (later)

Complication: the brief's first clause. App: the brief, one-tap answers to the
agent's question of the day ("Knee?" Fine / Sore), start the planned workout.

## Workflows

### 1. First run

1. Open Health in the drawer. One screen: "Everything, or pick" — the
   recommendation is everything, with the ledger explaining that a denied type
   simply shows as empty.
2. iOS permission sheet (Turn All Categories On).
3. Backfill starts: "Reading your history — 3 years, 212 workouts" on the
   tasks strip; the Mac page shows the same progress.
4. First brief needs one night. Until then the Brief screen says what it is
   waiting for. First pattern needs four weeks and says so.

### 2. Every day

- Night lands in HealthKit (usually 06:00–08:00) → phone wakes, syncs the delta
  → Mac runs the brief pass: baselines, last night, yesterday's work, calendar
  today, open patterns, memory → writes the brief → retained topic → phone
  shows it, Yinyue says it once when first spoken to, Mac "Right now" carries
  the state.
- The brief proposes at most one action. Doing it is one tap and one tool call.
- Through the day: nudges only through Yinyue's herald, quiet-while-enjoying,
  never a notification storm.

### 3. After a workout

Watch ends the workout → HealthKit → background delivery wakes the phone → sync
→ Mac writes the workout report → phone shows it in Workouts and, if it is the
day's most useful sentence, tomorrow's brief leads with it.

### 4. Weekly

Sunday evening: the weekly report (sleep, load, work, patterns that moved,
next week's plan). Durable findings are written to memory in the user's terms
so the rest of Linggen knows them.

### 5. Ask

On either surface: "How did I sleep the week of the launch?" → read tools →
answer with the evidence rows attached, and on the Mac the chart on the page.

### 6. Away from the Mac

Phone keeps reading HealthKit and queues the delta. Over the relay the sync
runs the same way. With no Mac reachable, Yinyue answers from the phone's own
last brief and today's numbers; nothing pretends to be fresh.

## What Health Keeper never does

- Diagnose, or comment on medication. It reads them as context and stops.
- Lead with a score, or show a number without the personal baseline beside it.
- Surface a pattern from one week, or hide that a type returned nothing.
- Send health data anywhere but the user's Mac.
- Nudge outside the herald, or nudge while the user is enjoying something.

## Related docs

- [design.md](design.md) — data, sync lane, storage, tools, agent passes.
- [prototype.html](prototype.html) — interactive prototype (phone screens,
  Mac page, Watch, workflows); published at
  https://claude.ai/code/artifact/43f03b3e-15df-4831-ac89-62a182e35525
- `linggen-mobile/doc/health.md` — the phone ⇄ Mac spec, written when the
  phone side is built (one spec per app, in the mobile repo).
- `linggen-app/doc/app-ideas.md` § Health Keeper — the backlog entry.
