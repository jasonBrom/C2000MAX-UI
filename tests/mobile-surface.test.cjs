const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179';
(async () => {
 const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/');
  await page.waitForFunction(() => document.querySelector('.mobile-nav')?.dataset.glassState === 'gpu');
  assert.equal(await page.locator('#menu-tree details[open]').count(), 0, 'all categories start collapsed');
  assert.equal(await page.locator('#menu-tree .menu-children details').count(), 0, 'plugin subcategories use their native page tabs');
  assert.equal(await page.locator('.mobile-nav-items').evaluate(e => getComputedStyle(e).maskImage), 'none');
  await page.locator('.mobile-nav-items a').nth(2).click();
  const child = page.frameLocator('.c2000-view-frame:not([data-route-pending])');
  await child.getByRole('heading', { name: '无线', exact: true }).waitFor();
  await page.locator('[data-indicator="uci-changes"]').waitFor();
  assert.match(await page.locator('[data-indicator="uci-changes"]').innerText(), /2/);
  const box = await page.locator('[data-indicator="uci-changes"]').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 70, 'configuration count has room below phone header controls');
  await page.locator('[data-indicator="uci-changes"]').click();
  await child.getByRole('heading', { name: '配置修改' }).waitFor();
  let modal = await child.locator('.modal').boundingBox();
  assert.ok(modal.y >= 0 && modal.y + modal.height <= 844, 'native changes dialog remains in visible viewport');
  await child.getByRole('button', { name: '关闭修改' }).click();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 210, y: 620 }] });
  for (let i = 1; i <= 14; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: 620 - i * 25 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => scrollY > 100);
  assert.equal(await child.locator('body').evaluate(() => scrollY), 0, 'native content shares the outer page scroll');
  for (const height of [700, 844, 915, 680]) {
   await page.setViewportSize({ width: 390, height }); await page.waitForTimeout(80);
   const geometry = await page.locator('.mobile-nav').evaluate(nav => {
    const canvas = nav.querySelector(':scope > canvas'), a = nav.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    return { attached: canvas.parentElement === nav, delta: Math.max(Math.abs(a.top-b.top), Math.abs(a.left-b.left)), pixels: canvas.width*canvas.height };
   });
   assert.ok(geometry.attached && geometry.delta < 1, 'glass and labels share one fixed ancestor during browser toolbar resizing');
   assert.ok(geometry.pixels < 200000, 'navigation render target is limited to its own surface');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await child.getByRole('button', { name: '打开测试弹窗' }).click();
  modal = await child.locator('dialog').boundingBox();
  assert.ok(modal.y >= 0 && modal.y + modal.height <= 844, 'dialog opened near bottom stays in visible viewport');
  await child.getByRole('button', { name: '关闭', exact: true }).click();
  const field = await child.getByLabel('时间格式').boundingBox(), actions = await child.locator('.cbi-page-actions').boundingBox();
  assert.ok(actions.y > field.y + field.height, 'save actions never cover the last form control');
  assert.equal(await child.locator('body').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', 'child page has no second opaque backdrop');
  await page.locator('.mobile-nav-items a').nth(1).hover({ force: true });
  assert.equal(await page.locator('.mobile-nav-items a').nth(1).evaluate(e => getComputedStyle(e).textDecorationLine), 'none');
  assert.deepEqual(errors, []);
  await context.close();
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(base + '/');
  const account = await desktop.locator('#account-button').boundingBox();
  assert.ok(account.width > 110 && account.height >= 40, 'desktop account pill fits both avatar and label');
  await desktop.evaluate(() => {
   const overlay = document.createElement('div'); overlay.id = 'modal_overlay';
   overlay.innerHTML = '<div class="modal alert-message" role="dialog"><h4>会话已过期</h4><p>由于身份验证会话已过期，需要重新登录。</p><div class="button-row"><button>登录…</button></div></div>';
   document.body.append(overlay); document.body.classList.add('modal-overlay-active');
  });
  await desktop.waitForFunction(() => document.querySelector('.modal')?.dataset.glassState === 'gpu');
  const overflow = await desktop.locator('.modal').evaluate(e => ({ x: e.scrollWidth-e.clientWidth, y: e.scrollHeight-e.clientHeight }));
  assert.ok(overflow.x <= 1 && overflow.y <= 1, 'short native session dialog has no artificial scrollbars');
  await desktop.screenshot({ path: 'build/preview/session-dialog-fixed.png' });
  await desktop.close();
  console.log('PASS: routed touch scroll, local optical surface under viewport resize, crisp DOM ink, collapsed/flat menu, changes details, native dialog bounds, form actions and desktop account');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
