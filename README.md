# 元梦之星编辑器 Skill

面向可执行本地命令的 AI 助手，支持元梦之星 Windows PC 编辑器的原生 UI、扣叮、独立 Lua 工程与场景元件操作。

## 开发背景与致谢

本项目在开发与接口分析过程中使用了 [REA（Reverse Engineer Anything）](https://github.com/morluto/rea)，辅助理解编辑器结构与交互流程，并据此编写适配脚本、整理技能说明和验证操作结果。感谢 REA 项目提供的工具支持。

当前发布的 skill 通过随包脚本、本机编辑器接口及 Windows 适配器执行，使用时无需安装 REA。

## 安装

将本仓库中的完整 `ymzx-editor` 文件夹复制到 AI 宿主的技能目录，保留 `scripts`、`references` 和 `agents`。在任务中使用 `$ymzx-editor`；不支持技能发现的本地执行器可先读取 [SKILL.md](ymzx-editor/SKILL.md)。

首次使用先读 [连接条件](ymzx-editor/references/connection.md)，再按需选择 UI、扣叮、Lua 或元件分类。需要 Windows、Node.js 22+ 和本机编辑器；Lua 另需用户合法安装的 DreamHelper 1.4.7。版本兼容以包内指纹检查为准，未知版本会拒绝连接安装。

## 范围与限制

- 通过本机接口、CLI 与随包 Windows 适配器操作；只有聊天能力的宿主不能直接控制编辑器。
- 原生服务须已在本机可用；本包不自动启动游戏或开启未知版本的服务。服务与监听器保持本机回环访问。
- 扣叮首次连接会备份并修改匹配版本的本机网页入口，支持校验后恢复。仅在用户明确的连接任务范围内使用。
- 图片走正常上传、审核、资源登记和绑定流程；素材权利与平台规则由使用者核对。
- 编辑、保存、试玩和发布是分别验证的结果；不保证全部版本、设备或多人玩法均已验证。
- 本项目是独立适配工具，与元梦之星及 DreamHelper 官方无隶属关系，不代表官方支持。使用者应遵守适用的平台条款。

仓库仅提供技能说明、自编适配脚本和测试，不分发官方游戏、SDK、插件、地图缓存、素材、会话、日志或凭据。测试中的标识使用合成数据，运行状态与包密码须留在本机。

## 离线回归测试

在仓库根目录使用 Node.js 22+：

```powershell
# 完整测试需指向本机合法安装、版本匹配的 DreamHelper 文件。
$env:YMZX_HELPER_FILE = '实际安装目录/dist/extension.js'
$tests = Get-ChildItem -Recurse -File ymzx-editor/scripts -Filter *.test.mjs
node --test $tests.FullName
```

`YMZX_HELPER_FILE` 仅供测试定位本机插件；未设置时，依赖 DreamHelper 的两项测试会跳过，其余测试仍执行。实际 Lua 工作流通过 `lua.mjs configure PROJECT_DIR HELPER_EXTENSION_JS` 保存本机配置，见 [Lua 流程](ymzx-editor/references/lua/workflow.md)。安装路径因电脑而异，不应将个人绝对路径或官方插件文件提交到仓库。

测试覆盖本地解析、请求校验、连接拒绝与恢复、导入约束及布局工具；离线通过不等于真实地图验收。
