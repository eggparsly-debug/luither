// ───────────────────────── amp face UI ─────────────────────────
function pushAmp() { send('amp', cfg.amp); try { markEdit(); } catch (e) {} }
let ampSendQ = false;
function pushAmpSoon() { if (ampSendQ) return; ampSendQ = true; requestAnimationFrame(() => { ampSendQ = false; pushAmp(); }); }
// generic knob (same look as the synth face, not a modulation target)
function gknob(o) {
  const w = el('div', { class: 'knob sm', title: o.label + ' — drag up/down, double-click to reset' });
  w.innerHTML = `<svg viewBox="0 0 48 48"><path class="trk" d="${arcD(17, A0, A1)}"/><path class="val"/><circle class="cap" cx="24" cy="24" r="12"/><line class="ptr" x1="24" y1="24" x2="24" y2="14"/></svg><div class="kv"></div><div class="kl">${o.label}</div>`;
  const toN = v => o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min);
  const fromN = n => { n = Math.max(0, Math.min(1, n)); let v = o.log ? o.min * Math.pow(o.max / o.min, n) : o.min + (o.max - o.min) * n; if (o.step) v = Math.round(v / o.step) * o.step; return v; };
  const draw = () => { const v = o.get(), n = toN(v), ang = A0 + (A1 - A0) * n, svg = w.firstChild, bip = o.min < 0 && o.max > 0, z = bip ? A0 + (A1 - A0) * toN(0) : A0;
    svg.querySelector('.val').setAttribute('d', Math.abs(ang - z) < .5 ? '' : arcD(17, Math.min(z, ang), Math.max(z, ang)));
    const r = ang * Math.PI / 180, p = svg.querySelector('.ptr'); p.setAttribute('x2', 24 + 10 * Math.sin(r)); p.setAttribute('y2', 24 - 10 * Math.cos(r));
    w.querySelector('.kv').textContent = o.fmt ? o.fmt(v) : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)); };
  let y0, n0, drag = false;
  w.addEventListener('pointerdown', e => { if (e.button) return; drag = true; y0 = e.clientY; n0 = toN(o.get()); w.setPointerCapture(e.pointerId); e.preventDefault(); });
  w.addEventListener('pointermove', e => { if (!drag) return; o.set(fromN(n0 + (y0 - e.clientY) / (e.shiftKey ? 900 : 170))); draw(); });
  w.addEventListener('pointerup', () => drag = false);
  w.addEventListener('dblclick', () => { if (o.def !== undefined) { o.set(o.def); draw(); } });
  draw(); w._draw = draw; return w;
}
const ufmt = (u) => v => u === 'dB' ? (v > 0 ? '+' : '') + v.toFixed(1) : u === '%' ? Math.round(v * 100) + '%' : u === 'Hz' ? (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 2 : 0)) : u === 'ms' ? v.toFixed(v < 10 ? 1 : 0) + 'ms' : u === ':1' ? v.toFixed(1) + ':1' : u === 'tilt' ? (v > 0 ? 'bright ' : v < 0 ? 'dark ' : '') + Math.abs(v * 100).toFixed(0) : u === 'bit' ? v.toFixed(0) + ' bit' : u === '×' ? '÷' + v.toFixed(0) : v.toFixed(1);
function ampEdited() { if (cfg.amp.preset !== 'Custom') { cfg.amp.preset = 'Custom'; const s = $('ampPreset'); if (s) s.value = 'Custom'; } pushAmpSoon(); }

// ── pedal ──
let dragUid = null;
// drag a pedal by its ⠿ grip: drop it between pedals on either board
function startPedalDrag(e, uid, card) {
  e.preventDefault(); dragUid = uid; card.classList.add('dragging');
  const ghost = el('div', { class: 'chip ghost', style: '--c:' + PEDALS[[...cfg.amp.pre, ...cfg.amp.post].find(p => p.uid === uid).type].color + ';color:#fff' }, '⠿ ' + card.querySelector('.pn').textContent); document.body.append(ghost);
  let target = null;
  const mv = ev => { ghost.style.left = ev.clientX + 10 + 'px'; ghost.style.top = ev.clientY + 10 + 'px';
    const b = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.board'); document.querySelectorAll('.board').forEach(x => x.classList.toggle('over', x === b)); target = b ? { b, x: ev.clientX } : null; };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); ghost.remove(); card.classList.remove('dragging');
    document.querySelectorAll('.board').forEach(x => x.classList.remove('over'));
    if (target) { const which = target.b.dataset.b; let item;
      for (const k of ['pre', 'post']) { const i = cfg.amp[k].findIndex(p => p.uid === uid); if (i >= 0) item = cfg.amp[k].splice(i, 1)[0]; }
      const after = [...target.b.querySelectorAll('.pedal')].filter(p => p.dataset.uid !== uid).find(p => { const r = p.getBoundingClientRect(); return target.x < r.left + r.width / 2; });
      const idx = after ? cfg.amp[which].findIndex(p => p.uid === after.dataset.uid) : -1;
      if (idx >= 0) cfg.amp[which].splice(idx, 0, item); else cfg.amp[which].push(item);
      pushAmp(); buildAmp(); }
    dragUid = null; };
  mv(e); document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
function pedalEl(d, board) {
  const def = PEDALS[d.type];
  const c = el('div', { class: 'pedal' + (d.on ? '' : ' bypassed'), 'data-uid': d.uid });
  c.style.setProperty('--pc', def.color);
  const led = el('span', { class: 'led' + (d.on ? ' on' : '') });
  const sw = el('button', { class: 'foot', title: 'Footswitch: on / bypass' }, led);
  sw.onclick = () => { d.on = !d.on; led.classList.toggle('on', d.on); c.classList.toggle('bypassed', !d.on); pushAmpSoon(); };
  const head = el('div', { class: 'ph' }, el('span', { class: 'grip', title: 'Drag to reorder or move to the other board' }, '⠿'), el('span', { class: 'pn' }, def.name), sw,
    el('button', { class: 'x', title: 'Remove pedal', onclick: () => { removePedal(d.uid); } }, '×'));
  const nk = def.eq ? 0 : def.params.length;
  c.style.width = (def.eq ? 214 : Math.max(150, nk * 45 + 20)) + 'px';
  c.append(head, el('canvas', { class: 'pscreen', id: 'ps_' + d.uid, height: 34 }));
  const ks = el('div', { class: 'pk' + (def.eq ? ' eq' : '') });
  for (const q of def.params) {
    const [k, label, min, max, dflt, log, unit] = q;
    if (def.eq && k !== 'level') { // graphic EQ: vertical sliders read better than knobs
      const s = el('input', { type: 'range', min, max, step: .5, class: 'vsl', title: label + ' Hz — double-click to reset' }); s.value = d.p[k];
      s.oninput = () => { d.p[k] = +s.value; pushAmpSoon(); }; s.ondblclick = () => { s.value = 0; s.oninput(); };
      ks.append(el('div', { class: 'vcol' }, el('div', { class: 'vwrap' }, s), el('span', {}, label))); continue;
    }
    ks.append(gknob({ label, min, max, log, def: dflt, step: unit === 'bit' || unit === '×' ? 1 : 0, fmt: ufmt(unit), get: () => d.p[k], set: v => { d.p[k] = v; pushAmpSoon(); } }));
  }
  c.append(ks);
  const opts = el('div', { class: 'popts' });
  for (const k in def.opts || {}) {
    const spec = def.opts[k];
    if (spec[1] === 'toggle') { const b = el('button', { class: 'tog' + (d.o[k] ? ' on' : ''), onclick: () => { d.o[k] = !d.o[k]; b.classList.toggle('on', d.o[k]); pushAmpSoon(); } }, spec[2]); opts.append(b); }
    else if (spec[1] === 'sync') { const s = el('select', { class: 'ssel' }); [['free', 'Free'], ...PDIVS.map(v => [v, divLabel(v)])].forEach(([v, l]) => s.append(el('option', { value: v }, l)));
      s.value = d.o[k]; s.onchange = () => { d.o[k] = s.value; pushAmpSoon(); }; opts.append(el('span', { class: 'note', style: 'margin:0' }, 'Sync'), s); }
    else { const s = el('select', { class: 'ssel' }); spec[1].forEach(([v, l]) => s.append(el('option', { value: v }, l))); s.value = d.o[k]; s.onchange = () => { d.o[k] = s.value; pushAmpSoon(); }; opts.append(s); }
  }
  if (opts.children.length) c.append(opts);
  head.querySelector('.grip').addEventListener('pointerdown', e => startPedalDrag(e, d.uid, c));
  return c;
}
function removePedal(uid) { for (const b of ['pre', 'post']) cfg.amp[b] = cfg.amp[b].filter(p => p.uid !== uid); pushAmp(); buildAmp(); }
function boardEl(which, title, note) {
  const list = cfg.amp[which], b = el('div', { class: 'board', 'data-b': which });
  const add = el('select', { class: 'ssel addp' }); add.append(el('option', { value: '' }, '+ Add pedal…'));
  Object.entries(PEDALS).forEach(([k, v]) => add.append(el('option', { value: k }, v.name)));
  add.onchange = () => { if (!add.value) return; list.push(newPedal(add.value)); pushAmp(); buildAmp(); };
  const wrap = el('div', { class: 'bcard' }, el('div', { class: 'ch' }, el('span', { class: 'ct' }, title), el('span', { class: 'note', style: 'margin:0;flex:1' }, note), add), b);
  if (!list.length) b.append(el('div', { class: 'note bempty' }, 'Empty. Add a pedal, or drag one here from the other board.'));
  list.forEach(d => b.append(pedalEl(d, which)));
  return wrap;
}

// ── head & cab ──
function buildAmp() {
  const root = $('amp'); if (!root) return; root.innerHTML = '';
  const a = cfg.amp, h = a.head, cb = a.cab;
  const power = el('button', { class: 'power' + (a.on ? ' on' : ''), title: 'Amp & cabinet on/off (off = pedals only, straight to the output)' }, el('span', { class: 'led' + (a.on ? ' on' : '') }), a.on ? 'Amp ON' : 'Amp OFF');
  power.onclick = () => { a.on = !a.on; pushAmp(); buildAmp(); };
  const ps = el('select', { class: 'ssel', id: 'ampPreset', style: 'width:200px;margin:0' }); [...Object.keys(AMP_PRESETS), 'Custom'].forEach(k => ps.append(el('option', { value: k }, k)));
  ps.value = a.preset in AMP_PRESETS ? a.preset : 'Custom';
  ps.onchange = () => { if (ps.value === 'Custom') return; cfg.amp = ampPreset(ps.value, a); cfg.amp.on = true; pushAmp(); buildAmp(); };
  root.append(el('div', { class: 'sbar' }, el('span', { class: 'ct', style: 'flex:0 0 auto' }, 'Amp'), ps, power,
    gknob({ label: 'Output', min: -24, max: 12, def: 0, fmt: ufmt('dB'), get: () => a.out || 0, set: v => { a.out = v; pushAmpSoon(); } }),
    el('span', { class: 'note', style: 'margin:0;flex:1' }, 'Signal: synth face → front pedals → amp head → cabinet → effects loop → out. Drag pedals by ⠿ to reorder them or move them between boards.')));
  const G = el('div', { class: 'agrid' }); root.append(G);
  G.append(boardEl('pre', 'Front pedals', 'Into the amp: dynamics, drive, fuzz, filters.'));
  // head
  const hk = (k, extra = {}) => { const s = AHP[k]; return gknob({ label: s[0], min: s[1], max: s[2], step: s[4], def: s[3], log: k === 'tight', fmt: k === 'tight' ? ufmt('Hz') : ['character', 'bias', 'sag', 'pdrive', 'resonance'].includes(k) ? ufmt('%') : v => v.toFixed(k === 'stages' ? 0 : 1),
    get: () => h[k], set: v => { h[k] = v; ampEdited(); }, ...extra }); };
  const stk = el('select', { class: 'ssel', style: 'margin:0' }); Object.entries(STACKS).forEach(([k, v]) => stk.append(el('option', { value: k }, v.label))); stk.value = h.stack;
  stk.onchange = () => { h.stack = stk.value; ampEdited(); };
  const br = el('button', { class: 'tog' + (h.bright ? ' on' : '') }, 'Bright'); br.onclick = () => { h.bright = !h.bright; br.classList.toggle('on', h.bright); ampEdited(); };
  const head = el('div', { class: 'card ahead' + (a.on ? '' : ' off') }, el('div', { class: 'ch' }, el('span', { class: 'ct' }, 'Amp head'), stk, br),
    el('canvas', { class: 'mini', id: 'cv_head', height: 48 }),
    el('div', { class: 'krow hk' }, ...['gain', 'bass', 'mid', 'treble', 'presence', 'master'].map(k => hk(k)), el('span', { class: 'ksep' }), ...['stages', 'character', 'bias', 'tight', 'sag', 'pdrive', 'resonance'].map(k => hk(k))));
  // cab
  const sel3 = (obj, key, opts) => { const s = el('select', { class: 'ssel', style: 'margin:0' }); Object.entries(opts).forEach(([k, v]) => s.append(el('option', { value: k }, v.label))); s.value = obj[key]; s.onchange = () => { obj[key] = s.value; ampEdited(); }; return s; };
  const cabOn = el('button', { class: 'sw' + (cb.on !== false ? ' on' : ''), title: 'Cabinet on/off (off = direct out of the head)' }); cabOn.onclick = () => { cb.on = cb.on === false; cabOn.classList.toggle('on', cb.on !== false); ampEdited(); };
  const cab = el('div', { class: 'card acab' + (a.on ? '' : ' off') }, el('div', { class: 'ch' }, el('span', { class: 'ct' }, 'Cabinet & mic'), cabOn),
    el('div', { class: 'two' }, sel3(cb, 'cab', CABS), sel3(cb, 'speaker', SPEAKERS)), el('div', { class: 'two' }, sel3(cb, 'mic', MICS), el('span', { class: 'note', style: 'margin:0' }, 'Drag the mic ↔ centre/edge, ↕ distance')),
    el('div', { class: 'cabview' }, el('canvas', { id: 'cv_spk', height: 100 }), el('canvas', { id: 'cv_cab', height: 100 })));
  G.append(el('div', { class: 'arow' }, head, cab));
  G.append(boardEl('post', 'Effects loop', 'After the cabinet: modulation, delay, reverb.'));
  requestAnimationFrame(() => { document.querySelectorAll('#amp canvas').forEach(c => { const d = devicePixelRatio || 1; c.width = c.clientWidth * d; c.height = c.clientHeight * d; }); wireMic(); });
}
function wireMic() {
  const cv = $('cv_spk'); if (!cv) return; let drag = false;
  const setFrom = e => { const r = cv.getBoundingClientRect(), cx = r.width / 2, rad = Math.min(r.width, r.height) * .42;
    cfg.amp.cab.pos = Math.max(0, Math.min(1, Math.abs(e.clientX - r.left - cx) / rad)); cfg.amp.cab.dist = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); ampEdited(); };
  cv.onpointerdown = e => { drag = true; cv.setPointerCapture(e.pointerId); setFrom(e); }; cv.onpointermove = e => { if (drag) setFrom(e); }; cv.onpointerup = () => drag = false;
}

// ── screens (every frame) ──
function respCurve(c, W, H, list, fs, col, range = 18) {
  const ds = list.map(f => bqCoefs(f[0], f[1], f[2], f[3], fs)); c.strokeStyle = col; c.lineWidth = 2 * (devicePixelRatio || 1); c.beginPath();
  for (let x = 0; x <= W; x += 2) { const f = 20 * Math.pow(1000, x / W); let m = 1; for (const d of ds) m *= bqMag(d, f, fs); const db = 20 * Math.log10(m), y = H / 2 - db / range * H * .45; x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
}
function grid(c, W, H) { c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1; [100, 1000, 10000].forEach(f => { const x = Math.log(f / 20) / Math.log(1000) * W; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }); c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); }
function curveTF(c, W, H, fn, col, dotX) { c.strokeStyle = col; c.lineWidth = 2 * (devicePixelRatio || 1); c.beginPath();
  for (let x = 0; x <= W; x += 2) { const u = x / W * 2 - 1, y = H / 2 - fn(u) * H * .42; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  if (dotX != null) { const u = Math.max(-1, Math.min(1, dotX)); c.fillStyle = '#fff'; c.beginPath(); c.arc((u + 1) / 2 * W, H / 2 - fn(u) * H * .42, 3.5 * (devicePixelRatio || 1), 0, 7); c.fill(); } }
const tnh = x => Math.tanh(x), hcl = x => x <= -1.5 ? -1 : x >= 1.5 ? 1 : x - x * x * x / 6.75;
function ampFrame() {
  const av = viz.rig || { pd: {}, head: {} }, fs = actx ? actx.sampleRate : 48000, d = devicePixelRatio || 1, t = performance.now() / 1000;
  for (const b of ['pre', 'post']) for (const p of cfg.amp[b]) {
    const cv = $('ps_' + p.uid); if (!cv) continue; const c = cv.getContext('2d'), W = cv.width, H = cv.height, v = av.pd[p.uid] || {}, q = p.p, col = '#9fe0c8';
    c.clearRect(0, 0, W, H); c.fillStyle = '#0c0a08'; c.fillRect(0, 0, W, H);
    switch (p.type) {
      case 'od': { const g = 1 + q.drive * 25, n = 1 / Math.tanh(g * .18); curveTF(c, W, H, u => Math.max(-1, Math.min(1, (Math.tanh(u * .3 * g) * n * .35 + u * .3 * .6) * 1.4)), col, (v.in || 0) / .7); break; }
      case 'dist': { const g = 1 + q.dist * 80, cl = x => .5 * Math.tanh(x) + .5 * hcl(x); curveTF(c, W, H, u => cl(u * .3 * g) / cl(g * .3), col, (v.in || 0) / .7); break; }
      case 'fuzz': { const g = 1 + q.sustain * 20, nl = u => { const x = Math.tanh(u * g + .15) - .149; return Math.tanh(x * 4 + .1) - .0997; }; curveTF(c, W, H, u => nl(u * .3) / Math.max(.05, Math.abs(nl(.3))), col, (v.in || 0) / .7); break; }
      case 'octave': { const g = 1 + q.fuzz * 20; curveTF(c, W, H, u => { const f = Math.tanh(u * .3 * g) / Math.tanh(g * .3); return f * (1 - q.octave) + (Math.abs(f) * 2 - .6) * q.octave; }, col, (v.in || 0) / .7); break; }
      case 'boost': curveTF(c, W, H, u => Math.max(-1, Math.min(1, u * Math.pow(10, q.gain / 20) * .5)), col); break;
      case 'comp': { const th = q.thresh, rt = q.ratio; curveTF(c, W, H, u => { const db = (u + 1) / 2 * 60 - 60, o = db > th ? th + (db - th) / rt : db; return (o + 60) / 60 * 2 - 1; }, col);
        const gr = Math.min(30, v.gr || 0); c.fillStyle = '#e0a040'; c.fillRect(W - 7 * d, 0, 6 * d, H * gr / 30); break; }
      case 'gate': { const o = v.open ?? 1; c.fillStyle = o > .5 ? '#5fd07a' : '#c0503a'; c.beginPath(); c.arc(W / 2, H / 2, H * .3, 0, 7); c.fill(); c.fillStyle = '#ccc'; c.font = `${10 * d}px IBM Plex Mono`; c.fillText(o > .5 ? 'OPEN' : 'CLOSED', W / 2 + H * .4, H / 2 + 4 * d); break; }
      case 'crush': { const st = Math.pow(2, q.bits - 1); c.strokeStyle = col; c.lineWidth = 2 * d; c.beginPath(); let last = 0;
        for (let x = 0; x <= W; x++) { if (x % Math.max(1, Math.round(q.down * W / 80)) === 0) last = Math.round(Math.sin(x / W * Math.PI * 4) * st) / st; const y = H / 2 - last * H * .42; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); break; }
      case 'geq': grid(c, W, H); respCurve(c, W, H, [0, 1, 2, 3, 4, 5, 6].map(i => ['peak', [100, 200, 400, 800, 1600, 3200, 6400][i], 1.1, q['b' + i]]), fs, col, 15); break;
      case 'phaser': { grid(c, W, H); const n = +p.o.stages || 6, fc = v.f || q.center; c.strokeStyle = col; c.lineWidth = 2 * d; c.beginPath();
        for (let x = 0; x <= W; x += 2) { const f = 20 * Math.pow(1000, x / W), ph = -2 * n * Math.atan(f / fc), m = Math.abs(Math.cos(ph / 2)) * q.mix + (1 - q.mix), y = H * .1 + (1 - m) * H * .8; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); break; }
      case 'rotary': { const cx = W / 2, cy = H / 2, r = H * .42; c.strokeStyle = '#6b5636'; c.lineWidth = 2 * d; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke();
        const ha = (v.hp || 0) * Math.PI * 2, da = (v.dp || 0) * Math.PI * 2; c.strokeStyle = col; c.beginPath(); c.moveTo(cx - Math.cos(ha) * r, cy - Math.sin(ha) * r * .5); c.lineTo(cx + Math.cos(ha) * r, cy + Math.sin(ha) * r * .5); c.stroke();
        c.fillStyle = '#e0a040'; c.beginPath(); c.arc(cx + Math.cos(da) * r * .5, cy + Math.sin(da) * r * .25, 3 * d, 0, 7); c.fill(); c.fillStyle = '#ccc'; c.font = `${10 * d}px IBM Plex Mono`; c.fillText(v.fast ? 'FAST' : 'SLOW', 4 * d, 12 * d); break; }
      case 'delay': { const tm = v.time || q.time / 1000, fb = q.fb; c.fillStyle = col; c.fillRect(2 * d, H * .15, 3 * d, H * .8);
        for (let k = 1; k < 12; k++) { const x = 2 * d + k * tm / 2 * W; if (x > W) break; const a = q.mix * Math.pow(fb, k - 1); c.globalAlpha = .9; c.fillRect(x, H * .95 - a * H * .8, 3 * d, a * H * .8); } c.globalAlpha = 1;
        c.fillStyle = '#ccc'; c.font = `${10 * d}px IBM Plex Mono`; c.fillText(Math.round(tm * 1000) + 'ms' + (p.o.sync && p.o.sync !== 'free' ? ' ' + p.o.sync : ''), W - 70 * d, 12 * d); break; }
      case 'spring': { c.strokeStyle = col; c.lineWidth = 1.5 * d; c.beginPath(); for (let x = 0; x <= W; x++) { const u = x / W, env = Math.exp(-u * (5 - q.decay * 4)), y = H / 2 + Math.sin(u * 90 * (1 - u * .5) + t * 6) * env * H * .4; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); break; }
      case 'hall': { c.fillStyle = col; const pre = q.pre / 400 * W; for (let x = 0; x < W; x += 2) { const u = (x - pre) / W; if (u < 0) continue; const e = Math.exp(-u * (6 - q.size * 5)) * (0.6 + .4 * Math.random()); c.globalAlpha = .8; c.fillRect(x, H - e * H * .9, 1.5 * d, e * H * .9); } c.globalAlpha = 1; break; }
    }
  }
  // head: preamp transfer curve (left) + tone stack (right)
  const hc = $('cv_head'); if (hc) { const c = hc.getContext('2d'), W = hc.width, H = hc.height, h = cfg.amp.head, hv = av.head || {}; c.clearRect(0, 0, W, H); c.fillStyle = '#0c0a08'; c.fillRect(0, 0, W, H);
    const G = .5 * Math.pow(10, h.gain / 10 * 2.3), n = Math.max(1, Math.round(h.stages)), gs = Math.pow(G, 1 / n) * (n > 1 ? 1.25 : 1), b = h.bias * .35, ch = h.character;
    const clip = x => { x += b; return (1 - ch) * tnh(x) + ch * hcl(x * 1.2) - ((1 - ch) * tnh(b) + ch * hcl(b * 1.2)); };
    let ref = .3; for (let i = 0; i < n; i++) ref = clip(ref * gs);
    const tf = u => { let x = u * .3; for (let i = 0; i < n; i++) x = clip(x * gs); return Math.max(-1, Math.min(1, x / Math.max(.02, Math.abs(ref)) * .8)); };
    c.save(); c.beginPath(); c.rect(0, 0, W * .38, H); c.clip(); curveTF(c, W * .38, H, tf, '#f2c568', (hv.in || 0) / .5); c.restore();
    c.save(); c.translate(W * .42, 0); grid(c, W * .58, H); respCurve(c, W * .58, H, toneStackDesign(h), fs, '#7fc4b8', 20); c.restore();
    c.fillStyle = '#a8957b'; c.font = `${10 * d}px IBM Plex Sans`; c.fillText('PREAMP', 4 * d, 11 * d); c.fillText('TONE STACK', W * .42 + 4 * d, 11 * d);
    if (h.sag > 0) { c.fillStyle = '#e0804a'; c.fillRect(W * .38 - 6 * d, H - Math.min(1, (hv.sag || 0) * 1.5) * h.sag * H, 4 * d, H); } }
  // cabinet: speaker with mic, and frequency response
  const sc = $('cv_spk'); if (sc) { const c = sc.getContext('2d'), W = sc.width, H = sc.height, cb = cfg.amp.cab, cx = W / 2, cy = H / 2, r = Math.min(W, H) * .42; c.clearRect(0, 0, W, H);
    c.fillStyle = '#16120d'; c.fillRect(0, 0, W, H); const g = c.createRadialGradient(cx, cy, r * .1, cx, cy, r); g.addColorStop(0, '#3a332a'); g.addColorStop(.25, '#1d1a15'); g.addColorStop(1, '#2a241c');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 2 * d; c.stroke(); c.beginPath(); c.arc(cx, cy, r * .22, 0, 7); c.fillStyle = '#4a4238'; c.fill();
    const mx = cx + cb.pos * r, my = H * cb.dist; c.fillStyle = cb.on === false ? '#555' : '#d8d0c0'; c.beginPath(); c.arc(mx, my, 6 * d, 0, 7); c.fill(); c.fillRect(mx - 2 * d, my, 4 * d, H - my);
    c.fillStyle = '#a8957b'; c.font = `${10 * d}px IBM Plex Sans`; c.fillText(cb.pos < .3 ? 'centre: bright' : cb.pos > .7 ? 'edge: dark' : 'between', 4 * d, H - 6 * d); c.fillText(cb.dist < .3 ? 'close' : cb.dist > .7 ? 'far' : 'mid', 4 * d, 12 * d); }
  const cc = $('cv_cab'); if (cc) { const c = cc.getContext('2d'), W = cc.width, H = cc.height; c.clearRect(0, 0, W, H); c.fillStyle = '#0c0a08'; c.fillRect(0, 0, W, H); grid(c, W, H);
    if (cfg.amp.cab.on !== false) respCurve(c, W, H, cabDesign(cfg.amp.cab), fs, '#f2c568', 30); else { c.fillStyle = '#a8957b'; c.font = `${11 * d}px IBM Plex Sans`; c.fillText('Cabinet off: direct out', 8 * d, H / 2); } }
}
