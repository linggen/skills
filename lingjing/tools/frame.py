#!/usr/bin/env python3
"""frame.py — lay a public-domain plate onto Lingjing's paper and seal it.

    python3 tools/frame.py <plate.svg|png|jpg> <out.webp> --seal 诸 [--crop x0,y0,x1,y1] [--width 1200]

Crop is in fractions of the plate (0–1). An SVG is rasterised first with
rsvg-convert. The plate is multiplied onto a warm paper ground with a little
grain, so its white becomes paper and its ink stays ink; a red seal with one
character sits bottom-right. Nothing is redrawn — the woodcut is the picture.
"""
import argparse, math, os, random, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter

PAPER_IN, PAPER_OUT = (247, 243, 233), (236, 229, 214)
SEAL = (176, 58, 43)
FONT = '/System/Library/Fonts/Supplemental/Songti.ttc'

def rasterise(src, width):
    if not src.lower().endswith('.svg'):
        return Image.open(src).convert('L')
    tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False).name
    subprocess.run(['rsvg-convert', '-w', str(width), '-b', 'white', '-o', tmp, src], check=True)
    return Image.open(tmp).convert('L')

def paper(w, h, seed=7):
    """A warm ground, lighter at the heart, with grain."""
    g = Image.new('RGB', (w, h))
    px = g.load()
    cx, cy, r = w / 2, h * 0.45, math.hypot(w, h) * 0.55
    for y in range(h):
        for x in range(w):
            t = min(1.0, math.hypot(x - cx, y - cy) / r)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(PAPER_IN, PAPER_OUT))
    rnd = random.Random(seed)
    grain = Image.effect_noise((w, h), 18).point(lambda v: 255 - int((255 - v) * 0.10))
    return ImageChops.multiply(g, Image.merge('RGB', (grain, grain, grain)))

def seal(img, ch, size):
    d = ImageDraw.Draw(img)
    m = int(size * 0.55)
    x1, y1 = img.width - m, img.height - m
    x0, y0 = x1 - size, y1 - size
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(size * 0.08), fill=SEAL)
    font = ImageFont.truetype(FONT, int(size * 0.68))
    bbox = d.textbbox((0, 0), ch, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((x0 + (size - tw) / 2 - bbox[0], y0 + (size - th) / 2 - bbox[1]), ch, font=font, fill=(247, 242, 231))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--seal', required=True)
    ap.add_argument('--crop', default=None, help='x0,y0,x1,y1 as fractions')
    ap.add_argument('--width', type=int, default=1200)
    ap.add_argument('--margin', type=float, default=0.03)
    ap.add_argument('--quality', type=int, default=80)
    a = ap.parse_args()
    plate = rasterise(a.src, a.width * 2)
    if a.crop:
        x0, y0, x1, y1 = [float(v) for v in a.crop.split(',')]
        plate = plate.crop((int(plate.width * x0), int(plate.height * y0), int(plate.width * x1), int(plate.height * y1)))
    # soften the halftone of a scan a touch, keep the line
    plate = plate.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: 255 if v > 236 else v)
    scale = a.width / plate.width
    plate = plate.resize((a.width, int(plate.height * scale)), Image.LANCZOS)
    mx = int(a.width * a.margin)
    w, h = plate.width + 2 * mx, plate.height + 2 * mx
    ground = paper(w, h)
    ink = Image.new('L', (w, h), 255); ink.paste(plate, (mx, mx))
    out = ImageChops.multiply(ground, Image.merge('RGB', (ink, ink, ink)))
    seal(out, a.seal, int(a.width * 0.055))
    out.save(a.out, 'WEBP', quality=a.quality, method=6)
    print(a.out, out.size, os.path.getsize(a.out), 'bytes')

if __name__ == '__main__':
    main()
