const fs = require('fs');
globalThis.sampleRate = 48000; globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {} }; } }; let P; globalThis.registerProcessor = (n, c) => { P = c; };
eval(['biquad.js', 'synthdsp.js', 'ampdsp.js', 'dsp.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n'));
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; Math.random = rnd;
const MAT = { bronze: { decay: 8, bright: .14, stiff: .2, magnetic: .4 }, steel: { decay: 9, bright: .08, stiff: .35, magnetic: 1 } };
const mk = (note, mat, g, w) => ({ role: 'stopped', note, range: 19, mat: MAT[mat], gauge: g, wound: w, tension: .5 });
function render(ex, ev, sec = 1.536) {
  seed = 1; const p = new P(); p.seed = 22222;
  p.msg({ t: 'strings', v: [mk(40, 'bronze', .9, 1), mk(45, 'bronze', .75, 1), mk(50, 'bronze', .6, 1), mk(55, 'bronze', .45, 1), mk(59, 'steel', .3, 0), mk(64, 'steel', .2, 0)] });
  const m = []; for (let i = 0; i < 16; i++) m.push({ f: 180 * (1 + i * .7), q: 50, amp: 1 / (1 + i * .3), pan: 0 }); m.push({ f: 110, q: 25, amp: 1.2, pan: 0 }); p.msg({ t: 'modes', v: m });
  p.msg({ t: 'pk', v: { piezo: .3, mic: .9, mag: 0 } }); p.msg({ t: 'ex', v: ex }); p.msg({ t: 'nk', v: { thr: 12, glide: .01 } });
  const N = sec * 48000, L = new Float32Array(N); let e = 0;
  for (let i = 0; i < N; i += 128) { while (e < ev.length && ev[e][0] * 48000 <= i) { p.msg(ev[e][1]); e++; } const l = new Float32Array(128), r = new Float32Array(128); p.process([], [[l, r]]); L.set(l, i); }
  return L;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const db = v => (20 * Math.log10(v)).toFixed(1);
function cmp(label, ex, ev, t0, t1) {
  const on = render({ ...ex, fretNoise: .5 }, ev), off = render({ ...ex, fretNoise: 0 }, ev), a = t0 * 48000, b = t1 * 48000;
  const d = new Float32Array(on.length).map((_, i) => on[i] - off[i]);
  console.log(label.padEnd(34), 'noise', db(rms(d, a, b)), 'dB  vs note', db(rms(off, a, b)), 'dB  → noise is', db(rms(d, a, b) / rms(off, a, b)), 'dB below the note');
}
const pick = { type: 'pick', pos: .16, pickStiff: .6 };
cmp('hammer-on (fingers, wound G)', { ...pick, fretter: 'fingers' }, [[0, { t: 'on', n: 56, v: .8 }], [.5, { t: 'on', n: 58, v: .8 }]], .5, .56);
cmp('pull-off (fingers, wound G)', { ...pick, fretter: 'fingers' }, [[0, { t: 'on', n: 56, v: .8 }], [.3, { t: 'on', n: 58, v: .8 }], [.6, { t: 'off', n: 58 }]], .6, .66);
cmp('finger lift on release', { ...pick, fretter: 'fingers' }, [[0, { t: 'on', n: 57, v: .8 }], [.5, { t: 'off', n: 57 }]], .5, .56);
cmp('finger slide squeak (wound A, 7 st)', { ...pick, fretter: 'fingers' }, [[0, { t: 'on', n: 47, v: .8 }], [.4, { t: 'on', n: 54, v: .8 }]], .4, .45);
cmp('slide scrape (wound A, 7 st, steel)', { ...pick, fretter: 'slide', slideMat: 'steel', slideTime: .12 }, [[0, { t: 'on', n: 47, v: .8 }], [.4, { t: 'on', n: 54, v: .8 }]], .4, .6);
cmp('slide scrape (plain B, glass)', { ...pick, fretter: 'slide', slideMat: 'glass', slideTime: .12 }, [[0, { t: 'on', n: 61, v: .8 }], [.4, { t: 'on', n: 66, v: .8 }]], .4, .6);
cmp('key clack (keys, fresh fretted note)', { ...pick, fretter: 'keys' }, [[0, { t: 'on', n: 57, v: .8 }]], 0, .05);
cmp('slide landing clank (steel)', { ...pick, fretter: 'slide', slideMat: 'steel' }, [[0, { t: 'on', n: 52, v: .8 }]], 0, .05);
cmp('finger press before pluck', { ...pick, fretter: 'fingers' }, [[0, { t: 'on', n: 52, v: .8 }]], 0, .05);
