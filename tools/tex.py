# Builds the painted textures for Love Letter.
# Ink linework and hatching are baked in here, so the GPU only samples them.
import math, random, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
R = '/home/sprite/work/pines'
G = '/home/sprite/work/sky/gen'
K = '/home/sprite/work/sky/k'
F = '/home/sprite/work/sky/fonts'
T = R + '/tex'
os.makedirs(T, exist_ok=True)
rng = np.random.default_rng(7)
random.seed(7)
INK = (52, 36, 30)

def save(im, name, q=84, size=None):
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(f'{T}/{name}.webp', 'WEBP', quality=q, method=6)
    print(name, im.size, os.path.getsize(f'{T}/{name}.webp') // 1024, 'KB')

def noise(w, h, scale, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        s = max(2, int(scale * 2 ** o))
        n = r.random((s, s)).astype(np.float32)
        n = np.array(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
        out += n * amp; tot += amp; amp *= 0.5
    return out / tot

def tileable(im):
    # mirror-blend edges so a generated texture tiles without a seam
    a = np.array(im).astype(np.float32); h, w = a.shape[:2]
    b = np.roll(a, (h // 2, w // 2), (0, 1))
    y = np.abs(np.linspace(-1, 1, h))[:, None]; x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(np.maximum(x, y) * 1.6 - 0.6, 0, 1)[..., None]
    return Image.fromarray((a * (1 - m) + b * m).astype(np.uint8))

# ---------- sky (opaque) ----------
sky = Image.open(f'{G}/sky.jpg').convert('RGB')
save(sky, 'sky', 80, (1024, round(1024 * sky.height / sky.width)))

# ---------- wood, roof ----------
lw = tileable(Image.open(f'{G}/logwood.jpg').convert('RGB'))
save(lw, 'logwood', 82, (1024, 1024))
rf = tileable(Image.open(f'{G}/roof.jpg').convert('RGB'))
save(rf, 'roof', 82, (1024, 1024))

# ---------- log end: rings, cracks, ink ----------
S = 256
im = Image.new('RGB', (S, S), (150, 108, 68)); d = ImageDraw.Draw(im)
n = noise(S, S, 6, 3, 3)
cx = cy = S / 2
yy, xx = np.mgrid[0:S, 0:S]
rr = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (S / 2)
ring = (np.sin((rr + n * 0.08) * 70) * 0.5 + 0.5)
base = np.array([196, 150, 96])[None, None] * (0.86 + 0.14 * ring[..., None]) * (0.9 + 0.2 * n[..., None])
bark = np.clip((rr - 0.86) / 0.06, 0, 1)[..., None]
base = base * (1 - bark) + np.array([88, 62, 44])[None, None] * bark
a = np.clip((1.0 - rr) / 0.02, 0, 1)
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
for r in np.linspace(0.08, 0.84, 9):
    rad = r * S / 2
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=(120, 82, 50), width=1)
for k in range(3):
    ang = random.random() * 6.28
    pts = [(cx + math.cos(ang) * S * 0.05 * i + random.uniform(-2, 2), cy + math.sin(ang) * S * 0.05 * i + random.uniform(-2, 2)) for i in range(1, 8)]
    d.line(pts, fill=INK, width=2)
d.ellipse([2, 2, S - 3, S - 3], outline=INK, width=4)
save(im, 'logend', 84)

# ---------- stone chimney ----------
W = 512
st = np.zeros((W, W, 3), np.float32)
pts = []
for row in range(9):
    y = (row + 0.5) * W / 9
    x = random.uniform(0, 40)
    while x < W + 60:
        pts.append((x, y + random.uniform(-10, 10))); x += random.uniform(55, 95)
pts = np.array(pts)
yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
d1 = np.full((W, W), 1e9, np.float32); d2 = np.full((W, W), 1e9, np.float32); idx = np.zeros((W, W), np.int32)
for i, (px, py) in enumerate(pts):
    for ox in (-W, 0, W):
        dd = ((xx - px - ox) * 0.8) ** 2 + ((yy - py) * 1.4) ** 2
        m = dd < d1
        d2 = np.where(m, d1, np.minimum(d2, dd)); d1 = np.where(m, dd, d1); idx = np.where(m, i, idx)
edge = np.sqrt(d2) - np.sqrt(d1)
cols = rng.uniform(0.75, 1.1, (len(pts), 1)) * np.array([[150, 146, 138]])
n = noise(W, W, 16, 4, 5)
st = cols[idx] * (0.8 + 0.35 * n[..., None])
shade = np.clip(edge / 14, 0, 1)[..., None]
st = st * (0.55 + 0.45 * shade)
moss = np.clip((noise(W, W, 5, 3, 9) - 0.55) * 4, 0, 1)[..., None] * np.clip(1 - yy / W, 0, 1)[..., None]
st = st * (1 - moss * 0.7) + np.array([96, 120, 62]) * moss * 0.7
st = np.where((edge < 2.2)[..., None], np.array(INK, np.float32), st)
save(Image.fromarray(np.clip(st, 0, 255).astype(np.uint8)), 'stone', 82, (256, 256))

# ---------- window (warm glow painted, ink frame) + door ----------
W, H = 256, 320
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.sqrt(((xx - W * 0.55) / W) ** 2 + ((yy - H * 0.62) / H) ** 2)
glow = np.clip(1 - r * 1.6, 0, 1)
win = np.array([255, 196, 110]) * (0.55 + 0.6 * glow[..., None]) + np.array([90, 40, 10]) * (1 - glow[..., None]) * 0.3
im = Image.fromarray(np.clip(win, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
# curtain silhouettes and a little interior hint
d.polygon([(14, 14), (70, 14), (52, 160), (28, 300), (14, 300)], fill=(196, 104, 52))
d.polygon([(W - 14, 14), (W - 66, 14), (W - 50, 170), (W - 30, 300), (W - 14, 300)], fill=(196, 104, 52))
for x in (30, 44, 58): d.line([(x, 16), (x - 8, 298)], fill=(150, 72, 36), width=2)
d.rectangle([W * 0.5 - 30, H * 0.78, W * 0.5 + 30, H * 0.8], fill=(110, 60, 30))  # sill shelf
d.ellipse([W * 0.5 - 10, H * 0.66, W * 0.5 + 10, H * 0.78], fill=(255, 236, 170))  # candle glow
fr = (88, 58, 38)
d.rectangle([0, 0, W - 1, H - 1], outline=fr, width=14)
d.line([(W / 2, 0), (W / 2, H)], fill=fr, width=10); d.line([(0, H * 0.45), (W, H * 0.45)], fill=fr, width=10)
d.rectangle([0, 0, W - 1, H - 1], outline=INK, width=4)
for x0, x1, y0, y1 in [(14, W / 2 - 5, 14, H * .45 - 5), (W / 2 + 5, W - 14, 14, H * .45 - 5), (14, W / 2 - 5, H * .45 + 5, H - 14), (W / 2 + 5, W - 14, H * .45 + 5, H - 14)]:
    d.rectangle([x0, y0, x1, y1], outline=INK, width=2)
    d.line([(x0 + 8, y1 - 10), (x0 + 30, y0 + 10)], fill=(255, 240, 200), width=2)
save(im, 'window', 84)
W, H = 256, 448
im = Image.open(f'{G}/logwood.jpg').convert('RGB').rotate(90, expand=True).resize((W, H))
im = Image.fromarray((np.array(im) * 0.72).astype(np.uint8)); d = ImageDraw.Draw(im)
for x in range(0, W, W // 5): d.line([(x, 0), (x, H)], fill=INK, width=3)
for y in (H * .2, H * .8): d.rectangle([0, y - 8, W, y + 8], fill=(80, 54, 36), outline=INK, width=2)
d.ellipse([W * .78, H * .5, W * .86, H * .55], fill=(196, 160, 90), outline=INK, width=2)
d.rectangle([0, 0, W - 1, H - 1], outline=INK, width=6)
save(im, 'door', 82)

# ---------- balloon envelope: 12 gores, seams, load tapes, ink, painted shading ----------
W, H = 1024, 1024
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
gore = (xx / W * 12) % 1
gi = (xx / W * 12).astype(int)
reds = np.array([[178, 44, 38], [196, 58, 44], [170, 40, 40], [190, 64, 48]], np.float32)
base = reds[gi % 4]
# cream crown band and a darker skirt band, like a vintage envelope
v = yy / H  # 0 = crown (top), 1 = mouth
band = ((v > 0.22) & (v < 0.27))
base = np.where(band[..., None], np.array([226, 200, 160], np.float32), base)
base = np.where((v > 0.9)[..., None], np.array([110, 34, 30], np.float32), base)
base = np.where((v < 0.035)[..., None], np.array([90, 70, 60], np.float32), base)
# fabric weave noise + gentle pillowing between tapes
n = noise(W, H, 40, 3, 11)
pillow = np.sin(gore * math.pi) ** 0.6
base = base * (0.86 + 0.14 * pillow[..., None]) * (0.94 + 0.12 * n[..., None])
# horizontal panel seams
for k in range(1, 14):
    y = k / 14
    base = np.where((np.abs(v - y) < 0.0016)[..., None], base * 0.7, base)
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
for k in range(12):
    x = k * W / 12
    d.line([(x, 0), (x, H)], fill=INK, width=3)      # load tape (ink)
    d.line([(x + 4, 0), (x + 4, H)], fill=(220, 120, 96), width=1)  # stitched highlight
    for y in range(8, H, 18): d.line([(x - 6, y), (x - 6, y + 8)], fill=(120, 30, 28), width=1)  # stitch dashes
d.line([(0, H * .22), (W, H * .22)], fill=INK, width=3); d.line([(0, H * .27), (W, H * .27)], fill=INK, width=3)
save(im, 'balloon', 84, (768, 768))

# ---------- wicker ----------
W = 256
im = Image.new('RGB', (W, W), (120, 84, 48)); d = ImageDraw.Draw(im)
for row in range(16):
    y = row * W / 16
    for col in range(16):
        x = col * W / 16 + (8 if row % 2 else 0)
        c = random.randint(-14, 14)
        d.rounded_rectangle([x + 1, y + 1, x + W / 16 - 1, y + W / 16 - 1], 5, fill=(188 + c, 146 + c, 92 + c), outline=(92, 60, 34))
        d.line([(x + 3, y + 4), (x + W / 16 - 4, y + 4)], fill=(224, 192, 140), width=1)
for x in range(0, W, 16): d.line([(x, 0), (x, W)], fill=(70, 46, 28), width=1)
save(im, 'wicker', 84)

# ---------- the letter: old torn paper, handwriting, ink bleed, creases ----------
W, H = 900, 1180
paper = Image.open(f'{G}/paper.jpg').convert('RGB').resize((W, H), Image.LANCZOS)
pa = np.array(paper).astype(np.float32)
# warm it slightly and add foxing
fox = np.clip((noise(W, H, 9, 4, 21) - 0.62) * 3, 0, 1)[..., None]
pa = pa * (1 - fox * 0.25) + np.array([150, 104, 60]) * fox * 0.25
# torn alpha: irregular edge, deep tear on the top-right, fibres
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
n1 = noise(W, H, 30, 4, 31); n2 = noise(W, H, 120, 2, 32)
m = 46 + n1 * 40 + n2 * 14
dist = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy])
tear = (xx - W * 0.8) * 0.9 + (H * 0.1 - yy)  # diagonal tear line off the top-right corner
tear = tear + (n1 - 0.5) * 70 + (n2 - 0.5) * 20
alpha = np.clip((dist - m) / 3.0, 0, 1) * np.clip((-tear - 4) / 3.0, 0, 1)
fibre = np.clip((dist - m + 8) / 8, 0, 1) * (n2 > 0.55)  # pale fibres just beyond the cut
edgeband = np.clip(1 - np.abs(dist - m - 6) / 12, 0, 1) + np.clip(1 - np.abs(-tear - 10) / 14, 0, 1)
pa = pa * (1 - edgeband[..., None] * 0.28) + np.array([120, 84, 50]) * edgeband[..., None] * 0.28
alpha = np.maximum(alpha, fibre * 0.0)
pa = np.clip(pa, 0, 255)
im = Image.fromarray(np.dstack([pa, alpha * 255]).astype(np.uint8), 'RGBA')
# creases (fold lines) drawn in ink-light + highlight
d = ImageDraw.Draw(im)
d.line([(0, H * 0.34), (W, H * 0.355)], fill=(150, 118, 84, 160), width=2)
d.line([(0, H * 0.34 + 3), (W, H * 0.355 + 3)], fill=(255, 246, 226, 140), width=2)
d.line([(0, H * 0.68), (W, H * 0.665)], fill=(150, 118, 84, 150), width=2)
d.line([(W * 0.5, 0), (W * 0.49, H)], fill=(150, 118, 84, 90), width=1)
# handwriting with ink bleed: blurred dilated under-layer, then crisp ink
txt = Image.new('L', (W, H), 0); dt = ImageDraw.Draw(txt)
cav = ImageFont.truetype(f'{F}/Caveat.ttf', 150); cav.set_variation_by_axes([560])
cav2 = ImageFont.truetype(f'{F}/Caveat.ttf', 84); cav2.set_variation_by_axes([480])
sig = ImageFont.truetype(f'{F}/MrsSaintDelafield-Regular.ttf', 230)
dt.text((W * 0.5, H * 0.29), 'Thank you', font=cav, fill=255, anchor='mm')
dt.text((W * 0.5, H * 0.56), 'With love,', font=cav2, fill=255, anchor='mm')
dt.text((W * 0.52, H * 0.73), 'Shifat', font=sig, fill=255, anchor='mm')
# flourish under the signature
d2 = ImageDraw.Draw(txt)
pts = [(W * 0.26 + i * 6, H * 0.83 + math.sin(i * 0.09) * 10 - i * 0.12) for i in range(80)]
d2.line(pts, fill=255, width=4, joint='curve')
bleed = txt.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
ink = np.array([38, 30, 46], np.float32)
rgba = np.array(im).astype(np.float32)
b = np.array(bleed).astype(np.float32)[..., None] / 255 * 0.35
t = np.array(txt).astype(np.float32)[..., None] / 255
# ink density varies along the stroke (pen pressure) via noise
t = t * (0.78 + 0.22 * noise(W, H, 60, 2, 41)[..., None])
rgba[..., :3] = rgba[..., :3] * (1 - b) + np.array([90, 70, 80]) * b
rgba[..., :3] = rgba[..., :3] * (1 - t) + ink * t
# a small ink blot
im = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA'); d = ImageDraw.Draw(im)
d.ellipse([W * 0.8, H * 0.6, W * 0.8 + 12, H * 0.6 + 10], fill=(38, 30, 46, 200))
im.save(f'{T}/letter.webp', 'WEBP', quality=88, method=6)
im.resize((W // 2, H // 2), Image.LANCZOS).save(f'{T}/letter-low.webp', 'WEBP', quality=86)
print('letter', im.size, os.path.getsize(f'{T}/letter.webp') // 1024, 'KB')

# ---------- glow sprite (warm, never white) + smoke puff + light shaft ----------
S = 128
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
r = np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2)
g = np.clip(1 - r, 0, 1) ** 2.2
Image.fromarray((g * 255).astype(np.uint8), 'L').save(f'{T}/glow.png')
sm = np.clip(1 - r, 0, 1) ** 1.4 * (0.7 + 0.3 * noise(S, S, 4, 3, 51))
Image.fromarray((sm * 255).astype(np.uint8), 'L').save(f'{T}/puff.png')
W, H = 64, 256
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
sh = np.sin(xx / (W - 1) * math.pi) ** 2 * np.clip(1 - yy / H, 0, 1) ** 0.8
Image.fromarray((sh * 255).astype(np.uint8), 'L').save(f'{T}/shaft.png')
# film grain tile
gr = (rng.normal(128, 38, (160, 160))).clip(0, 255).astype(np.uint8)
Image.fromarray(gr, 'L').save(f'{T}/grain.png', optimize=True)

# ---------- painted cards: copy keyed layers at phone-friendly sizes ----------
sizes = {'farpines': 2048, 'midpines': 2048, 'cloudsea': 2048, 'clouds1': 1536, 'ground': 1536,
         'tallpine': 512, 'monstera': 768, 'fanpalm': 768, 'fern': 768, 'grass': 640, 'bough': 768}
for k, w in sizes.items():
    im = Image.open(f'{K}/{k}.webp')
    if k == 'cloudsea': im = im.crop((0, int(im.height * 0.24), im.width, im.height))
    if k in ('midpines', 'farpines'):
        a = np.array(im).astype(np.float32); hh = a.shape[0]
        f = np.clip((1 - np.linspace(0, 1, hh)) / 0.16, 0, 1) ** 1.5
        a[..., 3] *= f[:, None]
        sp = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None)
        a[..., 0] -= sp * 0.8; a[..., 2] -= sp * 0.8
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(f'{T}/{k}.webp', 'WEBP', quality=84, method=6)
    print(k, im.size, os.path.getsize(f'{T}/{k}.webp') // 1024, 'KB')
