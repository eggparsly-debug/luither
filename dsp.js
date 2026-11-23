/* Luither — string engine (AudioWorklet). Waveguide strings + modal body. */
const DMAX = 8192, DM = DMAX - 1;
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
const CONT = { bow: 1, ebow: 1, wind: 1 };
const OSC_G = 0.3, RING_G = 0.5;
const SRR = sampleRate / 48000, SRK = 48000 / sampleRate; // keep the sound identical at 44.1 / 48 / 96 kHz
const GHOST = 20 / 127; // plucks softer than this are ghost notes
const TRIM = { pick: 3, finger: 9, hammer: 5, bow: 0.5, ebow: 2, wind: 0.5 };

class Delay {
  constructor() { this.b = new Float32Array(DMAX); this.w = 0; this.last = 0; }
  tick(x, len) {
    const rp = this.w - len, i = Math.floor(rp), f = rp - i;
    const a = this.b[i & DM], c = this.b[(i + 1) & DM];
    this.last = a + (c - a) * f;
    this.b[this.w] = x; this.w = (this.w + 1) & DM;
    return this.last;
  }
}

class Str {
  constructor(E) {
    this.E = E; this.neck = new Delay(); this.br = new Delay();
    this.hist = new Float32Array(DMAX); this.hw = 0; this.magD = 10;
    this.lp = 0; this.a1x = 0; this.a1y = 0; this.a2x = 0; this.a2y = 0;
    this.freq = 110; this.target = 110; this.gc = 1; this.note = 45; this.g = 0.99;
    this.stack = []; this.held = false; this.pend = false; this.lastUse = 0;
    this.pulse = null; this.pi = 0; this.cont = 0; this.contT = 0; this.bowDir = 1; this.bowAmp = 1;
    this.damp = 1; this.wantDamp = 0; this.env = 0; this.acc = 0; this.rms = 0; this.t = 0;
    this.vib = 1; this.vph = Math.random() * 6; this.drift = 0;
    this.b1 = 0; this.b2 = 0; this.bpA1 = 0; this.bpA2 = 0; this.bpG = 0;
    this.role = 'stopped'; this.open = 45; this.range = 12; this.mag = 0;
    this.awake = 0; this.oph = Math.random(); this.oenv = 0; this.cf = 110; this.bj = 0; this.harm = false; this.touch = 45; this.d = 0.2; this.apA = -0.2; this.comp = 1; this.tm = 0.05; this.decay = 5;
  }
  set(p) {
    const roleChanged = this.role !== p.role;
    this.role = p.role; this.open = p.note; this.range = p.range;
    const m = p.mat;
    let stiff = m.stiff * (0.4 + 1.6 * p.gauge * p.gauge); if (p.wound) stiff *= 0.35;
    this.apA = -0.75 * Math.min(1, stiff);
    this.decay = m.decay * (1.2 - 0.4 * p.gauge) * (p.role === 'symp' ? 1.4 : 1);
    this.d = Math.pow(Math.min(0.9, m.bright + 0.12 * p.gauge + (p.wound ? 0.08 : 0)), SRK); // same cutoff in Hz at any sample rate
    this.tm = (1 - p.tension) * 0.12;
    this.mag = m.magnetic;
    this.comp = 2 + this.d / (1 - this.d) + 2 * (1 - this.apA) / (1 + this.apA);
    if (!this.held || roleChanged) this.setNote(this.open, 0); else this.calcG();
  }
  calcG() { const f = this.target; const T60 = this.decay * Math.pow(110 / f, 0.4); this.g = Math.pow(10, -3 / (T60 * f)); }
  setNote(n, glide) {
    this.note = n; this.target = mtof(n);
    if (glide <= 0) { this.freq = this.target; this.gc = 1; }
    else this.gc = 1 - Math.exp(-1 / (glide * this.E.fs));
    this.calcG();
  }
  // amp = how much energy goes in; vel = how hard (harder strikes are also brighter); click = extra contact noise
  pluckPulse(v, vel = v, click = 0) {
    const ex = this.E.ex, type = ex.type;
    let L, noise = 0;
    if (type === 'pick') { L = 4 + Math.round((1 - ex.pickStiff) * 30); noise = 48; } // 0.1–0.7 ms contact, like a real pick
    else if (type === 'finger') L = 6 + Math.round(ex.fingerSoft * 70);
    else L = 2 + Math.round((1 - ex.hammerHard) * 30);
    L = Math.max(1, Math.round(L * (1.4 - 0.7 * Math.min(1, vel)) * SRR));
    if (click) noise = Math.max(noise, 90); noise = Math.round(noise * SRR);
    const arr = new Float32Array(L + noise), k = v * Math.PI / (2 * L) * SRR; // pulses are in per-sample velocity units
    for (let i = 0; i < L; i++) arr[i] = k * Math.sin(Math.PI * (i + 0.5) / L);
    for (let i = 0; i < noise; i++) arr[i] += (Math.random() - 0.5) * (v * 0.06 * ex.pickStiff + click) * (1 - i / noise);
    if (type === 'hammer') for (let i = 0; i < L; i++) arr[i] *= 1.4; // hammers hit hard
    this.pulse = arr; this.pi = 0;
  }
  excite(v) {
    if (CONT[this.E.ex.type]) {
      if (this.E.ex.bowChange && this.cont > 0.02) this.bowDir = -this.bowDir;
      else if (this.E.ex.bowChange) this.bowDir = -this.bowDir;
      this.contT = 1; this.bowAmp = 0.45 + 0.55 * v;
      if (this.E.ex.type === 'ebow' && this.env < 0.02) { const t = this.E.ex.type; this.E.ex.type = 'finger'; this.pluckPulse(0.25 * v); this.E.ex.type = t; }
    } else if (this.role === 'stopped' || this.role === 'open') {
      // above the ghost range, loudness rises gently from a solid floor instead of fading to nothing
      const k = Math.max(0, (v - GHOST) / (1 - GHOST));
      this.pluckPulse(0.22 + 0.78 * Math.pow(k, 0.85), v);
    } else this.pluckPulse(v);
  }
  // a pick or finger landing on a ringing string stops most of its motion first
  restrike() {
    if (this.env < 0.004) return;
    const t = this.E.ex.type, k = t === 'finger' ? 0.15 : t === 'hammer' ? 0.6 : 0.3;
    const a = this.neck.b, b = this.br.b;
    for (let i = 0; i < DMAX; i++) { a[i] *= k; b[i] *= k; }
    this.neck.last *= k; this.br.last *= k; this.lp *= k; this.env *= k;
  }
  // Ghost notes: a light fretting-hand touch. Heavier = dead thud; lighter = more ring;
  // light enough on a harmonic node (12th, 7th, 5th, 4th, 9th, 19th... fret) = natural harmonic.
  ghost(n, v, h) {
    const p = Math.max(0, Math.min(1, v / GHOST));
    this.restrike(); this.touch = n;
    if (h) { // finger rests on the node nearest the nut: 12th fret for h=2, 7th for 3, 5th for 4...
      this.touch = this.open - 12 * Math.log2(1 - 1 / h);
      const c = 1 - p / 0.6; // clarity of the harmonic
      this.harm = true; this.setNote(this.open + 12 * Math.log2(h), 0);
      this.damp = Math.pow(10, -3 / ((0.2 + 6 * c * c) * this.freq));
      this.pluckPulse(0.55 * (0.7 + 0.3 * c), 0.7, 0.01 * (1 - c));
    } else {
      this.setNote(n, 0);
      this.damp = Math.pow(10, -3 / ((0.02 + 0.16 * (1 - p) * (1 - p)) * this.freq));
      this.pluckPulse(0.42, 0.5, 0.03);
    }
  }
  start(n, v, h = 0) {
    this.idle = false; this.wake();
    this.lastUse = this.E.clock; this.held = true; this.pend = false;
    this.damp = 1; this.wantDamp = 0; this.t = 0; this.harm = false; this.touch = n;
    const type = this.E.ex.type, plucked = type === 'pick' || type === 'finger';
    this.bj = CONT[type] ? 0 : (Math.random() - 0.5) * 0.03 * this.E.ex.humanize; // hands never hit the exact same spot
    if (plucked && v < GHOST && (this.role === 'stopped' || this.role === 'open')) { this.ghost(n, v, h); return; }
    if (!CONT[type]) this.restrike();
    this.setNote(n, 0); this.excite(v);
  }
  slur(n, v) {
    this.idle = false; this.wake();
    const E = this.E, nk = E.nk;
    this.lastUse = E.clock; this.damp = 1; this.wantDamp = 0; this.held = true; this.harm = false; this.touch = n;
    this.setNote(n, nk.frets ? Math.max(0.004, nk.glide * 0.25) : nk.glide);
    if (CONT[E.ex.type]) { if (this.contT === 0) this.excite(v); }
    else if (nk.frets) this.pluckPulse(v * 0.35);
    else this.pluckPulse(v * 0.08);
  }
  wake() { this.awake = Math.round(3 * this.E.fs / Math.max(20, Math.min(this.freq, this.target))) + 1024; }
  release() {
    this.held = false; this.pend = false; this.contT = 0;
    const nk = this.E.nk;
    if (this.harm) return; // natural harmonics keep ringing after the finger lifts
    if (this.role === 'stopped' || (this.role === 'open' && nk.dampOpen)) {
      const mt = CONT[this.E.ex.type] ? 0.5 : nk.mute;
      this.wantDamp = Math.pow(10, -3 / (mt * this.freq));
      if (!CONT[this.E.ex.type]) this.damp = this.wantDamp;
    }
  }
  block(n) {
    const E = this.E, ex = E.ex, fs = E.fs;
    this.t += n / fs;
    if (this.wantDamp && !this.held && this.cont < 0.02) this.damp = this.wantDamp;
    // auto vibrato (fades in after a delay on held notes)
    if (this.held && ex.vibDepth > 0 && this.role !== 'symp') {
      let r = (this.t - ex.vibDelay) / 0.6; r = r < 0 ? 0 : r > 1 ? 1 : r;
      this.vph += 6.2832 * ex.vibRate * n / fs;
      this.vib = Math.pow(2, ex.vibDepth * r * Math.sin(this.vph) / 1200);
    } else this.vib = 1;
    // wind band-pass around a harmonic
    if (ex.type === 'wind') {
      const h = 1 + Math.floor(ex.wind * 7);
      let c = this.freq * h; if (c > fs * 0.4) c = this.freq;
      const r = Math.exp(-Math.PI * (c / 18) / fs);
      this.bpA1 = 2 * r * Math.cos(6.2832 * c / fs); this.bpA2 = r * r; this.bpG = 1 - r;
    }
    this.elC = 1 - Math.exp(-6.2832 * 1.3 * this.freq / fs);
    this.rms = Math.sqrt(this.acc / n); this.acc = 0;
    // a string that has fully died away goes to sleep (no CPU) until something excites it
    this.awake -= n; // never sleep while a wave is still travelling toward the ends
    const quiet = this.awake <= 0 && this.env < 2e-6 && this.rms < 1e-6 && !this.pulse && this.cont === 0 && this.contT === 0;
    if (quiet && !this.idle) { this.idle = true; this.neck.b.fill(0); this.br.b.fill(0); this.neck.last = this.br.last = 0; this.lp = this.a1x = this.a1y = this.a2x = this.a2y = 0; this.env = 0; this.oenv = 0; }
    else if (!quiet) this.idle = false;
    const N = fs / this.freq - this.comp;
    this.magD = Math.max(1, Math.round(E.pk.magPos * N));
  }
  tick(feed) {
    const E = this.E;
    this.freq += (this.target - this.freq) * this.gc;
    const f = this.freq * E.tune * E.bendMul * this.vib * (1 + this.tm * this.env + E.jaw * 0.02 * (this.env > 0.3 ? 1 : this.env * 3.3));
    this.cf = f;
    const N = E.fs / f - this.comp;
    let bl = N * (E.beta + this.bj); if (bl < 2) bl = 2;
    let nl = N - bl; if (nl < 2) nl = 2;
    // bridge-side loss + brightness (jawari makes loud notes brighter)
    const d = E.jaw > 0 ? this.d * (1 - E.jaw * 0.8 * (this.env > 0.25 ? 1 : this.env * 4)) : this.d;
    this.lp = (1 - d) * this.br.last + d * this.lp;
    let x = this.lp * this.g * this.damp;
    // stiffness (dispersion)
    const a = this.apA;
    let y = a * x + this.a1x - a * this.a1y; this.a1x = x; this.a1y = y; x = y;
    y = a * x + this.a2x - a * this.a2y; this.a2x = x; this.a2y = y; x = y;
    // jawari: one-sided grazing of a curved bridge
    if (E.jaw > 0) { const th = 0.12 * (1.05 - E.jaw); if (x > th) x = th + (x - th) * 0.25; }
    // fret buzz on fretted held strings
    if (E.buzz > 0 && this.role === 'stopped' && this.held) {
      const th = 0.35 * (1.05 - E.buzz);
      if (x > th) x = th + (x - th) * 0.3 + E.noise() * 0.01 * E.buzz;
      else if (x < -th) x = -th + (x + th) * 0.3 + E.noise() * 0.01 * E.buzz;
    }
    const bR = -x, nR = -this.neck.last, sv = bR + nR;
    let nv = feed;
    if (this.pulse) { nv += this.pulse[this.pi++]; if (this.pi >= this.pulse.length) this.pulse = null; }
    if (this.contT > 0 || this.cont > 1e-4) {
      this.cont += (this.contT - this.cont) * (this.contT > this.cont ? E.atkC : E.relC);
      if (this.contT === 0 && this.cont < 0.02) this.cont = 0; // released exciters really stop
      const type = E.ex.type, c = this.cont;
      if (type === 'bow') {
        this.drift += E.noise() * 0.004 - this.drift * 0.0004;
        let vb = c * E.bowMax * this.bowAmp * this.bowDir * (1 + this.drift * E.ex.humanize);
        vb += E.noise() * (E.grit + 0.004) * c; // rosin noise
        const dv = vb - sv;
        let s = dv * E.bowSlope; s = (s < 0 ? -s : s) + 0.75; s = s * s; s = 1 / (s * s); if (s > 1) s = 1;
        if (c > 0.003) nv += dv * s;
      } else if (type === 'ebow') {
        // sense through a lowpass so the sustainer locks to the fundamental
        this.el = (this.el || 0) + (sv - (this.el || 0)) * this.elC;
        const tgt = 0.06 + 0.22 * E.ex.ebow, gn = 1 - this.env / tgt;   // automatic gain control
        nv += c * (gn > 0 ? 0.8 * gn * SRK : 0) * this.el + E.noise() * 2e-4 * c;
      } else if (type === 'wind') {
        const gust = 1 + E.gustV * E.ex.gust;
        const w = E.noise() * gust;
        const yb = this.bpG * w + this.bpA1 * this.b1 - this.bpA2 * this.b2; this.b2 = this.b1; this.b1 = yb;
        const tgt = 0.05 + 0.2 * E.ex.wind, gn = 1 - this.env / tgt;
        nv += yb * c * E.ex.wind * 0.35 + (gn > 0 ? 0.01 * SRK * gn * c * E.ex.wind : 0) * sv;
      }
    } else this.cont = 0;
    this.neck.tick(bR + nv, nl);
    const o = this.br.tick(nR + nv, bl);
    const av = sv < 0 ? -sv : sv;
    this.env += (av - this.env) * 0.002 * SRK;
    this.acc += o * o;
    return o;
  }
  magOut(o) {
    this.hist[this.hw] = o;
    const v = o - this.hist[(this.hw - this.magD) & DM];
    this.hw = (this.hw + 1) & DM;
    return v * this.mag;
  }
}

class LuitherProc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fs = sampleRate; this.S = []; this.modes = [];
    this.ex = { type: 'pick', pos: 0.15, pickStiff: 0.6, fingerSoft: 0.4, hammerHard: 0.6, pressure: 0.5, speed: 0.5,
      attack: 0.08, release: 0.2, bowChange: true, humanize: 0.3, vibDepth: 0, vibDelay: 0.4, vibRate: 5.5,
      ebow: 0.6, wind: 0.5, gust: 0.3, drone: 0.35 };
    this.nk = { frets: true, buzz: 0, jawari: 0, legato: 'smart', thr: 4, glide: 0.01, pbRange: 2, pressBend: 2,
      dampOpen: false, mute: 0.25, coupling: 0.5, sympC: 0.3 };
    this.pk = { mag: 0, magPos: 0.12, piezo: 0.3, mic: 0.8, master: 0.8 };
    this.held = []; this.map = new Map(); this.sus = false; this.bendSemis = 0; this.bendMul = 1; this.clock = 0;
    this.sympFeed = 0; this.dc = [0, 0, 0, 0, 0, 0, 0, 0]; this.lim = 1; this.limMin = 1; this.dcA = 1 - 2 * Math.PI * 5 / sampleRate; this.dcB = 1 - 2 * Math.PI * 3 / sampleRate; this.frame = 0; this.lastOn = -1e9; this.bin1 = 0; this.bin2 = 0; this.pa = 0; this.pb = 0;
    { const g = Math.tan(Math.PI * Math.min(4500, sampleRate * .45) / sampleRate), k = 1 / 1.6; this.pa1 = 1 / (1 + g * (g + k)); this.pa2 = g * this.pa1; this.pa3 = g * this.pa2; } this.limRel = 1 - Math.exp(-1 / (0.12 * sampleRate)); this.blk = 0; this.seed = 22222; this.gustV = 0; this.gustT = 0;
    this.exBase = { ...this.ex }; this.nkBase = { ...this.nk }; this.syn = new Synth(this);
    this.derive();
    this.port.onmessage = e => this.msg(e.data);
  }
  noise() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296 - 0.5; }
  derive() {
    const ex = this.ex, nk = this.nk, fs = this.fs;
    this.bowSlope = Math.max(0.8, 5 - 4.2 * ex.pressure);
    this.bowMax = 0.03 + 0.3 * ex.speed;
    this.grit = Math.max(0, ex.pressure - 0.7) * 0.25;
    this.atkC = 1 - Math.exp(-1 / (Math.max(0.002, ex.attack) * fs));
    this.relC = 1 - Math.exp(-1 / (Math.max(0.005, ex.release) * fs));
    this.beta = Math.min(0.5, Math.max(0.02, ex.pos));
    this.jaw = nk.jawari; this.tune = ex.type === 'bow' ? 0.9855 : ex.type === 'ebow' ? 0.99 : 1; this.buzz = nk.frets ? nk.buzz : 0;
  }
  msg(d) {
    switch (d.t) {
      case 'ex': Object.assign(this.ex, d.v); Object.assign(this.exBase, d.v); this.derive(); break;
      case 'nk': Object.assign(this.nk, d.v); Object.assign(this.nkBase, d.v); this.derive(); break;
      case 'sdefs': this.syn.setDefs(d.v); break;
      case 'synth': this.syn.set(d.v); break;
      case 'mw': this.syn.src.mw = d.v; break;
      case 'pk': Object.assign(this.pk, d.v); break;
      case 'strings': this.setStrings(d.v); break;
      case 'modes': this.setModes(d.v); break;
      case 'on': this.noteOn(d.n, d.v); break;
      case 'off': this.noteOff(d.n); break;
      case 'sus': this.setSus(d.v); break;
      case 'bend': this.bendSemis = d.v * this.nk.pbRange; break;
      case 'panic': this.panic(); break;
    }
  }
  setStrings(list) {
    if (list.length !== this.S.length) this.panic();
    while (this.S.length < list.length) this.S.push(new Str(this));
    this.S.length = list.length;
    list.forEach((p, i) => this.S[i].set(p));
  }
  setModes(list) {
    const fs = this.fs, old = this.modes;
    this.modes = list.map((m, i) => {
      const o = old[i] || { y1: 0, y2: 0, e: 0 };
      const r = Math.exp(-Math.PI * m.f / (m.q * fs)), w = 2 * Math.PI * m.f / fs;
      o.a1 = 2 * r * Math.cos(w); o.a2 = r * r; o.b0 = (1 - r * r) * 0.5; // band-pass form below: peak gain 1 at any sample rate
      const k48 = 1 / (2 * Math.sin(Math.min(1.5, 2 * Math.PI * m.f / 48000))); // keeps the 48 kHz voicing
      o.aL = m.amp * (1 - m.pan) * k48; o.aR = m.amp * (1 + m.pan) * k48; o.e = 0;
      return o;
    });
  }
  panic() {
    for (const s of this.S) { s.stack = []; s.held = false; s.contT = 0; s.cont = 0; s.pulse = null; s.damp = 0.5; s.wantDamp = 0.5; }
    this.held = []; this.map.clear();
  }
  reach(s, n) { return n >= s.open - 0.01 && n <= s.open + s.range + 0.01; }
  pick(n) {
    const S = this.S; let best = -1, bs = 1e12;
    const consider = (i, score) => { if (score < bs) { bs = score; best = i; } };
    // 1. an open string tuned exactly to the note
    S.forEach((s, i) => { if (s.role === 'open' && Math.abs(s.open - n) < 0.01) consider(i, (s.held ? 1e6 : 0) + s.lastUse); });
    if (best >= 0) return best;
    // 2. a stopped string that can reach it (prefer free, then lowest fret)
    S.forEach((s, i) => { if (s.role === 'stopped' && this.reach(s, n)) consider(i, (s.stack.length ? 1e6 + s.lastUse : 0) + (n - s.open)); });
    if (best >= 0) return best;
    // 3. an open string pressed behind the bridge (bends up only, koto-style)
    S.forEach((s, i) => { const d = n - s.open; if (s.role === 'open' && d > 0 && d <= this.nk.pressBend + 0.01) consider(i, (s.held ? 1e6 : 0) + d); });
    if (best >= 0) return best;
    // 4. fallback: nearest playable string, so nothing goes silent
    S.forEach((s, i) => { if (s.role === 'open' || s.role === 'stopped') {
      const lo = s.open, hi = s.role === 'stopped' ? s.open + s.range : s.open;
      const dist = n < lo ? lo - n : n > hi ? n - hi : 0; consider(i, dist * 10 + (s.held ? 1e5 : 0)); } });
    return best;
  }
  // A string whose natural harmonic (2nd-6th) sounds this pitch
  harmString(n) {
    let best = null, bs = 1e9;
    this.S.forEach((s, i) => { if (s.role !== 'stopped' && s.role !== 'open') return;
      for (let h = 2; h <= 6; h++) { const d = Math.abs(n - (s.open + 12 * Math.log2(h)));
        if (d < 0.2) { const sc = h * 10 + d + (s.held ? 100 : 0); if (sc < bs) { bs = sc; best = { i, h }; } } } });
    return best;
  }
  noteOn(n, v) {
    this.clock++;
    if (this.map.has(n)) this.noteOff(n);
    this.syn.noteOn(n, v, this.held.length === 0);
    const nk = this.nk, S = this.S;
    const together = this.frame - this.lastOn < 0.035 * this.fs; this.lastOn = this.frame;
    if (nk.legato !== 'poly' && this.held.length && (!together || nk.legato === 'legato')) {
      const last = this.held[this.held.length - 1], si = this.map.get(last), s = S[si];
      if (s && s.role === 'stopped' && this.reach(s, n) && (nk.legato === 'legato' || Math.abs(n - last) <= nk.thr)) {
        s.stack.push(n); this.map.set(n, si); this.held.push(n); s.slur(n, v); return;
      }
    }
    let si = -1, hh = 0;
    const ty = this.ex.type;
    if ((ty === 'pick' || ty === 'finger') && v < GHOST * 0.6) { const hs = this.harmString(n); if (hs) { si = hs.i; hh = hs.h; } }
    if (si < 0) si = this.pick(n);
    if (si < 0) return;
    const s = S[si];
    for (const hn of s.stack) if (this.map.get(hn) === si) { this.map.delete(hn); this.held = this.held.filter(x => x !== hn); }
    s.stack = [n]; this.map.set(n, si); this.held.push(n);
    // A note outside a fallback string's reach still plays at the asked pitch
    s.start(n, v, hh);
    // drones
    const cont = CONT[this.ex.type];
    for (const d of S) if (d.role === 'drone') { if (cont ? d.contT === 0 : (!d.held || d.t > 0.35)) d.start(d.open, v * this.ex.drone); }
  }
  noteOff(n) {
    this.held = this.held.filter(x => x !== n);
    const si = this.map.get(n); if (si === undefined) return;
    this.map.delete(n);
    const s = this.S[si]; if (!s) return;
    const idx = s.stack.lastIndexOf(n); if (idx >= 0) s.stack.splice(idx, 1);
    if (s.stack.length) { if (idx === s.stack.length) s.slur(s.stack[s.stack.length - 1], 0.6); }
    else if (this.sus) s.pend = true; else s.release();
    if (!this.held.length && !this.sus) { for (const d of this.S) if (d.role === 'drone' && d.held) d.release(); this.syn.allOff(); }
  }
  setSus(v) {
    this.sus = v;
    if (!v) { for (const s of this.S) if (s.pend) s.release();
      if (!this.held.length) { for (const d of this.S) if (d.role === 'drone' && d.held) d.release(); this.syn.allOff(); } }
  }
  process(inputs, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    const S = this.S, M = this.modes, pk = this.pk, nS = S.length, nM = M.length;
    for (let k = 0; k < nS; k++) S[k].block(n);
    for (let k = 0; k < nM; k++) { const m = M[k]; if (m.y1 < 1e-15 && m.y1 > -1e-15 && m.y2 < 1e-15 && m.y2 > -1e-15) m.y1 = m.y2 = 0; }
    const syn = this.syn; syn.block(n); this.frame += n;
    const oscOn = syn.oscOn, oscShape = syn.oscShape, oscMul = syn.oscMul / this.fs;
    this.bendMul = Math.pow(2, this.bendSemis / 12);
    if ((this.gustT -= n) <= 0) { this.gustT = 2000 + Math.random() * 6000; this.gustTarget = Math.random() * 2 - 0.6; }
    this.gustV += ((this.gustTarget || 0) - this.gustV) * 0.02;
    const cpl = this.nk.coupling * 0.6, sc = this.nk.sympC * 0.1 * SRK;
    const mg = pk.mag * 0.6, pz = pk.piezo, mic = pk.mic; let mast = pk.master * 2.5;
    const dc = this.dc; mast *= TRIM[this.ex.type] || 1;
    for (let i = 0; i < n; i++) {
      let bm = 0, bsy = 0, mgs = 0, oscSum = 0, ringSum = 0;
      const feed = this.sympFeed;
      for (let k = 0; k < nS; k++) {
        const s = S[k];
        if (s.idle && (s.role !== 'symp' || (feed < 1e-7 && feed > -1e-7))) continue;
        if (s.role === 'symp') { if (s.idle) s.wake(); s.idle = false; const o = s.tick(feed); bsy += o; if (s.mag > 0) mgs += s.magOut(o) * 0.5; }
        else {
          const o = s.tick(0); bm += o; if (s.mag > 0) mgs += s.magOut(o);
          if (oscOn && s.role !== 'drone') { // the synth oscillator follows each string's pitch and loudness
            const ao = o < 0 ? -o : o; s.oenv += (ao - s.oenv) * (ao > s.oenv ? 0.02 * SRK : 0.0006 * SRK);
            const dt = s.cf * oscMul; s.oph += dt; if (s.oph >= 1) s.oph -= 1;
            const w = oscWave(s.oph, dt, oscShape); oscSum += w * s.oenv; ringSum += w * o;
          }
        }
      }
      this.sympFeed = bm * sc;
      const bin = (bm + bsy) * cpl;
      let bl = 0, br = 0; const bx = bin - this.bin2; this.bin2 = this.bin1; this.bin1 = bin;
      for (let k = 0; k < nM; k++) {
        const m = M[k]; const y = m.b0 * bx + m.a1 * m.y1 - m.a2 * m.y2;
        m.y2 = m.y1; m.y1 = y; bl += y * m.aL; br += y * m.aR; m.e += y * y;
      }
      const bs = bm + bsy, p = bs * 0.5 + (bl + br) * 0.04, direct = bs * 0.06;
      // magnetic pickup coil: resonant low-pass around 4.5 kHz, like a real single-coil's inductance
      { const v3 = mgs - this.pb, v1 = this.pa1 * this.pa + this.pa2 * v3, v2 = this.pb + this.pa2 * this.pa + this.pa3 * v3; this.pa = 2 * v1 - this.pa; this.pb = 2 * v2 - this.pb; mgs = v2 * 1.6; }
      let l = mgs * mg + p * pz + (bl + direct) * mic;
      let r = mgs * mg + p * pz + (br + direct) * mic;
      // DC blockers
      let yl = l - dc[0] + this.dcA * dc[1]; dc[0] = l; dc[1] = yl;
      let yr = r - dc[2] + this.dcA * dc[3]; dc[2] = r; dc[3] = yr;
      syn.run(yl * mast, yr * mast, oscSum * mast * OSC_G, ringSum * mast * RING_G, i, n);
      // output: DC blocker after the synth, then a clean peak limiter at -1 dBFS (no colouring below it)
      let ol = syn.l - dc[4] + this.dcB * dc[5]; dc[4] = syn.l; dc[5] = ol;
      let or = syn.r - dc[6] + this.dcB * dc[7]; dc[6] = syn.r; dc[7] = or;
      const pk = Math.max(ol < 0 ? -ol : ol, or < 0 ? -or : or);
      if (pk * this.lim > 0.891) this.lim = 0.891 / pk; else this.lim += (1 - this.lim) * this.limRel;
      ol *= this.lim; or *= this.lim;
      L[i] = ol > 1 ? 1 : ol < -1 ? -1 : ol; if (R !== L) R[i] = or > 1 ? 1 : or < -1 ? -1 : or;
      if (this.lim < this.limMin) this.limMin = this.lim;
    }
    if (++this.blk >= 6) {
      this.blk = 0;
      this.port.postMessage({ t: 'viz', amp: S.map(s => s.rms), note: S.map(s => s.harm ? s.touch : s.note + 12 * Math.log2(s.freq / s.target)), harm: S.map(s => !!s.harm),
        held: S.map(s => s.held || s.cont > 0.02), syn: syn.viz(), lim: this.limMin, modeE: M.map(m => { const e = m.e; m.e = 0; return e; }) });
      this.limMin = 1;
    }
    return true;
  }
}
registerProcessor('luither', LuitherProc);
