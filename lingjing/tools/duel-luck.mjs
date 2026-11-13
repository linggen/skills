// In-memory deck-size experiment; no game content is written.
import { encounters } from './duel-fit-report.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { content, FIGHTS, keyOf, foeOf, stateAt } from './story-fights.mjs';
import { begin, act, foeStep, shuffle } from '../scripts/battle.js';
import { carefulFor } from '../scripts/fightline.js';
import { seedOf } from '../scripts/state.mjs';
import { ownedCards } from '../scripts/rules/cards.mjs';
import { pathToFileURL } from 'node:url';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id,c]));
const curves = { qi:[1,1,1,2,2,2,3,3,4,4], foundation:[1,1,2,2,2,3,3,4,4,5], core:[1,2,2,2,3,3,4,4,5,5], nascent:[1,2,2,3,3,4,4,5,5,6] };
const cost = id => catalog[id]?.cost ?? 1;
// Repeat the game's realm curve and seeded within-cost ordering, retaining the actual ten first.
export function playerDeck(e, n) {
  const out = [...e.setup.you.deck]; if (n <= out.length) return out.slice(0,n);
  const owned = new Set(ownedCards(content,e.state));
  const roots = new Set(e.state.traits ?? []);
  const pool = content.cards.cards.filter(c => owned.has(c.id) && !c._token && !c.owner && (c.kind !== 'spell' || !c.element || roots.has(c.element)));
  if (!pool.length) throw Error(`empty player pool ${e.key}`);
  // Fair ten already duplicates scarce cards; repeated copies are necessary at low levels.
  const mine = Array.from({length: Math.ceil((n+out.length)/pool.length)+1},()=>pool.map(c=>c.id)).flat();
  const rows = new Map(); for (const id of shuffle(mine,`deck|${seedOf(e.state)}`)) { const c=Math.min(6,Math.max(1,cost(id))); if(!rows.has(c)) rows.set(c,[]); rows.get(c).push(id); }
  for (const id of out) { const row=rows.get(Math.min(6,Math.max(1,cost(id)))); const i=row?.indexOf(id) ?? -1; if(i>=0) row.splice(i,1); }
  const curve=curves[e.state.tier] ?? curves.qi;
  for(let i=0;out.length<n;i++) { const rung=curve[i%curve.length]; const c=[rung,rung-1,rung+1,rung-2,rung+2,1,2,3,4,5,6].find(x=>rows.get(x)?.length); if(c==null) throw Error('player pool exhausted'); out.push(rows.get(c).shift()); }
  return out;
}
export function beastDeck(e,n) {
  if(n===10) return [...e.setup.foe.deck];
  const original=e.creature ?? foeOf(FIGHTS.find(f=>keyOf(f)===e.key));
  const own=[...(original.deck ?? [])]; if(!own.length) throw Error(`empty beast pool ${e.key}`);
  // Preserve full original list, extend with cheapest original cards (the trim ordering).
  const sorted=[...own].sort((a,b)=>cost(a)-cost(b)||a.localeCompare(b));
  const out=own.slice(0,n); for(let i=0;out.length<n;i++) out.push(sorted[i%sorted.length]); return out;
}
export function mulligan(st, extraCount) {
  const start=extraCount, count=Math.min(st.mode.hand,st.you.hand.length-start);
  const indices=Array.from({length:count},(_,i)=>start+i).sort((a,b)=>cost(st.you.hand[b])-cost(st.you.hand[a])||a-b).slice(0,2).sort((a,b)=>b-a);
  const returned=indices.map(i=>st.you.hand.splice(i,1)[0]);
  for(let i=0;i<returned.length && st.you.deck.length;i++) st.you.hand.push(st.you.deck.shift());
  st.you.deck=shuffle([...st.you.deck,...returned],`${st.seed}|mulligan`);
}
export function run({seeds=40,sizes=[10,15,20]}={}) { return withRules(true,()=>{
 const es=encounters(); const results=[];
 for(const n of sizes) for(const redraw of (n===20?[false]:[false,true])) {
  const rows=[];
  for(const e of es) { const cfg=structuredClone(e.setup); cfg.you.deck=playerDeck(e,n); cfg.foe.deck=beastDeck(e,n);
   let wins=0,plies=0,drawYou=0,drawFoe=0,dry=0,unfinished=0;
   for(let k=0;k<seeds;k++) { const st=begin({...cfg,seed:`band|${k}`},catalog); if(redraw) mulligan(st,cfg.you.extra?.length??0); let p=0,empty=st.you.deck.length===0||st.foe.deck.length===0;
    while(p<300&&st.outcome==='open') { p++; if(st.whose==='foe') foeStep(st); else if(!act(st,carefulFor(st,'you')??{kind:'end'},'you').ok) throw Error('illegal'); empty ||= st.you.deck.length===0||st.foe.deck.length===0; }
    wins+=st.outcome==='won'; unfinished+=st.outcome==='open'; plies+=p; dry+=empty;
    // Count successful draws via the battle log; excludes mulligan replacement draws, added separately.
    drawYou+=st.log.filter(x=>x.act==='drew'&&x.who==='you').length+(redraw?2:0); drawFoe+=st.log.filter(x=>x.act==='drew'&&x.who==='foe').length;
   }
   rows.push({key:e.key,name:e.name,group:e.group,win:100*wins/seeds,plies:plies/seeds,drawYou:drawYou/seeds,drawFoe:drawFoe/seeds,dry:100*dry/seeds,unfinished});
  }
  const avg=f=>rows.reduce((s,r)=>s+f(r),0)/rows.length, mean=avg(r=>r.win);
  results.push({n,redraw,decided:100*rows.filter(r=>r.win<=15||r.win>=85).length/rows.length,middle:100*rows.filter(r=>r.win>=25&&r.win<=75).length/rows.length,sd:Math.sqrt(avg(r=>(r.win-mean)**2)),mean,plies:avg(r=>r.plies),drawYou:avg(r=>r.drawYou),drawFoe:avg(r=>r.drawFoe),dry:avg(r=>r.dry),groups:Object.fromEntries(['roaming','story','room','xiong','boss'].map(g=>{const a=rows.filter(r=>r.group===g);return [g,a.reduce((s,r)=>s+r.win,0)/a.length]})),rows});
  console.error(`N=${n} mulligan=${redraw} complete`);
 }
 const collections=Object.fromEntries(['h05','h11','h10'].map(h=>{const s=stateAt(h);return [h,{held:ownedCards(content,s).length,usable:content.cards.cards.filter(c=>ownedCards(content,s).includes(c.id)&&!c._token&&!c.owner&&(c.kind!=='spell'||!c.element||(s.traits??[]).includes(c.element))).length}]}));
 return {seeds,collections,results};
},FIT); }
if(import.meta.url===pathToFileURL(process.argv[1]??'').href) { const args=process.argv.slice(2), get=(key,d)=>args.includes(key)?args[args.indexOf(key)+1]:d; const seeds=Number(get('--seeds',40)), sizes=get('--sizes','10,15,20').split(',').map(Number); if(!Number.isInteger(seeds)||seeds<1||sizes.some(n=>![10,15,20].includes(n))) throw Error('invalid options'); console.log(JSON.stringify(run({seeds,sizes}),null,2)); }
