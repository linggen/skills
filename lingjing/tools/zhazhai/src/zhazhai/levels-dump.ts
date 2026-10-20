// levels-dump.ts — run by build.mjs under node: the forts as plain data (games/zhazhai/levels.json), for the host
// and the tests (which cannot load Phaser). Imports no Phaser.
import { LEVELS, LEVEL_WORDS } from "../data/levels";

export const dump = () =>
  LEVELS.map((l) => ({
    id: l.levelId,
    theme: l.theme,
    shots: l.birds.map((b) => b.type),
    weasels: l.pigs.map((p) => p.size),
    blocks: l.structures.length,
    materials: [...new Set(l.structures.map((s) => s.material))],
    stars: l.starThresholds,
    words: LEVEL_WORDS[l.levelId],
  }));
