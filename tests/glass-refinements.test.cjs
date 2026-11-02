const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base='http://127.0.0.1:4179';
const ready=(page,selector)=>page.waitForFunction(s=>document.querySelector(s)?.dataset.glassState==='gpu',selector);
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL,headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.waitForFunction(()=>window.previewDashboard);
  const before=await page.locator('.quick-access').boundingBox();
  await page.locator('.modem-link').click();
  const native=page.frameLocator('.c2000-view-frame:not([data-route-pending])');
  await native.getByRole('heading',{name:'QModem 模组详情',exact:true}).waitFor();
  assert.equal(await native.locator('html').evaluate(()=>innerWidth),1440,'native media queries retain the full shell viewport');
  assert.ok(await native.locator('.panel-title').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)<=18),'plugin section titles use the shared heading size');
  assert.equal(await native.locator('#update_time_display').evaluate(e=>getComputedStyle(e).textAlign),'center');
  const tab=native.getByRole('tab',{name:'网络优先级'});
  await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');
  assert.notEqual(await tab.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','plain-text selected tabs must beat the Bootstrap adapter transparent background');
  assert.ok((await tab.boundingBox()).height>=32,'text-only plugin tabs retain the desktop control height');
  await tab.press('ArrowLeft');assert.equal(await native.getByRole('tab',{name:'拨号模式'}).getAttribute('aria-selected'),'true');
  await page.locator('.brand').click();
  await page.frameLocator('.c2000-view-frame:not([data-route-pending])').getByRole('heading',{name:'连接正常',exact:true}).waitFor();
  const after=await page.frameLocator('.c2000-view-frame:not([data-route-pending])').locator('.quick-access').boundingBox();
  assert.ok(Math.abs(before.x-after.x)<2&&Math.abs(before.width-after.width)<2&&after.y<400,'returning home preserves its right-hand column and width');
  await page.setViewportSize({width:632,height:871});await ready(page,'.mobile-nav');
  await ready(page,'.sidebar');await ready(page,'.account-menu');await ready(page,'.theme-control');
  const warmed=await page.locator('.sidebar').getAttribute('data-glass-pane');
  await page.getByRole('button',{name:'菜单',exact:true}).click();
  const immediate=await page.locator('.sidebar').evaluate(e=>({pane:e.dataset.glassPane,state:e.dataset.glassState}));
  assert.deepEqual(immediate,{pane:warmed,state:'gpu'},'opening a prepared drawer never swaps from CSS to GPU');
  await page.locator('#close-menu').click();
  assert.equal(await page.locator('.sidebar').getAttribute('data-glass-pane'),warmed,'closing keeps one prepared drawer surface');
  const lens=page.locator('.liquid-selection');await page.waitForTimeout(400);
  const selected=await lens.boundingBox();
  await page.locator('.mobile-nav-items a').nth(2).hover();await page.waitForTimeout(200);
  assert.ok(Math.abs((await lens.boundingBox()).x-selected.x)<1,'ordinary hover does not pull the selected capsule');
  assert.equal(await page.locator('.mobile-nav').evaluate(e=>getComputedStyle(e,'::before').zIndex),'4','the optical rim sits above native labels');
  assert.equal(await page.locator('.mobile-nav-items a').nth(2).evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  // Compare actual transmitted pixels with and without high contrast text underneath.
  await page.evaluate(()=>{const id=document.querySelector('.mobile-nav').dataset.glassPane;window.testRenderer=__liquidGLRenderer__._sceneLenses.find(l=>l.el.id===id).renderer;});
  await page.waitForFunction(()=>!testRenderer._capturing);
  await page.evaluate(async()=>{
   const rect=document.querySelector('.mobile-nav').getBoundingClientRect(),swatch=document.createElement('div');swatch.id='ghost-test';
   Object.assign(swatch.style,{position:'absolute',top:rect.top+scrollY+'px',left:rect.left+'px',width:rect.width+'px',height:rect.height+'px',fontSize:'48px',fontWeight:'900',color:'#ff00ff',background:'#333333',zIndex:'8'});
   swatch.textContent='GHOST GHOST';document.body.append(swatch);await testRenderer.captureSnapshot();
  });
  await page.waitForTimeout(150);
  const shot=await page.screenshot();
  const magenta=await page.evaluate(async data=>{
   const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   const r=document.querySelector('.mobile-nav').getBoundingClientRect(),d=ctx.getImageData(r.x+8,r.y+8,r.width-16,r.height-16).data;
   let count=0;for(let i=0;i<d.length;i+=4)if(d[i]>160&&d[i+2]>160&&d[i+1]<100)count++;return count;
  },'data:image/png;base64,'+shot.toString('base64'));
  assert.ok(magenta<5,'background text cannot leave coloured ghost glyphs in the glass');
  await page.screenshot({path:'build/preview/glass-no-ghosts.png'});
  await page.goto(base+'/login');await ready(page,'.login-card');await ready(page,'.login-submit');
  await page.locator('[data-theme-toggle]').click();await ready(page,'.theme-control');
  assert.ok(await page.locator('.theme-control').evaluate(e=>getComputedStyle(e).getPropertyValue('--glass-wash').includes('.8')),'login appearance popup has its own legibility wash');
  await page.waitForTimeout(300); await page.screenshot({path:'build/preview/glass-login-refined.png'});
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS: full-width native breakpoints, restored desktop column, plugin headings/tabs, prepared drawer, anchored hover, optical cap, ghost-free text and login button');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
