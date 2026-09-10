// health.js — the Mac page.
//
// It renders the mirror and nothing else. The passes run on the phone, so
// every number here was computed there and carried up; this page's whole job
// is to show what is actually held and to be honest about what is not.
//
// The first view is the same promise as the phone's and leads with the same
// thing: what last night's examination found. What a Mac adds is not more on
// that first screen — it is that everything is reachable one tab behind it,
// and the Data tab holds every measurement examined, including the ones that
// had nothing to say, so *nothing needs you* can be checked instead of
// believed. A phone never shows that list.
//
// Two rules shape every function below. A null is an absence, never a zero: a
// missing plan is a week not yet drafted, not a week of rest, and a Mac with
// no phone paired has no body data at all. And the agent's voice lives in the
// conversation, never on the view — nothing here explains the page.

import './chat-bridge.js'; // sets window.LinggenUI
import { listSkillSessions } from './api.js';
import { verb } from './bash.js';
import { focusView } from './focus-view.js';
import { candidatesOf, cardsOf, homeOf } from './home.js';

const SKILL = 'health';
const $ = (id) => document.getElementById(id);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const card = (title, ...kids) => {
  const c = el('section', 'card');
  if (title) c.append(el('span', 'eyebrow', title));
  for (const k of kids) if (k) c.append(k);
  return c;
};

const row = (k, v, note) => {
  const r = el('div', 'row');
  r.append(el('div', 'k', k));
  const box = el('div', 'v');
  box.append(el('div', null, v));
  if (note) box.append(el('small', null, note));
  r.append(box);
  return r;
};

const num = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const day = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : '—');
const clock = (iso) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? null
    : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/// A measured value as a person would read it, with its unit.
const value = (v, unit) => {
  if (typeof v !== 'number') return '—';
  const dp = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  const n = Number(v.toFixed(dp)).toLocaleString();
  return unit ? `${n} ${unit}` : n;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The four verdicts, in the words the user reads and the class that colours
// them. `thin` is an absence — too few days to have a normal at all — and is
// never dressed as a judgement.
const VERDICT = {
  doc: ['worth a doctor', 'doc'],
  see: ['worth seeing', 'see'],
  normal: ['at your normal', 'ok'],
  thin: ['nothing to judge yet', 'thin'],
};

// ── state ────────────────────────────────────────────────────────────────────

let report = null;
let ledger = null;
let insights = [];
let error = null;
let tab = 'highlights';

// ── tabs ─────────────────────────────────────────────────────────────────────

/// The doors, in the phone's order, under the short names a tab strip has
/// room for. A tab exists when the mirror holds what is behind it — an empty
/// tab would be a door onto nothing, which is the thing this page is against.
function tabs() {
  const has = (k) => report && report[k] != null;
  return [
    { id: 'highlights', name: 'Highlights', on: true },
    { id: 'review', name: 'Review', on: true },
    { id: 'body', name: 'Body', on: has('profile') || has('targets') },
    { id: 'week', name: 'Week', on: has('plan') },
    { id: 'today', name: 'Today', on: has('checklist') },
    { id: 'data', name: 'Data', on: true },
  ].filter((t) => t.on);
}

function renderTabs() {
  const nav = $('tabs');
  nav.textContent = '';
  const open = tabs();
  if (!open.some((t) => t.id === tab)) tab = 'highlights';
  for (const t of open) {
    const b = el('button', null, t.name);
    b.type = 'button';
    b.setAttribute('aria-current', String(t.id === tab));
    b.addEventListener('click', () => {
      tab = t.id;
      render();
    });
    nav.append(b);
  }
}

// ── render ───────────────────────────────────────────────────────────────────

function render() {
  const main = $('main');
  main.textContent = '';

  if (error) {
    main.append(card('Something went wrong', el('p', 'err', error)));
    return;
  }
  if (!report) {
    main.append(card(null, el('p', 'dim', 'Reading what this Mac holds…')));
    return;
  }

  $('strip').textContent = stripLine();

  // A Mac alone has no body data. Say that first and say it plainly, because
  // every other panel on this page would be a guess.
  if (!report.phone_paired) {
    $('tabs').textContent = '';
    main.append(pairCard());
    main.append(ledgerCard());
    return;
  }

  renderTabs();
  const panel = {
    highlights: highlightsTab,
    review: reviewTab,
    body: bodyTab,
    week: weekTab,
    today: todayTab,
    data: dataTab,
  }[tab];
  for (const node of panel()) if (node) main.append(node);
}

/// What the pass found and what this Mac holds, on one line. Counts, never a
/// score: the number that is a judgement lives on the status card, where it
/// can say what it was made of.
function stripLine() {
  const r = report.review;
  const h = report.held;
  const held = h && h.samples ? `mirror ${num(h.samples)} samples since ${day(h.first)}` : null;
  const found =
    r && r.date === report.today
      ? [
          `${num(r.examined)} types examined`,
          `${num(r.normal)} at your normal`,
          `${num(r.see)} worth seeing`,
          `${num(r.doc)} worth a doctor`,
        ].join(' · ')
      : 'no examination today yet';
  return [found, held].filter(Boolean).join(' · ');
}

function pairCard() {
  const c = card(null);
  c.classList.add('pair');
  c.append(el('h2', null, 'No iPhone paired'));
  c.append(
    el(
      'p',
      null,
      'Apple Health only exists on an iPhone, so this Mac has no body data of ' +
        'its own — none of it can be inferred from here. Open Linggen on your ' +
        'iPhone, pair it with this Mac, and Health will fill this page in ' +
        'within the first minute.',
    ),
  );
  c.append(el('p', 'dim', report.healthkit));
  return c;
}

// ── the review ───────────────────────────────────────────────────────────────

/// Home: three sections that never move, composed from the inside. Brief
/// says what matters today and proves it looked; Focus answers one question
/// this person's data can answer, drawn as the component that answers it;
/// Attention is there only when something needs a decision — a finding, or
/// a gap in the data said as a gap. A warning sits above all three.
/// The page the phone composed, drawn here in the order it composed it.
///
/// The document is the phone's (`layout.json`'s `home`): `candidates` is
/// everything today could show, `highlights.cards` is what was picked, and
/// this Mac renders that list and recomputes nothing — the dynamic-UI rule
/// that a paired Mac shows the same screen from the same file. A dismissal
/// here is the same hand as the phone's swipe and goes back through the same
/// validator, so the two never disagree about what is on the page.
///
/// A mirror from before Highlights was composed still has a Focus and an
/// Attention list; that page is kept below and drawn when there is no
/// composition to draw.
function highlightsTab() {
  const home = homeOf(report);
  const cards = cardsOf(home);
  if (!cards.length) return legacyHomeTab();

  const r = report.review;
  const byId = new Map(candidatesOf(home).map((c) => [`${c.id}`, c]));
  const findings = r ? findingsOf(r) : [];
  const gaps = Array.isArray(home.attention) ? home.attention : [];
  let firstFocus = true;

  const nodes = cards.map((id) => {
    const cand = byId.get(id);
    if (!cand) return null; // a card whose candidate is gone is not drawn
    const kind = `${cand.kind || ''}`;
    if (kind === 'brief') return briefSection();
    if (kind === 'warning' || kind === 'finding') {
      const f = findings.find((x) => x.type === cand.subject);
      return f ? dismissable(findingCard(f, r), cand) : null;
    }
    if (kind === 'notice') return dismissable(noticeCard(cand), cand);
    if (kind === 'gap') {
      const g = gaps.find((x) => x.subject === cand.subject || x.label === cand.label);
      return g ? dismissable(gapCard(g), cand) : null;
    }
    if (kind === 'focus') {
      const view = focusView(report, {
        entryId: `${id}`.replace(/^focus:/, ''), // the candidate id wraps the catalog id
        header: firstFocus,
        change: changeFocus,
        explore: () => {
          tab = 'data';
          render();
        },
        ask: chat ? (q) => chat.send(q) : null,
        canUndo: typeof report.layout?.previous === 'string',
      });
      firstFocus = false;
      return dismissable(view, cand);
    }
    return null;
  });

  return [
    ...nodes,
    askButton('What should I focus on in Health, given my goals?', 'Ask Ling'),
  ];
}

/// The line that proves the night looked, with the counts behind it.
function briefSection() {
  const r = report.review;
  const fresh = r && r.date === report.today;
  const s = el('section', 'home-section');
  const head = el('div', 'focus-head');
  head.append(el('h2', null, 'Brief'));
  s.append(head);
  const text =
    report.brief?.date === report.today && typeof report.brief.text === 'string'
      ? report.brief.text
      : fresh
        ? line(r)
        : 'No examination today yet.';
  s.append(el('p', 'big', text));
  s.append(
    el(
      'p',
      'dim small',
      fresh
        ? `${num(r.examined)} measurements examined · ${num(r.normal)} at your normal`
        : r
          ? `Latest examination: ${day(r.date)}`
          : 'The first examination has not run.',
    ),
  );
  return s;
}

/// A door the phone put on the page — the Sunday letter, the doctor page, a
/// nutrition list waiting for their word. The label is the candidate's; where
/// the card leads is the phone's business, so this names it and stops.
function noticeCard(cand) {
  const c = card(cand.label || 'Something for you');
  const where = { letters: 'Letters', doctor: 'For your doctor', nutrition: 'Nutrition' }[cand.route];
  c.append(el('p', 'why', where ? `${where} — open it on your phone.` : 'Open it on your phone.'));
  return c;
}

/// Every dismissable card carries the hand that takes it off the page. The
/// phone swipes; a Mac has a pointer, so it is a button — the same verb, the
/// same validator, and it travels back on the next sync.
function dismissable(node, cand) {
  if (!node || cand.dismissable !== true) return node;
  const b = el('button', 'dismiss', 'Got it');
  b.type = 'button';
  b.title = 'Take this off the page until something changes';
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await verb('dismiss', cand.id);
      await load();
    } catch (e) {
      const message = el('p', 'err', String(e.message || e));
      message.setAttribute('role', 'alert');
      node.append(message);
      b.disabled = false;
    }
  });
  node.append(b);
  return node;
}

function legacyHomeTab() {
  const r = report.review;
  const fresh = r && r.date === report.today;
  const section = (title, ...nodes) => {
    const s = el('section', 'home-section');
    const head = el('div', 'focus-head');
    head.append(el('h2', null, title));
    s.append(head);
    for (const n of nodes) if (n) s.append(n);
    return s;
  };
  const shown = r ? findingsOf(r).filter((f) => f.verdict === 'doc' || f.verdict === 'see') : [];
  const hidden = report.layout?.hidden || [];
  const attention = shown.filter((f) => f.verdict === 'see' && !hidden.includes(`finding:${f.type}`));
  const home = homeOf(report);
  const gaps = fresh && Array.isArray(home.attention) ? home.attention : [];
  const brief =
    report.brief?.date === report.today && typeof report.brief.text === 'string'
      ? report.brief.text
      : fresh
        ? line(r)
        : 'No examination today yet.';
  const proof = fresh
    ? `${num(r.examined)} measurements examined · ${num(r.normal)} at your normal`
    : r
      ? `Latest examination: ${day(r.date)}`
      : 'The first examination has not run.';
  const proofLine = el('p', 'dim small', proof);
  return [
    ...shown.filter((f) => f.verdict === 'doc').map((f) => findingCard(f, r)),
    section('Brief', el('p', 'big', brief), proofLine),
    focusView(report, {
      change: changeFocus,
      explore: () => {
        tab = 'data';
        render();
      },
      ask: chat ? (q) => chat.send(q) : null,
      canUndo: typeof report.layout?.previous === 'string',
    }),
    attention.length || gaps.length
      ? section('Attention', ...attention.map((f) => findingCard(f, r)), ...gaps.map(gapCard))
      : null,
    askButton('What should I focus on in Health, given my goals?', 'Ask Ling'),
  ];
}

/// A data issue: something this person usually records and lately has not.
/// Neutral on purpose — it is not a finding, and it must never read as one.
function gapCard(g) {
  const c = card(`Data · ${g.label || ''}`);
  c.append(el('p', 'big', g.text || ''));
  c.append(el('p', 'why', 'Not a health concern — a gap in what is being recorded. The source is on the phone.'));
  return c;
}

/// One change to Focus, through the one writer, then a repaint from disk.
async function changeFocus({ action, id, kind, why }) {
  const buttons = document.querySelectorAll('.focus button, .focus select');
  buttons.forEach((b) => (b.disabled = true));
  try {
    await verb('focus', id || 'none', action, kind || 'none', why || 'none');
    await load();
  } catch (e) {
    const message = el('p', 'err', String(e.message || e));
    message.setAttribute('role', 'alert');
    document.querySelector('.focus')?.append(message);
    buttons.forEach((b) => (b.disabled = false));
  }
}

/// Everything the night's examination produced, in the order it matters:
/// the one line that proves it looked, the counts behind it, whatever earned
/// a place, and what the number was made of. The working behind Home.
function reviewTab() {
  const r = report.review;
  if (!r || r.date !== report.today) {
    return [
      card(
        'Today',
        el('p', 'big', 'Not examined yet today.'),
        el(
          'p',
          'why',
          r
            ? `The last examination this Mac has is from ${day(r.date)}. It runs on ` +
              'your iPhone and reaches this Mac on the next sync — nothing here is ' +
              'a verdict until it has.'
            : 'The examination runs on your iPhone. Nothing here is a verdict ' +
              'until one has reached this Mac.',
        ),
      ),
      insights.length ? insightCards() : null,
      ledgerCard(),
    ];
  }
  const shown = findingsOf(r).filter((f) => f.verdict === 'doc' || f.verdict === 'see');
  return [
    statusCard(r),
    insights.length ? insightCards() : null,
    tilesCard(r, shown),
    ...shown.map((f) => findingCard(f, r)),
    shown.length ? null : indexCard(r),
  ];
}

/// A card that carries a number carries the question about it too.
///
/// The phone puts the same button on a finding, because a finding is the
/// start of a question rather than the end of one. Here the conversation is
/// already on screen beside the card, so the only thing missing is which card
/// the user means — the button says it, in their own words, and the answer
/// comes back where they can argue with it.
///
/// Dead until the conversation is up, and it says so rather than swallowing
/// the click.
function askButton(question, label = 'Ask Ling about this') {
  const b = el('button', 'ask', label);
  b.type = 'button';
  if (!chat) {
    b.disabled = true;
    b.title = 'The conversation is not up yet.';
    return b;
  }
  b.addEventListener('click', () => chat.send(question));
  return b;
}

/// The one line, and the proof it looked. No score: a number that grades a
/// person is Apple's to give and never ours (removed 2026-09-10); what is
/// here is a position against their own normal, said in words.
function statusCard(r) {
  const c = card(null);
  c.classList.add('status');
  if (r.doc > 0 || r.see > 0) c.classList.add('warm');
  const box = el('div', 'v');
  box.append(el('span', 'eyebrow', 'Today'));
  box.append(el('p', 'big', line(r)));
  box.append(el('p', 'why', madeOf(r)));
  box.append(askButton(todayQuestion(r), 'Ask Ling about today'));
  c.append(box);
  return c;
}

/// What a person would actually type about the morning: explain it, and say
/// what would help — against their own normal, never a target to farm.
function todayQuestion(r) {
  const found =
    r.doc > 0 || r.see > 0
      ? `The examination raised ${num(r.see + r.doc)} thing${r.see + r.doc === 1 ? '' : 's'} against my own normal today.`
      : 'The examination found nothing off my own normal today.';
  return (
    `${found} Explain what that is actually saying about me, and ` +
    `given what you know of my goal, what would help.`
  );
}

/// The sentence the status line leads with — the same words the phone used,
/// because it is the same verdict.
function line(r) {
  if (r.doc > 0) return 'Something has held long enough to show a doctor.';
  if (r.see === 1) return 'One thing worth seeing.';
  if (r.see > 1) return `${r.see} things worth seeing.`;
  return 'Nothing needs you today.';
}

function madeOf(r) {
  return `${num(r.examined)} measurements examined against your own normal.`;
}

const list = (xs) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};


/// The four counts. Each says what it is made of, so a zero can be read.
function tilesCard(r, shown) {
  const c = card('Last night');
  const at = clock(r.at);
  const box = el('div', 'tiles');
  const tile = (n, k, note, cls) => {
    const t = el('div', `tile${cls ? ` ${cls}` : ''}`);
    t.append(el('b', 'num', num(n)));
    t.append(el('span', 'k', k));
    t.append(el('span', 's', note));
    box.append(t);
  };
  tile(r.examined, 'Types examined', at ? `examined at ${at}` : 'by your iPhone');
  tile(r.normal, 'At your normal', 'nothing to say');
  tile(
    r.see,
    'Worth seeing',
    shown
      .filter((f) => f.verdict === 'see')
      .map((f) => f.label)
      .join(', ') || 'none today',
    r.see > 0 ? 'warm' : null,
  );
  tile(
    r.doc,
    'Worth a doctor',
    shown
      .filter((f) => f.verdict === 'doc')
      .map((f) => f.label)
      .join(', ') || 'clear',
    r.doc > 0 ? 'crit' : null,
  );
  c.append(box);
  if (r.thin > 0) {
    c.append(
      el(
        'p',
        'why',
        `${num(r.thin)} more are kept but have no normal yet — too few days, or ` +
          'nothing that moves against a baseline. They are in Data with the reason.',
      ),
    );
  }
  return c;
}

const findingsOf = (r) => (Array.isArray(r.verdicts) ? r.verdicts : []);

/// A measurement that moved: what it is, what it was, how long it has been
/// like that, and its own fortnight with the person's normal drawn through it.
function findingCard(f, r) {
  const alarm = f.verdict === 'doc';
  const c = card(null);
  c.classList.add('finding');
  if (alarm) c.classList.add('alarm');
  c.append(
    el(
      'span',
      'eyebrow warm',
      alarm
        ? f.held_days
          ? `Worth a doctor · ${f.held_days} days`
          : 'Worth a doctor · today'
        : `Worth seeing · ${f.label}`,
    ),
  );
  const gap =
    typeof f.now === 'number' && typeof f.normal === 'number'
      ? Math.abs(f.now - f.normal)
      : null;
  // A flag has no normal and no gap — the examination wrote the sentence
  // because it is the only thing that knows how to say what happened.
  c.append(
    el(
      'p',
      'big',
      f.headline ||
        (gap == null
          ? `${f.label} is ${value(f.now, f.unit)}`
          : `${f.label} is ${value(f.now, f.unit)}, ${value(gap, f.unit)} ` +
            `${f.now < f.normal ? 'below' : 'above'} your normal`),
    ),
  );
  const chart = spark(f);
  if (chart) c.append(chart);
  const note = chartNote(f, r);
  if (note) c.append(note);
  const ev = Array.isArray(f.evidence) ? f.evidence : [];
  if (ev.length) c.append(el('p', 'why', sentence(ev)));
  if (alarm) {
    c.append(
      el(
        'p',
        'why',
        'A change this size, held this long, is worth showing a doctor. ' +
          'Nothing here can tell you what is causing it.',
      ),
    );
  }
  c.append(askButton(findingQuestion(f, gap)));
  return c;
}

/// The finding in the user's own words, with the numbers the card is showing
/// so the answer is about this measurement and not about the idea of it.
function findingQuestion(f, gap) {
  if (f.headline) {
    return `${f.headline}. Explain what that means for me, and what would help.`;
  }
  const where =
    gap == null
      ? `${f.label} is ${value(f.now, f.unit)}`
      : `${f.label} is ${value(f.now, f.unit)}, ${value(gap, f.unit)} ` +
        `${f.now < f.normal ? 'below' : 'above'} my normal of ` +
        `${value(f.normal, f.unit)}`;
  const ev = Array.isArray(f.evidence) && f.evidence.length
    ? ` ${sentence(f.evidence)}`
    : '';
  return (
    `${where}.${ev} Explain what that means for me, and what would help.`
  );
}

/// Nothing moved, so the page shows the one measurement this person is most
/// likely to want watched — and says why that one was picked.
function indexCard(r) {
  const idx = r.index;
  if (!idx || !idx.picked) return null;
  const f = findingsOf(r).find((x) => x.type === idx.picked);
  if (!f) return null;
  const c = card('Worth watching');
  c.append(el('p', 'big', `${f.label} is ${value(f.now, f.unit)}, at your normal`));
  const chart = spark(f);
  if (chart) c.append(chart);
  const note = chartNote(f, r);
  if (note) c.append(note);
  if (idx.why) c.append(el('p', 'why', `Picked for you: ${idx.why}.`));
  return c;
}

/// What the line is, in dates. A review written before the examination
/// carried its series has none, and then there is no line and nothing to say
/// about one — a "0 days measured" would read as a person who was not.
function chartNote(f, r) {
  const held = (f.series || []).filter((v) => typeof v === 'number').length;
  if (!held) return null;
  const end = f.series_to || r.date;
  const norm = typeof f.normal === 'number' ? `, your normal ${value(f.normal, f.unit)}` : '';
  return el(
    'p',
    'pn',
    `The fortnight to ${day(end)} — ${held} day${held === 1 ? '' : 's'} measured${norm}.`,
  );
}

const sentence = (ev) => {
  const [first, ...rest] = ev;
  const s = first.charAt(0).toUpperCase() + first.slice(1);
  return rest.length ? `${s}, and ${rest.join(', ')}.` : `${s}.`;
};

/// The finding's own fortnight, drawn from the series the examination folded.
/// A gap is a day with no reading and is left as a gap; nothing here invents
/// a point to join a line up.
function spark(f) {
  const values = Array.isArray(f.series) ? f.series : [];
  const real = values.filter((v) => typeof v === 'number');
  if (real.length < 2) return null;
  const w = 100;
  const h = 30;
  const pad = 2;
  const lo = Math.min(...real, ...(typeof f.normal === 'number' ? [f.normal] : []));
  const hi = Math.max(...real, ...(typeof f.normal === 'number' ? [f.normal] : []));
  const span = hi - lo || Math.abs(hi) || 1;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v) => h - pad - ((v - lo) / span) * (h - pad * 2);

  const s = svg('svg', {
    class: 'spark',
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `${f.label}, the last ${values.length} days`,
  });
  if (typeof f.normal === 'number') {
    s.append(svg('line', { class: 'base', x1: 0, y1: y(f.normal), x2: w, y2: y(f.normal) }));
  }
  // One path per unbroken run, so a gap in the data stays a gap on the chart.
  // The box is stretched to the page's width, so a circle here would come out
  // an ellipse: every mark is a stroke, which `non-scaling-stroke` keeps round.
  const tick = (cx, cy, cls) =>
    svg('line', { class: cls, x1: cx, y1: cy, x2: cx, y2: cy });
  let run = [];
  const flush = () => {
    if (run.length >= 2) s.append(svg('path', { class: 'line', d: `M ${run.join(' L ')}` }));
    else if (run.length === 1) {
      const [px, py] = run[0].split(' ');
      s.append(tick(px, py, 'dot'));
    }
    run = [];
  };
  values.forEach((v, i) => {
    if (typeof v !== 'number') return flush();
    run.push(`${x(i)} ${y(v)}`);
  });
  flush();
  const lastIdx = values.reduce((acc, v, i) => (typeof v === 'number' ? i : acc), -1);
  if (lastIdx >= 0) {
    s.append(tick(x(lastIdx), y(values[lastIdx]), 'now'));
  }
  return s;
}


// ── the other doors ──────────────────────────────────────────────────────────

function bodyTab() {
  return [profileCard(), targetsCard()];
}

function weekTab() {
  return [planCard()];
}

function todayTab() {
  return [checklistCard()];
}

/// Everything examined, including the ones that had nothing to say. This is
/// the tab a phone never has room for, and the reason *nothing needs you* can
/// be checked instead of believed.
function dataTab() {
  const r = report.review;
  const out = [];
  if (r) {
    const rank = { doc: 0, see: 1, normal: 2, thin: 3 };
    const rows = findingsOf(r)
      .slice()
      .sort(
        (a, b) =>
          rank[a.verdict] - rank[b.verdict] ||
          Math.abs(b.adverse || 0) - Math.abs(a.adverse || 0) ||
          String(a.label).localeCompare(String(b.label)),
      );
    const c = card(`Everything examined · ${day(r.date)}`);
    c.append(el('p', 'why', `${num(rows.length)} measurements, every one of them.`));
    c.append(verdictTable(rows, { why: true }));
    out.push(c);
  }
  out.push(ledgerCard());
  return out;
}

function verdictTable(rows, opts = {}) {
  const wrap = el('div', 'tablewrap');
  const t = el('table', 'mini');
  const head = el('tr');
  for (const h of ['Measurement', 'Your normal', 'Now', 'Verdict']) {
    head.append(el('th', null, h));
  }
  const thead = el('thead');
  thead.append(head);
  t.append(thead);
  const body = el('tbody');
  for (const f of rows) {
    const tr = el('tr');
    tr.append(el('td', null, f.label));
    tr.append(el('td', 'n', value(f.normal, f.unit)));
    tr.append(el('td', 'n', value(f.now, f.unit)));
    const [word, cls] = VERDICT[f.verdict] || VERDICT.thin;
    // A thin row says which kind of absence it is, in its own words, because
    // "nothing to judge yet" on its own claims more than we know.
    tr.append(el('td', cls, opts.why && f.why ? f.why : word));
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

function insightCards() {
  const c = card('What I found');
  for (const i of insights) {
    const box = el('div', 'row');
    box.append(el('div', 'k', i.tone || 'info'));
    const v = el('div', 'v');
    v.append(el('div', null, i.title || ''));
    if (i.body) v.append(el('small', null, i.body));
    box.append(v);
    c.append(box);
  }
  return c;
}

/// Who the phone's agent thinks the user is — with how sure, and why.
///
/// A field under the confidence bar is not shown at all. The phone does not
/// show it either, and a Mac that displayed a guess the phone was too unsure
/// to make would be the more confident of the two about the same data.
const SHOWN = 0.6;

function profileCard() {
  const p = report.profile;
  if (!p) return null;
  const c = card('Who you are');
  const a = p.athlete || {};
  const body = p.body || {};
  const routine = p.routine || {};

  const goals = Array.isArray(p.goals) ? p.goals : p.goal ? [p.goal] : [];
  if (goals.length) {
    const chips = el('div', 'chips');
    goals.forEach((g, i) => {
      chips.append(el('span', `chip${i === 0 ? ' on' : ''}`, goalWords(g)));
    });
    c.append(chips);
    if (p.lead_why) c.append(el('p', 'why', `${goals.length > 1 ? 'Leading: ' : ''}${p.lead_why}`));
  }

  if ((a.confidence ?? 0) >= SHOWN) {
    c.append(
      row(
        'Training',
        [a.environment, a.kind].filter(Boolean).join(' '),
        [
          a.sessions_per_week ? `${a.sessions_per_week} a week` : null,
          (a.typical_days || []).join(' · ') || null,
          (a.evidence || [])[0] || null,
        ]
          .filter(Boolean)
          .join(' — '),
      ),
    );
  }
  if (typeof body.weight_kg === 'number') {
    c.append(
      row(
        'Weight',
        `${body.weight_kg} kg`,
        body.weight_at ? `last weighed in ${body.weight_at}` : null,
      ),
    );
  }
  if ((routine.confidence ?? 0) >= SHOWN && routine.wake) {
    c.append(row('Routine', `up around ${routine.wake}`, (routine.evidence || [])[0]));
  } else if (routine.evidence?.length) {
    // Absent for a reason, and the reason is worth more than a blank.
    c.append(row('Routine', 'not enough to say', routine.evidence[0]));
  }
  return c;
}

const goalWords = (g) => {
  const kind = typeof g === 'string' ? g : g?.kind;
  return (
    {
      bulking: 'Bulking',
      cutting: 'Cutting',
      race: 'A race',
      distance: 'Run further',
      sleep: 'Sleep better',
      move: 'Just move',
    }[kind] || kind || '—'
  );
};

function targetsCard() {
  const t = report.targets;
  if (!t) return null;
  const c = card('Targets');
  const add = (label, value, formula) => {
    if (value == null) return;
    c.append(row(label, value, formula));
  };
  add('Protein', `${num(t.protein_g)} g`, t.protein_formula);
  add('Energy', t.kcal ? `${num(t.kcal)} kcal` : null, t.kcal_formula);
  add('Water', t.water_ml ? `${num(t.water_ml)} ml` : null, t.water_formula);
  add('Sessions', t.sessions_per_week, t.sessions_formula);
  const supps = Array.isArray(t.supplements) ? t.supplements : [];
  for (const s of supps) {
    c.append(row(s.name || '', s.dose || 'not needed', s.evidence));
  }
  if (t.weight_stale) {
    c.append(
      el(
        'p',
        'why',
        `Every number above is per kilo, and the weight they use was measured on ${t.weight_at}.`,
      ),
    );
  }
  return c;
}

function planCard() {
  const p = report.plan;
  if (!p) return null;
  const c = card(`This week · from ${day(p.week || report.week)}`);
  if (p.why) c.append(el('p', 'why', p.why));
  for (const d of p.days || []) {
    const r = el('div', 'day');
    if (d.date === report.today) r.classList.add('today');
    const date = new Date(`${d.date}T12:00:00`);
    r.append(el('div', 'd', Number.isNaN(date.getTime()) ? '' : DAYS[date.getDay()]));
    const s = el('div', 's');
    const session = d.session;
    s.append(el('div', null, d.rest || !session ? 'Rest' : session.name || session.kind || ''));
    const note = [session?.detail, d.why].filter(Boolean).join(' — ');
    if (note) s.append(el('small', null, note));
    r.append(s);
    if (session?.minutes) r.append(el('div', 'm', `${session.minutes} min`));
    c.append(r);
  }
  const adjustments = p.adjustments || [];
  for (const a of adjustments) {
    c.append(el('p', 'why', `${day(a.date)}: ${a.from} → ${a.to} — ${a.why}`));
  }
  return c;
}

function checklistCard() {
  const l = report.checklist;
  if (!l) return null;
  const c = card(`Today · ${day(l.date || report.today)}`);
  for (const i of l.items || []) {
    const r = el('div', `item${i.done ? ' done' : ''}`);
    r.append(el('div', 'box'));
    const v = el('div', 'v');
    const target =
      i.target != null ? ` — ${num(i.value ?? 0)} of ${num(i.target)} ${i.unit || ''}`.trimEnd() : '';
    v.append(el('div', null, `${i.label || i.id}${target}`));
    if (i.done && i.source) v.append(el('div', 'src', `from ${i.source}`));
    r.append(v);
    c.append(r);
  }
  if (!(l.items || []).length) c.append(el('p', 'empty', 'Nothing on today’s list yet.'));
  return c;
}

function ledgerCard() {
  const c = card('What this Mac keeps');
  const types = ledger?.types || {};
  const rows = Object.entries(types)
    .filter(([, v]) => (v.count || 0) > 0)
    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
  if (!rows.length) {
    c.append(
      el(
        'p',
        'empty',
        report.phone_paired
          ? 'Your iPhone has paired but has not sent anything yet.'
          : 'Nothing — Apple Health lives on your iPhone.',
      ),
    );
    return c;
  }
  const box = el('div', 'ledger');
  for (const [id, l] of rows) {
    const r = el('div', 't');
    r.append(el('div', 'n', num(l.count)));
    r.append(el('div', 'id', label(id)));
    r.append(el('div', 'w', `${day(l.first)} → ${day(l.last)}`));
    box.append(r);
  }
  c.append(box);
  const devices = Object.entries(ledger?.devices || {});
  if (devices.length) {
    const [, d] = devices[0];
    c.append(
      el(
        'p',
        'why',
        `${devices.length} phone${devices.length > 1 ? 's' : ''} sending; last heard ${day(d.at)}.`,
      ),
    );
  }
  return c;
}

/// An Apple Health identifier as a person would say it.
const label = (id) =>
  id
    .replace(/^HK(Quantity|Category)TypeIdentifier/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (ch) => ch.toUpperCase());

// ── load ─────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const [r, l] = await Promise.all([verb('report'), verb('ledger')]);
    report = r;
    ledger = l;
    error = null;
  } catch (e) {
    error = String(e?.message || e);
  }
  render();
}

// ── chat ─────────────────────────────────────────────────────────────────────

/// The conversation, once it is up. Held here because the cards ask it
/// things: a finding is the start of a question, and the panel is right
/// there beside it.
let chat = null;

const GREETING =
  'The user just opened Linggen Health (this message is hidden from them). ' +
  'Greet them now, following the "0. Greeting" section of your instructions.';

// The agent writes through the same one writer this page reads from, so a
// repaint shortly after one of its tools runs keeps the two in step.
const WRITERS = new Set(['Log', 'Focus']);

/// The chat this page reopens: the newest session, if it is from today's
/// stretch. Same rule as DJ, CFO and Shifu — a page that mounted without one
/// made a brand-new session on every refresh and left the last conversation
/// where nobody could see it again.
async function recentSessionId() {
  try {
    const sessions = await listSkillSessions(SKILL);
    if (!sessions.length) return null;
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const ageHours = (Date.now() / 1000 - (sessions[0].created_at || 0)) / 3600;
    return ageHours < 24 ? sessions[0].id : null;
  } catch {
    return null;
  }
}

async function mountChat() {
  let alive = false;
  const resume = await recentSessionId();
  try {
    chat = await window.LinggenUI.mount($('chat-panel'), {
      skillName: SKILL,
      agentId: 'ling',
      title: 'Health',
      sessionId: resume || undefined,
      onStreamToken: () => {
        alive = true;
      },
      onContentBlock: (payload) => {
        alive = true;
        if (payload?.tool === 'PageUpdate' && payload?.args) {
          try {
            const args =
              typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
            applyPageUpdate(args);
          } catch (e) {
            console.warn('[health] PageUpdate parse', e);
          }
        }
        if (WRITERS.has(payload?.tool)) setTimeout(load, 1200);
      },
    });
  } catch (e) {
    console.error('[health] chat mount failed', e);
    chat = null;
    render();
    return;
  }
  // The Ask buttons were drawn dead while there was nothing to ask; now
  // there is.
  render();
  // A reopened conversation is picked up in silence. Greeting into a thread
  // that is already going would say hello to somebody mid-sentence, and a
  // refresh would do it again every time.
  if (!resume) {
    setTimeout(() => chat?.sendHidden(GREETING), 700);
    setTimeout(() => {
      if (!alive) chat?.sendHidden(GREETING);
    }, 4500);
  }
}

/// The model is not perfectly consistent about the shape it sends; be liberal
/// about where the cards are, and strict about what counts as one.
function applyPageUpdate(args) {
  const body = args?.body ?? args;
  const found = Array.isArray(body)
    ? body.flatMap((b) => b?.insights || [])
    : body?.insights || [];
  const rows = found.filter((i) => i && (i.title || i.body));
  if (!rows.length) return;
  insights = body?.replace === false ? [...insights, ...rows] : rows;
  // The working belongs beside the findings it is about.
  tab = 'review';
  render();
}

$('refresh').addEventListener('click', load);
load();
mountChat();
