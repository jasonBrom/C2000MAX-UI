const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base='http://127.0.0.1:4179', home='/cgi-bin/luci/admin/status/c2000max';
const ready=page=>page.waitForFunction(()=>document.querySelector('.liquid-selection')?.dataset.glassState==='gpu');
async function item(page,index) {
 const box=await page.locator('.mobile-nav-items > :is(a,button)').nth(index).boundingBox();
 return {x:box.x+box.width/2,y:box.y+box.height/2};
}
async function content(page,title) {
 await page.frameLocator('.c2000-view-frame:not([data-route-pending])').getByRole('heading',{name:title,exact:true}).waitFor();
}
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL,headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let releaseImage;
  const held=new Promise(resolve=>{releaseImage=resolve;});
  await page.route('**/assets/c2000max-front.png',async route=>{await held;await route.continue();});
  await page.goto(base+home,{waitUntil:'domcontentloaded'});
  await ready(page);
  assert.equal(await page.locator('.device-art').evaluate(el=>el.complete),false,'glass must be ready while the large device image is still blocked');
  releaseImage();
  await page.evaluate(()=>{window.shellToken='kept';window.keptCanvas=document.querySelector('.liquid-overlay canvas');});
  const from=await item(page,0),wifi=await item(page,2);
  const session=await context.newCDPSession(page);
  async function touch(type,x,y){await session.send('Input.dispatchTouchEvent',{type,touchPoints:/End|Cancel/.test(type)?[]:[{x,y}]});}
  await touch('touchStart',from.x,from.y);
  for(let i=1;i<=12;i++)await touch('touchMove',from.x+(wifi.x-from.x)*i/12,from.y);
  assert.equal(await page.locator('.mobile-nav').getAttribute('data-input'),'pointer');
  assert.ok((await page.locator('.mobile-nav-items > :is(a,button)').evaluateAll(items=>items.map(e=>getComputedStyle(e).outlineStyle))).every(style=>style==='none'));
  await touch('touchEnd'); await content(page,'无线');
  assert.equal(await page.evaluate(()=>window.shellToken),'kept');
  assert.equal(await page.evaluate(()=>window.keptCanvas===document.querySelector('.liquid-overlay canvas')),true,'navigation must preserve the actual GPU canvas');
  assert.equal(await page.locator('.mobile-nav [aria-current]').textContent(),'无线');
  await page.evaluate(()=>document.getElementById('view').append(document.createElement('p')));
  await page.waitForFunction(()=>document.getElementById('view').childNodes.length===0);
  const child=page.frameLocator('.c2000-view-frame:not([data-route-pending])');
  assert.equal(await child.locator('html').getAttribute('data-content-frame'),'');
  assert.equal(await child.locator('.liquid-overlay').count(),0,'native content must not start a second shell renderer');
  await page.waitForFunction(()=>!!document.querySelector('.c2000-view-frame')?._liquidFrameSnapshot);
  const budget=await page.evaluate(()=>{const f=document.querySelector('.c2000-view-frame')._liquidFrameSnapshot;return f.canvas.width*f.canvas.height;});
  assert.ok(budget<=2010000,'framed content respects its raster budget');
  await page.screenshot({path:'build/preview/continuous-wireless.png'});
  await child.getByRole('button',{name:'打开测试弹窗'}).click();
  assert.equal(await page.locator('.mobile-nav').evaluate(e=>e.inert),true,'native content modals also disable the persistent navigation');
  const dialog=await child.locator('dialog').boundingBox(),frameBox=await page.locator('.c2000-view-frame').boundingBox();
  assert.ok(dialog.y>=frameBox.y&&dialog.y+dialog.height<=frameBox.y+frameBox.height,'native modal stays inside the visible content viewport');
  await child.getByRole('button',{name:'关闭',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.mobile-nav').inert);
  await child.getByLabel('测试名称').fill('draft');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('.mobile-nav-items a').first().click();
  assert.equal(await child.getByLabel('测试名称').inputValue(),'draft','cancelled navigation preserves local form edits');
  await child.getByLabel('测试名称').fill('default');
  await page.locator('.mobile-nav-items a').nth(3).click(); await content(page,'DHCP');
  await page.goBack(); await content(page,'无线');
  await page.goForward(); await content(page,'DHCP');
  assert.equal(await page.evaluate(()=>window.keptCanvas===document.querySelector('.liquid-overlay canvas')),true,'history must preserve the shell');
  await page.getByRole('button',{name:'菜单',exact:true}).click();
  await page.frameLocator('.c2000-view-frame').locator('body').evaluate(e=>e.classList.add('test-poll-update'));
  await page.locator('#close-menu').click();
  assert.equal(await page.locator('.topbar').evaluate(e=>e.inert),false,'child refresh during drawer use must not leave top controls inert');
  // Address-bar sized viewport changes, scrolling and a non-zero fixed canvas anchor must not split glass from ink.
  for(const height of [720,900,650,844]){
   await page.setViewportSize({width:390,height}); await page.waitForTimeout(120);
   const mismatch=await page.evaluate(()=>[...document.querySelectorAll('.mobile-nav,.liquid-selection')].map(e=>{
    const pane=document.getElementById(e.dataset.glassPane),a=e.getBoundingClientRect(),b=pane.getBoundingClientRect();
    return Math.max(Math.abs(a.left-b.left),Math.abs(a.top-b.top),Math.abs(a.width-b.width),Math.abs(a.height-b.height));
   }));
   assert.ok(mismatch.every(value=>value<2),'glass proxies stay aligned during viewport changes');
  }
  await page.addStyleTag({content:'.liquid-overlay[data-glass-layer="base"]{top:19px;left:7px}'});
  await page.evaluate(()=>visualViewport.dispatchEvent(new Event('resize'))); await page.waitForTimeout(250);
  assert.equal(await page.locator('.liquid-overlay canvas').first().evaluate(e=>e.style.top),'0px','renderer must not reposition its canvas to viewport zero');
  await page.locator('.mobile-nav-items a').first().focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.mobile-nav').getAttribute('data-input'),'keyboard');
  assert.equal(await page.locator('.mobile-nav-items a').nth(1).evaluate(e=>e.matches(':focus-visible')),true,'keyboard focus remains visible');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: glass before blocked assets, persistent shell/canvas, touch without outline, native forms/modals, history, private bounded frame snapshots and viewport alignment');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
