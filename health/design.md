---
type: design
reader: Coding agent and contributors
guide: |
  Architectural design for Linggen Health — phone-first: the HealthKit
  surface, the phone store and the agent passes on the phone, the optional
  Mac (mirror, memory, work signals), sync between them, the profile /
  composition / plan / checklist schemas, the tool catalog, and the rules
  that keep it honest. Companion to product-spec.md. Brief; no code.
status: draft 2026-09-02 — direction set by Liang; nothing built yet
---

# Design: Linggen Health

## Architecture in one diagram

```
┌──────────────────── iPhone (the product: sensor + store + agent) ───────────┐
│ HealthKit ──▶ HealthBridge (Swift)  anchored queries, all types,            │
│   Watch, scale,  characteristics, background delivery, deletions            │
│   Oura, …          │                                                         │
│                    ▼                                                         │
│   Documents/Health/  samples · workouts · profile · layout · plans ·         │
│                      targets · checklist · progress · patterns · notes       │
│   Passes (Yinyue + cloud model):  morning · workout report · weekly ·        │
│                                   patterns — all runnable here               │
│   ToolRegistry   health-* : the whole catalog, Dart over the local store     │
│   Screens        First run · Home (composed) · Plan · Track · Workouts ·     │
│                  Patterns · Who you are · Data · Settings                    │
│   Renderer       card catalog → layout.json → Home                           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ WebRTC only, when a Mac is paired (optional)
                               ▼
┌──────────────────── Mac (optional: mirror + long memory + work side) ────────┐
│ ~/.linggen/skills/health/  mirror of the phone store + years of samples      │
│ skills/health/scripts/  ingest.mjs (one writer) · rollup · life · query ·    │
│                         the same passes as skill missions over the mirror   │
│ Work signals  Apple Shifu screen time + IDE hours, git, sessions, calendar   │
│ Health page /apps/health/  ·  Ling chat  ·  ling-mem                         │
│ Takes the weekly pass when reachable; writes durable facts to memory         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**The phone is the whole product.** It reads, stores, thinks, and renders.
A user with no Mac is a complete user, like DJ on the phone.

**The Mac is optional.** It mirrors the store, keeps years of it, adds the
work side of the join, holds ling-mem, and takes the heavier weekly pass when
it is reachable. Nothing about health lives in the engine: the phone app
carries a Health module, the skill declares tools and scripts for the Mac,
and the lane between them is the one DJ already uses.

**A Mac alone never sees the body.** HealthKit exists only on iPhone and iPad,
iCloud Health is end-to-end encrypted, an Apple Watch cannot be set up without
an iPhone. The Mac page then composes from the work side and shows the pair
card. Later, vendor APIs (Oura, Garmin, Whoop, Strava, Withings) give a
phone-less Mac a body feed.

The persona is not code. The profile pass infers it, the compose pass turns it
into a layout from a fixed card catalog, the plan pass turns it into a week. A
new kind of user needs a new card at most, never a new branch.

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
  for some types, immediate for workouts, sleep and body mass. iOS gives the
  app seconds when woken: enough to read the delta and write the store, then
  schedule the pass (`BGProcessingTask`) rather than run it inline.
- **Flutter `health` 13.3.2** lacks VO2max, HR recovery, running / cycling
  metrics, characteristics beyond the basics, time in daylight, state of mind,
  medications, and background delivery. So the phone side is a **native
  `HealthBridge`** (Swift, same pattern as Apple Shifu's `HardwareBridge`) that
  owns every HealthKit call. The package is not used.

## The phone store

```
Documents/Health/
  state.json               anchors per type, ledger (type → granted_at, first,
                           last, count, sources), pass log, paired Macs
  samples/<type>/<YYYY-MM>.jsonl   raw samples, append-only, deleted_at marks
                           (phone keeps 13 months; the Mac keeps everything)
  workouts.jsonl           one line per workout incl. events, route ref, series refs
  routes/<uuid>.json       GPS route per workout
  attention.jsonl          {at, card, act}
  daily/<date>.json        rollup: every metric's day value + baseline delta
  baselines.json           per metric: 28-day median, MAD, trend
  progress/<metric>.json   weekly series for the goal charts
  life/<date>.json         work signals received from a paired Mac (empty otherwise)
  profile.json             the inferred profile (schema below)
  layout.json              current composition; layouts/<ts>.json history
  targets.json             nutrition + training targets with the formula
  plans/<week>.json        the week's plan + adjustments
  checklist/<date>.json    derived daily checklist with check state
  weather/<date>.json      Open-Meteo day + hours, cached
  briefs/<date>.json       the morning brief
  reports/<week>.md        weekly report;  workouts/<uuid>.md  workout report
  patterns.json            [{id, claim, metric, signal, effect, weeks,
                            confidence, evidence[], first_seen, status}]
  goals.json               goals as the user said them + tracked metric
  notes.jsonl              typed context: {at, text, tags[]}
  .outbox/<seq>.jsonl.gz   deltas waiting for a paired Mac
```

JSONL like every other Linggen store, on the phone first. The Mac mirror under
`~/.linggen/skills/health/` has the same layout plus years of samples. Rows
carry `by` (device + account) because two phones on one Mac are two bodies.

## Where each pass runs

| Pass | Fires | Runs on | Writes |
|:-----|:------|:--------|:-------|
| Profile (first run) | first backfill window lands | phone | profile.json, first layout |
| Morning | night's sleep lands, 08:00 latest | **phone** (cloud model) | brief, checklist, ≤ 1 `AdjustDay` |
| Workout report | new workout | **phone** | workouts/<uuid>.md, checklist item, progress |
| Weekly | Sunday 19:00 | **Mac if paired and reachable by 23:00, else phone** | profile refresh, layout (if moved), next plan, targets, report, memory |
| Patterns | nightly after rollup | Mac if paired (long store), else phone (13 months) | patterns.json |

One owner per pass, decided at fire time from `state.json.paired` and a
reachability probe, so a pass never runs twice. Every derived file is a
**last-writer-wins register** with `written_at` and `by_device`, like DJ
playlists: whichever host wrote last wins on both, and a rare double write
resolves the same way on both sides.

The phone's agent is Yinyue with the health tools, on the account's cloud
model through linggen.dev (Paid tokens). With a Mac reachable she may hand a
heavy question to Ling, as she does elsewhere; the passes themselves do not
depend on it.

## Sync between phone and Mac (when paired)

Same door DJ's phone ops use: **batches up through `/api/bash` into one skill
script under one lock.** Zero engine work.

- **Body data, phone → Mac.** `HealthBridge` keeps an anchor per type per Mac;
  each delta becomes `.outbox/<seq>.jsonl.gz` with added samples, deleted
  UUIDs, attention lines, and a coarse location line once a day. While
  connected, `health_sync.dart` drains the outbox in order, one file per
  `/api/bash` call: `bun ingest.mjs --device <id> --seq <n>` with the payload
  base64 on stdin, chunks capped at ~500 samples or 256 KB. Reply is `{seq,
  added, deleted, skipped[]}`; the phone deletes exactly the acknowledged
  file; `ingest.mjs` dedupes by uuid and keeps a bounded ring of applied `seq`,
  so a re-send is a no-op. A `del` line marks `deleted_at`; the Mac never
  removes a row.
- **Derived objects, both ways.** profile, layout, plans, targets, checklist,
  briefs, patterns, goals, notes: LWW registers exchanged on connect and on
  write, newest `written_at` wins, both sides converge.
- **Work signals, Mac → phone.** `life/<date>.json` for the last 7 days rides
  the existing `sync:` declaration (Mac → phone, read-only), so the phone's
  morning pass can join yesterday's work when a Mac exists.
- **Backfill** walks history newest-first per type in month windows, so the
  last months land on the phone in the first minute and the profile pass can
  run while 2023 is still arriving; the Mac receives the same stream through
  the outbox. Progress rides the retained `tasks/health` topic.
- **Never the media channel.** Health payloads are small JSON.

Later, if a second skill needs phone → Mac records, `ingest:` becomes an
engine-level declaration next to `sync:` and `ingest.mjs` becomes its first
consumer. One consumer does not earn the abstraction.

## Schemas

### profile.json — who the agent thinks you are

```
{ "by": "…", "updated_at": "…", "written_at": "…", "by_device": "phone",
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
  "routine":  { "wake": "06:40", "bed": "23:50",
                "desk_hours": 8.9, "sitting_streak_max_min": 140, "screen_hours": 10.2,
                "work_source": "mac|none",
                "confidence": 0.9, "evidence": ["sleep samples", "Shifu 28-day median"] },
  "attention": { "top": ["running", "pace_history", "sleep"], "hidden": ["steps"] },
  "said":     [ {"at": "…", "text": "knee is fine now"} ],
  "corrections": [ {"at": "…", "field": "athlete.environment", "to": "indoor"} ] }
```

Every inferred field carries `confidence` and `evidence`. A `corrections`
entry wins over inference for that field until the user changes it again.
Body facts come from HealthKit characteristics and the latest body-mass
sample; nothing is asked that the data already knows. `routine.work_source`
is `none` without a Mac, and the desk fields stay absent rather than zero.

### The first conversation — never a questionnaire

The first Home card, in Yinyue's voice, from `profile.json` once the first
backfill window is in:

1. **Confirm** what was found, one sentence, one tap: "You look like an
   outdoor runner, about three runs a week, 71 kg. Right?" → `That's me` /
   `Not quite` (opens Who you are on that row).
2. **Ask one thing**, the goal: chips for bulking · cutting · a race · run
   further · sleep better · just move, or a typed sentence. Writes
   `goal` with `source: user`. Plan waits for it and says so.
3. **Later asks** come only from a pass that needs a field to decide, one at
   a time, with the consequence: "Gym or at home? It changes Thursday."
   A pass records `asked_at` per field so nothing is asked twice in a week.
4. **No history** (ledger shows every type empty): the card asks three
   things — goal, what you do, and the missing body facts — and says why.

### Card catalog — code, declarative

Each card kind declares what it needs and what it answers. The compose pass
validates a layout against this list; the phone renderer has one widget per
kind; the Mac page has one renderer per kind. Adding a kind is one entry plus
one widget on each surface.

| kind | needs | answers |
|:-----|:------|:--------|
| `meet` | profile (first run) | the confirmation and the one question |
| `brief` | briefs/today | the sentence, evidence chips, today's session |
| `plan_today` | plans/week | what to do today and why; weather if outdoors |
| `checklist` | checklist/today | the items, checked state |
| `running` | last run, baselines | last run vs your normal |
| `pace_history` | progress/pace_km | per-km time over weeks |
| `distance_week` | progress/weekly_km | weekly km vs plan |
| `lifting_split` | plans/week | this week's split, next session |
| `weight_trend` | progress/weight, goal | 7-day average vs goal line |
| `protein` | checklist, targets | today's protein vs target, formula |
| `screen_time` | life/today, baselines | screen and IDE hours vs normal (Mac paired) |
| `sitting` | stand hours, life | longest sitting streak, breaks |
| `sleep` | last night, baselines | asleep, stages, debt |
| `hrv` / `resting_hr` | daily, baselines | value vs normal, 14-day spark |
| `heart_history` | progress/resting_hr, hrv | months of heart |
| `vo2max` | daily | trend |
| `steps` | daily | vs normal |
| `patterns` | patterns.json | the stable and forming claims |
| `weather_window` | weather/today | the dry hours today (outdoor only) |
| `work_join` | life/today | IDE hours, late commits, meetings (Mac paired) |
| `pair_phone` | state (Mac only, no phone) | where the body data lives + pair QR |

A card whose `needs` are absent is never composed: no screen-time card
without a Mac, no sleep card on a phone-less Mac.

### layout.json — the composition

```
{ "by": "…", "composed_at": "2026-08-31T19:02Z", "pass": "weekly", "by_device": "mac",
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

Rules, in the compose code not in the prompt: at most 9 cards; `brief` always
first (`meet` first until the goal is known); pinned cards keep their slot;
hidden cards never appear; a layout is written only by the weekly pass, a
profile correction, or a goal change; every write records `previous`; Undo
restores `previous` and pins every card it contains for four weeks so the
agent does not re-propose the same move.

### plans/<week>.json

```
{ "week": "2026-W36", "goal": "bulking", "written_at": "…", "by_device": "phone", "why": "…",
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

The checklist derives the day's items from the plan and targets on the phone,
then marks them from samples as they land; what HealthKit cannot see (sets, a
pill) is a tap or a voice line. A check is a local write first, so it works
with no Mac and no network, and syncs when a Mac is there.

## Work signals (the join, needs a Mac)

On the Mac, `life.mjs` assembles one file per day from what the Mac already
has: Apple Shifu's screen time and IDE hours, `git log` across configured
workspaces bucketed by hour, Linggen sessions, calendar events, DJ listening,
Pulse launches. The join is `daily/<date>.json ⋈ life/<date>.json`. The last
seven days ride `sync:` to the phone. Without a Mac the join is absent and no
card claims it.

## Weather

Open-Meteo (no key), called from whichever host runs the pass, cached one
file per day, invoked only when `profile.athlete.environment` is `outdoor` or
`mixed`. Location comes from the phone once a day, rounded to ~1 km, with the
user's permission; a phone-less Mac has no location and no outdoor plan.

## Tools

One catalog, implemented twice: on the phone in Dart over the local store
(`ToolRegistry`, published on `phone/tools`), on the Mac as skill scripts over
the mirror (SKILL.md). Ops are `health-<tool>` when they cross devices. Reads
are `tier: read`, writes `tier: edit`; anything that touches another app
confirms on the executing device.

| Tool | Does | Tier |
|:-----|:-----|:-----|
| `GetProfile` | the profile with confidence and evidence | read |
| `SetProfileField` | a correction from the user ("not quite") — wins over inference | edit |
| `SetGoal` / `ClearGoal` | the goal as said, with a tracked metric | edit |
| `GetLayout` / `ListLayouts` | current composition; history with reasons | read |
| `Compose` | write a new layout with why + previous (weekly pass, goal change, correction) | edit |
| `Undo` / `PinCard` / `HideCard` | user actions on the composition | edit |
| `GetPlan` / `WritePlan` / `AdjustDay` | the week; a day moved with its why | read / edit |
| `GetTargets` / `SetTargets` | nutrition and training targets with formula | read / edit |
| `GetChecklist` / `CheckItem` | today's items; a manual check | read / edit |
| `Log` | voice or chat line: "4 sets legs", "protein shake", "knee sore" → checklist + note | edit |
| `GetWeather` | day + hours for the user's location (outdoor profiles only) | read |
| `GetProgress` | one goal metric as a weekly series with the goal line | read |
| `GetDay` / `GetRange` | rollup + baseline deltas (+ work signals if present); one metric over a range | read |
| `ListWorkouts` / `GetWorkout` / `GetSleep` | detail | read |
| `GetLedger` / `GetPatterns` / `FindPattern` / `GetLife` | ledger; patterns; test a claim; work signals | read |
| `WriteBrief` / `WriteReport` | the brief; weekly or workout report | edit |
| `Nudge` | enqueue a herald line for Yinyue with a quiet window | edit |
| `Export` | CSV + Markdown bundle | edit |
| `SyncNow` | drain the outbox / exchange registers (phone; no-op unpaired) | read |
| `PlanToCalendar` | mirror the week into Calendar (later; opt-in; confirm) | edit |
| `MarketSearch` | buyer advice on ask (later; cloud search; source shown) | read |
| `ConnectService` | Oura / Garmin / Whoop / Strava / Withings on the Mac (later) | edit |

Cross-app actions the plan may propose use the owning app's tools:
`dj-play_playlist` for the wind-down, Yinyue's quiet window, the calendar tool
for moving a meeting. Health never writes another app's data.

## Prompt rules that ride with the passes

- The charter: help this person get better at what they are trying to do, and
  make them love the app. A coach who notices, never a nag.
- Never ask what the data already holds; confirm it instead. One question at a
  time, with its consequence.
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
- **Cards**: a card whose data is absent is never composed. No Mac, no
  screen-time card. No phone, no sleep card.
- **Patterns**: forming until ≥ 4 aligned weeks and ≥ 1 MAD of effect; stable
  after 6; retired after two contradictions.
- **Weight**: shown as a 7-day average; a trend needs two weeks; a single
  weigh-in is never a headline.
- **Targets**: every number shows its formula; changing a body fact re-derives
  it visibly.
- **Checklist**: an auto-checked item names its source; "empty" is not "0 g".
- **Weather**: a plan day that depends on it shows the forecast it used; a
  changed forecast re-adjusts with a why.
- **Types**: zero samples shows as *empty* with both possible reasons; on a
  phone-less Mac, HealthKit shows as *not connected: no iPhone paired*.

## Phone app module

`linggen-mobile/lib/services/health/` — `health_bridge.dart` (channel to the
Swift `HealthBridge`), `health_store.dart` (the store above), `health_passes.dart`
(schedules and runs the passes through Yinyue's session with the health tools;
`BGProcessingTask` for the morning pass), `health_sync.dart` (outbox + register
exchange, only when paired), `health_tools.dart` (ToolRegistry).
`lib/screens/health/` — `first_run.dart`, `home.dart` renders `layout.json`
through `cards/` (one widget per catalog kind), plus `plan.dart`, `track.dart`,
`workouts.dart`, `patterns.dart`, `data.dart`, `settings.dart`,
`who_you_are.dart`. Drawer row under ON THIS PHONE. Item menu via
`item_menu.dart`; long-press a card for Pin / Hide / Why.

Native: `ios/Runner/HealthBridge.swift` — authorization for the full type list,
characteristics, anchored queries, background delivery, workout expansion.
Entitlements: `healthkit`, `healthkit.background-delivery`.

## Mac page

`skills/health/scripts/index.html` + `health.js`, launcher `web`, like DJ.
Left: profile with evidence and "Not quite", composition history with
Restore, this week's plan with adjustments. Centre: small multiples over the
years, progress charts, patterns board, reports, sync. Right: chat through
`chat-bridge.js`. Buttons call the same scripts the tools call.

**No iPhone paired:** the page composes from `life/` alone (screen time,
sitting, late commits, meetings, a plan of breaks, the patterns those prove),
leads with the `pair_phone` card (the pair-from-anywhere QR), and the ledger
reads *HealthKit: not connected — no iPhone paired*. Pairing fills the page in
within the first minute of backfill.

## Topics

| Topic | Direction | Retained | Carries |
|:------|:----------|:---------|:--------|
| `tasks/health` | both | yes | backfill / sync progress |
| `health/registers` | both | yes | profile, layout, plan, targets, checklist, brief as LWW registers |
| `health/sync-requested` | Mac → phone | no | the Mac asking for a drain |
| `actions/health-*`, `-done` | both | request retained | cross-device tool calls |

Readings retain, actions queue. Registers are readings: the newest
`written_at` wins on both sides.

## Settled (2026-09-02)

- The phone is the whole product; the Mac is optional (Liang: "user can use
  their phone independently like DJ and sync data to Mac").
- Price is Linggen's $5 a month for every app; Health is one of them.
- The agent composes Home from the user's data; changes are automatic with a
  why-line and Undo. Never propose-and-wait.
- First run is one conversation (confirm, then the goal), never a
  questionnaire; later asks only when a decision needs them.
- The plan lives in the app and is the source of truth. Calendar mirror is
  later, behind a one-time opt-in.
- No brand names in v1. On ask, buyer advice comes from a live market search
  with the source shown — later, Paid.
- Checklist and progress charts (weight for bulking / cutting, per-km time,
  heart history) are v1.
- A Mac alone gets no body data; it composes from the work side and shows the
  pair card. Vendor APIs later.

## Open questions for Liang

1. Skill and app name: `health` / "Linggen Health", or something in the
   Yinyue world?
2. Free vs Paid split inside the suite as proposed in product-spec, or the
   daily pass free too?
3. Should durable profile facts go to ling-mem automatically (weekly pass), or
   only when the user says "remember that"?

## Related docs

- [product-spec.md](product-spec.md)
- `linggen-mobile/doc/tech-spec.md` — transport, attribution, device topics.
- `linggen-mobile/doc/dj.md` — the phone-standalone + sync shape this copies.
- `linggen/doc/app-action-spec.md` — one writer per mutation, tool tiers.
