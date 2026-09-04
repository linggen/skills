---
type: spec
reader: Liang, coding agent, contributors
guide: |
  Product specification for Linggen Health — what it is, every feature we
  could build, the v1 cut, the surfaces, and the workflows. design.md is the
  companion (data, sync, storage, schemas, tools). Brief; not a code reference.
status: draft 2026-09-04 — two tabs, a chart catalog with one pick, and what you ate as an estimate you correct. Supersedes the five-tab shape of 2026-09-03, which itself superseded the composed dashboard of 2026-09-02. Phone-first. The prototype is the spec; the built app has not caught up — the two-tab surface, the drawer, the workouts screens and the intake lane are designed and not yet coded.
---

# Product Spec: Linggen Health

## Vision

**Apple Health shows you everything and tells you nothing. Linggen Health reads
everything and shows you almost nothing.**

Every night the agent walks every measurement this person has — every type,
against that person's own history — and comes back with one of three verdicts
each: at your normal, worth seeing, worth a doctor. Nearly all come back at
your normal, and those are never shown. What reaches the screen is the part
that is not right, and on most mornings that is nothing at all. A quiet screen
is the finding, and the app says so out loud rather than leaving a blank.

The agent is still the core, and it still builds the view from this person's
own data — which measurement matters is picked per user, not fixed in the app.
What changed is where it does its talking. **The screen carries findings; the
agent carries everything else, in the conversation.** It does not explain the
layout on the layout. And it does not wait to be asked: when a pass finishes or
something is seen, it comes to the user in its own thread and says what it did,
how much it read, what came out, and what it changed as a result.

The agent has one goal, written into its charter: **help the user get better at
what they are trying to do, and make them love Linggen Health.**

Three things no incumbent does:

1. **It examines everything, every night.** Not a grid of favourites you pinned
   by hand: every type you have, judged against your own last month. Apple
   shows the same screen to everyone and leaves you to spot the problem.
2. **It stays quiet.** A card earns its place by having news today. At your
   normal is not a slot. Apple gives three rings because everything cannot be
   on screen; we go further and show only the part that is wrong.
3. **It comes to you.** The finding arrives in the conversation, unprompted,
   with what the agent did about it. A finding that waits for you to open the
   right screen is a finding the app kept to itself.

Persona depth is free. There is no runner code and no lifter code; there is a
profile the agent infers and a catalog the agent composes from. The app says
out loud what it inferred and lets you correct it.

## Where it runs

**The phone is the whole product.** Like DJ, Linggen Health works on the iPhone
alone: it reads HealthKit, keeps its own store, runs the agent passes with the
account's cloud model, examines every type against its own baseline, builds the
screen from what is left, and writes the plan and the checklist. A user with no
Mac is a complete user.

**The Mac is optional and adds two things.** Long memory (years of samples,
months of patterns, ling-mem) and the work side of the join (screen time, IDE
hours, commits, calendar from Apple Shifu and the engine). With a Mac paired,
the phone syncs its store there, the Mac takes the heavier weekly pass, and the
Mac page leads with the same finding the phone led with — putting the months,
and every measurement that had nothing to say, one tab behind it.

**A Mac with no iPhone gets no body data.** HealthKit exists only on iPhone and
iPad, iCloud Health is end-to-end encrypted, and an Apple Watch cannot be set
up without an iPhone. The Mac page then composes from what the Mac knows (the
work side) and shows one card that says where the body data lives, with the
pair QR. Later, "Connect a service" brings Oura, Garmin, Whoop, Strava and
Withings to the Mac through their own APIs.

## Positioning

- **Not a fixed dashboard.** Apple's Summary is a Favorites list you pin by
  hand, and it looks the same on the day everything is fine as on the day it
  is not. Ours is built each morning out of what actually moved.
- **Not a health score.** No consumer sensor supports a clinical judgment of a
  body, and Apple deliberately never ships one. The number on the status line
  is today against *your own* normal — 80 means at your normal — and it names
  the measurements it was made of.
- **Not a chat with your data, and not a screen either.** Both are the app.
  The screen is where findings land; the conversation (Yinyue on the phone,
  Ling on the Mac) is where the agent speaks — including first, unasked.
- **It builds the capability; it does not claim the title.** A daily
  examination, an index chosen per person, a warning that will not be
  dismissed: all of it ships. The word "doctor" appears only as *worth showing
  a doctor*, never as a claim about what the app is.
- **A coach, not a nag.** One plan, one checklist, one why. Nudges only through
  Yinyue's herald, quiet while you are enjoying something.
- **Wellness only.** Activity, sleep, load, nutrition targets, habits, patterns.
  Never diagnosis, never medication advice. Supplement advice is the evidence
  in plain words; brands only when asked, from a live search, and later.
- **Yours.** Health data stays on your phone, and on your Mac if you have one.
  The cloud model sees a day's summary to run a pass, never the raw store, and
  nothing is kept there.

## Who pays, and how

**Linggen is $5 a month for every app** — CFO, DJ, Health and the rest. Health
is one app in the suite, not a tier. It is the app that makes the plan worth
keeping: the daily pass, the weekly composition, the plan and the patterns burn
tokens every day.

Proposed split inside the suite (open — Liang's call):

- **Free (trial bucket):** full import, the data browser, workout and sleep
  detail, the first examination, one weekly report.
- **Paid:** the nightly examination (verdicts, status line, checklist, plan
  adjustments), weekly re-composition, the plan, patterns, the agent coming to
  you unprompted, ask-anything over months, buyer advice.

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
| A7 | Background wake: a workout ends, a weigh-in or the night lands → the phone runs its pass without being opened | v1 |
| A8 | The phone's own store: samples, profile, layout, plan, checklist, all on the phone | v1 |
| A9 | Sync to a Mac when one is paired, over WebRTC; phone is truth for body data, Mac keeps the long mirror; queue while apart | v1 |
| A10 | Full history backfill on first run (years of Watch data), newest first, progress on the tasks strip | v1 |
| A11 | Attention: which cards were opened, expanded, dismissed, asked about — part of the store | v1 |
| A12 | Typed context by voice or chat: "knee hurts", "travelling", "4 sets legs done", "32 g protein" | v1 |
| A13 | Work signals from a paired Mac: screen time and IDE hours (Apple Shifu), commits and sessions, calendar, DJ listening | v1 (Shifu + commits + calendar) |
| A14 | Weather by day and hour for the user's location (Open-Meteo, no key) — read only when the profile says outdoors | v1 |
| A15 | Mac-only sources: connect Oura, Garmin, Whoop, Strava, Withings through their own APIs | later |
| A16 | Medications and doses as context (iOS 26), state of mind (iOS 18), clinical FHIR records | later |
| A17 | Android via Health Connect | later |

### B. Know — the profile

| # | Feature | v1 |
|:--|:--------|:--:|
| B1 | **Profile inferred from history on day one**: athlete kind (runner, lifter, cyclist, swimmer, walker, none), indoor or outdoor, level, weekly volume, from years of workouts | v1 |
| B2 | Body facts from HealthKit characteristics and the latest weigh-in: age, sex, height, weight | v1 |
| B3 | Routine from the data: wake and bed times, typical training days; desk hours and sitting streaks when a Mac is paired | v1 |
| B4 | Goal as conversation: bulking, cutting, a race, run further, sleep better, just move — kept in memory | v1 |
| B5 | Attention learning: what the user opens and expands raises a card; what they dismiss lowers it | v1 |
| B6 | Every profile field carries confidence and evidence; the user sees it and can say "not quite" | v1 |
| B7 | Profile refreshes at the weekly pass; a new goal or a corrected field refreshes it now | v1 |
| B8 | Durable profile facts promoted to ling-mem in the user's words, so the rest of Linggen knows | v1 (weekly) — see open question |

### C. Examine and compose — the quiet screen

| # | Feature | v1 |
|:--|:--------|:--:|
| C1 | **Nightly examination**: every type this person has, judged against their own 28-day baseline → one of three verdicts: *at your normal*, *worth seeing*, *worth a doctor* | v1 |
| C2 | **At your normal is never a card.** A card earns its place by having news today; the screen grows on the day something happened and shrinks back when it passes | v1 |
| C3 | **The screen is three things**: the status line, then anything that needs attention, then a short recent-activity list. Everything else is behind a door | v1 |
| C4 | **Today against your own normal** as one number: z per metric, sub-score 80 + 12z, weighted over the metrics with enough history. 80 = at your normal. It names what it was made of, and does not exist below two usable metrics | v1 |
| C5 | **The index is picked per user**, ranked on coverage × relevance × movement — never a fixed list. BMI is dropped for a muscular lifter, and dropped again as redundant for someone whose scale already says it | v1 |
| C6 | **A warning outranks the quiet rule**: always on top, never collapsed, never hidden by a tap, and it never names a condition | v1 |
| C7 | **The quiet is stated, never implied**: the status line says how many measurements were examined, so *nothing needs you* can be read as a result rather than a blank | v1 |
| C8 | **Card catalog in code**; the pass picks from it, the phone and the Mac each hold one renderer per kind. A card whose data is absent is never composed | v1 |
| C9 | **The doors**: the same set in the same order under the screen — health review, my body, this week, today's list, patterns, workouts, everything measured. A person who has to hunt for the plan twice stops looking | v1 |
| C10 | Pin and hide by the user win forever; attention reorders cards that already earned a place, never invents one and never suppresses a warning | v1 |
| C11 | "What changed" history: every composition with its reason, restorable; Undo pins what it restores for four weeks | v1 |
| C12 | Mac without a phone: the page leads with the pairing card and says in those words that it has no body data | v1 |
| C13 | **Two tabs, not five.** *Highlights* is composed each morning out of the whole history — a shift that began nine days ago leads it until it passes — and holds four cards at most. *Everything* is a drawer with a count on every row. The first page is not a page about today; only the number is | v1 |
| C14 | **Charts are a catalog, and one is picked.** A candidate is a metric × a form (against your normal · week bars · day shape · session curve), scored on coverage × relevance × movement, dropped for being thin, redundant, or undrawable in that form. A finding always outranks the pick | v1 |
| C15 | **Rules pick, the agent names and may overrule.** The pass must work at 02:00 with no model, give the same page twice on the same data, and show why every candidate lost. The agent supplies the sentence, breaks ties, and honours "show me sleep instead" — and its override is recorded | v1 |

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

| E9 | **What you ate, roughly.** A sentence or a photo becomes an estimate: shown as a range, never a measurement, never given a verdict, and corrected in one tap — the correction is the user's word and outranks both. Depth is captured with the photo, because volume measured beats volume guessed and it cannot be recovered later. The agent never interrogates the user about a meal | v1 |
| E10 | **A sentence always works; a photo needs a model that can see.** The cloud model Linggen supplies is text-only, so a photo goes to the user's own ChatGPT over OAuth — their account, their data, and Linggen's proxy stays out of the picture. With no vision-capable model connected there is no camera button at all, and the reason says so | v1 |

### F. Understand — better than Apple, AI native

| # | Feature | v1 |
|:--|:--------|:--:|
| F1 | **The status line**: one line that proves it looked — today's number against your own normal, what it was made of, and how many measurements were examined | v1 |
| F2 | Personal baselines, not population ranges; every number shown as a delta from *your* normal | v1 |
| F3 | Pattern memory across months: "every release week", "after 23:00 commits", with evidence and confidence | v1 |
| F4 | Sleep: stages, debt, consistency, overnight HRV and wrist temperature, and what tracks with a bad night | v1 |
| F5 | Workout report per session: zones, splits, recovery, effort, "vs your last five", what to do next | v1 |
| F6 | Desk-worker health: sitting streaks from stand hours + Mac activity, late work vs sleep, screen time vs your normal | v1 (needs a Mac) |
| F7 | Ask anything over all history: "my pace the month before the race" | v1 |
| F8 | Weekly written report on phone and Mac | v1 |
| F9 | Honest uncertainty: "not enough data yet" said out loud; a pattern needs weeks, a weight trend needs a week | v1 |
| F10 | Early-illness signal: overnight temperature + HRV + respiratory rate drift, said as a hunch | v1 |
| F11 | Our own scores rebuilt from raw with the formula visible: readiness, training load | later |
| F12 | Monthly and yearly review in Yinyue's voice | later |

### G. Agency — the agent comes to you

| # | Feature | v1 |
|:--|:--------|:--:|
| G1 | **The agent reports its own work, unprompted.** When a pass finishes it says so in its own thread: what it read, how much of it, what came out, and what it changed. The quiet morning is reported too — that is the proof it looked, not noise | v1 |
| G2 | **The agent's voice lives in the conversation, never on the view.** No why-line on the screen, no card explaining the layout, no self-introduction painted on a page. The explanation goes where the user can answer back | v1 |
| G3 | Nudges through Yinyue's herald: today's session, stand, water, wind down — rule-gated, model-judged, quiet while enjoying | v1 |
| G4 | Cross-app actions: DJ wind-down playlist at bedtime, Yinyue goes quiet, Pulse waits | v1 (DJ + Yinyue) |
| G5 | Act on the cause: move a meeting, refuse a long run after a bad night | v1 (propose), later (calendar write) |
| G6 | Log by voice: "ran 6k, knee sore", "legs done, 4 sets", "protein shake" → checklist + note | v1 |
| G7 | Write back to HealthKit: water, caffeine, dietary protein, mindful minutes, workouts | later |
| G8 | Watch: today's session and the checklist on the wrist, one-tap check, start the planned workout | later |
| G9 | Family: several phones, one Mac; each person's rows carry `by`; profile and plan are per person | later |

### H. Surfaces

| # | Feature | v1 |
|:--|:--------|:--:|
| H1 | Phone: Health under ON THIS PHONE — the quiet screen, then the doors to Plan, Track, Workouts, Patterns, Data, Settings; complete without a Mac | v1 |
| H2 | Mac: Linggen Health page — the same first view the phone led with, and behind it everything reachable one tab away, including every measurement that had nothing to say; chat on the right at the width every Linggen app uses | v1 |
| H3 | "Right now" block on the Mac carries the body state and today's session | v1 |
| H4 | Data browser: every type, count, last sample, source, granted / silent-empty — show everything | v1 |
| H5 | Watch complication and glance | later |
| H6 | CarPlay: none | never |

### I. Trust

| # | Feature | v1 |
|:--|:--------|:--:|
| I1 | Health data stays on the phone, and on a paired Mac; never in iCloud, never sold, never for ads | v1 |
| I2 | Permission ledger on screen: which types were granted, which return nothing, since when | v1 |
| I3 | The profile is visible with its evidence; "not quite" corrects it and the correction wins | v1 |
| I4 | Every composition carries its why and its undo — the why said in the conversation, the undo on the screen; every agent action visible as a tool chip | v1 |
| I5 | Wellness scope written into the skill and the UI; the agent declines diagnosis and says who to ask | v1 |
| I6 | No brand is named unprompted; on ask, the source is shown | v1 |

## v1 in one paragraph

Import everything on the phone, infer the profile from history in the first
minute, open with one conversation that confirms it and asks the goal, then run
an examination every night over every type the person has and stay silent about
the ones that are fine. Build the screen from what is left: the status line
that proves it looked, the finding if there is one, the last few sessions, and
the doors. Say the rest in the conversation, and say it first — when a pass
finishes, the agent comes to the user with what it did and what it found. Write
the week's plan (weather for outdoor athletes, the split and targets for
lifters, move breaks for desk workers), derive the daily checklist and
auto-check it from HealthKit, show progress toward the goal as charts, keep
personal baselines and patterns that say "not enough data yet" until they can
prove something, nudge only through Yinyue, and sync all of it to a Mac when
there is one. The plan lives in the app. No brands, no calendar writes, no
diagnosis, no Mac required.

## Three people, one app

Examples of what the examination yields. These are outputs, not code paths.
Each person has an ordinary day and the day the app speaks; the ordinary day is
the common one.

**The lifter, bulking, no scale.** 38 types examined, 36 at your normal.
Ordinary day: "Nothing needs you today", then Pull / Push / Legs and the doors.
The day it speaks: HRV is 27 ms, seven below his normal and the lowest of the
fortnight, the morning after a Legs day — Legs comes off, Push moves to Friday.
The index picker lands on HRV (5,266 rows) and drops BMI twice over: he has one
weigh-in from 2022, and even with a scale BMI reads a muscular lifter as
overweight. Yinyue's thread carries the report; the screen carries the finding.

**The office worker, with a scale.** 41 types examined, 39 at your normal.
The day it speaks: weight up 1.9 kg over five weeks *and* body fat up 1.2
points with it — one number alone would not have earned the screen; two that
agree do. Walking is unchanged, which is what rules out the other explanation.
BMI is available here and still not chosen: for her it repeats what the weight
and the body fat already said.

**The runner, unwell.** 44 types examined, 41 at your normal, one worth a
doctor. Resting heart rate 12 above his own normal for nine consecutive
mornings, and it did not come down on rest days; HRV fell with it and sleep is
an hour short. The warning leads and cannot be swapped out; his pace goal — his
metric in an ordinary month — loses its place, and the app does not coach him
through it. The agent names the change, says to take those numbers to a doctor,
leaves the week unplanned, and stops there.

## Surfaces (UI)

### Phone — Health, under ON THIS PHONE

Drawer row shows the last sync ("2 min ago") when a Mac is paired and nothing
otherwise. Title ▾ lists **Today / This week / This month**; ⋮ carries **Log by
voice / Who you are / Permissions / Export**, plus **Sync now** when paired.
Lists use the ⋯ item menu; nothing swipes.

1. **The screen.** Three things and then the doors. The **status line**: the
   number against your own normal, the sentence ("Nothing needs you today" /
   "One thing worth seeing" / "Something has held long enough to show a
   doctor"), and what it was made of — "from HRV, resting heart rate and blood
   oxygen · 38 measurements examined". Then **anything that needs attention**:
   nothing on a good day, the finding on a bad one, with its evidence, its
   fortnight, and what it changed. Then the **last few sessions**, tappable to
   expand. Then the **doors**, always the same set in the same order. An "Ask
   Yinyue about any of it…" bar at the bottom opens her thread. Long-press a
   card: Pin, Hide, Why this.

   Nothing on this screen is the agent talking about itself. No why-line, no
   introduction, no offer to rebuild the view — that is said in Yinyue's
   thread, which is one conversation for every Linggen app and therefore always
   available. The screen is left holding findings.

   The seven doors, in this order, with what each shows underneath: **Health
   review** ("38 checked last night", the lead door) · **My body** ("44 · 183
   cm · no scale") · **This week** ("Push · Pull · Legs") · **Today's list**
   ("4 items, 1 done") · **Patterns** ("2 stable, 1 forming") · **Workouts**
   ("1,438 kept") · **Everything measured** ("38 types · since 2016", full
   width). They open the screens below, and the set never changes with the
   composition — a person who has to hunt for the plan twice stops looking.
2. **Health review.** What last night's pass found and how it decided: the
   verdict counts, the measurement that moved with its own baseline drawn
   through the fortnight, and what was ruled out.
3. **Plan.** The next seven days, one row each: session or rest, the reason,
   weather where it matters. Tap a day to see the session detail (sets, route,
   duration). "Adjusted this morning" rows say why.
4. **Track.** Today's checklist on top: each item with its target, auto-checked
   or tap to check, voice to log. Beneath, progress toward the goal: the chart
   the goal needs (weight trend, per-km time, tonnage, weekly distance), then
   heart history. Adherence for the week at the bottom.
5. **Workouts.** List; detail has the route, HR zones, splits, recovery, effort,
   "vs your last five", and the agent's one paragraph.
6. **Patterns.** Cards: claim, confidence ("4 of 5 release weeks since June"),
   evidence rows, first seen. A grey card reads "Not enough data yet — 2 of 4
   weeks".
7. **Data.** Every type: samples, last sample, source, granted or silent-empty.
   Tap a type to browse raw samples.
8. **Settings.** Which types to read, pass time, nudges and quiet hours, how
   blunt the voice is, layout changes (automatic with undo; history), how
   often the agent may come to you unprompted, the plan (calendar mirror off),
   your Mac (paired or not), export.

**Who you are** (the *My body* door, or ⋮): the profile as the agent holds it,
each field with confidence and evidence, a "Not quite" on every row.

### Mac — Linggen Health page

Web app at `/apps/health/`, same launcher as DJ. **The first view is the same
promise as the phone's** and leads with the same thing: the strip that says what
the pass found, the four counts (types examined · at your normal · worth seeing
· worth a doctor), the chart of whatever moved, and the table under it. What a
Mac adds is not more on that first screen — it is that everything is reachable
behind it. The tabs carry the same doors the phone lists, and the **Data** tab
holds every measurement examined last night including the thirty-odd that had
nothing to say, so *nothing needs you* can be checked instead of believed. A
phone never shows that list; it would be the confusion we started by removing.

The **chat sits on the right** at the width every Linggen app uses, and it
opens with Ling rather than with the user: the pass finished at 02:14, this is
what it found, this is why the page is in this order. After that the user asks,
the answer comes back in a sentence or two, and the working goes on the page
beside it through `PageUpdate`. The page itself never carries Ling explaining
the page.

**With no iPhone paired** the same page composes from the work side only:
screen time and IDE hours, sitting streaks, late commits, meetings, calendar
load, a plan of move breaks, and the patterns those can prove. One card reads
"Your body data lives on your iPhone" with the pair QR. The Data screen shows
HealthKit as *not connected: no iPhone paired*, never as empty types. Later, a
**Connect a service** row for Oura, Garmin, Whoop, Strava and Withings.

### Watch (later)

Complication: today's session. App: the checklist, one-tap check, start the
planned workout.

## Workflows

### 1. First run — one conversation, never a questionnaire

1. Open Health in the drawer. One screen: "Everything, or pick" — the
   recommendation is everything.
2. iOS permission sheet (Turn All Categories On).
3. Backfill starts newest first: "Reading your history — 3 years, 212 workouts"
   on the tasks strip.
4. **Within the first minute** the profile pass reads the last months and Home
   opens with one card in Yinyue's voice that **confirms** what it found: "You
   look like an outdoor runner, about three runs a week, 71 kg. Right?" One tap
   confirms; "Not quite" corrects it. Nothing the data already holds is asked
   (name comes from Yinyue's first meeting).
5. Then **one question**, the goal: bulking, cutting, a race, sleep better,
   just move. It is the only field the data can never infer. The Plan screen
   waits for it and says so.
6. Later questions come only when a decision needs them, one at a time, with
   the consequence attached: "Gym or at home? It changes Thursday."
7. The first examination needs one night; until then the status line says so
   rather than showing a number. The first pattern needs four weeks and says
   so.
8. **No history at all** (new phone, no Watch): the conversation asks three
   things, goal first, and the ledger says why it had to.

### 2. Every day — on the phone

- Night lands in HealthKit → the phone wakes → the pass runs on the phone with
  the cloud model: it walks **every** type against that type's own baseline,
  files a verdict for each, then joins the ones that moved to sleep, load, the
  plan and the weather if outdoors → writes the verdicts, the status line,
  today's checklist, and any plan adjustment with its why.
- The screen shows what is left after the quiet ones are dropped — on most
  mornings just the status line, the sessions and the doors.
- **Yinyue then comes to the user**, unprompted, in her own thread: what she
  read, how much of it, what came out, and what she changed. On a quiet morning
  she says that too, in a line. She does not wait to be spoken to.
- With a Mac paired, the phone syncs the store and the Mac adds yesterday's
  work signals to the brief; the Mac "Right now" carries the state.
- Through the day the checklist auto-checks as samples land; voice fills the
  rest.
- Nudges only through Yinyue's herald.

### 3. After a workout

Watch ends the workout → background delivery → the phone writes the workout
report, checks the session off, updates progress → tomorrow's brief may lead
with it.

### 4. Weekly

Sunday evening: profile refresh from the week's data, attention and notes →
re-composition if the profile moved (the agent says why in the thread; Undo on
the screen) → next week's plan → the weekly report. With a Mac paired and reachable, the Mac runs this pass
over the long store and writes durable profile facts to memory in the user's
words; otherwise the phone runs it over its own store.

### 5. Ask

On either surface: "Which creatine should I buy?" → evidence first (monohydrate,
3–5 g, third-party tested), then, when buyer advice ships, a live search with
the source shown.

### 6. Without a Mac

Everything above, on the phone. Nothing is greyed out. If a Mac is paired
later, the phone sends its whole store and the months appear on the Mac page.

### 7. Mac without a phone

The Mac page composes from the work side, shows the pair card, and waits.
Pairing an iPhone fills it in within the first minute.

## What Linggen Health never does

- Diagnose, or comment on medication, or claim to be a doctor.
- Ask a question the data already answers, or hand the user a questionnaire.
- Show the same screen to two different people, or rearrange it daily.
- Give a measurement a slot for being at your normal.
- Explain itself on the screen: no why-line on the view, no card introducing
  the agent, no commentary where findings belong.
- Wait to be asked. A pass that found something and said nothing until the
  user opened the right screen is a failure, not discretion.
- Change the layout without saying why, or without an undo.
- Compare a number to a population range instead of the user's own history.
- Name a brand unprompted, or name one without the source.
- Lead with a score, or show a number without the personal baseline beside it.
- Surface a pattern from one week, or a weight trend from one morning.
- Require a Mac, or pretend a Mac alone can see the body.
- Send health data anywhere but the user's own devices.
- Nudge outside the herald, or nudge while the user is enjoying something.
- Show an estimate as though it were measured, give one a verdict, or print a
  guessed calorie count to the digit.
- Offer a button the connected models cannot honour. A camera that needs a
  model which cannot see is not shown at all, and says why.
- Carry a photo of your food through Linggen's own servers.
- Interrogate the user about a meal. One estimate, one correction, no
  questionnaire — follow-up questions test as friction that does not improve
  the number.

## Related docs

- [design.md](design.md) — data, storage, schemas, sync, tools, passes.
- [prototype.html](prototype.html) — interactive prototype (three people, the
  first run, the phone screens, the Mac page with and without a phone,
  workflows); published at
  https://claude.ai/code/artifact/43f03b3e-15df-4831-ac89-62a182e35525
- `linggen-mobile/doc/health.md` — the phone spec, written when the phone side
  is built.
- `linggen-app/doc/app-ideas.md` § Health — the backlog entry.
