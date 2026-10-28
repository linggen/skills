#!/usr/bin/env python3
"""paint-places.py — one backdrop painting per PLACE of 卷一, by the LOCAL FLUX.

    python3 tools/paint-places.py --seeds 11,23,47 --out DIR                 # a review round, every place, by day
    python3 tools/paint-places.py --only shiao-home,chaifang --night --seeds 23 --out DIR

The stage paints a picture under the story (paint-backdrop.py): by default the weather's.
Hanli approved 2026-10-15 (「go indoors images, as your recommendation」) a painting per place,
so the background moves when the scene does — 讲经堂 looks like 讲经堂. A set piece or a beast's
出场 still wins over it; a place without one falls back to the weather's painting. Each place
says whether it is a room (`indoor`): outdoors the weather, season and wind layers draw on top,
indoors only a faint seasonal tint. Night variants only where the story spends nights; the
others are darkened by code.

One hand with the weather set (chendingshan.webp's look: ink and light watercolour on warm aged
rice paper), but richer and livelier — Hanli's taste lesson of 2026-10-15: he preferred the
fuller paintings, a small seal or signature welcome, over sparse rule-correct redos. Wide 3:2
stage, the lower third quiet (the story lines sit there). 今线 (沂州中医药大学) is modern
buildings in the same ink style. No people; no text beyond a seal.

FLUX.2 klein 4B through mflux (paint-backdrop.py's recipe; HF_HOME ~/.linggen/models/hf-hub,
offline, nothing downloaded), English prompt only. Each render waits until no other
mlx_picture.py is running (another painter may share the machine). Output 1536×1024, webp q84.
"""
# The kept picks (2026-10-15, round r1 of seeds 11 and 23; picked by the builder's coordinator for Hanli, who
# delegated it): '<place>': seed → worlds/jiuding/art/places/<place>.webp; `night` → <place>-night.webp, the same seed
# with the NIGHT line (--night), which keeps the day picture's composition.
KEPT = {
    'shiao': {'seed': 11, 'round': 'r1'},
    'shiao-home': {'seed': 11, 'round': 'r1', 'night': True},
    'shiao-zaojian': {'seed': 11, 'round': 'r1'},
    'shiao-chaiduo': {'seed': 11, 'round': 'r1', 'night': True},
    'mengshan': {'seed': 11, 'round': 'r1'},
    'heisong': {'seed': 11, 'round': 'r1'},
    'duanbei': {'seed': 23, 'round': 'r1'},
    'heisong-creek': {'seed': 11, 'round': 'r1'},
    'heisong-cliff': {'seed': 23, 'round': 'r1'},
    'yingu': {'seed': 23, 'round': 'r1'},
    'yingu-cave': {'seed': 23, 'round': 'r1', 'night': True},
    'shanmen': {'seed': 11, 'round': 'r1'},
    'songlin': {'seed': 11, 'round': 'r1'},
    'houshan': {'seed': 11, 'round': 'r1'},
    'sishui-shimen': {'seed': 11, 'round': 'r1'},
    'yanwu': {'seed': 11, 'round': 'r1'},
    'yaoyuan': {'seed': 11, 'round': 'r1', 'night': True},
    'zhengdian': {'seed': 11, 'round': 'r1'},
    'jiangtang': {'seed': 11, 'round': 'r1'},
    'chaifang': {'seed': 11, 'round': 'r1', 'night': True},
    'chaifang-back': {'seed': 11, 'round': 'r1'},
    'waimen': {'seed': 11, 'round': 'r1'},
    'waimen-dorm': {'seed': 23, 'round': 'r1', 'night': True},
    'mijing-shishi': {'seed': 11, 'round': 'r1'},
    'mijing-cliff': {'seed': 11, 'round': 'r1'},
    'jin-track': {'seed': 23, 'round': 'r1'},
    'jin-court': {'seed': 11, 'round': 'r1'},
    'jin-gym': {'seed': 11, 'round': 'r1'},
    'jin-stacks': {'seed': 11, 'round': 'r1', 'night': True},
    'jin-ward': {'seed': 11, 'round': 'r1'},
    'jin-night': {'seed': 11, 'round': 'r1', 'night': True},
    # r2 (2026-10-27, the places with no painting; picked by the builder's coordinator for Hanli): 渡口 first.
    'dukou': {'seed': 47, 'round': 'r2'},
    'pengcheng': {'seed': 23, 'round': 'r2'},
    'sishui': {'seed': 11, 'round': 'r2'},
    'sibei': {'seed': 11, 'round': 'r2'},
    'yunlong': {'seed': 11, 'round': 'r2'},
    'huaidu': {'seed': 11, 'round': 'r2'},
    'yiqiao': {'seed': 11, 'round': 'r2'},
    'sikou': {'seed': 11, 'round': 'r2'},
    'lvliang': {'seed': 11, 'round': 'r2'},
    'peize': {'seed': 11, 'round': 'r2'},
    'weishan': {'seed': 11, 'round': 'r2'},
    'xushan': {'seed': 11, 'round': 'r2'},
    'daye': {'seed': 11, 'round': 'r2'},
    'fuli': {'seed': 11, 'round': 'r2'},
    'kongsang': {'seed': 11, 'round': 'r2'},
    'siyuan': {'seed': 11, 'round': 'r2'},
    'shanlu': {'seed': 11, 'round': 'r2'},
    'fangshi': {'seed': 11, 'round': 'r2'},
    'cangjing': {'seed': 11, 'round': 'r2'},
    'fantang': {'seed': 11, 'round': 'r2'},
    'zhishi': {'seed': 11, 'round': 'r2'},
    # r2, the other eight provinces (2026-10-27; picked by the builder's coordinator for Hanli), one province a batch.
    'ye': {'seed': 11, 'round': 'r2'},
    'hebo': {'seed': 11, 'round': 'r2'},
    'zhangyuan': {'seed': 11, 'round': 'r2'},
    'taihang': {'seed': 11, 'round': 'r2'},
    'fajiu': {'seed': 11, 'round': 'r2'},
    'zhuolu': {'seed': 11, 'round': 'r2'},
    'jieshi': {'seed': 11, 'round': 'r2'},
    'hengshan': {'seed': 11, 'round': 'r2'},
    'ye-sanlao': {'seed': 11, 'round': 'r2'},
    'liuwan': {'seed': 11, 'round': 'r2'},
    'zhangnan': {'seed': 23, 'round': 'r2'},
    'ye-caifeng': {'seed': 23, 'round': 'r2'},
    'ye-xiangzhu': {'seed': 23, 'round': 'r2'},
    'ye-kezhan': {'seed': 23, 'round': 'r2'},
    'yunmeng': {'seed': 11, 'round': 'r2'},
    'junshan': {'seed': 11, 'round': 'r2'},
    'dongting': {'seed': 11, 'round': 'r2'},
    'xiangshui': {'seed': 11, 'round': 'r2'},
    'jingshan': {'seed': 11, 'round': 'r2'},
    'wuxia': {'seed': 11, 'round': 'r2'},
    'chengdu': {'seed': 11, 'round': 'r2'},
    'lidui': {'seed': 11, 'round': 'r2'},
    'minshan': {'seed': 11, 'round': 'r2'},
    'jiangzhou': {'seed': 11, 'round': 'r2'},
    'baoxie': {'seed': 11, 'round': 'r2'},
    'weishui': {'seed': 11, 'round': 'r2'},
    'jixia': {'seed': 11, 'round': 'r2'},
    'liubo': {'seed': 11, 'round': 'r2'},
    'taishan': {'seed': 11, 'round': 'r2'},
    'chengshan': {'seed': 11, 'round': 'r2'},
    'laoshan': {'seed': 11, 'round': 'r2'},
    'pushui': {'seed': 11, 'round': 'r2'},
    'puyang': {'seed': 11, 'round': 'r2'},
    'sangjian': {'seed': 11, 'round': 'r2'},
    'leize': {'seed': 11, 'round': 'r2'},
    'leiyuan': {'seed': 11, 'round': 'r2'},
}

import argparse, json, os, subprocess, time
from pathlib import Path

PY = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
SCRIPT = Path.home() / '.linggen/runtime/mlx_picture.py'
MODEL = 'ar9av/FLUX.2-klein-4B-mflux-4bit'
W, H = 1536, 1024

STYLE = ('A Chinese ink-and-light-watercolour painting on warm aged rice paper: loose wet ink washes and lively xieyi brushwork '
         'with some fine ink linework, not a tight line drawing; expressive strokes, soft grey washes, muted mineral colours (pale blue-green, ochre, rust, indigo), visible paper grain, '
         'rich atmosphere and depth, generous empty space, like a plate from a finely illustrated old Chinese novel; a small red '
         'artist\'s seal in a corner is fine. No people, no figures, no animals. No text, no letters, no calligraphy except the small seal; '
         'no border, no frame.')
OLD = 'Set in old China, Ming dynasty, not Japanese, not Western.'
NEW = 'Set in a present-day northern Chinese city, drawn in the old ink style; modern buildings, no cars in focus, no signs with readable text.'
STAGE = ('Wide 3:2 composition like a stage set: the interest sits in the upper two thirds; the bottom third of the picture is quiet '
         'and plain — empty ground, floor or water, nothing in it.')
NIGHT = ('It is night over the WHOLE picture: everything washed in deep dark blue-black ink, lit only by faint cold moonlight or a '
         'small warm lamp glow where said; no bright paper anywhere.')

# id → (area, zh label, indoor, night?, prompt). Areas make the contact sheets. `night` = the story spends nights here.
PLACES = {
  # 石坳村
  'shiao':         ('shiao', '石坳村', False, False, 'A poor mountain village at the foot of Mount Meng: a few thatched mud-walled cottages with little fenced yards, an old pagoda tree with a spreading crown at the village mouth, a stone well, a dirt lane, a vegetable patch, smoke from one chimney, green hills and a steep mountain behind.'),
  'shiao-home':    ('shiao', '石坳村 · 家中', True, True, 'Inside a very poor hunter\'s thatched cottage: a mud-brick kang bed with a worn quilt, a wooden chest, a crooked door, a small paper window, a hunting bow and a skinning knife hung on the mud wall, a row of basins on the floor catching drips from the leaking roof, an oil lamp on a low table, rafters and straw above.'),
  'shiao-zaojian': ('shiao', '石坳村 · 灶间', True, False, 'Inside a poor village kitchen: a big mud-brick stove with an iron wok and a wooden lid, a bellows, firewood stacked by the stove, a water vat, a few bowls on a shelf, a tiny oil lamp, a small paper window, soot on the walls, steam rising.'),
  'shiao-chaiduo': ('shiao', '石坳村 · 屋后柴垛', False, True, 'Behind a thatched cottage at the foot of the mountain: a big tall woodpile of stacked firewood against the back mud wall, a chopping block with an axe, a low fence, an old tree, dark pine hills and the mountain beyond, a wide open sky.'),
  # 蒙山 · 黑松岭 · 银叶谷
  'mengshan':      ('mengshan', '蒙山 · 前山', False, False, 'The front slopes of Mount Meng: grassy hillsides and scrub, a hunter\'s narrow path climbing among rocks and a few pines, layered green mountains rising behind into the sky.'),
  'heisong':       ('mengshan', '黑松岭', False, False, 'Black Pine Ridge: a dark, dense, ancient forest of black pines on a steep ridge, twisted trunks, deep shadow between them, a faint game trail, hanging mist, rugged crags above; wild and forbidding.'),
  'duanbei':       ('mengshan', '黑松岭 · 断碑', False, False, 'At the edge of a dark black-pine forest, a tall old stone stele broken in half stands by a faint path, moss and vines on it, its top half fallen in the grass; the dark ridge rises behind, forbidding.'),
  'heisong-creek': ('mengshan', '黑松岭 · 谷口溪边', False, False, 'A clear mountain creek at the mouth of a valley under black pines: water running over smooth stones, ferns and reeds on the banks, a small pool, the valley opening into misty ridges beyond.'),
  'heisong-cliff': ('mengshan', '黑松岭 · 崖下', False, False, 'At the foot of a sheer dark cliff on a pine ridge: a towering rock face with cracks and clinging pines, fallen boulders and scree at its base, roots and moss, the sky a narrow strip above.'),
  'yingu':         ('mengshan', '银叶谷', False, False, 'A hidden secluded valley of silver-leaved trees: pale shimmering silvery leaves, a shallow hollow in the ground among grass and ferns, soft mist, steep mountain walls around, an unearthly calm and quiet beauty.'),
  'yingu-cave':    ('mengshan', '银叶谷 · 石洞', True, True, 'Inside a shallow rock cave in a mountain valley, looking out through the cave mouth: rough stone walls and ceiling, a small campfire of twigs on the stone floor, a bundle and a folded coat by it, and through the arched mouth the misty valley and silver-leaved trees outside.'),
  # 沉鼎观 (outside)
  'shanmen':       ('chending-out', '沉鼎观 · 山门', False, False, 'The mountain gate of an old Taoist temple: a weathered stone paifang gate at the top of a long steep flight of stone steps, a cliff wall beside the steps carved with rows of old characters worn smooth, ancient pines, clouds below, temple roofs glimpsed above.'),
  'songlin':       ('chending-out', '沉鼎观 · 山门外的林子', False, False, 'A deep old forest outside a mountain temple gate: tall straight pines and old oaks, dappled light, ferns and mossy rocks, a winding footpath vanishing into the wood, mist between the trunks.'),
  'houshan':       ('chending-out', '沉鼎山 · 后山崖顶', False, False, 'A high cliff top behind the temple mountain: a flat bluestone slab swept clean, a small thatched hut with a half-open door, a gnarled pine leaning out over the drop, a sea of clouds and far peaks below, a great open sky.'),
  'sishui-shimen': ('chending-out', '泗水 · 秘境石门', False, False, 'A wide river shrunk to a thin line in its bed, vast glistening mud flats on both banks, and standing on the mud in a river bend a tall square ancient stone door, dark and mysterious, carved with worn patterns; the temple mountain on the far bank.'),
  'yanwu':         ('chending-out', '外门演武场 · 五行台', False, False, 'A temple training ground: a broad packed-earth courtyard, in its middle a low round platform of five bluestone slabs with grass in the seams, four ancient cypress trees at the corners, weapon racks, temple halls with grey-tiled upturned eaves around.'),
  'yaoyuan':       ('chending-out', '沉鼎观 · 药园', False, True, 'A temple herb garden on a mountain terrace: neat terraced beds of medicinal herbs and flowers, a bamboo fence and gate, a small tool shed, a stone path, a trellis, pines and mountain peaks behind.'),
  # 沉鼎观 (inside the walls)
  'zhengdian':     ('chending-in', '沉鼎观 · 正殿', True, False, 'Inside the great main hall of an old Taoist temple: massive red-lacquered columns, dim light from tall lattice doors, no statue, only an empty square stone pedestal in the middle with a darker patch on top, a few round straw cushions, a test stone, incense haze, high dark beams.'),
  'jiangtang':     ('chending-in', '沉鼎观 · 讲堂', True, False, 'Inside an old temple lecture hall: three bays under grey tile, rows of low wooden desks and straw cushions, a raised dais with a lectern at the front, tall lattice windows letting in slanting light, old elm beams, a small bronze tripod incense burner, scrolls on shelves.'),
  'chaifang':      ('chending-in', '沉鼎观 · 柴房', True, True, 'Inside a small temple woodshed turned into a room: firewood stacked to the rafters along one wall, a narrow plank bed, a small clay furnace with a faint glow, a rough wooden door, a little paper window, tools hung on pegs, straw on the floor.'),
  'chaifang-back': ('chending-in', '沉鼎观 · 柴房后面', False, False, 'The back yard behind a temple woodshed: muddy ground, a big woodpile and a chopping block, a stone wall, an old locust tree, the grey-tiled roofs of the temple and the mountain behind.'),
  'waimen':        ('chending-in', '沉鼎观 · 外门', False, False, 'The outer court of a mountain temple: a stone-paved courtyard, simple disciple dormitories and a refectory with grey-tiled roofs, an old locust tree, a wooden notice board on posts, a covered walkway, the mountain peaks behind.'),
  'waimen-dorm':   ('chending-in', '沉鼎观 · 外门 · 大通铺', True, True, 'Inside a long temple dormitory: a long communal sleeping platform with rolled quilts in a row, wooden pillars, a window at the far end, a door, a few bundles and sandals on the floor, plain whitewashed walls.'),
  # 沉鼎秘境 — underground, its own dim light
  'mijing-shishi': ('mijing', '沉鼎秘境 · 石室', True, False, 'Inside an ancient sealed stone chamber deep underground: walls of fitted stone carved with faded diagrams of the five elements, a low mound of earth in the middle, a faint glow from cracks, dust in the air; mysterious and silent.'),
  'mijing-cliff':  ('mijing', '沉鼎秘境 · 崖壁', True, False, 'Inside a vast dim underground secret realm: a sheer cliff wall rising into darkness, a deep black chasm below its edge, thin seeping water lines on the rock, strange faint lights in the dark; eerie and immense.'),
  # 徐 · the open map of 卷一 (2026-10-27: places with no painting fell back to the 节气's; Hanli at 渡口:
  # 「背景图片啥的不太匹配吧」). Each from the place's own `line` (places/xu.json).
  'dukou':         ('xu-river', '渡口', False, False, 'A small ferry landing on a wide river at the foot of a temple mountain: an old wooden ferry boat tied by a rope to a thick weathered wooden mooring post at the water\'s edge, a paper lantern hanging lit from the top of the post, a few worn stone steps and a little plank jetty down to the water, reeds on the bank, the broad river flowing past, a stone path climbing the green mountain behind toward temple roofs in mist.'),
  'sishui':        ('xu-river', '泗水岸', False, False, 'The south bank of a broad slow river: dense reeds taller than a man along the shore, their plumes bending, a muddy path through them to the water, the wide river and a misty far bank, willows, a pale open sky.'),
  'sibei':         ('xu-river', '泗水北岸', False, False, 'The north bank of a river in thick lingering mist: a rutted dirt road leading north away from the water into the fog, bare willows and a few reeds, the river grey behind, faint hills beyond, everything soft and half hidden.'),
  'pengcheng':     ('xu-town', '彭城', False, False, 'An old walled city on a river plain: a tall rammed-earth wall with a great south gate tower, and just inside it a busy market street of grey-tiled shops with cloth awnings, banners on poles, carts, the river and hills beyond.'),
  'yunlong':       ('xu-hills', '云龙山', False, False, 'A long low hill shaped like a sleeping dragon, its ridge rising and falling in curves, pines and rocks along the spine, on the top a flat smooth stone slab like a bed under an old pine, drifting clouds, a city wall faint below.'),
  'huaidu':        ('xu-river', '淮水渡口', False, False, 'A ferry crossing on a great wide river: a single old wooden ferry boat with a pole at a simple plank landing, a straw-roofed shelter on the bank, a wide sweep of water to a far low shore, gulls, willows, a vast pale sky.'),
  'yiqiao':        ('xu-town', '圯桥', False, False, 'An old arched stone bridge over a small river beside an ancient town: worn steps, moss on the stones, willows hanging over the water, the town\'s grey roofs and a wall behind, quiet and timeless.'),
  'sikou':         ('xu-river', '泗口', False, False, 'Where two great rivers meet: the waters collide in swirling eddies of two colours, small boats moored with their oars shipped in a sheltered cove, a reed shore, a riverside village of a few huts on stilts, mist on the far side.'),
  'lvliang':       ('xu-river', '吕梁洪', False, False, 'The wildest rapids of a river: jagged dark rocks like a forest of teeth jutting from white roaring water, spray and foam, steep rocky banks with clinging pines, a narrow gorge, thunderous and dangerous.'),
  'peize':         ('xu-marsh', '沛泽', False, False, 'A vast marsh stretching to the horizon: endless reeds and sedges, winding channels of still water, a narrow hidden path snaking through the reeds, herons, low mist, a wide grey sky.'),
  'weishan':       ('xu-marsh', '微山湖', False, False, 'A great lake covered with lotus as far as the eye can see, broad round leaves and pink blossoms, a small wooded island in the middle of the lake with an old grave mound and a stone stele under trees, a little boat among the lotus, soft haze.'),
  'xushan':        ('xu-hills', '徐山', False, False, 'A tall solitary mountain on a plain, its summit always wrapped in a band of white cloud, steep green slopes, pines and crags, a path winding up, small fields and villages at its foot.'),
  'daye':          ('xu-marsh', '大野泽', False, False, 'An immense wild marsh without end: reed beds, pools reflecting the sky, low islands of grass, a few dead trees, flocks of wild birds rising, an ancient hunting ground, lonely and vast.'),
  'fuli':          ('xu-hills', '凫丽山', False, False, 'Eerie wooded hills: twisted old trees and dark rock outcrops, a narrow valley full of grey mist, a faint path, nothing living in sight, an uneasy hush, something unseen in the hollows.'),
  'kongsang':      ('xu-hills', '空桑', False, False, 'A single enormous ancient mulberry tree with a hollow trunk split open like a cave, gnarled roots and spreading branches with green leaves, standing alone in a quiet field by a stream, a few stones around it.'),
  'siyuan':        ('xu-river', '泗渊', False, False, 'A deep dark pool in a river under an old city wall: still black-green water, a steep stone bank, a rotted old wooden pulley frame and a broken rope end hanging over the water, the city\'s gate tower above, unsettling depth.'),
  'shanlu':        ('chending-out', '上山路', False, False, 'A narrow stone path climbing a mountainside toward a temple: worn uneven stone steps, deep ditches on either side, thick tall grass and shrubs pressing in, pines, the temple roofs high above in mist.'),
  'fangshi':       ('chending-out', '沉鼎山下 · 坊市', False, False, 'A small market street at the foot of a mountain: one lane of wooden stalls and shopfronts with grey-tiled roofs and cloth awnings, bundles of yellow talisman paper, baskets of herbs and radishes, the biggest shop with an abacus on its counter, the mountain and its temple above.'),
  'cangjing':      ('chending-in', '沉鼎观 · 藏经阁', True, False, 'Inside an old temple scripture library: tall dark wooden shelves of scrolls and thread-bound books, a narrow wooden staircase climbing to upper floors, at its top a heavy door with a green-patinated bronze lock, dust in shafts of light from a lattice window.'),
  'fantang':       ('chending-in', '沉鼎观 · 饭堂', True, False, 'Inside a plain temple refectory: long wooden tables and benches, coarse rice in wooden buckets and a basket of radishes, an elm-wood table by the door with a ledger on it, a big stove at the back with steam, grey walls.'),
  'zhishi':        ('chending-in', '沉鼎观 · 执事堂', True, False, 'Inside a bare temple stewards\' room: no statue, plain walls, on one wall rows of small black ebony wooden tags hanging from pegs, a plain desk and stool, light from a lattice door, quiet and orderly.'),
  # The other eight provinces (2026-10-27): every place a painting of its own, from its `line` (places/<province>.json).
  'zhangnan': ('ji', '漳水南岸', False, False, 'The south bank of a broad muddy yellow river: churning ochre water, a low sandy bank with sparse reeds, on the far north shore the long grey rammed-earth wall of an old Chinese city with a gate tower and tiled roofs, the river surface swelling oddly as if something huge breathes beneath.'),
  'ye': ('ji', '邺城', False, False, 'An old walled city on a yellow river: a tall gate in a rammed-earth wall with a paper notice pasted beside it, through the gate a market street of grey-tiled shops with awnings to the east, willows, the river beyond.'),
  'hebo': ('ji', '河伯祠', False, False, 'A small river-god shrine at the water\'s edge: a weathered tiled shrine with red pillars, a great heap of grey incense ash piled before it, faded red cloth streamers, stone steps going straight down into the muddy yellow river.'),
  'zhangyuan': ('ji', '漳渊', False, False, 'The deepest dark pool of a river behind a shrine: still, very dark green-black water in a steep-banked bend, no boats at all, a faint golden haze rising from the surface, gnarled willows, foreboding silence.'),
  'taihang': ('ji', '太行山口', False, False, 'A narrow pass through the towering Taihang mountains: sheer layered cliffs on both sides, a stony road winding up between them, a lone watchtower, folds of ridges fading into the distance.'),
  'fajiu': ('ji', '发鸠山', False, False, 'A mountain covered in thorny cudrania trees with small leaves, rocky slopes, and in the sky a small bird with a patterned head and white beak flying east holding a pebble, the far horizon toward the sea.'),
  'zhuolu': ('ji', '涿鹿之野', False, False, 'An ancient battlefield plain: wide windswept grassland under a heavy sky, a few broken bronze halberds and old earth mounds half buried in the grass, distant mountains, a solemn emptiness.'),
  'jieshi': ('ji', '碣石', False, False, 'A great rocky headland above the sea: tall weathered stone pillars and crags, waves breaking white far below, a vast grey-blue sea to the horizon, wind-bent pines on the rock.'),
  'hengshan': ('ji', '恒山', False, False, 'The Northern Peak: steep grey cliffs with a band of cloud around the mountain\'s waist, a temple with upturned eaves clinging to the cliff inside the clouds, pines, a stone stair.'),
  'ye-doufu': ('ji', '邺城 · 城西豆腐坊', False, False, 'A narrow old city lane of bare grey plaster walls at early morning: a plain weathered wooden door frame with rows of short black charcoal tally strokes on its post, a stone grinding mill and big wooden tubs of steaming soy milk by the open door, steam drifting along the lane, grey-tiled eaves overhead. Bare walls: no couplets, no signboards, no writing anywhere.'),
  'ye-caifeng': ('ji', '邺城 · 城南裁缝铺', True, False, 'Inside a small old Chinese tailor\'s shop of wood and plaster: a long low cutting table with bolts of silk, scissors and a bamboo measuring rule, and on a wooden rack a traditional Chinese red bridal robe with wide sleeves and gold embroidery, a wooden paper-lattice window, threads and spools on shelves; no Western dresses.'),
  'ye-xiangzhu': ('ji', '邺城 · 香烛铺', True, False, 'Inside an old Chinese incense and candle shop of dark wood: shelves stacked with bundles of incense sticks and red candles, a red Chinese drum and bamboo pipes hung on the wall, a wooden counter with a few small pieces of carved green jade on a cloth, smoke curling in dim light; no clocks, no lamps on the wall.'),
  'ye-kezhan': ('ji', '邺城 · 城东客栈', False, False, 'The back yard of an old city inn: a stone well with a wide flat rim, a wooden bucket and rope, a back door with a lantern, a kitchen window with a small steaming bowl on the sill, grey-tiled roofs and an old tree.'),
  'ye-sanlao': ('ji', '邺城 · 三老宅', False, False, 'The deserted courtyard of a great old mansion: a tall gate standing open and unguarded, a wide stone-paved court, empty wooden chests left open on the ground, grand halls with upturned eaves behind, weeds between the stones.'),
  'liuwan': ('ji', '柳湾', False, False, 'A small fishing village on a river bend: a row of old willows leaning along the bank, a few thatched huts, fishing nets drying on poles, small boats pulled up on the mud, the river flowing away downstream into haze.'),
  'yunmeng': ('jing', '云梦泽', False, False, 'A vast southern marsh: reeds far taller than a man in endless ranks, winding channels of still water, waterbirds, mist over the wetland, a distant low line of hills.'),
  'ying': ('jing', '郢', False, False, 'The old capital of Chu at dawn before the market opens, deserted: a great city gate and wall in the distance, and in front a row of empty market stalls under lacquered eaves with baskets of bright feathers, bundles of hides, a few ivory tusks and bowls of red cinnabar left out on the counters. No people at all; no shop signs, no signboards, no banners with writing.'),
  'junshan': ('jing', '君山', False, False, 'A small green island hill in a great lake: groves of spotted bamboo with mottled stems, a little shrine among them, the wide lake around, soft rain-haze.'),
  'dongting': ('jing', '洞庭深处', False, False, 'The heart of a vast lake: open water on every side, gentle swells, a low dark shape of something enormous like a turtle\'s shell just under the surface, mist and pale light, no shore in sight.'),
  'xiangshui': ('jing', '湘水', False, False, 'A clear river flowing north toward a great lake: on its bank in the distance a small old shrine with red pillars and a tiled roof, spotted bamboo groves, a misty far shore.'),
  'jingshan': ('jing', '荆山', False, False, 'Rugged wooded mountains in the south: rocky ravines, a stream, an old miner\'s path, a big cracked boulder showing pale jade-green stone inside, pines and mist.'),
  'wuxia': ('jing', '巫峡', False, False, 'A deep river gorge: towering sheer cliffs on both sides leaving only a thin strip of sky, a dark river below, drifting cloud and fine rain clinging to the peaks, a tiny boat far down.'),
  'minjiang': ('liang', '岷江', False, False, 'A swift river coming down from distant snow-capped mountains, on a rocky bank a weathered grey stone statue of a rhinoceros, plainly carved stone on a low stone plinth, facing the water, willows, bamboo, the wide valley.'),
  'chengdu': ('liang', '成都', False, False, 'A prosperous old southwestern city: a market street hung with colourful brocade cloth on poles, a silversmith\'s shop with a small anvil, hibiscus trees, grey-tiled roofs, a river and misty hills. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'lidui': ('liang', '离堆', False, False, 'An ancient irrigation cut: a hill sliced through by a narrow channel, the river dividing in two around a long stone fish-mouth levee, bamboo-cage weirs, mountains behind.'),
  'shiniu': ('liang', '石纽', False, False, 'A secluded mountain hollow: steep green slopes, a small clear round pool among mossy rocks, a plain weathered standing stone beside it, bare, with no writing, ferns, a stream falling in from above, mist.'),
  'minshan': ('liang', '岷山', False, False, 'High snow mountains: white peaks above dark forested slopes, a young river springing from a valley and running out between the ridges, clouds below the summits.'),
  'jiangzhou': ('liang', '江州', False, False, 'A hillside city above the meeting of two great rivers: stilt houses climbing steep slopes, long stone stairs down to the water, two rivers of different colours joining below the walls, boats, mist.'),
  'baoxie': ('liang', '褒斜道', False, False, 'An ancient plank road along a sheer cliff in the mountains: wooden beams driven into holes in the rock one after another carrying a narrow boardwalk, a rushing river far below, layered mountains.'),
  'weishui': ('qing', '潍水', False, False, 'A calm river flowing east under a wide sky: on the grassy bank a lone fishing rod with a straight hook resting on a stone by a straw mat, willows, a few distant hills.'),
  'linzi': ('qing', '临淄', False, False, 'The old capital of Qi, seen at a quiet hour with nobody about: a great city gate, outside it a quiet academy of halls with upturned eaves among trees, inside the gate a busy market lane, grey walls. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'jixia': ('qing', '稷下', False, False, 'An ancient academy under a city gate: a courtyard with open halls, rows of low mats and writing desks, bamboo-slip books, an old tree, the gate tower behind. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'penglai': ('qing', '蓬莱', False, False, 'A mirage city on the sea at dawn: Chinese palace halls with upturned eaves, pagodas and pavilions floating above the waves in a luminous haze, a rocky shore below with pines, a pale pink sky.'),
  'liubo': ('qing', '流波山', False, False, 'A strange mountain far out in the open sea at low tide: its rocky root exposed above shining wet sand and pools, waves around, the peak rising into sea mist, no land in sight.'),
  'taishan': ('qing', '泰山', False, False, 'The great sacred mountain: steep stone stairs climbing past pines and gates to a summit with temples, a sea of clouds below, the sunrise and a distant glint of the sea.'),
  'langya': ('qing', '琅琊台', False, False, 'A high terrace on a coastal hill: an old weathered stone stele, its face worn almost smooth by wind, only faint shallow marks, no legible characters, a broad earthen platform, the wide sea below, wind and grass.'),
  'chengshan': ('qing', '成山头', False, False, 'The easternmost cape: jagged cliffs plunging into the sea, waves crashing, a few rocks standing offshore, the sun rising from the sea on the horizon.'),
  'laoshan': ('qing', '崂山', False, False, 'A rocky mountain rising straight from the sea: granite peaks and boulders, pines, a small Taoist temple tucked in a ravine, waves breaking at its foot, sea mist.'),
  'pushui': ('yan', '濮水', False, False, 'A clear river under a long line of mulberry trees along the bank, the water bright, fields beyond, a strange flash of lightning in a clear eastern sky.'),
  'puyang': ('yan', '濮阳', False, False, 'An old city of Wei: a city gate with mulberry trees outside, a notice pasted beside the door, a market lane within, grey-tiled roofs, plain fields. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'sangjian': ('yan', '桑间', False, False, 'Deep in a grove of mulberry trees where a river bends: dappled green shade, baskets left under the trees, the river curving past, soft and lyrical.'),
  'leize': ('yan', '雷泽', False, False, 'A great lake under a stormy sky: flashes of white light on the water, rolling dark clouds, reeds on the shore, a small old fishing boat pulled up.'),
  'leiyuan': ('yan', '雷泽深处', False, False, 'The middle of a vast lake under a thundering sky: open dark water, lightning reflected on it, ripples spreading as if something below were drumming, no shore in sight.'),
  'zhenze': ('yang', '震泽', False, False, 'A huge lake swollen high: flooded willows and drowned field banks at its edge, small boats, wide grey water, low green hills in mist.'),
  'gusu': ('yang', '姑苏', False, False, 'An old water city of the south: a great gate tower, outside it a canal crowded with wooden boats moored side by side, arched stone bridges, white walls and grey roofs, a market inside. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'kuaiji': ('yang', '会稽山', False, False, 'A quiet sacred mountain in the south: green forested slopes, an ancient shrine and stone tomb gate among old trees, bamboo, mist.'),
  'yuxue': ('yang', '禹穴', True, False, 'Inside the mouth of a dark mountain cave looking out: rough rock walls, moss, a narrow opening to green misty hills outside, water dripping.'),
  'guangling': ('yang', '广陵', False, False, 'An old city wall beside a long straight canal: boats on the canal, an earthen rampart, willows, flat land to a broad river on the horizon.'),
  'pengli': ('yang', '彭蠡', False, False, 'A wide lake in winter: shallow water and mudflats, huge flocks of wild geese settling and rising, reeds, pale low hills, a cold clear sky.'),
  'qiantang': ('yang', '钱塘', False, False, 'A river mouth with a great tidal bore: a wall of white water rolling up the estuary, spray, an embankment and a pagoda on a hill, a wide sky.'),
  'weihe': ('yong', '渭水', False, False, 'A dried-up river bed on the loess plain: cracked mud, a thin trickle in the middle, bleached stones, old willows dying on the bank, dusty yellow hills.'),
  'yongcheng': ('yong', '雍城', False, False, 'An old northwestern capital of rammed-earth walls: a plain gate, a market inside with stalls of jade and red stones, yellow loess hills, a dry wind. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'taihua': ('yong', '太华山', False, False, 'A towering mountain of sheer granite cut square on four sides, impossibly high and bare, no birds, clouds clinging to its walls, a tiny path far below.'),
  'chencang': ('yong', '陈仓', False, False, 'A small old shrine on a northern slope above a river: a weathered stone sitting in the shrine, pines, dusk light, loess terraces, the river below.'),
  'qianlai': ('yong', '钱来山', False, False, 'A mountain with pines on its upper slopes and pale smooth stones scattered in a stream below, rocky ridges, a clear sky.'),
  'qishan': ('yong', '岐山', False, False, 'A gentle sacred mountain above a fertile plain: terraced fields, an old ancestral temple among cypresses, and high above a phoenix-like bird gliding in the clouds.'),
  'longshan': ('yong', '陇山', False, False, 'A high mountain ridge where a small spring splits and runs down both sides, a lonely road over the pass, wind-bent grass, endless folding mountains.'),
  'hangu': ('yu', '函谷关', False, False, 'An ancient pass between two steep mountains: a narrow deep road in a gorge, a fortified gate tower across it, a keeper\'s small hut, mist.'),
  'luoyi': ('yu', '洛邑', False, False, 'The old royal capital: a great city with palace halls, and in a stone-paved square nine square stone pedestals standing empty in a row, a river beside the city. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  'heshan': ('yu', '和山', False, False, 'A mountain where nine streams rise from springs and join into one river flowing north, cascades and pools, green hills, mist.'),
  'luoshui': ('yu', '洛水', False, False, 'A calm river at night under a full moon reflected as a single moon on the water, willows, a faint far bank, a tortoise on a stone by the water.'),
  'yique': ('yu', '伊阙', False, False, 'A river flowing between two steep hills facing each other like a gate, cliffs carved with small niches, the river bright between them.'),
  'songshan': ('yu', '嵩山', False, False, 'The Central Peak: layered rocky mountains, a temple among pines at the foot, and a huge boulder split cleanly in two beside the path.'),
  'dingtao': ('yu', '定陶', False, False, 'A busy old merchant town on a flat plain: crowded market streets, warehouses, carts and boats on a canal, grey-tiled roofs, a sense of trade and plenty. The street is empty, no people at all; no shop signs, no signboards, no banners with writing.'),
  # 今线 · 沂州中医药大学
  'jin-track':     ('jin', '沂中医 · 体育场 (scape track)', False, False, 'A university sports field: a red running track around a green football pitch, a low concrete grandstand, floodlight towers, teaching buildings and trees beyond.'),
  'jin-court':     ('jin', '沂中医 · 体育馆 (scape court)', True, False, 'Inside a university sports hall: a polished wooden basketball court, high steel roof trusses, big windows, folded bleachers along the wall, a hoop at the far end.'),
  'jin-gym':       ('jin', '沂中医 · 学生健身房 (scape gym)', True, False, 'Inside a small student gym: weight racks, a bench press, treadmills by big windows, rubber floor mats, a wall mirror.'),
  'jin-stacks':    ('jin', '图书馆 · 古籍部 (scape stacks/dark)', True, True, 'Inside the rare-books room of a university library: tall wooden shelves of old thread-bound Chinese books in cloth cases, a long reading table with a green-shaded lamp, a window, quiet and dusty.'),
  'jin-ward':      ('jin', '沂中医 · 城里的医院 (scape ward)', True, False, 'Inside a city hospital ward: a white hospital bed with a steel rail, a drip stand, a bedside cabinet with a thermos, a window with thin curtains, clean pale light.'),
  'jin-night':     ('jin', '沂中医 · 一食堂后门 (scape night)', False, True, 'The back door of a university canteen: a loading area with stacked crates and bins, a steel door under a small lamp, steam from a vent, a row of bicycles, plane trees.'),
}


def prompt(pid, night=False):
  _, _, indoor, _, scene = PLACES[pid]
  era = NEW if pid.startswith('jin-') else OLD
  dark = f' {NIGHT}' if night else ''
  return f'{scene}{dark} {STAGE} {era} Style: {STYLE}'


def others():
  # Any other painter job on the machine: a bare mlx_picture render, or another tools/paint-*.py (some run FLUX
  # in-process, so they never show as mlx_picture). Two at once halve each other — a 45 s render took 15 min.
  # Not this job: itself, and the shells that launched it (their command line names this script too).
  mine, pid = set(), os.getpid()
  while pid > 1:
    mine.add(pid)
    pid = int(subprocess.run(['ps', '-o', 'ppid=', '-p', str(pid)], capture_output=True, text=True).stdout.strip() or 1)
  # Only python processes count: a shell that merely mentions a painter (a wait loop, a grep) is not one.
  out = subprocess.run(['pgrep', '-f', r'^[^ ]*python[^ ]* .*(mlx_picture|tools/paint-[a-z0-9-]+\.py)'], capture_output=True, text=True).stdout
  return [p for p in out.split() if int(p) not in mine]


def wait_turn():
  while others():
    time.sleep(2)


def render(p, seed, png):
  wait_turn()
  req = {'model': MODEL, 'prompt': p, 'out': str(png), 'width': W, 'height': H, 'seed': seed, 'reference': None}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(PY), str(SCRIPT)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return r.returncode == 0 and png.exists(), (r.stdout.strip() or r.stderr.strip())[-200:]


def webp(png, out):
  return subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', str(png), '-o', str(out)], capture_output=True).returncode == 0


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--seeds', required=True, help='seeds to roll, e.g. 11,23,47')
  ap.add_argument('--only', default='', help='place ids, comma-separated (default all)')
  ap.add_argument('--night', action='store_true', help='the night variants (only places with night needs, unless --only)')
  ap.add_argument('--out', required=True, help='review folder (PNGs, webps and prompts.json land here)')
  a = ap.parse_args()
  base = Path(a.out)
  base.mkdir(parents=True, exist_ok=True)
  ids = a.only.split(',') if a.only else [k for k, v in PLACES.items() if v[3] or not a.night]
  part = 'night' if a.night else 'day'
  prompts = {f'{i}-{part}': prompt(i, a.night) for i in ids}
  (base / f'prompts-{part}.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n')
  for seed in [int(s) for s in a.seeds.split(',')]:
    for i in ids:
      png = base / f'{i}-{part}-s{seed}.png'
      if png.exists():
        continue
      t = time.time()
      ok, said = render(prompts[f'{i}-{part}'], seed, png)
      print(f'{i}-{part} seed {seed}: {"ok" if ok and webp(png, png.with_suffix(".webp")) else "failed " + said} ({time.time() - t:.0f}s)', flush=True)


if __name__ == '__main__':
  main()
