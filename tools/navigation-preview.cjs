// Local-only interaction showcase; the installed LuCI theme keeps native page links.
module.exports = function navigationPreview(html) {
  const style = `<style>
  body.navigation-preview { min-height:100svh; padding:0; }
  .navigation-preview > :is(.brand,.header-menu,.sidebar,.sidebar-backdrop,.skip-link) { display:none!important; }
  .navigation-preview #liquid-scene { background:linear-gradient(135deg,transparent 20%,#ffffffc9 26%,#55d5decc 32%,#8588ebcc 37%,#ebbae4b8 42%,transparent 48%),linear-gradient(25deg,#e8ebef 5%,#d4e0e9 40%,#a0ded7 59%,#ccc8e5 78%,#f0f2f5); }
  [data-theme="dark"] .navigation-preview #liquid-scene { background:linear-gradient(135deg,transparent 20%,#596884a1 26%,#219ca5cc 32%,#4a54bdcc 37%,#b961a799 42%,transparent 48%),linear-gradient(25deg,#121b2b 5%,#223c53 40%,#245e62 59%,#45416c 78%,#1a2435); }
  .navigation-demo-intro { position:fixed; top:calc(50% - 190px); left:20px; right:20px; text-align:center; color:var(--text); }
  .navigation-demo-intro h1 { margin:0 0 12px; font-size:30px; letter-spacing:-1px; }
  .navigation-demo-intro p { font-size:14px; opacity:.78; }
  .navigation-demo-appearance { display:flex; justify-content:center; gap:8px; margin-top:20px; }
  .navigation-demo-appearance button { padding:8px 20px; border-radius:999px; background:#ffffff40; border:1px solid #ffffff70; color:inherit; min-height:40px; }
  .navigation-demo-appearance button[aria-pressed="true"] { background:#ffffff82; }
  [data-theme="dark"] .navigation-demo-appearance button[aria-pressed="true"] { background:#ffffff30; }
  .navigation-preview .mobile-nav { position:fixed; z-index:20; display:block; inset:auto 0 calc(50% - 95px); margin-inline:auto; width:min(560px,calc(100% - 28px)); min-height:94px; padding:6px; border-radius:999px; --glass-wash:rgba(255,255,255,.08); }
  .navigation-preview .mobile-nav-items > a { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:7px; min-height:82px; padding:8px 2px; border-radius:999px; font-size:14px; color:var(--glass-ink); }
  .navigation-preview .mobile-nav .icon { width:28px; height:28px; --icon-color:currentColor; }
  .navigation-preview .mobile-nav .is-lens-target { color:var(--accent); }
  .navigation-demo-current { position:fixed; top:calc(50% + 125px); left:20px; right:20px; text-align:center; color:var(--text); font-size:14px; }
  .navigation-demo-back { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); padding:10px 18px; border-radius:999px; color:var(--text); background:#ffffff30; font-size:13px; white-space:nowrap; }
  @media(max-width:420px) { .navigation-preview .mobile-nav-items > a { font-size:11px; } .navigation-preview .mobile-nav .icon { width:24px; height:24px; } }
  </style>`;
  html = html.replace('</head>', style + '</head>').replace(/<body class="([^"]*)"/, '<body class="$1 navigation-preview"');
  const start = html.indexOf('<main class="main"'), end = html.indexOf('<nav class="mobile-nav"');
  const intro = `<section class="navigation-demo-intro"><h1>Liquid Glass</h1><p>悬停预览，拖动切换，松开吸附。</p><div class="navigation-demo-appearance" role="group" aria-label="外观模式"><button data-theme-choice="light" aria-pressed="false">浅色</button><button data-theme-choice="dark" aria-pressed="false">深色</button></div></section><p class="navigation-demo-current" role="status">首页</p><a class="navigation-demo-back" href="/">返回控制台预览</a>`;
  if (start >= 0 && end > start) html = html.slice(0, start) + intro + html.slice(end);
  const script = `<script>(function(){
    const nav=document.querySelector('.mobile-nav'),button=nav.querySelector('[data-menu-toggle]'),menu=document.createElement('a');
    menu.href='#menu';menu.replaceChildren(...button.childNodes);button.replaceWith(menu);
    const items=[...nav.querySelectorAll('.mobile-nav-items > a')];items[0].classList.add('active');items[0].setAttribute('aria-current','page');
    nav.addEventListener('click',event=>{const item=event.target.closest('a');if(!item||!nav.contains(item))return;event.preventDefault();items.forEach(link=>{link.classList.remove('active');link.removeAttribute('aria-current');});item.classList.add('active');item.setAttribute('aria-current','page');document.querySelector('.navigation-demo-current').textContent=item.textContent;});
  })();</script>`;
  return html.replace(/(<script src="[^"]*\/liquid-motion\.js[^>]*>)/, script + '$1');
};
