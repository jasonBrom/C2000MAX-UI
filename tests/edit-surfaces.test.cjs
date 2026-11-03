const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4179';
const ready = page => page.waitForFunction(() => document.querySelector('.liquid-selection')?.dataset.glassState === 'gpu');

(async () => {
  const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL,headless:true});
  try {
    const context = await browser.newContext({viewport:{width:412,height:915},hasTouch:true,isMobile:true});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base+'/'); await ready(page);
    await page.evaluate(() => { C2000Theme.setSkin('max'); C2000Theme.set('light'); }); await ready(page);
    const nav = await page.evaluate(() => {
      const scene=__liquidGLRenderer__._sceneLenses;
      const selection=scene.find(l=>l.el.id===document.querySelector('.liquid-selection').dataset.glassPane);
      return { source:selection.renderer.snapshotTarget.className, blur:selection.renderer._snapshotBlur,
        text:selection.renderer._snapshotText, pixels:selection.renderer.textureWidth*selection.renderer.textureHeight,
        inkLayer:+getComputedStyle(document.querySelector('.mobile-nav-items')).zIndex,
        lensLayer:+getComputedStyle(selection.renderer.canvas).zIndex };
    });
    assert.equal(nav.source,'mobile-nav-items'); assert.equal(nav.blur,0); assert.ok(nav.text);
    assert.ok(nav.pixels<200000 && nav.lensLayer>nav.inkLayer,'a small sharp lens refracts navigation ink above its DOM counterpart');
    const selectedShot=await page.screenshot();
    const selectedInk=await page.evaluate(async source=>{
      const image=new Image();image.src=source;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      const box=document.querySelector('.mobile-nav-items a').getBoundingClientRect(),data=ctx.getImageData(box.x,box.y,box.width,box.height).data;
      let count=0;for(let i=0;i<data.length;i+=4)if(data[i]<130&&data[i+2]>145&&data[i+1]<data[i+2]*.85)count++;return count;
    },'data:image/png;base64,'+selectedShot.toString('base64'));
    assert.ok(selectedInk>30,'the actual foreground lens must retain the selected icon and label');
    await page.screenshot({path:'build/preview/navigation-light-v16.png'});
    await page.evaluate(() => C2000Theme.set('dark')); await ready(page);
    await page.screenshot({path:'build/preview/navigation-dark-v16.png'});
    await page.evaluate(() => C2000Theme.set('light')); await ready(page);
    const header = await page.locator('.brand').boundingBox(), menu=await page.locator('.header-menu').boundingBox();
    assert.ok(Math.abs(header.y-menu.y)<5 && header.y>=20,'brand block aligns with the header control while leaving space for ornaments');
    assert.ok(await page.locator('.brand > span').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=20));

    await page.locator('.mobile-nav-items a').nth(2).click();
    const child=page.frameLocator('.c2000-view-frame:not([data-route-pending])');
    await child.getByRole('heading',{name:'无线',exact:true}).waitFor();
    const naturalFrameHeight=await page.locator('.c2000-view-frame').evaluate(e=>e.offsetHeight);
    await child.getByRole('button',{name:'打开编辑弹窗',exact:true}).click();
    const modal=child.getByRole('dialog',{name:'编辑无线网络',exact:true});
    await modal.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.body.classList.contains('content-modal-open'));
    const outerY=await page.evaluate(()=>scrollY);
    for (const height of [915,720,844]) {
      await page.setViewportSize({width:412,height}); await page.waitForTimeout(120);
      const box=await modal.boundingBox();
      assert.ok(box.y>=10 && box.y+box.height<=height-10,'editor remains completely inside the visible viewport: '+JSON.stringify({height,box}));
      const frameBox=await page.locator('.c2000-view-frame').boundingBox();
      assert.ok(frameBox.y+frameBox.height>=height-1 && frameBox.height>=naturalFrameHeight-2,'the iframe reserves the complete visible editor area near the page footer');
      assert.ok(await page.evaluate(y=>document.elementFromPoint(innerWidth/2,y)?.classList.contains('c2000-view-frame'),box.y+box.height-8),'the shell navigation cannot cover the native editor footer');
    }
    const session=await context.newCDPSession(page), box=await modal.boundingBox();
    const x=box.x+box.width*.6, from=box.y+box.height*.75, to=box.y+box.height*.3;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
    for (let i=1;i<=14;i++) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/14}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(250);
    assert.ok(await modal.evaluate(e=>e.scrollTop>80),'a real touch swipe scrolls the editor content');
    assert.ok(Math.abs((await page.evaluate(()=>scrollY))-outerY)<2,'the underlying page remains locked during editor scrolling');
    await child.getByLabel('设置 18',{exact:true}).focus();
    assert.ok(await modal.evaluate(e=>e.scrollTop>e.scrollHeight-e.clientHeight-140),'the final form field is reachable');
    await page.screenshot({path:'build/preview/editor-mobile-v16.png'});
    await child.getByRole('button',{name:'取消编辑',exact:true}).click();
    await page.waitForFunction(()=>!document.body.classList.contains('content-modal-open'));
    await page.waitForTimeout(120);
    assert.ok(Math.abs((await page.locator('.c2000-view-frame').evaluate(e=>e.offsetHeight))-naturalFrameHeight)<2,'cancelling releases the temporary modal area');
    await page.mouse.move(260,300); await page.mouse.wheel(0,-500); await page.waitForTimeout(120);
    assert.ok((await page.evaluate(()=>scrollY))<outerY-50,'normal page scrolling resumes after cancelling');

    await page.getByRole('button',{name:'菜单',exact:true}).click();
    await page.locator('.menu-category').first().click();
    const link=page.locator('.menu-link:visible').first();
    const plain=await link.evaluate(e=>getComputedStyle(e).backgroundColor); await link.hover();
    await page.waitForTimeout(200);
    assert.notEqual(await link.evaluate(e=>getComputedStyle(e).backgroundColor),plain);
    assert.equal(await link.evaluate(e=>getComputedStyle(e).textDecorationLine),'none');
    await page.locator('#close-menu').click();
    await page.goto(base+'/login');
    await page.waitForFunction(()=>document.querySelector('.login-card')?.dataset.glassState==='gpu'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.login-submit').getAttribute('data-glass'),null);
    assert.equal(await page.locator('.login-submit').evaluate(e=>getComputedStyle(e).justifyContent),'center');
    await page.screenshot({path:'build/preview/login-prominent-v16.png'});
    assert.deepEqual(errors,[]); await context.close();
    console.log('PASS: isolated clear navigation, header alignment, native editor touch scroll/viewport/footer/cancel, menu hover and prominent login action');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
