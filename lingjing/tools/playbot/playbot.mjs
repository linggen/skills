// tools/playbot/playbot.mjs — the play bot: 灵境's live page played by tapping its real UI, on scratch saves in a
// scratch install (tools/playbot/serve.mjs), headless and muted in a browser profile of its own. Never the player's
// save, never his Chrome, never ~/.linggen. (Hanli 2026-11-05: four phone bugs in one night that every test missed —
// a kept fight froze the 饭桶's feed, six cards overlapped, 痒痒针 spent 灵力 on an empty rank, a win showed no spoils.)
//
//   node tools/playbot/playbot.mjs --skill=<lingjing dir> [--shared=<linggen/shared>] [--out=<report dir>]
//        [--sizes=430x932,375x812,1280x820] [--fights=2] [--seed=1] [--update-baselines] [--headed]
//        [--only=haunt,story,bout,walk,baseline] [--no-careful]
//   Usually through tools/playbot/run.sh (a git ref or an install dir → a scratch checkout, then this).
//
// What it plays, at each size: N 降妖 fights (the 妖兽出没 haunt), a story fight (灵草谷), a 切磋 bout, and a walk
// around a kept fight (the 储物袋, the 饭桶's feed, a road; a reload mid-fight and back). Moves are random among what
// the page offers as legal (`[data-spot].can`, then a lit target), seeded.
//
// Hard checks, each a finding with its screenshot (findings.json):
//   no-response      a tap on a live control changes nothing on the page within 2 s
//   no-feedback      a play changed neither the fight nor what the page says
//   mana-waste       灵力 went down and nothing on the field moved (the card only left the hand)
//   no-spoils        the rules settled a fight won and no 所得 with real contents showed — or it showed under
//                    something (elementFromPoint at its centre is not 所得's)
//   frozen-by-fight  a thing NOT in the fight (the bag, the 饭桶's feed, wearing) refused because a fight is open
//   resume-mismatch  a fight reloaded and taken up again shows another state than it was left in
//   console-error    a console error or an uncaught exception
//   layout           the lint (lint.mjs): covered / clipped / outside the viewport, a fight's hand card under its floor
//                    (hand-too-small, 120 px) — and a baseline that drifted
// Every refusal the rules gave is listed (refusals.json) with its reason and where it happened, for a person.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { makeServer, defaultShared, BASELINE_NOW } from './serve.mjs';
import { LINT } from './lint.mjs';
import { writePack } from './report.mjs';
import { openingHand, wastedPlays } from './replay.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flag = (k, d = null) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? (process.argv.includes(`--${k}`) ? true : d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A tiny seeded rng (mulberry32): the same seed, the same moves. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pickOne = (r, xs) => xs[Math.floor(r() * xs.length)];

/* Where each fight is met: a save seeded there by the rules' own walk (rules.mjs seed --at). */
export const SEEDS = { haunt: '09-suifeng', story: '09-lingcao', bout: '09-suifeng', walk: '09-suifeng' };
/* The refusals that freeze what a kept fight never holds (tasks.mjs fightHold): a hard finding. Moving, buying,
   travel: the world holds still in a fight by design — listed, not failed. */
const FROZEN_VERBS = new Set(['fantong', 'gear', 'wear', 'bag']);
const FIGHT_REFUSALS = new Set(['in-a-fight', 'fight-open', 'unfinished-fight']);

/* What stands between the bot and the play — closed, skipped or taken (never the 所得: that is checked first). */
/* A kept fight's way back, in its card's words (battle-card.js beginKept · cards.js fightBack). */
const KEPT_BACK = /^\s*(回到这一战|Back to (this|the) fight)/;
const CLEARERS = ['[data-unfold]', '[data-qian-close]', '[data-fate=decline]', '[data-board-close]', '[data-reveal]', '[data-titlecard]', '.feat', '.wonseal',
  '[data-dlg-speed="skip"]:not(.on)', '[data-dlg-next]', '[data-emerged-close]', '[data-close-chapter]',
  '[data-appear-done]', '[data-toast-close]', '[data-handin-close]'];

/* ── In the page ── */
const FIGHT = () => {
  const b = document.querySelector('.battle');
  if (!b || !b.getClientRects().length) return null;
  const t = (sel) => [...b.querySelectorAll(sel)].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim());
  const manas = [...b.querySelectorAll('.bmana b')].map((e) => e.textContent.trim());
  const mana = manas.length ? Number(manas[manas.length - 1].split('/')[0]) : null;
  const hand = [...b.querySelectorAll('[data-spot=hand]')].map((e) => e.dataset.id);
  return {
    mana, hand,
    field: [t('.bside.foe'), t('.brank.theirs .bminion:not(.empty)'), t('.brank.mine .bminion:not(.empty)'), t('.bwho'), t('.bally')].map((x) => x.join(' | ')).join(' ‖ '),
    turn: (b.querySelector('.bturn, .bphase')?.innerText ?? '').trim(),
    whole: b.innerText.replace(/\s+/g, ' ').length + ':' + b.querySelectorAll('*').length,
  };
};
const SIG = () => {
  const main = document.body.innerText.replace(/\s+/g, ' ');
  let h = 0;
  for (let i = 0; i < main.length; i += 1) h = (h * 31 + main.charCodeAt(i)) | 0;
  const cls = [...document.querySelectorAll('.held, .aimed, .on, [aria-pressed=true], [aria-expanded=true]')].length;
  return `${h}:${document.querySelectorAll('*').length}:${cls}`;
};
const VISIBLE = (sel) => [...document.querySelectorAll(sel)].filter((e) => {
  if (!e.getClientRects().length || e.disabled || e.getAttribute('aria-disabled') === 'true') return false;
  for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none') return false; }
  const r = e.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, spot: e.dataset.spot ?? null, id: e.dataset.id ?? null, index: e.dataset.index ?? null, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), sel: e.getAttribute('class') ?? '' }; });
const SPOILS = () => {
  const s = [...document.querySelectorAll('.card.spoils, [data-spoils-close].card')].find((e) => e.getClientRects().length);
  if (!s) return null;
  const parts = [...s.querySelectorAll('.spoilpays, .spoilfaces, .spoilgears, .small')].map((e) => e.innerText.trim()).filter(Boolean);
  // Seen is not enough: 所得's centre must be 所得's to tap, not the story box's over it (f959ed0c at 430).
  const b = s.getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return { title: s.querySelector('.cardtitle')?.innerText.trim() ?? '', parts, hit: Boolean(at && s.contains(at)), over: at && !s.contains(at) ? `${at.tagName}.${at.className}`.slice(0, 80) : null };
};

/* ── One run ── */
export async function run(opts) {
  // Real path: rules.mjs runs its command line only when argv[1] is its own path (/var → /private/var on macOS).
  const skill = fs.realpathSync(path.resolve(opts.skill));
  const out = path.resolve(opts.out);
  const shots = path.join(out, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const data = path.join(out, 'scratch', 'data');
  fs.rmSync(path.join(out, 'scratch'), { recursive: true, force: true });
  const { server, verbs, unknown } = makeServer({ skill, data, shared: opts.shared ?? defaultShared(skill) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const findings = [], refusals = [], played = [], unplayable = [], screenshots = [];
  const baselines = path.join(HERE, 'baselines');
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const want = (k) => !only || only.has(k);
  let shotN = 0;

  /* A scratch save set up by hand after its seed (its own file, never the player's): `fn(state)` edits it in place. */
  const patchSave = (name, fn) => {
    const f = path.join(data, 'saves', name, 'state.json');
    const st = JSON.parse(fs.readFileSync(f, 'utf8'));
    fn(st);
    fs.writeFileSync(f, `${JSON.stringify(st)}\n`);
  };
  /* One rules verb on a scratch save, as the Verb door runs it (a baseline's save on the fixed clock). */
  const rules = (name, verb, flags) => {
    const fixed = name.startsWith('pb-b-') ? { LINGJING_NOW: BASELINE_NOW } : {};
    const r = spawnSync(process.execPath, [path.join(skill, 'scripts/rules.mjs'), verb, ...flags, `--save=${name}`], { cwd: skill, env: { ...process.env, LINGJING_DATA: data, LINGJING_TRACK_OFF: '1', ...fixed }, encoding: 'utf8' });
    try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { return { ok: false, error: r.stderr }; }
  };
  const sceneAt = (id) => {
    for (const ch of fs.readdirSync(path.join(skill, 'worlds/jiuding/chapters'))) {
      const f = path.join(skill, 'worlds/jiuding/chapters', ch, 'scenes', `${id}.json`);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).at ?? null;
    }
    return null;
  };
  const seed = (name, at) => {
    const fixed = name.startsWith('pb-b-') ? { LINGJING_NOW: BASELINE_NOW } : {};
    const r = spawnSync(process.execPath, [path.join(skill, 'scripts/rules.mjs'), 'seed', `--save=${name}`, `--at=${at}`], { cwd: skill, env: { ...process.env, LINGJING_DATA: data, LINGJING_TRACK_OFF: '1', ...fixed }, encoding: 'utf8' });
    const line = (r.stdout || '').trim().split('\n').pop();
    try { return JSON.parse(line); } catch { return { ok: false, error: `${r.error ?? ''} status ${r.status} signal ${r.signal ?? ''} ${r.stderr || line}`.trim() }; }
  };

  for (const size of opts.sizes) {
    const [w, h] = size.split('x').map(Number);
    const phone = w <= 640;
    const ctx = await chromium.launchPersistentContext(path.join(out, 'scratch', `profile-${size}`), {
      headless: !opts.headed, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone,
      args: ['--mute-audio', '--autoplay-policy=user-gesture-required'], locale: 'zh-CN',
    });
    // Every change to the page, counted: what "a tap was answered" reads.
    await ctx.addInitScript(() => {
      globalThis.__pbMut = 0;
      const arm = () => new MutationObserver((m) => { globalThis.__pbMut += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    let where = `${size}`;
    const errors = [];
    const setupMisses = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push({ where, text: m.text().slice(0, 300) }); });
    page.on('pageerror', (e) => errors.push({ where, text: `uncaught: ${String(e).slice(0, 300)}` }));
    const r = rng(Number(opts.seed ?? 1) + w);

    const shot = async (tag, { lint = true, scope = null } = {}) => {
      await sleep(350);
      const file = path.join(shots, `${String(++shotN).padStart(3, '0')}-${size}-${tag}.png`);
      await page.screenshot({ path: file });
      const rel = path.relative(out, file);
      screenshots.push({ file: rel, size, tag, where });
      if (lint) {
        const res = await page.evaluate(LINT, { scope }).catch((e) => ({ fails: [], warns: [{ why: `lint failed: ${e}` }] }));
        for (const f of res.fails) findings.push({ kind: 'layout', hard: true, size, where, tag, ...f, shot: rel });
        for (const x of res.warns) findings.push({ kind: 'layout-warn', hard: false, size, where, tag, ...x, shot: rel });
      }
      return file;
    };
    const fail = async (kind, detail) => {
      const file = await shot(`${kind}`, { lint: false });
      findings.push({ kind, hard: true, size, where, ...detail, shot: path.relative(out, file) });
    };
    const tapAt = async (x, y) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
    /* A tap that must be answered: the page changes within 2 s, or it is a finding. */
    // `soft`: a tap that only finds the way to a play (a road, 开局, the story's way on) — unanswered, it means the play
    // could not be reached (played.json `unplayable`), not a dead control; the plays themselves are never soft.
    const tap = async (c, what, { soft = false } = {}) => {
      const before = await page.evaluate(() => globalThis.__pbMut ?? 0);
      const asked = verbs.length;
      const t0 = Date.now();
      // A desktop has no touch: its locator is clicked (11-06 at 1280: `tap` threw, every 开局 there unreached).
      if (c.locator) await (phone ? c.locator.tap({ timeout: 2000 }) : c.locator.click({ timeout: 2000 }));
      else await tapAt(c.x, c.y);
      // Answered: anything on the page moved (a mutation: drawn, pressed, a busy mark) or the page asked the rules.
      while (Date.now() - t0 < 2000) {
        await sleep(100);
        if ((await page.evaluate(() => globalThis.__pbMut ?? 0)) !== before || verbs.length !== asked) return true;
      }
      if (soft) { setupMisses.push({ where, control: what ?? c.text }); return false; }
      await fail('no-response', { control: what ?? c.text, sel: c.sel });
      return false;
    };
    const open = async (name) => {
      await page.goto(`${base}/apps/lingjing/scripts/index.html?save=${name}&chat=off`, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.querySelector('.waitcard[aria-busy=true]') && document.querySelectorAll('button').length > 3, null, { timeout: 15000 }).catch(() => {});
      await sleep(1500);
    };
    const clear = async (n = 12, { keepBoard = false } = {}) => {
      for (let i = 0; i < n; i += 1) {
        let c = null;
        for (const sel of CLEARERS) { if (keepBoard && sel === '[data-board-close]') continue; c = (await page.evaluate(VISIBLE, sel))[0]; if (c) break; }
        if (!c) return;
        await tapAt(c.x, c.y);
        await sleep(700);
      }
    };
    const click = async (sel, what) => {
      if (sel === '[data-duel-start]' && what?.startsWith('开局')) {
        // Playwright re-resolves the locator on every actionability retry, including after a re-render.
        // Its words differ by where it stands: 手边的棋局's 「开局」, the stage's 降妖 card and a story fight's card 「出 手」 /
        // 「再出手」 (battle-card.js, cards.js `begin`) — 11-06 at 1280 and every story fight: only 开局 was looked for, the
        // fight was never begun. Never 回到这一战 (a kept fight's way back: 回到斗法 asks for it by name).
        // Each of them in turn, not the first alone: the stage's 「出 手」 can stand under the scene's story while the tray's
        // 「开局」 is the one a finger reaches (the selftest at 48f0b83c, 11-06: `.first()` waited 3 s on the covered one).
        const all = page.locator('button[data-duel-start]:visible').filter({ hasText: /^\s*(开局|再?出\s*手|Begin|Go again)/ });
        try { await all.first().waitFor({ state: 'visible', timeout: 3000 }); } catch (error) { if (opts.debug) console.error(`[click] 开局 unavailable: ${error.message}`); return false; }
        const n = await all.count();
        for (let i = 0; i < n; i += 1) {
          try { return await tap({ locator: all.nth(i), text: what, sel }, what, { soft: true }); } catch (error) { if (opts.debug) console.error(`[click] 开局 #${i} not tapped: ${error.message.split('\n')[0]}`); }
        }
        return false;
      }
      // A kept fight's way back reads 「回到这一战」 on its card (battle-card.js beginKept, cards.js fightBack; Look's duel
      // `kept`): that one first. When the card stands under the story's box (a baseline's save at 后山: 秦雁's passage), the
      // tray's entry for the same fight is the way a finger reaches — the first reachable [data-duel-start], as before.
      // The walk checks the card's words itself (KEPT_BACK).
      if (sel === '[data-duel-start]' && what === '回到斗法') {
        const all = page.locator('button[data-duel-start]:visible').filter({ hasText: KEPT_BACK });
        const n = await all.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => all.count(), () => 0);
        for (let i = 0; i < n; i += 1) {
          try { if (await tap({ locator: all.nth(i), text: what, sel }, what, { soft: true })) return true; } catch (error) { if (opts.debug) console.error(`[click] 回到这一战 #${i} not tapped: ${error.message.split('\n')[0]}`); }
        }
        if (opts.debug) console.error('[click] no 回到这一战 in reach: the first [data-duel-start] a finger reaches');
      }
      // Below the fold on a phone: brought on screen first, as a thumb scrolls to it.
      // The first match a finger can actually reach: drawn, on screen once scrolled to, and the thing under its centre
      // (11-05 at 1280: the stage's 降妖 card stood under the scene's story; a tap there answered nothing).
      const c = await page.evaluate((q) => {
        for (const e of document.querySelectorAll(q)) {
          if (!e.getClientRects().length || e.disabled || e.getAttribute('aria-disabled') === 'true') continue;
          let hidden = false;
          for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none') { hidden = true; break; } }
          if (hidden) continue;
          let r = e.getBoundingClientRect();
          if (!(r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight)) { e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); r = e.getBoundingClientRect(); }
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const top = document.elementFromPoint(x, y);
          if (top && (top === e || e.contains(top))) return { x, y, text: (e.innerText || '').trim().slice(0, 30), sel: e.getAttribute('class') ?? '', q };
        }
        return null;
      }, sel);
      // Still there a beat later (a card sliding in, a story closing): a tap lands where it is, not where it was.
      if (c) {
        await sleep(150);
        const still = await page.evaluate(({ q, x, y }) => { const t = document.elementFromPoint(x, y); return Boolean(t && t.closest(q)); }, { q: sel, x: c.x, y: c.y });
        if (!still) { if (opts.debug) console.error(`[click] ${sel} moved — not tapped`); return false; }
      }
      if (opts.debug) console.error(`[click] ${sel} → ${c ? `${c.text} @${Math.round(c.x)},${Math.round(c.y)}` : 'none'}`);
      if (!c && opts.debug) console.error('   matches:', JSON.stringify(await page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => { const r = e.getBoundingClientRect(); const up = []; for (let a = e; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none') up.push(`${a.tagName}.${(a.getAttribute('class') || '').replace(/ /g, '.')}:${cs.visibility}/${cs.display}`); } return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), e.disabled, up.slice(-3)]; }), sel)));
      if (!c) { if (opts.debug) await shot(`dbg-none-${sel.replace(/[^a-z]/gi, '').slice(0, 20)}`, { lint: false }); return false; }
      return tap(c, what ?? sel, { soft: true });
    };
    const noted = new Set();
    const refusedSince = (i) => verbs.slice(i).filter((v) => v.out && v.out.ok === false && !noted.has(v));
    const noteRefusals = (i, place) => {
      for (const v of refusedSince(i)) {
        noted.add(v);
        const row = { size, where: place, verb: v.verb, flags: v.flags.join(' '), refused: v.out.refused ?? v.out.why ?? null, say: v.out.say ?? v.out.line ?? null };
        refusals.push(row);
        const flagsS = v.flags.join(' ');
        const isFeed = v.verb === 'fantong' && /--action=(feed|fire|toss)/.test(flagsS);
        const isBag = (v.verb === 'trade' && /--action=(use|wear|remove|sell)/.test(flagsS)) || FROZEN_VERBS.has(v.verb);
        if ((isFeed || isBag) && (FIGHT_REFUSALS.has(row.refused) || /斗法未完|斗法还开着/.test(row.say ?? ''))) {
          findings.push({ kind: 'frozen-by-fight', hard: true, size, where: place, verb: v.verb, flags: flagsS, refused: row.refused, say: row.say });
        }
      }
    };

    /* One card fight, played to its end by random legal moves. Returns { outcome, steps }. */
    const fight = async (label, { maxSteps = 160, stopAfter = null, careful = false, saveName } = {}) => {
      const startAt = verbs.length;
      // The fight's setup as the rules handed it at the door (the save's `fight.setup`): what its replay starts from.
      let setup = null;
      try { setup = JSON.parse(fs.readFileSync(path.join(data, 'saves', saveName, 'state.json'), 'utf8')).fight?.setup ?? null; } catch { /* no save to read */ }
      const tried = new Set();
      let steps = 0, waits = 0;
      await shot(`${label}-open`, { scope: '.battle' });
      for (; steps < maxSteps; steps += 1) {
        if (stopAfter != null && steps >= stopAfter) return { outcome: 'left-open', steps };
        // The settle: `duel --picks` that is not a mark of progress (`--action=mark`, the page keeping a fight's moves as
        // it goes, so a reload finds them — 11-05) and answered with an outcome.
        const settled = verbs.slice(startAt).find((v) => v.verb === 'duel' && v.flags.some((f) => f.startsWith('--picks')) && !v.flags.includes('--action=mark') && v.out?.ok !== false);
        const s0 = await page.evaluate(FIGHT);
        if (settled || !s0) {
          const outcome = settled?.out?.outcome ?? settled?.out?.duel?.outcome ?? (settled ? 'settled' : 'gone');
          // 灵力 spent for nothing: every play of his replayed through the rules' own battle.js (replay.mjs).
          const picks = settled?.flags.find((f) => f.startsWith('--picks='))?.slice(8);
          if (picks && setup) {
            const wasted = await wastedPlays(skill, setup, picks).catch((e) => [{ error: String(e) }]);
            for (const w of wasted) {
              if (w.error) { findings.push({ kind: 'replay-error', hard: false, size, where, text: w.error }); continue; }
              findings.push({ kind: 'mana-waste', hard: true, size, where: `${where} · ${label}`, card: w.card, mana: `${w.mana[0]} → ${w.mana[1]}`, action: w.action, by: 'fight replay (battle.js)', shot: screenshots.filter((x) => x.where === where).at(-1)?.file ?? null });
            }
          }
          return { outcome, steps, settled };
        }
        // Not his turn, or the last move still playing out (the scratch seam says so): a person waits, so does the bot.
        const bout = await page.evaluate(() => globalThis.__lingjingPlay?.bout?.() ?? null);
        if (bout && (bout.whose !== 'you' || bout.busy)) {
          await sleep(500); steps -= 1; waits += 1;
          if (opts.debug && waits % 20 === 0) console.error('[wait]', JSON.stringify(bout));
          if (waits > 120) return { outcome: 'stuck-waiting', steps, bout };
          continue;
        }
        const cans = (await page.evaluate(VISIBLE, '.battle [data-spot].can')).filter((c) => c.spot !== 'stage');
        // 结束回合 greyed while the beast moves (`.wait`, disabled, aria-disabled) is not a control to press.
        const end = (await page.evaluate(VISIBLE, '.battle [data-spot=end]:not(.wait):not(.dim):not([aria-disabled=true])'))[0];
        const pool = cans.filter((c) => c.spot !== 'end');
        // A careful hand (the first fight of each size): the page's own attentive line (fightline.js through the
        // scratch seam, as tools/playtest.mjs plays) picks the move; the bot still makes it with real taps. It wins
        // often enough that the 所得 after a win is seen every run.
        let planned = null;
        if (careful) {
          for (let w = 0; w < 20 && !planned; w += 1) { planned = await page.evaluate(() => globalThis.__lingjingPlay?.move?.() ?? null); if (!planned) await sleep(300); }
          if (!planned) { steps -= 1; waits += 1; if (waits > 120) return { outcome: 'stuck-waiting', steps }; continue; }
        }
        // Random among the legal plays, never ending a turn that still has one (a careless hand still plays its
        // cards); while the beast's rank is empty, a card not yet tried on an empty rank goes first — what each card
        // does with nothing to hit is the question 痒痒针 asked (11-04).
        const empty = s0.field.split(' ‖ ')[1] === '';
        const fresh = pool.filter((c) => c.spot === 'hand' && !tried.has(`${c.id}:${empty ? 'E' : 'F'}`));
        // A board body that can strike strikes first; else a card, the dearer weighted up (a hand spends its 灵力).
        const strikers = pool.filter((c) => c.spot === 'mine' || c.spot === 'power');
        const weighted = (xs) => { const w = xs.map((c) => 1 + (Number(c.text.match(/^\d+/)?.[0]) || 0)); let t = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < xs.length; i += 1) { t -= w[i]; if (t <= 0) return xs[i]; } return xs[xs.length - 1]; };
        // A planned play the room will not take (7afc45b3: a spell that would land on nothing is refused, its card not
        // live) is the end of the turn, as tests/arcade-kapai.test.mjs roomMove plays it.
        const spotOf = (m) => (m.kind === 'play' ? cans.find((c) => c.spot === 'hand' && Number(c.index) === m.index) : m.kind === 'attack' ? cans.find((c) => c.spot === 'mine' && Number(c.index) === m.index) : m.kind === 'power' ? cans.find((c) => c.spot === 'power') : end);
        if (!pool.length && !end) {
          await sleep(500); steps -= 1; waits += 1;
          if (opts.debug && waits % 20 === 0) console.error('[wait: no live control]', JSON.stringify(bout), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.battle [data-spot=end]')].map((e) => [e.className, e.disabled, e.getAttribute('aria-disabled')]))));
          if (waits > 120) return { outcome: 'stuck-waiting', steps, bout, why: 'no live control' };
          continue;
        }
        const move = planned ? (spotOf(planned) ?? end) : fresh.length && r() < (empty ? 0.9 : 0.4) ? pickOne(r, fresh)
          : strikers.length && r() < 0.6 ? pickOne(r, strikers)
          : pool.length && r() < 0.97 ? weighted(pool) : end;
        if (move?.spot === 'hand') tried.add(`${move.id}:${empty ? 'E' : 'F'}`);
        if (!move) { await sleep(800); continue; }
        // The phone's hand is a wheel (battle-wheel.js): a card off the centre is turned there first, by its dot under the
        // wheel, as a person would; then the centre card is tapped (2026-11-05).
        if (move.spot === 'hand' && /\b(side|far)\b/.test(move.sel)) {
          const dot = (await page.evaluate(VISIBLE, `.battle .bwheeldots [data-wheel="${move.index}"]`))[0];
          if (dot && (await tap(dot, `wheel:${move.id ?? ''}`))) {
            await sleep(450);
            const mid = (await page.evaluate(VISIBLE, `.battle .bhand > .bcard.mid[data-index="${move.index}"]`))[0];
            if (mid) Object.assign(move, { x: mid.x, y: mid.y, sel: mid.sel });
          }
        }
        const at = verbs.length;
        // `waits` counts the wait since his last move — one stretch longer than a minute is stuck; a long fight is not.
        waits = 0;
        if (!(await tap(move, `${move.spot}:${move.id ?? ''}`))) continue;
        await sleep(450);
        // A lifted thing waits for its target: tap one of the lit ones.
        const aims = await page.evaluate(VISIBLE, '.battle .aimed, .battle .bside.foe.aimed, .battle [data-spot=hero].aimed');
        if (aims.length) {
          // The beast itself when it may be hit (most of the time), else any lit target.
          const hero = aims.find((a) => a.spot === 'hero');
          const want = planned?.target?.kind === 'minion' ? aims.find((a) => a.spot === (planned.buff ? 'mine' : 'theirs') && Number(a.index) === planned.target.index) : planned ? hero : null;
          await tap(want ?? (hero && r() < 0.7 ? hero : pickOne(r, aims)), 'target');
          await sleep(450);
        }
        await sleep(600);
        const s1 = await page.evaluate(FIGHT);
        noteRefusals(at, `${label} · step ${steps}`);
        if (!s1) continue;
        if (move.spot !== 'end' && s1.field === s0.field && s1.mana === s0.mana && JSON.stringify(s1.hand) === JSON.stringify(s0.hand)) {
          // A live (`can`) play that, played out, moved nothing and lit no target: the page offered it and it did
          // nothing — no-feedback. (One that lit targets and was put back is a choice, not a fault.)
          const why = await page.evaluate(() => [...document.querySelectorAll('.battle .bwhy, .battle .bnote, .toast')].map((e) => e.innerText.trim()).filter(Boolean).join(' · '));
          if (!aims.length && !why && s1.whole === s0.whole) await fail('no-feedback', { control: `${move.spot}:${move.id ?? ''}`, field: s0.field.slice(0, 200) });
          await tapAt(move.x, move.y); await sleep(300); // put back whatever is still lifted
        }
        if (steps % 12 === 5) await shot(`${label}-step${steps}`, { scope: '.battle' });
      }
      return { outcome: 'step-cap', steps };
    };

    const afterWin = async (label, res) => {
      if (res.outcome !== 'won') return;
      let sp = null;
      // The reveals over a won fight (a seal, a card turned — 珠光 得) come first and can stand a while; 所得 waits
      // under them (dcab26ad). Look for 12 s untouched, then clear the reveals and look 6 s more.
      // Drawn but still under a reveal (a card turned 得 over it, 11-06) is not yet seen: keep looking until it is on top.
      const seen = () => sp && sp.hit;
      for (let i = 0; i < 60 && !seen(); i += 1) { await sleep(200); sp = await page.evaluate(SPOILS); }
      if (!seen()) {
        for (const sel of ['.rv-veil', '.wonseal', '[data-reveal]', '.feat']) await click(sel).catch(() => {});
        for (let i = 0; i < 30 && !seen(); i += 1) { await sleep(200); sp = await page.evaluate(SPOILS); }
      }
      if (!sp && opts.debug) console.error('[spoils?]', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length < 8 && /所得/.test(e.textContent || '') && e.textContent.length < 200).slice(0, 6).map((e) => [e.tagName, e.className, e.getClientRects().length, (e.textContent || '').slice(0, 60)]))));
      await shot(`${label}-won`);
      const paid = res.settled?.out?.paid ?? res.settled?.out?.spoils ?? null;
      if (!sp || !sp.parts.length) await fail('no-spoils', { fight: label, title: sp?.title ?? null, paid });
      else if (!sp.hit) await fail('no-spoils', { fight: label, title: sp.title, paid, covered_by: sp.over });
      // Put away, as a player does: since dcab26ad the next play waits behind an open 所得.
      else await click('.cardx[data-spoils-close], [data-spoils-close]', '所得 · 收起').catch(() => {});
    };

    /* Bring a control up and tap it: what stands over the stage cleared, and the scene's story — which hides the
       stage's slots until its way on is taken — taken on (then back to `go`, when the way on moved him). */
    const reach = async (sel, what, go = null, { expect = null } = {}) => {
      for (let k = 0; k < 10; k += 1) {
        await clear();
        const asked = verbs.length;
        if (await click(sel, what)) {
          if (!expect) return true;
          // The tap must have done what it was for (a 开局 asks the rules for the duel): a layout that moved under
          // the finger opened something else instead (1280: the 物品 panel) — put that away and try again.
          for (let w = 0; w < 10 && !verbs.slice(asked).some((v) => v.verb === expect); w += 1) await sleep(200);
          if (verbs.slice(asked).some((v) => v.verb === expect)) return true;
          await click('[data-pouch-close], [data-pop-close], .cardx[data-toast-close]', '收起').catch(() => {});
          continue;
        }
        // The story's way on, never a pass (留 · ✕ on a story fight's card: `data-panel-pass` skips the fight — 11-06, the
        // story fight's 留 taken for 往下 and the fight put away unplayed).
        if (await click('[data-panel-exit]:not([data-panel-pass])', '剧情 · 往下')) { await sleep(1500); await clear(); if (go) await click(go, 'go'); }
        await sleep(800);
      }
      return false;
    };
    /* A fight opened: what stands over it first (a map unfolding, a seal) cleared, until the fight is on screen (10 s). */
    const onScreen = async () => {
      for (let k = 0; k < 20; k += 1) {
        if (await page.evaluate(FIGHT)) return true;
        await clear(2);
        await sleep(500);
      }
      return false;
    };
    const startHauntOnce = async () => {
      if (!(await click('button.act[data-go=houshan]', 'go 后山'))) return false;
      await sleep(1200);
      return reach('[data-duel-start]', '开局 降妖', 'button.act[data-go=houshan]', { expect: 'duel' });
    };
    // Twice: the scene's story at 后山 can still be telling itself when the first try gives up; a reload lets it settle.
    // Up to three reloads: the tray re-draws under the finger while 后山's story settles, and one reload was not always
    // enough (the selftest at 48f0b83c, 11-06: the walk's 降妖 unreached in two runs of three, caught in the third).
    const startHaunt = async (name) => {
      if (await startHauntOnce()) return true;
      for (let k = 0; name && k < 3; k += 1) {
        await open(name); await clear();
        if ((await reach('[data-duel-start]', '开局 降妖', null, { expect: 'duel' })) || (await startHauntOnce())) return true;
      }
      return false;
    };

    // ── 降妖 × N
    for (let i = 0; want('haunt') && i < Number(opts.fights ?? 2); i += 1) {
      const name = `pb-h${i}-${w}`;
      where = `${size} · 降妖 #${i + 1}`;
      const s = seed(name, SEEDS.haunt);
      if (!s.ok) { unplayable.push({ where, why: `seed failed: ${s.error ?? JSON.stringify(s)}` }); continue; }
      await open(name); await clear();
      const at = verbs.length;
      if (!(await startHaunt(name))) { unplayable.push({ where, why: 'no 降妖 to start (no [data-duel-start] at 后山)' }); noteRefusals(at, where); continue; }
      await sleep(1500);
      if (!(await onScreen())) { unplayable.push({ where, why: 'the 降妖 was opened and never came on screen' }); noteRefusals(at, where); continue; }
      const careful = i === 0 && !opts.noCareful;
      const res = await fight(`haunt${i}`, { careful, saveName: name });
      played.push({ where, kind: careful ? '降妖 (careful hand)' : '降妖 (random hand)', ...res, settled: undefined });
      await afterWin(`haunt${i}`, res);
      noteRefusals(at, where);
    }

    // ── a story fight
    if (want('story')) {
      const name = `pb-s-${w}`;
      where = `${size} · 剧情斗法`;
      const s = seed(name, SEEDS.story);
      if (!s.ok) unplayable.push({ where, why: `seed failed: ${s.error ?? JSON.stringify(s)}` });
      else {
        // Stood where the scene is told (its `at`): the seed leaves him a walk away, at the place of his last errand.
        const told = sceneAt(SEEDS.story);
        if (told) patchSave(name, (st) => { st.place = told; });
        await open(name);
        const at = verbs.length;
        // The scene's fight waits where the story is: the main way there first, then its 斗 (a duel card, or the
        // scene's way on that is the fight).
        await clear();
        await click('[data-agenda="way:way"] [data-go], button.act.go.primary[data-go]', '眼下要做的 · 去');
        await sleep(1500);
        const started = await reach('[data-panel-duel], [data-duel-start], [data-panel-exit="fight"]', '开局 剧情斗法', '[data-agenda="way:way"] [data-go]');
        if (!started) unplayable.push({ where, why: 'the scene offered no fight to start' });
        // The story's 斗 button calls the fight onto the stage (callDuel: a challenge card); its 开局 then begins it.
        else if (!(await page.evaluate(FIGHT)) && !(await reach('[data-duel-start]', '开局 剧情斗法'))) unplayable.push({ where, why: 'the story fight was called and its 开局 never came' });
        else if (!(await onScreen())) unplayable.push({ where, why: 'the story fight was opened and never came on screen' });
        else { const res = await fight('story', { saveName: name }); played.push({ where, kind: '剧情斗法', ...res, settled: undefined }); await afterWin('story', res); }
        noteRefusals(at, where);
      }
    }

    // ── a 切磋 bout (格斗's board): random taps on its controls, each answered
    if (want('bout')) {
      const name = `pb-q-${w}`;
      where = `${size} · 切磋`;
      const s = seed(name, SEEDS.bout);
      if (s.ok) {
        await open(name); await clear();
        const at = verbs.length;
        if (await click('[data-play=qiecuo]', '开局 切磋')) {
          await sleep(2500);
          // What stands over the bout cleared — never the bout's own 不玩了 (11-06: clear() closed the board it had just
          // opened, `task --action=leave --id=qiecuo`, and no 切磋 was ever played; the leave started its 3 h wait).
          await clear(3, { keepBoard: true });
          // The board's lead (a told opening over it) waits on its 开始 (games/shell.js `data-shell-go`).
          await click('[data-shell-go], [data-k=go], .g-btn-main, [data-go-board]').catch(() => {});
          await sleep(800);
          await shot('qiecuo-open');
          let taps = 0;
          for (let k = 0; k < 40; k += 1) {
            // 格斗's keys are `data-k` (games/fighter.js): until 11-06 only `data-g` was looked for and no key was ever pressed.
            const cs = await page.evaluate(VISIBLE, '#slot [data-g], .gshell [data-g], [data-g-hold], .gshell button[data-k]:not([data-k=go])');
            if (!cs.length) break;
            await tapAt(pickOne(r, cs).x, pickOne(r, cs).y);
            taps += 1;
            await sleep(250);
          }
          await shot('qiecuo-after');
          // A tap on 切磋 that opened no board (its 待办 chip while the bout waits its hours — 11-06, both runs) is no bout
          // played: said so, never a 切磋 「tapped」 with nothing tapped.
          if (taps) played.push({ where, kind: '切磋', outcome: 'tapped', taps });
          else unplayable.push({ where, why: 'the 切磋 tapped opened no board (not offered now)' });
        } else unplayable.push({ where, why: 'no 切磋 offered' });
        noteRefusals(at, where);
      } else unplayable.push({ where, why: `seed failed: ${s.error ?? JSON.stringify(s)}` });
    }

    // ── the world around a kept fight, and a reload mid-fight
    if (want('walk')) {
      const name = `pb-w-${w}`;
      where = `${size} · 留着的斗法`;
      const s = seed(name, SEEDS.walk);
      if (s.ok) {
        await open(name); await clear();
        const at = verbs.length;
        if (await startHaunt(name)) {
          await sleep(1500);
          await fight('kept', { stopAfter: 2, saveName: name });
          // The state to compare after a reload is taken on his turn, the room idle, with a play he could make: a turn
          // with nothing playable ends itself after a reload (a4338dd, 11-05 — the game is right), so that is no mismatch.
          let before = null;
          for (let k = 0; k < 30 && !before; k += 1) {
            const b = await page.evaluate(() => globalThis.__lingjingPlay?.bout?.() ?? null);
            const live = (await page.evaluate(VISIBLE, '.battle [data-spot].can')).some((c) => c.spot !== 'end' && c.spot !== 'stage');
            if (b && b.whose === 'you' && !b.busy && live) before = await page.evaluate(FIGHT);
            else await sleep(500);
          }
          if (!before) unplayable.push({ where, why: 'no idle turn with a play to compare across the reload' });
          // Keep it: the page's own 留着以后玩 when it has one; else walking away (a reload) leaves it open, as on the phone.
          const keep = (await page.evaluate(VISIBLE, '[data-board-keep], [data-fight-tap=keep], [data-keep]'))[0];
          if (keep) await tap(keep, '留着以后玩');
          // Leave mid-fight: a reload, then the way back.
          await open(name); await clear();
          await shot('kept-world');
          // The kept fight's card says how to get back (Hanli 11-06: it read 「出 手」 after a reload).
          const cardSays = await page.evaluate(() => [...document.querySelectorAll('.card.challenge button[data-duel-start], .card.duel button[data-duel-start]')].filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
          if (cardSays.length && !cardSays.some((t) => /^(回到这一战|Back to (this|the) fight)/.test(t))) unplayable.push({ where, why: `the kept fight's card reads ${JSON.stringify(cardSays)}, not 回到这一战` });
          const back = (await page.evaluate(FIGHT)) ? true : await reach('[data-duel-start]', '回到斗法');
          if (back) {
            await sleep(1500);
            const after = await page.evaluate(FIGHT);
            if (before && after && (after.mana !== before.mana || after.field !== before.field || JSON.stringify(after.hand) !== JSON.stringify(before.hand))) {
              await fail('resume-mismatch', { before, after });
            }
            await shot('kept-resumed', { scope: '.battle' });
          } else unplayable.push({ where, why: 'no way back to the open fight after a reload' });
          // The bag and the 饭桶's feed, with the fight kept.
          const atBag = verbs.length;
          if (await click('[data-gear]', '物品')) {
            await sleep(1200);
            await shot('kept-bag');
            const tiles = (await page.evaluate(VISIBLE, '.ptile[draggable=true]:not(.worn):not(.free)'));
            if (tiles.length) {
              await tap(pickOne(r, tiles), '储物袋 · 一件');
              await sleep(800);
              // Into the 饭桶 (放进饭桶), up to three things, then 开炉.
              for (let k = 0; k < 3; k += 1) {
                const put = (await page.evaluate(VISIBLE, '[data-ft-put]'))[0];
                if (put) { await tap(put, '放进饭桶'); await sleep(800); }
                const more = (await page.evaluate(VISIBLE, '.ptile[draggable=true]:not(.worn):not(.free)'));
                if (!more.length) break;
                await tapAt(pickOne(r, more).x, pickOne(r, more).y); await sleep(600);
              }
              const fire = (await page.evaluate(VISIBLE, '[data-ft-fire]'))[0];
              if (fire) { await tap(fire, '开炉'); await sleep(1500); }
              await shot('kept-fantong');
            }
            noteRefusals(atBag, `${where} · 储物袋/饭桶`);
            await click('[data-pouch-close]').catch(() => {});
          }
          // The page holds the fight on screen; the phone's 储物袋 walks beside it (Hanli's 11-04: 狼 kept, the 饭桶 fed
          // from the bag). That door is the phone's own call, made as the phone makes it (lingjing_pouch.dart:
          // `fantong --action=feed --ids=… --lingshi=0`) on things the fight does not hold — never a tap, and said so.
          if (!verbs.slice(atBag).some((v) => v.verb === 'fantong' && /--action=(feed|fire)/.test(v.flags.join(' ')))) {
            const st = JSON.parse(fs.readFileSync(path.join(data, 'saves', name, 'state.json'), 'utf8'));
            const held = new Set([...(st.fight?.setup?.you?.extra ?? []), ...(st.fight?.setup?.you?.pouch ?? [])].map(String));
            const ids = ['luobo', 'dingtai', 'longxu-cao', 'xizhu', 'duan-dao'].filter((id) => st.bag?.[id] && !held.has(id)).slice(0, 2);
            if (ids.length) {
              const atDoor = verbs.length;
              await fetch(`${base}/api/skills/lingjing/tools/Verb`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verb: 'fantong', flags: ['--action=feed', `--ids=${ids.join(',')}`, '--lingshi=0', `--save=${name}`] }) });
              noteRefusals(atDoor, `${where} · 饭桶 (the phone's 储物袋 call)`);
              played.push({ where: `${where} · 饭桶`, kind: 'phone-door', fed: ids, answer: verbs[verbs.length - 1]?.out?.ok === false ? verbs[verbs.length - 1].out.refused : 'fed' });
            }
          }
          // A road.
          const atRoad = verbs.length;
          if (await click('[data-roads]', '去往')) {
            await sleep(700);
            const roads = await page.evaluate(VISIBLE, '.spot[data-go]');
            if (roads.length) { await tap(pickOne(r, roads), '一条路'); await sleep(1500); await shot('kept-road'); }
          }
          noteRefusals(atRoad, `${where} · 去往`);
          played.push({ where, kind: '留着的斗法 + 储物袋 · 饭桶 · 路 · 重载' });
        } else unplayable.push({ where, why: 'no 降妖 to start for the walk' });
        noteRefusals(at, where);
      } else unplayable.push({ where, why: `seed failed: ${s.error ?? JSON.stringify(s)}` });
    }

    // ── baselines: a hand of 6, 8 and 10 cards (turns ended until the hand holds n), at the fixed seed
    if (phone && want('baseline')) {
      // A hand of 6, 8 and 10 cards, set up in the save: the fixed save (fixtures/baseline-save.json) walks to 后山 and
      // opens its 降妖 through the rules' own verbs on the fixed clock, then the fight's opening hand is widened by its
      // setup's `extra` (cards in hand from the first turn, battle.js) — the same deck, the same beast, the same hand
      // every run and every commit. The page then takes the open fight up as a player coming back to it would.
      for (const n of [6, 8, 10]) {
        const name = `pb-b-${w}-${n}`;
        where = `${size} · 基线 · ${n} 张`;
        fs.mkdirSync(path.join(data, 'saves', name), { recursive: true });
        fs.copyFileSync(path.join(HERE, 'fixtures', 'baseline-save.json'), path.join(data, 'saves', name, 'state.json'));
        rules(name, 'move', ['--place=houshan']);
        const look = rules(name, 'look', []);
        const duelId = (look.tray ?? []).find((t) => t.opens === 'duel')?.arg ?? look.place?.encounter?.game?.id ?? null;
        const started = duelId ? rules(name, 'duel', [`--id=${duelId}`]) : null;
        if (!started?.ok) { unplayable.push({ where, why: `no 降妖 to open at 后山 for the baseline (${duelId ?? 'none'})` }); continue; }
        const stNow = JSON.parse(fs.readFileSync(path.join(data, 'saves', name, 'state.json'), 'utf8'));
        const opening = await openingHand(skill, stNow.fight.setup);
        patchSave(name, (st) => {
          const you = st.fight.setup.you;
          const more = Math.max(0, n - opening);
          you.extra = [...(you.extra ?? []), ...Array.from({ length: more }, (_, i) => you.deck[i % you.deck.length])];
        });
        await open(name); await clear();
        if (!(await page.evaluate(FIGHT))) await reach('[data-duel-start]', '回到斗法');
        await sleep(1200);
        const f = await page.evaluate(FIGHT);
        if (!f || f.hand.length < n) { unplayable.push({ where, why: `the hand held ${f?.hand.length ?? 'no fight'}, not ${n}` }); continue; }
        const file = await shot(`hand${n}`, { scope: '.battle' });
        const key = `${size}-hand${n}.png`;
        const bl = path.join(baselines, key);
        if (opts.updateBaselines) { fs.mkdirSync(baselines, { recursive: true }); fs.copyFileSync(file, bl); }
        else if (fs.existsSync(bl)) {
          const a = PNG.sync.read(fs.readFileSync(bl)), b = PNG.sync.read(fs.readFileSync(file));
          if (a.width !== b.width || a.height !== b.height) findings.push({ kind: 'layout', hard: true, size, where, why: 'baseline-size', baseline: key, shot: path.relative(out, file) });
          else {
            const diff = new PNG({ width: a.width, height: a.height });
            const n2 = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
            const share = n2 / (a.width * a.height);
            const dfile = file.replace(/\.png$/, '.diff.png');
            fs.writeFileSync(dfile, PNG.sync.write(diff));
            if (share > 0.02) findings.push({ kind: 'layout', hard: true, size, where, why: 'baseline-diff', baseline: key, share: Math.round(share * 1000) / 1000, shot: path.relative(out, file), diff: path.relative(out, dfile) });
          }
        } else findings.push({ kind: 'layout-warn', hard: false, size, where, why: 'no-baseline', baseline: key });
      }
    }

    for (const e of errors) findings.push({ kind: 'console-error', hard: true, size, where: e.where, text: e.text });
    for (const m of setupMisses) unplayable.push({ where: m.where, why: `the way to the play did not answer: ${m.control}` });
    await ctx.close();
  }
  server.close();
  for (const u of unknown) findings.push({ kind: 'engine-route', hard: false, route: u });
  fs.writeFileSync(path.join(out, 'verbs.jsonl'), verbs.map((v) => JSON.stringify({ ...v, out: v.out && JSON.stringify(v.out).length > 2000 ? { ok: v.out.ok, refused: v.out.refused, say: v.out.say, outcome: v.out.outcome, cut: true } : v.out })).join('\n') + '\n');
  const result = { skill, at: new Date().toISOString(), sizes: opts.sizes, fights: Number(opts.fights ?? 2), played, unplayable, findings, refusals, screenshots };
  await writePack(out, result, { runId: opts.runId });
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const skill = flag('skill');
  if (!skill) { console.error('usage: playbot.mjs --skill=<lingjing dir> [--out=…] [--sizes=430x932,375x812,1280x820] [--fights=2]'); process.exit(2); }
  const day = new Date().toISOString().slice(0, 10);
  const runId = flag('run-id', `${day}-${Date.now().toString(36)}`);
  const out = flag('out', path.join(HERE, '..', '..', 'report', runId));
  const res = await run({ skill, shared: flag('shared'), out, runId, sizes: String(flag('sizes', '430x932,375x812,1280x820')).split(','), fights: flag('fights', 2), seed: flag('seed', 1), updateBaselines: Boolean(flag('update-baselines', false)), headed: Boolean(flag('headed', false)), debug: Boolean(flag('debug', false)), only: flag('only', null), noCareful: Boolean(flag('no-careful', false)) });
  const hard = res.findings.filter((f) => f.hard);
  console.log(`playbot ${runId}: ${res.played.length} played, ${res.unplayable.length} could not be played, ${hard.length} hard findings, ${res.refusals.length} refusals → ${out}`);
  for (const k of [...new Set(hard.map((f) => f.kind))]) console.log(`  ${k}: ${hard.filter((f) => f.kind === k).length}`);
  process.exit(hard.length ? 1 : 0);
}
