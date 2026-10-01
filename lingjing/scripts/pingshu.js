// pingshu.js — 评书: the book's own telling, heard (Hanli, 2026-10-01).
//
// The audio lives on a CDN (R2, media.linggen.dev — the one place this skill
// reaches out, by his decision); git holds only the manifest,
// story/<book>/audio.json, written by tools/pingshu-publish.py:
//   {base, hui: {h01: {full: {file, bytes, secs}, paras: {<key>: {file, secs}}}}}
// A clip is one beat (a scene's paragraph — the book's words) as the 说书人
// tells it, cut from the 回's render; `full` is the whole 回.
// Every file is named by its content hash, so the browser's cache keeps it.
//
// Two uses: 对话框配音 (a beat's paragraph plays as it shows; dialogue box)
// and 听书 (a 回 finished, its whole 评书, in 录 and the reader). Nothing here
// is needed: no manifest, no clip, a file that fails — the page stays silent.
//
// The key: a paragraph's Han characters (and Latin letters and digits), the
// reader's markup gone, hashed FNV-1a 64 over UTF-8. The publisher computes
// the same in Python (tools/pingshu-publish.py `para_key`); a test holds the two.

const KEEP = /[㐀-䶿一-鿿豈-﫿0-9A-Za-z]/g;

/* What of a paragraph the key is made of: [词]{注=…} → 词, {…} gone, then only
   the Han characters, letters and digits — punctuation, quotes, dashes and
   spacing never decide a match. */
export const normPara = (text) => (String(text ?? '')
  .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .match(KEEP) ?? []).join('');

const FNV_OFFSET = 0xcbf29ce484222325n, FNV_PRIME = 0x100000001b3n, MASK = 0xffffffffffffffffn;
/* FNV-1a 64 of the UTF-8 bytes, 16 hex digits. */
export function fnv64(s) {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(s)) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK;
  return h.toString(16).padStart(16, '0');
}
/* A paragraph's key in the manifest; '' for one with nothing to say. */
export const paraKey = (text) => { const n = normPara(text); return n ? fnv64(n) : ''; };

/* ── The manifest ── */

export const EMPTY = Object.freeze({ base: '', hui: {} });
const manifestUrl = (book) => `../story/${encodeURIComponent(book)}/audio.json`;

/* The manifest as the page uses it; `?audio_base=` (a dev override, a local
   dir served before R2 is up) replaces its base. Anything wrong: EMPTY. */
export async function loadManifest(book = 'jiuding-lu', { fetcher = globalThis.fetch, search = globalThis.location?.search ?? '' } = {}) {
  try {
    const r = await fetcher(manifestUrl(book));
    if (!r.ok) return EMPTY;
    return withBase(await r.json(), new URLSearchParams(search).get('audio_base'));
  } catch { return EMPTY; }
}
export function withBase(m, override) {
  if (!m || typeof m !== 'object' || typeof m.hui !== 'object' || !m.hui) return EMPTY;
  const base = override || m.base || '';
  return { ...m, base: base && !base.endsWith('/') ? `${base}/` : base };
}

const urlOf = (m, file) => (file ? m.base + file : null);
/* Does the manifest hold anything to hear? */
export const hasAudio = (m) => Object.values(m?.hui ?? {}).some((h) => h?.full || Object.keys(h?.paras ?? {}).length);

/* A beat's clip: by its paragraph's key, in its 回 first, then any 回 (a
   passage carried into the next 回's scene). Null when there is none. */
export function clipOf(m, hui, text) {
  const key = paraKey(text);
  if (!key || !m?.hui) return null;
  const at = m.hui[hui]?.paras?.[key] ?? Object.values(m.hui).map((h) => h?.paras?.[key]).find(Boolean);
  return at ? { key, url: urlOf(m, at.file), secs: at.secs ?? null } : null;
}
/* A 回's whole 评书: {url, secs, bytes}, or null. */
export function fullOf(m, hui) {
  const f = m?.hui?.[hui]?.full;
  return f?.file ? { url: urlOf(m, f.file), secs: f.secs ?? null, bytes: f.bytes ?? null } : null;
}

/* ── Per-viewer choices (this browser only; storage may be off) ── */

const VOICE_KEY = 'lingjing.voice';
export function voiceOn(store = globalThis.localStorage) {
  try { return store?.getItem(VOICE_KEY) !== 'off'; } catch { return true; }
}
export function setVoice(on, store = globalThis.localStorage) {
  try { store?.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch { /* this load only */ }
  return on;
}
const posKey = (hui) => `lingjing.listen.${hui}`;
export function listenAt(hui, store = globalThis.localStorage) {
  try { return Number(store?.getItem(posKey(hui))) || 0; } catch { return 0; }
}
export function keepListenAt(hui, secs, store = globalThis.localStorage) {
  try { store?.setItem(posKey(hui), String(Math.floor(secs))); } catch { /* this load only */ }
}

/* ── 对话框配音 ── one Audio for the box: sync(url, token) plays url once per
   token (the beat on show — a repaint of the same beat never restarts it);
   sync(null) stops. A failed load is silence. */
export function createNarrator(make = () => new Audio()) {
  let el = null, now = null;
  const stop = () => { if (el && now) { el.pause(); el.removeAttribute('src'); el.load?.(); } now = null; };
  function sync(url, token = url) {
    if (!url) return stop();
    if (token === now) return;
    stop();
    el ??= make();
    now = token;
    el.preload = 'auto';
    el.src = url;
    el.play?.()?.catch?.(() => { /* autoplay refused or the file failed: stay silent */ });
  }
  return { sync, stop, get playing() { return now; } };
}

/* ── 听书 ── a 回's whole telling: one <audio controls> per page, kept across
   redraws (a page that paints with innerHTML moves it back into its slot) —
   play, pause and the seek bar are the browser's own; the place listened to
   is remembered per 回 in this browser. */
export const LISTEN_WORDS = { zh: { listen: '▶ 听书', title: '听书 · 评书' }, en: { listen: '▶ Listen', title: 'Listen · pingshu (Chinese)' } };

export function createListener(doc = globalThis.document) {
  let el = null, hui = null, lastKept = 0;
  const player = () => {
    if (el) return el;
    el = doc.createElement('audio');
    el.controls = true;
    el.preload = 'none';
    el.className = 'listenaudio';
    el.addEventListener('loadedmetadata', () => { const at = listenAt(hui); if (at && at < el.duration - 5) el.currentTime = at; });
    el.addEventListener('timeupdate', () => { if (Math.abs(el.currentTime - lastKept) >= 5) { lastKept = el.currentTime; keepListenAt(hui, el.currentTime); } });
    el.addEventListener('pause', () => keepListenAt(hui, el.currentTime));
    el.addEventListener('ended', () => keepListenAt(hui, 0));
    return el;
  };
  /* Open 回 `id` at `url` in `slot` and play it from where it was left. */
  function open(slot, id, url) {
    const a = player();
    if (hui !== id) { if (hui) keepListenAt(hui, a.currentTime); hui = id; lastKept = 0; a.src = url; }
    slot.replaceChildren(a);
    a.play?.()?.catch?.(() => {});
  }
  /* After a repaint: the player goes back into its 回's slot, if it still stands. */
  function remount(root) {
    if (!el || !hui) return;
    const slot = root?.querySelector?.(`[data-listen-slot="${hui}"]`);
    if (slot && el.parentNode !== slot) slot.replaceChildren(el);
  }
  return { open, remount, get hui() { return hui; } };
}

/* The 听书 control for a 回 with a whole telling: a button that becomes the
   player. '' when the manifest has none. */
export function listenHtml(m, hui, lang = 'zh', esc = (s) => s) {
  const f = fullOf(m, hui);
  if (!f) return '';
  const w = LISTEN_WORDS[lang] ?? LISTEN_WORDS.zh;
  return `<div class="listen" data-listen-slot="${esc(hui)}"><button class="act quiet listenbtn" data-listen="${esc(hui)}" data-listen-url="${esc(f.url)}" title="${esc(w.title)}">${esc(w.listen)}</button></div>`;
}
