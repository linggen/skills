// story-fights.mjs — every fight of 卷一, weighed the FIRST time a player meets
// it, with the realm, hand and gear the road gives at that point (Hanli,
// 2026-10-15: 都太简单了 — a first meeting should be won about 60% of the time;
// a careful player wins reliably, a careless one loses).
//
//   node tools/story-fights.mjs [--seeds N] [--only id,id] [--line lookahead|careful] [--pills] [--json]
//
// The band's player is `--line lookahead` (scripts/fightline.js): every move
// tried on a copy and the fight played out from there — it plays as a careful
// person did by hand. `careful` (tools/trial-sim.mjs `fightOnce`, one-ply
// greedy, blind to the beast's intent) is kept for comparison; it underrates a
// player. tests/fight-band.test.mjs and fight-band-pools.test.mjs lock the
// band with fixed seeds.
//
// Where the road stands at each 回 (ladder.json caps.hui; cards.json `from` — 2026-10-16, cards.md:
// every card is gained in the story or bought, none at the root test):
//   h04r 练气零层 · the 三试 (a 试 of nerve, survive 4): 娘的饼 (00-kitchen), 一箭 (射鹿), 吐纳 (吹鹅毛),
//        each twice (under ten, two copies), and the 试's own 一滚 · 石子.
//   h04  the same, rooted (00-hall), the 灰袍 (grey-robe) — the 蒙山 and 林子 pools.
//   h05  练气一层 · + 木草泥马 (wm-diyilu), 狰 tamed with a 萝卜 (wm-yaoyuan) — the 后山崖顶's first beasts.
//   h07  练气二层 · the 秘境: the 凶崖's 犰狳 on the stair down, 蛫 (wm-wangzuo).
//   h07z 练气三层 · + the 踏马符 in the bag — 邹青松 (wm-xirang, 阿禾 behind the wall), the 暗河.
//   h08  练气四层 · + 回气丹 (wm-xirang), 火鸦 (邹青松's gourd), 褚先生's five (wm-qianye), 痒痒针
//        (wm-zhaojing), the 短刀 worn — the 大比 in order (卢方's 厚土 after his bout).
//   h11  练气五层 · + 火柴 (09-snow) worn — 灵草谷's 犰狳 with 阿禾 and 孙二狗 (party.json by_hui).
//   h11b 练气六层 · + 震怒 (the 犰狳's) — 秦雁 on the 崖顶, alone.
//   h09  练气七层 · + 入隙 (09-futian) — 古八's pools with 阿禾.
//   h10  筑基一层 · the same hand at 筑基 — 冰夷双龙 alone, the 冀 pools with 阿禾.
// Gear worn as soon as it is had (a sensible player puts on what he is given).
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { creatureOf, foeOf as sceneFoe } from '../scripts/rules/world.mjs';
import { act, begin, foeTurn } from '../scripts/battle.js';
import { fightOnce, lookahead } from './trial-sim.mjs';
import { EARLY, H05, H08, H11 } from './road-hand.mjs';

export const content = loadContent();
const NOW = new Date('2026-09-29T11:00:00Z');
const base = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const ALL = ['metal', 'wood', 'water', 'fire', 'earth'];

/* The road, step by step: each stop names its realm, what has been won before
   it (each win deals one card, rules/cards.mjs winCard), and what is worn or held. */
const STOPS = {
  h04r: { tier: 'qi', step: 0, rootless: true, cards: EARLY, at: ['00-prologue', '00-longzhi'] },
  h04: { tier: 'qi', step: 0, cards: EARLY, wear: { robe: 'grey-robe' }, at: ['00-prologue', '00-waimen'] },
  h05: { tier: 'qi', step: 1, cards: H05, cast: ['zheng'], wear: { robe: 'grey-robe' }, at: ['00-waimen', 'wm-diyilu'] },
  h07: { tier: 'qi', step: 2, cards: H05, cast: ['zheng'], wear: { robe: 'grey-robe' }, at: ['00-waimen', 'wm-wangzuo'] },
  h07z: { tier: 'qi', step: 3, cards: H05, cast: ['zheng'], wear: { robe: 'grey-robe' }, bag: { 'tama-fu': 1 }, at: ['00-waimen', 'wm-xirang'] },
  h08: { tier: 'qi', step: 4, cards: H08, cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' }, at: ['00-waimen', 'wm-fushi'] },
  h08b: { tier: 'qi', step: 4, cards: [...H08, 'houtu'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' }, at: ['00-waimen', 'wm-lun2'] },
  h08c: { tier: 'qi', step: 4, cards: [...H08, 'houtu', 'luying'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' }, at: ['00-waimen', 'wm-juesai'] },
  h11: { tier: 'qi', step: 5, cards: H11, cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' }, at: ['00-zhuji', '09-lingcao'] },
  h11b: { tier: 'qi', step: 6, cards: [...H11, 'zhennu'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' }, at: ['00-zhuji', '09-futian'] },
  h09: { tier: 'qi', step: 7, cards: [...H11, 'zhennu', 'ruxi'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' }, at: ['00-zhuji', '09-dabi'] },
  h10: { tier: 'foundation', step: 1, cards: [...H11, 'zhennu', 'ruxi'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' }, at: ['01-ji', '01-ye'] },
};

export function stateAt(stop) {
  const at = STOPS[stop];
  const s = structuredClone(base);
  Object.assign(s, { tier: at.tier, step: at.step, traits: at.rootless ? [] : ALL, cast: [...(at.cast ?? [])], wear: { ...(at.wear ?? {}) }, bag: { ...(s.bag ?? {}), ...(at.bag ?? {}), ...Object.fromEntries(Object.values(at.wear ?? {}).map(id => [id, 1])) } });
  // Where he stands decides who stands with him (party.json by_hui).
  [s.chapter, s.scene] = at.at;
  s.cards = [...at.cards];
  delete s.cards_new;
  return s;
}

/* Every fight of 卷一, at its first meeting. `pool` names the stretch whose
   entry deck stands over the creature's own; `reach: false` is a beast of the
   book that is not yet a game fight. `band` is what it is tuned to. */
export const FIGHTS = [
  { id: 'longzhi', name: '蠪侄 (三试)', at: 'h04r', scene: '00-longzhi/subdue', band: [0.6, 0.92], nopills: true, note: 'tutorial; before the 灵根 test he holds no 灵石 and no pill' },
  { id: 'gui', name: '蛫 (秘境)', at: 'h07', scene: 'wm-wangzuo/open' },
  { id: 'foe-zou', name: '邹青松 (试 · 追)', at: 'h07z', scene: 'wm-xirang/swallow', trial: true, unforced: true },
  { id: 'foe-lufang', name: '卢方 (大比)', at: 'h08', scene: 'wm-fushi/flip' },
  { id: 'foe-shijie', name: '秦雁 (试 · 三十招)', at: 'h08b', scene: 'wm-lun2/dodge', trial: true, unforced: true },
  { id: 'foe-maxiaobao', name: '马小宝 (大比)', at: 'h08c', scene: 'wm-juesai/face' },
  { id: 'qiuyu', name: '犰狳 (灵草谷)', at: 'h11', scene: '09-lingcao/fight', band: [0.5, 0.72], pilled: [0.55, 1], note: 'Hanli 10-16: 55–65 won, really lost ≥20%' },
  { id: 'foe-shijie', name: '秦雁 (崖顶 · 试)', at: 'h11b', scene: '09-futian/spar', trial: true, unforced: true },
  { id: 'foe-shuanglong', name: '冰夷双龙 (试)', at: 'h10', scene: '01-rise/stand', trial: true, band: [0.35, 0.7], note: 'a 试 outlasted: its 气血 does not weigh it' },
  { id: 'qiuyu', name: '犰狳 (秘境 凶崖, guards the way)', at: 'h07', pool: 'mijing-ya' },
  { id: 'heyu', name: '合窳 (秘境 暗河)', at: 'h07z', pool: 'mijing-anhe' },
  { id: 'qiuyu', name: '犰狳 (秘境 暗河)', at: 'h07z', pool: 'mijing-anhe' },
  { id: 'yezhu', name: '野猪 (蒙山)', at: 'h05', pool: 'mengshan' },
  { id: 'lang', name: '狼 (蒙山)', at: 'h05', pool: 'mengshan' },
  { id: 'xiong', name: '熊 (蒙山)', at: 'h05', pool: 'mengshan' },
  { id: 'longzhi', name: '蠪侄 (林子 pool)', at: 'h05', pool: 'songlin' },
  { id: 'zheng', name: '狰 (药园外 pool)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'yezhu', name: '野猪 (后山崖顶 pool)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'lang', name: '狼 (林子 pool)', at: 'h05', pool: 'songlin' },
  { id: 'gui', name: '蛫 (泗水 pool)', at: 'h10', pool: 'sishui' },
  { id: 'tianma', name: '天马 (太行)', at: 'h10', pool: 'taihang' },
  { id: 'linghu', name: '领胡 (太行)', at: 'h10', pool: 'taihang' },
  { id: 'renyu', name: '人鱼 (柳湾)', at: 'h10', pool: 'liuwan' },
  // 后山崖顶's beasts by the 回 their entry opens (2026-10-15, 不打重复的怪 — places/xu.json `from`).
  { id: 'chihu', name: '赤狐 (后山崖顶)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'shanli', name: '山狸 (后山崖顶 · 夜)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'mihou', name: '猕猴 (后山崖顶 · 昼)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'fushe', name: '蝮蛇 (后山崖顶 · 昼)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'congcong', name: '从从 (后山崖顶)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'xiegou', name: '絜钩 (后山崖顶 · 夜)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'lingling', name: '軨軨 (后山崖顶, 古五)', at: 'h07', pool: 'yaoyuan-wai' },
  { id: 'cangying', name: '苍鹰 (后山崖顶 · 昼, 古六)', at: 'h08', pool: 'yaoyuan-wai' },
  { id: 'yuanhu', name: '妴胡 (后山崖顶, 古六)', at: 'h08', pool: 'yaoyuan-wai' },
  { id: 'jingjing', name: '精精 (后山崖顶, 古六)', at: 'h08', pool: 'yaoyuan-wai' },
  { id: 'chai', name: '豺 (后山崖顶, 古七)', at: 'h11', pool: 'yaoyuan-wai' },
  { id: 'bibi', name: '獙獙 (后山崖顶, 古七)', at: 'h11', pool: 'yaoyuan-wai' },
  { id: 'dangkang', name: '当康 (后山崖顶, 古七)', at: 'h11', pool: 'yaoyuan-wai' },
  { id: 'geju', name: '猲狙 (后山崖顶 · 夜, 古八)', at: 'h09', pool: 'yaoyuan-wai' },
  { id: 'qique', name: '鬿雀 (后山崖顶, 古八)', at: 'h09', pool: 'yaoyuan-wai' },
];
export const keyOf = f => (f.pool ? `${f.id}@${f.pool}` : f.scene ? `${f.id}@${f.scene}` : f.id);

function foeOf(f) {
  // A scene's fight as its exit weighs it (`scene: 'scene/exit'` — the game's `foe`, rules/world.mjs foeOf).
  if (f.scene) {
    const [sid, eid] = f.scene.split('/');
    const game = Object.values(content.chapters).map(ch => ch.scenes?.[sid]).find(Boolean)?.exits.find(e => e.id === eid)?.game;
    return sceneFoe(content, game);
  }
  const c = creatureOf(content, f.id);
  if (!f.pool) return c;
  const entry = Object.values(content.places).map(p => p.pools?.[f.pool]).find(Boolean)?.beasts.find(b => b.creature === f.id);
  return entry ? { ...c, ...(entry.deck ? { deck: entry.deck } : {}), ...(entry.hp ? { hp: entry.hp } : {}), ...(entry.roaming ? { roaming: entry.roaming } : {}) } : c;
}

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
/* The thinking line (trial-sim.mjs lookahead): a careful player, for the report. */
function thoughtOut(setup) {
  const st = begin(setup, catalog);
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    act(st, lookahead(st), 'you');
  }
  return st;
}

/* How the first meeting goes over `seeds` fixed deals: won / lost / ran dry
   (its twelve cards spent), turns, 气血 left on a win, and wins by force.
   `line`: 'careful' (the band's measure) or 'lookahead' (a player who thinks
   a turn ahead). Callable from elsewhere (tools/balance.mjs). */
/* `pills`: the 丹囊 carried in (battle.js § pills) — the pills-allowed player, who uses them as the
   lookahead line finds them worth it. Without, none (Hanli 2026-10-16: never a money wall). */
export const TWO_PILLS = ['mend-pill', 'huiqi-pill'];
export function rateOf(f, seeds = 200, from = 0, line = 'careful', { pills = null, party = null } = {}) {
  // `party`: who stands with him, over the 回's (party.json by_hui) — a pool met alone, or with two.
  const st = stateAt(f.at), foe = party ? { ...foeOf(f), party } : foeOf(f);
  if (pills) { st.bag = { ...st.bag }; for (const id of pills) st.bag[id] = (st.bag[id] ?? 0) + 1; st.pill_pick = [...pills]; } else delete st.pill_pick;
  // A pool's beast is met roaming: its door is a haunt's, and it grows with the party (party.json roaming).
  const setup = fightSetup(content, st, foe, NOW, f.pool ? `haunt:${f.id}` : null);
  let won = 0, lost = 0, turns = 0, left = 0, forced = 0;
  for (let k = from; k < from + seeds; k += 1) {
    const end = (line === 'lookahead' ? thoughtOut : fightOnce)({ ...setup, seed: `band|${k}` });
    if (end.outcome === 'won') { won += 1; left += end.you.hp / end.you.hpMax; if (end.foe.hp <= 0) forced += 1; }
    if (end.outcome === 'lost') lost += 1;
    turns += end.turn;
  }
  return { win: won / seeds, lost: lost / seeds, forced: forced / seeds, withdrew: (seeds - won - lost) / seeds, turns: turns / seeds, left: won ? left / won : 0, deck: setup.you.deck, power: setup.you.power ?? 0, armor: setup.you.armor ?? 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const seeds = Number(args[args.indexOf('--seeds') + 1]) || 300;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  const line = args.includes('--line') ? args[args.indexOf('--line') + 1] : 'lookahead';
  const pills = args.includes('--pills') ? TWO_PILLS : null;
  const rows = FIGHTS.filter(f => !only || only.includes(keyOf(f)) || only.includes(f.id)).map(f => ({ fight: f.name, key: keyOf(f), at: f.at, ...rateOf(f, seeds, 0, line, { pills }) }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) console.log(`${r.fight.padEnd(28)} ${r.at.padEnd(5)} win ${(r.win * 100).toFixed(1).padStart(5)}%  lost ${(r.lost * 100).toFixed(1).padStart(5)}%  dry ${(r.withdrew * 100).toFixed(1).padStart(5)}%  turns ${r.turns.toFixed(1)}  hp left ${(r.left * 100).toFixed(0)}%`);
}
