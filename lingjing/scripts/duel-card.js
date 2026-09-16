// duel-card.js — the 降妖 card. Draws the creature and its root, the
// player's roots as buttons, and the rounds as they fall. The bout itself
// lives in the page's duel state and is decided by the rules on settle.

import { esc } from './cards.js';
import { BEATS } from './duel.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };

/// The 相克 ring in one line, so the player knows what overcomes what before
/// picking: 金 › 木 › 土 › 水 › 火 › 金. Names from the world's roots.
function ringHtml(ctx) {
  const name = (id) => (ctx.lang === 'zh' ? GLYPH[id] : ctx.content.traits.elements[id]?.en ?? id);
  const chain = ['metal'];
  while (chain.length < 6) chain.push(BEATS[chain[chain.length - 1]]);
  return `<div class="small dim kering">${ctx.words.ring}: ${chain.map(name).map(esc).join(' › ')}</div>`;
}

/// `exit` is Look's exit brief (with `duel`), `d` the page's bout
/// {status: idle|open|done, picks, rounds, outcome, say}.
export function duelHtml(exit, d, ctx) {
  const w = ctx.words, b = exit.duel;
  const head = `<div class="duelhead"><b>${esc(b.creature.name)}</b> <span class="croot">${GLYPH[b.creature.root]} ${esc(b.creature.root_name)}</span></div>`;
  const rounds = (d.rounds || []).map((r, i) => `<div class="rnd ${r.result}"><span>${w.round} ${i + 1}</span>
    <span>${GLYPH[r.pick]} · ${GLYPH[r.move]}</span><span class="res">${w[{ won: 'rWon', lost: 'rLost', draw: 'rDraw' }[r.result]]}</span></div>`).join('');
  let body = '';
  if (exit.won) body = `<div class="small ling">${w.wonWait}</div>`;
  else if (exit.withdrawn && d.status !== 'done') body = `<div class="small dim">${w.withdrawn}</div>`;
  else if (d.status === 'idle') body = `<div class="small dim">${w.duelHint}</div>${ringHtml(ctx)}<button class="act" data-duel-start="${esc(exit.game.id)}">${w.begin}</button>`;
  else if (d.status === 'open') {
    const roots = b.roots.map((r) => `<button class="rootbtn" data-duel-pick="${esc(r.id)}" data-duel="${esc(exit.game.id)}">${GLYPH[r.id]}<small>${esc(r.name)}</small></button>`).join('');
    body = `<div class="small dim">${w.duelHint}</div>${ringHtml(ctx)}<div class="roots">${roots}</div>`;
  } else if (d.status === 'done') {
    body = `<div class="small ${d.outcome === 'won' ? 'ling' : 'dim'}">${d.outcome === 'won' ? w.duelWon : esc(d.say || w.duelLost)}</div>`;
  }
  return `<div class="card duelcard"><div class="cardtitle">${w.duelTitle}</div>${head}<div class="rounds">${rounds}</div>${body}</div>`;
}
