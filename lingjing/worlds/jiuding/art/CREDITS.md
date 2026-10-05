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
鼎苔 (dingtai) was repainted by the local picture model (FLUX.2 klein 4B), 2026-10-05, when Codex was out of credits (第五回: one square footing pit sunk in the stone chamber floor, straight walls, flat bottom, a ring of blackish-green moss on its rim, a faint glow; a corner of a second pit). The Codex picture of 2026-10-02 had drawn a round stone slab. Seed 15 of the second round of six; every picture looked at.

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
无支祁 and 夔牛 had no old print (their FLUX woodcuts stay for the 斗法 cards). Still to paint: 防风氏 夔
狪狪 雷神 (its first roll had five limbs) and 肥遗 (four rolls, the feet never six — it keeps its woodcut). A creature's
old woodcut stays at its old path as its 「原图」 (`art_plate`, the table above).

When the Codex credits ran out (his: 「用flux吧」, 2026-09-29) the local FLUX (FLUX.2 klein 4B) painted on in the
same house style, from `tools/paint-flux-codex.py` (English-only prompts, each seed kept listed there; eight seeds
a round, every picture looked at and only a right one kept): `people/bingyi.webp` — 河伯 冰夷, 「冰夷人面，乘两龙」,
one man standing on exactly two dragons, one foot on each; `creatures/fangfeng.webp` — 防风氏 (a giant, one head,
two arms, two legs, an ankle-high cart beside his foot; his FLUX woodcut `fangfeng.webp` stays for the 斗法 card);
`creatures/tongtong.webp` — 狪狪 (a pig with one pearl in its mouth; the 1597 print stays its 「原图」). Two rounds
could not make 肥遗 (six legs), 雷神 (a dragon's body with a man's head) or 夔
(one leg, no horns) come out right: they keep their woodcuts. No outside source.

`creatures/longzhi.webp` — 蠪侄, 「其状如狐，而九尾、九首、虎爪」, 2026-10-02: Codex image edit (gpt-5.5) of a Codex
base (fresh Codex rolls gave eight heads and eight tails at best; four rounds), the base handed in and one head and one
tail added in a single edit, first attempt. Nine heads, nine tails, four tiger-clawed feet, counted by eye on zoomed crops.
The 1597 woodcut stays its 「原图」 (`art_plate`). No outside source.

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

`people/zhaoang.webp` — 赵昂 of 太一宫 (white robe, a straight sword, the willow by the 漳水 where he first stands in 第十回; a frame FLUX drew in is cropped off), `people/doufu-xishi.webp` — 豆腐西施, 老胡家的闺女 (mute, a tray of tofu), and `people/wuzhu.webp` — the 巫祝婆婆 of the 河伯庙 (a hand drum): painted by the local picture model (FLUX.2 klein 4B), 2026-09-30, with tools/paint-flux-codex.py (the house STYLE; kept seeds and the crop are in its `SUBJECTS`), six seeds a round, every picture looked at (Chinese cross-collared dress, no text, no seal). No outside source. 蠪侄 was rolled again (six seeds: five to seven heads, one to three tails) and kept its 1597 woodcut (painted by Codex 2026-10-02, above).

`people/xiaoman.webp` — 沈小满 at twelve (第一回: a patched jacket cut down from his father's, a rope belt, straw sandals, grandpa's sinew-wrapped bow on his back): painted by the local picture model (FLUX.2 klein 4B), 2026-09-30, with tools/paint-flux-codex.py (seed 5 of the second round of six), every picture looked at. No outside source.

## 第九回 · 筑基天象 — set-piece paintings (2026-09-30)

`setpiece/zhuji-a.webp` (锅盖云: one small cloud over the one cliff top, him far off on the stone), `zhuji-b.webp` (一缕光: a faint thread of light on his crown), `zhuji-c.webp` (丹田台: the stones stacking in the black lake, five Chinese gateways round it in muted 五色), `zhuji-d1.webp` / `zhuji-d2.webp` (那扇门: an old door standing alone on the black water, the note rain-run past reading, then 「今日放学」), `zhuji-e1.webp` (四桩: the 台 standing firm on its four piles in the black lake), `zhuji-e2.webp` (星垂: him alone on the cliff under an ordinary, slightly clearer night) — painted by the local picture model (FLUX.2 klein 4B, mflux) with tools/paint-zhuji.py, which holds every prompt and kept seed; Codex, zhang's painter, was out of credits. His ruling the same day (「筑基有一点天象就可以」, the first rung of a ladder) made the outside frames (a, b, e2) restrained monochrome ink. His note after (「筑基的图片在小满旁边画了个台子, 其实应该是内景的台子吧」): the first e had stitched the 台 under the boy on the cliff; the inside frames (c, d1/d2, e1) were repainted as a small cosmos inside him — a dark void, faint stars, nebula-like ink, the black lake afloat — and e split in two, the 台 and the cliff never in one painting; c's Romanesque stone arches became Chinese gateways; b repainted for a plainer, less anime face. The note's four characters are a Xingkai (行楷) system face multiplied into d1's painted paper. Rejected on the way: colour rounds of a, b, e before the ruling; clouds painted as a literal pot or jar; two boys where one was asked; a light shaft missing his head; e as one picture (the boy sat on the platform, no night), then e as a stitched tall picture (the 台 read as beside him); an e-tai with five or six legs; c rounds with walls ringing the whole lake or the 台 heaped with rocks; b rounds whose faces still read anime. Every picture looked at. No outside source. Repainted with Codex 2026-10-01 (tools/paint-setpiece-codex.py, gpt-5.5 image generation, each kept FLUX frame handed in as the picture to repaint, composition kept): b's face redrawn in the Ming woodblock figure manner; c's five gateways freestanding Chinese moon gates and timber gateways on the rim, all five glowing 金木水火土, the 台 flat on top (door glows re-measured in zhuji.js MARKS); e1's 台 raised on four masonry piers with ripples, not a low table. Rejected on the way: a b and a b re-roll whose faces barely moved, two e1 rolls that still read as a table on thin legs.

## 第十回 · 漳水立起 — set-piece stills (2026-09-30)

`setpiece/zhang-a.webp`, `zhang-b.webp`, `zhang-c.webp`, `zhang-e.webp`, `zhang-f.webp` — five key frames for 卷一's 大场面 (the 漳水 standing up; 冰夷 on his two dragons; the trial; the 洛书 seal on the square four-legged 冀州鼎 under the river; the 鼎 rising at moonrise), following 10-第十回.md: painted with Codex CLI's image generation (gpt-5.5, 1536×1024), 2026-09-30, the frames with people given art/people/bingyi.webp, xiaoman.webp, doufu-xishi.webp (and for f art/items/fox-token.webp) as references, and e/f given a and c as style references. Hanli kept a, b, c and dropped d; e and f were repainted to his note (a square 方鼎 with four legs; 银月 curled inside the jacket, the token's second tail lit). Rejected on the way: a vignetted c, a crowned 冰夷, a photoreal round-鼎 e, a pasted-card e whose tiles Codex overlaid with code, a pendant-shaped token in f. Codex ran out of credits during the last e round; local FLUX (FLUX.2 klein 4B, four seeds) was tried for e and looked at, and did not reach the style of a–c (not underwater, a small child, random dots), so e is the first repaint. Every picture looked at. No outside source. Frame e repainted with Codex 2026-10-01 (tools/paint-setpiece-codex.py), the kept e handed in as the picture to repaint: the 洛书 counts now read 4 9 2 / 3 5 7 / 8 1 6, odd white, even black, all else as it was. The first roll had 8 for 7 and 12 for 8; a second pass on that roll fixed only those two tiles. Every tile counted by eye.

## 银月 at fourteen — portrait and card repainted (2026-10-01)

Hanli's note: 「沈小满12, 银月应该也差不多年纪吧……应该是个女孩子?」 — 第一回 has her 「看着比他大不了几岁」, and both
the portrait and the card had drawn a grown woman. `people/yinyue.webp` (640×960, webp q84) was repainted with Codex
CLI's image generation (gpt-5.5), 2026-10-01, from the prompt now in `tools/paint-codex.py`: a girl of fourteen or
fifteen with a slight, not-yet-grown build in a modest white robe, silver hair past the waist, barefoot, gold
slit-pupil eyes, one tail with eight stumps at its root, chin up, hands on hips, a sly half-grin. Two passes: the kept
text-only roll was handed back to Codex to fix only the stumps and the eyes (`YINYUE_FIX`). Rejected on the way: three
rolls with the old portrait as the style reference (each still a tall young woman), one with fox ears, a kept roll's
five raw red stumps, and a re-roll whose stubs came out five or six. `cards/yinyue.webp` (448×320, webp q86) was
repainted the same day with Codex, given the new portrait as the character and the old FLUX card as the ink-wash
style and layout (the moon on the left); two first rolls without the portrait still read as a young lady with
hairpins. The FLUX card of 2026-09-18 and the FLUX/Codex portraits before it are in git history. Every picture looked
at. No outside source.

Later the same day (his: 「断口去掉就好」 — the stumps read as a stack of rings, a caterpillar): both pictures were
handed back to Codex to clear the tail root only, leaving one clean, full silver tail; everything else unchanged.
The eight 断口 stay in the book's words and the 图鉴 line; the pictures don't draw them. A round asking for eight
fanned, healed stubs was painted first and set aside unlooked-at when he changed the ask. Two rolls each, all
four clean; kept the ones whose face and eyes matched best.

## 今线 · 人物志 — the interludes' people (2026-10-05)

Hanli's notes: 「今线也补一遍人物志的图。注意和古线只保留脸一致，装扮等都是现代的。」, then 「衣着按照出场时的画」.
`people/jin-*.webp` (640×960, webp q84) — 沈芒, 周禾 (阿禾), 马小宝, 雷老师, 葛奶奶, 眼镜 (林远), 老蔡, 严老师 — were
painted with Codex CLI's image generation (gpt-5.5), 2026-10-05, with `tools/paint-jin-codex.py` (the house STYLE of
`tools/paint-codex.py`), each as he or she first appears in 今 · 一 (`story/jiuding-lu/今线/插曲01.md`): what the text
puts on them and in their hands, in that place; what it leaves out from `今线/定例.md` § 三. 沈芒 after the 1000 m
test (sweat-soaked T-shirt, a cheap band, the plastic bag), 周禾 at the finish line (blue volunteer vest, white
sneakers, the notebook), 雷老师 with the stopwatch, 马小宝 at the club-fair stall (watch, shaker, headphones), 眼镜
and 老蔡 in dorm 617 at night (the library book; the top bunk), 严老师 in the lecture (hands behind his back, chalk),
葛奶奶 at the basement fire door (oversleeves, glasses on a chain, a pencil). The same souls were handed their 古线
portrait to keep ONLY the face: 沈芒 ← `xiaoman.webp` (and the kept 眼镜 as the age to draw — alone, the boy's face
came back fourteen), 周禾 ← `ahe-girl.webp`, 马小宝 ← `maxiaobao.webp`, 葛奶奶 ← `wupo.webp` (吴婆婆's soul, her
eyes clear); the other four had `qulao.webp` as the style reference only. A first round in team kit (before his
second note) is in git history. Rejected on the way: a 周禾 who read fifteen, a 老蔡 not plump, a 葛奶奶 holding a
book the text never gives her, a 眼镜 roll that came back as a fox girl, three 沈芒 who still read fifteen. Every
picture looked at (the dress against the text, the age, no ancient dress, no text or seal). No outside source.

The book shows them: each has a codex.json entry, `book_only` with `first.book: "j01"` — a card after the paragraph
of their first appearance in 今 · 一; in play they keep their portrait on the stage's people row, but never get a
first-appearance card, are never met, and have no slot in 录's 图鉴.
