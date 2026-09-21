// cards.js — the scene's cards. One renderer per kind Ling can Show; each
// draws only from authored content and the rules' Look, never from words the
// model wrote, so a card can't show a number the rules didn't return.

import { boardHtml } from './board.js';
import { worldPath } from './rules.js';
import { WORDS as BATTLE_WORDS, challengeHtml } from './battle-card.js';
import { layoutRoads } from './roadmap.js';
import { frameOf, inside, within } from './atlas.js';

export const WORDS = {
  zh: {
    title: '灵境', xw: '修为', ls: '灵石', tray: '今日功课', trayEmpty: '今日无事，随处走走。',
    play: '炼丹', done: '已完成', won: '丹成，待收', offered: '待做', quest: '人间功课',
    paid: '已记', due: '待做', seen: '已完成，待收', boardHint: '成对点选，八味灵草配齐即丹成。', boardDone: '丹成。',
    tamed: '随行', untamed: '未驯', rootTitle: '测灵根', mapTitle: '九州', mapWhole: '九州全图', here: '此处', inBag: '在囊中', buy: '买', sell: '卖', shelf: '货架',
    sayBuy: '买{name}', saySell: '卖{name}', sayGo: '去{name}', sayTask: '说说这功课：{title}', sayGate: '走向下一鼎', sayOmen: '说说今日卦象', sayCreature: '说说{name}', sayItem: '说说{name}', sayUse: '服用{name}', sayFeed: '喂{name}{item}', sayGateAbout: '说说下一鼎', sayTrib: '说说雷劫', sayRoots: '说说我的灵根', sayBoard: '说说炼丹', sayMap: '说说九州',
    about: '说说', feed: '喂它{item}', subdue: '降妖',
    effProgress: '服下：{xw} +{n}', effWear: '可赠银月佩戴', effKey: '路上有用之物', effNone: '可买卖的货物', effRoot: '佩之借{root}', effAtk: '器攻 +{n}', effDef: '防 +{n}', effWard: '抗{root} +{n}', effTemper: '温养本命 +{n}', effCore: '可炼{root}行本命', effCharm: '斗法时掷出，不计防抗', use: '服用', wear: '佩戴', worn: '已佩', sayWear: '佩上{name}', madeFrom: '以{item}写成', artsTitle: '功法', artFrom: '{tier}可用', questBy: '{app} · {t} 完成', questWait: '{app} · {when}待做', periods: { day: '今日', week: '本周', once: '' },
    duelTitle: '降妖', duelHint: '轮番出手：法术相克者倍，物理不问五行，符箓不计防抗，辅助蓄势护体。气血或灵力耗尽者败。', begin: '出手', duelWon: '妖已降服。', duelLost: '败了，它退入雾中。', withdrawn: '它已隐入雾中，明日再来。', wonWait: '已胜，待收。',
    you: '你', hp: '气血', mana: '灵力', power: '战力', youFirst: '你先手', foeFirst: '它先手', barehand: '空手',
    aCast: '法术', aStrike: '物理', aCharm: '符箓', aAssist: '辅助', aFocus: '聚势', aGuard: '护体', arts: '功法',
    fStrike: '击', fCast: '法', stGather: '蓄势', stGuard: '护体', stArmor: '甲',
    lean: { hide: '厚皮', ward: '避法', quick: '迅捷', fierce: '凶猛' },
    treasureTitle: '本命法宝', treasureDoes: '器攻 {atk} · {root}法术 +{n}', treasureTop: '已至九重，再养无益。',
    temper: '温养', nourish: '温养一番', nourishedToday: '今日已养',
    refine: '炼化本命', sayRefine: '我要炼化本命法宝', sayTreasure: '说说{name}',
    refineHint: '结丹之后，可将随身法器与一味天材地宝炼作本命。',
    uncast: '今日未卜', uncastHint: '心中默念一事，三钱六掷。', cast: '起一卦', sayCast: '请银月起一卦', throwing: '起卦中……', castAsk: '所问何事？', changedTo: '之卦',
    effEven: '今日无增无减', effProgress: '{xw} ×{n}', effWealth: '{ls} ×{n}', effRest: '每步之间静坐 {s} 秒',
    effSpell: '{root}法术 {n}', fortuneMark: '卦',
    fateTitle: '命格', fateLine: '属{zodiac} · 日主{stem}{element} · 天生亲近{element}', fateHint: '可选填。生辰只在本机推算命格：不入存档，不入对话。',
    fateSet: '定命格', fateRandom: '随机', fateSkip: '不必了', fateBad: '这一天不在历中，再看看。', fateMark: '命', fated: '命格相合',
    why: { 'no-qi': '灵力不足', 'art-used': '一战一用', 'art-needs-tier': '境界未到', 'art-no-sword': '手中无剑', 'charm-used': '一战一符', 'no-charm': '囊中无符', 'fight-over': '已分胜负', 'not-your-root': '非你灵根', 'already-guard': '已然护体', 'already-focus': '已然聚势' },
    questTitle: '月下之约', questSteps: { bell: '先寻一只银月铃。', water: '带铃到有水照月处。', ring: '此处水面有月——摇铃。', riddle: '她在等你答。' },
    questAt: '坊市在{name}', questWater: '最近的水在{name}', ringBell: '摇一摇铃', sayRing: '摇一摇铃', sayQuest: '说说月下之约',
    gateTitle: '下一鼎', opens: '开启于', gateNeed: '入{to}，须{step} · {xw} {n}', tribTitle: '雷劫', omen: '今日卦象', yinyue: '银月',
    loading: '正在展开……', offline: '灵境还没醒来。',
    qi: '丹田', qiFull: '充盈', qiHalf: '半满', qiLow: '将尽', qiEmpty: '已空',
    emptyLine: '丹田已空，先去调息。灵气回满于 {t}。', emptySoon: '丹田已空，先去调息。灵气随时辰回满。',
    boardsStay: '炼丹不耗灵气。',
    signTitle: '入境先报名', signBody: '灵境记着你的修行，换台机器也接得上。', signBtn: '登录 linggen.dev',
    signWait: '等浏览器登录……', signFail: '还没登上。再试一次。',
    building: '灵境绘制中', buildingLine: '还有 {n} 幅画未成，画完即可游历。',
    goalTitle: '眼下要做的', sayGoal: '说说眼下要做的', book: '手上的事', take: '接 下', turnIn: '交 差', sayTake: '接下{title}', sayTurn: '交差：{title}', sayQuestAbout: '说说{title}', needAt: '在{name}', needHere: '就在此处',
    needKinds: { subdue: '降', tame: '驯', carry: '带', visit: '到', board: '成', answer: '答', chore: '做' }, goalWait: '{title} · {opens} 开', goalOpen: '{title} · 未开', goalGate: '鼎气要{step} · {progress} 修为才受得住', goalNow: '如今 {step} · {progress}/{of}', goalGrow: '差事、功课、奇遇，都长修为',
  },
  en: {
    title: 'Lingjing', xw: 'Cultivation', ls: 'Spirit stones', tray: "Today's practice", trayEmpty: 'Nothing waits today. Wander a while.',
    play: 'Make the pill', done: 'Done', won: 'Pill made — to collect', offered: 'To do', quest: 'Real-life practice',
    paid: 'Counted', due: 'To do', seen: 'Done — to collect', boardHint: 'Tap pairs. When all eight herbs are paired, the pill is made.', boardDone: 'The pill is made.',
    tamed: 'Travels with you', untamed: 'Untamed', rootTitle: 'The root test', mapTitle: 'The Nine Provinces', mapWhole: 'All nine provinces', here: 'You', inBag: 'In your bag', buy: 'Buy', sell: 'Sell', shelf: 'The shelf',
    questTitle: 'The promise under the moon', questSteps: { bell: 'Find a silver-moon bell.', water: 'Carry it to water that holds a moon.', ring: 'There is a moon on this water — ring it.', riddle: 'She is waiting for your answer.' },
    questAt: 'A market at {name}', questWater: 'The nearest water is {name}', ringBell: 'Ring the bell', sayRing: 'Ring the bell', sayQuest: 'Tell me about the promise under the moon',
    gateNeed: 'To {to}: {step} · {n} {xw}', sayBuy: 'Buy {name}', saySell: 'Sell {name}', sayGo: 'Go to {name}', sayTask: 'Tell me about: {title}', sayGate: 'On to the next cauldron', sayOmen: "Tell me about today's omen", sayCreature: 'Tell me about {name}', sayItem: 'Tell me about {name}', sayUse: 'Use {name}', sayFeed: 'Feed {name} the {item}', sayGateAbout: 'Tell me about the next cauldron', sayTrib: 'Tell me about the tribulation', sayRoots: 'Tell me about my spirit roots', sayBoard: 'Tell me about alchemy', sayMap: 'Tell me about the Nine Provinces',
    about: 'About', feed: 'Feed it {item}', subdue: 'Subdue',
    effProgress: 'Taken: {xw} +{n}', effWear: 'Yinyue can wear it', effKey: 'The road will want it', effNone: 'Goods to trade', effRoot: 'Worn, it lends {root}', effAtk: 'Attack +{n}', effDef: 'Guard +{n}', effWard: 'Wards {root} +{n}', effTemper: 'Tempers your treasure +{n}', effCore: 'Binds a treasure of {root}', effCharm: 'Cast in a bout: the round is won', use: 'Use', wear: 'Wear', worn: 'worn', sayWear: 'Wear {name}', madeFrom: 'Written on {item}', artsTitle: 'Arts', artFrom: 'from {tier}', questBy: '{app} · done {t}', questWait: '{app} · not yet {when}', periods: { day: 'today', week: 'this week', once: '' },
    duelTitle: 'Subdue', duelHint: 'Turn by turn: a 法术 doubles into what it overcomes, a strike asks no element, a 符 ignores armour, 辅助 gathers or guards. 气血 or 灵力 out and you lose.', begin: 'Begin', duelWon: 'Subdued.', duelLost: 'Lost — it withdraws into the mist.', withdrawn: 'It has withdrawn into the mist; come back tomorrow.', wonWait: 'Won — to collect.',
    you: 'You', hp: 'Life', mana: 'Force', power: 'Might', youFirst: 'you move first', foeFirst: 'it moves first', barehand: 'bare-handed',
    aCast: 'Spell', aStrike: 'Strike', aCharm: 'Talisman', aAssist: 'Ready', aFocus: 'Gather', aGuard: 'Guard', arts: 'Arts',
    fStrike: 'strikes', fCast: ' spell', stGather: 'gathering', stGuard: 'guarded', stArmor: 'armoured',
    lean: { hide: 'thick-hided', ward: 'warded', quick: 'quick', fierce: 'fierce' },
    treasureTitle: 'Bound treasure', treasureDoes: 'Strikes for {atk} · {root} spells +{n}', treasureTop: 'At its ninth. Nothing more will grow.',
    temper: 'Tempering', nourish: 'Tend it', nourishedToday: 'tended today',
    refine: 'Bind a treasure', sayRefine: 'I want to bind my treasure', sayTreasure: 'Tell me about {name}',
    refineHint: 'Past the Core, a carried weapon and one material of the five can be bound into a treasure of your own.',
    uncast: 'Not yet cast today', uncastHint: 'Hold one question in mind: three coins, six throws.', cast: 'Cast the coins', sayCast: 'Yinyue, cast the coins for me', throwing: 'Casting…', castAsk: 'What do you ask about?', changedTo: 'Changing to',
    effEven: 'No gain, no loss today', effProgress: '{xw} ×{n}', effWealth: '{ls} ×{n}', effRest: '{s}s of stillness between steps',
    effSpell: '{root} spells {n}', fortuneMark: 'cast',
    fateTitle: 'Birth sign', fateLine: 'Year of the {zodiac} · day master {stem} ({element}) · at home in {element}', fateHint: 'Optional. Your birthday is read on this Mac only — never saved, never sent to the chat.',
    fateSet: 'Set my birth sign', fateRandom: 'Random', fateSkip: 'Not now', fateBad: 'That day is not in the calendar — look again.', fateMark: 'sign', fated: 'your sign agrees',
    why: { 'no-qi': 'not enough 灵力', 'art-used': 'once a fight', 'art-needs-tier': 'realm too low', 'art-no-sword': 'no weapon in hand', 'charm-used': 'one a fight', 'no-charm': 'none in the bag', 'fight-over': 'decided', 'not-your-root': 'not your root', 'already-guard': 'already guarding', 'already-focus': 'already gathered' },
    gateTitle: 'The next cauldron', opens: 'Opens', tribTitle: 'The heavenly tribulation', omen: "Today's omen", yinyue: 'Yinyue',
    loading: 'Unfolding…', offline: 'Lingjing has not woken yet.',
    qi: 'Dantian', qiFull: 'full', qiHalf: 'half', qiLow: 'low', qiEmpty: 'empty',
    emptyLine: 'Your dantian is empty — go and rest. Qi returns at {t}.', emptySoon: 'Your dantian is empty — go and rest. Qi returns with the hours.',
    boardsStay: 'Alchemy costs no qi.',
    signTitle: 'Sign in to enter', signBody: 'Lingjing keeps your game with your account — pick it up on any machine.', signBtn: 'Sign in to linggen.dev',
    signWait: 'Waiting for the browser…', signFail: 'Not signed in yet. Try again.',
    building: 'Painting the world', buildingLine: '{n} to paint — the world opens when the last is done.',
    goalTitle: 'What waits', sayGoal: 'Tell me what waits', book: 'In hand', take: 'Take it', turnIn: 'Hand it in', sayTake: 'Take {title}', sayTurn: 'Hand in {title}', sayQuestAbout: 'Tell me about {title}', needAt: 'at {name}', needHere: 'right here',
    needKinds: { subdue: 'subdue', tame: 'tame', carry: 'carry', visit: 'reach', board: 'finish', answer: 'answer', chore: 'do' }, goalWait: '{title} · opens {opens}', goalOpen: '{title} · not open yet', goalGate: 'The cauldron asks {step} · {progress} cultivation', goalNow: 'Now {step} · {progress}/{of}', goalGrow: 'Errands, practice and encounters all raise it',
  },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh : '');

const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];

/// A tap on the stage is a word to Ling — the player's own line in the chat,
/// never a change the page makes itself. `data-say` carries the line.
export const say = (tpl, fill) => tpl.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const sayAttr = (line) => `data-say="${esc(line)}"`;
/// The card's own buttons: every card on the stage has at least one — a
/// word to Ling about what it is (his rule, 2026-09-16). `disabled` carries
/// a reason as its title.
const acts = (items) => `<div class="acts">${items.filter(Boolean).map((a) =>
  `<button class="act say" ${sayAttr(a.say)}${a.disabled ? ` disabled title="${esc(a.disabled)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>`;

/// Her last line in a reply: `**银月：**…` / `**Yinyue:** …`, plain.
export function yinyueLine(text) {
  const names = [WORDS.zh.yinyue, WORDS.en.yinyue].join('|');
  const said = [...String(text ?? '').matchAll(new RegExp(`\\*{0,2}(?:${names})\\s*[：:]\\s*\\*{0,2}\\s*(.+)`, 'g'))];
  const line = said.at(-1)?.[1]?.replace(/[*_`]/g, '').trim();
  return line || null;
}

/// A Chinese name with its pinyin over each character (夔 → kuí), so a rare
/// 山海经 name can be read aloud. Without one syllable a character, the
/// name alone.
export function spoken(name, pinyin) {
  const chars = [...String(name ?? '')];
  const syllables = String(pinyin ?? '').trim().split(/\s+/).filter(Boolean);
  if (!syllables.length || syllables.length !== chars.length) return esc(name);
  return `<ruby class="py">${chars.map((ch, i) => `${esc(ch)}<rt>${esc(syllables[i])}</rt>`).join('')}</ruby>`;
}

function creature(card, ctx) {
  const c = ctx.content.creatures.find((x) => x.id === card.id);
  if (!c) return '';
  const tamed = (ctx.look.cast || []).some((b) => b.id === c.id);
  const art = c.art
    ? `<img class="illus" src="${esc(worldPath(c.dir ?? ctx.look.world.dir, c.art))}" alt="${esc(pick(c.name, ctx.lang))}">`
    : `<div class="illus unpainted">${esc(pick(c.look, ctx.lang))}</div>`;
  const name = pick(c.name, ctx.lang);
  const title = ctx.lang === 'zh' ? spoken(name, c.pinyin) : esc(name);
  const e = ctx.look.place?.encounter;
  const here = e && e.creature.id === c.id ? e : null;
  const feed = here && !here.tamed && here.likes
    ? { label: say(ctx.words.feed, { item: here.likes.name }), say: say(ctx.words.sayFeed, { name, item: here.likes.name }), disabled: here.likes.held ? '' : here.likes.name }
    : null;
  return `<div class="card creature${tamed ? ' tamed' : ''}">
    ${art}
    ${c.art && c.art_caption ? `<div class="artcap">${esc(pick(c.art_caption, ctx.lang))}</div>` : ''}
    <div class="crow"><div class="seal">${esc(c.name.zh)}</div><div>
      <div class="cardtitle">${title}</div>
      <div class="src">${esc(pick(c.source, ctx.lang))}</div>
      <q>${esc(pick(c.quote, ctx.lang))}</q>
      <span class="chip">${ctx.words[tamed ? 'tamed' : 'untamed']}</span>
    </div></div>${acts([{ label: ctx.words.about, say: say(ctx.words.sayCreature, { name }) }, feed])}</div>`;
}

function traits(card, ctx) {
  const lit = new Set(ctx.look.traits?.ids || []);
  const els = ELEMENTS.map((id) => {
    const e = ctx.content.traits.elements[id];
    const small = ctx.lang === 'en' ? `<small>${esc(e.en)}</small>` : '';
    return `<div class="root ${id}${lit.has(id) ? ' lit' : ''}"><b>${esc(e.zh)}</b>${small}</div>`;
  });
  const result = ctx.look.traits ? `<div class="rootres">${esc(ctx.look.traits.name)}</div>` : '';
  // The arts learned, each with what it does; greyed until its realm.
  const arts = (ctx.look.arts || []).map((a) => `<div class="artrow${a.ready ? '' : ' dim'}"><b>${esc(a.name)}</b> <span class="small">${esc(a.about)}</span>${a.ready ? '' : ` <span class="chip">${esc(say(ctx.words.artFrom, { tier: a.tier.name }))}</span>`}</div>`);
  const artsHtml = arts.length ? `<div class="cardtitle arts">${esc(ctx.look.words?.arts ?? ctx.words.artsTitle)}</div>${arts.join('')}` : '';
  return `<div class="card"><div class="cardtitle">${ctx.words.rootTitle}</div><div class="roots">${els.join('')}</div>${result}${fateHtml(ctx)}${artsHtml}${acts([{ label: ctx.words.about, say: ctx.words.sayRoots }])}</div>`;
}

/// 命格 beside the roots: what it is once set; before, the birthday typed
/// here — read by the page on this machine, never said in the chat — or a
/// random one, or none; a declined one can still be set.
function fateHtml(ctx) {
  const w = ctx.words, f = ctx.look.fate;
  if (!ctx.look.traits) return '';
  if (f?.zodiac) {
    return `<div class="fate"><span class="chip">${w.fateTitle}</span> ${esc(say(w.fateLine, { zodiac: f.zodiac.name, stem: f.stem.name, element: f.element.name }))}</div>`;
  }
  if (f?.declined && !ctx.fateOpen) return `<div class="fate"><button class="act" data-fate-open>${w.fateSet}</button></div>`;
  const today = (ctx.now ?? new Date()).toISOString().slice(0, 10);
  return `<div class="fate form"><div class="cardtitle arts">${w.fateTitle}</div><div class="small dim">${w.fateHint}</div>
    <div class="fateform"><input type="date" id="fate-birth" min="1900-01-31" max="${today}" value="${esc(ctx.fateDraft ?? '')}">
    <button class="act" data-fate="birth">${w.fateSet}</button><button class="act" data-fate="random">${w.fateRandom}</button><button class="act" data-fate="decline">${w.fateSkip}</button></div>
    ${ctx.fateError ? `<div class="small seal">${w.fateBad}</div>` : ''}</div>`;
}

function map(card, ctx) {
  if (ctx.look.world?.made) return roadMap(ctx);
  if (ctx.look.world?.atlas) return atlasMap(ctx);
  return `<div class="card"><div class="cardtitle">${ctx.words.mapTitle}</div>${placesHtml(ctx)}${acts([{ label: ctx.words.about, say: ctx.words.sayMap }])}</div>`;
}

/// The world map: the 禹贡 plate with the game's own names over it. Up close
/// on the player's province by default, its places as points — no lines, a
/// road is not straight (his rule, 2026-09-17) — or all nine provinces at a
/// tap. Where a point stands is the place's authored `map`; here, a road
/// away and beyond the tier are Look's.
function atlasMap(ctx) {
  const { atlas, dir } = ctx.look.world;
  const place = ctx.look.place;
  const own = place?.province?.id;
  const points = (place?.places ?? []).filter((p) => p.map);
  const view = ctx.mapView ?? 'province';
  const whole = view === 'world' || !points.length;
  // Another province up close: its places from the atlas verb, all alike —
  // the player is not there, so none is here or a road away.
  const other = !whole && view !== 'province' && view !== own ? ctx.atlas?.[view] : null;
  const shown = other ? other.places : points;
  const frame = whole ? { x: 0, y: 0, w: 1, h: 1 } : frameOf(shown.map((p) => p.map), atlas.aspect);
  const pos = (at) => { const { left, top } = within(frame, at); return `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%`; };
  const img = `<img src="${esc(worldPath(dir, atlas.file))}" alt="" style="width:${(100 / frame.w).toFixed(2)}%;left:${(-frame.x / frame.w * 100).toFixed(2)}%;top:${(-frame.y / frame.h * 100).toFixed(2)}%">`;
  const provinceName = (id) => (ctx.lang === 'en' ? ctx.content.dictionary.provinces[id]?.en ?? id : id);
  const hasPlaces = (id) => id === own || ctx.atlas?.[id]?.places?.length > 0;
  const provinces = Object.entries(atlas.provinces)
    .filter(([, at]) => inside(frame, at))
    .map(([id, at]) => {
      const cls = `pv${id === own ? ' here' : ''}`;
      // On the whole map a province with places opens up close.
      return whole && hasPlaces(id)
        ? `<button class="${cls}" data-mapview="${id === own ? 'province' : esc(id)}" style="${pos(at)}">${esc(provinceName(id))}</button>`
        : `<span class="${cls}" style="${pos(at)}">${esc(provinceName(id))}</span>`;
    });
  const dots = (whole ? points.filter((p) => p.here) : shown).map((p) => {
    // The whole map marks where the player is with the dot alone: a name
    // there would sit on the province's own.
    if (whole) return `<span class="pt here" style="${pos(p.map)}"><i></i></span>`;
    const kind = other ? '' : p.here ? 'here' : p.road ? 'road' : '';
    const cls = `pt${kind ? ` ${kind}` : ''}${p.too_hard ? ' far' : ''}${within(frame, p.map).left > 78 ? ' flip' : ''}`;
    const label = `<i></i><span>${esc(p.name)}</span>`;
    return p.here && !other
      ? `<span class="${cls}" style="${pos(p.map)}">${label}</span>`
      : `<button class="${cls}" ${sayAttr(say(ctx.words.sayGo, { name: p.name }))} style="${pos(p.map)}">${label}</button>`;
  });
  const title = whole ? ctx.words.mapTitle : other ? other.name : place.province.name;
  const toWhole = `<button class="act" data-mapview="world">${esc(ctx.words.mapWhole)}</button>`;
  const toOwn = points.length ? `<button class="act" data-mapview="province">${esc(place.province.name)}</button>` : '';
  const views = whole ? toOwn : other ? toWhole + toOwn : toWhole;
  return `<div class="card"><div class="cardtitle">${esc(title)}</div>
    <div class="atlas${whole ? ' whole' : ''}" style="aspect-ratio:${(frame.w * atlas.aspect).toFixed(4)} / ${frame.h.toFixed(4)}">${img}${provinces.join('')}${dots.join('')}</div>
    <div class="acts">${views}<button class="act say" ${sayAttr(ctx.words.sayMap)}>${esc(ctx.words.about)}</button></div></div>`;
}

/// The province's places as chips, for a world with no map: here, a road
/// away, or beyond the player's tier — from Look, never decided here.
function placesHtml(ctx) {
  const place = ctx.look.place;
  if (!place?.places?.length) return '';
  const chips = place.places.map((p) => {
    const kind = p.here ? 'here' : p.road ? (p.too_hard ? 'far' : 'road') : p.too_hard ? 'far' : '';
    if (p.here) return `<span class="pl here">${esc(p.name)}</span>`;
    return `<button class="pl${kind ? ` ${kind}` : ''}" ${sayAttr(say(ctx.words.sayGo, { name: p.name }))}>${esc(p.name)}</button>`;
  });
  return `<div class="placesTitle">${esc(place.province.name)}</div><div class="places">${chips.join('')}</div>`;
}

/// A made world is one province: its places joined by their roads, here and
/// the roads out marked as the chips mark them. Positions come from the roads
/// in Look; a road from here is drawn in Ling's colour, one beyond the
/// player's tier dashed. A painted map lies under the names, each place where
/// the picture was painted for it; a place added since stands where the roads
/// put it now.
function roadMap(ctx) {
  const place = ctx.look.place;
  if (!place?.places?.length) return '';
  const layout = layoutRoads(place.places, place.province.start);
  const { roads, rows, widest } = layout;
  const painted = ctx.look.world.map;
  const at = { ...layout.at };
  for (const [id, [x, y]] of Object.entries(painted?.at ?? {})) if (at[id]) at[id] = { ...at[id], x, y };
  const byId = new Map(place.places.map((p) => [p.id, p]));
  const lines = roads.map(([a, b]) => {
    const [p, q] = [at[a], at[b]];
    const from = byId.get(a).here ? byId.get(b) : byId.get(b).here ? byId.get(a) : null;
    const kind = from ? (from.too_hard ? 'far' : 'out') : byId.get(a).too_hard || byId.get(b).too_hard ? 'far' : '';
    // Two places in one row that are not side by side bow below the row, so
    // the road never runs behind the place between them.
    const d = p.row === q.row && Math.abs(p.col - q.col) > 1
      ? `M${p.x * 100} ${p.y * 100} Q${((p.x + q.x) / 2) * 100} ${(p.y + 0.9 / rows) * 100} ${q.x * 100} ${q.y * 100}`
      : `M${p.x * 100} ${p.y * 100} L${q.x * 100} ${q.y * 100}`;
    return `<path class="${kind}" d="${d}"/>`;
  });
  const chips = place.places.map((p) => {
    const kind = p.here ? 'here' : p.road ? (p.too_hard ? 'far' : 'road') : p.too_hard ? 'far' : '';
    const tag = p.here ? `<small>${ctx.words.here}</small>` : '';
    const style = `style="left:${at[p.id].x * 100}%;top:${at[p.id].y * 100}%;max-width:${Math.floor(92 / widest)}%"`;
    if (p.here) return `<span class="pl here" ${style}>${esc(p.name)}${tag}</span>`;
    return `<button class="pl${kind ? ` ${kind}` : ''}" ${sayAttr(say(ctx.words.sayGo, { name: p.name }))} ${style}>${esc(p.name)}</button>`;
  });
  const frame = painted
    ? `class="roadmap painted" style="background-image:url('${esc(worldPath(ctx.look.world.dir, painted.file))}')"`
    : `class="roadmap" style="height:${rows * 62}px"`;
  return `<div class="card"><div class="cardtitle">${esc(place.province.name)}</div>
    <div ${frame}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>${chips.join('')}</div>${acts([{ label: ctx.words.about, say: ctx.words.sayMap }])}</div>`;
}

function hexagram(card, ctx) {
  const w = ctx.words;
  if (card.id != null) {
    const h = ctx.content.hexagrams.find((x) => String(x.id) === String(card.id));
    if (!h) return '';
    const bars = [...h.lines].reverse().map((y) => `<i class="${y ? 'yang' : 'yin'}"></i>`).join('');
    return `<div class="card hex"><div class="hexbars">${bars}</div><div>
      <div class="cardtitle">${esc(pick(h.name, ctx.lang))}</div>
      <div class="hextext">${esc(pick(h.image, ctx.lang))}</div>${acts([{ label: w.about, say: say(w.sayItem, { name: pick(h.name, ctx.lang) }) }])}</div></div>`;
  }
  const d = ctx.look.divination;
  // Tapped: the coins are in the air until the cast lands — nothing to tap twice.
  if (!d && ctx.casting) {
    return `<div class="card hex uncast throwing"><div class="coins">${'<i></i>'.repeat(3)}</div><div>
      <div class="cardtitle">${w.throwing}</div><div class="hextext">${w.uncastHint}</div></div></div>`;
  }
  // Before the day's cast: the coins wait, and the button is a word to Ling.
  if (!d) {
    return `<div class="card hex uncast"><div class="coins">${'<i></i>'.repeat(3)}</div><div>
      <div class="cardtitle">${w.uncast}</div><div class="hextext">${w.uncastHint}</div>${acts([{ label: w.cast, say: w.sayCast }])}</div></div>`;
  }
  return castHtml(d, ctx);
}

/// The cast as it fell: six lines top down, each with its three coins (a
/// face that counts 3 is filled), the moving ones marked; drawn once in
/// order from the bottom when it is new.
function castHtml(d, ctx) {
  const w = ctx.words;
  const rows = [5, 4, 3, 2, 1, 0].map((i) => {
    const v = d.values[i], moving = d.moving.includes(i);
    const coins = d.throws[i].map((c) => `<b class="${c === 3 ? 'face' : ''}"></b>`).join('');
    const delay = ctx.castFresh ? ` style="animation-delay:${(i * 0.45).toFixed(2)}s"` : '';
    return `<div class="yao ${v % 2 ? 'yang' : 'yin'}${moving ? ' moving' : ''}"${delay}><span class="coins3">${coins}</span><i></i><em>${moving ? (v === 9 ? '○' : '×') : ''}</em></div>`;
  }).join('');
  const e = d.effect ?? {};
  const lines = [];
  if (e.progress) lines.push(say(w.effProgress, { xw: w.xw, n: e.progress }));
  if (e.wealth) lines.push(say(w.effWealth, { ls: w.ls, n: e.wealth }));
  if (e.rest_seconds) lines.push(say(w.effRest, { s: e.rest_seconds }));
  if (e.spell) lines.push(say(w.effSpell, { root: e.root?.name ?? '', n: e.spell > 0 ? `+${e.spell}` : e.spell }));
  const effect = lines.length ? lines.join(' · ') : w.effEven;
  const changed = d.changed ? `<div class="small dim">${w.changedTo} · ${esc(d.changed.name)}</div>` : '';
  return `<div class="card hex cast${ctx.castFresh ? ' casting' : ''} ${esc(d.grade.id)}"><div class="yaos">${rows}</div><div>
    <div class="cardtitle">${w.omen} · ${esc(d.hexagram.name)} · <span class="grade">${esc(d.grade.name)}</span>${d.fated ? ` <span class="chip">${w.fated}</span>` : ''}</div>
    <div class="hextext">${esc(d.hexagram.judgment)}</div>
    <div class="small dim">${esc(d.hexagram.image)}</div>${changed}
    <div class="small castfx"><span class="chip">${esc(d.ask.name)}</span> ${esc(effect)}</div>
    ${acts([{ label: w.about, say: w.sayOmen }])}</div></div>`;
}

/// The next cauldron: a word to Ling when the road is open; with a date,
/// the road waits and the card only says when.
function gate(card, ctx) {
  const opens = card.opens ? `<div class="small ling">${ctx.words.opens} ${esc(card.opens)}</div>` : '';
  // A cauldron here the player cannot take yet: what its breath asks.
  const bt = (ctx.look.scene?.exits ?? []).find((e) => e.breakthrough && !e.breakthrough.ready)?.breakthrough;
  const need = bt?.need ? `<div class="small dim">${esc(say(ctx.words.gateNeed, { to: bt.need.to, step: bt.need.step, xw: ctx.words.xw, n: bt.need.progress }))}</div>` : '';
  // The road on is a word only when it is open and no scene runs here.
  const go = card.opens || ctx.look.scene ? null : { label: ctx.words.sayGate, say: ctx.words.sayGate };
  return `<div class="card gate"><div class="ding">鼎</div><div><div class="cardtitle">${ctx.words.gateTitle}</div>${opens}${need}${acts([{ label: ctx.words.about, say: ctx.words.sayGateAbout }, go])}</div></div>`;
}

function tribulation(card, ctx) {
  const bolts = [1, 2, 3].map((k) => `<i class="${k <= (card.strikes || 0) ? 'hit' : ''}"></i>`).join('');
  return `<div class="card trib"><div class="cardtitle">${ctx.words.tribTitle}</div><div class="bolts">${bolts}</div>${acts([{ label: ctx.words.about, say: ctx.words.sayTrib }])}</div>`;
}

/// A board for a task already won or done is a made pill, never a fresh deal.
function board(card, ctx) {
  const task = (ctx.look.tasks || []).find((t) => t.id === card.id);
  const made = task && (task.status === 'done' || task.won);
  const body = made ? `<div class="dim small">${ctx.words.boardDone}</div>` : boardHtml(ctx.boardFor(card.id), ctx.words);
  return `<div class="card"><div class="cardtitle">${ctx.words.play}</div>${body}${acts([{ label: ctx.words.about, say: ctx.words.sayBoard }])}</div>`;
}

/// What an item does, in one line — a pill's dose, arms' numbers, a 符.
const DOES = {
  progress: (e, w) => say(w.effProgress, { xw: w.xw, n: e.progress }),
  wear: (e, w) => w.effWear,
  atk: (e, w) => [say(w.effAtk, { n: e.atk }), e.root_name ? say(w.effRoot, { root: e.root_name }) : ''].filter(Boolean).join(' · '),
  def: (e, w) => say(w.effDef, { n: e.def }),
  ward: (e, w) => (e.wards ?? []).map((x) => say(w.effWard, { root: x.name, n: x.n })).join(' · '),
  temper: (e, w) => [say(w.effTemper, { n: e.temper }), e.core_name ? say(w.effCore, { root: e.core_name }) : ''].filter(Boolean).join(' · '),
  charm: (e, w) => w.effCharm,
  key: (e, w) => w.effKey,
};
function itemDoes(effect, ctx) {
  const e = effect ?? {}, w = ctx.words;
  const key = Object.keys(DOES).find((k) => e[k] != null);
  return key ? DOES[key](e, w) : w.effNone;
}

/// One item, or a shelf of them — words, prices and what is held come from
/// Look's place.shelf or bag; the page prices nothing.
function item(card, ctx) {
  const ids = card.ids ?? [card.id];
  const known = new Map((ctx.look.place?.shelf || []).map((i) => [i.id, i]));
  const world = ctx.content.dir ?? ctx.look.world.dir;
  const cells = ids.map((id) => {
    const i = known.get(id) ?? { id, name: id, kind: '', buy: null, sell: null, held: (ctx.look.bag || []).find((b) => b.id === id)?.n ?? 0 };
    const held = i.held ? `<span class="chip">${ctx.words.inBag} ×${i.held}</span>` : '';
    // Buy and Sell are words to Ling; Trade decides. Greyed when the stones
    // are short or nothing is held — from Look, never counted here.
    const canBuy = i.buy != null && (ctx.look.wealth ?? 0) >= i.buy;
    const price = i.buy != null
      ? `<div class="price"><button class="act say" ${sayAttr(say(ctx.words.sayBuy, { name: i.name }))}${canBuy ? '' : ' disabled'}>${ctx.words.buy} ${i.buy}</button>
         <button class="act say" ${sayAttr(say(ctx.words.saySell, { name: i.name }))}${i.held ? '' : ' disabled'}>${ctx.words.sell} ${i.sell}</button></div>`
      : '';
    const art = i.art ? `<img class="itemart" src="${esc(worldPath(world, i.art))}" alt="">` : '';
    // What it is and what it does, from the catalog and the rules' effect —
    // a picture and a name are not enough to buy on (his 2026-09-16).
    const about = i.about ? `<div class="small about">${esc(i.about)}</div>` : '';
    const e = i.effect ?? {};
    const does = itemDoes(e, ctx);
    const made = i.made_from ? `<div class="small dim">${esc(say(ctx.words.madeFrom, { item: i.made_from }))}</div>` : '';
    // A pill in the bag is taken by a word, a wear or a weapon put on by one; Trade decides.
    // A `wear` is hers, not his: 银月铃 and 齐纨 go on the one who walks with
    // him, so until she does there is no one to put them on and the button is
    // not drawn (2026-09-18, his "我还没得到银月, 银月铃下有佩戴按钮"). The
    // rules have always refused it — `no-companion` — but a button that only
    // ever earns a refusal is the stage lying about what can be done.
    const forHer = Boolean(e.wear) && !ctx.look?.companion;
    const wearable = !forHer && (e.wear || e.atk || e.def || e.ward);
    const use = e.progress && i.held ? `<button class="act say" ${sayAttr(say(ctx.words.sayUse, { name: i.name }))}>${ctx.words.use}</button>`
      : wearable && i.held && !i.worn ? `<button class="act say" ${sayAttr(say(ctx.words.sayWear, { name: i.name }))}>${ctx.words.wear}</button>` : '';
    const worn = i.worn ? `<span class="chip">${ctx.words.worn}</span>` : '';
    const tell = `<button class="act say" ${sayAttr(say(ctx.words.sayItem, { name: i.name }))}>${ctx.words.about}</button>`;
    return `<div class="item">${art}<div class="itemname">${esc(i.name)}</div>
      <div class="small dim">${esc(ctx.look.words?.[i.kind] ?? i.kind)} · ${esc(does)}</div>${about}${made}${price}${held}${worn}<div class="acts">${tell}${use}</div></div>`;
  });
  const title = ids.length > 1 ? ctx.look.words?.shop ?? ctx.words.shelf : ctx.look.words?.item ?? ctx.words.shelf;
  return `<div class="card"><div class="cardtitle">${esc(title)}</div><div class="shelf">${cells.join('')}</div></div>`;
}

/// 降妖 on the scene: the exit's duel from Look, the bout from the page.
function duel(card, ctx) {
  const e = ctx.look.place?.encounter;
  const exit = (ctx.look.scene?.exits || []).find((x) => x.game?.id === card.id && x.game.kind === 'duel')
    ?? (e && e.game.id === card.id && !e.tamed ? e : null);
  if (!exit) return '';
  return challengeHtml(exit.duel, { ...ctx, words: BATTLE_WORDS[ctx.lang] ?? BATTLE_WORDS.zh, title: ctx.words.subdue ?? '降妖', artBase: ctx.artBase ?? '', say: ctx.duelFor?.(card.id)?.text ?? null });
}

/// 本命法宝 — the treasure bound at 结丹: its name and 重, what it strikes and
/// amplifies, and how far it is from the next. 温养 is a tap, once a day: no
/// model decides it, so the page asks the rules straight.
function treasure(card, ctx) {
  const t = ctx.look.treasure, w = ctx.words;
  if (!t) {
    // Not bound yet — at 结丹 the card says what it would take.
    return ctx.look.can_refine
      ? `<div class="card"><div class="cardtitle">${w.treasureTitle}</div>
         <div class="small dim">${w.refineHint}</div>
         <div class="acts"><button class="act say" ${sayAttr(w.sayRefine)}>${w.refine}</button></div></div>`
      : '';
  }
  const full = t.needs == null;
  const bar = full ? '' : `<div class="fbar qi"><i style="width:${Math.min(100, (t.exp / t.needs) * 100)}%"></i></div>`;
  // At its ninth nothing grows, so nothing is offered: a button the rules
  // would refuse is a button that lies.
  const grow = full ? ''
    : t.nourished === false ? `<button class="act" data-nourish>${w.nourish}</button>`
    : t.nourished === true ? `<span class="chip">${w.nourishedToday}</span>` : '';
  return `<div class="card treasurecard"><div class="cardtitle">${w.treasureTitle}</div>
    <div class="duelhead"><b>${esc(t.name)}</b> <span class="croot">${esc(t.step)}</span>
      <span class="lean">${esc(t.element_name)}</span></div>
    <div class="small dim">${say(w.treasureDoes, { atk: t.atk, root: t.element_name, n: t.level })}</div>
    ${full ? `<div class="small ling">${w.treasureTop}</div>` : `<div class="fpool"><span>${w.temper}</span>${bar}<b>${t.exp}/${t.needs}</b></div>`}
    <div class="acts">${grow}<button class="act say" ${sayAttr(say(ctx.words.sayTreasure, { name: t.name }))}>${w.about}</button></div></div>`;
}

/* ── The stage's own cards ── goal · offer · quest · building · empty.
   They lived in the page until 2026-09-21, called a second way, and the one
   that took its card was called without it: the stage stayed blank wherever a
   差事 was offered, for three days, with 167 tests green. One dispatcher now,
   and tests/stage-cards.test.mjs draws every card the rules can put up. */
const sayBtn = (label, words) => `<button class="act say" ${sayAttr(words)}>${esc(label)}</button>`;
const clockOf = (date, lang) => date.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' });

/// 丹田 empty: when it returns, and that the boards stay.
function empty(card, ctx) {
  const q = ctx.qi, w = ctx.words;
  if (q?.st !== 'empty') return '';
  const line = q.refillAt ? w.emptyLine.replace('{t}', clockOf(new Date(q.refillAt * 1000), ctx.lang)) : w.emptySoon;
  return `<div class="card empty"><div class="cardtitle">${w.qi} · ${w.qiEmpty}</div>
    <div>${esc(line)}</div><div class="small dim">${w.boardsStay}</div></div>`;
}

/// 差事 offered where he stands: the giver's own words, what it pays, and one
/// button. Not tapping is declining — a decline needs no button of its own.
function offer(card, ctx) {
  const o = (ctx.look?.offers ?? []).find((x) => x.id === card.id), w = ctx.words;
  if (!o) return '';
  const pays = [o.grant?.progress ? `${w.xw} +${o.grant.progress}` : '', o.grant?.wealth ? `${w.ls} +${o.grant.wealth}` : ''].filter(Boolean).join(' · ');
  return `<div class="card offer"><div class="cardtitle">${esc(o.title)}</div>
    ${o.who ? `<div class="small dim">${esc(o.who)}</div>` : ''}
    <div class="say">${esc(o.say)}</div>
    ${pays ? `<div class="small dim">${esc(pays)}</div>` : ''}
    <div class="acts">${sayBtn(w.take, say(w.sayTake, { title: o.title }))}${sayBtn(w.about, say(w.sayQuestAbout, { title: o.title }))}</div></div>`;
}

/// Where the story waits, and one tap that walks the road to it. The rules
/// have always known (`waypoint`); until 2026-09-18 nothing on screen said it,
/// and he walked four places asking 「where to go, what should do」. One road
/// at a time, because that is how the world is walked. A cauldron that waits
/// on cultivation says what it asks and where he stands, and offers no road.
function goal(card, ctx) {
  const g = ctx.look?.waypoint, w = ctx.words;
  if (!g) return ctx.look?.book?.length ? `<div class="card goal"><div class="cardtitle">${esc(w.goalTitle)}</div>${bookHtml(ctx)}</div>` : '';
  const where = g.place ? `${g.place.name}${g.province ? ` · ${g.province}` : ''}` : g.province ?? '';
  // A chapter that has not opened yet says so instead of offering a road.
  const shut = g.chapter ? say(g.opens ? w.goalWait : w.goalOpen, { title: g.title ?? '', opens: g.opens ? new Date(g.opens).toLocaleDateString(ctx.lang === 'zh' ? 'zh-CN' : 'en') : '' }) : '';
  const go = g.toward ? sayBtn(say(w.sayGo, { name: g.toward.name }), say(w.sayGo, { name: g.toward.name })) : '';
  return `<div class="card goal"><div class="cardtitle">${esc(w.goalTitle)}</div>
    <div>${esc(g.gate ? say(w.goalGate, g.gate) : g.text ?? shut)}</div>
    ${where ? `<div class="small dim">${esc(where)}</div>` : ''}
    ${g.gate ? `<div class="small">${esc(say(w.goalNow, g.gate.now))}</div><div class="small dim">${esc(w.goalGrow)}</div>` : ''}
    <div class="acts">${go}${sayBtn(w.about, w.sayGoal)}</div>
    ${bookHtml(ctx)}</div>`;
}

/// 手上的事 — one line each, with its count and where the next one is met.
/// 交差 the moment it is done, wherever he stands: he never walks back to the
/// giver (his ruling, 2026-09-18).
function bookHtml(ctx) {
  const book = ctx.look?.book ?? [], w = ctx.words;
  if (!book.length) return '';
  const rows = book.map((q) => {
    const counts = q.need.map((n) => `${w.needKinds?.[n.kind] ?? n.kind} ${n.have}/${n.n}`).join(' · ');
    const at = q.chore ? witness(q.chore, ctx) : q.where ? (q.where.here ? w.needHere : say(w.needAt, { name: q.where.name })) : '';
    const act = q.ready ? sayBtn(w.turnIn, say(w.sayTurn, { title: q.title })) : sayBtn(w.about, say(w.sayQuestAbout, { title: q.title }));
    return `<div class="bookrow${q.ready ? ' ready' : ''}"><div><b>${esc(q.title)}</b>
      <span class="small dim">${esc(counts)}${at ? ` · ${esc(at)}` : ''}</span></div>${act}</div>`;
  }).join('');
  return `<div class="book"><div class="small dim">${esc(w.book)}</div>${rows}</div>`;
}

/// A 功课's witness: which app keeps the record, and when it saw it done.
function witness(chore, ctx) {
  // `apple-shifu` reads as Shifu: the last word is the app's name.
  const name = String(chore.app ?? '').split('-').pop(), app = name ? name[0].toUpperCase() + name.slice(1) : '';
  // The hour when it was today; the day when the period is longer than one.
  const at = chore.done_at ? new Date(chore.done_at) : null, loc = ctx.lang === 'zh' ? 'zh-CN' : 'en';
  const t = !at ? '' : at.toDateString() === new Date().toDateString() ? clockOf(at, ctx.lang) : at.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
  return say(chore.done_at ? ctx.words.questBy : ctx.words.questWait, { app, t, when: ctx.words.periods?.[chore.period] ?? '' });
}

/// The search for the one who walks with you: the step the rules name, and
/// the one word that takes it — 摇一摇铃 where water holds a moon.
function quest(card, ctx) {
  const q = ctx.look?.quest, w = ctx.words;
  if (!q) return '';
  // Where to take the step — never when it can be taken right here: the card
  // already carries 买银月铃, and a second line naming another town is the card
  // arguing with the shelf beside it (2026-09-18).
  const where = q.step === 'bell' && q.market && !q.shop_here ? say(w.questAt, { name: q.market.name })
    : q.step === 'water' && q.water && !q.at_water ? say(w.questWater, { name: q.water.name }) : '';
  const acts = [{ label: w.about, say: w.sayQuest }];
  // The step, as a word to Ling: buy it here, walk to where it can be taken, ring it.
  if (q.step === 'ring') acts.unshift({ label: w.ringBell, say: w.sayRing });
  else if (q.step === 'bell' && q.shop_here) acts.unshift({ label: say(w.sayBuy, { name: q.bell.name }), say: say(w.sayBuy, { name: q.bell.name }) });
  else if (q.step === 'bell' && q.market) acts.unshift({ label: q.market.name, say: say(w.sayGo, { name: q.market.name }) });
  else if (q.step === 'water' && q.water) acts.unshift({ label: q.water.name, say: say(w.sayGo, { name: q.water.name }) });
  return `<div class="card quest"><div class="cardtitle">${esc(w.questTitle)}</div>
    <div>${esc(q.line)}</div><div class="small dim">${esc(w.questSteps?.[q.step] ?? '')}${where ? ` · ${esc(where)}` : ''}</div>
    <div class="acts">${acts.map((a) => sayBtn(a.label, a.say)).join('')}</div></div>`;
}

/// A made world still being painted: the story waits for the brush, so the
/// scene says how many pictures are left — from Look, never counted here.
function building(card, ctx) {
  const left = ctx.look?.building?.paint?.length;
  if (!left) return '';
  return `<div class="card building"><div class="cardtitle">${ctx.words.building}</div>
    <div>${esc(ctx.words.buildingLine.replace('{n}', left))}</div></div>`;
}

const RENDER = { creature, traits, map, hexagram, gate, tribulation, board, item, duel, treasure, goal, offer, quest, building, empty };

/// Only the kinds the scene knows; anything else Ling sends is dropped.
export function cardHtml(card, ctx) {
  const draw = RENDER[card?.card];
  return draw ? draw(card, ctx) : '';
}

/// Today's practice: the world's tasks.
export function trayHtml(ctx) {
  const tasks = (ctx.look.tasks || []).map((t) => {
    const state = t.status === 'done' ? 'done' : t.won ? 'won' : 'offered';
    const act = state === 'offered' && t.kind === 'board'
      ? `<button class="act" data-play="${esc(t.id)}">${ctx.words.play}</button>` : '';
    const tell = `<button class="act say" ${sayAttr(say(ctx.words.sayTask, { title: t.title }))}>${ctx.words.about}</button>`;
    return `<div class="card task ${state}"><div class="tasktitle">${esc(t.title)}</div>
      <div class="taskfoot"><span class="chip">${ctx.words[state]}</span>${act}${tell}</div></div>`;
  });
  // The apps' 功课 ride the book on the goal card now (design.md § 差事 ⑥).
  return tasks.join('');
}
