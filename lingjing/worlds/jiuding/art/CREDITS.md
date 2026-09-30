# Art credits — 《九鼎》

Every picture in this folder is either public domain heritage laid on our
paper (`plates/` keeps the untouched originals) or drawn for Lingjing. The
`art_source` line on each creature and item is the record; this file is the
reader's copy. Nothing here is fetched at play time.

## Creatures

Every creature is a classical woodcut — his ruling 2026-09-16: a 山海经
creature is found, not drawn. The plate is kept untouched in `plates/` and
laid on our paper by `tools/frame.py` (crop, `--levels` for a scan on toned
paper, a warm paper ground with grain, the red seal).

| id | picture | source |
|---|---|---|
| fuzhu | 夫諸 | 《山海經》蔣應鎬繪圖本, Ming 萬曆 (c. 1597), 卷五 中山經 plate 32 — Wikimedia Commons, *山海經十八卷 蔣應鎬繪圖 明萬曆間刊本.pdf*, page 108 (the Qing encyclopaedia's 夫諸圖 draws it goat-like; the 1597 plate is the deer the text describes) |
| paoxiao | 狍鴞 | 《山海經圖》, 胡文煥, Ming (1596–1650) — Wikimedia Commons, *狍鴞.jpg* |
| jingwei | 精衛 | 《古今圖書集成·禽蟲典》精衛圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic130 - 精衛圖.svg* |
| leishen | 雷神 | 《山海經》蔣應鎬繪圖本, c. 1597, 卷十三 海內東經 plate 62 — same PDF, page 200 |
| longzhi | 蠪侄 | 《山海經》蔣應鎬繪圖本, c. 1597, 卷四 東次二經 plate — same PDF, page 94 |
| kui | 夔 | 《山海經》蔣應鎬繪圖本, c. 1597, 卷十四 大荒東經 plate 64 — same PDF, page 211 (the whole spread); also 吳任臣《山海經廣注》 1786 print, Commons *Shan Hai Jing Kui.jpg*, kept as reference |
| tongtong | 狪狪 | 《山海經》蔣應鎬繪圖本, c. 1597, 卷四 東山經 plate 26, lower left — same PDF, page 91 |
| wuzhiqi | 无支祁 | **Drawn for Lingjing** by the local picture model (FLUX.2 klein 4B), 2026-09-24, as a woodcut after the 《古岳渎经》 text (李公佐, in 《太平广记》卷四百六十七) — 无支祁 is not a 山海经 creature and no classical plate of it is known |
| fangfeng | 防风氏 | **Drawn for Lingjing** by the local picture model (FLUX.2 klein 4B), 2026-09-24, as a woodcut after 《国语·鲁语下》 — no classical plate of 防风氏 is known |
| changyou | 長右 | 《古今圖書集成·禽蟲典》長右圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic239 - 長右圖.svg* |
| bashe | 巴蛇 | 《古今圖書集成·禽蟲典》巴蛇圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic510 - 巴蛇圖.svg* |
| gui | 蛫 | 《古今圖書集成·禽蟲典》蛫圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic313 - 蛫圖.svg* |
| kuiniu | 夔牛 | **Drawn for Lingjing** by the local picture model (FLUX.2 klein 4B), 2026-09-24, as a woodcut after 《中次九经》 and 郭璞's note — no labelled classical plate of 夔牛 was found |
| qiezhi | 竊脂 | 《古今圖書集成·禽蟲典》竊脂圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic137 - 竊脂圖.svg* |
| feiyi | 肥遺 | 《古今圖書集成·禽蟲典》肥遺圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic506 - 肥遺圖.svg* |
| qianyang | 羬羊 | 《古今圖書集成·禽蟲典》羬羊圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic229 - 羬羊圖.svg* |
| taifeng | 太逢（泰逢） | 《古今圖書集成·神異典》太逢神圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Spirits and the Supernatural - pic30 - 太逢神圖.svg* |
| mafu | 馬腹 | 《古今圖書集成·禽蟲典》馬腹圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic297 - 馬腹圖.svg* |
| zheng | 猙 | 《古今圖書集成·禽蟲典》猙圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic252 - 猙圖.svg* (五尾一角, the leopard's spots — as the 西次三經 says) |

The FLUX paintings of 2026-09-15 (夫諸, 狍鴞, 精衛, 雷神, 蠪侄) were replaced
on 2026-09-16; the seal font lacks 蠪 and 狪, so those seals read 侄 and 珠.

## The world map

`map/jiuzhou.svg` is *Yugong Nine Provinces Map 禹贡九州图.svg* by Philg88,
Wikimedia Commons, **CC BY-SA 3.0** (https://creativecommons.org/licenses/by-sa/3.0/);
the original is kept untouched as `plates/yugong-jiuzhou.svg`. Changed for the
game by `tools/clean_map.py`: every label, the title, legend, scale, inset,
mountain marks and frame removed. The adapted map is shared under the same
licence. The names over it and every place's point are the game's own (his
choice, 2026-09-17).

`map/jiuzhou-ink.webp` — the 九州 as an ink landscape map (山水舆图), painted for
the game by Codex (gpt-5.5 image generation), 2026-09-29, from an outline of
`map/jiuzhou.svg`'s coast, borders and rivers so it lies over the map's shapes.
The painting is ours; the province shapes it is clipped to (and the outline it
followed) remain the CC BY-SA map above. The 鼎归 map shows it province by province.

## Items — painted for Lingjing

`items/*.webp` are painted for the game by the local picture model (FLUX.2
klein 4B), 2026-09-15 (齐盐, 齐纨 and 符 2026-09-16; the five 天材地宝, the three
妖丹 and 玉珏 2026-09-17), from each item's description. No outside source.
橘柚 (juyou), 丹砂 (dansha), 蜀锦 (shujin) and 琅玕 (langgan) were painted the same way, 2026-09-24.

## Scenes — painted for Lingjing

`dongfu-gate.webp` — the closed 洞府 stone gate the running 闭关 card wears
(his ask, 2026-09-24), painted by the local picture model (FLUX.2 klein 4B),
768×512, seed 52 of four (seed 11 painted fake characters on the rock). No
outside source.

## 图鉴 — portraits, things and creatures painted by Codex (2026-09-29)

His ruling: 「不用小人书的方式了，图片作为图鉴」. The 28 prologue panels (`panels/00-*`) are
retired (git history keeps them). After the bake-off (local FLUX · Gemini · Codex CLI) he chose
Codex CLI's image tool (ChatGPT's image model): `tools/paint-codex.py` holds the house style —
fine ink 白描 with a soft grey wash on warm aged paper, one subject, no text or seal — and every
subject's prompt. Each picture was looked at against its description and re-rolled where wrong.
No outside source. Painted so far (the Codex credits ran out mid-run): the people 爹 娘 马三 马小宝
阿禾 (`ahe-girl`; the boy variant `ahe-boy` went 2026-09-30 with the fixed hero) 吴婆婆 老周 瞿老 银月 (`yinyue`, and her fox form `yinyue-fox`, the
house-style reference) 褚先生 孙二狗 内门师姐 周衡, and (the afternoon's round) 舅舅 玄沉子 渡叔; the bow `items/old-bow` (the pouch's picture; a bow has no 图鉴 entry); the things 狐纹木牌 (nine tails)
洗髓丹 《吐纳经》 小铜炉 (three legs, two ears, the beast on the lid) 《黄庭经》 《河洛剑诀》 回春丹 银月铃
(`items/{fox-token,xisui-pill,tuna-jing,danlu,huangting,heluo,mend-pill,moon-bell}`); and
`creatures/fuzhu` (夫诸, four horns, from 「其状如白鹿而四角」), and (the afternoon's round, each from its classical
line, every head, leg, tail, horn and wing counted) 无支祁 长右 巴蛇 蛫 夔牛 窃脂 羬羊 泰逢 马腹 狍鸮 精卫 and 狰 as
the story's baby 小狰 (five tails, one horn, hugging a stalk of 灵草). Where Codex painted strong colour
(小狰, 蛫, 窃脂, 马腹, 《河洛剑诀》) it was toned down to the house's faint tint. They replace the FLUX pictures;
无支祁 and 夔牛 had no old print (their FLUX woodcuts stay for the 斗法 cards). Still to paint: 防风氏 蠪侄 夔
狪狪 雷神 (its first roll had five limbs) and 肥遗 (four rolls, the feet never six — it keeps its woodcut). A creature's
old woodcut stays at its old path as its 「原图」 (`art_plate`, the table above).

When the Codex credits ran out (his: 「用flux吧」, 2026-09-29) the local FLUX (FLUX.2 klein 4B) painted on in the
same house style, from `tools/paint-flux-codex.py` (English-only prompts, each seed kept listed there; eight seeds
a round, every picture looked at and only a right one kept): `people/bingyi.webp` — 河伯 冰夷, 「冰夷人面，乘两龙」,
one man standing on exactly two dragons, one foot on each; `creatures/fangfeng.webp` — 防风氏 (a giant, one head,
two arms, two legs, an ankle-high cart beside his foot; his FLUX woodcut `fangfeng.webp` stays for the 斗法 card);
`creatures/tongtong.webp` — 狪狪 (a pig with one pearl in its mouth; the 1597 print stays its 「原图」). Two rounds
could not make 肥遗 (six legs), 雷神 (a dragon's body with a man's head), 蠪侄 (nine heads and nine tails) or 夔
(one leg, no horns) come out right: they keep their woodcuts. No outside source.

The 经脉 · 穴位 figures are painted by Codex with their labels (each checked by eye); the codex's
`marks` sit on the painted points. `codex/sanguan.webp` — 「人体背面·督脉三关」, painted with Codex
for Hanli, 2026-09-29 (webp q80, 1448×1086). The plate the passes follow, 《性命圭旨·反照图》 (Ming,
public domain, Wikimedia Commons), is kept as `codex/fanzhao-scan.webp`, its 「原图」.

## The prologue — people and panels (2026-09-28; the panels retired and the people repainted 2026-09-29, above)

`people/baba.webp`, `mama`, `wupo`, `masan`, `maxiaobao`, `laozhou`, `jiujiu`,
`yinyue-fox` (the little silver fox) and `yinyue` (her human form), and the 27
`panels/00-*.webp` of the prologue's 连环画, with `items/fox-token`,
`deer-hide`, `old-bow` and `tuna-jing`: painted for Lingjing by the local
picture model (FLUX.2 klein 4B), 2026-09-28, from the prompts in
`tools/paint-prologue.py` (portraits in ink wash, panels as 白描 with a light
wash on aged paper). No outside source. `panels/00-years.webp` was painted for
the three-year montage that moved to chapter 1; it is kept for it.

## 第一章 · 外门 — painted for Lingjing

`people/chuxiansheng.webp`, `people/sunergou.webp`, `people/neimen-shijie.webp` and `items/{luobo,danlu,huangting,heluo}.webp` were painted by the local
picture model (FLUX.2 klein 4B), 2026-09-29, with tools/paint-waimen.py — the prologue's recipe; each
looked at and re-rolled where it painted fake characters (the kept seeds are the script's `SEEDS`).
The chapter has no story panels (his ruling, 2026-09-29). No outside source.

## 第十回 · 邺城 — painted for Lingjing (2026-09-30)

`people/zhaoang.webp` — 赵昂 of 太一宫 (white robe, a straight sword, the willow by the 漳水 where he first stands in 第十回; a frame FLUX drew in is cropped off), `people/doufu-xishi.webp` — 豆腐西施, 老胡家的闺女 (mute, a tray of tofu), and `people/wuzhu.webp` — the 巫祝婆婆 of the 河伯庙 (a hand drum): painted by the local picture model (FLUX.2 klein 4B), 2026-09-30, with tools/paint-flux-codex.py (the house STYLE; kept seeds and the crop are in its `SUBJECTS`), six seeds a round, every picture looked at (Chinese cross-collared dress, no text, no seal). No outside source. 蠪侄 was rolled again (six seeds: five to seven heads, one to three tails) and keeps its 1597 woodcut.

`people/xiaoman.webp` — 沈小满 at twelve (第一回: a patched jacket cut down from his father's, a rope belt, straw sandals, grandpa's sinew-wrapped bow on his back): painted by the local picture model (FLUX.2 klein 4B), 2026-09-30, with tools/paint-flux-codex.py (seed 5 of the second round of six), every picture looked at. No outside source.

## 第九回 · 筑基天象 — set-piece paintings (2026-09-30)

`setpiece/zhuji-a.webp` (锅盖云: one small cloud over the one cliff top, him far off on the stone), `zhuji-b.webp` (一缕光: a faint thread of light on his crown), `zhuji-c.webp` (丹田台: the stones stacking in the dark lake, the five doors in muted 五色), `zhuji-d1.webp` / `zhuji-d2.webp` (那扇门: the note rain-run past reading, then 「今日放学」), `zhuji-e.webp` (四桩/星垂, tall: the 台 on four piles below, him alone under an ordinary, slightly clearer night above) — painted by the local picture model (FLUX.2 klein 4B, mflux) with tools/paint-zhuji.py, which holds every prompt and kept seed; Codex, zhang's painter, was out of credits. His ruling the same day (「筑基有一点天象就可以」, the first rung of a ladder) made a, b, e restrained monochrome ink. The note's four characters are a Xingkai (行楷) system face multiplied into d1's painted paper; e is two FLUX pictures joined through mist. Rejected on the way: colour rounds of a, b, e before the ruling; clouds painted as a literal pot or jar; two boys where one was asked; a light shaft missing his head; e as one picture (the boy sat on the platform, no night); an e-tai with five or six legs. Every picture looked at. No outside source.

## 第十回 · 漳水立起 — set-piece stills (2026-09-30)

`setpiece/zhang-a.webp`, `zhang-b.webp`, `zhang-c.webp`, `zhang-e.webp`, `zhang-f.webp` — five key frames for 卷一's 大场面 (the 漳水 standing up; 冰夷 on his two dragons; the trial; the 洛书 seal on the square four-legged 冀州鼎 under the river; the 鼎 rising at moonrise), following 10-第十回.md: painted with Codex CLI's image generation (gpt-5.5, 1536×1024), 2026-09-30, the frames with people given art/people/bingyi.webp, xiaoman.webp, doufu-xishi.webp (and for f art/items/fox-token.webp) as references, and e/f given a and c as style references. Hanli kept a, b, c and dropped d; e and f were repainted to his note (a square 方鼎 with four legs; 银月 curled inside the jacket, the token's second tail lit). Rejected on the way: a vignetted c, a crowned 冰夷, a photoreal round-鼎 e, a pasted-card e whose tiles Codex overlaid with code, a pendant-shaped token in f. Codex ran out of credits during the last e round; local FLUX (FLUX.2 klein 4B, four seeds) was tried for e and looked at, and did not reach the style of a–c (not underwater, a small child, random dots), so e is the first repaint. Every picture looked at. No outside source.
