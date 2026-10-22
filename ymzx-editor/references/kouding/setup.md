# 安装与跨平台接入

## 运行条件

- 元梦之星 Windows PC 编辑器，扣叮前端版本与 `compatibility.json` 中的资产 SHA-256 匹配。当前验证版本为 0.12.1-4120，资源目录版本 20260930114930171。
- 本机 Node.js 22+。工具只用内置模块，无 npm 安装步骤。
- AI 宿主具有本地文件与命令执行能力；游戏必须在其可访问的 Windows 主机上运行。

## 已经连接过的电脑

沿用现有状态目录，其中应有 `.local/read-bridge.json`、`.local/probe-install.json` 和原始备份。不要将这些文件分享给别人。

```powershell
$env:YMZX_STATE_DIR = '你已有的状态目录绝对路径'
node '技能目录/scripts/kouding/ymzx.mjs' status
```

`connected: true` 且 `browser.ready: true` 时直接操作。服务已启动时不要再运行 `serve`。端口冲突时检查已有服务，不结束不明进程。另一个 AI 也必须指向同一状态目录，并避免同时写入。

状态目录是当前主机的连接配置，不属于可共享的技能文件。迁移时重新配置，不以包内默认runtime目录替代已有连接目录。

## 新电脑首次连接

1. 将技能包解压到稳定位置。找到实际使用的扣叮网页资源目录：通常在游戏安装位置的 `ymzx_webres/dream_code_s21/<版本>/` 下，包含 `index.html` 和 `assets/`。存在多个版本时，先确定当前加载的是哪个，不批量修改。
2. 选择一个本机状态目录，所有后续命令使用相同环境变量。它保存令牌和恢复原文件所需的备份，升级技能时不要删除。
3. 检查版本，然后安装连接脚本。安装属于对本地编辑器的可恢复修改；仅在用户的连接/安装任务范围内执行。

```powershell
$env:YMZX_STATE_DIR = 'C:/ymzx-ai-state'
node '技能目录/scripts/kouding/ymzx.mjs' check '实际网页资源目录'
node '技能目录/scripts/kouding/ymzx.mjs' install '实际网页资源目录'
node '技能目录/scripts/kouding/ymzx.mjs' serve
```

`serve` 是持续运行的进程。使用宿主的后台命令功能；若使用 Windows Start-Process，使用隐藏窗口并将输出重定向至本地文件。不要创建开机启动项或计划任务，除非用户另行要求。

4. 在游戏中进入扣叮，另一个终端检查 `status`。已打开的页面可能仍缓存旧资源；先尝试退出并重新进入扣叮。仍无心跳时，检查资源版本、服务和权限。初次引导在特定缓存状态下可能需要保存后重启一次游戏，不能承诺首次安装完全无重启。
5. `info --out baseline.json` 验证读取。未收到心跳前不要继续写入。

## 更新与恢复

```powershell
node '技能目录/scripts/kouding/ymzx.mjs' update
node '技能目录/scripts/kouding/ymzx.mjs' info --out before-reload.json
node '技能目录/scripts/kouding/ymzx.mjs' reload before-reload.json
```

`reload` 要求工程已暂存，刷新前若有用户未保存内容，应按当前任务范围保存或暂缓刷新。不要盲目刷新来处理玩法逻辑问题。

卸载本连接时运行 `restore`。安装器验证原始备份和当前文件哈希后恢复；文件被游戏更新或他人修改时会拒绝覆盖，需要先人工核对。恢复磁盘文件不立即撤销已加载页面内的脚本，关闭/重新加载页面后生效，随后停止本工具的服务。

## 交给其他 AI 平台

- 支持 SKILL.md 的平台：将整个 `ymzx-editor` 目录放入该平台指定的技能位置，保留目录结构。
- 不支持技能自动发现但能执行本地命令的平台：明确要求它先读取本目录 `SKILL.md`，再调用 `scripts/kouding/ymzx.mjs`。
- 只提供远程聊天的平台：还需要在游戏电脑上运行的本地执行器。本包未提供 MCP 服务或远程网关，不能仅上传 Markdown 后直接控制游戏。

平台技能发现路径与启用机制以其实际环境为准。本包的跨平台部分是文本说明和 CLI；没有在每个第三方平台进行端到端测试。
