# textseq.py OUTDIR SIZES : frame sequences of the section text (a beat change at real speed, and the letter's scroll-tied exit)
import asyncio, sys, os, threading, http.server, functools, json
from playwright.async_api import async_playwright
from PIL import Image
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
STATE = """() => { const r = {}; document.querySelectorAll('.beat').forEach((b, k) => { r[k] = [...b.querySelectorAll('.slot__in')].map(d => { const m = /translate3d\\(0px, (-?[\\d.]+)%/.exec(d.style.transform); return (m ? +m[1] : null) + '|' + d.style.opacity; }); });
  r.footerTop = Math.round(document.querySelector('.sheet').getBoundingClientRect().bottom); r.ih = innerHeight; r.y = Math.round(scrollY); return r; }"""
async def one(p, size, out):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = await (await b.new_context(**DEV[size])).new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000); await pg.wait_for_timeout(2500)
    log = []
    async def shot(tag):
        f = f'{out}/{size}-{tag}.png'; await pg.screenshot(path=f); s = await pg.evaluate(STATE); log.append((tag, s)); return f
    H = await pg.evaluate('innerHeight')
    # A) beat 0 -> 1 -> 0: the text timeline is stepped by a test clock (__tnow), 0.1 s per frame
    await pg.evaluate('window.__tnow = 1000'); await pg.wait_for_timeout(300); await shot('a00')
    await pg.evaluate(f'() => __pines.lenis.scrollTo({H}, {{immediate: true}})'); await pg.wait_for_timeout(400)
    for k in range(1, 19):
        await pg.evaluate(f'window.__tnow = 1000 + {k}*0.1'); await pg.wait_for_timeout(120); await shot(f'a{k:02d}')
    await pg.evaluate('window.__tnow = 1010'); await pg.wait_for_timeout(200)
    await pg.evaluate('() => __pines.lenis.scrollTo(0, {immediate: true})'); await pg.wait_for_timeout(400)
    for k in range(1, 7):
        await pg.evaluate(f'window.__tnow = 1010 + {k}*0.15'); await pg.wait_for_timeout(120); await shot(f'r{k:02d}')
    await pg.evaluate('delete window.__tnow'); await pg.wait_for_timeout(2500)
    # B) the letter: go to rest, then step through the exit stretch to the footer, and back
    await pg.evaluate(f'() => __pines.lenis.scrollTo({2*H}, {{immediate: true}})'); await pg.wait_for_timeout(2600); await shot('b00')
    f0 = await pg.evaluate('document.querySelector(".sheet").offsetHeight - innerHeight')
    steps = [f0 - 0.6*H, f0 - 0.45*H, f0 - 0.33*H, f0 - 0.22*H, f0 - 0.12*H, f0 - 0.06*H, f0 + 0.05*H, f0 + 0.25*H]
    for k, y in enumerate(steps):
        await pg.evaluate(f'() => __pines.lenis.scrollTo({y}, {{immediate: true}})'); await pg.wait_for_timeout(500); await shot(f'b{k+1:02d}')
    for k, y in enumerate(reversed(steps[:6])):
        await pg.evaluate(f'() => __pines.lenis.scrollTo({y}, {{immediate: true}})'); await pg.wait_for_timeout(500); await shot(f'c{k+1:02d}')
    json.dump({'log': log, 'errs': errs, 'f0': f0}, open(f'{out}/{size}-log.json', 'w'), indent=0)
    print(size, 'errs', errs[:3])
    await b.close()
async def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        await asyncio.gather(*[one(p, s, out) for s in sys.argv[2].split(',')])
asyncio.run(main())
