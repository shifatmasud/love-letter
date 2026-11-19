# Preloader strip: phone shots of the capsule over time. python3 tools/pre.py OUT [query]
import asyncio, sys, os, threading, http.server, functools
from playwright.async_api import async_playwright
from PIL import Image
ROOT = '/home/sprite/work/pines'; out = sys.argv[1]; q = sys.argv[2] if len(sys.argv) > 2 else ''
os.makedirs(out, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=2)).new_page()
        import random
        async def slow(route):
            if any(k in route.request.url for k in ('/tex/', '/snd/', '/fonts/')): await asyncio.sleep(random.uniform(0.3, 4.0))
            await route.continue_()
        await pg.route('**/*', slow)
        await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/{q}', wait_until='commit')
        frames = []
        for i in range(10):
            await pg.wait_for_timeout(450)
            try:
                el = await pg.query_selector('#pre canvas')
                if not el: break
                f = f'{out}/f{i}.png'; await el.screenshot(path=f); frames.append(f)
                print(i, await pg.evaluate('() => [window.__preTest, document.querySelector("#pre") && document.querySelector("#pre").getAttribute("aria-valuenow")]'))
            except Exception as e: print('stop', str(e)[:80]); break
        await b.close()
    ims = [Image.open(f) for f in frames]
    if ims:
        W, Hh = ims[0].size; st = Image.new('RGB', (W, (Hh + 6) * len(ims)), 'white')
        for i, im in enumerate(ims): st.paste(im, (0, i * (Hh + 6)))
        st.save(f'{out}/strip.png')
asyncio.run(main())
