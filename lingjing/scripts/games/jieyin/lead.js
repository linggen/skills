// The lead card's line that 结印 is here (Hanli 10-21: 「有结印要告诉玩家啊」), shared by every host (守墙关 · 守炉 · 守山门):
// the dock's handle (helper.js offerSeals — null where no camera is or no move is offered) says it by the level's pace,
// after the story's own lines. The card never waits on it long: no word in `ms` (a cold load fetches the dock's kit and modules: 1.5 s lost it at 390), the story's lines alone.
//
//   leadWith(said, seals, pace, lang) → Promise<text>   seals: the host's Promise<handle | null>
export function leadWith(said, seals, pace, lang = 'zh', ms = 3000) {
  const line = Promise.resolve(seals).then((h) => h?.lead?.(pace) ?? '', () => '');
  const late = new Promise((done) => { setTimeout(() => done(''), ms); });
  return Promise.race([line, late]).then((l) => [said, l].filter(Boolean).join(lang === 'en' ? ' ' : '　'));
}
