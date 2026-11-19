# Re-grade the grass clumps (root cause of "too dark": the painted clumps themselves had a median value of 44/255, half the
# pines' 81, and the near rows were dimmed again by 0.8). Map each clump onto 3 flat steps in the pines' greens, freshened
# toward the lawn, with a lit rim on the top step; the darkest value only at the clump base; the outer ink kept.
import numpy as np, sys
from PIL import Image
SH, MID, LIT, RIM = np.array([50, 72, 40.]), np.array([84, 114, 57.]), np.array([124, 152, 76.]), np.array([164, 186, 102.])
BASE, INK = np.array([34, 50, 30.]), np.array([24, 33, 23.])
for src, dst in [('/home/sprite/work/tex-orig/curlgrass-r18.webp', 'tex/curlgrass.webp'), ('/home/sprite/work/tex-orig/curlgrass2-r18.webp', 'tex/curlgrass2.webp')]:
    im = np.array(Image.open(src).convert('RGBA')).astype(float); rgb, a = im[..., :3], im[..., 3]
    L = rgb.mean(2); vis = a > 40; ink = vis & (L < 24)
    body = vis & ~ink; q = np.percentile(L[body], [38, 74, 93])
    out = np.where((L < q[0])[..., None], SH, np.where((L < q[1])[..., None], MID, np.where((L < q[2])[..., None], LIT, RIM)))
    ys = np.where(vis.any(1))[0]; y0, y1 = ys.min(), ys.max(); h = y1 - y0
    t = np.clip((np.arange(im.shape[0]) - (y1 - 0.24 * h)) / (0.24 * h), 0, 1)[:, None, None]  # 0 above the base band, 1 at the very bottom
    out = out * (1 - 0.75 * t) + BASE * (0.75 * t)
    out = np.where(ink[..., None], INK, out)
    res = np.dstack([out, a]).clip(0, 255).astype(np.uint8)
    Image.fromarray(res, 'RGBA').save(dst, 'WEBP', quality=92, method=6)
    print(dst, np.median(out[vis].mean(1)).round())
