const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(600);
  await p.selectOption('#preset', 'f:Cello'); await p.click('.faces button[data-face=synth]'); await p.selectOption('.sbar select', 'Auto-wah'); await p.waitForTimeout(200);
  const peakX = async () => p.evaluate(() => { const c = document.getElementById('cv_f1'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let best = 0, bx = 0;
    for (let i = 0; i < c.width; i++) for (let j = 0; j < c.height; j++) { const o = (j * c.width + i) * 4; if (d[o + 1] > 150 && d[o] < 160) { if (c.height - j > best) { best = c.height - j; bx = i; } break; } } return bx; });
  const a = await peakX(); await p.evaluate(() => noteOn(50, 1)); await p.waitForTimeout(500); const bb = await peakX();
  console.log('wah curve peak x: silent', a, '→ bowing', bb, bb !== a ? '(moves live ✓)' : '(static ✗)');
  // knob drag redraws curve without modulation
  const k = await p.locator('.knob[data-id=f2_cut]').boundingBox(); await p.evaluate(() => noteOff(50));
  const before = await p.evaluate(() => document.getElementById('cv_f2').toDataURL().length);
  await p.mouse.move(k.x + 23, k.y + 20); await p.mouse.down(); await p.mouse.move(k.x + 23, k.y - 40, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100);
  const after = await p.evaluate(() => document.getElementById('cv_f2').toDataURL().length);
  console.log('filter 2 curve redrawn on knob drag:', before !== after);
  for (const k of ['lfo1_sync', 'lfo2_sync', 'mfx_sync', 'gate_div']) { const opts = await p.evaluate(k => [...document.querySelectorAll('.ssel')].find(s => [...s.options].some(o => o.value === '1/8t'))?.options.length, k); }
  await p.evaluate(() => { cfg.synth.o.lfo1_sync = '1/8.'; cfg.synth.o.mfx_sync = '1/16t'; cfg.synth.o.mfx_on = true; pushSynth(); buildSynth(); });
  await p.waitForTimeout(200); await p.screenshot({ path: '/tmp/sync.png', clip: { x: 0, y: 100, width: 1440, height: 440 } });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
