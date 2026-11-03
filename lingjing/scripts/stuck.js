// stuck.js — a board's own end read as a skip (ownSkip). The stuck gate that lived here (「算了，往下走」 only once the
// player was stuck, Hanli 2026-10-15) is gone (Hanli 11-03: 「跳过, 我们统一改成右上角的关闭按钮了. 不需要卡住, 直接就给这个
// 关闭按钮」): every board's bar carries 留 · ✕ from the first moment (cards.js outHtml). Pure.

/** A board's own 跳过 (Hanli 11-03: 「跳过 still pays」 — the word boards' 跳过 and ropekit's ended as wins): the module's
    end says so — `grade: 'skipped'` (jinchat-games.js), `skipped: true` (ropekit, mount.js), `note: 'skipped'` (ink.js).
    The page and the phone's host send it as a skip, never a win; the rules' `win` turns one sent anyway into a skip. */
export const ownSkip = (o) => Boolean(o && (o.grade === 'skipped' || o.skipped === true || o.note === 'skipped'));
