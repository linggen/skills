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
    tamed: '已收服', untamed: '未收服', beatenToday: '今日已降', rootTitle: '测灵根', mapTitle: '九州', mapWhole: '九州全图', here: '此处', inBag: '在囊中', buy: '买', sell: '卖', shelf: '货架',
    sayBuy: '买{name}', go: '去{name}', sayTask: '说说这功课：{title}', sayGate: '走向下一鼎', sayOmen: '说说今日卦象', sayCreature: '说说{name}', sayItem: '说说{name}', sayGateAbout: '说说下一鼎', sayTrib: '说说雷劫', sayRoots: '说说我的灵根', sayBoard: '说说炼丹', sayMap: '说说九州',
    choreOpen: '去 {app} 做', about: '问询', askHint: '想问什么？留空，便请她说说', askHer: '问问{name}', askHerHint: '想对她说什么？留空，便请她说说', askHerEmpty: '说说看？', askSend: '问', drop: '撂 下', paysWord: '酬', nextWord: '其后', feed: '喂它{item}', offer: '献上{item}', feedNone: '囊中没有{item}', tameHint: '降了它，再献上{item}，即可收服', playGame: '开局', lundaoTitle: '论道 · 稷下先生', lundaoOffer: '先生在此，以诗文会友。三句过关，今日一回。', lundaoBegin: '请先生论道', sayLundao: '请先生论道', lundaoKey: '飞花令 · 句中须有「{key}」', lundaoChain: '接「{last}」的末字', lundaoUp: '上联：{up}', lundaoMiss: '失 {n}/{max}', lundaoHow: '在对话里作答。', featRise: '突破', featChapter: '新章', wonOver: '收服', subdue: '降妖',
    effProgress: '服下：{xw} +{n}', effMend: '服下：斗法落下的伤去 {n}%', effLearn1: '习之：斗法时看出妖下回合的架势', effLearn2: '习之：看清妖下回合的每一招与点数', effWear: '可赠银月佩戴', effLift: { atk: '她的牌攻 +{n}', hp: '她的牌气血 +{n}', tend: '她疗伤多回 {pct}%' }, effKey: '路上有用之物', effNone: '可买卖的货物', effRoot: '佩之借{root}', effAtk: '器攻 +{n}', effDef: '防 +{n}', effWard: '抗{root} +{n}', effTemper: '温养本命 +{n}', effCore: '可炼{root}行本命', effCharm: '斗法时掷出，不计防抗', use: '服用', wear: '佩戴', worn: '已佩', madeFrom: '以{item}写成', artsTitle: '功法', artFrom: '{tier}可用', questBy: '{app} · {t} 完成', questWait: '{app} · {when}待做', periods: { day: '今日', week: '本周', once: '' },
    duelTitle: '降妖', duelHint: '轮番出手：法术相克者倍，物理不问五行，符箓不计防抗，辅助蓄势护体。气血或灵力耗尽者败。', begin: '出手', duelWon: '妖已降服。', duelLost: '败了，它退入雾中。', withdrawn: '它已隐入雾中，明日再来。', wonWait: '已胜，待收。',
    you: '你', hp: '气血', mana: '灵力', power: '战力', youFirst: '你先手', foeFirst: '它先手', barehand: '空手',
    aCast: '法术', aStrike: '物理', aCharm: '符箓', aAssist: '辅助', aFocus: '聚势', aGuard: '护体', arts: '功法',
    fStrike: '击', fCast: '法', stGather: '蓄势', stGuard: '护体', stArmor: '甲',
    lean: { hide: '厚皮', ward: '避法', quick: '迅捷', fierce: '凶猛' },
    treasureTitle: '本命法宝', treasureDoes: '器攻 {atk} · {root}法术 +{n}', treasureTop: '已至九重，再养无益。',
    temper: '温养', nourish: '温养一番', nourishedToday: '今日已养',
    refine: '炼化本命', sayTreasure: '说说{name}',
    refineHint: '结丹之后，可将随身法器与一味天材地宝炼作本命。',
    refineWith: '以何物炼之', refineName: '为它取个名字', refineNameHint: '至多十二字', refineNoWeapon: '手中无器可炼：先佩一件兵器。', refineNoMaterial: '囊中没有天材地宝。',
    uncast: '今日未卜', uncastHint: '心中默念一事，请银月三钱六掷。', castAsks: { cultivation: '问修行', bout: '问斗法', wealth: '问财运' }, cast: '起一卦', sayCast: '请银月起一卦', throwing: '起卦中……', castAsk: '所问何事？', changedTo: '之卦',
    effEven: '今日无增无减', effProgress: '{xw} ×{n}', effWealth: '{ls} ×{n}', effRest: '每步之间静坐 {s} 秒',
    effSpell: '{root}法术 {n}', fortuneMark: '卦',
    fateTitle: '命格', fateLine: '属{zodiac} · 日主{stem}{element} · 天生亲近{element}', fateHint: '可选填。生辰只在本机推算命格：不入存档，不入对话。',
    fateSet: '定命格', fateRandom: '随机', fateSkip: '不必了', fateBad: '这一天不在历中，再看看。', fateMark: '命', fated: '命格相合',
    why: { 'no-qi': '灵力不足', 'art-used': '一战一用', 'art-needs-tier': '境界未到', 'art-no-sword': '手中无剑', 'charm-used': '一战一符', 'no-charm': '囊中无符', 'fight-over': '已分胜负', 'not-your-root': '非你灵根', 'already-guard': '已然护体', 'already-focus': '已然聚势' },
    questTitle: '月下之约', questSteps: { bell: '先寻一只银月铃。', water: '带铃到有水照月处。', ring: '此处水面有月——摇铃。', riddle: '她在等你答。' },
    questAt: '坊市在{name}', questWater: '最近的水在{name}', ringBell: '摇一摇铃', sayRing: '摇一摇铃', sayQuest: '说说月下之约',
    gateTitle: '下一鼎', opens: '开启于', gateNeed: '入{to}，须{step} · {xw} {n}', tribTitle: '雷劫', omen: '今日卦象', yinyue: '银月',
    loading: '正在展开……', offline: '灵境还没醒来。',
    hp: '气血', hurt: '带伤', bond: '羁绊', bondNext: '{n}/{next} 至{name}', tend: '让银月看看', elite: '精英', mendsAt: '{t} 养好',
    qi: '体力', qiFull: '充盈', qiHalf: '半满', qiLow: '将尽', qiEmpty: '已空',
    emptyLine: '体力耗尽了。回到现实里歇一歇——起身走走，喝口水。{t} 可以再出发。', emptySoon: '体力耗尽了。回到现实里歇一歇——起身走走，喝口水。随时辰恢复。',
    boardsStay: '炼丹不耗灵气。',
    signTitle: '入境先报名', signBody: '灵境记着你的修行，换台机器也接得上。', signBtn: '登录 linggen.dev',
    signWait: '等浏览器登录……', signFail: '还没登上。再试一次。',
    building: '灵境绘制中', buildingLine: '还有 {n} 幅画未成，画完即可游历。',
    notDone: '这一下没成，稍后再点。', fightRefused: '这一战没记上，牌还在原处。',
    needVia: '先去{name}', veilLine: '前路起了雾……', refused: { 'already-taken': '已经接下了', 'already-done': '这件已经了结', 'not-posted': '今日的榜文已换', 'not-here': '不在这里', 'not-done': '还没办完', 'not-in-bag': '囊中没有', 'not-for-sale-here': '这里不卖', 'no-companion': '还没有人可以佩戴它', 'in-a-fight': '斗法未完', 'won-already': '已经赢过了', 'subdued-today': '今日已降', 'riddle-closed': '谜题已过', 'unknown-place': '找不到这个地方', 'wrong-answer': '答得不对', 'not-this-step': '这一步已经过了', busy: '稍等片刻' }, goalTitle: '眼下要做的', goalWork: '可做：{name} · {what}', goalBeast: '可做：{name}的{what}今日还未降', offersTitle: '可接的差事 · {place}', gearChip: '装备', gearTitle: '装备', bagTitle: '背包', gearEmpty: '—', bagNone: '背包是空的', gearSlots: { weapon: '法器', robe: '法衣', pendant: '佩', treasure: '本命法宝' }, gearHer: '{name}佩着', gearFight: '斗法里：{what}', saveConflicts: '云端存档已覆盖此处；这里的改动另存了一份。', gearPower: '主灵根一击 +{n}', gearArmor: '护体 {n}', gearWard: '抗{el} {n}', gearCharm: '{name}在手', gearLends: '借{el}', gearTo: '戴上 · {slot}', gearOff: '卸下', cardsTitle: '牌 · {n}', cardsNote: '亮的是出战的十张，点一张换上或取下；银月开局就在手上。', cardsPicked: '十张都是你选的。', cardsShort: '你选了 {mine} 张，还差 {short} 张，出战时按灵根补齐（虚线）。', cardsAuto: '恢复自动', cardsHand: '在手', cardsOff: '灵根不合，修不得这门功法', bookChip: '事', roads: '或往', workAt: '{name}有差事', journey: '历练', journeyHours: '{h} 时', journeyOut: '在{place} · 还剩 {t}', journeyRecall: '叫回', journeyDone: '今日已出过门', journeyBack: '自{place}回来了', journeyBackLine: '她从{place}回来，带了些东西。', journeyBackTitle: '{name}回来了', journeyAway: '出行中', chanceTitle: '机缘 · {place}', chanceChip: '有机缘', chanceLeft: '还剩 {t}', chanceHM: '{h} 时 {m} 分', chanceM: '{m} 分', chanceHere: '就在此处', chanceLine: '此地灵机正盛，过时不候。', chanceTake: '收 下', trialTitle: '抉择', trialWon: '成了', trialLost: '失手', trialChance: '{n}% 把握', trialHard: { easy: '易', fair: '中', hard: '难' }, trialStake: { wound: '失手伤身', coin: '失手破财' }, trialHurt: '气血 −{n}', trialPoorer: '灵石 −{n}', findTitle: '拾遗', findTake: '收下 · {what}', findPass: '不取', bookReady: '可交 {n}', bookNone: '手上无事', book: '手上的事', take: '接 下', took: '已接下', queueCount: '眼前 {n} 件', queueNext: '下一件：{what}', queueKinds: { handed: '所得', quest: '剧情', veil: '雾中', find: '拾遗', trial: '抉择', chance: '机缘', journey: '历练归来', offer: '差事', duel: '斗法', tale: '传闻', lundao: '论道', board: '功课' }, turnIn: '交 差', sayQuestAbout: '说说{title}', needAt: '在{name}', needHere: '就在此处',
    taleKept: '已解开 · 体力回来便记上', taleDuel: '降了{name}，此事便了', taleWhere: '{game} · {who}', taleRiddle: '点选作答', handedTitle: '交差 · {title}', handedNext: '接下来 · {title}', handedWait: '下一步 · {title} — 手上已满，了一件再去{at}接', needKinds: { subdue: '降', tame: '驯', carry: '带', visit: '到', board: '成', answer: '答', chore: '做' }, goalWait: '{title} · {opens} 开', goalOpen: '{title} · 未开', goalGate: '鼎气要{step} · {progress} 修为才受得住', goalNow: '如今 {step} · {progress}/{of}', goalGrow: '差事、功课、传闻，都长修为',
  },
  en: {
    title: 'Lingjing', xw: 'Cultivation', ls: 'Spirit stones', tray: "Today's practice", trayEmpty: 'Nothing waits today. Wander a while.',
    play: 'Make the pill', done: 'Done', won: 'Pill made — to collect', offered: 'To do', quest: 'Real-life practice',
    paid: 'Counted', due: 'To do', seen: 'Done — to collect', boardHint: 'Tap pairs. When all eight herbs are paired, the pill is made.', boardDone: 'The pill is made.',
    tamed: 'Won over', untamed: 'Not won over', beatenToday: 'Beaten today', rootTitle: 'The root test', mapTitle: 'The Nine Provinces', mapWhole: 'All nine provinces', here: 'You', inBag: 'In your bag', buy: 'Buy', sell: 'Sell', shelf: 'The shelf',
    questTitle: 'The promise under the moon', questSteps: { bell: 'Find a silver-moon bell.', water: 'Carry it to water that holds a moon.', ring: 'There is a moon on this water — ring it.', riddle: 'She is waiting for your answer.' },
    questAt: 'A market at {name}', questWater: 'The nearest water is {name}', ringBell: 'Ring the bell', sayRing: 'Ring the bell', sayQuest: 'Tell me about the promise under the moon',
    gateNeed: 'To {to}: {step} · {n} {xw}', sayBuy: 'Buy {name}', go: 'Go to {name}', sayTask: 'Tell me about: {title}', sayGate: 'On to the next cauldron', sayOmen: "Tell me about today's omen", sayCreature: 'Tell me about {name}', sayItem: 'Tell me about {name}', sayGateAbout: 'Tell me about the next cauldron', sayTrib: 'Tell me about the tribulation', sayRoots: 'Tell me about my spirit roots', sayBoard: 'Tell me about alchemy', sayMap: 'Tell me about the Nine Provinces',
    choreOpen: 'Do it in {app}', about: 'Ask', askHint: 'What do you want to know? Leave it empty and she simply tells', askHer: 'Ask {name}', askHerHint: 'What would you like to say to her? Leave it empty and she simply talks', askHerEmpty: 'Tell me something?', askSend: 'Ask', drop: 'Put it down', paysWord: 'Pays', nextWord: 'Then', feed: 'Feed it {item}', offer: 'Offer the {item}', feedNone: 'No {item} in the bag', tameHint: 'Beat it, then offer the {item}, and it is yours', playGame: 'Play', lundaoTitle: 'Debate · The Jixia scholar', lundaoOffer: 'The scholar meets friends with verse. Three good answers, once a day.', lundaoBegin: 'Ask the scholar to debate', sayLundao: 'Ask the scholar to debate', lundaoKey: 'A line with “{key}” in it', lundaoChain: 'A word starting with the last letter of “{last}”', lundaoUp: 'Upper line: {up}', lundaoMiss: 'missed {n}/{max}', lundaoHow: 'Answer in the chat.', featRise: 'Breakthrough', featChapter: 'A new chapter', wonOver: 'Won over', subdue: 'Subdue',
    effProgress: 'Taken: {xw} +{n}', effMend: 'Taken: {n}% of what the fights took, back', effLearn1: 'Learned: see the shape of the beast\'s next turn', effLearn2: 'Learned: see every move of its next turn, with numbers', effWear: 'Yinyue can wear it', effLift: { atk: 'her card +{n} attack', hp: 'her card +{n} Life', tend: 'her tending mends {pct}% more' }, effKey: 'The road will want it', effNone: 'Goods to trade', effRoot: 'Worn, it lends {root}', effAtk: 'Attack +{n}', effDef: 'Guard +{n}', effWard: 'Wards {root} +{n}', effTemper: 'Tempers your treasure +{n}', effCore: 'Binds a treasure of {root}', effCharm: 'Cast in a bout: the round is won', use: 'Use', wear: 'Wear', worn: 'worn', madeFrom: 'Written on {item}', artsTitle: 'Arts', artFrom: 'from {tier}', questBy: '{app} · done {t}', questWait: '{app} · not yet {when}', periods: { day: 'today', week: 'this week', once: '' },
    duelTitle: 'Subdue', duelHint: 'Turn by turn: a 法术 doubles into what it overcomes, a strike asks no element, a 符 ignores armour, 辅助 gathers or guards. 气血 or 灵力 out and you lose.', begin: 'Begin', duelWon: 'Subdued.', duelLost: 'Lost — it withdraws into the mist.', withdrawn: 'It has withdrawn into the mist; come back tomorrow.', wonWait: 'Won — to collect.',
    you: 'You', hp: 'Life', mana: 'Force', power: 'Might', youFirst: 'you move first', foeFirst: 'it moves first', barehand: 'bare-handed',
    aCast: 'Spell', aStrike: 'Strike', aCharm: 'Talisman', aAssist: 'Ready', aFocus: 'Gather', aGuard: 'Guard', arts: 'Arts',
    fStrike: 'strikes', fCast: ' spell', stGather: 'gathering', stGuard: 'guarded', stArmor: 'armoured',
    lean: { hide: 'thick-hided', ward: 'warded', quick: 'quick', fierce: 'fierce' },
    treasureTitle: 'Bound treasure', treasureDoes: 'Strikes for {atk} · {root} spells +{n}', treasureTop: 'At its ninth. Nothing more will grow.',
    temper: 'Tempering', nourish: 'Tend it', nourishedToday: 'tended today',
    refine: 'Bind a treasure', sayTreasure: 'Tell me about {name}',
    refineHint: 'Past the Core, a carried weapon and one material of the five can be bound into a treasure of your own.',
    refineWith: 'Bind it with', refineName: 'Name it', refineNameHint: 'up to 12 characters', refineNoWeapon: 'Nothing in hand to bind: wear a weapon first.', refineNoMaterial: 'No material of the five in the bag.',
    uncast: 'Not yet cast today', uncastHint: 'Hold one question in mind; Yinyue throws three coins, six times.', castAsks: { cultivation: 'Ask about cultivation', bout: 'Ask about bouts', wealth: 'Ask about fortune' }, cast: 'Cast the coins', sayCast: 'Yinyue, cast the coins for me', throwing: 'Casting…', castAsk: 'What do you ask about?', changedTo: 'Changing to',
    effEven: 'No gain, no loss today', effProgress: '{xw} ×{n}', effWealth: '{ls} ×{n}', effRest: '{s}s of stillness between steps',
    effSpell: '{root} spells {n}', fortuneMark: 'cast',
    fateTitle: 'Birth sign', fateLine: 'Year of the {zodiac} · day master {stem} ({element}) · at home in {element}', fateHint: 'Optional. Your birthday is read on this Mac only — never saved, never sent to the chat.',
    fateSet: 'Set my birth sign', fateRandom: 'Random', fateSkip: 'Not now', fateBad: 'That day is not in the calendar — look again.', fateMark: 'sign', fated: 'your sign agrees',
    why: { 'no-qi': 'not enough 灵力', 'art-used': 'once a fight', 'art-needs-tier': 'realm too low', 'art-no-sword': 'no weapon in hand', 'charm-used': 'one a fight', 'no-charm': 'none in the bag', 'fight-over': 'decided', 'not-your-root': 'not your root', 'already-guard': 'already guarding', 'already-focus': 'already gathered' },
    gateTitle: 'The next cauldron', opens: 'Opens', tribTitle: 'The heavenly tribulation', omen: "Today's omen", yinyue: 'Yinyue',
    loading: 'Unfolding…', offline: 'Lingjing has not woken yet.',
    hp: 'Life', hurt: 'hurt', bond: 'Bond', bondNext: '{n}/{next} to {name}', tend: 'Let Yinyue look', elite: 'Elite', mendsAt: 'mended by {t}',
    qi: 'Stamina', qiFull: 'full', qiHalf: 'half', qiLow: 'low', qiEmpty: 'empty',
    emptyLine: 'Your stamina is spent. Step back into the real world for a while — stand up, walk, drink some water. Ready to go again at {t}.', emptySoon: 'Your stamina is spent. Step back into the real world for a while — stand up, walk, drink some water. It comes back with the hours.',
    boardsStay: 'Alchemy costs no qi.',
    signTitle: 'Sign in to enter', signBody: 'Lingjing keeps your game with your account — pick it up on any machine.', signBtn: 'Sign in to linggen.dev',
    signWait: 'Waiting for the browser…', signFail: 'Not signed in yet. Try again.',
    building: 'Painting the world', buildingLine: '{n} to paint — the world opens when the last is done.',
    notDone: 'That did not go through — tap again in a moment.', fightRefused: 'This fight was not recorded; its card is still here.',
    needVia: 'by way of {name}', veilLine: 'Mist on the road ahead…', refused: { 'already-taken': 'Already taken', 'already-done': 'Already done', 'not-posted': "Today's notice has changed", 'not-here': 'Not here', 'not-done': 'Not done yet', 'not-in-bag': 'Not in the bag', 'not-for-sale-here': 'Not sold here', 'no-companion': 'No one to wear it yet', 'in-a-fight': 'A fight is still open', 'won-already': 'Already won', 'subdued-today': 'Beaten today', 'riddle-closed': 'The riddle has passed', 'unknown-place': 'No such place', 'wrong-answer': 'Not that one', 'not-this-step': 'That step has passed', busy: 'One moment' }, goalTitle: 'What waits', goalWork: 'To do: {name} · {what}', goalBeast: 'To do: {what} at {name}, not yet met today', offersTitle: 'Errands to take · {place}', gearChip: 'Gear', gearTitle: 'Worn', bagTitle: 'Bag', gearEmpty: '—', bagNone: 'The bag is empty', gearSlots: { weapon: 'Weapon', robe: 'Robe', pendant: 'Pendant', treasure: 'Treasure' }, gearHer: '{name} wears', gearFight: 'In a fight: {what}', saveConflicts: 'The cloud save replaced this one; changes made here were kept as a copy.', gearPower: 'Root Strike +{n}', gearArmor: 'Shield {n}', gearWard: 'wards {el} {n}', gearCharm: '{name} in hand', gearLends: 'lends {el}', gearTo: 'Wear · {slot}', gearOff: 'Take off', cardsTitle: 'Cards · {n}', cardsNote: 'Lit: the ten you fight with — tap one to put it in or take it out; Yinyue starts in hand.', cardsPicked: 'All ten are yours.', cardsShort: '{mine} picked; {short} more are filled by your roots when you fight (dashed).', cardsAuto: 'Let the roots choose', cardsHand: 'in hand', cardsOff: 'a spell of a root you lack', bookChip: 'Tasks', roads: 'Or on to', workAt: 'Work to be had at {name}', journey: 'Journey', journeyHours: '{h}h', journeyOut: 'at {place} · {t} left', journeyRecall: 'Call her back', journeyDone: 'She has been out today', journeyBack: 'back from {place}', journeyBackLine: 'Back from {place}, with something for you.', journeyBackTitle: '{name} is back', journeyAway: 'away', chanceTitle: 'A chance · {place}', chanceChip: 'a chance', chanceLeft: '{t} left', chanceHM: '{h}h {m}m', chanceM: '{m}m', chanceHere: 'right here', chanceLine: 'Something is stirring here — it will not wait.', chanceTake: 'Take it', trialTitle: 'A choice', trialWon: 'done', trialLost: 'it went wrong', trialChance: '{n}% likely', trialHard: { easy: 'easy', fair: 'fair', hard: 'hard' }, trialStake: { wound: 'failing hurts', coin: 'failing costs coin' }, trialHurt: 'Life −{n}', trialPoorer: 'Stones −{n}', findTitle: 'By the road', findTake: 'Take it · {what}', findPass: 'Leave it', bookReady: '{n} to hand in', bookNone: 'Nothing in hand', book: 'In hand', take: 'Take it', took: 'Taken', queueCount: '{n} things here', queueNext: 'Next: {what}', queueKinds: { handed: 'Spoils', quest: 'The story', veil: 'In the mist', find: 'By the road', trial: 'A choice', chance: 'A chance', journey: 'She is back', offer: 'Errand', duel: 'A fight', tale: 'Rumor', lundao: 'Debate', board: 'Practice' }, turnIn: 'Hand it in', sayQuestAbout: 'Tell me about {title}', needAt: 'at {name}', needHere: 'right here',
    taleKept: 'Solved · counted once your stamina is back', taleDuel: 'Subdue {name} and it is done', taleWhere: '{game} · {who}', taleRiddle: 'Tap an answer', handedTitle: 'Handed in · {title}', handedNext: 'Next · {title}', handedWait: 'Next · {title} — your hands are full; finish one, then take it at {at}', needKinds: { subdue: 'subdue', tame: 'tame', carry: 'carry', visit: 'reach', board: 'finish', answer: 'answer', chore: 'do' }, goalWait: '{title} · opens {opens}', goalOpen: '{title} · not open yet', goalGate: 'The cauldron asks {step} · {progress} cultivation', goalNow: 'Now {step} · {progress}/{of}', goalGrow: 'Errands, practice and rumors all raise it',
  },
};

export { esc } from './esc.js';
import { esc } from './esc.js';
const pick = (pair, lang) => (pair ? pair[lang] ?? pair.zh : '');

const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];

/// A tap on the stage is a word to Ling — the player's own line in the chat,
/// never a change the page makes itself. `data-say` carries the line.
export const say = (tpl, fill) => tpl.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? '');
const sayAttr = (line) => `data-say="${esc(line)}"`;
/// 去X is the page's own walk (his, 2026-09-24): `data-go` carries the
/// place's id and the page calls Move itself — no word to Ling.
const goAttr = (id) => `data-go="${esc(id)}"`;
/// The card's own buttons: every card on the stage has at least one — a
/// word to Ling about what it is (his rule, 2026-09-16). `disabled` carries
/// a reason as its title.
/* 问询 is the one word that costs a model turn. It never speaks at once: it
   opens the ask bar with its line (「说说夫诸」), the player adds a question or
   leaves it empty, and only then is anything sent (his, 2026-09-21: what the
   page knows it shows; the model is for telling). */
const askAttr = (line) => `data-ask="${esc(line)}"`;
const acts = (items) => `<div class="acts">${items.filter(Boolean).map((a) => (a.do ? doBtn(a.label, a.do, a.id) :
  `<button class="act ${a.ask ? 'ask' : 'say'}" ${a.ask ? askAttr(a.say) : sayAttr(a.say)}${a.disabled ? ` disabled title="${esc(a.disabled)}"` : ''}>${esc(a.label)}</button>`)).join('')}</div>`;

/// A tap that only changes the save — 接下 · 交差 · 买 · 卖 · 服用 · 佩戴. The page
/// calls the rules itself and nothing goes to the chat: Ling reads the save on
/// her next Look (his, 2026-09-22: 只有必要的时候, 让agent说话).
const doBtn = (label, action, id, disabled = false) =>
  `<button class="act do" data-do="${esc(action)}" data-id="${esc(id)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

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

/// Beaten in a fight today at its haunt: 降 but not 收 — it withdrew, it did not join.
const beatenToday = (ctx, id) => { const e = ctx.look.place?.encounter; return Boolean(e && e.creature.id === id && e.won); };

function creature(card, ctx) {
  const c = ctx.content.creatures.find((x) => x.id === card.id);
  if (!c) return '';
  const tamed = (ctx.look.cast || []).some((b) => b.id === c.id);
  const art = c.art
    ? `<img class="illus" src="${esc(worldPath(c.dir ?? ctx.look.world.dir, c.art))}" alt="${esc(pick(c.name, ctx.lang))}">`
    : `<div class="illus unpainted">${esc(pick(c.look, ctx.lang))}</div>`;
  const name = pick(c.name, ctx.lang);
  const title = ctx.lang === 'zh' ? spoken(name, c.pinyin) : esc(name);
  return `<div class="card creature${tamed ? ' tamed' : ''}">
    ${art}
    ${c.art && c.art_caption ? `<div class="artcap">${esc(pick(c.art_caption, ctx.lang))}</div>` : ''}
    <div class="crow"><div class="seal">${esc(c.name.zh)}</div><div>
      <div class="cardtitle">${title}</div>
      <div class="src">${esc(pick(c.source, ctx.lang))}</div>
      <q>${esc(pick(c.quote, ctx.lang))}</q>
      <span class="chip">${esc(ctx.words[tamed ? 'tamed' : beatenToday(ctx, c.id) ? 'beatenToday' : 'untamed'])}</span>
    </div></div>${acts([{ label: ctx.words.about, ask: true, say: say(ctx.words.sayCreature, { name }) }])}</div>`;
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
  return `<div class="card"><div class="cardtitle">${esc(ctx.words.rootTitle)}</div><div class="roots">${els.join('')}</div>${result}${fateHtml(ctx)}${artsHtml}${acts([{ label: ctx.words.about, ask: true, say: ctx.words.sayRoots }])}</div>`;
}

/// 命格 beside the roots: what it is once set; before, the birthday typed
/// here — read by the page on this machine, never said in the chat — or a
/// random one, or none; a declined one can still be set.
function fateHtml(ctx) {
  const w = ctx.words, f = ctx.look.fate;
  if (!ctx.look.traits) return '';
  if (f?.zodiac) {
    return `<div class="fate"><span class="chip">${esc(w.fateTitle)}</span> ${esc(say(w.fateLine, { zodiac: f.zodiac.name, stem: f.stem.name, element: f.element.name }))}</div>`;
  }
  if (f?.declined && !ctx.fateOpen) return `<div class="fate"><button class="act" data-fate-open>${esc(w.fateSet)}</button></div>`;
  const today = (ctx.now ?? new Date()).toISOString().slice(0, 10);
  return `<div class="fate form"><div class="cardtitle arts">${esc(w.fateTitle)}</div><div class="small dim">${esc(w.fateHint)}</div>
    <div class="fateform"><input type="date" id="fate-birth" min="1900-01-31" max="${today}" value="${esc(ctx.fateDraft ?? '')}">
    <button class="act" data-fate="birth">${esc(w.fateSet)}</button><button class="act" data-fate="random">${esc(w.fateRandom)}</button><button class="act" data-fate="decline">${esc(w.fateSkip)}</button></div>
    ${ctx.fateError ? `<div class="small seal">${esc(w.fateBad)}</div>` : ''}</div>`;
}

function map(card, ctx) {
  if (ctx.look.world?.made) return roadMap(ctx);
  if (ctx.look.world?.atlas) return atlasMap(ctx);
  return `<div class="card"><div class="cardtitle">${esc(ctx.words.mapTitle)}</div>${placesHtml(ctx)}${acts([{ label: ctx.words.about, ask: true, say: ctx.words.sayMap }])}</div>`;
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
      : `<button class="${cls}" ${goAttr(p.id)} style="${pos(p.map)}">${label}</button>`;
  });
  const title = whole ? ctx.words.mapTitle : other ? other.name : place.province.name;
  const toWhole = `<button class="act" data-mapview="world">${esc(ctx.words.mapWhole)}</button>`;
  const toOwn = points.length ? `<button class="act" data-mapview="province">${esc(place.province.name)}</button>` : '';
  const views = whole ? toOwn : other ? toWhole + toOwn : toWhole;
  return `<div class="card"><div class="cardtitle">${esc(title)}</div>
    <div class="atlas${whole ? ' whole' : ''}" style="aspect-ratio:${(frame.w * atlas.aspect).toFixed(4)} / ${frame.h.toFixed(4)}">${img}${provinces.join('')}${dots.join('')}</div>
    <div class="acts">${views}<button class="act ask" ${askAttr(ctx.words.sayMap)}>${esc(ctx.words.about)}</button></div></div>`;
}

/// The province's places as chips, for a world with no map: here, a road
/// away, or beyond the player's tier — from Look, never decided here.
function placesHtml(ctx) {
  const place = ctx.look.place;
  if (!place?.places?.length) return '';
  const chips = place.places.map((p) => {
    const kind = p.here ? 'here' : p.road ? (p.too_hard ? 'far' : 'road') : p.too_hard ? 'far' : '';
    if (p.here) return `<span class="pl here">${esc(p.name)}</span>`;
    return `<button class="pl${kind ? ` ${kind}` : ''}" ${goAttr(p.id)}>${esc(p.name)}</button>`;
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
    const tag = p.here ? `<small>${esc(ctx.words.here)}</small>` : '';
    const style = `style="left:${at[p.id].x * 100}%;top:${at[p.id].y * 100}%;max-width:${Math.floor(92 / widest)}%"`;
    if (p.here) return `<span class="pl here" ${style}>${esc(p.name)}${tag}</span>`;
    return `<button class="pl${kind ? ` ${kind}` : ''}" ${goAttr(p.id)} ${style}>${esc(p.name)}</button>`;
  });
  const frame = painted
    ? `class="roadmap painted" style="background-image:url('${esc(worldPath(ctx.look.world.dir, painted.file))}')"`
    : `class="roadmap" style="height:${rows * 62}px"`;
  return `<div class="card"><div class="cardtitle">${esc(place.province.name)}</div>
    <div ${frame}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>${chips.join('')}</div>${acts([{ label: ctx.words.about, ask: true, say: ctx.words.sayMap }])}</div>`;
}

function hexagram(card, ctx) {
  const w = ctx.words;
  if (card.id != null) {
    const h = ctx.content.hexagrams.find((x) => String(x.id) === String(card.id));
    if (!h) return '';
    const bars = [...h.lines].reverse().map((y) => `<i class="${y ? 'yang' : 'yin'}"></i>`).join('');
    return `<div class="card hex"><div class="hexbars">${bars}</div><div>
      <div class="cardtitle">${esc(pick(h.name, ctx.lang))}</div>
      <div class="hextext">${esc(pick(h.image, ctx.lang))}</div>${acts([{ label: w.about, ask: true, say: say(w.sayItem, { name: pick(h.name, ctx.lang) }) }])}</div></div>`;
  }
  const d = ctx.look.divination;
  // Tapped: the coins are in the air until the cast lands — nothing to tap twice.
  if (!d && ctx.casting) {
    return `<div class="card hex uncast throwing"><div class="coins">${'<i></i>'.repeat(3)}</div><div>
      <div class="cardtitle">${esc(w.throwing)}</div><div class="hextext">${esc(w.uncastHint)}</div></div></div>`;
  }
  // Before the day's cast: the coins wait, and what is asked is a tap — the
  // page casts with the rules and 银月 reads it (his, 2026-09-23: 既然是请
  // 银月, 需要银月给结果). No word to Ling, no waiting on her turn.
  if (!d) {
    const asks = Object.entries(w.castAsks).map(([id, label]) => `<button class="act" data-divine="${id}">${esc(label)}</button>`).join('');
    return `<div class="card hex uncast"><div class="coins">${'<i></i>'.repeat(3)}</div><div>
      <div class="cardtitle">${esc(w.uncast)}</div><div class="hextext">${esc(w.uncastHint)}</div><div class="acts">${asks}</div></div></div>`;
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
  const changed = d.changed ? `<div class="small dim">${esc(w.changedTo)} · ${esc(d.changed.name)}</div>` : '';
  return `<div class="card hex cast${ctx.castFresh ? ' casting' : ''} ${esc(d.grade.id)}"><div class="yaos">${rows}</div><div>
    <div class="cardtitle">${esc(w.omen)} · ${esc(d.hexagram.name)} · <span class="grade">${esc(d.grade.name)}</span>${d.fated ? ` <span class="chip">${esc(w.fated)}</span>` : ''}</div>
    <div class="hextext">${esc(d.hexagram.judgment)}</div>
    <div class="small dim">${esc(d.hexagram.image)}</div>${changed}
    <div class="small castfx"><span class="chip">${esc(d.ask.name)}</span> ${esc(effect)}</div>
    ${acts([{ label: w.about, ask: true, say: w.sayOmen }])}</div></div>`;
}

/// The next cauldron: a word to Ling when the road is open; with a date,
/// the road waits and the card only says when.
function gate(card, ctx) {
  const opens = card.opens ? `<div class="small ling">${esc(ctx.words.opens)} ${esc(card.opens)}</div>` : '';
  // A cauldron here the player cannot take yet: what its breath asks.
  const bt = (ctx.look.scene?.exits ?? []).find((e) => e.breakthrough && !e.breakthrough.ready)?.breakthrough;
  const need = bt?.need ? `<div class="small dim">${esc(say(ctx.words.gateNeed, { to: bt.need.to, step: bt.need.step, xw: ctx.words.xw, n: bt.need.progress }))}</div>` : '';
  // The road on is a word only when it is open and no scene runs here.
  const go = card.opens || ctx.look.scene ? null : { label: ctx.words.sayGate, say: ctx.words.sayGate };
  return `<div class="card gate"><div class="ding">鼎</div><div><div class="cardtitle">${esc(ctx.words.gateTitle)}</div>${opens}${need}${acts([{ label: ctx.words.about, ask: true, say: ctx.words.sayGateAbout }, go])}</div></div>`;
}

function tribulation(card, ctx) {
  const bolts = [1, 2, 3].map((k) => `<i class="${k <= (card.strikes || 0) ? 'hit' : ''}"></i>`).join('');
  return `<div class="card trib"><div class="cardtitle">${esc(ctx.words.tribTitle)}</div><div class="bolts">${bolts}</div>${acts([{ label: ctx.words.about, ask: true, say: ctx.words.sayTrib }])}</div>`;
}

/// A board for a task already won or done is a made pill, never a fresh deal.
function board(card, ctx) {
  const task = (ctx.look.tasks || []).find((t) => t.id === card.id);
  const made = task && (task.status === 'done' || task.won);
  const g = made ? null : ctx.boardFor?.(card.id);
  // A game module (scripts/games/<id>.js) draws itself inside [data-game]; the
  // 炼丹 herbs keep their own board. Loading, the card waits a beat.
  const body = made ? `<div class="dim small">${esc(ctx.words.boardDone)}</div>`
    : g?.mod ? `<div class="small dim">${esc(g.mod.meta.how?.[ctx.lang] ?? g.mod.meta.how?.zh ?? '')}</div><div class="game" data-game="${esc(card.id)}">${g.mod.html(g.state, ctx.lang)}</div>`
      : g ? boardHtml(g, ctx.words) : `<div class="dim small">…</div>`;
  const title = task?.game ? task.title : ctx.words.play;
  const ask = task?.game ? say(ctx.words.sayTask, { title: task.title }) : ctx.words.sayBoard;
  return `<div class="card gamecard"><div class="cardtitle">${esc(title)}</div>${body}${acts([{ label: ctx.words.about, ask: true, say: ask }])}</div>`;
}

/// What an item does, in one line — a pill's dose, arms' numbers, a 符.
/// What a thing she wears does for her card, in one line.
const liftSaid = (e, w) => Object.entries(e?.lift ?? {}).map(([k, n]) => say(w.effLift?.[k] ?? '', { n, pct: Math.round(n * 100) })).join(' · ');

const DOES = {
  progress: (e, w) => say(w.effProgress, { xw: w.xw, n: e.progress }),
  mend: (e, w) => say(w.effMend, { hp: w.hp, n: Math.round(e.mend * 100) }),
  learn: (e, w) => say(e.level >= 2 ? w.effLearn2 : w.effLearn1, {}),
  wear: (e, w) => [w.effWear, liftSaid(e, w)].filter(Boolean).join(' · '),
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
    const held = i.held ? `<span class="chip">${esc(ctx.words.inBag)} ×${i.held}</span>` : '';
    // Buy and Sell are words to Ling; Trade decides. Greyed when the stones
    // are short or nothing is held — from Look, never counted here.
    const canBuy = i.buy != null && (ctx.look.wealth ?? 0) >= i.buy;
    const price = i.buy != null
      ? `<div class="price">${doBtn(`${ctx.words.buy} ${i.buy}`, 'buy', i.id, !canBuy)}
         ${doBtn(`${ctx.words.sell} ${i.sell}`, 'sell', i.id, !i.held)}</div>`
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
    const use = e.progress && i.held ? doBtn(ctx.words.use, 'use', i.id)
      : wearable && i.held && !i.worn ? doBtn(ctx.words.wear, 'use', i.id) : '';
    const worn = i.worn ? `<span class="chip">${esc(ctx.words.worn)}</span>` : '';
    const tell = `<button class="act ask" ${askAttr(say(ctx.words.sayItem, { name: i.name }))}>${esc(ctx.words.about)}</button>`;
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
  // Two ways to win a beast over, side by side (his, 2026-09-23: 喂人参和战斗
  // 都是收服的方式): 出手, or feed it what it likes — the page's own Tame
  // (his, 2026-09-24), and the 收服 seal comes up when the cast grows.
  // 先降后收: the offer stands only once it has been beaten; before, the card says so.
  const here = e && e.game.id === card.id && !e.tamed && e.likes && e.beaten ? e : null;
  const fed = here?.likes.fed !== false; // food is fed; a thing is offered
  // Not beaten yet: the card says the way — beat it, then what it likes.
  const hint = e && e.game.id === card.id && !e.tamed && e.likes && !e.beaten
    ? `<small class="feedhint">${esc(say(ctx.words.tameHint, { item: e.likes.name }))}</small>` : '';
  const feed = hint || (here ? `<button class="bact feed" data-tame="${esc(e.creature.id)}"${here.likes.held ? '' : ` disabled title="${esc(here.likes.name)}"`}>${esc(say(fed ? ctx.words.feed : ctx.words.offer, { item: here.likes.name }))}${here.likes.held ? '' : `<small>${esc(say(ctx.words.feedNone, { item: here.likes.name }))}</small>`}</button>` : '');
  return challengeHtml(exit.duel, { ...ctx, words: BATTLE_WORDS[ctx.lang] ?? BATTLE_WORDS.zh, title: ctx.words.subdue ?? '降妖', artBase: ctx.artBase ?? '', say: ctx.duelFor?.(card.id)?.text ?? null, feed });
}

/// 本命法宝 — the treasure bound at 结丹: its name and 重, what it strikes and
/// amplifies, and how far it is from the next. 温养 is a tap, once a day: no
/// model decides it, so the page asks the rules straight.
function treasure(card, ctx) {
  const t = ctx.look.treasure, w = ctx.words;
  if (!t) {
    // Not bound yet — at 结丹 the card says what it would take, and binds it.
    return ctx.look.can_refine ? refineHtml(ctx) : '';
  }
  const full = t.needs == null;
  const bar = full ? '' : `<div class="fbar qi"><i style="width:${Math.min(100, (t.exp / t.needs) * 100)}%"></i></div>`;
  // At its ninth nothing grows, so nothing is offered: a button the rules
  // would refuse is a button that lies.
  const grow = full ? ''
    : t.nourished === false ? `<button class="act" data-nourish>${esc(w.nourish)}</button>`
    : t.nourished === true ? `<span class="chip">${esc(w.nourishedToday)}</span>` : '';
  return `<div class="card treasurecard"><div class="cardtitle">${esc(w.treasureTitle)}</div>
    <div class="duelhead"><b>${esc(t.name)}</b> <span class="croot">${esc(t.step)}</span>
      <span class="lean">${esc(t.element_name)}</span></div>
    <div class="small dim">${esc(say(w.treasureDoes, { atk: t.atk, root: t.element_name, n: t.level }))}</div>
    ${full ? `<div class="small ling">${esc(w.treasureTop)}</div>` : `<div class="fpool"><span>${esc(w.temper)}</span>${bar}<b>${t.exp}/${t.needs}</b></div>`}
    <div class="acts">${grow}<button class="act ask" ${askAttr(say(ctx.words.sayTreasure, { name: t.name }))}>${esc(w.about)}</button></div></div>`;
}

/// 炼化本命 on the card itself (his, 2026-09-24: no model turn for a tap):
/// the 天材地宝 held, one picked; a name the player types — never one made up
/// for them; and 炼化, which the page sends to Refine. What is held comes from
/// Look's `refine_with`; a refusal is said on the card (`ctx.refineNote`).
function refineHtml(ctx) {
  const w = ctx.words, r = ctx.look.refine_with ?? { weapon: null, materials: [] };
  const pickd = r.materials.some((m) => m.id === ctx.refineMat) ? ctx.refineMat : r.materials[0]?.id ?? null;
  const mats = r.materials.map((m) => `<button class="act${m.id === pickd ? ' on' : ''}" data-refine-mat="${esc(m.id)}" aria-pressed="${m.id === pickd}">${esc(m.name)}${m.n > 1 ? ` ×${m.n}` : ''}</button>`).join('');
  const lack = !r.weapon ? w.refineNoWeapon : !r.materials.length ? w.refineNoMaterial : '';
  const form = lack ? `<div class="small">${esc(lack)}</div>`
    : `<div class="small dim">${esc(w.refineWith)}${r.weapon ? ` · ${esc(r.weapon)}` : ''}</div><div class="acts">${mats}</div>
       <div class="fateform"><input type="text" id="refine-name" maxlength="12" autocomplete="off" placeholder="${esc(w.refineName)} · ${esc(w.refineNameHint)}" value="${esc(ctx.refineName ?? '')}">
       <button class="act" data-refine="${esc(pickd ?? '')}">${esc(w.refine)}</button></div>`;
  return `<div class="card"><div class="cardtitle">${esc(w.treasureTitle)}</div>
    <div class="small dim">${esc(w.refineHint)}</div>${form}${ctx.refineNote ? `<div class="donote">${esc(ctx.refineNote)}</div>` : ''}</div>`;
}

/* ── The stage's own cards ── goal · offer · quest · building · empty.
   They lived in the page until 2026-09-21, called a second way, and the one
   that took its card was called without it: the stage stayed blank wherever a
   差事 was offered, for three days, with 167 tests green. One dispatcher now,
   and tests/stage-cards.test.mjs draws every card the rules can put up. */
const sayBtn = (label, words) => `<button class="act say" ${sayAttr(words)}>${esc(label)}</button>`;
const askBtn = (label, line) => `<button class="act ask" ${askAttr(line)}>${esc(label)}</button>`;
const goBtn = (label, id) => `<button class="act go" ${goAttr(id)}>${esc(label)}</button>`;
export const clockOf = (date, lang) => date.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' });

/// 丹田 empty: when it returns, and that the boards stay.
function empty(card, ctx) {
  const q = ctx.qi, w = ctx.words;
  if (q?.st !== 'empty') return '';
  const line = q.refillAt ? w.emptyLine.replace('{t}', clockOf(new Date(q.refillAt * 1000), ctx.lang)) : w.emptySoon;
  return `<div class="card empty"><div class="cardtitle">${esc(w.qi)} · ${esc(w.qiEmpty)}</div>
    <div>${esc(line)}</div><div class="small dim">${esc(w.boardsStay)}</div></div>`;
}

/// 差事 offered where he stands — ONE card, a row each: the title, who gives
/// it, what it pays, and 接下. A row opens in place to the giver's own words
/// (and 问询); a lone errand stands open. Not tapping is declining.
function offer(card, ctx) {
  const took = ctx.tookOffer, w = ctx.words;
  const posted = ctx.look?.offers ?? [];
  // The one just taken stays a moment, sealed, even after Look has let it go.
  const all = took && !posted.some((o) => o.id === took.id) ? [took, ...posted] : posted;
  if (!all.length) return '';
  const rows = all.map((o) => {
    if (took?.id === o.id) return tookRow(o, w);
    const open = all.length === 1 || ctx.offerRow === o.id;
    // What it pays, as the rules say it (`pays`); an older Look's `grant` else.
    const p = o.pays ?? o.grant ?? {};
    const pays = [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : '', p.stamina ? `${w.qi} +${p.stamina}` : ''].filter(Boolean).join(' · ');
    const head = `<div><b>${esc(o.title)}</b> <span class="small dim">${esc([o.who, pays].filter(Boolean).join(' · '))}</span></div>`;
    const chev = all.length > 1 ? `<span class="chev" aria-hidden="true">${open ? '▾' : '▸'}</span>` : '';
    return `<div class="offerrow${open ? ' open' : ''}"${all.length > 1 ? ` data-offerrow="${esc(o.id)}" role="button" tabindex="0" aria-expanded="${open}"` : ''}>
      ${head}<div class="acts">${chev}${doBtn(w.take, 'take', o.id)}</div></div>
      ${open ? `<div class="offerdetail"><div class="say">${esc(o.say)}</div><div class="acts">${askBtn(w.about, say(w.sayQuestAbout, { title: o.title }))}</div></div>` : ''}`;
  }).join('');
  return `<div class="card offer"><div class="cardtitle">${esc(say(w.offersTitle, { place: ctx.look?.place?.name ?? '' }))}</div>${rows}</div>`;
}

const tookRow = (o, w) => `<div class="offerrow taken"><div><b>${esc(o.title)}</b></div>
  <div class="acts"><span class="tookseal">${esc(w.took)}</span></div></div>`;

/// 论道 — the scholar's word game: before, one word to begin (Ling deals it);
/// under way, the prompt and how far along — answers are typed in the chat.
function lundao(card, ctx) {
  const l = ctx.look?.lundao, w = ctx.words;
  if (!l || l.outcome !== 'open') {
    return `<div class="card lundao"><div class="cardtitle">${esc(w.lundaoTitle)}</div><div class="small dim">${esc(w.lundaoOffer)}</div>
      <div class="acts">${sayBtn(w.lundaoBegin, w.sayLundao)}</div></div>`;
  }
  const dots = Array.from({ length: l.need }, (_, i) => `<i class="${i < l.good ? 'on' : ''}"></i>`).join('');
  const prompt = l.game === 'chengyu' ? say(w.lundaoChain, { last: l.last }) : l.game === 'feihua' ? say(w.lundaoKey, { key: l.prompt }) : say(w.lundaoUp, { up: l.prompt });
  return `<div class="card lundao"><div class="cardtitle">${esc(w.lundaoTitle)} · ${esc(l.name)}</div>
    <div class="lundaoprompt">${esc(prompt)}</div>
    <div class="lundaodots">${dots}<span class="small dim">${esc(say(w.lundaoMiss, { n: l.misses, max: l.max_misses }))}</span></div>
    <div class="small dim">${esc(w.lundaoHow)}</div></div>`;
}

/// 传闻 — today's rumor, its step where he stands: the label (传闻 · title · n/N,
/// the rules' words), the game and who asks it, and the thing itself — a board
/// dealt from the step's own id (never the day's practice), the riddle's
/// choices, the 论道 prompt (answered in the chat), or the beast the duel card
/// beside it fights. Ling tells the story around it; the card holds only facts.
function tale(card, ctx) {
  const t = ctx.look?.tale, st = t?.step, w = ctx.words;
  if (!st || t.ended || t.dropped) return '';
  const head = `<div class="cardtitle">${esc(t.label)}</div><div class="small dim">${esc(say(w.taleWhere, { game: st.game_name, who: st.giver?.name ?? '' }))}</div>`;
  return `<div class="card tale">${head}${taleBody(st, ctx)}${acts([{ label: w.about, ask: true, say: say(w.sayQuestAbout, { title: t.title }) }])}</div>`;
}
const TALE_BODY = {
  riddle: (st, ctx) => `<div class="say">${esc(st.riddle.q)}</div><div class="small dim">${esc(ctx.words.taleRiddle)}</div>
    <div class="acts">${st.riddle.choices.map((c) => `<button class="act" data-tale-answer="${esc(c)}">${esc(c)}</button>`).join('')}</div>`,
  lundao: (st, ctx) => {
    const l = st.lundao, w = ctx.words;
    const prompt = l.form === 'chengyu' ? say(w.lundaoChain, { last: l.last }) : l.form === 'feihua' ? say(w.lundaoKey, { key: l.prompt }) : say(w.lundaoUp, { up: l.prompt });
    const dots = Array.from({ length: l.need }, (_, i) => `<i class="${i < l.good ? 'on' : ''}"></i>`).join('');
    return `<div class="lundaoprompt">${esc(prompt)}</div><div class="lundaodots">${dots}<span class="small dim">${esc(say(w.lundaoMiss, { n: l.misses, max: l.max_misses }))}</span></div><div class="small dim">${esc(w.lundaoHow)}</div>`;
  },
  duel: (st, ctx) => `<div class="small">${esc(say(ctx.words.taleDuel, { name: st.creature?.name ?? '' }))}</div>`,
};
function taleBody(st, ctx) {
  if (TALE_BODY[st.game]) return TALE_BODY[st.game](st, ctx);
  if (st.won) return `<div class="small dim">${esc(ctx.words.taleKept)}</div>`;
  const g = st.board ? ctx.boardFor?.(st.board.id) : null;
  return g?.mod ? `<div class="small dim">${esc(g.mod.meta.how?.[ctx.lang] ?? g.mod.meta.how?.zh ?? '')}</div><div class="game" data-game="${esc(st.board.id)}">${g.mod.html(g.state, ctx.lang)}</div>`
    : g ? boardHtml(g, ctx.words) : `<div class="dim small">…</div>`;
}

/// 所得 — the errands met here, each with what it paid and the next step.
export const HANDED_MS = 2600;
function handed(card, ctx) {
  const all = ctx.look?.handed ?? [], w = ctx.words;
  if (!all.length) return '';
  const rows = all.map((h) => {
    const p = h.paid ?? {};
    const pays = [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : '', h.gives ?? ''].filter(Boolean);
    const next = h.next ? `<div class="small">${esc(say(h.next.took ? w.handedNext : w.handedWait, { title: h.next.title, at: h.next.at?.name ?? h.next.at ?? '' }))}</div>` : '';
    // Fresh, it plays once: in with a gold flash, each pay popping after the
    // last (his, 2026-09-23: 给这个卡片加点动画). A redraw picks the animation
    // up where it was (a negative delay by its age), never restarts it.
    const age = ctx.handedAge?.(h.id) ?? Infinity, fresh = age < HANDED_MS;
    const at = (ms) => (fresh ? ` style="animation-delay:${Math.round(ms - age)}ms"` : '');
    const payHtml = pays.map((x, i) => `<span class="pay"${at(350 + i * 220)}>${esc(x)}</span>`).join('<span class="dot"> · </span>');
    return `<div class="handedrow${fresh ? ' fresh' : ''}"${at(0)}><div class="cardtitle">${esc(say(w.handedTitle, { title: h.title }))}</div>
      ${h.who ? `<div class="small dim">${esc(h.who)}</div>` : ''}${pays.length ? `<div class="pays">${payHtml}</div>` : ''}${next}</div>`;
  }).join('');
  return `<div class="card handed">${rows}</div>`;
}

/// What the goal says, in one line: what the cauldron asks, or the road, or
/// the chapter that has not opened.
function goalText(ctx) {
  const g = ctx.look?.waypoint, w = ctx.words;
  if (!g) return '';
  if (g.gate) return say(w.goalGate, g.gate);
  return g.text ?? (g.chapter ? say(g.opens ? w.goalWait : w.goalOpen, { title: g.title ?? '', opens: g.opens ? new Date(g.opens).toLocaleDateString(ctx.lang === 'zh' ? 'zh-CN' : 'en') : '' }) : '');
}

/// The goal on the stage: one slim line, nothing to tap. The rest is behind
/// the 事 chip (`bookPopHtml`). A cauldron that waits on cultivation says
/// what it asks and where he stands.
function goal(card, ctx) {
  const g = ctx.look?.waypoint, text = goalText(ctx);
  if (!text) return '';
  const now = g.gate ? ` — ${say(ctx.words.goalNow, g.gate.now)}` : '';
  // Short of the gate, the line names the next thing to do — never only
  // 「差事、功课、奇遇，都长修为」 with nothing to point at (2026-09-23).
  const k = g.gate ? ctx.look?.work : null;
  const next = k ? `<div class="goalnext">${esc(say(k.kind === 'beast' ? ctx.words.goalBeast : ctx.words.goalWork, { name: k.here ? ctx.words.needHere : k.place.name, what: (k.titles ?? []).join(' · ') }))}</div>` : '';
  return `<div class="goalline"><span class="lbl">${esc(ctx.words.goalTitle)}</span> ${esc(text)}${esc(now)}${next}</div>`;
}

/// The 事 chip on the top bar: how many things are in hand, and — never
/// behind a click — that one of them can be handed in (his rule, 2026-08-05:
/// progress and result are always visible). Nothing to show, no chip.
/* 机缘 — how long it still lasts, counted by the page from the rules' `until`.
   Gone once taken or missed. */
export function chanceLeft(c, now = Date.now()) {
  if (!c || c.taken || c.missed || !c.until) return null;
  const mins = Math.ceil((new Date(c.until) - now) / 60000);
  return mins > 0 ? mins : null;
}
const hm = (mins, w) => (mins >= 60 ? say(w.chanceHM, { h: Math.floor(mins / 60), m: mins % 60 }) : say(w.chanceM, { m: mins }));
function chanceRow(ctx) {
  const c = ctx.look?.chance, w = ctx.words, left = chanceLeft(c);
  if (!left) return '';
  return `<div class="bookrow chance${left <= 30 ? ' soon' : ''}"><div><b>${esc(say(w.chanceTitle, { place: c.place.name }))}</b>
    <span class="small dim">${esc(c.here ? w.chanceHere : say(w.chanceLeft, { t: hm(left, w) }))}</span></div></div>`;
}

export function bookChipHtml(ctx, open, fresh) {
  const book = ctx.look?.book ?? [], w = ctx.words, lucky = chanceLeft(ctx.look?.chance) ? 1 : 0;
  if (!book.length && !lucky && !ctx.look?.waypoint) return '';
  const ready = book.filter((q) => q.ready).length;
  const n = book.length + lucky;
  const label = `${w.bookChip}${n ? ` ${n}` : ''}${ready ? ` · ${say(w.bookReady, { n: ready })}` : ''}${lucky ? ` · ${w.chanceChip}` : ''}`;
  return `<span class="bookwrap"><button class="bookchip${ready ? ' ready' : ''}${lucky ? ' lucky' : ''}${fresh ? ' fresh' : ''}" data-book aria-expanded="${open ? 'true' : 'false'}">${esc(label)}</button>${open ? bookPopHtml(ctx) : ''}</span>`;
}

/// 机缘 on the stage where it lies: 收下 while it lasts.
function chance(card, ctx) {
  const c = ctx.look?.chance, w = ctx.words, left = chanceLeft(c);
  if (!left || !c.here) return '';
  return `<div class="card chance"><div class="cardtitle">${esc(say(w.chanceTitle, { place: c.place.name }))}</div>
    <div class="say">${esc(w.chanceLine)}</div><div class="small dim">${esc(say(w.chanceLeft, { t: hm(left, w) }))}</div>
    <div class="acts"><button class="act" data-chance>${esc(w.chanceTake)}</button></div></div>`;
}

/// What the chip opens: where the story waits, then 手上的事. No road button
/// here — the chat's question leads with that road, and one thing is tapped
/// in one place.
export function bookPopHtml(ctx) {
  const g = ctx.look?.waypoint, w = ctx.words;
  const where = g?.place ? `${g.place.name}${g.province ? ` · ${g.province}` : ''}` : g?.province ?? '';
  const head = g ? `<div class="cardtitle">${esc(w.goalTitle)}</div><div>${esc(goalText(ctx))}</div>
    ${where ? `<div class="small dim">${esc(where)}</div>` : ''}
    ${g.gate ? `<div class="small">${esc(say(w.goalNow, g.gate.now))}</div><div class="small dim">${esc(w.goalGrow)}</div>` : ''}` : '';
  // Work to be had: the next errand is a walk away, and one tap takes it.
  const k = ctx.look?.work;
  const work = k && !k.here ? `<div class="bookwork"><div><b>${esc(say(w.workAt, { name: k.place.name }))}</b> <span class="small dim">${esc(k.titles.join(' · '))}</span></div>${goBtn(say(w.go, { name: k.place.name }), k.place.id)}</div>` : '';
  return `<div class="bookpop" role="dialog">${head}${bookHtml(ctx) || (g ? '' : `<div class="small dim">${esc(w.bookNone)}</div>`)}${work}</div>`;
}

/// 装备 · 背包 — the 装 chip and what it opens: what he wears above, what he
/// carries below, open together (his, 2026-09-22). Wearing and taking a pill
/// are his own taps on the page: the page calls Trade itself, no model turn.
/// The chip counts from Look's `wear`; what it opens is the rules' `gear`
/// read (ctx.gear), fetched on the tap — it never rides Look.
export function gearChipHtml(ctx, open) {
  if (!ctx.look?.traits) return '';
  const wear = ctx.look.wear ?? {};
  const worn = ['weapon', 'robe', 'pendant'].filter((k) => wear[k]).length + (ctx.look.treasure ? 1 : 0);
  return `<span class="bookwrap"><button class="bookchip gearchip" data-gear aria-expanded="${open ? 'true' : 'false'}">${esc(ctx.words.gearChip)}${worn ? ` ${worn}` : ''}</button>${open && ctx.gear ? gearPopHtml(ctx) : ''}</span>`;
}

/* 羁绊 — the level by name, and how far to the next; never a bare number. */
function bondRow(b, w) {
  if (!b) return '';
  const to = b.next ? ` <span class="small dim">${esc(say(w.bondNext, { n: b.n, next: b.next, name: b.next_name }))}</span>` : '';
  return `<div class="gearrow"><span class="lbl">${esc(w.bond)}</span><span><b>${esc(b.name)}</b>${to}</span></div>`;
}

/* 历练 — send her out for 2, 4 or 8 real hours; out, where and how long, and
   叫回. Once a day. */
function journeyRow(c, w) {
  if (!c) return '';
  const j = c.journey;
  if (j?.back) return `<div class="gearrow"><span class="lbl">${esc(w.journey)}</span><span>${esc(say(w.journeyBack, { place: j.place.name }))}</span></div>`;
  if (j) {
    const m = j.minutes_left, t = m >= 60 ? say(w.chanceHM, { h: Math.floor(m / 60), m: m % 60 }) : say(w.chanceM, { m });
    return `<div class="gearrow"><span class="lbl">${esc(w.journey)}</span><span>${esc(say(w.journeyOut, { place: j.place.name, t }))}</span><button class="act quiet" data-journey-recall>${esc(w.journeyRecall)}</button></div>`;
  }
  if (c.journeyed) return `<div class="gearrow"><span class="lbl">${esc(w.journey)}</span><span class="dim">${esc(w.journeyDone)}</span></div>`;
  const hours = [2, 4, 8].map((h) => `<button class="act" data-journey="${h}">${esc(say(w.journeyHours, { h }))}</button>`).join('');
  return `<div class="gearrow"><span class="lbl">${esc(w.journey)}</span><span class="acts">${hours}</span></div>`;
}

/// 历练 over: she is back on the stage with what she brought — 收下.
function journey(card, ctx) {
  const j = ctx.look?.companion?.journey, w = ctx.words;
  if (!j?.back) return '';
  return `<div class="card journey"><div class="cardtitle">${esc(say(w.journeyBackTitle, { name: ctx.look.companion.name }))}</div>
    <div class="say">${esc(say(w.journeyBackLine, { place: j.place.name }))}</div>
    <div class="acts"><button class="act" data-journey-receive>${esc(w.chanceTake)}</button></div></div>`;
}

/* What the fight takes from what he wears (rules § 装备入局), one line:
   主灵根一击 +n · 护体 n · 抗土 n · 符在手 · 借金. */
function gearFightHtml(f, ctx) {
  if (!f) return '';
  const w = ctx.words, el = (id) => pick(ctx.content?.traits?.elements?.[id], ctx.lang) || id;
  const charm = f.charm ? pick((ctx.content?.cards?.cards ?? []).find((c) => c.id === f.charm)?.name, ctx.lang) || f.charm : '';
  const bits = [
    f.power ? say(w.gearPower, { n: f.power }) : '',
    f.armor ? say(w.gearArmor, { n: f.armor }) : '',
    ...Object.entries(f.ward ?? {}).map(([id, n]) => say(w.gearWard, { el: el(id), n })),
    charm ? say(w.gearCharm, { name: charm }) : '',
    ...(f.lends ?? []).map((id) => say(w.gearLends, { el: el(id) })),
  ].filter(Boolean);
  return bits.length ? `<div class="small dim gearfight">${esc(say(w.gearFight, { what: bits.join(' · ') }))}</div>` : '';
}

export function gearPopHtml(ctx) {
  const g = ctx.gear, w = ctx.words, t = ctx.look.treasure;
  // On her, a thing's line ("Yinyue can wear it") says nothing: the name is enough.
  const row = (label, it, plain = false, off = false) => `<div class="gearrow"><span class="lbl">${esc(label)}</span>
    ${it ? `<span><b>${esc(it.name)}</b>${plain ? '' : ` <span class="small dim">${esc(itemDoes(it.effect, ctx))}</span>`}</span>` : `<span class="dim">${esc(w.gearEmpty)}</span>`}${it && off ? `<button class="act" data-remove="${esc(it.id)}">${esc(w.gearOff)}</button>` : ''}</div>`;
  const slots = g.slots.map((s) => row(w.gearSlots[s.slot] ?? s.slot, s.item, false, true)).join('');
  const treasure = t ? `<div class="gearrow"><span class="lbl">${esc(w.gearSlots.treasure)}</span><span><b>${esc(t.name)}</b> <span class="small dim">${esc(t.step)} · ${esc(t.element_name)}</span></span></div>` : '';
  const herLift = g.her?.item ? liftSaid(g.her.item.effect, w) : '';
  const herRow = g.her ? `<div class="gearrow"><span class="lbl">${esc(say(w.gearHer, { name: g.her.name }))}</span>
    ${g.her.item ? `<span><b>${esc(g.her.item.name)}</b>${herLift ? ` <span class="small dim">${esc(herLift)}</span>` : ''}</span>` : `<span class="dim">${esc(w.gearEmpty)}</span>`}</div>` : '';
  const her = g.her ? herRow + bondRow(g.her.bond, w) + journeyRow(ctx.look?.companion, w) : '';
  const fight = gearFightHtml(g.fight, ctx);
  const bag = g.bag.length ? g.bag.map((i) => {
    const act = i.slot && !i.worn ? `<button class="act" data-wear="${esc(i.id)}">${esc(say(w.gearTo, { slot: w.gearSlots[i.slot] ?? g.her?.name ?? i.slot }))}</button>`
      : i.usable ? `<button class="act" data-use="${esc(i.id)}">${esc(w.use)}</button>`
        : i.worn ? `<span class="chip">${esc(w.worn)}</span>` : '';
    return `<div class="gearrow"><span><b>${esc(i.name)}</b> ×${esc(i.n)} <span class="small dim">${esc(itemDoes(i.effect, ctx))}</span></span>${act}</div>`;
  }).join('') : `<div class="small dim">${esc(w.bagNone)}</div>`;
  // 牌 — what he holds to fight with (得牌), the day's ten lit.
  const held = g.cards ?? [];
  // 组牌: each card a tap — lit is in the ten; his own picks solid, the
  // rules' fill dashed (his, 2026-09-23). 银月 and a root he lacks stay put.
  const n = held.filter((c) => c.deck).length, mine = held.filter((c) => c.picked).length;
  const chip = (c) => {
    const cls = `gcard${c.deck || c.hand ? ' in' : ''}${c.picked ? ' picked' : ''}${c.fill ? ' fill' : ''}${c.off_root ? ' off' : ''}`;
    const tip = esc(c.hand ? w.cardsHand : c.off_root ? w.cardsOff : '');
    const face = `<b>${esc(c.cost)}</b> ${esc(c.name)}${c.hand ? ` · ${esc(w.cardsHand)}` : ''}`;
    return c.hand || c.off_root ? `<span class="${cls}" title="${tip}">${face}</span>` : `<button class="${cls}" data-deck="${esc(c.id)}">${face}</button>`;
  };
  const short = 10 - mine;
  const note = g.picking ? (short > 0 ? say(w.cardsShort, { mine, short }) : say(w.cardsPicked, { mine })) : w.cardsNote;
  const cards = held.length ? `<div class="cardtitle bagtitle">${esc(say(w.cardsTitle, { n: held.length }))}</div>
    <div class="gcards">${held.map(chip).join('')}</div>
    <div class="small dim">${esc(note)}${g.picking ? ` <button class="act quiet" data-deck-auto>${esc(w.cardsAuto)}</button>` : ''}</div>` : '';
  const said = ctx.gearNote ? `<div class="donote">${esc(ctx.gearNote)}</div>` : '';
  return `<div class="bookpop gearpop" role="dialog">${said}<div class="cardtitle">${esc(w.gearTitle)}</div>${slots}${treasure}${her}${fight}
    <div class="cardtitle bagtitle">${esc(w.bagTitle)}</div>${bag}${cards}</div>`;
}

/// 手上的事 — one line each, with its count and where the next one is met.
/// 交差 the moment it is done, wherever he stands: he never walks back to the
/// giver (his ruling, 2026-09-18).
function bookHtml(ctx) {
  const book = ctx.look?.book ?? [], w = ctx.words, lucky = chanceRow(ctx);
  if (!book.length && !lucky) return '';
  const rows = book.map((q) => {
    const counts = q.need.map((n) => `${w.needKinds?.[n.kind] ?? n.kind} ${n.have}/${n.n}`).join(' · ');
    const at = q.chore ? witness(q.chore, ctx) : q.where ? (q.where.here ? w.needHere : `${say(w.needAt, { name: q.where.name })}${q.where.via ? ` · ${say(w.needVia, { name: q.where.via })}` : ''}`) : '';
    const open = ctx.bookRow === q.id;
    // The row is the tap: what it holds is shown here, by the page. Only 交差
    // is a button of its own, because it is the one thing to DO from a row.
    const act = q.ready ? doBtn(w.turnIn, 'turn', q.id) : `<span class="chev" aria-hidden="true">${open ? '▾' : '▸'}</span>`;
    return `<div class="bookrow${q.ready ? ' ready' : ''}${open ? ' open' : ''}" data-bookrow="${esc(q.id)}" role="button" tabindex="0" aria-expanded="${open}"><div><b>${esc(q.title)}</b>
      <span class="small dim">${esc(counts)}${at ? ` · ${esc(at)}` : ''}</span></div>${act}</div>${open ? bookDetail(q, ctx) : ''}`;
  }).join('');
  return `<div class="book"><div class="small dim">${esc(w.book)}</div>${lucky}${rows}</div>`;
}

/// One line of the book, opened: the giver's words, what it pays, what comes
/// after — read from the rules by the page (`Quest info`), no model turn. Where
/// the next count is met is one tap away: 「下一步怎么做」 has its answer here
/// (his, 2026-09-21), and Move walks the whole road.
function bookDetail(q, ctx) {
  const i = ctx.bookInfo?.id === q.id ? ctx.bookInfo : null, w = ctx.words;
  if (!i) return `<div class="bookdetail small dim">…</div>`;
  const p = i.pays ?? i.grant ?? {};
  const pays = [p.progress ? `${w.xw} +${p.progress}` : '', p.wealth ? `${w.ls} +${p.wealth}` : '', p.stamina ? `${w.qi} +${p.stamina}` : '', i.gives ?? ''].filter(Boolean).join(' · ');
  return `<div class="bookdetail">
    ${i.who ? `<div class="small dim">${esc(i.who)}${i.from ? ` · ${esc(i.from.name)}` : ''}</div>` : ''}
    ${i.say ? `<div class="say">${esc(i.say)}</div>` : ''}
    ${pays ? `<div class="small"><span class="dim">${esc(w.paysWord)}</span> ${esc(pays)}</div>` : ''}
    ${i.next ? `<div class="small dim">${esc(w.nextWord)} · ${esc(i.next)}</div>` : ''}
    <div class="acts">${q.chore?.open && !q.ready ? `<a class="act" href="${esc(q.chore.open)}" target="_blank" rel="noopener">${esc(say(w.choreOpen, { app: appName(q.chore.app) }))} ↗</a>` : ''}${q.where && !q.where.here ? goBtn(say(w.go, { name: q.where.name }), q.where.id) : ''}${askBtn(w.about, say(w.sayQuestAbout, { title: q.title }))}${i.kind === 'errand' || i.kind === 'tale' ? `<button class="act quiet" data-drop="${esc(q.id)}">${esc(w.drop)}</button>` : ''}</div></div>`;
}

/// The ask bar: one field for every 问询 on the page. It lives outside the
/// stage's repaint, so typing in it is never interrupted.
export function askBarHtml(line, words, hint = words.askHint) {
  return `<span class="asktopic">${esc(line)}</span><input id="askField" type="text" autocomplete="off" placeholder="${esc(hint)}">
    <button class="act" data-ask-send>${esc(words.askSend)}</button><button class="act quiet" data-ask-close aria-label="close">×</button>`;
}

/// A 功课's witness: which app keeps the record, and when it saw it done.
/* 'apple-shifu' → 'Shifu': the app's own last word, as the book already says it. */
const appName = (id) => { const n = String(id ?? '').split('-').pop(); return n ? n[0].toUpperCase() + n.slice(1) : ''; };

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
  const acts = [{ label: w.about, ask: true, say: w.sayQuest }];
  // The step, as a word to Ling: buy it here, walk to where it can be taken, ring it.
  if (q.step === 'ring') acts.unshift({ label: w.ringBell, say: w.sayRing });
  else if (q.step === 'bell' && q.shop_here) acts.unshift({ label: say(w.sayBuy, { name: q.bell.name }), do: 'buy', id: q.bell.id });
  else if (q.step === 'bell' && q.market) acts.unshift({ label: q.market.name, go: q.market.id });
  else if (q.step === 'water' && q.water) acts.unshift({ label: q.water.name, go: q.water.id });
  return `<div class="card quest"><div class="cardtitle">${esc(w.questTitle)}</div>
    <div>${esc(q.line)}</div><div class="small dim">${esc(w.questSteps?.[q.step] ?? '')}${where ? ` · ${esc(where)}` : ''}</div>
    <div class="acts">${acts.map((a) => (a.do ? doBtn(a.label, a.do, a.id) : a.go ? goBtn(a.label, a.go) : (a.ask ? askBtn : sayBtn)(a.label, a.say))).join('')}</div></div>`;
}

/// 拾遗 — something by the road. The page takes it itself (`Meet take`): it is
/// a fact of the rules, not a thing to ask Ling for.
/// 遇, before it is told: mist on the stage while Ling sets the moment. Nothing
/// to tap — what it is comes up when she calls Meet reveal (or when her turn
/// ends without it; the page lifts it itself then).
function veil(card, ctx) {
  if (!ctx.look?.place?.meet?.veiled) return '';
  return `<div class="card veil" aria-live="polite"><div class="mist"></div><div class="veilline">${esc(ctx.words.veilLine)}</div></div>`;
}

function find(card, ctx) {
  const m = ctx.look?.place?.meet, w = ctx.words;
  if (m?.kind !== 'find') return '';
  const what = m.item ? m.item.name : `${w.ls} +${m.wealth}`;
  return `<div class="card find"><div class="cardtitle">${esc(w.findTitle)}</div>
    <div class="say">${esc(m.line)}</div>
    <div class="acts"><button class="act" data-meet="take">${esc(say(w.findTake, { what }))}</button><button class="act quiet" data-meet="pass">${esc(w.findPass)}</button></div></div>`;
}

/// 抉择 — the ways Ling wrote, each a button with how hard it is, what it
/// risks and the odds the rules give (never the roll). After the tap the
/// stage holds the line of the way taken, Ling's own words, until she goes on.
function trial(card, ctx) {
  const m = ctx.look?.place?.meet, w = ctx.words, told = ctx.trialTold;
  if (told) {
    return `<div class="card trial ${told.success ? 'won' : 'lost'}"><div class="cardtitle">${esc(w.trialTitle)} · ${esc(told.success ? w.trialWon : w.trialLost)}</div>
      <div class="say">${esc(told.line)}</div>${told.cost ? `<div class="small dim">${esc(told.cost)}</div>` : ''}</div>`;
  }
  if (m?.kind !== 'trial' || !m.options) return '';
  const ways = m.options.map((o) => `<button class="act way" data-trial="${o.n}"><b>${esc(o.label)}</b>
    <small>${esc(w.trialHard?.[o.difficulty] ?? o.difficulty)} · ${esc(say(w.trialChance, { n: o.chance }))} · ${esc(w.trialStake?.[o.stake] ?? o.stake)}</small></button>`).join('');
  return `<div class="card trial"><div class="cardtitle">${esc(w.trialTitle)}</div><div class="acts ways">${ways}</div></div>`;
}

/// The way taken, on the stage after the tap — the same card, told.
export const trialToldHtml = (told, ctx) => trial({}, { ...ctx, trialTold: told });

/// A made world still being painted: the story waits for the brush, so the
/// scene says how many pictures are left — from Look, never counted here.
function building(card, ctx) {
  const left = ctx.look?.building?.paint?.length;
  if (!left) return '';
  return `<div class="card building"><div class="cardtitle">${esc(ctx.words.building)}</div>
    <div>${esc(ctx.words.buildingLine.replace('{n}', left))}</div></div>`;
}

const RENDER = { handed, tale, lundao, creature, traits, map, hexagram, gate, tribulation, board, item, duel, treasure, goal, offer, quest, building, empty, find, veil, trial, chance, journey };

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
      ? `<button class="act" data-play="${esc(t.id)}">${t.game && t.game !== 'lianliankan' ? ctx.words.playGame : ctx.words.play}</button>` : '';
    const tell = `<button class="act ask" ${askAttr(say(ctx.words.sayTask, { title: t.title }))}>${esc(ctx.words.about)}</button>`;
    return `<div class="card task ${state}"><div class="tasktitle">${esc(t.title)}</div>
      <div class="taskfoot"><span class="chip">${esc(ctx.words[state])}</span>${act}${tell}</div></div>`;
  });
  // The apps' 功课 ride the book on the goal card now (design.md § 差事 ⑥).
  return tasks.join('');
}
