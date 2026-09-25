# Made scenes and worlds

<!-- Lingjing guide `made` — handed to Ling with the result when the game gets here, or read with Guide. Moved out of SKILL.md 2026-09-25 (his: 没出现的内容，不用一直带着). -->

## Made scenes and worlds

When the player wants a scene or a world of their own (*a 山海经 hunt in
青州*, *a 三国 council*), you build it; they never do, and nothing is asked of
them first.

- **Scene:** **Make** with nothing (the template and its rules) → write one
  scene in exactly that shape: their language, one to four exits with plain
  `means`, labelled buttons, **grants of progress and wealth only, from the
  `branch` table — each exit pays once**, one exit that `ends: "made"`. →
  **Make** with it; `not-playable` lists what to fix — fix it silently and
  Make again. → **Enter** and play it like any scene; write the next scene
  only when an exit needs it. A scene not yet entered is changed by Make with
  the same id. **Leave** (or an `ends` exit, or a Move with `left`) returns to
  the story; Enter goes back in.
- **World:** **Build** with nothing → write one outline in that shape (title,
  premise, style in both languages; its heritage; a province of four to eight
  places with roads both ways and a start; a cast from the bestiary and up to
  four new creatures; renamed words; the opening scene) → **Build** with it,
  fixing `not-playable` silently. The answer is the new world's Look with
  `building`. The systems are the base's, never yours to change. **Amend**
  changes it on the player's word — never Build again.
- **Heritage only**, a novel's names never (`not-playable` names the one
  used); the spine, the cauldrons and Yinyue's memory untouched.
- **Pictures — only while building, never in play.** When a result carries
  `paint` (or Look `building`, or a `still-building` refusal): **GenerateImage**
  every entry with exactly its `prompt`, `name` and `shape`, then **Art** with
  its `creature` and the returned `path`, until Art says `ready`. Say in a
  phrase that the brush is at work, then narrate. Never write a picture's
  prompt yourself; never post a painted card as a markdown image; a kept
  picture is shown only by the `url` Art answers, exactly as given. For a
  made scene's own new thing, GenerateImage it before Enter — the subject in
  plain words, then always: *traditional Chinese ink wash painting with soft
  watercolor tints on aged cream paper, muted sepia, moss green and slate
  blue, loose brushwork, soft mist, no text, no border*; named after the
  thing, `square` for a creature or item, `landscape` for a place; shown once
  by its `url`. Repaint on request: Art with no file.
- **Without GenerateImage among your tools this machine cannot draw**: making
  scenes and worlds is closed — say so in one line and offer the story.

## The tools

**Make** — A scene of the player's own. Called with nothing it returns the template — a whole example scene — and the rules of making; called with `scene` (the JSON of one scene in that exact shape) the rules check it and keep it, refusing `not-playable` with the `problems` to fix. Costs stamina.

**Enter** — Step into a made scene by id; the main story keeps its place. Play it with Resolve like any scene; an exit that `ends` returns to the story.

**Leave** — Back to the main story from a made scene, wherever it stood. A Move away does the same.

**Build** — A world of the player's own. Called with nothing it returns the template — a whole example world — and the rules of making; called with `world` (the JSON of one outline in that exact shape) the rules check it, keep it, and take the player there: a fresh save in that world, its opening scene already entered. Refuses `not-playable` with the `problems` to fix, and `world-in-play` for an id whose save exists. Costs stamina.

**Amend** — Add to the world in play, when it is the player's own: a `creature` (JSON, the shape of a creature in the world template) and `at`, the place it haunts; or a `place` (JSON, the shape of a place in the template) with roads to places that exist — the rules lay the roads back. Refuses `not-playable` with the `problems`. Costs stamina.

**Art** — Give a creature of this made world its picture — the `path` (or `url`) GenerateImage returned. The rules keep the file beside the world and write it into the creature's card; `creature: map` is the world's map. With no file it answers `paint`, the arguments to paint it (again). Answers the picture's `url` — show it as a markdown image by that url, exactly as given, never a path of your own — and what is still to `paint`, or `ready` when the world can play.
