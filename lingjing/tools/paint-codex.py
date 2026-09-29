#!/usr/bin/env python3
"""paint-codex.py — the 图鉴's portraits and things, painted by Codex CLI's image tool.

    python3 tools/paint-codex.py [--only id,id] [--force] [--out DIR]

Hanli, 2026-09-29: Codex (ChatGPT's image model, through the subscription) is
the 图鉴's painter; its silver fox is the HOUSE STYLE — fine graphite and ink
白描 with a soft grey wash on warm aged paper, one subject, nothing else. The
山海经 creatures are painted too (his, 2026-09-29: 「用codex重画山海经吧」) from their
own classical line, every countable feature spelled out — the old woodcut stays
as the entry's 「原图」 (creatures.json `art_plate`). 经脉 · 穴位 figures are painted
WITH their labels (his pick, 2026-09-29), each label checked by eye; the codex
`marks` sit on the painted points.

One job at a time (Codex runs one image per call, ~1–2 min). Resumable: a
subject whose picture is already in the output folder is skipped (paint a review
round into --out, look, then copy the approved ones into art/); at a usage limit
it stops at once instead of retrying. Each picture is
looked at before it ships: right age and look, Chinese dress and setting, no
text, no seal, no seam — re-roll with --force --only <id>. The hero is NEVER
painted. 阿禾 is painted twice: a girl (beside a boy hero) and a boy (beside a
girl hero); codex.json `by_hero` picks.

Output: art/people/<id>.webp (portrait 2:3), art/items/<id>.webp (3:2),
art/creatures/<id>.webp (3:2).
"""
import argparse, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'

STYLE = ('Fine graphite and ink baimiao line drawing with a soft grey wash, on warm aged paper, in the manner of an old '
         'Chinese illustrated book. A single subject, plain empty background. No text, no characters, no calligraphy, '
         'no seal, no signature, no border, no frame.')
OLD_CHINA = 'Set in old rural China (Ming dynasty dress), not Japanese, not Western.'

PEOPLE = {
  'baba': 'An old Chinese mountain hunter in his fifties, hair half white, a kind honest weathered face, patched plain cotton jacket crossed at the front and tied with a cloth sash, cloth wrapped around his left knee, straw sandals, an old sinew-wrapped bow on his back, standing slightly favouring one leg. Full length.',
  'mama': 'A thin Chinese peasant woman in her forties, plain dark cotton jacket crossed at the front, hair in a simple bun under a cloth kerchief, quiet clever watchful eyes, rough hands folded in front of her. Full length.',
  'masan': 'A hulking Chinese village rent collector in his forties, so broad he is wider than a door frame, thick bull neck, coarse sneering face with stubble, plain dark cotton tunic tied with a cloth belt, loose trousers and cloth shoes, a short iron-bound wooden club in one hand. Full length.',
  'maxiaobao': 'A plump spoiled Chinese BOY of fourteen, a round smug boyish face, hair in a small topknot, fine silk robe with a sash, holding a piece of osmanthus cake, a mocking grin. Clearly a young teenage boy. Full length.',
  'ahe-girl': 'A Chinese village girl of eleven, a red nose from the cold, two braids, patched cotton jacket, holding a small stitched notebook and a stub of charcoal, a blunt stubborn look. Full length.',
  'ahe-boy': 'A Chinese village boy of eleven, a red nose from the cold, a tuft of hair sticking up, patched cotton jacket, holding a small stitched notebook and a stub of charcoal, a blunt stubborn look. Full length.',
  'wupo': 'A very old blind Chinese village woman, clouded white eyes, deeply wrinkled, grey hair in a small bun, plain dark cotton clothes, sitting on a wooden doorstep with a walking stick, a faint knowing smile.',
  'jiujiu': 'A Chinese county-town bookkeeper in his thirties, a neat blue-grey cotton scholar gown with a crossed collar, a thin careful face, a folded paper notice in one hand and a small abacus at his sash, a trace of old disappointment in his eyes. Full length.',
  'laozhou': 'A sturdy middle-aged Chinese peasant farmer, plain face, patched cotton clothes, a straw rain cape over his shoulders, mud on his trouser legs, holding a burning pine torch. Full length.',
  'qulao': 'A very old Taoist temple steward, lean and straight, long white beard, stern eyes, plain grey Taoist robe, a bamboo broom in his hands. Full length.',
  'yinyue': 'A young woman with long silver hair falling past her waist, golden eyes, barefoot, in a plain white robe, one silver fox tail behind her, a proud aloof expression. Full length.',
  'chuxiansheng': 'A Chinese Taoist lecturer of about fifty with a small goat beard, a sour sharp face, plain grey scholar robe with a crossed collar, holding a thread-bound Chinese book rolled in one hand. Full length.',
  'sunergou': 'A thin timid Chinese boy of fourteen, a worried face, a plain grey Taoist disciple robe with a crossed collar and cloth sash, cloth shoes, clutching a small hand-sewn cloth charm pouch to his chest. Full length.',
  'neimen-shijie': 'A composed Chinese Taoist girl disciple of about sixteen, hair in a high bun with a plain wooden pin, a plain pale blue Taoist robe, a straight double-edged Chinese jian sword at her back, calm sharp eyes. Full length.',
  'xuanchenzi': 'The abbot of a Taoist mountain temple, about sixty, mild smiling face that gives nothing away, a neat grey beard, a plain grey Taoist robe and a simple crown on his topknot, a horsetail fly-whisk over one arm. Full length.',
  'dushu': 'An old Chinese ferryman, lean and weathered, a conical bamboo hat, a short patched jacket and rolled trousers, bare feet, leaning on a long bamboo punting pole. Full length.',
  'zhouheng': 'A young Chinese Taoist temple steward of about twenty-five, neat topknot, plain grey robe with a crossed collar, a calligraphy brush in one hand and an account ledger in the other, a strict particular face. Full length.',
}

# Only things with a 图鉴 entry (codex.json tags them 法宝 · 丹药 · 功法 · 信物); an
# everyday thing — 鹿皮, 萝卜, 饼, 碗, a bow — has none (his, 2026-09-29).
ITEMS = {
  'fox-token': 'A small worn wooden token polished bright by hands, carved with a tiny curled fox whose nine tails wrap around its body, on a frayed cord.',
  'xisui-pill': 'A single dark round Chinese pill, glossy black, resting in a small plain clay dish.',
  'tuna-jing': 'An old bundle of bamboo slips half unrolled, its binding cords nearly rotted through, the slips blank and worn smooth.',
  'danlu': 'A tiny three-legged bronze alchemy furnace, palm-sized, two handles, a little crouching beast on its lid, old patina.',
  'huangting': 'A thin Chinese thread-bound book, plain paper cover with no writing, slightly worn.',
  'heluo': 'Half a bundle of old bamboo slips tied with cord, the slips blank, one end broken.',
  'mend-pill': 'A single round Chinese elixir pill, pale jade green, in a small celadon dish.',
  'moon-bell': 'A small old silver bell on a faded red cord, a crescent moon engraved on it.',
}


BEAST = ('Like a plate in a classical Chinese bestiary: the creature alone, whole and clearly seen, with only a small hint '
         'of its setting at its feet. No people.')

# Each from its 山海经 line (creatures.json `quote`), the countable features spelled out.
CREATURES = {
  'fuzhu': '夫诸 — 「其状如白鹿而四角」: a white deer with FOUR separate unbranched horns, all four clearly visible and countable, standing in shallow water.',
  'wuzhiqi': '无支祁 — 「形若猿猴，缩鼻高额，青躯白首，金目雪牙，颈伸百尺」: a huge ape-like water beast, a snub nose and high brow, a dark blue-green body and a WHITE head, golden eyes and snow-white fangs, a very long neck, a heavy iron chain around its neck and a bell through its nose, rising from a river.',
  'fangfeng': '防风氏 — the giant of Kuaiji whose single bone filled a cart: an enormous ancient giant man in simple hide and bark clothing, striding over low hills, a small cart beside his foot to show his size.',
  'changyou': '长右 — 「其状如禺而四耳」: a long-tailed ape with FOUR ears, two on each side of its head, all four clearly visible, crouching on bare rocks by water.',
  'bashe': '巴蛇 — 「巴蛇食象……其为蛇青黄赤黑」: a gigantic coiled snake banded in four colours (shown as four shades of wash), a great bulge in its body where it swallowed an elephant.',
  'gui': '蛫 — 「其状如龟，而白身赤首」: a turtle with a pale WHITE shell and body and a RED head (a soft red wash on the head only).',
  'kuiniu': '夔牛 — the great ox of the Min mountains, thousands of jin: an enormous heavy wild ox, huge as a small hill, standing on a mountain slope.',
  'qiezhi': '窃脂 — 「状如鸮而赤身白首」: an owl with a RED body (soft red wash) and a WHITE head, perched on a branch.',
  'feiyi': '肥遗 — 「六足四翼」: a snake with exactly SIX legs (three pairs, all visible) and exactly FOUR wings (two pairs, all visible), coiled on a square cliff top.',
  'qianyang': '羬羊 — 「其状如羊而马尾」: a goat with a long flowing HORSE tail, standing among pines.',
  'taifeng': '泰逢 — 「其状如人而虎尾……出入有光」: a benevolent mountain god in the shape of a man in simple ancient robes with a striped TIGER tail, a soft glow around him.',
  'mafu': '马腹 — 「其状如人面虎身」: a tiger\'s body with a HUMAN face, crouching by a river among bamboo.',
  'paoxiao': '狍鸮 — 「其状如羊身人面，其目在腋下，虎齿人爪」: a sheep\'s body with a human face, NO eyes on the face but eyes under its forelegs (armpits), tiger fangs, human-like hands for front feet.',
  'jingwei': '精卫 — 「其状如乌，文首、白喙、赤足」: a small crow-like bird with a patterned head, a WHITE beak and RED feet, carrying a small pebble in its beak over sea waves.',
  'leishen': '雷神 — 「龙身而人头，鼓其腹」: a dragon\'s long scaled body with a MAN\'S head, drumming on its own belly with its claws, in a marsh under storm clouds.',
  'longzhi': '蠪侄 — 「其状如狐，而九尾、九首、虎爪」: a fox with NINE heads (all nine clearly visible and countable) and NINE tails (all nine visible), and tiger claws.',
  'kui': '夔 — 「状如牛，苍身而无角，一足」: an ox-like beast with a dark grey-blue body, NO horns, and only ONE leg (a single leg in the middle, clearly one), standing at the edge of the sea, a faint glow around it.',
  'tongtong': '狪狪 — 「其状如豚而有珠」: a pig holding a round pearl in its mouth, on a mountain path.',
  # The story's 小狰 (his, 2026-09-29): a baby, not the adult leopard of the 1725 woodcut (its 「原图」).
  'zheng': '狰 — 「其状如赤豹，五尾一角」, drawn as the story\'s BABY 狰: cat-sized, round and young, soft red fur (a light red wash), exactly FIVE fluffy little tails (all five visible and countable), ONE small stubby horn on its forehead, squatting and hugging a stalk of spirit herb in both front paws, munching messily, crumbs falling. Cute, but clearly the 山海经 beast, not a leopard.',
}


def paint(out, subject, aspect, force):
  if out.exists() and not force:
    return 'kept'
  png = out.with_suffix('.png')
  prompt = (f'Use your image generation tool to make ONE image in {aspect} orientation, then save it in the current '
            f'directory as {png.name}. Subject: {subject} {OLD_CHINA} Style: {STYLE} Reply with the saved file path only.')
  r = subprocess.run(['codex', 'exec', '-m', 'gpt-5.5', '--skip-git-repo-check', '-s', 'workspace-write', prompt],
                     cwd=out.parent, capture_output=True, text=True)
  if not png.exists():
    said = (r.stdout + r.stderr).lower()
    if 'usage limit' in said or 'out of credits' in said or 'rate limit' in said:
      raise SystemExit(f'{out.stem}: Codex limit reached — stopped; rerun later (done pictures are kept, so it resumes)')
    return f'failed: {r.stderr.strip()[-200:]}'
  # 640 px on the long side, webp — the same weight as the art it replaces.
  size = '0 960' if aspect.startswith('portrait') else '960 0'
  c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', '-resize', *size.split(), str(png), '-o', str(out)], capture_output=True)
  png.unlink(missing_ok=True)
  return 'ok' if c.returncode == 0 else 'cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/ (a review round)')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  jobs = [('people', k, v, 'portrait (2:3)') for k, v in PEOPLE.items()] + [('items', k, v, 'landscape (3:2)') for k, v in ITEMS.items()]
  jobs += [('creatures', k, f'{v} {BEAST}', 'landscape (3:2)') for k, v in CREATURES.items()]
  for folder, key, subject, aspect in jobs:
    if only and key not in only:
      continue
    base = Path(a.out) if a.out else ART / folder
    base.mkdir(parents=True, exist_ok=True)
    print(f'{folder}/{key}: {paint(base / f"{key}.webp", subject, aspect, a.force)}', flush=True)


if __name__ == '__main__':
  sys.exit(main())
