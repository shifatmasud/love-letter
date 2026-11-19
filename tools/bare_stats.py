import numpy as np, glob, sys
from PIL import Image
from scipy import ndimage
for f in sorted(glob.glob(sys.argv[1])):
    A=np.asarray(Image.open(f).convert('RGB')).astype(int)
    m=(A[:,:,0]==255)&(A[:,:,1]==0)&(A[:,:,2]==255)
    h,w=m.shape
    lab,n=ndimage.label(ndimage.binary_closing(m,iterations=2))
    objs=ndimage.find_objects(lab)
    sz=ndimage.sum(np.ones_like(m),lab,range(1,n+1))
    print(f, 'bare%%=%.1f'%(m.mean()*100))
    for b in np.argsort(sz)[::-1][:5]:
        sl=objs[b]
        print('   blob %.2f%%  y %d-%d x %d-%d'%(sz[b]/m.size*100, sl[0].start,sl[0].stop,sl[1].start,sl[1].stop))
    print('   rows by 12ths:', ' '.join('%.0f'%(m[int(h*i/12):int(h*(i+1)/12)].mean()*100) for i in range(12)))
    print('   lower-half cols by 8ths:', ' '.join('%.0f'%(m[h//2:, int(w*i/8):int(w*(i+1)/8)].mean()*100) for i in range(8)))
