const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(800);
  await p.click('#startBtn'); await p.waitForTimeout(1500); console.log('start:', await p.textContent('#startBtn'), errs.join('|'));
  const presets = ['Acoustic guitar', 'Cello', 'Sitar', 'Koto'];
  for (const [i, pr] of presets.entries()) {
    await p.selectOption('#preset', 'f:' + pr); await p.waitForTimeout(300);
    await p.evaluate(() => { noteOn(55, .9); noteOn(60, .9); noteOn(64, .9); });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `/tmp/s${i}.png` });
    await p.evaluate(() => { noteOff(55); noteOff(60); noteOff(64); });
  }
  // tabs smoke test
  for (const t of ['exciter', 'neck', 'body', 'pickups']) { await p.click(`.tabs button[data-t=${t}]`); await p.waitForTimeout(100); }
  await p.screenshot({ path: '/tmp/tab.png' });
  await p.click('#editTog'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/edit.png' });
  const st = await p.evaluate(() => ({ amp: viz.amp.map(a => a.toFixed(3)), ctx: actx.state }));
  console.log(JSON.stringify(st)); console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
