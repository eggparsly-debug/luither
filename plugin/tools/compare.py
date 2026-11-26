# Compare the C++ engine with the browser engine: same messages, same note → level, spectrum, envelope
import subprocess, sys, json, os, numpy as np
R = '/tmp/lb/luither_render_artefacts/Release/luither_render'
def run(pre, note, vel=.8, hold=3, tot=3, patch='', synth='', amp='', pedals=''):
    js, cc, m = f'/tmp/ren/js_{note}.f32', f'/tmp/ren/cc_{note}.f32', '/tmp/ren/msgs.json'
    env = dict(os.environ, DUMP=m, SYNTH=synth, AMP=amp, PEDALS=pedals); subprocess.run(['node', 'render.js', pre, str(note), str(vel), str(hold), str(tot), js, patch], check=True, env=env)
    subprocess.run([R, m, str(note), str(vel), str(hold), str(tot), cc], check=True)
    a, b = np.fromfile(js, np.float32).astype(float), np.fromfile(cc, np.float32).astype(float)
    def bands(x):
        X = np.abs(np.fft.rfft(x[:int(1.5 * 48000)] * np.hanning(int(1.5 * 48000)))) ** 2; f = np.fft.rfftfreq(int(1.5 * 48000), 1 / 48000)
        return np.array([10 * np.log10(X[(f >= c / 1.41) & (f < c * 1.41)].sum() + 1e-20) for c in [62.5, 125, 250, 500, 1000, 2000, 4000, 8000]])
    env_ = lambda x: [20 * np.log10(np.sqrt(np.mean(x[i:i + 4800] ** 2)) + 1e-12) for i in range(0, len(x) - 4800, 24000)]
    corr = np.corrcoef(a[:48000], b[:48000])[0, 1]
    return dict(peak=(20 * np.log10(np.abs(a).max() + 1e-12), 20 * np.log10(np.abs(b).max() + 1e-12)), bands=bands(b) - bands(a), env=(env_(a), env_(b)), corr=corr)
if __name__ == '__main__':
    cases = json.loads(sys.argv[1]) if len(sys.argv) > 1 else [["Acoustic guitar", 40], ["Acoustic guitar", 64]]
    for c in cases:
        kw = c[2] if len(c) > 2 else {}
        r = run(c[0], c[1], **kw); lab = (c[0] + ' ' + ' '.join(str(v) for v in kw.values()))[:44]
        print(f"{lab:44s} {c[1]:3d}  peak js {r['peak'][0]:6.1f} cc {r['peak'][1]:6.1f} | corr {r['corr']:.3f} | band Δ(cc−js) " + ' '.join(f'{v:+.1f}' for v in r['bands']) +
              ' | env js ' + ' '.join(f'{v:.0f}' for v in r['env'][0]) + ' cc ' + ' '.join(f'{v:.0f}' for v in r['env'][1]))
