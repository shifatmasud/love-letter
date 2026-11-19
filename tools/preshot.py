# Frames of the preloader fill and the slide-up, plus its progress log. usage: preshot.py OUTDIR size
import asyncio, sys, os, threading, http.server, functools, json, time
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'; out = sys.argv[1]; size = sys.argv[2]; os.makedirs(out, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
DEV = {'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2), 'desk': dict(viewport={'width': 1440, 'height': 900})}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await (await b.new_context(**DEV[size])).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.add_init_script("""window.__plog=[];(function w(){ if(window.__pre){ const o=window.__pre.tick; window.__pre.tick=function(n){ o(n); }; }
          const t0=performance.now(); setInterval(()=>{ const e=document.getElementById('pre'); window.__plog.push([Math.round(performance.now()-t0), e? +e.getAttribute('aria-valuenow'):-1, scrollY]); }, 100); })();""")
        t0 = time.time()
        await pg.goto(f'http://127.0.0.1:{port}/', wait_until='commit')
        k = 0; shots = []
        while time.time() - t0 < 120:
            try:
                st = await pg.evaluate("(() => { const e = document.getElementById('pre'); return e ? [+e.getAttribute('aria-valuenow'), e.classList.contains('up')] : null; })()")
            except Exception: st = 'nav'
            if st is None and k > 0: break
            if st not in ('nav', None):
                f = f'{out}/{size}-{k:03d}.png'; await pg.screenshot(path=f); shots.append([round(time.time() - t0, 2), st]); k += 1
            await asyncio.sleep(0.15)
        await pg.wait_for_timeout(1500); await pg.screenshot(path=f'{out}/{size}-after.png')
        # scroll lock check: wheel during the preloader is in the log (scrollY stays 0)
        log = await pg.evaluate('window.__plog')
        mono = all(log[i][1] >= log[i - 1][1] for i in range(1, len(log)) if log[i][1] >= 0 and log[i - 1][1] >= 0)
        print(json.dumps({'frames': len(shots), 'shots': shots[::max(1, len(shots) // 12)], 'monotonic': mono, 'log_tail': [l for l in log if l[1] >= 0][-6:], 'errors': errs[:5]}))
        await b.close()
asyncio.run(main())
