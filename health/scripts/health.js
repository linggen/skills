// health.js — the Mac page.
//
// It renders the mirror and nothing else. The passes run on the phone, so
// every number here was computed there and carried up; this page's whole job
// is to show what is actually held and to be honest about what is not.
//
// The rule that shapes every function below: a null is an absence, never a
// zero. A missing plan is a week not yet drafted, not a week of rest, and a
// Mac with no phone paired has no body data at all — not an empty body.

import './chat-bridge.js'; // sets window.LinggenUI
import { verb } from './bash.js';

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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── state ────────────────────────────────────────────────────────────────────

let report = null;
let ledger = null;
let insights = [];
let error = null;

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

  $('mirror').textContent = mirrorLine();

  // A Mac alone has no body data. Say that first and say it plainly, because
  // every other card on this page would be a guess.
  if (!report.phone_paired) {
    main.append(pairCard());
    main.append(ledgerCard());
    return;
  }

  if (insights.length) main.append(insightCards());
  const brief = briefCard();
  if (brief) main.append(brief);

  const cols = el('div', 'cols');
  const who = profileCard();
  if (who) cols.append(who);
  const targets = targetsCard();
  if (targets) cols.append(targets);
  if (cols.childElementCount) main.append(cols);

  const plan = planCard();
  if (plan) main.append(plan);
  const list = checklistCard();
  if (list) main.append(list);
  main.append(ledgerCard());
}

function mirrorLine() {
  const h = report?.held;
  if (!h || !h.samples) return 'nothing mirrored yet';
  return `${num(h.samples)} samples · ${h.types} types · since ${day(h.first)}`;
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

function briefCard() {
  const b = report.brief;
  if (!b) return null;
  const c = card(`This morning · ${day(b.date || report.today)}`);
  c.classList.add('lead');
  const text = b.text || b.line || b.sentence;
  if (text) c.append(el('p', 'big', text));
  const ev = Array.isArray(b.evidence) ? b.evidence : [];
  if (ev.length) {
    const chips = el('div', 'chips');
    for (const e of ev) chips.append(el('span', 'chip', typeof e === 'string' ? e : ''));
    c.append(chips);
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

const GREETING =
  'The user just opened Linggen Health (this message is hidden from them). ' +
  'Greet them now, following the "0. Greeting" section of your instructions.';

// The agent writes through the same one writer this page reads from, so a
// repaint shortly after one of its tools runs keeps the two in step.
const WRITERS = new Set(['Log']);

async function mountChat() {
  let alive = false;
  let chat;
  try {
    chat = await window.LinggenUI.mount($('chat-panel'), {
      skillName: SKILL,
      agentId: 'ling',
      title: 'Health',
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
    return;
  }
  setTimeout(() => chat?.sendHidden(GREETING), 700);
  setTimeout(() => {
    if (!alive) chat?.sendHidden(GREETING);
  }, 4500);
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
  render();
}

$('refresh').addEventListener('click', load);
load();
mountChat();
