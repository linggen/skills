# Art credits — 《九鼎》

Every picture in this folder is either public domain heritage laid on our
paper (`plates/` keeps the untouched originals) or drawn for Lingjing. The
`art_source` line on each creature and item is the record; this file is the
reader's copy. Nothing here is fetched at play time.

## Creatures

Painted for Lingjing by the local picture model (FLUX.2 klein 4B) where
noted; the classical woodcut stays in `plates/` as the reference.

| id | picture | source |
|---|---|---|
| fuzhu | 夫諸 | Painted for Lingjing, 2026-09-15. Reference: 《山海經》蔣應鎬繪圖本, Ming 萬曆 (c. 1597), 卷五 中山經 plate 32 — Wikimedia Commons, *山海經十八卷 蔣應鎬繪圖 明萬曆間刊本.pdf*, page 108 (the Qing encyclopaedia's 夫諸圖 draws it goat-like; the 1597 plate is the deer the text describes) |
| paoxiao | 狍鴞 | Painted for Lingjing, 2026-09-15. Reference: 《山海經圖》, 胡文煥, Ming (1596–1650) — Wikimedia Commons, *狍鴞.jpg* |
| jingwei | 精衛 | Painted for Lingjing, 2026-09-15. Reference: 《古今圖書集成·禽蟲典》精衛圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic130 - 精衛圖.svg* |

Every creature on the card is now painted; its `art_caption` reads *Drawn
in Lingjing*. `tools/frame.py` framed the woodcuts that shipped before
(crop, `--levels` for a scan on toned paper, a warm paper ground with grain,
the red seal) and stays for any plate shown as itself.

## Items — painted for Lingjing

`items/*.webp` are painted for the game by the local picture model (FLUX.2
klein 4B), 2026-09-15, from each item's description. No outside source.
