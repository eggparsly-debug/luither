import numpy as np, sys
from scipy.signal import lfilter, bilinear
SR=48000
def kw(x):  # ITU-R BS.1770 K-weighting
    b1=[1.53512485958697,-2.69169618940638,1.19839281085285]; a1=[1,-1.69065929318241,0.73248077421585]
    b2=[1,-2,1]; a2=[1,-1.99004745483398,0.99007225036621]
    return lfilter(b2,a2,lfilter(b1,a1,x))
def L(p, a=0, b=1.0):
    x=np.fromfile(p,np.float32).astype(float)[int(a*SR):int(b*SR)]; y=kw(x); return 10*np.log10(np.mean(y*y)+1e-20)
if __name__=='__main__':
    for p in sys.argv[1:]: print(p, round(L(p),2))
