// player.js — DJ's in-app Now-Playing view: plays the local MP3 with synced
// (karaoke) lyrics, plus on-demand pinyin + English translation. The thing
// streaming apps and VLC/CarPlay don't do — and DJ's language-learning edge.
//
//   audio  — cp the track to a served .nowplaying.mp3, point <audio> at it
//            (the daemon serves the skill dir; localhost load is instant)
//   lyrics — parse the .lrc sidecar, highlight + auto-scroll the active line
//   trans  — one LLM call returns {o, py, en} per line, cached as a sidecar

import { runBash, sq, writeFile, home } from './bash.js';
import { fetchLyrics } from './lyrics.js';

const NOWPLAYING = '$HOME/.linggen/skills/dj/scripts/.nowplaying.mp3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function readSidecar(path) {
  try {
    const out = await runBash(`cat ${sq(path)} 2>/dev/null || true`);
    return out.trim() ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

const lrcPath = (t) => t.lrc || null;
const transPath = (t) => (t.file ? t.file.replace(/\.[^./]+$/, '') + '.trans.json' : null);

// ── translation: one LLM call → { originalText: {py, en} }, cached ───────────
function extractJson(text) {
  const s = String(text);
  const a = s.indexOf('[');
  const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function translateLines(texts) {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt =
    'You are translating song lyrics. Do NOT call any tools. Reply with ONLY a ' +
    'JSON array (no prose, no code fence), one object per numbered line in order: ' +
    '[{"o":"<original>","py":"<Mandarin pinyin with tone marks, empty if the line ' +
    'is not Chinese>","en":"<natural English translation>"}]. Lines:\n' + numbered;
  const h = await home();
  const sid = `dj-trans-${Date.now()}`;
  await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: `${h}/.linggen`, agent_id: 'ling', skill_name: 'dj', session_id: sid, message: prompt }),
  });
  // Poll the session's messages.jsonl directly (the HTTP skill-state endpoint
  // doesn't surface these ad-hoc sessions reliably). The agent's final reply is
  // the row whose content is the JSON array — skip the prompt echo + observations.
  const files =
    `${sq(`${h}/.linggen/sessions/${sid}/messages.jsonl`)} ` +
    `${sq(`${h}/.linggen/skills/dj/sessions/${sid}/messages.jsonl`)}`;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    let raw = '';
    try { raw = await runBash(`cat ${files} 2>/dev/null || true`); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const c = row.content || '';
      if (!c || row.is_observation || c.includes('You are translating')) continue;
      const arr = extractJson(c);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  }
  return null;
}

// Build/load the translation map for a track. Returns { text: {py, en} } or null.
async function loadOrMakeTranslation(track, texts, onState) {
  const cached = await readSidecar(transPath(track));
  if (cached) return cached;
  onState?.('translating');
  const arr = await translateLines(texts);
  if (!arr) return null;
  const map = {};
  arr.forEach((item, i) => {
    const key = item.o && texts.includes(item.o) ? item.o : texts[i];
    if (key) map[key] = { py: item.py || '', en: item.en || '' };
  });
  await writeFile(transPath(track), JSON.stringify(map));
  return map;
}

// ── the player overlay ───────────────────────────────────────────────────────
export async function openPlayer(track, opts = {}) {
  const ov = document.createElement('div');
  ov.className = 'player-overlay';
  ov.innerHTML = `
    <div class="pl-bar">
      <div class="pl-title"><b>${esc(track.title)}</b> <span>${esc(track.artist)}</span></div>
      <div class="pl-bar-actions">
        <button class="pl-trans" title="Pinyin + translation">文 A</button>
        <button class="pl-close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="pl-lyrics" id="pl-lyrics"></div>
    <div class="pl-foot">
      <button class="pl-play" id="pl-play">▶</button>
      <span class="pl-time" id="pl-cur">0:00</span>
      <input class="pl-seek" id="pl-seek" type="range" min="0" max="1000" value="0" />
      <span class="pl-time" id="pl-dur">0:00</span>
    </div>
    <audio id="pl-audio"></audio>`;
  document.body.appendChild(ov);

  const $ = (id) => ov.querySelector(id);
  const audio = $('#pl-audio');
  const lyricsEl = $('#pl-lyrics');
  let showTrans = false;
  let transMap = null;

  function close() {
    audio.pause();
    ov.remove();
  }
  ov.querySelector('.pl-close').onclick = close;
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Lyrics
  let lines = [];
  const lrc = lrcPath(track);
  if (lrc) {
    const text = await runBash(`cat ${sq(lrc)} 2>/dev/null || true`).catch(() => '');
    lines = parseLrc(text);
  }
  renderLyrics();

  function renderLyrics() {
    if (!lines.length) {
      lyricsEl.innerHTML = `<div class="pl-empty">No synced lyrics for this track yet — tap ♪ on its card to fetch them.</div>`;
      return;
    }
    lyricsEl.innerHTML = lines
      .map((l, i) => {
        const tr = showTrans && transMap && transMap[l.text];
        return `<div class="pl-line" data-i="${i}" data-t="${l.t}">
          <div class="pl-o">${esc(l.text) || '&nbsp;'}</div>
          ${tr ? `<div class="pl-py">${esc(tr.py)}</div><div class="pl-en">${esc(tr.en)}</div>` : ''}
        </div>`;
      })
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
  audio.addEventListener('play', () => { $('#pl-play').textContent = '⏸'; });
  audio.addEventListener('pause', () => { $('#pl-play').textContent = '▶'; });
  audio.addEventListener('ended', () => { $('#pl-play').textContent = '▶'; });
  $('#pl-play').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
  $('#pl-seek').oninput = (e) => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; };

  // Translation toggle
  ov.querySelector('.pl-trans').onclick = async () => {
    const btn = ov.querySelector('.pl-trans');
    if (transMap) { showTrans = !showTrans; btn.classList.toggle('on', showTrans); renderLyrics(); return; }
    if (!lines.length) { opts.toast?.('Fetch lyrics first (♪ on the card).'); return; }
    btn.disabled = true; btn.textContent = '…';
    const texts = [...new Set(lines.map((l) => l.text).filter(Boolean))];
    transMap = await loadOrMakeTranslation(track, texts).catch(() => null);
    btn.disabled = false; btn.textContent = '文 A';
    if (!transMap) { opts.toast?.('Translation unavailable.'); return; }
    showTrans = true; btn.classList.add('on'); renderLyrics();
  };

  // Audio: cp to the served slot, then load + play
  try {
    await runBash(`cp ${sq(track.file)} "${NOWPLAYING}"`);
    audio.src = `/apps/dj/scripts/.nowplaying.mp3?t=${Date.now()}`;
    audio.play().catch(() => {});
  } catch (e) {
    opts.toast?.(String(e.message || e));
  }

  ov.tabIndex = -1;
  ov.focus();
}

// Make sure the track has a .lrc before opening (best-effort fetch).
export async function ensureLyricsThenPlay(track, opts = {}) {
  if (!track.lrc && track.file) {
    const lyrics = await fetchLyrics(track).catch(() => null);
    // openPlayer reads track.lrc; the on-card ♪ action is the durable fetch path,
    // so here we just proceed — the player shows "fetch lyrics" if absent.
    void lyrics;
  }
  return openPlayer(track, opts);
}
