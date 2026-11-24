const fs = require('fs'); globalThis.sampleRate = 48000; globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {} }; } }; globalThis.registerProcessor = () => {};
eval(['biquad.js', 'synthdsp.js', 'ampdsp.js', 'dsp.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n' + fs.readFileSync('ampdefs.js', 'utf8') + '\nglobalThis.PC=PEDAL_CLASSES;globalThis.PD=PEDALS;globalThis.NP=newPedal;globalThis.AR=AmpRack;globalThis.AH=AmpHead;globalThis.CB=Cab;globalThis.AP=ampPreset;');
const N = 48000 * 2; const x = new Float32Array(N).map(() => (Math.random() - .5) * .5);
const rack = new AR(48000);
for (const t of Object.keys(PC)) { const d = NP(t); const p = new PC[t](48000, rack); p.setP(d.p, d.o); for (let i = 0; i < 2000; i++) { if (i % 128 === 0) p.block(128); p.run(x[i], x[i]); }
  const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) { if (i % 128 === 0) p.block(128); p.run(x[i], x[i]); } const dt = Number(process.hrtime.bigint() - t0) / 1e9; console.log(t.padEnd(8), (dt / 2 * 100).toFixed(2) + '% of realtime'); }
const h = new AH(48000); h.set(AP('High-gain modern').head); const c = new CB(48000); c.set(AP('High-gain modern').cab);
let t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) { h.run(x[i], x[i]); } console.log('head    ', (Number(process.hrtime.bigint() - t0) / 1e9 / 2 * 100).toFixed(2) + '%');
t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) { c.run(x[i], x[i]); } console.log('cab     ', (Number(process.hrtime.bigint() - t0) / 1e9 / 2 * 100).toFixed(2) + '%');
