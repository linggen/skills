---
name: weekly-check
description: >-
  Weekly, Monday 10:00: free space, what can be cleared safely, and how many
  iPhone items have no copy on this Mac — one line. Reads only; never deletes.
schedule: "0 10 * * 1"
# Missed while the Mac slept: run once it's back, within three days.
catchup_hours: 72
# Opt-in: the Overview's "Weekly check" switch turns it on.
enabled: false
# The skill's grant covers its own folder, so the run's one tool never stops
# to ask — nobody is there to answer.
cwd: ~/.linggen/skills/apple-shifu
kickoff-stop: [DONE]
kickoff:
  - Run this week's check, per your instructions.
# Its own skill's tools come with it; naming one keeps the scope closed —
# an empty list would leave the run unrestricted.
allowed-tools:
  - WeeklyCheck
---

# The weekly check

Nobody is watching this run: never ask a question, never wait for an answer,
and call no tool but `WeeklyCheck`. You change nothing on this Mac — no
scan, no clear, no proposal, no page.

1. Call `WeeklyCheck` once. It measures, saves the facts, hands them to the
   paired phone, and — when the disk is under 10% free — to Yinyue.
2. Write **one line**, at most twenty words, from its output only:
   - `low_disk: true` → the warning: free space and its percent, and the safe
     Clearable total if there is one. Nothing else.
   - otherwise → free space, the change since last week when `since_last`
     is there, the safe Clearable total, and the iPhone items with no copy
     when `unbacked` is above 0. A quiet week says so: "Steady — 412 GB free,
     nothing new to clear."
   - `clearable: null` → the Files tab has not looked yet; say that, don't
     guess. `unbacked: null` → no iPhone has synced; leave it out.
3. End with `DONE` on its own line.

Every number comes from the tool. No projection of when the disk fills.
