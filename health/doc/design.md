---
type: spec
reader: Liang, coding agent, contributors
guide: |
  The one document for Linggen Health — what it is and what it never does,
  where it runs, the HealthKit surface, the phone store and the passes, the
  optional Mac, sync, the schemas, the tools, the honesty rules, what is
  built, what 1.2 builds, and what was settled when. Brief; no code. The
  first-view UI lives in ui-ux-design.md; the phone's built behaviour in
  linggen-mobile/doc/health.md.
status: building — 1.1 (build 22) submitted to the App Store 2026-09-10 with the examination, the quiet screen, the plan, the debrief, the letter, the doctor page, patterns, symptoms and the lock-screen lines. 1.2 is designed (see "1.2 — she knows you") and not coded. product-spec.md was folded in here on 2026-09-10.
---

# Linggen Health

> First-view UI: [Agent-Composed UI](ui-ux-design.md) — stable Brief, Focus
> and Attention sections whose content the agent composes; built on both
> devices 2026-09-08. It wins over any older first-view rule below.

## What it is

**Apple Health shows you everything and tells you nothing. Linggen Health
reads everything and shows you almost nothing — and Yinyue tells you the
rest.**

Every night the agent walks every measurement this person has, against that
person's own history, and files one of three verdicts each: at your normal,
worth seeing, worth a doctor. Nearly all come back at your normal and are
never shown. What reaches the screen is the part that is not right, and on
most mornings that is nothing. The quiet is stated, never a blank.

The screen carries findings. Yinyue carries everything else, in her own
thread, unprompted: what she read, what came out, what she changed, and the
one question no sensor can answer. Her page is the core of the app; Health
is a quiet screen she walks the person to.

Three things no incumbent does:

1. **It examines everything, every night** — every type you have, against
   your own last month, never a population range.
2. **It stays quiet.** A card earns its place by having news today. At your
   normal is not a slot.
3. **It comes to you, and it remembers.** The finding arrives in the
   conversation with what she did about it; what you tell her is data the
   next examination has beside the number.

Charter, written into the agent: help this person get better at what they
are trying to do, and make them love Linggen Health. Behave like their doctor
and coach; never claim the title.

Persona is not code. There is no runner code and no lifter code; the profile
is inferred, said out loud, and corrected by the person.

## Where it runs

**The phone is the whole product.** It reads HealthKit, keeps its own store,
runs the passes with the account's cloud model, examines every type against
its own baseline, and writes the plan and the checklist. A user with no Mac
is a complete user.

**The Mac is optional.** It mirrors the store, keeps years of it, holds
ling-mem, takes the heavier weekly pass when reachable, and shows the same
first view one tab deeper. The work side of the join (commits, sessions) is
plumbing only — see *Work signals*, shelved.

**A Mac with no iPhone gets no body data.** HealthKit exists only on iPhone
and iPad; the Mac page composes from what it has and shows the pair card.
Later, vendor APIs (Oura, Garmin, Whoop, Strava, Withings) give a phone-less
Mac a body feed.

## Positioning

- **Extend Apple Health, never duplicate it** (2026-09-10). Apple's 09-09
  redesign owns the cards and the scores: Insights, For You, Readiness,
  Health Age, Longevity, labs, expert videos, camera assessments. We build
  none of those. We own the conversation, memory, what the sensors cannot
  see, lessons in the person's own numbers, the plan with hands, and the
  doctor line.
- **Not a dashboard.** Built each morning out of what moved; the same screen
  is never shown to two people.
- **No score.** Not a health score, and since 2026-09-10 not a number of our
  own at all. Apple's scores are read as inputs where HealthKit exposes them;
  otherwise the person tells her.
- **The conversation has its own room.** Yinyue's page is shared by every app
  and she navigates to Health; Health says what is, never why.
- **Build the capability, never claim the title.** A nightly examination, an
  index chosen per person, a warning that will not be dismissed — all of it
  ships. "Doctor" appears only as *worth showing a doctor*.
- **A coach, not a nag.** One plan, one checklist, one why. Nudges only
  through Yinyue's herald, under her budget.
- **Wellness only.** Never diagnosis, never medication advice. Supplements as
  evidence in plain words; brands only on ask, with the source, later.
- **Yours.** Health data stays on the phone, and on a paired Mac. The cloud
  model sees a day's summary to run a pass, never the raw store, and nothing
  is kept there.

## Who pays

Linggen is $5 a month for every app; Health is one app in the suite, not a
tier, and the one that makes the plan worth keeping. Proposed split, open
(Liang's call): free — import, the data browser, workout and sleep detail,
the first examination, one weekly report; paid — the nightly examination,
the plan, patterns, the agent coming to you, ask-anything over months.

## What Linggen Health never does

- Diagnose, comment on medication, or claim to be a doctor.
- Ask a question the data already answers, or hand the user a questionnaire.
- Show the same screen to two different people, or rearrange it daily.
- Give a measurement a slot for being at your normal.
- Explain itself on the screen: no why-line, no card introducing the agent.
- Wait to be asked. A finding said nowhere is a failure, not discretion.
- Change the layout without saying why, or without an undo.
- Compare a number to a population range instead of the person's own history.
- Compute a score, or show a number without the personal baseline beside it.
- Name a brand unprompted, or name one without the source.
- Surface a pattern from one week, or a weight trend from one morning.
- Require a Mac, or pretend a Mac alone can see the body.
- Send health data anywhere but the person's own devices; never iCloud.
- Nudge outside the herald, or while the person is enjoying something.
- Show an estimate as though it were measured, or give one a verdict.
- Offer a button the connected models cannot honour.
- Interrogate the user about a meal, or about anything: one question, once.

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
│   Screens        First run · Highlights (quiet) · Everything (the drawer:    │
│                  review · plan · track · workouts · body · data · settings)  │
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
                           index picked
  told.jsonl               what the agent came to the user with, and when —
                           {at, surface, text, tools[], pass} — so it neither
                           repeats itself nor stays silent
  reports/<week>.md        weekly report;  workouts/<uuid>.md  workout report
  patterns.json            [{id, claim, metric, signal, effect, weeks,
                            confidence, evidence[], first_seen, status}]
  goals.json               goals as the user said them + tracked metric
  notes.jsonl              what they said: {at, text, kind?, subject?, re?, follow_up?}
                           kind = said | answer | intent | symptom; never edited
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
| **Examination** | nightly after rollup, ~02:00 | **phone** (cloud model) | `review/<date>.json`: a verdict per type, the index |
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
day's total, because a day still being lived is not a total. The file still
carries `score`, `score_from` and `score_formula` as written today; they are
removed in 1.2 (4) and nothing may read them. The **index** is ranked per user
on coverage × relevance × movement and records why each candidate was dropped,
so the choice can be argued with.

### told.jsonl — what the agent came to the user with

```
{ "at": "2026-09-03T07:02Z", "surface": "yinyue", "pass": "morning",
  "text": "I went through your Apple Health while you slept — 38 kinds of measurement…",
  "tools": ["Report", "GetRange hrv", "SetPlan"], "review": "review/2026-09-03.json",
  "asked": { "kind": "question", "type": "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
             "label": "HRV", "question": "Anything going on — a cold coming, stress, a late night?",
             "key": "ask:HKQuantityTypeIdentifierHeartRateVariabilitySDNN:2026-09-03" } }
```

One line per unprompted message. It is a log so the agent can see what it has
already said: it never repeats a finding it has told, and a finding with no line
here is a finding it has kept to itself. `asked` is the one thing the morning
line asked, when it asked — a question on a finding or a follow-up on a note —
and is what the week's rule and the agent's open list read back (see *The one
question and the follow-up*).

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
| `status` | review/today | always | the sentence and what was examined — "38 measurements examined"; the number goes in 1.2 (4) |
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
| `screen_time` | life/today, baselines | shelved 2026-09-08 with the work lane |
| `sitting` | stand hours, life | longest sitting streak, breaks |
| `sleep` | last night, baselines | asleep, stages, debt |
| `hrv` / `resting_hr` | daily, baselines | value vs normal, 14-day spark |
| `heart_history` | progress/resting_hr, hrv | months of heart |
| `vo2max` | daily | trend |
| `steps` | daily | vs normal |
| `patterns` | patterns.json | the stable and forming claims — built 2026-09-08 as the *What I have learned* door |
| `weather_window` | weather/today | the dry hours today (outdoor only) |
| `work_join` | life/today | shelved 2026-09-08 with the work lane |
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

## Work signals (the join, needs a Mac) — SHELVED 2026-09-08

**Shelved 2026-09-08 (Liang).** Nothing below reaches an agent any more:
`Report` carries no `work`, the phone's examine tool hands Yinyue no
`their_days`, and both skill texts say to ask what kept the person up rather
than infer it. Two reasons, both his: a Mac being busy is not a person being
present — agents commit under the user's name and keep the Mac awake while
they sleep — and commits exist only for people who use git, while Linggen is
for everyone. The trustworthy signal would be physical input (macOS exposes
seconds since the last key or pointer event with no permission, and an agent
never produces one), sampled by the engine as a general "is a person at this
machine" capability. Until that exists the lane stays as plumbing only:
`life.mjs` still builds a day on request and the phone still pulls
`life/<date>.json`, and no one reads either. The description below is what
was built on 2026-09-04, kept as the record.

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

## What I have learned about you (built 2026-09-08)

The patterns door, in her voice. Not a rule from a textbook: a count.
*After a night under 6 h 10, your HRV was under your normal 6 times out of
8. On the other 41 days, 3 in 41. The gap is 1.4 of your own spread; 5 of 6
weeks agree.* (`health_patterns.dart`, `patterns.json`, rewritten nightly
after the examination from the same eight-week rollups; *What I have
learned* in the drawer; the `health_patterns` tool.)

Each claim is a condition on one day and an outcome the morning after, both
against the person's own 28-day normal. Conditions: a night under the normal
by a MAD (the night ending that morning), a bed time later than the median by
a MAD, a day they trained, a day over the step normal by a MAD. Outcomes: HRV
under, resting heart rate over, sleep under. The doc's rule as code: at least
six condition days and six others; the mean adverse distance on condition
days minus the rest at least one MAD; each week with a condition day votes
with its mean — *forming* from four aligned weeks, *stable* from six, and
two weeks that said the opposite retire it before it is ever shown. A thing
never explains itself (a short night is not a cause of short sleep). The
register keeps how many pairings were looked at, so an empty page can say it
looked. A claim that has just earned a place, or just become stable, is said
once in her thread — "I think I have noticed something" / "I am sure of
something now" — never on the lock screen.

## Symptoms, written to Apple Health (built 2026-09-08)

"My stomach hurts" said to her becomes a real HealthKit symptom sample — the
same category Apple's own Health app writes (`HKCategoryTypeIdentifier
AbdominalCramps`, thirty-eight of them), so it sits beside the readings,
survives this app, and reaches a doctor through Health's own sharing. The
one thing this app writes to Health; everything else it reads.

`health_symptom {symptom, severity?, when?, said?}` → `HealthLibrary.
logSymptom`: the words map to a category (`HealthSymptoms`: the names,
plus what people actually say — "tired" is fatigue, "stuffy nose" is sinus
congestion, longest match wins; no match is said in words, never guessed);
the first time, iOS is asked for permission to write, at that moment rather
than at install (`NSHealthUpdateUsageDescription`; `authorizeSymptoms` /
`symptomStatus` / `saveSymptom` on the bridge — the share side iOS does
disclose); severity is HealthKit's own scale and unspecified when the person
gave no word; the sample is pulled back into the store through the same
anchored query as everything else. Their words are kept as a note of kind
`symptom` with a follow-up tomorrow, so she asks how it is. Writing refused
in Settings keeps the note and says where it did not go. The categories
appear under *Symptoms* on the Data screen, counted by the examination,
never judged against a baseline.

## The Sunday letter (built 2026-09-08)

Doctors write letters. Once a week, from Sunday 18:00, she writes one
(`health_letter.dart`, `HealthPasses.writeLetter`): three short paragraphs —
the week as it was, the one thing she would change, one question — kept as
`letters/<week>.json` (a register, so a paired Mac gets it) and read under
*Letters* in the drawer, newest first, signed *— Yinyue*.

The rules draft it from what the phone holds: the plan against the sessions
that happened, named by weekday ("two of the three sessions planned — Push on
Tuesday and Long run on Saturday; Thursday's Legs did not happen"); the hours
and kilometres against the median of the previous weeks; the nights against
the person's own normal ("a median of 6 h 20, 50 min under your normal, short
on four"); resting heart rate and HRV mornings off the normal by a MAD; how
many mornings the examination raised something. The one thing to change is
one rule, in order: bed time when three or more nights were short; the missed
session when one was; an easier start when the heart sat off its normal on
three or more mornings; otherwise *Nothing. Keep it exactly like this.* When
the cloud is allowed the model may reword the two paragraphs within the facts,
under 120 words; the question is the app's: *Anything next week I should plan
around — travel, a deadline, a race?* An answer is a note like any other
(`re: letter:<week>`); it is kept and shown, and not yet read by the plan.

Due from Sunday 18:00 because the week's training is done by then and the
evening is when a person reads a letter; whichever pass runs first after that
writes it — the app opened on Sunday evening, or the 02:00 wake on Monday, in
which case it is waiting in Notification Center (for the record, no light)
when they get up. Once per week by key. The `health_letter` tool hands
Yinyue the newest, or a named week.

## The page for a doctor (built 2026-09-08)

A person walks into an appointment with a phone full of readings and no way
to say which matter. *For your doctor* (drawer, under *Yours*) is one page,
built from the nightly examinations already on the phone
(`health_doctor.dart`, `HealthStore.registers('review')`), so it costs no
second read and says nothing the app did not already decide:

- **Who** — age, sex, height, weight, the training the profile inferred, the
  goal. **Data** — how many readings across how many kinds, back to when, and
  how many examinations the 90-day window held.
- **What changed in the last 90 days** — every subject that sat off the
  person's own normal on three or more examined days, or on any doctor-tier
  day: *Resting heart rate: above my normal on 11 of the last 20 examined
  days; worth a doctor since 23 Aug. Latest 63 bpm, my normal 51 bpm.* Doctor
  tier first, then by days.
- **Readings to show** — the same subjects as a range over the window (low ·
  median · high, latest with its date), out of the examinations' own values.
- **The Watch's own detections** — each headline with the first date seen.
- **In my words** — symptoms, answers and notes from the window, newest first,
  never an intention (a promise is not a symptom).
- **Questions to ask** — at most three: one per leading subject in the
  group's words ("Is that worth checking?" for the heart, "anything I should
  rule out?" for sleep, "a pace you would expect?" for the body), a Watch
  detection ("Should that be followed up?"), then the one that fits every
  visit. None names a condition.
- The footer, on every copy: *Readings are from Apple Health on this phone,
  judged nightly against my own 28-day normal, not a population range.
  Nothing here is a diagnosis.*

**Share as PDF** renders the text through a small native bridge
(`ShareBridge.swift`, channel `dev.linggen/share`: US Letter, one column,
`## ` heads) and presents the system sheet — Mail, Files, AirDrop, print —
so it leaves the phone the way the person chooses; *Copy text* is the same
page as text. The `health_doctor_note` tool hands Yinyue the same text, so
she can offer it when an appointment comes up. It is the bridge to a real
doctor the whole design leans on: build the capability, never claim the
title.

## The debrief (built 2026-09-08)

What a coach standing at the finish says, at the moment it is wanted. The
Watch writes a workout the minute it ends and iOS delivers it at once
(background delivery is `immediate` for workouts); the library pulls it in
that wake and `debrief()` says one line: the session's name and that it is
done, then the comparison the session screen leads with — *6.00 km at 5:00
/km — 30 seconds a kilometre quicker than your last 5.* — and any first the
session set as a clause on the same line: *Your longest run yet, 12.1 km.*
/ *This month is already past your best month of running, 41 km.* One
session, one thing said; no confetti.

Rules (`health_debrief.dart`): a session is owed a line for three hours
after it ends and not after (one that landed late is one they have forgotten
the feel of); shorter than five minutes is a tap, not a session; when several
land at once the newest gets the line and the others are passed over, filed
so they are never owed one later. A first is "longest of its kind" — by
distance where it covered ground, by time where it did not — only with three
or more behind it, and "best month of its kind" only against two or more
complete months, said once per month by key. Said on the lock screen through
her herald (*After a session*, in hand, counts against her two a day) and in
her thread regardless: the budget is the lock screen's, not the thread's. A
tap lands on the session itself (`health/session/<uuid>`). Filed in
`told.jsonl` by the session's uuid, so a pull that sees it twice says it once.

## The one question and the follow-up (built 2026-09-08)

A doctor notices one thing and asks about the thing no instrument can see; a
coach who was told "bed before midnight this week" says on Sunday how many
nights it happened. These two are that, on the phone, in Yinyue's thread, and
they are the honest replacement for the shelved work signal: the person says
why, and what they said is data.

**One thing asked a morning.** It rides the morning report line rather than
being a line of its own, so a quiet morning asks nothing and a loud one asks
once. A follow-up she promised comes before a fresh question. Filed as
`asked` on the report's row in `told.jsonl`.

**The question** (`health_ask.dart`) is on the finding that leads the
report — worst first, the same order the screen uses — about what a sensor
cannot answer, in the direction it moved: HRV or resting heart rate → *Anything
going on — a cold coming, stress, a late night?*; a short night → *What kept
you up?*; a long one → *Catching up, or feeling run down?*; weight → *Has
anything changed in how you eat, or when?*; fewer steps → *A quieter stretch on
purpose, or something in the way?*; a Watch flag → *Did you notice anything at
the time?*. Never a diagnosis, never a population range. A subject is asked
about once and not again for seven days while it holds, or until answered;
when the lead was asked this week the next finding is asked instead and the
line names it ("Your resting heart rate moved as well — …").

**The follow-up** (`health_follow.dart`) is a note with a `follow_up` day:
"You said "headache since lunch" on Monday. How is it now?" Where the
intention is one the app can count — the subject grammar is `bed_by HH:MM`,
`sleep_hours N`, `steps N`, `sessions N` — it carries the count instead of a
question: "You said you would be in bed by 00:00. Four of the six nights
since, you were." Nights count by the evening they began; days count up to
yesterday, today being unfinished. No data says so in words. Said once; open
until answered.

**The answer** is a note of kind `answer` whose `re` names what it answers:
a question's key or the note's own `at`. Yinyue writes it with `health_log`
(`kind`, `subject`, `re`, `follow_up_days`); `health_examine` lists what is
open under `open` with the handle, so she knows what a reply is answering.
Notes are never edited — they are the person's words, merged as a union by
time and text across two devices — so everything she does with a note lives
in `told.jsonl`. The Mac's `Log` still writes plain notes; the shaping runs
where Yinyue lives.

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
| `Examine` | run the night's pass: every type against its own baseline → verdicts, index | edit |
| `GetReview` | the night's examination: verdicts, what was ruled out, the index and why | read |
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
| `Nudge` | hand Yinyue a notice — text, tier, route, when, until; her herald owns the budget | edit |
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
examination — the judging table, the verdicts and the index picker;
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

Still to build: the `patterns` screen behind its door, weather for outdoor
plans (needs location), and the morning line and presence widget under
[Notifications](#notifications--what-health-hands-her) — the doctor-tier
warning reaches the lock screen since 2026-09-08. Designed on 2026-09-04 and
not built: the meal lane (a photo to the user's own ChatGPT, depth captured with the shot) and the
chart catalog's other three forms — the phone draws the dial and the fortnight,
not the week bars, the day shape or the session curve. Built on 2026-09-04: the
`workouts` screen, the unattended pass, and the work-signal lane — see
`linggen-mobile/doc/health.md`.

**The window is the bound, not a row count** (fixed 2026-09-04). A dense
measurement used to be muted by the read cap rather than by any absence: the
old `_fold` read `judge.limit` rows (20 000 by default) newest-first, and
resting energy writes about 7 700 rows a day, so a four-week window was three
days deep and the verdict said *"3 days in the last four weeks — too few to
have a normal"* about a person holding thirty. That was the blood-oxygen bug of
2026-09-03 in another costume: a real measurement silenced, then a false
sentence written about the silence. `HealthStore.eachDay` now walks a type
newest-first and hands back one whole day at a time — a row is filed by the
month it started in, so a day never spans two files and memory stays flat
whatever the density. `limit` is gone from all twenty-four judges rather than
left as a knob with no consumer. The rewrite also fixed two things the old fold
had wrong: a `latest` day finds its newest row instead of trusting file order,
which is append order and not time order; and the oldest day of the window is
dropped only for a sum, because half a total is wrong while half an average or
a newest reading is fine.

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

## Notifications — what Health hands her

Yinyue speaks to a closed phone; Health hands her lines. The lane — the
wakes iOS grants, the bridge, her budget, the honesty rules — is
[linggen-mobile/doc/yinyue.md](../../../linggen-mobile/doc/yinyue.md#reaching-them-when-the-app-is-closed--her-herald-on-the-lock-screen).
This is Health's side of it. Designed 2026-09-08; Liang: Yinyue owns the
budget.

**Two lines, declared:**

| Line | Tier | When | Default |
|:-----|:-----|:-----|:--------|
| A warning | warning — bypasses the budget, lights the screen | the pass that found it | always on |
| The morning line (Yinyue's, since 2026-09-09; Health hands her the brief as a note) | for the record — passive, no light, no sound | the person's own wake time | only on a morning that changed the plan, unless they asked for every morning |
| When I could not look | for the record | two mornings after the last examination, moved on by each one | on |
| After a session | in hand — lights the screen, counts against the budget | within minutes of a workout ending | on |
| The Sunday letter | for the record | from Sunday 18:00, by whichever pass runs first | on |

All three go through Yinyue's herald (built 2026-09-08 —
`linggen-mobile/doc/yinyue.md`): declared in `HealthTell`'s constructor,
handed over as notices, her answer filed in `told.jsonl`. The third line is
what makes silence honest: the night the passes stop is the night it stays
where it was set and fires once, and then nothing is waiting.

**The warning** is built (2026-09-08): a doctor-tier finding, once per
subject and once more a week later if it holds, the same sentence her thread
carries then *Take it to a doctor.*, never a condition, filed in `told.jsonl`
with `surface: notification`. It posts through the bridge directly today and
moves under her herald when that exists, unchanged in behaviour.

**The morning line is Yinyue's since 2026-09-09** (Liang: the morning is
hers, composed from every app — Health, CFO, Ling). Health hands her the
brief as one note, with whether the night changed the plan and the wake
hour; she composes the one line, quiet on an ordinary morning, and greets the
person after three days away. What follows is Health's half. Built 2026-09-08
(now `HealthTell.morningLine`, called at the end of `morningPass`). It is
composed on the **HealthKit sleep wake** — the Watch writes the night's sleep about when
the person gets up, iOS wakes the app for twenty seconds, and that is the
freshest data the day will have and the right minute. That wake now re-runs
the morning pass, because the 02:00 brief could not have seen the night; the
morning rule decides once (a rest it imposed is never filled by yesterday's
session carrying over). The rules half of the brief is the line; the model
rewording is a bonus if it finishes inside the wake, never waited on. Where
the brief was composed at 02:00 the line is scheduled for the wake time the
profile already infers (`routine.wake`), and iOS delivers it whether or not
the app runs again; a fresher line replaces one still waiting and never one
that already went, so nobody gets the same morning twice; after noon nothing
is sent, because an afternoon brief is on the screen of whoever composed it.
Opening the app takes down a line still waiting for its time. Tap lands on
`health` — the brief is the first thing on Highlights.

**Settled 2026-09-08 (Liang): only when the plan changed** — rest imposed,
or a session moved. "Today: Push, 55 min" as planned stays quiet. A `see`
finding does not earn it (2026-09-04), and a doctor-tier finding has its own
warning. Since 2026-09-09 the choice — every morning, or only when something
changed — is Yinyue's settings row, not Health's drawer row, and holds for
every app's note at once.

**Presence without a line** — a widget: "Rest today · HRV 7 under your
normal", or "Examined 02:14 · at your normal". Glanceable, never interrupts.
Built 2026-09-08 as the app's own WidgetKit extension (`ios/GlanceWidget`;
the DJ widget the pubspec mentioned had never been added): the phone writes
`health.glance` after every pass, the widget renders it and computes
nothing, and at midnight it says "Not examined yet today" rather than wear
yesterday's line. Lock screen inline and rectangular, home screen small and
medium; a tap opens Health.

**Rejected for this:** a Watch app — iOS mirrors notifications to a paired
Watch while the phone is locked, so the brief reaches the wrist for free; a
Live Activity — it is for a thing in progress with an end, cannot start from
a background task, and iOS ends it after eight hours.

**When she could not look:** a swiped-away app gets no wakes, and Background
App Refresh off refuses the night's task. After two missed nights she says so
once — "I have not been able to look since Tuesday" — and then stays quiet.
Never a line from data older than the day it claims to be about.

## Topics

**None of this is built** (2026-09-04). The mirror is request/response over
`/api/bash` into `ingest.mjs`, so nothing publishes and no surface can
subscribe — a progress strip or a second device watching a sync is the first
thing that will need the table below.

| Topic | Direction | Retained | Carries |
|:------|:----------|:---------|:--------|
| `tasks/health` | both | yes | backfill / sync progress |
| `health/registers` | both | yes | profile, layout, plan, targets, checklist, brief, review as LWW registers |
| `health/told` | both | yes | what the agent has already come to the user with, so it neither repeats nor double-tells across devices |
| `health/sync-requested` | Mac → phone | no | the Mac asking for a drain |
| `actions/health-*`, `-done` | both | request retained | cross-device tool calls |

Readings retain, actions queue. Registers are readings: the newest
`written_at` wins on both sides.

## Later, and never

Kept from the original feature list; nothing here is built or scheduled.

- Race and pace prediction from VO₂max and recent runs feeding the plan;
  lifting progress by photo and plate math; a monthly and yearly review in
  her voice.
- Mirror the plan into Apple Calendar behind a one-time opt-in; buyer advice
  on ask from a live search with the source shown (Paid); write back to
  HealthKit (water, caffeine, protein, mindful minutes, workouts).
- A Watch complication and glance; family on one Mac (rows already carry
  `by`); Android via Health Connect; medications, state of mind and clinical
  FHIR records as context; vendor APIs on the Mac.
- CarPlay: never. A score of our own: never again.
- Settings the phone will grow: which types to read, pass time, quiet hours,
  how blunt the voice is, layout history, export as CSV and Markdown.

## 1.2 — she knows you (designed 2026-09-10; 1–6 built the same day)

Apple's Health redesign of 2026-09-09 (Insights, For You, Readiness 0–10,
Health Age, Longevity, labs, expert videos) owns the cards and the scores.
We own the conversation. 1.2 builds the conversation, in this order.

1. **The talk that examines** (built: `HealthEvents.mentionsHealth`, `YinyueTools.lastUserText`, the examine-first line in her prompt)**.** Health words in a message on Yinyue's page
   switch the health pack on, whatever tab is open, and she runs the
   examination before she answers. A question about the body is never
   answered from memory alone.
2. **A finding beside an absent sensor** (built: `HealthAsk.nightAbsent`, `HealthEvents.causeFor` reads the Watch's sessions first)**.** The question may pair the leading
   finding with a night that has no data: *HRV sat under your normal this
   morning and there is no sleep from last night — not wearing the watch,
   or a short one?* She checks workouts first: when the Watch recorded a
   session she names it instead of asking.
3. **What the sensors can't see — the invitation, the register, the
   cause** (built: `health_events.dart`, note kind `event` with `on`, `HealthAsk.explain`, `HealthPatterns` event conditions, `tracking.json` + `health_tracking`, the Watching page, the letter and the meet card)**.** Never a questionnaire. She says it once, on first meeting in
   Health, and again as the Sunday letter's closing line: *I see what your
   Watch and the devices in Apple Health record. Anything they didn't — a
   match, a swim, a late night — just tell me. It helps the review.* The
   person types it whenever; rules resolve the date ("yesterday" → 9 Sep)
   and a kind from a small fixed list (session with a sport, worked late,
   travel, ill, alcohol, caffeine, late meal, other), keep the words
   verbatim, and file `{kind: event, at, text, re}` in the event register.
   A later note about the same date corrects the kind and keeps both texts.
   `tracking.json` is her list of blind spots — what HealthKit cannot tell
   her (sleep on a night the Watch was off, late work, stress, alcohol,
   caffeine, meals, pain, sessions played without the Watch, travel) — shown
   on the Watching page as *What I can't see — tell me*. A list, not a
   schedule: no proposing, no cadence, no retiring. A question still comes
   only from a finding, one a day, on the thing that leads, when the data
   has no reason. When an answer names a cause she remembers it: the next
   morning the same pattern shows she says *basketball again yesterday —
   expected* instead of asking. Three of one kind feed Patterns as a
   condition ("after basketball, HRV under next morning, 3 of 4"); the
   letter and the doctor page quote events as the person's words; when a
   pattern goes stable the nightly pass writes one durable line to her
   memory rows (*plays basketball Tuesday evenings; HRV dips the morning
   after*). Events stay on the phone, the fact travels. Her reply keeps the
   voice rules — one observation, one question, one recommendation; praise
   for the match and the warm-up are the recommendation.
4. **No score** (built: `score*` fields no longer written, the phone's number card and the Mac dial gone, `health_review` says there is none)**.** The ring on the Mac page and every `score*` surface go;
   `index` stays. Apple's Readiness, Sleep Score and Health Age are read as
   inputs if HealthKit exposes them; if not, the person tells her and she
   folds it in. We never compute one.
5. **The letter is a Monday card** (built: `HealthHome.notices`, `opened_at` stamped by the Letters page, the card under Attention)**.** Highlights carries the Sunday letter from
   Monday; it closes the day after it is opened, and on Friday regardless.
6. **The doctor page, clinical only, on two occasions** (built: `HealthDoctorNote.clinical`, the appointment as an intent note with subject `appointment`, the card under Attention, the clean first line)**.** Subjects: resting
   heart rate, HRV, blood oxygen, sleep, weight, blood pressure, Apple's
   flags, logged symptoms, medications. Shown as a card only on a warning
   (with the line *When you book, share this page — as PDF, or pasted into
   the portal*) or on the morning of an appointment the person mentioned.
   When nothing qualifies its first line is *Nothing here needs a doctor.
   90 days at your normal.*
7. **Highlights, composed by her.** Health publishes its candidates —
   findings, charts, the plan for today, the checklist, a nutrition or
   supplement line, the letter, the doctor page — and Yinyue writes the
   page from them on a signal; the rules write the default; at most six,
   under two screens; a swipe dismisses a card for that fact and the next
   candidate takes the slot; a warning cannot be dismissed. The mechanism
   is app-wide: `linggen/doc/dynamic-ui-spec.md`, "The composed screen".
8. **Nutrition and supplements — a list settled together.** Not a diary,
   and not a leaflet. When she sees the person training — sessions in the
   data, a goal set — she comes to them once: *I see your workout data.
   Here is a supplement and nutrition list based on your weight, your
   training energy and your goal. Take a look and tell me what to adjust.*
   The list is a register, `nutrition.json`: items with a name, a dose, a
   timing, and the reason in their numbers (protein per kilo by goal,
   calories from the formula, creatine for a lifter, electrolytes for a
   long session), each marked proposed or theirs. They adjust in words —
   "no creatine", "whey after gym only", "add magnesium" — and the settled
   list is the fact: the checklist reads from it, the debrief reminds from
   it ("after 12 km: protein within the hour"), a weigh-in trend or a short
   night may move one line, said in her thread. Intake is an event in
   words ("40 g whey after gym") with a kind and an amount; the day's
   totals sit against the targets; energy out from HealthKit, energy in
   from HealthKit when a logging app writes it, else from their words, said
   as an estimate. She never makes a medical claim, says "ask your doctor"
   where an interaction is plausible, and proposes only what their data
   argues for. A Nutrition page in the drawer: the list, in against out,
   protein against target. A Highlights candidate when a line moved or the
   list is waiting for their word (Liang, 2026-09-10: "fact should be
   settled with the user together… Yinyue needs to be proactive, ask the
   user when needed").

The work signal stays shelved (Liang, 2026-09-10): there is no trustworthy
source for it yet. The person's own words — build 3 above, "worked late" as a
kind they tell her — are the reason a late night gets, until there is one.

After 1.2: **1.3 lessons** — every term she uses has one lesson in four fixed
parts (what it is · yours against typical for age and sex · what moves it ·
what she watches), said in one line the first time it matters, dropped after
it has been opened twice, kept on a *Learn* page in the order the body raised
them. **1.4 the coach in session** — the debrief becomes a conversation, live
pace and effort from the Watch, cadence from the phone's own sensors.

## Settled (2026-09-10)

- **Yinyue's page is the core of the app.** Her screen is shared by every
  app and she walks the person to a screen; Health stays quiet, says what
  is and never why. The why, the question and the offer to act are hers.
  Concept: <https://claude.ai/code/artifact/8fcbe403-6623-4efa-a66c-d9816785c3a5>.
- **Extend Apple Health, never duplicate it.** No Insights, For You, Health
  Age, Longevity, labs, videos or camera assessments. Conversation, memory,
  life outside HealthKit, lessons, the plan with hands, the doctor line.
- **No score, anywhere.** See 1.2 (4).
- **The doctor page is clinical-only and appears on a warning or an
  appointment.** See 1.2 (6).
- **The letter is a Monday Highlights card.** See 1.2 (5).

## Settled (2026-09-08)

- **Yinyue owns the budget.** Everything Linggen says to a closed phone is
  her voice under one budget; apps hand her notices and declare their lines.
  The lane is in `linggen-mobile/doc/yinyue.md`; Health's two lines are under
  [Notifications](#notifications--what-health-hands-her).
- **The morning line goes only when the plan changed** — rest imposed or a
  session moved — quietly, at the person's own wake time. Built the same day.

## Settled (2026-09-04)

- **The alarm boundary** — closed, and built. Two first-sight paths bypass the
  nine-day sustained rule, because a warning that waits nine days is not a
  warning. (1) **Apple's own detections, relayed**: irregular rhythm, high or
  low heart rate while still, and sleep apnea events say *doctor*; low walking
  steadiness and low cardio fitness say *see*. No judgement of ours is added —
  the Watch decided against thresholds the user set, and has already told them
  once. Seven-day window, because a warning nobody can clear teaches people to
  ignore warnings. (2) **One published threshold**: blood oxygen whose day
  median sits below 90% over at least three readings. A count of low readings
  was tried first and failed against real data — a loose strap wrote 86% and
  89% on a day that also held 96, 96, 97, 97 and 99. Everything else worth
  alarming on already has an Apple event tuned to the user, and a threshold we
  invent fires on the athlete whose resting rate is 38.
- **A notification fires on the doctor tier only** (Liang, 2026-09-04). Not on
  a *see* finding: that stays on the screen and in the thread, reached when the
  user opens the app. So the phone will be quiet for months at a stretch, which
  is the point of a warning — and it means the lane cannot be proved by
  waiting, only by staging a review onto the device. **Built 2026-09-08**: a
  local notification on the phone at the end of the pass, once per subject
  and once more a week later if it is still there; the same sentence her
  thread carries, then *Take it to a doctor.*, never a condition; filed in
  `told.jsonl` with `surface: notification` so what reached the person is one
  account whichever door it came through; a tap lands on the review. The
  permission is asked right after the HealthKit sheet and shown on the
  drawer's *Underneath* group, read back from iOS. See
  `linggen-mobile/doc/health.md` — *A warning reaches a closed phone*.

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
  exist below two usable metrics. *Retired 2026-09-10: no number at all — see
  1.2 (4).*
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

1. **In-app attention.** May the app learn from what you look at at all, or
   only from deliberate acts (pin, hide, and what you ask the chat)? Asking is
   the strongest untapped signal and Apple has no equivalent; watching what you
   open is the part that needs permission.
2. Skill and app name: `health` / "Linggen Health", or something in the Yinyue
   world?
3. Free vs Paid split inside the suite as proposed under *Who pays*, or the
   nightly examination free too?
4. Should durable profile facts go to ling-mem automatically (weekly pass), or
   only when the user says "remember that"?
*(The photo and the promise was settled on 2026-09-04 — the image goes to
the user's own ChatGPT over OAuth. See
[What you eat](#what-you-eat--an-estimate-is-never-a-measurement).)*

## Related docs

- [ui-ux-design.md](ui-ux-design.md) — the first view: Brief, Focus, Attention.
- [prototype.html](prototype.html) — the interactive prototype (three
  people, the first run, the screens); published at
  https://claude.ai/code/artifact/43f03b3e-15df-4831-ac89-62a182e35525
- `linggen-mobile/doc/health.md` — what the phone has built.
- `linggen-mobile/doc/tech-spec.md` — transport, attribution, device topics.
- `linggen-mobile/doc/dj.md` — the phone-standalone + sync shape this copies.
- `linggen/doc/app-action-spec.md` — one writer per mutation, tool tiers.
- `linggen-app/doc/app-ideas.md` § Health Keeper — the backlog entry.
- Concept, 2026-09-10: https://claude.ai/code/artifact/8fcbe403-6623-4efa-a66c-d9816785c3a5
