// tools/playbot/report.mjs — the play bot's review pack (report/<run-id>/): what a reviewer — the deployer Claude
// on every deploy, or a person — reads against checklist.md, no API key needed.
//
//   findings.json   every check that failed (hard) or warned, each with its screenshot
//   refusals.json   every refusal the rules gave the bot, with its reason and where (for a person to read)
//   played.json     what was played, and what could not be played and why
//   shots/          every screenshot; contact.png + contact.html, all of them on one sheet
//   checklist.md    the questions to answer per screenshot
//   shots.json      every screenshot in order: {file, size, tag, where} (the review page groups them by fight)
//   review.json     the verdict, "pending" until the reviewer fills it in for THIS run id (verdict.mjs derives it —
//                   the release gate and the review page read it through that, nothing else)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { blankReview } from './verdict.mjs';

export const QUESTIONS = [
  'Can every card\'s cost, name and effect be read?',
  'Is it clear what was won (所得 — what, how much, where it went)?',
  'Is anything confusing, or is space wasted (an empty band, a squeezed hand)?',
  'Does anything look broken (overlap, cut text, a blank or half-drawn panel, an error)?',
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function writePack(out, result, { runId }) {
  const w = (f, v) => fs.writeFileSync(path.join(out, f), typeof v === 'string' ? v : `${JSON.stringify(v, null, 2)}\n`);
  w('findings.json', { run_id: runId, skill: result.skill, at: result.at, hard: result.findings.filter((f) => f.hard).length, findings: result.findings });
  w('refusals.json', { run_id: runId, refusals: result.refusals });
  w('played.json', { run_id: runId, played: result.played, unplayable: result.unplayable, sizes: result.sizes, fights: result.fights });
  w('shots.json', { run_id: runId, shots: result.screenshots });
  const review = path.join(out, 'review.json');
  if (!fs.existsSync(review)) w('review.json', blankReview(runId, result.screenshots.length));

  const hard = result.findings.filter((f) => f.hard);
  const byShot = new Map();
  for (const f of result.findings) if (f.shot) byShot.set(f.shot, [...(byShot.get(f.shot) ?? []), f]);
  const lines = [
    `# Play bot review — ${runId}`,
    '',
    `Skill: \`${result.skill}\` · ${result.at} · sizes ${result.sizes.join(', ')} · ${result.fights} 降妖 a size.`,
    `Hard findings: **${hard.length}** (findings.json). Refusals met: ${result.refusals.length} (refusals.json). Could not be played: ${result.unplayable.length} (played.json).`,
    '',
    '## How to review',
    '',
    '1. Read findings.json and refusals.json first: each hard finding names its screenshot.',
    '2. Open contact.png for the whole run, then every screenshot below, and answer the four questions for each.',
    '3. Sort every screenshot: sure pass, sure fail, or unsure (only when the answer is taste or real-device readability).',
    '   Read lingjing/tools/playbot/rulings.jsonl first — a question Hanli has answered is not asked again.',
    '4. Write review.json: `verdict` (your own call, "pass" or "fail"), `reviewer`, `notes` (one per screenshot with anything to say:',
    '   `{shot, answer, certainty: "sure"|"unsure", fail?: true, ask?: "≤40 字", box?: {x,y,w,h}}`), `shots_answered` = the number of',
    '   screenshots looked at. Keep `run_id` as it is — a review of another run does not count. Hanli answers the unsure ones on',
    '   the review page (`run.sh --ui`); verdict.mjs derives the verdict.',
    '',
    '## The questions, per screenshot',
    '',
    ...QUESTIONS.map((q, i) => `${i + 1}. ${q}`),
    '',
    '## Screenshots',
    '',
    ...result.screenshots.flatMap((s) => [
      `### ${s.file}`,
      `${s.where} · ${s.tag}${byShot.has(s.file) ? ` — flagged: ${byShot.get(s.file).map((f) => `${f.kind}${f.why ? `/${f.why}` : ''}`).join(', ')}` : ''}`,
      ...QUESTIONS.map((q) => `- [ ] ${q}`),
      '',
    ]),
  ];
  w('checklist.md', `${lines.join('\n')}\n`);

  // The contact sheet: every screenshot as a thumbnail with its name, drawn and photographed.
  const cells = result.screenshots.map((s) => {
    const flagged = byShot.has(s.file);
    return `<figure class="${flagged ? 'bad' : ''}"><img src="${esc(s.file)}"><figcaption>${esc(path.basename(s.file))}${flagged ? ' ⚑' : ''}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(runId)}</title><style>
body{margin:12px;font:12px system-ui;background:#f4f1ea}h1{font-size:15px}
main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
figure{margin:0;background:#fff;padding:4px;border:2px solid #ddd}figure.bad{border-color:#c0392b}
img{width:100%;height:220px;object-fit:contain;background:#222}figcaption{word-break:break-all;margin-top:2px}</style>
<h1>${esc(runId)} — ${result.screenshots.length} shots, ${hard.length} hard findings (⚑ = flagged)</h1><main>${cells}</main>`;
  w('contact.html', html);
  try {
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    await p.goto(`file://${path.join(out, 'contact.html')}`);
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(out, 'contact.png'), fullPage: true });
    await b.close();
  } catch (e) {
    w('contact.error.txt', String(e));
  }
}
