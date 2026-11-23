s=open('app.html').read()
def rep(a,b,cnt=1):
    global s
    assert s.count(a)==cnt, (s.count(a), a[:80])
    s=s.replace(a,b)

# ── heat-map → reusable function
start=s.index("  // vibration heat-map from live body-mode energies")
end=s.index("  c.restore();\n  c.save(); outlinePath(g, c); c.strokeStyle = BMAT[b.back]")
s=s[:start]+"  drawHeat(g, c, modesInfo.top, 0);\n"+s[end:]
rep("function l0x(g) {","""function drawHeat(g, c, list, off) {
  const E = viz.modeE, b = g.b; if (!E.length || !list.length) return;
  const img = hctx.createImageData(heat.width, heat.height), d = img.data;
  let mx = 1e-9; for (let k = 0; k < list.length; k++) mx = Math.max(mx, E[k + off] || 0);
  const glob = Math.min(1, Math.sqrt(mx) * 10);
  for (let yy = 0; yy < heat.height; yy++) for (let xx = 0; xx < heat.width; xx++) {
    const u = (xx + .5) / heat.width, v = (yy + .5) / heat.height; let s = 0;
    for (let k = 0; k < list.length; k++) { const e = (E[k + off] || 0) / mx; if (e < .01) continue; s += Math.sqrt(e) * Math.abs(Math.sin(list[k].m * Math.PI * u) * Math.sin(list[k].n * Math.PI * v)); }
    s = Math.min(1, s * .45) * glob; const o = (yy * heat.width + xx) * 4;
    d[o] = 255; d[o + 1] = 90 + 80 * s; d[o + 2] = 20; d[o + 3] = 120 * s * s + 30 * s;
  }
  hctx.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true; const mh = Math.max(...b.hw);
  c.drawImage(heat, g.X(0), g.Y(-mh), b.length * g.sc, mh * 2 * g.sc);
}
// ── back view: a shaded relief of the back, lit from the upper left
let backView = false, backCache = { key: '' };
const hexRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
function depthAt(b, r) { const n = b.depth.length - 1, t = Math.min(1, r) * n, i = Math.min(n - 1, Math.floor(t)); return b.depth[i] + (b.depth[i + 1] - b.depth[i]) * (t - i); }
function bulge(b) { return Math.max(0, 1 - b.depth[b.depth.length - 1] / Math.max(1e-4, b.depth[0])); }
function backImage(g) {
  const b = g.b, mh = Math.max(...b.hw);
  const key = JSON.stringify([b.length, b.hw, b.depth, b.back, b.backShape, Math.round(g.sc)]);
  if (backCache.key === key) return backCache.cv;
  const pxW = b.length * g.sc, k = Math.min(1, 600 / pxW), w = Math.max(8, Math.round(pxW * k)), h = Math.max(8, Math.round(2 * mh * g.sc * k));
  const H = new Float32Array(w * h), Yn = new Float32Array(w * h), Rr = new Float32Array(w * h), bl = bulge(b);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wx = (x + .5) / w * b.length, yy = ((y + .5) / h * 2 - 1) * mh, hw = Math.max(.004, g.hwAt(wx)), r = Math.abs(yy) / hw, i = y * w + x;
    const taper = 1 - bl + bl * Math.sqrt(hw / mh); // curved backs get shallower toward the narrow ends
    H[i] = depthAt(b, r) * taper * (r > 1 ? Math.max(0, 1 - (r - 1) * 6) : 1); Yn[i] = Math.max(-1, Math.min(1, yy / hw)); Rr[i] = r;
  }
  const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
  const ic = oc.getContext('2d'), img = ic.createImageData(w, h), d = img.data;
  const base = hexRgb((BMAT[b.back] || BMAT.Rosewood).color), dx = b.length / w, dy = 2 * mh / h;
  const L = [-.45, -.55, .7], ln = Math.hypot(...L); L.forEach((v, i) => L[i] = v / ln);
  const Hh = [L[0], L[1], L[2] + 1], hn = Math.hypot(...Hh); Hh.forEach((v, i) => Hh[i] = v / hn);
  const shape = b.backShape || 'custom', ribs = (BACKS[shape] || {}).ribs || 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, wx = (x + .5) / w * b.length, yy = ((y + .5) / h * 2 - 1) * mh;
    const hx = (H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)]) / (2 * dx);
    const hy = (H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x]) / (2 * dy);
    let nx = -hx * 1.6, ny = -hy * 1.6, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), sp = Math.pow(Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]), 40) * .3;
    let m = (.25 + .85 * lam) * (1 + .06 * Math.sin(Math.abs(yy) * 220 + Math.sin(wx * 7) * 3) + .03 * Math.sin(wx * 90 + yy * 30));
    if (ribs) { const st = (Math.asin(Yn[i]) / Math.PI + .5) * ribs, fr = st - Math.floor(st); if (fr < .05 || fr > .95) m *= .45; else if (Math.floor(st) % 2) m *= .72; }
    else if (shape === 'gourd') m *= .86 + .14 * Math.sin(wx * 23 + Math.sin(yy * 31) * 2) * Math.sin(yy * 17 + wx * 5);
    else if (Math.abs(yy) < dy * .9) m *= .55; // book-matched centre seam
    if (shape === 'arched' && Rr[i] > .88 && Rr[i] < .92) m *= .5; // purfling
    d[i * 4] = Math.min(255, base[0] * m + sp * 255); d[i * 4 + 1] = Math.min(255, base[1] * m + sp * 255); d[i * 4 + 2] = Math.min(255, base[2] * m + sp * 255); d[i * 4 + 3] = 255;
  }
  ic.putImageData(img, 0, 0);
  backCache = { key, cv: oc }; return oc;
}
function drawBack(g) {
  const b = g.b, c = ctx, dpr = devicePixelRatio || 1, mh = Math.max(...b.hw);
  c.save(); c.translate(cv.width, 0); c.scale(-1, 1); // seen from behind: mirror left/right
  if (g.neck) {
    const w0 = (g.np * g.nutSp) / 2 + .008, w1 = Math.max(w0 + .004, (g.np * g.brSp) / 2 * .6 + .01);
    const gr = c.createLinearGradient(0, g.Y(-w1), 0, g.Y(w1)); gr.addColorStop(0, '#2a180c'); gr.addColorStop(.35, '#7a4f2c'); gr.addColorStop(.6, '#5b3a20'); gr.addColorStop(1, '#1e1209');
    c.fillStyle = gr; c.beginPath(); c.moveTo(g.X(-g.neck), g.Y(-w0)); c.lineTo(g.X(.04), g.Y(-w1)); c.lineTo(g.X(.04), g.Y(w1)); c.lineTo(g.X(-g.neck), g.Y(w0)); c.fill();
    // heel where the neck meets the body
    c.fillStyle = '#4a2e18'; c.beginPath(); c.ellipse(g.X(.01), g.Y(0), .03 * g.sc, w1 * g.sc, 0, 0, 7); c.fill();
    const hg = c.createLinearGradient(0, g.Y(-w0 - .01), 0, g.Y(w0 + .01)); hg.addColorStop(0, '#24160b'); hg.addColorStop(.5, '#5a391f'); hg.addColorStop(1, '#1b1008');
    c.fillStyle = hg; c.fillRect(g.X(-g.neck - g.head), g.Y(-w0 - .01), g.head * g.sc, (w0 + .01) * 2 * g.sc);
    c.fillStyle = '#c9a35a'; g.lines.filter(l => !l.symp).forEach((l, k) => { const px = g.X(-g.neck - g.head * (.25 + .6 * (k / Math.max(1, g.np - 1)))), sg = k % 2 ? 1 : -1;
      c.fillRect(px - 2.5 * dpr, g.Y(sg * (w0 + .01)) - (sg < 0 ? 12 * dpr : 0), 5 * dpr, 12 * dpr); c.beginPath(); c.ellipse(px, g.Y(sg * (w0 + .01)) + sg * 14 * dpr, 6 * dpr, 4 * dpr, 0, 0, 7); c.fill(); });
  }
  c.save(); outlinePath(g, c); c.clip();
  c.imageSmoothingEnabled = true; c.drawImage(backImage(g), g.X(0), g.Y(-mh), b.length * g.sc, 2 * mh * g.sc);
  if (b.hole.type === 'under') { const hx = g.X(b.hole.x * b.length), r = (.015 + b.hole.size * .045) * g.sc;
    for (const px of [hx, g.X(b.length * .14)]) { c.fillStyle = '#0d0805'; c.beginPath(); c.ellipse(px, g.Y(0), r * 1.6, r * .8, 0, 0, 7); c.fill(); } }
  const n0 = modesInfo.top.length; drawHeat(g, c, modesInfo.back || [], n0);
  c.restore();
  c.save(); outlinePath(g, c); const sc = hexRgb((BMAT[b.back] || BMAT.Rosewood).color).map(v => v * .55 | 0);
  c.strokeStyle = `rgb(${sc})`; c.lineWidth = Math.max(3, .012 * g.sc); c.stroke(); c.restore();
  // end pin / button
  c.fillStyle = '#d8cdb8'; c.beginPath(); c.arc(g.X(b.length) + 2 * dpr, g.Y(0), 4 * dpr, 0, 7); c.fill();
  c.restore();
  c.fillStyle = 'rgba(239,228,210,.6)'; c.font = `${12 * dpr}px "IBM Plex Sans"`; c.textAlign = 'right';
  c.fillText(`BACK  ·  ${(BACKS[b.backShape] || BACKS.custom).label}  ·  ${b.back}`, cv.width - 14 * dpr, cv.height - 14 * dpr); c.textAlign = 'left';
}
function l0x(g) {""")
rep("  const g = G = geom(), b = g.b, c = ctx, dpr = devicePixelRatio || 1;\n  c.clearRect(0, 0, cv.width, cv.height);\n  // backdrop: workbench\n  const bg = c.createRadialGradient(cv.width / 2, cv.height / 2, 50, cv.width / 2, cv.height / 2, cv.width * .7);\n  bg.addColorStop(0, '#2a1f15'); bg.addColorStop(1, '#140f0a'); c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);",
"  const g = G = geom(), b = g.b, c = ctx, dpr = devicePixelRatio || 1;\n  c.clearRect(0, 0, cv.width, cv.height);\n  // backdrop: workbench\n  const bg = c.createRadialGradient(cv.width / 2, cv.height / 2, 50, cv.width / 2, cv.height / 2, cv.width * .7);\n  bg.addColorStop(0, '#2a1f15'); bg.addColorStop(1, '#140f0a'); c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);\n  if (backView) { drawBack(g); return; }")
rep("  const g = G; if (!g) return null;","  const g = G; if (!g || backView) return null;")
rep('<button class="tog" id="editTog">✎ Edit outline</button>','<button class="tog" id="editTog">✎ Edit outline</button>\n      <button class="tog" id="backTog">⟲ Back view</button>')
rep("$('editTog').onclick =","$('backTog').onclick = () => { backView = !backView; $('backTog').classList.toggle('on', backView); $('hint').style.visibility = backView ? 'hidden' : ''; };\n$('editTog').onclick =")

# ── back shapes data + acoustics
rep("const ROLE = {","""const BACKS = {
  flat:   { label: 'Flat (guitar)',          f: r => 1 },
  arched: { label: 'Carved arch (violin)',   f: r => 1 - .4 * Math.pow(r, 2.2) },
  bowl:   { label: 'Round bowl (oud)',       f: r => Math.max(.1, Math.sqrt(1 - r * r)) },
  ribbed: { label: 'Ribbed staves (lute)',   f: r => Math.max(.1, Math.sqrt(1 - r * r)), ribs: 11 },
  gourd:  { label: 'Gourd (sitar)',          f: r => Math.max(.15, Math.pow(1 - Math.pow(r, 2.5), .55)) },
  keel:   { label: '✦ Keel (boat hull)',     f: r => Math.max(.08, 1 - r * .92) },
  custom: { label: 'Custom (drag the points)' },
};
function applyBack(shape) { const b = cfg.body, D = Math.max(...b.depth); b.backShape = shape; const f = BACKS[shape]?.f; if (f) b.depth = b.depth.map((_, i) => +(D * f(i / (b.depth.length - 1))).toFixed(4)); }
const ROLE = {""")
for a,bs in [("bridgeX: .57, neckLen: .36, nutX: .05 },","flat"),("bridgeX: .55, neckLen: .28, nutX: .05 },","arched"),("bridgeX: .62, neckLen: .62, nutX: .05 },","gourd"),("bridgeX: .93, neckLen: 0, nutX: .06 },","arched")]:
    rep(a, a[:-2]+f", backShape: '{bs}' }},")
rep("  function plate(matName, tmm, amp, nKeep, isTop) {\n    const m = BMAT[matName], h = tmm / 1000;\n    const f11 = 4 * h * Math.sqrt(m.E * 1e9 / m.rho) / g.A * bf;",
"""  // a curved shell is much stiffer than a flat plate of the same wood; glued staves lose a little energy
  const curve = 1 + .9 * bulge(b), ribQ = (BACKS[b.backShape] || {}).ribs ? .75 : 1;
  function plate(matName, tmm, amp, nKeep, isTop) {
    const m = BMAT[matName], h = tmm / 1000;
    const f11 = 4 * h * Math.sqrt(m.E * 1e9 / m.rho) / g.A * (isTop ? bf : curve);""")
rep("out.push({ f, q: Math.max(2, Math.min(5000, m.Q / (1 + .03 * (mi + ni)))),","out.push({ f, q: Math.max(2, Math.min(5000, m.Q * (isTop ? 1 : ribQ) / (1 + .03 * (mi + ni)))),")
rep("modesInfo = { modes, top: top.list, info:","modesInfo = { modes, top: top.list, back: back.list, info:")
# depth drag → custom
rep("  cfg.body.depth[dragD] = Math.max(.005, Math.min(.25, (y - top) / sy)); pushBody(); drawDepth();",
    "  cfg.body.depth[dragD] = Math.max(.005, Math.min(.25, (y - top) / sy)); if (cfg.body.backShape !== 'custom') { cfg.body.backShape = 'custom'; syncCtl('body.backShape'); } pushBody(); drawDepth();")
# body panel: back shape + depth
rep("  noteP(p, 'Turn on ✎ Edit outline to drag the body\\'s edge.",
"""  const bs = select(p, 'Back shape', 'body.backShape', Object.entries(BACKS).map(([k, v]) => [k, v.label]), () => { applyBack(cfg.body.backShape); onB(); drawDepth(); });
  const drow = el('div', { class: 'row' }, el('label', {}, 'Depth'), el('input', { type: 'range', min: .02, max: .3, step: .002 }), el('output'));
  const dShow = () => { const D = Math.max(...cfg.body.depth); drow.children[1].value = D; drow.children[2].textContent = (D * 100).toFixed(1) + 'cm'; };
  drow.children[1].oninput = e => { const D = Math.max(...cfg.body.depth), k = +e.target.value / D; cfg.body.depth = cfg.body.depth.map(v => v * k); dShow(); onB(); drawDepth(); };
  p.append(drow); dShow(); ctlReg['body.depthMax'] = dShow;
  noteP(p, 'Curved backs are stiffer than flat ones and ring higher; ribbed staves are a touch more damped. Use ⟲ Back view to see it.');
  noteP(p, 'Turn on ✎ Edit outline to drag the body\\'s edge.""")
rep("cfg.body.depth[dragD] = Math.max(.005, Math.min(.25, (y - top) / sy));","cfg.body.depth[dragD] = Math.max(.005, Math.min(.25, (y - top) / sy)); syncCtl('body.depthMax');")
rep("  cfg = { ...d, ...c, ex:","  if (c.body && !c.body.backShape) c = { ...c, body: { ...c.body, backShape: 'custom' } };\n  cfg = { ...d, ...c, ex:")
open('app.html','w').write(s)
print('ok')
