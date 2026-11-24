const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(300);
  await p.selectOption('#preset', 'f:Acoustic guitar'); await p.waitForTimeout(200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(e => /Edit outline/.test(e.textContent)).click());
  const pt = i => p.evaluate(i => { const o = cfg.body.outline, r = cv.getBoundingClientRect(), d = devicePixelRatio; return [r.left + G.X(o[i][0]) / d, r.top + G.Y(o[i][1]) / d]; }, i);
  const n0 = await p.evaluate(() => cfg.body.outline.length);
  // pick an off-axis point
  const idx = await p.evaluate(() => cfg.body.outline.findIndex(([x, y]) => y > .08));
  const snap = () => p.evaluate(() => JSON.stringify(cfg.body.outline.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)])));
  // shift-drag: only one side moves
  let [x, y] = await pt(idx); await p.keyboard.down('Shift'); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 20, y - 30, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Shift');
  const o1 = await p.evaluate(() => cfg.body.outline.map(([x, y]) => [x, y]));
  const asym = o1.some(([x, y]) => !o1.some(([x2, y2]) => Math.abs(x2 - x) < .003 && Math.abs(y2 + y) < .003));
  // right-click delete (mirrored → removes 2)
  const idx2 = await p.evaluate(() => cfg.body.outline.findIndex(([x, y], i) => y < -.05 && i > 2));
  [x, y] = await pt(idx2); await p.mouse.click(x, y, { button: 'right' });
  const n1 = await p.evaluate(() => cfg.body.outline.length);
  // shift+right-click delete (removes 1)
  [x, y] = await pt(idx2); await p.keyboard.down('Shift'); await p.mouse.click(x, y, { button: 'right' }); await p.keyboard.up('Shift');
  const n2 = await p.evaluate(() => cfg.body.outline.length);
  console.log({ n0, afterRightClick: n1, afterShiftRightClick: n2, shiftDragMadeAsymmetric: asym });
  await p.screenshot({ path: '/tmp/ol.png', clip: { x: 0, y: 90, width: 1050, height: 600 } });
  console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
