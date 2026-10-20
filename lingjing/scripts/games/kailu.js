// kailu.js — 喂饭桶 · 开炉 (Hanli 2026-10-20): the 饭桶's lottery. Up to three things and 0–3 灵石 into its mouth, the lid
// pressed on a gold puff (压盖), and out spins one thing in its grade's glow — 凡 grey, 有用 blue, 珍品 purple, 逆天 gold.
// The play is Phaser (games/kailu/kailu.min.mjs, built from tools/kailu/, loading the one shared
// scripts/vendor/phaser.min.mjs); the odds are the rules' (rules/fantong.mjs on a save, rules/fantong-roll.mjs bare).
// This module keeps the small-game contract (games/mount.js):
//
//   mount(container, { lang, data, signal, reducedMotion, seed, shell, onEvent }) → Promise<{ won, stars, grade, result } | { left }>
//
// `data` (the page, fantong-kailu.js): { brief: the rules' fantong brief, roll(ids, lingshi, press) → the `fantong feed`
// answer }. Without it (the 游戏厅, the try page) it plays a sample pot on the bare table with no save and no wait —
// `?force=best` (or rare / useful) rolls until that grade, to look at a reveal. 银月's line at the reveal goes to the
// shell's bubble (`shell.say`); the shell's result line reads the grade, its stars the grade's place (0–3).
import { comicArt } from './items-comic.js';

export const meta = {
  id: 'kailu',
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
const SAMPLE = ['chaihuo', 'kuye', 'shizi', 'huangjing', 'fuling', 'lingzhi', 'yaodan-1', 'chai-ya', 'lang-pi', 'yaodan-2', 'yaodan-3', 'tie-sha', 'cishi', 'xionghuang'];
async function sample(lang, seed, force) {
  const [t, items, { roll, kindOf, tierOfItem, GRADES }] = await Promise.all([
    fetch(new URL('fantong.json', WORLD)).then((r) => r.json()), fetch(new URL('items.json', WORLD)).then((r) => r.json()), import('../rules/fantong-roll.mjs'),
  ]);
  const byId = new Map(items.items.map((i) => [i.id, i]));
  const pick = (o) => o?.[lang] ?? o?.zh ?? null;
  const words = t.words?.[lang] ?? t.words?.zh ?? {};
  const brief = {
    ready: true, max_in: t.max_in ?? 3, tints: Object.fromEntries(Object.entries(t.kinds).filter(([k]) => k !== '_about').map(([k, v]) => [k, v.tint])),
    grades: words.grades ?? {}, quips: words.quips ?? {}, lingshi: { max: t.lingshi?.max ?? 3, have: 9 },
    inputs: SAMPLE.filter((id) => byId.has(id)).map((id) => ({ id, name: pick(byId.get(id).name) ?? id, art: byId.get(id).art, kind: kindOf(t, id), tier: tierOfItem(t, id), n: 9 })),
  };
  let n = 0, dry = 0;
  const brief1 = (id, grade) => (id === 'lingshi' ? { id, name: words.lingshi ?? '灵石', grade, wealth: true }
    : { id, name: pick(byId.get(id)?.name) ?? id, hint: pick(byId.get(id)?.hint), art: byId.get(id)?.art ?? null, grade });
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

export function mount(container, { lang = 'zh', data = null, signal, reducedMotion = false, seed, shell, onEvent } = {}) {
  const doc = container.ownerDocument;
  const box = doc.createElement('div');
  box.className = 'kailu-stage';
  // 2:3, as tall as the window lets it (the pouch dialog on a phone, a column on a desk).
  box.style.cssText = 'position:relative;overflow:hidden;border-radius:12px;background:#2a1a12;touch-action:none;margin:0 auto;'
    + 'user-select:none;-webkit-user-select:none;aspect-ratio:2/3;width:min(100%, calc((100dvh - var(--game-reserve, 170px)) * 2 / 3))';
  container.replaceChildren(box);
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const dev = q.get('dev') === '1', showFps = dev && q.get('fps') === '1';
  const force = ['useful', 'rare', 'best'].includes(q.get('force')) ? q.get('force') : null;
  return new Promise((resolve) => {
    let game = null, done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const leave = () => { game?.destroy(); game = null; finish({ won: false, left: true }); };
    if (signal?.aborted) return leave();
    signal?.addEventListener('abort', leave, { once: true });
    const L = lang === 'en' ? 'en' : 'zh';
    Promise.all([data?.brief ? data : sample(L, seed ?? `kailu|${Date.now()}`, force), import('./kailu/kailu.min.mjs'), loadFont(doc)]).then(([d, { start }]) => {
      if (done) return;
      const icon = (id, art) => iconOf(id, art ?? d.brief.inputs?.find((i) => i.id === id)?.art ?? null);
      game = start({
        parent: box, base: new URL('./kailu/', import.meta.url).href, lang: L, reducedMotion, dev, showFps, shell, onEvent,
        data: { brief: d.brief, roll: d.roll, icon },
        onEnd: (r) => finish(r),
      });
    }, (e) => {
      console.warn('[kailu]', e);
      box.textContent = lang === 'en' ? 'The game did not load.' : '游戏没加载出来。';
      finish({ won: false, left: true });
    });
  });
}
