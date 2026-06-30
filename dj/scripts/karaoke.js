// karaoke.js — the full-screen karaoke stage (its own page). Plays a track over
// big synced lyrics, or a downloaded karaoke video (lyrics burned in, vocals
// gone). No mic yet — that's a later build step. The library page hands off a
// queue via localStorage('dj:karaoke'); we read the rest from library.json.

import { runBash, sq } from './bash.js';
import { parseLrc } from './player.js';
import { loadLibrary, saveLibrary, loadConfig, trackId } from './library.js';
import { ensureBins, downloadKaraokeVideo } from './download.js';
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
  lines: [],
  activeIdx: -1,
  busy: false,
};

const media = () => (state.mode === 'video' ? video : audio);
const track = () => state.queue[state.index];

// ── boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  [state.config, state.library] = await Promise.all([loadConfig(), loadLibrary()]);
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
  const isVideo = !!t.karaoke_video;
  setMode(isVideo ? 'video' : 'audio');
  $('#nowtitle').innerHTML = `<b>${esc(t.title)}</b> <span>${esc(t.artist)}</span>`;
  state.activeIdx = -1;

  // Lyrics only in audio mode — a karaoke video has them burned into the picture.
  state.lines = [];
  if (!isVideo && t.lrc) {
    const txt = await runBash(`cat ${sq(t.lrc)} 2>/dev/null || true`).catch(() => '');
    state.lines = parseLrc(txt);
  }
  renderLyrics();
  renderQueue();
  updateGetVid();

  try {
    const url = await serveMedia(isVideo ? t.karaoke_video : t.file, isVideo ? 'mp4' : 'mp3');
    const m = media();
    if (kaudio.active) kaudio.attachMusic(m); // route this element through the mix
    m.src = url;
    m.play().catch(() => {});
  } catch (e) {
    toast(String(e.message || e));
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
    el.innerHTML = `<div class="kempty">No lyrics for this track yet — sing along, or grab a karaoke video below.</div>`;
    return;
  }
  el.innerHTML = state.lines
    .map((l, i) => `<div class="kline" data-i="${i}" data-t="${l.t}">${esc(l.text) || '&nbsp;'}</div>`)
    .join('');
  el.querySelectorAll('.kline').forEach((d) => {
    d.onclick = () => { media().currentTime = +d.dataset.t; media().play(); };
  });
}

function highlight(cur) {
  let idx = -1;
  for (let i = 0; i < state.lines.length; i++) { if (state.lines[i].t <= cur + 0.15) idx = i; else break; }
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
  const lead = state.lines[0]?.t;
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
  $('#getvid').onclick = getKaraokeVideo;
  $('#queue').onclick = () => $('#qdrawer').classList.toggle('hidden');
  wireMix();
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

// ── up-next drawer ───────────────────────────────────────────────────────────
function renderQueue() {
  const el = $('#qdrawer');
  el.innerHTML = state.queue
    .map((t, i) => `<div class="kq-row ${i === state.index ? 'on' : ''}" data-i="${i}">
      <span class="qi">${i + 1}</span>
      <div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
    </div>`)
    .join('');
  el.querySelectorAll('.kq-row').forEach((r) => { r.onclick = () => { go(+r.dataset.i); el.classList.add('hidden'); }; });
}

// ── get a karaoke video for the current track (lyrics + vocals removed) ───────
async function getKaraokeVideo() {
  const t = track();
  if (state.busy || !t) return;
  if (t.karaoke_video) { setMode('video'); load(t); return; }
  state.busy = true;
  updateGetVid();
  toast(`Finding a karaoke video for “${t.title}”…`);
  try {
    const bins = await ensureBins();
    if (!bins.ok) { toast(bins.note || 'Couldn’t set up the downloader.'); return; }
    const r = await downloadKaraokeVideo(bins, state.config, t);
    if (!r.ok) { toast(r.error || 'No karaoke video found.'); return; }
    t.karaoke_video = r.file;
    const lib = state.library.tracks.find((x) => (x.id || trackId(x)) === (t.id || trackId(t)));
    if (lib) lib.karaoke_video = r.file;
    await saveLibrary(state.library);
    toast(`Got it — switching to the karaoke video.`);
    await load(t);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
    updateGetVid();
  }
}

function updateGetVid() {
  const b = $('#getvid');
  const t = track();
  if (state.busy) { b.textContent = '🎬 Finding…'; b.disabled = true; return; }
  b.disabled = false;
  b.textContent = t?.karaoke_video ? '🎬 Karaoke video ✓' : '🎬 Karaoke video';
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
