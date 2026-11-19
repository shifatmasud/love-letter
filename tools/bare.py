# Bare-ground probe: where does the hero's moss floor show through (no grass, no plant, no house over it)?
# Renders each frame twice with time frozen: once as is, once with the ground plane flat magenta. Pixels that
# change are bare ground. Saves a mask overlay per shot and prints the share of the frame that is bare.
# usage: python3 tools/bare.py OUTDIR [P list] [sizes] [tilts e.g. 0,-1,1]
import asyncio, sys, os, threading, http.server, functools, json
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
PS = [float(v) for v in (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else '0,0.15,0.3').split(',')]
SIZES = (sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else 'phone,tall,desk').split(',')
TILTS = [float(v) for v in (sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else '0').split(',')]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {
  'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True),
  'tall': dict(viewport={'width': 360, 'height': 735}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'desk': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1),
}
SWAP = """(on) => { const g = __pines.scene.getObjectByName('ground'); if (!g.userData.m0) g.userData.m0 = g.material;
  if (on === 2) { if (!g.userData.mx) g.userData.mx = new __pines.THREE.ShaderMaterial({ depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vP; void main(){ gl_FragColor = vec4(clamp((vP.x+20.0)/40.0,0.0,1.0), clamp((-vP.y-45.0+50.0)/70.0,0.0,1.0), 1.0, 1.0); }' }); g.material = g.userData.mx; }
  else if (on) { if (!g.userData.mg) g.userData.mg = new __pines.THREE.MeshBasicMaterial({ color: 0xff00ff, depthWrite: false, toneMapped: false }); g.material = g.userData.mg; } else g.material = g.userData.m0; }"""
async def shoot(p, size):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(**DEV[size]); pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{port}/' + os.environ.get('Q', ''), wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000)
    await pg.wait_for_timeout(1500)
    res = []
    for P in PS:
        for T in TILTS:
            await pg.evaluate('window.__freeze=0')
            await pg.evaluate(f'() => {{ __pines.forcePtr({T}, 0); __pines.lenis.scrollTo({P} * (document.querySelector("#stage").clientHeight || innerHeight), {{ immediate: true }}); }}')
            await pg.wait_for_timeout(2600)
            await pg.evaluate('window.__freeze=1'); await pg.wait_for_timeout(400)
            a = f'{out}/{size}-p{P:.2f}-t{T:+.0f}.png'; await pg.screenshot(path=a)
            await pg.evaluate(SWAP, True); await pg.wait_for_timeout(400)
            bb = f'{out}/_m-{size}.png'; await pg.screenshot(path=bb)
            if True:
                await pg.evaluate(SWAP, 2); await pg.wait_for_timeout(400)
                xf = f'{out}/_x-{size}.png'; await pg.screenshot(path=xf)
            await pg.evaluate(SWAP, False)
            A = np.asarray(Image.open(a).convert('RGB')).astype(int); B = np.asarray(Image.open(bb).convert('RGB')).astype(int)
            m = np.abs(A - B).sum(2) > 40
            frac = m.mean(); rows = np.where(m.any(1))[0]
            # biggest bare blob size, coarse: share of 16x16 tiles that are >50% bare
            h, w = m.shape; t = 16 * (2 if size == 'tall' else 1)
            tiles = m[: h - h % t, : w - w % t].reshape(h // t, t, w // t, t).mean((1, 3))
            ov = (A * 0.45).astype(np.uint8); ov[m] = [255, 0, 255]
            Image.fromarray(ov).save(a.replace('.png', '-bare.png'))
            r = dict(size=size, P=P, tilt=T, bare_pct=round(frac * 100, 2), bare_tiles=int((tiles > 0.5).sum()), tiles=int(tiles.size),
                     rows=[int(rows.min()), int(rows.max())] if len(rows) else None, h=h)
            if True:
                X = np.asarray(Image.open(xf).convert('RGB')).astype(float)
                xs = X[..., 0][m] / 255 * 40 - 20; zs = X[..., 1][m] / 255 * 70 - 50
                if len(xs):
                    r['bare_x_pct'] = [round(float(v), 1) for v in np.percentile(xs, [2, 50, 98])]
                    r['bare_z_pct'] = [round(float(v), 1) for v in np.percentile(zs, [2, 25, 50, 75, 98])]
                    hz, _ = np.histogram(zs, bins=[-50, -20, -14, -10, -6, -3, 0, 3, 6, 9, 20]); r['z_hist(-50,-20,-14,-10,-6,-3,0,3,6,9,20)'] = hz.tolist()
                vis = (np.abs(X - B).sum(2) > 0) | m
            print(json.dumps(r)); res.append(r)
    if errs: print(size, 'errors', errs[:3])
    await b.close(); return res
async def main():
    async with async_playwright() as p:
        await asyncio.gather(*[shoot(p, s) for s in SIZES])
asyncio.run(main())
