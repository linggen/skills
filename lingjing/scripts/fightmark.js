// fightmark.js — where he can fight, on the map (Hanli, 2026-10-27: 「打怪的后山, 加一个战斗icon, 让玩家能看出来啊」):
// a place where a beast stands now (Look's `fights`, rules/fights.mjs) wears a small 斗 seal on the map, the plate
// and the 去往 list, inked by how hard that beast is against his hand (fightodds.js, the page's, when idle):
// jade 易 · gold 相当 · vermilion 稍难 · filled vermilion 难. Every word esc()'d.
import { esc } from './esc.js';
import { GRADE_WORDS } from './fightodds.js';

const WORDS = { zh: { mark: '斗', fight: '降妖' }, en: { mark: '⚔', fight: 'Fight' } };

/// Look's fights by place id.
export const fightsById = (look) => new Map((look?.fights ?? []).map((f) => [f.id, f]));

/// The seal: 斗, its ink the grade (`odds(brief)` → { grade, win } or null while it is weighed), the beast on hover.
export function fightMarkHtml(f, odds, lang = 'zh') {
  if (!f) return '';
  const w = WORDS[lang] ?? WORDS.zh, o = odds?.({ setup: f.setup }) ?? null;
  const grade = o ? (GRADE_WORDS[lang] ?? GRADE_WORDS.zh)[o.grade] : '';
  const title = [w.fight, f.creature?.name, grade].filter(Boolean).join(' · ');
  return `<b class="fightmark${o ? ` g-${esc(o.grade)}` : ''}" title="${esc(title)}">${esc(w.mark)}</b>`;
}
