# Star Ring Dodge 待办

记录已讨论但尚未实现的玩法方向。完成一项后从下面移除，并同步 `README.md` 与 `index.html` 的版本标签。

基线版本：v3.2

---

## 1. Boss 战 / 精英陨石

在部分星域中投放大型威胁体，让危险有层次，而不只是数量堆叠。

- 精英陨石：半径远大于 `tuning.largeAsteroidThreshold`，需要多次命中才碎，击碎后分裂成若干普通陨石
- 追踪型敌人：朝玩家缓慢加速，可被激光摧毁，进入视口时给边缘预警
- 触发条件建议挂在区域上，例如只在 `belt` / `rift` 出现，通过 `config.js` 的 `regions` 加一个 `eliteChance` 字段控制
- 落点：`spawnAsteroid()`（app.js:955）已接收 region 参数，新增 spawn 函数照它的模式写；碰撞和击毁计分复用现有激光碰撞循环
- 需要给精英陨石加 HP 字段，现有陨石是一击即碎，改动时注意别影响 `state.stats.destroyedAsteroids` 的统计口径

## 2. 成就系统与累计统计

注意：**单纯的最高分本地存档已经做完了**（`bestKey` + localStorage，见 app.js:383/391）。这里要补的是最高分之外的长期记录。

- 累计数据：总游玩局数、累计击毁陨石、累计回收核心、累计跃迁次数、最长存活时间、最佳命中率
- 成就条目：例如「单局跃迁 5 次」「命中率 ≥ 80%」「不受伤存活 2 分钟」，达成时用 `spawnMessage()` 弹提示
- 存储：新开一个 localStorage key（如 `star-ring-dodge-profile`）存 JSON，不要挤进现有的 `bestKey`；读写都要 try/catch，隐私模式下会抛异常
- 落点：`endGame()`（app.js:1619）已经在汇总本局统计，累计写入和成就判定接在那里；结算面板追加一栏展示

## 3. 新星域模板

`config.js` 的 `regions` 目前有 4 个（drift / belt / stream / rift），加区域只要补一条配置，但有特色的机制需要 app.js 配合。

- 引力涡流区：陨石轨迹被一个引力点弯曲，需要在陨石更新里加一个指向涡心的加速度
- 静默星云：整体视野变暗（可复用 `tuning.visualVignetteTint` / `visualHazeStrength`），但道具刷新更快，用视野换补给
- 纯配置的新区域（只调 tint 和三个倍率）几乎零成本，可以先加来验证跃迁门的区域轮换是否够丰富
- 注意 `pickRouteOptions()` 会从 `REGION_IDS` 里排除当前区域抽两个（app.js:847），区域变多后双门重复率自然下降

## 4. 小地图 / 雷达

v3.2 之后世界大于视口（`tuning.worldWidth/worldHeight` = 2400×1600），屏幕外的信息现在是完全不可见的，雷达的收益比之前大。

- 左下角画一个按世界比例缩放的矩形，标出玩家、跃迁门、附近陨石和道具，当前视口画一个框
- 跃迁门方位最值得优先显示，`routeChoiceDuration` 只有 11 秒，超时会自动选最近的门
- 所有实体都是世界坐标，画之前按 `world.width/height` 归一化即可，不要走 camera 变换
- 手机端要留意别和左下角的手势摇杆重叠，参考 `styles.css` 的横屏布局约束；窄屏改动后按项目约定做一次截图检查

---

## 备选小项

- 结算页显示本局走过的星域路线（跃迁历史）
- 陨石密度过高时的动态难度回落，避免后期无解
- 键位自定义（目前 J 开火是写死的）
