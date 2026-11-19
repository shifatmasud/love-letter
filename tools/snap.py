# Quick shots: python3 tools/snap.py OUTPREFIX [scroll in screens] [js run before the shot]
# Saves OUTPREFIX-phone.png (390x844) and OUTPREFIX-desk.png (1440x900). ONLY=phone|desk limits it.
import asyncio, sys, os, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8795), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
out = sys.argv[1]; pos = float(sys.argv[2]) if len(sys.argv) > 2 else 0; js = sys.argv[3] if len(sys.argv) > 3 else ''
only = os.environ.get('ONLY', ''); Q = os.environ.get('Q', '')
async def run(p, mobile):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    opts = {'viewport': {'width': 390, 'height': 844}, 'device_scale_factor': 1, 'is_mobile': True, 'has_touch': True} if mobile else {'viewport': {'width': 1440, 'height': 900}}
    ctx = await b.new_context(**opts)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(os.environ.get('HOST', 'http://127.0.0.1:8795/') + Q, wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=120000)
    await pg.wait_for_timeout(3500)
    if pos:
        await pg.evaluate('(y) => __pines.lenis.scrollTo(y * innerHeight, { immediate: true })', pos)
        await pg.wait_for_timeout(2800)
    if js:
        r = await pg.evaluate(js); await pg.wait_for_timeout(1500)
        if r is not None: print('js:', r)
    tag = 'phone' if mobile else 'desk'
    await pg.screenshot(path=f'{out}-{tag}.png')
    print(tag, 'ok', errs[:5])
    await b.close()
async def main():
    async with async_playwright() as p:
        await asyncio.gather(*[run(p, m) for m in (True, False) if not only or (only == 'phone') == m])
asyncio.run(main())
