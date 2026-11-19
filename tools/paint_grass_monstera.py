# Paints the clean long curvy grass card and the monstera clump cards in the pines' palette.
# Rules (notes/style.md): 3 flat value steps, a light rim on the lit edge, no inner ink, clean silhouette.
import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

random.seed(7)
pine = np.array(Image.open('tex/tallpine.webp').convert('RGBA')).astype(float)
m = pine[:, :, 3] > 200
px = pine[m][:, :3]
L = px.mean(1)
# pine foliage greens only (drop the warm trunk): greener than red
green = px[(px[:, 1] > px[:, 0] + 6)]
GL = green.mean(1)
DARK = np.median(green[GL < np.percentile(GL, 30)], 0)
MID = np.median(green[(GL > np.percentile(GL, 40)) & (GL < np.percentile(GL, 65))], 0)
LIT = np.median(green[GL > np.percentile(GL, 85)], 0)
print('palette', DARK.round(), MID.round(), LIT.round())
C = [tuple(int(v) for v in DARK) + (255,), tuple(int(v) for v in MID) + (255,), tuple(int(v) for v in LIT) + (255,)]
RIM = tuple(int(min(255, v * 1.18 + 18)) for v in LIT) + (255,)

S = 4  # supersample


def blade(d, x0, y0, h, w, bend, curl, col, rim=None):
    # a tapered S-curve blade from (x0,y0) upward; bend = sideways lean, curl = S strength
    n = 40
    left, right, mid = [], [], []
    for i in range(n + 1):
        t = i / n
        x = x0 + bend * t * t * h + curl * math.sin(t * math.pi * 1.4) * h * 0.12
        y = y0 - h * t * (1 - 0.18 * t * t * abs(bend))
        mid.append((x, y))
    for i, (x, y) in enumerate(mid):
        t = i / n
        if i < n:
            dx, dy = mid[i + 1][0] - x, mid[i + 1][1] - y
        else:
            dx, dy = x - mid[i - 1][0], y - mid[i - 1][1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        ww = w * (1 - t) ** 0.85 * (0.75 + 0.25 * math.sin(t * math.pi))
        left.append((x + nx * ww, y + ny * ww))
        right.append((x - nx * ww, y - ny * ww))
    d.polygon(left + right[::-1], fill=col)
    if rim:  # light edge on the lit (left) side, upper 70%
        k = int(n * 0.25)
        pts = left[k:]
        inner = [(px_ + (mx - px_) * 0.28, py_ + (my - py_) * 0.28) for (px_, py_), (mx, my) in zip(pts, mid[k:])]
        d.polygon(pts + inner[::-1], fill=rim)


def grass_card(path, W=512, H=768, blades=13):
    im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base = H * S - 2
    spec = []
    for i in range(blades):
        side = (i / (blades - 1)) * 2 - 1  # -1..1 across the clump
        x0 = W * S * (0.5 + side * 0.22 + random.uniform(-0.04, 0.04))
        h = H * S * random.uniform(0.62, 0.97) * (1 - 0.25 * abs(side))
        w = W * S * random.uniform(0.028, 0.042)
        bend = side * random.uniform(0.25, 0.55) + random.uniform(-0.1, 0.1)
        curl = random.choice([-1, 1]) * random.uniform(0.5, 1.0)
        layer = 0 if abs(side) < 0.45 else (1 if random.random() < 0.6 else 2)
        spec.append((layer, x0, h, w, bend, curl))
    # back blades dark, then mid, then a few lit front blades with a rim
    for layer, x0, h, w, bend, curl in sorted(spec, key=lambda s: -s[2]):
        blade(d, x0, base, h, w, bend, curl, C[0])
    for layer, x0, h, w, bend, curl in spec:
        if layer >= 1:
            blade(d, x0 + w * 0.6, base, h * 0.86, w * 0.95, bend * 1.1, -curl, C[1])
    for layer, x0, h, w, bend, curl in spec:
        if layer == 2:
            blade(d, x0 - w, base, h * 0.7, w * 0.9, bend * 0.8, curl, C[2], RIM)
    im = im.resize((W, H), Image.LANCZOS)
    im.save(path, 'WEBP', quality=88, method=6)
    print('wrote', path)


def posterize_leaf(img):
    al0 = np.array(img.convert('RGBA'))[:, :, 3].astype(float)
    a = np.array(img.convert('RGBA').filter(ImageFilter.GaussianBlur(3))).astype(float)
    a[:, :, 3] = al0
    lum = a[:, :, :3].mean(2)
    al = a[:, :, 3]
    inside = al > 100
    q = np.percentile(lum[inside], [38, 78])
    out = np.zeros_like(a)
    for i, col in enumerate(C):
        sel = inside & ((lum <= q[0]) if i == 0 else ((lum > q[0]) & (lum <= q[1])) if i == 1 else (lum > q[1]))
        out[sel, :3] = col[:3]
    # light rim: bright yellow-green outline in the source becomes the lit rim
    src = a[:, :, :3]
    edge = np.array(Image.fromarray(np.where(al0 > 110, 255, 0).astype('uint8')).filter(ImageFilter.MinFilter(9))) < 128
    rim = inside & edge & (np.arange(a.shape[1])[None, :] < a.shape[1] * 0.62)
    out[rim, :3] = RIM[:3]
    out[:, :, 3] = np.where(al > 110, 255, 0)
    o = Image.fromarray(out.astype('uint8'))
    # flat shapes: smooth the step edges slightly so they read as painted, not pixel noise
    o = o.filter(ImageFilter.ModeFilter(9))
    return o


def monstera_clump(path, W=1024, H=1024, seed=1, leaves=7):
    random.seed(seed)
    leaf = Image.open('tex/monstera.webp').convert('RGBA')
    leaf = posterize_leaf(leaf)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(im)
    order = []
    for i in range(leaves):
        ang = -70 + 140 * (i / (leaves - 1)) + random.uniform(-10, 10)
        sc = random.uniform(0.42, 0.6) * (1.0 - 0.25 * abs(ang) / 70)
        order.append((abs(ang), ang, sc))
    for k, (_, ang, sc) in enumerate(sorted(order, reverse=True)):
        lw = int(leaf.width * sc)
        lh = int(leaf.height * sc)
        lf = leaf.resize((lw, lh), Image.LANCZOS)
        # outer leaves sit in shade: darken one step
        if k < leaves // 2:
            arr = np.array(lf).astype(float)
            arr[:, :, :3] *= 0.78
            lf = Image.fromarray(arr.astype('uint8'))
        lf = lf.rotate(-ang, resample=Image.BICUBIC, expand=True)
        # stem base at the card's bottom centre: place leaf so its petiole end points at the base
        r = H * 0.27 * sc / 0.55
        cx = W / 2 + math.sin(math.radians(ang)) * r
        cy = H * 0.98 - math.cos(math.radians(ang)) * r - lf.height * 0.02
        # petiole: a curved dark stem from the base to the leaf
        bx, by = W / 2 + random.uniform(-30, 30), H - 1
        ex, ey = cx - math.sin(math.radians(ang)) * lf.height * 0.3, cy + math.cos(math.radians(ang)) * lf.height * 0.3
        pts = [(bx + (ex - bx) * t + math.sin(t * math.pi) * 25 * (1 if ang > 0 else -1), by + (ey - by) * t) for t in [i / 12 for i in range(13)]]
        sd.line(pts, fill=C[0], width=14, joint='curve')
        im.alpha_composite(lf, (int(cx - lf.width / 2), int(cy - lf.height / 2)))
    a = np.array(im)
    a[:, :, 3] = np.where(a[:, :, 3] > 120, 255, 0)
    Image.fromarray(a).save(path, 'WEBP', quality=88, method=6)
    print('wrote', path)


if __name__ == '__main__':
    grass_card('tex/curlgrass.webp')
    random.seed(21)
    grass_card('tex/curlgrass2.webp', blades=11)
    monstera_clump('tex/monstera-a.webp', seed=3, leaves=7)
    monstera_clump('tex/monstera-b.webp', seed=9, leaves=5)
