# 《九鼎录》 English — style sheet

The Chinese is final (tag `jiuding-lu-juan1-zh-v1`). Translate it as it stands: don't improve it, cut it or add to it. One file per book entry, named by the entry's stable id: `en/h01.md` … `en/j01.md` … `en/w01.md`, `en/tuna.md`. book.json's `en` field points at the file; read.js reads it when `lang=en`.

## Shape
- **Paragraph for paragraph.** Each Chinese paragraph becomes one English paragraph, in the same order, with `---` scene breaks where the Chinese has them. Future fixes and the audio are matched paragraph by paragraph.
- **Heading:** `# Chapter Nine: <回目 line 1> / <回目 line 2>` for a 古 回, using book.json `huimu.en` exactly. An interlude is `# Now · 1: <title>`, the prelude `# Later · Prelude: <title>`, and the appendix uses its book.json title.
- Leave out the `<!-- … -->` author notes.
- British spelling (the 回目 already say "Metres", "Colour").

## Markup (keep it working)
- `[字]{注=id}` → `[English word]{注=id}`: translate the bracket and keep the id.
- `《书名》{典=id}` → `*English Title*{典=id}`: keep the id.
- `[字]{音=pīn yīn}` (pinyin aid) → drop the markup and write the English word.
- `{name}`, `{他|她}`-style gender pairs (`{male word|female word}`), `::: 男` / `::: 女` … `:::` blocks, `::: 忆 n` plates: keep them, translating the words inside.
- `**bold**` stays bold.

## Voice
A storyteller's plain voice: short sentences, concrete things, dry humour. Dialogue sounds spoken, not archaic: no "thee", no "verily", no fake-old English. Speech tags follow the Chinese rhythm, but say "said" in English rather than "spoke". Keep Chinese idioms as images where the image carries ("like shouting down an old well"); where it doesn't, give the meaning. Quotes in a classic (道德经 and the like) are translated plainly, with the source named as in the Chinese.

## Names (fixed — use these)
People: 沈小满 Shen Xiaoman (Xiaoman) · 银月 Yinyue (her 本王 → "this queen") · 阿禾 Ahe · 周衡 Zhou Heng · 瞿老 Elder Qu · 观主 the Abbot (玄沉子 Xuanchenzi) · 褚先生 Master Chu · 闵丹师 Pill-master Min · 邓执事 Steward Deng · 钱掌柜 Shopkeeper Qian · 马三 Ma San · 马小宝 Ma Xiaobao · 吴婆婆 Granny Wu · 爹 Father (in speech "Pa") · 娘 Mother (in speech "Ma") · 舅舅 Uncle · 外公 Grandfather (杜子安 Du Zi'an) · 孙二狗 Sun Ergou · 秦雁 Qin Yan · 祁长松 Qi Changsong · 卢方 Lu Fang · 老井 Old Well · 赵昂 Zhao Ang · 司马烈 Sima Lie · 冰夷 Bingyi · 河伯 the River Lord · 老胡 Old Hu · 小豆 Xiaodou · 栓子 Shuanzi.
今线: 沈芒 Shen Mang · 阿禾 / 周禾 Ahe / Zhou He · 马小宝 Ma Xiaobao · 雷老师 Coach Lei · 严老师 Teacher Yan · 葛奶奶 Granny Ge · 眼镜 Specs · 老蔡 Old Cai · 马氏大药房 Ma's Pharmacy · 《养性延命录》 *On Nourishing Life* · 《九鼎真人手札》 *The Notebooks of the Nine Cauldron Adept*.
未来线: 周星星 Zhou Xingxing · 9527 · 灵根 (the ancestor model) Linggen.
Places: 蒙山 Mount Meng · 石坳村 Shi'ao Village · 黑松岭 Black Pine Ridge · 沉鼎观 the Sunken Cauldron Abbey · 太一宫 the Taiyi Palace · 太华山 Mount Taihua · 邺城 Ye · 漳水 the Zhang River · 黄河 the Yellow River · 泗水 the Si River · 柳湾 Willow Bend · 冀州 / 徐州 / 兖州 Ji / Xu / Yan Province · 执事堂 the Stewards' Hall · 丹房 the pill house.
Things: 九鼎 the Nine Cauldrons (鼎 a cauldron) · 木牌 the wooden tablet · 饭桶 the Rice Bucket · 火柴 Matchstick (his sword) · 储物袋 storage pouch · 顺风溜 Tailwind (the shoes) · 灵力 spiritual power · 灵气 spirit qi · 灵石 spirit stones · 灵根 spirit root · 丹 pill · 九转筑基丹 Nine-Turn Foundation Pill · 回春丹 Spring-Return Pill · 聚气丹 Qi-Gathering Pill · 丹田 dantian · 心关 the heart's gate · 心劫 heart tribulation · 入隙 entering the gap · 禹步 the Step of Yu · 九宫 the nine palaces · 洛书 the Luo Writing · 吐纳 breathing out and in (the practice) · 护体灵光 body-guarding light · 神识 spirit sense · 纸鹤 paper crane.
Realms: 练气 Qi Condensation (一层 … 九层 first layer … ninth layer) · 筑基 Foundation Establishment · 结丹 Core Formation · 元婴 Nascent Soul · 化神 Spirit Transformation · 小成 / 中成 / 大成 Lesser / Middle / Great Attainment · 圆满 perfected.
Ranks: 师父 Master · 师兄 / 师姐 senior brother / sister (or the name) · 师叔 Martial Uncle (her: Martial Aunt) · 仙长 Immortal · 执事 steward · 长老 elder · 真传 true disciple · 内门 / 外门 inner / outer sect · 杂役 servants.

A name not on this list: pinyin without tones, or a plain English rendering if the Chinese name is an image (as 老井 is). List every one you add at the end of your report so the next file uses the same name.
