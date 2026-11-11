# JukeboxRoom 项目审计与本地升级报告

审计日期：2026-11-09  
工作目录：`C:\Users\lenmo\Desktop\JukeboxRoom`  
当前版本：`0.0.13`  
当前分支：`main`  
远程：GitHub `https://github.com/yuchen0x1/JukeboxRoom.git`

本报告记录的是已完成的分阶段审计与实际修改，不声称已逐行人工审阅 708 个文件或完成所有设备矩阵测试。下面将已验证结论与未完成验证分开列出。

## 1. 项目现状

JukeboxRoom 是一个自托管多人实时点歌系统，提供房间、队列、同步播放、歌词、聊天、房主管理、音乐源聚合、TV 大屏、本地曲库和 AutoDJ；同时包含 Windows Electron 桌面版、React/Vite Web 客户端和 Capacitor Android/iOS 工程。

主要技术栈：

- 服务端：Node.js 20+、Express 5、Socket.IO、可选 Redis、JSON 数据存储。
- Web 客户端：React 19、TypeScript、Vite、Zustand、Three.js、Capacitor。
- 桌面端：Electron 42、electron-builder、内置本地服务端和前端静态资源。
- 测试：Node 内置测试运行器、Vitest、TypeScript 编译和 Vite 生产构建。

核心目录：`server/` 服务端与领域模块，`client/src/` Web/移动端界面与状态，`desktop/` Electron 壳，`scripts/` 构建和健康检查，`deploy/` 部署样例，`docs/` 设计、部署和历史审计资料。

## 2. 清理记录

本次没有删除文件、依赖、数据库或用户数据。审计结果不足以安全判定任何项目文件为废弃内容，因此按保守规则全部保留。

扫描结果：

- 清理前可审计文件数：708（排除 `node_modules`、构建目录、发布目录和 Git 元数据）。
- 清理后可审计文件数：708。
- 根依赖生产依赖：1；服务端生产依赖：190；客户端生产依赖：39。
- npm 官方 registry 生产依赖审计：根、服务端、客户端均为 0 个漏洞。
- 使用镜像 registry 的 `npm audit` 因镜像未实现 audit endpoint 返回 404；已改用 npm 官方 registry 完成复核。

保留的重要本地目录包括 `server/data/`、`server/.env`、Android 构建缓存和发布产物；它们属于运行数据或生成结果，不做删除。

## 3. GitHub 竞品研究

本轮按“多人同步播放、共享队列、在线音乐房间、开源自托管”关键词检索 GitHub，并查看了仓库 README、功能说明、代码树和许可证。星数为 2026-11-09 抓取页面显示值，仅用于判断项目规模，不代表质量。

| 仓库 | Stars / 许可证 | 已核实能力 | 与当前项目的差异和借鉴点 |
|---|---|---|---|
| [Syncplay](https://github.com/Syncplay/syncplay) | 约 2.7k / Apache-2.0 | 多播放器房间同步播放/暂停/进度，新成员加入后同步，并带文本聊天 | 桌面播放器同步不同于 JukeboxRoom 的网页音源队列；可借鉴重新加入时恢复状态、明确房间同步协议。仓库定位和许可证见 GitHub 页面。 |
| [CrowdRoom](https://github.com/jaherhum/crowdroom) | 页面未稳定显示 / AGPL-3.0 | FastAPI + Vue 3、WebSocket 实时更新、房间/邀请/成员管理、投票跳歌、Spotify adapter、SQLite/PostgreSQL | 与共享点歌房更接近，但当前只实现 Spotify；其 adapter 边界可作为音乐提供方抽象的参考。AGPL 与本项目 MIT 不同，不应直接复制代码。 |
| [Melodee](https://github.com/melodee-project/melodee) | 66 / MIT | 大型自托管音乐库、媒体入库流水线、OpenSubsonic/Jellyfin API、后台任务、Jukebox 与 Party Mode | 偏个人媒体服务，不是多音源社交房间；媒体索引、入库校验和任务编排值得长期观察，不建议把完整服务栈并入本项目。 |
| [CrownJukebox](https://github.com/Kronborgs/crownjukebox) | 页面未稳定显示 / MIT | Go + SQLite 本地曲库、SSE 实时推送、TV kiosk、移动端宾客队列、权限控制、封面缩略图缓存 | 场景是单主机本地曲库播放，不是房间内每人同步播放；可借鉴 TV kiosk 的信息层级、首启配置和封面缓存。 |

### 竞品结论与差距

- JukeboxRoom 的优势是多音乐源、房间社交、客户端同步播放、歌词/视觉效果，以及 Web/桌面/Android 多端覆盖；单个比较仓库没有同时提供这些组合。
- 自托管本地曲库和 Party Mode 方面，Melodee 提供了更明确的媒体入库流水线及多 API 兼容；本项目的曲库索引和格式归一化仍有发展空间。
- CrownJukebox 的 TV kiosk 和本地主机播放流程更聚焦，配置和使用路径更简单；JukeboxRoom 功能更广，但入口更多，初次部署与初次使用的信息密度需要持续控制。
- 同步精度方面，Syncplay 的协议状态恢复可借鉴；本项目的房间状态同步不等同于跨设备声学相位同步，不能宣称设备间音频样本级同步。
- CrowdRoom 的 adapter 设计与投票跳歌边界值得观察；但其 AGPL-3.0 许可证要求与本项目 MIT 不同，仅借鉴公开设计，不复制实现。
- 本轮未找到证据支持需要引入新竞品代码或依赖；本次修复自更新安全边界、延迟视觉手势加载并改善首页错误恢复，没有为追求功能数量添加孤立业务功能。

研究资料：仓库页面资料列出 Syncplay 的 Apache-2.0 和约 2.7k 星、CrowdRoom 的 AGPL-3.0、Melodee 的 MIT 和约 66 星及其 Party Mode、CrownJukebox 的 MIT 及其 kiosk/队列功能。2026-11-09 对 GitHub REST API 的只读核实触发匿名速率限制，因此具体星数和最近提交日期没有作为最新指标写入报告。没有复制第三方代码。

## 4. 发现的问题

### 已修复的高优先级问题

服务端自更新原先使用 `git reset --hard origin/main`，可能覆盖部署机工作区中的未提交或未跟踪文件；同时默认信任 `origin` 远程地址。该行为与“保留本地修改”和 GitHub-only 推送规则存在冲突。

### 本次修复

1. 自更新启动前检查工作区是否干净；存在任何修改或未跟踪文件时拒绝更新。
2. 自更新校验 `origin` 必须指向确认的 GitHub 仓库 `yuchen0x1/JukeboxRoom`，并且当前分支必须为 `main`。
3. 用 `git merge --ff-only origin/main` 替代强制重置，保留本地提交并拒绝分叉分支的隐式覆盖。
4. 更新接口改为等待异步安全检查完成后再返回结果，并在安全检查期间拒绝并发更新。
5. 增加 GitHub 远程地址和更新分支校验回归测试。

### 仍需关注的问题

- 已将静态手势识别依赖改为按需导入；`Room.js` 从约 363 KB 降至约 197 KB，手势识别逻辑单独生成约 165 KB chunk。3D 渲染仍在 Three.js chunk 中，进入 3D 背景时才需要加载。
- Vite 仍对约 900 KB 的 `three-vendor.js` 输出体积发出警告；后续可继续拆分 Three.js 子模块，并用浏览器网络面板确认实际加载行为。
- 首页现区分房间列表“加载失败”和“成功加载但为空”，并提供重试操作；骨架屏动画尊重 `prefers-reduced-motion`。
- 健康检查脚本依赖目标服务已启动；未启动服务时检查失败属于预期行为。
- Redis、多实例 Socket.IO、一致性和外部音乐源可用性仍取决于部署配置与上游服务。
- 当前自动更新仍属于高影响运维操作，只适合管理员在干净的 Git 工作副本中使用。
- Playwright UI 冒烟测试尝试在隔离 Vite 端口 `45700` 执行；开发服务器正常启动，但本机 Chromium 启动返回 `spawn UNKNOWN`，所以没有取得真实浏览器渲染/交互结果，临时脚本已移除。

### 下一阶段差距清单

| 优先级 | 缺口 | 解决的问题 | 建议模块 | 验收标准 |
|---|---|---|---|---|
| P1 | Three.js 主 chunk 约 900 KB | 首次进入 3D 视觉模式时下载较大 | `client/vite.config.ts`、`components/galaxy/`、`components/topography/` | 普通房间流程不请求 3D 依赖；启用不同视觉时按需下载且渲染回归通过 |
| P1 | 核心浏览器流程没有 E2E 证据 | 单元测试不能覆盖真实页面交互、WebSocket 和响应式布局 | `client`、`server`、Playwright workflow | 桌面/移动视口完成创建/加入房间、点歌、聊天和权限流程 |
| P1 | 外部音源与授权账号的契约/可用性依赖上游 | 上游服务变化会造成搜索或播放退化 | `sourceResolvers`、provider API tests | 用可控模拟服务回归协议，并记录真实上游抽测结果 |
| P2 | 多实例部署边界 | 内存状态和跨实例一致性限制水平扩展 | `roomManager`、Redis adapter、部署文档 | 至少两个实例的房间、Socket 和状态一致性集成验证 |
| P2 | 移动和 Windows 正式发布链缺少本轮验证 | 不能从 Web build 推断安装包行为 | `client/android`、`desktop`、release workflow | 签名 APK 和桌面安装包分别安装、升级、卸载回归 |
| P2 | 项目部分房间/管理 UI 复杂 | 大型页面增加维护和交互回归成本 | `Room.tsx`、`Admin.tsx` | 拆分前后接口无行为回退，页面级测试通过 |

## 5. 功能升级

本次没有新增未经验证的领域业务功能。改进了首页房间列表错误恢复体验，修复了自更新安全边界，并将视觉手势模块改为按需加载。原有房间、播放、聊天、音乐源、曲库、AutoDJ 和管理后台接口保持不变。

不建议当前加入插件系统、云端跨设备同步或另建全局搜索：现有核心产品路径仍应优先把房间体验、音源可靠性和部署/更新安全验证做扎实。

## 6. 架构升级

自更新模块现在先完成“工作区状态 + 远程仓库”前置检查，再进入单飞更新任务；更新过程使用快进合并，避免自动覆盖本地分支历史。服务端路由使用 `async` 等待安全检查。视觉设置通过轻量 bridge 延迟加载摄像头识别与 Three.js 手势模块。

## 7. UI/UX 升级

首页现在为连接失败展示独立错误状态和重新加载操作；加载骨架动画遵从减少动态效果偏好。其他重要页面未做全面视觉重构。现有 Web 客户端包括首页、房间页、TV 页、聊天、歌词、视觉模式、管理后台和移动端播放器；后续应优先完成浏览器实测、其他页面错误状态统一和管理后台信息架构审视。

## 8. 测试报告

已执行并通过：

- 服务端 Node 测试：96 项通过，0 失败。
- 客户端 Vitest：22 项通过，0 失败。
- `npm run build`：TypeScript 编译和 Vite 生产构建成功。
- 构建对比：`Room.js` 约 363 KB → 197 KB；手势识别独立为约 165 KB chunk；Three.js chunk 仍约 900 KB。
- `node --check server/selfUpdate.js`、`node --check server/index.js`：通过。
- `git diff --check`：通过。
- npm 官方 registry 生产依赖审计：根、服务端、客户端均为 0 漏洞。
- 隔离运行时验证：使用项目专属临时端口 `45873` 启动服务，`/api/health/live`、`/api/health/ready`、`/api/music/health`、`/api/update` 均返回 HTTP 200；测试完成后已停止本次启动的进程并清理临时数据。

未执行：真实外部音乐源播放、Redis 多实例、Android release 签名包和 Windows 安装包重新打包。Playwright 浏览器测试已尝试，但本机 Chromium 启动失败（`spawn UNKNOWN`）；需要修复浏览器运行环境或换用可用浏览器会话后再完成端到端交互验证。

## 9. 文件修改记录

新增：

- `PROJECT_AUDIT_REPORT.md`
- `client/src/lib/galaxyHandGestureBridge.ts`

修改：

- `README.md`
- `client/src/components/RoomAmbientBackground.tsx`
- `client/src/lib/roomVisualFxLive.ts`
- `client/src/pages/Home.tsx`
- `server/selfUpdate.js`
- `server/index.js`
- `server/update.test.js`

删除：无。

## 10. 最终质量评估

当前项目已有较完整的多人音乐房间功能、较好的服务端测试覆盖和安全防护。此次升级消除了自更新覆盖本地代码的高风险路径，并用测试验证了远程仓库约束。项目仍处于需要持续优化的开源应用阶段，不能把未执行的真实上游播放、移动端签名和多实例部署验证视为已完成。

### 维度评分（审计估算，不是自动质量指标）

| 维度 | 分数 | 依据 |
|---|---:|---|
| UI 设计 | 76 | Web 多端界面和视觉模式齐备；本轮修复了错误状态，缺少可用浏览器截图验证。 |
| UX 体验 | 75 | 房间、搜索、歌词、聊天和管理流程较完整；仍缺端到端流程实测。 |
| 功能完整度 | 78 | 多音源、房间、曲库、AutoDJ 和管理功能存在；外部音乐服务和部分发布链未验证。 |
| 架构合理性 | 70 | 服务端有领域模块拆分和独立路由；大型房间页面和共享状态仍有拆分空间。 |
| 代码质量 | 76 | 服务端 96 项、客户端 22 项测试通过；全量复杂度和重复代码未逐文件度量。 |
| 性能 | 70 | 视觉手势改为按需加载，Room chunk 减少约 166 KB；Three.js chunk 仍约 900 KB。 |
| 安全性 | 78 | 自更新覆盖风险已修复、生产依赖审计为零；不等于完整渗透测试或生产配置审核。 |
| 兼容性 | 68 | 有 Web、Electron、Capacitor 工程；未完成多浏览器、移动真机和桌面安装包矩阵测试。 |
| 可维护性 | 72 | 测试、部署和安全文档较完整；页面复杂度和跨端分支仍需持续梳理。 |
| 可扩展性 | 68 | 有音源适配、任务中心和管理 API；多实例一致性有限，插件系统不是当前优先项。 |

## 11. 后续建议

1. 将 `Room`、Three.js 和聊天模块继续按路由/功能动态拆分。
2. 增加浏览器端核心流程 E2E：创建房间、加入房间、搜索、入队、播放同步、聊天和管理员操作。
3. 为自更新增加“管理员明确确认”和维护窗口配置，生产环境默认关闭自动轮询更新。
4. 补充 Redis 多实例一致性测试、真实 Meting 上游契约测试和 Android release 签名流水线。
5. 继续维护 README、CHANGELOG、发布检查清单与实际 Release 资产的一致性。

## 12. Git 与远程状态

本轮后续已提交 `91c71bf` 并推送 `origin/main` 到 GitHub；没有创建 Tag 或发布 Release。GitHub 推送后提示 1 个 moderate Dependabot alert，本地官方 npm audit 仍为 0 vulnerabilities，需后续定位差异。
