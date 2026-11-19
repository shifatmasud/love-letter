# Visible share of named objects: renders the frame with them shown/hidden, with and without the grass.
# python3 tools/vis.py NAME[,NAME] [scroll]   -> per device: silhouette px, visible px, share
import asyncio, sys, os, threading, http.server, functools
import numpy as np; from PIL import Image; import io
from playwright.async_api import async_playwright
ROOT='/home/sprite/work/pines'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def end_headers(self): self.send_header('cache-control','no-store'); super().end_headers()
H.extensions_map['.js']='text/javascript'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8796),functools.partial(H,directory=ROOT)); threading.Thread(target=srv.serve_forever,daemon=True).start()
names=sys.argv[1].split(','); pos=float(sys.argv[2]) if len(sys.argv)>2 else 0
SET="(a)=>{const [ns,on,grass]=a; __pines.scene.traverse(o=>{ if(ns.includes(o.name)) o.visible=on; if(/longgrass/.test(o.name)) o.visible=grass; }); __pines.forcePtr && 0; }"
async def shot(pg):
    b=await pg.screenshot(); return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
async def run(p,mobile):
    b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx=await b.new_context(**({'viewport':{'width':390,'height':844},'is_mobile':True,'has_touch':True} if mobile else {'viewport':{'width':1440,'height':900}}))
    pg=await ctx.new_page(); await pg.goto('http://127.0.0.1:8796/',wait_until='load')
    await pg.wait_for_function('window.__pines && window.__pines.ready',timeout=120000); await pg.wait_for_timeout(3500)
    await pg.evaluate("()=>{ window.__freeze=1 }")
    if pos: await pg.evaluate('(y)=>__pines.lenis.scrollTo(y*innerHeight,{immediate:true})',pos); await pg.wait_for_timeout(2500)
    r={}
    for on,grass in [(True,True),(False,True),(True,False),(False,False)]:
        await pg.evaluate(SET,[names,on,grass]); await pg.wait_for_timeout(700); r[(on,grass)]=await shot(pg)
    sil=(np.abs(r[(True,False)]-r[(False,False)]).sum(2)>30); vis=(np.abs(r[(True,True)]-r[(False,True)]).sum(2)>30)
    print('phone' if mobile else 'desk', 'silhouette',int(sil.sum()),'visible',int(vis.sum()),'share %.2f'%(vis.sum()/max(1,sil.sum())), 'of frame %.3f'%(vis.mean()))
    await b.close()
async def main():
    async with async_playwright() as p: await asyncio.gather(run(p,True),run(p,False))
asyncio.run(main())
