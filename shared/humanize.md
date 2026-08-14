# Humanize — shared catalog of AI-writing tells

Shared reference for any skill that writes outward-facing text (posts,
articles, replies, copy). Not a skill itself. Load it at drafting time;
apply as a final pass over anything a reader outside Linggen will see.

Short conversational lanes (a reply, a chat message) have stricter,
register-specific rules in their own skill files; this catalog is the
general layer beneath them. Patterns sourced from Wikipedia's "Signs of
AI writing" plus our own flagged-text post-mortems.

## The stance (fix this first — it's the actual tell)

AI text reads AI because of its stance, not its words: it covers every
branch, hedges every claim, and owes the reader a complete service.
People write from one point of view, under time pressure, about the one
thing they care about.

- Say the one thing that matters. Don't answer parts nobody asked about.
- Commit. One hedge maximum, then state it plainly. A confident guess
  beats three qualified possibilities.
- Take a position. Neutral pro/con reporting with no opinion is a tell.
- Be specific or be silent: a named tool, a number, a moment it broke.
  A sentence equally true of any product in any industry gets cut.
- Stop early. No summary of what you just said, no upbeat outlook line.

## Word tells (delete or replace)

- Puffery: pivotal, crucial, vital, testament, groundbreaking, renowned,
  transformative, game-changer, cutting-edge → state the fact plainly.
- Promo: vibrant, stunning, breathtaking, seamless, robust, boasts,
  nestled, rich (figurative) → neutral description.
- AI vocabulary: delve, tapestry, landscape (abstract), interplay,
  underscore, foster, leverage, utilize, facilitate, streamline,
  multifaceted, comprehensive, myriad, embark → the plain word (use,
  help, many, start).
- Transition filler: moreover, furthermore, additionally, subsequently,
  in conclusion, ultimately, at the end of the day → usually just delete.
- Padding: "in order to"→to, "due to the fact that"→because, "has the
  ability to"→can, "it is important to note that"→(delete), "at this
  point in time"→now.
- Vague authority: "experts believe", "industry reports", "many studies
  show" → name the source or drop the claim.

## Shape tells (rewrite the sentence)

- Negative parallelism: "not just X, but Y", "it's not about X, it's
  about Y" → say the point directly.
- Rule of three: exactly three adjectives, examples, or clauses, again
  and again → keep what's needed, cut the padding.
- Copula avoidance: "serves as", "stands as", "represents", "features"
  → "is", "has".
- -ing padding: trailing "…, highlighting/showcasing/reflecting the
  broader…" clauses that add fake depth → delete or make concrete.
- False ranges: "from X to Y" where X and Y aren't on a scale → list
  the actual items.
- Synonym cycling: protagonist → main character → central figure →
  pick one term and keep it.
- Significance inflation: "plays a vital role", "marks a shift",
  "reflects broader trends" → what actually happened, dated and named.
- Uniform sentences: every sentence medium-length and balanced → vary
  hard. Short ones exist. Fragments too.

## Format tells

- Em-dash chains — like this — everywhere → commas, periods, restructure.
- Bold-label bullets ("**Speed:** it's fast") → prose, or plain bullets.
- Headers for a three-paragraph text; Title Case In Headings; emoji as
  decoration (🚀✅💡) → drop them.
- "Key takeaways" blocks and wrap-up conclusions → end on the last
  concrete point.

## Assistant artifacts (never in outward text)

"Great question", "I hope this helps", "Certainly!", "Let me know if…",
"Would you like me to…", "You're absolutely right", knowledge-cutoff
disclaimers ("as of my last update"), "I understand your concern".
Delete on sight — these are chat scaffolding pasted into content.

## Worked example

Before:
> The new update serves as a testament to our commitment to innovation.
> Moreover, it delivers a seamless, intuitive, and powerful experience —
> ensuring users accomplish their goals efficiently. It's not just an
> update, it's a rethinking of how productivity works.

After:
> The update adds batch processing, keyboard shortcuts, and offline
> mode. Beta testers mostly mention the shortcuts — editing without
> touching the mouse is the part people keep.

## Final checklist

1. Would a busy person with a stake write this sentence? If it could
   only come from a neutral advisor with unlimited time, rewrite it.
2. Scan for the word and shape tells above; fix every hit.
3. Read it aloud. Uniform rhythm means it needs one short sentence and
   one cut.
4. Delete the last sentence if it summarizes, moralizes, or cheers.
