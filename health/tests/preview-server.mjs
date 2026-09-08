// Local synthetic-data preview of the production page. No user store or model calls.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { changeFocus } from '../scripts/home.js';

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const today = '2026-09-08';
const days = (n, from = '2026-08-26') =>
  Array.from({ length: n }, (_, i) => new Date(new Date(`${from}T12:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10));
const hrv = {
  id: 'hrv#line14', subject: 'hrv', kind: 'line', kinds: ['line'], title: 'HRV', question: 'Is my HRV where it usually is?',
  period: 'Last 14 days', periods: ['hrv#line14', 'hrv#line28'], unit: 'ms',
  values: [31, 34, 29, null, 33, 35, 30, 28, 32, 36, 31, 29, 30, 27], labels: days(14), normal: 32,
  coverage: '13 of 14 days measured', source: 'review/2026-09-08.json (synthetic)', relevance: 0.85, tier: 'ranked',
};
const hrv28 = { ...hrv, id: 'hrv#line28', period: 'Last 28 days', values: [...hrv.values.map((v) => (v == null ? null : v + 2)), ...hrv.values], labels: days(28, '2026-08-12'), coverage: '26 of 28 days measured' };
const nights = {
  id: 'sleep#nights14', subject: 'sleep', kind: 'nights', kinds: ['nights', 'line'], title: 'Sleep timing', question: 'How consistent is my bedtime?',
  period: 'Last 14 nights', periods: ['sleep#nights14'], unit: 'h',
  values: [7.1, null, 6.8, 7.4, null, 7.0, 6.5, 7.2, 7.3, null, 6.9, 7.1, 7.0, 6.7], labels: days(14),
  nights: [7.1, null, 6.8, 7.4, null, 7.0, 6.5, 7.2, 7.3, null, 6.9, 7.1, 7.0, 6.7].map((h, i) => (h == null ? null : { bed: 320 + (i % 3) * 25, wake: 395 + (i % 2) * 20, hours: h })),
  normal: 7.0, coverage: '11 of 14 nights recorded', source: 'sleep rows (synthetic)', relevance: 0.8, tier: 'goal',
};
const weeks = {
  id: 'training#weeks8', subject: 'training', kind: 'weeks', kinds: ['weeks'], title: 'Training weeks', question: 'How does this week compare with my usual?',
  period: 'Last 8 weeks', periods: ['training#weeks8'], unit: 'min', values: [210, 180, 240, 0, 200, 260, 230, 95], labels: days(8, '2026-07-20'),
  sessions: [4, 3, 4, 0, 4, 5, 4, 2], partial_last: true, normal: 205, coverage: 'Minutes of recorded workouts a week; this week has not finished', source: 'workouts (synthetic)', relevance: 0.9, tier: 'goal',
};
const energy = {
  id: 'energy#share28', subject: 'energy', kind: 'share', kinds: ['share', 'bars'], title: 'Activity balance', question: 'How is my activity energy divided between sports?',
  period: 'Last 28 days', periods: ['energy#share7', 'energy#share28'], unit: 'kcal', values: [1240, 840, 310], labels: ['Running', 'Functional strength training', 'Walking'],
  coverage: 'Estimated energy from 9 recorded workouts; 1 without an energy reading', source: 'workouts (synthetic)', relevance: 0.35, tier: 'ranked',
};
const protein = {
  id: 'protein#progress', subject: 'protein', kind: 'progress', kinds: ['progress'], title: 'Protein', question: 'How am I doing against my protein target?',
  period: 'Today', periods: ['protein#progress'], unit: 'g', values: [61], labels: ['Today'], target: 169, target_source: '2.0 g/kg × 84.6 kg (bulking, serious)',
  coverage: 'Logged protein against the target in your plan', source: 'targets.json (synthetic)', relevance: 0.8, tier: 'goal',
};
let layout = {
  version: 4, cards: [],
  home: {
    version: 2, composed_at: `${today}T05:00:00.000Z`, by: 'rules', catalog: [weeks, protein, nights, hrv, hrv28, energy],
    selected: 'training#weeks8', selected_by: 'rules', selected_on: today, why: 'Your goal is bulking — this is the measure of it.',
    hidden: [], kinds: {}, opened: {}, attention: [{ kind: 'gap', subject: 'sleep', label: 'Sleep', text: '3 of the last 7 nights have no sleep data' }],
  },
};
let prior = null;
const report = () => ({
  ok: true, today, phone_paired: true, layout,
  brief: { date: today, text: 'Your activity is up this week, while your sleep schedule is steady.' },
  held: { samples: 2400, first: '2026-08-01' },
  review: { date: today, examined: 8, normal: 8, see: 0, doc: 0, score: 81, verdicts: [] },
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/bash') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    try {
      const command = JSON.parse(raw).command;
      const match = command.match(/ingest\.mjs"\s+(\w+)(.*)$/);
      const verb = match?.[1];
      let result;
      if (verb === 'report') result = report();
      else if (verb === 'ledger') result = {ok: true, types: {}, devices: {}};
      else if (verb === 'focus') {
        const args = [...match[2].matchAll(/'([^']*)'/g)].map((m) => (m[1] === 'none' ? undefined : m[1]));
        const [id, action, kind, why] = args;
        const old = structuredClone(layout);
        if (action === 'undo') {
          if (!prior) throw new Error('Nothing to undo');
          layout = prior;
        } else layout = { ...layout, home: changeFocus(layout.home, { action, id, kind, why }) };
        prior = old;
        layout.previous = 'preview';
        result = { ok: true, layout };
      } else throw new Error('Unsupported preview command');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({exit_code: 0, stdout: JSON.stringify(result)}));
    } catch (e) {res.end(JSON.stringify({exit_code: 1, stderr: e.message}));}
    return;
  }
  if (url.pathname === '/chat-bridge.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`window.LinggenUI = {mount: async (node) => {
      node.textContent = 'Synthetic-data preview. Live chat is available in Linggen.';
      node.style.padding = '24px';
      return {sendHidden() {}, send(text) {node.textContent = 'Preview question: ' + text;}};
    }};`); return;
  }
  const name = url.pathname === '/' ? 'health.html' : url.pathname.slice(1);
  if (name.includes('/') || name.includes('..')) {res.writeHead(404).end(); return;}
  const file = path.join(scripts, name);
  try {
    let body = fs.readFileSync(file);
    if (name === 'health.html') body = Buffer.from(body.toString().replace('<h1>Linggen Health</h1>', '<h1>Linggen Health <small>Preview</small></h1>'));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(body);
  } catch {res.writeHead(404).end();}
});
server.listen(Number(process.env.PORT || 9539), '127.0.0.1', () => console.log('Health preview: http://127.0.0.1:9539'));
