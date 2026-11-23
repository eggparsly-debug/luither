// ───────────────────────── synth face: parameters, sources, presets ─────────────────────────
// id: [label, min, max, default, log?, unit]
const SP = {
  src_lvl: ['Pickup', 0, 2, 1, 0, 'x'],
  osc_lvl: ['Osc level', 0, 1, 0, 0, '%'], osc_shape: ['Shape', 0, 1, .66, 0, 'shape'], osc_semi: ['Pitch', -24, 24, 0, 0, 'st'], osc_fine: ['Fine', -100, 100, 0, 0, '¢'],
  f1_cut: ['Cutoff', 20, 20000, 2000, 1, 'Hz'], f1_res: ['Reso', 0, 1, .2, 0, '%'], f1_drive: ['Drive', 0, 1, 0, 0, '%'], f1_vowel: ['Vowel', 0, 1, 0, 0, 'vowel'], f1_mix: ['Mix', 0, 1, 1, 0, '%'],
  f2_cut: ['Cutoff', 20, 20000, 6000, 1, 'Hz'], f2_res: ['Reso', 0, 1, .2, 0, '%'], f2_drive: ['Drive', 0, 1, 0, 0, '%'], f2_vowel: ['Vowel', 0, 1, 0, 0, 'vowel'], f2_mix: ['Mix', 0, 1, 1, 0, '%'],
  mfx_time: ['Time', .2, 30, 3, 1, 'ms'], mfx_depth: ['Depth', 0, 1, .3, 0, '%'], mfx_rate: ['Rate', .02, 12, .5, 1, 'Hz'], mfx_fb: ['Feedback', -.95, .95, 0, 0, '%'],
  mfx_mix: ['Mix', 0, 1, .5, 0, '%'], mfx_spread: ['Stereo', 0, 1, .5, 0, '%'],
  ps_semi: ['Shift', -24, 24, 12, 0, 'st'], ps_fine: ['Fine', -100, 100, 0, 0, '¢'], ps_mix: ['Mix', 0, 1, .3, 0, '%'], ps_fb: ['Feedback', 0, .9, 0, 0, '%'],
  tempo: ['Tempo', 40, 240, 120, 0, 'bpm'], gate_depth: ['Depth', 0, 1, 1, 0, '%'], gate_smooth: ['Smooth', 1, 60, 5, 1, 'ms'],
  amp_lvl: ['Level', 0, 2, 1, 0, 'x'], amp_pan: ['Pan', -1, 1, 0, 0, 'pan'],
  lfo1_rate: ['Rate', .02, 20, 1, 1, 'Hz'], lfo2_rate: ['Rate', .02, 20, .25, 1, 'Hz'],
  env1_a: ['Attack', .001, 4, .005, 1, 's'], env1_d: ['Decay', .005, 4, .4, 1, 's'], env1_s: ['Sustain', 0, 1, .5, 0, '%'], env1_r: ['Release', .005, 6, .5, 1, 's'],
  env2_a: ['Attack', .001, 4, .3, 1, 's'], env2_d: ['Decay', .005, 4, .8, 1, 's'], env2_s: ['Sustain', 0, 1, .7, 0, '%'], env2_r: ['Release', .005, 6, 1, 1, 's'],
  fol_atk: ['Attack', .001, .2, .005, 1, 's'], fol_rel: ['Release', .01, 1, .15, 1, 's'], fol_gain: ['Sensitivity', 0, 1, .5, 0, '%'],
  // physical parameters live in the builder; the synth face shows and modulates them
  ph_pos: ['Pluck/bow position', .02, .5, .15, 0, '%'], ph_pressure: ['Bow pressure', 0, 1, .5, 0, '%'], ph_speed: ['Bow speed', 0, 1, .5, 0, '%'],
  ph_ebow: ['E-bow strength', 0, 1, .6, 0, '%'], ph_wind: ['Wind speed', 0, 1, .5, 0, '%'], ph_jawari: ['Jawari', 0, 1, 0, 0, '%'], ph_buzz: ['Fret buzz', 0, 1, 0, 0, '%'],
};
const SPHYS = { ph_pos: ['ex', 'pos'], ph_pressure: ['ex', 'pressure'], ph_speed: ['ex', 'speed'], ph_ebow: ['ex', 'ebow'], ph_wind: ['ex', 'wind'], ph_jawari: ['nk', 'jawari'], ph_buzz: ['nk', 'buzz'] };
const SRC = {
  lfo1: ['LFO 1', '#7fc4b8', 1], lfo2: ['LFO 2', '#5fa8e0', 1], env1: ['Env 1', '#e9b65a'], env2: ['Env 2', '#e0805a'],
  fol: ['Follower', '#c58ce0'], vel: ['Velocity', '#9fd49a'], note: ['Note', '#d8d070'], mw: ['Mod wheel', '#f08a8a'],
  rnd: ['Random', '#b0b0b0'], energy: ['String energy', '#ff9e5e'], gate: ['Gate', '#80d0c0'],
};
const SOPT = () => ({ osc_mode: 'layer', f1_on: false, f1_type: 'lp', f2_on: false, f2_type: 'hp', f_route: 'serial', mfx_on: false, ps_on: false,
  gate_on: false, gate_div: '1/16', lfo1_sync: 'free', lfo2_sync: 'free', mfx_sync: 'free', gate_steps: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1], lfo1_shape: 'sine', lfo1_retrig: false, lfo2_shape: 'smooth', lfo2_retrig: false });
function synthDefault() {
  const p = {}; for (const k in SP) if (!SPHYS[k]) p[k] = SP[k][3];
  return { preset: 'Init (clean)', p, o: SOPT(), mods: [] };
}
const SM = (s, d, a) => ({ s, d, a });
const SPRESETS = {
  'Init (clean)': {},
  'Auto-wah': { p: { f1_cut: 300, f1_res: .78, fol_gain: .5, fol_atk: .004, fol_rel: .14 }, o: { f1_on: true, f1_type: 'bp' }, mods: [SM('fol', 'f1_cut', .38)] },
  'Envelope filter (quack)': { p: { f1_cut: 220, f1_res: .72, env1_a: .002, env1_d: .28, env1_s: 0, env1_r: .2 }, o: { f1_on: true, f1_type: 'lp' }, mods: [SM('env1', 'f1_cut', .6), SM('vel', 'f1_cut', .15)] },
  'Electric vibrato': { p: { mfx_time: 3, mfx_depth: .13, mfx_rate: 5.8, mfx_fb: 0, mfx_mix: 1, mfx_spread: .1 }, o: { mfx_on: true } },
  'Throb (uni-vibe)': { p: { mfx_time: 3, mfx_depth: .1, mfx_rate: 4.2, mfx_fb: 0, mfx_mix: 1, f1_cut: 900, f1_res: .45, f1_mix: .55, lfo1_rate: 4.2 }, o: { mfx_on: true, f1_on: true, f1_type: 'notch' }, mods: [SM('lfo1', 'f1_cut', .18), SM('lfo1', 'amp_lvl', .06)] },
  'Flanger': { p: { amp_lvl: 1.2, mfx_time: 1.2, mfx_depth: .85, mfx_rate: .18, mfx_fb: .78, mfx_mix: .5, mfx_spread: .25 }, o: { mfx_on: true } },
  'Jet flanger': { p: { mfx_time: .9, mfx_depth: .9, mfx_rate: .09, mfx_fb: -.88, mfx_mix: .5, mfx_spread: .3 }, o: { mfx_on: true } },
  'Chorus': { p: { amp_lvl: 1.3, mfx_time: 16, mfx_depth: .22, mfx_rate: .7, mfx_fb: 0, mfx_mix: .45, mfx_spread: 1 }, o: { mfx_on: true } },
  'Tremolo': { p: { lfo1_rate: 6, amp_lvl: 1 }, o: { lfo1_shape: 'sine', lfo1_sync: '1/16' }, mods: [SM('lfo1', 'amp_lvl', .22)] },
  'Harmonic tremolo': { p: { amp_lvl: 1.9, lfo1_rate: 5, f1_cut: 700, f1_res: 0, f2_cut: 700, f2_res: 0 }, o: { f1_on: true, f1_type: 'lp', f2_on: true, f2_type: 'hp', f_route: 'parallel', lfo1_shape: 'sine' }, mods: [SM('lfo1', 'f1_mix', .5), SM('lfo1', 'f2_mix', -.5)] },
  'Trance gate': { p: { tempo: 120, gate_depth: 1, gate_smooth: 4 }, o: { gate_on: true, gate_div: '1/16', gate_steps: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1] } },
  'Talk box': { p: { f1_cut: 950, f1_vowel: .5, lfo1_rate: .45 }, o: { f1_on: true, f1_type: 'formant', lfo1_shape: 'tri' }, mods: [SM('lfo1', 'f1_vowel', .5), SM('mw', 'f1_vowel', .4)] },
  'Octave shimmer': { p: { ps_semi: 12, ps_mix: .38, ps_fb: .45, mfx_time: 20, mfx_depth: .2, mfx_rate: .4, mfx_mix: .35, mfx_spread: 1 }, o: { ps_on: true, mfx_on: true } },
  'Sub-octave synth': { p: { osc_lvl: .5, osc_shape: .66, osc_semi: -12, f1_cut: 700, f1_res: .35, env1_a: .002, env1_d: .5, env1_s: .2 }, o: { osc_mode: 'layer', f1_on: true, f1_type: 'lp' }, mods: [SM('env1', 'f1_cut', .35)] },
  'Ring-mod bells': { p: { amp_lvl: 1.6, osc_lvl: .75, osc_shape: 0, osc_semi: 19 }, o: { osc_mode: 'ring' } },
  'Saw morph': { p: { amp_lvl: 1.55, osc_lvl: .7, osc_shape: .66, f1_cut: 2500, f1_res: .3 }, o: { osc_mode: 'morph', f1_on: true, f1_type: 'lp' }, mods: [SM('fol', 'f1_cut', .25), SM('lfo2', 'osc_shape', .15)] },
  'Bow swell': { p: { env1_a: 1.1, env1_d: .5, env1_s: 1, env1_r: .7, amp_lvl: 0 }, mods: [SM('env1', 'amp_lvl', .5)] },
  'Wandering bow': { p: { amp_lvl: .8, lfo1_rate: .3, lfo2_rate: .12 }, o: { lfo1_shape: 'sine', lfo2_shape: 'smooth' }, mods: [SM('lfo2', 'ph_pos', .3), SM('lfo1', 'ph_pressure', .25)] },
  'Breathing jawari': { p: { lfo1_rate: .2 }, o: { lfo1_shape: 'tri' }, mods: [SM('lfo1', 'ph_jawari', .45), SM('fol', 'ph_jawari', .2)] },
};
function synthPreset(name) {
  const d = synthDefault(), pr = SPRESETS[name] || {};
  Object.assign(d.p, pr.p || {}); Object.assign(d.o, pr.o || {}); d.mods = (pr.mods || []).map(m => ({ ...m })); d.preset = name;
  return d;
}
// length of a tempo division in quarter-note beats: '1/4' = 1, '1/8.' = 0.75 (dotted), '1/8t' = 1/3 (triplet)
function divBeats(d) { const m = /^(\d+)\/(\d+)([.t]?)$/.exec(String(d)); if (!m) return 1; return 4 * m[1] / m[2] * (m[3] === '.' ? 1.5 : m[3] === 't' ? 2 / 3 : 1); }
function synthDefs() { const d = {}; for (const k in SP) d[k] = { min: SP[k][1], max: SP[k][2], log: !!SP[k][4] }; return d; }
