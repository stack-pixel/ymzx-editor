# 扣叮与原生资源联动

扣叮只负责积木工程与运行时事件。屏幕控件编辑转[UI](../ui/workflow.md)，正式场景摆放/属性转[元件](../components/workflow.md)；取得真实ID后回到本分类绑定。执行与试玩使用[本地接口和适配器](../verification.md)，不依赖宿主Computer Use。

`scripts/kouding/native-scene.mjs`含基线及地图ID保护，并依赖扣叮桥接，仅用于扣叮联动。纯UI及元件任务使用各自独立入口。

## 保存后的 UI 编号与扣叮引用

退出 UI 编辑器会走其正常打包流程，随后正常保存地图。只读解析该地图的 `EditorMapDescription.des`：

```powershell
node scripts/kouding/native-ui-document.mjs '地图编号目录/EditorMapDescription.des' '精确地图编号字符串' ui.json
```

`waitUIDocument(file,mapId,expected,{absentUids})` 可等待预期记录和删除结果稳定；正常保存是异步的，一次读到旧缓存不能判失败。路径父目录必须匹配地图编号。解析器只处理当前观察到的 protobuf 路径，返回 UID、原始类型值、名称、文字和摘要；格式变化或 UID 重复会拒绝。它不会写入游戏缓存。已交叉验证 Button=`1`、Text=`2`、Group=`3`、Picture=`4`、ProgressBar=`11`。分组子项在字段 9999 内，9998 是父 UID；读取器递归展平并检查父子关系与全局 UID 唯一性，返回 parentUid、childUids、原始矩形及素材名称。不要把素材名称直接当作扣叮素材 ID。

通过 CLI `call resourceReferences QUERY_JSON` 进一步核对当前地图：

```json
{"mapId":"从当前 info 读取","kind":"Widget","ids":["从保存文档读取的UID"]}
```

`kind` 接受 `Widget`、`Element`、`LogicElement`、`Module`，每次 1～30 个唯一十进制编号字符串。按原生返回核对实例；Module模板查询与运行实例引用分开处理。前后检查当前地图，返回原生 `valid`、名称等信息。原生返回的 `types` 可能只反映查询类别；Widget 不证明 Button 子类型，Element 不证明具体元件功能，仍需结合控件记录或真实场景类核对。

已验证的 `Game_UI_Button/Text.fields.inputName` 为对象：`dataId` 是带单引号的 UID 字符串，`value` 是原始 UID 字符串，另有 `text`、`originText`、`isSceneId:true`。不要只替换显示名。按当前定义核对 Button 子类型、文字输入和玩家范围。

## 扣叮写入、试玩与整图保存

写入扣叮前让该页面实际打开并渲染。适配器 revision 8 在发送前检查页面帧响应、工作区与导出工程一致性，并串行写入。隐藏页导入会卡在原生前端的异步加载；加载未结束时不得并发导入或启动回滚。`info.canvasConsistent:false`、`unsettledImport:true` 或超时都需先检查截图、工程与现有记录。

`Event_UI_OnAnyPlayerButtonDown` 的 `player` 参数表示点击者。角色触发盒使用已实测的 `Event_Character_OnEnterSignalBoxs/OnLeaveSignalBoxs`，引用输入叫 `signalBox`，事件参数有 `character`、`box`；`GetValue_Character_GetPlayerByCharacter` 用于解析所属玩家。固定引用用 `Variable_Getter_Dynamic_SignalBox`，保留 `refId:SignalBox` 及真实实例 ID。

试玩默认从当前接口读取目标及几何，再通过已验证本地适配器进行坐标点击，按本次运行的事件和数据变化核验。可使用受进程和窗口约束的 `observed-window-input.ps1` 执行 click、scroll、键盘、文字或最多 5 秒的 WASD/空格按住；仅在当前宿主允许该实现时使用，不作为AI宿主必备能力。移动结束或异常都会释放按键。返回编辑器后再读取日志；试玩中的空日志不能证明未运行，也不能证明已通过。

扣叮编译暂存、UI 打包和整图保存是不同步骤。整图正常保存退出后，从草稿箱重新打开同一地图，再核对地图/工程 ID、控件 UID、实例变换、积木绑定并重复试玩。本包不提供自动发布工具。

## 逻辑元件联动

计数器等逻辑元件的属性通过元件分类按当前schema和准确属性名称设置，写入前核对实例ID。信号发送与监听须使用同一真实信号定义，字段格式按当前积木定义生成；不要把某类的字段或示例数值套用到其他逻辑元件。保存重开后检查引用、专属配置与实际触发结果。

## 当前资源目录

通过 `ymzx.mjs call METHOD QUERY_JSON` 查询，每次都提供当前 mapId，原生回调前后核对地图和请求序号。先调用 staticTypes，再按其 DynamicQueryType 选择查询：

| 方法 | 查询参数（除 mapId） | 适用元数据 |
|---|---|---|
| staticTypes | 无 | 返回类型及查询模式 |
| resourceMenu | type | GetTypeMenu；先取分类 |
| resourceItems | type、menuOrder、subMenuOrder（分类有子项时必填）、pageIndex | 已返回的分类内资源；页码从 1 开始 |
| resourceList | type | SingleQuery |
| resourcePage | type、pageIndex | PaginatedQuery；页码从 1 开始 |

已实测 ElementType、LogicElementType、SoundEffectType 分类，逻辑元件分类内的计数器/计时器等条目，ModuleType 模板分页和 Level 列表。具体类型、分类编号、资源键从当前返回读取，不能从显示名拼造。ModuleType 的模板键可能是转义 JSON 字符串，须原样保留，不能当作地图内实例 ID；普通元件模板 ID 与已放置实例 ID 也不同。PictureAsset 未出现在当前动态查询元数据中，不应猜测该目录接口。目录可读不表示资源已创建、绑定或实际播放。

## 模组模板与运行实例

模组模板引用、运行时实例和编辑器内保存对象分别处理。本工具不提供通用模组模板作者器。

Action_Module_CreateModuleWithTransform 的输入为 moduleType、pos（Vector3）、scale（Number）、rot（Vector3）。Game_ModuleType.fields.inputName 使用原生条目的 key 原样作为 dataId 和 value，text 使用其 name，originText 为模组类型；不能把 TemplateID 单独抽出替换整个键。正常编译暂存会处理模板依赖同步，再核对生成代码及实际生成结果。

在兼容版本中，创建事件的输出引用使用`pin_event_new_module`，`extraState`包含`outputType:Module`、`argName:module`和`blockName:事件中的模组`，可用于位置查询、移动和销毁。生成代码须使用事件实际输出参数，不能将旧块`GetValue_Module_GetModuleByEvent`生成的`param['sourceModule']`视为新版事件的通用输出。

空间范围查询可能返回多个实例，不取数组首项作为默认目标，也不据此批量删除。使用事件实际绑定或另行核实身份的引用。
