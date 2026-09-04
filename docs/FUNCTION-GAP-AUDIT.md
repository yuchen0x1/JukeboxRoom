# OpenMusic 功能缺口审计与补齐路线

> 审计日期：2026-07-16
>
> 审计目标：聚焦“项目还缺什么功能”，不把漏洞扫描、依赖升级或代码风格问题当成功能补齐。
>
> 审计范围：`client/`、`server/`、部署文档、环境变量、HTTP API、Socket.IO 事件与持久化实现。

## 0. 结论摘要

OpenMusic 已经具备较完整的“多人在线听歌房”前台体验：房间、点歌、同步播放、聊天、房间管理、多音乐源、收藏/历史、TV 与沉浸视觉均可形成闭环。当前主要缺口不在房间页，而在平台化能力：没有独立账号体系和平台级 RBAC、没有运营后台、没有审计日志、没有任务中心、没有完整可观测性、不能多实例横向扩展，也没有插件与开放 API 生态。

因此推荐的迭代主线是：

1. 先补平台身份、后台、审计、任务、监控和滥用防护。
2. 再完成多实例和自托管媒体能力。
3. 最后建设插件、开放 API、客户端生态与备份升级体系。

本文中的“行业能力”只收录可由官方项目文档直接核验的内容；优先级是结合 OpenMusic 当前架构作出的项目决策，不冒充外部项目的结论。

## 1. 审计口径

### 1.1 完整与半成品的定义

- **完整度较高**：当前代码中存在前后端入口、状态流转、权限校验或持久化链路，用户可以完成端到端操作。
- **半成品/局部能力**：已经有部分实现，但只覆盖房间内、单进程、浏览器本地或单一数据源，尚不能承担平台级生产能力。
- **缺失**：没有可用入口或只有底层依赖，没有对应的业务模型、管理界面、执行链路和验收闭环。

### 1.2 本地证据入口

- 服务端 HTTP、Socket.IO 与启动流程：`server/index.js`
- 房间、队列、权限、聊天、播放状态：`server/roomManager.js`
- Redis 房间快照、收藏与热榜：`server/roomStorage.js`、`server/songHotRank.js`
- 前端路由：`client/src/App.tsx`
- 房间主界面：`client/src/pages/Room.tsx`
- Socket 客户端协议：`client/src/hooks/useSocket.ts`
- 前后端数据结构：`client/src/types.ts`
- 部署边界：`docs/DEPLOY.md`

## 2. 第一步：已实现功能清单

### 2.1 完整度较高的功能

| 模块 | 已实现功能 | 本地证据 |
|---|---|---|
| 房间生命周期 | 房间列表、创建房间、读取房间、密码进入、锁房、改名、加入/退出、断线宽限重连、空房延迟销毁 | `server/index.js` 的 `/api/rooms*`、`join_room`、`set_room_lock`、`rename_room`；`server/roomManager.js:680`、`:774`、`:1351` |
| 成员与房间角色 | 创建者/房主/管理员角色，管理员上限，踢人及用户/设备封禁，改昵称，禁言，成员等级与欢迎消息 | `set_room_admin`、`kick_user`、`rename_user`、`set_chat_mute`、`set_room_member_tier`；`client/src/components/OnlineUsers.tsx` |
| 实时播放同步 | 播放/暂停、拖动、播放进度广播、曲目时长上报、掉线重连后的房间状态恢复、只读 TV 模式 | `toggle_play`、`seek`、`report_track_duration`；`client/src/lib/playbackSync.ts`、`client/src/pages/TvDisplay.tsx` |
| 协作队列 | 加歌、删歌、清空、切歌、播放结束、队列点赞、当前歌曲踩歌、达到人数/在线比例后自动切歌、点播用户标识、队列为空时随机推荐 | `add_song`、`remove_song`、`clear_queue`、`skip_song`、`finish_song`、`toggle_queue_like`、`toggle_current_dislike`；`server/roomManager.js` |
| 点歌治理 | 开关成员点歌、最低停留时间、单人点歌上限、冷却时间、队列长度、成员插播权限、踩歌阈值、成员离开后延迟清理其点歌、禁播歌曲 | `set_room_song_request`、`ban_room_song`、`unban_room_song`；`client/src/components/RoomSettingsModal.tsx` |
| 插播与切歌申请 | 成员按房间策略直接插播；普通成员发起切歌申请，房主/管理员批准或拒绝 | `request_jump`、`request_skip`、`approve_skip`、`reject_skip`；`server/roomManager.js:1980`、`:2042` |
| 房间公告与模式 | 公告发布/自动弹出、FM 模式、房间音质策略、纯净模式、沉浸模式 | `set_room_announcement`、`set_room_fm_mode`、`set_room_audio_quality`；`client/src/pages/Room.tsx` |
| 聊天 | 文本、图片、表情包、@、回复、消息 reaction、历史分页、全员/单人禁言、微信文件传输助手接入 | `send_chat`、`toggle_chat_reaction`、`load_chat_history`；`client/src/components/ChatPanel.tsx`、`server/wechatFileHelperProxy.js` |
| 音乐聚合 | Meting 网易云/QQ、迟言酷狗、网易榜单与歌单搜索、歌词兜底、媒体同源代理、播放源与音质选择 | `server/metingFetch.js`、`server/cyapi.js`、`server/neteaseToplist.js`、`server/mediaProxy.js`、`server/index.js` 的 `/api/music/*` |
| 歌单与个人数据 | 网易云/QQ 歌单导入、个人收藏增删/批量导入导出、房间播放历史、最近房间 | `server/playlistImport.js`、`list_favorites`、`set_favorite`、`import_favorites`、`load_song_history`；`client/src/lib/recentRooms.ts` |
| 视觉与终端 | TV 展示、移动端布局、Capacitor Android/iOS 工程与 CI 构建、Media Session、黑胶播放器、星河/地形/封面等视觉模式 | `client/src/pages/TvDisplay.tsx`、`client/src/components/immersive/`、`client/src/components/galaxy/`、`client/src/components/topography/`、`.github/workflows/` |
| 基础持久化与部署 | Redis 可选持久化房间快照、收藏和热榜；生产静态资源托管；健康检查；Nginx WebSocket 配置 | `server/roomStorage.js`、`server/songHotRank.js`、`/api/health`、`docs/DEPLOY.md` |

### 2.2 半成品或局部能力

| 模块 | 当前已有部分 | 不完整边界 |
|---|---|---|
| 身份体系 | `session/bootstrap`、签名浏览器身份、房间内 owner/admin | 没有账号注册/登录、密码找回、会话管理、平台角色、用户封禁与管理员账号生命周期 |
| 权限 | 房间内管理操作有服务端校验 | 权限只属于单个房间；没有平台级 RBAC、资源级授权、API 权限和权限审计 |
| 房主转让 | Socket 事件和客户端封装仍存在 | `server/roomManager.js:1343` 的核心逻辑固定返回不可转让，页面也没有操作入口 |
| 旧插队审批 | `jumpRequests`、批准/拒绝事件仍保留并被序列化 | 当前 `requestJump()` 直接执行插播，不再创建审批请求；审批横幅只处理切歌申请 |
| 房间统一音质 | 服务端状态、Socket 事件和客户端封装已存在 | 房间页面只保存“我的音质”，未调用 `setRoomAudioQuality()`，服务端统一音质没有用户入口 |
| 持久化 | Redis 保存房间快照、收藏与热榜 | 业务模型仍以进程内 `Map` 为主；没有关系数据库、迁移、数据保留策略、备份/恢复 |
| 高可用 | 使用 Redis 作为部分持久化依赖 | Socket 连接、锁和房间活跃状态没有跨节点协调；`docs/DEPLOY.md` 明确要求单实例 |
| 任务执行 | 有随机推荐、预取、异步保存等内部任务 | 没有统一任务模型、周期调度、手动触发、进度、取消、重试、失败记录和管理页面 |
| 日志监控 | `console.log/error`、`/api/health` | 没有结构化日志、请求 ID、指标、追踪、告警、日志检索和就绪检查 |
| 安全防护 | CORS、签名客户端 ID、请求体大小限制、部分接口内存限流、房间密码 | 没有统一限流策略、账号锁定、风控事件、后台二次验证、API 密钥和密钥轮换 |
| 媒体库 | 可搜索/播放外部平台并代理媒体 | 没有扫描本地目录、解析标签、专辑/歌手索引、重复文件识别、转码与媒体文件治理 |
| 歌单调度 | 房间 FM 和队列为空随机推荐 | 没有服务端共享歌单、时间段计划、轮播权重、优先级、AutoDJ 历史避重和调度冲突处理 |
| 私人漫游去重 | `randomPlayedKeys` 会随房间快照保存和恢复 | 记录、裁剪和排除重复曲目的实现被注释，当前随机续播不能保证历史窗口避重 |
| 酷狗集成 | 单曲搜索、播放和歌词可用 | 歌单导入、音质模型和 FM 只覆盖网易云/QQ；迟言随机推荐函数未接入房间播放 |
| 用户归属地 | 异步查询可更新服务端内存 | 更新后不广播，后续房间广播又省略 `location`，前端通常不能得到最终结果 |
| 管理后台 | 房间设置弹窗可管理单个房间 | 没有 `/admin` 平台控制台，无法统一查看房间、用户、任务、配置、日志和运营数据 |
| 开放能力 | 有内部 HTTP API 与 Socket 事件 | 没有 OpenAPI 文档、版本化公共 API、API Key、Webhook、SDK 或插件生命周期 |
| 原生客户端 | Capacitor 工程与 Android/iOS CI 构建 | 主要是远程站点 WebView 壳；无独立离线前端和原生后台音频；Android release 未配签名，iOS CI 关闭签名 |
| 反向代理配置 | `.env.example` 暴露 `TRUST_PROXY` | `server/index.js` 固定信任 `loopback`，该环境变量尚未接入 |

## 3. 第二步：联网检索与行业功能矩阵

### 3.1 自动生成的检索关键词

按七个板块生成并执行以下检索词，中文用于找同赛道项目，英文用于命中官方文档：

| 板块 | 检索关键词 |
|---|---|
| 业务功能 | `多人在线听歌房 开源`、`self-hosted music server features`、`music library scan metadata transcoding`、`AutoDJ scheduled playlists`、`Subsonic compatible server` |
| 后台管理 | `self-hosted music admin dashboard users`、`radio station web management suite`、`music server administration API` |
| 任务调度 | `music server scheduled tasks manual run`、`playlist time block priority rotation`、`media library scheduled scan` |
| 并发处理 | `Socket.IO multiple nodes Redis adapter`、`music server multi-threaded scan MVCC connection pooling`、`HTTP audio Range ETag` |
| 日志监控 | `self-hosted media server logs metrics alerts`、`OpenTelemetry traces metrics logs`、`Prometheus Alertmanager notifications` |
| 权限安全 | `media server users permissions failed login lockout`、`API key inherits user permissions`、`Socket.IO Redis adapter security` |
| 扩展插件 | `media server plugin catalog authentication notifications`、`music server API SDK`、`Subsonic client compatibility` |

### 3.2 外部官方资料

| 编号 | 项目/规范 | 可核验能力 | 官方来源 |
|---|---|---|---|
| S1 | Navidrome | 大型曲库、多格式、标签元数据、多用户独立播放统计/歌单/收藏、目录监控、歌词、按用户/播放器转码、Subsonic 客户端兼容、主题和多语言 | [Navidrome README](https://raw.githubusercontent.com/navidrome/navidrome/master/README.md) |
| S2 | Ampache | Web 音视频流媒体、文件与元数据管理、公开 API、管理员自动化脚本 | [Ampache README](https://raw.githubusercontent.com/ampache/ampache/master/README.md) |
| S3 | AzuraCast | 自托管电台管理套件、完整 Web 管理界面、容器化安装 | [AzuraCast README](https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/README.md) |
| S4 | AzuraCast Playlists | 管理权限、通用轮播、按歌曲数/分钟插入、时间段和日期范围调度、播放列表优先级、听众请求优先级 | [AzuraCast Playlists](https://www.azuracast.com/docs/user-guide/playlists/) |
| S5 | Jellyfin Users | 本地用户、管理员权限、按用户控制播放/转码/媒体删除、登录失败锁定 | [Jellyfin Users](https://jellyfin.org/docs/general/server/users/) |
| S6 | Jellyfin Plugins | 插件目录与安装、认证/频道/Live TV/元数据/通知等插件类别、插件开发模板 | [Jellyfin Plugins](https://jellyfin.org/docs/general/server/plugins/) |
| S7 | Jellyfin Tasks | 周期任务和手动执行；媒体库扫描、插件更新、数据库优化、清理日志/缓存/转码；插件可注册任务 | [Jellyfin Tasks](https://jellyfin.org/docs/general/server/tasks/) |
| S8 | Airsonic-Advanced | 大型曲库、转码插件、码率上限、Podcast、Range、ETag/Last-Modified、连接池/MVCC、多线程扫描、WebSocket | [Airsonic-Advanced README](https://raw.githubusercontent.com/airsonic-advanced/airsonic-advanced/master/README.md) |
| S9 | Socket.IO Redis Adapter | 通过 Redis Pub/Sub 把广播转发到其他 Socket.IO 节点；支持节点间通信；要求保护 Redis 网络、认证、TLS 和 ACL | [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) |
| S10 | Socket.IO Multiple Nodes | 多节点部署必须处理负载均衡和节点间消息转发；长轮询场景需要 sticky session 或改用 WebSocket-only | [Socket.IO Using Multiple Nodes](https://socket.io/docs/v4/using-multiple-nodes/) |
| S11 | OpenTelemetry | 可观测性基础信号包括 traces、metrics、logs | [OpenTelemetry Observability Primer](https://opentelemetry.io/docs/concepts/observability-primer/) |
| S12 | Prometheus | 告警规则由 Prometheus 计算并发送给 Alertmanager；Alertmanager 可发送邮件、值班系统和聊天通知 | [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/overview/) |
| S13 | AzuraCast API | 后台创建 API Key，API Key 继承创建者权限，可通过 `X-API-Key` 鉴权 | [AzuraCast APIs](https://www.azuracast.com/docs/developers/apis/) |
| S14 | AzuraCast Backup | 后台可配置周期自动备份、一次性备份、下载备份；提供 Docker 命令备份和恢复 | [AzuraCast Backup & Restore](https://raw.githubusercontent.com/AzuraCast/azuracast.com/main/src/content/docs/docs/administration/backup-and-restore.md) |
| S15 | AzuraCast Logs | 有权限用户可在 Web 中查看系统、应用、Icecast、Shoutcast、Liquidsoap 和邮件日志 | [AzuraCast Logs](https://www.azuracast.com/docs/help/logs/) |
| S16 | Navidrome Monitoring | 兼容 Prometheus/OpenMetrics，可配置指标端点 | [Navidrome Monitoring](https://www.navidrome.org/docs/usage/integration/monitoring/) |
| S17 | Jellyfin Monitoring | 提供 `/health` 和 Prometheus-compatible `/metrics`，指标默认关闭以避免直接公开 | [Jellyfin Monitoring](https://jellyfin.org/docs/general/post-install/networking/advanced/monitoring) |
| S18 | AzuraCast Roles | 用户通过角色获得权限，权限可作用于单个站点或整个平台，并包含媒体删除、插播、跳歌等专项权限 | [AzuraCast Roles & Permissions](https://www.azuracast.com/docs/administration/roles-and-permissions/) |
| S19 | Navidrome Security | 非 root、媒体目录只读、数据目录读写、反向代理 SSL、滑动窗口登录限流和可信代理边界 | [Navidrome Security](https://www.navidrome.org/docs/usage/admin/security/) |
| S20 | Socket.IO Middleware | 连接中间件可执行认证、授权和限流，并在失败时拒绝连接 | [Socket.IO Middlewares](https://socket.io/docs/v4/middlewares/) |
| S21 | Navidrome Plugins | WASM 沙箱插件可扩展元数据、Scrobbling、计划任务和事件处理，并声明网络、存储、媒体库和用户权限 | [Navidrome Plugins](https://www.navidrome.org/docs/usage/features/plugins/) |
| S22 | Ampache Plugins | 插件类别包括 metadata、lyrics、stats、scrobbling、share 和 stream control | [Ampache Plugins](https://ampache.org/docs/plugins/) |
| S23 | AzuraCast Plugins | 插件目录自动发现，插件与主程序升级目录隔离 | [AzuraCast Plugins](https://www.azuracast.com/docs/developers/plugins/) |
| S24 | Socket.IO Delivery Guarantees | 保证消息顺序，但默认是 at-most-once；断线遗漏事件的补发需要应用自行实现 | [Socket.IO Delivery Guarantees](https://socket.io/docs/v4/delivery-guarantees/) |
| S25 | Navidrome Backup | 自动备份使用 cron-like schedule，并支持配置保留数量 | [Navidrome Automated Backup](https://www.navidrome.org/docs/usage/admin/backup/) |

### 3.3 七大板块行业功能矩阵

| 板块 | 官方资料体现的行业能力 | OpenMusic 当前状态 | 差距结论 |
|---|---|---|---|
| 业务功能 | 本地曲库扫描、标签元数据、多用户个人库、歌词、多格式转码、共享/个人歌单、AutoDJ 时间调度、Podcast/电台（S1、S4、S8） | 外部音乐源、房间队列、歌词、收藏和历史较完整；无本地曲库、服务端歌单、转码、计划播单和 Podcast | 房间业务完整，媒体服务器业务缺失 |
| 后台管理 | 统一 Web 管理界面、用户/权限、媒体、播放列表、配置、API Key、日志、备份恢复（S3、S5、S13、S14、S15、S18） | 只有房间设置和依赖项目 Meting 的外部 `/admin` | 缺独立平台后台和运营控制面 |
| 任务调度 | 周期/手动任务、媒体扫描、插件更新、数据库优化、清理任务；时间段/日期/优先级播放计划和 cron 备份（S4、S7、S21、S25） | 只有进程内预取、随机推荐和异步持久化 | 缺持久任务模型、调度器和任务管理页面 |
| 并发处理 | 多节点负载均衡、节点间广播、sticky session；应用级可靠投递；大型曲库并行扫描、连接池/MVCC；媒体 Range/ETag（S8、S9、S10、S24） | 单 Node 进程、进程内房间状态与锁；媒体代理有流式能力但无完整媒体库 HTTP 缓存治理 | 当前只能单实例，无法水平扩容和故障切换 |
| 日志监控 | Web 日志查看，Prometheus/OpenMetrics 健康和指标端点，日志/指标/追踪三类信号，规则告警与多渠道通知（S11、S12、S15、S16、S17） | `console.*` 和简单健康检查 | 缺结构化采集、指标、追踪、告警和检索界面 |
| 权限安全 | 平台/资源级角色权限、失败登录锁定、API Key 继承权限、连接中间件认证/授权/限流、非 root 和只读媒体目录、Redis ACL/TLS/私网（S5、S9、S13、S18、S19、S20） | 签名设备身份和房间角色；无平台账号与 API 权限 | 房间授权可用，平台身份、授权和风控缺失 |
| 扩展插件 | 沙箱与权限声明、插件目录、安装/更新、认证/元数据/通知/歌词/统计类别、插件任务；公开 API、SDK/客户端兼容（S1、S2、S6、S7、S13、S21、S22、S23） | 音乐源和贴纸等为硬编码模块，没有统一扩展协议 | 缺插件生命周期、公共 API 和第三方生态 |

## 4. 第三步：逐项功能比对

### 4.1 缺失项总表

| 优先级 | 缺失功能 | 所属板块 | 判定 |
|---|---|---|---|
| P0 刚需必补 | 平台账号、持久化用户与 RBAC | 权限安全 | 缺失 |
| P0 刚需必补 | 平台级运营后台 | 后台管理 | 缺失 |
| P0 刚需必补 | 不可抵赖的审计日志 | 后台管理/安全 | 缺失 |
| P0 刚需必补 | 任务中心与调度器 | 任务调度 | 缺失 |
| P0 刚需必补 | 结构化日志、指标、追踪和告警 | 日志监控 | 缺失 |
| P0 刚需必补 | Socket.IO 多实例和分布式状态 | 并发处理 | 缺失 |
| P0 刚需必补 | 全局限流、登录锁定和滥用治理 | 权限安全 | 局部实现 |
| P1 体验优化 | 本地媒体库扫描与元数据 | 业务功能 | 缺失 |
| P1 体验优化 | FFmpeg 转码、码率与 HTTP 缓存 | 业务/并发 | 缺失 |
| P1 体验优化 | AutoDJ 与计划播放列表 | 业务/调度 | 局部实现 |
| P1 体验优化 | 房间运营分析看板 | 后台管理 | 缺失 |
| P1 体验优化 | 服务端共享歌单 | 业务功能 | 缺失 |
| P1 体验优化 | Webhook 与通知渠道 | 扩展/监控 | 缺失 |
| P1 体验优化 | 后台日志检索器 | 日志监控 | 缺失 |
| P2 长期拓展 | 插件系统与插件目录 | 扩展插件 | 缺失 |
| P2 长期拓展 | OpenAPI、API Key 与 SDK | 扩展/安全 | 缺失 |
| P2 长期拓展 | 主题与国际化系统 | 扩展插件 | 局部实现 |
| P2 长期拓展 | PWA 与兼容客户端生态 | 业务/扩展 | 局部实现 |
| P2 长期拓展 | 媒体源健康与质量治理 | 业务/后台 | 局部实现 |
| P2 长期拓展 | Podcast/网络电台模式 | 业务功能 | 缺失 |
| P2 长期拓展 | 自动备份、恢复与升级检查 | 后台/任务 | 缺失 |

## 5. 功能补齐开发清单

### 5.1 P0 刚需必补

#### P0-1 平台账号、持久化用户与 RBAC

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前 `session/bootstrap` 只生成设备级身份，房间 owner/admin 不能替代平台账号；无法稳定识别运营管理员、封禁用户或跨设备继承数据。 |
| 外部依据 | Jellyfin 提供本地用户、管理员和按用户权限（S5）；AzuraCast 提供平台/资源级角色权限（S18），API Key 继承用户权限（S13）。 |
| 开发内容 | 引入 PostgreSQL 用户库；实现登录/退出、密码哈希、刷新会话、账号状态、平台角色 `super_admin/operator/moderator/user`、资源权限和跨设备收藏归属；匿名访客继续可用但权限受限。 |
| 代码改造点 | 拆分 `server/index.js` 的 session 路由；Socket.IO 握手绑定 `userId`；`server/roomManager.js` 将临时 socket 身份与稳定用户身份分离；`client/src/App.tsx` 增加 `/login`；`useSocket.ts` 处理鉴权过期。 |
| 新增模块 | `server/auth/`、`server/db/`、`server/middleware/auth.js`、`client/src/pages/Login.tsx`、`client/src/stores/authStore.ts`、数据库迁移目录。 |
| 新增配置 | `DATABASE_URL`、`AUTH_JWT_SECRET`、`AUTH_ACCESS_TTL`、`AUTH_REFRESH_TTL`、`AUTH_COOKIE_SECURE`、首次管理员初始化配置。 |
| 验收标准 | 同一账号跨浏览器登录后收藏一致；禁用账号无法建立可变更房间状态的 Socket；普通用户访问后台 API 返回 403；权限变更无需重启生效。 |

#### P0-2 平台级运营后台

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前没有 OpenMusic 自己的 `/admin`；README 中的 `/admin` 属于外部 Meting-API，不能管理 OpenMusic 房间、用户和运行状态。 |
| 外部依据 | AzuraCast 以完整 Web 管理界面统一管理电台（S3）；Jellyfin 在后台管理用户和任务（S5、S7）。 |
| 开发内容 | 增加总览、在线房间、用户、封禁、共享歌单、任务、配置、审计、日志、系统状态页面；支持关闭房间、强制转移房主、全局公告和功能开关。 |
| 代码改造点 | `client/src/App.tsx` 增加 `/admin/*` 受保护路由；`server/index.js` 抽出 `/api/admin/*`；`roomManager.js` 暴露受控管理服务，不允许路由直接修改内部 `Map`。 |
| 新增模块 | `client/src/pages/admin/`、`client/src/components/admin/`、`server/routes/admin/`、`server/services/adminService.js`。 |
| 新增配置 | `ADMIN_ENABLED`、`ADMIN_SESSION_IDLE_TTL`、`ADMIN_ALLOWED_IPS`（可选）、全局功能开关表。 |
| 验收标准 | 管理员可实时查看房间/人数/当前歌曲；关闭房间会通知在线用户并记录审计；所有后台接口执行 RBAC 校验；移动端后台至少可完成应急封禁和关房。 |

#### P0-3 审计日志

| 字段 | 内容 |
|---|---|
| 缺失说明 | 房主操作和平台操作目前只改变内存状态，无法回答“谁在何时改了什么、结果如何”。 |
| 外部依据 | Jellyfin 将 activity logs 纳入周期清理任务（S7），表明管理活动日志是服务端运维对象；平台权限来自 S5/S13。 |
| 开发内容 | 记录登录、权限变更、封禁、关房、踢人、禁言、锁房、全局配置、任务触发、API Key 操作；保存 actor、action、resource、before/after 摘要、IP、requestId、结果。 |
| 代码改造点 | `server/index.js` HTTP 中间件注入 requestId；`roomManager.js` 的管理函数发布领域事件；Socket 回调统一经过审计包装器。 |
| 新增模块 | `server/audit/auditService.js`、`server/audit/auditRepository.js`、后台审计查询页。 |
| 新增配置 | `AUDIT_RETENTION_DAYS`、`AUDIT_REDACT_FIELDS`、`AUDIT_EXPORT_ENABLED`。 |
| 验收标准 | 任一权限或封禁变化都能按操作者/资源/时间检索；敏感字段不落库；审计写入失败时高危管理操作可配置为拒绝执行。 |

#### P0-4 任务中心与调度器

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前异步任务分散在业务代码中，没有统一状态、人工触发、失败重试和执行历史。 |
| 外部依据 | Jellyfin 任务支持周期执行和手动执行，覆盖扫描、更新、数据库优化和清理，并允许插件注册任务（S7）。 |
| 开发内容 | 建立 `TaskDefinition`、`TaskRun`、`TaskSchedule`；支持 cron/固定间隔、手动触发、单实例互斥、超时、取消、重试、进度、结构化结果和执行历史。 |
| 代码改造点 | 从 `server/index.js` 启动流程抽离调度器；将房间清理、热榜聚合、媒体源探测、审计清理、备份等逐步注册为任务。 |
| 新增模块 | `server/tasks/registry.js`、`scheduler.js`、`worker.js`、`taskRepository.js`、后台任务列表/详情页。 |
| 新增配置 | `TASKS_ENABLED`、`TASK_WORKER_CONCURRENCY`、`TASK_DEFAULT_TIMEOUT_MS`、`TASK_HISTORY_DAYS`、`TASK_TIMEZONE`。 |
| 验收标准 | 后台可手动运行并看到进度；同一互斥任务不会重入；失败按策略重试且保留错误摘要；服务重启后任务记录不丢失。 |

#### P0-5 结构化日志、指标、追踪和告警

| 字段 | 内容 |
|---|---|
| 缺失说明 | `console.*` 无统一字段，`/api/health` 只说明进程存活，无法定位接口、Socket、上游音乐源和 Redis 延迟。 |
| 外部依据 | OpenTelemetry 将 traces、metrics、logs 作为可观测性信号（S11）；Prometheus 与 Alertmanager 提供规则告警和通知（S12）；Navidrome/Jellyfin 提供指标端点（S16、S17）。 |
| 开发内容 | JSON 日志、HTTP/Socket requestId、关键跨度、Prometheus 指标、`/health/live` 和 `/health/ready`；告警覆盖错误率、事件延迟、房间同步异常、Redis/数据库/上游失败、任务堆积。 |
| 代码改造点 | 替换 `server/index.js`、`roomStorage.js` 和各上游模块中的 `console.*`；统一 HTTP/Socket 埋点；前端错误上报附 roomId/connectionId 的脱敏摘要。 |
| 新增模块 | `server/observability/logger.js`、`metrics.js`、`tracing.js`、`health.js`；部署侧 Prometheus/Alertmanager 示例。 |
| 新增配置 | `LOG_LEVEL`、`LOG_FORMAT`、`OTEL_EXPORTER_OTLP_ENDPOINT`、`METRICS_ENABLED`、`METRICS_AUTH_TOKEN`、`HEALTH_UPSTREAM_TIMEOUT_MS`。 |
| 验收标准 | 一次加歌可按 requestId 串起 HTTP/Socket/上游调用；Prometheus 可抓取核心指标；Redis 或数据库不可用时 readiness 失败；告警可送达至少一个通知渠道。 |

#### P0-6 Socket.IO 多实例和分布式状态

| 字段 | 内容 |
|---|---|
| 缺失说明 | `roomManager.js` 的房间、播放锁、在线连接和进行中任务都在单进程；部署文档明确要求单实例。 |
| 外部依据 | Socket.IO 官方要求多节点同时解决负载均衡和节点间转发（S10），Redis Adapter 使用 Pub/Sub 将广播发送到其他节点（S9）；默认 at-most-once 意味着断线补发和幂等需由应用实现（S24）。 |
| 开发内容 | 接入 Redis Adapter；把权威房间版本、播放状态、分布式锁、连接映射和幂等键迁到 Redis；增加节点心跳、leader/lease、事件版本和冲突处理；明确 sticky session 或 WebSocket-only 策略。 |
| 代码改造点 | `server/index.js` 初始化 adapter；`roomManager.js` 从同步内存服务改为带版本的异步 repository；`roomStorage.js` 区分快照、实时状态和 Pub/Sub；`useSocket.ts` 处理版本/重放。 |
| 新增模块 | `server/realtime/adapter.js`、`roomRepository.js`、`distributedLock.js`、`nodeRegistry.js`。 |
| 新增配置 | `INSTANCE_ID`、`SOCKET_REDIS_URL`、`SOCKET_TRANSPORTS`、`ROOM_LOCK_TTL_MS`、`NODE_HEARTBEAT_MS`、`ROOM_EVENT_RETENTION`。 |
| 验收标准 | 两个 Node 实例后的用户可在同一房间同步；任一节点退出不丢房间队列；同一切歌事件只执行一次；压测期间房间版本不倒退。 |

#### P0-7 全局限流、登录锁定和滥用治理

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前部分接口有局部内存计数，但不能跨实例、不能按账号统一治理，也没有登录失败锁定和后台风控事件。 |
| 外部依据 | Jellyfin 支持达到失败登录次数后锁定用户（S5）；Navidrome 使用滑动窗口登录限流（S19）；Socket.IO 中间件可用于连接认证、授权和限流（S20）；Redis Adapter 要求私网、认证、TLS、ACL 和最小权限（S9）。 |
| 开发内容 | Redis 滑动窗口/令牌桶；按 IP、设备、账号、房间和事件类型限流；登录失败锁定；可疑加歌/聊天/建房频率检测；后台解锁、临时封禁和白名单。 |
| 代码改造点 | `server/index.js` 统一 HTTP 限流中间件；Socket 事件注册改为策略包装；登录服务记录失败；上传与媒体代理使用独立额度。 |
| 新增模块 | `server/security/rateLimiter.js`、`abusePolicy.js`、`loginLockout.js`、后台风控事件页。 |
| 新增配置 | `RATE_LIMIT_REDIS_URL`、`LOGIN_MAX_FAILURES`、`LOGIN_LOCKOUT_MINUTES`、`ROOM_CREATE_RATE`、`CHAT_RATE`、`MEDIA_PROXY_RATE`、Redis TLS/ACL 配置。 |
| 验收标准 | 多实例下限流计数一致；超过阈值返回可识别错误和重试时间；管理员可解锁；白名单不绕过授权；Redis 不暴露公网。 |

### 5.2 P1 体验优化

#### P1-1 本地媒体库扫描与元数据

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前曲目完全依赖第三方搜索/播放地址，不能托管用户自己的稳定曲库。 |
| 外部依据 | Navidrome 支持大型曲库、元数据和目录变化监控（S1）；Airsonic 面向大型媒体集合并支持并行扫描（S8）。 |
| 开发内容 | 配置媒体目录；增量扫描；解析歌手/专辑/曲号/封面/歌词；文件指纹去重；数据库索引；扫描结果可搜索并直接加入房间队列。 |
| 代码改造点 | 扩展 `Song` 类型和 `client/src/api/music/sources.ts`；服务端统一外部源与 `local` 源；任务中心承载扫描。 |
| 新增模块 | `server/library/`、`server/routes/library.js`、后台媒体库页面。 |
| 新增配置 | `MUSIC_LIBRARY_PATHS`、`LIBRARY_SCAN_SCHEDULE`、`LIBRARY_WATCH_ENABLED`、`LIBRARY_ALLOWED_EXTENSIONS`、`COVER_CACHE_PATH`。 |
| 验收标准 | 新增文件可自动入库；修改标签后增量更新；重复文件不会生成重复曲目；本地曲目可搜索、播放、显示封面与歌词。 |

#### P1-2 FFmpeg 转码、码率与 HTTP 缓存

| 字段 | 内容 |
|---|---|
| 缺失说明 | 外部媒体代理不能把本地 FLAC/APE 等格式按终端能力转码，也缺少统一的码率策略与缓存标识。 |
| 外部依据 | Navidrome 支持按用户/播放器即时转码（S1）；Airsonic 支持转码插件、码率上限、Range、ETag 和 Last-Modified（S8）。 |
| 开发内容 | FFmpeg profile、终端能力协商、按用户/房间码率、Range 请求、ETag/Last-Modified、转码缓存、并发配额、超时与清理任务。 |
| 代码改造点 | 将 `server/mediaProxy.js` 拆为外部代理与本地流媒体服务；`AudioEngine` 根据能力选择 profile；后台展示转码会话。 |
| 新增模块 | `server/transcode/`、`server/routes/stream.js`、转码缓存清理任务。 |
| 新增配置 | `FFMPEG_PATH`、`TRANSCODE_CACHE_PATH`、`TRANSCODE_MAX_CONCURRENCY`、`TRANSCODE_PROFILES`、`STREAM_MAX_BITRATE`。 |
| 验收标准 | 浏览器可播放不原生支持的测试格式；断点续播返回 206；相同版本文件 ETag 稳定；并发超过额度时排队而非拖垮进程。 |

#### P1-3 AutoDJ 与计划播放列表

| 字段 | 内容 |
|---|---|
| 缺失说明 | FM 只在队列为空时随机补歌，没有可配置轮播、时间段、优先级和历史避重。 |
| 外部依据 | AzuraCast 支持通用轮播、每若干首/分钟插入、时间段/日期范围和播放列表优先级（S4）。 |
| 开发内容 | 服务端播放列表、规则类型、时间窗口、权重/优先级、请求歌曲优先级、最近播放避重、冲突预览和下一批队列生成。 |
| 代码改造点 | `roomManager.js` 的随机推荐改为调度策略接口；房间设置增加 AutoDJ 方案；任务中心负责计划激活。 |
| 新增模块 | `server/autodj/engine.js`、`scheduleResolver.js`、`historyPolicy.js`、管理和房间配置界面。 |
| 新增配置 | `AUTODJ_ENABLED`、`AUTODJ_LOOKAHEAD_COUNT`、`AUTODJ_HISTORY_WINDOW`、`AUTODJ_TIMEZONE`。 |
| 验收标准 | 同一时间冲突按优先级稳定解析；成员点歌与计划歌单按配置竞争；最近 N 首不重复；后台可预览未来一小时安排。 |

#### P1-4 房间运营分析看板

| 字段 | 内容 |
|---|---|
| 缺失说明 | 热榜只统计歌曲热度，缺少房间、人次、留存、峰值、上游成功率和管理动作趋势。 |
| 外部依据 | AzuraCast 的 Web 管理套件定位（S3）与 OpenTelemetry 指标模型（S11）共同提供管理和数据基础；本项统计口径由 OpenMusic 业务定义。 |
| 开发内容 | 定义房间创建数、活跃人数、停留时长、加歌/播放完成率、同步纠偏次数、上游错误率、封禁/禁言量；支持时间筛选和 CSV 导出。 |
| 代码改造点 | Socket 连接和领域事件写入聚合事件；后台新增看板；不直接从审计表做高频统计。 |
| 新增模块 | `server/analytics/`、聚合表/物化任务、`client/src/pages/admin/Analytics.tsx`。 |
| 新增配置 | `ANALYTICS_ENABLED`、`ANALYTICS_RETENTION_DAYS`、`ANALYTICS_AGGREGATION_INTERVAL`。 |
| 验收标准 | 指标定义有文档；日统计可重算；时区一致；匿名指标不保存聊天正文和敏感身份信息。 |

#### P1-5 服务端共享歌单

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前导入结果和收藏主要服务于当前用户/当前队列，不能由运营或房主维护可复用、可协作的服务端歌单。 |
| 外部依据 | Navidrome 的多用户独立歌单与收藏（S1）；AzuraCast 的可管理播放列表与权限（S4）。 |
| 开发内容 | 歌单 CRUD、所有者、协作者、可见性、版本、排序、批量导入、复制到房间、软删除和冲突处理。 |
| 代码改造点 | 抽象现有 `playlistImport.js` 为导入服务；前端推荐歌单与收藏面板接入服务端歌单。 |
| 新增模块 | `server/playlists/`、`client/src/pages/Playlists.tsx`、共享歌单编辑器。 |
| 新增配置 | `PLAYLIST_MAX_TRACKS`、`PLAYLIST_IMPORT_BATCH_SIZE`、`PLAYLIST_DEFAULT_VISIBILITY`。 |
| 验收标准 | 用户可跨房间复用歌单；协作者并发修改有版本冲突提示；删除可恢复；导入失败给出逐项结果。 |

#### P1-6 Webhook 与通知渠道

| 字段 | 内容 |
|---|---|
| 缺失说明 | 房间事件、任务失败和告警不能推送到外部系统。 |
| 外部依据 | Jellyfin 插件类别包含 notifications（S6）；Prometheus Alertmanager 支持邮件、值班系统和聊天通知（S12）。 |
| 开发内容 | Webhook 订阅、事件白名单、HMAC 签名、重试/退避、死信、测试发送；内置任务失败、房间异常、封禁和系统告警事件。 |
| 代码改造点 | 领域事件总线同时服务审计、分析和 Webhook；后台新增订阅管理；避免业务函数直接发 HTTP。 |
| 新增模块 | `server/webhooks/`、投递任务、后台订阅和投递记录页。 |
| 新增配置 | `WEBHOOK_ENABLED`、`WEBHOOK_TIMEOUT_MS`、`WEBHOOK_MAX_RETRIES`、`WEBHOOK_ALLOWED_HOSTS`。 |
| 验收标准 | 接收方可验证签名；失败自动重试并可人工重放；内网地址默认禁止；敏感字段按事件 schema 脱敏。 |

#### P1-7 后台日志检索器

| 字段 | 内容 |
|---|---|
| 缺失说明 | 即使补了结构化日志，若没有检索入口，非开发运营人员仍无法按房间、请求或上游定位问题。 |
| 外部依据 | OpenTelemetry 明确 logs 为可观测性信号（S11）；Jellyfin 将 activity logs 作为可管理和清理对象（S7）。 |
| 开发内容 | 按时间、level、requestId、roomId、module 查询；上下文展开；下载脱敏日志；异常聚合；只读权限与查询审计。 |
| 代码改造点 | 日志输出到 Loki/兼容存储或数据库索引；后台只通过受限查询服务访问，不读取任意服务器文件。 |
| 新增模块 | `server/logs/queryService.js`、`client/src/pages/admin/Logs.tsx`。 |
| 新增配置 | `LOG_STORE`、`LOG_QUERY_MAX_RANGE_DAYS`、`LOG_RETENTION_DAYS`、`LOG_EXPORT_ENABLED`。 |
| 验收标准 | 可由一次用户报错定位对应请求链；普通管理员看不到密钥/完整 IP；大范围查询受限且不阻塞主服务。 |

### 5.3 P2 长期拓展

#### P2-1 插件系统与插件目录

| 字段 | 内容 |
|---|---|
| 缺失说明 | 音乐源、贴纸、通知等都是硬编码模块，第三方无法按稳定契约扩展。 |
| 外部依据 | Jellyfin 提供插件目录、安装流程、插件模板及认证/元数据/通知等类别（S6），插件还能注册任务（S7）；Navidrome 以 WASM 沙箱和显式权限声明隔离插件（S21）；Ampache/AzuraCast 也提供分类插件和升级隔离（S22、S23）。 |
| 开发内容 | 插件 manifest、版本兼容、启停、权限声明、配置 schema、生命周期、隔离执行、签名/来源信任、升级回滚；首批扩展点为音乐源、歌词、通知和任务。 |
| 代码改造点 | 将 `metingFm.js`、`cyapi.js`、`apihzSticker.js` 等逐步适配 provider 接口；任务中心和后台开放插件注册点。 |
| 新增模块 | `server/plugins/`、插件 SDK 包、后台插件目录页、示例插件。 |
| 新增配置 | `PLUGINS_ENABLED`、`PLUGIN_DIR`、`PLUGIN_TRUSTED_KEYS`、`PLUGIN_NETWORK_POLICY`。 |
| 验收标准 | 插件可安装/启停/升级/卸载；不兼容版本拒绝加载；插件崩溃不终止主进程；权限和网络访问可审计。 |

#### P2-2 OpenAPI、API Key 与 SDK

| 字段 | 内容 |
|---|---|
| 缺失说明 | 现有 API 是前端内部协议，没有稳定版本、机器身份、权限范围和第三方文档。 |
| 外部依据 | Ampache 提供有示例的公开 API（S2）；AzuraCast 提供继承用户权限的 API Key 和 `X-API-Key`（S13）。 |
| 开发内容 | `/api/v1`、OpenAPI 3.1、API Key 创建/撤销/到期/scope、请求配额、Webhook schema、TypeScript SDK；Socket 公共事件另行版本化。 |
| 代码改造点 | 从 `server/index.js` 抽离版本化路由和 schema 校验；内部客户端逐步使用生成类型，减少 `types.ts` 手工漂移。 |
| 新增模块 | `server/openapi/`、`packages/sdk-typescript/`、后台 API Key 页面。 |
| 新增配置 | `PUBLIC_API_ENABLED`、`API_KEY_MAX_PER_USER`、`API_DEFAULT_RATE_LIMIT`、`OPENAPI_PUBLIC_URL`。 |
| 验收标准 | OpenAPI 校验通过；Key 可按 scope 限制读房间/写歌单；撤销立即生效；SDK 与服务端契约测试通过。 |

#### P2-3 主题与国际化系统

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前界面有丰富视觉预设，但文案和基础设计变量不是可独立发布的主题/i18n 资源。 |
| 外部依据 | Navidrome 提供可主题化的响应式 Web 界面并翻译为多种语言（S1）。 |
| 开发内容 | 文案 key 化、语言包、语言回退、日期/数字格式、主题 token、主题 manifest、用户偏好同步；视觉特效预设与基础 UI 主题分层。 |
| 代码改造点 | 替换 `client/src` 中硬编码中文；整理 `index.css` 颜色 token；设置页增加语言与主题。 |
| 新增模块 | `client/src/i18n/`、`client/src/themes/`、主题验证脚本。 |
| 新增配置 | `DEFAULT_LOCALE`、`ENABLED_LOCALES`、`DEFAULT_THEME`、`CUSTOM_THEME_DIR`。 |
| 验收标准 | 至少中英双语；缺失 key 可检测；切换语言不刷新；主题不会破坏可读性和房间视觉模式。 |

#### P2-4 PWA 与兼容客户端生态

| 字段 | 内容 |
|---|---|
| 缺失说明 | 已有 Web 与 Capacitor 壳，但没有标准音乐客户端协议或可安装的 PWA 离线壳。 |
| 外部依据 | Navidrome 兼容 Subsonic/Madsonic/Airsonic 客户端（S1）；Ampache 提供公开 API（S2）。 |
| 开发内容 | PWA manifest、Service Worker、离线应用壳、更新提示；评估只读/个人库范围的 Subsonic 兼容层，不把多人房间实时协议强行映射到 Subsonic。 |
| 代码改造点 | Vite 构建加入 PWA；服务端增加兼容 API 适配层；Capacitor 与 PWA 共享鉴权和版本提示。 |
| 新增模块 | `client/src/pwa/`、`server/compat/subsonic/`、客户端兼容测试。 |
| 新增配置 | `PWA_ENABLED`、`PWA_UPDATE_CHANNEL`、`SUBSONIC_API_ENABLED`、`SUBSONIC_API_PREFIX`。 |
| 验收标准 | 桌面/移动浏览器可安装；断网可打开应用壳和最近缓存元数据；兼容客户端可登录、浏览、搜索和播放本地库。 |

#### P2-5 媒体源健康与质量治理

| 字段 | 内容 |
|---|---|
| 缺失说明 | 多外部源已有播放失败处理，但没有平台级可用率、链接寿命、音质、地域和回源错误评分。 |
| 外部依据 | Airsonic 对媒体流提供码率、Range 与缓存语义（S8）；OpenTelemetry 提供指标/追踪基础（S11）。本项评分维度是针对 OpenMusic 多源架构的项目化延伸。 |
| 开发内容 | 定时探测源可用率、首字节时间、状态码、有效期、格式/码率；按源/歌曲生成健康分；失败自动降级和后台隔离；不保存违规来源内容。 |
| 代码改造点 | `metingFetch.js`、`cyapi.js`、`mediaProxy.js` 统一返回 provider 诊断；任务中心执行探测；搜索排序读取健康分。 |
| 新增模块 | `server/mediaHealth/`、后台源状态页。 |
| 新增配置 | `MEDIA_HEALTH_ENABLED`、`MEDIA_HEALTH_INTERVAL`、`MEDIA_HEALTH_TIMEOUT_MS`、`MEDIA_SOURCE_CIRCUIT_BREAKER`。 |
| 验收标准 | 后台能比较各源成功率和延迟；连续失败触发熔断；恢复后自动半开探测；播放失败可追踪到具体 provider。 |

#### P2-6 Podcast/网络电台模式

| 字段 | 内容 |
|---|---|
| 缺失说明 | 当前 FM 是随机歌曲队列，不支持 RSS 节目订阅、章节、下载或持续直播流。 |
| 外部依据 | Airsonic-Advanced 提供 Podcast receiver，并支持 Podcast OPML 导出（S8）；AzuraCast 是自托管 Web Radio 管理套件（S3）。 |
| 开发内容 | RSS/Atom 订阅、节目抓取、章节、封面、下载任务、播放进度；网络电台 URL、Now Playing 元数据、断流重连；与普通歌曲队列分开建模。 |
| 代码改造点 | 扩展 `Song` 为可区分 track/episode/liveStream 的媒体项；AudioEngine 处理无固定时长直播；任务中心拉取 feed。 |
| 新增模块 | `server/podcasts/`、`server/radio/`、前端节目与电台页面。 |
| 新增配置 | `PODCAST_DOWNLOAD_PATH`、`PODCAST_REFRESH_SCHEDULE`、`RADIO_RECONNECT_POLICY`、`PODCAST_MAX_STORAGE_GB`。 |
| 验收标准 | 可订阅、刷新和播放节目；重启保留进度；直播断流按策略重连；存储超限按保留策略清理。 |

#### P2-7 自动备份、恢复与升级检查

| 字段 | 内容 |
|---|---|
| 缺失说明 | 现有打包脚本只能构建发布包，没有数据库/Redis/配置/本地媒体元数据的一致性备份和恢复流程。 |
| 外部依据 | AzuraCast 后台支持周期自动备份、一次性备份、下载，并提供 Docker 备份/恢复命令（S14）；Navidrome 提供 cron-like 自动备份与保留数量（S25）。 |
| 开发内容 | 备份清单、数据库 dump、Redis 快照协调、配置脱敏导出、本地媒体元数据备份、校验和、加密、保留策略、恢复演练、版本兼容检查和升级前快照。 |
| 代码改造点 | 任务中心注册备份/校验/清理；后台增加备份管理；部署目录增加 Compose、备份和恢复脚本；应用启动执行 schema 兼容检查。 |
| 新增模块 | `server/backup/`、`deploy/docker-compose.yml`、`scripts/backup.*`、`scripts/restore.*`、后台备份页。 |
| 新增配置 | `BACKUP_PATH`、`BACKUP_SCHEDULE`、`BACKUP_RETENTION_DAYS`、`BACKUP_ENCRYPTION_KEY`、`BACKUP_INCLUDE_MEDIA`、`UPDATE_CHECK_ENABLED`。 |
| 验收标准 | 可从空环境恢复用户、房间配置、歌单和任务记录；备份有校验和且可加密；定期恢复演练有记录；失败不会删除上一份有效备份。 |

## 6. 推荐实施顺序与依赖

| 阶段 | 先后顺序 | 交付门槛 |
|---|---|---|
| M1 平台基础 | P0-1 账号/RBAC → P0-2 后台 → P0-3 审计 → P0-7 风控 | 后台所有写操作有授权、审计和限流 |
| M2 运维基础 | P0-4 任务中心 → P0-5 可观测性 → P1-7 日志检索 | 任务失败、依赖异常和用户报错都可定位 |
| M3 横向扩展 | P0-6 多实例 | 两节点故障演练、幂等测试和压测通过后，删除“单实例”限制 |
| M4 媒体能力 | P1-1 本地库 → P1-2 转码 → P1-5 共享歌单 → P1-3 AutoDJ | 本地媒体从入库到计划播放形成闭环 |
| M5 运营体验 | P1-4 分析 → P1-6 Webhook | 指标口径稳定，外部通知可审计和重放 |
| M6 生态拓展 | P2-2 API → P2-1 插件 → 其余 P2 | 先稳定契约，再开放第三方扩展 |

## 7. 首轮开发建议

首轮不要同时启动所有缺失项。建议先建立以下纵向闭环：

1. PostgreSQL 数据层、用户/角色/会话。
2. 最小后台：登录、用户列表、在线房间、关房。
3. 对后台登录、角色变更和关房写审计日志。
4. 为 HTTP 与 Socket 增加 requestId、结构化日志和基础指标。
5. 使用 Redis 实现统一限流，为后续多实例铺路。

该闭环完成后，项目才具备继续建设任务中心和多实例的稳定控制面。
