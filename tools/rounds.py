# Round shooter: render the beats and transitions at phone, tall phone and desktop, and build one contact sheet.
# usage: python3 tools/rounds.py OUTDIR [P list, comma] [sizes, comma] [js run before each shot]
import asyncio, sys, os, threading, http.server, functools
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
PS = [float(v) for v in (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else '0,0.5,1,1.5,2').split(',')]
SIZES = (sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else 'phone,tall,desk').split(',')
JS = sys.argv[4] if len(sys.argv) > 4 else ''
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
async def shoot(p, size):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(**DEV[size]); pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    await pg.goto(os.environ.get('BASE') or f'http://127.0.0.1:{port}/', wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000)
    await pg.wait_for_timeout(1500)
    files = []
    for P in PS:
        await pg.evaluate(f'() => __pines.lenis.scrollTo({P} * (document.querySelector("#stage").clientHeight || innerHeight), {{ immediate: true }})')
        await pg.wait_for_timeout(2200)
        if JS:
            await pg.evaluate('() => { ' + JS + ' }'); await pg.wait_for_timeout(600)
        f = f'{out}/{size}-p{P:.2f}.png'
        await pg.screenshot(path=f); files.append(f)
    info = await pg.evaluate('() => ({calls: __pines.renderer.info.render.calls, tris: __pines.renderer.info.render.triangles})')
    print(size, info, 'errors', errs[:4])
    await b.close()
    return files
async def main():
    async with async_playwright() as p:
        res = await asyncio.gather(*[shoot(p, s) for s in SIZES])
    # contact sheet: one row per size, scaled to 420px tall
    rows = []
    for files in res:
        ims = [Image.open(f).convert('RGB') for f in files]
        ims = [im.resize((int(im.width * 420 / im.height), 420)) for im in ims]
        w = sum(i.width for i in ims) + 8 * (len(ims) - 1)
        row = Image.new('RGB', (w, 440), (20, 20, 20)); x = 0
        for im, P in zip(ims, PS):
            row.paste(im, (x, 20)); ImageDraw.Draw(row).text((x + 4, 4), f'P={P}', fill=(255, 255, 0)); x += im.width + 8
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new('RGB', (W, sum(r.height for r in rows)), (20, 20, 20)); y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(f'{out}/sheet.jpg', quality=88)
    print('sheet', f'{out}/sheet.jpg', sheet.size)
asyncio.run(main())
