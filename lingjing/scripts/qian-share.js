// qian-share.js — 问签 v2's share image (Hanli 2026-11-02): the card as one vertical picture, drawn page-side on a
// canvas — the 签 number and grade, the 签诗 in ink, the 白话签解, the 五项, today's 宜忌 (no 宜 row on a day without),
// 银月's line, the date and 「灵境 · linggen.dev」 at the foot; a friend's card adds the friend's 称呼.
// NEVER on it: a birthday, a 生肖 or 星座 (they come from one), his 名字, his 修为 or anything else of his save —
// `shareLines` reads only the fields named below, and the painter draws only what `shareLines` gives (tested).
// Then 分享 (navigator.share with the PNG, where the browser can), 拷贝图片 (an image/png ClipboardItem) and 保存图片.

const W = 1080, PAD = 84;
/* A fixed paper and ink — the game's 宣纸 look, never the theme's (a dark Mac still shares paper). */
export const PAPER = { ground: '#F1ECE1', edge: '#DCD3C1', ink: '#2B2620', dim: '#6E6457', seal: '#A8352B', ling: '#8A6A3B', her: '#4F6A86' };
const SERIF = ['Noto Serif SC', 'Songti SC', 'STSong', 'Source Han Serif SC', 'SimSun'];

const SHARE_WORDS = {
  zh: { no: '第{n}签', forOf: '替 {name} 求签', jie: '白话签解（灵境自译）', yi: '宜', ji: '忌', her: '银月', brand: '灵境 · linggen.dev', date: '{y}年{m}月{d}日' },
  en: { no: 'Stick {n}', forOf: 'Drawn for {name}', jie: 'In plain words (the game\'s own)', yi: 'Good for', ji: 'Avoid', her: 'Yinyue', brand: 'Lingjing · linggen.dev', date: '{y}-{m}-{d}' },
};
const say = (tpl, fill) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');

/* What the picture says, in order — `{role, text}` rows, and nothing else is drawn. `d`: a reading (his divination or
   a friend's); `friend`: the 称呼 (a friend's card) or null; `her`: 银月's line, or null. */
export function shareLines(d, { friend = null, her = null, lang = 'zh' } = {}) {
  if (!d?.poem) return [];
  const w = SHARE_WORDS[lang === 'en' ? 'en' : 'zh'], zh = lang !== 'en';
  const [y, m, dd] = String(d.day ?? '').split('-');
  const rows = [{ role: 'head', text: say(w.no, { n: d.n }) }, { role: 'grade', text: d.grade?.name ?? '' }];
  if (friend) rows.push({ role: 'for', text: say(w.forOf, { name: friend }) });
  for (const l of d.poem) rows.push({ role: 'poem', text: l });
  if (d.jie) rows.push({ role: 'label', text: w.jie }, { role: 'jie', text: d.jie });
  for (const a of d.aspects ?? []) rows.push({ role: 'aspect', text: `${a.name}${zh ? '　' : ' · '}${a.line}` });
  const al = d.almanac;
  if (al?.yi?.length) rows.push({ role: 'yi', text: `${w.yi}${zh ? '　' : ': '}${al.yi.map((x) => x.name).join(zh ? '、' : ', ')}` });
  if (al?.ji?.length) rows.push({ role: 'ji', text: `${w.ji}${zh ? '　' : ': '}${al.ji.map((x) => x.name).join(zh ? '、' : ', ')}` });
  if (her) rows.push({ role: 'her', text: `${w.her}${zh ? '：' : ': '}${her}` });
  if (y) rows.push({ role: 'date', text: say(w.date, { y, m: zh ? String(Number(m)) : m, d: zh ? String(Number(dd)) : dd }) });
  rows.push({ role: 'brand', text: w.brand });
  return rows;
}

/* Every character the picture draws — for the font check. */
export const shareChars = (rows) => [...new Set(rows.map((r) => r.text).join(''))].join('');

/* The first of the game's serif families this browser really has (a width test against a bare fallback), else the
   generic serif. The page ships no CJK web font (the game's --serif is a system stack), so there is no subset to
   miss a character: Songti SC / Noto Serif SC cover GB2312 and beyond; a missing one draws in the system's fallback. */
export function shareFont(ctx2d, chars = '灵境签') {
  const probe = `${chars}mmwwlli`;
  const width = (f) => { ctx2d.font = `40px ${f}`; return ctx2d.measureText(probe).width; };
  for (const fam of SERIF) {
    const a = width(`"${fam}", monospace`), b = width('monospace');
    const c = width(`"${fam}", sans-serif`), e = width('sans-serif');
    if (a !== b || c !== e) return `"${fam}", serif`;
  }
  return 'serif';
}

/* Lines broken to a width, character by character (CJK has no spaces; English breaks at spaces when it can). */
function wrap(ctx2d, text, max) {
  const out = [];
  let line = '';
  for (const ch of [...text]) {
    const next = line + ch;
    if (ctx2d.measureText(next).width <= max || !line) { line = next; continue; }
    const sp = line.lastIndexOf(' ');
    if (/[a-z]/i.test(ch) && sp > 0) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; } else { out.push(line); line = ch; }
  }
  if (line) out.push(line);
  return out;
}

const STYLE = {
  head: { size: 40, color: 'dim', gap: 0 },
  grade: { size: 64, color: 'seal', weight: 700, gap: 8 },
  for: { size: 36, color: 'ling', gap: 18 },
  poem: { size: 62, color: 'ink', weight: 600, gap: 0 },
  label: { size: 28, color: 'dim', gap: 40 },
  jie: { size: 36, color: 'ink', gap: 10, lh: 1.6 },
  aspect: { size: 34, color: 'ink', gap: 12 },
  yi: { size: 34, color: 'ling', gap: 22 },
  ji: { size: 34, color: 'seal', gap: 12 },
  her: { size: 34, color: 'her', gap: 34, lh: 1.6 },
  date: { size: 28, color: 'dim', gap: 48 },
  brand: { size: 30, color: 'ling', gap: 10 },
};

/* The picture, on a canvas the page hands in (document.createElement('canvas')); returns the rows drawn — exactly
   `rows`, in order: the test reads them back. */
export function paintShare(canvas, rows, { font = null } = {}) {
  const g = canvas.getContext('2d');
  const fam = font ?? shareFont(g, shareChars(rows));
  const setFont = (st) => { g.font = `${st.weight ?? 400} ${st.size}px ${fam}`; };
  // Lay out first (the poem as four columns, right to left, the old way; the rest as lines), then size and paint.
  const poem = rows.filter((r) => r.role === 'poem');
  const colW = 104, poemH = Math.max(...poem.map((r) => [...r.text].length), 7) * 70 + 20;
  const plan = [];
  let y = PAD + 10, poemDone = false;
  for (const r of rows) {
    const st = STYLE[r.role] ?? STYLE.jie;
    if (r.role === 'poem') {
      if (poemDone) continue;
      poemDone = true;
      y += 46;
      plan.push({ kind: 'poem', y, rows: poem });
      y += poemH + 10;
      continue;
    }
    setFont(st);
    y += st.gap;
    const lines = wrap(g, r.text, W - PAD * 2);
    for (const l of lines) { y += st.size * (st.lh ?? 1.35); plan.push({ kind: 'line', st, text: l, y, center: ['head', 'grade', 'for', 'date', 'brand'].includes(r.role) }); }
  }
  const H = Math.ceil(y + PAD);
  canvas.width = W; canvas.height = H;
  // Paper: the ground, a fine edge, a faint ink wash at the foot.
  g.fillStyle = PAPER.ground; g.fillRect(0, 0, W, H);
  const wash = g.createLinearGradient(0, H * 0.6, 0, H);
  wash.addColorStop(0, 'rgba(43,38,32,0)'); wash.addColorStop(1, 'rgba(43,38,32,0.07)');
  g.fillStyle = wash; g.fillRect(0, 0, W, H);
  g.strokeStyle = PAPER.edge; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.textBaseline = 'alphabetic';
  for (const p of plan) {
    if (p.kind === 'poem') {
      const st = STYLE.poem; setFont(st); g.fillStyle = PAPER.ink; g.textAlign = 'center';
      const x0 = W / 2 + ((p.rows.length - 1) * colW) / 2;
      p.rows.forEach((r, i) => [...r.text].forEach((ch, j) => g.fillText(ch, x0 - i * colW, p.y + st.size + j * 70)));
      continue;
    }
    setFont(p.st); g.fillStyle = PAPER[p.st.color] ?? PAPER.ink;
    g.textAlign = p.center ? 'center' : 'left';
    g.fillText(p.text, p.center ? W / 2 : PAD, p.y);
  }
  return rows;
}

/* The PNG of a reading, ready before any tap (Safari wants share and the clipboard inside the tap itself). */
export function shareBlob(rows, doc = document) {
  const c = doc.createElement('canvas');
  paintShare(c, rows);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no png'))), 'image/png'));
}

const fileName = (d, friend) => `lingjing-qian-${d?.day ?? 'today'}-${d?.n ?? ''}${friend ? '-friend' : ''}.png`;

/* What this browser can do with a picture: share it (files), copy it (image/png), save it. */
export function shareCan(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const probe = typeof File === 'function' ? new File([new Uint8Array(1)], 'x.png', { type: 'image/png' }) : null;
  let files = false;
  try { files = Boolean(nav?.canShare && probe && nav.canShare({ files: [probe] })); } catch { files = false; }
  return { share: files, copy: Boolean(nav?.clipboard?.write && typeof ClipboardItem === 'function'), save: true };
}

/* 分享: the system sheet (Messages, AirDrop …). Call inside the tap with the blob already made. */
export async function sharePng(blob, d, friend) {
  const file = new File([blob], fileName(d, friend), { type: 'image/png' });
  await navigator.share({ files: [file] });
  return 'shared';
}
/* 拷贝图片: onto the clipboard as image/png (pastes into WeChat desktop). A promise of the blob is fine inside the tap. */
export async function copyPng(blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
  return 'copied';
}
/* 保存图片: a download. */
export function savePng(blob, d, friend, doc = document) {
  const url = URL.createObjectURL(blob), a = doc.createElement('a');
  a.href = url; a.download = fileName(d, friend);
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'saved';
}
