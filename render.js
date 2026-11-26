// render one note of a preset offline → mono f32 file.  node render.js "<preset>" <midi> <vel> <hold s> <total s> <out> ['<json patch fn body: (cfg)=>{...}>']
const fs = require('fs'), vm = require('vm');
const app = fs.readFileSync(__dirname + '/app.html', 'utf8'), grab = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));
const [, , pre, note, vel, hold, tot, out, patch] = process.argv, sr = 48000;
const ctx = { console, Math, Float32Array, Uint8Array, Set, Map, JSON, Object, Array, Number, isFinite, Date }; ctx.sampleRate = sr; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(`class AudioWorkletProcessor { constructor(){ this.port = { postMessage(){} }; } } var P; function registerProcessor(n, c) { P = c; }`, ctx);
vm.runInContext(fs.readFileSync(__dirname + '/bodygeo.js', 'utf8') + fs.readFileSync(__dirname + '/instdefs.js', 'utf8'), ctx);
vm.runInContext('let cfg, quality = "med", actx = { sampleRate: ' + sr + ' }, modesInfo; function bulge(b){ return Math.max(0, 1 - b.depth[b.depth.length-1] / Math.max(1e-4, b.depth[0])); }\n' + grab('function bodyGeom', '// ───────────────────────── audio'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/synthdefs.js', 'utf8') + fs.readFileSync(__dirname + '/ampdefs.js', 'utf8'), ctx);
vm.runInContext(['biquad.js', 'synthdsp.js', 'ampdsp.js', 'dsp.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n'), ctx);
ctx.__pre = pre; ctx.__patch = patch || '';
vm.runInContext(`cfg = PRESETS[__pre](); if (__patch) (new Function('cfg', __patch))(cfg); var mods = computeBody(); var p = new P(); p.seed = 4242;
  p.msg({ t: 'sdefs', v: synthDefs() }); p.msg({ t: 'strings', v: cfg.strings.map(s => ({ ...s, mat: SMAT[s.mat], sus: stringSus() })) });
  p.msg({ t: 'ex', v: { ...cfg.ex, humanize: 0 } }); p.msg({ t: 'nk', v: { ...cfg.nk, thr: autoThr() } });
  p.msg({ t: 'modes', v: mods.map(x => ({ f: x.f, q: x.q, amp: x.amp, pan: x.pan })) }); p.msg({ t: 'pk', v: { ...cfg.pk, scale: (b => b.bridgeX * b.length - (b.neckLen > .02 ? -b.neckLen : b.nutX * b.length))(cfg.body) } });
  var sp = synthPreset('Init (clean)'); p.msg({ t: 'synth', v: { p: sp.p, o: sp.o, mods: sp.mods } });`, ctx);
const p = ctx.p, N = Math.round(+tot * sr), M = new Float32Array(N), off = Math.round(+hold * sr);
p.msg({ t: 'on', n: +note, v: +vel }); let sent = false;
for (let i = 0; i < N; i += 128) { if (!sent && i >= off) { p.msg({ t: 'off', n: +note }); sent = true; }
  const l = new Float32Array(128), r = new Float32Array(128); p.process([], [[l, r]]); for (let k = 0; k < 128 && i + k < N; k++) M[i + k] = (l[k] + r[k]) / 2; }
fs.writeFileSync(out, Buffer.from(M.buffer)); if (process.env.DBG) console.log(vm.runInContext("[globalThis.__jc, globalThis.__jp, p.jaw]", ctx));
