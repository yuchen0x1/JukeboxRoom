# OpenMusic 商业级升级技术分析报告

审计日期：2026-07-17

## 当前评分

| 维度 | 评分 | 结论 |
|---|---:|---|
| 核心多人听歌体验 | 82 | 房间、同步播放、队列、聊天、TV 与沉浸视觉已形成闭环。 |
| 前端视觉与交互 | 76 | 有深色舞台和 3D 差异化；首页与房间页仍有功能堆叠。 |
| 代码组织与维护性 | 62 | 前后端目录清晰，但 Room 页面与服务入口过大。 |
| 性能与容量 | 64 | Room 主包已减重；全量房间广播仍限制大房与横向扩容。 |
| 安全与可靠性 | 65 | 已有 SSRF 链路防护、依赖修复、健康检查与有界内存；测试和分布式限流仍缺。 |
| 运营与商业化 | 28 | 缺账号、RBAC、后台、审计、任务、分析、备份与合规内容链路。 |
| 综合 | 66/100 | 是高完成度单实例社区产品，尚非可直接商用发布的平台。 |

## 架构结论

| 层 | 当前实现 | 主要问题 |
|---|---|---|
| 前端 | React、Vite、TypeScript、Tailwind、Zustand、Socket.IO、Three、Capacitor | 未有统一 Dialog、错误恢复、数据缓存层；3D 未完全按需加载。 |
| 后端 | Node、Express、Socket.IO | HTTP 与 Socket 入口集中，领域边界不足。 |
| 数据 | Redis 可选快照与收藏；大量进程内 Map | 无关系数据库、迁移、事务、审计和任务数据模型。 |
| API | 内部 REST 与 Socket ACK | 无版本化契约、OpenAPI、公共 API Key。 |
| 部署 | 单进程托管静态资源、API、WebSocket | 房间状态在内存，不能直接横向扩容。 |

## 已有能力

- 房间创建、密码、锁定、管理员、踢人、禁言、禁播与点歌规则。
- 播放同步、歌词、协作队列、插播、切歌申请、踩歌、FM 续播。
- 文本、图片、贴纸聊天，回复、提及、reaction、历史、收藏。
- 外部音源聚合、榜单、歌单导入、歌词兜底与媒体代理。
- TV、纯净模式、星河、地形、黑胶等沉浸视觉和移动端壳。

## P0 与 P1 风险

| 优先级 | 风险 | 证据 | 必须动作 |
|---|---|---|---|
| 已修复 | 媒体代理可能经上游跳转访问内网 | server index 与 mediaProxy | 已改为逐跳校验协议、主机名、DNS 解析 IP，并限制重定向次数。 |
| 已修复 | WebSocket 间接依赖需要升级 | server lockfile | 已锁定 ws 8.21.1；生产依赖审计为零漏洞。 |
| P0 | 商用授权不成立 | README 与视觉依赖许可 | 取得音乐、歌词、封面、UGC、AI 和视觉素材商用授权后再收费。 |
| P1 | 单实例权威状态 | roomManager、部署文档 | 已补停机期的本地任务清理；后续仍需 Redis adapter、房间租约、状态版本与 CAS。 |
| 已缓解 | 限流和定位缓存无上限 | server index | 已限制进程内缓存与桶容量；生产限流仍应迁移 Redis/WAF。 |
| P1 | 房间全量状态广播线性膨胀 | roomManager | 演进为 snapshot、patch、resync；成员分页，聊天和播放拆 topic。 |
| P1 | 缺自动化测试 | 仓库无业务测试 | 建立密码、权限、SSRF、Socket ACK、重连、持久化回归测试。 |
| 已缓解 | 房间包超预算 | Room 主包由约 1.17 MB 降至约 486 KB | Three 依赖已拆为按需 `three-vendor`；继续拆分 Room 领域组件。 |

## 竞品功能差距分析表

| 功能 | 优秀项目实现 | 当前项目情况 | 是否添加 | 优先级 |
|---|---|---|---|---|
| 协作入房 | Spotify Jam 的链接、二维码与共享队列 | 已有创建、密码、分享 | 是 | P1 |
| 跨端同步房 | Rave 的移动社交内容房 | 有同步和聊天，移动端偏 Web 壳 | 是 | P2 |
| 本地曲库和转码 | Navidrome、Gonic、Airsonic | 依赖外部音源 | 是 | P1 |
| 多用户和登录 | Jellyfin、Koel 的账号与 SSO | 只有匿名设备身份 | 是 | P0 |
| 后台与权限 | Jellyfin、AzuraCast 的控制面 | 只有单房设置 | 是 | P0 |
| 任务、日志、备份 | Jellyfin、AzuraCast | 无统一体系 | 是 | P0/P2 |
| AutoDJ 与排期 | AzuraCast 的时段和优先级 | 只有随机 FM | 是 | P1 |
| 插件与 Provider | Mopidy、Navidrome、Jellyfin | 音源和贴纸硬编码 | 是 | P2 |
| 开放 API | Ampache、AzuraCast | 只有内部协议 | 是 | P2 |
| 多终端分组 | Lyrion Music Server | 只有 TV 只读显示 | 视定位 | P2 |

## 竞品来源

- Spotify Jam: https://support.spotify.com/us/article/jam/
- Rave: https://rave.io/
- Navidrome: https://www.navidrome.org/
- Jellyfin: https://jellyfin.org/
- Koel: https://github.com/koel/koel
- Ampache: https://ampache.org/
- Gonic: https://github.com/sentriz/gonic
- Airsonic Advanced: https://github.com/airsonic-advanced/airsonic-advanced
- AzuraCast: https://www.azuracast.com/
- Mopidy: https://mopidy.com/
- Lyrion Music Server: https://lyrion.org/
- Nextcloud Music: https://github.com/nc-music/music

## 本次已实施的基础升级

1. 新增运行时观测模块：请求 ID、安全响应头、运行状态与可选 Metrics。
2. 新增存活与就绪健康检查，同时保留旧健康接口。
3. Metrics 默认关闭，可使用令牌保护。
4. TRUST_PROXY 明确控制反向代理信任。
5. 新增全局 React 错误边界，避免未捕获渲染错误导致白屏无恢复入口。
6. 恢复浏览器缩放，并为大厅昵称输入提供可访问名称。
7. 媒体代理改为手动、有限次数的重定向，并对每一跳执行 DNS/私网地址校验。
8. 为 Socket.IO 依赖树锁定安全的 ws 版本，生产依赖审计为零漏洞。
9. 通用弹窗支持 Escape 关闭、焦点圈闭、焦点恢复和 ARIA 对话框语义。
10. 限流桶、IP 定位缓存与媒体主机缓存均改为有界容量，避免长运行的内存累积。
11. 将 Three.js 独立为懒加载 vendor 包：Room 主包约 485.61 KB（gzip 141.76 KB），3D 包约 843.45 KB（gzip 225.84 KB），仅用户启用视觉着色器时请求。
12. 引入 Node 内置测试与质量工作流，先覆盖媒体代理逐跳拦截和图片响应；每次推送、PR 均执行依赖安装、生产审计、语法检查、服务端测试和前端构建。
13. 增加优雅停机：SIGTERM/SIGINT 时停止自动推进、关闭 Socket/HTTP、清理房间管理器后台计时器并安全退出 Redis。

## 三阶段执行计划

### 第一阶段：必须立即修改

| 工作 | 模块 | 实现方式 | 影响 |
|---|---|---|---|
| SSRF 修复 | mediaProxy、server index | 域名 allowlist、逐跳校验、DNS/IP 拦截 | 保护内网与云元数据。 |
| Socket 依赖安全升级 | package 和 lockfile | 升级 Socket.IO 与 ws，执行 Socket 回归 | 修复 DoS 风险。 |
| 测试与 CI | server test、GitHub Actions | 权限、密码、SSRF、重连、持久化测试 | 为后续架构改造提供安全网。 |
| 监控与告警 | runtime 模块、部署栈 | 接 Prometheus、日志采集、告警和优雅停机 | 提升可排障能力。 |
| 通用 Dialog | client components | Esc、焦点圈闭、焦点恢复、背景 inert | 提升无障碍和浮层一致性。 |

### 第二阶段：重要功能升级

| 工作 | 模块 | 实现方式 | 影响 |
|---|---|---|---|
| 账号与 RBAC | PostgreSQL、auth、iam、admin | 保留匿名身份，逐步映射平台和房间权限 | 建立运营基础。 |
| 管理后台与审计 | admin 页面、admin 路由、审计表 | 用户、房间、内容、配置、任务、审计与风控 | 支持运营与合规。 |
| 本地曲库和转码 | library、transcode | 扫描、标签、FFmpeg、Range、缓存 | 降低外部音源依赖。 |
| 共享歌单与 AutoDJ | playlists、autodj | 播放列表、排程、权重、避重 | 提升留存与运营。 |
| 性能拆包 | Room、沉浸组件 | 3D 和手势动态导入，默认轻量模式 | 改善移动端首包。 |

### 第三阶段：高级体验与规模化

| 工作 | 模块 | 实现方式 | 影响 |
|---|---|---|---|
| 多实例实时房间 | Redis adapter、room lease、事件版本 | 兼容全量协议并灰度增量协议 | 支撑 1 万长连。 |
| 数据与任务平台 | Outbox、队列、Worker、分析仓 | 任务幂等、重试、死信和异步分析 | 支撑运营与 AI。 |
| AI 能力 | AI gateway、审核、推荐任务 | 先影子评估，严格超时、预算和降级 | 提升体验但不阻断实时核心。 |
| 插件与开放平台 | Provider、OpenAPI、API Key、SDK | 先内置契约再开放第三方 | 扩展生态。 |
| 商业化与高可用 | billing、CDN、WAF、灾备 | 授权内容、权益、订单、RPO/RTO 演练 | 支撑正式商业发布。 |

## 容量原则

将百万用户拆分为 100 万注册或 MAU、10 万 DAU、峰值 1 到 2 万在线、普通房不超过 200 活跃成员。超大房采用播放、聊天、成员列表分通道和广播分片，不能复用现有全量房间状态广播。

迁移期间保留既有 REST 路径、Socket 事件名和 ACK 字段；先加契约测试和功能开关，再双读、灰度。不要一次性把 roomManager 拆为微服务。
