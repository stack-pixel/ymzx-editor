# 读取已有地图与调整原生布局

先确认任务指定的工程已在编辑器打开且用户有编辑权限。当前已验证读取Button、Text、Group、Picture、ProgressBar的保存记录；动态生成、复杂控件和其他类型需要逐项识别，不能保证任意地图完整还原。

## 双重读取

1. 活动编辑器：`native-ui-inspect roots PATTERN` 枚举本会话Widget；`tree ROOT PATTERN` 读取真实几何、显示状态、可用状态和文本。
2. 正常保存后：`native-ui-document FILE MAP_ID OUT` 只读解析该地图的 `EditorMapDescription.des`，取得UID、名称、文字、素材、父子关系、原始矩形与记录摘要。文件父目录必须匹配地图ID。

使用绝对路径或通过 `scripts/ui/run.mjs` 从状态目录运行。地图ID保持字符串。读到布局缓存不表示当前未保存操作已落盘；正常保存异步完成，需等待预期数据并稳定读回。`waitUIDocument`可检查`name/uid/text/observedType/assetName`，预期条件必须包含本次修改的字段；连续两次匹配且摘要相同才返回。图片替换同时指定目标UID和预期`assetName`，不能只检查旧文字。

原始类型已验证 Button=1、Text=2、Group=3、Picture=4、ProgressBar=11。原始矩形字段不应直接当成CSS左上角或运行时坐标；核对当前原生分辨率、锚点与枢轴。比较保留项的解码字段时，不把未知protobuf字段或序列化摘要改变误报为全部控件被编辑。

涉及新布局、屏幕边缘或尺寸调整时读取[跨设备适配](responsive.md)。固定设计坐标换算不等于响应式布局；除作者数据外，还须核验实际viewport、安全区及父级变换后的最终矩形。

## 编辑

`native-ui-author.mjs`提供原生属性操作。`selectRow(label, expectedUid)`要求精确显示名称和真实UID；命令形式为`native-ui-author select LABEL UID`。仅匹配当前`GetDisplayedEntryWidgets`条目，正常点击后打开属性并核对UID；重名或错误目标拒绝继续，不发送合成触控回调。目标不在显示条目中时，对真实TreeView使用已核实的滚动操作，再重新枚举。行序号不等于UID。

`setText`通过正常输入、提交和文字读回处理单行编辑框；关联属性及保存文档另验。`fillKeypad`使用原生数字键盘的确认入口。`setModifier`写入原生作者单位，不自动换算。

`editSelected(spec)`要求显式传入`designWidth/designHeight/authorWidth/authorHeight`及`x/y/w/h/label`。它按设计画布左上角矩形转换为作者画布中心坐标，仅适用于已核实的中心坐标及一致宽高比；不同锚点或非等比映射使用原始属性入口，不套用固定比例。所有参数在修改前校验。

### 布尔属性与开局显示

`native-property-control`自动定位仅覆盖文字和数字，不提供通用开关写入。涉及开局显示、触摸穿透等布尔项时，读取当前属性页与开关完整schema，核对准确标题和当前值，使用正常点击后读回，再正常保存并检查试玩启动状态。不能把`SetIsEnabled`误当开关值，也不能只凭点击回执认定属性已提交。

仅对任务明确指定的控件修改初始显隐。开局显示、运行时显隐和触摸穿透是不同状态；脚本初始化可能覆盖作者值。模板复制和透明度继承见[运行时实践](../lua/runtime.md)。

`native-ui-call.mjs`校验完整反射参数后执行当前原生方法；命令为`node scripts/ui/run.mjs native-ui-call OBJECT_PATH FUNCTION_NAME PARAMETERS_JSON_FILE`，无参数方法可省略文件，参数文件必须是JSON对象。函数名像getter也可能要求非空UObject；缺参可能崩溃。`native-ui-delegate.mjs`只接受真实 `UMG.Button`。没有证据支持的参数/结构先补齐证据；必要的界面输入按[接口与坐标验证](../verification.md)接入已验证的本地适配器，不猜测回调。

## 保存和验收

退出UI编辑器走正常UI打包，再正常保存地图；从保存文档检查目标变化、保留UID和其他控件。复制后取得新的正式UID，不能沿用原件编号。直接SpawnActor或临时Widget不证明进入地图注册/保存。

接着检查独立Lua或扣叮是否在运行时覆盖底图、文字、位置和显隐。需要脚本修改时进入本技能对应分类，不能通过作者视图截图推定试玩效果。实际点击检查可见控件是否命中原回调。

默认用接口读取动态坐标、由本地适配器点击，再核对原回调及数据变化，见[共用验收方案](../verification.md)。当前工具读取的屏幕坐标曾实测为桌面物理像素中心；截图可能使用逻辑像素且带独立origin，转换时依据当次窗口与viewport/DPI，不能重用旧窗口位置或重复乘DPI。截图用于视觉核验，不要求AI宿主提供桌面输入工具。
