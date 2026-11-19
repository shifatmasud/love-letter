# Chroma-key a generated painting on a flat (muted) magenta background into an RGBA WebP.
# usage: key.py in.jpg out.webp [t0 t1] [maxw] [--feather-bottom]
import sys
from PIL import Image, ImageFilter
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 28
t1 = float(sys.argv[4]) if len(sys.argv) > 4 else 80
maxw = int(sys.argv[5]) if len(sys.argv) > 5 else 2048
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
H, W = im.shape[:2]
edge = np.concatenate([im[:6].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
# bg = the most magenta-ish edge colour cluster (median of edge px whose R,B exceed G)
mag = edge[(edge[:, 0] - edge[:, 1] > 40) & (edge[:, 2] - edge[:, 1] > 15)]
bg = np.median(mag if len(mag) > 50 else edge, 0)
# hue-aware distance: magenta-ness = min(R,B)-G relative to bg
d = np.sqrt(((im - bg) ** 2).sum(-1))
mg = np.minimum(im[..., 0], im[..., 2]) - im[..., 1]
bgm = min(bg[0], bg[2]) - bg[1]
# pixels that are far less magenta than bg are foreground even if close in rgb distance
d2 = np.maximum(d, (bgm - mg) * 1.6)
a = np.clip((d2 - t0) / (t1 - t0), 0, 1)
a = a * a * (3 - 2 * a)
# un-premultiply against bg, then despill remaining magenta
ae = np.maximum(a, 1e-3)[..., None]
fg = bg + (im - bg) / ae
fg = np.where(a[..., None] > 0.02, fg, im)
fg = np.clip(fg, 0, 255)
spill = np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1]
s = np.clip(spill - 6, 0, None)[..., None] * np.array([0.7, 0, 0.7])[None, None]
fg = np.clip(fg - s * (1 - a[..., None] * 0.5), 0, 255)
if '--feather-bottom' in sys.argv:
    pass
out = np.dstack([fg, a * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
# tight crop to content
ys, xs = np.where(a > 0.03)
if len(ys):
    img = img.crop((0, max(0, ys.min() - 2), W, min(H, ys.max() + 3))) if '--keepw' in sys.argv else img.crop((max(0, xs.min() - 2), max(0, ys.min() - 2), min(W, xs.max() + 3), min(H, ys.max() + 3)))
if img.width > maxw:
    img = img.resize((maxw, round(img.height * maxw / img.width)), Image.LANCZOS)
img.save(dst, 'WEBP', quality=86, method=6)
print(dst, img.size, 'bg', bg.round(), 'cover %.2f' % (a.mean()))
