const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179/cgi-bin/luci/admin/status/c2000max';
const ready = (page, selector) => page.waitForFunction(s => document.querySelector(s)?.dataset.glassState === 'gpu', selector, { timeout: 20000 });

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 632, height: 871 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(() => { C2000Theme.setSkin('mid-autumn'); C2000Theme.set('dark'); });
    const controls = ['.mobile-nav', '.header-menu', '.theme-toggle', '.account'];
    for (const selector of controls) await ready(page, selector);
    const identities = await page.evaluate(selectors => selectors.map(s => document.querySelector(s).dataset.glassPane), controls);
    await page.locator('.theme-toggle').click();
    await ready(page, '.theme-control');
    assert.deepEqual(await page.evaluate(selectors => selectors.map(s => document.querySelector(s).dataset.glassPane), controls), identities, 'a popup must not evict any persistent control lens');
    assert.equal(await page.locator('.liquid-overlay canvas').count(), 2, 'popup shares the base canvas while the prepared drawer keeps its layer');
    await page.screenshot({ path: 'build/preview/glass-state-popup.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await ready(page, '.sidebar');
    await page.waitForTimeout(400);
    for (const selector of controls) await ready(page, selector);
    assert.deepEqual(await page.evaluate(selectors => selectors.map(s => document.querySelector(s).dataset.glassPane), controls), identities, 'inert background controls keep their original lenses');
    const layers = await page.evaluate(() => ({
      base: +getComputedStyle(document.querySelector('[data-glass-layer="base"]')).zIndex,
      nav: +getComputedStyle(document.querySelector('.mobile-nav')).zIndex,
      backdrop: +getComputedStyle(document.querySelector('.sidebar-backdrop')).zIndex,
      glass: +getComputedStyle(document.querySelector('[data-glass-layer="drawer"]')).zIndex,
      drawer: +getComputedStyle(document.querySelector('.sidebar')).zIndex,
      inert: document.querySelector('.mobile-nav').inert,
      modal: document.querySelector('.sidebar').getAttribute('aria-modal')
    }));
    assert.ok(layers.base < layers.nav && layers.nav < layers.backdrop && layers.glass >= layers.backdrop && layers.glass < layers.drawer, 'each lens remains below its own foreground and on the correct side of the modal scrim');
    assert.ok(layers.inert && layers.modal === 'true', 'keeping glass must not reactivate background controls');
    assert.equal(await page.locator('.liquid-overlay canvas').count(), 2, 'drawer uses a separate compositing layer only while visible');
    assert.ok(await page.locator('.liquid-selection').evaluate(el => Math.abs(el.getBoundingClientRect().width - document.querySelector('.mobile-nav [aria-expanded="true"]').offsetWidth) < 1.5), 'selection geometry excludes the temporary press scale');
    await page.screenshot({ path: 'build/preview/glass-state-drawer.png' });
    await page.locator('#close-menu').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden' && getComputedStyle(document.querySelector('[data-glass-layer="drawer"] canvas')).visibility === 'hidden');
    assert.equal(await page.locator('.liquid-overlay canvas').count(), 2);

    const continuity = await page.evaluate(async () => {
      const button = document.querySelector('.theme-toggle');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const scale = () => parseFloat(getComputedStyle(button).scale) || 1;
      const pointer = type => button.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 91, pointerType: 'mouse', isPrimary: true, button: 0 }));
      pointer('pointerdown'); await frame(); await frame();
      const beforeUp = scale(); pointer('pointerup'); const afterUp = scale();
      await frame(); await frame();
      const beforeRepeat = scale(); pointer('pointerdown'); const afterRepeat = scale();
      await frame(); pointer('pointerup');
      const icon = button.querySelector('svg');
      C2000Theme.set('light');
      const sameIcon = button.querySelector('svg') === icon && icon.querySelector('use').getAttribute('href') === '#sun';
      const account = document.querySelector('#account-button'), popup = document.querySelector('#account-menu');
      account.click(); await frame(); await frame(); await frame();
      const beforeClose = +getComputedStyle(popup).opacity; account.click(); const afterClose = +getComputedStyle(popup).opacity;
      await frame(); await frame();
      const beforeOpen = +getComputedStyle(popup).opacity; account.click(); const afterOpen = +getComputedStyle(popup).opacity;
      return { beforeUp, afterUp, beforeRepeat, afterRepeat, beforeClose, afterClose, beforeOpen, afterOpen, sameIcon };
    });
    assert.ok(continuity.beforeUp < 1 && continuity.beforeUp > .94, 'sample a quick release before the press has settled');
    assert.ok(continuity.sameIcon, 'appearance changes update the glyph without discarding its running spring');
    for (const [before, after] of [['beforeUp', 'afterUp'], ['beforeRepeat', 'afterRepeat'], ['beforeClose', 'afterClose'], ['beforeOpen', 'afterOpen']]) {
      assert.ok(Math.abs(continuity[before] - continuity[after]) < .001, `${before}: retargeting must start from the displayed pose`);
    }
    await page.locator('#account-button').click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('[data-motion-active]').count(), 0, 'settled springs release their frame tracking');

    const tones = { '状态': 'network', '系统': 'system', '调制解调器': 'device', '服务': 'device', '网络': 'network', '统计': 'signal' };
    const surfaces = { light: new Set(), dark: new Set() };
    for (const theme of ['light', 'dark']) for (const skin of ['max', '788', 'mid-autumn', 'national-day']) {
      await page.evaluate(({ theme, skin }) => { C2000Theme.setSkin(skin); C2000Theme.set(theme); }, { theme, skin });
      await ready(page, '.mobile-nav');
      const palette = await page.evaluate(() => ({ root: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(), body: getComputedStyle(document.body).getPropertyValue('--surface').trim(), page: getComputedStyle(document.body).getPropertyValue('--page').trim() }));
      if (skin !== 'max') assert.equal(palette.body, palette.root, 'seasonal working surfaces retain their original palette');
      surfaces[theme].add(palette.page);
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page, '.mobile-nav');
      await page.waitForFunction(() => {
        const nav = document.querySelector('.mobile-nav'), pane = document.getElementById(nav.dataset.glassPane);
        return pane && Math.abs(pane.getBoundingClientRect().width - nav.getBoundingClientRect().width) < 1;
      });
      await page.screenshot({ path: `build/preview/palette-${skin}-${theme}.png` });
      await page.setViewportSize({ width: 632, height: 871 });
      await page.getByRole('button', { name: '菜单', exact: true }).click();
      await ready(page, '.sidebar');
      const categoryColours = new Set();
      const labelColours = new Set();
      for (const [name, tone] of Object.entries(tones)) {
        const category = page.locator('.menu-category').filter({ hasText: new RegExp('^' + name + '$') });
        await category.hover();
        await page.waitForTimeout(180);
        const colour = await category.evaluate((row, tone) => {
          const probe = document.createElement('span'); probe.style.color = `var(--icon-${tone})`; probe.style.display = 'none'; document.body.append(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          return { expected, icon: getComputedStyle(row.querySelector('.icon')).color, label: getComputedStyle(row).color };
        }, tone);
        assert.equal(colour.icon, colour.expected, skin + ' ' + theme + ' ' + name + ': semantic icon colour survives hover');
        categoryColours.add(colour.icon);
        labelColours.add(colour.label);
      }
      assert.ok(categoryColours.size >= 3, 'menu categories must not collapse to one accent colour');
      assert.ok(labelColours.size >= 3, 'hover labels retain distinct category hues');
      await page.locator('#close-menu').click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden');
    }
    assert.ok(surfaces.light.size === 4 && surfaces.dark.size === 4, 'seasonal palettes remain visually distinct in both appearances');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.theme-toggle').click();
    assert.equal(await page.locator('[data-motion-active]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: persistent glass across popups/inert drawers, correct modal depth, continuous rapid presses/popup reversals, eight seasonal palettes and semantic menu hover colours');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
