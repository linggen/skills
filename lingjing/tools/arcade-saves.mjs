// tools/arcade-saves.mjs — the 游戏厅's stage saves (Hanli 2026-10-21: the 游戏厅 holds every playable thing).
// A game the rules stand on the real page (二十问 · 讨价还价 · 对对子 · 秘境 rerun: no board module,
// or one Look drives) is tried there on a test save of its own. Its games.json row says where (`stage`):
//   save   the scratch save's name, and the fixture it seeds from (tests/fixtures/saves/<save>.json) — or `seed`, a fixture there already
//   from   how far the story is played first (rules/progress.mjs playTo: a scene, a 回) — mid-回, so no 回's close stands
//   place  where he stands then (the story's scene stays, a walk away: the game's card stands where he is)
//   her    银月 awake (a game she hosts or reads for); wealth  灵石 in hand; rerun  that rerun's cracks open
//   visitor  a visiting shop's place (province/place) whose day the 游戏厅 shifts the save's clock to (`&days=`)
//   look   the key of Look that shows the game (tests/game-shell.test.mjs holds that it does)
//
//   node tools/arcade-saves.mjs          write every stage row's fixture
//   node tools/arcade-saves.mjs --check  only say which would change
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules.mjs';
import { toldUpTo } from '../scripts/rules/progress.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
// A fixed past morning: every date the save carries is behind the real clock it is played on.
const T0 = new Date('2026-10-01T09:00:00+08:00');
// …in a fixed zone. The rules read local days and hours (state.mjs dayKey) while the save's seed is the instant, so
// the same run played on another machine's zone made another save (CI on UTC: 秘境's `first` a day early, a beast
// met twice). The run is played in T0's own zone, wherever it runs.
export const STAGE_TZ = 'Asia/Shanghai';

/** `fn` run with the process clock in `tz`, the zone given back after (Node reads TZ at each change). */
function inZone(tz, fn) {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
}
const EPOCH = '2026-01-01T00:00:00.000Z';

/** The save a stage row plays on: the story played to `from`, then the row's own few facts. */
export function stageSave(content, stage) {
  const s = inZone(STAGE_TZ, () => playTo(content, newState(content, 'zh', T0), stage.from, { now: T0 }).state);
  // Every passage the run walked through told, as `seed --at` hands a save over. The scene stays (put down, the rules
  // would read the chapter as not begun); he stands at the game's place, its scene's card a walk away.
  const out = { ...toldUpTo(content, s), place: stage.place };
  if (stage.her) { const { asleep, ...c } = s.companion ?? {}; out.companion = { ...c, awake: true }; }
  if (stage.wealth) out.wealth = Math.max(s.wealth ?? 0, stage.wealth);
  if (stage.rerun) out.reruns = { ...(s.reruns ?? {}), [stage.rerun]: { ...(s.reruns?.[stage.rerun] ?? {}), ended_at: EPOCH } };
  return out;
}

// A row that names a fixture of its own (`seed`: 二十问 on ji-home) has nothing written here.
export const stageRows = (reg) => (reg.games ?? []).filter((g) => g.stage && !g.stage.seed);
export const fixtureOf = (stage) => path.join(ROOT, 'tests', 'fixtures', 'saves', `${stage.save}.json`);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.env.LINGJING_STAMINA_LIMIT ??= '0';
  const check = process.argv.includes('--check');
  const content = loadContent();
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds', 'jiuding', 'games.json'), 'utf8'));
  for (const row of stageRows(reg)) {
    const file = fixtureOf(row.stage);
    const text = `${JSON.stringify({ _about: `游戏厅 stage save for ${row.id} (tools/arcade-saves.mjs, from its games.json row)`, state: stageSave(content, row.stage) }, null, 1)}\n`;
    const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    if (!check && !same) fs.writeFileSync(file, text);
    console.log(`${same ? 'same' : check ? 'would change' : 'wrote'} ${path.relative(ROOT, file)}`);
  }
}
