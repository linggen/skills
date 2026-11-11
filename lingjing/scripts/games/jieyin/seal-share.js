// seal-share.js — 师父传印's share picture (Hanli 2026-11-10: after the 考, a card that can be shared, copied or saved;
// sharing it is the day's 传音). Drawn page-side on a canvas like the 签's (qian-share.js, whose paper, font check and three
// actions it uses): the master's line, the seal's name and its gesture figures, how it is made. NEVER on it: a camera frame,
// his name, his 修为, anything else of his save — `sealRows` reads only the card's fields named below (rules/seals.mjs
// cardView: words and the figures' strokes), and the painter draws only what it gives (tested).
//
//   sealRows(card) → [{ role, text }… | { role: 'figs', figs }]     (the picture's content, in order)
//   paintSeal(canvas, rows, { font }) → rows
//   sealBlob(rows, doc) → Promise<Blob>
import { PAPER, copyPng, shareCan, shareFont } from '../../qian-share.js';

const W = 1080, PAD = 84;
export { copyPng, shareCan };
const fileName = (card) => `lingjing-seal-${card?.id ?? 'seal'}-${card?.day ?? 'today'}.png`;
/** 分享: the system sheet. Call inside the tap with the blob already made. */
export async function sharePng(blob, card) {
  await navigator.share({ files: [new File([blob], fileName(card), { type: 'image/png' })] });
  return 'shared';
}
/** 保存图片: a download. */
export function savePng(blob, card, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = fileName(card);
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'saved';
}

/** What the picture says, in order. `card`: rules/seals.mjs cardView's answer (zh or en by the save). */
export function sealRows(card) {
  if (!card?.figures?.length) return [];
  const rows = [{ role: 'head', text: card.head }, { role: 'name', text: card.learned }];
  rows.push({ role: 'figs', figs: card.figures.map((f) => ({ name: f.name, glyph: f.glyph, hands: f.hands })) });
  if (card.line) rows.push({ role: 'line', text: card.line });
  if (card.does) rows.push({ role: 'does', text: card.does });
  if (card.day) rows.push({ role: 'date', text: card.day });
  rows.push({ role: 'brand', text: card.brand });
  return rows;
}

/** Every character the picture draws — for the font check. */
export const sealChars = (rows) => [...new Set(rows.flatMap((r) => (r.role === 'figs' ? r.figs.map((f) => f.name + f.glyph) : [r.text])).join(''))].join('');

const STYLE = {
  head: { size: 40, color: 'dim', gap: 0, center: true },
  name: { size: 68, color: 'seal', weight: 700, gap: 14, center: true },
  line: { size: 38, color: 'ink', gap: 36, lh: 1.6 },
  does: { size: 32, color: 'dim', gap: 14, lh: 1.5 },
  date: { size: 28, color: 'dim', gap: 46, center: true },
  brand: { size: 30, color: 'ling', gap: 10, center: true },
};

function wrap(g, text, max) {
  const out = [];
  let line = '';
  for (const ch of [...String(text)]) {
    const next = line + ch;
    if (g.measureText(next).width <= max || !line || /[，。；：、！？）」』,.;:!?)]/.test(ch)) { line = next; continue; }
    const sp = line.lastIndexOf(' ');
    if (/[a-z]/i.test(ch) && sp > 0) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; } else { out.push(line); line = ch; }
  }
  if (line) out.push(line);
  return out;
}

/** One figure's strokes (a 100-box) in ink on the canvas, its top-left at (x, y), `s` px a side. */
export function paintFigure(g, hands, x, y, s) {
  const k = s / 100;
  for (const h of hands) {
    g.fillStyle = 'rgba(43,38,32,.26)'; g.strokeStyle = 'rgba(43,38,32,.35)'; g.lineJoin = 'round';
    g.lineWidth = 2 * k * 3;
    g.beginPath();
    h.poly.forEach(([px, py], i) => (i ? g.lineTo(x + px * k, y + py * k) : g.moveTo(x + px * k, y + py * k)));
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(43,38,32,.88)'; g.lineCap = 'round';
    for (const [x1, y1, x2, y2, w] of h.lines) { g.lineWidth = Math.max(1.5, w * k); g.beginPath(); g.moveTo(x + x1 * k, y + y1 * k); g.lineTo(x + x2 * k, y + y2 * k); g.stroke(); }
    g.fillStyle = PAPER.ink;
    for (const [dx, dy, r] of h.dots) { g.beginPath(); g.arc(x + dx * k, y + dy * k, Math.max(1.5, r * k), 0, Math.PI * 2); g.fill(); }
  }
}

export function paintSeal(canvas, rows, { font = null } = {}) {
  const g = canvas.getContext('2d');
  const fam = font ?? shareFont(g, sealChars(rows));
  const setFont = (st) => { g.font = `${st.weight ?? 400} ${st.size}px ${fam}`; };
  const plan = [];
  let y = PAD + 10;
  const FIG = 230, NAME = 28;
  for (const r of rows) {
    if (r.role === 'figs') {
      y += 40;
      plan.push({ kind: 'figs', y, figs: r.figs });
      y += FIG + NAME + 40;
      continue;
    }
    const st = STYLE[r.role] ?? STYLE.line;
    setFont(st);
    y += st.gap;
    for (const l of wrap(g, r.text, W - PAD * 2)) { y += st.size * (st.lh ?? 1.35); plan.push({ kind: 'line', st, text: l, y }); }
  }
  const H = Math.ceil(y + PAD);
  canvas.width = W; canvas.height = H;
  g.fillStyle = PAPER.ground; g.fillRect(0, 0, W, H);
  const wash = g.createLinearGradient(0, H * 0.6, 0, H);
  wash.addColorStop(0, 'rgba(43,38,32,0)'); wash.addColorStop(1, 'rgba(43,38,32,0.07)');
  g.fillStyle = wash; g.fillRect(0, 0, W, H);
  g.strokeStyle = PAPER.edge; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.textBaseline = 'alphabetic';
  for (const p of plan) {
    if (p.kind === 'figs') {
      const n = p.figs.length, gap = 36, total = n * FIG + (n - 1) * gap, x0 = Math.max(PAD, (W - total) / 2);
      p.figs.forEach((f, i) => {
        const x = x0 + i * (FIG + gap);
        paintFigure(g, f.hands, x, p.y, FIG);
        g.font = `400 ${NAME}px ${fam}`; g.fillStyle = PAPER.dim; g.textAlign = 'center';
        g.fillText(`${f.glyph ? `${f.glyph} ` : ''}${f.name}`, x + FIG / 2, p.y + FIG + NAME + 8);
      });
      continue;
    }
    setFont(p.st); g.fillStyle = PAPER[p.st.color] ?? PAPER.ink;
    g.textAlign = p.st.center ? 'center' : 'left';
    g.fillText(p.text, p.st.center ? W / 2 : PAD, p.y);
  }
  return rows;
}

/** The PNG, ready before any tap (Safari wants share and the clipboard inside the tap itself). */
export function sealBlob(rows, doc = document) {
  const c = doc.createElement('canvas');
  paintSeal(c, rows);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no png'))), 'image/png'));
}
