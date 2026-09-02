---
type: design
reader: Coding agent and contributors
guide: |
  Architectural design for Linggen Health — the HealthKit surface, the
  phone → Mac lane, storage on the Mac, the profile / composition / plan /
  checklist schemas, the tool catalog, the agent passes, and the rules that
  keep it honest. Companion to product-spec.md. Brief; no code; no roadmap.
status: draft 2026-09-02 — direction set by Liang; nothing built yet
---

# Design: Linggen Health

## Architecture in one diagram

```
┌────────────────────────── iPhone (the sensor) ──────────────────────────┐
│ HealthKit ──▶ HealthBridge (Swift)  anchored queries, all types,        │
│   Watch, scale,  characteristics, background delivery, deletions        │
│   Oura, …          │                                                     │
│                    ▼                                                     │
│              health_sync.dart   samples + attention → outbox → /api/bash │
│              ToolRegistry       health-check_item, health-log, …         │
│              Health screens     Home (composed) · Plan · Track ·         │
│                                 Workouts · Patterns · Data · Settings    │
│              Renderer           card catalog → layout.json → Home        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ WebRTC only: control channel RPC
                                ▼
┌────────────────────────── Mac (the memory + the agent) ─────────────────┐
│ skills/health/scripts/                                                   │
│   ingest.mjs    one writer: samples/*.jsonl, workouts.jsonl, attention   │
│   rollup.mjs    daily/<date>.json, baselines.json, progress/*.json       │
│   profile.mjs   profile.json  (inferred; confidence + evidence per field)│
│   compose.mjs   layout.json + layouts/<ts>.json (one writer; undo)       │
│   plan.mjs      plans/<week>.json, targets.json, adjustments             │
│   checklist.mjs checklist/<date>.json (derived; auto-check from samples) │
│   weather.mjs   Open-Meteo by day/hour, cached per day                   │
│   query.mjs     GetDay · GetRange · GetWorkout · GetProgress · …         │
│   life.mjs      screen time, commits, sessions, calendar → life/<date>   │
│   brief.mjs     briefs/<date>.md + retained health/brief                 │
│   patterns.mjs  patterns.json (claim + evidence + confidence)            │
│                                                                           │
│ Health page /apps/health/   ·   Ling / Yinyue chat   ·   ling-mem         │
│ Passes: morning · workout report · weekly (profile → compose → plan)     │
│         · patterns nightly                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

The phone reads and renders, the Mac thinks. HealthKit is authoritative; the
Mac copy is a mirror plus everything derived from it. Nothing about health
lives in the engine: the skill declares tools and scripts, the phone app
carries a Health module with a card renderer, and the lane between them is the
same door DJ's phone ops use.

The persona is not code. `profile.mjs` infers it, `compose.mjs` turns it into
a layout from a fixed card catalog, `plan.mjs` turns it into a week. A new kind
of user needs a new card at most, never a new branch.

## What HealthKit gives us (verified 2026-09-01)

- **Only on iPhone and iPad.** No macOS API. The phone is the sensor, always.
- **Workouts** (80+ activity types): duration, distance, energy, HR series at
  ~5 s during a workout, laps / pauses / segments as `HKWorkoutEvent`,
  multisport `HKWorkoutActivity`, `HKWorkoutRoute` (GPS + elevation),
  `heartRateRecoveryOneMinute`, `workoutEffortScore`, running power / cadence /
  stride / ground contact / vertical oscillation, cycling power / cadence /
  FTP, swim strokes. `HKMetadataKeyIndoorWorkout` marks indoor sessions; a
  route marks outdoor. Indoor vs outdoor is in the data.
- **Characteristics**: date of birth, biological sex, blood type, height (as a
  quantity sample), wheelchair use — the profile's fixed facts.
- **Body**: body mass, body fat %, lean body mass, BMI, waist — written by any
  connected scale (Withings, Eufy, Renpho…) through its own app.
- **Daily**: steps, floors, distances, active + basal energy, move / exercise /
  stand minutes, `vo2Max`, resting HR, walking HR average, HRV SDNN, SpO₂,
  respiratory rate, `appleSleepingWristTemperature`, sleep stages,
  `appleSleepingBreathingDisturbances` (iOS 18), `timeInDaylight`, audio
  exposure, walking metrics, mindful sessions, the full dietary set (protein,
  carbs, fat, energy, water, caffeine — written by food apps).
- **Context**: medications and dose events (iOS 26), state of mind (iOS 18),
  clinical FHIR records where a provider supports them.
- **Third parties** write into the same store; each sample carries its
  `sourceRevision`, so provenance is free.
- **Not exposed**: Apple's derived scores — Sleep Score, Vitals outliers,
  Training Load trends. Sets and reps are not a HealthKit concept; a strength
  workout is duration + HR + energy. Sets come from voice or tap.
- **Permissions**: per type; read denials are invisible (denied == empty). The
  ledger records "granted at", "first sample", "last sample" per type.
- **Background**: `HKObserverQuery` + `enableBackgroundDelivery` per type,
  entitlement `com.apple.developer.healthkit.background-delivery`; hourly cap
  for some types, immediate for workouts, sleep and body mass.
- **Flutter `health` 13.3.2** lacks VO2max, HR recovery, running / cycling
  metrics, characteristics beyond the basics, time in daylight, state of mind,
  medications, and background delivery. So the phone side is a **native
  `HealthBridge`** (Swift, same pattern as Apple Shifu's `HardwareBridge`) that
  owns every HealthKit call. The package is not used.

## Phone → Mac lane

The engine's `sync:` is Mac → phone and read-only by design. Health is the
reverse direction, so it takes the door DJ's playlist edits already use:
**batches up through `/api/bash` into one skill script under one lock.** Zero
engine work.

- **Delta, not state.** `HealthBridge` runs an `HKAnchoredObjectQuery` per
  type and persists the anchor per type per Mac. Each run yields added samples
  and deleted UUIDs since the anchor. Both go into the outbox.
- **Outbox** `Documents/Health/.outbox/<seq>.jsonl.gz` — one file per delta,
  sequence-numbered. A line is `{"uuid","type","start","end","value","unit",
  "source","device","meta"}`, `{"del":"<uuid>","type"}`, or an attention line
  `{"att":"open|expand|dismiss|pin|hide|ask","card":"<kind>","at"}`. A workout
  line carries its events, activities and route as nested arrays and its
  series as `series: {type: [[t, v], …]}`. A characteristics line is sent once
  and on change.
- **Send.** While connected, `health_sync.dart` drains the outbox in order,
  one file per `/api/bash` call: `bun ingest.mjs --device <id> --seq <n>` with
  the payload base64 on stdin. Chunks are capped at ~500 samples or 256 KB. The
  reply is `{seq, added, deleted, skipped[]}`; the phone deletes exactly the
  acknowledged file. `ingest.mjs` dedupes by uuid and keeps a bounded ring of
  applied `seq` per device, so a re-send is a no-op.
- **Backfill** walks history newest-first per type in month windows, so the
  last months land in the first minute and the profile pass can run while
  2023 is still arriving. Progress rides the retained `tasks/health` topic.
- **When woken in the background** the bridge reads the delta and writes the
  outbox file, then stops. The send happens on the next connect; the Mac's
  `health/sync-requested` push can trigger one. No wake lock.
- **Away from the Mac** the outbox grows. The phone keeps
  `Documents/Health/today.json` (last layout, plan, checklist, brief, today's
  rollup) so Home renders and items can be checked offline; checks queue as
  attention lines.
- **Deletions.** A `del` line marks the sample `deleted_at`; the Mac never
  removes a row. Rollups exclude deleted rows.

## Storage on the Mac

```
~/.linggen/skills/health/
  state.json               per device: anchors, applied-seq ring, ledger
  samples/<type>/<YYYY-MM>.jsonl   raw samples, append-only, deleted_at marks
  workouts.jsonl           one line per workout incl. events, route, series refs
  routes/<uuid>.json       GPS route per workout
  attention.jsonl          {at, card, act, by}
  daily/<date>.json        rollup: every metric's day value + baseline delta
  baselines.json           per metric: 28-day median, MAD, trend
  progress/<metric>.json   weekly series for the goal charts (weight 7-day avg,
                           per-km time, weekly km, tonnage, resting HR, HRV)
  life/<date>.json         screen time, IDE hours, commits, sessions, calendar
  profile.json             the inferred profile (schema below)
  layout.json              current composition; layouts/<ts>.json history
  targets.json             nutrition + training targets with the formula
  plans/<week>.json        the week's plan + adjustments
  checklist/<date>.json    derived daily checklist with check state
  weather/<date>.json      Open-Meteo day + hours, cached
  briefs/<date>.md         the morning brief (+ .json)
  reports/<week>.md        weekly report;  workouts/<uuid>.md  workout report
  patterns.json            [{id, claim, metric, signal, effect, weeks,
                            confidence, evidence[], first_seen, status}]
  goals.json               goals as the user said them + tracked metric
  notes.jsonl              typed context: {at, text, tags[], by}
```

JSONL like every other Linggen store. Rows carry `by` (device + account)
because two phones on one Mac are two bodies; everything derived is per `by`.

## Schemas

### profile.json — who the agent thinks you are

```
{ "by": "…", "updated_at": "…",
  "body":     { "age": 41, "sex": "male", "height_cm": 176, "weight_kg": 78.4,
                "weight_at": "2026-09-01" },
  "athlete":  { "kind": "runner|lifter|cyclist|swimmer|walker|none",
                "environment": "outdoor|indoor|mixed", "level": "new|regular|serious",
                "sessions_per_week": 3.4, "typical_days": ["tue","thu","sat"],
                "confidence": 0.86,
                "evidence": ["41 of 52 workouts are Outdoor Run", "median 3.4/wk since May"] },
  "goal":     { "kind": "bulking|cutting|race|distance|sleep|move|none",
                "said": "bulking, 82 kg by December", "target": {"weight_kg": 82},
                "since": "2026-08-28", "source": "user" },
  "routine":  { "wake": "06:40", "bed": "23:50", "desk_hours": 8.9,
                "sitting_streak_max_min": 140, "screen_hours": 10.2,
                "confidence": 0.9, "evidence": ["Shifu 28-day median"] },
  "attention": { "top": ["running", "pace_history", "sleep"], "hidden": ["steps"] },
  "said":     [ {"at": "…", "text": "knee is fine now"} ],
  "corrections": [ {"at": "…", "field": "athlete.environment", "to": "indoor"} ] }
```

Every inferred field carries `confidence` and `evidence`. A `corrections`
entry wins over inference for that field until the user changes it again.
Body facts come from HealthKit characteristics and the latest body-mass
sample; nothing is asked that the data already knows.

### Card catalog — code, declarative

Each card kind declares what it needs and what it answers. `compose.mjs`
validates a layout against this list; the phone renderer has one widget per
kind. Adding a kind is one entry plus one widget.

| kind | needs | answers |
|:-----|:------|:--------|
| `brief` | briefs/today | the sentence, evidence chips, today's session |
| `plan_today` | plans/week | what to do today and why; weather if outdoors |
| `checklist` | checklist/today | the items, checked state |
| `running` | last run, baselines | last run vs your normal |
| `pace_history` | progress/pace_km | per-km time over weeks |
| `distance_week` | progress/weekly_km | weekly km vs plan |
| `lifting_split` | plans/week | this week's split, next session |
| `weight_trend` | progress/weight, goal | 7-day average vs goal line |
| `protein` | checklist, targets | today's protein vs target, formula |
| `screen_time` | life/today, baselines | screen and IDE hours vs normal |
| `sitting` | daily stand hours, life | longest sitting streak, breaks |
| `sleep` | last night, baselines | asleep, stages, debt |
| `hrv` / `resting_hr` | daily, baselines | value vs normal, 14-day spark |
| `heart_history` | progress/resting_hr, hrv | months of heart |
| `vo2max` | daily | trend |
| `steps` | daily | vs normal |
| `patterns` | patterns.json | the stable and forming claims |
| `weather_window` | weather/today | the dry hours today (outdoor only) |
| `work_join` | life/today | IDE hours, late commits, meetings |

### layout.json — the composition

```
{ "by": "…", "composed_at": "2026-08-31T19:02Z", "pass": "weekly",
  "why": "Weight trend on top because you said you're bulking on 28 Aug.",
  "previous": "layouts/2026-08-24T19:01Z.json",
  "pinned": ["sleep"], "hidden": ["steps"],
  "cards": [
    { "kind": "brief" },
    { "kind": "plan_today", "size": "wide" },
    { "kind": "weight_trend", "size": "wide", "headline": "78.4 → 82 by December" },
    { "kind": "protein", "headline": "160 g · 2.0 g/kg" },
    { "kind": "checklist" },
    { "kind": "sleep" }, { "kind": "hrv" }, { "kind": "patterns" } ] }
```

Rules, in `compose.mjs` not in the prompt: at most 9 cards; `brief` always
first; pinned cards keep their slot; hidden cards never appear; a layout is
written only by the weekly pass, a profile correction, or a goal change; every
write records `previous`; Undo restores `previous` and pins every card it
contains for four weeks so the agent does not re-propose the same move.

### plans/<week>.json

```
{ "week": "2026-W36", "goal": "bulking", "written_at": "…", "why": "…",
  "targets_ref": "targets.json",
  "days": [
    { "date": "2026-09-01", "session": { "kind": "lift", "name": "Push",
        "detail": "chest, shoulders, triceps · 5 exercises · 3×8", "minutes": 55 },
      "why": "Monday is your most-kept training day (11 of 12)." },
    { "date": "2026-09-02", "rest": true, "why": "HRV 9 below normal after Monday." },
    { "date": "2026-09-03", "session": { "kind": "run", "name": "Easy 6 km",
        "minutes": 36, "weather": { "rain_mm": 0.2, "temp_c": 17, "window": "07:00–10:00" } },
      "why": "Dry morning; Thursday is rain all day." } ],
  "adjustments": [ { "at": "2026-09-02T06:58Z", "date": "2026-09-02",
                     "from": "Legs", "to": "rest", "why": "slept 5h40, HRV −9" } ] }
```

### targets.json

```
{ "protein_g": 160, "protein_formula": "2.0 g/kg × 78.4 kg (bulking, regular)",
  "kcal": 2900, "kcal_formula": "TDEE 2600 + 300 surplus",
  "water_ml": 3000, "sessions_per_week": 4,
  "supplements": [ { "name": "creatine monohydrate", "dose": "5 g/day",
                     "evidence": "well supported for strength and lean mass" },
                   { "name": "BCAA", "dose": null,
                     "evidence": "no added benefit when protein target is met" } ] }
```

Targets show their formula on screen. Supplement lines are evidence in plain
words, never a brand.

### checklist/<date>.json

```
{ "date": "2026-09-01", "items": [
   { "id": "protein", "label": "Protein", "target": 160, "unit": "g", "value": 128,
     "done": false, "source": "healthkit:dietaryProtein" },
   { "id": "session", "label": "Push · 5 exercises", "done": true,
     "source": "healthkit:workout:…" },
   { "id": "sets_legs", "label": "Legs · 4 sets", "done": true, "source": "voice", "at": "…" },
   { "id": "weigh", "label": "Weigh-in", "done": true, "source": "healthkit:bodyMass" },
   { "id": "creatine", "label": "Creatine 5 g", "done": false, "source": "tap" },
   { "id": "water", "label": "Water", "target": 3000, "unit": "ml", "value": 1900,
     "done": false, "source": "healthkit:dietaryWater" } ] }
```

`checklist.mjs` derives the day's items from the plan and targets, then marks
them from samples as they land; what HealthKit cannot see (sets, a pill) is a
tap or a voice line. A check is an attention line in the outbox, so it works
offline and lands when the Mac is back.

## Life signals (the join)

`life.mjs` assembles one file per day from what the Mac already has: Apple
Shifu's screen time and IDE hours, `git log` across configured workspaces
bucketed by hour, Linggen sessions, calendar events, DJ listening, Pulse
launches. The join is `daily/<date>.json ⋈ life/<date>.json`. Nothing here is
health-specific in the engine.

## Weather

`weather.mjs` calls Open-Meteo (no key) for the user's location, caches one
file per day, and is invoked only when `profile.athlete.environment` is
`outdoor` or `mixed`. An indoor athlete never triggers it. Location comes from
the phone once per day as a coarse lat/lon line in the outbox, with the user's
permission, rounded to ~1 km.

## Tools

One writer per mutation; agent `cmd:` and page buttons call the same script.
Ops are `health-<tool>` when they cross devices. Read tools are `tier: read`,
writes `tier: edit`; anything that touches another app confirms on the
executing device.

Mac side (SKILL.md):

| Tool | Does | Tier |
|:-----|:-----|:-----|
| `GetProfile` | the profile with confidence and evidence | read |
| `SetProfileField` | a correction from the user ("not quite") — wins over inference | edit |
| `GetLayout` / `ListLayouts` | current composition; history with reasons | read |
| `Compose` | write a new layout with why + previous (weekly pass, goal change, correction) | edit |
| `Undo` / `PinCard` / `HideCard` | user actions on the composition | edit |
| `GetPlan` / `WritePlan` / `AdjustDay` | the week; a day moved with its why | read / edit |
| `GetTargets` / `SetTargets` | nutrition and training targets with formula | read / edit |
| `GetChecklist` / `CheckItem` | today's items; a manual check | read / edit |
| `GetWeather` | day + hours for the user's location (outdoor profiles only) | read |
| `GetProgress` | one goal metric as a weekly series with the goal line | read |
| `GetDay` / `GetRange` | rollup + baseline deltas + life signals; one metric over a range | read |
| `ListWorkouts` / `GetWorkout` / `GetSleep` | detail | read |
| `GetLedger` / `GetPatterns` / `FindPattern` / `GetLife` | as before | read |
| `WriteBrief` / `WriteReport` | the brief; weekly or workout report | edit |
| `SetGoal` / `ClearGoal` / `LogNote` | goals as said; typed context | edit |
| `Nudge` | enqueue a herald line for Yinyue with a quiet window | edit |
| `Export` | CSV + Markdown bundle | edit |
| `PlanToCalendar` | mirror the week into Calendar (later; opt-in; confirm) | edit |
| `MarketSearch` | buyer advice on ask (later; cloud search; source shown) | read |

Phone side (Dart `ToolRegistry`, published on `phone/tools`):

| Tool | Does | Tier |
|:-----|:-----|:-----|
| `health-sync_now` | drain the outbox now | read |
| `health-check_item` | check or uncheck an item (tap, voice) — queues offline | edit |
| `health-log` | voice or chat line: "4 sets legs", "protein shake", "knee sore" → checklist + note | edit |
| `health-today` | Home, plan, checklist from the phone's own copy (works offline) | read |
| `health-write_sample` | water / protein / workout into HealthKit (later) | edit |
| `health-permissions` | open the ledger screen (user action, never agent-triggered) | — |

## Agent passes (missions)

Four scheduled missions, each a runbook in the skill:

1. **Morning pass** — fires when the night's sleep lands (08:00 at the latest).
   Reads `GetDay(yesterday)`, `GetSleep`, `GetLife`, `GetPlan`, `GetWeather`
   if outdoors, `GetPatterns`, memory. Writes the brief (one sentence, ≤ 4
   chips, today's session), today's checklist, and at most one `AdjustDay`
   with its why. Never touches the layout.
2. **Workout report** — fires on a new workout. Zones from measured max HR,
   splits, recovery, "vs your last five", one paragraph; checks the session
   off; updates progress.
3. **Weekly pass** — Sunday 19:00. `profile.mjs` refresh from the week's data,
   attention and notes → `Compose` only if a profile field moved past its
   threshold or the goal changed (why-line + previous) → `WritePlan` for next
   week from goal, level, load, adherence, calendar, weather outlook →
   `SetTargets` if body or goal moved → the weekly report → durable profile
   facts to memory in the user's words.
4. **Patterns pass** — nightly, after rollup.

Prompt rules that ride in SKILL.md:

- The charter: help this person get better at what they are trying to do, and
  make them love the app. A coach who notices, never a nag.
- Personal baseline beside every number; never a population range.
- Say why: every layout, plan day and adjustment carries its reason in the
  user's terms.
- Wellness only; supplements as evidence, never a brand unprompted; medications
  and clinical records are context, never a topic.
- Voice: Yinyue's, one or two sentences on the phone; the Mac report may run a
  page. No "Done", no capability lists.

## Honesty rules (the kill risk)

The rules are code, not prompt:

- **Profile**: a field is shown only above 0.6 confidence with its evidence;
  below that Home asks one question instead of guessing. A correction wins.
- **Layout**: moves only at the weekly pass or on a user action; every write
  has a why and a previous; Undo pins for four weeks.
- **Patterns**: forming until ≥ 4 aligned weeks and ≥ 1 MAD of effect; stable
  after 6; retired after two contradictions.
- **Weight**: shown as a 7-day average; a trend needs two weeks; a single
  weigh-in is never a headline.
- **Targets**: every number shows its formula; changing a body fact re-derives
  it visibly.
- **Checklist**: an auto-checked item names its source; "empty" is not "0 g".
- **Weather**: a plan day that depends on it shows the forecast it used; a
  changed forecast re-adjusts with a why.
- **Types**: zero samples shows as *empty* with both possible reasons.

## Phone app module

`linggen-mobile/lib/services/health/` — `health_bridge.dart` (channel to the
Swift `HealthBridge`), `health_sync.dart` (outbox + drain), `health_store.dart`
(today.json), `health_tools.dart` (ToolRegistry). `lib/screens/health/` —
`home.dart` renders `layout.json` through `cards/` (one widget per catalog
kind), plus `plan.dart`, `track.dart`, `workouts.dart`, `patterns.dart`,
`data.dart`, `settings.dart`, `who_you_are.dart`. Drawer row under ON THIS
PHONE. Item menu via `item_menu.dart`; long-press a card for Pin / Hide / Why.

Native: `ios/Runner/HealthBridge.swift` — authorization for the full type list,
characteristics, anchored queries, background delivery, workout expansion.
Entitlements: `healthkit`, `healthkit.background-delivery`.

## Mac page

`skills/health/scripts/index.html` + `health.js`, launcher `web`, like DJ.
Left: profile with evidence and "Not quite", composition history with
Restore, this week's plan with adjustments. Centre: small multiples, progress
charts, patterns board, reports, sync. Right: chat through `chat-bridge.js`.
Buttons call the same scripts the tools call.

## Topics

| Topic | Direction | Retained | Carries |
|:------|:----------|:---------|:--------|
| `tasks/health` | Mac → phone | yes | backfill / sync progress |
| `health/layout` | Mac → phone | yes | the composition |
| `health/plan` | Mac → phone | yes | this week's plan + adjustments |
| `health/checklist` | Mac → phone | yes | today's items and state |
| `health/brief` | Mac → phone | yes | today's brief |
| `health/sync-requested` | Mac → phone | no | the Mac asking for a drain |
| `actions/health-*`, `-done` | both | request retained | cross-device tool calls |

Readings retain, actions queue. Layout, plan, checklist and brief are
readings: the newest wins.

## Settled (2026-09-02)

- The agent composes Home from the user's data; changes are automatic with a
  why-line and Undo. Never propose-and-wait.
- The plan lives in the app and is the source of truth. Calendar mirror is
  later, behind a one-time opt-in.
- No brand names in v1. On ask, buyer advice comes from a live market search
  with the source shown — later, Paid.
- Checklist and progress charts (weight for bulking / cutting, per-km time,
  heart history) are v1.

## Open questions for Liang

1. Skill and app name: `health` / "Linggen Health", or something in the
   Yinyue world?
2. Free vs Paid split as proposed in product-spec, or the daily pass free too?
3. Should durable profile facts go to ling-mem automatically (weekly pass), or
   only when the user says "remember that"?

## Related docs

- [product-spec.md](product-spec.md)
- `linggen-mobile/doc/tech-spec.md` — transport, attribution, device topics.
- `linggen-mobile/doc/dj.md` — the ops-up lane this one copies.
- `linggen/doc/app-action-spec.md` — one writer per mutation, tool tiers.
