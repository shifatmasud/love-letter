# One quick check: phone (390x844) and desktop (1440x900) shots, with optional scroll (screens) and tilt.
# usage: python3 tools/quick.py OUTDIR [scroll=0] [tilt=0|l|r] [js expression to print]
import asyncio, sys, os, threading, http.server, functools, json
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
SC = float(sys.argv[2]) if len(sys.argv) > 2 else 0
TL = sys.argv[3] if len(sys.argv) > 3 else '0'
EXPR = sys.argv[4] if len(sys.argv) > 4 else ''
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1),
       'desk': dict(viewport={'width': 1440, 'height': 900})}
async def run(p, tag):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = await (await b.new_context(**DEV[tag])).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(f'http://127.0.0.1:{port}/', wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000)
    if SC: await pg.evaluate(f'() => __pines.lenis.scrollTo({SC} * innerHeight, {{ immediate: true }})')
    if TL != '0': await pg.evaluate(f"() => __pines.forcePtr({-1 if TL == 'l' else 1}, 0)")
    await pg.wait_for_timeout(2200)
    name = f'{out}/{tag}-s{SC}-t{TL}.png'
    await pg.screenshot(path=name)
    if EXPR: print(tag, json.dumps(await pg.evaluate(EXPR)))
    print(tag, name, 'errors', errs[:5])
    await b.close()
async def main():
    async with async_playwright() as p:
        await asyncio.gather(run(p, 'phone'), run(p, 'desk'))
asyncio.run(main())
