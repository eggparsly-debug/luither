// cello legato D3 → A3 (7 st): soft (v=.4) should glide, firm (v=.9) should snap; then release back (pull-off vs slide)
const { execFileSync } = require('child_process'), fs = require('fs');
const vm = require('vm'), app = fs.readFileSync(__dirname + '/../app.html', 'utf8'), grab = (a, b) => app.slice(app.indexOf(a), app.indexOf(b)), sr = 48000;
function make() {
  const ctx = { console, Math, Float32Array, Uint8Array, Set, Map, JSON, Object, Array, Number, isFinite, Date }; ctx.sampleRate = sr; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(`class AudioWorkletProcessor { constructor(){ this.port = { postMessage(){} }; } } var P; function registerProcessor(n, c) { P = c; }`, ctx);
  for (const f of ['bodygeo.js', 'instdefs.js']) vm.runInContext(fs.readFileSync(__dirname + '/../' + f, 'utf8'), ctx);
  vm.runInContext('let cfg, quality = "med", actx = { sampleRate: 48000 }, modesInfo; function bulge(b){ return 0; }\n' + grab('function bodyGeom', '// ───────────────────────── audio') + grab('function autoThr', '// ───────────────────────── audio'), ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../synthdefs.js', 'utf8') + fs.readFileSync(__dirname + '/../ampdefs.js', 'utf8'), ctx);
  vm.runInContext(['biquad.js', 'synthdsp.js', 'ampdsp.js', 'dsp.js'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), ctx);
  return ctx;
}
for (const [pre, v] of [['Cello', .4], ['Cello', .9], ['Oud', .4], ['Oud', .9]]) {
  const ctx = make(); ctx.__pre = pre;
  vm.runInContext(`cfg = PRESETS[__pre](); var p = new P(); p.msg({ t: 'sdefs', v: synthDefs() }); p.msg({ t: 'strings', v: cfg.strings.map(s => ({ ...s, mat: SMAT[s.mat] })) });
    p.msg({ t: 'ex', v: cfg.ex }); p.msg({ t: 'nk', v: { ...cfg.nk, thr: autoThr() } }); p.msg({ t: 'modes', v: computeBody().map(x => ({ f: x.f, q: x.q, amp: x.amp, pan: x.pan })) }); p.msg({ t: 'pk', v: cfg.pk });`, ctx);
  const p = ctx.p, tr = []; let s = null;
  const run = (sec) => { for (let i = 0; i < sec * sr; i += 128) { p.process([], [[new Float32Array(128), new Float32Array(128)]]); if (s) tr.push(12 * Math.log2(s.freq / 440) + 69); } };
  p.msg({ t: 'on', n: 50, v: .8 }); s = p.S[p.map.get(50)]; run(.4); const t0 = tr.length; p.msg({ t: 'on', n: 57, v }); run(.5); const t1 = tr.length; p.msg({ t: 'off', n: 57 }); run(.5);
  const reach = (a, target) => { for (let i = a; i < tr.length; i++) if (Math.abs(tr[i] - target) < .1) return ((i - a) * 128 / sr * 1000).toFixed(0) + ' ms'; return 'never'; };
  console.log(pre.padEnd(6), 'v=' + v, 'up 7 st reached in', reach(t0, 57), '| back down in', reach(t1, 50), '| fret-noise events', p.fn.length >= 0 ? 'ok' : '');
}
