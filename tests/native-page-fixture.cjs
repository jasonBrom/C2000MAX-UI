// Local preview only. Shapes mirror native LuCI controls; no device configuration is changed.
module.exports = title => `<div id="view"><div class="cbi-map"><h2>${title}</h2>
<p>原生页面交互测试夹具，设备上使用真实 LuCI 页面。</p>
<label class="cbi-value">名称 <input aria-label="测试名称" value="default"></label>
<select aria-label="自动选择"><option value="first">first</option><option value="second">second</option></select>
<section class="cbi-section"><div style="height:950px;background:linear-gradient(#78b6e433,#ff9f6833)"></div>
<div class="cbi-value"><label class="cbi-value-title">时间格式</label><div class="cbi-value-field"><input aria-label="时间格式" value="%H:%M:%S"></div></div></section>
<div class="cbi-page-actions"><button class="cbi-button">保存并应用</button><button class="cbi-button">保存</button><button class="cbi-button">重置</button></div>
<p>页面底部</p><button class="cbi-button" id="test-modal">打开测试弹窗</button>
<dialog id="fixture-modal"><p>原生弹窗</p><button onclick="this.closest('dialog').close()">关闭</button></dialog>
<div id="modal_overlay"><div class="modal" role="dialog"><h4>配置修改</h4><p>有两项未保存的修改</p><div class="button-row"><button onclick="document.body.classList.remove('modal-overlay-active')">关闭修改</button></div></div></div>
<script>
document.querySelector('select').selectedIndex=1;
document.getElementById('test-modal').onclick=()=>document.getElementById('fixture-modal').showModal();
const indicator=document.createElement('span');indicator.dataset.indicator='uci-changes';indicator.textContent='未保存的配置: 2';
indicator.onclick=()=>document.body.classList.add('modal-overlay-active');document.getElementById('indicators').append(indicator);
</script></div></div></div>`;
