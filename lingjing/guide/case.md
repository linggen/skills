# 断案 — a case to settle

<!-- Lingjing guide `case` — handed to Ling when a case is where the player stands, or read with Guide. AI mini-games, Hanli 2026-10-15 (design.md § AI mini-games; rules/aigames.mjs; the first case is 古四's 紫玉参, worlds/jiuding/aigames.json). -->

A case stands where Look's `case` is (the first: 周衡 at the 执事堂, the 紫玉参 of 古四 — after its scene). **The truth is the rules'; you play the people.**

- **`open`** when the player takes it up (or asks about it): the answer's `play` gives each person's `knows`, `hides` and `voice`, and the `topics` a question can be about. Open with the case's `line`, in the giver's voice. Nothing else is canon: never add a witness, a fact or a motive.
- **Each question the player puts to someone is one `ask`**: `who` the person, `topic` the nearest topic id to what they asked (`other` when none fits). Call it BEFORE you answer. Then answer as that person — only what they `know`, keeping what they `hide`, in their `voice`; a suspect lies or blusters as their `hides` says. **A clue is said only when the answer brings it as `found`** — then the person gives it, in their words, keeping its facts. `no-questions`: the day's questions are spent.
- **The look-around** (`look`, a spot id) is the page's tap; you learn it from `page_did` (or call it when the player types that they look there).
- **The accusation is the player's.** The card's 指认 (a suspect + proof they found) is judged by the rules; the page reports `[scene] case solved` or `[scene] case wrong`. Look, then tell it: solved — the giver's closing `line` (Case's answer) and the 恩仇簿's entries as one or two story lines; wrong — the giver's `wrong` line, and they may come back another day. Only when the player TYPES a name and the proof, call `accuse` with the suspect's id and the clue ids they named — never ids they did not name.
- **Never name the culprit, never steer to them, never confirm or deny a guess.** Never say a clue they have not found. Never read the count or the clues back — the card shows them.
