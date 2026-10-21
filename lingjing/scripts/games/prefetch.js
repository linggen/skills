// prefetch.js — 台词预取 (line prefetch; Hanli 10-20: 「台词预取, 好主意! 就这么做」, doc/game-kit.md § Game and chat).
// Every word a player reads in a small game is 银月's, but a model reply takes seconds — too slow mid-fight. So when a
// level is mounted, the host asks her ONCE for a short line at each of the level's reaction moments (wave_cleared,
// low, win …); the game keeps them and shows each the instant its moment comes. Late, failed or invalid: the level's
// own data lines (`level.moments`) stand for that moment. The game never waits. A moment that teaches how to play
// (`teach` in MEANS, or in the level's own `teach`) is never asked: it always shows the level's own line, word for word.
//
// Pure of the DOM and of the engine: the host hands in `ask(text) → Promise<reply text>` (prefetch-ling.js on the
// story page). Here: the facts of a level, the request she reads, her reply checked line by line, and the `lines`
// the game reads lazily at each moment (`cfg.lines?.[moment]`).

/* What each moment means, for her: one plain line a moment, by kit (`kit.moment`) or by name. Facts, not lines.
   `teach`: a moment that teaches how to play (Hanli 10-21: 「按你的建议来」) — its words must be exact, so it is never
   asked of her and always shows the level's own data line; she writes only the reactions (cleared, low, win …). */
const MEANS = {
  'shouqiang.open': { teach: true, zh: '开打前，玩家先从三门本事（飞剑、火符、雷符）里挑小满的看家一门。', en: 'Before the fight the player picks Xiaoman\'s main attack: flying swords, fire or thunder talismans.' },
  'shouqiang.lane': { teach: true, zh: '头一波兽全走同一畦，提醒玩家守住那一畦。', en: 'The first wave all comes down one bed: tell the player to hold that bed.' },
  'shouqiang.wave_cleared': { zh: '一波兽打退了，玩家接着从三张符里挑一张。', en: 'A wave is beaten; the player now picks 1 of 3 talismans.' },
  'shouqiang.low': { zh: '墙快被兽啃塌了。', en: 'The wall is close to falling.' },
  'shouqiang.boss': { teach: true, zh: '巨兽合窳来了；它一哭嚎，就是打它的时候。', en: 'The giant heyu arrives; when it wails, that is the time to hit it.' },
  'shouqiang.huge': { zh: '一大波兽潮压上来。', en: 'A huge wave comes on.' },
  'shouqiang.twist': { teach: true, zh: '这一关的新兽「{twist}」头一回露面，教玩家怎么对付它。', en: 'This level\'s new beast, {twist}, shows up for the first time: tell the player how to deal with it.' },
  'shouqiang.win': { zh: '守住了，这一关赢了。', en: 'Held: the level is won.' },
  'sadou.start': { zh: '豆子撒下去变成豆兵，开跑。', en: 'The beans land and stand up as soldiers; the run begins.' },
  'sadou.good': { zh: '豆兵穿过一道加人的符门，人变多了。', en: 'The soldiers pass a gate that adds; there are more of them.' },
  'sadou.bad': { zh: '豆兵穿过一道减人的坏门。', en: 'The soldiers pass a gate that takes some away.' },
  'sadou.clash': { zh: '豆兵撞上兽群。', en: 'The soldiers crash into a herd of beasts.' },
  'sadou.low': { zh: '豆兵剩得不多了。', en: 'Few soldiers are left.' },
  'sadou.flip': { teach: true, zh: '前面的符门好坏两面会来回换边，看准了再钻。', en: 'The gates ahead swap their good and bad faces side to side: look before going through.' },
  'sadou.rock': { teach: true, zh: '崖上落石，地上有影子的地方要砸下来，别站在影子里。', en: 'Rocks fall from the cliff where shadows darken the road: stay out of the shadows.' },
  'sadou.lane': { teach: true, zh: '兽群只堵了路的一边，另一边空着：绕过去，或者撞过去拿后面的门。', en: 'The beasts block one side of the road, the other is open: go round, or crash through for the gate behind.' },
  'sadou.boss': { zh: '路尽头，大妖（合窳或蠪侄）挡着。', en: 'At the road\'s end, the great beast (the heyu or the longzhi) blocks the way.' },
  'sadou.slam': { teach: true, zh: '大妖要砸下来了，看清砸哪里，躲开。', en: 'The great beast is about to strike: see where, and dodge.' },
  'sadou.won': { zh: '大妖倒了，这一关赢了。', en: 'The great beast falls: the level is won.' },
  'sadou.lost': { zh: '豆兵打光了，这一关输了。', en: 'The soldiers are all gone: the level is lost.' },
  win: { zh: '这一关赢了。', en: 'The level is won.' },
  won: { zh: '这一关赢了。', en: 'The level is won.' },
  lost: { zh: '这一关输了。', en: 'The level is lost.' },
  low: { zh: '快撑不住了。', en: 'Close to losing.' },
  boss: { zh: '大的来了。', en: 'The big one arrives.' },
};
/* Moments that come again and again in one level: two lines, so a repeat is not the same words. */
const REPEATS = new Set(['wave_cleared', 'good', 'bad', 'clash']);
/* How long one of her lines may be: about 14 字 (a little slack for punctuation), or a short English sentence. */
export const MAX = { zh: 16, en: 60 };
export const TIMEOUT_MS = 30000;

const pick = (o, lang) => (o == null ? '' : typeof o === 'string' ? o : o[lang] ?? o.zh ?? '');
const chars = (s) => [...String(s)].length;

/** The level's moment names (its `moments`, `_about` aside) — none: no call at all. */
export function momentsOf(level) {
  return Object.keys(level?.moments ?? {}).filter((k) => !k.startsWith('_') && Array.isArray(level.moments[k]) && level.moments[k].length);
}

/** What a moment means, by kit first, then by name. */
const meaningOf = (game, m) => MEANS[`${game}.${m}`] ?? MEANS[m];
/** A teaching moment: the level's own line, always — never hers. By kit (MEANS `teach`), or by the level (its
    `teach`: a reaction its own line turns into a how-to there — 药园 · 头一夜's `huge`, 「每一畦都得有剑！」). */
// A level's `teach` is a list of moments here; a 割绳子 level's `teach` is its how-to line ({zh, en}), never a list.
const teachList = (level) => (Array.isArray(level?.teach) ? level.teach : []);
export const teaches = (game, m, level = null) => Boolean(meaningOf(game, m)?.teach) || teachList(level).includes(m);
/** The moments she is asked for: the level's, less the teaching ones — none: no call at all. */
export const askedOf = (level, game = '') => momentsOf(level).filter((m) => !teaches(game, m, level));

/** The beasts a level names, by the kit's beast ids, in the order the kit lists them. */
export function beastsIn(level, kit) {
  const said = JSON.stringify(level ?? {});
  return Object.keys(kit?.beasts ?? {}).filter((id) => !id.startsWith('_') && said.includes(`"${id}"`));
}

/** The facts she gets: the level's title, its scene (the lead's story lines), its beasts by name, and each moment
    she writes (no teaching one) with what it means, how many lines, and the level's own lines as a tone sample. `names`: beast id → {zh, en}. */
export function factsOf({ kit, level, game = '', names = {}, lang = 'zh' }) {
  const L = lang === 'en' ? 'en' : 'zh';
  const name = (id) => pick(names[id], L) || id;
  const twist = level?.twist ? name(level.twist) : '';
  return {
    lang: L,
    title: pick(level?.title, L),
    scene: (level?.lead ?? []).filter((l) => !l.big).map((l) => pick(l, L)).join(L === 'en' ? ' ' : ''),
    beasts: beastsIn(level, kit).map(name),
    moments: askedOf(level, game).map((m) => ({
      name: m,
      means: pick(meaningOf(game, m), L).replace('{twist}', twist) || m,
      n: REPEATS.has(m) || level.moments[m].length > 1 ? 2 : 1,
      sample: level.moments[m].map((l) => pick(l, L)).filter(Boolean),
    })),
  };
}

/** The one request she reads: the facts, then the reply's form — two lines, `LINES {json}` then `SILENT`. The engine
    speaks a guest turn's last paragraph unless it ends SILENT (these lines are for the game, not for now), and the
    chat's reader drops a line that is bare JSON (tool_render.rs), so the JSON rides behind the word LINES. */
export function promptOf(f) {
  const en = f.lang === 'en';
  const list = f.moments.map((m) => (en
    ? `- ${m.name} (${m.n} line${m.n > 1 ? 's' : ''}): ${m.means} The level's own: ${m.sample.map((s) => `"${s}"`).join(' ')}`
    : `- ${m.name}（${m.n}句）：${m.means}关里原本的：${m.sample.map((s) => `「${s}」`).join('')}`)).join('\n');
  const keys = f.moments.map((m) => m.name).join(', ');
  return en
    ? `[Small game · your lines ahead of time] Xiaoman is about to play the level "${f.title}". ${f.scene}${f.beasts.length ? ` Beasts: ${f.beasts.join(', ')}.` : ''}\n`
      + `In play, at each moment below, a line of yours shows over your head at once. Write them now, in English, in your own voice, each at most ${MAX.en} characters, fitting this place and these beasts. "The level's own" lines only show the tone; don't copy them:\n${list}\n`
      + `Reply with exactly two lines. Line 1: the word LINES, a space, then one JSON object on that same line, the keys exactly ${keys}, each value an array of lines, e.g. LINES {"${f.moments[0]?.name ?? 'win'}": ["…"]}. Line 2, no blank line between: SILENT (the lines are for the game; nothing is said aloud now). No tools.`
    : `［小游戏 · 先备台词］小满要打一关「${f.title}」。${f.scene}${f.beasts.length ? `兽：${f.beasts.join('、')}。` : ''}\n`
      + `玩的时候，到了下面每个时刻，你的一句话就立刻冒在你头上。现在先写好，用你自己的口气，每句不超过${MAX.zh}个字，贴这一关的地方和兽。「关里原本的」只是给你看语气，别照抄：\n${list}\n`
      + `只回两行。第一行：先写 LINES，空一格，同一行接一个JSON对象，键就是 ${keys}，值是台词数组，例如 LINES {"${f.moments[0]?.name ?? 'win'}": ["……"]}。第二行（不空行）只写 SILENT（台词是给游戏的，现在不出声）。不用工具。`;
}

/** Her reply → `{moment: [line, …]}`, checked line by line: only the level's moments, each line a non-empty string
    within the cap, in the player's language and free of code; a moment with no good line is left out (its data lines stand). Never throws. */
export function linesOf(reply, moments, lang = 'zh') {
  const en = lang === 'en', cap = MAX[en ? 'en' : 'zh'];
  const inLang = (s) => (/[\u3400-\u9fff]/.test(s) ? !en : en); // the player's language, never the other
  const text = String(reply ?? '').replace(/```(?:json)?/gi, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return {};
  let obj;
  try { obj = JSON.parse(text.slice(a, b + 1)); } catch { return {}; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const m of moments) {
    const raw = Array.isArray(obj[m]) ? obj[m] : typeof obj[m] === 'string' ? [obj[m]] : [];
    const good = raw
      .filter((s) => typeof s === 'string')
      .map((s) => s.trim().replace(/^[「"“'](.*)[」"”']$/s, '$1').trim())
      .filter((s) => s && chars(s) <= cap && inLang(s) && !/[{}<>\n]|SILENT|\[/.test(s))
      .slice(0, 3);
    if (good.length) out[m] = good;
  }
  return out;
}

/** What the game reads at a moment: her lines once they came, else nothing (the game takes its own). A kit that
    reads a pool (守墙关) gets the array; one that reads one line (`shape: 'one'`, 撒豆成兵) gets a line picked each time. */
export function linesView(got, shape = 'pool', rand = Math.random) {
  return new Proxy({}, {
    get(_, k) {
      const pool = typeof k === 'string' ? got[k] : undefined;
      if (!pool?.length) return undefined;
      return shape === 'one' ? pool[Math.floor(rand() * pool.length)] : pool;
    },
    has: (_, k) => Boolean(got[k]?.length),
    ownKeys: () => Object.keys(got),
    getOwnPropertyDescriptor: (_, k) => (got[k]?.length ? { enumerable: true, configurable: true, value: got[k] } : undefined),
  });
}

/**
 * Ask her once for a level's lines. Answers at once `{ lines, done }`: `lines` the game's mount option (filled when
 * her reply lands), `done` a promise of `{ ok, ms, got, why }` for the host's log. `facts` may be a promise (the
 * level is read as the game mounts); facts with no moments ask nothing (`why: 'none'`), and plain ones answer null.
 * `ask(text, { signal })` → her reply text; it may throw or never settle — the timeout ends the wait.
 */
export function prefetchLines({ facts, ask, shape = 'pool', timeoutMs = TIMEOUT_MS, now = () => Date.now(), signal } = {}) {
  if (typeof ask !== 'function') return null;
  if (typeof facts?.then !== 'function' && !facts?.moments?.length) return null;
  const got = {};
  const t0 = now();
  let timer = null;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ why: 'late' }), timeoutMs);
    signal?.addEventListener?.('abort', () => { clearTimeout(timer); resolve({ why: 'left' }); }, { once: true });
  });
  // Her lines go in the moment they land — even past the timeout, they still serve the moments left in the level.
  const asked = Promise.resolve(facts).then((f) => {
    if (!f?.moments?.length) return { why: 'none' };
    const names = f.moments.map((m) => m.name);
    return Promise.resolve(ask(promptOf(f), { signal })).then((reply) => {
      if (!signal?.aborted) Object.assign(got, linesOf(reply, names, f.lang));
      return { reply, of: names.length };
    });
  }).catch((e) => ({ why: `failed: ${e?.message ?? e}` }));
  const done = Promise.race([asked, late]).then(({ reply, why, of }) => {
    clearTimeout(timer);
    const ms = now() - t0;
    if (why) return { ok: false, ms, why, got };
    const n = Object.keys(got).length;
    return { ok: n > 0, ms, got, why: n ? (n < of ? 'partial' : '') : 'invalid', reply };
  });
  return { lines: linesView(got, shape), done };
}

/* The beasts' names (creatures.json), read once. */
let namesP = null;
export const creatureNames = () => (namesP ??= fetch(new URL('../../worlds/jiuding/creatures.json', import.meta.url))
  .then((r) => r.json()).then((d) => Object.fromEntries((d.creatures ?? []).map((c) => [c.id, c.name]))).catch(() => ({})));

/** A game module's level as facts for her: the module reads its level (`levelOf`); null for a game without one. */
export function factsFor(mod, { data = {}, lang = 'zh', names = creatureNames } = {}) {
  if (typeof mod?.levelOf !== 'function') return null;
  return Promise.all([mod.levelOf(data), names()]).then(([{ kit, level }, n]) => factsOf({ kit, level, game: mod.meta?.id ?? '', names: n, lang }));
}
