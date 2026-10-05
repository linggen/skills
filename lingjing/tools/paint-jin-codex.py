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

# id: (reference portrait in art/people, subject) — Hanli 2026-10-05: 「衣着按照出场时的画」 — each as he or she
# FIRST appears in the interludes (all in 插曲01, 今 · 一): what the text puts on them and in their hands, in that
# place; what it leaves out comes from 定例 § 三, never an invented prop.
ADULT = ('Clearly a young ADULT man of eighteen, a college freshman — NOT a boy, NOT a young teenager: adult height and '
         'proportions (head about one-seventh of his height), a longer, leaner adult face with a defined jaw and cheekbones, an Adam\'s '
         'apple, a faint shadow of stubble on the upper lip; he must look as old as any university student, not a '
         'schoolboy — drawn as realistically as an adult figure, not as a cartoon child.')
SUBJECTS = {
  # 9/11, the 1000 m fitness test (体测): ran himself out at 400 m, 「提着一袋自己的午饭」 walked the lap; a 99-yuan band (定例).
  'jin-shenmang': ('xiaoman+jin-yanjing', f'Shen Mang, a Chinese student of EIGHTEEN, 176 cm. {ADULT} Thin and not muscular at all, '
                   'drenched in sweat and out of breath after a 1000-metre fitness-test run, yet with the same bright '
                   'cheeky eyes and a sheepish crooked grin. Short messy modern black hair. A plain sweat-soaked T-shirt, '
                   'plain athletic shorts, ordinary running shoes, a cheap black fitness band on his left wrist; he carries '
                   'a small tied plastic bag in one hand. The white line of a running track at his feet. Full length.'),
  # 9/11, the same finish line: 「一双白球鞋、一截蓝色的志愿者马甲、一只攥着小本子的手」; the ponytail from 定例 / the 招新摊.
  'jin-ahe': ('ahe-girl', 'Zhou He, a Chinese young woman of TWENTY, a second-year student volunteering at the freshman '
              'fitness test — clearly a grown young woman, NOT a girl: adult height and proportions, a slimmer, longer adult '
              'face, a calm deadpan look, not smiling, a neat ponytail. A plain blue volunteer vest (mesh tabard, no '
              'lettering) over a white T-shirt, plain trousers, white sneakers. She grips a small notebook and writes in it '
              'with a ballpoint pen. The white line of a running track at her feet. Full length.'),
  # 9/12, the basketball team's stall at the club fair: 「一米九几，手腕上一块表，手里一只大摇杯」, 「锅盖似的手」, his sneakers;
  # 定例: 贵球鞋, 耳机挂脖子.
  'jin-maxiaobao': ('maxiaobao', 'Ma Xiaobao, a Chinese young man of TWENTY-ONE, very tall (193 cm) and heavy (98 kg), with '
                    'huge hands like pot lids: a round smug but good-natured grinning face. Short modern hair. A plain '
                    'oversized T-shirt and basketball shorts in early-autumn heat, big expensive high-top basketball '
                    'sneakers, a chunky wristwatch, over-ear headphones hanging round his neck; he weighs a big plastic '
                    'protein shaker bottle in his palm as if judging how heavy it is. No logos. Full length.'),
  # 9/22, the library basement: 「门里出来一个老太太，蓝布套袖，老花镜挂在链子上」; 定例: a pencil always in hand.
  'jin-ge': ('wupo', 'Granny Ge, a Chinese woman of SEVENTY-TWO who restores old books in a university library: clear, '
             'sharp, kindly eyes (NOT blind), deeply wrinkled, grey hair in a small bun. A plain modern cardigan over a '
             'blouse, dark-blue cloth oversleeves on both forearms, reading glasses hanging on a thin chain round her neck, '
             'a pencil in one hand and NOTHING else in her hands — no book, no folder. Standing, just stepped out of a plain grey steel fire door behind her (no sign on it). '
             'Full length.'),
  # 9/11, the finish line: 「按停秒表，像念一张罚单」, then 「一把薅住他的后领子」; 定例: 脸晒得像一块酱牛肉, 哨子、秒表.
  'jin-lei': ('qulao', 'Coach Lei, a Chinese PE teacher in his forties: stocky, a square face tanned very dark like braised '
              'beef, short cropped hair, a stern face reading out a result like a traffic ticket. A plain short-sleeved '
              'sports polo shirt, track trousers, sports shoes, a whistle on a lanyard round his neck; he holds up a '
              'stopwatch, thumb just pressed on it. The white line of a running track at his feet. No logos. Full length.'),
  # 9/11 night, dorm 617: 「眼镜扶了扶眼镜」, then 「从桌上拿起一本图书馆的旧书」; 定例: 瘦高.
  'jin-yanjing': ('qulao', 'Lin Yuan, nicknamed Specs, a Chinese young man of EIGHTEEN, a first-year student, in his '
                  'dorm at night: tall and thin, a dead-serious face, pushing his glasses up his nose with one finger. '
                  'Short neat hair. A plain T-shirt, loose shorts, plastic slippers; in the other hand an old worn '
                  'library book with a plain cover. Full length.'),
  # 9/11 night, dorm 617: 「上铺的老蔡探出头」; 定例: 胖乎乎，头发总压扁一边, sleeps hugging a cultivation novel.
  'jin-laocai': ('qulao', 'Old Cai, a Chinese young man of nineteen, a first-year student, at night on the top bunk of a '
                 'plain metal dormitory bunk bed (the bunk is the only thing drawn): clearly PLUMP and soft — a round '
                 'chubby face with full cheeks and a double chin, a soft round belly — sleepy drooping eyelids, his short '
                 'hair squashed flat on one side from the pillow. A plain T-shirt and shorts; he leans his head and '
                 'shoulders out over the bunk rail to look down, a fat paperback novel (plain cover) in one hand.'),
  # Thursday morning, 针灸推拿学导论: writes on the board, 「粉笔敲得笃笃响」, then 「背着手一排一排地走」; 定例: 五十来岁，板正.
  'jin-yan': ('qulao', 'Teacher Yan, a Chinese lecturer in his fifties, upright and proper: a stiff correct face, neatly '
              'combed short greying hair. A plain long-sleeved shirt buttoned to the collar, neat trousers, leather shoes. '
              'He walks along the rows with his hands clasped behind his back, a stick of white chalk between his fingers. '
              'No blackboard, no writing anywhere. Full length.'),
}


AGE_REF = ('The SECOND attached drawing is his roommate, another eighteen-year-old freshman: draw Shen Mang at that same '
           'age, with the same adult build and the same realistic manner of drawing a face — but with the FIRST drawing\'s '
           'face, not the roommate\'s.')


def ref_png(name, tmp):
  src = PEOPLE / f'{name}.webp'
  png = Path(tmp) / f'{name}.png'
  subprocess.run(['/opt/homebrew/bin/dwebp', '-quiet', str(src), '-o', str(png)], check=True)
  return png


def codex(key, ref, subject, out_dir):
  png = out_dir / f'{key}.png'
  refs = ref.split('+')  # the face first; a second picture (沈芒: the kept 眼镜) is the age to draw
  lead = (FACE if refs[0] != 'qulao' else STYLE_REF) + (f' {AGE_REF}' if len(refs) > 1 else '')
  prompt = (f'Use your image generation tool to make ONE image in portrait (2:3) orientation, then save it in the current '
            f'directory as {png.name}. {lead} Subject: {subject} {MODERN} Style: {pc.STYLE} Reply with the saved file path only.')
  with tempfile.TemporaryDirectory() as tmp:
    try:
      r = subprocess.run(['codex', 'exec', '-m', 'gpt-5.5', '--skip-git-repo-check', '-s', 'workspace-write',
                          *[a for n in refs for a in ('-i', str(ref_png(n, tmp)))], '--', prompt],
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
