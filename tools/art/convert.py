"""Converts the raw art (1254x1254 PNGs, kept OUT of the repo) into the app's WebP assets and PWA icons.

    ~/.claude/venv/bin/python -I tools/art/convert.py "<raw dir>" app/public

Writes:
  art/companions/<id>-idle.webp, <id>-cheer.webp   512px, trimmed to the figure, transparent
  art/companions/<id>-face.webp                     160px head/upper-body crop for the profile chip
  art/stickers/sticker-NN.webp                      256px, die-cut, transparent
  icons/icon-192.png, icon-512.png                  star on the purple disc, the disc colour carried out to the corners
  icons/icon-maskable-512.png                       same, star kept inside the 80% maskable safe zone
"""
import os
import sys

import numpy as np
from PIL import Image

RAW, OUT = sys.argv[1], sys.argv[2]
COMPANIONS = ["fox", "bunny", "unicorn", "owl", "panda", "kitten-astronaut", "baby-dragon", "dolphin"]

# Avatar crop per companion: (centre x, top y, side) as fractions of the trimmed idle figure's WIDTH/HEIGHT/WIDTH.
# Tuned by eye on the contact sheet so the face sits centred with a little shoulder.
FACE = {
    "fox": (0.50, 0.0, 0.80),
    "bunny": (0.50, 0.04, 0.84),
    "unicorn": (0.40, 0.0, 0.70),
    "owl": (0.48, 0.0, 0.74),
    "panda": (0.48, 0.0, 0.80),
    "kitten-astronaut": (0.48, 0.0, 0.80),
    "baby-dragon": (0.47, 0.0, 0.72),
    "dolphin": (0.50, 0.0, 0.80),
}

sizes = {}


def trim(im, thresh=10):
    a = np.array(im.getchannel("A"))
    ys, xs = np.where(a > thresh)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def square(im, pad=0.03):
    w, h = im.size
    side = int(max(w, h) * (1 + 2 * pad))
    c = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    c.paste(im, ((side - w) // 2, side - h - int(side * pad * 0.5)), im)  # sit near the bottom edge
    return c


def save_webp(im, rel, q):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6, alpha_quality=90)
    sizes[rel] = os.path.getsize(path)


for cid in COMPANIONS:
    for pose in ("idle", "cheer"):
        im = Image.open(os.path.join(RAW, f"companion-{cid}-{pose}.png")).convert("RGBA")
        fig = trim(im)
        save_webp(square(fig).resize((512, 512), Image.LANCZOS), f"art/companions/{cid}-{pose}.webp", 80)
        if pose == "idle":
            cx, top, side = FACE[cid]
            w, h = fig.size
            s = int(w * side)
            x0 = int(w * cx - s / 2)
            y0 = int(h * top)
            face = Image.new("RGBA", (s, s), (0, 0, 0, 0))
            face.paste(fig.crop((max(0, x0), y0, min(w, x0 + s), min(h, y0 + s))), (max(0, -x0), 0))
            save_webp(face.resize((160, 160), Image.LANCZOS), f"art/companions/{cid}-face.webp", 82)

for n in range(1, 25):
    im = Image.open(os.path.join(RAW, f"sticker-{n:02d}.png")).convert("RGBA")
    save_webp(square(trim(im), pad=0.02).resize((256, 256), Image.LANCZOS), f"art/stickers/sticker-{n:02d}.webp", 80)


# ---- PWA icons ---------------------------------------------------------------------------------------------------
# The source is a purple disc on a white square. Find the disc, then carry its edge colour radially out to the
# square's corners, so no white ever shows (Android masks and launchers crop differently).
src = np.array(Image.open(os.path.join(RAW, "app-icon.png")).convert("RGB")).astype(np.float32)
H, W, _ = src.shape
notwhite = (src.min(axis=2) < 235)
ys, xs = np.where(notwhite)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
R = min(xs.max() - xs.min(), ys.max() - ys.min()) / 2


def icon(size, disc_frac):
    """disc_frac = disc diameter as a fraction of the icon side."""
    r_out = disc_frac * size / 2
    scale = R / r_out  # source px per output px
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) + 0.5
    dx, dy = xx - size / 2, yy - size / 2
    dist = np.sqrt(dx * dx + dy * dy) + 1e-6
    # inside the disc (minus a rim) sample directly; outside, clamp onto a circle just inside the rim
    rim = R - 10
    sx, sy = dx * scale, dy * scale
    sd = np.sqrt(sx * sx + sy * sy) + 1e-6
    k = np.minimum(1.0, rim / sd)
    px = np.clip(cx + sx * k, 0, W - 1)
    py = np.clip(cy + sy * k, 0, H - 1)
    # bilinear sample at the source resolution, then LANCZOS-free since we sample per output pixel at a coarse scale:
    # supersample 3x3 for smooth edges
    acc = np.zeros((size, size, 3), np.float32)
    n = 0
    for ox in (-0.33, 0, 0.33):
        for oy in (-0.33, 0, 0.33):
            sx2, sy2 = (dx + ox) * scale, (dy + oy) * scale
            sd2 = np.sqrt(sx2 * sx2 + sy2 * sy2) + 1e-6
            k2 = np.minimum(1.0, rim / sd2)
            qx = np.clip(np.rint(cx + sx2 * k2), 0, W - 1).astype(int)
            qy = np.clip(np.rint(cy + sy2 * k2), 0, H - 1).astype(int)
            acc += src[qy, qx]
            n += 1
    img = Image.fromarray(np.clip(acc / n, 0, 255).astype(np.uint8), "RGB")
    return img


def save_png(img, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    sizes[rel] = os.path.getsize(path)


big = icon(1024, 0.98)
save_png(big.resize((512, 512), Image.LANCZOS), "icons/icon-512.png")
save_png(big.resize((192, 192), Image.LANCZOS), "icons/icon-192.png")
# Maskable: the safe zone is the centred circle of radius 40%. The star spans ~84% of the disc, so a disc of 80% of
# the side keeps the star (0.84 * 0.80 = 67% of the side, radius 34%) inside it with room to spare.
save_png(icon(1024, 0.80).resize((512, 512), Image.LANCZOS), "icons/icon-maskable-512.png")

total = 0
for k in sorted(sizes):
    total += sizes[k]
print(f"{len(sizes)} files, {total / 1024:.0f} KB total")
for group in ("art/companions", "art/stickers", "icons"):
    g = sum(v for k, v in sizes.items() if k.startswith(group))
    print(f"  {group}: {g / 1024:.0f} KB")
