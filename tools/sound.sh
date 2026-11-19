#!/bin/bash
# Build the ambience loops and delight one-shots from CC0 Freesound previews.
set -e
cd /home/sprite/work/sky/snd
mkdir -p raw out
dl(){ [ -s raw/$1.mp3 ] || curl -s -L -A 'Mozilla/5.0' -o raw/$1.mp3 "$2"; }
dl forest https://cdn.freesound.org/previews/665/665156_1661766-hq.mp3
dl breeze https://cdn.freesound.org/previews/181/181801_3153523-hq.mp3
dl crickets https://cdn.freesound.org/previews/637/637083_9250976-hq.mp3
dl pad https://cdn.freesound.org/previews/391/391438_7038073-hq.mp3
dl creak https://cdn.freesound.org/previews/377/377552_1196472-hq.mp3
dl crackle https://cdn.freesound.org/previews/563/563766_6253486-hq.mp3
dl burner https://cdn.freesound.org/previews/649/649092_9813501-hq.mp3
dl paper https://cdn.freesound.org/previews/382/382654_4297074-hq.mp3
dl wings https://cdn.freesound.org/previews/240/240476_1662097-hq.mp3
dl sparkle https://cdn.freesound.org/previews/578/578803_10522382-hq.mp3
dl starclick https://cdn.freesound.org/previews/876/876011_19205925-hq.mp3
# seamless loop: take L+X seconds from start S, crossfade the tail X into the head
loop(){ # name src start len xf filters
  local n=$1 s=$2 st=$3 L=$4 X=$5 F=$6
  ffmpeg -v error -y -ss $st -t $(python3 -c "print($L+$X)") -i raw/$s.mp3 -ac 1 -ar 24000 -af "$F" /tmp/$n.wav
  python3 - "$n" $L $X <<'EOF'
import sys,wave,numpy as np
n,L,X=sys.argv[1],float(sys.argv[2]),float(sys.argv[3])
w=wave.open('/tmp/'+n+'.wav');sr=w.getframerate();a=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)
l=int(L*sr);x=int(X*sr);a=a[:l+x]
head=a[:x].copy();tail=a[l:l+x]
t=np.linspace(0,1,x);a[:x]=head*np.sqrt(t)+tail*np.sqrt(1-t)
a=a[:l]
pk=np.abs(a).max();rms=np.sqrt((a**2).mean());a=a/max(rms,1)*3000;a=np.clip(a,-32000,32000)
o=wave.open('/tmp/'+n+'_l.wav','wb');o.setnchannels(1);o.setsampwidth(2);o.setframerate(sr);o.writeframes(a.astype(np.int16).tobytes());o.close()
EOF
  ffmpeg -v error -y -i /tmp/${n}_l.wav -c:a libopus -b:a 32k out/$n.webm
  ffmpeg -v error -y -i /tmp/${n}_l.wav -c:a libmp3lame -b:a 48k out/$n.mp3
}
PHONE='highpass=f=140,lowshelf=f=260:g=2,lowpass=f=7000'
loop forest forest 60 40 3 "$PHONE"
loop air breeze 8 36 3 "highpass=f=180,lowpass=f=3200,$PHONE"
loop night crickets 2 30 3 "highpass=f=300,lowpass=f=6000,volume=0.8"
loop pad pad 20 44 4 "highpass=f=120,lowpass=f=5000"
# one-shots: name src start len filters
shot(){ ffmpeg -v error -y -ss $3 -t $4 -i raw/$2.mp3 -ac 1 -ar 24000 -af "$5,afade=t=in:d=0.01,afade=t=out:st=$(python3 -c "print($4-0.12)"):d=0.12,loudnorm=I=-20:TP=-3" /tmp/s_$1.wav
  ffmpeg -v error -y -i /tmp/s_$1.wav -c:a libopus -b:a 40k out/$1.webm; ffmpeg -v error -y -i /tmp/s_$1.wav -c:a libmp3lame -b:a 56k out/$1.mp3; }
shot creak creak 0 0.9 "$PHONE"
shot crackle crackle 3 1.4 "$PHONE"
shot burner burner 0.0 2.2 "highpass=f=160,lowpass=f=5000"
shot paper paper 1.0 1.2 "$PHONE"
shot wings wings 0 0.95 "$PHONE"
shot sparkle sparkle 0 2.4 "highpass=f=300,lowpass=f=7500"
shot star starclick 0 0.9 "highpass=f=300,lowpass=f=7500"
ls -la out
