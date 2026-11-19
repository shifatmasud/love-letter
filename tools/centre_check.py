# Measures each subject's on-screen bounding-box centre at its beat (0 = exact frame centre), phone and desktop.
import asyncio, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT='/home/sprite/work/pines'
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
H.extensions_map['.js']='text/javascript'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
JS='''(arg) => { const P=window.__pines, T=P.THREE, cam=P.camera; const o=P.scene.getObjectByName(arg); if(!o) return null; o.updateWorldMatrix(true,true);
 const b=new T.Box3(); o.traverse((m)=>{ if(m.isMesh&&m.visible&&m.geometry){ m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }});
 let x0=9,x1=-9,y0=9,y1=-9; for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z]){ const v=new T.Vector3(x,y,z).project(cam); x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);y1=Math.max(y1,v.y);} 
 return {cx:+((x0+x1)/2).toFixed(3), cy:+((y0+y1)/2).toFixed(3), w:+(x1-x0).toFixed(2), h:+(y1-y0).toFixed(2)}; }'''
async def run(p,size,vp):
    b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=await (await b.new_context(viewport=vp,is_mobile=size!='desk',has_touch=size!='desk')).new_page()
    await pg.goto(f'http://127.0.0.1:{port}/'); await pg.wait_for_function('window.__pines && window.__pines.ready',timeout=150000); await pg.wait_for_timeout(1200)
    for P,n in [(0,'L4 house'),(1,'balloon'),(2,'letter')]:
        await pg.evaluate(f'() => __pines.lenis.scrollTo({P}*document.querySelector("#stage").clientHeight,{{immediate:true}})'); await pg.wait_for_timeout(2500)
        print(size,n,await pg.evaluate(JS,n))
    await b.close()
async def main():
    async with async_playwright() as p:
        await asyncio.gather(run(p,'phone',{'width':390,'height':844}),run(p,'tall',{'width':360,'height':735}),run(p,'desk',{'width':1440,'height':900}))
asyncio.run(main())
