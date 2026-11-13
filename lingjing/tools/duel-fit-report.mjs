// Reproducible first-meeting fit report: one process, fixed deals, no content changes.
import fs from 'node:fs';
import { FIGHTS, content, keyOf, standingOf, setupOf, roadState, NOW } from './story-fights.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { fightSetup, fightLevel, beastLevel, lendOf } from '../scripts/rules/cards.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';
import { begin, act, foeStep } from '../scripts/battle.js';
import { carefulFor, plainFor } from '../scripts/fightline.js';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const cost = d => d.reduce((n, id) => n + (catalog[id]?.cost ?? 1), 0);
const names = { roaming: '路上', story: '故事', room: '秘境房间', xiong: '凶兽', boss: '大妖' };
const targets = { roaming: 65, story: 50, room: 55, xiong: 45, boss: 40 };
function encounters() {
  const road = FIGHTS.filter(f => !f.pool?.startsWith('mijing-') && !f.teach && !f.trial && (standingOf(f) || f.scene)).map(f => ({ key: keyOf(f), name: f.name, group: f.pool ? 'roaming' : 'story', state: roadState(f), setup: setupOf(f, { party: [] }) }));
  const dungeon = [];
  for (const tier of content.mijing.tiers.filter(t => t.source?.hui)) {
    for (const [group, entries] of [['room', tier.beasts], ['xiong', tier.xiong], ['boss', [tier.boss]]]) for (const entry of entries ?? []) {
      const creature = { ...creatureOf(content, entry.creature), ...entry, standing: group, levels: tier.levels, party: [] };
      const state = roadState({ at: tier.source.hui });
      dungeon.push({ key: `${entry.creature}@${tier.id}/${group}`, name: `${tier.name.zh}·${creature.name?.zh ?? entry.creature}`, group, state, creature, setup: fightSetup(content, state, creature, NOW) });
    }
  }
  return [...road, ...dungeon].filter(e => e.setup.even);
}
function simulate(setup, line, seeds, lent = 0) {
  let wins = 0, losses = 0, near = 0, plies = 0, unfinished = 0;
  for (let k = 0; k < seeds; k++) {
    const cfg = structuredClone(setup); cfg.you.extra.push(...(lendOf(content, lent)?.cards ?? []));
    const st = begin({ ...cfg, seed: `band|${k}` }, catalog);
    let n = 0;
    while (n < 300 && st.outcome === 'open') {
      n++;
      if (st.whose === 'foe') foeStep(st);
      else if (!act(st, (line === 'plain' ? plainFor : carefulFor)(st, 'you') ?? { kind: 'end' }, 'you').ok) throw Error('illegal move');
    }
    plies += n;
    if (st.outcome === 'won') wins++; else if (st.outcome === 'lost') { losses++; if (st.foe.hp <= st.foe.hpMax * .25) near++; } else unfinished++;
  }
  return { wins, losses, near, plies: plies / seeds, unfinished, win: 100 * wins / seeds, nearPct: losses ? 100 * near / losses : null };
}
const fmt = n => n == null ? '—' : n.toFixed(1);
const off = (v, target, lowOnly = false) => v < target - (lowOnly ? 0 : 8) ? v - target + (lowOnly ? 0 : 8) : !lowOnly && v > target + 8 ? v - target - 8 : 0;
function table(rows, novice = false) {
  return ['| 遭遇（地点/层） | 胜率 % | 险败占败局 % | 平均步数 | 我方/妖牌费 | 妖等级−我 | 超界百分点 |', '|---|---:|---:|---:|---:|---:|---:|', ...rows.map(r => `| ${r.name} (${r.key}, L${r.level}) | ${fmt(r.result.win)} | ${fmt(r.result.nearPct)} | ${fmt(r.result.plies)} | ${r.ownCost}/${r.foeCost} | ${r.delta} | ${off(r.result.win, novice ? 35 : targets[r.group], novice) ? fmt(off(r.result.win, novice ? 35 : targets[r.group], novice)) : '达标'} |`)].join('\n');
}
function main(seeds) { return withRules(true, () => {
  const encountersList = encounters();
  const rows = encountersList.map((e, i) => {
    const level = fightLevel(content, e.state), foeL = e.creature ? beastLevel(content, e.state, e.creature) : e.setup.foe.hp_fixed - content.balance.duel_hp.base;
    const row = { key: e.key, name: e.name, group: e.group, level, delta: foeL - level, ownCost: cost(e.setup.you.deck), foeCost: cost(e.setup.foe.deck), result: simulate(e.setup, 'careful', seeds) };
    if (e.group === 'roaming' && level <= 5) row.novice = simulate(e.setup, 'plain', seeds);
    if (['xiong', 'boss'].includes(e.group)) row.lend = [row.result, ...[1, 2, 3].map(n => simulate(e.setup, 'careful', seeds, n))];
    console.error(`${i + 1}/${encountersList.length} ${e.key} ${row.result.win}%`); return row;
  });
  return { seeds, rows };
}, FIT); }
function report(data) {
  const rows = data.rows, groups = Object.keys(names), summaries = groups.map(g => { const rs = rows.filter(r => r.group === g), vals = rs.map(r => r.result.win); return { g, n: rs.length, inBand: rs.filter(r => !off(r.result.win, targets[g])).length, mean: vals.reduce((a,b) => a+b,0)/vals.length, min: Math.min(...vals), max: Math.max(...vals) }; });
  const lends = rows.filter(r => r.lend); const rung = [1,2,3].map(i => lends.reduce((s,r)=>s+r.lend[i].win-r.lend[i-1].win,0)/lends.length);
  const out = rows.filter(r=>off(r.result.win, targets[r.group])).sort((a,b)=>Math.abs(off(b.result.win,targets[b.group]))-Math.abs(off(a.result.win,targets[a.group])));
  const propose = r => { const d = off(r.result.win, targets[r.group]); const levels = Math.ceil(Math.abs(d)/2.5); const available = d > 0 ? 9 - ((r.level + r.delta - 1) % 9) - 1 : (r.level + r.delta - 1) % 9; if (levels > available) return `优先测妖牌费${d > 0 ? '提高' : '降低'}（现为我方的 ${fmt(100*r.foeCost/r.ownCost)}%；目标比例和最小改动尚不可推断）；等级估算需${levels}层，超出本境界可用 ${available} 层`; return `妖等级${d > 0 ? '+' : '−'}${levels}（按每层 2.5 点乐观估计，须复测）`; };
  let text = `# 斗法适配测量 · 2026-11-13\n\n${data.seeds} 个固定种子/遭遇；按首次遭遇的等级和存档默认牌、装备，单人、不带丹。公平规则仅在进程内开启；妖的真实牌组按现有 fit 的预算规则选成十张，并非原始十二张。路上、故事和房间用 foe，凶兽、大妖用 careful；未改牌或等级。每步为一次行动或敌方一步；300 步未决单列。每个胜率样本仅 ${data.seeds} 局，误差较大。\n\n## 摘要\n\n| 身份 | 达标/总数 | 平均 % | 最低 % | 最高 % |\n|---|---:|---:|---:|---:|\n${summaries.map(s=>`| ${names[s.g]} | ${s.inBand}/${s.n} | ${fmt(s.mean)} | ${fmt(s.min)} | ${fmt(s.max)} |`).join('\n')}\n\n借牌每一级的平均增益：${rung.map((x,i)=>`${i+1}级 ${fmt(x)} 点`).join('；')}。最偏离前三：${out.slice(0,3).map(r=>`${r.name} ${fmt(off(r.result.win,targets[r.group]))} 点`).join('；')}。\n\n`;
  for (const g of groups) text += `## ${names[g]}（目标 ${targets[g]} ± 8）\n\n${table(rows.filter(r=>r.group===g))}\n\n`;
  const novice = rows.filter(r=>r.novice).map(r=>({...r,result:r.novice}));
  text += `## 新手：练气五层及以下路上（最低 35%）\n\n${table(novice,true)}\n\n## 借牌阶梯\n\n零至三级按游戏 lendOf：无；嚎叫；嚎叫+扑击；嚎叫+扑击+狐裘（无 lesson）。狐火是 lesson 分支而非默认三级；按 extra 置于起手，不混入牌堆。\n\n| 遭遇 | 0 | 1 | 2 | 3 | 1级增益 | 2级增益 | 3级增益 |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${lends.map(r=>`| ${r.name} (${r.key}) | ${r.lend.map(x=>fmt(x.win)).join(' | ')} | ${[1,2,3].map(i=>fmt(r.lend[i].win-r.lend[i-1].win)).join(' | ')} |`).join('\n')}\n\n## 超界提案（仅估算，未应用）\n\n胜率高于区间则提高妖等级，反之降低；按每层 1–2.5 点估计，选达到区间所需的乐观最少层数；超出本境界时改为建议先测牌费。不保证线性或真为全选项最小；先后手及牌费对胜率未测，无法诚实确定目标牌费比例或最小变动。丈原凶兽老井和大妖双龙带试炼标记，公平规则不适用，未纳入；雷泽、九鼎尚无故事首次遭遇层级，不作虚构。\n\n| 遭遇 | 超界百分点 | 候选改动 |\n|---|---:|---|\n${out.map(r=>`| ${r.name} (${r.key}) | ${fmt(off(r.result.win,targets[r.group]))} | ${propose(r)} |`).join('\n')}\n\n未决局：${rows.reduce((n,r)=>n+r.result.unfinished+(r.novice?.unfinished??0)+(r.lend?.slice(1).reduce((s,x)=>s+x.unfinished,0)??0),0)}。\n`;
  fs.writeFileSync(new URL('../doc/duel-fit-2026-11-13.md', import.meta.url),text); return { summaries, rung, worst: out.slice(0,3).map(r=>({name:r.name,off:off(r.result.win,targets[r.group]),proposal:propose(r)})), novice: novice.sort((a,b)=>a.result.win-b.result.win).slice(0,5).map(r=>({name:r.name,win:r.result.win})), count: rows.length };
}
if (import.meta.url === `file://${process.argv[1]}`) { const i=process.argv.indexOf('--seeds'), seeds=i<0?40:Number(process.argv[i+1]); if (!Number.isInteger(seeds)||seeds<1) throw Error('invalid seeds'); const load=process.argv.indexOf('--from-json'); const data=load<0?main(seeds):JSON.parse(fs.readFileSync(process.argv[load+1], 'utf8')); if (load<0) fs.writeFileSync('/tmp/duel-fit-2026-11-13.json',JSON.stringify(data,null,2)+'\n'); console.log(JSON.stringify(report(data),null,2)); }
