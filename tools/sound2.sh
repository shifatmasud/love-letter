#!/bin/bash
# Build Love Letter's scene sound from real CC0 field recordings (Freesound previews). No synth anywhere in the scene sound.
# Credits: SOUNDS.md. UI sounds (the sound button's 'star') are left as they were.
set -e
D=/home/sprite/work/snd2; cd $D; mkdir -p raw out
dl(){ [ -s raw/$1.mp3 ] || curl -s -L -A 'Mozilla/5.0' -o raw/$1.mp3 "https://cdn.freesound.org/previews/$2-hq.mp3"; }
dl breeze 181/181801_3153523     # keweldog, breeze.wav (forest breeze in leaves)
dl foliage 635/635053_5756735    # sillygrizzlies, Rustling Foliage in Forest
dl crackle 563/563766_6253486    # florianreichelt, fire crackles
dl airwind 181/181251_499617     # mario1298, a gentle breeze, wind 2
# removed: dl gust 181/181254_499617        # mario1298, a gentle breeze, wind 5
dl crickets 637/637083_9250976   # Nox_Sound, Ambiance Nature Night Cricket Calm Loop
dl cloth 330/330639_4437257      # leonelmail, Cloth Flapping On A Clothesline Gently
# removed: dl rustle 445/445788_8292592     # DDT197, Rustling foliage
dl creak 377/377552_1196472      # Mafon2, Wooden Creak
# removed: dl paper 382/382654_4297074      # bbrocer, Paper Fluttering
# soft: every scene sound is low-passed so nothing is sharp (and no bird call can cut through)
PY=$(cat <<'EOF'
import sys,wave,numpy as np
mode,n,L,X,lvl=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5])
w=wave.open('/tmp/'+n+'.wav');sr=w.getframerate();a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)
if mode=='loop':
  # pick the calmest window (lowest swing in loudness), then crossfade its tail into its head
  l=int(L*sr);x=int(X*sr);hop=sr//2;best=None
  for s in range(0,max(1,len(a)-l-x),hop):
    seg=a[s:s+l+x];e=np.sqrt(np.convolve(seg**2,np.ones(sr//4)/(sr//4),'valid')[::sr//8]+1);sc=np.std(np.log(e))
    if best is None or sc<best[0]:best=(sc,s)
  a=a[best[1]:best[1]+l+x].copy();t=np.linspace(0,1,x);a[:x]=a[:x]*np.sqrt(t)+a[l:l+x]*np.sqrt(1-t);a=a[:l]
  print(n,'start',best[1]/sr,'swing',round(best[0],3))
rms=np.sqrt((a**2).mean());a=a/max(rms,1)*lvl;a=np.clip(a,-32000,32000)
o=wave.open('/tmp/'+n+'_l.wav','wb');o.setnchannels(1);o.setsampwidth(2);o.setframerate(sr);o.writeframes(a.astype(np.int16).tobytes());o.close()
EOF
)
enc(){ ffmpeg -v error -y -i /tmp/${1}_l.wav -c:a libopus -b:a $2 out/$1.webm; ffmpeg -v error -y -i /tmp/${1}_l.wav -c:a libmp3lame -b:a 56k out/$1.mp3; }
loop(){ # name src len xf filters
  ffmpeg -v error -y -i raw/$2.mp3 -ac 1 -ar 24000 -af "$5" /tmp/$1.wav; python3 -c "$PY" loop $1 $3 $4 3000; enc $1 32k; }
shot(){ # name src start len filters
  ffmpeg -v error -y -ss $3 -t $4 -i raw/$2.mp3 -ac 1 -ar 24000 -af "$5,afade=t=in:d=0.04,afade=t=out:st=$(python3 -c "print($4-0.3)"):d=0.3" /tmp/$1.wav
  python3 -c "$PY" shot $1 0 0 2600; enc $1 40k; }
loop pines breeze 40 3 "highpass=f=120,lowpass=f=2600"
loop leaves foliage 6.5 0.6 "highpass=f=200,lowpass=f=4200"
loop fire crackle 30 2 "highpass=f=180,lowpass=f=3800"
loop air airwind 28 3 "highpass=f=90,lowpass=f=1500"
loop night crickets 30 3 "highpass=f=500,lowpass=f=4500"
shot creak creak 0 0.9 "highpass=f=120,lowpass=f=3500"
shot crackle crackle 3 1.4 "highpass=f=180,lowpass=f=3800"
shot cloth cloth 4 1.6 "highpass=f=150,lowpass=f=4000"
# removed: shot paper paper 1.0 1.2 "highpass=f=180,lowpass=f=5000"
# removed: shot rustle rustle 2 1.3 "highpass=f=200,lowpass=f=4200"
# removed: shot gust gust 30 2.2 "highpass=f=90,lowpass=f=1600"
ls -la out
