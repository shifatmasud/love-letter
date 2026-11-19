# contrast.py: for each scroll point and size, reads the logo and sound button colour from the DOM,
# hides them, screenshots the scene behind their boxes and reports the WCAG contrast (median and worst 10%).
import asyncio, sys, json, numpy as np
from playwright.async_api import async_playwright
from PIL import Image
import io
SIZES = {'phone': (390, 844, 2), 'tall': (360, 735, 2), 'desk': (1440, 900, 1)}
def lum(c):
    c = np.asarray(c, float) / 255; c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, (w, h, dpr) in SIZES.items():
            pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
            await pg.goto('http://127.0.0.1:8793/', wait_until='load')
            await pg.wait_for_function('window.__pines && window.__pines.ready', timeout=120000)
            for P in (json.loads(sys.argv[1]) if len(sys.argv) > 1 else [0, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 99]):
                await pg.evaluate(f'() => __pines.lenis.scrollTo({P} * (document.querySelector("#stage").clientHeight || innerHeight), {{ immediate: true }})')
                await pg.wait_for_timeout(2500)
                info = await pg.evaluate('''(()=>{const r=[];for(const s of ['.mark','#sound']){const e=document.querySelector(s);if(e&&!r.find(x=>x.s===s)){const b=e.getBoundingClientRect();if(b.width>0)r.push({s,b:[b.x,b.y,b.width,b.height],c:getComputedStyle(e).color});}}return r;})()''')
                await pg.evaluate("document.querySelector('header')&&(document.querySelector('header').style.visibility='hidden')")
                await pg.wait_for_timeout(300)
                img = Image.open(io.BytesIO(await pg.screenshot())).convert('RGB'); a = np.array(img)
                await pg.evaluate("document.querySelector('header')&&(document.querySelector('header').style.visibility='')")
                out = []
                for it in info[:2]:
                    x, y, bw, bh = [int(v * dpr) for v in it['b']]
                    reg = a[max(0, y):y + bh, max(0, x):x + bw].reshape(-1, 3)
                    if reg.size == 0: out.append(f"{it['s']} empty box {it['b']}"); continue
                    fg = [int(float(v)) for v in it['c'][it['c'].index('(') + 1:-1].split(',')[:3]]
                    Lf = lum(fg); Lb = lum(reg)
                    cr = (np.maximum(Lf, Lb) + 0.05) / (np.minimum(Lf, Lb) + 0.05)
                    out.append(f"{it['s']} fg{fg} median {np.median(cr):.1f} worst10% {np.percentile(cr, 10):.1f}")
                print(name, P, ' | '.join(out), flush=True)
        await b.close()
asyncio.run(main())
