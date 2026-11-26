const fs = require('fs'), vm = require('vm');
const app = fs.readFileSync(__dirname + '/app.html', 'utf8');
const grab = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));
function makeCtx(sr) {
  let lim = 1; const ctx = { console, Math, Float32Array, Uint8Array, Set, Map, JSON, Object, Array, Number, isFinite, Date };
  ctx.sampleRate = sr; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(`class AudioWorkletProcessor { constructor(){ this.port = { postMessage: m => { if (m.lim < __lim.v) __lim.v = m.lim; } }; } }
    var __lim = { v: 1 }; var P; function registerProcessor(n, c) { P = c; }`, ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/bodygeo.js', 'utf8') + fs.readFileSync(__dirname + '/instdefs.js', 'utf8'), ctx);
  vm.runInContext('let cfg, quality = "med", actx = { sampleRate: ' + sr + ' }, modesInfo; function bulge(b){ return Math.max(0, 1 - b.depth[b.depth.length-1] / Math.max(1e-4, b.depth[0])); }\n' + grab('function bodyGeom', '// ───────────────────────── audio'), ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/synthdefs.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/ampdefs.js', 'utf8'), ctx);
  vm.runInContext(['biquad.js','synthdsp.js','ampdsp.js','dsp.js'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n'), ctx);
  return ctx;
}
const db = x => x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf';
function run(sr, preset, synthName, scen, amp) {
  const ctx = makeCtx(sr);
  ctx.__pre = preset; ctx.__syn = synthName; ctx.__amp = amp ? JSON.stringify(amp) : '';
  vm.runInContext(`
    cfg = PRESETS[__pre](); var mods = computeBody();
    var p = new P();
    p.msg({ t: 'sdefs', v: synthDefs() });
    p.msg({ t: 'strings', v: cfg.strings.map(s => ({ ...s, mat: SMAT[s.mat], sus: stringSus() })) });
    p.msg({ t: 'ex', v: cfg.ex }); p.msg({ t: 'nk', v: { ...cfg.nk, thr: autoThr() } });
    p.msg({ t: 'modes', v: mods.map(x => ({ f: x.f, q: x.q, amp: x.amp, pan: x.pan })) });
    p.msg({ t: 'pk', v: { ...cfg.pk, master: cfg.pk.master * 0.7 } });
    var sp = synthPreset(__syn); p.msg({ t: 'synth', v: { p: sp.p, o: sp.o, mods: sp.mods } });
    if (__amp) p.msg({ t: 'amp', v: typeof __amp === 'string' ? JSON.parse(__amp) : __amp });
    var play = cfg.strings.filter(s => s.role === 'stopped' || s.role === 'open').map(s => s.note);
  `, ctx);
  const p = ctx.p, play = ctx.play;
  let notes;
  if (scen === 'chord') notes = [...new Set(play)].sort((a, b) => a - b).filter((n, i, a) => i % Math.max(1, Math.floor(a.length / 6)) === 0).slice(0, 6);
  const ev = [];
  if (scen === 'chord') { notes.forEach((n, i) => ev.push([i * 0.012, { t: 'on', n, v: 1 }])); notes.forEach(n => ev.push([2.5, { t: 'off', n }])); }
  if (scen === 'repeat') { const n = play[Math.floor(play.length / 2)]; for (let k = 0; k < 16; k++) { ev.push([k / 8, { t: 'on', n, v: 1 }]); ev.push([k / 8 + .1, { t: 'off', n }]); } }
  if (scen === 'soft') { const n = play[0]; ev.push([0, { t: 'on', n, v: .25 }]); ev.push([1.5, { t: 'off', n }]); }
  const secs = 8, N = Math.round(secs * sr), L = new Float32Array(N), R = new Float32Array(N); let e = 0;
  ev.sort((a, b) => a[0] - b[0]);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i += 128) {
    while (e < ev.length && ev[e][0] * sr <= i) { p.msg(ev[e][1]); e++; }
    const l = new Float32Array(128), r = new Float32Array(128); p.process([], [[l, r]]); L.set(l.subarray(0, Math.min(128, N - i)), i); R.set(r.subarray(0, Math.min(128, N - i)), i);
  }
  const cpu = Number(process.hrtime.bigint() - t0) / 1e9 / secs;
  let pk = 0, s = 0, sm = 0, dc = 0, bad = 0, xy = 0, xx = 0, yy = 0; const a = 0, b = Math.round(2.5 * sr);
  for (let i = 0; i < N; i++) { const l = L[i], r = R[i]; if (!isFinite(l) || !isFinite(r)) bad++; pk = Math.max(pk, Math.abs(l), Math.abs(r)); }
  for (let i = a; i < b; i++) { const l = L[i], r = R[i]; s += (l * l + r * r) / 2; sm += ((l + r) / 2) ** 2; dc += l + r; xy += l * r; xx += l * l; yy += r * r; }
  let tail = 0; for (let i = N - sr; i < N; i++) tail = Math.max(tail, Math.abs(L[i]), Math.abs(R[i]));
  const rms = Math.sqrt(s / (b - a)), monoLoss = 10 * Math.log10(sm / s), corr = xy / Math.sqrt(xx * yy + 1e-30);
  return { pk: db(pk), rms: db(rms), crest: (20 * Math.log10(pk / rms)).toFixed(1), dc: (dc / (2 * (b - a))).toExponential(1), corr: corr.toFixed(2), mono: monoLoss.toFixed(1),
    gr: db(ctx.__lim.v), tail: db(tail), cpu: (cpu * 100).toFixed(1) + '%', bad };
}
const which = process.argv[2] || 'inst';
const ctx0 = makeCtx(48000);
if (which === 'inst') {
  console.log('instrument'.padEnd(20), 'scenario', ' peak  rms   crest  limGR  corr  monoΔ  tail   dc       cpu');
  for (const name of vm.runInContext('Object.keys(PRESETS)', ctx0)) for (const sc of ['chord', 'repeat']) {
    const r = run(48000, name, 'Init (clean)', sc);
    console.log(name.padEnd(20), sc.padEnd(8), r.pk.padStart(5), r.rms.padStart(6), r.crest.padStart(5), r.gr.padStart(6), r.corr.padStart(5), r.mono.padStart(6), r.tail.padStart(6), r.dc.padStart(8), r.cpu.padStart(6), r.bad ? 'NaN!' : '');
  }
}
if (which === 'synth') {
  for (const inst of ['Acoustic guitar', 'Cello']) for (const sn of vm.runInContext('Object.keys(SPRESETS)', ctx0)) {
    const r = run(48000, inst, sn, 'chord');
    console.log(inst.padEnd(16), sn.padEnd(24), r.pk.padStart(5), r.rms.padStart(6), r.gr.padStart(6), 'corr', r.corr, 'monoΔ', r.mono, 'tail', r.tail, r.cpu, r.bad ? 'NaN!' : '');
  }
}
if (which === 'sr') {
  for (const sr of [44100, 48000, 96000]) for (const [inst, sn] of [['Acoustic guitar', 'Init (clean)'], ['Acoustic guitar', 'Flanger'], ['Cello', 'Electric vibrato'], ['Sitar', 'Octave shimmer'], ['Concert harp', 'Chorus']]) {
    const r = run(sr, inst, sn, 'chord');
    console.log(String(sr).padEnd(6), inst.padEnd(16), sn.padEnd(18), r.pk.padStart(5), r.rms.padStart(6), r.gr.padStart(6), 'tail', r.tail, r.cpu, r.bad ? 'NaN!' : '');
  }
}

if (which === 'cal') {
  const out = {};
  for (const name of vm.runInContext('Object.keys(PRESETS)', ctx0)) {
    const r = run(48000, name, 'Init (clean)', 'chord'), truePk = +r.pk - +r.gr, rms = +r.rms;
    const gdb = Math.max(-14, Math.min(10, Math.min(-3 - truePk, -16 - rms)));
    const master0 = vm.runInContext('PRESETS[' + JSON.stringify(name) + ']().pk.master', ctx0);
    out[name] = +(master0 * Math.pow(10, gdb / 20)).toFixed(3);
    console.log(name.padEnd(20), 'truePk', truePk.toFixed(1), 'rms', rms, '→ gain', gdb.toFixed(1), 'dB, master', out[name]);
  }
  fs.writeFileSync(__dirname + '/cal.json', JSON.stringify(out));
}

if (which === 'amp') {
  const ampNames = vm.runInContext('Object.keys(AMP_PRESETS)', ctx0), out = {};
  for (const inst of ['Electric guitar', 'Electric bass', 'Acoustic guitar']) for (const an of ampNames) {
    const amp = vm.runInContext('ampPreset(' + JSON.stringify(an) + ')', ctx0);
    const r = run(48000, inst, 'Init (clean)', 'chord', JSON.parse(JSON.stringify(amp)));
    const truePk = +r.pk - +r.gr, rms = +r.rms; const gdb = Math.max(-18, Math.min(12, Math.min(-3 - truePk, -14 - rms)));
    if (inst === 'Electric guitar') out[an] = +gdb.toFixed(1);
    console.log(inst.padEnd(16), an.padEnd(18), 'pk', r.pk, 'rms', r.rms, 'GR', r.gr, 'corr', r.corr, 'cpu', r.cpu, r.bad ? 'NaN!' : '', inst === 'Electric guitar' ? '→ trim ' + gdb.toFixed(1) + ' dB' : '');
  }
  fs.writeFileSync(__dirname + '/ampcal.json', JSON.stringify(out));
}
if (which === 'pedals') {
  const types = vm.runInContext('Object.keys(PEDALS)', ctx0);
  const base = run(48000, 'Electric guitar', 'Init (clean)', 'chord');
  console.log('bypass'.padEnd(14), 'pk', base.pk, 'rms', base.rms);
  for (const t of types) {
    const amp = JSON.parse(vm.runInContext('(() => { const a = ampDefault(); a.pre = [newPedal(' + JSON.stringify(t) + ')]; return JSON.stringify(a); })()', ctx0));
    const r = run(48000, 'Electric guitar', 'Init (clean)', 'chord', amp);
    console.log(t.padEnd(14), 'pk', r.pk, 'rms', r.rms, 'Δrms', (r.rms - base.rms).toFixed(1), 'GR', r.gr, 'corr', r.corr, 'mono', r.mono, 'tail', r.tail, 'cpu', r.cpu, r.bad ? 'NaN!' : '');
  }
}
if (which === 'rig') {
  const amp = JSON.parse(vm.runInContext('(() => { const a = ampPreset("British crunch"); a.pre = ["comp","boost","od","dist","fuzz","octave","crush","gate","geq","phaser"].map(newPedal); a.post = ["rotary","delay","spring","hall"].map(newPedal); return JSON.stringify(a); })()', ctx0));
  for (const sr of [48000, 96000]) { const r = run(sr, 'Electric guitar', 'Chorus', 'chord', amp); console.log('full rig (amp + all 14 pedals + chorus)', sr, 'pk', r.pk, 'rms', r.rms, 'GR', r.gr, 'tail', r.tail, 'cpu', r.cpu, r.bad ? 'NaN!' : 'no NaN'); }
  for (const an of vm.runInContext('Object.keys(AMP_PRESETS)', ctx0)) { const a = vm.runInContext('ampPreset(' + JSON.stringify(an) + ')', ctx0); const r = run(48000, 'Electric guitar', 'Init (clean)', 'chord', JSON.parse(JSON.stringify(a))); console.log(an.padEnd(18), 'pk', r.pk, 'rms', r.rms, 'GR', r.gr); }
}
if (which === 'sweep') {
  const specs = [['od', 'drive'], ['dist', 'dist'], ['fuzz', 'sustain'], ['octave', 'fuzz']];
  for (const [t, k] of specs) { const row = [];
    for (const v of [0, .25, .5, .75, 1]) { const amp = JSON.parse(vm.runInContext('(() => { const a = ampDefault(); const p = newPedal(' + JSON.stringify(t) + '); p.p.' + k + ' = ' + v + '; a.pre = [p]; return JSON.stringify(a); })()', ctx0));
      const r = run(48000, 'Electric guitar', 'Init (clean)', 'chord', amp); row.push(`${v}: ${r.rms}/${r.pk}${+r.gr < -.05 ? ' GR' + r.gr : ''}`); }
    console.log(t.padEnd(7), 'rms/peak →', row.join(' | ')); }
  const rowA = [];
  for (const g of [0, 2.5, 5, 7.5, 10]) { const amp = JSON.parse(vm.runInContext('(() => { const a = ampPreset("British crunch"); a.head.gain = ' + g + '; return JSON.stringify(a); })()', ctx0));
    const r = run(48000, 'Electric guitar', 'Init (clean)', 'chord', amp); rowA.push(`${g}: ${r.rms}/${r.pk}${+r.gr < -.05 ? ' GR' + r.gr : ''}`); }
  console.log('amp gain', 'rms/peak →', rowA.join(' | '));
}
