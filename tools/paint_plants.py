# Paints the hero plants as big simple masses and long grass clumps, in the pines' palette.
# Rules (notes/style.md): clean silhouette, 3 value steps, ink only on the outer edge, brush grain inside.
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
rng = np.random.default_rng(7)
INK = np.array([30, 33, 28]); SH = np.array([30, 54, 44]); MID = np.array([58, 90, 66]); LIT = np.array([110, 132, 90]); TOP = np.array([168, 160, 110])

def noise(h, w, s, seed):
    r = np.random.default_rng(seed); n = r.random((h // s + 2, w // s + 2))
    return np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)) / 255.0

def brush(h, w, seed):
    # streaky brush grain: noise smeared along a slanted stroke direction
    m = int(max(h, w) * 1.5)
    n = (np.random.default_rng(seed).random((m, m)) * 255).astype(np.uint8)
    im = Image.fromarray(n).filter(ImageFilter.GaussianBlur(1.2)).rotate(28, resample=Image.BILINEAR, expand=False)
    a = np.array(im.crop(((m - w) // 2, (m - h) // 2, (m - w) // 2 + w, (m - h) // 2 + h)))
    k = np.array(Image.fromarray(a).filter(ImageFilter.Kernel((5, 5), [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], scale=5)))
    return k / 255.0

def mass(w, h, blobs, seed, needle=0.022):
    """A plant mass: union of round clumps with a fine needle edge, lit from upper left."""
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    field = np.full((h, w), -1e9, np.float32); light = np.zeros((h, w), np.float32)
    for (cx, cy, rx, ry) in blobs:
        cx *= w; cy *= h; rx *= w; ry *= h
        ang = np.arctan2(yy - cy, xx - cx)
        # needle edge: many small spikes, like the pine boughs' edge, kept fine so the silhouette stays clean
        # needle edge: tufts of fine spikes with uneven length (amplitude rides a slow wave), like the pine boughs
        amp = 0.5 + 0.5 * np.sin(ang * r.integers(4, 7) + r.random() * 6) * np.sin(ang * r.integers(9, 13) + r.random() * 6)
        sp = 1 + needle * amp * (np.abs(np.sin(ang * r.integers(55, 80) + 0.8 * np.sin(ang * 7 + r.random() * 6))) ** 6 * 2.2 - 0.4) + 0.07 * np.sin(ang * 3 + r.random() * 6)
        d = 1 - np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) / sp
        upd = d > field
        # light inside a clump: high on the upper left of each clump
        l = 0.55 - 0.55 * ((xx - cx) / rx * 0.45 + (yy - cy) / ry * 0.9)
        light = np.where(upd, l, light); field = np.maximum(field, d)
    inside = field > 0
    # flatten the bottom: masses sit on the ground
    inside &= yy < h * 0.985
    lo = noise(h, w, 48, seed + 1); br = brush(h, w, seed + 2)
    v = light + (lo - 0.5) * 0.12 + (br - 0.5) * 0.12
    v -= np.clip((yy / h - 0.55) * 1.2, 0, 1) * 0.5  # the base sinks into shade
    col = np.where((v < 0.28)[..., None], SH, np.where((v < 0.62)[..., None], MID, LIT)).astype(np.float32)
    top = (v > 0.86) & (br > 0.55)
    col[top] = TOP
    col *= (0.94 + 0.12 * br)[..., None]
    # ink only on the outer silhouette: a thin dark rim inside the edge
    a = Image.fromarray((inside * 255).astype(np.uint8))
    er = np.array(a.filter(ImageFilter.MinFilter(5))) > 128
    rim = inside & ~er
    col[rim] = col[rim] * 0.35 + INK * 0.65
    alpha = np.array(a.filter(ImageFilter.GaussianBlur(0.7)))
    out = np.dstack([np.clip(col, 0, 255).astype(np.uint8), alpha])
    return Image.fromarray(out, 'RGBA')

def grass(w, h, n, seed):
    """A long grass clump: tapered curved blades, dark base, mid body, light tips. No ink lines."""
    r = np.random.default_rng(seed)
    S = 2; W, H = w * S, h * S
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    blades = []
    for i in range(n):
        x0 = W * (0.18 + 0.64 * r.random()); L = H * (0.55 + 0.43 * r.random()); lean = (r.random() - 0.5) * 0.9 + (x0 / W - 0.5) * 0.8
        wid = W * (0.010 + 0.010 * r.random()); shade = r.random()
        blades.append((shade, x0, L, lean, wid))
    blades.sort()  # darker blades behind
    for shade, x0, L, lean, wid in blades:
        pts_l, pts_r = [], []
        for k in range(13):
            t = k / 12; x = x0 + lean * L * 0.5 * t * t; y = H - L * t; ww = wid * (1 - t) ** 0.8
            pts_l.append((x - ww, y)); pts_r.append((x + ww, y))
        base = SH if shade < 0.35 else MID if shade < 0.8 else LIT
        d.polygon(pts_l + pts_r[::-1], fill=tuple(int(c) for c in base) + (255,))
    a = np.array(img).astype(np.float32)
    yy = np.mgrid[0:H, 0:W][0] / H
    # value steps along the height: base in shade, tips catch light (2 steps over the blade colour)
    k = np.where(yy > 0.72, 0.62, np.where(yy > 0.35, 0.86, 1.0))
    tipmix = np.clip((0.35 - yy) / 0.35, 0, 1) * 0.35
    rgb = a[..., :3] * k[..., None]; rgb = rgb * (1 - tipmix[..., None]) + TOP * tipmix[..., None]
    br = brush(H, W, seed + 9); rgb *= (0.93 + 0.14 * br)[..., None]
    a[..., :3] = rgb
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)

if __name__ == '__main__':
    T = '/home/sprite/work/pines/tex/'
    # a low wide juniper-like mound (reference: Potawatomi clearing) and a taller bank (bracken under pines)
    mass(768, 384, [(0.22, 0.66, 0.2, 0.36), (0.42, 0.52, 0.22, 0.5), (0.63, 0.58, 0.2, 0.44), (0.8, 0.72, 0.16, 0.3)], 11).save(T + 'mass1.webp', quality=88)
    mass(640, 448, [(0.28, 0.62, 0.24, 0.4), (0.52, 0.45, 0.26, 0.52), (0.74, 0.64, 0.2, 0.38)], 23).save(T + 'mass2.webp', quality=88)
    grass(256, 512, 46, 5).save(T + 'longgrass.webp', quality=88)
    print('ok')
