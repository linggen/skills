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
