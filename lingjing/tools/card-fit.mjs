// tools/card-fit.mjs — every card fits its face: each card of the catalog (worlds/jiuding/cards.json, 银月's lent cards
// too) × every 品 (凡 银 金 宝石 钻石) × every place a card is drawn (hand-side, hand-centre, hand-small — the phone hand
// shrunk by a full board —, board-ours, board-foe, reveal — 得牌 —, kace — 卡册) × 430x932, 375x812, 1280x820, drawn
// by the page's own markup (battle-card.js cardFaceHtml / minionHtml, card-reveal.js revealHtml, kace.js's face) on the
// live page of a scratch save, with its CSS, and measured: no badge (cost, 五行 seal, 攻, 血, 借 / 新, the board's status)
// lies on a text (name, effect line, status) or on another badge by more than 1 px; no text is clipped by its box, or out
// of its card's face (inside the 品 frame's band); every text is ≥ 10 px as drawn. Headless, scratch saves only (never
// ~/.linggen); not part of check.sh (it is minutes).
//
//   node lingjing/tools/card-fit.mjs [--skill=<lingjing dir>] [--sizes=430x932,375x812,1280x820] [--places=…]
//                                    [--pins=fan,yin,jin,baoshi,zuanshi] [--cards=id,id] [--json=<file>] [--shared=<engine shared/>]
//                                    [--shots=<dir> with --cards: a picture of each cell]
//
// Prints each failing cell (card · 品 · place · size · what · by how many px) and a count by kind; exit 1 on any.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeServer, defaultShared, BASELINE_NOW } from './playbot/serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flag = (k, d = null) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const SKILL = path.resolve(flag('skill', path.join(HERE, '..')));
const SIZES = flag('sizes', '430x932,375x812,1280x820').split(',');
const PLACES = flag('places', 'hand-side,hand-centre,hand-small,board-ours,board-foe,reveal,kace').split(',');
const PINS = flag('pins', 'fan,yin,jin,baoshi,zuanshi').split(',');
const ONLY = flag('cards', null)?.split(',') ?? null;
const SHOTS = flag('shots', null);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'card-fit-'));
if (data.startsWith(path.join(os.homedir(), '.linggen'))) throw new Error('card-fit: scratch data under ~/.linggen');
const rules = (name, verb, flags) => {
  const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts/rules.mjs'), verb, ...flags, `--save=${name}`], { cwd: SKILL, env: { ...process.env, LINGJING_DATA: data, LINGJING_TRACK_OFF: '1', LINGJING_CLOUD: '0', LINGJING_NOW: BASELINE_NOW }, encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return { ok: false, out: r.stdout, err: r.stderr }; }
};
/* Two scratch saves from the play bot's fixed save: one standing at 后山 with its 降妖 open (the hand and the ranks),
   one with no fight (the 卡册 is refused while a fight is open). pb-b-*: the fixed clock. */
const save = (name, fight) => {
  fs.mkdirSync(path.join(data, 'saves', name), { recursive: true });
  fs.copyFileSync(path.join(HERE, 'playbot/fixtures/baseline-save.json'), path.join(data, 'saves', name, 'state.json'));
  if (!fight) return true;
  rules(name, 'move', ['--place=houshan']);
  const look = rules(name, 'look', []);
  const id = (look.tray ?? []).find((t) => t.opens === 'duel')?.arg ?? look.place?.encounter?.game?.id ?? null;
  return Boolean(id && rules(name, 'duel', [`--id=${id}`]).ok);
};

/* In the page: one card drawn into one place, then measured. Returns the cell's failures. */
const PAGE = String.raw`
(() => {
  const BADGES = '.bcost, .belem, .bglyph, .batk, .bhp, .blent-mark, .bfresh, .deckfresh, .rv-cost, .rv-atk, .rv-hp, .bminion > small';
  const TEXTS = '.bname, .btext, .rv-name, .rv-kind, .bminion > small';
  const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const lines = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5); };
  const round = (cs) => parseFloat(cs.borderTopLeftRadius) >= Math.min(parseFloat(cs.width), parseFloat(cs.height)) * 0.4;
  const label = (el) => el.matches('.bminion > small') ? 'status' : [...el.classList].find((c) => /^(b|rv-|deck)/.test(c)) ?? el.className;
  const over = (a, b) => ({ w: Math.min(a.right, b.right) - Math.max(a.left, b.left), h: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) });
  // a round badge (a gem, a seal ring) is an ellipse: a text box hits it only where it reaches inside it
  const hits = (badge, isRound, t) => {
    const o = over(badge, t);
    if (o.w <= 1 || o.h <= 1) return null;
    if (!isRound) return o;
    const cx = (badge.left + badge.right) / 2, cy = (badge.top + badge.bottom) / 2, rx = badge.width / 2, ry = badge.height / 2;
    const px = Math.max(t.left + 1, Math.min(cx, t.right - 1)), py = Math.max(t.top + 1, Math.min(cy, t.bottom - 1));
    return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1 ? o : null;
  };
  return function measure(host, face, scaleEl) {
    // the size it is drawn at (a side card is scaled), then its boxes in its own frame: a fan's tilt or the wheel's turn
    // would only widen every box (a rigid turn moves nothing within the card). The wheel's own scale (--ws) when it has
    // one: the turn's perspective would read a side card a little larger than it is drawn.
    const ws = scaleEl ? parseFloat(getComputedStyle(scaleEl).getPropertyValue('--ws')) : NaN;
    const scale = !scaleEl ? 1 : Number.isFinite(ws) ? ws : scaleEl.getBoundingClientRect().height / (scaleEl.offsetHeight || 1);
    const held = scaleEl ? [scaleEl.style.transform, scaleEl.style.transition] : null;
    if (scaleEl) { scaleEl.style.transition = 'none'; scaleEl.style.transform = 'none'; }
    try { return boxes(host, face, scale); } finally { if (scaleEl) { scaleEl.style.transform = held[0]; scaleEl.style.transition = held[1]; } }
  };
  function boxes(host, face, scale) {
    const fails = [];
    const fr = face.getBoundingClientRect();
    const band = face.querySelector(':scope > .bpin, :scope > .rv-frame, .rv-paper > .rv-frame');
    const inset = band ? parseFloat(getComputedStyle(band).borderTopWidth) * (fr.height / (face.offsetHeight || fr.height)) : 0;
    const inner = { left: fr.left + inset - 1, right: fr.right - inset + 1, top: fr.top + inset - 1, bottom: fr.bottom - inset + 1 };
    const badges = [...host.querySelectorAll(BADGES)].filter(shown).map((el) => ({ el, r: el.getBoundingClientRect(), round: round(getComputedStyle(el)), name: label(el) }));
    const texts = [...host.querySelectorAll(TEXTS)].filter(shown).map((el) => ({ el, rs: lines(el), name: label(el) }));
    for (const t of texts) {
      const cs = getComputedStyle(t.el), px = parseFloat(cs.fontSize) * scale;
      if (px < 9.95) fails.push({ kind: 'small-text', what: t.name, px: Math.round(px * 10) / 10 });
      if (cs.overflowX !== 'visible' && t.el.scrollWidth > t.el.clientWidth + 1) fails.push({ kind: 'clipped', what: t.name, px: t.el.scrollWidth - t.el.clientWidth });
      if (cs.overflowY !== 'visible' && t.el.scrollHeight > t.el.clientHeight + 1) fails.push({ kind: 'clipped', what: t.name, px: t.el.scrollHeight - t.el.clientHeight });
      for (const r of t.rs) {
        const out = Math.max(inner.left - r.left, r.right - inner.right, inner.top - r.top, r.bottom - inner.bottom);
        if (out > 1) { fails.push({ kind: 'off-face', what: t.name, px: Math.round(out) }); break; }
      }
      for (const b of badges) {
        if (b.el === t.el || b.el.contains(t.el) || t.el.contains(b.el)) continue;
        for (const r of t.rs) { const o = hits(b.r, b.round, r); if (o) { fails.push({ kind: 'badge-on-text', what: b.name + ' × ' + t.name, px: Math.round(Math.min(o.w, o.h)) }); break; } }
      }
    }
    for (let i = 0; i < badges.length; i += 1) for (let j = i + 1; j < badges.length; j += 1) {
      const a = badges[i], b = badges[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const o = over(a.r, b.r);
      if (o.w > 1 && o.h > 1 && (!(a.round && b.round) || Math.hypot((a.r.left + a.r.right - b.r.left - b.r.right) / 2, (a.r.top + a.r.bottom - b.r.top - b.r.bottom) / 2) < (a.r.width + b.r.width) / 2 - 1))
        fails.push({ kind: 'badge-on-badge', what: a.name + ' × ' + b.name, px: Math.round(Math.min(o.w, o.h)) });
    }
    return fails;
  };
})()`;

// the engine's page kit (/shared): --shared, else $LINGGEN_SHARED, else the Linggen checkout beside this one
const { server } = makeServer({ skill: SKILL, data, shared: flag('shared', process.env.LINGGEN_SHARED ?? defaultShared(SKILL) ?? defaultShared(path.join(HERE, '..'))) });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const all = [];
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });

for (const size of SIZES) {
  const [w, h] = size.split('x').map(Number), phone = w < 700;
  const fightSave = `pb-b-fit-${w}`, bookSave = `pb-b-book-${w}`;
  if (!save(fightSave, true)) { console.error(`card-fit: no fight to open for ${size}`); process.exit(2); }
  save(bookSave, false);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const tap = (texts) => page.evaluate((texts) => { for (const t of texts) { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t) && x.offsetParent); if (b) { b.click(); return t; } } return null; }, texts);
  const open = async (name) => { await page.goto(`${base}/apps/lingjing/scripts/index.html?save=${name}&chat=off`, { waitUntil: 'load' }); await sleep(2500); await page.evaluate(() => document.querySelectorAll('.qianmodal, .qianbox').forEach((e) => { e.style.display = 'none'; })); };
  // the page's own modules and a ctx as the page builds one (words, catalog, a 品 per card)
  const setup = () => page.evaluate(async ([PAGE]) => {
    const bc = await import('./battle-card.js'), rv = await import('./card-reveal.js');
    const cat = await fetch('../worlds/jiuding/cards.json').then((r) => r.json());
    const catalog = Object.fromEntries(cat.cards.map((c) => [c.id, c]));
    globalThis.__fit = { bc, rv, catalog, measure: eval(PAGE), ids: cat.cards.map((c) => c.id) };
    // every card's picture loaded once, so a face is measured with its picture in place
    await Promise.all(cat.cards.filter((c) => c.art).map((c) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = '../worlds/jiuding/' + c.art; })));
    return globalThis.__fit.ids;
  }, [PAGE]);
  const ctxJs = `(pin, id) => ({ lang: 'zh', words: __fit.bc.WORDS.zh, catalog: __fit.catalog, pins: pin === 'fan' ? {} : { [id]: pin }, artBase: '../worlds/jiuding/', reasons: new Map(), st: { scale: {}, you: {}, foe: {} }, fresh: [id] })`;
  const cells = async (place, prep, draw) => {
    for (const pin of PINS) {
      const res = await page.evaluate(async ([place, pin, ONLY, ctxJs, prep, draw]) => {
        const mk = eval(ctxJs), out = [];
        const ids = __fit.ids.filter((id) => !ONLY || ONLY.includes(id));
        await eval(prep)();
        for (const id of ids) {
          const c = __fit.catalog[id];
          const got = await eval(draw)(c, mk(pin, id));
          if (!got) continue;
          const img = got.host.querySelector('img');
          if (img && !img.complete) await img.decode().catch(() => {});
          for (const f of __fit.measure(got.host, got.face, got.scale)) out.push({ id, pin, place, ...f });
        }
        return out;
      }, [place, pin, ONLY, ctxJs, prep, draw]);
      for (const f of res) all.push({ size, ...f });
      // --shots=<dir> (with --cards): each cell drawn again and photographed, to look at what the boxes said
      if (SHOTS) for (const id of ONLY ?? []) {
        const box = await page.evaluate(async ([pin, id, ctxJs, draw]) => {
          const got = await eval(draw)(__fit.catalog[id], eval(ctxJs)(pin, id));
          if (!got) return null;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          got.host.scrollIntoView({ block: 'center' });
          const r = got.host.getBoundingClientRect();
          return { x: Math.max(0, r.left - 14), y: Math.max(0, r.top - 14), width: r.width + 28, height: r.height + 28 };
        }, [pin, id, ctxJs, draw]);
        if (box) await page.screenshot({ path: path.join(SHOTS, `${size}-${place}-${id}-${pin}.png`), clip: { ...box, width: Math.min(box.width, w - box.x), height: Math.min(box.height, h - box.y) } });
      }
    }
  };

  // ── the 卡册: a face drawn as kace.js draws a held card, in the 卡册's own pane
  if (PLACES.includes('kace')) {
    await open(bookSave);
    await tap(['物品']); await sleep(1200); await tap(['牌组']); await sleep(1200); await tap(['卡册']); await sleep(2500);
    for (let i = 0; i < 6 && !(await page.$('.kfaces .bcard.face')); i += 1) { await tap(['卡册']); await sleep(1500); }
    if (!(await page.$('.kfaces .bcard.face'))) { const shot = path.join(os.tmpdir(), `card-fit-no-kace-${size}.png`); await page.screenshot({ path: shot }); console.error(`card-fit: no 卡册 at ${size} (${shot})`); process.exit(2); }
    await setup();
    await cells('kace', `async () => { document.querySelector('.kfaces .bcard.face').scrollIntoView({ block: 'center' }); }`,
      `async (c, ctx) => { const slot = document.querySelector('.kfaces .bcard.face'); const leaf = __fit.bc.cardFaceHtml(c.id, ctx); slot.outerHTML = '<div class="bcard face kcard held el-' + (c.element ?? 'none') + '" data-kace-card="' + c.id + '">' + leaf + '<b class="deckfresh">新</b></div>'; const host = document.querySelector('.kfaces .bcard.face'); return { host, face: host.querySelector('.bleaf') }; }`);
  }

  // ── the fight
  await open(fightSave);
  for (let i = 0; i < 8 && !(await page.$('.battle .bhand > .bcard')); i += 1) { await page.evaluate(() => document.querySelector('[data-duel-start]')?.click()); await tap(['回到斗法', '回到这一战', '还有', '✕']); await sleep(1500); }
  if (!(await page.$('.battle .bhand > .bcard'))) { console.error(`card-fit: the fight did not open at ${size}`); process.exit(2); }
  await setup();
  // the hand: a card's face swapped into the centre card (the one in front) or a side card (phone: the next one out on the
  // right; desk: the first of the fan), with its 新 chip, and 借 when the card is lent
  const handDraw = (which) => `async (c, ctx) => {
    const cards = [...document.querySelectorAll('.battle .bhand > .bcard')];
    const z = (e) => (Number(getComputedStyle(e).zIndex) || 0) * 1000 + e.getBoundingClientRect().width;
    const phone = matchMedia('(max-width: 700px)').matches;
    const order = cards.slice().sort((a, b) => z(b) - z(a));
    const el = '${which}' === 'side' ? (phone ? order.slice(1).find((e) => e.classList.contains('r')) ?? order[1] : cards[0]) : (phone ? order[0] : cards[Math.floor(cards.length / 2)]);
    if (!el) return null;
    el.querySelectorAll(':scope > .bfresh, :scope > .blent-mark').forEach((e) => e.remove());
    el.classList.toggle('lent', Boolean(c.lent)); el.classList.remove('dim');
    el.querySelector('.bleaf').outerHTML = __fit.bc.cardFaceHtml(c.id, ctx);
    el.insertAdjacentHTML('beforeend', '<i class="bfresh">新</i>' + (c.lent ? '<span class="blent-mark">借</span>' : ''));
    return { host: el, face: el.querySelector('.bleaf'), scale: el };
  }`;
  const restoreRanks = `async () => {}`;
  if (PLACES.includes('hand-centre')) await cells('hand-centre', restoreRanks, handDraw('centre'));
  if (PLACES.includes('hand-side')) await cells('hand-side', restoreRanks, handDraw('side'));
  // the ranks: minionHtml's own card in the first slot of each (ours ready and 护主, theirs 护主 and 锁: the longest status)
  const boardDraw = (side) => `async (c, ctx) => {
    if (c.kind !== 'minion') return null;
    const rank = document.querySelector('.battle .brank.${side}');
    const slot = rank.querySelector('.bminion');
    const m = { id: c.id, atk: c.atk, hp: c.hp, element: c.element, taunt: true, ready: '${side}' === 'mine', chained: '${side}' === 'theirs' };
    slot.outerHTML = __fit.bc.minionHtml(m, '${side}', 0, ctx, null);
    const host = rank.querySelector('.bminion');
    return { host, face: host };
  }`;
  if (PLACES.includes('board-ours')) await cells('board-ours', restoreRanks, boardDraw('mine'));
  if (PLACES.includes('board-foe')) await cells('board-foe', restoreRanks, boardDraw('theirs'));
  // the small hand: both ranks full (4 a side, as a crowded fight), so the phone's hand gives way to its floor
  if (PLACES.includes('hand-small')) {
    await cells('hand-small', `async () => {
      const ctx = { lang: 'zh', words: __fit.bc.WORDS.zh, catalog: __fit.catalog, pins: {}, artBase: '../worlds/jiuding/', reasons: new Map(), st: { scale: {}, you: {}, foe: {} } };
      const any = Object.values(__fit.catalog).find((c) => c.kind === 'minion');
      for (const side of ['mine', 'theirs']) {
        const rank = document.querySelector('.battle .brank.' + side);
        [...rank.querySelectorAll('.bminion')].forEach((s, i) => { s.outerHTML = __fit.bc.minionHtml({ id: any.id, atk: any.atk, hp: any.hp, element: any.element, taunt: i === 0, ready: side === 'mine' }, side, i, ctx, null); });
      }
    }`, handDraw('centre'));
  }
  // 得牌: the big card as revealHtml writes it, in its veil over the page
  if (PLACES.includes('reveal')) {
    await cells('reveal', `async () => {}`, `async (c, ctx) => {
      document.querySelector('.fit-veil')?.remove();
      const v = document.createElement('div');
      v.className = 'rv-veil fit-veil'; v.style.position = 'fixed'; v.style.animation = 'none';
      v.innerHTML = __fit.rv.revealHtml({ ...c, pin: ctx.pins[c.id] ?? 'fan' }, { lang: 'zh', line: '降服所得', artBase: '../worlds/jiuding/' });
      v.querySelector('.rv-card').style.animation = 'none';
      document.body.append(v);
      const host = v.querySelector('.rv-card');
      return { host, face: host.querySelector('.rv-paper') };
    }`);
  }
  if (errors.length) console.error(`card-fit ${size}: page errors\n  ${errors.join('\n  ')}`);
  await ctx.close();
}
await browser.close();
server.close();
fs.rmSync(data, { recursive: true, force: true });

const by = {};
for (const f of all) by[f.kind] = (by[f.kind] ?? 0) + 1;
const out = flag('json', null);
if (out) fs.writeFileSync(out, `${JSON.stringify(all, null, 1)}\n`);
for (const f of all) console.log(`${f.id} · ${f.pin} · ${f.place} · ${f.size} · ${f.kind} · ${f.what} · ${f.px}px`);
console.log(`card-fit: ${all.length} failing ${all.length === 1 ? 'check' : 'checks'}${all.length ? ` — ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}` : ''}`);
process.exit(all.length ? 1 : 0);
