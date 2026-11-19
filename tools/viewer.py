# Keep one tab of the cloud browser open and show a local image in it whenever /tmp/view.txt changes.
# usage: python3 tools/viewer.py CDP_WS_URL &   then: echo /path/img.png > /tmp/view.txt
import asyncio, sys, os, base64, io
from PIL import Image
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp(sys.argv[1])
        ctx = b.contexts[0]
        print('pages', [pg.url for pg in ctx.pages], flush=True)
        pg = None
        for q in ctx.pages:
            if q.url == 'about:blank':
                try:
                    s = await asyncio.wait_for(ctx.new_cdp_session(q), 3)
                    info = await asyncio.wait_for(s.send('Target.getTargetInfo'), 3)
                    print('blank', info['targetInfo']['targetId'], info['targetInfo']['title'], flush=True)
                    if info['targetInfo']['targetId'].startswith(os.environ.get('TID', '284DCB90')): pg = q
                except Exception as e: print('err', e, flush=True)
        if pg is None:
            pg = await ctx.new_page()
        print('using', pg.url, flush=True)
        last = None
        while True:
            try:
                path = open('/tmp/view.txt').read().strip()
                m = os.path.getmtime('/tmp/view.txt')
            except Exception:
                path, m = None, None
            if path and m != last:
                last = m
                try:
                    im = Image.open(path).convert('RGB')
                except Exception as e:
                    print('skip', e, flush=True); continue
                im.thumbnail((1280, 900))
                buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88)
                d = base64.b64encode(buf.getvalue()).decode()
                await pg.set_content(f'<title>viewer</title><body style="margin:0;background:#222;display:flex;justify-content:center"><img style="max-width:100vw;max-height:100vh;object-fit:contain" src="data:image/jpeg;base64,{d}"></body>')
                await pg.bring_to_front()
                print('showing', path, im.size, flush=True)
            await asyncio.sleep(0.5)
asyncio.run(main())
