/* Luither — synth face DSP: modulation sources, oscillator mix, filters, mod FX, pitch shifter, gate, amp. */
const TWO_PI = Math.PI * 2;
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]]; // a e i o u
const PHYS = { ph_pos: ['ex', 'pos'], ph_pressure: ['ex', 'pressure'], ph_speed: ['ex', 'speed'], ph_ebow: ['ex', 'ebow'], ph_wind: ['ex', 'wind'], ph_jawari: ['nk', 'jawari'], ph_buzz: ['nk', 'buzz'] };

const fz = x => (x > 1e-15 || x < -1e-15) ? x : 0; // flush tiny values: keeps decaying tails from hitting slow denormal maths
function divBeats(d) { const m = /^(\d+)\/(\d+)([.t]?)$/.exec(String(d)); if (!m) return 1; return 4 * m[1] / m[2] * (m[3] === '.' ? 1.5 : m[3] === 't' ? 2 / 3 : 1); }
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// Shape 0 → 1 morphs sine → triangle → saw → square
function oscWave(ph, dt, m) {
  const sine = Math.sin(TWO_PI * ph);
  if (m <= 0.001) return sine;
  const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
  if (m < 1 / 3) { const k = m * 3; return sine + (tri - sine) * k; }
  let saw = 2 * ph - 1 - polyblep(ph, dt);
  if (m < 2 / 3) { const k = (m - 1 / 3) * 3; return tri + (saw - tri) * k; }
  let sq = (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep((ph + 0.5) % 1, dt);
  const k = Math.min(1, (m - 2 / 3) * 3); return saw + (sq * 0.8 - saw) * k;
}

class SVF {
  constructor() { this.a = 0; this.b = 0; }
  // returns [lp, bp, hp] via fields to avoid allocation
  run(x, g, k) {
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b, v1 = a1 * this.a + a2 * v3, v2 = this.b + a2 * this.a + a3 * v3;
    this.a = fz(2 * v1 - this.a); this.b = fz(2 * v2 - this.b);
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2;
    if (!(this.a < 1e6 && this.a > -1e6)) { this.a = 0; this.b = 0; }
  }
}

class Filter {
  constructor() { this.s = [new SVF(), new SVF()]; this.fm = [[new SVF(), new SVF(), new SVF()], [new SVF(), new SVF(), new SVF()]]; this.g0 = 0.1; }
  process(x, ch, g, k, type, drive, vowelF, mix) {
    let y = x;
    if (drive > 0.001) y = Math.tanh(y * (1 + drive * 6)) / (1 + drive * 1.5);
    if (type === 'formant') {
      const f = this.fm[ch]; let o = 0;
      for (let j = 0; j < 3; j++) { f[j].run(y, vowelF[j], 0.12); o += f[j].bp * 0.12 * (j === 0 ? 1.6 : j === 1 ? 1.1 : 0.7); }
      y = o * 2.2;
    } else {
      const s = this.s[ch]; s.run(y, g, k);
      switch (type) {
        case 'lp': y = s.lp; break;
        case 'hp': y = s.hp; break;
        case 'bp': y = s.bp * k * (1 + 3 / (k + 0.3)) * 0.55; break;
        case 'notch': y = y - k * s.bp; break;
        case 'peak': y = s.lp - s.hp; break;
      }
    }
    return x + (y - x) * mix;
  }
}

class Synth {
  constructor(E) {
    this.E = E; this.fs = E.fs;
    this.p = {}; this.o = {}; this.def = {}; this.mods = []; this.eff = {}; this.modTargets = new Set(); this.physActive = false;
    this.src = { lfo1: 0, lfo2: 0, env1: 0, env2: 0, fol: 0, vel: 0, note: 0, mw: 0, rnd: 0, energy: 0, gate: 0 };
    this.lfo = [{ ph: 0, v: 0, sh: 0, tgt: 0, sm: 0 }, { ph: 0.25, v: 0, sh: 0, tgt: 0, sm: 0 }];
    this.env = [{ v: 0, st: 0 }, { v: 0, st: 0 }];
    this.folV = 0; this.nHeld = 0;
    this.f1 = new Filter(); this.f2 = new Filter();
    this.g = [0, 0]; this.gPrev = [0, 0]; this.vf = [[0, 0, 0], [0, 0, 0]];
    this.md = [new Float32Array(16384), new Float32Array(16384)]; this.mdw = 0; this.mdPh = 0; this.mdT = 3; this.mdTPrev = 3;
    this.ps = [new Float32Array(16384), new Float32Array(16384)]; this.psw = 0; this.psPh = 0;
    this.gatePh = 0; this.gateStep = 0; this.gateEnv = 1; this.ampPrev = 1;
    this.oscOn = false; this.oscMul = 1; this.oscLvl = 0; this.oscShape = 0;
  }
  setDefs(d) { this.def = d; }
  set(d) {
    if (d.p) Object.assign(this.p, d.p);
    if (d.o) Object.assign(this.o, d.o);
    if (d.mods) {
      this.mods = d.mods.filter(m => this.def[m.d]);
      this.modTargets = new Set(this.mods.map(m => m.d));
      const wasPhys = this.physActive;
      this.physActive = this.mods.some(m => PHYS[m.d]);
      if (wasPhys && !this.physActive) { Object.assign(this.E.ex, this.E.exBase); Object.assign(this.E.nk, this.E.nkBase); this.E.derive(); }
    }
  }
  toN(id, v) { const d = this.def[id]; if (!d) return 0; return d.log ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min); }
  fromN(id, n) { const d = this.def[id]; n = n < 0 ? 0 : n > 1 ? 1 : n; return d.log ? d.min * Math.pow(d.max / d.min, n) : d.min + (d.max - d.min) * n; }
  base(id) { const ph = PHYS[id]; if (ph) return (ph[0] === 'ex' ? this.E.exBase : this.E.nkBase)[ph[1]]; return this.p[id]; }
  noteOn(n, v, fromSilence) {
    this.src.vel = v; this.src.note = Math.max(0, Math.min(1, (n - 24) / 72)); this.src.rnd = Math.random();
    this.nHeld++;
    for (const e of this.env) e.st = 1; // attack (retrigger from current level)
    for (let i = 0; i < 2; i++) if (this.o['lfo' + (i + 1) + '_retrig']) this.lfo[i].ph = i * 0.25;
    if (fromSilence) { this.gatePh = 0; this.gateStep = 0; }
  }
  allOff() { this.nHeld = 0; for (const e of this.env) if (e.st) e.st = 4; }
  block(n) {
    const fs = this.fs, p = this.p, o = this.o, src = this.src, dt = n / fs;
    const bpm = (this.modTargets.has('tempo') ? this.eff.tempo : p.tempo) || 120;
    // LFOs
    for (let i = 0; i < 2; i++) {
      const L = this.lfo[i], k = 'lfo' + (i + 1), sh = o[k + '_shape'] || 'sine', sy = o[k + '_sync'];
      const rate = sy && sy !== 'free' ? bpm / 60 / divBeats(sy) : (this.modTargets.has(k + '_rate') ? this.eff[k + '_rate'] : p[k + '_rate']) || 1;
      L.ph += rate * dt; let wrapped = false; if (L.ph >= 1) { L.ph -= Math.floor(L.ph); wrapped = true; }
      const ph = L.ph; let v;
      switch (sh) {
        case 'tri': v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
        case 'saw': v = 2 * ph - 1; break;
        case 'ramp': v = 1 - 2 * ph; break;
        case 'square': v = ph < 0.5 ? 1 : -1; break;
        case 'sh': if (wrapped) L.sh = Math.random() * 2 - 1; v = L.sh; break;
        case 'smooth': if (wrapped) L.tgt = Math.random() * 2 - 1; L.sm += (L.tgt - L.sm) * Math.min(1, rate * dt * 4); v = L.sm; break;
        default: v = Math.sin(TWO_PI * ph);
      }
      L.v = v; src[k] = v;
    }
    // envelopes: 1 attack, 2 decay, 3 sustain, 4 release, 0 idle
    for (let i = 0; i < 2; i++) {
      const e = this.env[i], k = 'env' + (i + 1), A = p[k + '_a'] || .01, D = p[k + '_d'] || .3, S = p[k + '_s'] ?? .6, R = p[k + '_r'] || .4;
      if (e.st === 1) { e.v += dt / A; if (e.v >= 1) { e.v = 1; e.st = 2; } }
      else if (e.st === 2) { e.v += (S - e.v) * (1 - Math.exp(-dt * 4 / D)); if (Math.abs(e.v - S) < 1e-3) e.st = 3; }
      else if (e.st === 3) e.v = S;
      else if (e.st === 4) { e.v *= Math.exp(-dt * 4.6 / R); if (e.v < 1e-4) { e.v = 0; e.st = 0; } }
      src[k] = e.v;
    }
    // follower in dB, so quiet plucks and loud bowing both sweep a useful range: -36 dB → 0, 0 dB → 1 (Sensitivity shifts it ±12 dB)
    { const fdb = 20 * Math.log10(this.folV + 1e-9); src.fol = Math.max(0, Math.min(1, (fdb + 36 + ((p.fol_gain ?? .5) - .5) * 24) / 36)); }
    let en = 0; for (const s of this.E.S) if (s.role !== 'symp') en += s.env; src.energy = Math.min(1, en * 4);
    src.gate = (o.gate_steps || [])[this.gateStep] ? 1 : 0;
    // modulation
    const eff = this.eff;
    for (const id of this.modTargets) {
      let nv = this.toN(id, this.base(id));
      for (const m of this.mods) if (m.d === id) nv += m.a * (src[m.s] || 0);
      eff[id] = this.fromN(id, nv); eff['n_' + id] = Math.max(0, Math.min(1, nv));
    }
    if (this.physActive) {
      const E = this.E;
      for (const id in PHYS) { const [sec, key] = PHYS[id]; E[sec][key] = this.modTargets.has(id) ? eff[id] : (sec === 'ex' ? E.exBase : E.nkBase)[key]; }
      E.derive();
    }
    // per-block coefficients
    const V = id => this.modTargets.has(id) ? eff[id] : p[id];
    this.oscLvlP = this.oscLvl; this.oscLvl = V('osc_lvl') || 0; this.oscOn = this.oscLvl > 0.001 || this.oscLvlP > 0.001;
    this.oscShape = V('osc_shape') ?? 0.66; this.oscMul = Math.pow(2, ((V('osc_semi') || 0) + (V('osc_fine') || 0) / 100) / 12);
    this.srcLvlP = this.srcLvl ?? 1; this.srcLvl = V('src_lvl') ?? 1;
    for (let f = 0; f < 2; f++) {
      const pre = f ? 'f2_' : 'f1_';
      this.gPrev[f] = this.g[f];
      const cut = Math.min(fs * 0.45, V(pre + 'cut') || 1000);
      this.g[f] = Math.tan(Math.PI * cut / fs);
      this['k' + f] = 2 - 1.96 * Math.min(1, V(pre + 'res') ?? 0.1);
      this['drv' + f] = V(pre + 'drive') || 0; this['mix' + f] = V(pre + 'mix') ?? 1;
      if (o[pre + 'type'] === 'formant') {
        const vw = (V(pre + 'vowel') || 0) * 4, i0 = Math.min(3, Math.floor(vw)), fr = vw - i0, sc = Math.max(0.5, Math.min(2, cut / 1000));
        for (let j = 0; j < 3; j++) { const F = (VOWELS[i0][j] + (VOWELS[i0 + 1][j] - VOWELS[i0][j]) * fr) * sc; this.vf[f][j] = Math.tan(Math.PI * Math.min(fs * 0.45, F) / fs); }
      }
    }
    this.mdTPrev = this.mdT; this.mdT = V('mfx_time') || 3;
    this.mdDepth = V('mfx_depth') || 0; this.mdRate = o.mfx_sync && o.mfx_sync !== 'free' ? bpm / 60 / divBeats(o.mfx_sync) : V('mfx_rate') || 0.5; this.mdFb = V('mfx_fb') || 0; this.mdMixP = this.mdMix ?? 0.5; this.mdMix = V('mfx_mix') ?? 0.5; this.mdSpread = V('mfx_spread') ?? 0.5;
    this.psRatio = Math.pow(2, ((V('ps_semi') || 0) + (V('ps_fine') || 0) / 100) / 12); this.psMixP = this.psMix ?? 0; this.psMix = V('ps_mix') || 0; this.psFb = V('ps_fb') || 0;
    this.ampPrevBlk = this.ampNow ?? 1; this.ampNow = V('amp_lvl') ?? 1; this.pan = V('amp_pan') || 0;
    this.gDepth = V('gate_depth') ?? 1; this.gSmooth = 1 - Math.exp(-1 / ((V('gate_smooth') || 6) * 0.001 * fs));
    const gd = typeof o.gate_div === 'number' ? '1/' + o.gate_div : (o.gate_div || '1/16');
    this.stepLen = divBeats(gd) * 60 / (V('tempo') || 120) * fs;
    this.folA = 1 - Math.exp(-1 / ((p.fol_atk || .005) * fs)); this.folR = 1 - Math.exp(-1 / ((p.fol_rel || .15) * fs));
  }
  // one stereo sample through the chain; returns via this.l / this.r
  run(l, r, oscSum, ringSum, i, n) {
    const o = this.o, t = (i + 1) / n;
    // source mix: pickup and oscillator
    const sl = this.srcLvlP + (this.srcLvl - this.srcLvlP) * t; l *= sl; r *= sl;
    if (this.oscOn) {
      const lv = this.oscLvlP + (this.oscLvl - this.oscLvlP) * t, mode = o.osc_mode || 'layer';
      if (mode === 'layer') { l += oscSum * lv; r += oscSum * lv; }
      else if (mode === 'morph') { l = l * (1 - lv) + oscSum * lv; r = r * (1 - lv) + oscSum * lv; }
      else { l = l * (1 - lv) + ringSum * lv; r = r * (1 - lv) + ringSum * lv; }
    }
    // envelope follower (after the source mix, before effects)
    const a = Math.abs(l + r) * 0.5; this.folV += (a - this.folV) * (a > this.folV ? this.folA : this.folR);
    // filters
    const f1on = o.f1_on, f2on = o.f2_on;
    if (f1on || f2on) {
      const g1 = this.gPrev[0] + (this.g[0] - this.gPrev[0]) * t, g2 = this.gPrev[1] + (this.g[1] - this.gPrev[1]) * t;
      if (o.f_route === 'parallel' && f1on && f2on) { // two filters side by side, each Mix knob sets how much of it you hear
        const m0 = this.mix0, m1 = this.mix1, dry = Math.max(0, 1 - m0 - m1);
        const al = this.f1.process(l, 0, g1, this.k0, o.f1_type, this.drv0, this.vf[0], 1), ar = this.f1.process(r, 1, g1, this.k0, o.f1_type, this.drv0, this.vf[0], 1);
        const bl = this.f2.process(l, 0, g2, this.k1, o.f2_type, this.drv1, this.vf[1], 1), br = this.f2.process(r, 1, g2, this.k1, o.f2_type, this.drv1, this.vf[1], 1);
        l = al * m0 + bl * m1 + l * dry; r = ar * m0 + br * m1 + r * dry;
      } else {
        if (f1on) { l = this.f1.process(l, 0, g1, this.k0, o.f1_type, this.drv0, this.vf[0], this.mix0); r = this.f1.process(r, 1, g1, this.k0, o.f1_type, this.drv0, this.vf[0], this.mix0); }
        if (f2on) { l = this.f2.process(l, 0, g2, this.k1, o.f2_type, this.drv1, this.vf[1], this.mix1); r = this.f2.process(r, 1, g2, this.k1, o.f2_type, this.drv1, this.vf[1], this.mix1); }
      }
    }
    // modulated delay: chorus / flanger / vibrato
    if (o.mfx_on) {
      const fs = this.fs, md = this.md, w = this.mdw;
      this.mdPh += this.mdRate / fs; if (this.mdPh >= 1) this.mdPh -= 1;
      const T = (this.mdTPrev + (this.mdT - this.mdTPrev) * t) * 0.001 * fs, dep = this.mdDepth * 0.95;
      const tl = Math.max(1.5, T * (1 + dep * Math.sin(TWO_PI * this.mdPh)));
      const tr = Math.max(1.5, T * (1 + dep * Math.sin(TWO_PI * (this.mdPh + this.mdSpread * 0.25))));
      const rd = (buf, d) => { const rp = w - d, i0 = Math.floor(rp), f = rp - i0; const x0 = buf[i0 & 16383], x1 = buf[(i0 + 1) & 16383]; return x0 + (x1 - x0) * f; };
      const yl = rd(md[0], tl), yr = rd(md[1], tr);
      md[0][w] = fz(l + yl * this.mdFb); md[1][w] = fz(r + yr * this.mdFb); this.mdw = (w + 1) & 16383;
      const mm = this.mdMixP + (this.mdMix - this.mdMixP) * t; l = l * (1 - mm) + yl * mm; r = r * (1 - mm) + yr * mm;
    }
    // two-grain pitch shifter
    if (o.ps_on && (this.psMix > 0.001 || this.psMixP > 0.001)) {
      const win = 0.06 * this.fs, ps = this.ps, w = this.psw;
      this.psPh += (1 - this.psRatio) / win; this.psPh -= Math.floor(this.psPh);
      const p1 = this.psPh, p2 = (p1 + 0.5) % 1, w1 = Math.sin(Math.PI * p1) ** 2, w2 = Math.sin(Math.PI * p2) ** 2;
      const rd = (buf, d) => { const rp = w - d, i0 = Math.floor(rp), f = rp - i0; const x0 = buf[i0 & 16383], x1 = buf[(i0 + 1) & 16383]; return x0 + (x1 - x0) * f; };
      const d1 = 2 + p1 * win, d2 = 2 + p2 * win;
      const yl = rd(ps[0], d1) * w1 + rd(ps[0], d2) * w2, yr = rd(ps[1], d1) * w1 + rd(ps[1], d2) * w2;
      ps[0][w] = fz(l + yl * this.psFb); ps[1][w] = fz(r + yr * this.psFb); this.psw = (w + 1) & 16383;
      const pm = this.psMixP + (this.psMix - this.psMixP) * t, dry = 1 - Math.max(0, pm * 2 - 1), wet = Math.min(1, pm * 2); // up to 50%: adds the shifted copy; above: crossfades to it
      l = l * dry + yl * wet; r = r * dry + yr * wet;
    }
    // gate
    let gv = 1;
    if (o.gate_on) {
      if (++this.gatePh >= this.stepLen) { this.gatePh = 0; this.gateStep = (this.gateStep + 1) & 15; }
      const on = (o.gate_steps || [])[this.gateStep];
      this.gateEnv += ((on ? 1 : 1 - this.gDepth) - this.gateEnv) * this.gSmooth; gv = this.gateEnv;
    } else if (++this.gatePh >= this.stepLen) { this.gatePh = 0; this.gateStep = (this.gateStep + 1) & 15; }
    // amp + pan
    const amp = (this.ampPrevBlk + (this.ampNow - this.ampPrevBlk) * t) * gv;
    const pl = this.pan > 0 ? 1 - this.pan : 1, pr = this.pan < 0 ? 1 + this.pan : 1;
    this.l = l * amp * pl; this.r = r * amp * pr;
  }
  viz() {
    const mv = {}; for (const id of this.modTargets) mv[id] = this.eff['n_' + id];
    return { src: this.src, lfoPh: [this.lfo[0].ph, this.lfo[1].ph], step: this.gateStep, mv };
  }
}
