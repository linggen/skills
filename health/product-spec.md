---
type: spec
reader: Liang, coding agent, contributors
guide: |
  Product specification for Linggen Health — what it is, every feature we
  could build, the v1 cut, the surfaces, and the workflows. design.md is the
  companion (data, sync, storage, schemas, tools). Brief; not a code reference.
status: draft 2026-09-02 — direction set by Liang; nothing built yet
---

# Product Spec: Linggen Health

## Vision

**Apple Health shows the same app to everyone. Linggen Health composes the app
from you.**

The agent is the core. It reads everything Apple Health holds, keeps it on your
own Mac, and from that data works out who you are: a runner who trains outdoors,
a lifter who is bulking, someone whose job is a chair and a screen. Then it
builds the app for that person: which cards sit on top, what the plan for the
next days looks like, what today's checklist holds, which progress chart
matters. It keeps learning from what you look at, what you do, and what you
tell it, and it changes the app as you change. Every change says why, and one
tap undoes it.

The agent has one goal, written into its charter: **help the user get better at
what they are trying to do, and make them love Linggen Health.**

Three things no incumbent does:

1. **It knows you.** Age, sex, weight, hobby, routine, level, and goal — inferred
   from years of Watch data in the first minute, from what you open, and from
   what you say. Never a quiz.
2. **It composes the app.** A runner gets pace, per-km history and a run plan on
   top. A lifter gets the split, protein, and the weight trend. A desk worker
   gets screen time, sitting streaks and move breaks. Same code, one catalog of
   cards, different app.
3. **It plans and tracks.** Next several days scheduled around weather, sleep
   and load; a daily checklist for nutrition and training; progress toward the
   goal in charts. It adapts when you skip.

Persona depth is free. There is no runner code and no lifter code; there is a
profile the agent infers and a catalog the agent composes from. The app says
out loud what it inferred and lets you correct it.

## Positioning

- **Not a fixed dashboard.** Apple's Summary is a Favorites list you pin by
  hand. Ours is composed from your data and re-composed as you change.
- **Not a score.** Rings, Oura, Whoop own the score. We show your numbers
  beside your own baseline and never lead with a grade.
- **Not a chat with your data.** Chat exists (Yinyue on the phone, Ling on the
  Mac); the front door is the composed Home.
- **A coach, not a nag.** One plan, one checklist, one why. Nudges only through
  Yinyue's herald, quiet while you are enjoying something.
- **Wellness only.** Activity, sleep, load, nutrition targets, habits, patterns.
  Never diagnosis, never medication advice. Supplement advice is the evidence
  in plain words; brands only when asked, from a live search, and later.
- **Local.** Health data goes phone → Mac over WebRTC and stays there. The cloud
  model sees a day's summary only when the user has consented to cloud.

## Who pays, and how

An **attach**, not a standalone subscription: the app is free on the store, the
payment is the linggen.dev plan. Linggen Health is what makes someone keep the
plan: the daily pass, the weekly composition, the plan and the patterns burn
Paid tokens every day; phone → Mac away from home needs the relay; buyer advice
needs cloud search.

Proposed split (open — Liang's call):

- **Free:** full import, sync, the data browser, workout and sleep detail, the
  first composition, one weekly brief.
- **Paid:** the daily pass (brief, checklist, plan adjustments), weekly
  re-composition, the plan, patterns, agency, ask-anything over months, buyer
  advice.

## Everything we could build

Grouped. **v1** marks the first cut. Nothing here is a fixed dashboard number.

### A. Data — get everything

| # | Feature | v1 |
|:--|:--------|:--:|
| A1 | Import every readable HealthKit type, incremental with anchors, deletions honored | v1 |
| A2 | Watch workouts in full: HR series, laps, pauses, multisport, GPS route + elevation, HR recovery, effort score | v1 |
| A3 | Running metrics (power, cadence, stride, ground contact, vertical oscillation); cycling power, FTP; swim strokes | v1 |
| A4 | Body: weight, body fat, lean mass from any scale that writes to HealthKit (Withings, Eufy, Renpho…) | v1 |
| A5 | Characteristics: date of birth, biological sex, height — the profile's fixed facts | v1 |
| A6 | Third-party passthrough: Oura, Garmin, Whoop, Strava write to HealthKit, so they arrive free | v1 |
| A7 | Background wake: a workout ends, a weigh-in or the night lands → the phone pushes without being opened | v1 |
| A8 | Phone → Mac sync over WebRTC; phone is truth, Mac is the mirror; queue while the Mac is away | v1 |
| A9 | Full history backfill on first run (years of Watch data), newest first, progress on the tasks strip | v1 |
| A10 | Attention: which cards were opened, expanded, dismissed, asked about — rides the same outbox | v1 |
| A11 | Typed context by voice or chat: "knee hurts", "travelling", "4 sets legs done", "32 g protein" | v1 |
| A12 | Life signals: screen time and IDE hours (Apple Shifu), commits and sessions, calendar, DJ listening | v1 (Shifu + commits + calendar) |
| A13 | Weather by day and hour for the user's location (Open-Meteo, no key) — read only when the profile says outdoors | v1 |
| A14 | Medications and doses as context (iOS 26), state of mind (iOS 18), clinical FHIR records | later |
| A15 | Android via Health Connect | later |

### B. Know — the profile

| # | Feature | v1 |
|:--|:--------|:--:|
| B1 | **Profile inferred from history on day one**: athlete kind (runner, lifter, cyclist, swimmer, walker, none), indoor or outdoor, level, weekly volume, from years of workouts | v1 |
| B2 | Body facts from HealthKit characteristics and the latest weigh-in: age, sex, height, weight | v1 |
| B3 | Routine from the data: wake and bed times, desk hours, sitting streaks, typical training days | v1 |
| B4 | Goal as conversation: bulking, cutting, a race, run further, sleep better, just move — kept in memory | v1 |
| B5 | Attention learning: what the user opens and expands raises a card; what they dismiss lowers it | v1 |
| B6 | Every profile field carries confidence and evidence; the user sees it and can say "not quite" | v1 |
| B7 | Profile refreshes at the weekly pass; a new goal or a corrected field refreshes it now | v1 |
| B8 | Durable profile facts promoted to ling-mem in the user's words, so the rest of Linggen knows | v1 (weekly) — see open question |

### C. Compose — the app built from the profile

| # | Feature | v1 |
|:--|:--------|:--:|
| C1 | **Card catalog in code**: brief, plan today, checklist, running, pace history, HR history, lifting split, weight trend, screen time, sitting, sleep, HRV, steps, VO₂max, patterns, weather window | v1 |
| C2 | **Composition by the agent**: which cards, in what order, what size, each with a headline and a one-line why | v1 |
| C3 | Layout changes are automatic, with a why-line at the top of Home and one-tap Undo | v1 |
| C4 | Churn cap: the layout moves only at the weekly pass or on the user's own action; numbers change daily, the shape does not | v1 |
| C5 | Pin and hide by the user win forever; the agent composes around them | v1 |
| C6 | First composition from history within the first minute of the first run | v1 |
| C7 | "What changed" history on the Mac: every composition with its reason, restorable | v1 |
| C8 | Card headlines written in the user's terms and Yinyue's voice | v1 |

### D. Plan — the next several days

| # | Feature | v1 |
|:--|:--------|:--:|
| D1 | **Weekly plan** written at the weekly pass: for each day a session or rest, with a reason, from goal, level, load, sleep and the calendar | v1 |
| D2 | Outdoor athletes: weather joined per day; run on the good day, rest or move indoors on the rain day | v1 |
| D3 | Lifters: the split (chest / legs / back / pull / push…), sets and reps by level, deload weeks, progressive overload | v1 |
| D4 | Nutrition targets from body and goal: protein g/kg, calories for bulking or cutting, water — formula shown | v1 |
| D5 | Supplement advice as evidence in plain words (creatine, BCAA, caffeine…) by age, weight, experience | v1 |
| D6 | Daily adjustment: the morning pass moves today's session for a bad night, high load, rain, or a skipped day | v1 |
| D7 | The plan lives in the app; it is the source of truth. Reminders come through Yinyue | v1 |
| D8 | Mirror the plan into Apple Calendar behind a one-time opt-in | later |
| D9 | Buyer advice on ask: "which creatine should I buy" → live market search, criteria first, named products with the source | later (Paid) |
| D10 | Race and pace prediction from VO₂max and recent runs feeding the plan | later |

### E. Track — checklist and progress

| # | Feature | v1 |
|:--|:--------|:--:|
| E1 | **Daily checklist** derived from the plan and targets: "Protein 32 g served ✓", "Legs · 4 sets ✓", "Weigh-in ✓", "Run 6 km ✓" | v1 |
| E2 | Auto-check from HealthKit where the data exists (workouts, weigh-ins, dietary types from any food app); manual tap or voice otherwise | v1 |
| E3 | **Bulking / cutting progress**: weight and lean mass trend as weekly averages against the goal line | v1 |
| E4 | **Running progress**: per-km time history, distance per week, pace at same HR, VO₂max trend | v1 |
| E5 | **Heart history**: resting HR, HRV, recovery over weeks and months | v1 |
| E6 | Lifting progress: sets, reps, weight by voice; tonnage per muscle group | v1 (voice log), later (photo, plate math) |
| E7 | Adherence: planned vs done per week, said honestly and folded into next week's plan | v1 |
| E8 | Export everything as CSV and Markdown; it is the user's data | v1 |

### F. Understand — better than Apple, AI native

| # | Feature | v1 |
|:--|:--------|:--:|
| F1 | **Morning brief** as the top card: one sentence, the evidence, today's session | v1 |
| F2 | Personal baselines, not population ranges; every number shown as a delta from *your* normal | v1 |
| F3 | Pattern memory across months: "every release week", "after 23:00 commits", with evidence and confidence | v1 |
| F4 | Sleep: stages, debt, consistency, overnight HRV and wrist temperature, and what tracks with a bad night | v1 |
| F5 | Workout report per session: zones, splits, recovery, effort, "vs your last five", what to do next | v1 |
| F6 | Desk-worker health: sitting streaks from stand hours + Mac activity, late work vs sleep, screen time vs your normal | v1 |
| F7 | Ask anything over all history: "my pace the month before the race" | v1 |
| F8 | Weekly written report on Mac and phone | v1 |
| F9 | Honest uncertainty: "not enough data yet" said out loud; a pattern needs weeks, a weight trend needs a week | v1 |
| F10 | Early-illness signal: overnight temperature + HRV + respiratory rate drift, said as a hunch | v1 |
| F11 | Our own scores rebuilt from raw with the formula visible: readiness, training load | later |
| F12 | Monthly and yearly review in Yinyue's voice | later |

### G. Agency — the agent drives

| # | Feature | v1 |
|:--|:--------|:--:|
| G1 | Nudges through Yinyue's herald: today's session, stand, water, wind down — rule-gated, model-judged, quiet while enjoying | v1 |
| G2 | Cross-app actions: DJ wind-down playlist at bedtime, Yinyue goes quiet, Pulse waits | v1 (DJ + Yinyue) |
| G3 | Act on the cause: move a meeting, refuse a long run after a bad night | v1 (propose), later (calendar write) |
| G4 | Log by voice: "ran 6k, knee sore", "legs done, 4 sets", "protein shake" → checklist + note | v1 |
| G5 | Write back to HealthKit: water, caffeine, dietary protein, mindful minutes, workouts | later |
| G6 | Watch: today's session and the checklist on the wrist, one-tap check, start the planned workout | later |
| G7 | Family: several phones, one Mac; each person's rows carry `by`; profile and plan are per person | later |

### H. Surfaces

| # | Feature | v1 |
|:--|:--------|:--:|
| H1 | Phone: Health under ON THIS PHONE — Home (composed), Plan, Track, Workouts, Patterns, Data, Settings | v1 |
| H2 | Mac: Linggen Health page — the profile with evidence, the composition history, the plan, months of trend, patterns, chat | v1 |
| H3 | "Right now" block on the Mac carries the body state and today's session | v1 |
| H4 | Data browser: every type, count, last sample, source, granted / silent-empty — show everything | v1 |
| H5 | Watch complication and glance | later |
| H6 | CarPlay: none | never |

### I. Trust

| # | Feature | v1 |
|:--|:--------|:--:|
| I1 | Local only; phone → Mac; never in iCloud, never sold, never for ads | v1 |
| I2 | Permission ledger on screen: which types were granted, which return nothing, since when | v1 |
| I3 | The profile is visible with its evidence; "not quite" corrects it and the correction wins | v1 |
| I4 | Every composition carries its why and its undo; every agent action visible as a chip | v1 |
| I5 | Wellness scope written into the skill and the UI; the agent declines diagnosis and says who to ask | v1 |
| I6 | No brand is named unprompted; on ask, the source is shown | v1 |

## v1 in one paragraph

Import everything, sync to the Mac, infer the profile from history in the first
minute, compose Home from the card catalog with a why-line and Undo, write the
week's plan (weather for outdoor athletes, the split and targets for lifters,
move breaks for desk workers), derive the daily checklist and auto-check it from
HealthKit, show progress toward the goal as charts, keep personal baselines and
patterns that say "not enough data yet" until they can prove something, nudge
only through Yinyue, and re-compose weekly as the user changes. The plan lives
in the app. No brands, no calendar writes, no diagnosis.

## Three people, one app

Examples of what composition yields. These are outputs, not code paths.

**The outdoor runner.** Home: brief, today's run with the weather window, pace
history, weekly distance, HRV. Plan: five days scheduled around rain, long run
on the dry weekend day, rest after the long one. Track: per-km time chart, run
6 km ✓, water ✓. Why-line: "Running on top because you ran 4 of the last 7
days."

**The lifter, bulking.** Home: brief, today's session (legs), protein target
and progress, weight trend against the goal line, sleep. Plan: push / pull /
legs across the week, deload in week 4, 2.0 g/kg protein shown as the formula.
Track: protein 128 of 160 g, legs 4 sets ✓, weigh-in ✓, creatine ✓. Why-line:
"Weight trend on top because you said you're bulking on 28 Aug."

**The office worker.** Home: brief, screen time vs normal, sitting streak,
today's move break, steps, sleep. Plan: three 20-minute walks and two short
strength sessions on the lightest calendar days. Track: walk ✓, stand 8 of 12,
water. Why-line: "Screen time on top because you logged 9 hours in an IDE
yesterday."

## Surfaces (UI)

### Phone — Health, under ON THIS PHONE

Drawer row shows the last sync ("2 min ago") and a pulse while a sync runs.
Title ▾ lists **Today / This week / This month**; ⋮ carries **Sync now / Log by
voice / Who you are / Permissions / Export**. Lists use the ⋯ item menu; nothing
swipes.

1. **Home** (composed). The why-line when the layout changed this week, with
   Undo. Then the cards the agent chose, top card first. Every card opens its
   detail. A text and mic field at the bottom goes to Yinyue with Home as
   context. Long-press a card: Pin, Hide, Why this.
2. **Plan.** The next seven days, one row each: session or rest, the reason,
   weather where it matters. Tap a day to see the session detail (sets, route,
   duration). "Adjusted this morning" rows say why.
3. **Track.** Today's checklist on top: each item with its target, auto-checked
   or tap to check, voice to log. Beneath, progress toward the goal: the chart
   the goal needs (weight trend, per-km time, tonnage, weekly distance), then
   heart history. Adherence for the week at the bottom.
4. **Workouts.** List; detail has the route, HR zones, splits, recovery, effort,
   "vs your last five", and the agent's one paragraph.
5. **Patterns.** Cards: claim, confidence ("4 of 5 release weeks since June"),
   evidence rows, first seen. A grey card reads "Not enough data yet — 2 of 4
   weeks".
6. **Data.** Every type: samples, last sample, source, granted or silent-empty.
   Tap a type to browse raw samples.
7. **Settings.** Which types to read, pass time, nudges and quiet hours, how
   blunt the voice is, layout changes (automatic with undo; history), the plan
   (calendar mirror off), sync state per Mac, export.

**Who you are** (sheet from ⋮ or from the why-line): the profile as the agent
holds it, each field with confidence and evidence, a "Not quite" on every row.

### Mac — Linggen Health page

Web app at `/apps/health/`, same launcher as DJ. Left column: the profile with
evidence, the composition history ("what changed and why", restorable), this
week's plan with adjustments. Centre: months of trend as small multiples on one
axis, progress charts, the patterns board, reports, sync state. Right: the chat
panel. The agent updates the page through PageUpdate.

### Watch (later)

Complication: today's session. App: the checklist, one-tap check, start the
planned workout.

## Workflows

### 1. First run

1. Open Health in the drawer. One screen: "Everything, or pick" — the
   recommendation is everything.
2. iOS permission sheet (Turn All Categories On).
3. Backfill starts newest first: "Reading your history — 3 years, 212 workouts"
   on the tasks strip.
4. **Within the first minute** the profile pass reads the last months and
   composes Home: "You look like an outdoor runner, 3 runs a week, 5:30 pace —
   not quite?" The first plan follows once the goal is known; until then the
   Plan screen asks one question.
5. First brief needs one night. First pattern needs four weeks and says so.

### 2. Every day

- Night lands in HealthKit → phone wakes, syncs the delta → Mac runs the morning
  pass: baselines, last night, yesterday's work, weather if outdoors, the plan
  → writes the brief, today's checklist, and any plan adjustment with its why →
  retained topics → phone shows them, Yinyue says the session once when first
  spoken to, Mac "Right now" carries the state.
- Through the day the checklist auto-checks as samples land; voice fills the
  rest.
- Nudges only through Yinyue's herald.

### 3. After a workout

Watch ends the workout → background delivery → sync → Mac writes the workout
report, checks the session off, updates progress → tomorrow's brief may lead
with it.

### 4. Weekly

Sunday evening: profile refresh from the week's data, attention and notes →
re-composition if the profile moved (why-line + undo) → next week's plan →
the weekly report. Durable profile facts go to memory in the user's words.

### 5. Ask

On either surface: "Which creatine should I buy?" → evidence first (monohydrate,
3–5 g, third-party tested), then, when buyer advice ships, a live search with
the source shown.

### 6. Away from the Mac

Phone keeps reading HealthKit and queues the delta. Over the relay the sync
runs the same way. With no Mac reachable, the phone shows its last Home, plan
and checklist and keeps checking items locally; nothing pretends to be fresh.

## What Linggen Health never does

- Diagnose, or comment on medication.
- Show the same Home to two different people, or rearrange it daily.
- Change the layout without saying why, or without an undo.
- Name a brand unprompted, or name one without the source.
- Lead with a score, or show a number without the personal baseline beside it.
- Surface a pattern from one week, or a weight trend from one morning.
- Send health data anywhere but the user's Mac.
- Nudge outside the herald, or nudge while the user is enjoying something.

## Related docs

- [design.md](design.md) — data, sync lane, storage, schemas, tools, passes.
- [prototype.html](prototype.html) — interactive prototype (three people, the
  phone screens, Mac page, workflows); published at
  https://claude.ai/code/artifact/43f03b3e-15df-4831-ac89-62a182e35525
- `linggen-mobile/doc/health.md` — the phone ⇄ Mac spec, written when the
  phone side is built.
- `linggen-app/doc/app-ideas.md` § Health — the backlog entry.
