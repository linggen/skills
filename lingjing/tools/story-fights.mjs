// story-fights.mjs — every fight of 卷一, weighed the FIRST time a player meets
// it, with the realm, hand and gear the road gives at that point (Hanli,
// 2026-10-15: 都太简单了 — a first meeting should be won about 60% of the time;
// a careful player wins reliably, a careless one loses).
//
//   node tools/story-fights.mjs [--seeds N] [--only id,id] [--line careful|lookahead] [--json]
//
// The player is tools/trial-sim.mjs `fightOnce`: a one-ply greedy line that
// weighs every legal move by what it leaves on the board (foe 气血 ×2, own
// 气血, both ranks) and takes the best while it is worth anything. It does not
// read the beast's intent or plan around its 杀招 — a sensible player, not a
// perfect one. tests/fight-band.test.mjs locks the band with fixed seeds.
//
// Where the road stands at each 回 (ladder.json caps.hui; the scenes' grants):
//   h04  练气零层 · before the root test 蠪侄 is fought with the rootless starter;
//        once rooted (00-hall) the starter of all five roots, and the 灰袍 (grey-robe).
//   h05  练气一层 · + the card from 蠪侄.          (+ 狰 once tamed at the 药园)
//   h07  练气二层 · + 狰, the card from 狰; the 凶崖's 犰狳 on the stair down, 蛫
//        (wm-wangzuo), then 邹青松 (wm-xirang) and the 暗河 past the 石室, with
//        蛫's card and its 踏马符 in the bag.
//   h08  练气四层 · + 邹青松's card, the 短刀 worn (wm-xirang grant); the 大比 in order.
//   h11  练气五层 · + 马小宝's card (祁长松 is lost), 火柴 worn (09-snow) — 灵草谷's 犰狳 (09-lingcao);
//   h11b 练气六层 · + the 犰狳's card — 秦雁 on the 崖顶 (09-futian).
//   h10  筑基一层 · the same hand at 筑基 — 冰夷双龙, the 冀 pools, 泗水's 蛫.
// Gear worn as soon as it is had (a sensible player puts on what he is given).
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { winCard } from '../scripts/rules/cards.mjs';
import { creatureOf, foeOf as sceneFoe } from '../scripts/rules/world.mjs';
import { act, begin, foeTurn } from '../scripts/battle.js';
import { fightOnce, lookahead } from './trial-sim.mjs';

export const content = loadContent();
const NOW = new Date('2026-09-29T11:00:00Z');
const base = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/saves/waimen.json', import.meta.url), 'utf8'));
const ALL = ['metal', 'wood', 'water', 'fire', 'earth'];

/* The road, step by step: each stop names its realm, what has been won before
   it (each win deals one card, rules/cards.mjs winCard), and what is worn or held. */
const STOPS = {
  h04r: { tier: 'qi', step: 0, rootless: true, won: [] },
  h04: { tier: 'qi', step: 0, won: [], wear: { robe: 'grey-robe' } },
  h05: { tier: 'qi', step: 1, won: ['longzhi'], wear: { robe: 'grey-robe' } },
  h07: { tier: 'qi', step: 2, won: ['longzhi', 'zheng'], cast: ['zheng'], wear: { robe: 'grey-robe' } },
  h07z: { tier: 'qi', step: 3, won: ['longzhi', 'zheng', 'gui'], cast: ['zheng'], wear: { robe: 'grey-robe' }, bag: { 'tama-fu': 1 } },
  h08: { tier: 'qi', step: 4, won: ['longzhi', 'zheng', 'gui', 'foe-zou'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' } },
  h08b: { tier: 'qi', step: 4, won: ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' } },
  h08c: { tier: 'qi', step: 4, won: ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'duan-dao' } },
  h11: { tier: 'qi', step: 5, won: ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie', 'foe-maxiaobao'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' } },
  h11b: { tier: 'qi', step: 6, won: ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie', 'foe-maxiaobao', 'qiuyu'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' } },
  h10: { tier: 'foundation', step: 1, won: ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie', 'foe-maxiaobao'], cast: ['zheng'], wear: { robe: 'grey-robe', weapon: 'huochai-jian' } },
};

export function stateAt(stop) {
  const at = STOPS[stop];
  const s = structuredClone(base);
  Object.assign(s, { tier: at.tier, step: at.step, traits: at.rootless ? [] : ALL, cast: [...(at.cast ?? [])], wear: { ...(at.wear ?? {}) }, bag: { ...(s.bag ?? {}), ...(at.bag ?? {}), ...Object.fromEntries(Object.values(at.wear ?? {}).map(id => [id, 1])) } });
  delete s.cards;
  if (!at.rootless) {
    s.cards = [...content.cards.starter, ...(at.cast ?? [])];
    at.won.forEach((c, i) => winCard(content, s, creatureOf(content, c), new Date(NOW.getTime() - (at.won.length - i) * 86400000)));
  }
  return s;
}

/* Every fight of 卷一, at its first meeting. `pool` names the stretch whose
   entry deck stands over the creature's own; `reach: false` is a beast of the
   book that is not yet a game fight. `band` is what it is tuned to. */
export const FIGHTS = [
  { id: 'longzhi', name: '蠪侄 (三试)', at: 'h04r', band: [0.62, 0.88], note: 'tutorial' },
  { id: 'zheng', name: '小狰 (药园)', at: 'h05', band: [0.62, 0.88], note: 'tutorial' },
  { id: 'gui', name: '蛫 (秘境)', at: 'h07' },
  { id: 'foe-zou', name: '邹青松 (试 · 追)', at: 'h07z', trial: true, unforced: true },
  { id: 'foe-lufang', name: '卢方 (大比)', at: 'h08' },
  { id: 'foe-shijie', name: '秦雁 (试 · 三十招)', at: 'h08b', trial: true, unforced: true },
  { id: 'foe-maxiaobao', name: '马小宝 (大比)', at: 'h08c' },
  { id: 'qiuyu', name: '犰狳 (灵草谷)', at: 'h11', scene: '09-lingcao/fight' },
  { id: 'foe-shijie', name: '秦雁 (崖顶 · 试)', at: 'h11b', scene: '09-futian/spar', trial: true, unforced: true },
  { id: 'foe-shuanglong', name: '冰夷双龙 (试)', at: 'h10', trial: true },
  { id: 'qiuyu', name: '犰狳 (秘境 凶崖, guards the way)', at: 'h07', pool: 'mijing-ya' },
  { id: 'heyu', name: '合窳 (秘境 暗河)', at: 'h07z', pool: 'mijing-anhe' },
  { id: 'qiuyu', name: '犰狳 (秘境 暗河)', at: 'h07z', pool: 'mijing-anhe' },
  { id: 'yezhu', name: '野猪 (蒙山)', at: 'h04', pool: 'mengshan' },
  { id: 'lang', name: '狼 (蒙山)', at: 'h04', pool: 'mengshan' },
  { id: 'xiong', name: '熊 (蒙山)', at: 'h04', pool: 'mengshan' },
  { id: 'longzhi', name: '蠪侄 (林子 pool)', at: 'h04', pool: 'songlin' },
  { id: 'zheng', name: '狰 (药园外 pool)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'yezhu', name: '野猪 (后山崖顶 pool)', at: 'h05', pool: 'yaoyuan-wai' },
  { id: 'lang', name: '狼 (林子 pool)', at: 'h04', pool: 'songlin' },
  { id: 'gui', name: '蛫 (泗水 pool)', at: 'h10', pool: 'sishui' },
  { id: 'tianma', name: '天马 (太行)', at: 'h10', pool: 'taihang' },
  { id: 'linghu', name: '领胡 (太行)', at: 'h10', pool: 'taihang' },
  { id: 'renyu', name: '人鱼 (柳湾)', at: 'h10', pool: 'liuwan' },
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
  return entry ? { ...c, ...(entry.deck ? { deck: entry.deck } : {}), ...(entry.hp ? { hp: entry.hp } : {}) } : c;
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
export function rateOf(f, seeds = 200, from = 0, line = 'careful') {
  const st = stateAt(f.at), foe = foeOf(f);
  const setup = fightSetup(content, st, foe, NOW);
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
  const line = args.includes('--line') ? args[args.indexOf('--line') + 1] : 'careful';
  const rows = FIGHTS.filter(f => !only || only.includes(keyOf(f)) || only.includes(f.id)).map(f => ({ fight: f.name, key: keyOf(f), at: f.at, ...rateOf(f, seeds, 0, line) }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) console.log(`${r.fight.padEnd(28)} ${r.at.padEnd(5)} win ${(r.win * 100).toFixed(1).padStart(5)}%  lost ${(r.lost * 100).toFixed(1).padStart(5)}%  dry ${(r.withdrew * 100).toFixed(1).padStart(5)}%  turns ${r.turns.toFixed(1)}  hp left ${(r.left * 100).toFixed(0)}%`);
}
