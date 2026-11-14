// Measure the real fight hand against what lies beneath it, using scratch saves only.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeServer, defaultShared, BASELINE_NOW } from './playbot/serve.mjs';
import { openingHand } from './playbot/replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-clear-'));
const rules = (name, verb, flags = []) => {
  const r = spawnSync(process.execPath, [path.join(skill, 'scripts/rules.mjs'), verb, ...flags, `--save=${name}`], { cwd: skill, env: { ...process.env, LINGJING_DATA: data, LINGJING_TRACK_OFF: '1', LINGJING_CLOUD: '0', LINGJING_NOW: BASELINE_NOW }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${verb}: ${r.stderr} ${r.stdout}`);
  return JSON.parse(r.stdout);
};
const { server } = makeServer({ skill, data, shared: process.env.LINGGEN_SHARED ?? defaultShared(skill) });
let browser;
let failed = false;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  for (const [w, h] of [[1280, 820], [1440, 900], [430, 932], [375, 812]]) {
    for (const n of [6, 8, 10]) {
      const name = `pb-b-clear-${w}-${n}`, dir = path.join(data, 'saves', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(here, 'playbot/fixtures/baseline-save.json'), path.join(dir, 'state.json'));
      rules(name, 'move', ['--place=houshan']);
      const look = rules(name, 'look');
      const id = (look.tray ?? []).find((t) => t.opens === 'duel')?.arg ?? look.place?.encounter?.game?.id;
      if (!id || !rules(name, 'duel', [`--id=${id}`]).ok) throw new Error(`No fight for ${name}`);
      const file = path.join(dir, 'state.json'), state = JSON.parse(fs.readFileSync(file, 'utf8'));
      const opening = await openingHand(skill, state.fight.setup);
      const you = state.fight.setup.you;
      you.extra = [...(you.extra ?? []), ...Array.from({ length: Math.max(0, n - opening) }, (_, i) => you.deck[i % you.deck.length])];
      fs.writeFileSync(file, JSON.stringify(state));
      const phone = w < 700;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, locale: 'zh-CN' });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/apps/lingjing/scripts/index.html?save=${name}&chat=off`, { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      await page.evaluate(() => document.querySelectorAll('.qianmodal, .qianbox').forEach((e) => { e.style.display = 'none'; }));
      for (let i = 0; i < 8 && !(await page.$('.battle .bhand > .bcard')); i++) {
        await page.evaluate(() => { document.querySelector('[data-duel-start]')?.click(); for (const t of ['回到斗法', '回到这一战', '还有', '✕']) [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim().startsWith(t))?.click(); });
        await page.waitForTimeout(1500);
      }
      const result = await page.evaluate((n) => {
        const cards = [...document.querySelectorAll('.battle .bhand > .bcard')];
        if (cards.length !== n) throw new Error(`Expected ${n} cards, got ${cards.length}`);
        const rects = cards.map((c) => c.getBoundingClientRect());
        const lowest = Math.max(...rects.map((r) => r.bottom));
        // Probe beneath the lowest edge, looking through the hand and its containing layers.
        let under = null;
        // Scan downward: the lowest edge can already overlap the footer or be above a gap.
        for (let y = Math.max(0, Math.min(innerHeight - 1, Math.floor(lowest + 1))); y < innerHeight && !under; y++) {
          const hit = document.elementsFromPoint(innerWidth / 2, y).find((e) => e.closest('#slotFoot'));
          if (hit) under = hit.closest('#slotFoot');
        }
        // Phones hide the footer during a fight; the viewport edge is their boundary.
        if (!under && getComputedStyle(document.querySelector('#slotFoot')).display !== 'none') throw new Error('Visible footer not found beneath hand');
        return { bottoms: rects.map((r) => r.bottom), under: under ? { tag: under.tagName.toLowerCase(), id: under.id, class: under.className, top: under.getBoundingClientRect().top } : { tag: 'viewport', id: '', class: '', top: innerHeight }, viewport: innerHeight };
      }, n);
      const overlaps = result.bottoms.map((bottom) => Math.max(bottom - result.under.top, bottom - result.viewport));
      const worst = Math.max(...overlaps), index = overlaps.indexOf(worst);
      const fail = worst > -4 || result.bottoms.some((bottom) => bottom > result.viewport);
      failed ||= fail;
      console.log(`${w}x${h} hand=${n} ${fail ? 'FAIL' : 'PASS'} worst=${worst.toFixed(2)}px card=${index} under=${result.under.tag}#${result.under.id}.${result.under.class} top=${result.under.top.toFixed(2)} viewport=${result.viewport} bottoms=${result.bottoms.map((x) => x.toFixed(2)).join(',')}`);
      await ctx.close();
    }
  }
} finally {
  if (browser) await browser.close();
  server.close();
  fs.rmSync(data, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
