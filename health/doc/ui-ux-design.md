---
type: design
reader: Liang, designers, coding agents, contributors
status: agreed direction 2026-09-08 — BUILT the same day on both devices; see "What is built" at the end
---

# Linggen Health: Agent-Composed UI

## Design direction

Keep the home screen's section purposes and navigation stable. Let the agent
compose the content and layout inside those sections from the user's data,
goals, interests, routines, and explicit preferences. The user should know
where to look without receiving the same dashboard every day.

Stable sections do not mean fixed heights, fixed chart types, or a mandatory
number of items. Dynamic composition does not mean arbitrary generated UI.
The agent selects from tested components; the app renders them consistently.

This document takes precedence over the 2026-09-04 first-view rules in
product-spec.md and design.md where they conflict. In particular, useful
goal progress and interest-based information can appear even when measurements
are within the user's usual range. The older prototype is historical, not
the specification for this direction. Data, sync, and storage architecture
are unchanged by this design proposal.

## Home screen

The normal order is Brief, Focus, Attention, with a persistent Ask Ling entry
point. These are semantic sections, not floating cards containing more cards.

| Section | Stable purpose | Agent-controlled composition |
| --- | --- | --- |
| Brief | Explain what matters today | One concise sentence grounded in current data and relevant personal context |
| Focus | Show evidence and useful trends | Metric, question, visualization, time range, comparison, and arrangement |
| Attention | Surface something requiring a decision | Relevant concerns, data gaps, proposed actions, and their evidence |
| Ask Ling | Let the user steer the experience | Contextual suggestions and responses that can recompose the view |

Brief targets one line when space permits, but wraps naturally on phone or
with larger text. Never shrink or truncate important meaning to enforce a line.

Focus leads with one useful visualization on phone. Mac can place related
visualizations beside it when they answer the same question. More screen
space is not a reason to add unrelated metrics.

Attention is conditional: hide it when nothing needs attention. Missing data
is labeled as a data issue, not styled as a health warning. A quiet day can
have a brief and relevant goal progress without an invented concern.

A genuinely urgent alert is the exception to section order: place it above
Brief according to defined, reviewed safety rules. The model cannot invent
alert thresholds or hide a qualifying alert to satisfy a layout preference.

## Example composition

Illustrative content only; these numbers are not user measurements:

```text
Today                                      Profile

Your activity is up this week,
while your sleep schedule is steady.

FOCUS                                    This week
Activity balance
Walking    [================          ]    52%
Cycling    [=========                 ]    29%
Running    [======                    ]    19%
Share of estimated activity energy       Explore >

ATTENTION
Two nights have no sleep data.
Review data connection                          >

Ask Ling...                                   Mic
```

Tomorrow, Focus might show sleep timing as nightly ranges. During a training
week it might show activity volume over time. "Focus on cycling" changes the
composition without relocating navigation or changing familiar interactions.

## Choosing a visualization

Select the visual from the question, not simply from the measurement type.

| User question | Suitable component | Constraints |
| --- | --- | --- |
| How is activity energy divided between sports? | Horizontal bars, or a donut/pie for a few categories | Name the period and denominator; distinguish estimated energy; avoid excessive slices |
| How did heart rate change during this workout? | Line chart | Preserve timestamps, units, and gaps; do not imply continuous observations where data is missing |
| How consistent is my bedtime? | Nightly time-range chart | Handle intervals crossing midnight and show missing nights |
| How does this week compare with last week? | Aligned bars or compact comparison | Compare equivalent periods and consistent units |
| How am I progressing toward my goal? | Progress or trend component | Show the user's actual target and its source; never invent a target |

Each chart has a clear title, period, units, accessible text alternative, and
an Explore action exposing supporting measurements and provenance. Comparisons
use honest scales. Do not infer diagnoses or causal explanations from a trend.

## Personalization and user control

Explicit goals, corrections, and pinned preferences take priority over inferred
interests. Repeated opens or dismissals can inform ranking but do not establish
a medical fact or prove that a user no longer cares about a topic.

Provide Pin this, Show less, Change period, and an easy way to undo a requested
composition change. A pin keeps a subject available, not permanently frozen
numbers. It cannot displace an urgent alert.

Users can inspect and correct what Linggen knows about their goals and
preferences. When useful, explain the selection briefly: "I focused on activity
balance because you're preparing for your cycling trip." Keep detailed
composition explanations in conversation or behind a Why this action; avoid
permanent instructional text in every section.

The agent introduces its role and available data briefly on first use, using
real coverage information. Conversation remains available to request another
view, examine evidence, or prepare a plan. Consequential external actions have
an action preview and appropriate confirmation; discussing a plan does not
automatically execute it.

## Phone and Mac

Both first views lead with the most important information. The phone remains
a complete product without a Mac.

- Phone: concise brief, one leading visual, quick decisions, voice/chat, and
  details revealed on demand.
- Mac: the same priorities with room for related comparisons, plan editing,
  and deeper inspection; comprehensive records live in a separate Data view.
- Preserve shared goals and composition intent across devices, while allowing
  responsive arrangements rather than copying exact pixel layouts.

## Composition contract

The following is a proposed contract, not an existing storage schema:

- Agent selects section content, a supported component kind, validated data
  references, period, comparison, rationale, and supported actions.
- Renderer owns layout constraints, typography, chart scales, units,
  accessibility, responsiveness, and consistent interaction behavior.
- Data layer computes aggregates and supplies provenance and coverage; the
  model must not manufacture chart values.
- Validator rejects unsupported components, invalid data references, unsafe
  actions, and incompatible metric/component combinations.
- Use the last valid composition or a simple factual fallback when generation
  fails. Label stale data and partial coverage rather than implying freshness.

Start with a bounded catalog: brief text, line chart, horizontal bars,
part-to-whole chart, nightly ranges, comparison, progress, and attention item.
Add components when a real question requires one, not as decorative variety.

## Stability and refresh

Keep navigation, section meaning, chart controls, and drill-down behavior
consistent. Do not replace or rearrange a chart while someone is inspecting it.
Apply routine composition updates on a new visit, explicit refresh, or a user
request. Newly qualifying urgent alerts may interrupt; routine findings may not.

Preserve selected periods and drill-down context when possible. Offer an update
indicator when newer routine data arrives during inspection. New users or users
with insufficient data receive a factual coverage state, not a confident
personalized conclusion.

## Initial delivery and acceptance

Build the home composition, conversational steering, and editable preferences
first. Exercise them through a daily brief and weekly review before expanding
autonomous actions.

Acceptance examples:

- A sports mix renders as bars or a part-to-whole chart; a workout heart-rate
  sequence renders as a line in the same Focus section.
- Changing an explicit interest changes relevant content without moving the
  navigation or forcing unrelated data onto the first view.
- A quiet day has no manufactured warning; a goal can remain useful even when
  every measurement is within the user's usual range.
- Missing, stale, and partial data remain distinguishable from health concerns.
- Phone and Mac share the leading finding; Mac does not dump the full ledger
  into its first view.
- Pins, corrections, accessible text sizes, empty states, and generation
  failures work without overlapping content or unstable controls.
- Every rendered value is traceable to data, and users can inspect why an
  observation or recommendation appeared.

## What is built (2026-09-08)

The composition contract above is code on both devices, and `layout.json`
carries it under `home`:

- **Data layer** — `HealthHome` (`linggen-mobile/lib/services/health/health_home.dart`)
  computes every value from the store on the phone and files a bounded
  catalog: a measurement's fortnight and four weeks (`line`), the shape of
  the last fourteen nights (`nights`), eight weeks of training (`weeks`),
  energy by sport (`share` / `bars`), progress on a target with its formula
  (`progress`), and the heart through the last session (`line`). Each entry
  carries its question, period, unit, coverage, source and relevance.
- **Ranking** — deterministic, three tiers: what the stated goal is about,
  then coverage × relevance × movement (the examination's pick a boost, an
  Explore tap a small one), then a subject already in Attention. Every choice
  carries a `why`, shown behind *Why this* and said in the conversation.
- **Validator** — `HealthHome.validate` on the phone, `home.js` on the Mac;
  a composition naming a kind or an id the catalog does not hold is drawn as
  nothing, never as a guess.
- **Renderer** — `health_charts.dart` on the phone, `focus-view.js` on the
  Mac; scales, gaps, units and the text alternative are theirs.
- **Attention** — findings from the examination, and data gaps for subjects
  the person normally records daily (sleep, resting heart rate, HRV, steps)
  when two or more of the last seven days are missing, or the subject has
  stopped. Labelled as data, never styled as a concern.
- **Steering** — *Pin this*, *Show less*, a period sibling, another kind,
  *Something else…*, *Why this*, *Undo*; the `health_focus` tool on the
  phone and `Focus` on the Mac give the agent `agent` (with a why) and the
  person's actions on their say-so. A pin or a hide refuses the agent.
- **Preferences** — *What you are watching* in the drawer: the pinned
  subject, the ones set aside (with *Show again*), the goals the ranking
  reads, and what Explore was opened on.
- **Stability** — the phone holds a routine recomposition behind an
  *Updated* chip while Focus is on screen; the person's own changes show at
  once. A warning still sits above Brief.
- **Mac** — Home (Brief · Focus with the related view beside it · Attention),
  Review (the working), Body, Week, Today, Data. A change made on the Mac is
  the newer `layout.json` and reaches the phone on the next sync.

Not built: the meal lane, weather, and a Focus chosen by watching what the
person looks at (only deliberate acts count).
