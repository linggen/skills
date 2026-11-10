// rules/cultivation.mjs — a stretch of cultivation pays (Hanli 2026-11-10: 「如果一段剧情+小游戏是修炼相关的, 那么这一段剧情+小游戏
// 结束后要能获得修为奖励」 · 「入门前不发，冲完三关给一份」; beside 11-09's 「剧情可以给修为, 但要给的和玩一场小游戏差不多」).
//
// A scene marked in its data (`cultivation: true`, its `_cultivation` quoting the line) is a stretch: from the moment he
// stands in it to the exit that leaves it (`next` or `ends`). Its boards' 修为 is tallied as it lands (`scene_xiuwei`,
// tasks.mjs taskDone). Leaving, a stretch that paid none — no board, or its board skipped, lost, put down — pays one story
// step (`story`, playpay.mjs storyPlay) at the layer he stands on after the exit's own rise (零层 pays 0: before 入门,
// nothing). Hanli: 「满了后的下一场剧情是突破」 — at a held full bar the floor pays nothing and shows nothing.
// A stretch that paid — a board, a story step, a gain the words tell — gets nothing more: never twice.
// Its 所得 carries the stretch's whole 修为 once (core.mjs resolve → Look gained.progress; `earlier`: what was already on
// the bar). A leaf: no imports. No scene is named here.

const KEY = 'scene_xiuwei';
/* The floor: one story step where he stands. */
export const FLOOR = Object.freeze({ table: 'story' });

/* A grant that pays the stretch's 修为 by itself: a story step, or a gain its words tell (`narrated`). */
const paysXiuwei = grant => Boolean(grant && (grant.table === 'story' || grant.narrated || grant.progress > 0));
const tallyOf = (s, sceneId) => (s[KEY]?.scene === sceneId ? s[KEY] : null);

/* A board of `sceneId` paid: what landed, and what a cap turned to 灵石 (paid all the same — the floor never pays again). */
export function tallyBoard(s, sceneId, paid) {
  const landed = paid?.progress ?? 0, turned = paid?.converted?.progress ?? 0;
  if (!sceneId || landed + turned <= 0) return;
  s[KEY] = { scene: sceneId, progress: (tallyOf(s, sceneId)?.progress ?? 0) + landed, paid: true };
}

/* A gain told for the scene it leads into (`narrated.scene`: wm-mingpai's into wm-kaikai's 埋土 night): that stretch is paid. */
export function tallyTold(s, grant, paid, next) {
  const into = grant?.narrated?.scene;
  if (into && into === next && (paid?.progress ?? 0) > 0) s[KEY] = { scene: into, progress: tallyOf(s, into)?.progress ?? 0, paid: true };
}

/* The exit ends a marked scene's stretch: it leaves (`next` · `ends`), on the spine, not a scene played again. */
export const endsStretch = (scene, exit, live) => Boolean(live && scene?.cultivation === true && (exit.next || exit.ends));

/* The floor this exit owes, or null: nothing of the stretch paid 修为, and the exit's own grant pays none. */
export const floorOf = (s, scene, grant) => (tallyOf(s, scene.id)?.paid || paysXiuwei(grant) ? null : FLOOR);

/* The stretch closed: the boards' 修为 already on the bar (`earlier`), and the tally gone. */
export function closeStretch(s, scene) {
  const earlier = tallyOf(s, scene.id)?.progress ?? 0;
  if (s[KEY]?.scene === scene.id) delete s[KEY];
  return earlier;
}

/* A floor's pay that landed nothing and holds nothing (a gate still shut) is no pay: no 「修为 +0」 on the page. */
export const landedOnly = paid => (paid && ((paid.progress ?? 0) > 0 || paid.hold || paid.levels?.length) ? paid : null);

/* Two pays of one step as one: the exit's own and the floor's. */
export function joinPaid(paid, more) {
  if (!more || !paid) return paid ?? more ?? null;
  return {
    ...paid, progress: (paid.progress ?? 0) + (more.progress ?? 0), levels: [...(paid.levels ?? []), ...(more.levels ?? [])],
    ...(more.hold ? { hold: more.hold } : {}), ...(more.duan ? { duan: more.duan } : {}),
  };
}

/* What the stretch's 所得 counts: this step's pay with the boards' 修为 before it added. */
export const stretchShown = (paid, earlier) => (earlier > 0 ? { ...(paid ?? {}), progress: (paid?.progress ?? 0) + earlier } : paid);
