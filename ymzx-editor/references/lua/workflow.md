# Lua 工程、连接、导入

所有命令相对于本技能目录，输出参数可使用绝对路径。先配置 `YMZX_STATE_DIR`；本机已有状态时直接复用，不能因为换AI而另起监听器。

```text
node scripts/lua/lua.mjs help
node scripts/lua/lua.mjs configure PROJECT_DIR HELPER_EXTENSION_JS
node scripts/lua/lua.mjs status
node scripts/lua/lua.mjs check --out check.json
node scripts/lua/lua.mjs build
node scripts/lua/lua.mjs serve
node scripts/lua/lua.mjs logs --after ISO_UTC_TIME --session SESSION_ID --marker UNIQUE_MARKER --out logs.json
```

需要本机合法安装的 DreamHelper 1.4.7 `dist/extension.js`。检查器读取该安装的SDK声明；构建器从指纹匹配插件加载解析器/压缩器，不启动或修改VS Code插件。共享包不含这些官方资产。`configure` 会校验工程，并阻止监听器仍绑定其他工程时切换。

`serve` 是持续运行进程；只有没有现存监听器时启动。Windows后台启动用隐藏窗口。连接时在真实编程元件面板点击“重新连接”；核对握手后的工程、地图、层和会话。状态文件的旧 `lastSeenAt` 不等于当前在线。

新复制的地图可能尚无本机工程关联。当前监听器只对明确的`onlyShow:true,bNeedSave:false`请求允许省略ProjectPath，并返回已配置工程的显示元数据；显式不同工程仍拒绝。写入请求必须提供匹配的真实ProjectPath，不能取消这一检查。连接后在原生“工程目录→更换”选择标准工程的`src/GameEntry.lua`，再重新核对目标并准备导入。使用随包`scripts/common/game-file-dialog-native.ps1`选择已观察的“打开GameEntry.lua文件”标准对话框：传当前游戏PID、`-Action choose -FilesJson`及仅含真实入口绝对路径的JSON数组。只选择工程真实入口，不使用其他Lua文件代替。选择工程本身可能立即发起导入请求，没有有效令据时被拒绝是正常现象；之后使用正常导入按钮完成，不伪造选择回调。

## 已有地图读源码

使用原生“下载工程”，将实际元件源码导出到选定目录后备份。该操作还会改变元件工程路径，并可能触发 `bNeedSave=true` 请求；没有准备导入时监听器会拒绝写入。导出后重新连接，区分地图基线和本地改动。不要读取/打印整个含包密码的manifest；只取必要版本、文件名或摘要。

## 检查与打包

`check` 验证语法、静态require依赖和已安装API方法名；它不证明参数类型、客户端/服务端适用范围或玩法正确。动态require给出警告，不能静默放行。`build` 输出官方加密ZIP和 `dist/play.json`，在状态目录保存源码/包/清单摘要。打包后改源码必须重建。

监听器返回 `gameScriptPath`：Windows盘符小写且分隔符转为反斜杠，再传给原生脚本面板。普通文件系统比较忽略大小写不能修复游戏内部的严格工程路径比较。

## 一次性导入

在当前编辑器检查选中元件的属性页和实际编程面板，生成：

证据JSON的字段如下，值从当前原生属性页及编程面板读回：

| 字段 | 类型与来源 |
|---|---|
| `method` | 字符串，固定为`window-inspected`，表示本工具的界面检查证据格式 |
| `componentId` | 数字，实际选中的编程元件编号 |
| `mapName` | 字符串，当前真实地图名 |
| `layerId` | 数字，当前层编号 |
| `verifiedAt` | 检查完成时的ISO UTC时间 |

记录有效期120秒，不伪造时间，不用历史文件代替当前目标检查。检查可通过原生接口完成，不要求宿主桌面工具。

```text
node scripts/lua/lua.mjs arm-import ui-verification.json
node scripts/lua/lua.mjs cancel-import
```

`arm-import` 核对当前连接/地图/层/摘要，生成两分钟有效、发送前消耗的一次性令据。随后通过已确认的原生按钮代理，或已验证本地适配器的动态坐标点击，触发当前面板“导入脚本”；不是直接用CLI覆盖任意元件，也不要求AI自带Computer Use。UDP本身没有目标实例ID，因此期间保持选中实例不变。点击未知结果时先 `cancel-import`、读取真实状态，再决定是否重新准备，不能连续重发。

## 验收

先看编辑器当前版本/代码包时间是否更新，再检查接受的脚本资源ID（只打印必要字段），正常保存，进入试玩。按[接口与坐标验证](../verification.md)定位当前按钮、发送实际点击，并以本次时间/会话过滤Lua日志，核对预期事件和数据变化。找到唯一启动标记只证明启动，`import_sent` 与 `verified:false` 只描述UDP状态；点击接口返回成功或没有错误日志也不能证明实际行为通过。

重连产生新会话时旧令据失效。本工具不提供通用运行中热更新或断点调试。多人同步和发布版本云存档按项目独立验证，编辑器本地归档调用不能证明跨局持久化。
