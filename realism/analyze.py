import numpy as np, sys, json
SR = 48000
def load(p): return np.fromfile(p, np.float32).astype(np.float64)
def feats(x, f0, kind):
    env = np.sqrt(np.convolve(x * x, np.ones(240) / 240, 'same'))
    pk = env.max(); on = int(np.argmax(env > .05 * pk)); x = x[max(0, on - 480):]; env = env[max(0, on - 480):]
    i10, i90 = np.argmax(env > .1 * pk), np.argmax(env > .9 * pk); attack = (i90 - i10) / SR
    W = 16384 if f0 < 70 else 8192 if f0 < 140 else 4096; hop = 1024; win = np.hanning(W)
    nfr = max(1, (len(x) - W) // hop); S = np.array([np.abs(np.fft.rfft(x[i * hop:i * hop + W] * win)) for i in range(nfr)]); fr = np.fft.rfftfreq(W, 1 / SR)
    t = (np.arange(nfr) * hop + W / 2) / SR
    # refine f0 from the first 3 harmonics in an early window
    k0 = np.argmin(abs(t - (.3 if kind == 'pluck' else 1.0))); spec = S[max(0, k0 - 2):k0 + 3].mean(0)
    def peak(fc, tol):
        m = (fr > fc * (1 - tol)) & (fr < fc * (1 + tol));
        if not m.any(): return fc, 1e-12
        j = np.where(m)[0][np.argmax(spec[m])]
        if 0 < j < len(spec) - 1:
            a, b, c = np.log(spec[j - 1] + 1e-12), np.log(spec[j] + 1e-12), np.log(spec[j + 1] + 1e-12); d = .5 * (a - c) / (a - 2 * b + c + 1e-12); return fr[j] + d * (fr[1] - fr[0]), spec[j]
        return fr[j], spec[j]
    f1, _ = peak(f0, .04); K = int(min(24, 16000 / f1)); fk = []; 
    for k in range(1, K + 1):
        guess = k * f1 * (np.sqrt(1 + (fk[-1][2] if fk else 0) * k * k)); f, a = peak(guess, .025 / max(1, k ** .3)); fk.append((k, f, ((f / (k * f1)) ** 2 - 1) / (k * k) if k > 1 else 0))
    Bs = [b for k, f, b in fk[2:12]]; B = float(np.median(Bs)) if Bs else 0
    freqs = [f for k, f, b in fk]
    # harmonic amp tracks
    H = np.zeros((nfr, K))
    for k, f in enumerate(freqs):
        m = (fr > f * .985 - 3) & (fr < f * 1.015 + 3); H[:, k] = S[:, m].max(1) if m.any() else 1e-12
    HdB = 20 * np.log10(H + 1e-12)
    w = (t > .08) & (t < .3) if kind == 'pluck' else (t > .7) & (t < 1.6)
    if not w.any(): w = np.ones(nfr, bool)
    prof = HdB[w].mean(0); prof -= prof.max()
    # decay rates (pluck)
    dec = []
    for k in range(K):
        y = HdB[:, k]; st = np.argmax(t > .12); top = y[st]
        end = st + 1
        while end < nfr - 2 and y[end] > top - 35 and t[end] < 3.0: end += 1
        if end - st > 4: dec.append(-np.polyfit(t[st:end], y[st:end], 1)[0])
        else: dec.append(np.nan)
    dec = np.array(dec)
    def cen(tt):
        j = np.argmin(abs(t - tt)); h = H[j]; return float((h * np.arange(1, K + 1)).sum() / (h.sum() + 1e-12))
    # harmonic vs total energy in body window → noise/inharmonic residual
    j = np.argmin(abs(t - (.15 if kind == 'pluck' else 1.0))); tot = (S[j] ** 2).sum(); harm = 0
    for f in freqs: m = (fr > f * .985 - 3) & (fr < f * 1.015 + 3); harm += (S[j][m] ** 2).sum()
    # octave-band LTAS of the first 1.5 s
    seg = x[:int(1.5 * SR)]; P = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2; ff = np.fft.rfftfreq(len(seg), 1 / SR)
    bands = [62.5, 125, 250, 500, 1000, 2000, 4000, 8000]; lt = np.array([P[(ff >= b / np.sqrt(2)) & (ff < b * np.sqrt(2))].sum() for b in bands]); lt = 10 * np.log10(lt / lt.sum() + 1e-12)
    # overall decay: time for RMS to drop 20 dB from peak
    ie = np.argmax(env); after = np.where(env[ie:] < pk * .1)[0]; t20 = after[0] / SR if len(after) else len(env[ie:]) / SR
    return dict(f0=f1, B=B, attack=attack, prof=prof, dec=dec, cen=[cen(.05), cen(.5), cen(1.5)], noise=10 * np.log10(max(1e-9, 1 - harm / tot)), lt=lt, t20=t20, K=K)
def summary(F):
    d = F['dec']; g = lambda a, b: float(np.nanmedian(d[a:b])) if np.isfinite(d[a:b]).any() else float('nan')
    return dict(f0=round(F['f0'], 1), B=F['B'], att_ms=round(F['attack'] * 1000, 1), t20=round(F['t20'], 2), dec_h1=g(0, 1), dec_h2_4=g(1, 4), dec_h5_10=g(4, 10), dec_h11p=g(10, 24),
                cen=[round(c, 2) for c in F['cen']], noise=round(F['noise'], 1), prof=[round(v, 1) for v in F['prof'][:12]], lt=[round(v, 1) for v in F['lt']])
if __name__ == '__main__':
    print(json.dumps(summary(feats(load(sys.argv[1]), float(sys.argv[2]), sys.argv[3]))))
