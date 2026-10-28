// 主力 is the story's main content (Hanli 10-28: 「我看还不是以主力游戏为主啊」 · 「这个华容道有点多了」 · 「尽力让主力游戏多吧, 除非剧情需要其他类型」).
// Every board of a 古 回 (第一…第九回) is 主力 (a 兽潮 塔防 kit, 格斗, 抚琴, 太鼓) unless the story calls for another kind — a
// conversation, a riddle the plot turns on, a game the passage plays — and each such board is listed here with its reason
// (the same list stands in doc/zhuli-placement-2026-10-28.md). At most one 华容道 a 回. The 塔防 levels the swap added
// (`zl-<task>`, one per board, in the kits' level tables) are checked here: a layout of their own, bot-proved, in the
// scene that shows their task, with only the beasts the book has met and, before 入门, no talismans.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sim as sqSim, BOTS as sqBots, withRoots } from '../scripts/games/shouqiang/core.js';
import { sim as slSim } from '../scripts/games/shoulu/core.js';
import { sim as sdSim, humanBot, BOTS as sdBots } from '../scripts/games/sadoushou/core.js';

const ROOT = new URL('..', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, ROOT), 'utf8'));
const rhythm = read('worlds/jiuding/levels/rhythm.json');
const reg = read('worlds/jiuding/games.json');
const creatures = read('worlds/jiuding/creatures.json').creatures;
const HUI = read('story/jiuding-lu/book.json').volumes.flatMap((v) => v.hui).map((h) => h.id);
const kits = { shouqiang: read('worlds/jiuding/levels/shouqiang.json'), sadoushou: read('worlds/jiuding/levels/sadoushou.json'), shoulu: reg.games.find((g) => g.id === 'shoulu' && g.levels) };
const tasks = new Map();
for (const f of fs.readdirSync(new URL('worlds/jiuding/tasks/', ROOT))) for (const t of read(`worlds/jiuding/tasks/${f}`).tasks) tasks.set(t.id, t);
const scenes = new Map();
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.includes('/scenes/') && p.endsWith('.json')) { const s = JSON.parse(fs.readFileSync(p, 'utf8')); scenes.set(s.id, s); } } })(new URL('worlds/jiuding/chapters/', ROOT).pathname);

/* The boards a 古 回 keeps that are not 主力, each with the story's reason. A conversation (对话) is the scene itself and needs none. */
const KEPT = {
  'rain-basins': '第一回: 十七个盆接雨水 — the passage\'s own action; Hanli kept it 10-21',
  'bread-share': '第一回: 喂饼 — the flatbread broken down to the fox; Hanli kept it 10-21',
  'deer-wind': '第二回: 射鹿 — the bow and the wind are the passage (Hanli: 「射鹿可以用砸寨代替」)',
  'sleep-xisui': '第二回: 洗髓 — one of the two 调息 Hanli kept (10-27)',
  'gate-crowd': '第三回: 人堆 — the crowd to slip to the back of; the 回\'s one 华容道',
  'gate-luoshu': '第三回: 洛书 — 娘\'s nine chestnuts, the riddle the second trial turns on',
  'diyilu-tama': '第四回: 一根银毛 — the 饭桶\'s own pot, the book\'s fixed 开炉 (Hanli 10-28: 「应该安排一个饭桶的剧情固定游戏」)',
  'dianmao-jingtai': '第四回: 井台 — the 回\'s one 华容道 (the water carriers at the well)',
  'mijing-zhenyan': '第五回: 困阵 — 「前人留下的一盘棋」, a game of the passage itself',
  'kouzi-crowd': '第五回: 七八个口子 — the crowd on the riverbank; the 回\'s one 华容道',
  'qianye-qiajue': '第六回: 讲堂试法 — the 结印 teaching beat; its grades are the marks the dock\'s moves wait on',
  'jiaxin-letter': '第六回: 家信 — the picture drawn for 娘 is the passage',
  'jiuge-yubu': '第七回: 禹步 — 瞿老: 「照着我的脚，走一遍」',
  'futian-suifeng': '第七回: 随风那一式 — walked on the clifftop over and over, as the passage says',
  'yishui-reed': '第七回: 芦苇里那一等 — the throw on 浮木, its stars mark the reed (reed-still · reed-hasty)',
  'dingfeng-kunzhen': '第八回: 七块碎灵石 — the 回\'s one 华容道',
  'dingfeng-songzhi': '第八回: 一剑出去 — 瞿老\'s cliff, the steps the sword goes by',
  'shijie-tiandan': '第八回: 恬惔虚无 — the second 调息 Hanli kept; 「真气从之」 is the passage',
};
const CHAT = new Set(['对话']);

/* The 今 line (沈芒's modern interludes, 今一 … 今四): the same rule (Hanli 10-28: 「今线也用主力」), but a 今 board is 主力 only where the scene can
   frame it — someone on a phone (the hospital bed), music playing, a run, an arcade. 几何冲刺 is a 主力 kit (a \`main\` row of its own: 「踏马符的
   几何dash也好玩」), so a 今 board of the laps and breaths is 主力 as it stands. What stays is the passage's own action, each with its reason; a 对话
   (妈's video call, 六一七's group, 阿禾's typing …) is the scene itself. No 今 scene has an arcade, a band or a judo class. */
const KEPT_JIN = {
  'jin-toulan': '今一: 投一个给我看看 — 阿禾\'s line at the stall, the ball over the rim onto 马小宝\'s shaker; the shot is the passage',
  'jin-biedou': '今一: 皮褶卡钳 — the three pinches in the equipment room; no phone, music or run to frame a game',
  'jin-qiu': '今二: 捡球递水 — fifty-seven minutes of chores at the end of the bench; he is working, not playing',
  'jin-whiteline': '今二: 投篮 · 白线上 — the empty gym, the white line: the free throws are the 今 line\'s spine',
  'jin-zhizhen': '今三: 纸垫 — 严老师\'s needle practice; the class itself',
  'jin-hongshu': '今四: 红薯 · 篮下 — the stray dog under the basket in the cold; the passage\'s own action',
  'jin-ting': '今四: 冬至夜 · 先听 — the night after the ambulance, listening to his own pulse in the dark; a game here is wrong in tone',
};
const JIN_ZHULI = {
  'jin-yiquan': '今一: 那一圈 — the 1000 m lap, a run (几何冲刺)',
  'jin-jingluo': '今一: 十二正经 — 「一条，绕着人跑三圈」, the channels run (几何冲刺)',
  'jin-wotui': '今二: 卧推 — the out-breath on the push, five reps (几何冲刺)',
  'jin-xisi': '今二: 吸四吐六 — the breath that runs the channel (几何冲刺)',
  'jin-danjiao': '今三: 闭眼单脚站 — the balance walked straight (几何冲刺)',
  'jin-chenmai': '今三: 十七床 · 手机里那一局 — the hospital bed, the phone on his chest (守炉)',
  'jin-shouhuan': '今四: 手环 · 吸四吐六 — the heart brought down (几何冲刺)',
  'jin-lastshot': '今四: 最后一罚 — the run to the line (几何冲刺)',
};
const FLOOR = { '第一回': 0.5, '第二回': 0.5, '第三回': 0.5, '第四回': 0.7, '第五回': 0.5, '第六回': 0.46, '第七回': 0.7, '第八回': 0.65, '第九回': 0.5 };

const huis = rhythm.chapters.flatMap((c) => c.huis).filter((h) => /^第.回$/.test(h.label.zh));
const jinHuis = rhythm.chapters.flatMap((c) => c.huis).filter((h) => /^今/.test(h.label.zh));
const boardsOf = (h) => h.items.filter((i) => i.kind === 'board');

test('a 古 回\'s boards are 主力 unless the story calls for another kind; each kept one has its reason', () => {
  const left = [];
  for (const h of huis) for (const b of boardsOf(h)) if (!b.zhuli && !CHAT.has(b.mechanic) && !KEPT[b.id]) left.push(`${h.label.zh} ${b.id} (${b.game})`);
  assert.deepEqual(left, [], 'a non-主力 board without a reason: swap it for a 主力 level or list it in KEPT');
  const seen = new Set(huis.flatMap((h) => boardsOf(h).filter((b) => !b.zhuli).map((b) => b.id)));
  assert.deepEqual(Object.keys(KEPT).filter((k) => !seen.has(k)), [], 'a kept board that is 主力 now (or gone): drop it from KEPT');
});

test('主力 is the main content of every 古 回, and a 回 plays at most one 华容道', () => {
  for (const h of huis) {
    const bs = boardsOf(h), z = bs.filter((b) => b.zhuli).length;
    assert.ok(z / bs.length >= FLOOR[h.label.zh], `${h.label.zh}: ${z}/${bs.length} 主力`);
    assert.ok(bs.filter((b) => b.game === 'huarong').length <= 1, `${h.label.zh}: more than one 华容道`);
  }
});

test('a 今 回: every non-chat board is 主力 or listed with the passage\'s reason, and half of them or more are 主力', () => {
  assert.equal(jinHuis.length, 4);
  const left = [];
  for (const h of jinHuis) {
    for (const b of boardsOf(h)) if (!b.zhuli && !CHAT.has(b.mechanic) && !KEPT_JIN[b.id]) left.push(`${h.label.zh} ${b.id} (${b.game})`);
    const play = boardsOf(h).filter((b) => !CHAT.has(b.mechanic)), z = play.filter((b) => b.zhuli);
    assert.ok(z.length * 2 >= play.length, `${h.label.zh}: ${z.length}/${play.length} 主力`);
  }
  assert.deepEqual(left, [], 'a non-主力 今 board without a reason: make it 主力 or list it in KEPT_JIN');
  const all = jinHuis.flatMap(boardsOf);
  assert.deepEqual(Object.keys(KEPT_JIN).filter((k) => !all.some((b) => b.id === k && !b.zhuli)), [], 'a kept 今 board that is 主力 now (or gone): drop it from KEPT_JIN');
  assert.deepEqual(Object.keys(JIN_ZHULI).filter((k) => !all.find((b) => b.id === k)?.zhuli), [], 'a listed 今 主力 board that is not 主力');
  assert.deepEqual(all.filter((b) => b.zhuli).map((b) => b.id).filter((k) => !JIN_ZHULI[k]), [], 'a 今 主力 board without a line in JIN_ZHULI');
});

test('几何冲刺 is a 主力 kit: a main row of its own, and the story\'s dash boards read as 主力', () => {
  const kit = reg.games.find((g) => g.id === 'dash' && g.group === 'main' && !g.task && !g.replaced);
  assert.ok(kit, 'the kit\'s tile');
  const dash = huis.concat(jinHuis).flatMap(boardsOf).filter((b) => b.game === 'dash');
  assert.ok(dash.length >= 9);
  assert.deepEqual(dash.filter((b) => !b.zhuli).map((b) => b.id), []);
});

test('the phone game on bed seventeen: the 今三 board is a 守炉 level that names the phone, the scene waits on it', () => {
  const t = tasks.get('jin-chenmai'), row = rowOf(t);
  assert.equal(t.game, 'shoulu');
  assert.equal(row.story, 'j07-chenmai');
  assert.match(row.lead[0].zh, /手机/);
  assert.match(t.how.zh, /手机/);
  const sc = scenes.get('j07-chenmai');
  assert.ok(sc.exits.some((e) => e.needs?.task === 'jin-chenmai' && /手机/.test(e.refuse.zh)));
});

/* The levels the swap added. */
const swapped = [...tasks.values()].filter((t) => t.deal?.lv?.startsWith?.('zl-'));
const rowOf = (t) => (t.game === 'shoulu' ? kits.shoulu.levels : kits[t.game].levels).find((l) => l.id === t.deal.lv);
const SEEDS = 10;

test('each swapped board deals a level of its own: in its scene, a games.json row opens it, one layout apiece', () => {
  assert.ok(swapped.length >= 60, `${swapped.length} swapped boards`);
  const seen = new Set();
  for (const t of swapped) {
    const row = rowOf(t);
    assert.ok(row, `${t.id}: its level ${t.deal.lv}`);
    assert.ok(['shoulu', 'shouqiang', 'sadoushou'].includes(t.game));
    const sc = scenes.get(row.story);
    assert.ok(sc?.show?.some((c) => c.card === 'board' && c.id === t.id) && sc.offers?.tasks?.includes(t.id), `${t.id}: ${row.story} shows and offers it`);
    const arcade = reg.games.find((g) => g.task === t.id && !g.replaced);
    assert.ok(arcade && arcade.id === t.game && arcade.scene === row.story && arcade.data?.lv === row.id, `${t.id}: the 游戏厅's row opens it by id`);
    assert.ok(row.tide == null && !row.realm, `${row.id}: off the 兽潮 and the 秘境`);
    const key = JSON.stringify([t.game, row.road ?? row.paths ?? row.belt?.lines ?? null, row.waves]);
    assert.ok(!seen.has(key), `${row.id}: a layout already dealt`);
    seen.add(key);
  }
  // the kits keep their story rows after the ladder
  for (const kit of ['shouqiang', 'sadoushou']) {
    const ls = kits[kit].levels, firstStory = ls.findIndex((l) => l.story);
    assert.ok(ls.slice(firstStory).every((l) => l.story), `${kit}: story rows stand after the ladder`);
  }
});

test('a swapped level plays only beasts the book has met, and before 入门 lays no talismans', () => {
  const met = (beast, hui) => { const c = creatures.find((x) => x.id === beast); return Boolean(c?.hui) && HUI.indexOf(c.hui) <= HUI.indexOf(hui); };
  for (const t of swapped) {
    const row = rowOf(t), hui = scenes.get(row.story).hui, pre = HUI.indexOf(hui) < HUI.indexOf('h05');
    const beasts = new Set((row.waves ?? []).flatMap((w) => (Array.isArray(w) ? w : w.beasts ?? []).flatMap((g) => (Array.isArray(g[0]) ? g.map((x) => x[0]) : [g[0]]))));
    assert.ok(beasts.size > 0, `${row.id}: its beasts are read`);
    for (const b of beasts) if (typeof b === 'string') {
      assert.ok(met(b, hui), `${row.id}: ${b} is met by ${hui}`);
      if (b === 'zheng') assert.ok(HUI.indexOf(hui) > HUI.indexOf('h05'), `${row.id}: no 狰 fought in 古四`);
    }
    if (pre) {
      assert.notEqual(t.game, 'shouqiang', `${row.id}: 守墙关's talismans are after 入门`);
      if (t.game === 'shoulu') assert.ok(row.towers.every((k) => row.skin?.[k]), `${row.id}: every tower skinned before 入门`);
      if (t.game === 'sadoushou') assert.equal(row.jieyin, false, `${row.id}: no 结印 before the lesson`);
    }
  }
});

test('every swapped level is won by the human-like hand on most plays and not by one who does nothing (bot-proved)', () => {
  const sq = withRoots(kits.shouqiang, creatures);
  for (const t of swapped) {
    const row = rowOf(t);
    let won = 0, idle = 0;
    for (let i = 0; i < SEEDS; i += 1) {
      const seed = `lock|${i}`;
      if (t.game === 'shouqiang') { won += sqSim(sq, row, sqBots.human, { seed }).won ? 1 : 0; if (i < 3) idle += sqSim(sq, row, sqBots.lazy, { seed }).won ? 1 : 0; }
      else if (t.game === 'shoulu') { const r = { globalDifficulty: kits.shoulu.difficulty ?? 1, ...row }; won += slSim(r, 'human', { seed }).result === 'win' ? 1 : 0; if (i < 3) idle += slSim(r, 'none', { seed }).result === 'win' ? 1 : 0; }
      else { won += sdSim(kits.sadoushou, row, humanBot(seed), { seed, casts: false }).won ? 1 : 0; if (i < 3) idle += sdSim(kits.sadoushou, row, sdBots.idle, { seed }).won ? 1 : 0; }
    }
    assert.ok(won >= 8, `${row.id}: the human hand won ${won}/${SEEDS}`);
    assert.equal(idle, 0, `${row.id}: doing nothing wins`);
  }
});
