/* Luither — string engine (AudioWorklet). Waveguide strings + modal body. */
const DMAX = 8192, DM = DMAX - 1;
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
const CONT = { bow: 1, ebow: 1, wind: 1 };
const OSC_G = 0.3, RING_G = 0.5;
// phase delays (samples) at ω of a one-pole lowpass (1-d)/(1-d z⁻¹) and of a first-order allpass (a+z⁻¹)/(1+a z⁻¹)
const lpDelay = (d, w) => Math.atan2(d * Math.sin(w), 1 - d * Math.cos(w)) / w;
const apDelay = (a, w) => -(Math.atan2(-Math.sin(w), a + Math.cos(w)) - Math.atan2(-a * Math.sin(w), 1 + a * Math.cos(w))) / w;
const SRR = sampleRate / 48000, SRK = 48000 / sampleRate; // keep the sound identical at 44.1 / 48 / 96 kHz
const GHOST = 20 / 127; // plucks softer than this are ghost notes
const TRIM = { pick: 3, finger: 9, hammer: 5, bow: 0.5, ebow: 2, wind: 0.5 };

class Delay {
  constructor() { this.b = new Float32Array(DMAX); this.w = 0; this.last = 0; }
  tick(x, len) {
    // 3rd-order Lagrange read: flat to ~8 kHz, so loss doesn't depend on the delay's fractional part (linear interp dulled some notes)
    const rp = this.w - len, i = Math.floor(rp), f = rp - i, B = this.b;
    const y0 = B[(i - 1) & DM], y1 = B[i & DM], y2 = B[(i + 1) & DM], y3 = B[(i + 2) & DM], fm1 = f - 1, fm2 = f - 2, fp1 = f + 1;
    this.last = -y0 * f * fm1 * fm2 / 6 + y1 * fp1 * fm1 * fm2 / 2 - y2 * fp1 * f * fm2 / 2 + y3 * fp1 * f * fm1 / 6;
    this.b[this.w] = x; this.w = (this.w + 1) & DM;
    return this.last;
  }
}

// ── fretting-hand noises: each is a few resonators excited by a click or a noise burst ──
// [centre Hz, Q, decay s, gain, impulse?]
const FNOISE = {
  hammer:   [[340, .8, .007, 1, 0], [3200, 7, .0018, .45, 1], [1500, 3, .002, .25, 1]],   // fingertip thump + string slapping the fret
  pull:     [[2600, 2.2, .009, .55, 0], [650, .9, .004, .45, 0]],                          // fingertip scuff as it snaps off
  lift:     [[300, .8, .009, .5, 0], [1900, 3, .003, .12, 0]],                              // finger leaving the string
  press:    [[420, .9, .004, .35, 0], [3300, 7, .0012, .2, 1]],                             // finger landing on a fret before a pluck
  clack:    [[900, 6, .012, 1, 1], [2400, 4, .004, .45, 1], [260, 1, .006, .4, 0]],         // key / tangent striking
  unclack:  [[700, 5, .01, .45, 1], [240, 1, .005, .25, 0]],
  clank:    [[4300, 14, .05, .55, 1], [2150, 12, .04, .45, 1], [1150, 2, .004, .3, 0]],    // slide landing on the strings
  slidelift:[[3000, 3, .006, .3, 0]],
};
const FN_SCALE = { hammer: 2.2, pull: 2.2, lift: 3, press: 5, clack: 9, unclack: 6, clank: 12, slidelift: 3 }; // measured against the notes (see noiseqa)
const SLIDES = { glass: { f: 1700, q: 1.1, g: .7, ring: .8 }, brass: { f: 3300, q: 2, g: 1.25, ring: 1.3 }, steel: { f: 2600, q: 1.7, g: 1, ring: 1.1 } };
class Str {
  constructor(E) {
    this.E = E; this.neck = new Delay(); this.br = new Delay();
    this.hist = new Float32Array(DMAX); this.hw = 0; this.magD = 10;
    this.lp = 0; this.apx = new Float64Array(4); this.apy = new Float64Array(4); this.Bo = 0; this.hf = 25; this.fOpen = 110; this.mw = 0; this.jpk = 0; this.jy = 0; this.jm = 0; this.jPi = 0; this.jPo = 0;
    this.freq = 110; this.target = 110; this.gc = 1; this.note = 45; this.g = 0.99;
    this.stack = []; this.held = false; this.pend = false; this.lastUse = 0;
    this.pulse = null; this.pi = 0; this.cont = 0; this.contT = 0; this.bowDir = 1; this.bowAmp = 1;
    this.damp = 1; this.wantDamp = 0; this.env = 0; this.acc = 0; this.rms = 0; this.t = 0;
    this.vib = 1; this.vph = Math.random() * 6; this.drift = 0;
    this.b1 = 0; this.b2 = 0; this.bpA1 = 0; this.bpA2 = 0; this.bpG = 0;
    this.role = 'stopped'; this.open = 45; this.range = 12; this.mag = 0;
    this.awake = 0; this.sqL = 0; this.sqT = 0; this.sq1 = 0; this.sq2 = 0; this.sqx1 = 0; this.sqx2 = 0; this.pf = 0; this.oph = Math.random(); this.oenv = 0; this.cf = 110; this.bj = 0; this.harm = false; this.touch = 45; this.d = 0.2; this.apA = -0.2; this.comp = 1; this.tm = 0.05; this.decay = 5;
  }
  set(p) {
    const roleChanged = this.role !== p.role;
    this.role = p.role; this.open = p.note; this.range = p.range;
    const m = p.mat;
    // inharmonicity B of the open string (measured guitars: ~5e-5 plain trebles … 1–3e-4 wound basses); fretting raises it ∝ (f/f_open)²
    this.Bo = Math.min(4e-3, m.stiff * 4.2e-4 * (p.wound ? .5 + 1.6 * p.gauge * p.gauge : .25 + 1.2 * p.gauge));
    this.fOpen = mtof(p.note);
    // high-frequency loss in dB/s per kHz (internal friction + air): real strings sit around 20–35 whatever their pitch
    this.hf = (m.hf ?? (6 + 60 * Math.pow(m.bright, 1.5))) * (p.wound ? 1 + .9 * p.gauge : 1); // windings rub: wound strings lose their highs faster (measured E2/A2 vs trebles)
    this.decay = m.decay * (1.2 - 0.4 * p.gauge) * (p.role === 'symp' ? 1.4 : 1) * (p.sus || 1); // neck stiffness
    this.tm = (1 - p.tension) * 0.12;
    this.mag = m.magnetic; this.wound = !!p.wound;
    this.setAperture(this.E.pk.scale || .65, this.E.fs);
    if (!this.held || roleChanged) this.setNote(this.open, 0); else this.calcG();
  }
  calcG() {
    const f = this.target, fs = this.E.fs, T60 = this.decay * Math.pow(110 / f, 0.4), R0 = 60 / T60;
    this.g = Math.pow(10, -R0 / (20 * f));
    // loss filter: one-pole whose extra loss at fh gives R(fh) = R0 + hf·fh/1000 dB/s, so highs die in seconds (not cycles) at every pitch
    const fh = Math.min(2500, fs * .4), w = 2 * Math.PI * fh / fs, r = Math.pow(10, -(this.hf * (1 - .7 * (this.E.jaw || 0)) * fh / 1000) / (20 * f)) /* a jawari bridge is hard bone: it soaks up far less treble */, r2 = r * r, c = Math.cos(w);
    let d = 0; if (r2 < .999999) { const A = 1 - r2, Bq = 1 - r2 * c; d = (Bq - Math.sqrt(Math.max(0, Bq * Bq - A * A))) / A; }
    this.d = Math.min(.97, Math.max(0, d));
    // dispersion: 4 first-order allpasses fitted so partial k lands at k·f0·√(1+Bk²)
    // a bow (or e-bow / wind) mode-locks the partials into a harmonic series, so a sustained string barely shows its stiffness
    const B = (this.role === 'stopped' ? this.Bo * Math.pow(f / this.fOpen, 2) : this.Bo) * (CONT[this.E.ex.type] ? .08 : 1), w0 = 2 * Math.PI * f / fs, N0 = fs / f;
    const k = Math.max(2, Math.min(12, Math.floor(5000 / f))), wk = w0 * k * Math.sqrt(1 + B * k * k), need = (N0 - N0 / Math.sqrt(1 + B * k * k));
    let best = 0, be = Infinity;
    if (B > 1e-7) for (let i = 1; i <= 48; i++) { const a = -1 + Math.pow(i / 49, 1.6) * .999, D1 = apDelay(a, w0), got = 4 * (D1 - apDelay(a, wk)), e = Math.abs(got - need);
      if (e < be && 4 * D1 < N0 * .45) { be = e; best = a; } }
    this.apA = best;
    this.comp = 2 + lpDelay(this.d, w0) + 4 * apDelay(best, w0);
  }
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
    else if (type === 'finger') L = 4 + Math.round(ex.fingerSoft * 24); // the release slip is quick even from a soft fingertip (0.1–0.6 ms)
    else L = 2 + Math.round((1 - ex.hammerHard) * 30);
    L = Math.max(1, Math.round(L * (1.4 - 0.7 * Math.min(1, vel)) * SRR));
    if (click) noise = Math.max(noise, 90); noise = Math.round(noise * SRR);
    const arr = new Float32Array(L + noise), k = v * Math.PI / (2 * L) * SRR; // pulses are in per-sample velocity units
    for (let i = 0; i < L; i++) arr[i] = k * Math.sin(Math.PI * (i + 0.5) / L);
    let out = arr;
    if (type !== 'hammer') {
      // a pluck releases a displaced string; a strike gives it velocity. Released displacement means the velocity waves carry
      // a 1/k spectrum (−6 dB/oct above the fundamental) instead of the flat spectrum of a strike, which made plucks sound
      // too zingy next to recordings. A leaky integrator with its corner near f0 gives that slope; the fundamental keeps its level.
      const fs = this.E.fs, f0 = Math.max(20, this.target), fc = f0 * .8, rho = Math.exp(-2 * Math.PI * fc / fs);
      const tail = Math.min(4096, Math.ceil(4 * fs / (2 * Math.PI * fc))), gn = (1 - rho) * Math.sqrt(1 + (f0 / fc) ** 2) * (f0 < 300 ? Math.pow(300 / f0, .45) : 1); // low notes keep their old loudness
      out = new Float32Array(L + tail); let y = 0;
      for (let i = 0; i < out.length; i++) { y = (i < L ? arr[i] : 0) + rho * y; out[i] = y * gn; }
      // the residue left in the integrator is tiny (e^-4); fade it so nothing is left hanging
      for (let i = Math.max(0, out.length - 64); i < out.length; i++) out[i] *= (out.length - i) / 64;
    }
    for (let i = 0; i < noise; i++) out[i] += (Math.random() - 0.5) * (v * 0.06 * ex.pickStiff + click) * (1 - i / noise);
    if (type === 'hammer') for (let i = 0; i < L; i++) out[i] *= 1.4; // hammers hit hard
    this.pulse = out; this.pi = 0;
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
    this.lastUse = this.E.clock; this.held = true; this.pend = false; this.sliding = this.E.ex.fretter === 'slide';
    this.damp = 1; this.wantDamp = 0; this.t = 0; this.harm = false; this.touch = n;
    const type = this.E.ex.type, plucked = type === 'pick' || type === 'finger';
    this.bj = CONT[type] ? 0 : (Math.random() - 0.5) * 0.03 * this.E.ex.humanize; // hands never hit the exact same spot
    if (plucked && v < GHOST && (this.role === 'stopped' || this.role === 'open')) { this.ghost(n, v, h); return; }
    if (!CONT[type]) this.restrike();
    this.setNote(n, 0); this.excite(v);
    if (this.role === 'stopped') { const fr = this.E.ex.fretter || 'fingers', fretted = n - this.open > .5;
      if (fr === 'keys' && fretted) this.E.fretNoise('clack', v * .7, this);
      else if (fr === 'slide' && fretted) this.E.fretNoise('clank', v * .5, this);
      else if (fr === 'fingers' && fretted) this.E.fretNoise('press', v * .5, this); }
  }
  slur(n, v, kind = 'on') {
    this.idle = false; this.wake();
    const E = this.E, nk = E.nk, fr = E.ex.fretter || 'fingers', from = this.note;
    this.lastUse = E.clock; this.damp = 1; this.wantDamp = 0; this.held = true; this.harm = false; this.touch = n;
    const jump = Math.abs(n - from), fretSlide = fr === 'fingers' && nk.frets && jump > 2.5 && kind === 'on';
    // fretless fingers: a soft legato (velocity under 70) slides the finger smoothly; a firm one hammers on / pulls off
    const fretless = fr === 'fingers' && !nk.frets && this.role === 'stopped', flSlide = fretless && v < 70 / 127;
    this.slideSteps = null; this.sliding = fr === 'slide' || flSlide;
    if (fretSlide) { // a fingered slide on frets steps through each fret on the way
      const dir = Math.sign(n - from); this.slideSteps = { to: n, cur: Math.round(from) + dir, dir, per: Math.max(.012, (E.ex.slideTime || .12) / jump) * E.fs, cnt: 0 };
      this.setNote(this.slideSteps.cur, .002);
    } else this.setNote(n, this.sliding ? (E.ex.slideTime || .12) * (.55 + .22 * Math.sqrt(jump)) / 3 /* time constant: arrives in about the slide time */ : fr === 'keys' || fretless ? .002 : nk.frets ? Math.max(0.004, nk.glide * 0.25) : nk.glide);
    if (CONT[E.ex.type]) { if (this.contT === 0) this.excite(v); }
    else if (this.sliding || fretSlide) { /* sliding doesn't re-pluck */ }
    else if (nk.frets || fr === 'keys' || fretless) this.pluckPulse(v * (kind === 'off' ? 0.42 : 0.35));
    else this.pluckPulse(v * 0.08);
    if (this.role === 'stopped' && !fretSlide && !flSlide) E.fretNoise(fr === 'fingers' ? (kind === 'off' ? 'pull' : 'hammer') : fr === 'keys' ? 'clack' : '', kind === 'off' ? Math.min(.8, v) : v, this);
  }
  wake() { this.awake = Math.round(3 * this.E.fs / Math.max(20, Math.min(this.freq, this.target))) + 1024; }
  release() {
    this.slideSteps = null; this.held = false; this.pend = false; this.contT = 0;
    const nk = this.E.nk;
    if (this.harm) return; // natural harmonics keep ringing after the finger lifts
    if (this.role === 'stopped' && this.note - this.open > .5) { const fr = this.E.ex.fretter || 'fingers'; this.E.fretNoise(fr === 'keys' ? 'unclack' : fr === 'slide' ? 'slidelift' : 'lift', .5 + .3 * Math.min(1, this.env * 4), this); }
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
    { // finger squeak or slide scrape: louder the faster the hand moves, much louder on wound strings
      const rate = Math.abs(Math.log2(this.freq / (this.pf || this.freq))) * fs / n; this.pf = this.freq;
      if (this.slideSteps) { const st = this.slideSteps; st.cnt += n; while (st.cnt >= st.per && this.slideSteps) { st.cnt -= st.per; if (st.cur === st.to) { this.slideSteps = null; break; } st.cur += st.dir; this.setNote(st.cur, .002); } }
      const fr = ex.fretter || 'fingers', amt = ex.fretNoise ?? .5; let lvl = 0, f = 1500, q = 6;
      const sliding = this.sliding || this.slideSteps; // hammer-ons don't squeak; only hands sliding along the string do
      if (this.held && this.role === 'stopped' && fr !== 'keys' && sliding && rate > .03 && amt > 0) {
        if (fr === 'slide') { const sl = SLIDES[ex.slideMat] || SLIDES.steel; lvl = Math.min(1, rate / 2.5) * (this.wound ? 1 : .3) * sl.g * amt * .3; f = sl.f * (.8 + Math.min(.6, rate * .15)); q = sl.q; }
        else { lvl = Math.min(1, rate / 3) * (this.wound ? 1 : .1) * amt * .56; f = 1200 + Math.min(4200, rate * 700); q = 7; } }
      this.sqT = lvl * .02 * Math.sqrt(SRR); if (lvl > 0 || this.sqL > 1e-6) { const r = Math.exp(-Math.PI * f / (q * fs)); this.sqA1 = 2 * r * Math.cos(2 * Math.PI * f / fs); this.sqA2 = r * r; this.sqB = (1 - r * r) * .5; }
    }
    this.rms = Math.sqrt(this.acc / n); this.acc = 0;
    // a string that has fully died away goes to sleep (no CPU) until something excites it
    this.awake -= n; // never sleep while a wave is still travelling toward the ends
    const quiet = this.awake <= 0 && this.env < 2e-6 && this.rms < 1e-6 && !this.pulse && this.cont === 0 && this.contT === 0;
    if (quiet && !this.idle) { this.idle = true; this.neck.b.fill(0); this.br.b.fill(0); this.neck.last = this.br.last = 0; this.lp = 0; this.apx.fill(0); this.apy.fill(0); this.env = 0; this.oenv = 0; }
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
    const d0 = (E.ex.fretter === 'slide' && this.held && this.role === 'stopped') ? this.d * .55 : this.d;
    const d = E.jaw > 0 ? d0 * (1 - E.jaw * 0.8 * (this.env > 0.25 ? 1 : this.env * 4)) : d0;
    this.lp = (1 - d) * this.br.last + d * this.lp;
    let x = this.lp * this.g * this.damp;
    // stiffness (dispersion)
    const a = this.apA, ax = this.apx, ay = this.apy;
    for (let q = 0; q < 4; q++) { const y = a * x + ax[q] - a * ay[q]; ax[q] = x; ay[q] = y; x = y; }
    // jawari: one-sided grazing of a curved bridge. The contact point rides on the wave's own peak level (not a fixed
    // threshold), so the buzz stays bright all the way through the decay as on a real sitar, and opens up ('blooms') as it fades
    if (E.jaw > 0) { // the bridge acts on displacement, so integrate the velocity wave and push back where it penetrates
      const y = this.jy = this.jy * this.E.jLeak + x; this.jm += (y - this.jm) * this.E.jMean; const yc = y - this.jm; // displacement about its mean
      this.jpk = yc > this.jpk ? yc : this.jpk * this.E.jRel;
      const th = this.jm + this.jpk * (1 - .8 * E.jaw), pen = y - th;
      // a light push where the string lies on the bridge; most of the old treble loss is gone (bone bridge), so the buzz sustains
      const xin = x; if (pen > 0) { const push = pen * 1.75 * E.jaw * this.cf * 6.2832 / this.E.fs; /* displacement → velocity units, so every pitch feels the same contact */ x -= push; this.jy -= push; }
      // the bridge reshapes the wave but barely absorbs it: put back the energy the push took, so jawari moves energy up the
      // spectrum (the buzz) without shortening the note
      const k = this.E.jEn; this.jPi += (xin * xin - this.jPi) * k; this.jPo += (x * x - this.jPo) * k;
      if (this.jPo > 1e-12) { let gc = Math.sqrt(this.jPi / this.jPo); if (gc > 1.03) gc = 1.03; else if (gc < 1) gc = 1; x *= gc; this.jy += x - x / gc; } }
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
    let v = o - this.hist[(this.hw - this.magD) & DM];
    this.hw = (this.hw + 1) & DM;
    // the pickup's magnetic window is ~2.5 cm wide: it averages the string over that span (two boxcars ≈ a soft triangle),
    // which dulls the highs of slow, heavy strings far more than thin trebles — why a bass E is so much darker than a high E
    const W = this.mw; if (W > 1) { const r1 = this.mr1, r2 = this.mr2, j = this.mj;
      this.ms1 += v - r1[(j - W) & 63]; r1[j & 63] = v; const u = this.ms1 / W;
      this.ms2 += u - r2[(j - W) & 63]; r2[j & 63] = u; v = this.ms2 / W; this.mj = (j + 1) & 0x3fffffff; }
    return v * this.mag;
  }
  setAperture(scale, fs) { const c = 2 * Math.max(.1, scale) * this.fOpen, W = Math.round(fs * .025 / c / 2); // two boxcars of half the window each
    if (W !== this.mw) { this.mw = Math.max(1, Math.min(60, W)); this.mr1 = new Float32Array(64); this.mr2 = new Float32Array(64); this.ms1 = this.ms2 = 0; this.mj = 64; } }
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
    this.held = []; this.map = new Map(); this.nvel = new Map(); this.sus = false; this.bendSemis = 0; this.bendMul = 1; this.clock = 0;
    this.sympFeed = 0; this.dc = [0, 0, 0, 0, 0, 0, 0, 0]; this.lim = 1; this.limMin = 1; this.dcA = 1 - 2 * Math.PI * 5 / sampleRate; this.dcB = 1 - 2 * Math.PI * 3 / sampleRate; this.frame = 0; this.lastOn = -1e9; this.bin1 = 0; this.bin2 = 0; this.fn = []; this.pa = 0; this.pb = 0;
    { const g = Math.tan(Math.PI * Math.min(3800, sampleRate * .45) / sampleRate), k = 1 / 1.6; this.pa1 = 1 / (1 + g * (g + k)); this.pa2 = g * this.pa1; this.pa3 = g * this.pa2; } this.limRel = 1 - Math.exp(-1 / (0.12 * sampleRate)); this.blk = 0; this.seed = 22222; this.gustV = 0; this.gustT = 0;
    this.exBase = { ...this.ex }; this.nkBase = { ...this.nk }; this.syn = new Synth(this); this.rack = new AmpRack(sampleRate);
    this.derive();
    this.port.onmessage = e => this.msg(e.data);
  }
  fretNoise(type, v, s) {
    const amt = this.ex.fretNoise ?? .5, spec = FNOISE[type]; if (!spec || amt <= 0 || this.fn.length > 24) return;
    const fs = this.fs, sl = type === 'clank' || type === 'slidelift' ? (SLIDES[this.ex.slideMat] || SLIDES.steel) : null;
    const a = Math.min(1.2, v) * amt * .045 * (FN_SCALE[type] || 1) * (s && s.wound && (type === 'pull' || type === 'lift') ? 1.4 : 1) * (sl ? sl.ring : 1);
    this.fn.push({ t: 0, len: Math.round(fs * .08), parts: spec.map(([f, q, dec, gain, imp]) => { f *= .94 + Math.random() * .12;
      const r = imp ? Math.exp(-1 / (dec * fs)) : Math.exp(-Math.PI * f / (q * fs));
      return { a1: 2 * r * Math.cos(2 * Math.PI * f / fs), a2: r * r, b0: imp ? (1 - r * r) * 4 : (1 - r * r) * .5, g: gain * a, imp, ed: Math.exp(-1 / (dec * fs)), e: 1, y1: 0, y2: 0, x1: 0, x2: 0 }; }) });
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
    this.jRel = Math.exp(-1 / (.03 * this.fs)); this.jLeak = 1 - 2 * Math.PI * 15 / this.fs; this.jMean = 1 - Math.exp(-2 * Math.PI * 8 / this.fs); this.jEn = 1 - Math.exp(-1 / (.04 * this.fs)); this.jaw = nk.jawari; this.tune = ex.type === 'bow' ? 0.9855 : ex.type === 'ebow' ? 0.99 : 1; this.buzz = nk.frets ? nk.buzz : 0;
  }
  msg(d) {
    switch (d.t) {
      case 'ex': { const was = CONT[this.ex.type]; Object.assign(this.ex, d.v); Object.assign(this.exBase, d.v); this.derive(); if (!was !== !CONT[this.ex.type]) for (const s of this.S) s.calcG(); break; }
      case 'nk': Object.assign(this.nk, d.v); Object.assign(this.nkBase, d.v); this.derive(); for (const s of this.S) s.calcG(); break;
      case 'sdefs': this.syn.setDefs(d.v); break;
      case 'synth': this.syn.set(d.v); break;
      case 'mw': this.syn.src.mw = d.v; break;
      case 'amp': this.rack.set(d.v); break;
      case 'pk': Object.assign(this.pk, d.v); for (const s of this.S) s.setAperture(this.pk.scale || .65, this.fs); break;
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
    const together = this.frame - this.lastOn < 0.035 * this.fs; this.lastOn = this.frame; this.nvel.set(n, v);
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
    const rv = this.nvel.get(n) ?? .6; this.nvel.delete(n);
    if (s.stack.length) { if (idx === s.stack.length) s.slur(s.stack[s.stack.length - 1], rv, 'off'); }
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
    const rack = this.rack; rack.tempo = syn.p.tempo || 120; rack.block(n);
    const oscOn = syn.oscOn, oscShape = syn.oscShape, oscMul = syn.oscMul / this.fs;
    this.bendMul = Math.pow(2, this.bendSemis / 12);
    if ((this.gustT -= n) <= 0) { this.gustT = 2000 + Math.random() * 6000; this.gustTarget = Math.random() * 2 - 0.6; }
    this.gustV += ((this.gustTarget || 0) - this.gustV) * 0.02;
    const cpl = this.nk.coupling * 0.6, sc = this.nk.sympC * 0.1 * SRK;
    const mg = pk.mag * 0.6, pz = pk.piezo, mic = pk.mic; let mast = pk.master * 2.5;
    const dc = this.dc; mast *= TRIM[this.ex.type] || 1;
    for (let i = 0; i < n; i++) {
      let bm = 0, bsy = 0, mgs = 0, oscSum = 0, ringSum = 0, nz = 0;
      // fretting-hand noise: one-shot events + continuous squeak/scrape
      for (let j = this.fn.length - 1; j >= 0; j--) { const ev = this.fn[j];
        for (const q of ev.parts) { const x = q.imp ? (ev.t === 0 ? 1 : 0) : this.noise() * q.e; q.e *= q.ed;
          const y = q.b0 * (x - q.x2) + q.a1 * q.y1 - q.a2 * q.y2; q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y; nz += y * q.g; }
        if (++ev.t >= ev.len) this.fn.splice(j, 1); }
      const feed = this.sympFeed;
      for (let k = 0; k < nS; k++) {
        const s = S[k];
        if (s.idle && (s.role !== 'symp' || (feed < 1e-7 && feed > -1e-7))) continue;
        if (s.role === 'symp') { if (s.idle) s.wake(); s.idle = false; const o = s.tick(feed); bsy += o; if (s.mag > 0) mgs += s.magOut(o) * 0.5; }
        else {
          if (s.sqT > 0 || s.sqL > 1e-6) { s.sqL += (s.sqT - s.sqL) * .002; const x = this.noise() * s.sqL, y = s.sqB * (x - s.sqx2) + s.sqA1 * s.sq1 - s.sqA2 * s.sq2;
            s.sqx2 = s.sqx1; s.sqx1 = x; s.sq2 = s.sq1; s.sq1 = y; nz += y * 6; }
          const o = s.tick(0); bm += o; if (s.mag > 0) mgs += s.magOut(o);
          if (oscOn && s.role !== 'drone') { // the synth oscillator follows each string's pitch and loudness
            const ao = o < 0 ? -o : o; s.oenv += (ao - s.oenv) * (ao > s.oenv ? 0.02 * SRK : 0.0006 * SRK);
            const dt = s.cf * oscMul; s.oph += dt; if (s.oph >= 1) s.oph -= 1;
            const w = oscWave(s.oph, dt, oscShape); oscSum += w * s.oenv; ringSum += w * o;
          }
        }
      }
      this.sympFeed = bm * sc;
      const bin = (bm + bsy + nz * .4) * cpl;
      let bl = 0, br = 0; const bx = bin - this.bin2; this.bin2 = this.bin1; this.bin1 = bin;
      for (let k = 0; k < nM; k++) {
        const m = M[k]; const y = m.b0 * bx + m.a1 * m.y1 - m.a2 * m.y2;
        m.y2 = m.y1; m.y1 = y; bl += y * m.aL; br += y * m.aR; m.e += y * y;
      }
      const bs = bm + bsy, p = bs * 0.5 + (bl + br) * 0.04, direct = bs * 0.06;
      // magnetic pickup coil + cable: resonant low-pass around 3.8 kHz, like a real single-coil's inductance
      { const v3 = mgs - this.pb, v1 = this.pa1 * this.pa + this.pa2 * v3, v2 = this.pb + this.pa2 * this.pa + this.pa3 * v3; this.pa = 2 * v1 - this.pa; this.pb = 2 * v2 - this.pb; mgs = v2 * 1.6; }
      const nzo = nz * (mic * .45 + pz * .35 + mg * .5); // the hand is near the pickups and the player's ear
      let l = mgs * mg + p * pz + (bl + direct) * mic + nzo;
      let r = mgs * mg + p * pz + (br + direct) * mic + nzo;
      // DC blockers
      let yl = l - dc[0] + this.dcA * dc[1]; dc[0] = l; dc[1] = yl;
      let yr = r - dc[2] + this.dcA * dc[3]; dc[2] = r; dc[3] = yr;
      syn.run(yl * mast, yr * mast, oscSum * mast * OSC_G, ringSum * mast * RING_G, i, n);
      // output: DC blocker after the synth, then a clean peak limiter at -1 dBFS (no colouring below it)
      rack.run(syn.l, syn.r);
      let ol = rack.l - dc[4] + this.dcB * dc[5]; dc[4] = rack.l; dc[5] = ol;
      let or = rack.r - dc[6] + this.dcB * dc[7]; dc[6] = rack.r; dc[7] = or;
      const pk = Math.max(ol < 0 ? -ol : ol, or < 0 ? -or : or);
      if (pk * this.lim > 0.891) this.lim = 0.891 / pk; else this.lim += (1 - this.lim) * this.limRel;
      ol *= this.lim; or *= this.lim;
      L[i] = ol > 1 ? 1 : ol < -1 ? -1 : ol; if (R !== L) R[i] = or > 1 ? 1 : or < -1 ? -1 : or;
      if (this.lim < this.limMin) this.limMin = this.lim;
    }
    if (++this.blk >= 6) {
      this.blk = 0;
      this.port.postMessage({ t: 'viz', amp: S.map(s => s.rms), note: S.map(s => s.harm ? s.touch : s.note + 12 * Math.log2(s.freq / s.target)), harm: S.map(s => !!s.harm),
        held: S.map(s => s.held || s.cont > 0.02), syn: syn.viz(), rig: rack.viz(), lim: this.limMin, modeE: M.map(m => { const e = m.e; m.e = 0; return e; }) });
      this.limMin = 1;
    }
    return true;
  }
}
registerProcessor('luither', LuitherProc);
