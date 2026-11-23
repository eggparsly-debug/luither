const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(500);
  await p.click('#startBtn'); await p.waitForTimeout(800);
  await p.click('#backTog');
  for (const [i, pr] of ['Acoustic guitar', 'Cello', 'Sitar', 'Koto'].entries()) {
    await p.selectOption('#preset', 'f:' + pr); await p.waitForTimeout(250);
    await p.evaluate(() => noteOn(50, .9)); await p.waitForTimeout(500);
    await p.screenshot({ path: `/tmp/b${i}.png`, clip: { x: 0, y: 50, width: 1050, height: 590 } });
  }
  await p.selectOption('#preset', 'f:Acoustic guitar'); await p.click('.tabs button[data-t=body]');
  for (const sh of ['ribbed', 'keel']) { await p.evaluate(sh => { applyBack(sh); pushBody(); buildBody(); drawDepth(); }, sh); await p.waitForTimeout(200);
    await p.screenshot({ path: `/tmp/sh_${sh}.png` }); }
  // smart tune on sitar
  await p.click('#backTog'); await p.selectOption('#preset', 'f:Sitar'); await p.click('.tabs button[data-t=strings]');
  await p.click('text=♪ Smart tune'); await p.selectOption('#stScale', 'Bhairav'); await p.click('#stApply'); await p.waitForTimeout(200);
  console.log('msg:', await p.textContent('#stMsg'));
  console.log('sitar after Bhairav:', await p.evaluate(() => cfg.strings.map(s => s.role[0] + ':' + nn(s.note)).join(' ')));
  await p.screenshot({ path: '/tmp/st.png' });
  await p.click('#stDone');
  await p.selectOption('#preset', 'f:Koto'); await p.click('text=♪ Smart tune'); await p.selectOption('#stScale', 'In (Miyako-bushi)'); await p.click('#stApply');
  console.log('koto In in D:', await p.evaluate(() => cfg.strings.map(s => nn(s.note)).join(' ')));
  await p.click('#stDone');
  await p.selectOption('#preset', 'f:Acoustic guitar'); await p.click('text=♪ Smart tune'); await p.click('text=DADGAD');
  console.log('guitar DADGAD:', await p.evaluate(() => cfg.strings.map(s => nn(s.note)).join(' ')));
  await p.click('#stDone'); await p.screenshot({ path: '/tmp/strs.png', clip: { x: 1050, y: 50, width: 390, height: 500 } });
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
