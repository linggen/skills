// kailu.js — 喂饭桶 · 开炉 (Hanli 2026-10-20): the 饭桶's lottery. Up to three things and 0–3 灵石 into its mouth, the lid
// pressed on a gold puff (压盖), and out spins one thing in its grade's glow — 凡 grey, 有用 blue, 珍品 purple, 逆天 gold.
// The play is Phaser (games/kailu/kailu.min.mjs, built from tools/kailu/, loading the one shared
// scripts/vendor/phaser.min.mjs); the odds are the rules' (rules/fantong.mjs on a save, rules/fantong-roll.mjs bare).
// This module keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion, seed, shell, onEvent, onGame }) → Promise<{ won, stars, grade, result } | { left }>
//   (`onGame(g)`: the live game's handle, `g.refresh()` after its node is laid into a new host.)
//
// `data` (the page, fantong-kailu.js): { brief: the rules' fantong brief, roll(ids, lingshi, press) → the `fantong feed`
// answer }. Without it (the 游戏厅, the try page) it plays a sample pot on the bare table with no save and no wait —
// `?force=best` (or rare / useful) rolls until that grade, to look at a reveal. 银月's line at the reveal goes to the
// shell's bubble (`shell.say`); the shell's result line reads the grade, its stars the grade's place (0–3).
import { comicArt } from './items-comic.js';

export const meta = {
  id: 'kailu',
  // What it names (its bundle or loop, through the shell; games/kit/audio/sounds.json `kailu`; tests/game-sound.test.mjs).
  sounds: ['chew', 'reveal'],
  bot: 'scripts/games/bots/kailu.js', // the book's pot (a story board): tests/story-gains.test.mjs
  name: { zh: '喂饭桶 · 开炉', en: 'Feed the Rice Bucket' },
  how: {
    zh: '把最多三样东西拖进饭桶嘴里，可搭灵石。开炉后饭桶嚼着，盖子冒红烟、金烟——金烟冒起时按住压盖，品级升一档。',
    en: 'Drag up to three things into its mouth, add spirit stones if you like. As it chews the lid puffs red and gold — press it down on a gold puff to lift the grade a notch.',
  },
};

const FONT = new URL('./kailu/font/zcool-kuaile.woff2', import.meta.url);
const WORLD = new URL('../../worlds/jiuding/', import.meta.url);

async function loadFont(doc) {
  if (!globalThis.FontFace || !doc.fonts) return;
  if ([...doc.fonts].some((f) => f.family === 'KLKuaiLe')) return;
  const face = new FontFace('KLKuaiLe', `url(${FONT.href}) format('woff2')`);
  doc.fonts.add(await face.load().catch(() => face));
}

/** An item's picture for the canvas: its comic icon, else its ink. */
export const iconOf = (id, art = null) => comicArt(id) ?? (art ? new URL(art, WORLD).href : null);

/* ── The sample pot (no save): the bare table, a handful of things of each kind, no wait ── */
const SAMPLE = ['chaihuo', 'kuye', 'shizi', 'huangjing', 'fuling', 'lingzhi', 'yaodan-1', 'chai-ya', 'lang-pi', 'zhu-ya', 'tie-sha', 'cishi', 'talisman', 'xionghuang', 'grey-robe'];
/* The table, its words and what it knows of each thing: the sample pot's and the book's own pot's one source. */
async function tableOf(lang) {
  const [raw, items, balance, fr] = await Promise.all([
    fetch(new URL('fantong.json', WORLD)).then((r) => r.json()), fetch(new URL('items.json', WORLD)).then((r) => r.json()),
    fetch(new URL('balance.json', WORLD)).then((r) => r.json()).catch(() => null), import('../rules/fantong-roll.mjs'),
  ]);
  const t = fr.withWorth(raw, balance, items.items); // its worth and what it knows of each thing, as content.mjs folds them
  const byId = new Map(items.items.map((i) => [i.id, i]));
  const pick = (o) => o?.[lang] ?? o?.zh ?? null;
  const words = t.words?.[lang] ?? t.words?.zh ?? {};
  const input = (id, n, over = {}) => { const kind = over.kind ?? fr.kindOf(t, id, (x) => t.item_info?.[x]); return { id, name: pick(over.name) ?? pick(byId.get(id)?.name) ?? id, art: over.art ?? byId.get(id)?.art, kind, fam: fr.familyOfKind(t, kind), tier: fr.tierOfItem(t, id), n }; };
  const brief = (inputs, lingshi) => ({
    ready: true, max_in: t.max_in ?? 3, tints: Object.fromEntries(Object.entries(t.kinds).filter(([k]) => k !== '_about').map(([k, v]) => [k, v.tint])),
    grades: words.grades ?? {}, quips: words.quips ?? {}, lingshi,
    leans: Object.fromEntries(Object.entries(t.families ?? {}).filter(([k]) => k !== '_about').map(([k, v]) => [k, pick(v.lean)])),
    inputs,
  });
  const out = (id, grade) => (id === 'lingshi' ? { id, name: words.lingshi ?? '灵石', grade, wealth: true }
    : { id, name: pick(byId.get(id)?.name) ?? id, hint: pick(byId.get(id)?.hint), art: byId.get(id)?.art ?? null, grade });
  return { t, byId, pick, words, input, brief, out, ...fr };
}

/* ── The book's own pot (a story board, Hanli 2026-10-28: 「应该安排一个饭桶的剧情固定游戏. 让玩家按要求放剧情里的东西进饭桶」):
   the board's deal names the tray (`tray`: what lies on the floor, a thing of the book that is no item with its name and
   picture) and the one pot (`pot`: exactly these go in, exactly these come out, the biggest gold reveal). Any other pot
   is chewed and spat back whole (the table's own 「呸」), nothing spent — unless the deal's `swallow` (`ids`, `say`) names the
   things the book's pot eats and gives nothing for (the 秘境's spoils): those it swallows, burps, and they are gone from the
   tray (the board's own things, never the bag). The game touches no bag: the grant on its win is
   the rules'. ── */
export async function storyPot(lang, story) {
  const { words, input, brief, out, pick, GRADES } = await tableOf(lang);
  const inputs = (story.tray ?? []).map((e) => input(e.id, e.n ?? 1, e));
  const want = [...(story.pot?.in ?? [])].sort().join('|');
  const eaten = (ids) => ids.length > 0 && ids.every((id) => story.swallow?.ids?.includes(id)); // a thing the book's pot takes and gives nothing back
  const wrong = (ids) => (eaten(ids) ? { ok: true, swallowed: true, say: pick(story.swallow.say), outs: [] } : { ok: true, spat_back: true, say: words.spat_back, outs: [] });
  const roll = async (ids) => {
    if ([...ids].sort().join('|') !== want) return wrong(ids);
    const outs = story.pot.out.map((id) => out(id, 'best'));
    return { ok: true, outs, out: outs[0], grade: 'best', grade_name: words.grades?.best ?? 'best', story: true, first: outs.map((o) => o.id), power: 0, GRADES };
  };
  return { brief: brief(inputs, { max: 0, have: 0 }), roll };
}

async function sample(lang, seed, force) {
  const { t, byId, pick, words, input, brief: briefOf, out: brief1, roll, kindOf, familyOfKind, tierOfItem, GRADES } = await tableOf(lang);
  const brief = briefOf(SAMPLE.filter((id) => byId.has(id)).map((id) => input(id, 9)), { max: t.lingshi?.max ?? 3, have: 9 });
  let n = 0, dry = 0;
  const seen = new Set();
  const rollOne = async (ids, lingshi, press) => {
    let r = null;
    for (let k = 0; k < 4000; k++) { // `force`: the 游戏厅's look at one grade's reveal, rolled for honestly until it comes
      r = roll(t, { seed: `${seed}|${n}|${ids.join('+')}|${lingshi}|${k}`, ids, lingshi, press, pity: dry });
      if (!force || r.grade === force) break;
    }
    n += 1;
    if (r.refused) return { ok: true, spat_back: true, say: words.spat_back, outs: [] };
    dry = r.outs.every((o) => o.grade === 'junk') ? dry + 1 : 0;
    const outs = r.outs.flatMap((o) => [{ ...brief1(o.out, o.grade), ...(o.wealth ? { n: o.wealth } : {}) }, ...(o.with ? [brief1(o.with, o.grade)] : [])]);
    const first = outs.map((o) => o.id).filter((id) => !seen.has(id) && seen.add(id));
    return { ok: true, outs, out: outs[0], grade: r.grade, grade_name: words.grades?.[r.grade] ?? r.grade, ...(r.twin ? { twin: true } : {}), first, power: r.power, GRADES };
  };
  return { brief, roll: rollOne };
}

/* Inside a box that scrolls itself (the pouch's 饭桶 pane in #pouchbook), the table is as tall as the room left
   from its top to the box's bottom edge, so the tray and 开炉 under the pot are in sight with no scroll (live 10-21:
   at 1440×900 it ran 70 px past the pouch, 50 at 390 — the window's height less a guessed reserve). Elsewhere (the
   游戏厅, the try page) the window's rule stands. Again on a resize of the window or of that box. */
const GAP = 12;
function scrollerOf(el) {
  const win = el.ownerDocument.defaultView;
  for (let a = el.parentElement; a && a !== el.ownerDocument.body; a = a.parentElement) if (/auto|scroll/.test(win.getComputedStyle(a).overflowY)) return a;
  return null;
}
function fitter(box) {
  const win = box.ownerDocument.defaultView;
  let watched = null, sized = null;
  const fit = () => {
    const sc = box.isConnected ? scrollerOf(box) : null;
    if (sc !== watched) { sized?.disconnect(); sized = null; watched = sc; if (sc && win.ResizeObserver) { sized = new win.ResizeObserver(() => fit()); sized.observe(sc); } }
    const was = box.style.maxWidth;
    if (!sc) box.style.removeProperty('max-width');
    else {
      // From the table's top (as laid, the box scrolled to its start) to the box's visible bottom.
      const top = box.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientTop + sc.scrollTop;
      box.style.maxWidth = `${Math.max(200, Math.floor((sc.clientHeight - top - GAP) * 2 / 3))}px`;
    }
    if (box.style.maxWidth !== was) fit.canvas?.();
  };
  const onResize = () => fit();
  win.addEventListener('resize', onResize);
  fit.stop = () => { sized?.disconnect(); win.removeEventListener('resize', onResize); };
  return fit;
}

export function mount(container, { lang = 'zh', data = null, signal, reducedMotion = false, seed, shell, onEvent, onGame } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'kailu-stage';
  // 2:3, as tall as the window lets it (the pouch dialog on a phone, a column on a desk).
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#2a1a12;touch-action:none;margin:0 auto;'
    + 'user-select:none;-webkit-user-select:none;aspect-ratio:2/3;width:min(100%, calc((100dvh - var(--game-reserve, 170px)) * 2 / 3))';
  container.replaceChildren(box);
  const fit = fitter(box);
  fit();
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const dev = q.get('dev') === '1', showFps = dev && q.get('fps') === '1';
  const force = ['useful', 'rare', 'best'].includes(q.get('force')) ? q.get('force') : null;
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { fit.stop(); game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    const L = lang === 'en' ? 'en' : 'zh';
    Promise.all([data?.brief ? data : data?.story ? storyPot(L, data.story) : sample(L, seed ?? `kailu|${Date.now()}`, force), import('./kailu/kailu.min.mjs'), loadFont(doc)]).then(([d, { start }]) => {
      if (done) return;
      const icon = (id, art) => iconOf(id, art ?? d.brief.inputs?.find((i) => i.id === id)?.art ?? null);
      game = start({
        parent: box, base: new URL('./kailu/', import.meta.url).href, lang: L, reducedMotion, dev, showFps, shell,
        onEvent: (f) => { shell?.sound?.(f.t, { kind: f.grade }); onEvent?.(f); }, // its facts sound too (games/kit/audio/sounds.json kailu)
        data: { brief: d.brief, roll: d.roll, icon },
        onEnd: (r) => { fit.stop(); finish(r); },
      });
      // Laid into a new host (the pouch pane redraws round it): fitted to its room again, then the canvas.
      const canvas = game.refresh;
      fit.canvas = canvas;
      game.refresh = () => { fit(); canvas?.(); };
      fit();
      onGame?.(game);
    }, (e) => {
      console.warn('[kailu]', e);
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
