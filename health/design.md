---
type: design
reader: Coding agent and contributors
guide: |
  Architectural design for Health Keeper — the HealthKit surface, the
  phone → Mac lane, storage on the Mac, the tool catalog, the agent passes,
  and the rules that keep it honest. Companion to product-spec.md. Brief;
  no code; no roadmap copy.
status: draft 2026-09-01 — for Liang's review; nothing built yet
---

# Design: Health Keeper

## Architecture in one diagram

```
┌────────────────────────── iPhone (the sensor) ──────────────────────────┐
│ HealthKit ──▶ HealthBridge (Swift)  anchored queries, all types,        │
│   Watch,        background delivery, deletions                          │
│   Oura, …          │                                                     │
│                    ▼                                                     │
│              health_sync.dart   delta batches → outbox → /api/bash       │
│              ToolRegistry       health-sync_now, health-log_note, …      │
│              Health screens     Brief · Today · Workouts · Sleep ·       │
│                                 Patterns · Data · Settings               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ WebRTC only: control channel RPC
                                ▼
┌────────────────────────── Mac (the memory) ─────────────────────────────┐
│ skills/health/scripts/                                                   │
│   ingest.mjs   one writer: samples/*.jsonl, workouts.jsonl, state.json   │
│   rollup.mjs   daily/<date>.json, baselines.json                         │
│   query.mjs    GetDay · GetRange · GetWorkout · GetSleep · …             │
│   life.mjs     commits, sessions, calendar, IDE hours → life/<date>.json │
│   brief.mjs    one writer: briefs/<date>.md + retained health/brief      │
│   patterns.mjs one writer: patterns.json (claim + evidence + confidence) │
│                                                                           │
│ Health page /apps/health/   ·   Ling / Yinyue chat   ·   ling-mem         │
│ Missions: morning brief · workout report · weekly report · patterns       │
└─────────────────────────────────────────────────────────────────────────┘
```

The phone reads, the Mac thinks. HealthKit is authoritative; the Mac copy is a
mirror plus everything derived from it. Nothing about health lives in the
engine: the skill declares tools and scripts, the phone app carries a Health
module, and the lane between them is the same door DJ's phone ops use.

## What HealthKit gives us (verified 2026-09-01)

- **Only on iPhone and iPad.** No macOS API. The phone is the sensor, always.
- **Workouts** (80+ activity types): duration, distance, energy, HR series at
  ~5 s during a workout, laps / pauses / segments as `HKWorkoutEvent`,
  multisport `HKWorkoutActivity`, `HKWorkoutRoute` (GPS + elevation),
  `heartRateRecoveryOneMinute`, `workoutEffortScore`, running power / cadence /
  stride / ground contact / vertical oscillation, cycling power / cadence /
  FTP, swim strokes.
- **Daily**: steps, floors, distances, active + basal energy, move / exercise /
  stand minutes, `vo2Max`, resting HR, walking HR average, HRV SDNN, SpO₂,
  respiratory rate, `appleSleepingWristTemperature`, sleep stages (in bed,
  core, deep, REM, awake), `appleSleepingBreathingDisturbances` (iOS 18),
  `timeInDaylight`, environmental + headphone audio exposure, walking speed /
  step length / asymmetry / steadiness, body mass and composition, mindful
  sessions, the full dietary set, water, caffeine.
- **Context**: medications and dose events (iOS 26, `HKUserAnnotatedMedication`),
  state of mind (iOS 18), clinical FHIR records where a provider supports them.
- **Third parties** write into the same store (Oura, Garmin, Whoop, Strava,
  Withings); each sample carries its `sourceRevision`, so provenance is free.
- **Not exposed**: Apple's derived scores — Sleep Score, Vitals outliers,
  Training Load trends. Rebuilt from raw when we want them.
- **Permissions**: per type; read denials are invisible (denied == empty). The
  ledger records "granted at", "first sample", "last sample" per type and
  shows silent-empty honestly.
- **Background**: `HKObserverQuery` + `enableBackgroundDelivery` per type,
  entitlement `com.apple.developer.healthkit.background-delivery`; hourly cap
  for some types, immediate for workouts and sleep. iOS gives the app seconds
  when woken — enough to read the delta and write the outbox, not to sync.
- **Flutter `health` 13.3.2** covers workouts, routes, sleep stages, HRV, ECG,
  wrist temperature. It lacks VO2max, HR recovery, running / cycling metrics,
  time in daylight, state of mind, medications, and background delivery. So
  the phone side is a **native `HealthBridge`** (Swift, same pattern as Apple
  Shifu's `HardwareBridge`) that owns every HealthKit call; the Dart side never
  touches HealthKit directly. The package is not used.

## Phone → Mac lane

The engine's `sync:` is Mac → phone and read-only by design (ingest carries
delete-safety a declaration cannot express). Health is the reverse direction,
so it takes the door DJ's playlist edits already use: **batches up through
`/api/bash` into one skill script under one lock.** Zero engine work.

- **Delta, not state.** `HealthBridge` runs an `HKAnchoredObjectQuery` per
  type and persists the anchor per type per Mac. Each run yields added samples
  and deleted UUIDs since the anchor. Both go into the outbox.
- **Outbox** `Documents/Health/.outbox/<seq>.jsonl.gz` — one file per delta,
  sequence-numbered. A line is `{"uuid","type","start","end","value","unit",
  "source","device","meta"}` or `{"del":"<uuid>","type"}`. A workout line
  carries its events, activities and route as nested arrays and its
  associated series (HR, power, cadence…) as `series: {type: [[t, v], …]}`.
- **Send.** While connected, `health_sync.dart` drains the outbox in order,
  one file per `/api/bash` call: `bun ingest.mjs --device <id> --seq <n>`
  with the payload base64 on stdin. Chunks are capped at ~500 samples or
  256 KB so a call stays well under the tool-output cap and the RPC timeout.
  The reply is `{seq, added, deleted, skipped[]}`; the phone deletes exactly
  the acknowledged file. A lost ack re-sends; `ingest.mjs` dedupes by uuid and
  keeps a bounded ring of applied `seq` per device, so a re-send is a no-op.
- **Backfill** is the same lane with a big anchor gap: the bridge walks
  history newest-first per type in month windows, so the last month lands in
  the first minute and the brief can start while 2023 is still arriving.
  Progress rides the retained `tasks/health` topic (`{phase, done, total}`),
  which both the drawer row and the Mac page read.
- **When woken in the background** the bridge reads the delta and writes the
  outbox file, then stops. The send happens on the next connect; opening the
  app or the Mac's `health/sync-requested` push is what triggers one. No wake
  lock: a health delta is small.
- **Away from the Mac** the outbox simply grows. Over the relay the lane is
  identical. The phone keeps its own `Documents/Health/today.json` (last
  brief, today's rollup) so Yinyue can answer offline from what she has.
- **Never the media channel.** Health payloads are small JSON; the binary
  channel and the wake lock stay with photos and karaoke.
- **Deletions.** A `del` line marks the sample `deleted_at` in the store; the
  Mac never removes a row. Rollups exclude deleted rows. This is the
  delete-safety the generic lane could not express, kept inside the one
  writer.

Later, if a second skill needs phone → Mac records, `ingest:` becomes an
engine-level declaration next to `sync:` and `ingest.mjs` becomes its first
consumer. One consumer does not earn the abstraction (Pulse rule).

## Storage on the Mac

```
~/.linggen/skills/health/
  state.json            per device: anchors, applied-seq ring, ledger
                        (type → granted_at, first, last, count, sources)
  samples/<type>/<YYYY-MM>.jsonl   raw samples, append-only, deleted_at marks
  workouts.jsonl        one line per workout incl. events, route, series refs
  routes/<uuid>.json    GPS route per workout (kept out of the main line)
  daily/<date>.json     rollup: every metric's day value + baseline delta
  baselines.json        per metric: 28-day median, MAD, trend, updated_at
  life/<date>.json      commits, sessions, calendar, IDE hours, listening
  briefs/<date>.md      the morning brief (+ .json: sentence, evidence, action)
  reports/<week>.md     weekly report
  workouts/<uuid>.md    workout report
  patterns.json         [{id, claim, metric, signal, effect, weeks, confidence,
                         evidence[], first_seen, status}]
  goals.json            goals as the user said them + tracked metric
  notes.jsonl           typed context: {at, text, tags[], by}
```

JSONL like every other Linggen store. A year of HealthKit is roughly 200–400k
rows; rollups are computed once per day and cached, so reads are cheap. If
`query.mjs` ever gets slow, the upgrade is a SQLite mirror built from these
files, never a second source of truth.

Rows carry `by` (device + account) per the attribution rules, because two
phones on one Mac are two bodies. Everything derived is per `by`.

## Life signals (the join)

`life.mjs` assembles one file per day from what the Mac already has:

- **Commits** — `git log` across the user's configured workspaces, bucketed by
  hour; "after 23:00" is a first-class count.
- **Sessions** — Linggen session logs (start, end, app, turns).
- **IDE and screen hours** — Apple Shifu's activity readout and the
  perception activity log.
- **Calendar** — today's events via the existing calendar tool; meeting hours,
  first meeting time.
- **Listening** — DJ `now-playing` history; wind-down playlists count.
- **Launches and releases** — Pulse progress log and release tags; a
  "release week" flag.

The join is a day-keyed table: `daily/<date>.json` ⋈ `life/<date>.json`.
Nothing here is health-specific in the engine; every source is an existing
Linggen file or tool.

## Tools

One writer per mutation; agent `cmd:` and page buttons call the same script.
Ops are `health-<tool>` when they cross devices. Read tools are `tier: read`,
writes `tier: edit`; calendar writes and anything that touches another app
confirm on the executing device.

Mac side (SKILL.md):

| Tool | Does | Tier |
|:-----|:-----|:-----|
| `GetDay` | rollup + baseline deltas + life signals for a date | read |
| `GetRange` | one metric (or all) over a range, daily resolution | read |
| `ListWorkouts` / `GetWorkout` | workouts; one workout with series, splits, route summary | read |
| `GetSleep` | one night: stages, overnight HRV / temp / RR, debt, consistency | read |
| `GetLedger` | permission ledger: per type granted / empty / count / sources | read |
| `GetPatterns` | current patterns incl. forming ones | read |
| `FindPattern` | test a claim: metric × signal over N weeks → effect, confidence, evidence | read |
| `GetLife` | life signals for a date or range | read |
| `WriteBrief` | write `briefs/<date>` and publish retained `health/brief` | edit |
| `WriteReport` | weekly or workout report file | edit |
| `SetGoal` / `ClearGoal` | goals as said, with a tracked metric | edit |
| `LogNote` | typed context line | edit |
| `ProposeAction` | attach the day's one action to the brief (move meeting, lighter day, wind-down) | edit |
| `PlanWorkout` | calendar event (later; behind confirm) | edit |
| `Nudge` | enqueue a herald line for Yinyue with a quiet window | edit |
| `Export` | CSV + Markdown bundle to a folder | edit |

Phone side (Dart `ToolRegistry`, published on `phone/tools`):

| Tool | Does | Tier |
|:-----|:-----|:-----|
| `health-sync_now` | drain the outbox now | read |
| `health-log_note` | typed context from voice or chat | edit |
| `health-today` | today's rollup from the phone's own copy (works offline) | read |
| `health-write_sample` | water / caffeine / mindful / workout into HealthKit (later) | edit |
| `health-permissions` | open the ledger screen (user action, never agent-triggered) | — |

Cross-app actions the brief may propose use the owning app's tools:
`dj-play_playlist` for the wind-down, Yinyue's quiet window, the calendar
tool for moving a meeting. Health never writes another app's data.

## Agent passes (missions)

Four scheduled missions, each a runbook in the skill:

1. **Morning brief** — fires when the night's sleep sample arrives (or 08:00
   at the latest). Reads: `GetDay(yesterday)`, `GetSleep(last night)`,
   `GetLife(yesterday, today)`, `GetPatterns`, memory recall for goals and
   context. Writes exactly one brief: one sentence, ≤ 4 evidence chips, ≤ 1
   action. If any input is missing it says which.
2. **Workout report** — fires on a new workout. Zones from personal max HR
   (measured, else estimated and said so), splits, recovery, effort, the last
   five of the same type, one paragraph.
3. **Weekly report** — Sunday 19:00. Also promotes durable findings to memory
   as semantic rows in the user's words.
4. **Patterns pass** — nightly, after rollup. Runs `FindPattern` over the
   declared signal × metric grid and any claim the user made in chat.

Prompt rules that ride in SKILL.md:

- Personal baseline beside every number; never a population range.
- The join first: what the user was doing is the explanation to test before
  anything else.
- Wellness only; medications and clinical records are context, never a topic.
- Voice: Yinyue's, one or two sentences on the phone; the Mac report may run
  a page. No "Done", no capability lists.

## Honesty rules (the kill risk)

n = 1 correlations are the way this product dies. The rules are code, not
prompt:

- A pattern is **forming** until it has ≥ 4 aligned weeks and an effect of
  ≥ 1 MAD from the personal baseline; it is **stable** after 6; it is
  **retired** if two consecutive weeks contradict it. Forming patterns show
  as grey cards with the count.
- Every claim carries its evidence rows and the weeks it was tested on.
- "Not enough data yet" is a first-class state on every screen, with the
  number needed.
- A type with zero samples shows as *empty* with the two possible reasons
  (not granted / no source), never as 0.
- The brief may lead with a hunch (illness signal) only labelled as one.

## Phone app module

`linggen-mobile/lib/services/health/` — `health_bridge.dart` (channel to the
Swift `HealthBridge`), `health_sync.dart` (outbox + drain), `health_store.dart`
(today.json, last brief), `health_tools.dart` (ToolRegistry). Screens under
`lib/screens/health/`. Drawer row under ON THIS PHONE. Item menu via
`item_menu.dart`; no swipe actions.

Native: `ios/Runner/HealthBridge.swift` — authorization for the full type
list, anchored queries, background delivery registration, workout expansion
(events, activities, route, associated series). Entitlements: `healthkit`,
`healthkit.background-delivery`. `NSHealthShareUsageDescription` says what we
do with it in one sentence.

## Mac page

`skills/health/scripts/index.html` + `health.js`, launcher `web`, like DJ.
Reads `daily/`, `patterns.json`, `briefs/`, `reports/`, `state.json` through
`/api/bash` reads; renders only. Buttons call the same scripts the tools call.
Sync state per device from `state.json`. Chat mounts through `chat-bridge.js`.
Pages poll `GET /api/topic/latest?topic=tasks&op=health` for sync progress.

## Topics

| Topic | Direction | Retained | Carries |
|:------|:----------|:---------|:--------|
| `tasks/health` | Mac → phone | yes | backfill / sync progress |
| `health/brief` | Mac → phone | yes | today's brief (sentence, chips, action) |
| `health/sync-requested` | Mac → phone | no | the Mac asking for a drain now |
| `actions/health-*`, `-done` | both | request retained | cross-device tool calls |

Readings retain, actions queue. The brief is a reading: the newest wins.

## Open questions for Liang

1. Skill and app name: `health` / "Health Keeper", or something in the
   Yinyue world?
2. Free vs Paid split as proposed in product-spec, or daily brief free too?
3. Calendar write in v1 behind confirm, or propose-only until the
   `destructive` tier exists in the engine?
4. Should durable patterns go to ling-mem automatically (weekly pass), or
   only when the user says "remember that"?

## Related docs

- [product-spec.md](product-spec.md)
- `linggen-mobile/doc/tech-spec.md` — transport, attribution, device topics.
- `linggen-mobile/doc/dj.md` — the ops-up lane this one copies.
- `linggen/doc/app-action-spec.md` — one writer per mutation, tool tiers.
