// ───────────────────────── synth face UI ─────────────────────────
let face = 'builder';
const MODNAME = { src: 'Pickup', osc: 'Osc', f1: 'Filter 1', f2: 'Filter 2', mfx: 'Mod FX', ps: 'Pitch', gate: 'Gate', amp: 'Amp', lfo1: 'LFO 1', lfo2: 'LFO 2', env1: 'Env 1', env2: 'Env 2', fol: 'Follower', ph: 'Physical' };
const sN = (id, v) => { const d = SP[id]; const n = d[4] ? Math.log(v / d[1]) / Math.log(d[2] / d[1]) : (v - d[1]) / (d[2] - d[1]); return Math.max(0, Math.min(1, n)); };
const sV = (id, n) => { const d = SP[id]; n = Math.max(0, Math.min(1, n)); return d[4] ? d[1] * Math.pow(d[2] / d[1], n) : d[1] + (d[2] - d[1]) * n; };
function sGet(id) { const ph = SPHYS[id]; return ph ? cfg[ph[0]][ph[1]] : cfg.synth.p[id]; }
function sSet(id, v) {
  const ph = SPHYS[id];
  if (ph) { cfg[ph[0]][ph[1]] = v; ph[0] === 'ex' ? pushEx() : pushNk(); syncCtl(ph[0] + '.' + ph[1]); }
  else { cfg.synth.p[id] = v; send('synth', { p: { [id]: v } }); }
}
function sFmt(id, v) {
  const u = SP[id][5];
  if (u === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : v >= 100 ? v.toFixed(0) : v.toFixed(v < 1 ? 2 : 1);
  if (u === '%') return Math.round(v * 100) + '%';
  if (u === 'st') return (v > 0 ? '+' : '') + v.toFixed(0);
  if (u === '¢') return (v > 0 ? '+' : '') + v.toFixed(0) + '¢';
  if (u === 's') return v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's';
  if (u === 'ms') return v.toFixed(v < 10 ? 1 : 0) + 'ms';
  if (u === 'x') return '×' + v.toFixed(2);
  if (u === 'bpm') return v.toFixed(0);
  if (u === 'pan') return Math.abs(v) < .02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
  if (u === 'vowel') return 'AEIOU'[Math.min(4, Math.round(v * 4))];
  if (u === 'shape') return ['Sine', 'Tri', 'Saw', 'Square'][Math.min(3, Math.round(v * 3))];
  return v.toFixed(2);
}
function pushSynth() { send('synth', { p: cfg.synth.p, o: cfg.synth.o, mods: cfg.synth.mods }); }
function pushMods() { send('synth', { mods: cfg.synth.mods }); }
function setOpt(k, v, rebuild) { cfg.synth.o[k] = v; send('synth', { o: { [k]: v } }); if (rebuild) buildSynth(); else drawSynthStatic(); }

// ── knobs (value arc + one coloured arc per modulation + live dot) ──
const knobs = {};
const A0 = -135, A1 = 135;
function arcD(r, a0, a1) {
  const p = a => [24 + r * Math.sin(a * Math.PI / 180), 24 - r * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function knob(id, small) {
  const wrap = el('div', { class: 'knob' + (small ? ' sm' : ''), 'data-id': id, title: SP[id][0] + ' — drag up/down, double-click to reset. Drop a source here to modulate.' });
  wrap.innerHTML = `<svg viewBox="0 0 48 48"><path class="trk" d="${arcD(17, A0, A1)}"/><g class="mods"></g><path class="val"/><circle class="cap" cx="24" cy="24" r="12"/><line class="ptr" x1="24" y1="24" x2="24" y2="14"/><circle class="live" r="2.6" cx="-9" cy="-9"/></svg><div class="kv"></div><div class="kl">${SP[id][0]}</div>`;
  knobs[id] = wrap;
  let y0, n0, drag = false;
  wrap.addEventListener('pointerdown', e => { if (e.button) return; drag = true; y0 = e.clientY; n0 = sN(id, sGet(id)); wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
  wrap.addEventListener('pointermove', e => { if (!drag) return; const n = n0 + (y0 - e.clientY) / (e.shiftKey ? 900 : 170); sSet(id, sV(id, n)); renderKnob(id); });
  wrap.addEventListener('pointerup', () => { drag = false; });
  wrap.addEventListener('dblclick', () => { sSet(id, SPHYS[id] ? SP[id][3] : synthDefault().p[id]); renderKnob(id); });
  renderKnob(id); return wrap;
}
function renderKnob(id) {
  const w = knobs[id]; if (!w) return;
  const v = sGet(id), n = sN(id, v), ang = A0 + (A1 - A0) * n, svg = w.firstChild;
  const bip = SP[id][1] < 0 && SP[id][2] > 0, zero = bip ? A0 + (A1 - A0) * sN(id, 0) : A0;
  svg.querySelector('.val').setAttribute('d', Math.abs(ang - zero) < .5 ? '' : arcD(17, Math.min(zero, ang), Math.max(zero, ang)));
  const r = ang * Math.PI / 180; const ptr = svg.querySelector('.ptr'); ptr.setAttribute('x2', 24 + 10 * Math.sin(r)); ptr.setAttribute('y2', 24 - 10 * Math.cos(r));
  const g = svg.querySelector('.mods'); g.innerHTML = '';
  cfg.synth.mods.filter(m => m.d === id).forEach((m, k) => {
    const bi = SRC[m.s]?.[2], lo = bi ? n - Math.abs(m.a) : Math.min(n, n + m.a), hi = bi ? n + Math.abs(m.a) : Math.max(n, n + m.a);
    const a0 = A0 + (A1 - A0) * Math.max(0, lo), a1 = A0 + (A1 - A0) * Math.min(1, hi);
    if (a1 - a0 > .5) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', arcD(21.5 - k * 2.2, a0, a1)); p.setAttribute('class', 'marc'); p.style.stroke = SRC[m.s][1]; g.append(p); }
  });
  w.classList.toggle('modded', cfg.synth.mods.some(m => m.d === id));
  w.querySelector('.kv').textContent = sFmt(id, v);
}
function renderAllKnobs() { for (const id in knobs) renderKnob(id); }

// ── drag a source chip onto a knob ──
function chip(src, extra) {
  const c = el('div', { class: 'chip', 'data-src': src, title: 'Drag onto any knob to modulate it' }, el('span', { class: 'grip' }, '⠿'), SRC[src][0]);
  c.style.setProperty('--c', SRC[src][1]);
  if (extra) c.append(extra);
  c.addEventListener('pointerdown', e => startDrag(e, src));
  return c;
}
let dragGhost = null, dragSrc = null, dropOn = null;
function startDrag(e, src) {
  e.preventDefault(); dragSrc = src;
  dragGhost = el('div', { class: 'chip ghost' }, '⠿ ' + SRC[src][0]); dragGhost.style.setProperty('--c', SRC[src][1]); document.body.append(dragGhost);
  document.body.classList.add('dragging');
  const mv = ev => { dragGhost.style.left = ev.clientX + 10 + 'px'; dragGhost.style.top = ev.clientY + 10 + 'px';
    const k = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.knob'); if (dropOn !== k) { dropOn?.classList.remove('over'); dropOn = k; k?.classList.add('over'); } };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    dragGhost.remove(); document.body.classList.remove('dragging'); dropOn?.classList.remove('over');
    if (dropOn) addMod(dragSrc, dropOn.dataset.id); dropOn = null; };
  mv(e); document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
function addMod(s, d) {
  if (!cfg.synth.mods.some(m => m.s === s && m.d === d)) cfg.synth.mods.push({ s, d, a: SRC[s][2] ? .25 : .35 });
  pushMods(); renderKnob(d); buildModList(d);
}
function dstName(id) { return (MODNAME[id.split('_')[0]] || '') + ' ' + SP[id][0]; }
function buildModList(flash) {
  const box = $('modList'); if (!box) return; box.innerHTML = '';
  if (!cfg.synth.mods.length) { box.append(el('div', { class: 'note' }, 'No modulation yet. Drag a coloured source chip (⠿) onto any knob, including the physical ones.')); return; }
  cfg.synth.mods.forEach((m, i) => {
    const amt = el('input', { type: 'range', min: -1, max: 1, step: .005 }); amt.value = m.a;
    const val = el('span', { class: 'mv' }, (m.a > 0 ? '+' : '') + Math.round(m.a * 100) + '%');
    amt.oninput = () => { m.a = +amt.value; val.textContent = (m.a > 0 ? '+' : '') + Math.round(m.a * 100) + '%'; pushMods(); renderKnob(m.d); };
    amt.ondblclick = () => { m.a = 0; amt.value = 0; amt.oninput(); };
    const row = el('div', { class: 'mrow' + (flash === m.d ? ' flash' : '') },
      el('span', { class: 'dot', style: `background:${SRC[m.s][1]}` }), el('span', { class: 'mn' }, `${SRC[m.s][0]} → ${dstName(m.d)}`),
      el('button', { class: 'x', title: 'Remove', onclick: () => { cfg.synth.mods.splice(i, 1); pushMods(); renderKnob(m.d); buildModList(); } }, '×'), amt, val);
    box.append(row);
  });
}

// ── cards ──
function card(title, onKey, extraHead) {
  const c = el('div', { class: 'card' + (onKey && !cfg.synth.o[onKey] ? ' off' : '') });
  const h = el('div', { class: 'ch' }, el('span', { class: 'ct' }, title));
  if (extraHead) h.append(extraHead);
  if (onKey) { const sw = el('button', { class: 'sw' + (cfg.synth.o[onKey] ? ' on' : ''), title: 'On / off' }); sw.onclick = () => { setOpt(onKey, !cfg.synth.o[onKey], true); }; h.append(sw); }
  c.append(h); return c;
}
const krow = (...ks) => el('div', { class: 'krow' }, ...ks);
function seg(opts, cur, on) { const s = el('div', { class: 'seg' }); opts.forEach(([v, l]) => s.append(el('button', { class: v === cur ? 'on' : '', onclick: () => on(v) }, l))); return s; }
function sel(opts, cur, on) { const s = el('select', { class: 'ssel' }); opts.forEach(([v, l]) => s.append(el('option', { value: v }, l))); s.value = cur; s.onchange = () => on(s.value); return s; }
function mini(id, h = 46) { return el('canvas', { class: 'mini', id, height: h }); }

// tempo divisions: '1/4' plain, '1/4.' dotted, '1/4t' triplet
const DIVS = []; for (const d of ['4/1', '2/1', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32']) DIVS.push(d, d + '.', d + 't');
const divLabel = d => d.endsWith('.') ? d.slice(0, -1) + ' dotted' : d.endsWith('t') ? d.slice(0, -1) + ' triplet' : d;
function syncSel(key, withFree) {
  const opts = (withFree ? [['free', 'Free (Hz)']] : []).concat(DIVS.map(d => [d, divLabel(d)]));
  return sel(opts, cfg.synth.o[key] || (withFree ? 'free' : '1/16'), v => setOpt(key, v, true));
}
function buildSynth() {
  for (const k in knobs) delete knobs[k];
  const root = $('synth'); root.innerHTML = '';
  const o = cfg.synth.o;
  if (typeof o.gate_div === 'number') o.gate_div = '1/' + o.gate_div;
  const bar = el('div', { class: 'sbar' }, el('span', { class: 'ct', style: 'flex:0 0 auto' }, 'Synth patch'),
    sel(Object.keys(SPRESETS).map(k => [k, k]), cfg.synth.preset || '', v => { cfg.synth = synthPreset(v); pushSynth(); buildSynth(); }),
    el('span', { class: 'ct', style: 'flex:0 0 auto;margin-left:14px' }, 'Tempo'), knob('tempo', 2),
    el('span', { class: 'note', style: 'margin:0 0 0 8px;flex:1' }, 'Every synced rate (LFOs, Mod FX, Gate) follows this tempo. Patches only change this face; saving an instrument saves its patch too.'));
  const G = el('div', { class: 'sgrid' });
  root.append(bar, G);
  const put = (c, span) => { c.classList.add('s' + span); G.append(c); return c; };
  const head = (src) => { const c = card('', null, chip(src)); c.querySelector('.ct').remove(); return c; };
  // row 1: modulation sources
  for (const i of [1, 2]) {
    const k = 'lfo' + i, c = head(k), sync = o[k + '_sync'] || 'free';
    c.append(mini('cv_' + k, 34), el('div', { class: 'two' },
      sel([['sine', 'Sine'], ['tri', 'Triangle'], ['saw', 'Saw up'], ['ramp', 'Saw down'], ['square', 'Square'], ['sh', 'Sample & hold'], ['smooth', 'Smooth random']], o[k + '_shape'], v => setOpt(k + '_shape', v)),
      syncSel(k + '_sync', true)),
      krow(sync === 'free' ? knob(k + '_rate', 1) : el('div', { class: 'syncbig' }, divLabel(sync)),
        el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!o[k + '_retrig'], onchange: e => setOpt(k + '_retrig', e.target.checked) }), 'Restart on note')));
    put(c, 2);
  }
  for (const i of [1, 2]) { const k = 'env' + i, c = head(k); c.append(mini('cv_' + k, 34), krow(knob(k + '_a', 1), knob(k + '_d', 1), knob(k + '_s', 1), knob(k + '_r', 1))); put(c, 2); }
  { const c = head('fol'); c.append(el('div', { class: 'meter' }, el('i', { id: 'm_fol' })), krow(knob('fol_atk', 1), knob('fol_rel', 1), knob('fol_gain', 1)),
      el('div', { class: 'note' }, 'How loud the instrument is playing.')); put(c, 2); }
  { const c = card('Performance'); const g = el('div', { class: 'chips' });
    ['vel', 'note', 'mw', 'rnd', 'energy', 'gate'].forEach(s => g.append(chip(s, el('i', { class: 'cbar', id: 'cb_' + s }))));
    c.append(g); put(c, 2); }
  // row 2: the sound path
  { const c = card('Pickup → Oscillator'); c.append(seg([['layer', 'Layer'], ['morph', 'Morph'], ['ring', 'Ring']], o.osc_mode, v => setOpt('osc_mode', v, true)), mini('cv_osc', 34),
      krow(knob('src_lvl', 1), knob('osc_lvl', 1), knob('osc_shape', 1), knob('osc_semi', 1), knob('osc_fine', 1)),
      el('div', { class: 'note' }, { layer: 'Adds a synth voice that follows each string.', morph: 'Crossfades the string into a synth voice that keeps its dynamics.', ring: 'Multiplies each string by its own oscillator: metallic, bell-like.' }[o.osc_mode]));
    put(c, 3); }
  for (const f of [1, 2]) {
    const k = 'f' + f, extra = f === 2 ? sel([['serial', 'After filter 1'], ['parallel', 'Beside filter 1']], o.f_route, v => setOpt('f_route', v)) : null;
    const c = card('Filter ' + f, k + '_on', extra);
    c.append(sel([['lp', 'Low-pass'], ['bp', 'Band-pass (wah)'], ['hp', 'High-pass'], ['notch', 'Notch'], ['peak', 'Peak'], ['formant', 'Formant (vowels)']], o[k + '_type'], v => setOpt(k + '_type', v, true)),
      mini('cv_' + k, 40), krow(knob(k + '_cut', 1), knob(k + '_res', 1), ...(o[k + '_type'] === 'formant' ? [knob(k + '_vowel', 1)] : [knob(k + '_drive', 1)]), knob(k + '_mix', 1)));
    put(c, 3);
  }
  { const c = card('Mod FX', 'mfx_on'), sync = o.mfx_sync || 'free';
    const q = (ms, dp, rt, fb, mx, sp) => { Object.assign(cfg.synth.p, { mfx_time: ms, mfx_depth: dp, mfx_rate: rt, mfx_fb: fb, mfx_mix: mx, mfx_spread: sp }); cfg.synth.o.mfx_on = true; cfg.synth.o.mfx_sync = 'free'; pushSynth(); buildSynth(); };
    c.append(el('div', { class: 'seg' }, el('button', { onclick: () => q(16, .22, .7, 0, .45, 1) }, 'Chorus'), el('button', { onclick: () => q(1.2, .85, .18, .78, .5, .25) }, 'Flanger'), el('button', { onclick: () => q(3, .13, 5.8, 0, 1, .1) }, 'Vibrato')),
      el('div', { class: 'two' }, el('span', { class: 'note', style: 'margin:0' }, 'Rate sync'), syncSel('mfx_sync', true)),
      krow(knob('mfx_time', 1), knob('mfx_depth', 1), sync === 'free' ? knob('mfx_rate', 1) : el('div', { class: 'syncbig sm' }, divLabel(sync)), knob('mfx_fb', 1), knob('mfx_mix', 1), knob('mfx_spread', 1)));
    put(c, 3); }
  // row 3: pitch, gate, amp, physical, modulation list
  { const c = card('Pitch shifter', 'ps_on'); c.append(krow(knob('ps_semi', 1), knob('ps_fine', 1), knob('ps_mix', 1), knob('ps_fb', 1)), el('div', { class: 'note' }, 'Mix up to 50% adds the shifted copy; above, it replaces the original.')); put(c, 2); }
  { const c = card('Gate', 'gate_on'); const steps = el('div', { class: 'steps', id: 'gsteps' });
    o.gate_steps.forEach((v, i) => steps.append(el('button', { class: v ? 'on' : '', onclick: e => { o.gate_steps[i] = o.gate_steps[i] ? 0 : 1; e.target.classList.toggle('on'); setOpt('gate_steps', o.gate_steps.slice()); } })));
    c.append(steps, el('div', { class: 'two' }, el('span', { class: 'note', style: 'margin:0' }, 'Step length'), syncSel('gate_div', false)), krow(knob('gate_depth', 1), knob('gate_smooth', 1)));
    put(c, 3); }
  { const c = card('Amp'); c.append(krow(knob('amp_lvl', 1), knob('amp_pan', 1))); put(c, 2); }
  { const c = card('Physical'); const t = cfg.ex.type, rel = { ph_pressure: t === 'bow', ph_speed: t === 'bow', ph_ebow: t === 'ebow', ph_wind: t === 'wind' };
    c.append(el('div', { class: 'krow wrap' }, ...Object.keys(SPHYS).map(id => { const k = knob(id, 1); if (rel[id] === false) k.classList.add('dim'); return k; })));
    put(c, 3); }
  { const c = card('Modulation'); c.append(el('div', { id: 'modList' })); put(c, 2); }
  buildModList();
  requestAnimationFrame(() => { sizeMinis(); drawSynthLive(); });
}
window.addEventListener('resize', () => { if (face === 'synth') { sizeMinis(); drawSynthLive(); } });
function sizeMinis() { document.querySelectorAll('#synth canvas.mini').forEach(c => { const d = devicePixelRatio || 1; c.width = c.clientWidth * d; c.height = c.clientHeight * d; }); }
// the value a knob is really at right now: its setting plus any live modulation
function liveVal(id) { const mv = viz.syn && viz.syn.mv && viz.syn.mv[id]; return mv != null ? sV(id, mv) : cfg.synth.p[id]; }

// oscillator shape and filter curves, drawn from live values so they move with knobs and modulation
function drawSynthStatic() { drawSynthLive(); }
function drawSynthLive() {
  const o = cfg.synth.o, p = {}; for (const k of ['osc_shape', 'f1_cut', 'f1_res', 'f1_vowel', 'f2_cut', 'f2_res', 'f2_vowel']) p[k] = liveVal(k);
  const cvO = $('cv_osc'); if (cvO) { const c = cvO.getContext('2d'), W = cvO.width, H = cvO.height; c.clearRect(0, 0, W, H); c.strokeStyle = '#f2c568'; c.lineWidth = 2 * devicePixelRatio; c.beginPath();
    for (let x = 0; x <= W; x++) { const ph = (x / W * 2) % 1, y = oscWaveUI(ph, p.osc_shape); x ? c.lineTo(x, H / 2 - y * H * .38) : c.moveTo(x, H / 2 - y * H * .38); } c.stroke(); }
  for (const f of [1, 2]) { const cv = $('cv_f' + f); if (!cv) continue; const c = cv.getContext('2d'), W = cv.width, H = cv.height, k = 'f' + f; c.clearRect(0, 0, W, H);
    const cut = p[k + '_cut'], kk = 2 - 1.96 * p[k + '_res'], type = o[k + '_type'];
    c.strokeStyle = 'rgba(255,255,255,.06)'; [100, 1000, 10000].forEach(fr => { const x = Math.log(fr / 20) / Math.log(1000) * W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); });
    c.strokeStyle = o[k + '_on'] ? '#7fc4b8' : '#5a4b3a'; c.lineWidth = 2 * devicePixelRatio; c.beginPath();
    for (let x = 0; x <= W; x += 2) { const fr = 20 * Math.pow(1000, x / W); let mag;
      if (type === 'formant') { const vw = p[k + '_vowel'] * 4, i0 = Math.min(3, Math.floor(vw)), t = vw - i0, sc = Math.max(.5, Math.min(2, cut / 1000)); mag = 0;
        [1.6, 1.1, .7].forEach((g, j) => { const F = (VOWELS_UI[i0][j] + (VOWELS_UI[i0 + 1][j] - VOWELS_UI[i0][j]) * t) * sc, w = fr / F; mag += g * .5 / Math.sqrt(((1 - w * w) / (.12 * w)) ** 2 + 1); }); }
      else { const w = fr / cut, re = 1 - w * w, im = kk * w, den = Math.sqrt(re * re + im * im);
        mag = type === 'lp' ? 1 / den : type === 'hp' ? w * w / den : type === 'bp' ? (im / den) * (1 + 3 / (kk + .3)) * .8 : type === 'notch' ? Math.abs(re) / den : (1 + w * w) / den; }
      const db = 20 * Math.log10(Math.max(1e-4, mag)), y = H * .55 - db / 30 * H * .5; x ? c.lineTo(x, Math.max(1, Math.min(H - 1, y))) : c.moveTo(x, Math.max(1, Math.min(H - 1, y))); }
    c.stroke(); }
}
const VOWELS_UI = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
function oscWaveUI(ph, m) { const s = Math.sin(2 * Math.PI * ph), tri = ph < .5 ? 4 * ph - 1 : 3 - 4 * ph, saw = 2 * ph - 1, sq = ph < .5 ? .8 : -.8;
  if (m < 1 / 3) return s + (tri - s) * m * 3; if (m < 2 / 3) return tri + (saw - tri) * (m - 1 / 3) * 3; return saw + (sq - saw) * Math.min(1, (m - 2 / 3) * 3); }

// live: LFO phase, envelopes, meters, gate step, modulated knob dots
function synthFrame() {
  drawSynthLive();
  const sv = viz.syn; if (!sv) return;
  const d = devicePixelRatio || 1;
  for (const i of [1, 2]) { const cv = $('cv_lfo' + i); if (!cv) continue; const c = cv.getContext('2d'), W = cv.width, H = cv.height, sh = cfg.synth.o['lfo' + i + '_shape'];
    c.clearRect(0, 0, W, H); c.strokeStyle = SRC['lfo' + i][1]; c.lineWidth = 2 * d; c.beginPath();
    const f = ph => sh === 'tri' ? (ph < .5 ? 4 * ph - 1 : 3 - 4 * ph) : sh === 'saw' ? 2 * ph - 1 : sh === 'ramp' ? 1 - 2 * ph : sh === 'square' ? (ph < .5 ? 1 : -1) : sh === 'sh' || sh === 'smooth' ? Math.sin(ph * 37.1) * Math.cos(ph * 11.3) : Math.sin(2 * Math.PI * ph);
    for (let x = 0; x <= W; x += 2) { const y = H / 2 - f(x / W) * H * .38; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    const v = sv.src['lfo' + i]; c.fillStyle = '#fff'; c.beginPath(); c.arc(sv.lfoPh[i - 1] * W, H / 2 - v * H * .38, 4 * d, 0, 7); c.fill(); }
  for (const i of [1, 2]) { const cv = $('cv_env' + i); if (!cv) continue; const c = cv.getContext('2d'), W = cv.width, H = cv.height, p = cfg.synth.p, k = 'env' + i;
    const a = p[k + '_a'], dd = p[k + '_d'], s = p[k + '_s'], r = p[k + '_r'], tot = a + dd + .4 + r, X = t => t / tot * W, Y = v => H - 4 * d - v * (H - 8 * d);
    c.clearRect(0, 0, W, H); c.strokeStyle = SRC[k][1]; c.lineWidth = 2 * d; c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(X(a), Y(1));
    for (let t = 0; t <= 1; t += .1) c.lineTo(X(a + dd * t), Y(s + (1 - s) * Math.exp(-4 * t))); c.lineTo(X(a + dd + .4), Y(s));
    for (let t = 0; t <= 1; t += .1) c.lineTo(X(a + dd + .4 + r * t), Y(s * Math.exp(-4.6 * t))); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(0, Y(sv.src[k]) - d, W * .06, 2 * d); }
  const m = $('m_fol'); if (m) m.style.width = Math.round(sv.src.fol * 100) + '%';
  for (const s of ['vel', 'note', 'mw', 'rnd', 'energy', 'gate']) { const b = $('cb_' + s); if (b) b.style.width = Math.round((sv.src[s] || 0) * 100) + '%'; }
  const gs = $('gsteps'); if (gs) [...gs.children].forEach((b, i) => b.classList.toggle('cur', i === sv.step && cfg.synth.o.gate_on));
  for (const id in knobs) { const w = knobs[id], dot = w.querySelector('.live'); const n = sv.mv[id];
    if (n == null) { dot.setAttribute('cx', -9); continue; } const a = (A0 + (A1 - A0) * n) * Math.PI / 180; dot.setAttribute('cx', 24 + 17 * Math.sin(a)); dot.setAttribute('cy', 24 - 17 * Math.cos(a)); }
}
function setFace(f) {
  face = f;
  document.querySelectorAll('.faces button').forEach(b => b.classList.toggle('on', b.dataset.face === f));
  document.querySelector('main').classList.toggle('synthOn', f === 'synth');
  document.querySelector('main').classList.toggle('ampOn', f === 'amp');
  if (f === 'synth') buildSynth(); else if (f === 'amp') buildAmp(); else requestAnimationFrame(fit);
}
