# Art credits — 《九鼎》

Every picture in this folder is either public domain heritage laid on our
paper (`plates/` keeps the untouched originals) or drawn for Lingjing. The
`art_source` line on each creature and item is the record; this file is the
reader's copy. Nothing here is fetched at play time.

## Creatures — classical woodcuts, public domain

| id | picture | source |
|---|---|---|
| fuzhu | 夫諸 | 《山海經》蔣應鎬繪圖本, Ming 萬曆 (c. 1597), 卷五 中山經 plate 32 — Wikimedia Commons, *山海經十八卷 蔣應鎬繪圖 明萬曆間刊本.pdf*, page 108 (the Qing encyclopaedia's 夫諸圖 draws it goat-like; the 1597 plate is the deer the text describes) |
| paoxiao | 狍鴞 | 《山海經圖》, 胡文煥, Ming (1596–1650) — Wikimedia Commons, *狍鴞.jpg* |
| jingwei | 精衛 | 《古今圖書集成·禽蟲典》精衛圖, 陳夢雷 et al., Qing 1700–1725 — Wikimedia Commons, *Imperial Encyclopaedia - Animal Kingdom - pic130 - 精衛圖.svg* |

Framing: `tools/frame.py` crops the plate (`--levels` for a scan on toned
paper), multiplies it onto a warm paper ground with grain, and adds the red
seal. The line is the woodcut's own. Each creature's `art_caption` names
the edition under the picture on the card.

## Items — drawn for Lingjing

`items/*.svg` are ink-style drawings made for the game (SVG brushwork). No
outside source.
