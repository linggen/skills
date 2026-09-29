// marks.js — the animation layer over a figure: a note's `marks` (points and
// paths in 0–1 of the picture) as one inline SVG laid over the <img>. Generic:
// it knows nothing of 三关 — 河图洛书, 五行, 九宫 can bring their own marks.
// marksSvg is pure (read-md.js renders it, the tests read it); playMarks and
// wireMarks run it on the page.
import { esc } from './esc.js';

const FLOW = 2.4; // seconds for the qi to run a path end to end

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/// How far along the path (0–1) the vertex nearest a point sits: its light waits for the flow.
function along(d, p) {
  let total = 0, at = 0, best = Infinity;
  const run = d.map((v, i) => (total += i ? len(d[i - 1], v) : 0));
  d.forEach((v, i) => { const dist = len(v, [p.x, p.y]); if (dist < best) { best = dist; at = run[i]; } });
  return total ? at / total : 0;
}

/// `marks`: { ratio: height/width, points: [{id, label, x, y, side?}], paths: [{id, d: [[x, y]…], through: [point ids], at?, tone?}] }.
/// A path's flow starts `at` seconds in (the 三关 climb, then the 任脉 down the
/// front: one 小周天), wears its `tone` (du · ren — each channel its colour) and
/// carries arrows the way the qi goes; a point's label sits left of it, or right
/// with `side: "r"`. Empty or missing marks draw nothing.
export function marksSvg(marks, lang = 'zh') {
  const points = marks?.points ?? [], paths = marks?.paths ?? [];
  if (!points.length && !paths.length) return '';
  const H = 100 * (Number(marks.ratio) || 1);
  const xy = ([x, y]) => `${(x * 100).toFixed(2)} ${(y * H).toFixed(2)}`;
  const label = (l) => (l && typeof l === 'object' ? l[lang] ?? l.zh ?? l.en : l ?? '');
  const at = (p) => Math.max(0, Number(p?.at) || 0);
  const tone = (p) => (p.tone && /^[a-z]+$/.test(p.tone) ? ` m-${p.tone}` : '');
  const lines = paths.map((p) => {
    const d = `M${p.d.map(xy).join(' L')}`;
    return `<path class="m-way${tone(p)}" d="${d}" pathLength="100" marker-mid="url(#m-arrow-${p.tone && /^[a-z]+$/.test(p.tone) ? p.tone : 'way'})"/><path class="m-flow${tone(p)}" d="${d}" pathLength="100" style="--at:${at(p).toFixed(2)}s"/>`;
  }).join('');
  const dots = points.map((p) => {
    const path = paths.find((q) => q.through?.includes(p.id));
    const t = path ? at(path) + along(path.d, p) * FLOW : 0;
    const [x, y] = xy([p.x, p.y]).split(' ').map(Number);
    const right = p.side === 'r';
    return `<g class="m-pt${tone(path ?? {})}" data-mark="${esc(p.id)}" style="--t:${t.toFixed(2)}s"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2"/><text x="${(right ? x + 4 : x - 4).toFixed(2)}" y="${y.toFixed(2)}"${right ? ' class="r"' : ''}>${esc(label(p.label))}</text></g>`;
  }).join('');
  // An arrow at each bend, the way the qi runs, in its channel's colour (codex.css).
  const tones = [...new Set(paths.map((p) => (p.tone && /^[a-z]+$/.test(p.tone) ? p.tone : 'way')))];
  const arrow = tones.length ? `<defs>${tones.map((t) => `<marker id="m-arrow-${t}" class="m-${t}" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 L5 3 L1 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('')}</defs>` : '';
  return `<svg class="marks" viewBox="0 0 100 ${H.toFixed(2)}" aria-hidden="true">${arrow}${lines}${dots}</svg>`;
}

/// Run the qi once: the flow climbs, each point lights as it passes. Again on
/// a call (the animation restarts), never on its own.
export function playMarks(svg) {
  if (!svg) return;
  svg.classList.remove('play');
  void svg.getBoundingClientRect();
  svg.classList.add('play');
}

/// Every figure with marks plays once when it first comes into view; hover or
/// a tap on its words plays it again.
export function wireMarks(root) {
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    seen.unobserve(e.target);
    playMarks(e.target.querySelector('svg.marks'));
  }), { threshold: 0.5 });
  root.querySelectorAll('.notefig').forEach((f) => { if (f.querySelector('svg.marks')) seen.observe(f); });
  const replay = (e) => {
    const n = e.target.closest?.('.gloss')?.closest('.noted');
    if (n) requestAnimationFrame(() => playMarks(n.querySelector('svg.marks')));
  };
  root.addEventListener('mouseover', (e) => { if (!e.relatedTarget?.closest?.('.gloss')) replay(e); });
  root.addEventListener('click', replay);
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') replay(e); });
}
