// weekly.js — the Weekly card on the Investments tab: the newest weekly
// report (data/weekly.json, written only by weekly.pl save) and the switch
// for its mission (cfo:weekly). The page shows the facts as saved — the
// portfolio table code computed, the market points with their sources — and
// never asks the model to read it out.

import { markedHtml, moveHtml, money } from './investments.js';

const MISSION = 'cfo:weekly';
const POLL_MS = 5000;
const RUN_MAX_MS = 10 * 60 * 1000;
const NOTE_MS = 15 * 1000;

let deps = null;
const state = { doc: {}, mission: null, lastRun: null, running: false, confirming: false, folded: false, note: '' };
let poll = null;

/**
 * @param {object} d
 * @param {(path: string, fallback: any) => Promise<any>} d.readJson
 * @param {(s: string) => string} d.esc
 * @param {string} d.data data dir, `$HOME` left literal for bash
 */
export function initWeekly(d) {
  deps = d;
  document.getElementById('inv-weekly').addEventListener('click', onClick);
}

export async function renderWeekly() {
  state.doc = await deps.readJson(`${deps.data}/weekly.json`, {});
  try {
    const res = await fetch('/api/missions');
    state.mission = res.ok ? ((await res.json()).missions || []).find((m) => m.id === MISSION) || null : null;
    state.lastRun = state.mission ? await lastRun() : null;
  } catch (err) {
    console.warn('[cfo] weekly mission', err);
    state.mission = null;
  }
  state.running = state.lastRun?.status === 'running';
  draw();
  if (state.running && !poll) follow(Date.now());
}

// ── Pure ───────────────────────────────────────────────────────────────────

/// The newest report in data/weekly.json, or null before the first.
export function latestWeek(doc) {
  return doc?.latest ? doc.weeks?.[doc.latest] || null : null;
}

/// "Sep 28 – Oct 2, 2026" for a week's Monday and Friday.
export function weekSpan(from, to) {
  const d = (s) => new Date(`${s}T12:00:00`);
  const short = { month: 'short', day: 'numeric' };
  return `${d(from).toLocaleDateString('en-US', short)} – ${d(to).toLocaleDateString('en-US', { ...short, year: 'numeric' })}`;
}

/// A source link's label: the site, without "www.".
export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/// "Oct 14" for a YYYY-MM-DD day.
const dayShort = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ── Drawing ────────────────────────────────────────────────────────────────

function draw() {
  const el = document.getElementById('inv-weekly');
  if (el) el.innerHTML = cardHtml();
}

function cardHtml() {
  const { esc } = deps;
  const week = latestWeek(state.doc);
  const ask = state.confirming && !state.running
    ? `<div class="inv-prop"><span>Run it now? It reads the week’s news with the model.</span><span class="spacer"></span>
        <button class="btn" data-act="weekly-run-go">Run</button>
        <button class="chip ghost" data-act="weekly-run-cancel">Cancel</button></div>`
    : '';
  const intro = !week && !state.running
    ? `<p class="hint">${state.mission?.enabled ? 'The first report comes Sunday evening.' : 'Sunday evenings: the market week and what it did to your holdings, with sources.'}</p>`
    : '';
  const body = week ? weekHtml(week) : '';
  return `<div class="inv-watch inv-weekly">
    <div class="inv-watch-h"><b>✦ Weekly</b><span class="hint inline">· ${esc(headline())}</span><span class="spacer"></span>${controlsHtml()}</div>
    ${ask}${intro}${body}
  </div>`;
}

function controlsHtml() {
  const { mission, running, confirming } = state;
  if (!mission) return '';
  return mission.enabled
    ? `<button class="chip" data-act="weekly-run" ${running || confirming ? 'disabled' : ''}>Run now</button>
       <button class="chip ghost" data-act="weekly-off">Turn off</button>`
    : `<button class="chip" data-act="weekly-run" ${running || confirming ? 'disabled' : ''}>Run now</button>
       <button class="btn" data-act="weekly-on">Turn on</button>`;
}

function headline() {
  const { mission, running, lastRun, note } = state;
  if (!mission) return 'Unavailable — restart Linggen';
  if (note) return note;
  if (running) return 'Writing this week’s report…';
  const on = mission.enabled ? 'On · Sundays at 19:00' : 'Off';
  if (lastRun && lastRun.status !== 'completed') return `${on} · the last run didn’t finish`;
  return on;
}

function weekHtml(week) {
  const { esc } = deps;
  const open = !state.folded;
  const sections = (week.sections || []).map(sectionHtml).join('');
  const rest = `${tiesHtml(week.ties)}${reportedHtml(week.reported)}${nextHtml(week.next_week)}`;
  return `<div class="inv-watch-day">Week of ${esc(weekSpan(week.from, week.to))}</div>
    ${portfolioHtml(week.portfolio)}
    ${open ? sections + rest : ''}
    <button class="link inv-watch-more" data-act="weekly-fold">${open ? 'Fold the market week' : 'The market week'}</button>`;
}

/// Each holding's week, then the total per currency — as code computed it.
function portfolioHtml(p) {
  const { esc } = deps;
  const rows = (p?.holdings || []).map((h) => `<div class="wk-row">
      <span class="inv-watch-who">${esc(h.symbol)}</span>
      <span class="wk-num">${h.missing ? '<span class="hint inline">no closes this week</span>'
        : `${money(h.prev_close, h.currency)} → ${money(h.close, h.currency)}`}</span>
      <span class="wk-num">${h.missing ? '' : moveHtml(h.value_change, h.currency, h.change_pct)}</span>
    </div>`).join('');
  const totals = (p?.totals || []).map((t) => `<div class="wk-row wk-total">
      <span class="inv-watch-who">Total ${esc(t.currency)}</span>
      <span class="wk-num">${t.value === null ? `<span class="hint inline">no total — ${esc(t.missing.join(', '))} had no closes</span>` : money(t.value, t.currency, 0)}</span>
      <span class="wk-num">${t.value === null ? '' : moveHtml(t.value_change, t.currency, t.change_pct)}</span>
    </div>`).join('');
  return rows ? `<div class="wk-table">${rows}${totals}</div>` : '<p class="hint">No holdings this week.</p>';
}

function sectionHtml(s) {
  const { esc } = deps;
  return `<div class="inv-watch-day">${esc(s.title)}</div>
    <ul class="wk-points">${(s.bullets || []).map((b) => `<li>${esc(b.text)} ${sourceHtml(b.source)}</li>`).join('')}</ul>`;
}

function sourceHtml(url) {
  const { esc } = deps;
  return /^https:\/\//.test(url || '')
    ? `<button class="link wk-src" data-act="link" data-url="${esc(url)}">${esc(hostOf(url))} ↗</button>`
    : '';
}

function tiesHtml(ties) {
  const { esc } = deps;
  if (!ties?.length) return '';
  return `<div class="inv-watch-day">Your holdings</div>${ties.map((t) => `<div class="inv-watch-line">
      <span class="inv-watch-who">${esc((t.holdings || []).join(', '))}</span><span>${esc(t.text)}</span></div>`).join('')}`;
}

/// Results the Watch read this week — its saved summaries, as on the company card.
function reportedHtml(list) {
  const { esc } = deps;
  if (!list?.length) return '';
  return `<div class="inv-watch-day">Reported</div>${list.map((r) => `<div class="inv-watch-line">
      <span class="inv-watch-who">${esc(r.symbol)}</span>
      <div class="inv-report-body">${markedHtml(r.summary, esc)}</div>
      <span class="inv-watch-meta"><span>Filed ${esc(dayShort(r.filed))}</span>${sourceHtml(r.url)}</span></div>`).join('')}`;
}

function nextHtml(next) {
  const { esc } = deps;
  if (!next) return '';
  const events = (next.events || []).map((e) => `<li>${esc(dayShort(e.on))} · ${esc(e.symbol ? `${e.symbol} earnings` : e.label)}</li>`).join('');
  if (!next.line && !events) return '';
  return `<div class="inv-watch-day">Next week</div>${next.line ? `<p class="wk-next">${esc(next.line)}</p>` : ''}${events ? `<ul class="wk-points">${events}</ul>` : ''}`;
}

// ── Actions ────────────────────────────────────────────────────────────────

const missionUrl = (tail = '') => `/api/missions/${encodeURIComponent(MISSION)}${tail}`;

async function lastRun() {
  const runs = ((await (await fetch(missionUrl('/runs'))).json()).runs || []).filter((r) => !r.skipped);
  return runs[0] || null;
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  const acts = {
    'weekly-on': () => setEnabled(true),
    'weekly-off': () => setEnabled(false),
    'weekly-run': () => { state.confirming = true; draw(); },
    'weekly-run-go': () => { state.confirming = false; runNow(); },
    'weekly-run-cancel': () => { state.confirming = false; draw(); },
    'weekly-fold': () => { state.folded = !state.folded; draw(); },
  };
  acts[btn?.dataset.act]?.();
}

async function setEnabled(on) {
  try {
    const res = await fetch(missionUrl(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: on }) });
    if (!res.ok) throw new Error(`update ${res.status}`);
  } catch (err) {
    console.warn('[cfo] weekly switch', err);
    note("Couldn't reach Linggen");
  }
  await renderWeekly();
}

async function runNow() {
  if (state.running) return;
  try {
    const res = await fetch(missionUrl('/trigger'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) throw new Error(`trigger ${res.status}`);
    state.running = true;
    draw();
    follow(Date.now());
  } catch (err) {
    console.warn('[cfo] weekly run', err);
    note("Couldn't start the run");
  }
}

/// Wait for the run to end, then show what it saved.
function follow(started) {
  clearTimeout(poll);
  poll = setTimeout(async () => {
    let last = null;
    try { last = await lastRun(); } catch { /* try again */ }
    if ((!last || last.status === 'running') && Date.now() - started < RUN_MAX_MS) { follow(started); return; }
    poll = null;
    await renderWeekly();
  }, POLL_MS);
}

function note(text) {
  state.note = text;
  draw();
  setTimeout(() => { if (state.note === text) { state.note = ''; draw(); } }, NOTE_MS);
}
