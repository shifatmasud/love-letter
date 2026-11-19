# Do the foreground pines cover the house? Per device and tilt: px where the pine silhouette sits on the house silhouette.
# Also the mean luminance behind the header with and without pines. python3 tools/fgcheck.py [scroll]
import asyncio, numpy as np, io, sys, threading, http.server, functools
from PIL import Image
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'; SC = float(sys.argv[1]) if len(sys.argv) > 1 else 0
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
SET = "(a)=>{const [n,on]=a; __pines.scene.traverse(o=>{ if(o.name===n) o.visible=on; });}"
async def one(p, tag, vp):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = await (await b.new_context(viewport=vp)).new_page()
    await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/'); await pg.wait_for_function('window.__pines&&window.__pines.ready', timeout=150000)
    await pg.evaluate("()=>{window.__freeze=1}")
    if SC: await pg.evaluate(f'() => __pines.lenis.scrollTo({SC} * innerHeight, {{ immediate: true }})')
    hb = await pg.evaluate("()=>document.querySelector('.hdr-fix').getBoundingClientRect().bottom")
    out = []
    for tx, ty in ((0, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)):
        await pg.evaluate("()=>{window.__freeze=0}"); await pg.evaluate(f"()=>__pines.forcePtr({tx},{ty})"); await pg.wait_for_timeout(3500)
        await pg.evaluate("()=>{window.__freeze=1}"); await pg.wait_for_timeout(300)
        sh = {}
        for k, (n, on) in {'all': ('fgpines', True), 'nop': ('fgpines', False)}.items():
            await pg.evaluate(SET, [n, on]); await pg.wait_for_timeout(500)
            sh[k] = np.asarray(Image.open(io.BytesIO(await pg.screenshot())).convert('RGB')).astype(int)
        await pg.evaluate(SET, ['L4 house', False]); await pg.wait_for_timeout(500)
        noh = np.asarray(Image.open(io.BytesIO(await pg.screenshot())).convert('RGB')).astype(int)
        await pg.evaluate(SET, ['L4 house', True]); await pg.evaluate(SET, ['fgpines', True])
        pine = np.abs(sh['all'] - sh['nop']).sum(2) > 30; house = np.abs(sh['nop'] - noh).sum(2) > 30
        if tx == 0 and ty == 0: Image.fromarray(sh['all'].astype(np.uint8)).save(f'/tmp/fg-{tag}.png')
        lum = lambda a: float((a[:int(hb)] @ [0.2126, 0.7152, 0.0722]).mean())
        ov = pine & house; ys, xs = np.nonzero(ov); bb = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
        if tx == 0 and ty == 0: np.save(f'/tmp/fgov-{tag}.npy', ov)
        out.append(f'bbox {bb} ')
        out.append(f'tilt({tx},{ty}) pine {pine.mean():.3f} on-house px {int((pine & house).sum())} header lum {lum(sh["nop"]):.0f}->{lum(sh["all"]):.0f}')
    print(tag, '\n  ' + '\n  '.join(out)); await b.close()
async def main():
    async with async_playwright() as p:
        await asyncio.gather(one(p, 'phone', {'width': 390, 'height': 844}), one(p, 'desk', {'width': 1440, 'height': 900}))
asyncio.run(main())
