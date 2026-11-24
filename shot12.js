const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(400);
  await p.selectOption('#preset', 'f:Slide guitar (resonator)'); await p.waitForTimeout(200);
  await p.evaluate(() => { noteOn(50, .8); }); await p.waitForTimeout(150); await p.evaluate(() => { noteOn(57, .8); }); await p.waitForTimeout(250);
  await p.screenshot({ path: '/tmp/sl_main.png' });
  await p.evaluate(() => { [...document.querySelectorAll('button,.tab')].find(e => /^Exciter/i.test(e.textContent.trim()))?.click(); }); await p.waitForTimeout(200);
  await p.screenshot({ path: '/tmp/sl_ex.png' });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
