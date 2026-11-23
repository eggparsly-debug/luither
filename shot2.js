const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(500);
  await p.click('#startBtn'); await p.waitForTimeout(1000);
  for (const [i, pr] of ['Cello', 'Koto', 'Acoustic guitar'].entries()) {
    await p.selectOption('#preset', 'f:' + pr); await p.waitForTimeout(300);
    await p.evaluate(() => { noteOn(50, .9); noteOn(57, .9); noteOn(64, .9); });
    await p.waitForTimeout(900); await p.screenshot({ path: `/tmp/t${i}.png`, clip: { x: 0, y: 50, width: 1050, height: 590 } });
    await p.evaluate(() => { noteOff(50); noteOff(57); noteOff(64); });
  }
  await p.click('.tabs button[data-t=exciter]'); await p.click('.exc button:nth-child(4)'); await p.waitForTimeout(100);
  await p.click('.tabs button[data-t=neck]'); await p.screenshot({ path: '/tmp/neck.png', clip: { x: 1050, y: 50, width: 390, height: 740 } });
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
