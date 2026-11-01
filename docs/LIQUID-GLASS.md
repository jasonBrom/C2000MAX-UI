# Liquid Glass 分支设计与实现

## 依据

- [Apple HIG · Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：Liquid Glass 用于导航和功能浮层；内容区域使用标准材质。文字较多的浮层优先 regular，照片背景可以使用 clear；保留减少透明度和增强对比度的体验。
- [Apple · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)：以折射、边缘光和清楚的前后层级表达材质，而非给所有内容叠加模糊。
- [Apple HIG · Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)：保持导航标签、明确选中态、按钮层级与键盘焦点。
- [Apple HIG · Motion](https://developer.apple.com/design/human-interface-guidelines/motion)、[Icons](https://developer.apple.com/design/human-interface-guidelines/icons)：统一符号视觉重量，以短促、可打断的交互反馈解释状态，并响应减少动态效果设置。
- [liquidGL 文档](https://github.com/naughtyduk/liquidGL)：使用独立 target / content、固定定位透镜、背景快照与 destroy 生命周期。基于 v3.0.0 和 MIT 许可证；上游提交 `88f681ab7035fd55b04f63edff1841e32c4199e9`，不分发其演示资产。本地增加 `snapshotBlur` 可选参数及输入控件排除规则，修改已记入源码和 NOTICE。

## 组件映射

| 组件 | 材质与行为 |
| --- | --- |
| 登录卡片 | 真正的 liquidGL 透镜，折射当前壁纸；清晰的输入、按钮和标签在透镜之上，渐变遮罩保证阅读 |
| 手机导航 | regular 透镜取样实际下方内容；先缓存平滑模糊再折射，独立的选中胶囊与实心 / 加重符号在上层 |
| 侧栏与抽屉 | regular 透镜、选中行与搜索区；关闭的抽屉释放渲染资源 |
| 菜单、外观、管理员按钮 | 共用导航画布的真实透镜，轻量 specular 与 fluid 响应触碰；前景 SVG 保持清晰 |
| 外观 / 管理员菜单、LuCI 下拉层、弹窗、提示及吸附操作栏 | 仅在可见时启用透镜；关闭或移出视口后销毁 |
| 按钮、输入、勾选 / 单选、范围、页签 | 统一圆角、填充、按压、禁用、错误和焦点状态；保留原生 DOM 交互 |
| 数据卡片、表格、进度、嵌套分区 | 稳定的标准材质；不创建重复 GPU 透镜 |

## 渲染与性能边界

登录页只取样 `#liquid-scene` 中的壁纸与暗角。管理页取样实际页面内容，排除所有玻璃功能层、遮罩、输入、文本域、选择框和可编辑内容；输入值不进入纹理。内容更新的快照请求以 500ms 合并，滚动使用已经上传的纹理，不逐帧重绘 DOM。

导航、顶部按钮和普通浮层的装饰透镜位于同一固定坐标容器，共用一个画布与快照，前景控件保留在上方 DOM 层。顶层原生弹窗和登录页使用局部透镜。最多四个可见透镜，优先弹窗与导航；管理页纹理预算约 200 万像素，长表单降低快照分辨率，登录页最高 1.25 倍。大面板关闭 specular / fluid；小按钮仅启用低强度交互，所有透镜关闭 tilt 与色散。

本地 `snapshotBlur` 在纹理上传前缓存一次 Canvas 2D 模糊；shader 的 frost 设为 0，避免上游逐像素随机模糊的颗粒及每帧 16 次随机取样。共享渲染器按快照、定位容器、z-index 和模糊量分组，WebGPU / WebGL 都使用这张平滑纹理。若 Canvas filter 不可用，仍保留原始纹理与可读性遮罩。

页面隐藏、浮层关闭、主题变化或壁纸更新时释放 / 重建透镜。低内存（浏览器报告 ≤2 GiB）、Save-Data、减少动态效果 / 透明度、强制颜色、GPU 不支持及脚本加载失败均保留可交互的 CSS 材质。无透明度支持时使用填充背景。

## 动效与图标

- 图标采用同一份 SVG sprite、24 单位网格、1.8 线宽和圆头圆角；导航选中使用配套的实心 / 加重版本。密码显示使用 eye / eye-off，菜单开关和外观切换同步更新图形。图标是 Web SVG，不分发 SF Symbols 字体或资源。
- 按压 100ms、退出 160ms、进入 240ms、抽屉与选中胶囊 340ms，统一使用 `cubic-bezier(.2,.8,.2,1)`。按住保持压缩，松开回弹，取消手势立即清理；链接跳转和表单提交不为动画等待。
- 外观 / 管理员菜单用内部 `C2000Motion.visibility(panel, opening, mutate)` 协调原有状态。退出时立即更新 aria、inert 与点击状态，视觉退出完成后清理；快速重新打开会取消旧动画。LuCI 直接移除的弹窗沿用自身销毁时机，新增弹窗有进入反馈。
- 装饰性颜色 / 阴影过渡在首次交互后启用，避免首帧初始化触发额外过渡。减少动态效果会取消进行中的动画、压缩和回弹，状态立即落定；无常驻图标摆动和闪烁。
- 首页轮播直接更新展示状态，不模拟按钮点击，避免自动切换误关用户菜单；减少动态效果时暂停自动轮播，手动选页仍可使用。

## 验证

先按 README 渲染模板，再运行 `npm test` 和 `npm run test:browser`。专项检查必须等待 `data-glass-state="gpu"`，不能仅根据脚本加载或 canvas 存在判断成功。

覆盖 390 / 632 / 1350px 的浅深色登录与首页、共用画布、选中胶囊、抽屉和弹出菜单的开启 / 销毁、按住 / 松开、快速反向切换、退出阶段焦点与 inert、SVG 引用与密码图标、LuCI 弹窗、主题更新、原生登录 POST，以及六类回退。截图在首帧和相关过渡完成后生成。可用 `RECORD_MOTION=1 node tests/motion-browser.test.cjs` 生成本地演示视频。

这些验证不能替代目标手机上的功耗、温升、Safari 兼容性和长期帧率测试；发布前仍需实机验证。

本地 Edge 短时调度采样记录保存在 `build/preview/liquid-profile.json`。requestAnimationFrame 间隔仅说明本机浏览器调度情况，不等于 GPU 实际完成时间或手机功耗。

当前采样：首页手机为四个透镜 / 一个画布，桌面为三个透镜 / 一个画布；632px 登录页为两个透镜 / 两个画布。三个场景的 120 帧调度采样均为中位数 6.1ms、P95 6.2ms；管理页纹理分别约 104 万和 164 万像素。该结果只适用于本次本机采样。
