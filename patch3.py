s=open('app.html').read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt, (s.count(a), a[:90])
    s=s.replace(a,b)
# per-string tuning dropdown
rep("""    const note = el('input', { type: 'text', value: nn(s.note), title: 'Tuning — type E2, C#4, or a MIDI number' });
    const setNote = () => { const v = parseNote(note.value); if (v != null) { s.note = v; pushStrings(); } note.value = nn(s.note); };
    note.onchange = setNote; note.onkeydown = e => { if (e.key === 'Enter') note.blur(); };""",
"""    const note = el('select', { title: 'Tuning' });
    for (let m = 24; m <= 96; m++) note.append(el('option', { value: m }, nn(m)));
    if (s.note < 24 || s.note > 96) note.prepend(el('option', { value: s.note }, nn(s.note)));
    note.value = Math.round(s.note); note.onchange = () => { s.note = +note.value; pushStrings(); draw(); };""")
# smart tune button
rep("  tools.append(el('span', { class: 'pill' }, `${n} / 24`));",
    "  tools.append(el('span', { class: 'pill' }, `${n} / 24`));\n  tools.append(el('button', { onclick: smartTune, style: 'margin-left:auto;border-color:#d9a441;color:#f2c568' }, '♪ Smart tune'));")
rep("function addString(role) {", r"""// ───────────────────────── smart tune ─────────────────────────
const SCALES = {
  'Major (Bilawal)': [0,2,4,5,7,9,11], 'Natural minor (Asavari)': [0,2,3,5,7,8,10], 'Dorian (Kafi)': [0,2,3,5,7,9,10],
  'Mixolydian (Khamaj)': [0,2,4,5,7,9,10], 'Phrygian (Bhairavi)': [0,1,3,5,7,8,10], 'Lydian (Yaman)': [0,2,4,6,7,9,11],
  'Bhairav': [0,1,4,5,7,8,11], 'Marwa': [0,1,4,6,7,9,11], 'Todi': [0,1,3,6,7,8,11], 'Purvi': [0,1,4,6,7,8,11],
  'Harmonic minor': [0,2,3,5,7,8,11], 'Major pentatonic': [0,2,4,7,9], 'Minor pentatonic': [0,3,5,7,10],
  'Hirajoshi': [0,2,3,7,8], 'Kumoi': [0,2,3,7,9], 'In (Miyako-bushi)': [0,1,5,7,8], 'Iwato': [0,1,5,6,10], 'Yo': [0,2,5,7,9],
  'Whole tone': [0,2,4,6,8,10], 'Chromatic': [0,1,2,3,4,5,6,7,8,9,10,11],
};
const TUNINGS = { // by number of playing (stopped + open) strings, in string order
  4: { 'Cello (C G D A)': [36,43,50,57], 'Viola (C G D A)': [48,55,62,69], 'Violin (G D A E)': [55,62,69,76], 'Bass (E A D G)': [28,33,38,43] },
  6: { 'Standard (E A D G B E)': [40,45,50,55,59,64], 'Drop D': [38,45,50,55,59,64], 'DADGAD': [38,45,50,55,57,62], 'Open G': [38,43,50,55,59,62],
       'Open D': [38,45,50,54,57,62], 'Open E': [40,47,52,56,59,64], 'Half-step down': [39,44,49,54,58,63] },
  13: { 'Hirajoshi in D (koto)': [50,43,45,46,50,51,55,57,58,62,63,67,69] },
};
const PC = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
// Move each string to the nearest note allowed by the scale, keeping the strings in the same pitch order
function fitStrings(idxs, root, steps) {
  const ok = n => steps.includes((((n - root) % 12) + 12) % 12);
  const sorted = idxs.slice().sort((a, b) => cfg.strings[a].note - cfg.strings[b].note);
  let prevOld = -1e9, prevNew = -1e9, moved = 0;
  for (const i of sorted) {
    const s = cfg.strings[i], n0 = Math.round(s.note), strict = s.note > prevOld + .01;
    let pick = null;
    for (let d = 0; d < 24 && pick == null; d++) for (const c of d ? [n0 - d, n0 + d] : [n0]) if (pick == null && ok(c) && (strict ? c > prevNew : c >= prevNew)) pick = c;
    if (pick == null) pick = n0;
    if (pick !== s.note) moved++;
    prevOld = s.note; s.note = pick; prevNew = pick;
  }
  return moved;
}
function smartTune() {
  const snap = JSON.stringify(cfg.strings);
  const idx = f => cfg.strings.map((s, i) => f(s) ? i : -1).filter(i => i >= 0);
  const play = idx(s => s.role === 'stopped' || s.role === 'open');
  const named = TUNINGS[play.length] || {};
  const drones = idx(s => s.role === 'drone');
  const rootGuess = ((Math.round(drones.length ? Math.min(...drones.map(i => cfg.strings[i].note)) : Math.min(...cfg.strings.map(s => s.note))) % 12) + 12) % 12;
  const groups = [['symp', 'Sympathetic strings'], ['open', 'Open strings'], ['drone', 'Drones (root + fifth)'], ['stopped', 'Stopped strings (their open pitch)']].filter(([r]) => cfg.strings.some(s => s.role === r));
  modal(`<h3>♪ Smart tune</h3>
    ${Object.keys(named).length ? `<div class="note">Named tunings for ${play.length} playing strings</div><div class="strtools" id="stNamed">${Object.keys(named).map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>` : ''}
    <h3>Fit strings to a scale</h3>
    <div class="row sel"><label>Root</label><select id="stRoot">${PC.map((p, i) => `<option value="${i}">${p}</option>`).join('')}</select></div>
    <div class="row sel"><label>Scale / raga / mode</label><select id="stScale">${Object.keys(SCALES).map(k => `<option>${k}</option>`).join('')}</select></div>
    ${groups.map(([r, l]) => `<label class="chk"><input type="checkbox" data-r="${r}" ${r === 'stopped' ? '' : 'checked'}> ${l}</label>`).join('')}
    <div class="note">Each string moves to the nearest note of the scale, staying in the same order, so a 13-string koto or 11 sitar sympathetics retune in one go.</div>
    <h3>Transpose whole instrument</h3>
    <div class="strtools"><button id="stDn">− semitone</button><button id="stUp">+ semitone</button><button id="stDn12">− octave</button><button id="stUp12">+ octave</button><span class="pill" id="stOff">±0</span></div>
    <div class="btns"><span id="stMsg" class="note" style="flex:1"></span><button class="hbtn" id="stRevert">Revert</button><button class="hbtn" id="stApply">Apply scale</button><button class="hbtn" id="stDone">Done</button></div>`, () => {
    $('stRoot').value = rootGuess;
    let off = 0; const after = msg => { pushStrings(); buildStrings(); draw(); $('stMsg').textContent = msg; $('stOff').textContent = (off > 0 ? '+' : off < 0 ? '−' : '±') + Math.abs(off); };
    document.querySelectorAll('#stNamed button').forEach(b => b.onclick = () => { named[b.dataset.k].forEach((n, k) => cfg.strings[play[k]].note = n); after(b.dataset.k); });
    $('stApply').onclick = () => {
      const root = +$('stRoot').value, steps = SCALES[$('stScale').value]; let moved = 0;
      document.querySelectorAll('#modalCard input[data-r]').forEach(cb => { if (!cb.checked) return;
        const r = cb.dataset.r, ids = idx(s => s.role === r);
        moved += fitStrings(ids, root, r === 'drone' ? (steps.includes(7) ? [0, 7] : steps.includes(5) ? [0, 5] : [0]) : steps); });
      after(`${moved} string${moved === 1 ? '' : 's'} retuned to ${PC[root]} ${$('stScale').value}.`);
    };
    const tr = d => { if (cfg.strings.some(s => s.note + d < 12 || s.note + d > 108)) return; cfg.strings.forEach(s => s.note += d); off += d; after(`Transposed ${off > 0 ? 'up' : 'down'} ${Math.abs(off)} semitone${Math.abs(off) === 1 ? '' : 's'}.`); };
    $('stDn').onclick = () => tr(-1); $('stUp').onclick = () => tr(1); $('stDn12').onclick = () => tr(-12); $('stUp12').onclick = () => tr(12);
    $('stRevert').onclick = () => { cfg.strings = JSON.parse(snap); off = 0; after('Reverted.'); };
    $('stDone').onclick = closeModal;
  });
}
function addString(role) {""")
# grid: role 78px, note select 58px
rep(".srow{display:grid;grid-template-columns:8px 78px 44px 1fr 22px;",".srow{display:grid;grid-template-columns:8px 78px 58px 1fr 22px;")
open('app.html','w').write(s); print('ok')
