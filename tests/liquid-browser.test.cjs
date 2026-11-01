const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4179/');
    await page.waitForFunction(() => typeof window.liquidGL === 'function', null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.mobile-nav canvas') || document.querySelector('.liquid-mobile').style.backdropFilter, null, { timeout: 15000 });
    assert.equal(await page.locator('.liquid-mobile').count(), 1);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    assert.equal(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).visibility), 'visible');
    await page.locator('#close-menu').click();
    await page.screenshot({ path: 'build/preview/liquid-mobile.png' });
    await page.setViewportSize({ width: 1350, height: 900 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '管理员菜单' }).click();
    assert.equal(await page.locator('#account-menu').isVisible(), true);
    await page.screenshot({ path: 'build/preview/liquid-desktop.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !window.__liquidGLRenderer__);
    assert.equal(await page.locator('.sidebar canvas').count(), 0);
    assert.deepEqual(errors, []);
    const reducedPage = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    await reducedPage.goto('http://127.0.0.1:4179/');
    await reducedPage.waitForTimeout(700);
    assert.equal(await reducedPage.evaluate(() => typeof window.liquidGL), 'undefined');
    await reducedPage.getByRole('button', { name: '菜单', exact: true }).click();
    await reducedPage.close();
    const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fallback.addInitScript(() => { window.__liquidGLNoWebGL__ = true; });
    await fallback.goto('http://127.0.0.1:4179/');
    await fallback.waitForFunction(() => document.querySelector('.liquid-mobile').style.backdropFilter, null, { timeout: 15000 });
    await fallback.getByRole('button', { name: '菜单', exact: true }).click();
    await fallback.emulateMedia({ reducedMotion: 'reduce' });
    await fallback.waitForFunction(() => !document.querySelector('.liquid-mobile').style.backdropFilter);
    await fallback.close();
    console.log('PASS: liquidGL loads, navigation remains interactive, viewport changes and reduced-motion teardown work');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
