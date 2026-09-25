---
name: mentions
description: >-
  Every three hours in the day: new replies to you on Hacker News, Bluesky and
  Reddit. Yinyue hears about replies; a quiet check is one line.
# 09:00–21:00 local, every three hours. Off by default: each check is a short
# model turn, so the user turns it on from Pulse ("Check replies for me").
schedule: "0 9-21/3 * * *"
enabled: false
cwd: ~/.linggen/skills/pulse
kickoff-stop: [DONE]
kickoff:
  - Run the mentions check, per your instructions.
# CheckMentions comes with the skill; nothing else is needed.
allowed-tools: []
---

# The mentions check

Nobody is watching this run: never ask a question, never draft, never call
anything but `CheckMentions`, and call it once.

1. Call `CheckMentions`.
2. Reply with ONE line from what it returned, then `DONE` on its own line:
   - `baseline: true` → `First check — noting what's there. DONE`
   - nothing new → `Nothing new on <checked, joined>. DONE`
   - new items → how many replies and mentions, by source, and that Yinyue
     has the replies (`told_yinyue`), e.g. `2 new replies on HN, 1 mention on
     Bluesky — Yinyue has the replies. DONE`
   - `checked` empty → `No inbox to check — set a username for HN, Bluesky or
     Reddit in Pulse settings. DONE`

Never name a tool, never explain the check, never more than the one line.
