// The board's rows hold what is in them, at every width (battle.css § The board never overlaps itself). The gate 2026-11-20 at
// 375×812: the head's third line 「银月借力 · 啸月、月影扑」 ran onto the beast's name — the head's row was a plain `auto`
// track, whose floor was .btop's own min-height (26 px), so on a short board the row sank below its words. Every row that is
// not a rank or the dock is a --fit track, minmax(min-content, auto). Read off the sheet, and laid out in headless Chromium
// (with playwright installed: cd tools && npm install) at the phone's two widths and the desk's, on boards too short for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read(process.env.BOARD_CSS ?? '../scripts/battle.css'); // BOARD_CSS: another sheet, to see this test red on it
const pw = (() => { try { return createRequire(new URL('../tools/package.json', import.meta.url))('playwright'); } catch { return null; } })();

test('the board\'s rows: every track that is not a rank or the dock is --fit, minmax(min-content, auto) — never a bare auto', () => {
  const rows = /\.battle \{[^}]*grid-template-rows: ([^;]+);/.exec(css)?.[1];
  assert.ok(rows, 'the board\'s grid-template-rows');
  assert.equal(rows, 'var(--fit) var(--fit) var(--fit) minmax(var(--tmin), var(--tmax)) var(--fit) minmax(var(--ymin), var(--ymax)) var(--fit) var(--dock-track)');
  assert.match(css, /--fit: minmax\(min-content, auto\);/);
  // the one statement: no width's block writes the rows again
  assert.equal([...css.matchAll(/grid-template-rows: [^;]*--tmin/g)].length, 1);
});

// The fight as main drew it (tests/fixtures/pin-fan-main.json), with the head's three lines, and a beast's side with its
// 已站住 line and a bubble: the two parts with a min-height of their own. Laid out still (a bubble rises in; read where it lands).
const board = () => JSON.parse(read('./fixtures/pin-fan-main.json')).fight
  .replace('<span class="bwhere"></span>', '<span class="bwhere">降妖<small class="bstake">卷一 · 沉鼎 · 第七回</small><small class="blend-line">银月借力 · 啸月、月影扑</small></span>')
  .replace('<span class="bfoetitle"></span>', '<span class="bfoetitle">犰狳</span>')
  .replace('<b>14<small class="bmax">/14</small></b></div>', '<b>14<small class="bmax">/14</small></b></div><small class="bstake bsurvive">已站住 1/3 回合</small><div class="bsay foe">这一口，你接得住么</div>');
const PARTS = ['.btop', '.bside.foe', '.bomen', '.bseam', '.bside.you'];

test('on a board too short for it, no part spills out of its row — the head\'s 银月借力 line never on the beast\'s name', { skip: !pw && 'playwright not installed (cd tools && npm install)', timeout: 120000 }, async () => {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    for (const [w, heights] of [[375, [640, 560, 480]], [430, [700, 560]], [1280, [700, 520]]]) {
      for (const h of heights) {
        const page = await browser.newPage({ viewport: { width: w, height: 900 } });
        await page.setContent(`<!doctype html><meta charset=utf-8><style>body{margin:0}.scene{container: scene / inline-size; width:${w}px; height:${h}px}${css} *{animation:none !important}</style><div class="scene">${board()}</div>`);
        const spills = await page.evaluate((parts) => {
          const out = [];
          for (const sel of parts) {
            const p = document.querySelector(`.battle ${sel}`);
            const q = p.getBoundingClientRect();
            for (const e of p.querySelectorAll('*')) {
              const cs = getComputedStyle(e);
              if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none' || e.closest('.bdeck')) continue;
              const r = e.getBoundingClientRect();
              // a hair (3 px), as the lint's board-overlap: the stuck hint's -3 px nudge into the seam's line
              if (r.height && (r.top < q.top - 3 || r.bottom > q.bottom + 3)) out.push(`${sel} > ${e.className || e.tagName}: ${Math.round(r.top)}–${Math.round(r.bottom)} out of ${Math.round(q.top)}–${Math.round(q.bottom)}`);
            }
          }
          const lend = document.querySelector('.blend-line').getBoundingClientRect(), foe = document.querySelector('.bside.foe').getBoundingClientRect();
          if (lend.bottom > foe.top + 0.5) out.push(`the 银月借力 line (bottom ${Math.round(lend.bottom)}) on the beast (top ${Math.round(foe.top)})`);
          return out;
        }, PARTS);
        await page.close();
        assert.deepEqual(spills, [], `${w}×${h}`);
      }
    }
  } finally { await browser.close(); }
});
