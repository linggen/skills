# Voice Samples

This file is **load-bearing for the pulse skill**. The agent reads
samples from here before drafting any post and silently mimics
cadence, word choice, and rhythm. Without samples, drafts will read
as generic LLM output ("🚀 I'm thrilled to share..." cadence).

## How to seed it

Paste 10-20 of your actual past tweets, blog excerpts, or comments
that you liked the voice of — anything that sounds like *you*, not a
template you'd be embarrassed by. Mix:
- A few X posts you wrote (errors and all — the agent learns natural
  cadence from imperfect samples better than from polished ones)
- A blog/article paragraph or two
- A couple of HN/Reddit comments where you were happy with the prose

Add a `---` separator between samples. Add a one-line `# context:`
preamble on each if helpful (e.g., "tweet, build-in-public") so the
agent knows the context of each sample.

## Samples

<!-- Paste samples below this line. Empty = generic voice. -->
