import subprocess, json, sys, numpy as np, os
sys.path.insert(0, os.path.dirname(__file__)); from analyze import feats, summary, load
N = lambda s: {'C':0,'Cs':1,'D':2,'Ds':3,'E':4,'F':5,'Fs':6,'G':7,'Gs':8,'A':9,'As':10,'B':11}[s[:-1]] + 12 * (int(s[-1]) + 1)
SET = {  # preset: (ref folder, notes, kind, vel, hold)
 'Acoustic guitar': ('guitar-acoustic', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], 'pluck', .8, 4),
 'Classical guitar': ('guitar-nylon', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], 'pluck', .8, 4),
 'Electric guitar': ('guitar-electric', ['E2', 'A3', 'C4', 'A4'], 'pluck', .8, 4),
 'Electric bass': ('bass-electric', ['E1', 'G1', 'E2', 'G2'], 'pluck', .8, 4),
 'Concert harp': ('harp', ['C3', 'G3', 'C5', 'E5'], 'pluck', .8, 4),
 'Cello': ('cello', ['C2', 'G2', 'D3', 'A3'], 'bow', .8, 2.6),
 'Violin': ('violin', ['G3', 'A4', 'E5'], 'bow', .8, 2.6),
 'Double bass': ('contrabass', ['E2', 'A2', 'D2'], 'bow', .8, 2.6),
 'Koto': ('fl__koto', ['A3', 'G4'], 'pluck', .8, 3),
 'Sitar': ('fl__sitar', ['C4', 'G4'], 'pluck', .8, 3),
}
def refpath(folder, n): return f'/tmp/refs/wav/{folder}__{n}.f32' if not folder.startswith('fl__') else f'/tmp/refs/wav/fl__{folder[4:]}-{n}.f32'
def run(pre, patch='', only=None, quiet=False):
    folder, notes, kind, vel, hold = SET[pre]; rows = []
    for n in notes:
        if only and n not in only: continue
        m = N(n); f0 = 440 * 2 ** ((m - 69) / 12); out = f'/tmp/ren/{pre.replace(" ", "_")}_{n}.f32'
        subprocess.run(['node', 'render.js', pre, str(m), str(vel), str(hold), '4' if kind == 'pluck' else '3.2', out, patch], check=True)
        r = summary(feats(load(refpath(folder, n)), f0, kind)); s = summary(feats(load(out), f0, kind)); rows.append((n, r, s))
    return rows
def show(pre, rows):
    print(f'\n== {pre}')
    print('note  │ centroid@.05/.5/1.5 (harm#) ref → ours │ t20 s ref/ours │ decay dB/s h1 | h2-4 | h5-10 | h11+  ref → ours │ B ref/ours │ attack ms │ noise dB │ octave LTAS 125..8k (ours−ref)')
    for n, r, s in rows:
        d = lambda k: '/'.join(f'{a:.0f}' if a == a else '-' for a in (r[k], s[k]))
        lt = ' '.join(f'{b - a:+.0f}' for a, b in zip(r['lt'][1:], s['lt'][1:]))
        print(f"{n:5s} │ {r['cen']} → {s['cen']} │ {r['t20']}/{s['t20']} │ {d('dec_h1')} {d('dec_h2_4')} {d('dec_h5_10')} {d('dec_h11p')} │ {r['B']:.1e}/{s['B']:.1e} │ {r['att_ms']}/{s['att_ms']} │ {r['noise']}/{s['noise']} │ {lt}")
if __name__ == '__main__':
    for pre in (sys.argv[1:] or SET): show(pre, run(pre))
