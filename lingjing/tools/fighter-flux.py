"""fighter-flux.py — the FLUX batch tools/fighter-frames.py hands to the pictures venv (never run by hand, never at play
time). One model load for a whole batch: stdin {"model", "steps", "jobs": [{"seed", "prompt", "out", "width", "height",
"refs": [png, …] | absent}]}. With refs the FLUX.2 klein EDIT runs (the master first: who it is; a pose sketch second:
how they stand); without, txt2img (a master). A job whose `out` exists is skipped, so a stopped batch resumes.
"""
import json, sys, time
from pathlib import Path

req = json.loads(sys.stdin.read())
from huggingface_hub import snapshot_download
from mflux.models.common.config.model_config import ModelConfig

path = snapshot_download(req['model'])
cfg = ModelConfig.flux2_klein_4b()
models = {}


def model(edit):
  if edit not in models:
    if edit:
      from mflux.models.flux2.variants.edit.flux2_klein_edit import Flux2KleinEdit as M
    else:
      from mflux.models.flux2.variants.txt2img.flux2_klein import Flux2Klein as M
    models[edit] = M(model_config=cfg, model_path=path)
  return models[edit]


for job in req['jobs']:
  if Path(job['out']).exists():
    continue
  t = time.time()
  kw = dict(seed=job['seed'], prompt=job['prompt'], num_inference_steps=int(req.get('steps', 4)),
            height=job.get('height', 1152), width=job.get('width', 768), guidance=1.0)
  if job.get('refs'):
    kw['image_paths'] = job['refs']
  model(bool(job.get('refs'))).generate_image(**kw).save(path=job['out'])
  print(Path(job['out']).name, round(time.time() - t, 1), file=sys.stderr, flush=True)
print(json.dumps({'ok': True}))
