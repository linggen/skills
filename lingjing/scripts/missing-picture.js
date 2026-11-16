// missing-picture.js — what the player sees where a picture is not there: Yinyue, drawn small, with a short line from her.
// Never a broken-image icon, an empty box or an error text.
//
// Two states, decided by facts the page already has (picture-asks.js's ledger, the engine's /api/assets report):
//   wait  the picture failed but may still come (its first misses, inside the back-off) → the sleeping fox,
//         「这张画还在路上，等一等。」
//   lost  it has kept failing (the ledger's last back-off step, or the engine says what is left is failing) → Yinyue
//         standing with her hands on her hips, 「这张画我没找到。」
// Size: a slot of 96 px or more on its short side shows the picture and the line (a caption laid over its foot);
// a smaller one (hand cards, chips, thumbnails) shows the small picture only, the line as its title / aria-label.
// The picture that arrives later replaces the stand-in without a reload: each stand-in asks again when the ledger's pause
// ends (whenPicture), and puts the real src back when it is there.
// The stand-ins live in the game's shared art (art-packs.mjs: the literals below put them in `core`, never fetched).
// If a stand-in fails to load itself it does not recurse: the line alone on a plain tinted panel.
// The play bot still sees the hole: the element keeps `data-pic-missing` (the real src), and the request for the real
// picture was a failed one.
//
// The pure parts (state, size rule, line, attributes, the engine's word) are exported and tested; `missingPictures` is
// the DOM binding, with its environment injected.
import { pictureKey } from './picture-asks.js';

export const FALLBACK = { wait: 'art/fallback/yinyue-on-its-way.webp', lost: 'art/fallback/yinyue-not-found.webp' };
export const BIG_SIDE = 96;
/** A stand-in that failed too: nothing to draw, the panel is tinted by CSS (img[data-pic-panel]). */
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const ENGINE_EVERY_MS = 30000;

/** 'wait' or 'lost'. `engineFailing`: the engine says what is still to come is failing (engineFailsAll). */
export const picState = (ledger, key, engineFailing = false) => (engineFailing || ledger.atCap(key) ? 'lost' : 'wait');

/** Picture and line (true) or the small picture alone (false) — by the slot's short side. */
export const showsCaption = (width, height) => Math.min(Number(width) || 0, Number(height) || 0) >= BIG_SIDE;

/** Her line for a state, from the page's words table for the language (cards.js WORDS: picWait, picLost). */
export const lineOf = (state, words) => (state === 'lost' ? words?.picLost : words?.picWait) ?? '';

/** The engine's /api/assets/<skill> report → does it say that EVERY pack still incomplete is failing for all it lacks?
    The report counts per pack, not per file, so only then is any missing picture sure to be a failing one. */
export function engineFailsAll(report) {
  const open = (Array.isArray(report?.packs) ? report.packs : []).filter((p) => (p.held_files ?? 0) < (p.files ?? 0));
  return open.length > 0 && open.every((p) => (p.failing ?? 0) >= p.files - (p.held_files ?? 0));
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The attributes that put a stand-in on an <img>, as HTML text (the guard writes them into a template). */
export const standInAttrs = (state, line, url) => ` src="${attr(url)}" data-pic-fb="${state}" title="${attr(line)}" aria-label="${attr(line)}"`;

/** The binding. env: { ledger, probe(src) → Promise<bool>, urlOf(fallbackFile), words() → {picWait, picLost}, base() → the
    page's base URL, report() → Promise<engine report | null>, doc (createElement), now, timers: {set, clear}, observe(el, fn) →
    stop }. Returns { standIn(key), onWrite(el), onMiss(img) } for watchPictures, and `note(el, src)` for a CSS backdrop. */
export function missingPictures(env) {
  const { ledger, probe, urlOf, words, base, doc } = env;
  const now = env.now ?? (() => Date.now());
  const timers = env.timers ?? { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) };
  const sites = new WeakMap(); // img → { cap, timer, stop }
  const engine = { failing: false, at: -Infinity, gone: false }; // gone: the engine has no report for this skill (404, down): never asked again

  const refreshEngine = () => {
    if (!env.report || engine.gone || now() - engine.at < ENGINE_EVERY_MS) return;
    engine.at = now();
    Promise.resolve(env.report()).then((r) => { if (r == null) engine.gone = true; else engine.failing = engineFailsAll(r); }).catch(() => { engine.gone = true; });
  };
  const stateOf = (src) => picState(ledger, pictureKey(src, base()), engine.failing);
  const line = (state) => lineOf(state, words());
  const standIn = (key) => { const s = picState(ledger, key, engine.failing); return standInAttrs(s, line(s), urlOf(FALLBACK[s])); };

  const dressAs = (img, state) => {
    img.setAttribute('src', urlOf(FALLBACK[state]));
    img.setAttribute('data-pic-fb', state);
    img.setAttribute('title', line(state));
    img.setAttribute('aria-label', line(state));
    img.removeAttribute('data-pic-panel');
  };
  const undress = (img) => {
    for (const a of ['data-pic-missing', 'data-pic-fb', 'data-pic-panel', 'title', 'aria-label']) img.removeAttribute(a);
  };

  function sizeUp(img, site) { // the caption: only in a slot big enough, laid over the picture's foot
    if (!img.isConnected) return release(img, site);
    const r = img.getBoundingClientRect();
    if (!showsCaption(r.width, r.height)) { site.cap?.remove(); site.cap = null; return; }
    if (!site.cap) { site.cap = doc.createElement('span'); site.cap.className = 'pic-cap'; site.cap.setAttribute('aria-hidden', 'true'); img.after(site.cap); }
    site.cap.textContent = line(img.getAttribute('data-pic-fb') === 'lost' ? 'lost' : 'wait');
    Object.assign(site.cap.style, { left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px` });
  }
  function release(img, site) {
    timers.clear(site.timer); site.stop?.(); site.cap?.remove(); site.cap = null; sites.delete(img);
  }
  function again(img, site) { // when the ledger's pause is over: ask once; there → the picture comes back, else look again
    const orig = img.getAttribute('data-pic-missing');
    timers.clear(site.timer);
    site.timer = timers.set(async () => {
      if (!img.isConnected || !orig) return release(img, site);
      const there = await probe(orig);
      if (!img.isConnected) return release(img, site);
      if (there) { release(img, site); undress(img); img.setAttribute('src', orig); return; }
      refreshEngine();
      if (!img.hasAttribute('data-pic-panel')) dressAs(img, stateOf(orig));
      sizeUp(img, site);
      again(img, site);
    }, ledger.retryIn(pictureKey(orig, base())) + 250);
  }
  function watch(img) {
    if (sites.has(img)) return;
    const site = { cap: null, timer: null, stop: null };
    sites.set(img, site);
    sizeUp(img, site);
    site.stop = env.observe?.(img, () => sizeUp(img, site)) ?? null;
    again(img, site);
  }

  /** An <img> that fired `error`: the real src goes to data-pic-missing, the stand-in takes its place. A stand-in that
      failed itself becomes the panel (the line alone) and is never replaced again. */
  function onMiss(img) {
    if (img.hasAttribute('data-pic-fb')) {
      img.setAttribute('src', BLANK);
      img.setAttribute('data-pic-panel', '');
      watch(img);
      return;
    }
    const raw = img.getAttribute('src');
    if (!raw || /^(data|blob):/i.test(raw)) return;
    refreshEngine();
    img.setAttribute('data-pic-missing', raw);
    dressAs(img, stateOf(raw));
    watch(img);
  }
  /** After a template was written with stand-ins in it: the ones in `root` get their caption and their second look. */
  function onWrite(root) {
    for (const img of root.querySelectorAll?.('img[data-pic-fb][data-pic-missing]') ?? []) watch(img);
    refreshEngine();
  }

  /** A CSS backdrop that is missing keeps its plain look; the line is written once, small, in the stage's corner.
      `src` null (it is there, or there is none) takes the line away. `el` is the backdrop element. */
  function note(el, src) {
    const host = el.parentNode; // beside the backdrop, not in it: the backdrop is faded and hidden from readers
    let n = host?.querySelector?.('.pic-corner') ?? null;
    if (!src) { n?.remove(); return; }
    refreshEngine();
    if (!host) return;
    if (!n) { n = doc.createElement('span'); n.className = 'pic-corner'; host.appendChild(n); }
    n.textContent = line(stateOf(src));
  }

  return { standIn, onWrite, onMiss, note };
}
