const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(500);
  const names = ['Electric guitar', 'Electric bass', 'Classical guitar', 'Violin', 'Double bass', 'Sitar', 'Oud', 'Erhu', 'Concert harp', '✦ Crystal harp', 'Koto', 'Acoustic guitar'];
  for (const n of names) { await p.selectOption('#preset', 'f:' + n); await p.waitForTimeout(250); await p.screenshot({ path: `/tmp/lk_${n.replace(/[^a-z]/gi, '')}.png`, clip: { x: 0, y: 50, width: 1050, height: 590 } }); }
  await p.selectOption('#preset', 'f:Electric guitar'); await p.click('#backTog'); await p.waitForTimeout(250); await p.screenshot({ path: '/tmp/lk_back.png', clip: { x: 0, y: 50, width: 1050, height: 590 } }); await p.click('#backTog');
  await p.click('#editTog'); await p.waitForTimeout(150);
  // drag a horn point outward with mirror off
  await p.click('.tabs button[data-t=body]'); await p.locator('#p-body label.chk input').first().uncheck();
  const pt = await p.evaluate(() => { const g = G, o = cfg.body.outline; return [g.X(o[2][0]) / devicePixelRatio, g.Y(o[2][1]) / devicePixelRatio + 50]; });
  await p.mouse.move(pt[0], pt[1]); await p.mouse.down(); await p.mouse.move(pt[0] - 40, pt[1] - 20, { steps: 5 }); await p.mouse.up();
  console.log('horn point moved to', await p.evaluate(() => cfg.body.outline[2].map(v => v.toFixed(3)).join(',')), 'area', await p.evaluate(() => bodyPoly(cfg.body).area.toFixed(4)));
  await p.screenshot({ path: '/tmp/lk_edit.png', clip: { x: 0, y: 50, width: 1050, height: 590 } });
  await p.click('.tabs button[data-t=neck]'); await p.waitForTimeout(100); await p.screenshot({ path: '/tmp/lk_panel.png', clip: { x: 1050, y: 50, width: 390, height: 740 } });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
