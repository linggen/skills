// fightodds.js — how hard a fight is for him, before he takes it (Hanli 2026-10-27: 「后山是设计的打怪的场所吗?
// 似乎有点难」). Never guessed: the fight's own setup (Look's duel brief — his deck, gear, pills, the beast as the
// door deals it) played out over a few fixed deals by the careful line (fightline.js lookahead, the line the fight
// bands are tuned on, tools/story-fights.mjs), the share won graded 易 · 相当 · 稍难 · 难.
// tests/fightodds.test.mjs holds the grades to the bands' own numbers. Pure: the page runs it when idle and keeps
// the answer by setup, so a Look is never slowed by it.
import { act, begin, foeTurn } from './battle.js';
import { lookahead } from './fightline.js';

export const ODDS_DEALS = 10;
/* The grade by the share won: at or above each floor. The bands hold a first meeting at about 45% (fight-band). */
export const GRADES = [['easy', 0.75], ['fair', 0.5], ['hardish', 0.3], ['hard', 0]];
export const GRADE_WORDS = {
  zh: { easy: '易', fair: '相当', hardish: '稍难', hard: '难' },
  en: { easy: 'Easy', fair: 'Even', hardish: 'Tough', hard: 'Hard' },
};

export const gradeOf = win => GRADES.find(([, floor]) => win >= floor)[0];

/* One deal played out by the careful line. */
function played(setup, catalog, seed) {
  const st = begin({ ...setup, seed }, catalog);
  for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    act(st, lookahead(st), 'you');
  }
  return st.outcome;
}

/* The share of `deals` fixed deals won, and its grade. The deals are the setup's own seed varied, so the
   same door weighs the same each time. */
export function fightOdds(setup, catalog, deals = ODDS_DEALS) {
  let won = 0;
  for (let k = 0; k < deals; k += 1) if (played(setup, catalog, `odds|${setup.seed ?? ''}|${k}`) === 'won') won += 1;
  const win = won / deals;
  return { win, grade: gradeOf(win) };
}

/* A setup's key for the page's keeping: what decides the fight, not the deal. */
export const oddsKey = setup => JSON.stringify({ you: { ...setup.you, fresh: undefined }, foe: setup.foe });
