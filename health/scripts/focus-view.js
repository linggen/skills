// focus-view.js — the Focus section, on the Mac.
//
// One question this person's data answers today, drawn as the component
// that answers it. Everything drawn here was computed on the phone; this
// file owns the scales, the colours, the gaps and the text under the chart,
// and nothing else. A Mac has room, so the related view sits beside the
// leading one — the same question over its longer period, or the same
// share as bars — never an unrelated measurement.

import { homeOf, selectedOf } from './home.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, dp) =>
  isNum(v) ? Number(v.toFixed(dp ?? (Math.abs(v) < 10 ? 1 : 0))).toLocaleString() : '—';
const withUnit = (v, unit) => `${fmt(v)}${unit ? ` ${unit}` : ''}`;
const span = (m) => {
  const n = Math.round(m);
  return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`;
};
const hours = (h) => span(h * 60);

export const PALETTE = ['#2c7355', '#387eae', '#ad675b', '#9a8540', '#886ba0', '#69818a'];

/// The chart in words, for whoever cannot see it.
export function describe(e) {
  const parts = e.values.map((v, i) => `${e.labels[i]}: ${isNum(v) ? withUnit(v, e.unit) : 'no reading'}`);
  return `${e.title}, ${e.period}. ${isNum(e.target) ? `Target ${withUnit(e.target, e.unit)}. ` : ''}${parts.join('; ')}.`;
}

/// The section. [change] runs one action through the writer; [explore]
/// opens the Data tab; [ask] hands the conversation a question.
export function focusView(report, { change, explore, ask, canUndo }) {
  const home = homeOf(report);
  const section = el('section', 'home-section focus');
  const head = el('div', 'focus-head');
  head.append(el('h2', null, 'Focus'));
  section.append(head);

  const entry = selectedOf(home);
  if (!entry) {
    section.append(
      el(
        'p',
        'dim',
        home.catalog.length
          ? home.why
          : 'Not enough recorded yet to draw anything. It fills in as the phone reads its history.',
      ),
    );
    return section;
  }

  section.append(el('h3', 'q', entry.question));
  section.append(
    el('p', 'dim small', `${entry.title} · ${entry.period}${home.pinned === entry.subject ? ' · pinned' : ''}`),
  );

  // The leading component, and beside it the related view when there is
  // one: the same subject over its other period, or the same share as bars.
  const row = el('div', 'focus-row');
  row.append(chartBox(entry));
  const sibling = related(home, entry);
  if (sibling) row.append(chartBox(sibling, true));
  section.append(row);

  if (entry.coverage) section.append(el('p', 'dim small', entry.coverage));

  section.append(controls(home, entry, { change, explore, ask, canUndo }));
  return section;
}

/// The related view a Mac has room for. Never a different subject.
function related(home, entry) {
  const other = (entry.periods || []).find((p) => p !== entry.id);
  if (other) {
    const e = home.catalog.find((c) => c.id === other);
    if (e) return e;
  }
  const otherKind = entry.kinds.find((k) => k !== entry.kind);
  if (otherKind) return { ...entry, kind: otherKind, id: `${entry.id}~${otherKind}` };
  return null;
}

function chartBox(e, side = false) {
  const box = el('figure', `chart${side ? ' side' : ''}`);
  if (side) box.append(el('figcaption', 'dim small', `${e.title} · ${e.period}`));
  const draw = { line, bars, share, nights, weeks, progress }[e.kind];
  const body = el('div', 'chart-body');
  body.setAttribute('role', 'img');
  body.setAttribute('aria-label', describe(e));
  body.append(draw(e));
  box.append(body);
  return box;
}

// ── the components ───────────────────────────────────────────────────────

function head(big, note) {
  const h = el('div', 'chart-head');
  h.append(el('b', 'lead', big));
  if (note) h.append(el('span', 'dim small', note));
  return h;
}

function ends(labels) {
  const e = el('div', 'chart-ends');
  e.append(el('span', null, labels[0]), el('span', null, labels[labels.length - 1]));
  return e;
}

/// The measurement over its days, its own normal dashed through it, a gap
/// for every day with no reading.
function line(e) {
  const wrap = el('div', 'chart-stack');
  const real = e.values.filter(isNum);
  const lo = Math.min(...real, ...(isNum(e.normal) ? [e.normal] : []));
  const hi = Math.max(...real, ...(isNum(e.normal) ? [e.normal] : []));
  const last = real[real.length - 1];
  wrap.append(
    head(
      withUnit(last, e.unit),
      isNum(e.normal)
        ? `your normal ${fmt(e.normal)} · ${fmt(lo)} to ${fmt(hi)}`
        : `${fmt(lo)} to ${fmt(hi)}`,
    ),
  );
  const w = 100;
  const h = 40;
  const pad = 2;
  const range = hi - lo || Math.abs(hi) || 1;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, e.values.length - 1);
  const y = (v) => h - pad - ((v - lo) / range) * (h - pad * 2);
  const s = svg('svg', { class: 'spark tall', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
  if (isNum(e.normal)) s.append(svg('line', { class: 'base', x1: 0, y1: y(e.normal), x2: w, y2: y(e.normal) }));
  let run = [];
  const flush = () => {
    if (run.length >= 2) s.append(svg('path', { class: 'line jade', d: `M ${run.join(' L ')}` }));
    else if (run.length === 1) {
      const [px, py] = run[0].split(' ');
      s.append(svg('line', { class: 'dot jade', x1: px, y1: py, x2: px, y2: py }));
    }
    run = [];
  };
  e.values.forEach((v, i) => (isNum(v) ? run.push(`${x(i)} ${y(v)}`) : flush()));
  flush();
  const lastIdx = e.values.reduce((acc, v, i) => (isNum(v) ? i : acc), -1);
  if (lastIdx >= 0) s.append(svg('line', { class: 'now jade', x1: x(lastIdx), y1: y(e.values[lastIdx]), x2: x(lastIdx), y2: y(e.values[lastIdx]) }));
  wrap.append(s, ends(e.labels));
  return wrap;
}

/// Categories side by side, each with its number.
function bars(e) {
  const wrap = el('div', 'chart-stack');
  const max = Math.max(...e.values.filter(isNum), 1);
  e.values.forEach((v, i) => {
    const r = el('div', 'bar-row');
    r.append(el('span', 'k', e.labels[i]));
    const track = el('div', 'bar-track');
    const fill = el('div');
    fill.style.width = `${isNum(v) ? (v / max) * 100 : 0}%`;
    fill.style.background = PALETTE[i % PALETTE.length];
    track.append(fill);
    r.append(track, el('span', 'v num', isNum(v) ? withUnit(v, e.unit) : 'no reading'));
    wrap.append(r);
  });
  return wrap;
}

/// Part to whole: a ring and the legend that says which part is which.
function share(e) {
  const wrap = el('div', 'chart-share');
  const total = e.values.reduce((a, b) => a + b, 0);
  const ring = el('div', 'ring');
  let end = 0;
  const stops = e.values.map((v, i) => {
    const start = end;
    end += (v / total) * 100;
    return `${PALETTE[i % PALETTE.length]} ${start}% ${end}%`;
  });
  ring.style.background = `conic-gradient(${stops.join(',')})`;
  ring.append(el('span', null, withUnit(total, e.unit)));
  wrap.append(ring);
  const legend = el('div', 'legend');
  e.values.forEach((v, i) => {
    const r = el('div', 'legend-row');
    const dot = el('i');
    dot.style.background = PALETTE[i % PALETTE.length];
    r.append(dot, el('span', 'k', e.labels[i]), el('b', 'num', `${Math.round((v / total) * 100)}%`));
    legend.append(r);
  });
  wrap.append(legend);
  return wrap;
}

/// A fortnight of nights on one clock from the evening into the morning; a
/// night with no rows is an empty dashed row, never a short one. Rows are
/// HTML, not a stretched SVG: text does not survive a non-uniform scale.
function nights(e) {
  const wrap = el('div', 'chart-stack');
  const rows = e.nights;
  const recorded = rows.filter(Boolean);
  const avg = recorded.length ? recorded.reduce((a, n) => a + n.hours, 0) / recorded.length : null;
  wrap.append(
    head(
      avg == null ? '—' : hours(avg),
      `a night, over ${recorded.length} recorded${isNum(e.normal) ? ` · your normal ${hours(e.normal)}` : ''}`,
    ),
  );
  const bed = (n) => n.bed;
  const wake = (n) => n.wake + 360;
  let lo = 120;
  let hi = 900;
  for (const n of recorded) {
    lo = Math.min(lo, bed(n) - 30);
    hi = Math.max(hi, wake(n) + 30);
  }
  const range = Math.max(60, hi - lo);
  const pct = (m) => `${((m - lo) / range) * 100}%`;
  const grid = el('div', 'nights');
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  rows.forEach((n, i) => {
    const r = el('div', 'night-row');
    const d = new Date(`${e.labels[i]}T12:00:00`);
    r.append(el('span', 'd', Number.isNaN(d.getTime()) ? '' : DAYS[(d.getDay() + 6) % 7]));
    const track = el('div', 'night-track');
    for (let m = Math.ceil(lo / 120) * 120; m <= hi; m += 120) {
      const t = el('i', m === 360 ? 'tick strong' : 'tick');
      t.style.left = pct(m);
      track.append(t);
    }
    if (n) {
      const bar = el('b', i === rows.length - 1 ? 'night now' : 'night');
      bar.style.left = pct(bed(n));
      bar.style.width = `${((wake(n) - bed(n)) / range) * 100}%`;
      bar.title = `${n.bed_at || ''} → ${n.wake_at || ''} · ${hours(n.hours)}`;
      track.append(bar);
    } else {
      track.append(el('s', 'gap'));
    }
    r.append(track);
    grid.append(r);
  });
  const axis = el('div', 'night-row axis');
  axis.append(el('span', 'd', ''));
  const track = el('div', 'night-track');
  for (let m = Math.ceil(lo / 120) * 120; m <= hi; m += 120) {
    const t = el('span', 'hour', `${String((Math.floor(m / 60) + 18) % 24).padStart(2, '0')}:00`);
    t.style.left = pct(m);
    track.append(t);
  }
  axis.append(track);
  grid.append(axis);
  wrap.append(grid);
  return wrap;
}

/// Weeks side by side, the usual week dashed through them, this one open
/// because it has not finished.
function weeks(e) {
  const wrap = el('div', 'chart-stack');
  const vals = e.values.map((v) => (isNum(v) ? v : 0));
  const now = vals[vals.length - 1];
  const asWords = (v) => (e.unit === 'min' ? span(v) : withUnit(v, e.unit));
  wrap.append(
    head(
      asWords(now),
      `${e.partial_last ? 'so far this week' : 'this week'}${isNum(e.normal) ? ` · your usual ${asWords(e.normal)}` : ''}`,
    ),
  );
  const W = 100;
  const H = 40;
  const hi = Math.max(...vals, isNum(e.normal) ? e.normal : 0, 1);
  const gap = 1.5;
  const bw = (W - gap * (vals.length - 1)) / vals.length;
  const s = svg('svg', { class: 'weeks', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  vals.forEach((v, i) => {
    const h = Math.max(1, (v / hi) * H);
    const last = i === vals.length - 1;
    s.append(
      svg('rect', {
        class: last && e.partial_last ? 'week open' : last ? 'week now' : 'week',
        x: i * (bw + gap),
        y: H - h,
        width: bw,
        height: h,
        rx: 0.8,
      }),
    );
  });
  if (isNum(e.normal)) {
    const y = H - (e.normal / hi) * H;
    s.append(svg('line', { class: 'base', x1: 0, y1: y, x2: W, y2: y }));
  }
  wrap.append(s, ends(e.labels));
  return wrap;
}

/// Progress toward a target the person actually has — the target and where
/// it came from, beside the number.
function progress(e) {
  const wrap = el('div', 'chart-stack');
  const value = e.values[0];
  const frac = Math.min(1, value / e.target);
  wrap.append(head(`${fmt(value, 0)} of ${withUnit(e.target, e.unit)}`, `${Math.round((value / e.target) * 100)}%`));
  const track = el('div', 'bar-track big');
  const fill = el('div');
  fill.style.width = `${frac * 100}%`;
  track.append(fill);
  wrap.append(track, el('p', 'dim small', `Target: ${e.target_source}`));
  return wrap;
}

// ── the person's hands ───────────────────────────────────────────────────

function controls(home, entry, { change, explore, ask, canUndo }) {
  const bar = el('div', 'focus-controls');
  const button = (label, onClick, cls = 'ask') => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const pinned = home.pinned === entry.subject;
  bar.append(button(pinned ? 'Unpin' : 'Pin this', () => change({ action: pinned ? 'unpin' : 'pin', id: entry.id })));
  for (const p of entry.periods || []) {
    if (p === entry.id) continue;
    const sib = home.catalog.find((c) => c.id === p);
    if (sib) bar.append(button(`Show ${sib.period.toLowerCase()}`, () => change({ action: 'select', id: sib.id })));
  }
  for (const k of entry.kinds) {
    if (k !== entry.kind) bar.append(button(`As ${kindWords(k)}`, () => change({ action: 'kind', id: entry.id, kind: k })));
  }
  bar.append(picker(home, entry, change));
  bar.append(button('Explore', explore));
  bar.append(button('Why this?', () => explain(home)));
  if (canUndo) bar.append(button('Undo', () => change({ action: 'undo' })));
  bar.append(button('Show less of this', () => change({ action: 'hide', id: entry.id }), 'ask quiet'));
  if (ask) bar.append(button('Ask Ling about this', () => ask(`On my Health page: ${entry.question} (${entry.title}, ${entry.period}). ${describe(entry)} What should I make of it?`)));
  return bar;
}

/// The reason, shown beside the section rather than under a dialog — the
/// app shell has no native dialogs, and a why is a sentence, not an alarm.
function explain(home) {
  const old = document.querySelector('.focus .why-line');
  if (old) old.remove();
  const p = el('p', 'why why-line', home.why || '');
  document.querySelector('.focus')?.append(p);
}

const kindWords = (k) => ({ share: 'a share', bars: 'bars', line: 'a line', nights: 'nights' }[k] || k);

/// Everything the catalog holds, by question; hidden subjects sit at the
/// end and say so, and choosing one brings it back.
function picker(home, entry, change) {
  const select = document.createElement('select');
  select.className = 'focus-pick';
  select.setAttribute('aria-label', 'Show something else');
  const empty = document.createElement('option');
  empty.textContent = 'Something else…';
  empty.value = '';
  select.append(empty);
  const hidden = new Set(home.hidden || []);
  const ordered = [...home.catalog.filter((c) => !hidden.has(c.subject)), ...home.catalog.filter((c) => hidden.has(c.subject))];
  for (const c of ordered) {
    if (c.id === entry.id) continue;
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.question} — ${c.title}, ${c.period.toLowerCase()}${hidden.has(c.subject) ? ' (hidden)' : ''}`;
    select.append(o);
  }
  select.addEventListener('change', () => {
    if (select.value) change({ action: 'select', id: select.value });
  });
  return select;
}
