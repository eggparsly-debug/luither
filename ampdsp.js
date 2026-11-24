/* Luither — amp face DSP: pedals, amp head, cabinet. Runs after the synth face. */
class Biq {
  constructor() { this.z1 = 0; this.z2 = 0; this.c = [1, 0, 0, 0, 0]; }
  set(t, f, q, g, fs) { this.c = bqCoefs(t, f, q, g, fs); return this; }
  run(x) { const c = this.c, y = c[0] * x + this.z1; let z = c[1] * x - c[3] * y + this.z2; this.z1 = (z > 1e-15 || z < -1e-15) ? z : 0; z = c[2] * x - c[4] * y; this.z2 = (z > 1e-15 || z < -1e-15) ? z : 0; return y; }
}
// 2× oversampling around a nonlinearity, so heavy clipping doesn't fold harsh aliasing back into the audio band
class OS2 {
  constructor(fs) { const f2 = fs * 2; this.u = [new Biq().set('lp', fs * .45, .54, 0, f2), new Biq().set('lp', fs * .45, 1.31, 0, f2)]; this.d = [new Biq().set('lp', fs * .45, .54, 0, f2), new Biq().set('lp', fs * .45, 1.31, 0, f2)]; }
  up(x) { this.a = this.u[1].run(this.u[0].run(x * 2)); this.b = this.u[1].run(this.u[0].run(0)); }
  down(a, b) { const y = this.d[1].run(this.d[0].run(a)); this.d[1].run(this.d[0].run(b)); return y; }
}
class DL { // delay line with fractional read (power-of-two buffer: wrap with a mask, no division)
  constructor(n) { let m = 1; while (m < n + 2) m <<= 1; this.b = new Float32Array(m); this.k = m - 1; this.w = 0; }
  put(x) { this.b[this.w] = (x > 1e-15 || x < -1e-15) ? x : 0; this.w = (this.w + 1) & this.k; }
  get(d) { const rp = this.w - 1 - d, i = Math.floor(rp), f = rp - i, k = this.k, a = this.b[i & k]; return a + (this.b[(i + 1) & k] - a) * f; }
}
// fast curves for the hot path: rational tanh, and a cubic clipper with a hard knee at ±1.5
const tanhF = x => x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x);
const softClip = tanhF;
const hardClip = x => x <= -1.5 ? -1 : x >= 1.5 ? 1 : x - x * x * x / 6.75;
const dbToLin = d => Math.pow(10, d / 20);
const REF = .3; // typical playing peak: drive settings are level-matched around this
// measured loudness correction (dB) at knob 0, ¼, ½, ¾, full: heavier drive squashes and sustains, so it gets turned down to sit at the same mix level
const DCORR = { od: [1.7, 4.2, 1.9, .7, -.8], dist: [.1, -6.9, -9.2, -10.5, -11], fuzz: [6.9, -1.7, -4.1, -5.3, -6.1], octave: [-4.6, -1.3, -3.2, -4.7, -5.6], amp: [12.5, 7.5, 3.5, .4, -.8] };
const dcorr = (t, v) => { const c = DCORR[t], x = Math.max(0, Math.min(1, v)) * 4, i = Math.min(3, Math.floor(x)); return dbToLin(c[i] + (c[i + 1] - c[i]) * (x - i)); };

class Pedal {
  constructor(fs, rack) { this.fs = fs; this.rack = rack; this.p = {}; this.o = {}; this.v = {}; this.mix = 0; this.on = true; this.init(); }
  init() {} setP(p, o) { Object.assign(this.p, p || {}); Object.assign(this.o, o || {}); this.update(); } update() {} block() {}
  run(l, r) { this.l = l; this.r = r; }
}
class Comp extends Pedal {
  init() { this.env = 0; this.gr = 0; }
  update() { const p = this.p; this.at = 1 - Math.exp(-1 / ((p.attack || 5) * .001 * this.fs)); this.rt = 1 - Math.exp(-1 / ((p.release || 120) * .001 * this.fs)); this.mk = dbToLin(p.makeup || 0); }
  run(l, r) {
    const p = this.p, a = Math.max(Math.abs(l), Math.abs(r));
    this.env += (a - this.env) * (a > this.env ? this.at : this.rt);
    const db = 20 * Math.log10(this.env + 1e-9), over = db - p.thresh, knee = 6;
    let gr = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * (1 - 1 / p.ratio) : (over + knee / 2) ** 2 / (2 * knee) * (1 - 1 / p.ratio);
    this.gr = gr; const g = dbToLin(-gr) * this.mk, b = p.blend ?? 1;
    this.l = l * (1 - b) + l * g * b; this.r = r * (1 - b) + r * g * b;
    if (gr > this.v.gr || !(this.v.gr > 0)) this.v.gr = gr;
  }
}
class Boost extends Pedal {
  init() { this.f = [[new Biq(), new Biq()], [new Biq(), new Biq()]]; }
  update() { const t = this.p.tone || 0, fs = this.fs; for (const c of this.f) { c[0].set('ls', 250, .7, -t * 6, fs); c[1].set('hs', 2500, .7, t * 6, fs); } this.g = dbToLin(this.p.gain || 0); }
  run(l, r) { const g = this.g; this.l = softClip(this.f[0][1].run(this.f[0][0].run(l)) * g * .9) / .9; this.r = softClip(this.f[1][1].run(this.f[1][0].run(r)) * g * .9) / .9; }
}
class Drive extends Pedal { // shared base for overdrive / distortion / fuzz / octave
  init() { this.os = [new OS2(this.fs), new OS2(this.fs)]; this.ch = [0, 1].map(() => this.makeCh()); this.pk = 0; }
  makeCh() { return {}; }
  run(l, r) { this.l = this.one(l, 0); this.r = this.one(r, 1); const a = Math.max(Math.abs(l), Math.abs(r)); if (a > this.pk) this.pk = a; }
  block() { this.v.in = this.pk; this.v.drive = this.curveGain; this.pk *= .9; }
}
class Overdrive extends Drive { // mid-hump screamer: clip a high-passed copy, add it back to the clean signal
  makeCh() { return { hp: new Biq(), tone: new Biq(), out: new Biq() }; }
  update() { const p = this.p, fs = this.fs; this.g = 1 + p.drive * 25; this.curveGain = this.g; this.nrm = 1 / tanhF(this.g * REF * .6); this.lvl = dbToLin(p.level || 0) * .42 * dcorr('od', p.drive);
    for (const c of this.ch) { c.hp.set('hp', 720, .7, 0, fs); c.tone.set('lp', 700 * Math.pow(10, p.tone * 1.05), .7, 0, fs); c.out.set('hp', 40, .7, 0, fs); } }
  one(x, k) { const c = this.ch[k], g = this.g, h = c.hp.run(x);
    const os = this.os[k]; os.up(h); const y = os.down(tanhF(os.a * g), tanhF(os.b * g)) * this.nrm * .35 + x * .6;
    return c.out.run(c.tone.run(y)) * this.lvl; }
}
class Distortion extends Drive { // op-amp gain into hard diodes; the filter knob darkens
  makeCh() { return { op: new Biq(), filt: new Biq(), pre: new Biq(), fizz: new Biq() }; }
  update() { const p = this.p, fs = this.fs; this.g = 1 + p.dist * 80; this.curveGain = this.g; this.nrm = 1 / this.cl(this.g * REF); this.lvl = dbToLin(p.level || 0) * .26 * dcorr('dist', p.dist);
    for (const c of this.ch) { c.pre.set('hp', 100, .7, 0, fs); c.fizz.set('lp', 7500, .6, 0, fs); c.op.set('lp', Math.max(900, 90000 / this.g), .7, 0, fs); c.filt.set('lp', 15000 * Math.pow(600 / 15000, p.filter), .7, 0, fs); } }
  cl(v) { return .5 * tanhF(v) + .5 * hardClip(v); }
  one(x, k) { const c = this.ch[k], g = this.g, os = this.os[k]; os.up(c.op.run(c.pre.run(x))); const y = os.down(this.cl(os.a * g), this.cl(os.b * g)); return c.fizz.run(c.filt.run(y)) * this.nrm * this.lvl; }
}
class Fuzz extends Drive { // two cascaded asymmetric stages, scooped tone blend
  makeCh() { return { hp: new Biq(), lp: new Biq(), hp2: new Biq(), dc: new Biq(), fizz: new Biq() }; }
  update() { const p = this.p, fs = this.fs; this.g1 = 1 + p.sustain * 20; this.curveGain = this.g1 * 4; this.nrm = 1 / Math.max(.05, Math.abs(this.nl(REF))); this.lvl = dbToLin(p.level || 0) * .3 * dcorr('fuzz', p.sustain);
    for (const c of this.ch) { c.fizz.set('lp', 7000, .6, 0, fs); c.hp.set('hp', 110, .7, 0, fs); c.lp.set('lp', 500, .6, 0, fs); c.hp2.set('hp', 1200, .6, 0, fs); c.dc.set('hp', 25, .7, 0, fs); } }
  nl(v) { v = tanhF(v * this.g1 + .15) - .149; return tanhF(v * 4 + .1) - .0997; }
  one(x, k) { const c = this.ch[k], tn = this.p.tone;
    const os = this.os[k]; os.up(c.hp.run(x)); let y = os.down(this.nl(os.a), this.nl(os.b));
    y = c.fizz.run(c.dc.run(y)); return (c.lp.run(y) * (1 - tn) * 1.6 + c.hp2.run(y) * tn * 1.3) * this.nrm * this.lvl; }
}
class OctaveFuzz extends Drive { // full-wave rectification adds the octave up
  makeCh() { return { hp: new Biq(), dc: new Biq(), lp: new Biq() }; }
  update() { const p = this.p, fs = this.fs; this.g = 1 + p.fuzz * 20; this.curveGain = this.g; this.nrm = 1 / tanhF(this.g * REF); this.lvl = dbToLin(p.level || 0) * .32 * dcorr('octave', p.fuzz);
    for (const c of this.ch) { c.hp.set('hp', 150, .7, 0, fs); c.dc.set('hp', 40, .7, 0, fs); c.lp.set('lp', 5000, .7, 0, fs); } }
  nl(v, oc) { const f = tanhF(v); return f * (1 - oc) + (Math.abs(f) * 2 - .6) * oc; }
  one(x, k) { const c = this.ch[k], g = this.g, oc = this.p.octave, h = c.hp.run(x);
    const os = this.os[k]; os.up(h); const y = os.down(this.nl(os.a * g, oc), this.nl(os.b * g, oc));
    return c.lp.run(c.dc.run(y)) * this.nrm * this.lvl; }
}
class Crusher extends Pedal {
  init() { this.cnt = 0; this.hl = 0; this.hr = 0; }
  run(l, r) { const p = this.p, step = Math.pow(2, (p.bits || 8) - 1);
    if (++this.cnt >= (p.down || 1)) { this.cnt = 0; this.hl = Math.round(l * step) / step; this.hr = Math.round(r * step) / step; }
    const m = p.mix ?? 1; this.l = l * (1 - m) + this.hl * m; this.r = r * (1 - m) + this.hr * m; }
}
class Phaser extends Pedal {
  init() { this.ph = 0; this.st = [new Float64Array(24), new Float64Array(24)]; this.fb = [0, 0]; }
  block(n) { const p = this.p, rate = this.o.sync && this.o.sync !== 'free' ? this.rack.tempo / 60 / divBeats(this.o.sync) : p.rate;
    this.ph = (this.ph + rate * n / this.fs) % 1; this.v.ph = this.ph;
    const sweep = k => { const lfo = (Math.sin(2 * Math.PI * (this.ph + k * .25)) + 1) / 2; return p.center * Math.pow(2, (lfo - .5) * p.depth * 5); };
    this.fq = [sweep(0), sweep(1)]; this.v.f = this.fq[0];
    this.a = this.fq.map(f => { const t = Math.tan(Math.PI * Math.min(f, this.fs * .45) / this.fs); return (t - 1) / (t + 1); }); }
  one(x, k) { const n = +this.o.stages || 6, s = this.st[k], a = this.a ? this.a[k] : 0; let y = x + this.fb[k] * this.p.fb;
    for (let i = 0; i < n; i++) { const o = a * y + s[i]; s[i] = fz(y - a * o); y = o; }
    this.fb[k] = y; const m = this.p.mix; return (x * (1 - m * .5) + y * m * .5) * (1 + m * .3); } // equal blend at 100% = deepest notches
  run(l, r) { this.l = this.one(l, 0); this.r = this.one(r, 1); }
}
class Rotary extends Pedal { // horn and drum spin at their own speeds and inertia
  init() { this.hp = 0; this.dp = 0; this.hs = .8; this.ds = .66; this.x = new Biq(); this.xh = new Biq(); this.dh = new DL(2048); this.dd = new DL(2048); }
  update() { const fs = this.fs; this.x.set('lp', 800, .7, 0, fs); this.xh.set('hp', 800, .7, 0, fs); }
  block(n) { const fast = this.o.fast, dt = n / this.fs, sp = Math.PI * (this.p.spread ?? .6);
    this.hs += ((fast ? 6.8 : .8) - this.hs) * Math.min(1, dt / .7); this.ds += ((fast ? 5.9 : .66) - this.ds) * Math.min(1, dt / 3);
    const h0 = 2 * Math.PI * this.hp, d0 = 2 * Math.PI * this.dp;
    this.hp = (this.hp + this.hs * dt) % 1; this.dp = (this.dp + this.ds * dt) % 1; this.v.hp = this.hp; this.v.dp = this.dp; this.v.fast = fast;
    let h1 = 2 * Math.PI * this.hp, d1 = 2 * Math.PI * this.dp; if (h1 < h0) h1 += 2 * Math.PI; if (d1 < d0) d1 += 2 * Math.PI;
    // [sin, cos] for left and right mic at block start, and per-sample step (angles change little within 128 samples)
    const tr = (a0, a1) => [Math.sin(a0), Math.cos(a0), (Math.sin(a1) - Math.sin(a0)) / n, (Math.cos(a1) - Math.cos(a0)) / n];
    this.HL = tr(h0, h1); this.HR = tr(h0 + sp, h1 + sp); this.DLr = tr(d0, d1); this.DRr = tr(d0 + sp, d1 + sp); this.j = 0; }
  run(l, r) { const p = this.p, fs = this.fs; let x = (l + r) * .5; if (p.drive > .01) x = Math.tanh(x * (1 + p.drive * 6)) / (1 + p.drive * 2);
    const lo = this.x.run(x), hi = this.xh.run(x);
    if (!this.HL) this.block(128);
    const j = this.j++, HL = this.HL, HR = this.HR, DL_ = this.DLr, DR = this.DRr;
    this.dh.put(hi); this.dd.put(lo);
    const hl = this.dh.get(fs * (.0012 + .00035 * (HL[0] + HL[2] * j))) * (1 - .45 * (HL[1] + HL[3] * j)), hr = this.dh.get(fs * (.0012 + .00035 * (HR[0] + HR[2] * j))) * (1 - .45 * (HR[1] + HR[3] * j));
    const dl = this.dd.get(fs * (.002 + .0002 * (DL_[0] + DL_[2] * j))) * (1 - .3 * (DL_[1] + DL_[3] * j)), dr = this.dd.get(fs * (.002 + .0002 * (DR[0] + DR[2] * j))) * (1 - .3 * (DR[1] + DR[3] * j));
    const bal = p.balance; this.l = (hl * bal + dl * (1 - bal)) * 1.4; this.r = (hr * bal + dr * (1 - bal)) * 1.4; }
}
class Gate extends Pedal {
  init() { this.env = 0; this.g = 1; }
  update() { this.rt = 1 - Math.exp(-1 / ((this.p.release || 80) * .001 * this.fs)); this.at = 1 - Math.exp(-1 / (.0005 * this.fs)); }
  run(l, r) { const a = Math.max(Math.abs(l), Math.abs(r)); this.env += (a - this.env) * (a > this.env ? .2 : .002);
    const th = dbToLin(this.p.thresh), open = this.env > th || (this.g > .5 && this.env > th * .5);
    const tgt = open ? 1 : dbToLin(-this.p.range); this.g += (tgt - this.g) * (tgt > this.g ? this.at : this.rt);
    this.l = l * this.g; this.r = r * this.g; this.v.open = this.g; }
}
const GEQ_F = [100, 200, 400, 800, 1600, 3200, 6400];
class GEQ extends Pedal {
  init() { this.b = [0, 1].map(() => GEQ_F.map(() => new Biq())); }
  update() { const p = this.p; for (const ch of this.b) ch.forEach((q, i) => q.set('peak', GEQ_F[i], 1.1, p['b' + i] || 0, this.fs)); this.lv = dbToLin(p.level || 0); }
  run(l, r) { for (const q of this.b[0]) l = q.run(l); for (const q of this.b[1]) r = q.run(r); this.l = l * this.lv; this.r = r * this.lv; }
}
class DelayPedal extends Pedal { // tape/analog style: darkening repeats, wow, optional ping-pong
  init() { const n = Math.ceil(this.fs * 2.2); this.d = [new DL(n), new DL(n)]; this.t = this.fs * .35; this.lp = [new Biq(), new Biq()]; this.hp = [new Biq(), new Biq()]; this.wph = 0; }
  update() { for (let k = 0; k < 2; k++) { this.lp[k].set('lp', this.p.tone, .7, 0, this.fs); this.hp[k].set('hp', 90, .7, 0, this.fs); } }
  block(n) { const p = this.p, sy = this.o.sync; const sec = sy && sy !== 'free' ? divBeats(sy) * 60 / this.rack.tempo : p.time / 1000;
    this.tt = Math.min(2.1, Math.max(.01, sec)) * this.fs; this.wph += n / this.fs * .9; this.v.time = sec; this.v.fb = p.fb; }
  run(l, r) { this.t += (this.tt - this.t) * .0005; const p = this.p, w = 1 + Math.sin(2 * Math.PI * this.wph) * p.wow * .004 + Math.sin(2 * Math.PI * this.wph * 3.7) * p.wow * .0015;
    const yl = this.d[0].get(this.t * w), yr = this.d[1].get(this.t * w * (this.o.pp ? 1 : 1.0007));
    const fl = this.hp[0].run(this.lp[0].run(yl)) * p.fb, fr = this.hp[1].run(this.lp[1].run(yr)) * p.fb;
    if (this.o.pp) { this.d[0].put(tanhF((l + r) * .5 + fr)); this.d[1].put(tanhF(fl)); }
    else { this.d[0].put(tanhF(l + fl)); this.d[1].put(tanhF(r + fr)); }
    this.l = l + (yl - 0) * p.mix; this.r = r + yr * p.mix; }
}
class Spring extends Pedal { // two springs per side: dispersive all-passes inside a feedback delay give the "drip"
  init() { const fs = this.fs; this.s = [0, 1].map(k => [0, 1].map(j => ({ d: new DL(Math.ceil(fs * .08)), ap: new Float64Array(12), lp: new Biq(), len: fs * (j ? .0413 : .0337) * (k ? 1.07 : 1) })));
    this.hp = [new Biq(), new Biq()]; }
  update() { for (const ch of this.s) for (const sp of ch) sp.lp.set('lp', this.p.tone, .7, 0, this.fs); for (const h of this.hp) h.set('hp', 180, .7, 0, this.fs); }
  one(x, k) { const p = this.p, a = .62, fb = .55 + p.decay * .42; let out = 0; const inp = this.hp[k].run(x) * .5;
    for (const sp of this.s[k]) { let y = sp.d.get(sp.len);
      for (let i = 0; i < 12; i++) { const o = a * y + sp.ap[i]; sp.ap[i] = fz(y - a * o); y = o; }
      y = sp.lp.run(y); sp.d.put(inp + y * fb); out += y; }
    return x + out * p.mix * .8; }
  run(l, r) { this.l = this.one(l, 0); this.r = this.one(r, 1); }
}
const FV_C = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], FV_A = [556, 441, 341, 225];
class Hall extends Pedal { // Freeverb-style hall with pre-delay
  init() { const k = this.fs / 44100; this.c = [0, 1].map(ch => FV_C.map(n => ({ b: new Float32Array(Math.round((n + ch * 23) * k * 1.3)), i: 0, f: 0 })));
    this.a = [0, 1].map(ch => FV_A.map(n => ({ b: new Float32Array(Math.round((n + ch * 23) * k)), i: 0 }))); this.pd = new DL(Math.ceil(this.fs * .25)); this.fl = 0; }
  update() { for (const ch of this.c) for (const c of ch) { c.n = Math.max(8, Math.round(c.b.length * (.55 + (this.p.size ?? .7) * .45))); if (c.i >= c.n) c.i = 0; } }
  run(l, r) { const p = this.p, fb = .7 + p.size * .28, damp = p.damp * .6, ud = 1 - damp;
    this.pd.put((l + r) * .5); const x = this.pd.get(p.pre * .001 * this.fs) * .1; const o = this.o2 || (this.o2 = [0, 0]);
    for (let ch = 0; ch < 2; ch++) { let s = 0; const cs = this.c[ch];
      for (let j = 0; j < 8; j++) { const c = cs[j], y = c.b[c.i]; c.f = y * ud + c.f * damp; c.b[c.i] = x + c.f * fb; if (++c.i >= c.n) c.i = 0; s += y; }
      const as = this.a[ch]; for (let j = 0; j < 4; j++) { const a = as[j], y = a.b[a.i]; a.b[a.i] = s + y * .5; if (++a.i >= a.b.length) a.i = 0; s = y - s; }
      o[ch] = fz(s); }
    const w = p.width, wl = o[0] * (.5 + w / 2) + o[1] * (.5 - w / 2), wr = o[1] * (.5 + w / 2) + o[0] * (.5 - w / 2);
    this.l = l * (1 - p.mix * .5) + wl * p.mix * .8; this.r = r * (1 - p.mix * .5) + wr * p.mix * .8;
    if (++this.fl >= 4096) { this.fl = 0; for (const ch of this.c) for (const c of ch) if (Math.abs(c.f) < 1e-15) c.f = 0; } }
}
const PEDAL_CLASSES = { comp: Comp, boost: Boost, od: Overdrive, dist: Distortion, fuzz: Fuzz, octave: OctaveFuzz, crush: Crusher, phaser: Phaser, rotary: Rotary, gate: Gate, geq: GEQ, delay: DelayPedal, spring: Spring, hall: Hall };

class AmpHead {
  constructor(fs) { this.fs = fs; this.os = [new OS2(fs), new OS2(fs)]; this.h = {};
    this.inHP = [new Biq(), new Biq()]; this.stage = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ hp: new Biq(), lp: new Biq() })));
    this.tone = [[], []]; this.sag = 0; this.pkIn = 0; this.pkOut = 0; this.v = {}; }
  set(h) {
    this.h = h; const fs = this.fs, f2 = fs * 2;
    for (let k = 0; k < 2; k++) { this.inHP[k].set('hp', h.tight, .7, 0, fs); for (const s of this.stage[k]) { s.hp.set('hp', 25 + h.tight * .3, .7, 0, f2); s.lp.set('lp', 7500 - h.gain * 250, .7, 0, f2); }
      const d = toneStackDesign(h), old = this.tone[k]; this.tone[k] = d.map((f, i) => (old[i] || new Biq()).set(f[0], f[1], f[2], f[3], fs)); }
    this.G = .5 * Math.pow(10, h.gain / 10 * 2.3); this.n = Math.max(1, Math.min(4, Math.round(h.stages))); this.gs = Math.pow(this.G, 1 / this.n) * (this.n > 1 ? 1.25 : 1);
    this.bias = h.bias * .35; this.ch = h.character; this.b0 = (1 - this.ch) * tanhF(this.bias) + this.ch * hardClip(this.bias * 1.2);
    { let v = REF; for (let i = 0; i < this.n; i++) v = this.clip(v * this.gs); this.comp = .45 / Math.max(.02, Math.abs(v)); this.post = dcorr('amp', h.gain / 10); } // more gain = more grit, not more volume
    this.sagA = 1 - Math.exp(-1 / (.02 * fs)); this.sagR = 1 - Math.exp(-1 / (.25 * fs)); this.mv = Math.pow(h.master / 10, 1.5) * 1.8;
  }
  clip(v) { v += this.bias; return (1 - this.ch) * tanhF(v) + this.ch * hardClip(v * 1.2) - this.b0; }
  pre(v) { const st = this.stage[0], n = this.n, gs = this.gs; for (let i = 0; i < n; i++) { v = this.clip(st[i].hp.run(v) * gs); v = st[i].lp.run(v); } return v; }
  one(x, k) {
    const h = this.h;
    x = this.inHP[k].run(x);
    const os = this.os[k]; os.up(x); let y = os.down(this.pre(os.a), this.pre(os.b)) // both 2× samples, in order, through the same stages * this.comp;
    for (const t of this.tone[k]) y = t.run(y);
    const sg = 1 - h.sag * .55 * Math.min(1, this.sag * 1.5); // power-supply sag: loud playing squashes the output
    const pd = (1 + h.pdrive * 5) * .8; y = tanhF(y * sg * pd) / tanhF(.45 * pd) * .45 * this.post; // power amp: same level at any drive setting
    return y * this.mv;
  }
  run(l, r) { const x = (l + r) * .5, a = x < 0 ? -x : x; if (a > this.pkIn) this.pkIn = a; // a guitar amp is mono
    const y = this.one(x, 0); this.l = this.r = y; const o = y < 0 ? -y : y;
    this.sag += (o - this.sag) * (o > this.sag ? this.sagA : this.sagR); if (o > this.pkOut) this.pkOut = o; }
  block() { this.v = { in: this.pkIn, out: this.pkOut, sag: this.sag }; this.pkIn *= .9; this.pkOut *= .9; }
}
class Cab {
  constructor(fs) { this.fs = fs; this.f = [[], []]; this.room = [new DL(Math.ceil(fs * .02)), new DL(Math.ceil(fs * .02))]; this.rlp = [new Biq(), new Biq()]; this.c = {}; }
  set(c) { this.c = c; const d = cabDesign(c); for (let k = 0; k < 2; k++) { const old = this.f[k]; this.f[k] = d.map((f, i) => (old[i] || new Biq()).set(f[0], f[1], f[2], f[3], this.fs)); this.rlp[k].set('lp', 3000, .7, 0, this.fs); }
    this.rd = [this.fs * (.0035 + c.dist * .009), this.fs * (.0047 + c.dist * .011)]; this.rm = c.dist * .45; }
  one(x, k) { for (const f of this.f[k]) x = f.run(x); this.room[k].put(x); return x + this.rlp[k].run(this.room[k].get(this.rd[k])) * this.rm; }
  run(l, r) { this.l = this.r = this.one((l + r) * .5, 0); }
}
class AmpRack {
  constructor(fs) { this.fs = fs; this.tempo = 120; this.inst = new Map(); this.pre = []; this.post = []; this.head = new AmpHead(fs); this.cab = new Cab(fs); this.on = false; this.cabOn = true; this.out = 1; this.trim = 1; this.xf = 1 - Math.exp(-1 / (.01 * fs)); }
  set(a) {
    const mk = d => { let p = this.inst.get(d.uid); if (!p || p.type !== d.type) { p = new (PEDAL_CLASSES[d.type])(this.fs, this); p.type = d.type; this.inst.set(d.uid, p); } p.on = d.on; p.setP(d.p, d.o); return p; };
    this.pre = (a.pre || []).filter(d => PEDAL_CLASSES[d.type]).map(mk); this.post = (a.post || []).filter(d => PEDAL_CLASSES[d.type]).map(mk);
    const keep = new Set([...this.pre, ...this.post]); for (const [u, p] of this.inst) if (!keep.has(p)) this.inst.delete(u);
    this.on = !!a.on; this.cabOn = a.cab && a.cab.on !== false; if (a.head) this.head.set(a.head); if (a.cab) this.cab.set(a.cab); this.out = dbToLin(a.out || 0); this.trim = dbToLin(a.trim || 0); // trim = the amp preset's level match, only while the amp is on
  }
  block(n) { for (const p of this.pre) p.block(n); for (const p of this.post) p.block(n); if (this.on) this.head.block(); }
  chain(list, l, r) {
    for (const p of list) { const tgt = p.on ? 1 : 0; p.mix += (tgt - p.mix) * this.xf; if (p.mix < 1e-4 && !p.on) { p.mix = 0; continue; }
      p.run(l, r); const m = p.mix; l = l + (p.l - l) * m; r = r + (p.r - r) * m; }
    this.l = l; this.r = r;
  }
  run(l, r) {
    this.chain(this.pre, l, r); l = this.l; r = this.r;
    if (this.on) { this.head.run(l, r); l = this.head.l * this.trim; r = this.head.r * this.trim; if (this.cabOn) { this.cab.run(l, r); l = this.cab.l; r = this.cab.r; } }
    this.chain(this.post, l, r); this.l = this.l * this.out; this.r = this.r * this.out;
  }
  viz() { const pd = {}; for (const [u, p] of this.inst) { pd[u] = { ...p.v, mix: p.mix }; if (p.v.gr !== undefined) p.v.gr = 0; } return { pd, head: this.head.v }; }
}
