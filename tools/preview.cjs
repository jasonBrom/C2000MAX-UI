const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.join(__dirname,'..'),preview=path.join(root,'build/preview');
const navigationPreview=require('./navigation-preview.cjs');
const types={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.html':'text/html; charset=utf-8'};
let bing=null;
async function wallpaper(){
 try {
  const res=await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',{signal:AbortSignal.timeout(10000)});
  const item=(await res.json()).images[0];
  if(!item.url.startsWith('/th?id=OHR.'))throw Error('Unexpected Bing URL');
  const image=await fetch('https://www.bing.com'+item.url,{signal:AbortSignal.timeout(20000)});
  const data=Buffer.from(await image.arrayBuffer());
  await fs.writeFile(path.join(preview,'bing.jpg'),data);
  bing=item;console.log('Bing wallpaper loaded: '+item.startdate);
 } catch(e){console.log('Wallpaper fallback: '+e.message);}
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end('Preview is read only');return;}
 try {
  let relative=decodeURIComponent(url.pathname),file;
  if(relative==='/'){res.writeHead(302,{Location:'/cgi-bin/luci/admin/status/c2000max'}).end();return;}
  if(relative==='/cgi-bin/luci/admin/status/c2000max')file=path.join(preview,'dashboard.html');
  else if(relative==='/navigation')file=path.join(preview,'dashboard.html');
  else if(relative==='/login'||relative==='/cgi-bin/luci/admin/logout')file=path.join(preview,'login.html');
  else if(relative==='/login-error')file=path.join(preview,'login-error.html');
  else if(relative==='/preview-runtime.js')file=path.join(root,'tests/preview-runtime.js');
  else if(relative==='/fixture.json')file=path.join(preview,'fixture.json');
  else if(relative==='/bing.jpg')file=path.join(preview,'bing.jpg');
  else if(relative.startsWith('/luci-static/bootstrap/'))file=path.join(preview,'bootstrap',relative.slice(23));
  else if(relative.startsWith('/luci-static/c2000max-ui/'))file=path.join(root,'htdocs',relative);
  else if(relative==='/luci-static/resources/cbi.js'||relative.startsWith('/cgi-bin/luci/admin/translations/')) {res.writeHead(200,{'Content-Type':'text/javascript'}).end('/* preview runtime */');return;}
  else if(relative==='/forms')file=path.join(preview,'forms.html');
  else if(relative.startsWith('/cgi-bin/luci/')){
   const title=relative.includes('wireless')?'无线':relative.includes('qmodem')?'QModem 模组详情':'DHCP';
   let html=await fs.readFile(path.join(preview,'dashboard.html'),'utf8');
   const start=html.indexOf('<div id="view">'),end=html.indexOf('<footer class="main-footer"');
   html=html.slice(0,start)+'<div id="view"><div class="cbi-map"><h2>'+title+'</h2><p>这是原生页面交互测试夹具；安装到设备后使用真实 LuCI 页面。</p><label class="cbi-value">名称 <input aria-label="测试名称" value="default"></label><div style="height:950px;background:linear-gradient(#78b6e433,#ff9f6833)"></div><p>页面底部</p><button class="cbi-button" id="test-modal">打开测试弹窗</button><dialog id="fixture-modal"><p>原生弹窗</p><button onclick="this.closest(\'dialog\').close()">关闭</button></dialog><script>document.getElementById("test-modal").onclick=()=>document.getElementById("fixture-modal").showModal();</script></div></div></div>'+html.slice(end);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);return;
  } else {res.writeHead(404).end();return;}
  file=path.resolve(file);
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
  let data=await fs.readFile(file);
  if(relative==='/navigation')data=Buffer.from(navigationPreview(data.toString()));
  if(file.endsWith('login.html')||file.endsWith('login-error.html')){
   let html=data.toString();
   if(bing)html=html.replace(/(<img class="login-wallpaper" src=")[^"]+/, '$1/bing.jpg')
    .replace(/(<span class="wallpaper-credit-text">)[^<]*/, '$1Bing 每日壁纸 · '+esc(bing.copyright));
   html=html.replace('</body>','<script>document.querySelector("form").addEventListener("submit",e=>{e.preventDefault(); let p=document.querySelector(".preview-login-note");if(!p){p=document.createElement("p");p.className="login-error preview-login-note";p.setAttribute("role","status");e.target.append(p);}p.textContent="这是外观预览，登录请在设备上操作。";});</script></body>');
   data=Buffer.from(html);
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch(e){res.writeHead(404).end('Not found');}
}).listen(4179,'127.0.0.1',()=>{console.log('C2000MAX theme preview http://127.0.0.1:4179/ — login /login');if(process.env.PREVIEW_FETCH_WALLPAPER!=='0')wallpaper();});
