const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(400);
  for (const n of ['Concert harp', '✦ Crystal harp']) { await p.selectOption('#preset', 'f:' + n); await p.evaluate(() => { noteOn(48, .8); noteOn(55, .8); }); await p.waitForTimeout(350);
    await p.screenshot({ path: `/tmp/hp_${n.replace(/[^a-z]/gi, '')}.png`, clip: { x: 0, y: 50, width: 1050, height: 590 } }); }
  await p.click('#backTog'); await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/hp_back.png', clip: { x: 0, y: 50, width: 1050, height: 590 } });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
