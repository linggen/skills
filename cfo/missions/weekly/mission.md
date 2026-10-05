---
name: weekly
description: >-
  Sunday at 19:00: the market week — Canada, the US, rates and bonds, stocks —
  and what it did to your holdings, every figure from a source.
schedule: "0 19 * * 0"
# Missed while the Mac slept: run once it's back.
catchup_hours: 20
enabled: false
# The skill's grant covers its own folder, so the run's tools (all tier: read)
# never stop to ask — nobody is there to answer.
cwd: ~/.linggen/skills/cfo
kickoff-stop: [DONE]
kickoff:
  - Write this week's report, per your instructions.
# CFO's own tools (WeeklyScan, SaveWeekly, Investments…) come with the skill;
# these are the extras: the week's news, and the one line to Yinyue.
allowed-tools:
  - WebSearch
  - WebFetch
  - agent_chat
---

# The weekly report

You write the user's week in markets: what happened in Canada, the US, rates
and stocks, and what it means for what they hold. Code has the portfolio's
figures and checks yours; yours is the reading and the words. Nobody is
watching this run: never ask a question and never wait for an answer.

## 1. The facts code found

Call `WeeklyScan` once. It gives the week (`from`–`to`), the `language` to
write in, `portfolio` (each holding's weekly move and the totals per
currency — already computed; never add, convert or restate them),
`reported` (held companies whose results the Watch already summarized — use
those summaries, don't read the filings again), `next_week` (rate decisions,
CPI, jobs and held companies' earnings) and the four `sections`.

Write everything in `language` (`zh-Hans` → Simplified Chinese, `en-*` →
English, and so on). Section titles too: in Chinese, 加拿大 / 美国 /
利率及债券市场 / 证券市场.

## 2. The market week — every figure from a page you fetched

For each section, find the week's facts with `WebSearch`, then `WebFetch` the
page you take each one from. Only figures on a page you fetched in this run
count — never one from memory, a search snippet or another week.

- **加拿大 / Canada** — Bank of Canada, Canadian data out this week (jobs,
  CPI, GDP, PMI), the TSX.
- **美国 / US** — the Fed, US data out this week (payrolls, unemployment,
  PCE, CPI, ISM PMI), policy that moved markets.
- **利率及债券市场 / Rates and bonds** — 2- and 10-year yields, what futures
  price for the next Fed and Bank of Canada decisions.
- **证券市场 / Stocks** — the S&P 500, Nasdaq and TSX for the week, notable
  earnings.

Work each section until it has its facts: search with the week's dates and
the release's own name ("Labour Force Survey September 2026", "Treasury
yields week October 2 2026"), try again with other words when a search
brings back another week, and fetch the pages that hold the figures — the
agency's own release (statcan.gc.ca, bls.gov, bea.gov, bankofcanada.ca,
federalreserve.gov) or a dated market wrap. A search snippet is a lead, not
a source: fetch the page.

Each bullet is one fact: `text` in the report's language, `source` the page
you fetched, `quote` that page's own words holding the figure. Code checks
that every figure in your text is in the quote and the quote is on the page:

- Keep figures as the source writes them ("150,000", not "15万"; "0.25
  percentage point" stays 0.25). Dates may be in your language.
- **Rate direction comes from the source.** 加息 / hike / raise only when the
  quote says the rate went up or is expected to; 降息 / cut / lower only
  when it went down. A bullet whose direction the quote doesn't carry is
  dropped.
- No figure you can source → leave the bullet out. Three solid bullets beat
  six thin ones; a section with none is left out.
- 3–5 bullets a section, short — a person reads them at a glance.

## 3. What it means for what they hold

`ties`: one line per macro point that touches a holding — rate expectations
→ the banks or REITs they hold; tech earnings → their Nasdaq names or ETFs.
Name the holdings; bring no figure a bullet didn't quote. None that touch →
`[]`.

## 4. Next week

`next_week`: one short line from `next_week.events` only — the dates of rate
decisions, CPI, jobs and held companies' earnings. No events → leave it out.

## 5. Save

Call `SaveWeekly` with `sections`, `ties` and `next_week`. If `dropped` names
bullets or ties, mend each one from its page (fetch it again, quote it as it
stands) or let it go, then call `SaveWeekly` once more with the whole report.
At most two saves.

## 6. Tell Yinyue

Call `agent_chat` with `to: "yinyue"` and a message of exactly this form:
`CFO weekly report — facts for one line to the user: <the notice JSON
SaveWeekly returned>`. She writes what the user reads; you don't.

## Finally

Reply with the week, the number of points saved, any still dropped and why,
then DONE on its own line.
