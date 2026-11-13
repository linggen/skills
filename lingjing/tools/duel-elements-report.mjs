// Build the reproducible Elements appendix from completed measurement files.
import fs from 'node:fs';
const pairs = ['1.5,0.75','1.25,0.9','1.15,0.9','1,1'];
const data = pairs.map(p => JSON.parse(fs.readFileSync(`/tmp/elements-${p}.json`)).rows);
const traces = JSON.parse(fs.readFileSync('/tmp/elements-traces.json')).rows;
const targets = { roaming:65, story:50, room:55, xiong:45, boss:40 };
const names = { roaming:'路上', story:'故事', room:'秘境房间', xiong:'凶兽', boss:'大妖' };
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const sd = a => Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
const fmt = x => x.toFixed(1);
let text = '\n## Elements\n\n同一 65 遭遇、每项 40 个 `band|0…39` 种子；公平规则只在内存开启。四次均为 careful 对原身份线路。标准差为各遭遇胜率的总体标准差，非单局误差；每格 40 局抽样不确定性不容忽略。原倍率与既有 65 行逐行完全一致。\n\n| 倍率（克/受克） | 身份 | 达标/总数 | 均值 | 最低 | 最高 | 标准差 |\n|---|---|---:|---:|---:|---:|---:|\n';
for (let i=0;i<pairs.length;i++) for (const [group,target] of Object.entries(targets)) { const v=data[i].filter(r=>r.group===group).map(r=>r.result.win); text += `| ${pairs[i]} | ${names[group]} | ${v.filter(x=>Math.abs(x-target)<=8).length}/${v.length} | ${fmt(mean(v))} | ${fmt(Math.min(...v))} | ${fmt(Math.max(...v))} | ${fmt(sd(v))} |\n`; }
const road=data[0].filter(r=>r.group==='roaming').sort((a,b)=>a.result.win-b.result.win), extremes=[...road.slice(0,6),...road.slice(-6)];
text += '\n### 原倍率下两端各六个路上遭遇\n\n| 遭遇 | 1.5/0.75 | 1.25/0.9 | 1.15/0.9 | 1/1 |\n|---|---:|---:|---:|---:|\n';
for (const row of extremes) text += `| ${row.name} (${row.key}) | ${data.map(d=>fmt(d.find(r=>r.key===row.key).result.win)).join(' | ')} |\n`;
const baseline=data[0], xs=baseline.map(r=>r.score), ys=baseline.map(r=>r.result.win), corr=mean(xs.map((x,i)=>(x-mean(xs))*(ys[i]-mean(ys))))/(sd(xs)*sd(ys));
text += `\n原倍率根属性相克分数与胜率的 Pearson 相关系数 ${corr.toFixed(3)}；受克 −1（${xs.filter(x=>x===-1).length} 行）均值 ${fmt(mean(baseline.filter(r=>r.score===-1).map(r=>r.result.win)))}%，无克 0（${xs.filter(x=>x===0).length} 行）${fmt(mean(baseline.filter(r=>r.score===0).map(r=>r.result.win)))}%，克制 +1（${xs.filter(x=>x===1).length} 行）${fmt(mean(baseline.filter(r=>r.score===1).map(r=>r.result.win)))}%。这是相关而非因果，根与实际牌的属性也可能不同。\n\n### 仍偏离目标逾 15 点的遭遇\n\n选择 1.15/0.9：全部 65 行总体标准差 ${fmt(sd(data[2].map(r=>r.result.win)))}，小于 1.25/0.9 的 ${fmt(sd(data[1].map(r=>r.result.win)))}。每行复现前 10 种子，记录最常实际打出的敌方牌和 10 局结局；这只是轨迹中可观察的线索，不足以证明哪一张牌决定了结果，也未作移除牌或其他反事实实验。\n\n| 遭遇 | 胜率 | 十局胜/负/未决 | 妖最常打出的牌（十局累计次数） |\n|---|---:|---:|---|\n`;
for (const tr of traces) { const counts={}; for(const game of tr.games) for(const a of game.actions) for(const ev of a.events) if(ev.act==='played' && ev.who==='foe') counts[ev.id]=(counts[ev.id]??0)+1; const cards=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id,n])=>`${tr.foeCards.find(c=>c?.id===id)?.name?.zh??id} ${n}次`).join('、')||'无'; const outcomes=['won','lost','open'].map(x=>tr.games.filter(g=>g.outcome===x).length).join('/'); const win=data[2].find(r=>r.key===tr.key).result.win; text+=`| ${tr.name} (${tr.key}) | ${fmt(win)} | ${outcomes} | ${cards} |\n`; }
text += '\n四种设置的跨全部遭遇标准差依次为 '+data.map(d=>fmt(sd(d.map(r=>r.result.win)))).join('、')+' 点，因此本实验未显示削弱或移除五行能缩小总体离散，不能将差距主要归因于元素。若必须从两个保留五行的候选选择，1.15/0.9 总体标准差较低，但仍高于现行倍率，证据不足以建议正式改动。剩余偏差需要逐遭遇做牌组、等级和行动规则的受控实验；上述牌名仅为追查起点，而不是已证实的成因。\n';
fs.appendFileSync(new URL('../doc/duel-fit-2026-11-13.md', import.meta.url),text);
