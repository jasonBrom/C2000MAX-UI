const assert = require('node:assert/strict'), fs = require('node:fs/promises');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179';
const ready = (page, selector) => page.waitForFunction(s => document.querySelector(s)?.dataset.glassState === 'gpu', selector, { timeout: 20000 });
(async () => {
 const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 632, height: 871 }, ...(process.env.RECORD_MOTION ? { recordVideo: { dir: 'build/preview/motion-video', size: { width: 632, height: 871 } } } : {}) });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/cgi-bin/luci/admin/status/c2000max');
  await page.evaluate(() => { C2000Theme.setSkin('max'); C2000Theme.set('dark'); });
  for (const selector of ['.mobile-nav', '.header-menu', '.theme-toggle', '.account']) await ready(page, selector);
  assert.equal(await page.locator('.liquid-overlay canvas').count(), 1, 'all four control lenses share one canvas');
  assert.equal(await page.evaluate(() => window.__liquidGLRenderer__._snapshotBlur), 8);
  assert.equal(await page.locator('.mobile-nav .active .symbol-selected').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await page.locator('.mobile-nav .active .symbol-outline').evaluate(el => getComputedStyle(el).opacity), '0');
  assert.deepEqual(await page.locator('svg.icon use').evaluateAll(uses => uses.map(use => use.getAttribute('href')).filter(href => !document.getElementById(href.slice(1)))), []);

  const toggle = page.locator('.theme-toggle'), box = await toggle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(160);
  assert.notEqual(await toggle.evaluate(el => getComputedStyle(el).transform), 'none', 'press remains held');
  await page.mouse.up();
  await ready(page, '.theme-control');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'build/preview/liquid-icons-and-menu.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.theme-toggle').getAttribute('aria-expanded'), 'false');
  await page.waitForFunction(() => !document.querySelector('.theme-control').hasAttribute('data-motion-exit'));

  const account = page.locator('#account-button');
  await account.click(); await ready(page, '.account-menu');
  await page.waitForTimeout(300);
  await account.click();
  assert.equal(await page.locator('#account-menu').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('#account-menu').evaluate(el => el.inert), true);
  await account.click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#account-menu').getAttribute('aria-hidden'), null);
  assert.equal(await page.locator('#account-menu').evaluate(el => el.inert), false);
  assert.equal(await account.getAttribute('aria-expanded'), 'true');
  const slideBefore = await page.locator('.story-pagination [aria-pressed="true"]').getAttribute('data-slide');
  await page.waitForFunction(before => document.querySelector('.story-pagination [aria-pressed="true"]').dataset.slide !== before, slideBefore);
  assert.equal(await account.getAttribute('aria-expanded'), 'true', 'automatic carousel updates must not close a user menu');
  await account.click(); await page.waitForTimeout(250);

  const indicatorBefore = await page.locator('.liquid-selection').boundingBox();
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await ready(page, '.sidebar'); await page.waitForTimeout(400);
  const indicatorDuring = await page.locator('.liquid-selection').boundingBox();
  assert.ok(indicatorDuring.x > indicatorBefore.x + 100, 'selection follows the menu state');
  await page.screenshot({ path: 'build/preview/liquid-drawer-motion.png' });
  await page.locator('#close-menu').click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden');
  await ready(page, '.mobile-nav');
  await page.mouse.wheel(0, 480); await page.waitForTimeout(600);
  await page.screenshot({ path: 'build/preview/liquid-live-refraction.png' });
  await page.mouse.wheel(0, -480); await page.waitForTimeout(400);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.liquid-pane'));
  await account.click();
  assert.equal(await page.locator('#account-menu').evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length), 0);
  await account.click();
  assert.equal(await page.locator('#account-menu').getAttribute('data-motion-exit'), null);
  const reducedSlide = await page.locator('.story-pagination [aria-pressed="true"]').getAttribute('data-slide');
  await page.waitForTimeout(3100);
  assert.equal(await page.locator('.story-pagination [aria-pressed="true"]').getAttribute('data-slide'), reducedSlide, 'reduced motion pauses automatic carousel changes');
  await page.goto(base + '/login');
  await page.locator('#luci_password').fill('test-only');
  await page.getByRole('button', { name: '显示密码', exact: true }).click();
  assert.equal(await page.locator('#password-toggle use').getAttribute('href'), '#eye-off');
  await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
  assert.equal(await page.locator('#password-toggle use').getAttribute('href'), '#eye');
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) { const path = await video.path(); await fs.copyFile(path, 'build/preview/liquid-motion.webm'); }
  console.log('PASS: four real control lenses share a canvas; selected symbols, held press/release, rapid popup reversal, inert exit, drawer/selection motion, live refraction and reduced-motion cleanup');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
