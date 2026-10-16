#!/usr/bin/env python3
"""paint-wash-codex.py — 后山崖顶's beasts and finds, redrawn by Codex in the house 水墨淡彩, a house picture attached as the style.

    python3 tools/paint-wash-codex.py [--only id,id] [--force] [--out DIR] [--model M]

2026-10-16: the six back-hill beasts and fourteen of the 36 finds painted 2026-10-15 by the local FLUX
(the tools/paint-cards.py recipe) read as a Western field guide — white paper, pen hatching, saturated
orange. Hanli's rule (10-15): 水墨淡彩, ink wash on aged rice paper, xieyi strokes, muted mineral colours,
generous empty space, colour only where it carries meaning. Each subject here is painted by
`codex exec -i <house picture>` — a beast with art/creatures/qiuyu.webp attached, a find with
art/items/lingzhi.webp and jade-ring.webp — so it takes the house paper and wash. Codex CLI 0.163, model
gpt-6.1-sol (0.136 could not read the model list, and every model was refused). 赤狐 and 豺 are told apart
by build and pose: a slim light fox mid-step, a low heavy dhole stalking. Every picture was looked at beside
the house sheet at card size before it shipped; a miss is re-rolled with --force --only <id>.

Output: art/creatures/<id>.webp (960×640), art/items/<id>.webp (640×480), webp q90.
"""
import argparse, subprocess, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent / 'worlds' / 'jiuding' / 'art'

BEAST_STYLE = ('Match the attached reference picture EXACTLY in style: the same warm aged sepia rice paper filling the whole canvas, '
               'the same near-monochrome ink and soft grey-brown wash, loose xieyi brushwork, soft ink gradations, generous empty paper '
               'around the subject, only a small hint of ground at its feet. Chinese ink wash with the faintest muted mineral tint where it '
               'carries meaning; no bright or saturated colour, no white paper, no fine pen hatching, no Western natural-history field-guide '
               'rendering, no background landscape. No text, no characters, no seal, no signature, no border, no frame, no vignette.')
ITEM_STYLE = ('Match the attached reference pictures EXACTLY in style: Chinese ink wash (水墨淡彩) on pale aged rice paper, '
              'the object small-to-medium in the centre resting on a loose soft grey ink-wash cloud of brushwork behind and beneath it, '
              'xieyi brush strokes, soft ink gradations, muted mineral colours, generous empty paper. Colour only where it carries '
              'meaning and even then muted and soft — never bright, saturated or glossy. No fine pen outlines or hatching, no '
              'Western watercolour field-guide rendering, no table, no hands, no people. No text, no characters, no seal, no '
              'signature, no border, no frame.')

BEASTS = {
  'chihu': "赤狐, a wild red fox: a SLIM, light, delicate fox with a narrow pointed muzzle, large upright pointed ears, long thin legs with dark stockings, and a long very full bushy brush of a tail with a white tip; poised mid-step on its toes, light as a cat, head turned back alertly over its shoulder. Its fur is shown mostly in ink with only a pale muted rust-ochre wash on the back and tail — the one touch of colour.",
  'chai': "豺, a wild Asian dhole (red dog) of a mountain pack hunter: a LOW, heavy, deep-chested wild dog, thick neck, broad blunt short muzzle, short ROUNDED ears (not pointed fox ears), short sturdy legs, and a short thick dark bushy tail carried low; crouched low and forward, head down level with its shoulders, stalking, heavy and dangerous, seen side-on. Clearly a dhole, not a fox, not a wolf. Mostly ink and grey wash; only the faintest dull brown tint on its back, the dark tail in ink.",
  'shanli': "山狸, a wild leopard cat: a small slender wild cat the size of a house cat, round head with two pale stripes running up the forehead, rounded ears, a spotted coat of dark ink spots, ONE long tail with dark rings, crouched on a low rock stalking, ears forward. Ink and soft grey-brown wash only.",
  'mihou': "猕猴, a rhesus macaque: a stocky monkey with a short tail, a bare face, sitting on a rock ledge clutching a stolen bundle of herbs to its chest, looking sideways mischievously. Ink and soft grey-brown wash; only the faintest pale muted red on its face — the one touch of colour.",
  'fushe': "蝮蛇, a short-tailed mountain pit viper: a thick heavy-bodied short snake with a broad triangular head and narrow neck, dark ink blotches along its back, coiled on a flat stone with its head raised and drawn back ready to strike, a few loose brush strokes of fern. Ink and soft grey wash only.",
  'cangying': "苍鹰, a northern goshawk: a powerful hawk with a dark grey back, a pale finely barred breast, a pale stripe over the eye, hooked beak, strong yellow-grey feet with talons, perched on a jutting rock with wings half raised as if about to launch. Ink and soft grey wash; only a faint muted yellow in its eye.",
}

ITEMS = {
  'geju-zong': "猲狙鬃: a single loose tuft of coarse wild-beast mane, long stiff hairs bound at the root with a twist of grass, lying on the paper; the hair a deep muted cinnabar red (mineral red, not bright) shading to ink at the root.",
  'hu-pi': "狐皮: a folded fox pelt lying on the ground, the fur a muted rust-ochre in soft wash, the long bushy tail curled over it with a small white tip.",
  'xionghuang': "雄黄: one rough lump of realgar ore, a crystalline rock in muted orange-red mineral pigment, beside a small plain earthenware wine cup.",
  'chishizhi': "赤石脂: two or three smooth slick lumps of red clay, a soft muted iron-red earth tone, one broken open, lying on a little scatter of earth.",
  'lingling-pi': "軨軨皮: a thick rolled piece of hide, heavy like an ox hide, its outer side marked with dark ink tiger stripes over a pale muted ochre, its edge showing the thickness.",
  'bibi-ling': "獙獙翎: a single long flight feather lying diagonally, mostly ink grey, warmed with a soft faint ochre glow along its vane as if it holds heat, a wisp of warmth rising from it.",
  'chai-ya': "豺牙: one curved canine tooth like a small hook, ivory-white, strung on a short loop of faded red cord (the only colour), lying on the paper.",
  'xiong-dan': "熊胆: a small dried bear gall, a shrivelled pear-shaped pouch, dark brown-black with a dull golden translucent edge, lying on a folded square of plain paper.",
  'yumu': "鱼目: one round glossy fish eye the size of a pearl, a pale pearly ball with a dark pupil in it that seems to stare, resting alone in a small shallow plain dish.",
  'dangkang-ya': "当康牙: one small curved boar-like tusk tied with a cord, hanging from an iron ring on a plain old granary door plank (only a small part of the door shown, in loose ink).",
  'qique-zhua': "鬿雀爪: a severed bird's foot, scaly and thin like a rat's foot, armed with long hooked tiger-like claws, lying on a flat grey stone with a pale white scratch across it.",
  'she-dan': "蛇胆: one small green bead-like snake gall, a muted dark jade green, lying in a small shallow plain celadon dish.",
  'fuling': "茯苓: a lump of poria fungus, a rough rounded dark brown skin, one piece broken open to show snow-white flesh inside, among a few old pine roots.",
  'houer-jiu': "猴儿酒: a hollow in a grey rock holding a pool of dark fermented wild fruit, a few wild berries and a half-eaten fruit beside it, one bee hovering.",
}


def to_png(webp, d):
  """Codex takes the reference as a PNG."""
  from PIL import Image
  out = Path(d) / (webp.stem + '.png')
  Image.open(webp).convert('RGB').save(out)
  return out


def paint(out, subject, kind, model):
  refs = [ART / 'creatures/qiuyu.webp'] if kind == 'creatures' else [ART / 'items/lingzhi.webp', ART / 'items/jade-ring.webp']
  aspect, size, style = (('landscape 3:2', ('960', '640'), BEAST_STYLE) if kind == 'creatures'
                         else ('landscape 4:3', ('640', '480'), ITEM_STYLE))
  with tempfile.TemporaryDirectory() as d:
    png = Path(d) / f'{out.stem}.png'
    prompt = (f'Use your image generation tool to make ONE new image in {aspect} orientation, then save it in the current directory '
              f'as {png.name}. The attached image is a STYLE reference only — do not copy its subject. Subject: {subject} '
              f'Set in old China. Style: {style} Reply with the saved file path only.')
    args = ['codex', 'exec', '-m', model, '--skip-git-repo-check', '-s', 'workspace-write']
    for r in refs:
      args += ['-i', str(to_png(r, d))]
    try:
      r = subprocess.run([*args, '--', prompt], cwd=d, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    except subprocess.TimeoutExpired:
      return 'failed: no picture in 15 minutes'
    if not png.exists():
      return f'failed: {(r.stdout + r.stderr).strip()[-300:]}'
    c = subprocess.run(['/opt/homebrew/bin/cwebp', '-quiet', '-q', '90', '-resize', *size, str(png), '-o', str(out)], capture_output=True)
    return 'ok' if c.returncode == 0 else 'cwebp failed'


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--force', action='store_true')
  ap.add_argument('--out', default=None, help='paint into this folder instead of art/ (a review round)')
  ap.add_argument('--model', default='gpt-6.1-sol')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  jobs = [('creatures', k, v) for k, v in BEASTS.items()] + [('items', k, v) for k, v in ITEMS.items()]
  for kind, key, subject in jobs:
    if only and key not in only:
      continue
    base = Path(a.out) if a.out else ART / kind
    base.mkdir(parents=True, exist_ok=True)
    out = base / f'{key}.webp'
    if out.exists() and not a.force:
      print(f'{kind}/{key}: kept', flush=True)
      continue
    print(f'{kind}/{key}: {paint(out, subject, kind, a.model)}', flush=True)


if __name__ == '__main__':
  main()
