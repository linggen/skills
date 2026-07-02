// player.js — DJ's in-app Now-Playing view: plays the local MP3 with synced
// (karaoke) lyrics.
//
//   audio  — cp the track to a served .nowplaying.mp3, point <audio> at it
//            (the daemon serves the skill dir; localhost load is instant)
//   lyrics — parse the .lrc sidecar, highlight + auto-scroll the active line

import { runBash, sq } from './bash.js';

// The one live player in THIS page. Closing it hides to a mini-bar (keeps
// playing); opening a new one stops the previous.
let active = null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

// ── parse an .lrc into [{ t, text }] sorted by time ──────────────────────────
const STAMP = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
export function parseLrc(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const stamps = [...raw.matchAll(STAMP)];
    if (!stamps.length) continue; // metadata ([ar:], [ti:]…) or junk
    const line = raw.replace(STAMP, '').trim();
    for (const m of stamps) {
      const t = +m[1] * 60 + +m[2] + (m[3] ? +`0.${m[3]}` : 0);
      out.push({ t, text: line });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// Stop any player in OTHER tabs when this one starts — only one plays at a time.
const PAGE = `${Date.now()}-${Math.round(performance.now())}`;
// Per-page served audio file, so two tabs never clobber each other's playback.
const NP_NAME = `.nowplaying-${PAGE}.mp3`;
const NP_PATH = `$HOME/.linggen/skills/dj/scripts/${NP_NAME}`;
let bc = null;
try {
  bc = new BroadcastChannel('dj-player');
  bc.addEventListener('message', (e) => { if (e.data?.claim && e.data.claim !== PAGE && active) active.stop(); });
} catch { /* BroadcastChannel unsupported — single-tab still fine */ }
const claimPlayback = () => { try { bc?.postMessage({ claim: PAGE }); } catch { /* ignore */ } };

// Sweep stale .nowplaying copies from pages that never got to clean up (tab
// closed mid-play, refresh) — stop() only removes THIS page's file. Anything
// older than an hour can't belong to a live player; each copy is a full track
// (~10MB), so leaks add up fast. Best-effort, once per page load.
runBash(
  `find "$HOME/.linggen/skills/dj/scripts" -maxdepth 1 -name '.nowplaying-*.mp3' -mmin +60 -delete`,
).catch(() => {});

// ── the player overlay ───────────────────────────────────────────────────────
export async function openPlayer(startTrack, opts = {}) {
  if (active) active.stop(); // stop+remove any previous player (shared <audio>)
  // The play queue: the set/library context the user launched from, so the
  // player can sequence / shuffle / loop through it. Single track if none given.
  const queue = opts.queue && opts.queue.length ? opts.queue.slice() : [startTrack];
  let index = queue.findIndex((t) => t === startTrack || t.file === startTrack.file);
  if (index < 0) { queue.unshift(startTrack); index = 0; }
  let track = queue[index];
  let repeat = 'off'; // off | all | one
  let shuffle = !!opts.shuffle;
  const multi = queue.length > 1;

  const ov = document.createElement('div');
  ov.className = 'player-overlay';
  ov.innerHTML = `
    <div class="pl-bar">
      <div class="pl-title"></div>
      <div class="pl-bar-actions">
        <button class="pl-close" aria-label="Minimize" title="Minimize">▾</button>
      </div>
    </div>
    <div class="pl-lyrics" id="pl-lyrics"></div>
    <div class="pl-foot">
      <button class="pl-ctl pl-shuffle${shuffle ? ' on' : ''}" title="Shuffle"${multi ? '' : ' hidden'}>🔀</button>
      <button class="pl-ctl pl-prev" title="Previous"${multi ? '' : ' hidden'}>⏮</button>
      <button class="pl-play" id="pl-play">▶</button>
      <button class="pl-ctl pl-next" title="Next"${multi ? '' : ' hidden'}>⏭</button>
      <button class="pl-ctl pl-repeat" title="Repeat (off / all / one)">🔁</button>
      <span class="pl-time" id="pl-cur">0:00</span>
      <input class="pl-seek" id="pl-seek" type="range" min="0" max="1000" value="0" />
      <span class="pl-time" id="pl-dur">0:00</span>
    </div>
    <audio id="pl-audio"></audio>`;
  document.body.appendChild(ov);

  const $ = (sel) => ov.querySelector(sel);
  const audio = $('#pl-audio');
  const lyricsEl = $('#pl-lyrics');

  // Close = hide to a mini-bar, keep playing. The mini-bar's × actually stops.
  let mini = null;
  function close() { ov.style.display = 'none'; showMini(); }
  function expand() { ov.style.display = ''; if (mini) mini.style.display = 'none'; ov.focus(); }
  function stopAll() {
    audio.pause(); ov.remove(); if (mini) mini.remove(); if (active === api) active = null;
    runBash(`rm -f "${NP_PATH}"`).catch(() => {});
  }
  function showMini() {
    if (!mini) { mini = document.createElement('div'); mini.className = 'dj-mini'; document.body.appendChild(mini); }
    updateMini();
    mini.style.display = 'flex';
  }
  function updateMini() {
    if (!mini) return;
    const multi = queue.length > 1;
    mini.innerHTML = `
      <button class="mini-btn mini-play">${audio.paused ? '▶' : '⏸'}</button>
      <div class="mini-meta"><b>${esc(track.title)}</b> <span>${esc(track.artist)}</span></div>
      ${multi ? `<button class="mini-btn mini-shuffle${shuffle ? ' on' : ''}" title="Shuffle">🔀</button>` : ''}
      <button class="mini-btn mini-repeat${repeat !== 'off' ? ' on' : ''}" title="Repeat">${repeat === 'one' ? '🔂' : '🔁'}</button>
      ${multi ? '<button class="mini-btn mini-next" title="Next">⏭</button>' : ''}
      <button class="mini-btn mini-expand" title="Lyrics">▴</button>
      <button class="mini-btn mini-close" title="Stop">×</button>`;
    mini.querySelector('.mini-play').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
    mini.querySelector('.mini-next')?.addEventListener('click', () => go(pickNext()));
    mini.querySelector('.mini-shuffle')?.addEventListener('click', toggleShuffle);
    mini.querySelector('.mini-repeat').onclick = cycleRepeat;
    mini.querySelector('.mini-meta').onclick = expand;
    mini.querySelector('.mini-expand').onclick = expand;
    mini.querySelector('.mini-close').onclick = stopAll;
  }
  const api = { stop: stopAll };
  active = api;

  ov.querySelector('.pl-close').onclick = close;
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Lyrics — (re)loaded per track by load()
  let lines = [];

  async function findLyrics(btn) {
    if (!opts.fetchLyrics) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Finding lyrics…'; }
    await opts.fetchLyrics(track); // fetch for the CURRENT track (queue may have advanced)
    if (track.lrc) {
      const text = await runBash(`cat ${sq(track.lrc)} 2>/dev/null || true`).catch(() => '');
      lines = parseLrc(text);
    }
    renderLyrics();
    if (!lines.length) opts.toast?.('No lyrics found for this track.');
  }

  function renderLyrics() {
    if (!lines.length) {
      lyricsEl.innerHTML = `<div class="pl-empty">No lyrics loaded for this track.${opts.fetchLyrics ? '<br><button class="pl-fetch">Find lyrics</button>' : ''}</div>`;
      const fb = lyricsEl.querySelector('.pl-fetch');
      if (fb) fb.onclick = () => findLyrics(fb);
      return;
    }
    lyricsEl.innerHTML = lines
      .map((l, i) => `<div class="pl-line" data-i="${i}" data-t="${l.t}"><div class="pl-o">${esc(l.text) || '&nbsp;'}</div></div>`)
      .join('');
    lyricsEl.querySelectorAll('.pl-line').forEach((el) => {
      el.onclick = () => { audio.currentTime = +el.dataset.t; audio.play(); };
    });
  }

  // Active-line tracking
  let activeIdx = -1;
  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime;
    $('#pl-cur').textContent = fmt(cur);
    if (audio.duration) $('#pl-seek').value = String(Math.round((cur / audio.duration) * 1000));
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].t <= cur + 0.15) idx = i; else break; }
    if (idx !== activeIdx) {
      activeIdx = idx;
      lyricsEl.querySelectorAll('.pl-line.on').forEach((e) => e.classList.remove('on'));
      const el = lyricsEl.querySelector(`.pl-line[data-i="${idx}"]`);
      if (el) { el.classList.add('on'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
  });

  // Transport
  audio.addEventListener('loadedmetadata', () => { $('#pl-dur').textContent = fmt(audio.duration); });
  audio.addEventListener('play', () => { $('#pl-play').textContent = '⏸'; updateMini(); claimPlayback(); });
  audio.addEventListener('pause', () => { $('#pl-play').textContent = '▶'; updateMini(); });
  $('#pl-play').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
  $('#pl-seek').oninput = (e) => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; };

  // Queue: sequence (auto-advance) / shuffle / loop.
  function pickNext() {
    if (shuffle && queue.length > 1) {
      let n;
      do { n = Math.floor(Math.random() * queue.length); } while (n === index);
      return n;
    }
    return index + 1;
  }
  function go(n) { index = (n + queue.length) % queue.length; load(queue[index]); }
  audio.addEventListener('ended', () => {
    if (repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
    const n = pickNext();
    if (n >= queue.length && repeat !== 'all') { $('#pl-play').textContent = '▶'; return; } // end of queue
    go(n);
  });
  $('.pl-next').onclick = () => go(pickNext());
  $('.pl-prev').onclick = () => { if (audio.currentTime > 3) audio.currentTime = 0; else go(index - 1); };
  const REPEATS = ['off', 'all', 'one'];
  function syncModes() {
    const sb = $('.pl-shuffle'); if (sb) sb.classList.toggle('on', shuffle);
    const rb = $('.pl-repeat'); if (rb) { rb.textContent = repeat === 'one' ? '🔂' : '🔁'; rb.classList.toggle('on', repeat !== 'off'); }
    updateMini();
  }
  function toggleShuffle() { shuffle = !shuffle; syncModes(); }
  function cycleRepeat() { repeat = REPEATS[(REPEATS.indexOf(repeat) + 1) % REPEATS.length]; syncModes(); }
  $('.pl-shuffle').onclick = toggleShuffle;
  $('.pl-repeat').onclick = cycleRepeat;

  // Load + play a track: header, lyrics, audio.
  async function load(t) {
    track = t;
    $('.pl-title').innerHTML = `<b>${esc(t.title)}</b> <span>${esc(t.artist)}</span>`;
    lines = [];
    if (t.lrc) { const text = await runBash(`cat ${sq(t.lrc)} 2>/dev/null || true`).catch(() => ''); lines = parseLrc(text); }
    activeIdx = -1;
    renderLyrics();
    try {
      await runBash(`cp ${sq(t.file)} "${NP_PATH}"`);
      audio.src = `/apps/dj/scripts/${NP_NAME}?t=${Date.now()}`;
      audio.play().catch(() => {});
    } catch (e) { opts.toast?.(String(e.message || e)); }
    updateMini();
    if (!t.lrc && opts.fetchLyrics) autoFetchLyrics(t); // background — don't block playback
  }

  // Auto-pull lyrics for a just-loaded track that has none. Non-blocking; bails
  // if the queue advances mid-fetch so it never renders onto the wrong song.
  async function autoFetchLyrics(t) {
    if (track === t) lyricsEl.innerHTML = `<div class="pl-empty">Finding lyrics…</div>`;
    try { await opts.fetchLyrics(t); } catch { /* lyrics are optional */ }
    if (track !== t) return; // moved on — leave the current track's view alone
    if (t.lrc) {
      const text = await runBash(`cat ${sq(t.lrc)} 2>/dev/null || true`).catch(() => '');
      if (track !== t) return;
      lines = parseLrc(text);
      activeIdx = -1;
    }
    renderLyrics();
  }

  // Don't pop the lyrics dialog on play — just play in the mini-bar. The dialog
  // (built hidden) opens only when the user expands (▴).
  ov.tabIndex = -1;
  ov.style.display = 'none';
  await load(track);
  showMini();
}
