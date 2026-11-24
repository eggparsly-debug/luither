const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(600);
  await p.selectOption('#preset', 'f:Electric guitar'); await p.click('.faces button[data-face=amp]'); await p.waitForTimeout(300);
  for (const t of ['comp', 'od', 'fuzz', 'phaser', 'geq']) { await p.selectOption('.board[data-b=pre] >> xpath=.. >> select.addp', t); await p.waitForTimeout(80); }
  for (const t of ['rotary', 'delay', 'spring', 'hall']) { await p.selectOption('.board[data-b=post] >> xpath=.. >> select.addp', t); await p.waitForTimeout(80); }
  await p.evaluate(() => { noteOn(52, 1); noteOn(59, 1); noteOn(64, 1); }); await p.waitForTimeout(700);
  console.log('amp on:', await p.evaluate(() => cfg.amp.on), 'preset', await p.evaluate(() => cfg.amp.preset), 'pre', await p.evaluate(() => cfg.amp.pre.map(x => x.type).join(',')), 'post', await p.evaluate(() => cfg.amp.post.map(x => x.type).join(',')));
  console.log('worklet pedals', await p.evaluate(() => Object.keys(viz.rig?.pd || {}).length), 'out level', await p.evaluate(() => (viz.rig.head.out || 0).toFixed(3)));
  await p.screenshot({ path: '/tmp/amp1.png' });
  // drag the fuzz pedal to the effects loop board
  const src = p.locator('.board[data-b=pre] .pedal').nth(2), dst = p.locator('.board[data-b=post]');
  { const g = await src.locator('.grip').boundingBox(), db = await dst.boundingBox(); await p.mouse.move(g.x + 4, g.y + 4); await p.mouse.down(); await p.mouse.move(db.x + 10, db.y + 60, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200); }
  console.log('after drag pre', await p.evaluate(() => cfg.amp.pre.map(x => x.type).join(',')), 'post', await p.evaluate(() => cfg.amp.post.map(x => x.type).join(',')));
  // switch amp preset and toggle a footswitch
  await p.selectOption('#ampPreset', 'High-gain modern'); await p.waitForTimeout(200);
  await p.locator('.pedal .foot').first().click(); await p.waitForTimeout(200);
  console.log('first pedal on?', await p.evaluate(() => cfg.amp.pre[0].on), 'preset', await p.evaluate(() => cfg.amp.preset), 'pedals kept', await p.evaluate(() => cfg.amp.pre.length + cfg.amp.post.length));
  // instrument switch keeps pedals, switches amp off for acoustics
  await p.selectOption('#preset', 'f:Cello'); await p.waitForTimeout(200);
  console.log('cello: amp on', await p.evaluate(() => cfg.amp.on), 'pedals', await p.evaluate(() => cfg.amp.pre.length + cfg.amp.post.length));
  await p.screenshot({ path: '/tmp/amp2.png' });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
