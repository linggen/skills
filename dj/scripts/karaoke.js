// karaoke.js — the full-screen karaoke stage (its own page). Plays a song over
// big synced lyrics, or a karaoke video (lyrics burned in, vocals gone). The
// library page hands off a queue via localStorage('dj:karaoke'); the rest is
// read from library.json. The mic and mix live in karaoke-mix.js, the up-next
// drawer in karaoke-drawer.js.

import { runBash, sq, writeFile, home, runAction, filesOnDisk, serveCopyCmd, FFMPEG_SH, SCRIPTS } from './bash.js';
import { parseLrc } from './player.js';
import { loadLibrary, loadConfig, trackKey } from './library.js';
import { downloadTrack, downloadKaraoke } from './download.js';
import { attachLyrics } from './lyrics.js';
import { KaraokeAudio } from './karaoke-audio.js';
import { createDrawer } from './karaoke-drawer.js';
import { wireMix, wireSetup } from './karaoke-mix.js';
import { esc, makeToast } from './ui.js';

const kaudio = new KaraokeAudio();
const toast = makeToast('ktoast');

const $ = (sel) => document.querySelector(sel);
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

const stage = $('#stage');
const video = $('#kv');
const audio = $('#ka');

const state = {
  config: {},
  library: { tracks: [] },
  queue: [],
  index: 0,
  mode: 'audio', // 'audio' (mp3 + big lyrics) | 'video' (karaoke .mp4)
  source: 'audio', // the setting: which karaoke source to fetch — 'audio' | 'video'
  playingSrc: 'original', // what's on air — 'original' | 'karaoke' | 'video'
  fetchingKind: null, // which source is downloading — 'karaoke' | 'video' | null
  lines: [],
  activeIdx: -1,
  offset: 0, // seconds to shift the .lrc so it lines up with the karaoke audio
  busy: false,
};

const media = () => (state.mode === 'video' ? video : audio);
const track = () => state.queue[state.index];

const drawer = createDrawer({ state, go: (i) => go(i), stage });

// What of the current song is on disk, asked in ONE round trip per song
// instead of a shell call per question.
let have = new Set();
const checkDisk = async (t) => { have = await filesOnDisk([t.file, t.karaoke_audio, t.karaoke_video]); };
const onDisk = (p) => !!p && have.has(p);

// ── boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  [state.config, state.library] = await Promise.all([loadConfig(), loadLibrary()]);
  state.source = state.config.karaoke_source === 'video' ? 'video' : 'audio';
  state.queue = resolveQueue();
  if (!state.queue.length) {
    $('#lyrics').innerHTML = `<div class="kempty">Nothing to sing yet.<br><button class="kbtn" id="goback">← Back to library</button></div>`;
    stage.classList.add('audio');
    $('#goback').onclick = back;
    return;
  }
  wireMedia(video);
  wireMedia(audio);
  wireControls();
  wireAutoHide();
  drawer.open(); // the up-next list rides along by default
  await load(track());
})();

// The library page writes { ids:[key], start:key }; opened cold, the whole
// library with files.
function resolveQueue() {
  const withFile = (state.library.tracks || []).filter((t) => t.file);
  let handoff = null;
  try { handoff = JSON.parse(localStorage.getItem('dj:karaoke') || 'null'); } catch { /* ignore */ }
  const byKey = new Map(withFile.map((t) => [trackKey(t), t]));
  const q = Array.isArray(handoff?.ids) ? handoff.ids.map((id) => byKey.get(id)).filter(Boolean) : withFile;
  const i = handoff?.start ? q.findIndex((t) => trackKey(t) === handoff.start) : -1;
  if (i > 0) state.index = i;
  return q;
}

// ── load + play a song ───────────────────────────────────────────────────────
// Every load takes a ticket. A skip while a slow load is still fetching lyrics
// or karaoke issues a new one, and the old load stops at its next step instead
// of playing its song over the new one.
let loadSeq = 0;

async function load(t) {
  const seq = ++loadSeq;
  const live = () => seq === loadSeq;
  state.activeIdx = -1;
  state.offset = 0;
  state.lines = [];
  $('#nowtitle').innerHTML =
    `<b>${esc(t.title)}</b> <span>${esc(t.artist)}</span><br><span id="ksrc" class="ksrc hidden"></span>`;
  await checkDisk(t);
  if (!live()) return;

  // Audio karaoke needs words on screen: fetch lyrics first, and a song with
  // none falls back to a karaoke VIDEO rather than a wordless instrumental.
  let useVideo = state.source === 'video';
  if (!useVideo) {
    setMode('audio');
    if (!t.lrc) await fetchLyricsAuto(t);
    if (!live()) return;
    if (!t.lrc) {
      useVideo = true;
      toast('No lyrics for this song — switching to a karaoke video.');
    }
  }
  if (useVideo) {
    setMode('video');
    if (!onDisk(t.karaoke_video)) await fetchKaraoke(t, 'video');
    if (!live()) return;
  }

  const isVideo = useVideo && onDisk(t.karaoke_video);
  if (isVideo) {
    renderLyrics(); // a karaoke video burns its lyrics into the picture
  } else {
    setMode('audio');
    setBackdrop(t, live);
    await showLyrics(t);
    if (!live()) return;
    // An instrumental only when there are lyrics to sing to.
    if (state.source === 'audio' && t.lrc && !onDisk(t.karaoke_audio)) await fetchKaraoke(t, 'audio');
    if (!live()) return;
  }
  drawer.render();

  // Karaoke video, else the instrumental, else the original (sing over the
  // source), fetched on the fly if missing.
  let file = isVideo ? t.karaoke_video : (onDisk(t.karaoke_audio) ? t.karaoke_audio : t.file);
  if (!isVideo && !onDisk(file)) {
    if (!(await ensureAudioFile(t)) || !live()) return;
    file = t.file;
  }
  state.playingSrc = isVideo ? 'video' : (file === t.karaoke_audio ? 'karaoke' : 'original');
  setSourceBadge(state.playingSrc);
  await playFile(file, isVideo ? 'mp4' : 'mp3', live);
}

async function playFile(file, ext, live = () => true) {
  try {
    const url = await serveMedia(file, ext);
    if (!live()) return;
    const m = media();
    if (kaudio.active) kaudio.attachMusic(m); // route this element through the mix
    m.src = url;
    m.play().catch(() => {});
  } catch (e) {
    toast(String(e.message || e));
  }
}

// Parse + render the song's .lrc (with its saved drag offset).
async function showLyrics(t) {
  state.activeIdx = -1;
  if (!t.lrc) { state.lines = []; renderLyrics(); return; }
  const txt = await catFile(t.lrc);
  state.lines = parseLrc(txt);
  state.offset = readOffset(txt);
  renderLyrics();
}

// Blurred cover art behind the lyrics, cut once from the song's embedded art
// into the served .thumbs dir.
let thumbsDir = null;
async function setBackdrop(t, live) {
  const bg = $('#bg');
  if (!bg) return;
  bg.classList.remove('has-art');
  bg.style.backgroundImage = '';
  const src = onDisk(t.karaoke_audio) ? t.karaoke_audio : t.file;
  if (!src) return;
  const key = String(src).split('/').pop().replace(/\.[^.]+$/, '');
  if (!thumbsDir) thumbsDir = `${await home()}/.linggen/skills/dj/scripts/.thumbs`;
  const out = sq(`${thumbsDir}/${key}-bg.jpg`);
  const made = await runBash(
    `${FFMPEG_SH}; mkdir -p ${sq(thumbsDir)}; ` +
    `[ -f ${out} ] || { [ -n "$FF" ] && "$FF" -loglevel quiet -y -i ${sq(src)} -an -map 0:v:0 -vf "scale=640:-2" -q:v 4 ${out} 2>/dev/null; }; ` +
    `[ -f ${out} ] && echo y; true`,
    { timeoutMs: 30_000 },
  ).catch(() => '');
  if (!live() || made.trim() !== 'y') return;
  bg.style.backgroundImage = `url("/apps/dj/scripts/.thumbs/${encodeURIComponent(key)}-bg.jpg")`;
  bg.classList.add('has-art');
}

const libEntry = (t) => state.library.tracks.find((x) => trackKey(x) === trackKey(t));
const setField = (t, field, value) => {
  t[field] = value;
  const lib = libEntry(t);
  if (lib) lib[field] = value;
};

// Download the karaoke instrumental (kind 'audio') or the karaoke video.
async function fetchKaraoke(t, kind) {
  if (state.busy) return; // one fetch at a time — no overlapping yt-dlp runs
  state.busy = true;
  state.fetchingKind = kind === 'video' ? 'video' : 'karaoke';
  refreshSrcPanel();
  progress(kind === 'video' ? 'Finding a karaoke video…' : 'Finding karaoke audio…');
  try {
    const r = await downloadKaraoke(t, kind);
    if (!r.ok) { toast(r.error || 'Nothing found.'); return; }
    setField(t, kind === 'video' ? 'karaoke_video' : 'karaoke_audio', r.file);
    have.add(r.file);
    await runAction('track-set-karaoke', t.file, kind === 'video' ? 'video' : 'audio', r.file);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
    state.fetchingKind = null;
    clearProgress();
    refreshSrcPanel();
  }
}

// Lyrics for this song, matched against the original recording.
async function fetchLyricsAuto(t) {
  const src = onDisk(t.file) ? t.file : t.karaoke_audio;
  if (!src) return null;
  progress('Finding lyrics…');
  try {
    const got = await attachLyrics(t, src);
    if (!got) return null;
    setField(t, 'lrc', got.lrc);
    await runAction('track-set-lrc', t.file, got.lrc, got.timed ? 'timed' : 'untimed');
    return got;
  } catch {
    return null; // a song can still play without lyrics
  } finally {
    clearProgress();
  }
}

const catFile = (p) => runBash(`cat ${sq(p)} 2>/dev/null || true`).catch(() => '');

// ── progress pill ────────────────────────────────────────────────────────────
function progress(msg) {
  const el = $('#kprog');
  if (!el) return;
  el.innerHTML = `<span class="kspin"></span>${esc(msg)}`;
  el.classList.remove('hidden');
}
function clearProgress() { $('#kprog')?.classList.add('hidden'); }

// ── lyric offset: drag the words up/down to nudge their timing ───────────────
// The .lrc [offset:ms] tag is the LRC standard (+ms shifts lyrics EARLIER);
// state.offset is SECONDS where + delays the lyrics, so the tag is negated.
function readOffset(txt) {
  const m = String(txt).match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  return m ? -(+m[1]) / 1000 : 0;
}

async function persistOffset() {
  const t = track();
  if (!t?.lrc) return;
  const tagMs = -Math.round(state.offset * 1000);
  const body = String(await catFile(t.lrc)).replace(/^[ \t]*\[offset:[^\]]*\][ \t]*\r?\n?/gim, '');
  const out = `[offset:${tagMs}]\n${body}`;
  await writeFile(t.lrc, out.endsWith('\n') ? out : `${out}\n`);
  toast(`Lyric timing saved (${state.offset >= 0 ? '+' : ''}${state.offset.toFixed(1)}s).`);
}

// Vertical drag on the lyrics nudges the offset live; a plain tap still seeks.
function wireLyricsDrag() {
  const el = $('#lyrics');
  const SENS = 1 / 130; // ~130px of drag ≈ 1 second
  let startY = 0;
  let base = 0;
  let id = null;
  let moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (state.mode === 'video' || !state.lines.length) return;
    startY = e.clientY; base = state.offset; id = e.pointerId; moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (id === null) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 6) return;
    moved = true;
    state.dragged = true;
    el.setPointerCapture?.(id);
    state.offset = base + dy * SENS;
    showOffset();
    highlight(media().currentTime);
  });
  const end = () => {
    if (id === null) return;
    id = null;
    if (moved) { persistOffset(); hideOffset(); setTimeout(() => { state.dragged = false; }, 50); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function showOffset() {
  const el = $('#koffset');
  if (!el) return;
  el.textContent = `lyrics ${state.offset >= 0 ? '+' : ''}${state.offset.toFixed(1)}s`;
  el.classList.remove('hidden');
}
function hideOffset() { setTimeout(() => $('#koffset')?.classList.add('hidden'), 700); }

// The song's mp3 on disk, downloaded on the fly when missing.
async function ensureAudioFile(t) {
  if (onDisk(t.file)) return true;
  $('#lyrics').innerHTML = `<div class="kempty">⬇ Getting “${esc(t.title)}”…</div>`;
  toast(`Downloading “${t.title}”…`);
  try {
    const r = await downloadTrack(t);
    if (!r.ok) {
      toast(`Couldn’t download “${t.title}” — ${r.error}`);
      $('#lyrics').innerHTML = `<div class="kempty">Couldn’t get this song.</div>`;
      return false;
    }
    setField(t, 'file', r.file);
    have.add(r.file);
    await runAction('track-add', JSON.stringify({
      artist: t.artist, title: r.title || t.title, requested_title: r.requested_title, year: t.year || undefined,
      file: r.file, lrc: r.lrc || undefined, lrc_timed: r.lrc_timed, source_id: r.source_id,
    }));
    return true;
  } catch (e) {
    toast(String(e.message || e));
    return false;
  }
}

// The library lives at ~/Music/DJ, which the daemon does not serve, so the
// file is linked (or copied, across volumes) into the served scripts dir and
// loaded as a Blob URL — the daemon answers media with 200 + the whole file
// (no 206), which Chrome treats as unseekable; a blob is fully seekable.
let blobUrl = null;
async function serveMedia(file, ext) {
  const name = `.nowplaying-karaoke.${ext}`;
  await runBash(serveCopyCmd(file, `${SCRIPTS}/${name}`));
  const resp = await fetch(`/apps/dj/scripts/${name}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`load ${resp.status}`);
  const blob = await resp.blob();
  // In memory now; the served name is only a link or a copy.
  runBash(`rm -f "${SCRIPTS}/${name}"`).catch(() => {});
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(blob);
  return blobUrl;
}

function setMode(mode) {
  if (state.mode !== mode) {
    const old = media();
    old.pause();
    old.removeAttribute('src');
    old.load();
  }
  state.mode = mode;
  stage.classList.toggle('video', mode === 'video');
  stage.classList.toggle('audio', mode === 'audio');
}

// ── lyrics ───────────────────────────────────────────────────────────────────
function renderLyrics() {
  const el = $('#lyrics');
  if (state.mode === 'video') { el.innerHTML = ''; return; }
  if (!state.lines.length) {
    el.innerHTML = `<div class="kempty">No lyrics for this song yet.<br>
      <button class="kbtn" id="find-lyrics">🔎 Find lyrics</button>
      <span class="kempty-or">or grab a karaoke video below.</span></div>`;
    $('#find-lyrics').onclick = findLyrics;
    return;
  }
  el.innerHTML = state.lines
    .map((l, i) => `<div class="kline" data-i="${i}" data-t="${l.t}">${esc(l.text) || '&nbsp;'}</div>`)
    .join('');
  el.querySelectorAll('.kline').forEach((d) => {
    d.onclick = () => {
      if (state.dragged) return; // a drag-to-sync gesture, not a tap-to-seek
      media().currentTime = +d.dataset.t + state.offset;
      media().play();
    };
  });
}

async function findLyrics() {
  const t = track();
  if (!t || !(t.file || t.karaoke_audio)) { toast('No audio file for this song.'); return; }
  const btn = $('#find-lyrics');
  if (btn) { btn.disabled = true; btn.textContent = '🔎 Finding…'; }
  const got = await fetchLyricsAuto(t);
  if (!got) {
    toast(`No lyrics found for “${t.title}”.`);
    if (btn) { btn.disabled = false; btn.textContent = '🔎 Find lyrics'; }
    return;
  }
  if (t !== track()) return;
  await showLyrics(t);
  toast(`Got lyrics for “${t.title}”.`);
}

function highlight(cur) {
  const eff = cur - state.offset; // positive offset delays the lyrics
  let idx = -1;
  for (let i = 0; i < state.lines.length; i++) { if (state.lines[i].t <= eff + 0.15) idx = i; else break; }
  if (idx === state.activeIdx) return;
  state.activeIdx = idx;
  const el = $('#lyrics');
  el.querySelectorAll('.kline.on').forEach((e) => e.classList.remove('on'));
  const on = el.querySelector(`.kline[data-i="${idx}"]`);
  if (on) { on.classList.add('on'); on.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

// Countdown over the instrumental lead-in to the first sung line.
function countdown(cur) {
  const el = $('#countdown');
  const first = state.lines[0]?.t;
  const lead = first == null ? null : first + state.offset;
  if (state.mode === 'video' || !lead || lead < 3 || cur >= lead - 0.2) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = String(Math.ceil(lead - cur));
}

// ── media wiring (shared by <audio> and <video>) ─────────────────────────────
function wireMedia(m) {
  m.addEventListener('loadedmetadata', () => { $('#dur').textContent = fmt(m.duration); });
  m.addEventListener('play', () => { $('#play').textContent = '⏸'; });
  m.addEventListener('pause', () => { $('#play').textContent = '▶'; });
  m.addEventListener('ended', next);
  m.addEventListener('timeupdate', () => {
    if (m !== media()) return;
    const cur = m.currentTime;
    $('#cur').textContent = fmt(cur);
    if (m.duration) $('#seek').value = String(Math.round((cur / m.duration) * 1000));
    highlight(cur);
    countdown(cur);
  });
}

// ── transport ────────────────────────────────────────────────────────────────
function toggle() { const m = media(); if (m.paused) m.play(); else m.pause(); }
function go(n) {
  media().pause(); // the old song stops the moment another is chosen
  state.index = (n + state.queue.length) % state.queue.length;
  load(track());
}
function next() { if (state.index + 1 < state.queue.length) go(state.index + 1); else $('#play').textContent = '▶'; }
function prev() { const m = media(); if (m.currentTime > 3) m.currentTime = 0; else go(state.index - 1); }

const KEYS = {
  ' ': (e) => { e.preventDefault(); toggle(); },
  ArrowRight: next,
  ArrowLeft: prev,
  Escape: () => { if (document.fullscreenElement) document.exitFullscreen(); else back(); },
};

function wireControls() {
  $('#play').onclick = toggle;
  $('#next').onclick = next;
  $('#prev').onclick = prev;
  $('#seek').oninput = (e) => { const m = media(); if (m.duration) m.currentTime = (e.target.value / 1000) * m.duration; };
  $('#back').onclick = back;
  $('#fs').onclick = toggleFullscreen;
  $('#srcbtn').onclick = toggleSrcPanel;
  $('#queue').onclick = drawer.toggle;
  wireMix({ kaudio, media, toast });
  wireSetup({ kaudio, toast });
  wireLyricsDrag();
  document.addEventListener('keydown', (e) => KEYS[e.key]?.(e));
}

function back() {
  media().pause();
  kaudio.dispose();
  location.href = `dj.html${location.search}`;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ── version switcher: original · karaoke instrumental · karaoke video ────────
// Pick a source; download it if it isn't here yet, then play it.
const SOURCES = {
  video: async (t) => {
    if (!onDisk(t.karaoke_video)) await fetchKaraoke(t, 'video');
    if (!onDisk(t.karaoke_video)) { toast('No karaoke video found.'); return false; }
    setMode('video');
    renderLyrics();
    await playFile(t.karaoke_video, 'mp4');
    return true;
  },
  karaoke: async (t) => {
    if (!onDisk(t.karaoke_audio)) await fetchKaraoke(t, 'audio');
    if (!onDisk(t.karaoke_audio)) { toast('No karaoke audio found.'); return false; }
    await withLyrics(t);
    await playFile(t.karaoke_audio, 'mp3');
    return true;
  },
  original: async (t) => {
    await withLyrics(t);
    if (!onDisk(t.file) && !(await ensureAudioFile(t))) return false;
    await playFile(t.file, 'mp3');
    return true;
  },
};

async function withLyrics(t) {
  setMode('audio');
  setBackdrop(t, () => t === track());
  if (!t.lrc) await fetchLyricsAuto(t);
  await showLyrics(t);
}

async function switchSource(kind) {
  const t = track();
  if (!t || state.busy) return;
  await checkDisk(t);
  if (!(await SOURCES[kind]?.(t))) return;
  state.playingSrc = kind;
  setSourceBadge(kind);
  refreshSrcPanel();
}

function toggleSrcPanel() {
  const panel = $('#srcpanel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) { renderSourcePanel(); panel.classList.remove('hidden'); }
  else panel.classList.add('hidden');
}

function refreshSrcPanel() {
  const panel = $('#srcpanel');
  if (panel && !panel.classList.contains('hidden')) renderSourcePanel();
}

const srcAction = (on, downloading, has) => {
  if (downloading) return '<span class="kspin"></span>downloading…';
  if (on) return '♪ playing';
  return has ? 'switch' : '＋ get';
};

// The three-row picker: each source is playing / downloading / ready / gettable.
async function renderSourcePanel() {
  const panel = $('#srcpanel');
  const t = track();
  if (!panel || !t) return;
  await checkDisk(t);
  const rows = [
    { k: 'karaoke', ic: '🎤', label: 'Karaoke', sub: 'vocals removed', has: onDisk(t.karaoke_audio) },
    { k: 'video', ic: '🎬', label: 'Karaoke video', sub: 'lyrics on screen', has: onDisk(t.karaoke_video) },
    { k: 'original', ic: '🎵', label: 'Original', sub: 'with vocals', has: onDisk(t.file) || !!t.file },
  ];
  panel.innerHTML = rows.map((r) => {
    const on = state.playingSrc === r.k;
    const downloading = state.busy && state.fetchingKind === r.k;
    return `<button class="ksrc-opt ${on ? 'on' : ''} ${downloading ? 'busy' : ''}" data-src="${r.k}" ${on || state.busy ? 'disabled' : ''}>
      <span class="ksrc-ic">${r.ic}</span>
      <span class="ksrc-lbl"><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span>
      <span class="ksrc-act">${srcAction(on, downloading, r.has)}</span>
    </button>`;
  }).join('');
  panel.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => switchSource(b.dataset.src); });
}

const BADGE = {
  karaoke: ['🎤 Karaoke — vocals removed', 'src-karaoke'],
  original: ['🎵 Original — with vocals', 'src-original'],
  video: ['🎬 Karaoke video', 'src-karaoke'],
};

// The chip under the title: which audio the singer is hearing.
function setSourceBadge(kind) {
  const el = $('#ksrc');
  if (!el) return;
  const [text, cls] = BADGE[kind] || BADGE.original;
  el.textContent = text;
  el.className = `ksrc ${cls}`;
  el.title = 'Switch version';
  el.onclick = toggleSrcPanel;
}

// ── auto-hide chrome (clean stage for the TV) ────────────────────────────────
function wireAutoHide() {
  let timer = null;
  const show = () => {
    stage.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(() => { if (!media().paused) stage.classList.add('idle'); }, 3000);
  };
  ['mousemove', 'touchstart', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, show));
  show();
}
