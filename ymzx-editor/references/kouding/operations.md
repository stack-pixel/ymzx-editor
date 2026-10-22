# 操作协议与积木约束

## CLI 与数据

`node scripts/kouding/ymzx.mjs help` 列出命令。默认打印 JSON；`--out FILE` 将完整结果保存为 UTF-8，并只打印文件路径。读取参数文件兼容 UTF-8 BOM。

| 命令 | 作用 |
|---|---|
| `status` | 心跳、原生桥状态；不代表玩法成功 |
| `info [QUERY_JSON]` | 工程、地图身份、校验数、字段选项；查询文件格式 `{ "types": ["积木类型"] }` |
| `call snapshot` | 当前工作区的积木 ID、类型和 XML |
| `call GetCode PARAMS_JSON` | 参数 `{ "fileId": "当前工程中的真实文件ID" }`；返回 data 可能多层 JSON 编码 |
| `apply BASELINE_JSON PROJECT_JSON` | 基线为 info 返回值；工程文件为其 project 字段修改后的对象 |
| `save BASELINE_JSON` | 完整编译并暂存，读回核对 |
| `play BASELINE_JSON` | 编译并请求试玩，尚不能自动判断成功 |
| `logs` | `{output, errors}`；空对象不证明没有错误或已运行 |
| `reload BASELINE_JSON` | 检查已暂存后刷新扣叮页面 |

也可从脚本导入 `editor-client.mjs` 的 `read(method, params)`、`decodeData(value)` 和 `logs()`。只允许白名单方法，无任意 JS 执行接口。

写入参数内部结构为 `{mapId, projectId, expectedProject, project}`；保存、试玩、刷新不带最后的 project。mapId 和 projectId 必须保持为字符串，避免长数字精度丢失。保存用导入后重新读取的基线，不能继续使用修改前快照。

`apply` 前服务自动保存 `evidence/before-apply-*.json`。恢复时从备份取 `project`，配合当前 info 基线重新导入、校验和保存。备份不是完整地图快照，不能恢复地形或其他原生场景数据。

## 最小改动原则

保留 `blocklyFileId`、`codeFileId`、`type`，以及不属于此次任务的触发器、变量和资源引用。新增块 ID 唯一，复用已有块时保留原 ID。只编辑目标触发器的工作区状态，并同步该格式要求的触发器元数据。

导入会异步渲染；工具等待工作区序列化与期望内容稳定后返回。若失败会尝试还原之前画布，但仍需读取确认。发生超时不能假设“没有执行”，先读取真实状态；一次明确失败后不要循环重试相同写入。

## 积木字段与引用

根据当前`info`结果和积木定义选择类型、字段及下拉选项，不手写猜测枚举值。选项字符串可能包含引号，应保留实时字段值的原始编码。

日志等级字段`Game_LogLevel.inputName`采用包含`dataId`、`text`和`value`的对象。循环参数引用须匹配当前循环的`argId`、`argName`和`originBlockId`，不能复制其他循环的引用身份。条件块的具体类型以兼容前端定义和编译结果为准。

`GetCode`使用当前`codeFileId`读取扣叮生成代码，不等于独立Lua编程元件读写。

## 结果判定

核对校验状态、保存读回和生成代码，再检查本次运行证据。日志可按`Category`、`LogLine`、`Message`、`Level`和`blocklyFileId`筛选；`LogLine`是生成代码行号，工具不自动映射到积木。日志数值和行为预期来自当前任务，不沿用示例验收数据。
