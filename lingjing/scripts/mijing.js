// mijing.js — 秘境探险's card (rules/mijing.mjs, Look's `mijing`): the ink map of the run, drawn in code (Slay the
// Spire's map, bottom to top: the first row at the foot, the 大妖 at the head), 气血, the boons and the pack, and the
// room's business — a 奇遇's ways, a 灵泉's rest, a reward's three boons; at the door the nine 重; after a run what it
// paid. Pure: Look in, HTML out. Every tap is a `data-mijing` button the page sends as the rules' `mijing` verb
// (lingjing.js mijingTap); a fight room's beast stands as the stage's own duel card, a board room's game as its board.

import { esc } from './esc.js';
import { worldPath } from './rules.js';

export const MIJING_WORDS = {
  zh: {
    door: '石门', keys: '{name} × {n}', enter: '探秘境', noKey: '没有秘境令', story: '故事还没走到那里', before: '先过上一重', cleared: '已过',
    hp: '气血', boons: '加持', pack: '囊中', nothing: '空', wealth: '灵石 {n}', leave: '出秘境', depth: '第 {n} / {of} 间',
    pickRoom: '挑一条路走：点亮着的那一间。', fight: '{kind} · {name}挡在{room}。出手吧。', board: '{kind} · {room}', yield: '撤 · 折{pct}气血',
    heal: '歇一歇 · 回{n}气血', temper: '炼{name} · 本趟少一点灵力', reward: '挑一样加持（本趟有效）', skip: '都不要', got: '得：{what}',
    hpUp: '气血 +{n}', hpDown: '气血 −{n}', withdrew: '它一口气用尽，走了。', stars: '{n}★', away: '{keys} · 石门在{door}', goDoor: '去石门 ›',
    end: { clear: '通关', dead: '力竭', left: '退出' }, endLine: '{name} · {how} · 走到{reached}/{of}间', paid: '修为 +{p} · 灵石 +{w}', close: '收起',
    chance: '{n}成把握',
  },
  en: {
    door: 'The stone door', keys: '{name} × {n}', enter: 'Enter', noKey: 'No realm token', story: 'The story has not got there', before: 'Clear the one before', cleared: 'cleared',
    hp: 'Life', boons: 'Boons', pack: 'Pack', nothing: 'empty', wealth: '{n} stones', leave: 'Leave the realm', depth: 'Room {n} of {of}',
    pickRoom: 'Pick your way: tap a lit room.', fight: '{kind} · {name} bars {room}. Strike.', board: '{kind} · {room}', yield: 'Back off · {pct} Life',
    heal: 'Rest · +{n} Life', temper: 'Temper {name} · cheaper this run', reward: 'Pick a boon (this run only)', skip: 'None', got: 'Found: {what}',
    hpUp: 'Life +{n}', hpDown: 'Life −{n}', withdrew: 'It ran out of breath and left.', stars: '{n}★', away: '{keys} · the door is at {door}', goDoor: 'To the door ›',
    end: { clear: 'Cleared', dead: 'Spent', left: 'Left' }, endLine: '{name} · {how} · {reached}/{of} rooms', paid: 'Cultivation +{p} · stones +{w}', close: 'Close',
    chance: '{n}0% odds',
  },
};
const fill = (t, o) => String(t ?? '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));

const CSS = `
.card.mijing { position: relative; overflow: hidden; }
.card.mijing .mj-bd { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: .13; pointer-events: none; filter: grayscale(.6) sepia(.3); }
.card.mijing > *:not(.mj-bd) { position: relative; }
.mj-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mj-hp { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.mj-hp .bar { width: 90px; height: 7px; border-radius: 4px; background: rgba(40,30,20,.15); overflow: hidden; }
.mj-hp .bar i { display: block; height: 100%; background: #a33025; }
.mj-map { width: 100%; max-width: 420px; margin: 4px auto 2px; display: block; }
.mj-map .way { fill: none; stroke: #2a241c; stroke-width: 1.6; stroke-linecap: round; opacity: .38; stroke-dasharray: 1 5; }
.mj-map .way.walked { opacity: .85; stroke-dasharray: none; stroke-width: 2.4; }
.mj-map .node circle { fill: #f3ead6; stroke: #2a241c; stroke-width: 1.4; }
.mj-map .node text { font: 600 14px "Songti SC","STSong","Noto Serif SC",serif; fill: #2a241c; text-anchor: middle; dominant-baseline: central; }
.mj-map .node.far { opacity: .45; }
.mj-map .node.done circle { fill: #2a241c; } .mj-map .node.done text { fill: #f3ead6; }
.mj-map .node.here circle { stroke: #a33025; stroke-width: 3; }
.mj-map .node.next { cursor: pointer; }
.mj-map .node.next circle { stroke: #a33025; stroke-width: 2.2; fill: #fff7e6; animation: mjPulse 1.6s ease-in-out infinite; }
.mj-map .node.boss circle { stroke-width: 2.4; }
.mj-map .label { font: 11px "Songti SC","STSong",serif; fill: #5b4f42; text-anchor: middle; }
@keyframes mjPulse { 50% { stroke-opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .mj-map .node.next circle { animation: none; } }
.mj-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; margin-top: 4px; }
.mj-room { margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(40,30,20,.25); }
.mj-tiers { display: grid; gap: 6px; margin-top: 6px; }
.mj-tier { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mj-tier.shut { opacity: .5; }
.mj-boon { text-align: left; }
.mj-boon small { display: block; opacity: .75; font-weight: 400; }
`;
function sheet() {
  const doc = globalThis.document;
  if (!doc || doc.getElementById('mijing-css')) return;
  const st = doc.createElement('style');
  st.id = 'mijing-css';
  st.textContent = CSS;
  doc.head.append(st);
}

/* The ink map, as SVG: rows bottom to top, each room its mark in an ink ring, the ways between as brush lines (the
   ways walked solid); a lit room is a tap (`data-mijing="go"`). */
export function mapSvg(m) {
  const rows = m.map.layers.length + 1, W = 320, H = 54 * rows + 20, x = (r) => 34 + r.at * (W - 68), y = (row) => H - 30 - row * 54;
  const all = [...m.map.layers.flat(), m.map.boss], byId = Object.fromEntries(all.map((r) => [r.id, r]));
  const walked = new Set(), path = m.walked ?? [];
  for (let i = 0; i + 1 < path.length; i++) walked.add(`${path[i]}>${path[i + 1]}`);
  const ways = Object.entries(m.map.ways).flatMap(([from, tos]) => tos.map((to) => {
    const a = byId[from], b = byId[to];
    if (!a || !b) return '';
    const x1 = x(a), y1 = y(a.row) - 14, x2 = x(b), y2 = y(b.row) + 14, my = (y1 + y2) / 2;
    const done = walked.has(`${from}>${to}`);
    return `<path class="way${done ? ' walked' : ''}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  })).join('');
  const node = (r) => {
    const big = r.kind === 'boss', rad = big ? 17 : 13;
    const tap = r.state === 'next' ? ` data-mijing="go" data-room="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(r.name ?? r.mark)}"` : '';
    const label = r.name && (r.state === 'next' || r.state === 'here') ? `<text class="label" x="${x(r).toFixed(1)}" y="${(y(r.row) + rad + 11).toFixed(1)}">${esc(r.name)}</text>` : '';
    return `<g class="node ${esc(r.state)}${big ? ' boss' : ''}"${tap}><circle cx="${x(r).toFixed(1)}" cy="${y(r.row).toFixed(1)}" r="${rad}"/><text x="${x(r).toFixed(1)}" y="${y(r.row).toFixed(1)}">${esc(r.mark)}</text>${label}</g>`;
  };
  return `<svg class="mj-map" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${ways}${all.map(node).join('')}</svg>`;
}

const itemsLine = (items, t) => (items ?? []).map((i) => `${i.name}${i.n > 1 ? ` × ${i.n}` : ''}`).join('、') || t.nothing;
function gotLine(got, t) {
  if (!got) return '';
  const parts = [...(got.items ?? []).map((i) => `${i.name}${i.n > 1 ? ` × ${i.n}` : ''}`), ...(got.wealth ? [fill(t.wealth, { n: got.wealth })] : [])];
  return parts.length ? `<div class="small">${esc(fill(t.got, { what: parts.join('、') }))}</div>` : '';
}
const hpLine = (n, t) => (n > 0 ? fill(t.hpUp, { n }) : n < 0 ? fill(t.hpDown, { n: -n }) : '');

/* The room's business, by its phase. */
function roomHtml(m, t, yieldPct) {
  const r = m.room;
  if (!r || r.phase === 'done') {
    const out = r?.outcome ?? {};
    const lines = [out.line, out.withdrew ? t.withdrew : '', out.stars ? fill(t.stars, { n: out.stars }) : '', hpLine(out.hp ?? 0, t)].filter(Boolean).join(' · ');
    return `<div class="mj-room">${lines ? `<div class="say">${esc(lines)}</div>` : ''}${gotLine(r?.got, t)}<div class="small dim">${esc(t.pickRoom)}</div></div>`;
  }
  if (r.phase === 'fight') return `<div class="mj-room"><div class="say">${esc(fill(t.fight, { kind: r.kind_name, name: r.foe?.name ?? '', room: r.name ?? '' }))}</div></div>`;
  if (r.phase === 'board') return `<div class="mj-room"><div class="small">${esc(fill(t.board, { kind: r.kind_name, room: r.name ?? '' }))}</div><div class="acts"><button class="act quiet" data-mijing="yield">${esc(fill(t.yield, { pct: `${Math.round(yieldPct * 100)}%` }))}</button></div></div>`;
  if (r.phase === 'reward') {
    const head = r.outcome?.line ? `<div class="say">${esc([r.outcome.line, hpLine(r.outcome.hp ?? 0, t)].filter(Boolean).join(' · '))}</div>` : '';
    const boons = (r.offer ?? []).map((b) => `<button class="act mj-boon" data-mijing="boon" data-boon="${esc(b.id)}">${esc(b.name)}<small>${esc(b.does)}</small></button>`).join('');
    return `<div class="mj-room">${head}${gotLine(r.got, t)}<div class="small">${esc(t.reward)}</div><div class="acts">${boons}<button class="act quiet" data-mijing="boon" data-skip="1">${esc(t.skip)}</button></div></div>`;
  }
  if (r.kind === 'qiyu' && r.qiyu) {
    const ways = r.qiyu.ways.map((w) => `<button class="act" data-mijing="choose" data-way="${w.i}">${esc(w.label)}${w.chance != null && w.chance < 1 ? ` <small class="dim">${esc(fill(t.chance, { n: Math.round(w.chance * 10) }))}</small>` : ''}</button>`).join('');
    return `<div class="mj-room"><div class="say">${esc(r.qiyu.frame)}</div><div class="acts">${ways}</div></div>`;
  }
  if (r.kind === 'quan' && r.quan) {
    const cards = (r.quan.cards ?? []).map((c) => `<button class="act quiet" data-mijing="choose" data-way="card" data-card="${esc(c.id)}">${esc(fill(t.temper, { name: c.name }))}</button>`).join('');
    return `<div class="mj-room"><div class="acts"><button class="act primary" data-mijing="choose" data-way="heal">${esc(fill(t.heal, { n: r.quan.heal }))}</button>${cards}</div></div>`;
  }
  return '';
}

/* The card, by where he stands: inside a run, at the door, away with a 秘境令, after a run. */
export function mijingCardHtml(card, ctx) {
  sheet();
  const m = ctx.look?.mijing, t = MIJING_WORDS[ctx.lang] ?? MIJING_WORDS.zh;
  if (!m) return '';
  const dir = ctx.look?.world?.dir;
  const bd = (src) => (src && dir ? `<div class="mj-bd" style="background-image:url('${esc(worldPath(dir, src))}')"></div>` : '');
  if (m.inside) {
    const pct = Math.max(0, Math.min(100, Math.round((m.hp / Math.max(1, m.hp_max)) * 100)));
    const boons = m.boons.length ? m.boons.map((b) => `<span class="chip" title="${esc(b.does)}">${esc(b.name)}</span>`).join('') : `<span class="dim">${esc(t.nothing)}</span>`;
    const pack = [itemsLine(m.loot.items, t), ...(m.loot.wealth ? [fill(t.wealth, { n: m.loot.wealth })] : [])].join(' · ');
    return `<div class="card mijing inside" data-card-kind="mijing">${bd(m.tier.backdrop)}
      <div class="mj-head"><div class="cardtitle">${esc(m.tier.name)}</div><div class="mj-hp">${esc(t.hp)} ${m.hp}/${m.hp_max}<span class="bar"><i style="width:${pct}%"></i></span></div></div>
      ${mapSvg(m)}
      <div class="mj-row"><span class="dim">${esc(t.boons)}</span>${boons}</div>
      <div class="mj-row"><span class="dim">${esc(t.pack)}</span><span>${esc(pack)}</span><span class="dim">· ${esc(fill(t.depth, { n: m.depth, of: m.of }))}</span></div>
      ${roomHtml(m, t, m.yield ?? 0.25)}
      <div class="acts"><button class="act quiet" data-mijing="leave">${esc(t.leave)}</button></div></div>`;
  }
  if (m.last) {
    const l = m.last, how = t.end[l.how] ?? l.how;
    const items = l.items?.length ? `<div class="small">${esc(fill(t.got, { what: itemsLine(l.items, t) }))}${l.card ? ` · ${esc(l.card.name ?? '')}` : ''}</div>` : '';
    return `<div class="card mijing last" data-card-kind="mijing"><div class="cardtitle">${esc(fill(t.endLine, { name: l.name, how, reached: l.reached, of: l.of }))}</div>
      <div class="say">${esc(fill(t.paid, { p: l.paid?.progress ?? 0, w: l.paid?.wealth ?? 0 }))}</div>${items}
      <div class="acts"><button class="act quiet" data-mijing="close">${esc(t.close)}</button></div></div>`;
  }
  if (m.away) return `<div class="card mijing away" data-card-kind="mijing"><div class="small">${esc(fill(t.away, { keys: fill(t.keys, { name: m.key_name, n: m.keys }), door: m.door?.name ?? '' }))}</div><div class="acts"><button class="act go quiet" data-go="${esc(m.door?.id ?? '')}">${esc(t.goDoor)}</button></div></div>`;
  if (m.door) {
    const rows = m.tiers.map((x) => {
      const why = x.open ? (m.keys ? '' : t.noKey) : t[x.why] ?? '';
      const btn = x.open ? `<button class="act${m.keys ? ' primary' : ''}" data-mijing="enter" data-tier="${x.n}"${m.keys ? '' : ' disabled'}>${esc(t.enter)}</button>` : `<span class="small dim">${esc(why)}</span>`;
      return `<div class="mj-tier${x.open ? '' : ' shut'}"><span>${esc(x.name)}${x.cleared ? ` <span class="chip">${esc(t.cleared)}</span>` : ''}</span>${btn}</div>`;
    });
    // The 重 past the first not yet open: only the next one shows, so the list never reads as a wall of locks.
    const firstShut = m.tiers.findIndex((x) => !x.open);
    const shown = rows.filter((_, i) => firstShut < 0 || i <= firstShut);
    return `<div class="card mijing door" data-card-kind="mijing"><div class="mj-head"><div class="cardtitle">${esc(m.place?.name ?? t.door)}</div><span class="chip">${esc(fill(t.keys, { name: m.key_name, n: m.keys }))}</span></div>
      <div class="mj-tiers">${shown.join('')}</div></div>`;
  }
  return '';
}
