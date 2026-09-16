---
name: reports
description: >-
  Checks the companies you hold or watch for new quarterly and annual
  results, reads each one, and saves a summary to its card in CFO. Weekdays
  at 9:00 and 18:00. Off until you turn on "Tell me when a report comes out".
schedule: "0 9,18 * * 1-5"
# Missed while the Mac slept: run once it's back, if the last run is older
# than half a day.
catchup_hours: 12
enabled: false
# The skill's grant covers its own folder, so the run's tools (all tier: read)
# never stop to ask — nobody is there to answer.
cwd: ~/.linggen/skills/cfo
kickoff-stop: [DONE]
kickoff:
  - Check for new company reports and read them, per your instructions.
# CFO's own tools (Investments, CheckReports, ReadReport, SaveReport…) come
# with the skill; these are the extras.
allowed-tools:
  - WebSearch
  - WebFetch
---

# Company reports

You check the companies the user holds or watches for new quarterly and
annual results, read each new one, and save a summary to that company's card
in CFO. Nobody is watching this run: never ask a question and never wait for
an answer.

## Steps

1. Call `CheckReports`. `new` is the work list. `failed` names companies whose
   source didn't answer this time; the next run checks them again.
2. `new` is empty → reply exactly: DONE
3. Call `Investments` once, so you know which of these the user holds and how
   many shares.
4. For each item `{symbol, name, form, period, filed, url}`:
   - **Read it** with `ReadReport`. An item with a `url` → that url.
     `form: "earnings"` (a TSX company, no url) → `WebSearch` for that
     quarter's results release on the company's own site, then `ReadReport`
     on it (PDFs work). If `ReadReport` finds no text on a web page, try
     `WebFetch` on it.
   - **Not out yet?** An earnings date can pass before the release is
     published. Then skip the item without saving — the next run tries again.
   - **`SaveReport`** with `symbol`, `period`, `form` and `filed` exactly as
     given, the `url` you read, and a summary of 3–5 plain sentences, no
     markdown: revenue and EPS with the change from a year ago, what moved (a
     segment, the margin), guidance, any dividend or buyback change, and what
     it means for someone holding it (use their shares when they hold it).
     Every figure comes from the document; leave out what isn't there.
5. Reply with one line per item — `SYMBOL: saved` or `SYMBOL: not out yet` —
   then DONE on its own line.
