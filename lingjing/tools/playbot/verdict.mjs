// tools/playbot/verdict.mjs — the one place a play-bot review's verdict is derived. The review page (review-ui),
// report.mjs and the release gate (linggen/scripts/gate/playbot.sh) all read a run through this; nothing else
// decides pass / fail / pending. Only node:fs and node:path, so the gate can run it on its own.
//
// The two-tier review (2026-11-07): Claude looks at every shot and sorts each — sure-pass, sure-fail, unsure. Hanli
// answers only the unsure ones (the review page, 试玩台). A sure fail fails without waiting for him.
//
// review.json (one per report folder, its run_id that run's):
//   { run_id, verdict: "pass"|"fail"|"pending", reviewer, shots_total, shots_answered, summary?,
//     notes: [{ shot: "shots/…png", answer, certainty?: "sure"|"unsure", fail?: true,
//               ask?: "≤40 字 question for Hanli", box?: {x,y,w,h} (shot pixels),
//               hanli?: { ok: true|false, said?, at } }] }
// A note with no certainty is sure (every file before 2026-11-07). A shot with no note, counted in shots_answered,
// is a sure pass. Hanli's answer on a note beats Claude's call on it (ok:false fails, ok:true clears a fail).
// `verdict` is Claude's own call: a legacy file (no note carries certainty) keeps it as written; a new
// file's pass/fail is derived from its notes, so an overruled fail does not stay failed.
//
// Derived:  fail    a hard finding in findings.json, or a note whose result is a fail
//           pending no review / another run's id, Claude not done (no reviewer, shots_answered < shots_total),
//                   or an unsure note Hanli has not answered
//           pass    otherwise
//
//   node verdict.mjs <report dir> [expected run id] [--json]
//     → "PASS|FAIL|REVIEW<TAB>detail" (the gate's review_status line), or the whole derivation as JSON.
//     The expected id defaults to findings.json's run_id.
import fs from 'node:fs';
import path from 'node:path';

/** The review.json a fresh report starts with (report.mjs). */
export function blankReview(runId, shotsTotal) {
  return { run_id: runId, verdict: 'pending', reviewer: null, notes: [], shots_answered: 0, shots_total: shotsTotal };
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** A note as the verdict sees it: certainty defaulted, and what it comes to once Hanli's answer is taken. */
export function noteState(n) {
  const certainty = n?.certainty === 'unsure' ? 'unsure' : 'sure';
  const hanli = n?.hanli && typeof n.hanli.ok === 'boolean' ? n.hanli : null;
  let result;
  if (hanli) result = hanli.ok ? 'pass' : 'fail';
  else if (certainty === 'unsure') result = 'waiting';
  else result = n?.fail === true ? 'fail' : 'pass';
  return { certainty, hanli, result, by: hanli ? 'hanli' : 'claude' };
}

// Legacy = written before certainty existed. Hanli's answers do not make a file new: one he answers on the page still
// keeps its reviewer's written fail.
const isLegacy = (review) => !(review.notes ?? []).some((n) => n && n.certainty);

/**
 * The verdict of one run. `review` and `findings` are the parsed files (or null); `expectedId` the run id the review
 * must carry (null: whatever findings.json says).
 * → { verdict, why, waiting: [{shot, ask, box}], fails: [{shot, answer, by}], hard, claudeDone, counts, legacy }
 */
export function derive({ review, findings, expectedId = null }) {
  const hard = (findings?.findings ?? []).filter((f) => f.hard);
  const want = expectedId ?? findings?.run_id ?? null;
  const base = { waiting: [], fails: [], hard: hard.length, claudeDone: false, legacy: false, counts: { notes: 0, unsure: 0, answered_by_hanli: 0 } };
  if (!review) return { ...base, verdict: 'pending', why: 'no-review' };
  if (want != null && review.run_id !== want) return { ...base, verdict: 'pending', why: 'other-run', reviewRunId: review.run_id ?? null, expectedId: want };

  const notes = (review.notes ?? []).filter((n) => n && typeof n === 'object');
  const legacy = isLegacy(review);
  const states = notes.map((n) => ({ n, s: noteState(n) }));
  const waiting = states.filter(({ s }) => s.result === 'waiting').map(({ n }) => ({ shot: n.shot, ask: n.ask ?? null, box: n.box ?? null }));
  const fails = states.filter(({ s }) => s.result === 'fail').map(({ n, s }) => ({ shot: n.shot, answer: s.hanli ? (s.hanli.said || '行不通') : n.answer, by: s.by }));
  const total = Number(review.shots_total ?? 0), answered = Number(review.shots_answered ?? 0);
  const claudeDone = Boolean(review.reviewer) && answered >= total && (!legacy || review.verdict !== 'pending');
  const counts = { notes: notes.length, unsure: states.filter(({ s }) => s.certainty === 'unsure').length, answered_by_hanli: states.filter(({ s }) => s.hanli).length, shots_total: total, shots_answered: answered };
  const out = { ...base, waiting, fails, claudeDone, legacy, counts, reviewer: review.reviewer ?? null };

  if (hard.length) return { ...out, verdict: 'fail', why: 'hard-findings' };
  if (fails.length) return { ...out, verdict: 'fail', why: 'note-fail' };
  if (legacy && review.verdict === 'fail') return { ...out, verdict: 'fail', why: 'reviewer-fail', said: notes.slice(0, 2).map((n) => n.answer ?? '').join(' · ') };
  if (!claudeDone) return { ...out, verdict: 'pending', why: 'claude-not-done' };
  if (waiting.length) return { ...out, verdict: 'pending', why: 'waiting-for-hanli' };
  return { ...out, verdict: 'pass', why: 'pass' };
}

/** A report folder read and derived. */
export function deriveDir(dir, expectedId = null) {
  const review = readJson(path.join(dir, 'review.json'));
  const findings = readJson(path.join(dir, 'findings.json'));
  return { ...derive({ review, findings, expectedId }), file: path.join(dir, 'review.json'), hasReviewFile: review != null };
}

const list = (xs, n = 5) => (xs.length > n ? `${xs.slice(0, n).join(', ')}, …` : xs.join(', '));
const oneLine = (s, n = 120) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').slice(0, n);

/** The gate's review row: [status, detail] — status PASS | FAIL | REVIEW, the detail one line with no tab. */
export function gateLine(d, { dir = '', gateRun = '' } = {}) {
  const again = gateRun ? `just release-gate --verdict ${gateRun}` : 'just release-gate --verdict <gate run dir>';
  switch (d.why) {
    case 'no-review': return ['REVIEW', `REVIEW PENDING — no ${d.file ?? 'review.json'}`];
    case 'other-run': return ['REVIEW', `REVIEW PENDING — review.json is for run ${d.reviewRunId ?? '?'}, not ${d.expectedId}`];
    case 'hard-findings': return ['FAIL', `${d.hard} hard finding(s) stand (${dir}/findings.json)`];
    case 'note-fail': return ['FAIL', oneLine(`${d.fails.length} shot(s) fail: ${d.fails.slice(0, 2).map((f) => `${path.basename(f.shot ?? '?')}${f.by === 'hanli' ? ' (Hanli)' : ''}: ${f.answer}`).join(' · ')}`, 200)];
    case 'reviewer-fail': return ['FAIL', `reviewer says fail: ${oneLine(d.said)} (${d.file ?? dir})`];
    case 'claude-not-done': return ['REVIEW', `REVIEW PENDING — Claude has answered ${d.counts.shots_answered ?? 0}/${d.counts.shots_total ?? '?'} shots: answer ${dir}/checklist.md, write review.json, then: ${again}`];
    case 'waiting-for-hanli': return ['REVIEW', oneLine(`REVIEW PENDING — ${d.waiting.length} items wait for Hanli: ${list(d.waiting.map((w) => path.basename(w.shot ?? '?')))} (试玩台: run.sh --ui), then: ${again}`, 400)];
    default: return ['PASS', `pass by ${d.reviewer ?? '?'}, ${d.counts.notes} notes, ${d.counts.shots_answered}/${d.counts.shots_total} shots${d.counts.answered_by_hanli ? `, ${d.counts.answered_by_hanli} answered by Hanli` : ''}`];
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const asJson = process.argv.includes('--json');
  const gateRun = process.argv.find((a) => a.startsWith('--gate-run='))?.slice(11) ?? '';
  if (!args[0]) { console.error('usage: verdict.mjs <report dir> [expected run id] [--json] [--gate-run=<dir>]'); process.exit(2); }
  const dir = path.resolve(args[0]);
  const d = deriveDir(dir, args[1] ?? null);
  if (asJson) console.log(JSON.stringify(d, null, 2));
  else console.log(gateLine(d, { dir, gateRun }).join('\t'));
}
