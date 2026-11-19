# Tilt test: hold the pointer at the far right, then release, and sample the subject's screen position over time.
# Also scrub the scroll in small steps to check the order of layer speeds. usage: python3 tools/tilt.py OUT size
import asyncio, sys, os, json, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'; out = sys.argv[1]; size = sys.argv[2]; os.makedirs(out, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True), 'desk': dict(viewport={'width': 1440, 'height': 900})}
PROJ = '''(names) => { const P = window.__pines, cam = P.camera, out = {}; const v = new P.THREE.Vector3();
  for (const n of names) { const o = P.scene.getObjectByName(n); if (!o) continue; o.getWorldPosition(v); v.project(cam); out[n] = [+(v.x).toFixed(4), +(v.y).toFixed(4)]; } return out; }'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(**DEV[size])).new_page()
        await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=150000); await pg.wait_for_timeout(1500)
        names = await pg.evaluate('() => { const n = []; window.__pines.scene.traverse((o) => { if (o.name) n.push(o.name); }); return n; }')
        print('named', names[:40])
        vw = DEV[size]['viewport']
        if size == 'desk':
            await pg.mouse.move(vw['width'] / 2, vw['height'] / 2); await pg.wait_for_timeout(1500)
            r0 = await pg.evaluate(PROJ, names)
            await pg.mouse.move(vw['width'] - 5, vw['height'] / 2, steps=8)
            seq = []
            for i in range(14):
                await pg.wait_for_timeout(120); seq.append(await pg.evaluate('() => [__pines.camera.position.x.toFixed(3), __pines.camera.position.y.toFixed(3)]'))
            await pg.screenshot(path=f'{out}/{size}-tilt-right.png')
            r1 = await pg.evaluate(PROJ, names)
            await pg.mouse.move(vw['width'] / 2, -10); await pg.dispatch_event('html', 'mouseleave') if False else None
            await pg.evaluate('() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave"))')
            await pg.evaluate('() => window.dispatchEvent(new PointerEvent("pointerout"))')
            for i in range(20):
                await pg.wait_for_timeout(120); seq.append(await pg.evaluate('() => [__pines.camera.position.x.toFixed(3), __pines.camera.position.y.toFixed(3)]'))
            print('camera x,y while held right then released:', seq)
            print('screen shift per object (x):', {k: round(r1[k][0] - r0[k][0], 4) for k in r0 if k in r1})
        # scroll scrub: screen y of named objects at small steps
        rows = []
        for P in [0, 0.1, 0.2, 0.3]:
            await pg.evaluate(f'() => __pines.lenis.scrollTo({P} * document.querySelector("#stage").clientHeight, {{ immediate: true }})'); await pg.wait_for_timeout(1800)
            rows.append(await pg.evaluate(PROJ, names))
        print('screen y vs scroll (0..0.3):', {k: [r[k][1] for r in rows if k in r] for k in rows[0]})
        await b.close()
asyncio.run(main())
