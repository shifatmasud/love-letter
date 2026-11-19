# Seam hunter: render beats at given scroll points and screen sizes, save shots, and report hard horizontal lines.
# usage: python3 tools/seam.py OUTDIR [diag]
import asyncio, sys, os, threading, http.server, functools, json
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/sprite/work/seam'
DIAG = len(sys.argv) > 2 and sys.argv[2] == 'diag'
PS = [float(x) for x in os.environ.get('PS', '1.5,1.75,2').split(',')]
SIZES = os.environ.get('SIZES', 'phone,tall,desk').split(',')
TILTS = os.environ.get('TILTS', '0,0').split(';')
os.makedirs(OUT, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8793), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {
  'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'tall': dict(viewport={'width': 360, 'height': 735}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'desk': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1),
}

def seams(path, thr=18, minfrac=0.6):
    a = np.array(Image.open(path).convert('RGB')).astype(int)
    d = np.abs(np.diff(a, axis=0)).sum(2)
    frac = (d > thr).mean(1)
    rows = [(int(y), round(float(frac[y]), 2)) for y in np.where(frac > minfrac)[0]]
    return a.shape[0], rows

async def shot(pg, path):
    await pg.screenshot(path=path)

async def run(p, size):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(**DEV[size])
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    await pg.goto('http://127.0.0.1:8793/', wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=120000)
    await pg.add_style_tag(content=('.beat, header, nav, .cue, .scrim, .vig { visibility: hidden !important } ' if DIAG else '/* */'))
    await pg.wait_for_timeout(2000)
    for tl in TILTS:
        tx, ty = [float(v) for v in tl.split(',')]
        await pg.evaluate(f'() => __pines.forcePtr({tx}, {ty})')
        for P in PS:
            await pg.evaluate(f'() => __pines.lenis.scrollTo({P} * (document.querySelector("#stage").clientHeight || innerHeight), {{ immediate: true }})')
            await pg.wait_for_timeout(2200)
            f = f'{OUT}/{size}-p{P}-t{tx}_{ty}.png'
            await shot(pg, f)
            h, rows = seams(f)
            print(size, P, (tx, ty), 'H', h, 'seams', rows[:12], flush=True)
            if DIAG and rows:
                # hide objects one at a time, see which one removes the seam
                names = await pg.evaluate('''() => { const out=[]; __pines.scene.traverse(o => { if ((o.isMesh||o.isPoints||o.isSprite) && o.visible) { o.userData._id = out.length; out.push((o.name||o.type)+' z'+o.position.z.toFixed(1)+' ro'+o.renderOrder + (o.material&&o.material.uniforms&&o.material.uniforms.uMap&&o.material.uniforms.uMap.value&&o.material.uniforms.uMap.value.image ? ' w'+o.material.uniforms.uMap.value.image.width : '')); } }); return out; }''')
                base = set(y for y, _ in rows)
                for i, n in enumerate(names):
                    await pg.evaluate(f'() => __pines.scene.traverse(o => {{ if (o.userData._id === {i}) o.visible = false; }})')
                    await pg.wait_for_timeout(250)
                    g = f'{OUT}/_diag.png'; await shot(pg, g)
                    _, r2 = seams(g)
                    if base - set(y for y, _ in r2):
                        print('   hiding', i, n, '-> removes', sorted(base - set(y for y, _ in r2))[:6], flush=True)
                    await pg.evaluate(f'() => __pines.scene.traverse(o => {{ if (o.userData._id === {i}) o.visible = true; }})')
    print(size, 'errors', errs[:5])
    await b.close()

async def main():
    async with async_playwright() as p:
        for s in SIZES: await run(p, s)
asyncio.run(main())
