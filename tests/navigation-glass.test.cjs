const assert = require('node:assert/strict'), fs = require('node:fs/promises');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179/cgi-bin/luci/admin/status/c2000max';
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.liquid-selection')?.dataset.glassState === 'gpu');
}
async function centre(locator) {
  const rect = await locator.boundingBox(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 632, height: 871 }, ...(process.env.RECORD_NAV ? { recordVideo: { dir: 'build/preview/navigation-video', size: { width: 632, height: 871 } } } : {}) });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(() => { C2000Theme.setSkin('max'); C2000Theme.set('light'); window.navDocumentToken = 'same-document'; });
    await ready(page);
    assert.equal(await page.locator('.liquid-overlay canvas').count(), 1, 'moving lens shares the base canvas');
    assert.equal(await page.locator('.mobile-nav > canvas').count(), 1, 'navigation has one locally anchored optical canvas');
    assert.equal(await page.locator('.mobile-nav-items').evaluate(e => getComputedStyle(e).maskImage), 'none', 'foreground labels must not be rasterised or masked');
    assert.equal(await page.locator('.mobile-nav-items input').count(), 0, 'only navigation content is supplied to the lens');
    const links = page.locator('.mobile-nav-items a'), lens = page.locator('.liquid-selection');
    const start = await lens.boundingBox();
    await links.nth(2).hover(); await page.waitForTimeout(700);
    const hovered = await lens.boundingBox();
    assert.ok(hovered.x > start.x + 140 && hovered.height > start.height, 'hover moves and lifts the lens');
    assert.equal(await links.first().getAttribute('aria-current'), 'page', 'hover previews do not claim a different route');
    assert.equal(await links.nth(2).getAttribute('aria-current'), null);
    assert.equal(await links.nth(2).getAttribute('class'), 'is-lens-target');
    // The actual displayed refracted symbol must contain blue ink, including SVG <use> content.
    const box = await links.nth(2).locator('svg').boundingBox();
    const png = await page.screenshot({ clip: { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 } });
    const ink = await page.evaluate(async url => {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      let count = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 2] > 140 && pixels[i + 2] > pixels[i + 1] + 35) count++;
      return count;
    }, 'data:image/png;base64,' + png.toString('base64'));
    assert.ok(ink > 35, 'the refracted Wi-Fi symbol remains visible and crisp');
    await page.screenshot({ path: 'build/preview/navigation-hover.png' });
    const home = await centre(links.first()), devices = await centre(links.nth(3));
    await page.mouse.move(home.x, home.y); await page.waitForTimeout(500);
    await page.mouse.down(); await page.mouse.move(devices.x, devices.y, { steps: 18 }); await page.waitForTimeout(100);
    assert.ok(await page.locator('.mobile-nav').evaluate(el => el.classList.contains('is-dragging')));
    assert.equal(await page.url(), base, 'scrubbing does not navigate before release');
    assert.equal(await links.nth(3).getAttribute('class'), 'is-lens-target');
    assert.ok((await lens.boundingBox()).width > start.width * 1.05, 'dragging stretches the lens');
    await page.screenshot({ path: 'build/preview/navigation-drag.png' });
    await page.mouse.move(home.x, home.y, { steps: 18 }); await page.mouse.up(); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.navDocumentToken), 'same-document', 'returning to the current item does not reload or activate twice');
    assert.equal(await page.locator('.mobile-nav').evaluate(el => el.classList.contains('is-dragging')), false);
    const radio = await centre(links.nth(1));
    await page.mouse.move(home.x, home.y); await page.mouse.down(); await page.mouse.move(radio.x, radio.y, { steps: 12 }); await page.mouse.up();
    await page.waitForURL('**/admin/modem/qmodem');
    await page.goto(base); await ready(page);
    const home2 = await centre(page.locator('.mobile-nav-items a').first()), menu = await centre(page.getByRole('button', { name: '菜单', exact: true }));
    await page.mouse.move(home2.x, home2.y); await page.waitForTimeout(350); await page.mouse.down(); await page.mouse.move(menu.x, menu.y, { steps: 18 }); await page.mouse.up();
    await page.waitForFunction(() => document.body.classList.contains('menu-open'));
    await page.waitForFunction(() => document.querySelector('.sidebar')?.dataset.glassState === 'gpu');
    await page.waitForTimeout(400);
    assert.equal(await lens.getAttribute('data-glass-state'), 'gpu', 'modal inertness keeps the moving lens');
    assert.equal(await page.locator('.liquid-overlay canvas').count(), 2);
    await page.locator('#close-menu').click();
    await page.waitForFunction(() => !document.body.classList.contains('menu-open'));
    await page.mouse.move(15, 300); await page.keyboard.press('Tab');
    await page.locator('.mobile-nav-items a').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await links.nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter'); await page.waitForURL('**/admin/modem/qmodem');
    await page.goto(base); await ready(page); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('.liquid-pane'));
    await page.locator('.mobile-nav-items a').nth(2).hover();
    assert.equal(await lens.getAttribute('data-motion-active'), null, 'reduced motion follows immediately without spring frames');
    assert.deepEqual(errors, []);
    const video = page.video(); await context.close();
    if (video) await fs.copyFile(await video.path(), 'build/preview/navigation-glass.webm');

    // Real touch events exercise capture, cancellation and vertical scrolling.
    const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await touch.goto(base); await ready(touch);
    const session = await touch.context().newCDPSession(touch);
    const from = await centre(touch.locator('.mobile-nav-items a').first()), to = await centre(touch.getByRole('button', { name: '菜单', exact: true }));
    async function point(type, x, y) { await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] }); }
    await point('touchStart', from.x, from.y);
    for (let i = 1; i <= 10; i++) await point('touchMove', from.x + (to.x - from.x) * i / 10, from.y);
    await point('touchCancel'); await touch.waitForTimeout(500);
    assert.equal(await touch.url(), base);
    assert.equal(await touch.locator('.mobile-nav').evaluate(el => el.classList.contains('is-dragging')), false);
    await point('touchStart', from.x, from.y);
    for (let i = 1; i <= 10; i++) await point('touchMove', from.x + (to.x - from.x) * i / 10, from.y);
    await point('touchEnd');
    await touch.waitForFunction(() => document.body.classList.contains('menu-open'));
    await touch.getByRole('button', { name: '关闭菜单', exact: true }).click();
    await touch.waitForTimeout(400);
    await point('touchStart', from.x, from.y);
    for (let i = 1; i <= 12; i++) await point('touchMove', from.x, from.y - 220 * i / 12);
    await point('touchEnd'); await touch.waitForTimeout(200);
    assert.ok(await touch.evaluate(() => scrollY > 30), 'vertical gestures scroll the page instead of selecting a route');
    assert.equal(await touch.url(), base);
    await touch.close();
    const showcase = await browser.newContext({ viewport: { width: 632, height: 871 }, ...(process.env.RECORD_NAV ? { recordVideo: { dir: 'build/preview/navigation-demo-video', size: { width: 632, height: 871 } } } : {}) });
    const demo = await showcase.newPage();
    await demo.goto('http://127.0.0.1:4179/navigation');
    await demo.evaluate(() => { C2000Theme.setSkin('max'); C2000Theme.set('light'); }); await ready(demo);
    const tabs = demo.locator('.mobile-nav-items a');
    assert.equal(await tabs.count(), 5);
    await demo.waitForTimeout(500); await demo.screenshot({ path: 'build/preview/navigation-demo-light.png' });
    for (let i = 1; i < 5; i++) { await tabs.nth(i).hover(); await demo.waitForTimeout(280); }
    const last = await centre(tabs.last()), first = await centre(tabs.first()), third = await centre(tabs.nth(2));
    await demo.mouse.down(); await demo.mouse.move(first.x, first.y, { steps: 24 }); await demo.mouse.move(third.x, third.y, { steps: 16 }); await demo.mouse.up();
    await demo.waitForTimeout(600);
    assert.equal(await tabs.nth(2).getAttribute('aria-current'), 'page');
    assert.ok((await demo.url()).endsWith('/navigation'), 'local showcase scrubs continuously without leaving its stage');
    await demo.screenshot({ path: 'build/preview/navigation-demo-selected.png' });
    await demo.getByRole('button', { name: '深色', exact: true }).click(); await ready(demo); await demo.waitForTimeout(500);
    await demo.screenshot({ path: 'build/preview/navigation-demo-dark.png' });
    await tabs.first().hover(); await demo.waitForTimeout(600);
    await demo.setViewportSize({ width: 1350, height: 900 });
    await demo.waitForTimeout(600);
    const desktop = await demo.locator('.mobile-nav').boundingBox();
    assert.ok(desktop.y > 300 && desktop.y < 500 && Math.abs(desktop.x + desktop.width / 2 - 675) < 10, 'desktop showcase retains fixed centred positioning');
    assert.equal(await demo.locator('.mobile-nav').evaluate(el => +getComputedStyle(el).zIndex), 20, 'desktop foreground stays above the glass canvas');
    await demo.screenshot({ path: 'build/preview/navigation-demo-desktop.png' });
    const demoVideo = demo.video(); await showcase.close();
    if (demoVideo) await fs.copyFile(await demoVideo.path(), 'build/preview/navigation-demo.webm');
    console.log('PASS: clear refracted SVG ink, animated hover/drag/stretch/snap, native route activation, no duplicate clicks, modal preservation, keyboard, touch cancellation/scrolling and reduced motion');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
