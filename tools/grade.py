# Bring a keyed plant painting into the site palette (notes/style.md):
# tame warm-yellow highlights into a pale sage-gold rim and soften value contrast.
# usage: grade.py in.webp out.webp [highlight_tame 0..1] [contrast]
import sys, colorsys
import numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
tame = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
con = float(sys.argv[4]) if len(sys.argv) > 4 else 0.88
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32) / 255
rgb, a = im[..., :3], im[..., 3:]
L = (rgb * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
# warm = red/yellow channel lead over blue
warm = np.clip((rgb[..., :1] - rgb[..., 2:3]) * 3, 0, 1) * np.clip((L - 0.45) * 3, 0, 1)
sage_gold = np.array([0.80, 0.80, 0.62])
rgb = rgb * (1 - warm * tame) + (sage_gold * (0.55 + 0.45 * L / max(L.max(), 1e-3))) * warm * tame
# soften contrast around the mid value
mid = 0.42
rgb = mid + (rgb - mid) * con
# reddish outline -> warm brown ink like the pines
red = np.clip((rgb[..., :1] - rgb[..., 1:2]) * 4 - 0.1, 0, 1)
ink = np.array([0.33, 0.25, 0.22])
rgb = rgb * (1 - red * 0.6) + ink * red * 0.6
out = np.concatenate([np.clip(rgb, 0, 1), a], -1)
Image.fromarray((out * 255).astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=86, method=6)
print(dst)
