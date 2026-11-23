// ───────────────────────── shared filter maths (used by the audio engine and by the on-screen curves) ─────────────────────────
// RBJ cookbook biquads → [b0, b1, b2, a1, a2] (a0 normalised to 1)
function bqCoefs(type, f, q, gdb, fs) {
  f = Math.max(10, Math.min(f, fs * 0.45)); q = Math.max(0.05, q || 0.707);
  const w = 2 * Math.PI * f / fs, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, (gdb || 0) / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'ap': b0 = 1 - al; b1 = -2 * cw; b2 = 1 + al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'ls': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break; }
    case 'hs': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
    default: return [1, 0, 0, 0, 0];
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function bqMag(c, f, fs) { // |H(e^jw)|
  const w = 2 * Math.PI * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c[0] + c[1] * c1 + c[2] * c2, ni = -(c[1] * s1 + c[2] * s2), dr = 1 + c[3] * c1 + c[4] * c2, di = -(c[3] * s1 + c[4] * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}
// Amp tone stacks: each type has its own voicing (where the mid knob sits and its built-in scoop)
const STACKS = {
  fender:   { label: 'American (scooped)', bf: 110, mf: 420, mq: .6, base: -7, tf: 2600, bw: 2.4, mw: 1.4, tw: 2.6 },
  marshall: { label: 'British (mid-forward)', bf: 120, mf: 650, mq: .7, base: -2.5, tf: 3000, bw: 2.2, mw: 1.6, tw: 2.4 },
  vox:      { label: 'Top boost (chimey)', bf: 130, mf: 1000, mq: .8, base: -4, tf: 3400, bw: 1.8, mw: 1.3, tw: 3 },
  modern:   { label: 'Modern high-gain', bf: 90, mf: 750, mq: .9, base: -3, tf: 2800, bw: 2, mw: 2, tw: 2.2 },
  flat:     { label: 'Flat / bass', bf: 80, mf: 800, mq: .7, base: 0, tf: 3000, bw: 2.4, mw: 1.6, tw: 2.4 },
};
function toneStackDesign(h) { // knobs 0..10, 5 = flat-ish
  const s = STACKS[h.stack] || STACKS.marshall, out = [];
  out.push(['ls', s.bf, .7, (h.bass - 5) * s.bw]);
  out.push(['peak', s.mf, s.mq, s.base * (1 - h.mid / 10 * .6) + (h.mid - 5) * s.mw]);
  out.push(['hs', s.tf, .7, (h.treble - 5) * s.tw]);
  out.push(['hs', 3800, .6, (h.presence - 5) * 1.4]);
  out.push(['peak', 100, 1.1, h.resonance * 6]);
  if (h.bright) out.push(['hs', 2200, .7, 6 * (1 - Math.min(1, h.gain / 10) * .7)]);
  return out;
}
// Cabinet: speakers, box and microphone as a chain of filters
const CABS = {
  '1x12 open': { label: '1×12 open back', hp: 85, bump: [95, 1.2, 1], dip: [180, 1.2, -2] },
  '2x12 open': { label: '2×12 open back', hp: 75, bump: [100, 1.1, 2.5], dip: [200, 1.4, -1.5] },
  '2x12 closed': { label: '2×12 closed', hp: 70, bump: [105, 1.3, 4], dip: [300, 1, -1] },
  '4x12': { label: '4×12 closed', hp: 65, bump: [95, 1.5, 5.5], dip: [400, .9, -1.5] },
  '1x15 bass': { label: '1×15 bass', hp: 38, bump: [60, 1.2, 4], dip: [500, .8, -2] },
  '8x10 bass': { label: '8×10 bass', hp: 42, bump: [75, 1.1, 5], dip: [900, 1, -1] },
};
const SPEAKERS = {
  v30:      { label: 'Vintage 30 (aggressive mids)', pk: [2400, 1.3, 4.5], pk2: [1200, 1, 1.5], lp: 5200 },
  green:    { label: 'Greenback (warm, woody)', pk: [1500, 1.1, 3], pk2: [3000, 2, -2], lp: 4500 },
  alnico:   { label: 'Alnico blue (chimey)', pk: [3000, 1.4, 4], pk2: [700, 1, -1.5], lp: 6500 },
  jensen:   { label: 'American 12" (clean, scooped)', pk: [2200, 1.2, 2], pk2: [500, .8, -2.5], lp: 5500 },
  bass:     { label: 'Bass driver', pk: [800, 1, 2], pk2: [2200, 1, -3], lp: 3200 },
  fullrange:{ label: 'Full-range (for acoustic)', pk: [3000, 1, 0], pk2: [800, 1, 0], lp: 14000 },
};
const MICS = {
  dyn57: { label: 'Dynamic 57', fx: [['hp', 90, .7, 0], ['peak', 5500, 1.5, 5]] },
  ribbon: { label: 'Ribbon (dark, smooth)', fx: [['hs', 4000, .7, -6], ['ls', 160, .7, 2.5]] },
  cond: { label: 'Condenser (open, detailed)', fx: [['hs', 9000, .7, 2.5], ['peak', 2500, .9, 1]] },
};
function cabDesign(c) {
  const box = CABS[c.cab] || CABS['4x12'], spk = SPEAKERS[c.speaker] || SPEAKERS.v30, mic = MICS[c.mic] || MICS.dyn57, out = [];
  out.push(['hp', box.hp, .8, 0], ['peak', ...box.bump], ['peak', ...box.dip]);
  out.push(['peak', ...spk.pk], ['peak', ...spk.pk2]);
  const lp = spk.lp * (1 - c.pos * .45); // mic toward the edge of the cone = darker
  out.push(['lp', lp, .8, 0], ['lp', lp * 1.15, .6, 0]);
  out.push(['peak', 3500, .8, (0.5 - c.pos) * 6]); // centre = presence, edge = softer
  for (const f of mic.fx) out.push(f);
  out.push(['ls', 200, .7, (0.5 - c.dist) * 5]); // close = proximity bass, far = thinner
  return out;
}
