const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(500);
  await p.click('#startBtn'); await p.waitForTimeout(800);
  await p.selectOption('#preset', 'f:Sitar');
  await p.click('#purBtn'); await p.click('.tabs button[data-t=neck]');
  await p.selectOption('#p-neck select >> nth=1', 'Bhairav');
  const r = await p.evaluate(() => { const out = []; for (let k = 60; k < 72; k++) { noteOn(k, .7); out.push(nn(k) + '→' + nn(keyMap.get(k))); noteOff(k); } return out.join(' '); });
  console.log('C Bhairav purity:', r);
  // two keys mapping to same note: release one keeps it held
  const r2 = await p.evaluate(() => { noteOn(60, .7); noteOn(61, .7); noteOff(61); const a = refs.get(61) ?? refs.get(60); noteOff(60); return [a, refs.size]; });
  console.log('refcount', r2);
  await p.evaluate(() => { noteOn(60, .7); noteOn(64, .05); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/tmp/pur.png' });
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
