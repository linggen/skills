// karaoke-mix.js — the live audio side of the karaoke stage: the mic, the
// voice/music mix and effects, the key shift, and the device setup sheet
// (pickers, a Bluetooth warning, external-mixer mode).

import { esc } from './ui.js';

const $ = (sel) => document.querySelector(sel);

function setMicBtn(on) {
  const b = $('#mic');
  b.classList.toggle('on', on);
  b.textContent = on ? '🎤 Mic on' : '🎤 Mic off';
}

// Animate the level meter while the mic is live.
function meterLoop(kaudio) {
  const fill = $('#meterfill');
  const tick = () => {
    if (!kaudio.active) { fill.style.width = '0%'; return; }
    fill.style.width = `${Math.round(kaudio.level() * 100)}%`;
    requestAnimationFrame(tick);
  };
  tick();
}

export function wireMix({ kaudio, media, toast }) {
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
        meterLoop(kaudio);
        setMicBtn(true);
        toast('Mic on — use earbuds or a separate speaker so it doesn’t echo.');
      } else {
        const on = await kaudio.toggleMic();
        setMicBtn(on);
        toast(on ? 'Mic on.' : 'Mic off.');
      }
    } catch {
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

  // Key shift acts on the backing track, so it works without the mic — the
  // press is the gesture that builds the engine the first time.
  let key = 0;
  const applyKey = async (delta) => {
    key = Math.max(-7, Math.min(7, key + delta));
    $('#key-val').textContent = key > 0 ? `+${key}` : `${key}`;
    try { await kaudio.ensureEngine(media()); kaudio.setKey(key); }
    catch { toast('Couldn’t start the audio engine.'); }
  };
  $('#key-dn').onclick = () => applyKey(-1);
  $('#key-up').onclick = () => applyKey(1);
}

// ── device setup ─────────────────────────────────────────────────────────────
const AUDIO_PREFS = 'dj:karaoke-audio';
const loadAudioPrefs = () => { try { return JSON.parse(localStorage.getItem(AUDIO_PREFS) || '{}'); } catch { return {}; } };
const saveAudioPrefs = (p) => { try { localStorage.setItem(AUDIO_PREFS, JSON.stringify(p)); } catch { /* ignore */ } };

// Labels that mean "wireless / laggy" → bad for live monitoring (echo).
const isLaggy = (label) => /bluetooth|airpod|\bbt\b|wireless|hands-?free|headset|iphone|continuity/i.test(label || '');

function updateWarn() {
  const micLabel = $('#dev-mic').selectedOptions[0]?.textContent || '';
  const outLabel = $('#dev-out').selectedOptions[0]?.textContent || '';
  const warn = $('#dev-warn');
  const laggy = isLaggy(micLabel) || isLaggy(outLabel);
  warn.textContent = laggy ? '⚠ Bluetooth adds delay, so your voice can echo. Wired is best.' : '';
  warn.classList.toggle('hidden', !laggy);
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
  $('#dev-hint').classList.toggle('hidden', devs.some((d) => d.label));
  updateWarn();
}

// A hardware mixer does the voice → hide the software mic/FX, release the mic.
function applyExternal(kaudio, on) {
  ['#mic', '.kmeter'].forEach((s) => { const el = document.querySelector(s); if (el) el.classList.toggle('hidden', on); });
  ['#voice', '#reverb', '#echo'].forEach((s) => { const sl = document.querySelector(s)?.closest('.kslider'); if (sl) sl.hidden = on; });
  if (on && kaudio.micOn) kaudio.toggleMic();
}

export function wireSetup({ kaudio, toast }) {
  const prefs = loadAudioPrefs();
  if (prefs.micId) kaudio.setMicDevice(prefs.micId);
  if (prefs.outId) kaudio.outputDeviceId = prefs.outId;
  if (prefs.external) applyExternal(kaudio, true);

  const sheet = $('#setup');
  $('#setupbtn').onclick = () => { sheet.classList.remove('hidden'); refreshDevices(prefs); };
  $('#setup-close').onclick = () => sheet.classList.add('hidden');
  sheet.onclick = (e) => { if (e.target === sheet) sheet.classList.add('hidden'); };

  $('#dev-mic').onchange = (e) => { prefs.micId = e.target.value; saveAudioPrefs(prefs); kaudio.setMicDevice(prefs.micId); updateWarn(); };
  $('#dev-out').onchange = async (e) => {
    prefs.outId = e.target.value;
    saveAudioPrefs(prefs);
    const ok = await kaudio.setOutputDevice(prefs.outId);
    if (!ok && prefs.outId) toast('This browser can’t redirect output — pick the speaker in macOS Sound instead.');
    updateWarn();
  };
  $('#dev-external').checked = !!prefs.external;
  $('#dev-external').onchange = (e) => { prefs.external = e.target.checked; saveAudioPrefs(prefs); applyExternal(kaudio, prefs.external); };

  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshDevices(prefs));
}
