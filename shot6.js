const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  for (const [w, h] of [[1440, 900], [1280, 720], [1920, 1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => errs.push('pageerror ' + e.message));
    await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400);
    await p.click('#startBtn'); await p.waitForTimeout(600);
    await p.click('.faces button[data-face=synth]'); await p.waitForTimeout(400);
    await p.selectOption('.sbar select', 'Auto-wah'); await p.waitForTimeout(300);
    const z = await p.evaluate(() => [document.getElementById('synthIn').style.zoom, document.getElementById('synth').scrollHeight, document.getElementById('synth').clientHeight]);
    console.log(w + 'x' + h, 'zoom', z);
    await p.evaluate(() => noteOn(52, .9)); await p.waitForTimeout(400);
    await p.screenshot({ path: `/tmp/fit_${w}.png` });
    // drag-drop still works under zoom
    const cb = await p.locator('.chip[data-src=lfo2]').first().boundingBox(), kb = await p.locator('.knob[data-id=amp_pan]').boundingBox();
    await p.mouse.move(cb.x + 15, cb.y + 8); await p.mouse.down(); await p.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 3, { steps: 6 }); await p.mouse.up();
    console.log('  drop ok:', await p.evaluate(() => cfg.synth.mods.some(m => m.s === 'lfo2' && m.d === 'amp_pan')));
    await p.click('.faces button[data-face=builder]');
    for (const pr of ['Violin', 'Double bass', 'Electric guitar', 'Oud', 'Concert harp', 'Hammered dulcimer', 'Guzheng', 'Tanpura', 'Hurdy-gurdy', 'Alpine zither', 'Erhu', 'Aeolian harp', '✦ Glass cello', '✦ Crystal harp']) {
      if (w !== 1440) break;
      await p.selectOption('#preset', 'f:' + pr); await p.evaluate(() => { noteOn(60, .9); noteOn(64, .9); }); await p.waitForTimeout(350);
      await p.screenshot({ path: `/tmp/pre_${pr.replace(/[^a-z]/gi, '')}.png`, clip: { x: 0, y: 50, width: 1050, height: 590 } });
      await p.evaluate(() => { noteOff(60); noteOff(64); });
    }
    await p.close();
  }
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
