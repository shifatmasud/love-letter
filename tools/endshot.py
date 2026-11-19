# Shots of the sheet-to-footer edge and the header, on phone and desktop. usage: endshot.py OUTDIR
import asyncio, sys, os, threading, http.server, functools, json
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'; out = sys.argv[1]; os.makedirs(out, exist_ok=True)
URL = os.environ.get('URL')
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2), 'desk': dict(viewport={'width': 1440, 'height': 900})}
async def one(p, size):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = await (await b.new_context(**DEV[size])).new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL or f'http://127.0.0.1:{port}/', wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000)
    await pg.wait_for_timeout(2500)
    info = await pg.evaluate("""() => ({ logo3d: [...document.querySelectorAll('.mark, .foot-mark')].map(a => a.classList.contains('is-3d')),
      markColor: getComputedStyle(document.querySelector('.mark')).color, fh: document.querySelector('.foot-space').offsetHeight,
      r: getComputedStyle(document.querySelector('.sheet')).borderBottomLeftRadius })""")
    await pg.screenshot(timeout=90000, path=f'{out}/{size}-top.png', clip={'x': 0, 'y': 0, 'width': DEV[size]['viewport']['width'], 'height': 120})
    H_ = await pg.evaluate('document.documentElement.scrollHeight - innerHeight')
    for k, frac in (('open', 0.5), ('end', 1.0)):
        await pg.evaluate(f'() => __pines.lenis.scrollTo({H_} - document.querySelector(".foot-space").offsetHeight * (1 - {frac}), {{ immediate: true }})')
        await pg.wait_for_timeout(1800)
        await pg.screenshot(timeout=90000, path=f'{out}/{size}-{k}.png')
    print(size, json.dumps(info), 'errors:', errs[:4])
    await b.close()
async def main():
    async with async_playwright() as p:
        await one(p, 'phone'); await one(p, 'desk')
asyncio.run(main())
