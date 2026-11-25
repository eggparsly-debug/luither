const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(400);
  for (const n of ['Sitar', 'Electric bass', 'Concert harp', 'Acoustic guitar']) { await p.selectOption('#preset', 'f:' + n); await p.waitForTimeout(150); await p.evaluate(() => { noteOn(52, .8); noteOn(59, .8); }); await p.waitForTimeout(600); await p.evaluate(() => { noteOff(52); noteOff(59); }); }
  await p.screenshot({ path: '/tmp/r14.png', clip: { x: 0, y: 0, width: 1440, height: 700 } });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
