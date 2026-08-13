# Lane Templates

Format constraints per lane. The agent picks lanes based on the day's
*weight* (see Phase 4 in SKILL.md). Each draft must fit its lane's
constraints.

## Lane scope filter (apply FIRST — before format)

Lanes have different *substance requirements*, not just different
lengths. A 280-char observation does not become a blog by adding
paragraphs. Before drafting any lane, check whether the lead artifact
has enough substance to fill the lane *honestly*. If not, emit
`empty` for that lane and move on. Padding to hit a length is the
failure mode that produced today's "missing-newline blog" — a tweet
stretched to 4000 chars with byte-level minutiae.

- **x-post / reddit-comment / x-reply**: any concrete observation
  worth 1-4 sentences. Bug stories, one metric, one before/after —
  most pulse output lives here. (`x-reply` is conversational, not a
  standalone artifact — it always answers a specific tweet.)
- **linkedin**: needs *cross-domain appeal* — the observation should
  matter to professionals outside your sub-niche. A shell-wrapper
  bug doesn't qualify; "what shipping daily for a year taught me
  about feedback loops" does.
- **medium / substack**: needs an *argument* with 2-3 supporting
  pieces of evidence. If the draft is one fact + filler around it,
  it's an x-post.
- **blog**: tech article about a CONCEPT from the user's product
  (Linggen, ling-mem, apple-shifu — whichever the brief names),
  anchored against a current trend or signal from the web cards.
  See the `blog` section below for the required shape. **A single
  debugging anecdote is NEVER a blog.** Default to `empty` unless
  you can pre-write the opening hook + closing observation AND fill
  2-3 substantive sections between them without padding.

## Sound human (applies to x-post, x-reply, reddit-comment, hn-comment)

These lanes are 1-4 sentences of conversation, and the biggest "this
was written by AI" tell is *register*, not content. Apply these on top
of each lane's tic list, in pass 3:

- **Always use contractions.** "it's", "doesn't", "I'm", "that's",
  "they're", "didn't". Full forms ("it is", "does not", "I am") instantly
  read as a press release. This single fix removes most of the AI smell.
- **One concrete specific beats any generalization.** Name the actual
  thing — a tool, a number, a moment you saw — not a category.
  "builders", "the market", "in practice", "users", "teams", "people"
  are abstraction tells. If a sentence would be equally true for any
  product in any industry, it's too generic: cut it, or replace it with
  something only someone who actually did this would say.
- **React to ONE thing, then stop.** A human answers the specific point
  that caught them and quits. They don't restate the whole topic or land
  a tidy two-part conclusion.
- **No aphorisms or morals.** "The product keeps moving because the
  market doesn't pause" is a fortune cookie, not a reply. Say the small
  real thing instead, and stop one sentence earlier than feels complete.
  The most common offender is the "— otherwise X quietly becomes Y"
  closer: never END a draft on an "otherwise" clause; end on the
  concrete detail instead.
- **A fragment or a rough edge is GOOD.** Lowercase, trailing off, or
  a half-formed aside reads more human than a balanced, fully-resolved
  sentence. But casual openers are a budget, not a recipe — see the
  fingerprint rule below. ("yeah," is RETIRED: it led 4 of the
  account's flagged HN comments. Don't suggest it.)
- **Add one thing the thread doesn't already have.** Before drafting,
  check: does this say anything the OP, the parent comment, or the
  user's own earlier comment in the thread hasn't said? Agreement +
  restatement is not a reply — it's an upvote wearing words. The
  addition must be earned: a number from experience ("3-5 runs"), a
  named tool/flag, a failure actually hit, a cost/tradeoff. If there's
  nothing to add, emit no draft for that thread — a thread can be
  complete.
- **Never reuse a sentence shape visible in the thread.** If the
  parent comment (or the user's previous comment there) ends on a
  punchy contrast ("otherwise it's just X"), do NOT end on one too —
  two comments in a row with the same closing shape is the loudest
  bot tell there is. Vary where the weight lands: mid-sentence detail,
  question, plain stop.
- **Fingerprints live ACROSS drafts, not inside one.** This is how the
  account's comments actually got flagged: each draft passed alone,
  but ten of them shared an opener, a length band, and the same
  one-concrete-thing + fragment recipe — readers pattern-match the
  corpus, not the sentence. So vary BETWEEN drafts in the same run and
  against the user's recently posted comments: different openers,
  hard length spread (make one draft a single sentence; make one just
  a question), different moods (agree / push back / ask / correct).
  Never apply every rule in this section to the same draft — a recipe
  applied uniformly IS the fingerprint.
- **Reply to a sentence, not the topic.** Quote or closely paraphrase
  one specific phrase from the OP or parent (≤15 words) and answer
  THAT. A take on the subject is what generators produce; a reaction
  to the actual words is what humans produce. If the draft would fit
  under any thread on this topic, it's a take — cut it.

Worked example — an actual X reply this skill produced, and the fix:

  ❌ "Funny because it is exactly the opposite of how builders behave in
     practice. The product keeps moving because the market does not
     pause with the filing window."
     — no contractions; "builders" / "in practice" / "the market" are
     all abstractions; symmetric aphorism; reacts to the topic, not to
     anything specific they said.

  ✅ "doesn't really match what I've seen — most teams keep shipping
     right through the quiet period. it limits what you can say, not
     how fast you build."
     — contractions; reacts to their one claim; no fortune-cookie moral;
     slightly rough opener. (Even better: drop in a real detail from
     your own experience where the abstraction is.)

Second worked example — a reddit reply this skill drafted in a thread
where the user and the OP had already agreed failing cases should be
kept replayable and re-run:

  ❌ "exactly. one green is just an anecdote when the model's sampling.
     i like keeping the original failure plus a few nearby cases
     together, otherwise the fix gets tuned to the screenshot instead
     of the failure mode."
     — middle sentence restates what BOTH sides already said (zero new
     information); the user's previous comment in the thread ended
     "otherwise it's just dashboard theatre" and this ends "otherwise
     the fix gets tuned to…" — same closing shape twice in a row.

  ✅ "exactly. one green is just an anecdote when the model's sampling.
     the annoying part is deciding how many reruns is enough — i
     usually do 3-5 at the model's real temperature, not temp 0, since
     temp 0 hides exactly the variance users actually hit."
     — adds two things the thread didn't have (a rerun count, the
     temp-0 trap); ends on the detail, not a moral.

The **brief is the voice anchor** — mirror how IT is written for cadence,
then apply these rules on top.

## x-post

X is a broadcast lane to *strangers*. Nobody on X cares that the user
fixed a bug in their own codebase. Two gates apply, in this priority:

1. **Public-understandable test (FIRST).** Would a stranger who has
   never heard of the user's product, codebase, or niche understand
   the post in 5 seconds? If they need *any* of these to follow it,
   the post is wrong for X — emit `empty` for x-post and let the
   same fact live as a reddit-comment in a niche sub instead.
   - PASSES: *"Tested Qwen 27B on Apple Silicon — TTFT killed it
     for agent loops."* (Anyone in AI/local-LLM space gets it.)
   - FAILS: *"`/api/bash` glued `__LINGGEN_CWD__` onto JSON
     whenever `cat` ended with `}` — past sessions looked empty."*
     (Requires knowing /api/bash, what __LINGGEN_CWD__ is, what
     "Pulse sessions" are. r/LocalLLaMA audience, not X.)
2. **Interesting-content test (SECOND).** Even if understandable,
   is there a hook — a surprise, a counterintuitive observation, a
   vivid number, a question someone is asking? "I shipped feature X
   today" passes (1) and fails (2). Emit `empty`.

This makes **web-led + local proof** the default mode for x-post.
Local-led is allowed only when the local artifact itself is publicly
legible (a benchmark anyone cares about, a launch, a vivid universal
debugging story like *"Spent four hours debugging a missing comma"*).
Niche local-led posts go to reddit-comment instead.

- **Length**: 200-280 chars (X's free-tier limit). Don't pad to fill;
  if the idea is 180 chars, ship 180.
- **Structure**: one claim + one piece of evidence. No bullet lists.
  No threads in the x-post lane — if it needs threading, escalate to
  medium.
- **No URLs in main tweet body** (X downranks links). Citation goes
  in a follow-up reply tweet, surfaced as `citations[]` in JSON for
  the user to post manually after the main one.
- **Opening pattern**: lead with the trend hook or the concrete
  observation, not a setup phrase. The first 5 words decide whether
  anyone keeps reading.
- **Sound human** (see the section above): contractions, one concrete
  specific over abstraction, no aphorism endings — even a broadcast
  post reads as AI without them.
- **No emojis except** when the post is genuinely funny or the emoji
  IS the point (e.g., a literal stethoscope 🩺 for Apple Shifu). Skip
  decorative emojis.

## x-reply

A **reply** to someone else's tweet — either a reply on one of the
user's own tweets (`reply_to_me` from FetchXMentions) or a cold reply
under a stranger's post in the user's space (X discovery). This is the
single strongest growth lever on X: useful replies under bigger
accounts put the user in front of an audience that isn't theirs yet.
It is NOT the `x-post` broadcast lane — it's 1:1 conversation that
happens to be public.

- **Length**: ≤280 chars, usually far shorter — 1-3 sentences. A reply
  that fills the limit reads as a monologue; the best replies are one
  sharp sentence.
- **Open with a reaction or a direct answer**, never a thesis or a
  whole-problem framing. You're responding to a specific thing they
  said — engage with *that*, not the topic in the abstract.
  - Cold discovery: answer the actual question / add the one detail
    they're missing. Earn the space; a stranger's thread is not yours.
  - Reply on your own tweet: warmer and more familiar is fine — these
    are people already engaging with you.
- **Voice — first person, from the user.** Same as `reddit-comment`:
  someone with skin in the game talking, not a neutral advisor.
- **Three registers — pick one, default to (1)** (same as
  `reddit-comment`): (1) implicit — no project mention, the default;
  (2) contextual — "hit the same thing building X" only when the
  thread directly overlaps; (3) explicit — "we do X in <project>"
  only when they ask "what handles this?". Cold discovery is basically
  always (1).
- **Anonymization test**: would the reply work just as well with the
  project name stripped? If yes — fine. If it exists to *plant* the
  name — drop the draft. Replies that smell like promo are what get
  accounts shadow-limited; this lane exists to avoid that, not feed it.
- **No links, no CTAs.** X downranks and spam-flags reply tweets that
  are just a link or a "check out …". If a link is genuinely the best
  answer, note it for the user to add at their discretion — don't bake
  it into the draft.
- **Anti-AI tics — strip in pass 3** (same list as `reddit-comment`):
  diagnostic openers, symmetric parallel clauses, triple-slash lists,
  closing trade-off morals, ungrounded "I'd try …". A human reacts to
  one thing and stops. **Also apply the "Sound human" rules above** —
  contractions, one concrete specific, no aphorisms; this is the lane
  where AI register shows most.
- **JSON output**: include the tweet you're replying to so the user
  knows where it goes:
  ```json
  { "lane": "x-reply",
    "reply_to_url": "https://x.com/user/status/123",
    "register": "implicit",
    "content": "..." }
  ```

## medium

- **Length**: 500-1000 words. Below 500 = it should be an x-post.
  Above 1000 = it should be a blog.
- **Structure**: opening hook (≤2 sentences) → claim → 2-3 pieces of
  evidence → trade-off / caveat → closing observation (not CTA).
- **External citations**: 1-3 inline markdown links. If you have more
  than 3, prune to the strongest ones.
- **Headers**: optional, max 2-3 H2s. Don't header every paragraph.
- **Code/numbers**: include at least one concrete number or code
  excerpt if technical. Vague claims get skipped by readers.
- **Audience**: assume the reader is technically literate but doesn't
  know your specific stack. Define jargon on first use.

## blog

This lane is a tech ARTICLE, not a debugging journal. A blog draft
must teach the reader something durable about the user's product
(Linggen, ling-mem, apple-shifu — whichever the brief centers), tied
to a current industry trend the audience already cares about. If you
can't deliver both halves, emit `empty`. Garbage is worse than
nothing — every padded blog the user has to read and discard erodes
their trust in Pulse's drafts entirely.

### Required shape (mode is FORCED to web-led + local proof)

A blog draft is always **web-led + local proof**, never local-led
alone:

1. **Lead with a trend or industry observation** drawn from signal
   or discovery cards: a debate the audience is having right now, a
   pattern multiple sources are hitting, a question that's getting
   asked repeatedly. The reader should recognize the hook in the
   first paragraph.
2. **Pivot to a concept from the user's product** that bears on
   that trend — how Linggen handles X, why ling-mem's design solves
   Y, what apple-shifu does about Z. The product is the article's
   technical centerpiece, not a one-line plug at the end. Read the
   workspace files (README, /doc/*.md, source) and the brief to
   ground the concept; don't fabricate behavior.
3. **Use local progress as proof points** — concrete numbers,
   commits, before/after diffs from the progress card. These
   demonstrate the concept is real, not aspirational.
4. **Close on a real observation** about the trend or the trade-off,
   not a CTA. The user is not selling; they're explaining.

### Substance test (run BEFORE writing)

Write these three things first. If you can't, emit `empty`:

- The opening trend sentence (1-2 sentences, names a current debate
  the audience cares about, anchored by a signal/discovery card)
- The product concept being explained (one sentence: "this article
  is about how <product> does <thing>")
- The closing observation (1-2 sentences, not a CTA)

Then check: can you fill 3-5 H2 sections between opener and closer
with substance — code excerpts, diagrams, real trade-offs, prior-art
links — *without padding*? If you're already imagining filler
sentences, emit `empty`.

### Format constraints

- **Length**: 1500-3000 words. Below 1500 = collapse to medium.
  Earn the length with depth — this lane is for posts where the
  argument genuinely needs space.
- **Structure**: opening (trend hook from web cards) → context (why
  this matters now) → product concept introduction → 2-3 sections
  exploring how the product addresses the trend, with code excerpts
  and trade-offs → closing observation. NOT a bug recap.
- **External citations**: 3-7 inline links — prior art, related
  papers, alternative approaches, the signal/discovery cards that
  inspired the hook.
- **Code excerpts**: real snippets from the user's workspace where
  they clarify the concept. 5-15 lines per excerpt, never paste
  200-line files.
- **Diagrams**: ASCII or textual placeholder for posts that need one.
  The agent doesn't render images.
- **Audience**: technically literate adjacent practitioners — not
  hardcore experts in your specific stack, but people who'd
  recognize the trend you're hooking on.
- **Title**: 3 candidates in `title_candidates[]`. Each must invite
  a click — not "What this bug taught me" but something specific to
  the concept ("How we made <product> survive <trend's hardest
  case>"). If your three candidates all describe the article
  generically, you don't have an article yet — emit `empty`.

## reddit-comment

- **Length**: 1-4 sentences typically, 50-120 words max. Reddit
  comments that earn upvotes are short. Anything longer reads as
  monologue and gets skipped.
- **Voice — first person, from the user.** Write *as* the user, not
  as a neutral advisor. The brief tells you who they are and what
  they're building — let that perspective leak through in which
  questions you ask and which trade-offs you notice. The reader
  should feel that *someone with skin in the game* is talking, not a
  generic expert offering best practices.
- **Three registers — pick one, default to (1):**
  1. **Implicit** (default). Write from the perspective of someone
     who's been thinking about this stuff. No mention of the user's
     project. Most comments land here.
  2. **Contextual.** "Hit the same wall building X" / "we ran into
     this on a similar thing." Used only when the thread topic
     directly overlaps with what the brief describes, so it'd feel
     evasive *not* to ground the opinion in actual experience.
  3. **Explicit.** "We do X in <project> because Y." Only when the
     OP asks "what tools handle this?" or otherwise invites it.
     Basically never in cold discovery.
- **Anonymization test** (use this to decide promo vs. authentic):
  would the comment work just as well if you stripped the project
  name? If yes — fine. If the comment exists to *plant* the name —
  drop the draft. No URLs to landing pages, no CTAs, no "you should
  try X."
- **Anti-AI tics — strip in pass 3:**
  - Diagnostic openers: "X has two problems" / "X comes down to" /
    "the issue is" — humans don't open with whole-problem framings,
    they react.
  - Symmetric clauses: "the model sees too much … and still misses
    …" — parallel construction reads as AI. Make one clause longer.
  - Triple-slash lists: "A / B / C" — a human names one thing they
    actually tried, not a menu.
  - Closing trade-off summary: "It's less X but Y." Delete the
    moral. Stop one sentence earlier.
  - Generic-advisor stance: "I'd try …" with no grounding. Either
    ground it in experience or drop to a question.
  - **And the "Sound human" rules above**: contractions always, one
    concrete specific over any generalization, no aphorism endings.
- **Open with a reaction or question, not a thesis.** "wait, are you
  running it without the accessibility tree?" beats "Screenshot-only
  desktop agents hit two problems at once."
- **Optionally end with a question back to OP** if the thread invites
  dialogue. Not mandatory.
- **JSON output**: include the target sub in the lane payload so the
  user knows where to post:
  ```json
  { "lane": "reddit-comment",
    "sub": "LocalLLaMA",
    "thread_url": "https://reddit.com/r/...",
    "register": "implicit",
    "content": "..." }
  ```

## hn-comment

Output is a **paste-ready comment** — but this account has been burned
here before (14 of 17 comments killed by 2026-08, mostly user flags on
AI cadence), so this lane holds the strictest human bar of any lane.
The calibration set is the account's own history — write ONLY things
shaped like the survivors:

SURVIVED (real comments from this account — the target register):

    "same here. i usually only notice fonts when something feels off,
    not when it's working. the article made the hidden defaults feel a
    lot less arbitrary."

    "the hard part probably isn't search over 500k emails, it's keeping
    the generated wiki from becoming a second messy inbox. i'd want to
    see how it handles stale facts and conflicting versions of the same
    project. email has a lot of "this was true for two weeks in 2019"
    buried inside it."

FLAGGED (same account, killed by readers — do NOT write like this):

    "yeah, this gets ugly fast if every transcript becomes equally
    retrievable. i'd want the memory layer to keep source, retention,
    and who can retrieve it as first-class fields, not hope a vector
    store's metadata saves you later."

What separates them: the survivors have ONE loose thought with a
specific, almost mundane detail ("this was true for two weeks in
2019"); the flagged one is dense — three polished clauses, zero slack,
every noun load-bearing. Density IS the tell. Write the comment a
person types in 40 seconds, not the one an editor approves.

- **Length**: 1–3 sentences default. Sometimes just a question.
  Go longer ONLY when there's a concrete war story to tell.
- **Leave slack in the sentence.** One aside, one hedge, one plain
  connective ("and honestly", "which is fine"). If every clause
  carries information, it reads generated.
- **Apply the corpus-variation rules** ("Sound human" above) against
  the OTHER drafts in this run and the account's recent comments:
  vary opener, length, mood. Never two drafts with the same shape.

The goal on Hacker News is to **build karma with genuinely useful
comments** — especially for a new account that can't post much yet. HN
readers and mods flag anything that smells like marketing *harder* than
any other platform, and a flagged self-promo on a young account is the
fastest way to tank it. So the bar is: would this comment be worth
posting even if the user had no product at all? If not, drop the card.
- **Lead with specifics or direct experience.** A number, a failure
  mode, a concrete trade-off you actually hit, a correction to a claim
  in the thread. HN's best comments add a fact or a counterpoint the OP
  didn't have. "We tried embeddings for this and the recall got worse
  past ~10k rows because …" beats "interesting, memory is hard."
- **Three registers — pick one, default to (1):**
  1. **Implicit** (default, the overwhelming majority). Useful technical
     commentary from someone who's worked on the problem. NO product
     mention at all.
  2. **Contextual.** "Hit this building a memory layer for coding
     agents — the thing that bit us was …" Used ONLY when the thread is
     *directly* about agent memory / cross-session state and your
     experience is genuinely the relevant evidence. Still no link.
  3. **Disclosed.** Name ling-mem ONLY when the thread is specifically
     about this exact problem AND a reader would want the pointer — and
     then *always disclose authorship* ("I build one of these, so grain
     of salt — …"). HN forgives self-promo only when it's honest and
     on-topic. Never in a thread that's merely adjacent.
- **The mention test**: if you removed the ling-mem reference, would the
  comment still stand as a useful contribution? If no, you're planting a
  name — rewrite to register (1) or emit `empty`. Most HN drafts should
  be register (1) with zero mention.
- **No links to landing pages, no CTAs, no "check out".** A bare
  `news.ycombinator.com`-native mention with disclosure is the ceiling.
- **Anti-AI / anti-fluff tics — strip in pass 3:**
  - "Great point / interesting / thanks for sharing" openers — say
    something or say nothing.
  - Diagnostic openers ("X has two problems"), symmetric clauses,
    triple-slash menus, closing moral — same as reddit-comment.
  - Hedged advisor voice ("you might want to consider") — HN reads it as
    contentless. Make a claim or ask a sharp question.
  - Em-dash-heavy balanced sentences and "it's not X, it's Y" framings.
  - **Plus the "Sound human" rules above**: contractions, one concrete
    specific (a number / failure mode you hit), no fortune-cookie moral.
- **Reply to the OP, top-level.** The draft is a top-level reply to the
  post — easiest to post (reply box at the top, no hunting for a buried
  comment) and highest-visibility, which is the karma goal. Use the
  thread's existing comments only to avoid repeating a point already
  made; don't reply to a nested comment. Prefer threads with active
  discussion (num_comments > 0, recent) — a comment on a dead thread
  earns no karma.
- **JSON output**: include the thread url so the user knows where to
  paste:
  ```json
  { "lane": "hn-comment",
    "thread_url": "https://news.ycombinator.com/item?id=...",
    "register": "implicit",
    "content": "..." }
  ```

## linkedin

- **Length**: 800-2000 chars (~150-350 words). LinkedIn truncates
  posts above ~210 words behind a "see more" — front-load the claim.
- **Structure**: hook in the first 2 lines (visible above the fold)
  → 2-3 short paragraphs of substance → closing line that's a
  thought, not a CTA. No bullet lists with single-word items.
- **External citations**: 0-2 links inline. LinkedIn downranks posts
  with multiple external links — be sparing.
- **Tone**: more formal than X, less formal than blog. Plain English,
  no jargon without definition. Avoid LinkedIn-default phrases:
  "thrilled to share", "humbled to announce", "game-changer".
- **No hashtags in the body**. If the user wants tags, they go in a
  trailing line — but skipping them entirely is fine.
- **Audience**: assume professional readers in adjacent fields, not
  hardcore practitioners. Define jargon, link to deeper material if
  the reader wants more.

## substack

- **Length**: 600-1500 words. Mid-length. Substack readers expect
  more depth than X but less than a long blog.
- **Structure**: opening hook (1-2 paragraphs) → 2-3 sections with
  H2 headers → closing observation. Include at least one concrete
  example or anecdote — Substack rewards narrative texture.
- **External citations**: 2-5 inline links to prior art or sources.
- **Audience**: subscribers chose to be there; you can be more
  opinionated than blog. Take a stance.
- **Title**: write 3 candidates in `title_candidates[]` for the user
  to pick. Substack subject lines drive open rates more than any
  other lane.
- **Subtitle**: include a 1-line subtitle in the JSON output as
  `subtitle`. Substack uses it as the email preview.

## Format-specific JSON shape

```json
{
  "lane": "x-post",
  "content": "...",
  "citations": ["https://..."]
}
```

```json
{
  "lane": "medium",
  "title_candidates": ["...", "...", "..."],
  "content": "...",
  "citations": ["https://...", "https://..."]
}
```

```json
{
  "lane": "blog",
  "title_candidates": ["...", "...", "..."],
  "content": "...",
  "citations": ["https://...", "https://...", "https://..."]
}
```
