# OpenMusic 六阶段升级路线图（2026-08-05 复核版）

> 复核基线：`openmusic` v1.0.0 当前代码 + 本次在线开源生态调研。
> 本文在旧报告 `COMMERCIAL-UPGRADE-REPORT.md` 与 `FUNCTION-GAP-AUDIT.md` 基础上复核更新。旧报告中“缺平台账号、后台、审计、任务”的结论已不完全准确：这些模块现在已有骨架，但质量、权限、持久化、前端闭环和运营能力仍远未达到生产级。
> 验证证据：服务端串行测试 `node --test --test-concurrency=1` 39/39 通过；前端构建通过；依赖审计见 `DEPENDENCY-SECURITY.md`。

---

## 0. 投资人视角摘要

OpenMusic 已经跑通“多人在线点歌、同步播放、歌词、聊天、3D 沉浸视觉、TV 大屏、移动壳”的核心体验闭环。这是一个可以继续验证的产品，但目前还不是一个可以融资或商业化发售的 SaaS/互联网平台。

| 评估项 | 结论 | 关键证据 |
|---|---|---|
| 产品验证 | 中上 | 房间、点歌规则、聊天、同步播放、视觉和 TV 模式功能密度高 |
| 技术架构 | 中等偏弱 | 房间权威状态在进程内存；Redis adapter 已写好但未启用 |
| 数据可靠性 | 弱 | 平台数据主要是同步 JSON 文件，无事务、迁移、原子写、备份 |
| 安全 | 弱 | 公开注册可提交角色，存在提权路径；JWT 默认密钥 |
| 商业化 | 弱 | README 声明非商业用途，音乐、歌词、封面、视觉素材授权不成立 |
| 可扩展性 | 弱 | 单实例承载全量房间广播，无法直接横向扩容 |
| 护城河 | 未建立 | 外部音源聚合易被复制且有版权风险；尚未形成开放生态、创作者网络或数据飞轮 |

投资级结论：在修复权限漏洞、数据层、授权合规和单实例架构之前，不建议进入融资或收费阶段。这四件事决定项目能不能从“高完成度开源玩具”变成“可运营互联网产品”。

---

## 阶段一：项目全面分析

### 1.1 技术栈

| 层 | 当前实现 | 说明 |
|---|---|---|
| 前端 | React 18、Vite 6、TypeScript、Tailwind、Zustand、Socket.IO Client、Three.js/R3F、Capacitor 7 | 视觉和实时互动能力强，但核心页面过大 |
| 后端 | Node ESM、Express 4、Socket.IO 4、Redis、Qiniu OSS、nanoid | 单进程托管 HTTP、WebSocket 和静态资源 |
| 实时 | Socket.IO + 进程内房间 Map | Redis adapter 依赖已存在，但 `server/index.js` 只 import 未调用 |
| 数据 | `server/db/store.js` JSON 文件 + 可选 Redis | 用户、任务、审计、AutoDJ、本地曲库、共享歌单均为 JSON |
| 客户端形态 | Web + Capacitor 远程 URL 壳 | Android/iOS 没有原生播放、后台音频和原生推送 |
| 测试 | Node `node:test` | 串行 39/39 通过；并行模式曾因 JSON store 并发写损坏数据 |

### 1.2 前后端架构

前端路由只有三条：`/`、`/room/:roomId`、`/tv/:roomId`。后端已经存在 `/api/auth`、`/api/admin`、`/api/library`、`/api/autodj`、`/api/playlists`、`/api/tasks`，但客户端没有登录、后台、曲库或 AutoDJ 页面，平台能力无法被普通用户和运营人员使用。

后端是典型的“单进程单体 + Socket.IO 内存状态”：

- 房间权威状态在 `server/roomManager.js` 的进程内 `Map`。
- `server/redisAdapter.js` 已实现 Socket.IO Redis adapter、房间租约和关闭函数，但 `initRedisAdapter()` 没有被调用。
- `server/autodj/index.js` 是独立 HTTP API 和 JSON 队列，`roomManager.js` 没有接入它。
- `server/admin/index.js` 的 `GET /api/admin/rooms` 硬编码返回 `{ rooms: [] }`，没有对接房间状态。
- `server/library/index.js` 用同步 `readdirSync/statSync` 扫描，按 `Artist - Title` 文件名猜元数据，没有 ffprobe、标签解析、目录监听和转码。

### 1.3 数据库设计

当前数据层分三层：

| 数据 | 存储 | 风险 |
|---|---|---|
| 房间实时状态 | 内存 `Map` | 重启丢失、无法多实例、无法运营查询 |
| 房间快照、收藏、热榜 | Redis | 只作为可选缓存，不是权威数据 |
| 用户、审计、任务、AutoDJ、曲库、共享歌单 | JSON 文件 | 无迁移、索引、事务、锁、原子写、备份 |

`server/db/store.js` 每次 `insert/update/remove` 都同步读整个 JSON 再写整个文件。并发写入会互相覆盖甚至产生非法 JSON。复核期间发现，服务端测试默认并行执行时曾写坏 `audit_log.json`，串行执行才稳定通过 39/39。这已经不只是测试问题，而是生产数据可靠性问题。

### 1.4 模块划分

服务端已经按功能拆出 `auth`、`admin`、`audit`、`autodj`、`library`、`playlists`、`tasks` 等目录，方向是对的。问题是入口层和房间层仍是巨型文件：

| 文件 | 大小 | 行数 |
|---|---:|---:|
| `client/src/pages/Room.tsx` | 115.4 KB | 2793 |
| `server/roomManager.js` | 98.0 KB | 2922 |
| `server/index.js` | 81.8 KB | 2474 |
| `client/src/index.css` | 75.7 KB | 3073 |
| `client/src/hooks/useSocket.ts` | 35.8 KB | 1221 |

巨型文件本身不是罪，但它与“无领域事件、无协议契约、无版本化 API”叠加后，后续扩展播放引擎、聊天审核、多实例、插件体系都会变成高风险改动。

### 1.5 代码质量

优点：

- TypeScript 构建通过，说明前端类型基本闭合。
- 播放同步已有 `playbackSync`、`playbackSchedule`、`syncStateMachine`、`driftController` 等分层，说明作者在重连和同步上投入过。
- 服务端有媒体代理、本地流、AutoDJ、共享歌单、任务、审计等单元测试。
- 已有错误边界、健康检查、metrics 开关、有界缓存和优雅停机。

不足：

- 无 E2E 测试，无 OpenAPI 契约测试，无并发/负载测试。
- JSON store 是生产级事故源，测试并发即可触发。
- `ChatPanel` 同时被动态导入和静态引用，Vite 提示它没有真正拆成独立 chunk。
- 平台 API 没有前后端闭环，很多“已完成”模块实际上只是后端骨架。

### 1.6 性能瓶颈

1. 单实例内存权威状态：所有房间状态只存在于一个 Node 进程，无法扩容，也无法容忍实例故障。
2. 全量房间状态广播：房间状态广播随成员数线性膨胀；超过一定规模后消息量会失控。
3. JSON store 同步读写：所有平台操作都阻塞事件循环，且并发不安全。
4. 大包：Room 主包约 421.47 KB，gzip 125.74 KB；`three-vendor` 约 843.45 KB，gzip 225.84 KB。Three 已懒加载，但 Room 页面仍承担过多职责。
5. 同步本地曲库扫描：大目录会阻塞 HTTP 请求，无增量索引和搜索服务。
6. 无 CDN、无图片/媒体缓存策略闭环、无分布式限流。

### 1.7 安全风险

| 级别 | 风险 | 证据/位置 |
|---|---|---|
| P0 | 公开注册可提交 `role`，`VALID_ROLES` 包含 `super_admin/admin/moderator/user` | `server/auth/index.js` `/api/auth/register` |
| P0 | JSON 文件并发写会损坏数据，无原子写、锁、备份、迁移 | `server/db/store.js` |
| P0 | 管理后台房间接口返回空数组，运营无法关闭/治理异常房间 | `server/admin/index.js` |
| P1 | JWT 默认密钥 `dev-secret-change-in-production`，无 `iss/aud/jti`，无会话撤销、多设备管理、登录失败锁定 | `server/auth/index.js` |
| P1 | 房间权威状态在内存，单实例故障即丢房，无法横向扩容 | `server/roomManager.js` |
| P1 | 本地曲库路径校验有防护，但无转码沙箱、无内容哈希、无权限细分 | `server/library/stream.js` |
| P1 | 依赖仍有一个高等级例外：react-router 7.18.2 的 RSC CSRF advisory；当前 SPA 场景不可利用，但需跟踪修复版 | `docs/DEPENDENCY-SECURITY.md` |
| P1 | 外部音源、歌词、封面聚合链路存在版权和内容安全风险 | README 依赖说明 |
| P2 | 无内容审核、举报闭环、未成年人保护、隐私数据地图 | 全项目 |

### 1.8 可扩展性

当前扩展性限制不在“缺文件”，而在“权威状态与边界”：

- 房间播放、锁、AutoDJ、限流都是进程内存级，横向扩展需要先解决状态归属。
- 平台数据没有 schema 和迁移，插件、多租户、企业集成无从谈起。
- API 没有版本和 Key，第三方无法安全接入。
- 没有 Webhook、事件订阅、任务重试和死信队列，自动化只能靠内部函数调用。

### 1.9 问题总结

OpenMusic 的核心问题不是“功能不够多”，而是“功能边界和数据基础不够硬”。它已经有很强的前端产品力，但缺少账号、权限、后台、数据、授权、运营和规模化这七层地基。

---

## 阶段二：全球开源生态调研

本次调研覆盖 GitHub、GitLab、SourceForge 传统音乐服务器、CNCF 可观测/事件生态、Hugging Face 音频 AI 生态，以及国内插件化音乐播放器。

### 2.1 重点开源项目

| 项目 | 定位 | 值得借鉴 | 可复用建议 |
|---|---|---|---|
| [Navidrome](https://www.navidrome.org/) | 轻量个人音乐服务器，Subsonic/OpenSubsonic 兼容 | 大曲库扫描、元数据、转码、多用户、智能歌单、分享链接、Scrobble、插件 | 可作为本地曲库/流媒体 sidecar；直接抄代码需注意 GPL |
| [Jellyfin](https://jellyfin.org/) | 自由媒体服务器，含音乐、电视、电影、照片、SyncPlay | 用户/权限、FFmpeg 转码、插件体系、多端客户端、SyncPlay 同步播放 | 借鉴 SyncPlay 同步房间和插件边界；代码为 GPL，谨慎内嵌 |
| [Funkwhale](https://docs.funkwhale.audio/) | 去中心化音频发布与共享平台，ActivityPub 联邦 | 频道、订阅、举报、审核、用户插件、Subsonic 访问、联邦化 | 借鉴联邦与内容治理设计；AGPL，不能闭源内嵌 |
| [AzuraCast](https://www.azuracast.com/docs/) | 自托管网络电台管理套件 | AutoDJ、时间排程、播放列表、Web DJ、听众点歌、Webhook、公开页面、API | 直接对标 AutoDJ 和点歌请求闭环；代码为 AGPL，参考而非复制 |
| [Mopidy](https://mopidy.com/) + [Mopidy-Party](https://pypi.org/project/Mopidy-Party/) | 可扩展音乐服务器 + 派对协作界面 | 音源 Provider 抽象、投票切歌、每人队列上限、最大队列、源优先级 | 协作控制规则可复用；Apache-2.0，适合借鉴或运行 sidecar |
| [Ampache](https://ampache.org/) | Web 音频/视频流媒体与文件管理 | 多用户、目录同步、开放 API、客户端生态 | 借鉴 API 兼容思路；AGPL，参考为主 |
| [Koel](https://koel.dev/) | 现代个人音乐流媒体 | 现代 UI、多用户、智能歌单、跨设备播放同步、Subsonic | MIT，最接近“可借鉴且许可友好”的 Web 音乐产品 |
| [Lavalink](https://lavalink.dev/) | 独立音频节点，面向机器人/实时播放 | REST API、事件系统、Plugin 加载器、Prometheus metrics、负载统计 | MIT，可借鉴实时音频节点和插件加载机制 |
| [Snapcast](https://github.com/badaix/snapcast) | 多房间低延迟同步播放 | 多端到端音频同步、延迟校准、多输出设备 | 适合作为智能音箱/多房间广播 sidecar；GPL |
| [Lyrion Music Server](https://lyrion.org/) | 多房间音乐服务器生态 | 多播放器同步、插件生态、CLI/JSON-RPC、Alarm、Randomplay | 借鉴多房间控制模型和插件生态；自托管 sidecar |
| [Music Assistant](https://www.music-assistant.io/) | 聚合流媒体/本地音乐并同步到多组音箱 | 多 Provider 抽象、Player Provider、Player Group、Home Assistant 集成 | Apache-2.0，借鉴 Provider 注册和 Player Group |
| [UltraStar Deluxe](https://github.com/UltraStar-Deluxe/USDX) / [Performous](https://github.com/performous/performous) | 卡拉 OK/唱歌游戏 | 歌词格式、评分、音高、多人唱歌玩法 | 如果定位转向“多人歌厅/K 歌”，可借鉴歌词与评分规则；GPL |
| [MusicFree](https://github.com/maotoumao/MusicFree) | 国内插件化音乐播放器 | 插件定义搜索/播放/歌词/歌单，播放器本体不内置音源 | 借鉴插件架构；AGPL，且第三方插件版权风险需隔离 |

### 2.2 社区与基础设施生态

| 生态 | 可借鉴能力 | 对应开源组件 |
|---|---|---|
| CNCF | 可观测、指标、追踪、日志、事件流 | OpenTelemetry、Prometheus、Grafana、Loki、NATS |
| Apache | 大数据管道、任务编排、BI | Apache Kafka、Apache Airflow、Apache Superset |
| Hugging Face | 音频、文本、向量和生成模型 | faster-whisper、sentence-transformers、Demucs、ONNX Runtime、Qdrant/pgvector |
| 国内社区 | 音源插件化、Meting API 聚合 | MusicFree、Meting-API；注意版权边界 |
| 开源协议生态 | OpenSubsonic、ActivityPub、OAuth/OIDC | OpenSubsonic、ActivityPub、Keycloak/Authelia |

### 2.3 Gitee 与 SourceForge 补充说明

Gitee 上没有发现比 GitHub/GitLab 原生仓库更新的核心架构创新，主要是国内镜像和文档加速渠道；真正值得参考的国内项目是 MusicFree 的插件化播放器架构和 Meting-API 的音源聚合思路。SourceForge 更适合寻找传统、成熟、长期维护的项目（例如老牌音频编解码和播放工具），对实时房间产品的架构参考价值有限。因此本报告将架构依据放在 GitHub/GitLab 官方仓库、CNCF、Apache 和 Hugging Face 生态上。

### 2.4 对我们的核心启发

1. 几乎所有成熟项目都先解决“媒体来源、元数据、转码、多用户、开放 API”，OpenMusic 目前外部音源强但自有曲库弱。
2. 成熟实时产品不会把“房间全部状态”作为单一广播对象，而是拆成播放、成员、聊天等独立通道，并提供 snapshot/patch/resync。
3. AutoDJ 不是“随机 FM”，而是排程、权重、避重、请求池、直播 DJ、Webhook 的组合。
4. 插件体系是增长杠杆：Lavalink 的插件加载器、Mopidy 的 backend、MusicFree 的音源插件、Jellyfin 的插件目录都值得抽象。
5. 多房间同步不是“Web 端同步播放”，而是多播放器、多区域、不同延迟下的设备级同步，Snapcast、LMS、Music Assistant 提供成熟参考。

---

## 阶段三：竞品对比分析

评分说明：1 最弱，5 最强；AI 能力按 2026 年主流开源项目基线评估，不代表绝对分。

| 项目 | 功能完整度 | 用户体验 | 性能 | 安全 | AI 能力 | 自动化能力 | 扩展能力 | 商业化潜力 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| OpenMusic 当前 | 3.0 | 3.5 | 2.0 | 2.0 | 1.5 | 2.5 | 2.0 | 2.0 |
| Navidrome | 4.0 | 4.0 | 4.5 | 3.5 | 1.5 | 3.5 | 4.5 | 3.0 |
| Jellyfin | 4.5 | 4.0 | 4.0 | 3.5 | 2.0 | 4.0 | 4.5 | 3.5 |
| Funkwhale | 4.0 | 3.5 | 3.0 | 3.5 | 1.5 | 3.5 | 4.5 | 2.5 |
| AzuraCast | 4.5 | 3.5 | 3.5 | 3.0 | 2.0 | 5.0 | 4.0 | 4.0 |
| Mopidy + Party | 3.5 | 3.0 | 4.0 | 3.0 | 1.0 | 3.0 | 4.5 | 2.0 |
| Koel | 3.5 | 4.0 | 3.5 | 3.0 | 1.0 | 3.0 | 3.0 | 3.0 |
| Lavalink | 3.0 | 2.0 | 4.5 | 3.5 | 1.0 | 4.0 | 5.0 | 3.0 |
| Snapcast | 2.5 | 2.5 | 4.5 | 3.0 | 0.5 | 3.5 | 3.5 | 2.0 |
| Lyrion Music Server | 4.0 | 3.0 | 4.0 | 3.5 | 1.0 | 4.0 | 5.0 | 3.0 |
| Music Assistant | 4.0 | 3.5 | 4.0 | 3.5 | 1.5 | 4.0 | 4.5 | 3.0 |

### 3.1 功能能力矩阵

| 能力 | OpenMusic | Navidrome | Jellyfin | AzuraCast | Funkwhale | Koel | Mopidy-Party | 结论 |
|---|---|---|---|---|---|---|---|---|
| 多人在线房间 | 强 | 弱 | SyncPlay 有 | 听众请求有 | 弱 | 弱 | 强 | OpenMusic 差异化强 |
| 本地曲库/转码 | 骨架 | 强 | 强 | 强 | 强 | 强 | 弱 | 必须补齐 |
| AutoDJ/排程 | 骨架 | 弱 | 弱 | 强 | 弱 | 弱 | 弱 | 必须补齐 |
| 多用户/RBAC | 骨架且有漏洞 | 强 | 强 | 强 | 强 | 强 | 弱 | 必须重建 |
| 管理后台 | 骨架 | 中 | 强 | 强 | 强 | 中 | 弱 | 必须补齐 |
| 开放 API | 弱 | Subsonic | 强 | 强 | 强 | Subsonic | 弱 | 必须补齐 |
| 插件体系 | 无 | 有 | 有 | 有 | 有 | 弱 | 有 | 差异化机会 |
| 联邦化 | 无 | 无 | 无 | 无 | 有 | 无 | 无 | 可延期 |
| 多房间设备同步 | TV 只读 | 无 | 无 | 弱 | 无 | 弱 | 弱 | 可做成壁垒 |
| 内容审核/举报 | 无 | 弱 | 中 | 中 | 强 | 弱 | 弱 | 商业必需 |

### 3.2 差距结论

OpenMusic 最大的相对优势是“社交实时房间”而非“音乐服务器”。因此不要照抄 Navidrome/Jellyfin 的全部功能，而应把它们的曲库、元数据、API、插件、AutoDJ 能力嫁接到实时社交场景上。这个组合没有现成开源项目完全覆盖，是产品机会，也是工程复杂度来源。

---

## 阶段四：升级方案

### 4.1 V1.1：小版本升级，快速提升用户体验与生产可靠性

目标：3 个月内把 P0 风险清零，让现有用户能注册、管理、运营，并且不因文件损坏或权限漏洞丢数据/被提权。

| 功能 | 为什么需要 | 用户价值 | 技术实现方案 | 难度 | 优先级 |
|---|---|---|---|---|---|
| 登录注册与权限修复 | 公开注册可传角色，存在提权路径 | 账号安全，管理员可运营 | 服务端强制角色，只有 super_admin 可建管理员；登录/注册页；JWT 密钥强制配置；会话版本号；登录失败锁定 | 中 | P0 |
| 数据层加固 | JSON store 并发写会损坏数据，无迁移和备份 | 不丢用户、歌单、审计和任务 | 关键数据迁移到 PostgreSQL（Drizzle/Prisma），启用 WAL、迁移、备份；若预算受限先用 SQLite 原子 WAL，再做 Postgres | 高 | P0 |
| 管理后台闭环 | `/api/admin/rooms` 返回空数组，运营无控制面 | 平台可治理异常房间、封号、审计 | 后端对接 roomManager；前端 `/admin` 页面；用户/房间/审计/任务/配置管理 | 中 | P0 |
| 合规与内容风控 | README 声明非商业用途，授权不成立 | 可合法运营、可面向家庭和企业 | 内容来源 allowlist、版权登记、举报/下架、敏感内容审核、日志和审计；法律授权先于收费 | 高 | P0 |
| AutoDJ 接入房间播放 | 独立 API 没有连进房间，功能形同虚设 | 空房自动播放、运营歌单、时段编排 | roomManager 在播放结束/队列空时调用 AutoDJ；按房间配置权重、避重、请求池；事件幂等 | 中 | P1 |
| 本地曲库生产化 | 目前只能按文件名猜元数据，无法大规模使用 | 自有音乐、公司/家庭音乐库可点播 | `music-metadata` 或 ffprobe 解析标签；目录 watcher；FFmpeg 转码；缓存缩略图和封面；保留 Range/ETag | 高 | P1 |
| 实时架构启用 Redis adapter | `initRedisAdapter()` 已实现但未调用 | 房间不再绑定单实例，可灰度扩容 | 启动时初始化 Socket.IO Redis adapter；房间 lease；事件版本；先做 snapshot/patch/resync 的兼容层 | 高 | P1 |
| 房间与页面拆包 | `Room.tsx` 2793 行，主包仍大 | 移动端更快，开发者更易维护 | 拆搜索、队列、聊天、设置、视觉组件；统一 Dialog/Toast；Vite chunk 重新验证 | 中 | P1 |
| PWA 与移动体验 | 目前只是远程 URL 壳 | 可安装、离线提示、弱网恢复 | `vite-plugin-pwa`、Workbox、manifest、iOS/Android 安装提示；后台音频和锁屏控制放 V2 | 中 | P1 |
| 可观测与备份 | 无告警和恢复演练 | 故障可发现、可恢复 | OpenTelemetry/Prometheus 指标、结构化日志、Sentry 或自托管错误收集、自动备份、恢复演练 | 中 | P1 |

### 4.2 V2.0：大版本升级，架构从单体实时应用升级为可扩展平台

目标：6 个月内具备支撑万人级实时房间、企业多租户、开放 API、插件生态的基础平台。

| 功能 | 为什么需要 | 用户价值 | 技术实现方案 | 难度 | 优先级 |
|---|---|---|---|---|---|
| PostgreSQL 平台库 | 所有平台数据需要事务、索引、迁移、审计 | 数据可靠、查询快、可运营 | 用户/组织/房间元数据/歌单/任务/订阅/审计落 PostgreSQL；Redis 只做缓存和实时状态 | 高 | P0 |
| 领域服务与事件总线 | 房间、播放、聊天、内容、任务耦合在巨型文件 | 新功能可独立演进 | 将 `roomManager` 拆为 room/playback/chat/content 服务；Redis Streams 或 NATS 事件总线；Outbox + 幂等消费者 | 高 | P1 |
| 实时协议升级 | 全量房间广播线性膨胀 | 大房不卡、弱网可恢复 | snapshot/patch/resync；播放、聊天、成员分 topic；服务端分片广播；客户端状态机已有基础，继续扩展 | 高 | P1 |
| 开放 API 与 Webhook | 目前内部路由无契约、无 Key | 第三方、企业、硬件可接入 | OpenAPI 文档；API Key 生命周期；Webhook 签名/重试/死信；公开 SDK；OpenSubsonic 兼容可作低成本生态入口 | 中 | P1 |
| 插件/Provider 体系 | 音源、歌词、视觉、存储都硬编码 | 生态可扩展，降低单一来源风险 | Provider 接口：source/lyrics/storage/notify/player；插件沙箱与权限声明；参考 Mopidy、Lavalink、MusicFree 架构 | 高 | P1 |
| AI Gateway | 后续所有 AI 能力需要一个安全边界 | 推荐、审核、歌词、语音统一可管 | 统一 LLM/embedding/audio 模型路由、超时、预算、降级、审计；接 OpenAI/Hugging Face/自托管模型均可 | 中 | P1 |
| 推荐与语义搜索 | 现在只有热榜/随机 | 找歌更快、房间更会“放歌” | 向量检索（pgvector/Qdrant）+ 行为特征 + 规则冷启动；先用热门、相似、同房间共创训练数据 | 高 | P2 |
| 多租户与组织 | 企业/学校/家庭需要独立空间 | 组织房间、成员、账单、管理员 | tenant 模型；角色继承；邀请链接；组织级曲库；数据隔离 | 高 | P1 |
| 企业认证 | 企业用户需要 SSO | 登录零摩擦、合规 | OIDC/OAuth2；支持 Keycloak、Authelia、飞书/钉钉/企业微信接入；保留游客房间模式 | 中 | P2 |
| 数据平台 | 无漏斗、留存、内容健康度数据 | 运营知道该做什么 | 事件埋点 -> Kafka/ClickHouse -> Superset；定义 DAU/房间时长/点歌转化/流失/举报率 | 高 | P1 |
| DevOps 与高可用 | 无 K8s、Terraform、灰度、灾备 | 故障恢复和发布更稳 | Docker Compose 起步；K8s/Helm/Terraform；多副本；蓝绿/金丝雀；RPO/RTO 目标；演练 | 高 | P1 |

### 4.3 V3.0：战略升级，成为行业领先产品

目标：12 个月内从“实时听歌房间”升级为“内容、创作者、设备、AI 和开放生态共同驱动的社交音乐平台”。

| 功能 | 为什么需要 | 用户价值 | 技术实现方案 | 难度 | 优先级 |
|---|---|---|---|---|---|
| 版权与创作者生态 | 没有合法内容就没有可持续商业化 | 创作者可上传/分成，用户可合法收听 | 授权曲库、创作者频道、上传审核、版税分账、内容指纹、DMCA/下架流程 | 高 | P0 |
| 社交身份与成长体系 | 当前匿名昵称无法沉淀关系链 | 粉丝、关注、等级、成就、常驻房间 | 用户主页、关注、房间/歌单收藏、等级徽章、创作者模式 | 中 | P1 |
| 多设备音乐同步 | Web 同步不等于客厅/车载/音箱同步 | 手机上点歌，客厅音响播放 | 对接 Snapcast、LMS、Music Assistant、AirPlay/Chromecast；Player Group 抽象 | 高 | P1 |
| AI 原生点歌体验 | 搜索框不适合口语化点歌 | “放点适合聚会的歌”直接生成房间歌单 | 自然语言意图解析、语义检索、情绪/场景模型、AI DJ 解说、自动过渡 | 高 | P1 |
| AI 歌词与内容理解 | 第三方歌词依赖版权风险高 | 自建歌词时间轴、双语、K 歌评分 | faster-whisper + 对齐模型；人工/创作者校对；Demucs 人声分离；内容审核 | 高 | P2 |
| 插件市场与第三方房间 | 平台增长依赖生态 | 第三方开发者可做音源、视觉、游戏、设备插件 | 插件仓库、签名、权限、评分、分成；参考 Jellyfin/Lavalink/MusicFree | 高 | P1 |
| 嵌入与开放场景 | 企业年会、直播间、教育场景需要嵌入 | 任意网页可嵌入房间播放器 | iframe/Web Component SDK、公开 embed API、白标主题 | 中 | P1 |
| 联邦与开放网络 | 单一平台信任成本高 | 自托管实例可互通房间/歌单 | 借鉴 ActivityPub 和 Subsonic/OpenSubsonic；联邦只开放歌单/用户/房间元数据，不开放版权流 | 高 | P2 |
| 商业化与订阅 | 需要可持续收入 | 免费房 + Pro 权益 + 企业版 | Stripe/Lemon Squeezy；订阅、权益、发票、企业合同；合规计费 | 中 | P1 |
| 全球国际化 | 中国以外的音乐房市场存在机会 | 多语言、多币种、本地音乐源 | i18n、时区、多币种、CDN 多区域、GDPR/CCPA 合规、本地内容合作 | 中 | P1 |

---

## 阶段五：寻找缺失能力

### 5.1 AI 智能能力

当前几乎没有实质性 AI。最应该先做的是：

- 语义点歌：用户说“放点轻松的”，系统生成候选队列。
- 场景 AutoDJ：根据房间人数、时长、情绪和禁播规则动态排歌。
- 内容审核：文本聊天、图片、歌词、房间名自动审核。
- 歌词与元数据增强：ASR 对齐歌词、双语字幕、音频指纹识别。
- 推荐：同房间、同人群、同场景的协同过滤 + 向量召回。

可复用：faster-whisper、sentence-transformers、Qdrant/pgvector、ONNX Runtime、Hugging Face 模型。

### 5.2 自动化能力

AutoDJ 有骨架但未接入播放；任务模块有骨架但缺少定时调度、重试、死信和 Webhook。应建立：

- 规则引擎：房间空置、点歌高峰、节日、运营歌单自动触发。
- Webhook：歌曲开始/结束、房间异常、举报、任务完成通知外部系统。
- 内容流程：举报 -> 审核 -> 下架 -> 用户通知 -> 审计全程自动化。

### 5.3 插件生态

现状是零。建议先定义 5 类插件接口：音源、歌词、封面/视觉、存储、通知。第三方插件必须运行在沙箱或子进程，并有权限声明和版本签名。

参考：Mopidy backend、Lavalink plugin、MusicFree plugin、Jellyfin plugin。

### 5.4 API 开放能力

当前是内部 REST + Socket 协议，无版本、无文档、无 Key、无 Webhook。V2.0 应提供：

- OpenAPI 3 契约。
- API Key 与 OAuth2/OIDC。
- Webhook 签名、重试、幂等。
- 官方 SDK（TypeScript 优先）。
- 可选 OpenSubsonic 兼容，直接接入成熟音乐客户端生态。

### 5.5 多端支持

现状是 Capacitor 远程 URL 壳，缺少原生能力。必须补齐：

- 后台播放、锁屏控制、媒体通知。
- 网络变化恢复、弱网降级。
- Android TV / 大屏遥控。
- Chromecast/AirPlay 投屏。
- 智能音箱多房间播放。

### 5.6 国际化

当前为中文单语种。V2.0 至少需要：

- i18n 文案层。
- 时区、日期、货币。
- 本地音乐源接入。
- GDPR/CCPA 隐私、儿童保护、内容分级。

### 5.7 权限系统

当前平台 RBAC 有 P0 漏洞，房间权限只覆盖房主/管理员。长期需要：

- 平台级：super_admin、admin、moderator、support、user。
- 组织级：owner、admin、member、guest。
- 资源级：房间、歌单、曲库、内容、设备、报表。
- 操作级：点歌、踢人、禁播、审核、发布、退款。
- 审计：谁在何时对哪个资源做了什么，完整留痕。

### 5.8 数据分析

没有业务数据仓库，无法回答“用户为什么留下来”。至少需要：

- 注册/登录转化。
- 房间创建、进入、停留时长。
- 点歌、切歌、踩歌、聊天、收藏。
- 歌曲来源质量、失败率、版权来源。
- DAU/MAU、留存、病毒系数、LTV/CAC。

### 5.9 企业级能力

后续企业客户会要求：SSO、组织隔离、数据导出、审计日志、SLA、备份恢复、私有部署。这些不应在 V1.1 做全，但数据模型必须提前预留 tenant 和 audit 字段。

### 5.10 DevOps 能力

已有 GitHub Actions、APK/IPA 打包、依赖审计和健康检查。还缺：

- 生产环境 Docker Compose/Helm/Terraform。
- Prometheus/Grafana/Loki 告警。
- 日志统一格式和追踪 ID。
- 灰度发布、回滚、数据库迁移演练。
- 备份恢复、混沌测试。

### 5.11 安全体系

必须建立安全基线：

- 禁止公开注册指定角色。
- 强制生产密钥，禁止默认 JWT secret。
- 登录限流、验证码、密码策略、会话撤销。
- CSRF/XSS/SSRF/文件上传/媒体代理专项测试。
- 内容审核和举报闭环。
- 隐私数据地图、GDPR/个保法合规。
- 第三方音源、歌词、封面授权链。

### 5.12 全球领先还缺什么

从“全球领先产品”角度看，真正缺的是三件事：

1. 合法内容资产：没有授权内容，任何商业模式都会被法律风险打断。
2. 开放生态：没有 API、插件和创作者生态，产品只是另一个可被复制的网站。
3. 设备级实时体验：只有浏览器同步播放，不能成为“客厅/音箱/车载”场景的默认选择。

---

## 阶段六：未来 12 个月产品路线规划

### 6.1 0-3 个月：止血与产品闭环

| 项目 | 目标 | 验收标准 |
|---|---|---|
| 权限与账号 | 修复提权漏洞，完成登录/注册/个人页 | 公开注册不能指定角色；管理员可禁用用户；无默认密钥 |
| 数据层 | 关键数据迁到 PostgreSQL 或 SQLite WAL | 并发测试不再损坏数据；有备份和恢复演练 |
| 管理后台 | 房间/用户/审计/任务/歌单可管理 | 运营可在后台关闭房间、封号、查看审计 |
| AutoDJ | 接入房间播放 | 空房/低峰可自动续播，规则可配置 |
| 合规 | 明确内容授权边界 | 形成可执行的授权清单、举报/下架流程 |
| 实时稳定性 | 启用 Redis adapter 与房间 lease | 两台实例可灰度运行同一房间 |
| 前端体验 | PWA、拆包、移动端优化 | 移动端首屏和房间加载显著改善 |

### 6.2 3-6 个月：平台化

- PostgreSQL 平台库 + 领域事件总线。
- 房间/播放/聊天/内容服务拆分。
- 实时协议 snapshot/patch/resync 灰度。
- 开放 API、API Key、Webhook、OpenAPI 文档。
- 插件 Provider 框架。
- AI Gateway 与第一版推荐/AutoDJ。
- 多租户与组织版基础。
- 数据平台 MVP（埋点、漏斗、留存）。
- DevOps/K8s/高可用基础。

### 6.3 6-12 个月：生态与商业化

- 版权与创作者生态、创作者频道、分成。
- 插件市场、嵌入 SDK、白标房间。
- 多设备播放：Chromecast/AirPlay、Snapcast/LMS/Music Assistant。
- 国际化、多币种、隐私合规。
- 企业版：SSO、SLA、私有部署、审计。
- AI 原生点歌、AI DJ、歌词对齐、内容审核。
- 联邦化试点（歌单/用户/房间元数据，不开放版权流）。

### 6.4 必须做、可延期、不要做

必须做：

- 权限提权修复、生产数据层、备份恢复。
- 合法内容授权与内容风控。
- 管理后台和运营闭环。
- AutoDJ 接入真实播放。
- 启用 Redis adapter，先解决单实例瓶颈。
- 开放 API、API Key、Webhook。
- 可观测、告警、并发/恢复测试。

可延期：

- 联邦化。
- 完整原生 App。
- 复杂 AI 创作。
- 企业 SSO/合规套件。
- 插件市场。
- K 歌评分。
- 智能音箱多房间同步。

不要做：

- 在数据层和房间状态稳定前拆微服务。
- 基于未授权第三方音源/歌词/封面直接收费。
- 把“AI 语音点歌”当 V1.1 核心，先做数据、权限和播放稳定性。
- 做又一个通用音乐播放器，放弃实时社交房间这个差异化定位。
- 追逐区块链、元宇宙、虚拟房间等非核心叙事。

---

## 附录 A：可直接复用的开源组件

| 组件/项目 | 用途 | 许可与注意 |
|---|---|---|
| `@socket.io/redis-adapter` | 已安装，启用多实例广播 | 可直接启用，仍需房间 lease 和事件版本 |
| [BullMQ](https://github.com/taskforcesh/bullmq) | 任务队列、重试、延迟、Webhook 工作流 | 需要 Redis，适合 V2.0 |
| [Prisma](https://github.com/prisma/prisma) / [Drizzle](https://github.com/drizzle-team/drizzle-orm) | PostgreSQL ORM 与迁移 | 许可友好，可商用 |
| [music-metadata](https://github.com/Borewit/music-metadata) | 音频标签解析 | MIT，可内嵌 |
| [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) + FFmpeg | 转码、音频处理、歌词对齐 | 注意 FFmpeg 构建许可，部署前核验 |
| [i18next](https://github.com/i18next/i18next) / react-i18next | 国际化 | MIT |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | PWA 与 Workbox | MIT |
| [Keycloak](https://github.com/keycloak/keycloak) | 企业 SSO/OIDC | Apache-2.0，可作为独立服务 |
| [OpenTelemetry](https://opentelemetry.io/) + Prometheus + Grafana | 指标、追踪、告警 | Apache-2.0 |
| [Qdrant](https://github.com/qdrant/qdrant) / pgvector | 语义搜索与推荐向量库 | 参考各自许可 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 歌词/字幕 ASR | MIT，需自建版权校对 |
| [Snapcast](https://github.com/badaix/snapcast) | 多房间低延迟同步播放 | GPL，建议 sidecar 而不是内嵌 |
| [Music Assistant](https://github.com/music-assistant/music-assistant) | Provider/Player Group 架构参考 | Apache-2.0 |
| [Lavalink](https://github.com/lavalink-devs/Lavalink) | 音频节点、插件加载、metrics | MIT，适合借鉴插件加载 |
| [Koel](https://github.com/koel/koel) | Web 音乐播放器架构参考 | MIT，最友好的代码参考之一 |
| [Mopidy](https://github.com/mopidy/mopidy) + Mopidy-Party | 音源 backend 与协作控制参考 | Apache-2.0 |
| [Navidrome](https://github.com/deluan/navidrome) | Subsonic/OpenSubsonic 与曲库架构参考 | GPL，参考为主 |
| [Funkwhale](https://gitlab.com/funkwhale/funkwhale) | 联邦、审核、频道、插件参考 | AGPL，参考为主 |
| [AzuraCast](https://github.com/AzuraCast/AzuraCast) | AutoDJ、排程、Webhook、听众点歌参考 | AGPL，参考为主 |
| [MusicFree](https://github.com/maotoumao/MusicFree) | 插件化音源/歌词/歌单架构参考 | AGPL，第三方内容版权需隔离 |

## 附录 B：本次验证记录

- `git status`：用户已有 `.gitignore`、`client/tsconfig.tsbuildinfo`、`server/playlists/` 改动，未做回退。
- `node --test --test-concurrency=1`：39/39 通过。
- 前端构建：通过；Room 主包约 421.47 KB（gzip 125.74 KB），`three-vendor` 约 843.45 KB（gzip 225.84 KB）。
- 依赖：server 生产依赖审计 0 漏洞；client 保留 react-router 7.18.2 已知例外，见 `DEPENDENCY-SECURITY.md`。
- 在线调研来源：Navidrome、Jellyfin、Funkwhale、AzuraCast、Mopidy、Ampache、Koel、Lavalink、Snapcast、Lyrion、Music Assistant、MusicFree 等官方站点/仓库。

## 附录 C：容量与目标

V1.1 目标：单实例 500 并发房间、5,000 长连接、普通房 200 活跃成员；RPO 小于 5 分钟，RTO 小于 30 分钟。

V2.0 目标：双/多实例 5,000 并发房间、50,000 长连接；房间播放/聊天/成员分通道；RPO 小于 1 分钟。

V3.0 目标：全球百万级 MAU、十万级 DAU、峰值两万级在线；房间容量按普通房 200 人、超大房使用独立广播通道设计。不要把现有全量房间状态广播直接搬到超大房。
