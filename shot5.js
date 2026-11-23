const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(500);
  await p.click('#startBtn'); await p.waitForTimeout(800);
  await p.click('.faces button[data-face=synth]'); await p.waitForTimeout(300);
  await p.selectOption('.sbar select', 'Auto-wah'); await p.waitForTimeout(200);
  await p.evaluate(() => { noteOn(52, .9); noteOn(59, .9); }); await p.waitForTimeout(700);
  await p.screenshot({ path: '/tmp/syn1.png' });
  // drag LFO 1 chip onto Filter 1 resonance
  const chipBox = await p.locator('.chip[data-src=lfo1]').first().boundingBox();
  const kBox = await p.locator('.knob[data-id=f1_res]').boundingBox();
  await p.mouse.move(chipBox.x + 20, chipBox.y + 10); await p.mouse.down();
  await p.mouse.move(kBox.x + 20, kBox.y + 20, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(200);
  // drag a knob
  const k2 = await p.locator('.knob[data-id=f1_cut]').boundingBox();
  await p.mouse.move(k2.x + 29, k2.y + 25); await p.mouse.down(); await p.mouse.move(k2.x + 29, k2.y - 20, { steps: 5 }); await p.mouse.up();
  console.log('mods:', JSON.stringify(await p.evaluate(() => cfg.synth.mods)), 'cut', await p.evaluate(() => cfg.synth.p.f1_cut.toFixed(0)));
  for (const pr of ['Electric vibrato', 'Flanger', 'Trance gate', 'Talk box', 'Wandering bow', 'Saw morph']) { await p.selectOption('.sbar select', pr); await p.waitForTimeout(150); }
  await p.evaluate(() => { noteOn(55, .9); }); await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/syn2.png' });
  await p.click('.faces button[data-face=builder]'); await p.waitForTimeout(300); await p.screenshot({ path: '/tmp/syn3.png', clip: { x: 0, y: 0, width: 1440, height: 400 } });
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
