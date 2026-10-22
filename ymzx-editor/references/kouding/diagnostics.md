# 错误诊断

先明确用户观察到的现象和期望结果；已有上下文足够时直接取证，不要求用户重复描述。区分下面几类问题，不把连接断开误报为地图逻辑错误。

| 现象 | 首先检查 | 可以得出的结论 |
|---|---|---|
| 工具无响应或超时 | status 心跳、ready、服务端口、当前页面 | 能确认连接是否可用；写入超时后先读取，不能认定没有写入 |
| 导入弹出流程错误 | info.errors、当前工程、snapshot、写入前备份 | 对比导入的字段结构和已加载定义；确认自动恢复是否成功 |
| 编辑器标红 | info.validationErrorCount、目标积木字段、生成代码 | 校验数可见，但本工具尚未提供完整逐条校验诊断列表 |
| 试玩产生脚本错误 | logs.errors、logs.output、相应 codeFileId 的 GetCode | 按实际返回的错误文本和行号对照生成代码，不假定所有异常格式相同 |
| 没报错但玩法不对 | 事件、循环、角色存在性、参数值、每步日志与验收条件 | 无错误不代表正确；添加最少量诊断日志，复现并核对数值/状态 |
| 游戏崩溃、碰撞异常、联网异常 | 当前可获得的日志与界面证据 | 工具提供基础状态读取与受约束输入，不包含崩溃转储、网络协议分析或通用寻路 |

建议取证命令：

```text
node scripts/kouding/ymzx.mjs status --out status.json
node scripts/kouding/ymzx.mjs info --out error-baseline.json
node scripts/kouding/ymzx.mjs logs --out error-logs.json
node scripts/kouding/ymzx.mjs call snapshot --out error-canvas.json
```

工程和日志只在本机保存。需要生成代码时，从 info.project.codeFileId 构造 GetCode 参数文件，不猜测 ID。API 的 data 可能经过多层 JSON 编码，可用 editor-client.mjs 中的 decodeData 解码。

根据证据提出一个具体原因，修改最小范围，并按 SKILL.md 的导入、校验、暂存、试玩流程重新验证。保留原始证据，区分修复前已有的问题和本次引入的问题。相同写入明确失败后，改变假设或修复方案，不连续重复执行。若无法确认恢复结果，停止进一步写入并说明需要的证据。

向用户说明：已确认的原因、修复内容、如何验证、还不能排除什么。不要将推测写成已定位原因，也不要把空日志、试玩请求成功或校验通过单独作为完整修复证据。
