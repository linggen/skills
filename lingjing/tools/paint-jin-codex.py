#!/usr/bin/env python3
"""paint-jin-codex.py — 今线's 人物志 portraits, painted by Codex CLI's image tool.

    python3 tools/paint-jin-codex.py [--only jin-ahe,jin-lei] [--out DIR] [--flux SEED]

Hanli, 2026-10-05: 「今线也补一遍人物志的图。注意和古线只保留脸一致，装扮等都是现代的。」
The eight people of the interludes (story/jiuding-lu/今线/定例.md § 三), in the house
STYLE of tools/paint-codex.py — only the people are modern: 2026, 沂州中医药大学 in
临沂, students and staff. The same souls (DESIGN § 四·六; OUTLINE § 四「现代线」)
keep ONLY the face of their 古线 portrait, handed in as the reference: 沈芒 ←
xiaoman.webp, 周禾 ← ahe-girl.webp, 马小宝 ← maxiaobao.webp, 葛奶奶 ← wupo.webp
(吴婆婆's soul, her eyes clear here). The others get qulao.webp as the style
reference only. Age, height, hair, clothes from 定例 — never a 古装 thread.

Same call as paint-codex.py (gpt-5.5, stdin closed, 10-minute cap, stop at a usage
limit). --flux SEED paints with the local FLUX recipe of paint-flux-codex.py instead
(no reference image). Paint into a review folder (--out), look at every picture
(the face reads as the same person, the age, no ancient dress, no stray text or
seal), then copy the kept ones into art/people/.

Output: <id>.webp, 640×960 (2:3), webp q84 — as the 古线 portraits.
"""
import argparse, importlib.util, json, os, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('paint_codex', HERE / 'paint-codex.py')
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)
PEOPLE = pc.ART / 'people'

MODERN = ('Present-day China, 2026: a student or teacher at a Chinese university of traditional medicine. Modern '
          'clothes ONLY — no ancient Chinese dress, no robe, no crossed collar, no topknot, no hairpin, no straw sandals.')
FACE = ('The attached drawing is the SAME PERSON in another life: keep ONLY the face — its shape, the eyes, brows, nose, '
        'mouth and expression — so anyone can tell it is the same soul, aged as described below. Change everything '
        'else: hair, clothes, props, pose and age are as described, all modern. Match the attached drawing\'s style '
        '(fine ink line, soft grey wash, warm aged paper).')
STYLE_REF = ('The attached drawing is only a STYLE reference (fine ink line, soft grey wash, warm aged paper, one '
             'full-length figure on bare paper); do not copy its person, dress or props.')

# id: (reference portrait in art/people, subject) — from 定例 § 三 and the interludes' own lines.
SUBJECTS = {
  'jin-shenmang': ('xiaoman', 'Shen Mang, a Chinese young man of EIGHTEEN, a first-year college student: 176 cm, thin and '
                   'not muscular at all, a lean face with bright cheeky eyes and a crooked half-guilty grin (he is about '
                   'to make an excuse). Short messy modern black hair. A loose sleeveless basketball jersey whose only '
                   'marking is a big plain number 0 on the chest, over a white T-shirt, baggy basketball shorts, cheap '
                   'white sneakers, a cheap black fitness band on his left wrist; a basketball tucked under one arm. Full length.'),
  'jin-ahe': ('ahe-girl', 'Zhou He, a Chinese young woman of TWENTY, a second-year sports rehabilitation student and the '
              'manager of the college basketball team — clearly a grown young woman, NOT a girl: adult height and '
              'proportions, a slimmer, longer adult face, a calm deadpan look, not smiling, a neat ponytail tied with a hair tie. A zip-up team '
              'track jacket with the sleeves pushed up to the elbows, track trousers, white sneakers. She holds a small '
              'open notebook and a ballpoint pen, writing something down; a pocket calculator in the other hand. Plain, '
              'no logos. Full length.'),
  'jin-maxiaobao': ('maxiaobao', 'Ma Xiaobao, a Chinese young man of TWENTY-ONE, very tall (193 cm) and heavy (98 kg), a '
                    'big centre on the basketball team: a round smug but good-natured grinning face. Short modern hair. An '
                    'expensive oversized plain hoodie, basketball shorts, big expensive high-top basketball sneakers, a '
                    'chunky wristwatch, over-ear headphones hanging round his neck; he weighs a big plastic protein shaker '
                    'bottle in his palm as if judging how heavy it is. No logos. Full length.'),
  'jin-ge': ('wupo', 'Granny Ge, a Chinese woman of SEVENTY-TWO, a retired rare-books restorer rehired at the university '
             'library: clear, sharp, kindly eyes (NOT blind), deeply wrinkled, grey hair in a small bun. A plain modern '
             'cardigan over a blouse, dark-blue cloth oversleeves on both forearms, reading glasses hanging on a thin chain '
             'round her neck, a pencil in one hand. Sitting on a plain wooden chair, an old thread-bound book open on her '
             'lap (its pages blank). Full length.'),
  'jin-lei': ('qulao', 'Coach Lei, a Chinese PE teacher in his forties, head coach of the college basketball team: stocky, '
              'a square face tanned very dark like braised beef, short cropped hair, mouth open bellowing an order, holding '
              'up three fingers. A plain zip-up tracksuit, a whistle on a lanyard round his neck, a stopwatch in the other '
              'hand, sports shoes. No logos. Full length.'),
  'jin-yanjing': ('qulao', 'Lin Yuan, nicknamed Specs, a Chinese young man of EIGHTEEN, a first-year student: tall and thin, '
                  'a dead-serious face, pushing his glasses up his nose with one finger. Short neat hair. A plain checked '
                  'shirt over a T-shirt, jeans, canvas shoes; a library book held under one arm (plain cover). Full length.'),
  'jin-laocai': ('qulao', 'Old Cai, a Chinese young man of nineteen, a first-year student: clearly PLUMP and soft — a round '
                 'chubby face with full cheeks and a double chin, a round soft belly under the hoodie — a sleepy '
                 'half-awake face with drooping eyelids, his short hair squashed flat on one side from the pillow. A '
                 'baggy plain hoodie, track trousers, plastic slippers; a fat paperback novel held against his chest '
                 '(plain cover). Full length.'),
  'jin-yan': ('qulao', 'Teacher Yan, a Chinese lecturer in his fifties who teaches acupuncture: upright and proper, a '
              'stiff correct face, neatly combed short greying hair, rimmed glasses. A crisp white lab coat buttoned over '
              'a shirt and tie, trousers, leather shoes; holding a closed textbook against his chest (plain cover). Full length.'),
}


def ref_png(name, tmp):
  src = PEOPLE / f'{name}.webp'
  png = Path(tmp) / f'{name}.png'
  subprocess.run(['/opt/homebrew/bin/dwebp', '-quiet', str(src), '-o', str(png)], check=True)
  return png


def codex(key, ref, subject, out_dir):
  png = out_dir / f'{key}.png'
  lead = FACE if ref != 'qulao' else STYLE_REF
  prompt = (f'Use your image generation tool to make ONE image in portrait (2:3) orientation, then save it in the current '
            f'directory as {png.name}. {lead} Subject: {subject} {MODERN} Style: {pc.STYLE} Reply with the saved file path only.')
  with tempfile.TemporaryDirectory() as tmp:
    try:
      r = subprocess.run(['codex', 'exec', '-m', 'gpt-5.5', '--skip-git-repo-check', '-s', 'workspace-write',
                          '-i', str(ref_png(ref, tmp)), '--', prompt],
                         cwd=out_dir, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=600)
    except subprocess.TimeoutExpired:
      return None, 'failed: no picture in 10 minutes'
  if not png.exists():
    said = (r.stdout + r.stderr).lower()
    if 'usage limit' in said or 'out of credits' in said or 'rate limit' in said:
      return None, 'limit'
    return None, f'failed: {r.stderr.strip()[-200:]}'
  return png, 'ok'


def flux(key, subject, out_dir, seed):
  png = out_dir / f'{key}.png'
  py = Path.home() / '.linggen/runtime/envs/pictures/bin/python'
  script = Path.home() / '.linggen/runtime/mlx_picture.py'
  req = {'model': 'ar9av/FLUX.2-klein-4B-mflux-4bit', 'prompt': f'{subject} {MODERN} Style: {pc.STYLE}',
         'out': str(png), 'width': 640, 'height': 960, 'seed': seed}
  env = dict(os.environ, HF_HOME=str(Path.home() / '.linggen/models/hf-hub'), HF_HUB_OFFLINE='1')
  r = subprocess.run([str(py), str(script)], input=json.dumps(req), text=True, capture_output=True, env=env)
  return (png, 'ok') if png.exists() else (None, f'failed: {r.stdout.strip()[-200:] or r.stderr.strip()[-200:]}')


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--only', default='')
  ap.add_argument('--out', required=True, help='a review folder; copy the kept ones into art/people/')
  ap.add_argument('--flux', type=int, default=None, help='paint with local FLUX at this seed instead of Codex')
  a = ap.parse_args()
  only = set(filter(None, a.only.split(',')))
  out_dir = Path(a.out).resolve()
  out_dir.mkdir(parents=True, exist_ok=True)
  for key, (ref, subject) in SUBJECTS.items():
    if only and key not in only:
      continue
    png, said = flux(key, subject, out_dir, a.flux) if a.flux is not None else codex(key, ref, subject, out_dir)
    if said == 'limit':
      raise SystemExit(f'{key}: Codex limit reached — rerun with --flux SEED')
    if png:
      c = subprocess.run(['/opt/homebrew/bin/cwebp', '-q', '84', '-resize', '640', '960', str(png), '-o', str(out_dir / f'{key}.webp')], capture_output=True)
      png.unlink(missing_ok=True)
      said = 'ok' if c.returncode == 0 else 'cwebp failed'
    print(f'{key}: {said}', flush=True)


if __name__ == '__main__':
  sys.exit(main())
