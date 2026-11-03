// Local preview only. Shapes mirror native LuCI controls; no device configuration is changed.
module.exports = title => `<div id="view"><div class="cbi-map"><h2>${title}</h2>
<p>原生页面交互测试夹具，设备上使用真实 LuCI 页面。</p>
<label class="cbi-value">名称 <input aria-label="测试名称" value="default"></label>
<select aria-label="自动选择"><option value="first">first</option><option value="second">second</option></select>
<fieldset class="cbi-section"><legend>拨号模式配置</legend><div style="height:950px;background:linear-gradient(#78b6e433,#ff9f6833)"></div>
<div class="cbi-value"><label class="cbi-value-title">时间格式</label><div class="cbi-value-field"><input aria-label="时间格式" value="%H:%M:%S"></div></div></fieldset>
<div class="cbi-page-actions"><button class="cbi-button">保存并应用</button><button class="cbi-button">保存</button><button class="cbi-button">重置</button></div>
<fieldset class="cbi-section collapsible"><h2 class="panel-title">基本信息</h2></fieldset><div id="update_time_display" style="text-align:right">最后更新: 00:00</div><ul class="cbi-tabmenu" id="plugin-tabs"><li class="cbi-tab" data-tab="dial">拨号模式</li><li class="cbi-tab-disabled" data-tab="rat">网络优先级</li></ul><p>页面底部</p><button class="cbi-button" id="test-modal">打开测试弹窗</button>
<button class="cbi-button" id="test-editor">打开编辑弹窗</button>
<dialog id="fixture-modal"><p>原生弹窗</p><button onclick="this.closest('dialog').close()">关闭</button></dialog>
<div id="modal_overlay"><div class="modal" role="dialog"><h4>配置修改</h4><p>有两项未保存的修改</p><div class="button-row"><button onclick="document.body.classList.remove('modal-overlay-active')">关闭修改</button></div></div><div class="modal cbi-modal" role="dialog" aria-label="编辑无线网络" hidden><h4>无线网络：接入点</h4><div class="cbi-map"><ul class="cbi-tabmenu"><li class="cbi-tab"><a href="#">常规设置</a></li><li class="cbi-tab-disabled"><a href="#">无线安全</a></li></ul><fieldset class="cbi-section">${Array.from({length:18},(_,i)=>`<div class="cbi-value"><label class="cbi-value-title" for="editor-${i}">设置 ${i+1}</label><div class="cbi-value-field"><input id="editor-${i}" value="测试值"></div></div>`).join('')}</fieldset></div><div class="button-row"><button class="cbi-button" id="cancel-editor">取消编辑</button></div></div></div>
<script>
document.querySelector('select').selectedIndex=1;
document.querySelectorAll('#plugin-tabs li').forEach(tab=>tab.onclick=()=>{tab.parentElement.querySelectorAll('li').forEach(item=>item.className=item===tab?'cbi-tab':'cbi-tab-disabled');});
document.getElementById('test-editor').onclick=()=>{const overlay=document.getElementById('modal_overlay');overlay.querySelector('.modal:not(.cbi-modal)').hidden=true;overlay.querySelector('.cbi-modal').hidden=false;document.body.classList.add('modal-overlay-active');};
document.getElementById('cancel-editor').onclick=()=>{document.body.classList.remove('modal-overlay-active');document.querySelector('.cbi-modal').hidden=true;document.querySelector('#modal_overlay > .modal:not(.cbi-modal)').hidden=false;};
document.getElementById('test-modal').onclick=()=>document.getElementById('fixture-modal').showModal();
const indicator=document.createElement('span');indicator.dataset.indicator='uci-changes';indicator.textContent='未保存的配置: 2';
indicator.onclick=()=>document.body.classList.add('modal-overlay-active');document.getElementById('indicators').append(indicator);
</script></div></div></div>`;
