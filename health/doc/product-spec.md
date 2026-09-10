---
type: product-spec
reader: Liang, coding agent, contributors
guide: |
  What Linggen Health is and what it does, in one read. How it is built —
  the store, the passes, the schemas, the tools, the honesty rules — is
  design.md. The first view is ui-ux-design.md; the phone's built behaviour
  is linggen-mobile/doc/health.md.
status: 1.1 (build 22) in App Store review since 2026-09-10. 1.2 is built on main, in no store build.
---

# Linggen Health

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
one question no sensor can answer. Her page is the core of the app; Health is
a quiet screen she walks the person to.

Three things no incumbent does:

1. **It examines everything, every night** — every type you have, against
   your own last month, never a population range.
2. **It stays quiet.** A card earns its place by having news today. At your
   normal is not a slot.
3. **It comes to you, and it remembers.** The finding arrives in the
   conversation with what she did about it; what you tell her is data the
   next examination has beside the number.

Charter, written into the agent: help this person get better at what they are
trying to do, and make them love Linggen Health. Behave like their doctor and
coach; never claim the title.

## What it does

**Examines, nightly.** Every measurement in Apple Health against the person's
own 28-day normal, one verdict each. The count is said out loud; the ones
that are fine are never shown.

**Composes the screen.** Health publishes candidates — findings, a chart, the
plan for today, the checklist, a nutrition line, the letter, the doctor page
— and Yinyue writes the page from them: at most six, under two screens. A
swipe dismisses a card and the next candidate takes the slot. A warning
cannot be dismissed.

**Comes to you.** Every pass that found something ends in one message in her
thread: what she read, what came out, what she changed. The quiet morning
gets a line too — that is the proof she looked.

**Answers about the body from the body.** Health words in a message on her
page switch the health pack on, whatever tab is open, and she runs the
examination before she answers. A question about the body is never answered
from memory alone.

**Asks one thing, once.** The morning line ends with at most one question, on
the finding that leads, about what no sensor can answer — a cold coming,
stress, a late night. A subject is asked once and not again for seven days.
A follow-up she promised comes first, and where the intention can be counted
she counts it instead: *you said bed by midnight — four of the six nights
since, you were.*

**Takes what the sensors cannot see.** Never a questionnaire: she says once,
on first meeting and again closing the Sunday letter, that anything the
devices did not record can just be told to her. A match, a swim, a late
night, travel, a drink — the words are kept verbatim, the date resolved, and
the cause remembered: next time the same pattern shows she says *basketball
again yesterday — expected* instead of asking. A blind-spot list, *What I
can't see — tell me*, is a page, not a schedule.

**Plans the week, and moves it.** One session a day with its reason in the
person's own record, adjusted when the night says so, the dry hours checked
for anything outdoors. Today's checklist derives from the plan and the
targets and ticks itself from the data; what HealthKit cannot see is a tap or
a line said.

**Debriefs a session.** Within minutes of a workout ending: its name, the
comparison the session leads with, and any first it set as a clause on the
same line. One session, one thing said, three hours to say it.

**Learns your patterns.** Not a rule from a textbook, a count: *after a night
under 6 h 10 your HRV was under your normal 6 times out of 8; on the other 41
days, 3 in 41.* Forming at four aligned weeks, stable at six, retired by two
that disagree.

**Writes symptoms into Apple Health.** "My stomach hurts" becomes a real
HealthKit symptom sample, so it sits beside the readings, survives this app,
and reaches a doctor through Apple's own sharing. The one thing this app
writes; everything else it reads.

**Writes a letter on Sunday.** Three short paragraphs — the week as it was,
the one thing she would change, one question — kept under *Letters* and
carried into Monday as a card.

**Builds the page for a doctor.** Clinical only: who, how much data, what
changed in 90 days, the readings to show, the Watch's own detections, the
person's words, at most three questions to ask, and a footer saying nothing
here is a diagnosis. Shared as PDF through the system sheet. Offered on a
warning or on the morning of an appointment they mentioned.

**Settles nutrition with you.** When the training shows she comes once with a
supplement and nutrition list from their weight, their training energy and
their goal — each line proposed, with the reason in their numbers — and they
adjust it in words. The settled list is the fact the checklist and the
debrief read from. Intake is said in words; the day's totals sit against the
targets. Never a medical claim, never a brand unprompted.

**Reaches a closed phone.** A doctor-tier warning lights the screen. The
morning line is Yinyue's, quiet on an ordinary morning. A debrief lands after
a session, the letter from Sunday evening, and a widget shows the state
without interrupting: *Rest today · HRV 7 under your normal.*

**Keeps everything one tap behind.** The drawer: the examination, the plan,
today's list, workouts, what she has learned, letters, nutrition, the doctor
page, who you are, and every measurement with its own history — including the
ones that had nothing to say, each with its reason.

## Where it runs

**The phone is the whole product.** It reads HealthKit, keeps its own store,
runs the passes with the account's cloud model, examines every type against
its own baseline, and writes the plan and the checklist. A user with no Mac
is a complete user.

**The Mac is optional.** It mirrors the store, keeps years of it, holds
ling-mem, takes the heavier weekly pass when reachable, and shows the same
first view one tab deeper.

**A Mac with no iPhone gets no body data.** HealthKit exists only on iPhone
and iPad; the Mac page composes from what it has and shows the pair card.
Later, vendor APIs (Oura, Garmin, Whoop, Strava, Withings) give a phone-less
Mac a body feed.

## Positioning

- **Extend Apple Health, never duplicate it.** Apple owns the cards and the
  scores: Insights, For You, Readiness, Health Age, Longevity, labs, expert
  videos, camera assessments. We build none of those. We own the
  conversation, memory, what the sensors cannot see, lessons in the person's
  own numbers, the plan with hands, and the doctor line.
- **Not a dashboard.** Built each morning out of what moved; the same screen
  is never shown to two people.
- **No score.** Not a health score, and not a number of our own at all.
  Apple's scores are read as inputs where HealthKit exposes them; otherwise
  the person tells her.
- **The conversation has its own room.** Yinyue's page is shared by every app
  and she navigates to Health; Health says what is, never why.
- **Build the capability, never claim the title.** A nightly examination, an
  index chosen per person, a warning that will not be dismissed — all of it
  ships. "Doctor" appears only as *worth showing a doctor*.
- **A coach, not a nag.** One plan, one checklist, one why. Nudges only
  through Yinyue's herald, under her budget.
- **Wellness only.** Never diagnosis, never medication advice. Supplements as
  evidence in plain words; brands only on ask, with the source, later.
- **Persona is not code.** There is no runner code and no lifter code; the
  profile is inferred, said out loud, and corrected by the person.
- **Yours.** Health data stays on the phone, and on a paired Mac. The cloud
  model sees a day's summary to run a pass, never the raw store, and nothing
  is kept there.

## Who pays

Linggen is $5 a month for every app; Health is one app in the suite, not a
tier, and the one that makes the plan worth keeping. Proposed split, open
(Liang's call): free — import, the data browser, workout and sleep detail,
the first examination, one weekly report; paid — the nightly examination, the
plan, patterns, the agent coming to you, ask-anything over months.

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

## Not yet

- **Next**: lessons — every term she uses gets one lesson in four fixed parts,
  said the first time it matters, kept on a *Learn* page. Then the coach in
  session: the debrief as a conversation, live pace and effort from the Watch.
- **Designed, not built**: the meal photo lane (to the user's own ChatGPT,
  depth captured with the shot), three of the four chart forms, weather for
  outdoor plans, energy-in from HealthKit.
- **Shelved**: work signals — a Mac being busy is not a person being present.
  The person's own words are the reason a late night gets until there is a
  trustworthy source.
- **Later**: race and pace prediction, a monthly and yearly review, the
  calendar mirror, buyer advice on ask, write-back to HealthKit, a Watch
  complication, family on one Mac, Android via Health Connect, vendor APIs.
- **Never**: CarPlay. A score of our own.

## Open questions for Liang

1. **In-app attention.** May the app learn from what you look at at all, or
   only from deliberate acts (pin, hide, what you ask the chat)?
2. Skill and app name: `health` / "Linggen Health", or something in the
   Yinyue world?
3. Free vs Paid split as proposed under *Who pays*, or the nightly
   examination free too?
4. Should durable profile facts go to ling-mem automatically (weekly pass),
   or only when the user says "remember that"?

## Related docs

- [design.md](design.md) — how it is built.
- [ui-ux-design.md](ui-ux-design.md) — the first view: Brief, Focus, Attention.
- [prototype.html](prototype.html) — the interactive prototype.
- `linggen-mobile/doc/health.md` — what the phone has built.
- `linggen-mobile/doc/yinyue.md` — her thread, her herald, her wakes.
