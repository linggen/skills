// duel-card.js — the 斗法 card. Both sides' 气血 and 灵力, the 战力 that says
// who moves first, the creature's stance above its name, the turns as a short
// log, and the player's four choices as buttons — 法术 (a root each, and a
// borrowed face where 借势 is known), 物理攻击, 符箓, 辅助, with the arts under
// them. Each button says what it spends and is greyed with its why.
//
// The fight lives in duel.js: the page replays it from the picks so far, and
// the rules replay the same picks to decide. The page draws only what may
// come; the rules refuse the rest.

import { esc, spoken } from './cards.js';
import { GENERATES, fight, offers } from './duel.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };

const bar = (now, max, kind) => `<div class="fbar ${kind}"><i style="width:${Math.max(0, Math.min(100, (now / max) * 100))}%"></i></div>`;

/// One side's two pools, named and counted.
function poolsHtml(who, side, ctx) {
  const w = ctx.words;
  return `<div class="fside"><div class="fwho">${esc(who)}</div>
    <div class="fpool"><span>${w.hp}</span>${bar(side.hp, side.hp_max, 'hp')}<b>${side.hp}</b></div>
    <div class="fpool"><span>${w.mana}</span>${bar(side.qi, side.qi_max, 'qi')}<b>${side.qi}</b></div></div>`;
}

/// What the creature is holding after its turn — the thing to read before
/// choosing: a gathered blow wants 护体, 甲 wants a 法术.
function stanceHtml(f, ctx) {
  const w = ctx.words;
  const held = [f.foe.gather && w.stGather, f.foe.guard && w.stGuard, f.foe.armor && w.stArmor].filter(Boolean);
  return held.length ? `<span class="stance">${held.map(esc).join(' · ')}</span>` : '';
}

/// One turn as it fell.
function turnHtml(t, b, ctx) {
  const w = ctx.words;
  const art = id => b.arts.find(a => a.id === id)?.name ?? id;
  const mine = {
    cast: () => (t.as ? `${esc(art(t.art))} ${GLYPH[t.element]}→${GLYPH[t.as]}` : `${w.aCast}·${GLYPH[t.element]}`),
    strike: () => (t.hits ? `${esc(art(t.art))} ×${t.hits}` : w.aStrike),
    talisman: () => `${w.aCharm}${t.gave ? ` +${t.gave}${w.mana}` : ''}`,
    assist: () => (t.how === 'focus' ? w.aFocus : w.aGuard),
    art: () => esc(art(t.id)),
  };
  const theirs = { strike: w.fStrike, cast: `${GLYPH[t.element] ?? ''}${w.fCast}`, gather: w.stGather, guard: w.stGuard, armor: w.stArmor };
  const who = t.side === 'you' ? w.you : b.creature.name;
  const what = t.side === 'you' ? mine[t.act]() : theirs[t.act];
  return `<div class="fturn ${t.side}"><span>${esc(who)}</span><span>${what}</span>
    <span class="hit">${t.damage ? `−${t.damage}` : ''}</span></div>`;
}

/// A choice: what it is, and under it what it spends — or, when it may not
/// come, why. The why is written, not hovered: a phone has no hover.
function btn(o, label, hint, id, ctx) {
  const w = ctx.words;
  const why = o.ok ? null : esc(w.why?.[o.why] ?? o.why);
  return `<button class="rootbtn ${o.kind}" data-duel-pick="${esc(o.token)}" data-duel="${esc(id)}"${why ? ' disabled' : ''}>${label}<small>${why ?? hint}</small></button>`;
}

/// The buttons the fight offers next, from duel.js — in rows the player reads
/// as one thing: the 法术, what 借势 lends, the blade and the 符, the 辅助.
function picksHtml(exit, d, ctx) {
  const w = ctx.words, b = exit.duel, id = exit.game.id;
  const rows = { cast: [], borrow: [], hit: [], assist: [], art: [] };
  // The 五行 glyph is the world's own word for a root; in English it needs its
  // name beside the cost, or 木 says nothing.
  const en = ctx.lang === 'en';
  const elName = el => esc(ctx.content.traits.elements[el]?.[ctx.lang] ?? el);
  for (const o of offers(d.picks, b.foe, b.kit)) {
    // A no-break space keeps "4 Force" whole when the label wraps under it.
    const cost = en ? `${o.cost}\u00a0${w.mana}` : `${o.cost}${w.mana}`;
    if (o.kind === 'root' || o.kind === 'sword') {
      const from = o.kind === 'sword' ? `${esc(b.sword?.name ?? '')} ` : '';
      rows.cast.push(btn(o, GLYPH[o.element], en ? `${elName(o.element)} · ${cost}` : `${from}${cost}`, id, ctx));
    }
    else if (o.kind === 'borrow') rows.borrow.push(btn(o, `${GLYPH[o.element]}→${GLYPH[GENERATES[o.element]]}`, en ? elName(GENERATES[o.element]) : cost, id, ctx));
    else if (o.kind === 'strike') rows.hit.push(btn(o, w.aStrike, `${b.sword ? esc(b.sword.name) : w.barehand} ${cost}`, id, ctx));
    else if (o.kind === 'charm') rows.hit.push(btn(o, w.aCharm, `×${b.charm?.held ?? 0}`, id, ctx));
    else if (o.kind === 'assist') rows.assist.push(btn(o, o.how === 'focus' ? w.aFocus : w.aGuard, cost, id, ctx));
    else if (o.kind === 'art') rows.art.push(btn(o, esc(b.arts.find(a => a.id === o.id)?.name ?? o.id), cost, id, ctx));
  }
  const row = (label, cells) => (cells.length ? `<div class="roots"><span class="rowlab">${label}</span>${cells.join('')}</div>` : '');
  return row(w.aCast, rows.cast) + row(w.lend, rows.borrow) + row('', rows.hit) + row(w.aAssist, rows.assist) + row(w.arts, rows.art);
}

/// `exit` is Look's exit brief (with `duel`), `d` the page's fight
/// {status: idle|open|done, picks, outcome, say}.
export function duelHtml(exit, d, ctx) {
  const w = ctx.words, b = exit.duel;
  const f = fight(d.picks ?? [], b.foe, b.kit);
  const rootName = ctx.lang === 'en' ? ` ${esc(b.creature.root_name)}` : '';
  const head = `<div class="duelhead"><b>${spoken(b.creature.name, b.creature.pinyin)}</b>
    <span class="croot">${GLYPH[b.creature.root]}${rootName}</span>
    <span class="lean">${esc(w.lean?.[b.foe.lean] ?? '')}</span>${stanceHtml(f, ctx)}</div>`;
  const live = d.status === 'open' || d.status === 'done';
  const pools = live ? `<div class="fsides">${poolsHtml(b.creature.name, f.foe, ctx)}${poolsHtml(w.you, f.you, ctx)}</div>` : '';
  const power = `<div class="small dim">${w.power} ${f.you.power} · ${esc(b.creature.name)} ${f.foe.power} — ${f.first === 'you' ? w.youFirst : w.foeFirst}</div>`;
  const turns = live ? `<div class="fturns">${f.log.map(t => turnHtml(t, b, ctx)).join('')}</div>` : '';
  let body = '';
  // A haunt's win is paid by the rules at once; a scene's waits for its exit.
  if (exit.won) body = `<div class="small ling">${String(exit.game?.id ?? '').startsWith('haunt:') ? w.duelWon : w.wonWait}</div>`;
  else if (exit.withdrawn && d.status !== 'done') body = `<div class="small dim">${w.withdrawn}</div>`;
  else if (d.status === 'idle') body = `<div class="small dim">${w.duelHint}</div>${power}<button class="act" data-duel-start="${esc(exit.game.id)}">${w.begin}</button>`;
  else if (d.status === 'open') body = `${power}${picksHtml(exit, d, ctx)}`;
  else if (d.status === 'done') body = `<div class="small ${d.outcome === 'won' ? 'ling' : 'dim'}">${d.outcome === 'won' ? w.duelWon : esc(d.say || w.duelLost)}</div>`;
  return `<div class="card duelcard"><div class="cardtitle">${w.duelTitle}</div>${head}${pools}${turns}${body}</div>`;
}
