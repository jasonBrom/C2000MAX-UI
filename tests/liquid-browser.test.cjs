const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179';
async function ready(page, selector) {
  await page.waitForFunction(s => document.querySelector(s)?.dataset.glassState === 'gpu', selector, { timeout: 20000 });
  const material = await page.locator(selector).evaluate(el => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage }));
  assert.equal(material.color, 'rgba(0, 0, 0, 0)', selector + ' must expose the GPU layer');
  assert.equal(material.image, 'none', selector + ' must not cover the shader with a CSS image');
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const theme of ['light', 'dark']) {
      for (const width of [390, 632, 1350]) {
        await page.setViewportSize({ width, height: width === 632 ? 871 : 900 });
        await page.goto(base + '/cgi-bin/luci/admin/status/c2000max');
        await page.evaluate(t => { C2000Theme.setSkin('max'); C2000Theme.set(t); }, theme);
        const panel = width <= 700 ? '.mobile-nav' : '.sidebar';
        await ready(page, panel);
        const paneId = await page.locator(panel).getAttribute('data-glass-pane');
        assert.equal(await page.locator('#' + paneId).count(), 1);
        assert.equal(await page.evaluate(() => window.__liquidGLRenderer__.snapshotTarget.tagName), 'BODY');
        assert.equal(await page.locator('input:not([data-liquid-ignore])').count(), 0);
        assert.ok(await page.evaluate(() => {
          const r = window.__liquidGLRenderer__;
          return document.body.scrollWidth * document.body.scrollHeight * r._snapshotResolution ** 2 <= 2000001;
        }));
        assert.equal(await page.locator('.liquid-overlay canvas').count(), 1);
        if (width === 390) {
          await page.getByRole('button', { name: '菜单', exact: true }).click();
          await ready(page, '.sidebar');
          await page.locator('#close-menu').click();
          await page.waitForFunction(() => !document.querySelector('.sidebar').hasAttribute('data-glass-pane'));
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden');
          await ready(page, '.liquid-selection');
          const selected = await page.locator('.liquid-selection').evaluate(el => ({ width: el.getBoundingClientRect().width }));
          assert.ok(selected.width >= 44);
        }
        await page.screenshot({ path: `build/preview/liquid-home-${theme}-${width}.png` });
        await page.goto(base + '/login');
        await ready(page, '.login-card');
        await page.locator('#luci_password').fill('synthetic-preview-password');
        await page.getByRole('button', { name: '显示密码', exact: true }).click();
        assert.equal(await page.locator('#luci_password').getAttribute('type'), 'text');
        assert.equal(await page.locator('#liquid-scene').innerText(), '');
        assert.equal(await page.locator('form').getAttribute('method'), 'post');
        await page.locator('#luci_password').fill('');
        await page.screenshot({ path: `build/preview/liquid-login-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 1350, height: 900 });
    await page.goto(base + '/cgi-bin/luci/admin/status/c2000max');
    await ready(page, '.sidebar');
    await page.getByRole('button', { name: '管理员菜单', exact: true }).click();
    await ready(page, '.account-menu');
    await page.getByRole('button', { name: '管理员菜单', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.account-menu').hasAttribute('data-glass-pane'));
    await page.locator('[data-theme-toggle]').click();
    await ready(page, '.theme-control');
    await page.locator('[data-theme-choice="light"]').click();
    await ready(page, '.sidebar');
    await page.waitForFunction(() => !document.querySelector('.theme-control').hasAttribute('data-glass-pane'));
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'glass-test-dialog';
      dialog.innerHTML = '<h2>组件检查</h2><button>关闭</button>';
      document.body.append(dialog); dialog.showModal();
    });
    await ready(page, '#glass-test-dialog');
    await page.evaluate(() => document.querySelector('#glass-test-dialog').remove());
    await page.waitForFunction(() => !document.querySelector('#glass-test-dialog'));
    assert.ok(await page.locator('.liquid-pane').count() <= 8);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.liquid-pane'));
    assert.equal(await page.locator('canvas[data-liquid-ignore]').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ready(page, '.sidebar');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.waitForFunction(() => !document.querySelector('.liquid-pane'));
    assert.deepEqual(errors, []);

    for (const mode of ['reduced', 'reduced-transparency', 'no-gpu', 'save-data', 'low-memory', 'load-failure']) {
      const fallback = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
      await fallback.addInitScript(mode => {
        if (mode === 'no-gpu') window.__liquidGLNoWebGL__ = true;
        if (mode === 'low-memory') Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
        if (mode === 'save-data') Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, addEventListener() {} }) });
      }, mode);
      if (mode === 'reduced-transparency') {
        const session = await fallback.context().newCDPSession(fallback);
        await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      }
      if (mode === 'load-failure') await fallback.route('**/liquidGL.vendor.js*', route => route.abort());
      await fallback.goto(base + '/login');
      await fallback.waitForTimeout(700);
      assert.equal(await fallback.locator('.login-card[data-glass-state="gpu"]').count(), 0, mode);
      if (mode === 'reduced-transparency') assert.match(await fallback.locator('.login-card').evaluate(el => getComputedStyle(el).backgroundColor), /^rgb\(/);
      await fallback.locator('#luci_password').fill('still-interactive');
      assert.equal(await fallback.locator('#luci_password').inputValue(), 'still-interactive');
      await fallback.close();
    }
    console.log('PASS: visible GPU login/navigation at six appearance/layout combinations; live controls, isolated snapshots, popovers/dialogs, palette changes, cleanup and six fallback modes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
