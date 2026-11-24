// ───────────────────────── amp face: pedals, amp head, cabinet definitions ─────────────────────────
// param: [key, label, min, max, default, log?, unit]
const PDIVS = []; for (const d of ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32']) PDIVS.push(d, d + '.', d + 't');
const PEDALS = {
  comp:   { name: 'Compressor', color: '#3c6e9e', board: 'pre', params: [['thresh', 'Threshold', -50, 0, -24, 0, 'dB'], ['ratio', 'Ratio', 1, 20, 4, 1, ':1'], ['attack', 'Attack', .1, 80, 5, 1, 'ms'], ['release', 'Release', 20, 1000, 150, 1, 'ms'], ['makeup', 'Makeup', 0, 24, 6, 0, 'dB'], ['blend', 'Blend', 0, 1, 1, 0, '%']] },
  boost:  { name: 'Clean boost', color: '#c9c2b0', board: 'pre', params: [['gain', 'Gain', 0, 20, 8, 0, 'dB'], ['tone', 'Tone', -1, 1, 0, 0, 'tilt']] },
  od:     { name: 'Overdrive', color: '#4f9d58', board: 'pre', params: [['drive', 'Drive', 0, 1, .5, 0, '%'], ['tone', 'Tone', 0, 1, .5, 0, '%'], ['level', 'Level', -24, 12, 0, 0, 'dB']] },
  dist:   { name: 'Distortion', color: '#2e2e2e', board: 'pre', params: [['dist', 'Distortion', 0, 1, .6, 0, '%'], ['filter', 'Filter', 0, 1, .4, 0, '%'], ['level', 'Level', -24, 12, 0, 0, 'dB']] },
  fuzz:   { name: 'Fuzz', color: '#b23b3b', board: 'pre', params: [['sustain', 'Sustain', 0, 1, .7, 0, '%'], ['tone', 'Tone', 0, 1, .5, 0, '%'], ['level', 'Level', -24, 12, 0, 0, 'dB']] },
  octave: { name: 'Octave fuzz', color: '#d08a2a', board: 'pre', params: [['fuzz', 'Fuzz', 0, 1, .6, 0, '%'], ['octave', 'Octave', 0, 1, .6, 0, '%'], ['level', 'Level', -24, 12, 0, 0, 'dB']] },
  crush:  { name: 'Bitcrusher', color: '#7a4fb0', board: 'pre', params: [['bits', 'Bits', 2, 16, 6, 0, 'bit'], ['down', 'Rate ÷', 1, 40, 4, 1, '×'], ['mix', 'Mix', 0, 1, 1, 0, '%']] },
  gate:   { name: 'Noise gate', color: '#4b4b4b', board: 'pre', params: [['thresh', 'Threshold', -80, -10, -55, 0, 'dB'], ['release', 'Release', 5, 500, 80, 1, 'ms'], ['range', 'Range', 6, 80, 60, 0, 'dB']] },
  geq:    { name: 'Graphic EQ', color: '#cfcfcf', board: 'pre', params: [['b0', '100', -12, 12, 0, 0, 'dB'], ['b1', '200', -12, 12, 0, 0, 'dB'], ['b2', '400', -12, 12, 0, 0, 'dB'], ['b3', '800', -12, 12, 0, 0, 'dB'], ['b4', '1.6k', -12, 12, 0, 0, 'dB'], ['b5', '3.2k', -12, 12, 0, 0, 'dB'], ['b6', '6.4k', -12, 12, 0, 0, 'dB'], ['level', 'Level', -12, 12, 0, 0, 'dB']], eq: true },
  phaser: { name: 'Phaser', color: '#e07a2a', board: 'pre', params: [['rate', 'Rate', .05, 8, .5, 1, 'Hz'], ['depth', 'Depth', 0, 1, .7, 0, '%'], ['center', 'Center', 150, 3000, 700, 1, 'Hz'], ['fb', 'Feedback', 0, .9, .4, 0, '%'], ['mix', 'Mix', 0, 1, 1, 0, '%']], opts: { stages: ['6', [['4', '4 stage'], ['6', '6 stage'], ['8', '8 stage'], ['12', '12 stage']]], sync: ['free', 'sync'] } },
  rotary: { name: 'Rotary speaker', color: '#8a5a2a', board: 'post', params: [['drive', 'Drive', 0, 1, .2, 0, '%'], ['balance', 'Horn/drum', 0, 1, .6, 0, '%'], ['spread', 'Mic spread', 0, 1, .6, 0, '%']], opts: { fast: [false, 'toggle', 'Fast'] } },
  delay:  { name: 'Tape delay', color: '#3f8f8a', board: 'post', params: [['time', 'Time', 20, 2000, 375, 1, 'ms'], ['fb', 'Feedback', 0, .95, .4, 0, '%'], ['mix', 'Mix', 0, 1, .35, 0, '%'], ['tone', 'Tone', 600, 12000, 3500, 1, 'Hz'], ['wow', 'Wow', 0, 1, .2, 0, '%']], opts: { sync: ['1/8.', 'sync'], pp: [false, 'toggle', 'Ping-pong'] } },
  spring: { name: 'Spring reverb', color: '#8c7a5a', board: 'post', params: [['decay', 'Decay', 0, 1, .5, 0, '%'], ['tone', 'Tone', 1000, 8000, 3500, 1, 'Hz'], ['mix', 'Mix', 0, 1, .35, 0, '%']] },
  hall:   { name: 'Hall reverb', color: '#4a5a8c', board: 'post', params: [['size', 'Size', 0, 1, .7, 0, '%'], ['damp', 'Damping', 0, 1, .5, 0, '%'], ['pre', 'Pre-delay', 0, 200, 20, 0, 'ms'], ['width', 'Width', 0, 1, 1, 0, '%'], ['mix', 'Mix', 0, 1, .3, 0, '%']] },
};
const AHP = { // amp head knobs
  gain: ['Gain', 0, 10, 5], bass: ['Bass', 0, 10, 5], mid: ['Middle', 0, 10, 5], treble: ['Treble', 0, 10, 5], presence: ['Presence', 0, 10, 5], master: ['Master', 0, 10, 5],
  stages: ['Gain stages', 1, 4, 2, 1], character: ['Clipping', 0, 1, .3], bias: ['Bias', 0, 1, .2], tight: ['Low cut', 20, 300, 70], sag: ['Sag', 0, 1, .3], pdrive: ['Power drive', 0, 1, .3], resonance: ['Resonance', 0, 1, .3],
};
const H = (stack, gain, stages, character, bias, tight, bright, bass, mid, treble, presence, resonance, sag, pdrive, master) => ({ stack, gain, stages, character, bias, tight, bright, bass, mid, treble, presence, resonance, sag, pdrive, master });
const C = (cab, speaker, mic, pos, dist, on = true) => ({ cab, speaker, mic, pos, dist, on });
const AMP_PRESETS = {
  'Clean American':    { head: H('fender', 2.8, 2, .15, .1, 60, true, 6, 4, 6.5, 5.5, .3, .35, .2, 6), cab: C('2x12 open', 'jensen', 'dyn57', .3, .2) },
  'British crunch':    { head: H('marshall', 6, 3, .35, .25, 90, false, 5, 7, 6, 6, .4, .3, .4, 5), cab: C('4x12', 'green', 'dyn57', .35, .25) },
  'High-gain modern':  { head: H('modern', 8.5, 4, .55, .3, 160, false, 6, 4.5, 6.5, 6.5, .6, .15, .3, 4.5), cab: C('4x12', 'v30', 'dyn57', .25, .15) },
  'Vintage tweed':     { head: H('fender', 6.5, 2, .1, .45, 50, true, 5, 6, 6, 5, .2, .8, .7, 6), cab: C('1x12 open', 'alnico', 'ribbon', .4, .35) },
  'Chime (top boost)': { head: H('vox', 5, 2, .25, .2, 80, false, 4.5, 5, 7, 6, .3, .5, .5, 5.5), cab: C('2x12 open', 'alnico', 'dyn57', .3, .3) },
  'Bass amp':          { head: H('flat', 3, 1, .2, .1, 25, false, 6.5, 5, 5, 5, .5, .3, .2, 6), cab: C('8x10 bass', 'bass', 'cond', .4, .3) },
  'Acoustic DI':       { head: H('flat', 1, 1, 0, 0, 40, false, 5, 5, 5.5, 5, 0, 0, 0, 6), cab: C('1x12 open', 'fullrange', 'cond', .5, .4, false) },
};
const AMP_OUT = {"Clean American": -9.5, "British crunch": -4.2, "High-gain modern": -3.6, "Vintage tweed": -3.1, "Chime (top boost)": -6.9, "Bass amp": -4.1, "Acoustic DI": -6.6}; // per-preset output trim (dB) from the QA calibration: strummed chords peak near -3 dBFS
let pedalUid = 1;
function newPedal(type) {
  const d = PEDALS[type], p = {}, o = {};
  for (const q of d.params) p[q[0]] = q[4];
  for (const k in d.opts || {}) o[k] = d.opts[k][0];
  return { uid: 'p' + (pedalUid++) + '_' + Math.random().toString(36).slice(2, 6), type, on: true, p, o };
}
function ampPreset(name, keep) {
  const pr = AMP_PRESETS[name];
  return { on: keep ? keep.on : true, preset: name, head: { ...pr.head }, cab: { ...pr.cab }, pre: keep ? keep.pre : [], post: keep ? keep.post : [], trim: AMP_OUT[name] || 0, out: keep ? keep.out || 0 : 0 };
}
function ampDefault() { const a = ampPreset('British crunch'); a.on = false; return a; }
