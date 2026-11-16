# JukeboxRoom 项目现状审计

- 审计日期：2026-11-16（Asia/Shanghai）
- 审计基线：main / 6061c013c2b4d64c581daee18cbbc94e74dfad76
- 远程：GitHub origin → git@github.com:yuchen0x1/JukeboxRoom.git
- 工作区：审计开始时干净；本轮变更集中在安全、健康检查、限流和出站请求边界

## 1. 项目定位

JukeboxRoom 是自托管多人音乐房间和点歌系统。用户可以创建或加入房间、搜索多平台歌曲、共同维护队列、同步播放、聊天、投票、显示歌词，并由房主管理公告、权限、音质和房间规则。项目还提供：

- Windows Electron 桌面播放器；
- Capacitor Android 独立播放器和 iOS 远程站点壳；
- TV 大屏页面；
- 本地曲库扫描和 AutoDJ；
- 管理后台、任务中心、审计日志、共享歌单；
- 可选 Redis、Prometheus 指标和 GitHub 更新检查。

目标用户是希望自托管、多人协作点歌，或在局域网/家庭聚会中共享播放控制的个人、社群和小型场所。

## 2. 实际技术架构

| 层 | 当前实现 | 关键入口 |
|---|---|---|
| Web 客户端 | React 19、TypeScript、Vite、Zustand、React Router、Socket.IO Client | client/src/main.tsx、client/src/App.tsx |
| 房间 UI | 首页、房间页、TV 大屏、播放器、聊天、队列、房间设置、视觉模式 | client/src/pages/、client/src/components/ |
| 服务端 | Node.js 20+、Express 5、Socket.IO | server/index.js |
| 房间领域 | 队列、当前播放、投票、跳歌、聊天、成员权限、房间持久化 | server/roomManager.js |
| 认证和管理 | HttpOnly 身份 Cookie、JWT 管理账号、角色与审计 | server/auth/、server/admin/ |
| 数据 | 默认 JSON 文件和锁，可选 Redis 适配器 | server/db/、server/roomStorage.js、server/redisAdapter.js |
| 音乐源 | Meting、网易云、QQ、酷狗、汽水、咪咕等适配/解析路径 | server/sourceResolvers.js、server/miguMusic.js |
| 部署 | Docker Compose、PM2、Nginx、宝塔示例 | Dockerfile、docker-compose.yml、deploy/ |
| 桌面 | Electron + electron-builder + electron-updater | desktop/ |
| 移动 | Capacitor Android/iOS 工程 | client/android/、client/ios/ |
| 质量门禁 | Node Test、Vitest、TypeScript、Vite、包体检查、依赖审计 | package.json、.github/workflows/ |

## 3. 功能清单与真实边界

### 已有并由代码支撑的能力

- 房间创建、密码和无密码上锁、加入/退出、房主转移、管理员；
- 队列添加、批量移除、点赞、插队请求、投票跳歌、当前曲保护；
- 播放/暂停/seek、播放时钟、断线重连、房间状态广播；
- 多音源搜索、播放地址解析、歌词和封面代理、媒体源健康熔断；
- 文本/图片/表情聊天、回复、@、回应、聊天分页；
- 房间公告、歌曲请求规则、音质、FM、成员等级和静音；
- 本地曲库扫描、流式播放、AutoDJ、任务和审计 API；
- 管理后台的用户、房间、任务、审计、曲库和 AutoDJ 入口；
- Windows 打包和更新元数据、Android debug 构建、iOS 同步/编译工作流。

### 仍受外部条件限制的能力

- 外部音乐平台登录、VIP/高音质播放和歌词可用性取决于上游接口、账号、地区和服务条款；
- 未配置 Redis 时，易变房间状态以进程内存为主，重启会丢失未持久化状态；
- 多实例部署需要共享房间状态、Socket.IO adapter 和一致性设计，当前文档边界是单实例优先；
- Windows 签名安装、真实升级安装、Android release 签名和 iOS 真机流程需要对应凭据/设备；
- 自动更新代码检查了 GitHub、分支和工作区，但运行结果仍依赖部署者权限、网络和进程管理器。

## 4. 本轮发现并修复的问题

| 编号 | 问题 | 证据 | 处理 |
|---|---|---|---|
| AUD-001 | QQ 扫码登录成功后的 check_url 重定向会从上游响应读取任意 URL，关键词过滤不足以构成主机边界 | server/sourceResolvers.js 原先在重定向和 HTML JS 跳转处直接 fetch() | 增加 HTTPS + 固定 QQ 登录域名 allowlist，并通过 safeFetch 做 DNS/私网校验 |
| AUD-002 | 通用 provider JSON 请求没有统一经过出站 URL 校验 | fetchJson() 原先使用裸 fetch() | 改用 safeFetchFollow()，限制协议、DNS、私网地址、响应体大小和重定向 |
| AUD-003 | safeFetch 的 Node 响应适配层没有暴露 getSetCookie() | 受控登录流程无法从自定义响应读取多个 Set-Cookie | 补齐 getSetCookie()，并增加回归测试 |
| AUD-004 | 进程发生未捕获异常后只把 readiness 置为失败，业务路由仍可能继续接流量 | server/index.js 的 uncaughtException 处理 | 增加 API unhealthy gate：保留健康探针，业务请求返回 503 |
| AUD-005 | 限流 429 只有 JSON 字段，没有标准 Retry-After 响应头 | server/rateLimiter.js | 增加标准响应头，并保留原 JSON 字段兼容客户端 |
| AUD-006 | HTTPS 本地预览/可信反代在未设置 NODE_ENV=production 时身份 Cookie 可能没有 Secure | setIdentityCookieHeaders() 只检查生产环境 | 同时依据 Express req.secure 设置 Secure |
| AUD-007 | 健康接口不能直接显示版本和存储后端 | /api/health* 原响应仅有状态 | 增加当前版本和 memory/redis 信息 |
| AUD-008 | Prometheus 指标只有请求总数，无法观察耗时和状态码分布 | server/runtimeObservability.js | 增加累计耗时和按状态码计数，并加单元测试 |

## 5. 当前优势

- 房间状态和权限逻辑集中在服务端，客户端通过 Socket ACK 和广播同步；
- 已有较完整的输入清洗、SSRF 防护、媒体代理策略、限流、日志 request id、健康探针和测试隔离；
- Web、桌面、Android、iOS、Docker、PM2 和 Nginx 入口齐全；
- 队列、聊天、曲库、AutoDJ、任务和管理功能形成了可扩展的产品骨架；
- CI 已覆盖服务端隔离、客户端测试、构建、包体预算和生产依赖审计；
- 更新流程明确要求 GitHub main 和干净工作区，符合仓库推送规则。

## 6. 主要缺陷和技术债务

1. client/src/pages/Room.tsx 和部分桌面/移动组件仍然很大，修改成本和回归风险高。
2. 真实外部音源、授权账号、长时间播放、断网重连和多实例 Redis 还缺少稳定的契约/压力证据。
3. JSON 存储的跨进程读改写事务能力有限；共享歌单条目仍需要稳定的独立 entry ID。
4. API 客户端虽然已有 ApiError，但部分调用仍手写 if (!res.ok) throw new Error(...)，错误展示不一致。
5. 依赖审计和发布流程已有 CI 门禁，但签名、真实安装升级和设备矩阵不能由源码检查替代。
6. 指标和日志仍以进程级聚合为主，缺少上游 provider、房间动作和队列延迟的低基数观测。
7. 外部音乐平台接口属于非官方或易变链路，需要更强的 fixture 契约测试和故障降级说明。

## 7. 当前成熟度判断

| 维度 | 状态 | 依据 |
|---|---|---|
| 核心房间功能 | PASS（代码和既有回归覆盖） | roomManager、Socket 事件和服务端测试 |
| Web UI | PARTIAL | 功能入口完整，页面复杂度和设备矩阵仍需持续验证 |
| 安全边界 | PARTIAL → 本轮改善 | 新增 QQ 重定向 allowlist、出站请求统一校验、TLS Cookie 规则 |
| 稳定性 | PARTIAL | 健康闸门和重连存在；外部上游、长稳、多实例仍未完成 |
| 性能 | PARTIAL | 虚拟队列、压缩和视觉按需加载已有；缺少压力基准 |
| 工程化 | PASS（本地门禁） | CI、测试隔离、构建、包体和发布清单齐全 |
| 发布可信度 | PARTIAL | GitHub Release workflow 已有；签名/安装/升级需要真实凭据和设备证据 |

## 8. 后续重点

优先顺序应为：外部音源契约测试 → 多实例状态一致性 → 浏览器核心流程 CI → 共享歌单稳定条目 ID → 房间页拆分和统一错误反馈 → 真实桌面/Android 安装升级验收。详细 EV 清单见 UPGRADE_ROADMAP.md。
