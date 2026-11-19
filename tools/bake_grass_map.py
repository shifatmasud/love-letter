"""Bake the grass map: tex/grass-map.png (+ tex/grass-map.json with its bounds).

Top-down over the hero ground. White = grass, black = no grass, gray = soft edge (placement chance).
Map space is world XZ at the desktop house scale. On phones the site scales the map about the house with
the house, and stretches the strip from the house's front foot to the monstera line so that line stays at FGZ
(see layoutGrass in js/main.js). So one map fits every screen. Image top row = far edge, bottom row = near the camera.

Black parts:
  1. the house footprint, read from the live page (the house's real base, in house space) plus MARGIN;
  2. the strip in front of the house where a grass tip (GH tall, times SAFE) would reach the house base
     on screen, from the phone and desktop rest cameras at full tilt in every direction;
  3. the monstera band: everything nearer than FGZ.
Everything else is white. Repaint the PNG by hand any time; keep it grayscale and the same size.

usage: python3 tools/bake_grass_map.py          (reads the house and cameras from the local site)
"""
import asyncio, json, os, sys, threading, http.server, functools
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = 256
BOUNDS = (-22.0, -40.0, 22.0, 8.0)   # x0, z0 (far), x1, z1 (near) in map units
GH = 0.42          # one clump height in map units (must match GH in js/main.js)
SAFE = 1.35        # tips stay this much below the sight line to the house base ("well below")
MARGIN = 0.12      # around the house's real base
EDGE = 0.7         # soft edge width, map units
FGZ = 2.0          # nearer than this is the monstera band
GROUND = -0.66
PTR_X, PTR_Y = 0.32, 0.16

JS = """() => { const h = __pines.scene.getObjectByName('L4 house'), B0 = h.parent, hb = B0.userData.hb;
  return { fp: hb.fp, s: hb.s, b0: B0.position.toArray(), root: __pines.root.position.toArray() }; }"""

async def read_site():
    from playwright.async_api import async_playwright
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    H.extensions_map['.js'] = 'text/javascript'
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    out = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for tag, vp in (('phone', (390, 844)), ('desk', (1440, 900))):
            pg = await (await b.new_context(viewport={'width': vp[0], 'height': vp[1]})).new_page()
            await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/')
            await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000)
            out[tag] = await pg.evaluate(JS)
        await b.close()
    return out

def main():
    site = asyncio.run(read_site())
    fp = site['desk']['fp']
    x0, z0, x1, z1 = BOUNDS
    xs = x0 + (np.arange(RES) + 0.5) / RES * (x1 - x0)
    zs = z0 + (np.arange(RES) + 0.5) / RES * (z1 - z0)     # row 0 = far
    QX, QZ = np.meshgrid(xs, zs)
    hx, hz, ry = fp['hx'], fp['hz'], fp['ry']
    c, s_ = np.cos(ry), np.sin(ry)
    def inside(qx, qz, m):  # map point -> house space (inverse of three.js Y rotation), test the base box
        dx, dz = qx - hx, qz - hz
        lx, lz = c * dx - s_ * dz, s_ * dx + c * dz
        return (lx > fp['x0'] - m) & (lx < fp['x1'] + m) & (lz > fp['z0'] - m) & (lz < fp['z1'] + m)
    black = inside(QX, QZ, MARGIN)
    # sight-line strip, per device and tilt corner
    for tag, d in site.items():
        sc = d['s']; bx, by = d['b0'][0] + d['root'][0], d['b0'][1] + d['root'][1]
        # map <-> ground space on this screen (same as layoutGrass in js/main.js)
        zk = d['fp']['zk']; qk = hz + (zk - hz) / sc; k2 = (FGZ - qk) / (FGZ - zk)
        fwd_z = lambda z: np.where(z <= zk, hz + (z - hz) / sc, qk + (z - zk) * k2)
        PX = hx + sc * (QX - hx); PZ = np.where(QZ <= qk, hz + sc * (QZ - hz), zk + (QZ - qk) / k2)
        tip = GH * sc * SAFE
        for tx in (-1, 0, 1):
            for ty in (-1, 1):
                cx, cy, cz = tx * PTR_X - bx, ty * PTR_Y - by, 10.0
                hc = cy - GROUND
                if hc <= tip: continue
                th = hc / (hc - tip)                    # ray camera -> tip hits the ground at this multiple
                for f in np.linspace(0, 1, 40):
                    t = 1 + f * (th - 1)
                    rx, rz = cx + t * (PX - cx), cz + t * (PZ - cz)
                    black |= inside(hx + (rx - hx) / sc, fwd_z(rz), MARGIN)
    black |= QZ > FGZ
    dist = distance_transform_edt(~black, sampling=((z1 - z0) / RES, (x1 - x0) / RES))
    v = np.clip(dist / EDGE, 0, 1); v = v * v * (3 - 2 * v)
    img = (v * 255 + 0.5).astype(np.uint8)
    Image.fromarray(img, 'L').save(os.path.join(ROOT, 'tex/grass-map.png'), optimize=True)
    json.dump({'bounds': list(BOUNDS), 'res': RES, 'space': 'world XZ at desktop house scale; image top = far (z0)',
               'gh': GH, 'fgz': FGZ, 'house': fp}, open(os.path.join(ROOT, 'tex/grass-map.json'), 'w'), indent=1)
    print('baked', RES, 'black share %.3f' % black.mean(), {k: (v['s'], v['b0']) for k, v in site.items()})

if __name__ == '__main__':
    main()
