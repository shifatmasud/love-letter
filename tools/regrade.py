# Regrade the painted layers toward the reference palette (fresh morning greens, blue haze, white clouds).
# Reads the untouched originals from /home/sprite/work/tex-orig, writes tex/*.webp.
# Why: the paintings came out olive/brown (fan palm mean RGB 107,93,65) and the far layers beige,
# so the whole frame read muddy next to the reference's blue sky, white mist and vivid greens.
import numpy as np, sys
from PIL import Image
SRC = '/home/sprite/work/tex-orig/'
OUT = '/home/sprite/work/pines/tex/'

def load(n):
    return np.array(Image.open(SRC + n + '.webp').convert('RGBA')).astype(np.float32) / 255

def save(n, a, q=86):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT + n + '.webp', quality=q, method=6)

def rgb2hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx = c[..., :3].max(-1); mn = c[..., :3].min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx

def hsv2rgb(h, s, v):
    i = np.floor(h * 6) % 6; f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r = np.choose(i.astype(int), [v, q, p, p, t, v]); g = np.choose(i.astype(int), [t, v, v, q, p, p]); b = np.choose(i.astype(int), [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)

def greens(a, hue=0.27, pull=0.75, sat=1.55, val=1.06, lo=0.03, hi=0.36):
    """pull olive/brown/khaki foliage toward a fresh green; leave reds, purples, whites alone"""
    h, s, v = rgb2hsv(a)
    w = np.clip((h - lo) / 0.04, 0, 1) * np.clip((hi - h) / 0.04, 0, 1) * np.clip((s - 0.06) / 0.08, 0, 1)
    h2 = h + (hue - h) * pull * w
    s2 = np.clip(s * (1 + (sat - 1) * w), 0, 0.85)
    v2 = np.clip(v * (1 + (val - 1) * w), 0, 1)
    out = a.copy(); out[..., :3] = hsv2rgb(h2 % 1, s2, v2); return out

def lummap(a, dark, light, keep=0.15, gamma=1.0):
    """repaint by luminance into a two-colour ramp (atmospheric layers)"""
    L = (a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)) ** gamma
    d = np.array(dark, np.float32) / 255; l = np.array(light, np.float32) / 255
    ramp = d + (l - d) * L[..., None]
    out = a.copy(); out[..., :3] = ramp * (1 - keep) + a[..., :3] * keep; return out

def feather(a, left=0.0, right=0.0, top=0.0, bottom=0.0):
    """soft alpha fade at the borders so a card never shows a hard edge"""
    hgt, wid = a.shape[:2]
    x = (np.arange(wid) + 0.5) / wid; y = (np.arange(hgt) + 0.5) / hgt  # y=0 top row
    fx = np.ones(wid); fy = np.ones(hgt)
    if left: fx *= np.clip(x / left, 0, 1)
    if right: fx *= np.clip((1 - x) / right, 0, 1)
    if top: fy *= np.clip(y / top, 0, 1)
    if bottom: fy *= np.clip((1 - y) / bottom, 0, 1)
    f = fy[:, None] * fx[None, :]; f = f * f * (3 - 2 * f)
    a = a.copy(); a[..., 3] *= f; return a

def bark(a):
    """calm the pink-red trunks to a grey-brown bark"""
    h, s, v = rgb2hsv(a)
    w = (np.minimum(h, 1 - h) < 0.09).astype(np.float32) * np.clip((s - 0.1) / 0.1, 0, 1)
    out = a.copy(); out[..., :3] = hsv2rgb(h + (0.075 - h) * w * (h < 0.5), s * (1 - 0.45 * w), v * (1 - 0.12 * w)); return out

JOBS = {
    'monstera': lambda a: greens(a, hue=0.30, sat=1.6, val=1.08),
    'fanpalm':  lambda a: greens(a, hue=0.25, sat=1.6, val=1.12, lo=0.0),
    'fern':     lambda a: greens(a, hue=0.26, sat=1.7, val=1.04, lo=0.0),
    'grass':    lambda a: greens(a, hue=0.24, sat=1.6, val=1.10, lo=0.0, hi=0.30),
    'bough':    lambda a: greens(a, hue=0.33, sat=1.5, val=1.0),
    'tallpine': lambda a: bark(greens(a, hue=0.36, pull=0.6, sat=1.35, val=1.0, lo=0.10)),
    'midpines': lambda a: feather(lummap(greens(a, hue=0.38, sat=1.3), (22, 52, 46), (122, 160, 128), keep=0.25), top=0.08, left=0.04, right=0.04),
    'farpines': lambda a: feather(lummap(a, (78, 108, 124), (205, 222, 228), keep=0.12), left=0.10, right=0.10),
    # the painting was cut flat along its bottom (fully opaque bottom row): that straight line was the 'cloud bug'
    'clouds1':  lambda a: feather(lummap(a, (150, 165, 190), (255, 251, 244), keep=0.1, gamma=0.8), left=0.14, right=0.14, bottom=0.32),
    # the original cloud sea was a fully opaque rectangle (edge alpha ~230): its bottom edge showed as a hard band mid-scroll
    'cloudsea': lambda a: feather(lummap(a, (58, 70, 118), (214, 216, 238), keep=0.15), left=0.12, right=0.12, top=0.30, bottom=0.3),
}
for n in (sys.argv[1:] or JOBS):
    save(n, JOBS[n](load(n))); print('regraded', n)
