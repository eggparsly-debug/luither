const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(500);
  await p.selectOption('#preset', 'f:Electric guitar'); await p.click('.faces button[data-face=amp]'); await p.waitForTimeout(200);
  for (const t of ['comp', 'od', 'fuzz', 'phaser', 'geq', 'octave']) await p.selectOption('.board[data-b=pre] >> xpath=.. >> select.addp', t);
  for (const t of ['rotary', 'delay', 'spring', 'hall']) await p.selectOption('.board[data-b=post] >> xpath=.. >> select.addp', t);
  await p.evaluate(() => { noteOn(52, 1); noteOn(59, 1); }); await p.waitForTimeout(600);
  console.log('amp face content h / visible h:', await p.evaluate(() => [document.getElementById('amp').scrollHeight, document.getElementById('amp').clientHeight]));
  await p.screenshot({ path: '/tmp/amp3.png' });
  const g = await p.locator('.board[data-b=pre] .pedal .grip').nth(2).boundingBox(), db = await p.locator('.board[data-b=post] .pedal').nth(1).boundingBox();
  await p.mouse.move(g.x + 4, g.y + 8); await p.mouse.down(); await p.mouse.move(db.x + 5, db.y + 40, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150);
  console.log('after drag  pre:', await p.evaluate(() => cfg.amp.pre.map(x => x.type).join(',')), ' post:', await p.evaluate(() => cfg.amp.post.map(x => x.type).join(',')));
  const g2 = await p.locator('.board[data-b=pre] .pedal .grip').nth(0).boundingBox(), d2 = await p.locator('.board[data-b=pre] .pedal').nth(3).boundingBox();
  await p.mouse.move(g2.x + 4, g2.y + 8); await p.mouse.down(); await p.mouse.move(d2.x + d2.width - 5, d2.y + 40, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150);
  console.log('reorder     pre:', await p.evaluate(() => cfg.amp.pre.map(x => x.type).join(',')));
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
