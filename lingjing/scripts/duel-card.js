// duel-card.js — the 降妖 card. Draws the creature and its root, the
// player's roots as buttons — and beside them the worn sword's root, the 符
// in hand and the learned arts, each greyed with its why when it may not
// come next — and the rounds as they fall. The bout itself lives in the
// page's duel state and is decided by the rules on settle.

import { esc, spoken } from './cards.js';
import { BEATS, offers } from './duel.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };

/// The 相克 ring in one line, so the player knows what overcomes what before
/// picking: 金 › 木 › 土 › 水 › 火 › 金. Names from the world's roots.
function ringHtml(ctx) {
  const name = (id) => (ctx.lang === 'zh' ? GLYPH[id] : ctx.content.traits.elements[id]?.en ?? id);
  const chain = ['metal'];
  while (chain.length < 6) chain.push(BEATS[chain[chain.length - 1]]);
  return `<div class="small dim kering">${ctx.words.ring}: ${chain.map(name).map(esc).join(' › ')}</div>`;
}

/// One round as it fell: the pick (a 符, or a root borrowed by 借势 shown as
/// what it counted for), the creature's move, the result, and the art that
/// turned it.
function roundHtml(r, i, b, ctx) {
  const w = ctx.words;
  const pick = r.charm ? (b.charm?.name ?? '符') : r.as ? `${GLYPH[r.pick]}→${GLYPH[r.as]}` : GLYPH[r.pick];
  const art = (r.art ? `<small class="artmark">${esc(b.arts.find((a) => a.id === r.art)?.name ?? r.art)}</small>` : '')
    + (r.fortune ? `<small class="artmark">${esc(w.fortuneMark)}</small>` : '');
  return `<div class="rnd ${r.result}"><span>${w.round} ${i + 1}</span>
    <span>${esc(pick)} · ${GLYPH[r.move]}${art}</span><span class="res">${w[{ won: 'rWon', lost: 'rLost', draw: 'rDraw' }[r.result]]}</span></div>`;
}

/// The buttons the bout offers next, from duel.js — the page draws only
/// what may come; the rules refuse the rest.
function pickHtml(exit, d, ctx) {
  const w = ctx.words, b = exit.duel;
  const why = (o) => (o.ok ? '' : ` disabled title="${esc(w.why?.[o.why] ?? o.why)}"`);
  const id = esc(exit.game.id);
  const roots = [], extras = [];
  for (const o of offers(d.picks, d.moves, b.kit)) {
    const attr = `data-duel-pick="${esc(o.token)}" data-duel="${id}"${why(o)}`;
    if (o.kind === 'root') roots.push(`<button class="rootbtn" ${attr}>${GLYPH[o.token]}<small>${esc(ctx.content.traits.elements[o.token]?.[ctx.lang] ?? o.token)}</small></button>`);
    else if (o.kind === 'sword') roots.push(`<button class="rootbtn sword" ${attr}>${GLYPH[o.token]}<small>${esc(b.sword?.name ?? '')}</small></button>`);
    else if (o.kind === 'charm') extras.push(`<button class="rootbtn charm" ${attr}>符<small>${esc(b.charm?.name ?? '')} ×${b.charm?.held ?? 0}</small></button>`);
    else if (o.kind === 'art') {
      const art = b.arts.find((a) => a.id === o.token.slice(4));
      extras.push(`<button class="rootbtn art" ${attr}>${esc(art?.name ?? o.token)}<small>${esc(w.artHint?.[art?.effect] ?? '')}</small></button>`);
    }
  }
  const stand = d.status === 'rescue' ? `<button class="act" data-duel-stand="${id}">${w.stand}</button>` : '';
  return `<div class="roots">${roots.join('')}</div>${extras.length ? `<div class="roots extras">${extras.join('')}</div>` : ''}${stand}`;
}

/// `exit` is Look's exit brief (with `duel`), `d` the page's bout
/// {status: idle|open|rescue|done, picks, rounds, outcome, say}.
export function duelHtml(exit, d, ctx) {
  const w = ctx.words, b = exit.duel;
  // The root once: the glyph, and its English name only in an English game.
  const rootName = ctx.lang === 'en' ? ` ${esc(b.creature.root_name)}` : '';
  const head = `<div class="duelhead"><b>${spoken(b.creature.name, b.creature.pinyin)}</b> <span class="croot">${GLYPH[b.creature.root]}${rootName}</span></div>`;
  const rounds = (d.rounds || []).map((r, i) => roundHtml(r, i, b, ctx)).join('');
  let body = '';
  // A haunt's win is paid by the rules at once; a scene's waits for its exit.
  if (exit.won) body = `<div class="small ling">${String(exit.game?.id ?? '').startsWith('haunt:') ? w.duelWon : w.wonWait}</div>`;
  else if (exit.withdrawn && d.status !== 'done') body = `<div class="small dim">${w.withdrawn}</div>`;
  else if (d.status === 'idle') body = `<div class="small dim">${w.duelHint}</div>${ringHtml(ctx)}<button class="act" data-duel-start="${esc(exit.game.id)}">${w.begin}</button>`;
  else if (d.status === 'open') body = `<div class="small dim">${w.duelHint}</div>${ringHtml(ctx)}${pickHtml(exit, d, ctx)}`;
  else if (d.status === 'rescue') body = `<div class="small dim">${w.rescueHint}</div>${pickHtml(exit, d, ctx)}`;
  else if (d.status === 'done') {
    body = `<div class="small ${d.outcome === 'won' ? 'ling' : 'dim'}">${d.outcome === 'won' ? w.duelWon : esc(d.say || w.duelLost)}</div>`;
  }
  return `<div class="card duelcard"><div class="cardtitle">${w.duelTitle}</div>${head}<div class="rounds">${rounds}</div>${body}</div>`;
}
