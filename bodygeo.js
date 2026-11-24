// ───────────────────────── body outlines, necks, heads, pegs, frames ─────────────────────────
// A body outline is a closed list of control points [x, y] in metres (x along the strings, 0 = neck joint; y across, negative = top of screen).
// The drawn edge is a smooth curve through the midpoints of the control polygon, so any shape works: horns, cutaways, V's.
function hwToOutline(b) { // old mirrored half-widths → free outline
  const n = b.hw.length, L = b.length, top = b.hw.map((h, i) => [L * i / (n - 1), -h]);
  return [[0, 0], [0, -b.hw[0] * .6], ...top, [L, 0], ...top.slice().reverse().map(([x, y]) => [x, -y]), [0, b.hw[0] * .6]];
}
const symOutline = top => [...top, ...top.slice().reverse().filter(p => Math.abs(p[1]) > 1e-6).map(([x, y]) => [x, -y])];
const BODY_TEMPLATES = {
  'Dreadnought': { len: .505, pts: () => hwToOutline({ length: .505, hw: [.07, .125, .142, .135, .12, .125, .16, .185, .19, .17, .08] }) },
  'Classical': { len: .49, pts: () => hwToOutline({ length: .49, hw: [.07, .12, .14, .135, .12, .125, .15, .17, .18, .165, .08] }) },
  'Violin family': { len: .355, pts: () => hwToOutline({ length: .355, hw: [.06, .085, .083, .075, .055, .058, .09, .103, .105, .09, .05] }) },
  'Double-cut (horns)': { len: .45, pts: () => [[.025, -.034], [-.01, -.048], [-.055, -.08], [-.088, -.108], [-.092, -.122], [-.07, -.136], [-.02, -.142], [.06, -.136], [.12, -.116], [.2, -.126], [.3, -.16], [.39, -.166], [.45, -.124], [.472, -.04],
      [.472, .04], [.445, .14], [.36, .172], [.26, .162], [.16, .122], [.09, .132], [.03, .138], [-.02, .128], [-.045, .112], [-.05, .098], [-.03, .078], [0, .055], [.025, .036]] },
  'Single-cut': { len: .44, pts: () => [[0, -.035], [.025, -.06], [.015, -.10], [.06, -.125], [.13, -.12], [.19, -.11], [.27, -.142], [.36, -.162], [.43, -.13], [.455, -.06], [.46, 0],
      [.455, .06], [.43, .13], [.36, .162], [.27, .148], [.17, .12], [.09, .13], [.03, .125], [-.005, .10], [-.02, .07], [0, .04]] },
  'Offset bass': { len: .5, pts: () => [[.03, -.036], [-.01, -.052], [-.07, -.09], [-.12, -.122], [-.126, -.138], [-.1, -.152], [-.03, -.158], [.06, -.15], [.13, -.128], [.22, -.138], [.33, -.176], [.43, -.182], [.5, -.136], [.522, -.045],
      [.522, .045], [.495, .155], [.4, .19], [.29, .178], [.18, .134], [.1, .146], [.03, .152], [-.025, .14], [-.05, .122], [-.055, .106], [-.032, .084], [0, .058], [.03, .038]] },
  'Flying V': { len: .47, pts: () => [[0, -.04], [.40, -.25], [.47, -.21], [.24, -.03], [.24, .03], [.47, .21], [.40, .25], [0, .04]] },
  'Round gourd': { len: .42, pts: () => { const p = []; for (let i = 0; i < 16; i++) { const a = Math.PI + i / 16 * Math.PI * 2; p.push([.21 + Math.cos(a) * .21, Math.sin(a) * .21]); } return p; } },
  'Pear (lute / oud)': { len: .5, pts: () => hwToOutline({ length: .5, hw: [.05, .1, .135, .16, .175, .182, .18, .17, .15, .11, .04] }) },
  'Box': { len: .6, pts: () => [[0, -.15], [.6, -.15], [.6, .15], [0, .15]] },
  'Trapezoid': { len: .95, pts: () => [[0, -.36], [.95, -.16], [.95, .16], [0, .36]] },
  'Harp soundbox': { len: .26, pts: () => [[0, -.52], [.26, -.52], [.21, 0], [.13, .52], [.02, .52], [-.01, 0]] },
};
function ensureOutline(b) { if (!b.outline) b.outline = hwToOutline(b); return b.outline; }
const _polyCache = { key: '', v: null };
function bodyPoly(b) {
  const pts = ensureOutline(b), key = JSON.stringify(pts);
  if (_polyCache.key === key) return _polyCache.v;
  const n = pts.length, dense = [], mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], r = pts[(i + 2) % n], a = mid(p, q), c = mid(q, r);
    for (let s = 0; s < 12; s++) { const t = s / 12, u = 1 - t; dense.push([u * u * a[0] + 2 * u * t * q[0] + t * t * c[0], u * u * a[1] + 2 * u * t * q[1] + t * t * c[1]]); } }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, area = 0;
  dense.forEach(([x, y], i) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); const q = dense[(i + 1) % dense.length]; area += x * q[1] - q[0] * y; });
  const span = x => { let lo = 1e9, hi = -1e9; for (let i = 0; i < dense.length; i++) { const p = dense[i], q = dense[(i + 1) % dense.length];
      if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) { const y = p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]); lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    return lo <= hi ? [lo, hi] : null; };
  const v = { dense, bb: { x0, x1, y0, y1 }, area: Math.abs(area) / 2, mh: Math.max(-y0, y1), span };
  _polyCache.key = key; _polyCache.v = v; return v;
}
function tracePoly(c, P, X, Y) { const d = P.dense; c.beginPath(); c.moveTo(X(d[0][0]), Y(d[0][1])); for (let i = 1; i < d.length; i++) c.lineTo(X(d[i][0]), Y(d[i][1])); c.closePath(); }

// ── neck & head looks ──
const NECKMATS = { // colour, and how much the neck helps the strings sustain
  'Maple': { c: '#e6c48a', sus: 1 }, 'Mahogany': { c: '#7d4428', sus: .97 }, 'Walnut': { c: '#5c4030', sus: .98 }, 'Rosewood': { c: '#4a2618', sus: 1.01 },
  'Ebony': { c: '#1c1612', sus: 1.03 }, 'Toon (tun)': { c: '#9a5a34', sus: .95 }, 'Roasted maple': { c: '#b0773e', sus: 1.01 }, 'Carbon fiber': { c: '#2e2f33', sus: 1.08 },
  'Aluminum': { c: '#b7bcc3', sus: 1.12 }, '✦ Glass': { c: '#a6dbe4', sus: 1.15 }, '✦ Bone': { c: '#ece3cd', sus: 1.05 },
};
const HEADS = { paddle: 'Paddle, 3 + 3', inline: 'In-line (one side)', slotted: 'Slotted (classical)', scroll: 'Scroll & pegbox (violin)', bentback: 'Bent-back pegbox (lute/oud)', pegbox: 'Long pegbox (sitar)', headless: 'Headless (tuners at bridge)' };
const PEGS = { machine: 'Guitar tuning machines', bass: 'Bass tuning machines', friction: 'Wooden friction pegs', planetary: 'Round knob tuners', pins: 'Zither / harp pins', tied: 'Tied (no pegs)' };
const FRAMES = { none: 'None (strings over the body)', bar: 'Straight bar', harp: 'Harp neck & pillar' };
const MARKERS = { none: 'None', dots: 'Dots', blocks: 'Blocks' };
function lookDefault() { return { neckMat: 'Mahogany', boardMat: 'Rosewood', head: 'paddle', pegs: 'machine', markers: 'dots', neckWidth: 1, boardOver: .02, frame: 'none', spacing: 0 }; }

// draw one tuning peg; side = -1 (top edge) or +1 (bottom edge); u = metres→pixels; back = seen from behind
function drawPeg(c, x, y, side, style, u, back) {
  const d = devicePixelRatio || 1;
  c.save(); c.translate(x, y);
  if (style === 'machine' || style === 'bass') { const big = style === 'bass' ? 1.6 : 1;
    c.fillStyle = '#c9c4b8'; c.fillRect(-.006 * u * big, 0, .012 * u * big, side * .012 * u); // gear housing / post
    c.fillStyle = back ? '#9a958a' : '#d8d3c6'; c.beginPath(); c.ellipse(0, side * .026 * u * big, .008 * u * big, .011 * u * big, 0, 0, 7); c.fill();
    c.fillStyle = '#555'; c.beginPath(); c.arc(0, 0, Math.max(1.5 * d, .0025 * u), 0, 7); c.fill(); }
  else if (style === 'friction') { c.fillStyle = '#2a1a10'; c.beginPath(); c.moveTo(-.003 * u, 0); c.lineTo(-.0045 * u, side * .02 * u); c.lineTo(.0045 * u, side * .02 * u); c.lineTo(.003 * u, 0); c.fill();
    c.fillStyle = '#3b2416'; c.beginPath(); c.ellipse(0, side * .028 * u, .009 * u, .007 * u, 0, 0, 7); c.fill(); c.fillStyle = '#d9cfb8'; c.beginPath(); c.arc(0, side * .028 * u, .002 * u, 0, 7); c.fill(); }
  else if (style === 'planetary') { c.fillStyle = '#d8d3c6'; c.beginPath(); c.arc(0, side * .014 * u, .008 * u, 0, 7); c.fill(); c.strokeStyle = '#777'; c.lineWidth = 1 * d; c.stroke(); }
  else if (style === 'pins') { c.fillStyle = '#d8d3c6'; c.beginPath(); c.arc(0, 0, Math.max(1.8 * d, .003 * u), 0, 7); c.fill(); c.fillStyle = '#666'; c.beginPath(); c.arc(0, 0, Math.max(.8 * d, .0012 * u), 0, 7); c.fill(); }
  else if (style === 'tied') { c.fillStyle = '#e8dfc8'; c.beginPath(); c.arc(0, 0, Math.max(1.5 * d, .002 * u), 0, 7); c.fill(); }
  c.restore();
}
const shade = (hex, k) => { const h = hex.replace('#', ''), v = [0, 2, 4].map(i => Math.max(0, Math.min(255, parseInt(h.substr(i, 2), 16) * k | 0))); return `rgb(${v})`; };
// neck, fingerboard, markers, head and pegs (front or back view; caller mirrors the canvas for the back)
function drawNeckHead(g, c, look, back) {
  const d = devicePixelRatio || 1, u = g.sc, nm = (NECKMATS[look.neckMat] || NECKMATS.Mahogany).c, bm = (NECKMATS[look.boardMat] || NECKMATS.Rosewood).c;
  const nx = -g.neck, w0 = ((g.np * g.nutSp) / 2 + .006) * look.neckWidth, w1 = Math.max(w0 + .003, ((g.np * g.brSp) / 2 * .55 + .009) * look.neckWidth);
  // neck
  const ng = c.createLinearGradient(0, g.Y(-w1), 0, g.Y(w1)); ng.addColorStop(0, shade(nm, .65)); ng.addColorStop(.5, back ? shade(nm, 1.1) : nm); ng.addColorStop(1, shade(nm, .6));
  c.fillStyle = ng; c.beginPath(); c.moveTo(g.X(nx), g.Y(-w0)); c.lineTo(g.X(.03), g.Y(-w1)); c.lineTo(g.X(.03), g.Y(w1)); c.lineTo(g.X(nx), g.Y(w0)); c.fill();
  if (!back && look.boardMat !== 'none') { // fingerboard (may run out over the body)
    const end = Math.min(g.bridgeX - .06, Math.max(0, look.boardOver)), wb = x => w0 + (w1 - w0) * (x - nx) / (.03 - nx);
    c.fillStyle = bm; c.beginPath(); c.moveTo(g.X(nx), g.Y(-w0 * .95)); c.lineTo(g.X(end), g.Y(-wb(end) * .95)); c.lineTo(g.X(end), g.Y(wb(end) * .95)); c.lineTo(g.X(nx), g.Y(w0 * .95)); c.fill();
    if (look.markers !== 'none' && cfg.nk.frets) { const scale = g.bridgeX - g.nutX; c.fillStyle = look.boardMat === 'Ebony' || look.boardMat === 'Rosewood' || look.boardMat === 'Carbon fiber' ? '#e8e2d2' : '#2a1d14';
      for (const k of [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]) { const xa = g.nutX + scale * (1 - Math.pow(2, -(k - 1) / 12)), xb = g.nutX + scale * (1 - Math.pow(2, -k / 12)), x = (xa + xb) / 2; if (x > end - .005) break;
        const dbl = k === 12 || k === 24, w = wb(x);
        if (look.markers === 'blocks') c.fillRect(g.X(x) - (xb - xa) * u * .3, g.Y(-w * .6), (xb - xa) * u * .6, w * 1.2 * u);
        else for (const yy of dbl ? [-w * .45, w * .45] : [0]) { c.beginPath(); c.arc(g.X(x), g.Y(yy), Math.max(2 * d, .0035 * u), 0, 7); c.fill(); } } }
  }
  // head
  const H = look.head, hl = { paddle: .17, inline: .19, slotted: .19, scroll: .13, bentback: .16, pegbox: .26, headless: .025 }[H] || .17, hx = nx - hl;
  const hc = shade(nm, back ? .9 : .8), np = g.lines.filter(l => !l.symp).length;
  const poly = pts => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(g.X(x), g.Y(y)) : c.moveTo(g.X(x), g.Y(y))); c.closePath(); c.fill(); };
  c.fillStyle = hc; let posts = [];
  if (H === 'paddle') { poly([[nx, -w0], [nx - hl * .15, -w0 - .012], [hx, -w0 - .02], [hx, w0 + .02], [nx - hl * .15, w0 + .012], [nx, w0]]);
    const half = Math.ceil(np / 2); for (let i = 0; i < np; i++) { const top = i < half, k = top ? i : i - half, cnt = top ? half : np - half; posts.push([nx - hl * (.25 + .62 * (k + .5) / cnt), top ? -1 : 1, top ? -w0 - .016 : w0 + .016]); } }
  else if (H === 'inline') { poly([[nx, -w0], [nx - hl * .12, -w0 - .022], [nx - hl * .85, -w0 - .03], [hx, -w0 - .016], [hx, w0 - .006], [nx - hl * .55, w0 + .004], [nx - hl * .15, w0 + .012], [nx, w0]]);
    for (let i = 0; i < np; i++) posts.push([nx - hl * (.18 + .74 * (i + .5) / np), -1, -w0 - .024]); }
  else if (H === 'slotted') { poly([[nx, -w0 - .008], [hx, -w0 - .012], [hx, w0 + .012], [nx, w0 + .008]]); c.fillStyle = '#120c08';
    for (const s of [-1, 1]) c.fillRect(g.X(nx - hl * .85), g.Y(s > 0 ? .004 : -w0 + .002), hl * .7 * u, (w0 - .006) * u);
    const half = Math.ceil(np / 2); for (let i = 0; i < np; i++) { const top = i < half, k = top ? i : i - half, cnt = top ? half : np - half; posts.push([nx - hl * (.2 + .62 * (k + .5) / cnt), top ? -1 : 1, top ? -w0 - .012 : w0 + .012]); } }
  else if (H === 'scroll' || H === 'bentback' || H === 'pegbox') { const wf = H === 'bentback' ? .6 : H === 'pegbox' ? .8 : .85;
    poly([[nx, -w0], [hx + (H === 'scroll' ? .03 : 0), -w0 * wf], [hx + (H === 'scroll' ? .03 : 0), w0 * wf], [nx, w0]]);
    if (!back) { c.fillStyle = '#100a06'; poly([[nx - .01, -w0 * .55], [hx + (H === 'scroll' ? .035 : .012), -w0 * wf * .5], [hx + (H === 'scroll' ? .035 : .012), w0 * wf * .5], [nx - .01, w0 * .55]]); }
    if (H === 'scroll') { c.fillStyle = hc; c.beginPath(); c.arc(g.X(hx + .025), g.Y(0), w0 * 1.15 * u, 0, 7); c.fill(); c.strokeStyle = shade(nm, .45); c.lineWidth = 1.5 * d; c.beginPath();
      for (let t = 0; t < 14; t += .2) { const r = w0 * 1.1 * u * (1 - t / 15), a = t; const px = g.X(hx + .025) + Math.cos(a) * r, py = g.Y(0) + Math.sin(a) * r; t ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
    for (let i = 0; i < np; i++) { const s = i % 2 ? 1 : -1; posts.push([nx - .012 - (hl - .04) * (i + .5) / np, s, s * w0 * .9]); } }
  else if (H === 'headless') { poly([[nx, -w0 - .004], [hx, -w0 - .004], [hx, w0 + .004], [nx, w0 + .004]]); }
  // strings continue past the nut to their posts
  if (!back && H !== 'headless') { const pl = g.lines.filter(l => !l.symp); c.strokeStyle = 'rgba(220,215,200,.55)'; c.lineWidth = 1 * d;
    posts.forEach((p, i) => { const l = pl[i]; if (!l) return; c.beginPath(); c.moveTo(g.X(nx), g.Y(l.y0)); c.lineTo(g.X(p[0]), g.Y(p[2] * .55)); c.stroke(); }); }
  const style = H === 'headless' ? 'machine' : look.pegs;
  posts.forEach(p => drawPeg(c, g.X(p[0]), g.Y(p[2]), p[1], style, u, back));
  if (H === 'headless' && !back) { const pl = g.lines.filter(l => !l.symp); pl.forEach(l => drawPeg(c, g.X(g.bridgeX + .03), g.Y(l.y1), 1, 'planetary', u * .6, back)); }
}
// floating strings: a frame holds their far ends (harp neck & pillar, or a straight bar)
function drawFrame(g, c, look) {
  const d = devicePixelRatio || 1, u = g.sc, pl = g.lines.filter(l => !l.symp); if (!pl.length || look.frame === 'none') return;
  const nm = (NECKMATS[look.neckMat] || NECKMATS.Maple).c, P = bodyPoly(g.b);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (look.frame === 'bar') { const x = Math.min(...pl.map(l => l.start)) - .015; c.strokeStyle = nm; c.lineWidth = .022 * u; c.beginPath(); c.moveTo(g.X(x), g.Y(pl[0].y0 - .02)); c.lineTo(g.X(x), g.Y(pl[pl.length - 1].y0 + .02)); c.stroke(); }
  if (look.frame === 'harp') {
    c.strokeStyle = nm; c.lineWidth = .03 * u; c.beginPath(); pl.forEach((l, i) => { const x = g.X(l.start - .015), y = g.Y(l.y0); i ? c.lineTo(x, y) : c.moveTo(x, y); }); // neck through the string ends
    const first = pl[0], baseY = P.bb.y1 + .03; c.stroke();
    c.lineWidth = .04 * u; c.strokeStyle = shade(nm, .85); c.beginPath(); c.moveTo(g.X(first.start - .02), g.Y(first.y0 - .02)); c.lineTo(g.X(first.start - .05), g.Y(baseY)); c.lineTo(g.X(P.bb.x0 + .05), g.Y(baseY)); c.stroke(); // pillar and base
  }
}
