// road-hand.mjs — the cards the road of 卷一 has given by each stop (cards.json `from`, cards.md
// § 4, 2026-10-16: every card gained in the story, a beat won, a beast beaten or a thing bought —
// none at the root test). One list for the fight bands (tools/story-fights.mjs) and the trial
// sims (tools/trial-sim.mjs roadHand), so the two never weigh different hands.
export const EARLY = ['niangbing', 'yijian', 'tuna']; //               00-kitchen · 射鹿 · 吹鹅毛
export const H05 = [...EARLY, 'mucao', 'zheng']; //                        木草泥马 (wm-diyilu) · 狰 tamed with a 萝卜
export const H08 = [...H05, 'huiqi', 'huoya', 'huodan', 'bingzhui', 'jinren', 'tuqiang', 'mutang', 'yangzhen']; // 秘境 · 褚先生's five · 痒痒针
export const H11 = [...H08, 'houtu', 'luying', 'suijin', 'huochai']; //   the 大比's three won · 火柴 (09-snow)
export const H09 = [...H11, 'zhennu', 'ruxi']; //                          灵草谷's 犰狳 · 入隙 (09-futian)
export const H10 = H09;
export const H10B = [...H10, 'hantan']; //                                 冰夷双龙 won: 寒潭指 (01-rise), before 老井 (01-laojing)

/* The hand held when a story fight comes (the fights before it won). */
export const HAND_AT = {
  longzhi: EARLY, gui: H05, 'foe-zou': H05, 'foe-lufang': H08, 'foe-shijie': [...H08, 'houtu'],
  'foe-maxiaobao': [...H08, 'houtu', 'luying'], qiuyu: H11, 'foe-shuanglong': H10, 'foe-laojing': H10B,
};
