# Serve the site, open it at desktop and phone sizes, scroll through the beats with the wheel/touch,
# check Lenis + errors, and save a screenshot per beat.
import asyncio, sys, os, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
OUT = '/home/sprite/work/pines-shots'
os.makedirs(OUT, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('cache-control', 'no-store'); super().end_headers()
H.extensions_map['.js'] = 'text/javascript'; H.extensions_map['.mjs'] = 'text/javascript'; H.extensions_map['.webp'] = 'image/webp'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8791), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
Q = sys.argv[1] if len(sys.argv) > 1 else ''

async def run(p, mobile):
    b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = await b.new_context(**(p.devices['Pixel 5'] if mobile else {'viewport': {'width': 1440, 'height': 900}}))
    pg = await ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    await pg.goto('http://127.0.0.1:8791/' + Q, wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=90000)
    await pg.wait_for_timeout(2500)
    tag = 'phone' if mobile else 'desk'
    info = await pg.evaluate("() => ({ low: __pines.LOW, gpu: __pines.GPU, lenis: document.documentElement.className, calls: __pines.renderer.info.render.calls, tris: __pines.renderer.info.render.triangles, sh: document.documentElement.scrollHeight, ih: innerHeight })")
    print(tag, info)
    H = info['ih']
    for i, name in enumerate(['house', 'rise', 'letter']):
        if i > 0:
            # go there through Lenis exactly as the nav does
            await pg.evaluate(f"() => __pines.lenis.scrollTo({i} * innerHeight, {{ immediate: true }})")
            await pg.wait_for_timeout(2600)
        await pg.screenshot(path=f'{OUT}/{tag}-{i}-{name}.png')
        st = await pg.evaluate("() => ({ y: Math.round(scrollY), ly: Math.round(__pines.lenis.animatedScroll), calls: __pines.renderer.info.render.calls })")
        print(' ', name, st)
    # wheel smoothness check on desktop: lenis should ease, not jump
    if not mobile:
        await pg.evaluate("() => __pines.lenis.scrollTo(0, { immediate: true })")
        await pg.wait_for_timeout(400)
        await pg.mouse.move(700, 450)
        await pg.mouse.wheel(0, 500)
        samples = []
        for _ in range(8):
            await pg.wait_for_timeout(60)
            samples.append(round(await pg.evaluate('__pines.lenis.animatedScroll')))
        print('  wheel 500px, animatedScroll samples:', samples)
        # nav click uses lenis.scrollTo
        await pg.click('nav.beats a[href="#thanks"]')
        await pg.wait_for_timeout(300)
        mid = await pg.evaluate('Math.round(__pines.lenis.animatedScroll)')
        await pg.wait_for_timeout(2600)
        end = await pg.evaluate('Math.round(__pines.lenis.animatedScroll)')
        print('  nav -> letter: after 0.3s', mid, 'after 2.9s', end, 'target', 2 * H)
    print('  errors', [e for e in errs if 'GPU stall' not in e][:8])
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, False); await run(p, True)
asyncio.run(main())
