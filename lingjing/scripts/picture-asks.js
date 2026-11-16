// picture-asks.js — a picture that is not there is asked for once, then again only after a pause that grows.
//
// Why: a browser refetches a picture that FAILED each time the thing showing it is made again — an <img> a redraw
// writes anew (innerHTML), a CSS `background: var(--art)` whose custom property is re-resolved when any custom
// property above it changes (the stage's wind and room vars do, on every redraw). A picture that loaded comes from
// the browser's cache then; a missing one goes back to the server every time (a fight asked for one missing painting 390
// times). With art downloaded after install a picture can be absent for a while, so the page remembers what failed:
//   · the ledger — per picture: asked and failed → not asked for `firstMs`, then twice that, … up to `capMs`;
//     a picture that loads is forgotten as failed. After the pause the next draw asks again, so a picture that
//     finished downloading in the meantime appears without a reload.
//   · guardImgHtml — the HTML a draw is about to write: an <img> whose picture is in its pause is written with no src
//     (it shows what a failed one shows: its alt, or nothing), so nothing is asked for.
//   · hookHtml — puts that guard in front of every innerHTML / insertAdjacentHTML write of the page, so the many
//     templates that carry an <img> need no change.
//   · whenPicture — the stage's backdrop (a CSS background) asks through an Image first and lays its url only when
//     the picture is there.
//   · what the player sees in place of a missing picture is missing-picture.js's: both entry points here (a write the
//     guard changed, an <img> that fired `error`) hand it the element through `hooks`.
// The ledger, guardImgHtml and hookHtml are pure (an injected clock, a fake prototype in the tests).

/** The picture's key: its absolute URL without the hash (`base` resolves a relative src, as the page does). */
export function pictureKey(src, base = 'http://x/') {
  try { const u = new URL(String(src), base); u.hash = ''; return u.href; } catch { return String(src); }
}

/** The ledger. `failed(key)` a picture did not come; `loaded(key)` it did; `state(key)`: 'ok' (it loaded), 'failed'
    (it failed and the pause is not over: do not ask) or 'unknown' (never asked, or the pause is over: ask). */
export function askLedger({ now = () => Date.now(), firstMs = 15000, capMs = 120000 } = {}) {
  const bad = new Map(); // key → { misses, until }
  const good = new Set();
  return {
    failed(key) {
      good.delete(key);
      if (bad.has(key) && now() < bad.get(key).until) return; // one miss per pause: two <img> of a picture in one draw count once
      const misses = (bad.get(key)?.misses ?? 0) + 1;
      bad.set(key, { misses, until: now() + Math.min(capMs, firstMs * 2 ** (misses - 1)) });
    },
    loaded(key) { bad.delete(key); good.add(key); },
    state(key) {
      if (good.has(key)) return 'ok';
      const row = bad.get(key);
      return row && now() < row.until ? 'failed' : 'unknown';
    },
    retryIn: (key) => Math.max(0, (bad.get(key)?.until ?? 0) - now()),
    misses: (key) => bad.get(key)?.misses ?? 0,
    /** True once the last step of the pause (`capMs`) has been reached: the picture has kept failing. */
    atCap: (key) => bad.has(key) && firstMs * 2 ** (bad.get(key).misses - 1) >= capMs,
    /** True while any picture has failed (guardImgHtml's fast path: nothing to look for). */
    get any() { return bad.size > 0; },
  };
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };
const unescapeAttr = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m]);
const SRC = /\ssrc=(?:"([^"]*)"|'([^']*)')/i;

const STAND_IN_ATTRS = /\s(?:title|aria-label)=(?:"[^"]*"|'[^']*')/gi;

/** `html` with the src taken off every <img> whose picture is in its pause (kept as data-pic-missing, so a reader can
    still see which). Same string back when nothing failed. `standIn(key)` → the attributes that put a stand-in picture
    on the element (missing-picture.js `standInAttrs`), written where the src was; without it the img is left bare.
    A stand-in (data-pic-fb) is never taken for a missing picture. */
export function guardImgHtml(html, ledger, base = 'http://x/', standIn = null) {
  if (!ledger.any || typeof html !== 'string' || !html.includes('<img')) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = SRC.exec(tag);
    if (!m || /\sdata-pic-fb[\s=>/]/i.test(tag)) return tag;
    const raw = m[1] ?? m[2];
    const key = pictureKey(unescapeAttr(raw), base);
    if (/^(data|blob):/i.test(raw) || ledger.state(key) !== 'failed') return tag;
    const missing = ` data-pic-missing="${raw.replace(/"/g, '&quot;')}"`;
    if (!standIn) return tag.replace(SRC, missing);
    return tag.replace(STAND_IN_ATTRS, '').replace(SRC, missing + standIn(key));
  });
}

/** Put guardImgHtml in front of `proto`'s innerHTML setter and insertAdjacentHTML (Element.prototype in the page).
    `base` a function → the page's base URL now. `hooks` (optional): `standIn(key)` as in guardImgHtml, and
    `onWrite(element)` called after a write the guard changed (the element written into: its stand-ins are in it now).
    Idempotent. */
export function hookHtml(proto, ledger, base = () => 'http://x/', hooks = {}) {
  if (!proto || proto.__pictureGuard) return false;
  const guard = (html) => guardImgHtml(html, ledger, base(), hooks.standIn ?? null);
  const set = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  if (set?.set) {
    Object.defineProperty(proto, 'innerHTML', { ...set, set(html) { const out = guard(html); set.set.call(this, out); if (out !== html) hooks.onWrite?.(this); } });
  }
  const adj = proto.insertAdjacentHTML;
  if (typeof adj === 'function') {
    proto.insertAdjacentHTML = function insertAdjacentHTML(where, html) { const out = guard(html); const r = adj.call(this, where, out); if (out !== html) hooks.onWrite?.(this); return r; };
  }
  proto.__pictureGuard = true;
  return true;
}

/** The page's ledger. */
export const pictures = askLedger();
const baseNow = () => (typeof document === 'undefined' ? 'http://x/' : document.baseURI);
export const pictureState = (src) => pictures.state(pictureKey(src, baseNow()));
/** Milliseconds until a failed picture may be asked for again (0: now, or it never failed). */
export const pictureRetryIn = (src) => pictures.retryIn(pictureKey(src, baseNow()));

/** In the page: remember which <img>s failed or loaded (error and load do not bubble: caught on the way down), and
    guard every write of HTML. Once per page. `hooks` (missing-picture.js): `onMiss(img)` after a failure is noted (also
    for a stand-in that failed itself, which the ledger never hears of), `standIn` / `onWrite` as in hookHtml. */
export function watchPictures(doc = globalThis.document, hooks = {}) {
  if (!doc || doc.__picturesWatched) return;
  doc.__picturesWatched = true;
  const keyOf = (img) => {
    if (img.hasAttribute?.('data-pic-fb')) return null; // a stand-in is not a picture the game asks for
    const u = img.currentSrc || img.getAttribute('src');
    return u && !/^(data|blob):/i.test(u) ? pictureKey(u, doc.baseURI) : null;
  };
  doc.addEventListener('error', (e) => {
    if (e.target?.tagName !== 'IMG') return;
    const k = keyOf(e.target);
    if (k) pictures.failed(k);
    hooks.onMiss?.(e.target);
  }, true);
  doc.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG') { const k = keyOf(e.target); if (k) pictures.loaded(k); } }, true);
  hookHtml(globalThis.Element?.prototype, pictures, () => doc.baseURI, hooks);
}

const asking = new Map(); // key → the one Image in flight
/** Is the picture there? → true / false. Asked through an Image (the answer is remembered in the ledger: a failed
    picture inside its pause is not asked for, a loaded one is not asked twice). */
export function whenPicture(src) {
  const key = pictureKey(src, baseNow());
  const st = pictures.state(key);
  if (st !== 'unknown') return Promise.resolve(st === 'ok');
  if (asking.has(key)) return asking.get(key);
  const p = new Promise((done) => {
    const im = new Image();
    im.onload = () => { pictures.loaded(key); done(true); };
    im.onerror = () => { pictures.failed(key); done(false); };
    im.src = src;
  }).finally(() => asking.delete(key));
  asking.set(key, p);
  return p;
}
