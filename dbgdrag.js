const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(500);
  await p.click('.faces button[data-face=amp]'); await p.waitForTimeout(200);
  for (const t of ['comp', 'od']) await p.selectOption('.board[data-b=pre] >> xpath=.. >> select.addp', t);
  const g = await p.locator('.board[data-b=pre] .pedal .grip').nth(1).boundingBox(), db = await p.locator('.board[data-b=post]').boundingBox();
  console.log('grip', JSON.stringify(g), 'post board', JSON.stringify(db));
  const at = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.className + ' / ' + e.tagName; }, [g.x + g.width / 2, g.y + g.height / 2]); console.log('element at grip:', at);
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
  console.log('dragUid after down', await p.evaluate(() => dragUid));
  await p.mouse.move(db.x + 30, db.y + db.height / 2, { steps: 8 });
  console.log('board over', await p.evaluate(() => document.querySelector('.board.over')?.dataset.b));
  await p.mouse.up(); await p.waitForTimeout(100);
  console.log('pre', await p.evaluate(() => cfg.amp.pre.map(x => x.type)), 'post', await p.evaluate(() => cfg.amp.post.map(x => x.type)));
  await b.close();
})();
