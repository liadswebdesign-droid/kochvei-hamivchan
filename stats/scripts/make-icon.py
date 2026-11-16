# Draws dashboard/icon.png (180x180, the iOS home-screen size). Run once with ~/.claude/venv/bin/python (needs Pillow).
import math, sys
from pathlib import Path
from PIL import Image, ImageDraw

S = 180 * 4  # draw at 4x, downsample for smooth edges
img = Image.new('RGB', (S, S))
d = ImageDraw.Draw(img)
top, bottom = (79, 179, 217), (44, 92, 168)
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
# three bars, rising
bw, gap, base = S * 0.13, S * 0.06, S * 0.80
x0 = (S - (3 * bw + 2 * gap)) / 2
for i, h in enumerate((0.20, 0.32, 0.44)):
    x = x0 + i * (bw + gap)
    d.rounded_rectangle([x, base - S * h, x + bw, base], radius=S * 0.03, fill=(255, 255, 255))
# star above
cx, cy, R, r = S * 0.5, S * 0.25, S * 0.15, S * 0.065
pts = []
for k in range(10):
    a = -math.pi / 2 + k * math.pi / 5
    rad = R if k % 2 == 0 else r
    pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
d.polygon(pts, fill=(255, 216, 77))
out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'dashboard' / 'icon.png')
img.resize((180, 180), Image.LANCZOS).save(out, optimize=True)
print(out, out.stat().st_size, 'bytes')
