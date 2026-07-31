// karaoke.js — the full-screen karaoke stage (its own page). Plays a track over
// big synced lyrics, or a downloaded karaoke video (lyrics burned in, vocals
// gone). No mic yet — that's a later build step. The library page hands off a
// queue via localStorage('dj:karaoke'); we read the rest from library.json.

import { runBash, sq, writeFile, home, runAction } from './bash.js';
import { parseLrc } from './player.js';
import { loadLibrary, loadConfig, trackId } from './library.js';
import { ensureBins, downloadTrack, downloadKaraokeVideo, downloadKaraokeAudio } from './download.js';
import { attachLyrics } from './lyrics.js';
import { KaraokeAudio } from './karaoke-audio.js';

const kaudio = new KaraokeAudio();

const DJ_SCRIPTS = '$HOME/.linggen/skills/dj/scripts';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
  playingSrc: 'original', // what's on air now — 'original' | 'karaoke' | 'video'
  fetchingKind: null, // which source is downloading right now — 'karaoke' | 'video' | null
  lines: [],
  activeIdx: -1,
  offset: 0, // seconds to shift the .lrc so it lines up with the karaoke audio
  busy: false,
};

const media = () => (state.mode === 'video' ? video : audio);
const track = () => state.queue[state.index];

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
  openQueue(); // the up-next list rides along by default
  await load(track());
})();

// The library page writes { ids:[trackId], start:trackId }; fall back to the
// whole library (with files) if opened cold.
function resolveQueue() {
  const withFile = (state.library.tracks || []).filter((t) => t.file);
  let ids = null;
  let start = null;
  try {
    const raw = JSON.parse(localStorage.getItem('dj:karaoke') || 'null');
    if (raw && Array.isArray(raw.ids)) { ids = raw.ids; start = raw.start; }
  } catch { /* ignore */ }
  const byId = new Map(withFile.map((t) => [t.id || trackId(t), t]));
  const q = ids ? ids.map((id) => byId.get(id)).filter(Boolean) : withFile;
  if (start) {
    const i = q.findIndex((t) => (t.id || trackId(t)) === start);
    if (i > 0) state.index = i;
  }
  return q;
}

// ── load + play a track ──────────────────────────────────────────────────────
async function load(t) {
  state.activeIdx = -1;
  state.offset = 0;
  state.lines = [];
  $('#nowtitle').innerHTML =
    `<b>${esc(t.title)}</b> <span>${esc(t.artist)}</span><br><span id="ksrc" class="ksrc hidden"></span>`;

  // Audio karaoke needs words on screen. If the setting is Audio, fetch lyrics
  // first; a song with none falls back to a karaoke VIDEO (lyrics burned into
  // the picture) rather than a wordless instrumental.
  let useVideo = state.source === 'video';
  if (!useVideo) {
    setMode('audio');
    if (!t.lrc) await fetchLyricsAuto(t);
    if (!t.lrc) {
      useVideo = true;
      toast('No lyrics for this song — switching to a karaoke video.');
    }
  }

  if (useVideo) {
    setMode('video');
    if (!(await onDisk(t.karaoke_video))) await fetchKaraoke(t, 'video');
  }

  const isVideo = useVideo && !!t.karaoke_video;
  if (!isVideo) {
    setMode('audio');
    setBackdrop(t); // blurred cover art behind the lyrics (fire-and-forget)
    await showLyrics(t);
    // Only grab a karaoke instrumental when we actually have lyrics to sing to.
    if (state.source === 'audio' && t.lrc && !(await onDisk(t.karaoke_audio))) await fetchKaraoke(t, 'audio');
  } else {
    renderLyrics(); // a karaoke video burns its lyrics into the picture
  }

  renderQueueList();

  // Which file plays: karaoke video, else the karaoke instrumental, else the
  // original mp3 (sing over the source), downloaded on the fly if missing.
  let file = isVideo ? t.karaoke_video : ((await onDisk(t.karaoke_audio)) ? t.karaoke_audio : t.file);
  if (!isVideo && !(await onDisk(file))) {
    if (!(await ensureAudioFile(t))) return;
    file = t.file;
  }
  // Tell the singer which source they're hearing — instrumental vs the original.
  state.playingSrc = isVideo ? 'video' : (file === t.karaoke_audio ? 'karaoke' : 'original');
  setSourceBadge(state.playingSrc);
  await playFile(file, isVideo ? 'mp4' : 'mp3');
}

// Copy the chosen file into the served dir, blob-load it, and play.
async function playFile(file, ext) {
  try {
    const url = await serveMedia(file, ext);
    const m = media();
    if (kaudio.active) kaudio.attachMusic(m); // route this element through the mix
    m.src = url;
    m.play().catch(() => {});
  } catch (e) {
    toast(String(e.message || e));
  }
}

// Parse + render the current track's .lrc (with its saved drag offset).
async function showLyrics(t) {
  state.activeIdx = -1;
  if (!t.lrc) { state.lines = []; renderLyrics(); return; }
  const txt = await catFile(t.lrc);
  state.lines = parseLrc(txt);
  state.offset = readOffset(txt);
  renderLyrics();
}

// Blurred album-art backdrop for the stage. The cover is embedded in the mp3
// (download.js --embed-thumbnail); extract a cached copy into the served
// .thumbs dir once, then paint it behind the lyrics. No new download.
let _thumbsDir = null;
async function setBackdrop(t) {
  const bg = $('#bg');
  if (!bg) return;
  bg.classList.remove('has-art');
  bg.style.backgroundImage = '';
  const src = (await onDisk(t.karaoke_audio)) ? t.karaoke_audio : t.file;
  if (!src) return;
  const key = String(src).split('/').pop().replace(/\.[^.]+$/, '');
  if (!_thumbsDir) _thumbsDir = `${await home()}/.linggen/skills/dj/scripts/.thumbs`;
  const out = `${_thumbsDir}/${key}-bg.jpg`;
  await runBash(
    `mkdir -p ${sq(_thumbsDir)} && [ -f ${sq(out)} ] || ` +
    `ffmpeg -loglevel quiet -y -i ${sq(src)} -an -map 0:v:0 -vf "scale=640:-2" -q:v 4 ${sq(out)} 2>/dev/null || true`,
    { timeoutMs: 30_000 },
  ).catch(() => {});
  if (t !== track() || !(await onDisk(out))) return; // track changed, or no embedded art
  bg.style.backgroundImage = `url("/apps/dj/scripts/.thumbs/${encodeURIComponent(key)}-bg.jpg")`;
  bg.classList.add('has-art');
}

// Download the karaoke instrumental (kind='audio') or the karaoke video.
async function fetchKaraoke(t, kind) {
  if (state.busy) return; // one fetch at a time — no overlapping yt-dlp runs
  state.busy = true;
  state.fetchingKind = kind === 'video' ? 'video' : 'karaoke';
  refreshSrcPanel(); // mark the row "downloading…" if the picker is open
  progress(kind === 'video' ? 'Finding a karaoke video…' : 'Finding karaoke audio…');
  try {
    const bins = await ensureBins();
    if (!bins.ok) { toast(bins.note || 'Couldn’t set up the downloader.'); return; }
    progress('Downloading…');
    const r = kind === 'video'
      ? await downloadKaraokeVideo(bins, state.config, t)
      : await downloadKaraokeAudio(bins, state.config, t);
    if (!r.ok) { toast(r.error || 'Nothing found.'); return; }
    if (kind === 'video') t.karaoke_video = r.file; else t.karaoke_audio = r.file;
    const lib = libEntry(t);
    if (lib) { if (kind === 'video') lib.karaoke_video = r.file; else lib.karaoke_audio = r.file; }
    await runAction('track-set-karaoke', t.file, kind === 'video' ? 'video' : 'audio', r.file);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
    state.fetchingKind = null;
    clearProgress();
    refreshSrcPanel(); // row flips to "switch"/"playing" now the file's here
  }
}

// Fetch a synced .lrc for this track (matched against the original recording).
async function fetchLyricsAuto(t) {
  const src = (await onDisk(t.file)) ? t.file : t.karaoke_audio;
  if (!src) return;
  progress('Finding lyrics…');
  try {
    const lrc = await attachLyrics(t, src);
    if (lrc) {
      t.lrc = lrc;
      const lib = libEntry(t);
      if (lib) lib.lrc = lrc;
      await runAction('track-set-lrc', t.file, lrc);
    }
  } catch { /* best effort — a track can still play without lyrics */ }
  finally { clearProgress(); }
}

const libEntry = (t) => state.library.tracks.find((x) => (x.id || trackId(x)) === (t.id || trackId(t)));
const onDisk = (p) => (p ? fileOnDisk(p) : Promise.resolve(false));
const catFile = (p) => runBash(`cat ${sq(p)} 2>/dev/null || true`).catch(() => '');

// ── progress pill: keeps the stage honest during a fetch ─────────────────────
function progress(msg) {
  const el = $('#kprog');
  if (!el) return;
  el.innerHTML = `<span class="kspin"></span>${esc(msg)}`;
  el.classList.remove('hidden');
}
function clearProgress() { $('#kprog')?.classList.add('hidden'); }

// ── lyric offset: drag the words up/down to nudge their timing ────────────────
// The .lrc [offset:ms] tag is the LRC standard (+ms shifts lyrics EARLIER); we
// keep state.offset in SECONDS where + delays the lyrics, so the tag is negated.
function readOffset(txt) {
  const m = String(txt).match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  return m ? -(+m[1]) / 1000 : 0;
}

async function persistOffset() {
  const t = track();
  if (!t?.lrc) return;
  const tagMs = -Math.round(state.offset * 1000);
  const txt = await catFile(t.lrc);
  const body = String(txt).replace(/^[ \t]*\[offset:[^\]]*\][ \t]*\r?\n?/gim, '');
  const out = `[offset:${tagMs}]\n${body}`;
  await writeFile(t.lrc, out.endsWith('\n') ? out : `${out}\n`);
  toast(`Lyric timing saved (${state.offset >= 0 ? '+' : ''}${state.offset.toFixed(1)}s).`);
}

// Vertical drag on the lyrics nudges the offset live; a plain tap still seeks
// (guarded by state.dragged). Drag down = lyrics come later.
function wireLyricsDrag() {
  const el = $('#lyrics');
  const SENS = 1 / 130; // ~130px of drag ≈ 1 second
  let startY = 0, base = 0, id = null, moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (state.mode === 'video' || !state.lines.length) return;
    startY = e.clientY; base = state.offset; id = e.pointerId; moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (id === null) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 6) return;
    moved = true; state.dragged = true;
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

const fileOnDisk = async (path) => {
  try { return (await runBash(`[ -f ${sq(path)} ] && echo y || true`)).trim() === 'y'; }
  catch { return false; }
};

// Ensure the track's mp3 exists locally; download it on the fly if missing.
// Returns true once a playable file is present. Shows a "Getting…" stage state.
async function ensureAudioFile(t) {
  if (t.file && (await fileOnDisk(t.file))) return true;
  $('#lyrics').innerHTML = `<div class="kempty">⬇ Getting “${esc(t.title)}”…</div>`;
  toast(`Downloading “${t.title}”…`);
  try {
    const bins = await ensureBins();
    if (!bins.ok) { toast(bins.note || 'Couldn’t set up the downloader.'); return false; }
    const r = await downloadTrack(bins, state.config, t);
    if (!r.ok) {
      toast(`Couldn’t download “${t.title}” — ${r.error}`);
      $('#lyrics').innerHTML = `<div class="kempty">Couldn’t get this track.</div>`;
      return false;
    }
    t.file = r.file;
    const lib = state.library.tracks.find((x) => (x.id || trackId(x)) === (t.id || trackId(t)));
    if (lib) lib.file = r.file;
    else state.library.tracks.push({ id: t.id || trackId(t), artist: t.artist, title: t.title, year: t.year, file: r.file, added_at: new Date().toISOString(), playlists: [], synced_to: [] });
    await runAction('track-add', JSON.stringify({ artist: t.artist, title: t.title, year: t.year || undefined, file: r.file }));
    return true;
  } catch (e) {
    toast(String(e.message || e));
    return false;
  }
}

// The library lives at ~/Music/DJ, which the daemon does not serve — so copy the
// active track into the served scripts dir, then load it as a Blob URL.
//
// Why a blob and not the served URL directly: the daemon answers media requests
// with 200 + the whole file (no HTTP range / 206), so Chrome treats the stream
// as non-seekable — the seek bar and click-to-seek-a-line would do nothing. A
// Blob URL is fully in-memory and seekable. Local file, so the fetch is fast.
let blobUrl = null;
async function serveMedia(file, ext) {
  const name = `.nowplaying-karaoke.${ext}`;
  await runBash(`cp ${sq(file)} "${DJ_SCRIPTS}/${name}"`);
  const resp = await fetch(`/apps/dj/scripts/${name}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`load ${resp.status}`);
  const blob = await resp.blob();
  // The served copy was only needed for that one fetch — the blob is fully
  // in-memory now, so remove it rather than leave a track-sized file behind.
  runBash(`rm -f "${DJ_SCRIPTS}/${name}"`).catch(() => {});
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
    el.innerHTML = `<div class="kempty">No lyrics for this track yet.<br>
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

// Fetch a synced .lrc from LRCLIB for the current track, then render it.
async function findLyrics() {
  const t = track();
  const src = t?.file || t?.karaoke_audio;
  if (!t || !src) { toast('No audio file for this track.'); return; }
  const btn = $('#find-lyrics');
  if (btn) { btn.disabled = true; btn.textContent = '🔎 Finding…'; }
  toast(`Looking for lyrics — ${t.title}…`);
  try {
    const lrc = await attachLyrics(t, src);
    if (!lrc) {
      toast(`No lyrics found for “${t.title}”.`);
      if (btn) { btn.disabled = false; btn.textContent = '🔎 Find lyrics'; }
      return;
    }
    t.lrc = lrc;
    const lib = state.library.tracks.find((x) => (x.id || trackId(x)) === (t.id || trackId(t)));
    if (lib) lib.lrc = lrc;
    await runAction('track-set-lrc', t.file, lrc);
    const txt = await runBash(`cat ${sq(lrc)} 2>/dev/null || true`).catch(() => '');
    state.lines = parseLrc(txt);
    state.activeIdx = -1;
    renderLyrics();
    toast(`Got lyrics for “${t.title}”.`);
  } catch (e) {
    toast(String(e.message || e));
    if (btn) { btn.disabled = false; btn.textContent = '🔎 Find lyrics'; }
  }
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
  if (on) on.classList.add('on'), on.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Countdown over the instrumental lead-in to the first sung line.
function countdown(cur) {
  const el = $('#countdown');
  const first = state.lines[0]?.t;
  const lead = first == null ? null : first + state.offset; // honor the drag offset
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
function go(n) { state.index = (n + state.queue.length) % state.queue.length; load(track()); }
function next() { if (state.index + 1 < state.queue.length) go(state.index + 1); else $('#play').textContent = '▶'; }
function prev() { const m = media(); if (m.currentTime > 3) m.currentTime = 0; else go(state.index - 1); }

function wireControls() {
  $('#play').onclick = toggle;
  $('#next').onclick = next;
  $('#prev').onclick = prev;
  $('#seek').oninput = (e) => { const m = media(); if (m.duration) m.currentTime = (e.target.value / 1000) * m.duration; };
  $('#back').onclick = back;
  $('#fs').onclick = toggleFullscreen;
  $('#srcbtn').onclick = toggleSrcPanel;
  $('#queue').onclick = toggleQueue;
  wireMix();
  wireSetup();
  wireLyricsDrag();
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); else back(); }
  });
}

// ── mic + voice/music mix (the live audio engine) ────────────────────────────
function wireMix() {
  const panel = $('#mixpanel');
  const micBtn = $('#mic');
  $('#mixbtn').onclick = () => panel.classList.toggle('hidden');

  micBtn.onclick = async () => {
    micBtn.disabled = true;
    const first = !kaudio.active;
    micBtn.textContent = '🎤 …';
    try {
      if (first) {
        await kaudio.enable(media());
        meterLoop();
        setMicBtn(true);
        toast('Mic on — sing! Use earbuds or a separate speaker so it doesn’t echo.');
      } else {
        const on = await kaudio.toggleMic();
        setMicBtn(on);
        toast(on ? 'Mic on.' : 'Mic off — released.');
      }
    } catch (e) {
      setMicBtn(kaudio.micOn);
      toast('Mic blocked — allow microphone access for this page.');
    } finally {
      micBtn.disabled = false;
    }
  };

  $('#voice').oninput = (e) => kaudio.setVoice(+e.target.value / 100);
  $('#music').oninput = (e) => kaudio.setMusic(+e.target.value / 100);
  $('#reverb').oninput = (e) => kaudio.setReverb(+e.target.value / 100);
  $('#echo').oninput = (e) => kaudio.setEcho(+e.target.value / 100);

  // Key shift acts on the backing track, so it works without the mic — the press
  // is the gesture that builds the engine the first time.
  let key = 0;
  const applyKey = async (delta) => {
    key = Math.max(-7, Math.min(7, key + delta));
    $('#key-val').textContent = key > 0 ? `+${key}` : `${key}`;
    try { await kaudio.ensureEngine(media()); kaudio.setKey(key); }
    catch (e) { toast('Couldn’t start the audio engine.'); }
  };
  $('#key-dn').onclick = () => applyKey(-1);
  $('#key-up').onclick = () => applyKey(1);
}

// ── audio setup: device pickers + Bluetooth warning + external-mixer mode ─────
const AUDIO_PREFS = 'dj:karaoke-audio';
const loadAudioPrefs = () => { try { return JSON.parse(localStorage.getItem(AUDIO_PREFS) || '{}'); } catch { return {}; } };
const saveAudioPrefs = (p) => { try { localStorage.setItem(AUDIO_PREFS, JSON.stringify(p)); } catch { /* ignore */ } };

// Labels that mean "wireless / laggy" → bad for live monitoring (echo).
const isLaggy = (label) => /bluetooth|airpod|\bbt\b|wireless|hands-?free|headset|iphone|continuity/i.test(label || '');

async function wireSetup() {
  const prefs = loadAudioPrefs();
  // Seed the engine + UI with saved choices.
  if (prefs.micId) kaudio.setMicDevice(prefs.micId);
  if (prefs.outId) kaudio.outputDeviceId = prefs.outId;
  if (prefs.external) applyExternal(true);

  const open = () => { $('#setup').classList.remove('hidden'); refreshDevices(prefs); };
  $('#setupbtn').onclick = open;
  $('#setup-close').onclick = () => $('#setup').classList.add('hidden');
  $('#setup').onclick = (e) => { if (e.target === $('#setup')) $('#setup').classList.add('hidden'); };

  $('#dev-mic').onchange = (e) => { prefs.micId = e.target.value; saveAudioPrefs(prefs); kaudio.setMicDevice(prefs.micId); updateWarn(); };
  $('#dev-out').onchange = async (e) => {
    prefs.outId = e.target.value; saveAudioPrefs(prefs);
    const ok = await kaudio.setOutputDevice(prefs.outId);
    if (!ok && prefs.outId) toast('This browser can’t redirect output — pick the speaker in macOS Sound instead.');
    updateWarn();
  };
  $('#dev-external').checked = !!prefs.external;
  $('#dev-external').onchange = (e) => { prefs.external = e.target.checked; saveAudioPrefs(prefs); applyExternal(prefs.external); };

  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshDevices(prefs));
}

async function refreshDevices(prefs) {
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch { /* ignore */ }
  const fill = (sel, kind, cur) => {
    const list = devs.filter((d) => d.kind === kind);
    sel.innerHTML = '<option value="">Default</option>' +
      list.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || (kind === 'audioinput' ? 'Microphone' : 'Speaker'))}</option>`).join('');
    if (cur) sel.value = cur;
  };
  fill($('#dev-mic'), 'audioinput', prefs.micId);
  fill($('#dev-out'), 'audiooutput', prefs.outId);
  // Device names are blank until mic permission is granted once.
  const named = devs.some((d) => d.label);
  $('#dev-hint').classList.toggle('hidden', named);
  updateWarn();
}

function updateWarn() {
  const micLabel = $('#dev-mic').selectedOptions[0]?.textContent || '';
  const outLabel = $('#dev-out').selectedOptions[0]?.textContent || '';
  const warn = $('#dev-warn');
  if (isLaggy(micLabel) || isLaggy(outLabel)) {
    warn.textContent = '⚠ A wireless/Bluetooth device is selected — it adds delay, so your voice can echo. Wired is best for live karaoke.';
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

// Hardware mixer does the voice → hide the software mic/FX, release the mic.
function applyExternal(on) {
  ['#mic', '.kmeter'].forEach((s) => { const el = document.querySelector(s); if (el) el.classList.toggle('hidden', on); });
  ['#voice', '#reverb', '#echo'].forEach((s) => { const sl = document.querySelector(s)?.closest('.kslider'); if (sl) sl.hidden = on; });
  if (on && kaudio.micOn) kaudio.toggleMic();
}

function setMicBtn(on) {
  const b = $('#mic');
  b.classList.toggle('on', on);
  b.textContent = on ? '🎤 Mic on' : '🎤 Mic off';
}

// Animate the level meter while the mic is live.
function meterLoop() {
  const fill = $('#meterfill');
  const tick = () => {
    if (!kaudio.active) { fill.style.width = '0%'; return; }
    fill.style.width = `${Math.round(kaudio.level() * 100)}%`;
    requestAnimationFrame(tick);
  };
  tick();
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

// ── up-next drawer: now-playing, reorder, remove, add-from-library ───────────
let queueBuilt = false;

// The drawer shifts the stage over (queue-open) so the controls clear it.
function openQueue() {
  if (!queueBuilt) buildQueueDrawer();
  $('#qdrawer').classList.remove('hidden');
  stage.classList.add('queue-open');
}
function toggleQueue() {
  if (!queueBuilt) buildQueueDrawer();
  const hidden = $('#qdrawer').classList.toggle('hidden');
  stage.classList.toggle('queue-open', !hidden);
}

function buildQueueDrawer() {
  const el = $('#qdrawer');
  el.innerHTML = `
    <div class="kq-head"><b>Up next</b> <span id="q-count"></span></div>
    <div id="q-list"></div>
    <div class="kq-add">
      <input id="q-search" type="search" placeholder="Add a song to the queue…" autocomplete="off" />
      <div id="q-results"></div>
    </div>`;
  $('#q-search').addEventListener('input', renderAddResults);
  queueBuilt = true;
  renderQueueList();
}

function renderQueueList() {
  if (!queueBuilt) return;
  $('#q-count').textContent = `${state.queue.length} song${state.queue.length === 1 ? '' : 's'}`;
  $('#q-list').innerHTML = state.queue.map((t, i) => {
    const on = i === state.index;
    const ctrls = on
      ? '<span class="kq-now">♪ now</span>'
      : `<button class="kq-mini" data-act="up" data-i="${i}" title="Move up">↑</button>
         <button class="kq-mini" data-act="dn" data-i="${i}" title="Move down">↓</button>
         <button class="kq-mini" data-act="rm" data-i="${i}" title="Remove from queue">✕</button>`;
    return `<div class="kq-row ${on ? 'on' : ''}">
      <span class="qi">${i + 1}</span>
      <div class="kq-meta" data-jump="${i}"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
      <span class="kq-ctrls">${ctrls}</span>
    </div>`;
  }).join('');
  $('#q-list').querySelectorAll('[data-jump]').forEach((e) => { e.onclick = () => go(+e.dataset.jump); });
  $('#q-list').querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); queueAction(b.dataset.act, +b.dataset.i); };
  });
}

// Reorder/remove keep state.index pointing at the still-playing track.
function queueAction(act, i) {
  const cur = state.queue[state.index];
  const q = state.queue;
  if (act === 'up' && i > 0) { [q[i - 1], q[i]] = [q[i], q[i - 1]]; }
  else if (act === 'dn' && i < q.length - 1) { [q[i + 1], q[i]] = [q[i], q[i + 1]]; }
  else if (act === 'rm') { if (i === state.index) return; q.splice(i, 1); }
  state.index = q.indexOf(cur);
  renderQueueList();
}

function renderAddResults() {
  const query = $('#q-search').value.trim().toLowerCase();
  const res = $('#q-results');
  if (!query) { res.innerHTML = ''; return; }
  const inQueue = new Set(state.queue.map((t) => t.id || trackId(t)));
  const matches = (state.library.tracks || [])
    .filter((t) => t.file && `${t.artist} ${t.title}`.toLowerCase().includes(query))
    .slice(0, 8);
  res.innerHTML = matches.map((t) => {
    const id = t.id || trackId(t);
    const has = inQueue.has(id);
    return `<div class="kq-res" data-id="${esc(id)}">
      <div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
      <button class="kq-add-btn" ${has ? 'disabled' : ''}>${has ? '✓' : '＋'}</button>
    </div>`;
  }).join('') || '<div class="kq-none">No matches in your library.</div>';
  res.querySelectorAll('.kq-res').forEach((r) => {
    const btn = r.querySelector('.kq-add-btn');
    if (btn.disabled) return;
    btn.onclick = () => {
      const t = (state.library.tracks || []).find((x) => (x.id || trackId(x)) === r.dataset.id);
      if (t) { state.queue.push(t); renderQueueList(); renderAddResults(); }
    };
  });
}

// ── version switcher: original mp3 · karaoke instrumental · karaoke video ─────
// Pick a source; download it if we don't have it yet (progress in the pill),
// then play it and update the badge. Manual choice — no lyrics-gate here.
async function switchSource(kind) {
  const t = track();
  if (!t || state.busy) return;
  if (kind === 'video') {
    if (!(await onDisk(t.karaoke_video))) await fetchKaraoke(t, 'video');
    if (!(await onDisk(t.karaoke_video))) { toast('No karaoke video found.'); return; }
    setMode('video');
    renderLyrics();
    await playFile(t.karaoke_video, 'mp4');
  } else if (kind === 'karaoke') {
    if (!(await onDisk(t.karaoke_audio))) await fetchKaraoke(t, 'audio');
    if (!(await onDisk(t.karaoke_audio))) { toast('No karaoke audio found.'); return; }
    setMode('audio');
    setBackdrop(t);
    if (!t.lrc) await fetchLyricsAuto(t);
    await showLyrics(t);
    await playFile(t.karaoke_audio, 'mp3');
  } else {
    setMode('audio');
    setBackdrop(t);
    if (!t.lrc) await fetchLyricsAuto(t);
    await showLyrics(t);
    if (!(await onDisk(t.file)) && !(await ensureAudioFile(t))) return;
    await playFile(t.file, 'mp3');
  }
  state.playingSrc = kind;
  setSourceBadge(kind);
  refreshSrcPanel(); // reflect the new "playing" row if the picker is open
}

function toggleSrcPanel() {
  const panel = $('#srcpanel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) { renderSourcePanel(); panel.classList.remove('hidden'); }
  else panel.classList.add('hidden');
}

// Re-render the picker in place when a fetch starts/ends, so its rows stay live.
function refreshSrcPanel() {
  const panel = $('#srcpanel');
  if (panel && !panel.classList.contains('hidden')) renderSourcePanel();
}

// The three-row picker: each source is playing / downloading / ready / gettable.
// Stays open while a download runs so its row can show the spinner in place.
async function renderSourcePanel() {
  const panel = $('#srcpanel');
  const t = track();
  if (!panel || !t) return;
  const rows = [
    { k: 'karaoke', ic: '🎤', label: 'Karaoke', sub: 'vocals removed', has: await onDisk(t.karaoke_audio) },
    { k: 'video', ic: '🎬', label: 'Karaoke video', sub: 'lyrics on screen', has: await onDisk(t.karaoke_video) },
    { k: 'original', ic: '🎵', label: 'Original', sub: 'with vocals', has: (await onDisk(t.file)) || !!t.file },
  ];
  panel.innerHTML = rows.map((r) => {
    const on = state.playingSrc === r.k;
    const downloading = state.busy && state.fetchingKind === r.k;
    let act;
    if (downloading) act = '<span class="kspin"></span>downloading…';
    else if (on) act = '♪ playing';
    else if (r.has) act = 'switch';
    else act = '＋ get';
    // Can't act while any fetch runs; the downloading row and the current row
    // are inert anyway.
    const disabled = on || state.busy;
    return `<button class="ksrc-opt ${on ? 'on' : ''} ${downloading ? 'busy' : ''}" data-src="${r.k}" ${disabled ? 'disabled' : ''}>
      <span class="ksrc-ic">${r.ic}</span>
      <span class="ksrc-lbl"><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span>
      <span class="ksrc-act">${act}</span>
    </button>`;
  }).join('');
  // Keep the panel open on a pick so its row can show the download spinner.
  panel.querySelectorAll('[data-src]').forEach((b) => {
    b.onclick = () => switchSource(b.dataset.src);
  });
}

// Chip under the title telling the singer which audio they're hearing.
function setSourceBadge(kind) {
  const el = $('#ksrc');
  if (!el) return;
  const map = {
    karaoke: ['🎤 Karaoke — vocals removed', 'src-karaoke'],
    original: ['🎵 Original track — with vocals', 'src-original'],
    video: ['🎬 Karaoke video', 'src-karaoke'],
  };
  const [text, cls] = map[kind] || map.original;
  el.textContent = text;
  el.className = `ksrc ${cls}`;
  el.title = 'Switch version';
  el.onclick = toggleSrcPanel; // the chip is also a shortcut to the picker
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

// ── toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const el = $('#ktoast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}
