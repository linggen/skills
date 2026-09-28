// rules/scrolls.mjs — A thing in the bag read as a scroll: 《吐纳经》 and its nine layers.
// Part of the rules engine; rules.mjs is its one door.
//
// 银月 leaves the child a scroll of breathing (story/huxian-bing/90-附录·吐纳经.md):
// real Daoist classics quoted exactly, each with her gloss, and the nine layers
// of 练气, each with its 功课 (worlds/<id>/scrolls.json). An item's `reads`
// names the scroll; opened in the pouch it shows the passage for the layer the
// player stands on, and Look hands Ling that layer's 功课 as the practice hint.
import { pick } from '../state.mjs';

const scrollOf = (content, id) => content.scrolls?.scrolls?.[id] ?? null;

/* The layer the player reads: their step inside the scroll's own tier; the
   first before it, the last past it. */
function layerOf(content, state, scroll) {
  const tiers = content.ladder.tiers.map(t => t.id), at = tiers.indexOf(state.tier), home = tiers.indexOf(scroll.tier);
  const n = at < home ? 1 : at > home ? scroll.layers.length : Math.min((state.step ?? 0) + 1, scroll.layers.length);
  return scroll.layers[n - 1];
}

/* The scroll as the pouch opens it: the layer, its 功课, and its passage —
   the classic's words exactly (an English gloss of them beside, in English),
   and 银月's note. */
export function readingOf(content, state, id) {
  const scroll = scrollOf(content, id);
  if (!scroll) return null;
  const lang = state.lang, layer = layerOf(content, state, scroll), p = scroll.passages[layer.reads];
  return {
    scroll: pick(scroll.title, lang), layer: layer.n, name: pick(layer.name, lang), note: pick(layer.note, lang) ?? null,
    gongke: pick(layer.gongke, lang), source: pick(layer.source, lang),
    passage: {
      title: pick(p.title, lang),
      quotes: p.quotes.map(q => ({ text: q.zh, source: q.source, ...(lang === 'en' && q.en ? { en: q.en } : {}) })),
      gloss: pick(p.gloss, lang),
    },
  };
}

/* The day's 功课 from the scroll in the bag, for Ling — one line: which layer, what to do. */
export function practiceHint(content, state) {
  const item = (content.items?.items ?? []).find(i => i.reads && state.bag?.[i.id] > 0);
  const scroll = item ? scrollOf(content, item.reads) : null;
  if (!scroll) return null;
  const layer = layerOf(content, state, scroll), lang = state.lang;
  return { scroll: pick(scroll.title, lang), layer: layer.n, name: pick(layer.name, lang), gongke: pick(layer.gongke, lang) };
}
