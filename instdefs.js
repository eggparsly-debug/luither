const SMAT = {
  'Steel':        { decay: 9,   bright: .08, stiff: .35, magnetic: 1,  color: '#dfe3ea' },
  'Bronze-wound': { decay: 8,   bright: .14, stiff: .2,  magnetic: .4, color: '#cc9450' },
  'Nickel-wound': { decay: 8,   bright: .12, stiff: .22, magnetic: 1,  color: '#bfc2c6' },
  'Nylon':        { decay: 4.5, bright: .38, stiff: .08, magnetic: 0,  color: '#f2efe6' },
  'Gut':          { decay: 3.5, bright: .42, stiff: .12, magnetic: 0,  color: '#e3cf98' },
  'Silk':         { decay: 3,   bright: .48, stiff: .06, magnetic: 0,  color: '#f7f1de' },
  'Tetron':       { decay: 4,   bright: .35, stiff: .1,  magnetic: 0,  color: '#efe6cf' },
  'Carbon':       { decay: 6,   bright: .25, stiff: .25, magnetic: 0,  color: '#8a8a8a' },
  '✦ Glass fiber':{ decay: 14,  bright: .03, stiff: .7,  magnetic: 0,  color: '#aee8f0' },
  '✦ Spider silk':{ decay: 12,  bright: .2,  stiff: .05, magnetic: 0,  color: '#ffffff' },
  '✦ Light beam': { decay: 30,  bright: 0,   stiff: 0,   magnetic: 1,  color: '#ffe66b' },
  '✦ Mud':        { decay: .6,  bright: .85, stiff: 0,   magnetic: 0,  color: '#7a5530' },
};
// E in GPa (effective, across both grain directions), density kg/m³, Q = how long it rings
const BMAT = {
  'Spruce':        { E: 4.5, rho: 420,  Q: 60,   color: '#e6cf98' },
  'Cedar':         { E: 3.8, rho: 380,  Q: 55,   color: '#c98a5a' },
  'Maple':         { E: 6,   rho: 650,  Q: 50,   color: '#e8c48a' },
  'Rosewood':      { E: 7,   rho: 850,  Q: 70,   color: '#6e3b28' },
  'Mahogany':      { E: 5,   rho: 560,  Q: 55,   color: '#8f4c2e' },
  'Walnut':        { E: 5.5, rho: 610,  Q: 50,   color: '#5e4330' },
  'Paulownia':     { E: 2.6, rho: 280,  Q: 45,   color: '#d9bc8c' },
  'Toon (tun)':    { E: 3.2, rho: 450,  Q: 45,   color: '#a8653b' },
  'Calabash gourd':{ E: 2,   rho: 500,  Q: 30,   color: '#c99f4e' },
  'Carbon fiber':  { E: 40,  rho: 1550, Q: 120,  color: '#3a3a3a' },
  'Aluminum':      { E: 69,  rho: 2700, Q: 400,  color: '#b9bec4' },
  'Brass':         { E: 100, rho: 8500, Q: 600,  color: '#c9a33a' },
  'Glass':         { E: 70,  rho: 2500, Q: 900,  color: '#9fd6e0' },
  'Marble':        { E: 50,  rho: 2700, Q: 300,  color: '#d9d5cf' },
  '✦ Aerogel':     { E: .01, rho: 3,    Q: 4,    color: '#dcecff' },
  '✦ Diamond':     { E: 1050,rho: 3500, Q: 3000, color: '#e9fbff' },
  '✦ Jelly':       { E: .0005,rho:1050, Q: 2.5,  color: '#e05a86' },
  '✦ Singing crystal':{ E: 20, rho: 300, Q: 8000, color: '#c2a6ff' },
};
const BRACING = {
  none:    { label: 'None',               f: 1,    asym: .3, mx: 1,   ny: 1 },
  ladder:  { label: 'Ladder',             f: 1.25, asym: .3, mx: 1,   ny: 1.4 },
  x:       { label: 'X-brace',            f: 1.35, asym: .6, mx: 1.1, ny: 1.1 },
  fan:     { label: 'Fan',                f: 1.15, asym: .4, mx: 1.2, ny: 1 },
  bassbar: { label: 'Bass bar + soundpost', f: 1.3, asym: .9, mx: 1.05, ny: 1.15 },
};
const BACKS = {
  flat:   { label: 'Flat (guitar)',          f: r => 1 },
  arched: { label: 'Carved arch (violin)',   f: r => 1 - .4 * Math.pow(r, 2.2) },
  bowl:   { label: 'Round bowl (oud)',       f: r => Math.max(.1, Math.sqrt(1 - r * r)) },
  ribbed: { label: 'Ribbed staves (lute)',   f: r => Math.max(.1, Math.sqrt(1 - r * r)), ribs: 11 },
  gourd:  { label: 'Gourd (sitar)',          f: r => Math.max(.15, Math.pow(1 - Math.pow(r, 2.5), .55)) },
  keel:   { label: '✦ Keel (boat hull)',     f: r => Math.max(.08, 1 - r * .92) },
  custom: { label: 'Custom (drag the points)' },
};
function applyBack(shape) { const b = cfg.body, D = Math.max(...b.depth); b.backShape = shape; const f = BACKS[shape]?.f; if (f) b.depth = b.depth.map((_, i) => +(D * f(i / (b.depth.length - 1))).toFixed(4)); }
const ROLE = { stopped: { c: '#e9b65a', l: 'Stopped' }, open: { c: '#7fc4b8', l: 'Open' }, drone: { c: '#d97a5b', l: 'Drone' }, symp: { c: '#a99be0', l: 'Sympathetic' } };
const EXC = [
  ['pick', 'Pick', '◣'], ['finger', 'Finger', '●'], ['hammer', 'Hammer', '▮'],
  ['bow', 'Bow', '〰'], ['ebow', 'E-bow', '◉'], ['wind', 'Wind', '≋'],
];
const S = (role, note, mat, gauge, o = {}) => ({ role, note, range: o.range ?? 12, mat, gauge, wound: !!o.wound, tension: o.tension ?? .5 });
const exDefault = () => ({ type: 'pick', pos: .15, pickStiff: .6, fingerSoft: .4, hammerHard: .6, pressure: .5, speed: .5,
  attack: .08, release: .25, bowChange: true, humanize: .3, vibDepth: 0, vibDelay: .45, vibRate: 5.5, ebow: .6, wind: .5, gust: .3, drone: .2 });
const nkDefault = () => ({ frets: true, buzz: 0, jawari: 0, legato: 'smart', thrAuto: true, thr: 4, glide: .01, pbRange: 2, pressBend: 2,
  dampOpen: false, mute: .25, coupling: .5, sympC: .3 });
const PRESETS = {
  'Acoustic guitar': () => ({
    strings: [S('stopped',40,'Bronze-wound',.9,{range:19,wound:1}), S('stopped',45,'Bronze-wound',.75,{range:19,wound:1}), S('stopped',50,'Bronze-wound',.6,{range:19,wound:1}),
      S('stopped',55,'Bronze-wound',.45,{range:19,wound:1}), S('stopped',59,'Steel',.3,{range:19}), S('stopped',64,'Steel',.2,{range:19})],
    ex: { ...exDefault(), type: 'pick', pos: .16, pickStiff: .6, vibDepth: 0 },
    nk: { ...nkDefault(), frets: true, buzz: .05, glide: .01 },
    body: { length: .505, hw: [.07,.125,.142,.135,.12,.125,.16,.185,.19,.17,.08], depth: [.1,.1,.1,.1,.1,.1,.1],
      top: 'Spruce', back: 'Rosewood', topT: 2.8, backT: 2.5, bracing: 'x', braceS: .5, hole: { type: 'round', x: .28, size: .8 }, bridgeX: .57, neckLen: .36, nutX: .05 , backShape: 'flat' },
    pk: { mag: 0, magPos: .12, piezo: .3, mic: .9, master: .8 },
  }),
  'Cello': () => ({
    strings: [S('stopped',36,'Nickel-wound',.85,{range:26,wound:1}), S('stopped',43,'Nickel-wound',.7,{range:26,wound:1}),
      S('stopped',50,'Steel',.45,{range:26}), S('stopped',57,'Steel',.35,{range:26})],
    ex: { ...exDefault(), type: 'bow', pos: .12, pressure: .5, speed: .5, attack: .09, release: .22, vibDepth: 18, vibDelay: .35, vibRate: 5.6 },
    nk: { ...nkDefault(), frets: false, glide: .09, thr: 5 },
    body: { length: .75, hw: [.09,.16,.17,.15,.115,.12,.18,.215,.22,.19,.09], depth: [.13,.128,.125,.12,.115,.11,.1],
      top: 'Spruce', back: 'Maple', topT: 3.5, backT: 4, bracing: 'bassbar', braceS: .5, hole: { type: 'f', x: .55, size: .55 }, bridgeX: .55, neckLen: .28, nutX: .05 , backShape: 'arched' },
    pk: { mag: 0, magPos: .12, piezo: .15, mic: 1, master: .8 },
  }),
  'Sitar': () => ({
    strings: [S('stopped',53,'Steel',.25,{range:26}), S('stopped',48,'Bronze-wound',.45,{range:12,wound:1}),
      S('drone',36,'Bronze-wound',.6,{wound:1}), S('drone',43,'Bronze-wound',.5,{wound:1}), S('drone',60,'Steel',.2), S('drone',72,'Steel',.15),
      ...[60,62,64,65,67,69,71,72,74,76,77].map(n => S('symp', n, 'Steel', .1))],
    ex: { ...exDefault(), type: 'pick', pos: .08, pickStiff: .82, drone: .12, vibDepth: 0 },
    nk: { ...nkDefault(), frets: true, jawari: .75, glide: .12, sympC: .8, thr: 4 },
    body: { length: .42, hw: [.06,.13,.17,.195,.207,.21,.207,.195,.17,.13,.06], depth: [.2,.195,.18,.16,.13,.09,.04],
      top: 'Toon (tun)', back: 'Calabash gourd', topT: 4, backT: 6, bracing: 'none', braceS: .5, hole: { type: 'none', x: .5, size: .4 }, bridgeX: .62, neckLen: .62, nutX: .05 , backShape: 'gourd' },
    pk: { mag: 0, magPos: .12, piezo: .2, mic: 1, master: .8 },
  }),
  'Koto': () => ({
    strings: [50,43,45,46,50,51,55,57,58,62,63,67,69].map(n => S('open', n, 'Tetron', .35, { tension: .4 })),
    ex: { ...exDefault(), type: 'pick', pos: .1, pickStiff: .72 },
    nk: { ...nkDefault(), frets: false, glide: .12, pressBend: 2 },
    body: { length: 1.82, hw: [.11,.12,.12,.12,.12,.12,.12,.12,.12,.12,.11], depth: [.07,.07,.068,.065,.06,.05,.035],
      top: 'Paulownia', back: 'Paulownia', topT: 10, backT: 10, bracing: 'none', braceS: .5, hole: { type: 'under', x: .6, size: .6 }, bridgeX: .93, neckLen: 0, nutX: .06 , backShape: 'arched' },
    pk: { mag: 0, magPos: .12, piezo: .2, mic: 1, master: .8 },
  }),
};
// ── more factory instruments ──
BMAT['Snakeskin'] = { E: .35, rho: 1100, Q: 14, color: '#bfa77a' };
const diat = (root, steps, count) => { const out = []; for (let i = 0; out.length < count; i++) out.push(root + 12 * Math.floor(i / steps.length) + steps[i % steps.length]); return out; };
const body = (o) => ({ topT: 3, backT: 3, bracing: 'none', braceS: .5, hole: { type: 'round', x: .3, size: .6 }, bridgeX: .6, neckLen: .3, nutX: .05, backShape: 'flat', ...o });
const pre = (o) => () => ({ ex: { ...exDefault(), ...o.ex }, nk: { ...nkDefault(), ...o.nk }, pk: { mag: 0, magPos: .12, piezo: .2, mic: 1, master: .8, ...o.pk }, strings: o.strings(), body: body(o.body), ampPreset: o.amp });
Object.assign(PRESETS, {
  'Violin': pre({
    strings: () => [S('stopped',55,'Gut',.45,{range:31}), S('stopped',62,'Gut',.35,{range:31}), S('stopped',69,'Steel',.25,{range:31}), S('stopped',76,'Steel',.15,{range:31})],
    ex: { type: 'bow', pos: .1, pressure: .5, speed: .5, attack: .06, release: .2, vibDepth: 22, vibDelay: .3, vibRate: 6 },
    nk: { frets: false, glide: .07, thr: 5 },
    body: { length: .355, hw: [.06,.085,.083,.075,.055,.058,.09,.103,.105,.09,.05], depth: [.045,.044,.043,.041,.038,.034,.028], top: 'Spruce', back: 'Maple', topT: 3, backT: 3.5,
      bracing: 'bassbar', hole: { type: 'f', x: .55, size: .3 }, bridgeX: .55, neckLen: .13, backShape: 'arched' } }),
  'Double bass': pre({
    strings: () => [S('stopped',28,'Nickel-wound',.95,{range:24,wound:1}), S('stopped',33,'Nickel-wound',.85,{range:24,wound:1}), S('stopped',38,'Nickel-wound',.7,{range:24,wound:1}), S('stopped',43,'Nickel-wound',.6,{range:24,wound:1})],
    ex: { type: 'bow', pos: .13, pressure: .55, speed: .45, attack: .12, release: .3, vibDepth: 12, vibDelay: .5, vibRate: 5 },
    nk: { frets: false, glide: .1, thr: 5 },
    body: { length: 1.1, hw: [.14,.24,.26,.23,.17,.18,.27,.32,.34,.29,.13], depth: [.2,.2,.2,.2,.2,.2,.2], top: 'Spruce', back: 'Maple', topT: 4.5, backT: 4.5,
      bracing: 'bassbar', hole: { type: 'f', x: .55, size: .9 }, bridgeX: .55, neckLen: .455, backShape: 'flat' } }),
  'Classical guitar': pre({
    strings: () => [S('stopped',40,'Nylon',.8,{range:19,wound:1}), S('stopped',45,'Nylon',.7,{range:19,wound:1}), S('stopped',50,'Nylon',.6,{range:19,wound:1}),
      S('stopped',55,'Nylon',.5,{range:19}), S('stopped',59,'Nylon',.4,{range:19}), S('stopped',64,'Nylon',.3,{range:19})],
    ex: { type: 'finger', pos: .18, fingerSoft: .45 }, nk: { frets: true, glide: .01 },
    body: { length: .49, hw: [.07,.12,.14,.135,.12,.125,.15,.17,.18,.165,.08], depth: [.095,.095,.095,.095,.095,.095,.095], top: 'Cedar', back: 'Rosewood', topT: 2.5, backT: 2.4,
      bracing: 'fan', hole: { type: 'round', x: .3, size: .75 }, bridgeX: .63, neckLen: .34 } }),
  'Electric guitar': pre({
    strings: () => [S('stopped',40,'Nickel-wound',.75,{range:22,wound:1}), S('stopped',45,'Nickel-wound',.6,{range:22,wound:1}), S('stopped',50,'Nickel-wound',.5,{range:22,wound:1}),
      S('stopped',55,'Steel',.35,{range:22}), S('stopped',59,'Steel',.25,{range:22}), S('stopped',64,'Steel',.18,{range:22})],
    ex: { type: 'pick', pos: .13, pickStiff: .7 }, nk: { frets: true, buzz: .03, glide: .01 }, pk: { mag: 1.1, magPos: .18, piezo: 0, mic: 0 }, amp: 'Clean American',
    body: { length: .45, hw: [.1,.15,.16,.15,.12,.13,.16,.17,.165,.14,.07], depth: [.045,.045,.045,.045,.045,.045,.045], top: 'Mahogany', back: 'Mahogany', topT: 25, backT: 20,
      hole: { type: 'none', x: .5, size: .5 }, bridgeX: .48, neckLen: .43 } }),
  'Electric bass': pre({
    strings: () => [S('stopped',28,'Nickel-wound',.95,{range:20,wound:1}), S('stopped',33,'Nickel-wound',.85,{range:20,wound:1}), S('stopped',38,'Nickel-wound',.72,{range:20,wound:1}), S('stopped',43,'Nickel-wound',.6,{range:20,wound:1})],
    ex: { type: 'finger', pos: .2, fingerSoft: .3 }, nk: { frets: true, glide: .01 }, pk: { mag: 1.1, magPos: .2, piezo: 0, mic: 0 }, amp: 'Bass amp',
    body: { length: .5, hw: [.11,.16,.17,.16,.13,.14,.17,.18,.175,.15,.08], depth: [.045,.045,.045,.045,.045,.045,.045], top: 'Mahogany', back: 'Mahogany', topT: 25, backT: 20,
      hole: { type: 'none', x: .5, size: .5 }, bridgeX: .49, neckLen: .62 } }),
  'Oud': pre({
    strings: () => [36,41,45,50,55,60].map((n, i) => S('stopped', n, 'Nylon', .75 - i * .09, { range: 14, wound: i < 3 })),
    ex: { type: 'pick', pos: .12, pickStiff: .5 }, nk: { frets: false, glide: .1, thr: 4 },
    body: { length: .5, hw: [.05,.1,.135,.16,.175,.182,.18,.17,.15,.11,.04], depth: [.2,.197,.187,.17,.145,.11,.04], top: 'Spruce', back: 'Walnut', topT: 2, backT: 2,
      hole: { type: 'rose', x: .35, size: .6 }, bridgeX: .82, neckLen: .2, backShape: 'ribbed' } }),
  'Concert harp': pre({
    strings: () => diat(36, [0,2,4,5,7,9,11], 24).map((n, i) => S('open', n, i < 7 ? 'Nickel-wound' : 'Gut', .7 - i * .025, { wound: i < 7 })),
    ex: { type: 'finger', pos: .32, fingerSoft: .55 }, nk: { frets: false, pressBend: 0 },
    body: { length: 1.3, hw: [.05,.06,.07,.08,.09,.1,.11,.12,.13,.14,.15], depth: [.22,.218,.21,.195,.17,.13,.05], top: 'Spruce', back: 'Maple', topT: 3, backT: 5,
      hole: { type: 'under', x: .55, size: .7 }, bridgeX: .96, neckLen: 0, nutX: .04, backShape: 'bowl' } }),
  'Hammered dulcimer': pre({
    strings: () => diat(50, [0,2,4,5,7,9,11], 22).map((n, i) => S('open', n, i < 6 ? 'Bronze-wound' : 'Steel', .45 - i * .012)),
    ex: { type: 'hammer', pos: .3, hammerHard: .55 }, nk: { frets: false, pressBend: 0 },
    body: { length: .95, hw: [.36,.34,.32,.3,.28,.26,.24,.22,.2,.18,.16], depth: [.07,.07,.07,.07,.07,.07,.07], top: 'Spruce', back: 'Maple', topT: 6, backT: 8,
      bracing: 'ladder', hole: { type: 'rose', x: .3, size: .45 }, bridgeX: .95, neckLen: 0, nutX: .05 } }),
  'Guzheng': pre({
    strings: () => diat(38, [0,2,4,7,9], 21).map((n, i) => S('open', n, 'Tetron', .5 - i * .015, { tension: .45 })),
    ex: { type: 'pick', pos: .1, pickStiff: .7 }, nk: { frets: false, glide: .12, pressBend: 2 },
    body: { length: 1.63, hw: [.12,.13,.14,.145,.15,.15,.15,.15,.15,.15,.14], depth: [.08,.08,.078,.074,.068,.058,.04], top: 'Paulownia', back: 'Paulownia', topT: 9, backT: 9,
      hole: { type: 'under', x: .55, size: .7 }, bridgeX: .94, neckLen: 0, nutX: .05, backShape: 'arched' } }),
  'Tanpura': pre({
    strings: () => [S('open',43,'Steel',.3), S('open',48,'Steel',.25), S('open',48,'Steel',.25), S('open',36,'Bronze-wound',.55,{wound:1})],
    ex: { type: 'finger', pos: .3, fingerSoft: .5 }, nk: { frets: false, jawari: .85, sympC: .5 },
    body: { length: .5, hw: [.07,.15,.2,.23,.245,.25,.245,.23,.2,.15,.07], depth: [.25,.245,.23,.2,.16,.11,.05], top: 'Toon (tun)', back: 'Calabash gourd', topT: 4, backT: 6,
      hole: { type: 'none', x: .5, size: .4 }, bridgeX: .62, neckLen: .9, backShape: 'gourd' } }),
  'Hurdy-gurdy': pre({
    strings: () => [S('stopped',55,'Gut',.35,{range:24}), S('stopped',55,'Gut',.35,{range:24}), S('drone',36,'Gut',.7,{wound:1}), S('drone',43,'Gut',.55,{wound:1}), S('drone',48,'Gut',.45)],
    ex: { type: 'bow', pos: .14, pressure: .6, speed: .55, attack: .03, release: .08, bowChange: false, humanize: .15, drone: .5 },
    nk: { frets: true, legato: 'legato', glide: .01 },
    body: { length: .5, hw: [.09,.12,.14,.15,.15,.15,.15,.14,.13,.11,.08], depth: [.1,.1,.1,.1,.1,.1,.1], top: 'Spruce', back: 'Maple', topT: 3, backT: 3,
      bracing: 'ladder', hole: { type: 'f', x: .7, size: .4 }, bridgeX: .82, neckLen: 0, nutX: .05 } }),
  'Alpine zither': pre({
    strings: () => [S('stopped',69,'Steel',.2,{range:29}), S('stopped',69,'Steel',.2,{range:29}), S('stopped',62,'Steel',.25,{range:29}), S('stopped',55,'Bronze-wound',.35,{range:29,wound:1}), S('stopped',48,'Bronze-wound',.45,{range:29,wound:1}),
      ...[51,46,53,48,55,50,57,52,59,54,49,56,44,39,46,41,36,43,38].map((n, i) => S('open', n, n < 46 ? 'Bronze-wound' : 'Steel', n < 46 ? .55 : .3, { wound: n < 46 }))],
    ex: { type: 'pick', pos: .15, pickStiff: .65 }, nk: { frets: true, glide: .01 },
    body: { length: .6, hw: [.15,.17,.18,.18,.18,.18,.18,.18,.18,.17,.15], depth: [.05,.05,.05,.05,.05,.05,.05], top: 'Spruce', back: 'Maple', topT: 3, backT: 4,
      bracing: 'ladder', hole: { type: 'round', x: .4, size: .6 }, bridgeX: .93, neckLen: 0, nutX: .05 } }),
  'Erhu': pre({
    strings: () => [S('stopped',62,'Steel',.3,{range:30}), S('stopped',69,'Steel',.22,{range:30})],
    ex: { type: 'bow', pos: .08, pressure: .55, speed: .5, attack: .05, release: .15, vibDepth: 30, vibDelay: .25, vibRate: 5.5 },
    nk: { frets: false, legato: 'legato', glide: .09 },
    body: { length: .13, hw: [.035,.042,.045,.045,.045,.045,.045,.045,.045,.042,.035], depth: [.13,.13,.13,.13,.13,.13,.13], top: 'Snakeskin', back: 'Rosewood', topT: .6, backT: 6,
      hole: { type: 'under', x: .5, size: .9 }, bridgeX: .5, neckLen: .7 } }),
  'Aeolian harp': pre({
    strings: () => [38,50,57,62,66,69,72,74,76,78].map((n, i) => S('open', n, 'Gut', .55 - i * .04)),
    ex: { type: 'wind', pos: .3, wind: .55, gust: .65, attack: .9, release: 1.6 }, nk: { frets: false, pressBend: 0 },
    body: { length: .9, hw: [.11,.12,.12,.12,.12,.12,.12,.12,.12,.12,.11], depth: [.07,.07,.07,.07,.07,.07,.07], top: 'Spruce', back: 'Maple', topT: 3, backT: 4,
      hole: { type: 'round', x: .5, size: .55 }, bridgeX: .95, neckLen: 0, nutX: .05 } }),
  '✦ Glass cello': pre({
    strings: () => [36,43,50,57].map((n, i) => S('stopped', n, '✦ Glass fiber', .7 - i * .12, { range: 26 })),
    ex: { type: 'bow', pos: .12, pressure: .45, speed: .5, attack: .12, release: .4, vibDepth: 14 }, nk: { frets: false, glide: .09, thr: 5 },
    body: { length: .75, hw: [.09,.16,.17,.15,.115,.12,.18,.215,.22,.19,.09], depth: [.13,.128,.125,.12,.115,.11,.1], top: 'Glass', back: 'Glass', topT: 3, backT: 3,
      bracing: 'bassbar', hole: { type: 'f', x: .55, size: .55 }, bridgeX: .55, neckLen: .28, backShape: 'arched' } }),
  '✦ Crystal harp': pre({
    strings: () => [...diat(48, [0,2,4,7,9], 16).map(n => S('open', n, '✦ Light beam', .2)), ...[60,64,67,72,76,79,84,88].map(n => S('symp', n, '✦ Spider silk', .1))],
    ex: { type: 'finger', pos: .3, fingerSoft: .6 }, nk: { frets: false, pressBend: 0, sympC: .7 },
    body: { length: 1.1, hw: [.06,.07,.08,.09,.1,.11,.12,.13,.14,.15,.16], depth: [.2,.198,.19,.175,.15,.11,.04], top: '✦ Singing crystal', back: '✦ Singing crystal', topT: 2, backT: 2,
      hole: { type: 'under', x: .55, size: .6 }, bridgeX: .96, neckLen: 0, nutX: .04, backShape: 'bowl' } }),
});

// ── output levels calibrated by the QA suite: strummed chord peaks near -3 dBFS, sustained RMS no hotter than -16 dBFS ──
const CAL = {"Acoustic guitar": 1.007, "Cello": 0.697, "Sitar": 1.043, "Koto": 1.328, "Violin": 0.809, "Double bass": 0.361, "Classical guitar": 0.65, "Electric guitar": 0.213, "Electric bass": 0.16, "Oud": 2.153, "Concert harp": 0.488, "Hammered dulcimer": 0.45, "Guzheng": 1.374, "Tanpura": 1.596, "Hurdy-gurdy": 0.857, "Alpine zither": 1.055, "Erhu": 0.326, "Aeolian harp": 0.996, "✦ Glass cello": 0.847, "✦ Crystal harp": 0.281};
for (const k in CAL) { const f = PRESETS[k]; PRESETS[k] = () => { const p = f(); p.pk.master = CAL[k]; return p; }; }
