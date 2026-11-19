# Quick A/B experiments: render one view with JS tweaks and save crops.
# usage: python3 tools/exp.py OUT.png SIZE P 'js snippet run before the shot' [crop x0,y0,x1,y1]
import asyncio, sys, threading, http.server, functools
from PIL import Image
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
out, size, P, js = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
crop = [int(v) for v in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {
  'phone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'tall': dict(viewport={'width': 360, 'height': 735}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'desk': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1),
}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(**DEV[size]); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{port}/', wait_until='load')
        await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=120000)
        await pg.wait_for_timeout(1500)
        await pg.evaluate(f'() => __pines.lenis.scrollTo({P} * (document.querySelector("#stage").clientHeight || innerHeight), {{ immediate: true }})')
        await pg.wait_for_timeout(1500)
        r = await pg.evaluate('() => { ' + js + ' }')
        if r is not None: print('js:', r)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=out)
        if crop:
            Image.open(out).crop(crop).save(out)
        print('saved', out, 'errors', errs[:4])
        await b.close()
asyncio.run(main())
