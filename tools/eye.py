# Open one tab in the Upsy cloud browser and show a local image there whenever /tmp/view.txt changes.
# usage: nohup python3 tools/eye.py CDP_WS_URL &   then: echo /path/img.jpg > /tmp/view.txt ; browser_screenshot
import asyncio, sys, os, base64, io
from PIL import Image
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp(sys.argv[1])
        ctx = b.contexts[0]
        pg = await ctx.new_page()
        await pg.set_viewport_size({'width': 1600, 'height': 1000})
        print('eye tab open', flush=True)
        last = None
        while True:
            try:
                m = os.path.getmtime('/tmp/view.txt')
                if m != last:
                    last = m; path = open('/tmp/view.txt').read().strip()
                    im = Image.open(path).convert('RGB'); im.thumbnail((1600, 1000))
                    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90)
                    src = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
                    await pg.set_content(f'<html><body style="margin:0;background:#111"><img src="{src}" style="display:block;max-width:1600px;max-height:1000px"></body></html>')
                    await pg.evaluate("document.title = 'eye ' + Date.now()")
                    print('shown', path, im.size, flush=True)
            except Exception as e:
                print('err', e, flush=True)
            await asyncio.sleep(0.4)
asyncio.run(main())
