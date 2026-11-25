import numpy as np, sys
SR=48000
def track(p, f0):
    x=np.fromfile(p,np.float32).astype(float); x=x[int(.5*SR):int(2.4*SR)]
    W=4096; hop=512; fr=[]; hnr=[]
    for i in range(0,len(x)-W,hop):
        s=x[i:i+W]*np.hanning(W); S=np.abs(np.fft.rfft(s,W*4)); f=np.fft.rfftfreq(W*4,1/SR)
        m=(f>f0*.94)&(f<f0*1.06); j=np.where(m)[0][np.argmax(S[m])]; fr.append(f[j])
        # harmonic energy share up to 20 harmonics
        P=S**2; tot=P[(f>f0*.5)&(f<f0*20.5)].sum(); h=sum(P[(f>k*f0*.985)&(f<k*f0*1.015)].sum() for k in range(1,21)); hnr.append(10*np.log10(h/(tot-h+1e-20)))
    fr=np.array(fr); c=1200*np.log2(fr/np.median(fr))
    return np.std(c), np.median(hnr)
for p in sys.argv[2:]: print(p.split('/')[-1], 'pitch wobble %.1f cents, harmonic/noise %.1f dB' % track(p, float(sys.argv[1])))
