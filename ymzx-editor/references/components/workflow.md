# 元件：正式场景搭建与属性

处理保存于地图中的真实场景实例：基础几何搭建、复制摆放、装饰/图片展示、属性与碰撞。使用原生接口和随包本地输入，不依赖扣叮网页、Lua监听器或宿主Computer Use。技能/特效的能力边界见[扩展范围](extensions.md)。

## 随包入口

命令相对技能目录；先设置现有任务的`YMZX_STATE_DIR`。

```text
node scripts/components/run.mjs help
node scripts/components/run.mjs native-scene-snapshot scene.json
node scripts/components/run.mjs native-editor-palette scene palette.json
node scripts/components/run.mjs native-ui-inspect roots NAME_PATTERN roots.json
node scripts/components/run.mjs native-ui-control drag CURRENT_PALETTE_ROOT CURRENT_ITEM_PATH WINDOW_X WINDOW_Y
node scripts/components/run.mjs native-scene-placement select ACTUAL_SCENE_ID
node scripts/components/run.mjs native-scene-placement copy SELECTED_SCENE_ID 3
node scripts/components/run.mjs native-scene-placement place COPY_REPORT_JSON CHANGES_JSON
node scripts/components/run.mjs native-property-control CURRENT_PROPERTY_PANEL EXACT_PROPERTY_TITLE VALUE
```

`run.mjs`设定任务工作目录并创建evidence，help不接触游戏。快照含特殊实例，写入只针对当前编辑器world里的真实正ID。正式创建通过当前元件库条目拖入已观察的场景区域，比较前后快照核对新增正ID、类、数量和属性。`native-editor-palette`只读取已渲染条目，不负责搜索/创建/下载；可用当前搜索框的`native-ui-control fill`查找，再刷新条目。

`select`根据当前ActorBounds和相机投影选择，随后用真实属性面板ID确认。`SetActorSelectionState`可能仅改变高亮，不等于真实选中。普通地形用top；已核实告示牌/文字类可center；图片展示类可image-center或image-base。投影不证明未被遮挡，不能凭输入回执继续复制。

`copy`要求实际已选中目标，正常复制1～20次；逐次检查恰好多一个相同类正式实例、原件不变，并返回副本记录。`place`只移动该记录内的副本：

```json
[{"id":"本次副本正ID","position":[600,700,0],"rotation":[0,0,30],"scale":[3,2,0.6]}]
```

严格字段id/position/rotation/scale；id字符串、向量三个有限数值；位置厘米、旋转Roll/Pitch/Yaw度、缩放正比例。工具核对会话路径、原件及副本原变换，设置变换、同步`SavePlaceableActorAllEditorData`后读回。`mapSaved:false`表示尚未整图保存。失败可能部分完成，先读journal，不盲目重放。

删除使用`native-scene-placement delete-selected EXACT_CURRENT_ACTOR_PATH`，只针对任务允许删除且实际选中的精确路径；核对其他实例未变，不按名字或数组首项批量删。

## 已有地图与精确建模

1. 读当前地图/层、目标位置、包围盒与禁改区域，以本次实测基础元件尺寸和枢轴为准。有些几何是底面中心，不一律按几何中心摆放。
2. 用任务JSON描述布局，小组验证后批量复制。外部3D软件可输出摆放坐标，再转换为元梦基础元件计划；统一厘米、轴向、左右手系、角度、原点、缩放及父子关系，不能直接照搬坐标。
3. 已有元件变换可按当前反射，经`native-ui-call`调用`K2_SetActorLocationAndRotation`、`SetActorScale3D`，再同步`SavePlaceableActorAllEditorData`。每项写入前核对当前world、正ID、完整路径及原变换，逐项读回；低层入口本身没有地图级并发保护，任务脚本必须保留这些检查。旧`scripts/kouding/native-scene.mjs`有扣叮桥接身份依赖，仅供已有扣叮联调，不是本分类独立入口。
4. 颜色、材质和类专属数据先读取schema/GetData完整字段，再用当前类匹配的属性或SetData；不同元件签名不能互套。属性行重建后按精确名称重新定位。
5. 按任务区分装饰、承载和交互元件的碰撞，保留明确不属于本次修改的对象及行为。

高坐标处实测序列化会舍入，位置读回约0.05cm、比例0.001容差；以本次精度为据，不为掩盖错误任意放宽。旋转比较姿态，四元数q与-q等价。

## 图片、保存与验收

世界图片展示元件使用[正常本地图片上传](../ui/local-images.md)登记的资源，再经该类专属数据绑定。世界图片不是屏幕UI；独立核对图面比例、朝向、底座和碰撞，不把某类Visible字段的表现推广到其他元件。

正常整图保存，退出重开同一草稿，重新枚举ID、类、变换、材质/数据及资源依赖。只读缓存辅助核对，禁止直接写缓存冒充编辑。保存前接口读回、保存后文件读回、重开与实际试玩分别记录；运行时SpawnActor/SpawnElement不算地图搭建。

试玩覆盖此次修改涉及的路径、交互和碰撞；直接跳到目标位置不能替代相关流程验证。性能按项目指定设备、元件、材质、透明面和特效评估。实际输入遵循[共用验证](../verification.md)。

运行时复制展示的尺寸/枢轴、横放朝向、短动作采样、粒子可见性及对象销毁期间的读取，见[运行时模型与特效](runtime-display.md)。
