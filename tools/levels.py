# Peak levels of every scene sound as it leaves (dBFS), measured live in Chrome. python3 tools/levels.py
import asyncio, threading, http.server, functools, json
from playwright.async_api import async_playwright
ROOT = '/home/sprite/work/pines'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H.extensions_map['.js'] = 'text/javascript'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
JS = """async () => {
  const { Sound } = await import('/js/audio.js');
  await Sound.boot();
  const watch = async (ms, k) => { let m = -120; const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = Sound.peaks()[k]; if (v !== null) m = Math.max(m, v); await new Promise(r => setTimeout(r, 15)); } return +m.toFixed(1); };
  const r = {};
  for (const [p, n] of [[0, 'beds at the house (pines, leaves, fire)'], [1, 'beds at the balloon (air)'], [2, 'beds at night (crickets)']]) { Sound.mix(p, 0.05); await new Promise(r => setTimeout(r, 700)); r[n] = await watch(2500, 1); }
  Sound.mix(-5, 0.02); await new Promise(r => setTimeout(r, 400));
  const shot = async (n, f) => { await new Promise(r => setTimeout(r, 300)); let m = -120; for (let i = 0; i < 4; i++) { f(); m = Math.max(m, await watch(1400, 0)); } r[n] = m; };
  await shot('house creak (vol 1)', () => Sound.play('creak', 1, { minGap: 0 }));
  await shot('house crackle (vol 0.8)', () => Sound.play('crackle', 0.8, { minGap: 0 }));
  await shot('balloon cloth (vol 1)', () => Sound.play('cloth', 1, { minGap: 0 }));
  await shot('nature swoosh (loudest)', () => Sound.play('airpush', 1, { minGap: 0 }));
  await shot('letter paper, slow move', () => Sound.paper(200, 1, 0));
  await shot('letter paper, fast move', () => Sound.paper(1600, 1, 0));
  await shot('letter paper, tap', () => Sound.paper(900, 0, 0, { tap: true }));
  return r; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(); await pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/SOUNDS.md')
        r = await pg.evaluate(JS)
        for k, v in r.items(): print(f'{v:7.1f} dBFS  {k}')
        await b.close()
asyncio.run(main())
