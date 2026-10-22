# 接口、本地适配器与结果核验

UI、扣叮、Lua、元件共用此方案。必需入口是本地CLI、原生服务与随包PowerShell适配器，不要求宿主Computer Use。截图用于观察，不能替代编辑器状态或点击结果。

## 执行入口

| 任务 | 工具 | 另查的结果 |
|---|---|---|
| 读取类型/属性/树/场景 | native-remote-read、native-remote-getters、native-ui-inspect、native-scene-snapshot | 本次world、身份、数据新鲜度 |
| 已核实原生方法 | native-ui-call | 完整反射参数与操作后差异 |
| 正常编辑器按钮代理 | native-ui-delegate | 真实UMG.Button、当前根、可用且有渲染面积、后续结果 |
| 点击/填写/拖拽 | UI或元件目录的native-ui-control | 当次窗口、动态几何、前台与状态读回 |
| 本地窗口输入 | 同目录observed-window-input.ps1 | 进程/PID、尺寸、客户区、前台和实际回调 |
| 系统文件选择 | scripts/common/game-file-dialog-native.ps1 | 游戏所属标准对话框、文件名读回、后续上传/导入回执 |

按钮代理与真实鼠标命中是不同证据。`TriggerButtonClicked`仅传入已确认UMG.Button；名称含btn或有SetIsEnabled不证明类型。运行时自定义UI根可能是Overlay，不应放宽类型检查。

## 操作顺序

1. 核对本次地图、层、会话、真实UID/实例ID，读取最新树和完整函数签名。虚拟列表和属性行会复用对象，同路径不保证仍是原属性。
2. 记录当前值、预期结果、时间和会话。写入前再核对基线；有其他编辑改动时取得新基线，不覆盖旧计划。
3. 优先已验证的原生读写/正常按钮；需输入则用当前几何计算点，适配器只操作目标游戏。失焦、尺寸变化、遮挡或类型不符时停止该次输入。
4. 单次操作后读实际变化。复制、领奖、导入结果未知先读journal和现状，不盲目重发；失败可能已经部分执行。
5. 分别记录请求、读回、整图保存、重开和玩法验收。HTTP200、true、零编译错误、启动日志或截图不能独立证明完成。

## 坐标、DPI和裁剪

- 当前版本GetWidgetScreenPosition实测是桌面物理像素中心；转整窗坐标减窗口左上角，不再加半尺寸或重复乘DPI。
- GetWidgetLocSize可能为未缩放UI单位；计算边界前核对GetViewportScale及客户区/viewport原点。SDK运行时布局需另核实坐标系。
- 长时间轴条目可能中心在屏幕外。取实际矩形与viewport、父级裁剪区域的交集，再选可见内部点；不能将屏幕外中心简单钳制。随包native-ui-control使用中心点策略，中心不可见会拒绝，不是通用裁剪点击器。
- IsVisible、非零几何和UObject存在不证明未被遮挡。结合当前画面，必要时滚动并重新枚举，不点击未渲染模板。
- 控件根、视觉层与命中层尺寸可能不同；不能照搬默认100×30根尺寸。命中路径出现SObjectWidget不等于指定UID。
- 本地工具受约束地尝试激活窗口；遮挡或前台验证失败则不输入，不自动操作其他应用。

```text
powershell -NoProfile -File scripts/ui/capture-game-window.ps1 -OutputPath ABS_CAPTURE_PNG
powershell -NoProfile -File scripts/ui/observed-window-input.ps1 -TargetProcessId ACTUAL_PID -ExpectedProcessName LetsGoClient-Win64-Shipping -ExpectedWidth CAPTURE_WIDTH -ExpectedHeight CAPTURE_HEIGHT -Action click -X WINDOW_X -Y WINDOW_Y
```

捕获工具输出当次窗口/客户区几何，输入为整窗物理像素。回执verified:false只表示发送输入；native-ui-control fill的verified:true仅证明输入框文字相同，底层属性/保存另验。后台启动PowerShell使用隐藏窗口。

## 输入与版本边界

标准文件选择器适配器用于游戏所属的图片选择和`GameEntry.lua`入口选择，见[本地图片](ui/local-images.md)及[Lua](lua/workflow.md)。`uploadVerified:false`表示文件已提交，后续上传或导入结果仍需读回。

通用界面输入使用随包Windows适配器，不采用缺省触控回调参数或向游戏主窗直接PostMessage替代真实命中。标准文件对话框的受检查消息操作是独立入口。

虚拟列表使用`GetDisplayedEntryWidgets`取得当次显示条目；滚动后重新读取，不从全部池化Widget中猜目标。点击后核对属性面板的真实UID，再编辑。

新版本或新主机核验连接、窗口几何和实际结果。设备覆盖按[适配规则](ui/responsive.md)记录；技能、特效和外部模型的范围见[扩展边界](components/extensions.md)。
