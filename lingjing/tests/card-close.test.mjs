// Every card and overlay over the scene closes, and comes back (Hanli 2026-11-04: 「这个狰的卡…关不上了…应该所有卡都有关闭
// 按钮」 · 「商店卡关上应该能从某个地方点开. 其他卡也是, 你check一下, 别有漏洞」). The lint: card-close.js's tables against
// the page's source — a card kind or a dialog root with no row fails, and every close and reopen a row names must be a
// control the page draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE, OVERLAYS, closeOf, closeX, withCloseX, stageMinusAway, awayChipsHtml, awayKey } from '../scripts/card-close.js';
import { CARD_KINDS } from '../scripts/stage.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const pageFiles = [...fs.readdirSync(DIR).filter((f) => f.endsWith('.js')), ...fs.readdirSync(path.join(DIR, 'games')).filter((f) => f.endsWith('.js')).map((f) => `games/${f}`)];
const ALL = pageFiles.map((f) => [f, read(f)]);
// The page's source, without the tables themselves (card-close.js names every attribute — it would vouch for itself)
// and without comments (a word in a comment draws nothing).
const untabled = (f, s) => (f === 'card-close.js' ? s.replace(/export const (STAGE|OVERLAYS|TOASTS) = \{[\s\S]*?\n\};/g, '') : s);
const SRC = ALL.map(([f, s]) => untabled(f, s).replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
// A control the page draws: the attribute written into markup (`data-x=`, `data-x>`, `data-x `, `data-x"`) or set by code.
const drawn = (attr) => new RegExp(`${attr}(?=[=\\s>"'\`$])`).test(SRC.replace(/^\s*\/\/.*$/gm, ''));
// …and one the page listens for (a CLICKS row, a closest(), a dataset read).
const heard = (attr) => SRC.includes(`'[${attr}]'`) || SRC.includes(`"[${attr}]"`) || SRC.includes(`[${attr}]`) || SRC.includes(`[${attr}=`);

const renderKinds = () => {
  const m = read('cards.js').match(/const RENDER = \{([^}]*)\}/);
  return m[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
};
const pageKinds = () => {
  const m = read('lingjing.js').match(/const PAGE_CARDS = \{(.*)\};/);
  return [...m[1].matchAll(/(?:^|[{,]\s*)(\w+):\s*\(\)/g)].map((x) => x[1]);
};

test('every card kind the stage can draw has a row: how it closes, where it comes back', () => {
  const kinds = new Set([...renderKinds(), ...pageKinds(), ...Object.keys(CARD_KINDS)]);
  assert.ok(kinds.has('creature') && kinds.has('mijing') && kinds.has('fight'), 'the kinds were read');
  const missing = [...kinds].filter((k) => !STAGE[k]);
  assert.deepEqual(missing, [], `card kinds with no close/reopen row in card-close.js STAGE: ${missing.join(', ')}`);
  for (const k of Object.keys(STAGE)) assert.ok(kinds.has(k), `STAGE.${k} names no card kind the stage draws`);
});

test('a card that closes names its close and at least one visible way back; one that does not says why', () => {
  for (const [k, row] of Object.entries(STAGE)) {
    assert.ok(['away', 'own', 'none'].includes(row.close), `${k}: close is away | own | none`);
    if (row.close === 'none') { assert.ok(row.why?.length > 10, `${k}: no ✕ needs its why`); continue; }
    assert.ok(row.reopen?.length, `${k}: a card that closes needs a way back (reopen)`);
    // In sight right after the close, or the gap named (reported: tests below print them).
    assert.ok(row.visible === true || row.gap?.length > 20, `${k}: its way back stands in sight, or its gap is named`);
    if (row.close === 'own') assert.ok(drawn(row.attr) && heard(row.attr), `${k}: its own close ${row.attr} is drawn and heard`);
    if (row.close === 'away') assert.ok(['told', 'place'].includes(row.scope), `${k}: a put-away card says how long it stays away`);
    for (const a of row.reopen) assert.ok(drawn(a) && heard(a), `${k}: its way back ${a} is a control the page draws and hears`);
  }
});

test('the page draws the ✕ on every card it puts away, and hears it and the 收起 chip', () => {
  const page = read('lingjing.js');
  assert.match(page, /withCloseX\(/, 'drawCard lays the ✕ on the card');
  assert.match(page, /\['\[data-card-away\]'/, 'the ✕ is heard');
  assert.match(page, /\['\[data-card-back\]'/, 'the 收起 chip is heard');
  assert.match(page, /awayChipsHtml\(/, 'the tray draws the 收起 chips');
});

test('every dialog root the page draws is an overlay with a ✕, Esc, and its chip', () => {
  const roots = [];
  for (const [f, s] of ALL) for (const m of s.matchAll(/class="([^"$]+)"[^>]*role="dialog"|role="dialog"[^>]*class="([^"$]+)"/g)) roots.push([f, (m[1] ?? m[2]).trim()]);
  // roots drawn by createElement (veils) are rows too
  assert.ok(roots.length >= 8, 'the dialog roots were read');
  const known = Object.values(OVERLAYS);
  for (const [f, cls] of roots) {
    const row = known.find((o) => cls.split(/\s+/).includes(o.root.split(/\s+/).at(-1)) || cls === o.root);
    assert.ok(row, `${f}: the dialog root .${cls} has no row in card-close.js OVERLAYS`);
  }
  for (const [k, o] of Object.entries(OVERLAYS)) {
    const file = read(o.file);
    assert.ok(file.includes(o.root.split(/\s+/).at(-1)), `${k}: its root .${o.root} is drawn in ${o.file}`);
    assert.ok(drawn(o.close) && heard(o.close), `${k}: its close ${o.close} is drawn and heard`);
    assert.equal(o.esc, true, `${k}: Esc closes it`);
    if (o.reopen) assert.ok(drawn(o.reopen) && heard(o.reopen), `${k}: the chip that opens it again (${o.reopen}) is drawn and heard`);
    else assert.ok(o.transient?.length > 10, `${k}: no way back needs its why (a notice)`);
  }
});

test('every overlay\'s close is the one ✕ (closeX, the shell\'s .gshell-close)', () => {
  for (const [k, o] of Object.entries(OVERLAYS)) {
    if (o.close === 'data-talk-tool') continue; // 砍价: the npc-talk head's own shell ✕ (npc-talk.js tools)
    const file = read(o.file);
    const x = new RegExp(`closeX\\(.{0,40}?${o.close}`);
    // a popover's ✕ is cards.js popX — closeX(lang, 'data-pop-close')
    const pop = o.close === 'data-pop-close' && /\$\{popX\(/.test(file);
    assert.ok(x.test(file) || pop, `${k}: ${o.file} draws its close ${o.close} with closeX`);
  }
});

test('Esc goes through one resolver, topmost first, and the stage\'s card last', () => {
  const page = read('lingjing.js');
  assert.match(page, /function escTop\(/);
  assert.doesNotMatch(page, /const onKey = \(k\) => \{ if \(k\.key === 'Escape'\) close\(\); \};/, 'the large 图鉴 has no second Esc listener (one press, one close)');
});

test('the ✕ is the shell\'s round close, laid first inside the card root', () => {
  const x = closeX('zh', 'data-card-away="creature:zheng"');
  assert.match(x, /class="gshell-btn gshell-close cardx"/);
  assert.match(x, /aria-label="合上"/);
  assert.equal(withCloseX('<div class="card creature"><b>狰</b></div>', '<i></i>'), '<div class="card creature"><i></i><b>狰</b></div>');
});

test('put away: a told card stays away from place to place, a place card only where it was put away', () => {
  const look = { mijing: { away: true }, place: { id: 'yaoyuan' } };
  const cards = [{ card: 'creature', id: 'zheng' }, { card: 'mijing' }, { card: 'panel' }];
  const entries = [{ key: 'creature:zheng', place: null }, { key: 'mijing:', place: 'yaoyuan' }, { key: 'panel:', place: null }];
  const here = stageMinusAway(cards, entries, 'yaoyuan', look);
  assert.deepEqual(here.cards.map(awayKey), ['panel:'], 'the scene card never goes away');
  assert.deepEqual(here.away.map(awayKey), ['creature:zheng', 'mijing:']);
  const there = stageMinusAway(cards, entries, 'shimen', look);
  assert.deepEqual(there.cards.map(awayKey), ['mijing:', 'panel:']);
  // inside a run the 秘境 card is the run: no ✕, never put away
  assert.equal(closeOf({ card: 'mijing' }, { mijing: { inside: true } }), 'none');
  // a haunt's beast closes with the page's ✕; a story fight with its own 留 · ✕
  assert.equal(closeOf({ card: 'duel', id: 'g1' }, { place: { encounter: { game: { id: 'g1' } } } }), 'away');
  assert.equal(closeOf({ card: 'duel', id: 'g2' }, { place: { encounter: { game: { id: 'g1' } } } }), 'own');
});

test('the 收起 chip stands for each card put away — but not where the tray already holds it (秘境令 away)', () => {
  const look = { mijing: { away: true } };
  const html = awayChipsHtml([{ card: 'creature', id: 'zheng' }, { card: 'mijing' }], { look, name: (c) => (c.card === 'creature' ? '狰' : '秘境') });
  assert.match(html, /data-card-back="creature:zheng"/);
  assert.match(html, /↩ 狰/);
  assert.doesNotMatch(html, /mijing/);
  assert.match(awayChipsHtml([{ card: 'mijing' }], { look: { mijing: { door: {} } }, name: () => '秘境' }), /data-card-back="mijing:"/);
});

test('every note over the stage wears the ✕ (toastX) and says where what it told is kept', async () => {
  const { TOASTS } = await import('../scripts/card-close.js');
  const page = read('lingjing.js');
  const body = page.slice(page.indexOf('function toastsHtml('), page.indexOf('const toastX'));
  for (const [k, t] of Object.entries(TOASTS)) {
    if (t.close === 'none') { assert.ok(t.why?.length > 10, `${k}: no ✕ needs its why`); continue; }
    assert.ok(body.includes(`toastX(`) && body.includes(t.close), `${k}: toastsHtml lays the ✕ (${t.close})`);
    assert.ok(heard(t.close), `${k}: its ✕ ${t.close} is heard`);
    assert.ok(t.kept?.length > 5, `${k}: says where what it told is kept`);
  }
  // every note toastsHtml draws has a row
  for (const fn of ['emergedHtml', 'trialToldHtml', 'spoilsHtml', 'handinHtml', 'fullOfferHtml']) assert.ok(body.includes(fn), `toastsHtml draws ${fn}`);
});

test('a card that closes by its own control draws that control as the one ✕ (closeX · the shell\'s close · 留 · ✕)', () => {
  const X = /(closeX\(|toolHtml\('close'|outHtml\()[\s\S]{0,220}$/;
  const xed = (attr) => {
    for (const m of SRC.matchAll(new RegExp(attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) if (X.test(SRC.slice(Math.max(0, m.index - 220), m.index))) return true;
    return false;
  };
  for (const [k, row] of Object.entries(STAGE)) {
    if (row.close === 'own') assert.ok(xed(row.attr), `${k}: its own close ${row.attr} is drawn as the ✕`);
    if (row.ownAttr) assert.ok(xed(row.ownAttr), `${k}: its rules' close ${row.ownAttr} is drawn as the ✕`);
  }
});

test('the ways back that take knowing where to look are few and named', () => {
  const gaps = Object.entries(STAGE).filter(([, r]) => r.close !== 'none' && r.visible !== true).map(([k]) => k);
  assert.deepEqual(gaps.sort(), ['closed', 'seclude'], `known gaps changed: ${gaps.join(', ')} — name each in the report`);
  // a told card's one-tap way back is the ↩ chip: it must be drawn even when 体力 is spent (outside trayHtml's early return)
  assert.match(read('lingjing.js'), /awayChipsHtml\(view\.awayNow[^)]*\)[^\n]* \+ trayHtml\(/);
});
