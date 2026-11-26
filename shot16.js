const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/luither.html'); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(500);
  const r = {};
  // undo / redo
  await p.selectOption('#preset', 'f:Cello'); await p.waitForTimeout(500);
  await p.evaluate(() => { cfg.body.topT = 4.4; pushBody(); }); await p.waitForTimeout(500);
  await p.evaluate(() => { cfg.ex.pressure = .9; pushEx(); }); await p.waitForTimeout(500);
  r.before = await p.evaluate(() => [cfg.body.topT, cfg.ex.pressure]);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100); r.undo1 = await p.evaluate(() => [cfg.body.topT, cfg.ex.pressure]);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100); r.undo2 = await p.evaluate(() => [cfg.body.topT, cfg.ex.pressure]);
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(100); r.redo = await p.evaluate(() => [cfg.body.topT, cfg.ex.pressure]);
  // MIDI: mod wheel on a plucked and a bowed preset
  await p.selectOption('#preset', 'f:Acoustic guitar'); await p.waitForTimeout(300);
  await p.evaluate(() => onMidi({ data: [0xB0, 1, 100] })); r.modPluck = await p.evaluate(() => cfg.ex.vibDepth);
  await p.selectOption('#preset', 'f:Cello'); await p.waitForTimeout(300);
  await p.evaluate(() => onMidi({ data: [0xB0, 1, 64] })); r.modBow = await p.evaluate(() => cfg.ex.pressure.toFixed(2));
  // MIDI learn: Body tab → head of 'Top thickness' slider row
  await p.evaluate(() => [...document.querySelectorAll('.tab, button')].find(e => e.textContent.trim() === 'Body')?.click()); await p.waitForTimeout(150);
  await p.click('#learnBtn'); const row = p.locator('.row', { hasText: 'Top thickness' }).first(); await row.click(); await p.evaluate(() => onMidi({ data: [0xB0, 21, 0] }));
  await p.evaluate(() => onMidi({ data: [0xB0, 21, 127] })); r.learned = await p.evaluate(() => [JSON.stringify(ccMap), cfg.body.topT]);
  await p.keyboard.press('Escape');
  await p.screenshot({ path: '/tmp/learn.png', clip: { x: 1040, y: 0, width: 400, height: 900 } });
  // old preset migration
  r.migrate = await p.evaluate(() => { const o = PRESETS['Acoustic guitar'](); delete o.ex.fretter; delete o.body.headT; delete o.look; delete o.body.outline; o.body.top = 'Unobtainium'; o.strings.forEach(s => { delete s.tension; delete s.range; }); o.strings[0].mat = 'Gold';
    loadCfg(o); return [cfg.body.top, cfg.ex.fretter, cfg.strings[0].mat, cfg.strings[1].tension, !!cfg.look]; });
  // banjos + help
  await p.selectOption('#preset', 'f:Banjo (open-back clawhammer)'); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('.tab, button')].find(e => e.textContent.trim() === 'Strings')?.click());
  await p.evaluate(() => { noteOn(67, .8); noteOn(55, .8); }); await p.waitForTimeout(150);
  await p.screenshot({ path: '/tmp/banjo2.png', clip: { x: 0, y: 90, width: 1050, height: 600 } });
  await p.click('#helpBtn'); await p.waitForTimeout(150); await p.screenshot({ path: '/tmp/help.png' });
  console.log(JSON.stringify(r)); console.log(errs.join('\n') || 'no page errors'); await b.close();
})();
