# probe.py SIZE[,SIZE] 'P' 'js expression returning JSON' : run JS on the local site at scroll P and print the result
import asyncio, sys, json, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {
  'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True),
  'tall': dict(viewport={'width': 360, 'height': 735}, device_scale_factor=2, is_mobile=True, has_touch=True),
  'desk': dict(viewport={'width': 1440, 'height': 900}),
}
async def one(p, size, P, js):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = await (await b.new_context(**DEV[size])).new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000); await pg.wait_for_timeout(1200)
    await pg.evaluate(f'() => __pines.lenis.scrollTo({P}*document.querySelector("#stage").clientHeight,{{immediate:true}})'); await pg.wait_for_timeout(1500)
    r = await pg.evaluate('() => { ' + js + ' }')
    print(size, json.dumps(r), errs[:3])
    await b.close()
async def main():
    async with async_playwright() as p:
        await asyncio.gather(*[one(p, s, sys.argv[2], sys.argv[3]) for s in sys.argv[1].split(',')])
asyncio.run(main())
