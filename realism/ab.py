import subprocess, sys
J = [('Acoustic_guitar', 'Acoustic guitar', 55, 'pluck'), ('Electric_bass', 'Electric bass', 28, 'pluck'), ('Classical_guitar', 'Classical guitar', 59, 'pluck'),
     ('Concert_harp', 'Concert harp', 72, 'pluck'), ('Sitar', 'Sitar', 60, 'pluck'), ('Cello', 'Cello', 43, 'bow')]
tag = sys.argv[1]
for t, pre, n, k in J:
    subprocess.run(['node', 'render.js', pre, str(n), '.8', '2.6' if k == 'bow' else '4', '3.5', f'/tmp/ab/{t}_{tag}.f32'], check=True)
