# Liquid Glass 分支设计与实现

## 依据

- [Apple HIG · Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：Liquid Glass 用于导航和功能浮层；内容区域使用标准材质。文字较多的浮层优先 regular，照片背景可以使用 clear；保留减少透明度和增强对比度的体验。
- [Apple · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)：以折射、边缘光和清楚的前后层级表达材质，而非给所有内容叠加模糊。
- [Apple HIG · Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)：保持导航标签、明确选中态、按钮层级与键盘焦点。
- [liquidGL 文档](https://github.com/naughtyduk/liquidGL)：使用独立 target / content、固定定位透镜、背景快照与 destroy 生命周期。保留 v3.0.0 原始源码和 MIT 许可证；上游提交 `88f681ab7035fd55b04f63edff1841e32c4199e9`，不分发其演示资产。

## 组件映射

| 组件 | 材质与行为 |
| --- | --- |
| 登录卡片 | 真正的 liquidGL 透镜，折射当前壁纸；清晰的输入、按钮和标签在透镜之上，渐变遮罩保证阅读 |
| 手机导航 | regular 透镜、圆角浮动容器、独立选中胶囊、统一符号颜色；不把背景文字带入 shader |
| 侧栏与抽屉 | regular 透镜、选中行与搜索区；关闭的抽屉释放渲染资源 |
| 外观 / 管理员菜单、LuCI 下拉层、弹窗、提示及吸附操作栏 | 仅在可见时启用透镜；关闭或移出视口后销毁 |
| 按钮、输入、勾选 / 单选、范围、页签 | 统一圆角、填充、按压、禁用、错误和焦点状态；保留原生 DOM 交互 |
| 数据卡片、表格、进度、嵌套分区 | 稳定的标准材质；不创建重复 GPU 透镜 |

## 渲染与性能边界

`#liquid-scene` 是唯一快照来源。登录时它包含壁纸和暗角，管理界面使用静态背景渐变；文字、设备读数、表单和凭证均不在此子树中。这个 Web 实现折射背景场景，不声称复刻苹果系统对所有滚动内容的实时光学采样。

每个功能浮层使用独立的装饰透镜，真实控件始终保留在 DOM 上层。`contain: paint` 给固定透镜建立局部坐标与裁切边界，避免全局画布被内容卡片遮住。最多四个可见透镜，优先登录、弹窗与导航；快照限定一屏，分辨率上限 1.25，不随长表单的总高度增长。关闭 specular、tilt、fluid 和色散，避免常驻高成本动画。

页面隐藏、浮层关闭、主题变化或壁纸更新时释放 / 重建透镜。低内存（浏览器报告 ≤2 GiB）、Save-Data、减少动态效果 / 透明度、强制颜色、GPU 不支持及脚本加载失败均保留可交互的 CSS 材质。无透明度支持时使用填充背景。

## 验证

先按 README 渲染模板，再运行 `npm test` 和 `npm run test:browser`。专项检查必须等待 `data-glass-state="gpu"`，不能仅根据脚本加载或 canvas 存在判断成功。

覆盖 390 / 632 / 1350px 的浅深色登录与首页、选中胶囊、抽屉和弹出菜单的开启 / 销毁、LuCI 弹窗、主题更新、原生登录 POST、密码显示和背景快照隔离，以及无 GPU、低内存、省流量、减少动态效果、强制颜色和加载失败。截图在首帧完成后生成。

这些验证不能替代目标手机上的功耗、温升、Safari 兼容性和长期帧率测试；发布前仍需实机验证。

2026-11-01 本地 Edge 无头采样：390×844 首页、1350×900 首页、632×871 登录均为一个画布 / 一个透镜；场景尺寸等于视口。各取 120 个 requestAnimationFrame 间隔，中位数 6.1ms、P95 6.2ms。这仅说明本机浏览器调度未被明显阻塞，不代表手机实际 GPU 完成时间或功耗；原始记录保存在本地产物 `build/preview/liquid-profile.json`。
