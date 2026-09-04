---
type: design
reader: Coding agent and contributors
guide: |
  Architectural design for Linggen Health — phone-first: the HealthKit
  surface, the phone store and the agent passes on the phone, the optional
  Mac (mirror, memory, work signals), sync between them, the profile /
  composition / plan / checklist schemas, the tool catalog, and the rules
  that keep it honest. Companion to product-spec.md. Brief; no code.
status: building — the chart catalog, the chart picker and the food-estimate lane are DESIGNED (2026-09-04) and not yet coded. The quiet screen and the examination are BUILT on the phone (2026-09-03) and proven against 2.2M real samples on a device: health_review.dart, health_tell.dart, the quiet-screen renderer, the Health review screen. The Mac mirror and page landed 2026-09-03; the page was reshaped to the quiet screen 2026-09-04, and a verdict now carries its own fortnight so both surfaces draw the same line. See linggen-mobile/doc/health.md for what runs on the phone.
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
│   Screens        First run · The screen (quiet) · Health review · Plan ·     │
│                  Track · Workouts · Patterns · My body · Data · Settings     │
│   Renderer       review.json → the cards that earned a place → the screen    │
│   Voice          the agent speaks in Yinyue's thread, never on the screen —  │
│                  and speaks FIRST, when a pass has something to report       │
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

The persona is not code. The profile pass infers it, the examination decides
what earned a place, the compose pass turns that into a layout from a fixed
card catalog, the plan pass turns it into a week. A new kind of user needs a
new card at most, never a new branch.

**Two rules sit above all of it and are why the app looks the way it does.**
First: *a measurement at the user's own normal is never shown.* The examination
walks every type and stays silent about the ones that are fine, so the screen
is what is left over, not a template with numbers poured in. Second: *the
agent's voice lives in the conversation, never on the view.* Anything the agent
wants to say about itself — that it built the view, why it is in this order,
the offer to build another — is said in its own thread, where the user can
answer back. And it says it unprompted: a pass that finds something and waits
to be asked has kept the finding to itself.

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
  briefs/<date>.json       the morning brief (the status line's sentence)
  review/<date>.json       the night's examination: a verdict per type, the
                           index picked, the score and what it was made of
  told.jsonl               what the agent came to the user with, and when —
                           {at, surface, text, tools[], pass} — so it neither
                           repeats itself nor stays silent
  reports/<week>.md        weekly report;  workouts/<uuid>.md  workout report
  patterns.json            [{id, claim, metric, signal, effect, weeks,
                            confidence, evidence[], first_seen, status}]
  goals.json               goals as the user said them + tracked metric
  notes.jsonl              typed context: {at, text, tags[]}
  .outbox/<seq>.jsonl.gz   deltas waiting for a paired Mac
```

JSONL like every other Linggen store, on the phone first. The Mac mirror has
the same layout one level down, under `~/.linggen/skills/health/data/` — beside
`config.json` the way `cfo` and `dj` keep theirs — plus years of samples and
`state.json`'s `mirror_id` and per-device positions. Rows carry `by` (device +
account) because two phones on one Mac are two bodies.

## Where each pass runs

| Pass | Fires | Runs on | Writes |
|:-----|:------|:--------|:-------|
| Profile (first run) | first backfill window lands | phone | profile.json, first layout |
| **Examination** | nightly after rollup, ~02:00 | **phone** (cloud model) | `review/<date>.json`: a verdict per type, the index, the score |
| Morning | night's sleep lands, 08:00 latest | **phone** (cloud model) | brief, layout from the review, checklist, ≤ 1 `AdjustDay`, one `Tell` |
| Workout report | new workout | **phone** | workouts/<uuid>.md, checklist item, progress |
| Weekly | Sunday 19:00 | **Mac if paired and reachable by 23:00, else phone** | profile refresh, layout (if moved), next plan, targets, report, memory, one `Tell` |
| Patterns | nightly after rollup | Mac if paired (long store), else phone (13 months) | patterns.json |

**Every pass that produces something a person would want to know ends in a
`Tell`** — one message into the agent's own thread, unprompted, saying what the
pass read, what came out and what it changed. The quiet morning gets one too, in
a line: that is the proof it looked, not noise. `Tell` writes `told.jsonl` and
posts to the thread; at most one per pass, and the morning `Tell` is suppressed
if the user is already mid-conversation with the agent about the same thing.

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

- **Body data, phone → Mac** (built 2026-09-03). **No outbox.** The phone's
  month files under `samples/` are already an append-only log of every row it
  has read, so a mirror is a POSITION in that log — a byte offset per month
  file, kept in `state.json` under `mirror` — and never a second copy of the
  rows waiting to be sent. This replaces the `.outbox/<seq>.jsonl.gz` sketch:
  an outbox would have duplicated tens of thousands of rows on the phone, and
  would still have needed a separate first-mirror path for a Mac paired after
  the fact. A position needs neither. `health_sync.dart` walks each type's
  months, reads a window (256 KB, cut back to its last newline so a
  half-written tail waits), and sends it as one `/api/bash` call into
  `ingest.mjs samples` with the payload gzipped and base64'd. Reply is
  `{ok, added, deleted, duplicate, unfiled, held}`; the position moves only
  after that reply, so a batch that never landed is sent again. `ingest.mjs`
  dedupes by uuid, so a re-send is free. A `del` line is filed by the day it
  was noticed; the Mac never removes a row. The mirror carries an id: a Mac
  whose store was made again is a stranger, and meeting one resets every
  position, because the history it never received would otherwise never be
  offered again.
- **Derived objects, both ways** (built 2026-09-03). profile, layout, this
  week's plan, targets, today's checklist and brief: LWW registers exchanged
  on connect, newest `written_at` wins, both sides converge. A copy adopted
  from the other side is written EXACTLY as it was written there — re-stamping
  it would make the reader the newer writer of a file it did not write, and
  the two would trade the same register forever. Notes are the exception: a
  union, never a winner, because a line the user said cannot be stale.
  Patterns and goals join the list when they are written.
- **When a run happens** (built 2026-09-04). Whenever the phone writes
  something the Mac does not have — rows filed, rows deleted, a register
  written, a line logged — it arms one. The store is where that is known, so
  the store is what says so; a register ADOPTED from the Mac is deliberately
  not counted, or the two sides would sync each other's syncs forever.
  Twenty seconds of quiet lets a burst go up as one run: a backfill files
  thousands of batches, a pass writes half a dozen registers in a row. The
  mirror stays marked behind until a run actually happens — unpaired, away
  and throttled all give the same answer — and the next attempt is armed for
  when the throttle expires. Before this, an examination written at 08:14 sat
  on the phone until the app was opened again, and the Mac page said "not
  examined yet" with the verdict on the phone that wrote it. Connect, the
  **Sync now** button and `health_sync` still run one too.
- **Work signals, Mac → phone.** `life/<date>.json` for the last 7 days rides
  the existing `sync:` declaration (Mac → phone, read-only), so the phone's
  morning pass can join yesterday's work when a Mac exists.
- **Backfill** (built): one HealthKit verb for both jobs. An anchored query
  pages each type in insertion order from its horizon, 5 000 rows a page,
  until a page comes back short; the live feed continues from the same
  anchor. One cursor per type, so the backfill and the live feed can neither
  overlap nor leave a gap — which month windows beside a live feed could not
  promise while a Watch was still syncing last night. Decisive types go
  first (workouts, weight, sleep, heart), so the profile pass has what it
  needs in the first seconds while step counts are still arriving. The Mac
  will receive the same stream through the outbox. Progress will ride the
  retained `tasks/health` topic (not yet: nothing publishes for Health).
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

### review/<date>.json — the night's examination

Built as `health_review.dart`. The shape below is what it writes, plus
`ranked` (every candidate with its coverage, weight, movement and, where it
was dropped, why) and `thin` alongside the other counts.

```
{ "at": "2026-09-03T02:14Z", "by_device": "phone",
  "examined": 38, "normal": 36, "see": 1, "doc": 0, "thin": 2,
  "score": 64,
  "score_from": ["hrv", "resting_hr", "spo2"],
  "score_formula": "mean(80 + 12z) over metrics with ≥ 14 days; z = (today − median28) / MAD28",
  "index": { "picked": "hrv", "why": "5,266 rows · decides whether a hard session goes ahead · down 7 on the fortnight",
             "ranked": [ {"metric": "hrv", "coverage": 0.98, "relevance": 0.9, "movement": 2.1},
                         {"metric": "bmi", "coverage": 0.0, "relevance": 0.2, "movement": null,
                          "dropped": "absent — 1 weigh-in, from 2022; and BMI reads a muscular lifter as overweight"} ] },
  "verdicts": [
    { "type": "hrv", "verdict": "see", "now": 27, "normal": 34, "unit": "ms", "z": -2.1,
      "held_days": 3, "evidence": ["lowest of 14 days", "follows Monday's Legs"],
      "series": [33, null, 34, 32, 31, 30, 29, 27], "series_to": "2026-09-03",
      "changed": ["plan: Legs → rest", "plan: Push → Friday"] },
    { "type": "resting_hr", "verdict": "normal", "now": 57, "normal": 58 },
    { "type": "sleep", "verdict": "thin", "why": "32 nights held" } ] }
```

`verdict` is one of `normal` (never shown, counted only), `see`, `doc`, `thin`
(not enough data — an absence, never a zero). A judged verdict carries its own
`series` — the fortnight ending on `series_to`, a null for every day with no
reading — because the examination is the only place that knows how a day of
this type becomes a number (a sum for steps, a mean for heart rate, the newest
for weight, the judge's scale applied). Anything redrawing that line from the
raw rows would be a second copy of the judging table, free to drift, which is
why both screens and the Mac page read the series rather than folding again.
`series_to` is usually today and is yesterday for a measurement that is a
day's total, because a day still being lived is not a total. The **score exists only above two
usable metrics**, and it is today against this person's own normal, never a
health score: `score_from` and `score_formula` go on screen beside it. The
**index** is ranked per user on coverage × relevance × movement and records why
each candidate was dropped, so the choice can be argued with.

### told.jsonl — what the agent came to the user with

```
{ "at": "2026-09-03T07:02Z", "surface": "yinyue", "pass": "morning",
  "text": "I went through your Apple Health while you slept — 38 kinds of measurement…",
  "tools": ["Report", "GetRange hrv", "SetPlan"], "review": "review/2026-09-03.json" }
```

One line per unprompted message. It is a log so the agent can see what it has
already said: it never repeats a finding it has told, and a finding with no line
here is a finding it has kept to itself.

### Card catalog — code, declarative

Each card kind declares what it needs and what it answers. The compose pass
validates a layout against this list; the phone renderer has one widget per
kind; the Mac page has one renderer per kind. Adding a kind is one entry plus
one widget on each surface.

Every kind also declares **what earns it a place**. A kind with `earns: news`
appears only when the examination gave its measurement a `see` or `doc` verdict;
`earns: always` is reserved for the two that must be on screen whatever the
night held — the status line and the doors.

| kind | needs | earns | answers |
|:-----|:------|:------|:--------|
| `status` | review/today | always | the number, the sentence, and what it was made of — "38 measurements examined" |
| `finding` | review/today | news | the measurement that moved: its own baseline through the fortnight, the evidence, and what it changed |
| `acts` | workouts | always | the last few sessions, expandable |
| `doors` | — | always | the same seven, in the same order |
| `meet` | profile (first run) | always | the confirmation and the one question |
| `brief` | briefs/today | news | the sentence, evidence chips, today's session |
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
| `pair_phone` | state (Mac only, no phone) | always | where the body data lives + pair QR |

The remaining kinds above (`running`, `weight_trend`, `sleep`, `hrv`, `steps`,
`vo2max`, …) all carry `earns: news`. `plan_today`, `checklist`, `patterns`,
`pace_history`, `heart_history` and the rest are **doors, not cards** — they
live one tap behind the screen and no longer compete for it.

A card whose `needs` are absent is never composed: no screen-time card without a
Mac, no sleep card on a phone-less Mac. A card whose measurement came back *at
your normal* is not composed either — that is the whole design.

### Charts — four forms, one picked

A chart is not decoration and it is not one-per-metric. A candidate is a
**metric × a form**, because the same number drawn the wrong way lies.

| Form | What it draws | What it needs | Answers |
|:-----|:--------------|:--------------|:--------|
| **A · against your normal** | daily value over 8 weeks, the person's median as a line and their spread as a band | ≥ 14 judged days | is this one of mine, or not? |
| **B · week bars** | one total per week, the current week drawn open because it is unfinished | ≥ 4 complete weeks | am I doing more or less than usual? |
| **C · day shape** | today's running total against the usual curve **at this hour** | intraday rows | am I behind, or is it only 10am? |
| **D · session curve** | heart rate through one workout, with time in each zone | a workout with a series | what was that session? |

Form C exists because a day total lies until the day ends. 560 kcal against a
normal of 703 is not a low day at 10am, and a bare number cannot say so.

**The candidates** are every judged type paired with the forms it can carry —
HRV, resting heart rate, heart rate, blood oxygen, VO₂ max and the findings on
A; active and resting energy, exercise minutes, distance and workout tonnage on
B; energy and steps also on C; a workout on D. The list is the judging table,
not a second list: a type the examination knows how to judge is a type that can
be drawn.

**The picker is the one already shipped**, widened. `_pickIndex` ranks on
`coverage × relevance × (0.25 + movement)` and drops the thin and the redundant,
recording every candidate and its reason in `ranked`. Charts add one term:

- **readability** — the form's requirements above. A candidate whose form cannot
  be drawn is **dropped with a reason**, never degraded into a worse chart. Two
  points is not a line.

And the rule that governs all of it: **a finding outranks the index.** If the
night found something, its chart is the chart; the picker only decides what
fills that space when nothing is wrong.

**Rules pick, the agent names and may overrule.** The pass runs at 02:00 on a
phone that may be offline, so the choice must be makeable with no model: a
model call there costs battery and reliability for a decision a table makes
well. It must be **stable** — the same data on two mornings must give the same
page, or nobody learns where anything is — and **auditable**, which the `ranked`
table is and a model's pick is not. What the agent is better at is the
sentence ("your HRV, because it decides whether today's session goes ahead"
rather than `coverage 0.9 × relevance 0.85`), breaking near-ties, vetoing a
pick that is technically right and contextually silly, and honouring "show me
sleep instead". An override is written into `layout.json` like any other, so
the rule's pick and the agent's change are both visible.

### What you eat — an estimate is never a measurement

Nothing writes food to HealthKit for most people, so the intake half of energy
is missing: the targets card computes a kcal number the user cannot measure
against. A model can close that gap from a sentence ("chicken, rice, broccoli,
big bowl") or a photo.

**Settled 2026-09-04 (Liang): roughly is enough, and the user adjusts the
number.** That is what every shipping app in this category does, and the
correction loop is the product rather than a fallback.

**What the field actually achieves.** Independent testing of Cal AI puts mean
absolute error at 11–14%, roughly 10–15% on a simple single-item plate and
15–25% once items overlap. SnapCalorie — founded by the people behind Google
Lens and Cloud Vision, and built on *Nutrition5k*, 5 000 dishes with every
ingredient weighed — reports under 20% average error and claims to beat trained
nutritionists. So ±20% is the realistic bar, not the ±40% a bare vision model
gets, and the difference is entirely in how portion is solved.

**Portion is the whole problem, and depth is how it is solved.** A photo
flattens a bowl; the model has to guess how deep it goes. Three levers, in
order of value:

1. **Depth at capture.** SnapCalorie uses the iPhone depth sensor to get a 3D
   shape and derive volume; the academic version (LiDARCalorieCam) does the
   same. Volume from depth is *measured*, not guessed, and it leaves the model
   only the job it is good at — naming the food and its density. **Liang's
   iPhone 15 Pro has LiDAR**, and depth can only be captured at the moment the
   photo is taken. Capture it whether or not v1 uses it: it cannot be recovered
   afterwards.
2. **A reference object.** Plate size, or a fork in frame. Cheap, and users
   already do it when told.
3. **The model alone.** The fallback, and the least accurate.

**The correction loop, and one trap in it.** The pattern that works is: get to
a logged draft fast, then make fixing it one tap. What does *not* work is the
agent asking about it — the SnappyMeal study found interactive follow-up
questions were judged relevant to the food and still added friction without
improving the data. That is a direct warning for us, because our agent is
chatty by disposition: **estimate, show the range, let the user correct it, and
do not interrogate them about their dinner.**

An estimate is marked as one everywhere:

- **Its own source.** It never joins the HealthKit rows and is never charted as
  though it were measured. A corrected number is marked differently again — it
  is the user's word, which outranks both.
- **No verdict, ever.** The examination judges measurements against a baseline.
  A guess has no business raising *worth seeing*.
- **A range until it is corrected.** "Roughly 900–1,200" is honest; "1,047 kcal"
  is a lie with a decimal point. Once the user adjusts it, it is their number
  and it is shown as one.

**Settled 2026-09-04 (Liang): a photo goes to the user's own ChatGPT.** The
cloud model Linggen supplies is `deepseek-v4-flash`, which is text-only and
returns 400 on an image. Rather than put a photo through Linggen's proxy, the
user connects their ChatGPT account and the image goes to their own GPT-5.6
over the OAuth path the engine already has. Their account, their data, and the
promise — *only the sentences you and the agent exchange reach a model* — is
kept by us because we are not the ones carrying the picture.

**Considered and declined: `deepseek-v4-flash-vision-exp`.** DeepSeek shipped
it on 2026-08-21 at V4-Flash pricing with each image capped at 384 tokens, and
it claims text parity with V4-Flash. Pointing the cloud default at it would have
given every user the feature for no extra money. It was declined because the
cloud default carries CFO, Pulse, sys-doctor, Yinyue and every phone user, and
`-exp` is an experimental endpoint: renamed, throttled or withdrawn without the
deprecation courtesy a GA model gets — and a model id that stops resolving fails
**silently** into a fallback here, which is how "Yinyue has no voice" happened
twice in 2026-06 and 2026-07. Images are also `user`-message-only on that API,
so a replayed or compacted transcript carrying one would 400. Same money, far
more blast radius. If it goes GA it is worth revisiting as a *second* cloud
model chosen only when a request carries an image — never as the default.

**The capability rule, which is what actually keeps this honest.** A photo goes
to the first connected model that can see; `has_vision()` already exists and is
the right seam. And the door is closed before it is opened: with no
vision-capable model connected there is **no camera button at all**, and the
reason is on the screen — *a photo needs a model that can see; connect your
ChatGPT account, or just tell me what you ate.* Never offer a capability the
connected models cannot deliver, and never let a photo discover it at send time.
Two engine facts stand in the way of that today and are fixed alongside:
`ProviderClient::Proxy` reports no vision unconditionally, and an
OpenAI-compatible model with no `tags` is *assumed* to have vision, so the
engine currently believes `deepseek-v4-pro` can see.

**What the model can and cannot do with the picture.** Images are resized to
about 800×800 and capped at 384 tokens whichever way they arrive, so a vision
model can tell chicken from fish and see there is rice. It cannot read fine
print on a packet, and it cannot recover how deep a bowl is. That is the
division of labour: the depth frame measures, the model identifies.

Logging by sentence needs neither: `health_log` ships today, and a text
estimate is about as accurate as a photo one without depth.

### layout.json — the composition

```
{ "by": "…", "composed_at": "2026-09-03T07:01Z", "pass": "morning", "by_device": "phone",
  "review": "review/2026-09-03.json",
  "why": "HRV is the one measurement of 38 that moved.",
  "previous": "layouts/2026-09-02T07:00Z.json",
  "pinned": [], "hidden": ["steps"],
  "cards": [
    { "kind": "status" },
    { "kind": "finding", "metric": "hrv", "tone": "warn" },
    { "kind": "acts" },
    { "kind": "doors" } ] }
```

Rules, in the compose code not in the prompt:

- **`status`, `acts` and `doors` are always present**; everything between them
  is what the examination gave a `see` or `doc` verdict. On a quiet morning
  that is nothing, and the layout is three cards.
- **At most three findings**, worst verdict first. A `doc` verdict is always
  first, cannot be collapsed, cannot be hidden, and ignores `hidden` and the
  attention order entirely.
- Pinned cards keep their slot; hidden cards never appear **except a `doc`**.
- Every write records `previous` and the `review` it came from; Undo restores
  `previous` and pins every card it contains for four weeks.
- **`why` is not rendered.** It is carried so the agent can say it in the
  conversation and so `ListLayouts` can show the history; no surface paints it
  on the view.

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

**Built 2026-09-04.** On the Mac, `scripts/life.mjs` assembles one file per
day, `data/life/<date>.json`, from three things the Mac already has on disk —
no new permission, no service:

- **git**, across the folders `config.json` names in `workspaces`, scanned two
  levels down and filtered to the commits under that repo's own `user.email`.
  Count, first, last, how many after 23:00, and which repositories. A commit is
  stamped with the minute it was made, which makes it the best record of a late
  night anything on this machine holds.
- **Linggen's own sessions** — how many things were asked of it and when the
  last one was.
- **the perception activity log** — the coarse shape of when the Mac was in
  use.

Each day carries a `said` line, composed from the parts rather than by a model,
so it says the same thing every time. `Report` refreshes today (stale after 20
minutes — the day moves while it is being lived) and reads yesterday as
written, and hands both back as `work`. The phone pulls `life/<today>.json` and
`life/<yesterday>.json` through the register exchange it already runs; it never
writes them, so the exchange always adopts. Absent is never zero: no
`workspaces` configured is `commits: null` with the reason, not a day with no
commits.

Screen time, calendar and IDE hours are not in it. Screen time on macOS is a
private database behind Full Disk Access and the calendar needs EventKit;
neither is worth a permission prompt for the value it adds over commits.

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
| `Examine` | run the night's pass: every type against its own baseline → verdicts, index, score | edit |
| `GetReview` | the night's examination: verdicts, what was ruled out, the score and its formula | read |
| `Tell` | come to the user unprompted in the agent's own thread; writes `told.jsonl`. One per pass | edit |
| `GetLayout` / `ListLayouts` | current composition; history with reasons | read |
| `Compose` | write a new layout from a review, with why + previous | edit |
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
- Say why — **in the conversation**. Every layout, plan day and adjustment
  carries its reason in the user's terms, and that reason is spoken in the
  thread, never painted on the view. The view carries findings.
- Come to them. When a pass has something, say so before being asked: what you
  read, how much of it, what came out, what you changed. Once per pass.
- Plain words beside the acronym. "HRV — how much your heartbeat varies, which
  is the best thing you have for how recovered you are". The owner of this
  product had to ask what HRV meant; the copy carries the meaning.
- Wellness only; supplements as evidence, never a brand unprompted; medications
  and clinical records are context, never a topic.
- Voice: Yinyue's, one or two sentences on the phone; the Mac report may run a
  page. No "Done", no capability lists.

## Honesty rules (the kill risk)

The rules are code, not prompt:

- **Profile**: a field is shown only above 0.6 confidence with its evidence;
  below that Home asks one question instead of guessing. A correction wins.
- **Layout**: every write has a why and a previous; Undo pins for four weeks.
  The `why` is said in the conversation and never drawn on the view.
- **Cards**: a card whose data is absent is never composed, and a card whose
  measurement came back at the user's own normal is not composed either. No
  Mac, no screen-time card. No phone, no sleep card.
- **The quiet is stated**: the status line always says how many measurements
  were examined. An empty screen with no line reads as a broken app.
- **The baseline is the user's own**: a resting heart rate of 58 is flagged by
  a population rule and is nothing to worry about. Never a population range.
- **Sustained, not single**: one reading changes today's session; nine days of
  a shifted baseline is what raises a warning.
- **A warning outranks the quiet rule** and every other rule here: it cannot be
  collapsed, hidden, or pushed below anything, and it never names a condition —
  the words are "worth showing a doctor".
- **The agent comes to you**: a pass that produced a finding and wrote no
  `told.jsonl` line is a bug. Silence is only correct when the pass itself was
  quiet, and even then the quiet is reported in a line.
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

Built (2026-09-02): `linggen-mobile/lib/services/health/` — `health_types.dart`
(the catalog as the user names it: label, group, unit, horizon, priority),
`health_bridge.dart` (channel to the Swift `HealthBridge`), `health_store.dart`
(state.json + samples/<type>/<month>.jsonl), `health_library.dart` (the
singleton: authorize, backfill, live feed, catch-up), `health_tools.dart`
(`health_ledger`, `health_samples`, `health_read_history`).
`lib/screens/health/health_screen.dart` (Home + Data) and
`health_type_screen.dart` (raw rows). Drawer row under ON THIS PHONE.

Built since: `health_passes.dart`, `health_profile.dart`, `health_daily.dart`,
`health_cards.dart`, `health_plan.dart`, `health_targets.dart`,
`health_checklist.dart`, the Home renderer over `layout.json`, `plan`, `track`,
`who_you_are`, and `health_sync.dart` (the mirror: positions, registers,
notes).

**The quiet screen is built** (2026-09-03). `health_review.dart` is the
examination — the judging table, the verdicts, the score and the index picker;
`health_tell.dart` is the report she comes to the user with, plus `told.jsonl`;
`screens/health/health_quiet.dart` is the screen (status · findings · acts ·
doors) and replaced the nine-card `health_home.dart`, which is deleted;
`screens/health/health_review_screen.dart` is the lead door. `HealthCards`
kept only the six kinds that are real and every metric-specific kind is gone —
a finding renders from its measurement, not from a card kind of its own. The
library gained `examine()` and `report()` in `runDuePasses`, `doors` as the
one declaration both the screen and the shell read, and `health_review` as a
tool so Yinyue answers from the verdicts rather than from raw rows.

ONE THING THE PROTOTYPE DID NOT SAY, learned by running it: **a spread is not
a meaningful change.** Eight weigh-ins inside half a kilo give a MAD of 0.2 kg,
and against that a 400 g swing is two of them — "your weight moved" on somebody's
screen for a glass of water. So a judge carries a `floor`: the smallest
difference that is a difference at all, defaulting to 3% of the person's own
median and declared absolutely where the unit demands it (0.5 kg for weight,
2 bpm for resting heart rate, 1 point for blood oxygen, 0.3 °C for a wrist
temperature that is already a delta around zero). One MAD is worth
`max(mad, floor)`. Without it a quiet measurement is loud for being quiet.

Still to build: the `workouts` and `patterns` screens behind their doors,
weather for outdoor plans (needs location), and nudges through Yinyue's
herald. The unattended pass is built (2026-09-04) — see
`linggen-mobile/doc/health.md`.

**Known bug, found 2026-09-04 and not yet fixed.** A dense measurement can be
muted by the read cap rather than by any absence. `_fold` reads
`judge.limit` rows (20 000 by default) newest-first, and resting energy writes
about 7 700 rows a day — so the window covers three days and the verdict says
*"3 days in the last four weeks — too few to have a normal"* about a person
holding thirty. Active energy escapes only because `HealthDaily` folds it with
a much larger cap. This is the blood-oxygen bug of 2026-09-03 in another
costume: a real measurement silenced, and then a false sentence written about
the silence. The fix is to bound the read by **days covered**, not rows, and to
report the days actually reached when a ceiling is hit.

Native: `ios/Runner/HealthBridge.swift` — authorization for the full type list,
characteristics, anchored queries, background delivery, workout expansion.
Entitlements: `healthkit`, `healthkit.background-delivery`.

## Mac page

Built 2026-09-03, reshaped to the quiet screen 2026-09-04:
`scripts/index.html` → `health.html` + `health.js` + `health.css`, launcher
`web`, like DJ.

**The first view is the same promise as the phone's** and leads with the same
thing: the strip of what the pass found, the status line with the number and
what it was made of, the four counts (types examined · at your normal · worth
seeing · worth a doctor), whatever earned a place with its own fortnight and
the person's normal drawn through it, and the table of what the number was
made of. Nothing moved is a first view too — then the page shows the index
measurement and says why that one was picked. What a Mac adds is not more on
that first screen: it is that everything is reachable one tab behind it. The
tabs are the phone's doors under the short names a tab strip has room for, and
a tab appears only when the mirror holds what is behind it. The **Data** tab
holds every measurement examined, including the ones that had nothing to say
and with each thin row's own reason, so *nothing needs you* can be checked
instead of believed. A phone never shows that list.

`report` hands back the **newest** examination the mirror holds rather than
today's, because a Mac's advantage over a phone is reach: asking only for
today's file would answer "not examined yet" with last night's verdict sitting
on the disk beside it. The file carries its own date and the page checks it —
until today's pass has reached the Mac, the first view says so plainly and
names the day it does have, which is what the phone screen says too.

The **chat is on the right** at the width every Linggen app uses, and Ling
opens it rather than the user: the pass finished at 02:14, this is what it
found, this is why the page is in this order. After that the user asks, the
answer comes back in a sentence or two, and `PageUpdate` puts the working on
the page beside it. **The page never carries Ling explaining the page** — that
sentence belongs in the thread, where it can be argued with.

`settings.html` says where the mirror is, what it holds, which phones send, and
its identity.

It renders the registers the phone wrote and nothing more — the phone owns the
passes, so there is no second implementation of the plan or the profile to
drift. Charts over the years and the patterns board wait on a Mac-side rollup;
until there is one, this page would have to invent the numbers, and inventing
them is the thing the whole design is against.

**No iPhone paired:** the page composes from `life/` alone (screen time,
sitting, late commits, meetings, a plan of breaks, the patterns those prove),
leads with the `pair_phone` card (the pair-from-anywhere QR), and the ledger
reads *HealthKit: not connected — no iPhone paired*. Pairing fills the page in
within the first minute of backfill.

## Topics

| Topic | Direction | Retained | Carries |
|:------|:----------|:---------|:--------|
| `tasks/health` | both | yes | backfill / sync progress |
| `health/registers` | both | yes | profile, layout, plan, targets, checklist, brief, review as LWW registers |
| `health/told` | both | yes | what the agent has already come to the user with, so it neither repeats nor double-tells across devices |
| `health/sync-requested` | Mac → phone | no | the Mac asking for a drain |
| `actions/health-*`, `-done` | both | request retained | cross-device tool calls |

Readings retain, actions queue. Registers are readings: the newest
`written_at` wins on both sides.

## Settled (2026-09-03)

- **Show the unhealthy part only.** The nightly examination walks every type
  the user has and stays silent about the ones that are fine. Unhealthy means a
  sustained adverse change against the user's *own* baseline, or a published
  red flag — never below a population average.
- **A card earns its place by having news today.** At your normal is not a
  slot. This retired the nine-card composed Home of 2026-09-02, four of whose
  cards sat there whether or not anything had happened.
- **A warning outranks the quiet rule**: always on top, never collapsed, never
  hidden by a tap, and it never names a condition.
- **The number is not a health score.** It is today against the user's own
  normal (80 = at your normal), it names what it was made of, and it does not
  exist below two usable metrics.
- **The index is picked per user** on coverage × relevance × movement. BMI is
  the worked example of why a fixed list is wrong.
- **The agent's voice lives in the conversation, never on the view.** The
  why-line came off the screen; the screen carries findings. This retires C3 of
  2026-09-02 as a *screen* feature — automatic layout change and Undo stand.
- **The agent comes to the user.** When a pass finishes or something is seen,
  it says so unprompted in its own thread: what it did, what it read, what came
  out, what it changed. The quiet morning is reported too.
- **The phone screen can go fully quiet** because Yinyue's screen is one thread
  for every Linggen app — there is always somewhere for her to say it.
- Build the capability; do not claim the title. A diagnosis claim from a
  non-cleared app is an App Review rejection in the US and a regulated medical
  device in the EU.

## Settled (2026-09-02)

- The phone is the whole product; the Mac is optional (Liang: "user can use
  their phone independently like DJ and sync data to Mac").
- Price is Linggen's $5 a month for every app; Health is one of them.
- Layout changes are automatic with an Undo — never propose-and-wait. (The
  why-line that accompanied them moved into the conversation on 2026-09-03.)
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

1. **The alarm boundary.** Own-baseline change only, or own-baseline plus a
   short list of published absolute red flags? The recommendation is both, each
   phrased "worth showing a doctor" and never naming a condition.
2. **In-app attention.** May the app learn from what you look at at all, or
   only from deliberate acts (pin, hide, and what you ask the chat)? Asking is
   the strongest untapped signal and Apple has no equivalent; watching what you
   open is the part that needs permission.
3. Skill and app name: `health` / "Linggen Health", or something in the Yinyue
   world?
4. Free vs Paid split inside the suite as proposed in product-spec, or the
   nightly examination free too?
5. Should durable profile facts go to ling-mem automatically (weekly pass), or
   only when the user says "remember that"?
*(6, the photo and the promise, was settled on 2026-09-04 — the image goes to
the user's own ChatGPT over OAuth. See
[What you eat](#what-you-eat--an-estimate-is-never-a-measurement).)*

## Related docs

- [product-spec.md](product-spec.md)
- `linggen-mobile/doc/tech-spec.md` — transport, attribution, device topics.
- `linggen-mobile/doc/dj.md` — the phone-standalone + sync shape this copies.
- `linggen/doc/app-action-spec.md` — one writer per mutation, tool tiers.
