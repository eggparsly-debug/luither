const fs = require('fs');
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
let P; globalThis.registerProcessor = (n, c) => { P = c; };
eval(['biquad.js','synthdsp.js','ampdsp.js','dsp.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n'));

const MAT = {
  steel: { decay: 9, bright: 0.08, stiff: 0.35, magnetic: 1 },
  bronze: { decay: 8, bright: 0.14, stiff: 0.2, magnetic: 0.4 },
  gut: { decay: 3.5, bright: 0.42, stiff: 0.12, magnetic: 0 },
  silk: { decay: 3, bright: 0.48, stiff: 0.06, magnetic: 0 },
};
function mk(role, note, mat, gauge, range = 12, wound = false) { return { role, note, range, mat: MAT[mat], gauge, wound, tension: 0.5 }; }
function modes() { const a = []; for (let i = 0; i < 24; i++) a.push({ f: 180 * (1 + i * 0.7), q: 50, amp: 1 / (1 + i * 0.3), pan: (i % 2 ? 1 : -1) * 0.3 }); a.push({ f: 110, q: 25, amp: 1.2, pan: 0 }); return a; }

function render(p, sec, events) {
  const n = Math.round(sec * 48000), L = new Float32Array(n), R = new Float32Array(n);
  let ev = 0;
  for (let i = 0; i < n; i += 128) {
    while (ev < events.length && events[ev][0] * 48000 <= i) { p.msg(events[ev][1]); ev++; }
    const l = new Float32Array(128), r = new Float32Array(128);
    p.process([], [[l, r]]);
    L.set(l.subarray(0, Math.min(128, n - i)), i); R.set(r.subarray(0, Math.min(128, n - i)), i);
  }
  return L;
}
function stats(x, a = 0, b = x.length) { let pk = 0, s = 0, nan = 0; for (let i = a; i < b; i++) { const v = x[i]; if (!isFinite(v)) nan++; pk = Math.max(pk, Math.abs(v)); s += v * v; } return { pk: +pk.toFixed(3), rms: +Math.sqrt(s / (b - a)).toFixed(4), nan }; }
function pitch(x, a, len = 8192) { // autocorrelation
  const lo = 15, hi = 2400; const r = [];
  for (let lag = 0; lag < hi; lag++) { let s = 0; for (let i = 0; i < len; i++) s += x[a + i] * x[a + i + lag]; r.push(s); }
  let mx = 0; for (let l = lo; l < hi; l++) mx = Math.max(mx, r[l]);
  let bl = lo; while (bl < hi && r[bl] > 0) bl++; // pass first zero crossing
  for (; bl < hi - 1; bl++) if (r[bl] > 0.8 * mx && r[bl] >= r[bl - 1] && r[bl] >= r[bl + 1]) break;
  // parabolic refine
  const c = l => { let s = 0; for (let i = 0; i < len; i++) s += x[a + i] * x[a + i + l]; return s; };
  const y0 = c(bl - 1), y1 = c(bl), y2 = c(bl + 1); const off = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
  return 48000 / (bl + off);
}
const cents = (f, n) => (1200 * Math.log2(f / (440 * Math.pow(2, (n - 69) / 12)))).toFixed(1);

function guitar() {
  const p = new P();
  p.msg({ t: 'strings', v: [mk('stopped', 40, 'bronze', .9, 19, true), mk('stopped', 45, 'bronze', .75, 19, true), mk('stopped', 50, 'bronze', .6, 19, true), mk('stopped', 55, 'bronze', .45, 19, true), mk('stopped', 59, 'steel', .3, 19), mk('stopped', 64, 'steel', .2, 19)] });
  p.msg({ t: 'modes', v: modes() });
  return p;
}
// Pitch accuracy across range, mic only so we hear body (use piezo for pitch clarity)
for (const note of [40, 45, 52, 57, 64, 69, 76]) {
  const p = guitar(); p.msg({ t: 'pk', v: { piezo: 1, mic: 0, mag: 0 } });
  const x = render(p, 1.2, [[0, { t: 'on', n: note, v: 0.8 }]]);
  console.log('pick note', note, 'pitch err cents', cents(pitch(x, 12000), note), stats(x));
}
{ const p = guitar(); const x = render(p, 3, [[0, { t: 'on', n: 40, v: 1 }], [0, { t: 'on', n: 47, v: 1 }], [0, { t: 'on', n: 52, v: 1 }], [0, { t: 'on', n: 56, v: 1 }], [0, { t: 'on', n: 59, v: 1 }], [0, { t: 'on', n: 64, v: 1 }]]);
  console.log('guitar E chord full mix', stats(x), 'tail', stats(x, 120000)); }
// smart legato trill
{ const p = guitar(); let held;
  const x = render(p, 1, [[0, { t: 'on', n: 57, v: .8 }], [.2, { t: 'on', n: 59, v: .8 }], [.4, { t: 'off', n: 59 }], [.5, { t: 'on', n: 64, v: .8 }]]);
  console.log('legato map', [...p.map.entries()], 'stacks', p.S.map(s => s.stack.join('/'))); }
// bow
for (const pr of [0.2, 0.5, 0.9]) {
  const p = new P(); p.msg({ t: 'strings', v: [mk('stopped', 36, 'gut', .8, 24, true), mk('stopped', 43, 'gut', .6, 24, true), mk('stopped', 50, 'steel', .4, 24), mk('stopped', 57, 'steel', .3, 24)] });
  p.msg({ t: 'modes', v: modes() }); p.msg({ t: 'ex', v: { type: 'bow', pos: 0.12, pressure: pr, speed: .5 } }); p.msg({ t: 'nk', v: { frets: false, glide: .08 } });
  p.msg({ t: 'pk', v: { piezo: 1, mic: 0 } });
  const x = render(p, 2, [[0, { t: 'on', n: 50, v: .8 }], [1.4, { t: 'off', n: 50 }]]);
  console.log('bow pressure', pr, 'pitch err', cents(pitch(x, 30000), 50), stats(x, 20000, 60000), 'after release', stats(x, 90000));
}
// ebow, wind
for (const type of ['ebow', 'wind', 'finger', 'hammer']) {
  const p = guitar(); p.msg({ t: 'ex', v: { type } });
  const x = render(p, 3, [[0, { t: 'on', n: 52, v: .8 }], [2.5, { t: 'off', n: 52 }]]);
  console.log(type, 'pitch', cents(pitch(x, 60000), 52), stats(x, 0, 48000), stats(x, 48000, 110000), 'post', stats(x, 130000));
}
// sitar jawari + symps + drones
{ const p = new P(); const sy = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77].map(n => mk('symp', n, 'steel', .1));
  p.msg({ t: 'strings', v: [mk('stopped', 53, 'steel', .25, 26), mk('stopped', 48, 'bronze', .45, 12, true), mk('drone', 36, 'bronze', .6), mk('drone', 43, 'bronze', .5), mk('drone', 60, 'steel', .2), mk('drone', 72, 'steel', .15), ...sy] });
  p.msg({ t: 'modes', v: modes() }); p.msg({ t: 'nk', v: { jawari: .75, sympC: .8 } }); p.msg({ t: 'ex', v: { pickStiff: .8, pos: .08 } });
  const x = render(p, 3, [[0, { t: 'on', n: 60, v: 1 }], [.5, { t: 'on', n: 62, v: 1 }], [1, { t: 'off', n: 62 }]]);
  console.log('sitar', stats(x), 'symp rms', p.S.slice(6).map(s => s.rms.toExponential(1)).join(' '));
}
// koto bends + 24-string CPU
{ const p = new P(); const tun = [50, 43, 45, 46, 50, 51, 55, 57, 58, 62, 63, 67, 69];
  const st = tun.map(n => mk('open', n, 'silk', .35)); while (st.length < 24) st.push(mk('symp', 60 + st.length, 'steel', .1));
  p.msg({ t: 'strings', v: st }); const m = modes(); while (m.length < 52) m.push({ f: 900 + m.length * 50, q: 60, amp: .2, pan: 0 }); p.msg({ t: 'modes', v: m });
  p.msg({ t: 'pk', v: { piezo: 1, mic: 0 } });
  const t0 = Date.now();
  const x = render(p, 10, [[0, { t: 'on', n: 60, v: .8 }], [.1, { t: 'on', n: 55, v: .8 }]]);
  const dt = (Date.now() - t0) / 1000;
  console.log('koto C (bend from Bb):', 'string', p.map.get(60), 'pitch err', cents(pitch(x, 2000), 60), 'cpu x realtime', (dt / 10).toFixed(3), stats(x));
}
// ghost notes & harmonics on the guitar A string (open A2 = 45)
console.log('--- ghosts');
for (const [label, n, v] of [['normal fret 5 v=.5', 50, .5], ['ghost heavy fret 5 v=19', 50, 19/127], ['ghost light fret 6 v=4', 51, 4/127], ['harm A3 (A str h2) v=4', 57, 4/127], ['harm E4 (h3/h4) v=4', 64, 4/127], ['harm C#5 (A h5) v=4', 73, 4/127], ['F4 no harmonic v=4', 65, 4/127], ['A3 heavier v=14', 57, 14/127], ['normal v=21', 50, 21/127]]) {
  const p = guitar(); p.msg({ t: 'pk', v: { piezo: 1, mic: 0 } });
  const x = render(p, 2, [[0, { t: 'on', n, v }], [.15, { t: 'off', n }]]);
  const a = stats(x, 0, 4800), b = stats(x, 24000, 48000); const used = [...p.S.entries()].filter(([i,s])=>s.env>1e-4 || s.harm).map(([i,s])=>i+(s.harm?'h':'')).join(',');
  let f = '-'; try { f = (48000 / 1).toFixed(0); f = pitch(x, 1000, 4096).toFixed(1); } catch (e) {}
  console.log(label.padEnd(26), 'first100ms', a.rms, ' 0.5-1s', b.rms, ' pitch', f, 'Hz', 'strings', used);
}
console.log('--- synth presets (guitar, E3 + B3, then cello bow for Bow swell / Wandering bow)');
eval(fs.readFileSync(__dirname + '/synthdefs.js', 'utf8').replace(/^const /gm, 'var ').replace(/^function /gm, 'var _f = function '));
