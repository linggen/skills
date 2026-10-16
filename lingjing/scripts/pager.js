// pager.js — 快's pages (Hanli, 2026-10-15: 「可以用下面半屏显示吗? 可以让用户翻页.」).
//
// At 快 the rest of the passage stands at once (dialogue.js wholeOf) — no longer a column over
// the whole stage, but in a band on the stage's lower half (story.css `--band-top`), so the
// picture, a 亮相 or a 出场 keeps the upper half. What does not fit the band goes on the next
// page: 上一页 · 下一页 by the count, a tap on the words, a swipe, the arrow keys; the last page
// holds the choices (or 「接着往下」) as the column's end did.
//
// The pages come from the words as the band really lays them out — never a count of characters:
// every sentence (`.s`) is measured where it stands, and a page ends at a paragraph's end where
// one falls in its lower half, else at a sentence's end. One sentence taller than the band is a
// page of its own (it scrolls). A resize pages again, from the sentence the reader is on.
//
// Pure where it can be: `pageBreaks` is plain arithmetic over measured boxes (tests/pager.test.mjs);
// `createPager` is the small DOM part that measures, hides and turns.

/* Where each page starts, over the units of the text in reading order — a sentence, or a block
   that never splits (the choices) — each `{ top, bottom, end }` as laid out in one long column
   (`end`: a paragraph or block ends with it). `cap` the band's height. A page takes every unit
   that fits under its first one's top; it ends at the last paragraph's end that fills at least
   half of it, else at the last sentence that fits — never inside a sentence. A unit taller than
   the band alone is a page. Same boxes, same pages. */
export function pageBreaks(units, cap, { fill = 0.5 } = {}) {
  const n = units?.length ?? 0;
  if (!n || !(cap > 0)) return n ? [0] : [];
  const starts = [];
  let start = 0;
  while (start < n) {
    starts.push(start);
    const top = units[start].top;
    let fit = start;
    while (fit + 1 < n && units[fit + 1].bottom - top <= cap) fit += 1;
    if (fit === n - 1) break;
    let cut = fit;
    for (let k = fit; k > start; k -= 1) {
      if (units[k].end && units[k].bottom - top >= cap * fill) { cut = k; break; }
    }
    start = cut + 1;
  }
  return withWords(units, cap, starts);
}

/* The last page is never the way on alone (2026-10-16, 00-masan at 390: page 4/4 held only
   「接着往下」 — a page turned for nothing): the page before gives up its last paragraph — or, when
   none fits beside the block, its last sentences — so the choices stand under words. */
function withWords(units, cap, starts) {
  const n = units.length, k = starts.length;
  if (k < 2 || starts[k - 1] !== n - 1 || !units[n - 1].block) return starts;
  const prev = starts[k - 2], bottom = units[n - 1].bottom;
  let pick = -1;
  for (let j = n - 2; j > prev; j -= 1) {
    if (bottom - units[j].top > cap) break;
    if (pick < 0 || units[j - 1].end) pick = j;
    if (units[j - 1].end) break;
  }
  return pick < 0 ? starts : [...starts.slice(0, -1), pick];
}

/* Which page holds unit `u`. */
export const pageOf = (starts, u) => {
  let p = 0;
  for (let k = 0; k < starts.length; k += 1) if (starts[k] <= u) p = k;
  return p;
};

/* The DOM part: `sync(storyEl)` after every paint — it measures (once per column, per band
   size), keeps the page across a repaint of the same passage, and hides what is not on it.
   `onPage` hears every change of page (lingjing.js brings that page's 亮相 on above). `keep` holds
   the page across a reload (2026-10-16: leaving mid-passage and coming back must open on the page he
   was on): `load(key)` the page kept for this column's key, else null; `save(key, page)`. */
export function createPager({ onPage = () => {}, keep = null } = {}) {
  let col = null, key = null, size = '', starts = [], units = [], page = 0, ro = null;

  const measure = () => {
    const text = col.querySelector('.wholetext');
    col.classList.remove('pg-tall');
    for (const el of col.querySelectorAll('.pg-off, .pg-cont')) el.classList.remove('pg-off', 'pg-cont');
    const end = col.querySelector(':scope > .wayacts, :scope > .onward');
    const base = text.getBoundingClientRect().top;
    units = [];
    for (const p of text.querySelectorAll('.line')) {
      const ss = [...p.querySelectorAll('.s')];
      ss.forEach((s, k) => {
        const rects = s.getClientRects();
        if (!rects.length) return;
        // The paragraph's first sentence carries its lead (the speaker's name) above it.
        const top = (k ? rects[0].top : p.getBoundingClientRect().top) - base;
        units.push({ el: s, p, first: k === 0, top, bottom: rects[rects.length - 1].bottom - base, end: k === ss.length - 1 });
      });
    }
    if (end) {
      const r = end.getBoundingClientRect();
      units.push({ el: end, block: true, top: r.top - base, bottom: r.bottom - base, end: true });
    }
    starts = pageBreaks(units, room());
  };

  /* The band's height for words: the column's own box less its padding, a hair kept for
     rounding (a sentence moved to a page's top starts a fresh line). */
  const room = () => {
    const cs = getComputedStyle(col);
    return col.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 4;
  };

  const show = () => {
    const from = starts[page] ?? 0, to = (starts[page + 1] ?? units.length) - 1;
    const on = new Set();
    units.forEach((u, k) => {
      const here = k >= from && k <= to;
      u.el.classList.toggle('pg-off', !here);
      if (here && u.p) on.add(u.p);
    });
    for (const p of col.querySelectorAll('.wholetext .line')) {
      p.classList.toggle('pg-off', !on.has(p));
      // A paragraph carried over from the page before: its speaker's name stood there.
      const firstOn = units.find((u) => u.p === p && u.first);
      p.classList.toggle('pg-cont', on.has(p) && Boolean(firstOn?.el.classList.contains('pg-off')));
    }
    col.scrollTop = 0;
    if (key) keep?.save?.(key, page);
    // One sentence taller than the band: this page scrolls.
    col.classList.toggle('pg-tall', col.scrollHeight > col.clientHeight + 2);
    const story = col.closest('.story');
    const pager = story?.querySelector('.pager');
    if (pager) {
      const n = starts.length;
      pager.hidden = n < 2;
      pager.querySelector('.pgn').textContent = `${page + 1}/${n}`;
      pager.querySelector('[data-pg="-1"]').disabled = page === 0;
      // The last page's 下一页: 「接着往下」 where the reading goes on; nothing where the choices stand.
      pager.querySelector('[data-pg="1"]').disabled = page === n - 1 && !col.querySelector('[data-dlg-onward]');
    }
    story?.classList.toggle('lastpage', page === starts.length - 1);
    onPage(faces());
  };

  /* The faces whose 亮相 falls on this page (dialogue.js wholeHtml `data-faces`). */
  const faces = () => [...(col?.querySelectorAll('.wholetext .line[data-faces]:not(.pg-off)') ?? [])]
    .flatMap((p) => p.dataset.faces.split(',')).filter(Boolean);

  const repage = () => {
    if (!col?.isConnected) return;
    const s = `${col.clientWidth}x${col.clientHeight}`;
    if (s === size) return;
    size = s;
    const at = units[starts[page] ?? 0]?.el;
    measure();
    // From the sentence he was on: the page that now holds it.
    const u = at ? units.findIndex((x) => x.el === at) : -1;
    page = u >= 0 ? pageOf(starts, u) : Math.min(page, starts.length - 1);
    show();
  };

  return {
    sync(story) {
      const c = story?.querySelector('.wholecol') ?? null;
      if (!c) { if (col) { ro?.disconnect(); col = null; key = null; onPage([]); } return; }
      const k = story.dataset.story ?? '';
      if (c === col && k === key) return;
      if (k !== key) page = Number.isInteger(keep?.load?.(k)) ? keep.load(k) : 0;
      ro?.disconnect();
      col = c; key = k; size = '';
      ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => repage()) : null;
      ro?.observe(col);
      repage();
    },
    /* A page on (`d` 1) or back (-1); false where there is none that way. */
    turn(d) {
      if (!col) return false;
      const next = page + d;
      if (next < 0 || next >= starts.length) return false;
      page = next;
      show();
      return true;
    },
    get on() { return Boolean(col); },
    get last() { return !col || page >= starts.length - 1; },
    get page() { return page; },
    get pages() { return starts.length; },
    /* The beat at the top of this page (「i.j」), so 慢 · 中 pick up where he is reading. */
    beat() {
      const p = col?.querySelector('.wholetext .line[data-beat]:not(.pg-off)');
      const [i, j] = String(p?.dataset.beat ?? '').split('.').map(Number);
      return Number.isInteger(i) && Number.isInteger(j) ? { i, j } : null;
    },
    faces,
  };
}
