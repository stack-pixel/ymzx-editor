---
name: ymzx-editor
description: 接入元梦之星PC编辑器，读取与修改原生UI、扣叮、独立Lua工程和场景元件，并核验保存及试玩结果。通过随包本地命令、原生接口和Windows适配器执行，支持本地图片上传，无需宿主提供Computer Use。
---

# 元梦之星编辑器

先读[连接与运行条件](references/connection.md)，再按任务读取对应分类。目标设备、美术风格、玩法、胜负条件、关卡数量和布局方式属于项目配置，不设统一偏好。

| 需求 | 分类与入口 |
|---|---|
| 原生控件、布局、本地图片上传与绑定 | [UI](references/ui/workflow.md)，`scripts/ui/` |
| 隐藏原生跳跃/前扑等按键、清理默认HUD、自定义按钮围绕原生操作区布局 | [原生控件显隐](references/ui/native-controls.md)，再查布局适配 |
| 扣叮积木、事件、变量、编译与日志 | [扣叮](references/kouding/workflow.md)，`scripts/kouding/` |
| 独立Lua工程、检查、打包与导入 | [Lua](references/lua/workflow.md)，`scripts/lua/` |
| 正式场景实例、复制摆放、属性与碰撞 | [元件](references/components/workflow.md)，`scripts/components/` |
| 技能、特效和外部模型的能力范围 | [扩展边界](references/components/extensions.md) |
| 跨设备布局、DPI、安全区和图片比例 | [布局适配](references/ui/responsive.md) |
| 更换执行器、迁移与交付 | [复用与交接](references/reuse.md) |
| 原生输入、坐标与验收 | [共用验证](references/verification.md) |

## 分类协作

UI处理控件、布局和图片登记；元件处理保存在地图中的场景实例；扣叮或Lua处理用户选择的脚本通道。混合任务交接真实控件UID、元件实例ID、资源ID和保存状态。模板ID与实例ID分开保存。纯UI或元件任务不启动扣叮；用户选独立Lua时不引入扣叮桥接。

图片流程从已有本地文件开始，不绑定特定创作工具。格式、正常上传、资源登记和使用权限见[本地图片](references/ui/local-images.md)。

## 执行要求

- 使用接口读写、随包Windows适配器和结果读回。需要本地命令能力；标准文件对话框和真实输入并非纯HTTP操作。
- 复用当前工作区、`YMZX_STATE_DIR`和已匹配的监听器。同一编辑器串行写入；重启、切地图或切层后重新获取对象路径。
- 写入前核对地图、层、会话和真实目标。虚拟列表只使用当前显示条目，选中后确认UID；不沿用历史坐标、编号或项目参数。
- 通过正常编辑器上传、绑定、导入和保存；地图缓存只读核验。布局、资源依赖和脚本分别检查保存结果。
- 按项目指定设备核验最终布局与图片比例。作者坐标、运行时UI单位和物理像素分别校准，固定比例换算不代表跨设备适配。
- 请求成功、读回一致、构建通过、保存完成和实际试玩是不同证据。仅对完成的验证作结论；发布按用户明确的发布任务执行。
- 沿用已授权的编辑、保存和试玩范围，不重复索取普通操作许可；暂停后停止编辑器写入，不扩展到其他账户或地图。
