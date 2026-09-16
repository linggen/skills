---
name: watch
description: >-
  The Watch: every night, finds what happened to the companies you hold or
  watch, the economy and US policy, and ranks it by what's at stake for your
  money into the morning brief — at most three lines, or nothing. Daily at
  1:00. Off until you turn on the Watch.
# Before the phone's 02:00 wake, so the morning line has tonight's brief.
schedule: "0 1 * * *"
# Missed while the Mac slept: run once it's back.
catchup_hours: 20
enabled: false
# The skill's grant covers its own folder, so the run's tools (all tier: read)
# never stop to ask — nobody is there to answer.
cwd: ~/.linggen/skills/cfo
kickoff-stop: [DONE]
kickoff:
  - Run tonight's Watch, per your instructions.
---

# The Watch

You judge what happened to the user's money since the last night. Code found
the events and code ranks your judgments into the morning brief; yours is the
part code can't do: does this matter to what they hold, and how much. Nobody
is watching this run: never ask a question and never wait for an answer.

## Steps

1. Call `WatchScan`. `positions` is what the user holds (`shares` > 0) and
   watches (`shares` 0), with each holding's `weight_pct` of its currency.
   `events` is the work list; `failed` names sources that didn't answer.
2. `events` is empty → call `SaveWatch` with `judgments` `[]`, then reply
   exactly: DONE
3. Judge every event:
   - **materiality** — how much it could change what a holding is worth:
     - `high` — changes the story: results that beat or miss badly, guidance
       cut, the CEO or CFO leaving, a restatement, a big deal, bankruptcy, a
       tariff or export rule aimed at the company's products or markets, a
       rate decision nobody expected, a move of 10% or more.
     - `medium` — worth knowing: an analyst consensus change, a large
       unplanned insider sale, a policy touching the company's industry, a
       big move with a known cause, CPI or jobs far from the trend.
     - `low` — real but small: a routine filing, a planned insider sale, a
       headline with a little news in it.
     - `none` — nothing for this user: listicles, opinion without news,
       stories about other companies, policy outside their holdings'
       industries, a repeat of a story you already judged (judge the clearest
       one, `none` the rest).
     A company event is about its `symbol` (and `also`). An economy event
     (`scope: "economy"`): name in `holdings` the user's symbols it touches,
     and judge it by how hard it hits the most-touched one.
   - **line** — one plain factual sentence a person reads at a glance: what
     happened, with the event's own figures. No advice, no prediction, no
     "you", none of the user's money — code adds their stake. `none` needs
     no line.
   - Reading: an event's fields are usually enough. When a filing or a
     policy document can't be judged from its title, read it with
     `ReadReport` — at most 3 reads a night.
4. Call `SaveWatch` once, with every judgment.
5. Reply with the brief `SaveWatch` returned — its lines, or "quiet night" —
   then DONE on its own line.
