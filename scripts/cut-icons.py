#!/usr/bin/env python3
"""Cuts the rules icons out of the card pictures in images/ into public/icons/*.png (transparent),
so card text shows the same symbols as the printed cards. Run: python3 scripts/cut-icons.py"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

def dark_icon(name, img, box, thresh=120, scale=4):
    """A black symbol on a light card: crop tight around the dark pixels, background → transparent."""
    im = Image.open(os.path.join(ROOT, 'images', img)).convert('RGB').crop(box)
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if (r + g + b) / 3 < thresh:
                xs.append(x); ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1
    im = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.LANCZOS)
    out = Image.new('RGBA', im.size)
    op = out.load(); ip = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = ip[x, y]
            lum = (r + g + b) / 3
            a = max(0, min(255, int((215 - lum) * 255 / 150)))
            op[x, y] = (20, 20, 20, a)
    bb = out.getbbox()
    if bb: out = out.crop(bb)
    out.save(os.path.join(OUT, name + '.png'))
    print(name, out.size)

def round_icon(name, img, center, radius, scale=4):
    """A round coloured badge (sun / mountain / crest): circular crop, outside → transparent."""
    im = Image.open(os.path.join(ROOT, 'images', img)).convert('RGBA')
    cx, cy = center
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    im = im.crop(box).resize((radius * 2 * scale, radius * 2 * scale), Image.LANCZOS)
    mask = Image.new('L', im.size, 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((1, 1, im.size[0] - 2, im.size[1] - 2), fill=255)
    im.putalpha(mask)
    im.save(os.path.join(OUT, name + '.png'))
    print(name, im.size)

# Common Tests reference card (01431A, 410×573)
dark_icon('exploration', '01431A.jpg', (103, 102, 128, 137))
dark_icon('progress', '01431A.jpg', (158, 134, 186, 152))
dark_icon('connection', '01431A.jpg', (110, 212, 132, 236))
dark_icon('reason', '01431A.jpg', (120, 290, 146, 318))
dark_icon('conflict', '01431A.jpg', (128, 375, 154, 401))

def light_icon(name, img, box, scale=4):
    """A light symbol printed on a coloured bar: brighter-than-background pixels become the (dark) icon."""
    im = Image.open(os.path.join(ROOT, 'images', img)).convert('RGB').crop(box)
    w, h = im.size
    px = im.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = sorted(sum(p) / 3 for p in border)[len(border) // 2]
    im = im.resize((w * scale, h * scale), Image.LANCZOS)
    out = Image.new('RGBA', im.size)
    op = out.load(); ip = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            lum = sum(ip[x, y]) / 3
            a = max(0, min(255, int((lum - bg - 10) * 255 / max(20, 200 - bg))))
            op[x, y] = (20, 20, 20, a)
    bb = out.getbbox()
    if bb: out = out.crop(bb)
    out.save(os.path.join(OUT, name + '.png'))
    print(name, out.size)

# Caustic Mulcher (01265) and Overgrown Thicket (01267), 375×525
dark_icon('ranger', '01265.jpg', (44, 220, 61, 238), thresh=90)
light_icon('harm', '01265.jpg', (107, 439, 123, 457))
light_icon('conditional', '01267.jpg', (273, 451, 294, 466))
round_icon('sun', '01265.jpg', (32, 404), 21)
round_icon('crest', '01265.jpg', (32, 466), 21)
round_icon('mountain', '01267.jpg', (32, 463), 21)
# the guide book on a mission card (01430A)
dark_icon('guide', '01430A.jpg', (180, 188, 205, 207), thresh=110)
