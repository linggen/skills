// unease.js — her price, showing on the stage (redesign-v2 § 六 item 3).
//
// Hanli, 2026-09-25: 小异样太难看出来, 给大异样. From the fourth cauldron on,
// each chapter ended shows the price on her, BIG: her figure on the stage
// dissolves, turns to mist, loses the moon, lets the light through — then she
// is woken to say it in her own words, aloud (voice.js `unease`, the facts
// from rules/story.mjs uneaseAt). The page never writes a word for her.
//
// Pure where it can be: `uneasePlan` says what to draw; `raiseUnease` draws
// it on a document and calls `say` as it starts. Motion reduced: a gentle
// silver glow around her instead, no movement.

/* Every animation the stage knows — content.mjs UNEASE_SHOWS is the same
   list (the content lint checks companion.json against it; a test checks the
   two agree). `ms`: how long it holds (2–4 s — long enough to be seen);
   `layers`: the elements drawn over her and the stage. */
export const SHOWS = {
  // 4 · 徐 — she comes apart into silver light, is gone, and gathers again.
  dissolve: { ms: 3600, layers: ['sparks', 'flash'] },
  // 5 · 扬 — half of her turns to moonlit mist; the stage darkens.
  mist: { ms: 3800, layers: ['dim', 'mist'] },
  // 6 · 荆 — the moon over the stage goes dark; she wavers.
  moondark: { ms: 3200, layers: ['dim', 'moon'] },
  // 7 · 梁 — nearly transparent; the cauldron's light straight through her; the bell drops.
  fade: { ms: 4000, layers: ['beam', 'bell'] },
  // 8 · 雍 — the telling: the pool holds no moon; she stands in a still silver ring.
  telling: { ms: 3600, layers: ['dim', 'halo'] },
};
const STILL_MS = 3000;
const FEAT_WAIT_MS = 5000;

/* What the stage draws for one unease: the class on the stage, the layers
   (inside her body box, or over the whole view), and how long. Unknown
   shows fall back to the glow — the moment is never lost for a picture. */
export function uneasePlan(u, still = false) {
  const show = SHOWS[u?.show];
  if (still || !show) return { cls: ['unease', 'unease-still'], layers: ['glow'], ms: STILL_MS, still: true };
  return { cls: ['unease', `unease-${u.show}`], layers: show.layers, ms: show.ms, still: false };
}

/* The layers that cover the whole view (the stage darkening); the rest sit on her. */
const VIEW_LAYERS = new Set(['dim', 'moon', 'beam']);

function layerEl(doc, name) {
  const el = doc.createElement('div');
  el.className = `unease-layer unease-${name}-layer`;
  el.setAttribute('aria-hidden', 'true');
  // The bell she lets fall: a small silver bell, drawn (no emoji).
  if (name === 'bell') el.innerHTML = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M12 3a1.6 1.6 0 0 1 1.6 1.6v.5A6 6 0 0 1 18 11v4l2 2.5H4L6 15v-4a6 6 0 0 1 4.4-5.9v-.5A1.6 1.6 0 0 1 12 3Z" fill="currentColor"/><circle cx="12" cy="20" r="1.8" fill="currentColor"/></svg>';
  if (name === 'sparks') el.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  return el;
}

/* The stylesheet rides with the module: the page loads it once. */
function ensureStyle(doc) {
  if (doc.querySelector('link[data-unease]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./unease.css', import.meta.url).href;
  link.dataset.unease = '1';
  doc.head.appendChild(link);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Raise one unease: wait for a seal on the stage to clear (the new chapter's
   title), play the animation on her, and wake her (`say`) as it starts — her
   voice comes right after the picture. Nothing of it when she is not on the
   stage but her word: `say` is always called. Resolves when the picture ends. */
export async function raiseUnease(u, say, { doc = globalThis.document, still = false } = {}) {
  const view = doc?.getElementById?.('view');
  const stage = doc?.getElementById?.('stage');
  const body = stage?.querySelector?.('.body');
  if (!view || !stage || !body || stage.hidden) { say?.(); return false; }
  ensureStyle(doc);
  // The 新章 seal first: her moment comes as it clears, not under it.
  for (let t = 0; doc.querySelector('.feat') && t < FEAT_WAIT_MS; t += 200) await wait(200);
  const plan = uneasePlan(u, still);
  const drawn = plan.layers.map((name) => {
    const el = layerEl(doc, name);
    (VIEW_LAYERS.has(name) ? view : body).appendChild(el);
    return el;
  });
  stage.classList.add(...plan.cls);
  stage.style.setProperty('--unease-ms', `${plan.ms}ms`);
  say?.();
  await wait(plan.ms);
  stage.classList.remove(...plan.cls);
  stage.style.removeProperty('--unease-ms');
  for (const el of drawn) el.remove();
  return true;
}
