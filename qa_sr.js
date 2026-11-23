// quick: guitar & harp & cello clean at 48k vs 96k for several BODYK / pulse settings
const fs = require('fs'); let src = fs.readFileSync(__dirname + '/qa.js', 'utf8');
src = src.replace("vm.runInContext(fs.readFileSync(__dirname + '/synthdsp.js', 'utf8') + fs.readFileSync(__dirname + '/dsp.js', 'utf8'), ctx);",
  "vm.runInContext(fs.readFileSync(__dirname + '/synthdsp.js', 'utf8') + fs.readFileSync(__dirname + '/dsp.js', 'utf8'), ctx);");
src = src.split("const which =")[0] + `
for (const inst of ['Acoustic guitar', 'Concert harp', 'Cello', 'Electric guitar']) { const a = run(48000, inst, 'Init (clean)', 'chord'), b = run(96000, inst, 'Init (clean)', 'chord'), c = run(44100, inst, 'Init (clean)', 'chord');
  console.log(inst.padEnd(16), 'rms 44.1/48/96:', c.rms, a.rms, b.rms, ' Δ96', (b.rms - a.rms).toFixed(1)); }`;
fs.writeFileSync('/tmp/qsr.js', src.replace(/__dirname/g, "'" + __dirname + "'"));
