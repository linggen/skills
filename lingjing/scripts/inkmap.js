// inkmap.js — 鼎归 · 地图晕开 (哇时刻 ①, his 2026-09-29): the 九州 map in ink.
//
// The map art (world.json atlas.file) is drawn again as ink on 宣纸 from its
// own shapes: each province is mist (not walked, or shut by the chapter's map),
// a light wash (walked, its 鼎 not home), or deep ink with its rivers, a red
// seal 「X州 · 鼎归」 and a small moon on its water (its 鼎 home). The states are
// the rules' (the atlas verb's `ink`, rules/inkmap.mjs); nothing here decides one.
//
// The moment a 鼎 comes home (~7 s, tap to skip) is a stage card: the view
// closes in on the province, an ink drop falls where the 鼎 was found and
// spreads to fill it (a mask circle roughened by feTurbulence +
// feDisplacementMap, clipped to the province — no raster art), the rivers
// draw themselves, the seal thuds down, and 「九州的水涨了一寸」: every water
// ripples once and a moon rises on each province whose 鼎 is home. Reduced
// motion: the final state at once. `unrollHtml` is the 卷轴 opening left to
// right (第三章 · 下山), for any picture. Pure drawing: every word esc()'d.
import { esc } from './esc.js';

export const INK_WORDS = {
  zh: { seal: '{p} · 鼎归', rise: '九州的水涨了一寸', count: '九鼎 · {n}／{of}', skip: '轻触跳过', close: '收起', fly: '御剑 · 1 体力', memory: '银月的记忆 ›', look: '看看{p}', mist: '雾里，还没走到', notHome: '{p}的鼎还没归来' },
  en: { seal: '{p} · home', rise: 'The waters of the Nine Provinces rose an inch', count: 'Cauldrons · {n}/{of}', skip: 'Tap to skip', close: 'Close', fly: 'Fly by sword · 1 Stamina', memory: 'Yinyue’s memory ›', look: 'Look at {p}', mist: 'In the mist — not walked yet', notHome: 'The {p} cauldron has not come home' },
};
const ZH_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const say = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const words = (lang) => INK_WORDS[lang] ?? INK_WORDS.zh;
const num = (n, lang) => (lang === 'en' ? String(n) : ZH_NUM[n] ?? String(n));

/// The moment's timeline, ms from its start: the zoom, the drop, the spread,
/// the rivers, the seal, the rise of the water and the moons; `end` is when
/// it stands still.
export const HOMING_MS = { zoom: 0, drop: 900, spread: 1300, rivers: 3300, seal: 4800, rise: 5500, moons: 5900, end: 7400 };

/* ── The shapes, read from the map file itself ── */

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const tidy = (d) => d.replace(/\s+/g, ' ').trim();

/// What the page draws, from the SVG's text and the world's `atlas.shapes`
/// (province → the id of its fill group): the size, each province's outline
/// (the first path under its group), every river (a light-blue stroke) and
/// every body of water (a light-blue fill, masks left out). Works on the
/// text alone, so the tests read the same file the page does.
export function shapesOf(svg, shapes = {}) {
  const box = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number) ?? [0, 0, 1, 1];
  const provinces = {};
  for (const [id, gid] of Object.entries(shapes)) {
    const at = svg.indexOf(`id="${gid}"`);
    if (at < 0) continue;
    const m = /<path\b[^>]*?\sd="([^"]+)"/.exec(svg.slice(at));
    if (m) provinces[id] = tidy(m[1]);
  }
  const rivers = [], waters = [];
  for (const [tag] of svg.matchAll(/<path\b[^>]*>/g)) {
    const d = attr(tag, 'd');
    if (!d) continue;
    const fill = attr(tag, 'fill')?.toUpperCase(), stroke = attr(tag, 'stroke')?.toUpperCase();
    if (fill === 'NONE' && stroke === '#BAE5F2') rivers.push(tidy(d));
    else if (fill === '#BAE5F2' && !attr(tag, 'mask')) waters.push(tidy(d));
  }
  return { w: box[2], h: box[3], provinces, rivers, waters };
}

/* ── Drawing ── */

const f2 = (n) => Number(n.toFixed(2));
/// The camera that closes in on a frame ({x, y, w, h}, fractions of the map).
export function camOf(geo, frame) {
  if (!frame) return null;
  const s = Math.min(3, 0.86 / Math.max(frame.w, frame.h));
  const cx = (frame.x + frame.w / 2) * geo.w, cy = (frame.y + frame.h / 2) * geo.h;
  return { s: f2(s), tx: f2(geo.w / 2 - s * cx), ty: f2(geo.h / 2 - s * cy) };
}

/// A seal: a red square, the province and 鼎归 in two columns of white.
function sealSvg(x, y, size, pname, lang, cls) {
  const h = size, w = lang === 'en' ? size * 2.1 : size;
  const text = lang === 'en'
    ? `<text x="${f2(w / 2)}" y="${f2(h * 0.62)}" font-size="${f2(h * 0.34)}" text-anchor="middle">${esc(pname)}</text>`
    : `<text x="${f2(w * 0.72)}" y="${f2(h * 0.44)}" font-size="${f2(h * 0.36)}" text-anchor="middle">${esc([...pname][0] ?? '')}</text><text x="${f2(w * 0.72)}" y="${f2(h * 0.86)}" font-size="${f2(h * 0.36)}" text-anchor="middle">州</text>`
      + `<text x="${f2(w * 0.28)}" y="${f2(h * 0.44)}" font-size="${f2(h * 0.36)}" text-anchor="middle">鼎</text><text x="${f2(w * 0.28)}" y="${f2(h * 0.86)}" font-size="${f2(h * 0.36)}" text-anchor="middle">归</text>`;
  return `<g class="${cls}" transform="translate(${f2(x - w / 2)} ${f2(y - h / 2)})"><g class="sealbody"><rect width="${f2(w)}" height="${f2(h)}" rx="${f2(h * 0.08)}"/>${text}</g></g>`;
}

/// A small moon on the water: a soft glowing disc in its halo, and its
/// reflection broken on the water below it (千江有水千江月).
const moonSvg = (x, y, r, cls, id) => `<g class="${cls}" transform="translate(${f2(x)} ${f2(y)})"><g class="moonbody">`
  + `<circle class="moonhalo" r="${f2(r * 2.8)}" fill="url(#${id}-halo)"/>`
  + `<ellipse class="moonreflect" cy="${f2(r * 2.1)}" rx="${f2(r * 1.5)}" ry="${f2(r * 0.32)}" fill="url(#${id}-halo)" filter="url(#${id}-soft)"/>`
  + `<ellipse class="moonreflect" cy="${f2(r * 2.7)}" rx="${f2(r * 0.9)}" ry="${f2(r * 0.2)}" fill="url(#${id}-halo)" filter="url(#${id}-soft)"/>`
  + `<circle class="moondisc" r="${f2(r)}" fill="url(#${id}-disc)"/></g></g>`;

/// The 九州 in ink. `ink` is the atlas verb's (rules/inkmap.mjs); `geo` the
/// shapes; `names` the provinces' names in the page's language. `moment`
/// {province, frame} draws the 鼎-home animation for that province (the page
/// sets `--age` so a redraw carries on); `still` draws it done. `labels` are
/// the provinces' label points (world.json atlas.provinces), where a seal
/// stands. `paint` {href, x, y, w, h} is the world's own ink painting of the
/// whole map (world.json atlas.paint): hidden in mist, faint in a wash, whole
/// where the 鼎 is home — the paper stays light, never a dark block. `id` keeps
/// the defs of two maps on one page apart.
/// `overlay` draws only what lies over a canvas (fx.js): the water's edges,
/// the borders, the rivers, the moons and the seals — no paper, no painting.
export function inkMapSvg(geo, ink, { names = {}, labels = {}, lang = 'zh', moment = null, still = false, id = 'ink', paint = null, overlay = false } = {}) {
  if (!geo?.provinces || !ink?.provinces) return '';
  const ids = Object.keys(geo.provinces);
  const key = (p) => `${id}-${ids.indexOf(p)}`;
  const pv = ink.provinces;
  const M = moment && pv[moment.province] ? moment.province : null;
  const pt = ([x, y]) => [x * geo.w, y * geo.h];
  const shown = (p) => pv[p]?.state === 'ink' || pv[p]?.state === 'wash';
  const clips = ids.filter(shown).map((p) => `<clipPath id="${key(p)}"><path d="${geo.provinces[p]}"/></clipPath>`).join('');
  const home = (p) => pv[p]?.home;
  const find = M ? pt(home(M)?.map ?? [0.5, 0.5]) : null;
  const R = M && moment.frame ? Math.max(moment.frame.w * geo.w, moment.frame.h * geo.h) * 1.25 : geo.w * 0.3;
  const rough = `<filter id="${id}-rough" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${f2(Math.max(24, R * 0.28))}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  const grain = `<filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.07 0"/></filter>`;
  // The reveal: a soft-edged circle of white grows from the find spot; roughened, it soaks in like ink on 宣纸.
  const mask = M ? `<mask id="${id}-spread" maskUnits="userSpaceOnUse" x="0" y="0" width="${geo.w}" height="${geo.h}"><g filter="url(#${id}-rough)"><circle class="spread" cx="${f2(find[0])}" cy="${f2(find[1])}" r="${f2(R)}" fill="#fff"/></g></mask>` : '';
  const glow = `<radialGradient id="${id}-halo"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.95"/><stop offset="0.45" stop-color="#fff4cf" stop-opacity="0.45"/><stop offset="1" stop-color="#fff4cf" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${id}-disc" cx="0.42" cy="0.4"><stop offset="0" stop-color="#fffef6"/><stop offset="0.7" stop-color="#fbf0cc"/><stop offset="1" stop-color="#efdca6"/></radialGradient>`
    + `<filter id="${id}-soft" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="${f2(geo.w * 0.002)}"/></filter>`;
  // The painting: the world's own ink map (a light warm wash where there is none yet).
  const art = (cls, extra = '') => (paint?.href
    ? `<image class="${cls}" href="${esc(paint.href)}" x="${f2(paint.x ?? 0)}" y="${f2(paint.y ?? 0)}" width="${f2(paint.w ?? geo.w)}" height="${f2(paint.h ?? geo.h)}" preserveAspectRatio="none"${extra}/>`
    : `<rect class="${cls} bare" width="${geo.w}" height="${geo.h}"${extra}/>`);
  const shape = (p, cls) => `<path class="${cls}" d="${geo.provinces[p]}" data-pv="${esc(p)}"/>`;
  const fills = ids.map((p) => shape(p, `pvfill s-${pv[p]?.state ?? 'mist'}${pv[p]?.locked ? ' locked' : ''}`)).join('');
  // The painting inside each province: faint where walked, whole where its 鼎 is home. The moment's
  // own province shows faint, and the whole painting soaks in from the drop, a darker bleed at its edge.
  const inks = ids.filter(shown).map((p) => {
    const ink = pv[p].state === 'ink';
    if (p !== M) return `<g clip-path="url(#${key(p)})">${art(ink ? 'plate' : 'plate faint')}</g>`;
    return `<g clip-path="url(#${key(p)})">${art('plate faint')}${art('plate', ` mask="url(#${id}-spread)"`)}`
      + `<g filter="url(#${id}-rough)"><circle class="bleed" cx="${f2(find[0])}" cy="${f2(find[1])}" r="${f2(R)}" stroke-width="${f2(R * 0.035)}"/></g></g>`;
  }).join('');
  const rivers = ids.filter((p) => pv[p]?.state === 'ink').map((p) => `<g clip-path="url(#${key(p)})" class="rivers${p === M ? ' draw' : ''}">${geo.rivers.map((d) => `<path d="${d}" pathLength="1"/>`).join('')}</g>`).join('');
  const edges = ids.map((p) => shape(p, `pvedge s-${pv[p]?.state ?? 'mist'}${pv[p]?.locked ? ' locked' : ''}${p === M ? ' now' : ''}`)).join('');
  const waters = geo.waters.map((d) => `<path d="${d}"/>`).join('');
  const r = geo.w * 0.012;
  const moons = ids.filter((p) => pv[p]?.state === 'ink' && home(p)?.map).map((p) => { const [x, y] = pt(home(p).map); return moonSvg(x + r * 2.4, y + r * 1.2, r, `inkmoon${M ? ' rise' : ''}`, id); }).join('');
  const seals = ids.filter((p) => pv[p]?.state === 'ink').map((p) => {
    const [x, y] = pt(labels[p] ?? home(p).map);
    return sealSvg(x, y + geo.w * 0.05, geo.w * (p === M ? 0.036 : 0.042), names[p] ?? p, lang, `inkseal${p === M ? ' thud' : ''}`);
  }).join('');
  const drop = M ? `<circle class="inkdrop" cx="${f2(find[0])}" cy="${f2(find[1])}" r="${f2(geo.w * 0.006)}"/>` : '';
  const cam = M ? camOf(geo, moment.frame) : null;
  const camStyle = cam ? ` style="--cam: translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})"` : '';
  const cls = `inkmap${M ? ' moment' : ''}${still ? ' still' : ''}${overlay ? ' overlay' : ''}`;
  const under = overlay ? '' : `<rect class="paper" width="${geo.w}" height="${geo.h}"/><rect width="${geo.w}" height="${geo.h}" filter="url(#${id}-grain)"/>`;
  const body = overlay ? '' : `<g class="fills">${fills}</g><g class="inks">${inks}</g>`;
  return `<svg class="${cls}" viewBox="0 0 ${geo.w} ${geo.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<defs>${rough}${grain}${glow}${clips}${mask}</defs>
<g class="cam${cam ? ' zoom' : ''}"${camStyle}>${under}
<g class="waters${M ? ' ripple' : ''}">${waters}</g>${body}${rivers}<g class="edges">${edges}</g>${overlay ? '' : drop}<g class="moons">${moons}</g><g class="seals">${seals}</g></g></svg>`;
}

/// The map card's picture: the ink map where the plain one stood, framed the
/// same way (fractions of the map, as the img was).
export function inkLayerHtml(geo, ink, frame, opts = {}) {
  const svg = inkMapSvg(geo, ink, opts);
  if (!svg) return '';
  return `<div class="inklayer" style="width:${(100 / frame.w).toFixed(2)}%;left:${(-frame.x / frame.w * 100).toFixed(2)}%;top:${(-frame.y / frame.h * 100).toFixed(2)}%">${svg}</div>`;
}

/// A province's label class on the map: its state, from the rules.
/// A province the rules keep shut (`locked`) is greyed, and says so on a tap.
export const pvState = (ink, id) => (ink?.provinces?.[id] ? ` s-${ink.provinces[id].state}${ink.provinces[id].locked ? ' locked' : ''}` : '');

/// The line under the map when a province is tapped: one line of its 鼎's
/// story, 银月's memory in the 录 album, and 御剑 when the rules allow it.
/// `more` is the card's own button (up close on the province), added to the row.
export function provinceLineHtml(ink, id, { lang = 'zh', name = id, more = '' } = {}) {
  const p = ink?.provinces?.[id];
  if (!p) return '';
  const w = words(lang);
  if (p.state !== 'ink' || !p.home) {
    // Shut: the world's own line from the rules (inkMapOf `say`) — no road there yet, not a mist still to walk.
    const line = p.locked && p.say ? p.say : p.state === 'mist' ? w.mist : say(w.notHome, { p: name });
    if (p.locked) return `<div class="pvline shut" data-pvline="${esc(id)}"><b>${esc(name)}</b><span>${esc(line)}</span></div>`;
    return `<div class="pvline" data-pvline="${esc(id)}"><b>${esc(name)}</b><span>${esc(line)}</span>${more ? `<div class="acts">${more}</div>` : ''}</div>`;
  }
  const h = p.home;
  const acts = [
    more,
    h.memory ? `<button class="act quiet" data-lu-album="${esc(h.memory)}">${esc(w.memory)}</button>` : '',
    p.fly ? `<button class="act" data-fly="${esc(id)}">${esc(w.fly)}</button>` : '',
  ].join('');
  return `<div class="pvline ink" data-pvline="${esc(id)}"><b>${esc(say(w.seal, { p: name }))}</b><span>${esc(h.line ?? h.title ?? '')}</span>${h.place ? `<span class="dim">${esc(h.place.name)}</span>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}

/// The moment in the main slot: the map closing in on the province, the ink
/// spreading, the rivers, the seal, the water rising, the moons; the count
/// of 九鼎 in the corner. `age` ms since it began (a redraw carries on);
/// `still` (reduced motion, or skipped) is its last frame at once.
/// `fx`: the WebGL moment (fx.js) plays in the map's box instead — the card
/// keeps an empty slot of the map's shape for it, and the words.
export function homingCardHtml(geo, ink, { province, frame, age = 0, still = false, lang = 'zh', names = {}, labels = {}, paint = null, fx = false } = {}) {
  if (!geo || !ink?.provinces?.[province]) return '';
  const w = words(lang);
  const n = ink.homed?.length ?? 0, of = ink.of ?? 9;
  const svg = fx ? '' : inkMapSvg(geo, ink, { names, labels, lang, moment: { province, frame }, still, id: 'homing', paint });
  const done = still || age >= HOMING_MS.end;
  const map = fx ? `<div class="homingmap" data-fx style="aspect-ratio:${f2(geo.w)} / ${f2(geo.h)}"></div>` : `<div class="homingmap">${svg}</div>`;
  return `<div class="card homing${still ? ' still' : ''}${fx ? ' fx' : ''}" data-homing="${esc(province)}" role="button" tabindex="0" aria-label="${esc(say(w.seal, { p: names[province] ?? province }))}" style="--age:${Math.round(still ? HOMING_MS.end : age)}ms">
    ${map}
    <div class="homingcount">${esc(say(w.count, { n: num(n, lang), of: num(of, lang) }))}</div>
    <div class="homingrise">${esc(w.rise)}</div>
    <div class="hominghint">${esc(done ? w.close : w.skip)}</div>
  </div>`;
}

/// 卷轴 — a picture unrolled left to right (第三章 · 下山, the whole 九州):
/// two rods, the paper revealed between them. Reusable for any inner HTML;
/// `still` shows it open.
export function unrollHtml(inner, { still = false, label = '' } = {}) {
  return `<div class="unroll${still ? ' still' : ''}" data-unroll role="button" tabindex="0" aria-label="${esc(label)}"><div class="scroll"><i class="rod l"></i><div class="sheet">${inner}</div><i class="rod r"></i></div>${label ? `<div class="unrolltitle">${esc(label)}</div>` : ''}</div>`;
}

/// A 鼎 come home that the page has not played: a province in Look's
/// `jiuding.homed` that the last read did not have. The first read only
/// notes where things stand (null seen): nothing old plays.
export function freshHome(seen, look) {
  const now = look?.jiuding?.homed ?? null;
  if (!seen || !now) return null;
  return now.find((p) => !seen.includes(p)) ?? null;
}
