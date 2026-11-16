# UPGRADE ROADMAP

日期：2026-11-16。基于当前 main 分支和 PROJECT_AUDIT.md 建立。EV 项目是独立、有验收标准的改进，不把同一个按钮拆成多个数量。

状态约定：DONE=本轮已实施并有回归证据；PLANNED=已确认价值但尚未实施；BLOCKED=需要外部凭据、设备或架构决策。

| EV | 升级名称 / 模块 | 当前问题与依据 | 对标参考及实现价值 | 改进方案、文件、效果 | 优先级 / 难度 / 状态 | 验收标准 |
|---|---|---|---|---|---|---|
| EV-001 | QQ 登录重定向主机校验 / provider 安全 | check_url 和 HTML 跳转曾可携带任意主机 | Syncplay/成熟服务的协议边界；外部跳转逐跳验证 | 固定 QQ HTTPS 域名 + safeFetch；server/sourceResolvers.js；阻断 SSRF | P0 / 中 / DONE | 恶意内网、非 QQ、HTTP 地址被拒；已加测试 |
| EV-002 | provider JSON 出站统一校验 / provider 安全 | fetchJson 使用裸 fetch | Jellyfin/Navidrome 的后端边界 | safeFetchFollow 统一 DNS、私网、响应上限和重定向；server/sourceResolvers.js | P0 / 中 / DONE | provider 请求通过安全请求器；语法和 provider 回归通过 |
| EV-003 | 运行时不健康业务闸门 / 稳定性 | uncaughtException 后仍可能接业务流量 | 生产服务 readiness 与流量隔离 | runtime.rejectWhenUnhealthy；server/runtimeObservability.js、server/index.js | P0 / 低 / DONE | 业务 API 返回 503；live/ready 探针仍可用 |
| EV-004 | TLS 会话 Cookie Secure 判定 / 安全 | 未设 production 但 HTTPS 代理时 Cookie 可能缺 Secure | 浏览器会话安全惯例 | 结合 req.secure 和生产配置；server/index.js | P0 / 低 / DONE | HTTPS 请求 Set-Cookie 含 Secure；本地 HTTP 开发保持可用 |
| EV-005 | safeFetch 保留 Set-Cookie / provider 会话 | 自定义响应缺少 getSetCookie | QQ/网易扫码会话需要多 Cookie | 增加 getSetCookie 适配；server/outboundUrl.js | P0 / 低 / DONE | 多个 Set-Cookie 原样可读；回归测试通过 |
| EV-006 | 429 标准 Retry-After / API 体验 | 限流只返回 JSON retryAfter | HTTP API 通用限流约定 | rateLimiter 设置 Retry-After，保留旧字段；server/rateLimiter.js | P1 / 低 / DONE | 429 同时含响应头和 JSON 秒数 |
| EV-007 | 健康接口版本/存储信息 / 运维 | 探针无法快速识别版本和存储后端 | Jellyfin/Navidrome 的实例能力/状态信息 | health/live/ready 返回 version、storage；server/index.js | P1 / 低 / DONE | 运行实例返回当前版本和 memory/redis |
| EV-008 | HTTP 耗时与状态码指标 / 观测 | 只有请求总数 | Prometheus 常见低基数 counter | 增加累计耗时和按 status 计数；runtimeObservability.js | P1 / 低 / DONE | metrics 文本含 duration/status 指标 |
| EV-009 | provider 失败率和延迟观测 / 观测 | mediaHealth 有熔断但缺指标 | Jellyfin/Mopidy 的 backend 状态边界 | 记录 provider 请求计数、耗时、熔断；mediaHealth/runtimeObservability | P1 / 中 / PLANNED | metrics 可按 provider 看成功/失败/延迟 |
| EV-010 | 真实音源 fixture 契约测试 / 测试 | 外部接口变化容易回归 | Mopidy backend 测试 | 为 QQ/网易/酷狗响应建立脱网 fixture；server/*provider*.test.js | P1 / 中 / PLANNED | 无公网时能验证搜索、登录状态、播放 URL 解析 |
| EV-011 | 浏览器双会话流程纳入 CI / 测试 | 现有浏览器验收偏本地 | Musare/Syncplay 的协作路径 | CI 安装可用浏览器，运行队列/聊天/权限脚本；.github/workflows/ci.yml | P1 / 中 / PLANNED | PR 中创建/加入/点歌/广播/离开均通过 |
| EV-012 | Redis 双实例一致性验收 / 架构 | 单实例边界未被真实验证 | Socket.IO Redis adapter | compose 启两个服务和 Redis，验证跨实例房间状态 | P1 / 高 / PLANNED | 两实例连接仍能广播且数据一致 |
| EV-013 | 更新操作维护窗口与管理员确认 / 运维 | 自动检查可触发高影响更新 | 桌面/服务端更新流程的人工确认惯例 | 增加 AUTO_UPDATE_APPLY 和维护窗口配置；server/selfUpdate.js、.env.example | P1 / 中 / PLANNED | 默认只检查；满足窗口和显式开关才 apply |
| EV-014 | 共享歌单稳定 entry ID / 数据 | 重复歌曲 ID 难以区分 | Ampache/Koel 的条目级编辑 | 为 entry 加稳定 ID，提供兼容读取迁移；server/playlists | P1 / 高 / PLANNED | 重复歌曲可单独编辑，旧 JSON 可读 |
| EV-015 | API 客户端统一结构化错误 / Web | 部分调用手写 generic Error | Koel/Navidrome 统一 API error | 用 fetchJson/ApiError 覆盖音乐、管理和房间 API；client/src/api | P1 / 中 / PLANNED | UI 展示 status/requestId/retry；无 Unexpected token |
| EV-016 | 房间页拆分和边界收紧 / 可维护性 | Room.tsx 超过 130KB | Mopidy/桌面播放器模块边界 | 拆播放、成员、设置、历史容器，保持 props 协议；client/src/pages/Room.tsx | P1 / 高 / PLANNED | 构建、现有 UI/Socket 回归无行为变化 |
| EV-017 | 统一空/错/重试状态 / UX | 各页面反馈风格不完全一致 | Koel、Navidrome | 抽取 EmptyState/AsyncState；client/src/components | P1 / 中 / PLANNED | 房间、搜索、歌单、管理页均有可操作错误恢复 |
| EV-018 | 键盘快捷键和焦点顺序 / 无障碍 | 桌面队列高频操作仍依赖鼠标 | Strawberry、Quod Libet | 队列搜索、播放、跳歌、关闭弹窗支持快捷键；client | P2 / 中 / PLANNED | Tab 顺序可完成核心操作，焦点可见 |
| EV-019 | 媒体源能力协商 / provider API | 不同音源的音质/歌词/登录能力分散 | Airsonic-Advanced、Jellyfin | /api/music/sources 返回 capabilities；server + client | P2 / 中 / PLANNED | UI 根据能力隐藏不可用动作，错误减少 |
| EV-020 | 封面缩略图缓存指标与上限 / 性能 | 缓存命中率不可见 | Navidrome 媒体库缩略图路径 | 记录命中/淘汰/错误，保持 bounded cache；server/coverUrl.js | P2 / 低 / PLANNED | metrics 可观察命中率且缓存不会无界增长 |
| EV-021 | 房间广播大小和耗时指标 / 性能 | 大房间广播成本没有量化 | Syncplay 状态协议 | 在 prepareRoomBroadcast 记录 payload 字节和耗时；roomManager | P2 / 中 / PLANNED | 低基数指标可定位大广播 |
| EV-022 | 队列动作幂等键 / 稳定性 | 网络重试可能重复点歌 | MPD 命令协议、协作队列 | add_song 接收可选 requestId 并短期去重；server/roomManager、useSocket | P2 / 高 / PLANNED | 同一 requestId 重发只产生一首歌 |
| EV-023 | 断线重连状态提示 / UX | reconnect 逻辑存在但提示层不统一 | Syncplay 重连状态 | 统一 connecting/rejoining/failed banner；client/src/hooks、Room | P2 / 中 / PLANNED | 断网、恢复、永久失败分别可见 |
| EV-024 | 聊天上传取消和重试 / UX | 图片上传失败后恢复路径有限 | Jellyfin/Koel 媒体任务反馈 | AbortController、进度和重试；ChatInputBar、chatImage | P2 / 中 / PLANNED | 用户能取消上传，失败可重试且不重复发送 |
| EV-025 | 备份/恢复命令行工具 / 数据 | JSON 数据有备份但恢复步骤依赖人工 | Ampache/Funkwhale 运维 | 增加列出、校验、导出、恢复到新目录命令；scripts/ | P1 / 中 / PLANNED | 备份可校验 hash，恢复不覆盖在线目录 |
| EV-026 | 任务失败重试和退避 / 自动化 | 任务中心有状态但需统一策略 | Mopidy/成熟任务系统 | 失败分类、指数退避、最大重试、审计事件；server/tasks | P1 / 中 / PLANNED | 模拟临时错误会重试，永久错误明确失败 |
| EV-027 | AutoDJ dry-run 预览 / 自动化 | 补歌决策难以提前检查 | Ampache 智能歌单/自动化 | 增加只计算不写入的 preview API；server/autodj、Admin | P2 / 中 / PLANNED | 预览显示候选、去重原因和预计变更 |
| EV-028 | 本地曲库增量扫描可观测 / 性能 | 扫描进度和失败项信息有限 | Navidrome/Ampache 索引器 | 进度、失败文件、取消和最后扫描时间；server/library、Admin | P2 / 中 / PLANNED | 大目录扫描中途可见进度并可安全取消 |
| EV-029 | API schema/契约文档 / 工程化 | 路由以代码为唯一协议文档 | Navidrome Subsonic API | 生成公开 API/Socket 事件清单，标注 auth/role/error | P2 / 中 / PLANNED | 文档与路由检查脚本能发现缺项 |
| EV-030 | SBOM 和许可证清单 / 发布 | 依赖审计不等于许可证可追踪 | Jellyfin/Funkwhale 发布工程 | CI 生成依赖 SBOM 和许可证报告，不把源码复制进来 | P2 / 中 / PLANNED | Release artifact 含可审计清单 |
| EV-031 | Windows 签名与更新 E2E / 发布 | workflow 有签名入口但本地无证据 | Electron updater、Jellyfin 发布流程 | 在受控 runner 验证签名、安装、更新、启动 | P1 / 高 / BLOCKED | 需 Windows 证书和干净 runner |
| EV-032 | Android release 签名与覆盖安装 / 发布 | 当前 CI 是 debug APK | Capacitor/移动发布 | 配置签名 secret，真机覆盖安装验证数据保留 | P1 / 高 / BLOCKED | 需签名密钥和 Android 设备 |
| EV-033 | provider 插件/适配器边界 / 扩展性 | sourceResolvers 集中且持续变大 | Mopidy plugin architecture | 定义 search/resolve/lyrics/capabilities adapter interface | P2 / 高 / PLANNED | 新 provider 不修改房间核心，契约测试自动发现 |
| EV-034 | 多语言错误消息和诊断 ID / 支持 | 上游错误难以关联用户操作 | Jellyfin/桌面客户端诊断体验 | 保留 requestId/provider code，前端统一映射；server/client | P3 / 中 / PLANNED | 用户提示可读，日志可按 ID 关联，绝不泄露凭据 |

## 近期执行顺序

1. EV-001 至 EV-008 已完成并先行回归。
2. 下一批优先 EV-010、EV-011、EV-013、EV-015、EV-022、EV-025、EV-026。
3. 需要外部凭据/设备的 EV-031、EV-032 保持 BLOCKED，不能用源码存在替代真实验证。
4. EV-012、EV-014、EV-016、EV-033 属于跨模块演进，先补契约和迁移方案，再改生产协议。
