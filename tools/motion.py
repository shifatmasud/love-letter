# motion.py OUT SIZES : tilt extremes per beat (pointer on desk, touch side-drag on phones) + a logged smooth scroll
# (camera per frame) to find jumps, and a frame strip of the scroll.
import asyncio, sys, os, json, threading, http.server, functools
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
LOG = '''() => { window.__mlog = []; const P = window.__pines; const f = () => { const c = P.camera; window.__mlog.push([performance.now(), c.position.x, P.root.position.y, c.position.z, c.rotation.x, c.rotation.y, scrollY]); if (window.__mlog.length < 4000) requestAnimationFrame(f); }; requestAnimationFrame(f); }'''
async def one(p, size, out):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = await b.new_context(**DEV[size]); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000); await pg.wait_for_timeout(2000)
    W, Hh = DEV[size]['viewport']['width'], DEV[size]['viewport']['height']
    cdp = await ctx.new_cdp_session(pg) if size != 'desk' else None
    async def touch(t, x, y):
        await cdp.send('Input.dispatchTouchEvent', {'type': t, 'touchPoints': [] if t == 'touchEnd' else [{'x': x, 'y': y}]})
    for beat in [0, 1, 2]:
        await pg.evaluate(f'() => __pines.lenis.scrollTo({beat}*document.querySelector("#stage").clientHeight,{{immediate:true}})'); await pg.wait_for_timeout(2200)
        for side, x in [('L', 2), ('R', W - 2)]:
            if size == 'desk':
                await pg.mouse.move(W / 2, Hh / 2); await pg.mouse.move(x, Hh * 0.45, steps=8)
            else:
                # a sideways drag held at the edge
                await touch('touchStart', W / 2, Hh * 0.45)
                for k in range(1, 9): await touch('touchMove', W / 2 + (x - W / 2) * k / 8, Hh * 0.45); await pg.wait_for_timeout(16)
            await pg.wait_for_timeout(1800)
            await pg.screenshot(path=f'{out}/{size}-b{beat}-{side}.png')
            if size != 'desk': await touch('touchEnd', 0, 0)
        if size == 'desk': await pg.mouse.move(W / 2, Hh / 2)
        await pg.wait_for_timeout(1500)
    # smooth scroll 0 -> 2 beats, camera logged every frame, a strip of frames
    await pg.evaluate('() => __pines.lenis.scrollTo(0,{immediate:true})'); await pg.wait_for_timeout(1500)
    await pg.evaluate(LOG)
    await pg.evaluate('() => __pines.lenis.scrollTo(2*document.querySelector("#stage").clientHeight,{duration:6})')
    for k in range(12):
        await pg.wait_for_timeout(500); await pg.screenshot(path=f'{out}/{size}-s{k:02d}.png')
    await pg.wait_for_timeout(1500)
    log = await pg.evaluate('window.__mlog')
    json.dump({'log': log, 'errs': errs}, open(f'{out}/{size}-motion.json', 'w'))
    print(size, 'frames', len(log), 'errs', errs[:2])
    await b.close()
async def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        await asyncio.gather(*[one(p, s, out) for s in sys.argv[2].split(',')])
asyncio.run(main())
