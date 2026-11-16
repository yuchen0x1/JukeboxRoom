# UPGRADE_REPORT

日期：2026-11-16（Asia/Shanghai）

## A. 交付范围

本轮以当前仓库 main 分支为基线，完成了现状审计、15 个开源项目的对标研究、34 项升级清单，并优先落地外部请求安全、运行时隔离、健康探针、限流协议和可观测性改进。

本轮没有更换技术栈、删除用户数据、复制第三方代码或向 Gitee 推送。远程规则保持为 GitHub origin/main。

## B. 竞品研究

实际研究项目数：15。

最值得借鉴的方向：

- Musare：协作电台的角色、请求和投票治理；
- Mopidy：provider/backend 与播放核心的适配器边界；
- Navidrome、Ampache、Koel：媒体库、搜索、队列和 API/客户端分层；
- Jellyfin、Airsonic-Advanced：设备能力和播放会话状态；
- Syncplay：服务器权威时间戳、重连初始化和漂移控制；
- MPD、Strawberry、Tauon、Lollypop、Quod Libet、Rhythmbox：确定性播放器核心、桌面密度、搜索、队列编辑和插件化。

研究资料与许可证、设计取舍见 COMPETITOR_ANALYSIS.md。没有把第三方项目的宣传文字当成当前产品事实，也没有直接移植 GPL/AGPL 实现。

JukeboxRoom 领先的地方是房间级实时协作、聊天、权限/投票、TV 页面、多音源、AutoDJ、本地曲库和多端发布骨架。明显短板是外部 provider 契约证据、多实例一致性、稳定歌单条目、真实安装升级验收、房间页复杂度和统一错误反馈。

## C. 升级数量与状态

- 发现并形成：34 个独立有效升级点；
- 本轮完成：8 个（EV-001 至 EV-008）；
- 已确认但未实施：24 个；
- 外部条件阻塞：2 个（EV-031 Windows 签名/安装升级、EV-032 Android release 签名/覆盖安装）；
- 本轮没有把未验证的能力标为完成。

### 已完成项

1. QQ 扫码登录重定向主机 allowlist 和逐跳安全请求；
2. provider JSON 请求统一使用安全出站请求器；
3. safeFetch 响应保留多个 Set-Cookie；
4. 运行时不健康时阻断业务 API；
5. 429 返回标准 Retry-After；
6. HTTPS 请求下身份 Cookie 正确设置 Secure；
7. 健康接口返回版本和存储后端；
8. Prometheus 指标增加累计请求耗时和状态码计数。

每项的依据、文件和验收标准见 UPGRADE_ROADMAP.md。

## D. 代码修改

### 修改文件

- server/sourceResolvers.js
- server/outboundUrl.js
- server/rateLimiter.js
- server/runtimeObservability.js
- server/index.js
- server/httpRateLimit.test.js
- server/outboundUrl.stream.test.js

### 新增文件

- server/runtimeObservability.test.js
- server/sourceResolvers.security.test.js
- PROJECT_AUDIT.md
- COMPETITOR_ANALYSIS.md
- UPGRADE_ROADMAP.md
- UPGRADE_REPORT.md

### 文档同步

- README.md：补充本轮安全/健康接口行为和审计文档入口；
- CHANGELOG.md：新增 0.0.21（2026-11-16）发布条目。

本轮没有数据库 schema 迁移。JSON/Redis 数据结构没有被改写。

## E. 实现细节和兼容性

- QQ 登录仍然使用原有 Cookie 罐和手动重定向流程；新增 allowlist 只拒绝未知、非 HTTPS 或带凭据的主机。
- 通用 provider JSON 请求仍保持相同返回结构，新增 DNS/私网/大小/重定向安全边界。
- safeFetch 的 Set-Cookie 适配只增加读取能力，不改变普通响应 API。
- API unhealthy gate 只在 runtime.ready 为 false 时生效；live/ready 健康路径仍可访问。
- Retry-After 是新增响应头，旧客户端继续读取 JSON 的 retryAfter 字段。
- 身份 Cookie 在生产环境仍然强制 Secure；本地明文 HTTP 开发不被强制改变。
- health/live、health/ready、health 现在额外返回 version，ready/health 还返回 storage。

## F. 测试与验证

本轮已运行：

- PASS：node --test server/outboundUrl.stream.test.js server/httpRateLimit.test.js server/runtimeObservability.test.js server/sourceResolvers.security.test.js
- PASS：node --check server/sourceResolvers.js
- PASS：node --check server/index.js
- PASS：node --check server/runtimeObservability.js
- PASS：node --check server/outboundUrl.js
- PASS：git diff --check
- PASS：新增 QQ allowlist、Set-Cookie、Retry-After、runtime gate 和 metrics 回归。

提交前完整门禁：

- PASS：npm run check
- PASS：测试隔离 2 项、服务端 149 项、客户端 57 项、桌面端 13 项，共 221 项通过。
- PASS：TypeScript/Vite 生产构建。
- PASS：check:bundle；Home、Room、TV、Admin 入口均在既有 gzip 预算内，普通入口不加载 Three.js。
- PASS：根目录、server、client 生产依赖审计均为 0 vulnerabilities。
- PASS：git diff --check。

完整 npm test、生产构建、包体检查和依赖审计将在提交前再次运行并把结果写入本报告；这些检查不能替代真实外部音源、Redis 多实例、签名安装包和设备验收。

## G. 未完成项和原因

- 外部音源 fixture、浏览器 CI、多实例 Redis、稳定歌单 entry ID、Room 页面拆分等属于下一批工程任务，需要独立设计和回归，不能用文档代替实现。
- Windows 签名/安装升级需要证书和受控 Windows runner；
- Android release 覆盖安装需要可用签名密钥和设备；
- 真实第三方账号和音乐播放受上游服务、地区、版权和账号权限约束；
- 性能、内存、长时间运行和多实例指标尚无本轮基准，不能编造前后对比数字。

## H. 升级前后变化

升级前：

- QQ 登录重定向安全依赖上游返回内容的关键词判断；
- provider JSON 有裸 fetch 路径；
- runtime 仅影响 readiness，业务请求仍可能继续进入；
- 限流客户端只能依赖 JSON 重试秒数；
- 健康接口缺版本/存储信息；
- Prometheus 只有请求总数。

升级后：

- QQ 登录重定向固定在已知 HTTPS QQ 主机，并逐跳进行 SSRF 校验；
- provider JSON 请求统一经过安全出站请求器；
- 运行时不健康时业务 API 明确返回 503，探针仍可用；
- 429 同时提供 Retry-After 和兼容 JSON；
- 健康接口带版本/存储信息；
- 指标可以观察请求耗时累计值和状态码分布；
- 安全行为和局限有可复核测试、审计和路线图记录。

下一阶段最值得做的是 EV-010/011/013/015/022/025/026：先补 provider、浏览器流程、更新确认、统一错误、幂等、备份和任务重试证据，再进入跨模块协议演进。
