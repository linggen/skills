// Fair-duel card value: heuristic accounting, not an estimate of realised damage.
import fs from 'node:fs';
import { content } from './story-fights.mjs';
import { encounters } from './duel-fit-report.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { begin, act, foeStep, effectOf, bodyOf, costOf, keywordsOf } from '../scripts/battle.js';
import { carefulFor } from '../scripts/fightline.js';
const cards = content.cards.cards, catalog = Object.fromEntries(cards.map(c => [c.id,c]));
const collectible = c => !c.owner && !c._token && !c.gear && !c.lent && (c.from?.some(f => ['beast','story','task','tame','shop','tale','beat'].includes(f.kind)) || content.cards._legacy_starter?.includes(c.id));
// Conditional estimates: rally/turnRally two bodies; chain/hold 2; poison 3;
// swallow 4; drain/mana 1 per point; dodge 2; drought two targets once;
// furWard 2; bite 0 (modifier to damage); summon token's body and taunt.
function value(c, side = {}) {
  const e = effectOf(side,c) ?? {}, b = bodyOf(side,c), kw = keywordsOf(side,c);
  const summon = e.summon ? (() => { const t=catalog[e.summon.id]; return t ? (e.summon.n ?? 1)*((t.atk??0)+(t.hp??0)+(t.keywords?.includes('taunt')?1:0)) : 0; })() : 0;
  const effect = (e.damage??0)+2*(e.sweep??0)+.5*(e.heal??0)+.5*(e.armor??0)+1.5*(e.draw??0)+(e.buff?.atk??0)+(e.buff?.hp??0)+2*((e.rally?.atk??0)+(e.rally?.hp??0))+summon+(e.chain!=null?2:0)+(e.hold!=null?2:0)+(e.poison!=null?3:0)+(e.swallow!=null?4:0)+(e.drain??0)+(e.mana??0)+2*(e.dodge??0)+2*(e.drought??0)+2*(e.furWard??0)+2*(e.turnRally??0)+(kw.includes('taunt')?1:0);
  return { cost:costOf(side,c), body:c.kind==='minion'?b.atk+b.hp:0, effect, total:(c.kind==='minion'?b.atk+b.hp:0)+effect, damage:(e.damage??0)+2*(e.sweep??0) };
}
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
const corr = (x,y) => { const a=mean(x),b=mean(y),cov=x.reduce((s,v,i)=>s+(v-a)*(y[i]-b),0),den=Math.sqrt(x.reduce((s,v)=>s+(v-a)**2,0)*y.reduce((s,v)=>s+(v-b)**2,0)); return den?cov/den:null; };
const pool=cards.filter(collectible), costs=pool.map(c=>value(c).cost), vals=pool.map(c=>value(c).total), mx=mean(costs),my=mean(vals), a=costs.reduce((s,x,i)=>s+(x-mx)*(vals[i]-my),0)/costs.reduce((s,x)=>s+(x-mx)**2,0), b=my-a*mx;
function owner(c) { return {collectible:collectible(c), sources:(c.from??[]).filter(f=>f.creature).map(f=>f.creature), owner:c.owner??null, token:!!c._token,lent:!!c.lent}; }
const cardRows=cards.map(c=>{const v=value(c);return {id:c.id,name:c.name.zh,...owner(c),...v,surplus:v.total-a*v.cost-b};});
function deck(ids,side) { const vs=ids.map(id=>value(catalog[id],side)); return {cards:ids,cost:vs.reduce((s,v)=>s+v.cost,0),value:vs.reduce((s,v)=>s+v.total,0),surplus:vs.reduce((s,v)=>s+v.total-a*v.cost-b,0),bodies:ids.filter(id=>catalog[id].kind==='minion').length,damage:vs.reduce((s,v)=>s+v.damage,0),curve:[1,2,3,4].map(n=>vs.filter(v=>n===4?v.cost>=4:v.cost===n).length)}; }
function fit(x,y) { const r=corr(x,y); return {r,r2:r==null?null:r*r}; }
function pairFit(x,z,y) {const r=corr(x,y),s=corr(z,y),t=corr(x,z);return r==null||s==null||t==null||Math.abs(t)>=.999999?null:(r*r+s*s-2*r*s*t)/(1-t*t);}
const raw=fs.readFileSync(process.argv[2]??'/tmp/elements-1.5,0.75.json','utf8'), baseline=JSON.parse(raw).rows;
const neutral=JSON.parse(fs.readFileSync(process.argv[3]??'/tmp/elements-1,1.json','utf8')).rows;
const data=withRules(true,()=>encounters().map(e=>{const st=begin({...structuredClone(e.setup),seed:'valuation'},catalog), own=deck(e.setup.you.deck,st.you), foe=deck(e.setup.foe.deck,st.foe); const base=baseline.find(x=>x.key===e.key), no=neutral.find(x=>x.key===e.key); if(!base||!no)throw Error(`missing ${e.key}`); return {key:e.key,name:e.name,group:e.group,own,foe,power:st.foe.powerHit,signature:st.foe.signature,win:base.result.win,neutral:no.result.win};}),FIT);
const features={surplus:r=>r.foe.surplus-r.own.surplus,value:r=>r.foe.value-r.own.value,bodies:r=>r.foe.bodies,cheap:r=>r.foe.curve[0]+r.foe.curve[1],power:r=>r.power};
const stats={}; for(const outcome of ['win','neutral']) {const y=data.map(r=>r[outcome]);const singles=Object.fromEntries(Object.entries(features).map(([k,f])=>[k,fit(data.map(f),y)]));let best=null;const keys=Object.keys(features);for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){const r2=pairFit(data.map(features[keys[i]]),data.map(features[keys[j]]),y);if(r2!=null&&(!best||r2>best.r2))best={pair:[keys[i],keys[j]],r2};}stats[outcome]={singles,best};}
function experiment(e,seeds=40){
 const clone={...catalog}, cfg=structuredClone(e.setup), side=begin({...structuredClone(cfg),seed:'valuation'},catalog).foe, patches=[];
 cfg.foe.deck=cfg.foe.deck.map(id=>{const c=catalog[id];if(c.kind!=='minion')return id;const key=`__foe_${id}`;if(!clone[key]){const v=value(c,side), target=a*v.cost+b-v.effect, total=Math.max(2,Math.round(target));const body=bodyOf(side,c);const atk=Math.max(1,Math.min(total-1,Math.round(total*body.atk/(body.atk+body.hp))));const hp=total-atk;clone[key]={...c,id:key,atk:atk-(side.lifts?.[id]?.atk??0),hp:hp-(side.lifts?.[id]?.hp??0)};patches.push({id,from:[body.atk,body.hp],to:[atk,hp],target});}return key;});
 let wins=0,unfinished=0;for(let k=0;k<seeds;k++){const st=begin({...structuredClone(cfg),seed:`band|${k}`},clone);let n=0;while(n++<300&&st.outcome==='open'){if(st.whose==='foe')foeStep(st);else if(!act(st,carefulFor(st,'you')??{kind:'end'},'you').ok)throw Error('illegal');}wins+=st.outcome==='won';unfinished+=st.outcome==='open';}return {win:100*wins/seeds,unfinished,patches};
}
let experiments=[];if(process.argv.includes('--experiment')){const road=data.filter(r=>r.group==='roaming').sort((x,y)=>x.win-y.win);const keys=new Set([...road.slice(0,6),...road.slice(-6)].map(r=>r.key));experiments=withRules(true,()=>encounters().filter(e=>keys.has(e.key)).map(e=>{const result=experiment(e);console.error(`${e.key}: ${result.win}`);return {key:e.key,name:e.name,before:data.find(r=>r.key===e.key).win,...result};}),FIT);}
console.log(JSON.stringify({a,b,poolCount:pool.length,cardRows,rows:data,stats,experiments},null,2));
