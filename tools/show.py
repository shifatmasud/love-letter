# show.py OUT img1 img2 ... : side by side, each scaled to 880 tall (or width-limited), labels
import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; ims=[Image.open(f).convert('RGB') for f in sys.argv[2:]]
H=880; ims=[im.resize((max(1,int(im.width*H/im.height)),H)) for im in ims]
W=sum(i.width for i in ims)+10*(len(ims)-1); S=Image.new('RGB',(W,H+16),(30,30,30)); x=0
for im,f in zip(ims,sys.argv[2:]):
    S.paste(im,(x,16)); ImageDraw.Draw(S).text((x+3,2),f.split('/')[-1][:40],fill=(255,255,0)); x+=im.width+10
S.save(out,quality=90); open('/tmp/view.txt','w').write(out)
