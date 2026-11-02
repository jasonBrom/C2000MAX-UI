// Verify transmitted pixels and edge lensing, rather than just the presence of a canvas.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179/cgi-bin/luci/admin/status/c2000max';

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
  try {
    for (const engine of ['auto', 'webgl2']) {
      const page = await browser.newPage({ viewport: { width: 632, height: 871 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + (engine === 'auto' ? '' : '?liquidGL-engine=' + engine));
      await page.evaluate(() => { C2000Theme.setSkin('max'); C2000Theme.set('light'); });
      await page.waitForFunction(() => document.querySelector('.mobile-nav')?.dataset.glassState === 'gpu');
      const nav = await page.locator('.mobile-nav').boundingBox();
      assert.ok(nav.width <= 440 && Math.abs(nav.x + nav.width / 2 - 316) < 1, 'wide-phone navigation remains compact and centred');
      assert.ok(await page.locator('.mobile-nav-items > a,.mobile-nav-items > button').evaluateAll(items => items.length === 5 && items.every(el => el.getBoundingClientRect().height >= 44)), 'five touch targets remain at least 44px');

      await page.evaluate(() => { const id=document.querySelector('.mobile-nav').dataset.glassPane; window.opticalRenderer=__liquidGLRenderer__._sceneLenses.find(l=>l.el.id===id).renderer; });
      await page.waitForFunction(() => !window.opticalRenderer._capturing);
      // A test-only swatch covers the content behind the real production navigation.
      await page.evaluate(async () => {
        const r = window.opticalRenderer, nav = document.querySelector('.mobile-nav');
        const rect = nav.getBoundingClientRect();
        const swatch = document.createElement('div');
        swatch.id = 'optics-swatch';
        Object.assign(swatch.style, { position: 'absolute', zIndex: '8', left: '0', top: rect.top + scrollY - 100 + 'px', width: '100%', height: rect.height + 200 + 'px', background: '#ec2870' });
        document.body.append(swatch);
        await r.captureSnapshot();
      });
      async function pixels() {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Screenshot pixels include the actual displayed GPU output, including WebGPU after presentation.
        const png = await page.screenshot();
        return page.evaluate(async url => {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          const box = document.querySelector('.mobile-nav').getBoundingClientRect(), scale = image.width / innerWidth;
          const width = Math.round(box.width * scale), height = Math.round(box.height * scale);
          const data = ctx.getImageData(Math.round(box.left * scale), Math.round(box.top * scale), width, height).data;
          return { width, height, data: Array.from(data) };
        }, 'data:image/png;base64,' + png.toString('base64'));
      }
      const pink = await pixels();
      await page.evaluate(async () => {
        document.querySelector('#optics-swatch').style.background = '#267ce9';
        await window.opticalRenderer.captureSnapshot();
      });
      const blue = await pixels();
      const centre = (10 * blue.width + Math.floor(blue.width / 2)) * 4;
      assert.ok(pink.data[centre + 3] > 240 && blue.data[centre + 3] > 240, engine + ': the lens produces opaque transmitted source pixels');
      assert.ok(pink.data[centre] - blue.data[centre] > 100 && blue.data[centre + 2] - pink.data[centre + 2] > 70, engine + ': the real lens follows a changed background colour');

      await page.evaluate(async () => {
        document.querySelector('#optics-swatch').style.background = 'repeating-linear-gradient(90deg,#f62c69 0 30px,#2fc2f0 30px 60px,#ffd15c 60px 90px)';
        const renderer = window.opticalRenderer;
        renderer.lenses.forEach(lens => { lens.options.specular = false; });
        await renderer.captureSnapshot();
      });
      const curved = await pixels();
      await page.evaluate(() => {
        const id = document.querySelector('.mobile-nav').dataset.glassPane;
        const lens = window.opticalRenderer.lenses.find(lens => lens.el.id === id);
        window.opticalSettings = { refraction: lens.options.refraction, bevelDepth: lens.options.bevelDepth, aberration: lens.options.aberration };
        Object.assign(lens.options, { refraction: 0, bevelDepth: 0, aberration: 0 });
      });
      const flat = await pixels();
      let edgeDifference = 0, centreDifference = 0, edgeCount = 0, centreCount = 0;
      for (let y = 1; y < flat.height - 1; y++) for (let x = 50; x < flat.width - 50; x++) {
        const index = (y * flat.width + x) * 4;
        if (flat.data[index + 3] < 240 || curved.data[index + 3] < 240) continue;
        const difference = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(flat.data[index + channel] - curved.data[index + channel]), 0) / 3;
        if (y < 5 || y > flat.height - 6) { edgeDifference += difference; edgeCount++; }
        if (y > 20 && y < flat.height - 20) { centreDifference += difference; centreCount++; }
      }
      edgeDifference /= edgeCount; centreDifference /= centreCount;
      assert.ok(edgeDifference > 5 && centreDifference < edgeDifference * .4, `${engine}: optical distortion must concentrate at the edge (edge ${edgeDifference}, centre ${centreDifference})`);
      await page.evaluate(() => {
        const id = document.querySelector('.mobile-nav').dataset.glassPane;
        Object.assign(window.opticalRenderer.lenses.find(lens => lens.el.id === id).options, window.opticalSettings);
      });
      await page.mouse.move(nav.x + 60, nav.y + nav.height / 2); await page.mouse.down();
      await page.mouse.move(nav.x + nav.width - 60, nav.y + nav.height / 2, { steps: 12 });
      await page.waitForFunction(() => {
        const id = document.querySelector('.mobile-nav').dataset.glassPane;
        const lens = window.opticalRenderer.lenses.find(lens => lens.el.id === id);
        return lens._fluid?.inside && Math.hypot(lens._fluid.value[2], lens._fluid.value[3]) > .00001;
      }, null, { timeout: 2000 });
      await page.mouse.move(nav.x+60,nav.y+nav.height/2,{steps:12}); await page.mouse.up();
      await page.goto('http://127.0.0.1:4179/login' + (engine === 'auto' ? '' : '?liquidGL-engine=' + engine));
      await page.waitForFunction(() => document.querySelector('.login-card')?.dataset.glassState === 'gpu');
      // Keep highlights visible while checking that a stable scene does not submit new GPU frames.
      await page.waitForTimeout(350);
      const idle = await page.evaluate(() => new Promise(resolve => {
        const renderer = window.__liquidGLRenderer__;
        const renderers = [...new Set(renderer._sceneLenses.map(lens => lens.renderer))];
        const before = renderers.map(renderer => renderer._output?.version);
        let frames = 0;
        function sample() {
          if (++frames < 30) return requestAnimationFrame(sample);
          resolve({ before, after: renderers.map(renderer => renderer._output?.version), lit: renderers.every(renderer => renderer.lenses.every(lens => lens.options.specular && lens.options.animateSpecular === false)) });
        }
        requestAnimationFrame(sample);
      }));
      assert.ok(idle.lit, 'idle scene retains specular highlights');
      assert.deepEqual(idle.after, idle.before, engine + ': a stable scene must skip GPU redraws');
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine}: transmitted colours, edge lensing (${edgeDifference.toFixed(1)} vs centre ${centreDifference.toFixed(1)}), live fluid displacement, compact touch geometry and no idle GPU redraws`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
