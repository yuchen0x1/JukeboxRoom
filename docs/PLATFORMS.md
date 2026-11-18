# 平台支持与维护状态

## v0.0.22 基线

仓库采用 MIT。审计从 `b007a98` 开始，`main` 与 GitHub 同步。根目录协调构建，`client/` 使用 React、Vite、TypeScript、Zustand 和 Socket.IO 客户端，`server/` 使用 Express、Socket.IO、内存房间状态、JSON 存储及可选 Redis。Electron 负责独立 Windows 主进程、本地服务、受限 IPC、托盘和打包。本地 Android 使用独立的 React 播放器与 Capacitor/Media3 原生桥；iOS 工程加载部署者 HTTPS 站点。容器、PM2 与反代在 `deploy/`、`Dockerfile` 和 Compose 下维护，`website/` 是宣传页。

现有功能包括大厅、带密码的房间、房间分享、点歌队列和投票、点赞与跳歌审批、播放同步与重连、多音源和账号授权、逐字歌词、聊天和表情、热榜、收藏与歌单、AutoDJ、TV、大屏与 3D 视觉模式、管理员、审计任务、本地曲库和健康指标。持久数据包括应用设置、管理员和用户、歌词/收藏与歌单相关数据、曲库和可选 Redis 房间状态；内存房间会随重启丢失。升级沿用已有目录与 API，未新增数据表或数据迁移。

基线 227 个现有测试通过，Web 构建与本地大厅、加入房间、健康接口通过。原始 Release 仅有 Windows x64 安装器、区块映射、更新元数据及 SHA-256。生产 npm 审计未报漏洞；完整审计分别在 client 和 desktop 的开发依赖报出高危公告。项目仍受第三方音源、凭据、浏览器自动播放限制、WebGL/GPU 和偶发上游不可用影响。Node.js 20 已结束官方维护。 [Node.js 发布周期](https://nodejs.org/en/about/previous-releases)

## 平台决策

A 表示本轮重点，B 表示继续维护并补齐候选平台条件，C 表示投入择期，D 表示当前分发或能力不匹配。桌面浏览器与 PWA 使用同一套房间协议，Windows 和 Android 仍保留独立播放器。

| 候选平台 | 决策 | 核心兼容性、设备/权限、发行与更新 |
|---|---:|---|
| Windows 10 x64 | B | 已有窗口、快捷键及托盘，安装保留数据。旧系统支持需核对 Electron 和 Windows 生命周期；签名与真机验收成本中。 |
| Windows 11 x64 | B | 托盘、独立音乐和本机服务有价值。NSIS 和 Authenticode 可分发，发布者签名及安装/升级/回滚验收待完成。 |
| Windows ARM64 | C | 需 Electron ARM 产物、依赖和真机验收，先维持 x64。 |
| Linux 通用桌面 | C | Web/PWA 支持房间；独立 AppImage 牵涉包格式、沙盒与更新。 |
| Ubuntu 桌面 | C | DEB/AppImage 可行，仍需验证 LS 依赖、系统通知和音频会话。 |
| Debian 桌面 | C | 可沿用浏览器；DEB 需要发行版依赖、包签名和升级路径。 |
| Fedora 桌面 | C | RPM/Flatpak 需要权限、打包及包库运行测试。 |
| Arch Linux 桌面 | C | Rolling 依赖与 AUR 发行需要长周期维护；浏览器可用。 |
| macOS Intel | C | 浏览器可用；独立客户端需 Intel 构建、权限、Keychain、公证、真实安装与回滚。 |
| macOS Apple Silicon | C | 浏览器可用；DMG、签名/公证、系统媒体与权限需硬件验证。 |
| Android 手机 | B | 独立播放器和媒体桥已有，搜索/播放依赖源与系统权限，正式 APK 和同签名升级需密钥及设备。 |
| Android 平板 | B | 响应式 Web 可参与房间；独立 APK 需验收横屏、分屏、长队列和媒体通知。 |
| 折叠屏 | B | 使用响应式 Web；APK 适配需验证折叠、旋转、状态保留与后台音频。 |
| iOS | C | 优先 Safari Web/PWA。远程站点 Xcode 工程继续编译检查；独立后台播放、签名、App Store 发布和维护成本高。 |
| iPadOS | C | 优先 Web；要独立应用需增加分屏、键盘、尺寸与 App Store 验收。 |
| 桌面 Web | A | 同步房间、管理和大屏完整；需 HTTPS、浏览器音频权限及可访问媒体源，站点部署更新。 |
| 移动 Web | A | 同一房间协议与响应式触控界面；移动浏览器限制自动播放、后台定时和媒体。 |
| 响应式 Web | A | 走同源 API 与 Socket.IO，保持大厅、队列、聊天和设置适应窄屏。 |
| PWA | A | HTTPS 站点可安装，离线大厅、用户确认刷新；房间与媒体依赖网络。 |
| Chrome 扩展 | D | 扩展商店权限和更新渠道开销较高，安装场景由网站/PWA 覆盖。 |
| Edge 扩展 | D | 同上，另需独立商店审核和维护。 |
| Firefox 扩展 | D | 后台媒体和扩展权限不同，浏览器版足以覆盖房间能力。 |
| Docker | A | Node.js 24 镜像、自托管 API 与前端；挂载卷和反代，更新通过重建与切换容器。 |
| NAS | B | 兼容 Docker 的 NAS 可尝试 Compose，需核对 CPU 架构、存储权限、备份和 WebSocket 转发。 |
| 私有化部署 | A | 官方部署包与 Git 支持。需管理员、独立目录和生产密钥，使用发布标签和健康探针。 |
| 云服务器 | A | Node/容器加 HTTPS/反代，低成本覆盖 Web；升级按镜像/部署包，按需配置 Redis。 |
| CLI | C | 健康检查已有命令。纯终端播放、授权和聊天价值有限，系统音频及跨平台发布成本高。 |

手机版浏览器的播放策略和 PWA 安装能力由浏览器与系统决定。平台测试证明范围以 CI 和真实设备验收为准。 [移动端构建](MOBILE.md) · [自动更新](AUTO_UPDATE.md)

## 持续维护

| 能力 | 维护入口 | 验收边界 |
|---|---|---|
| Web/PWA、Node、Docker | CI 在 Node 22/24 跑版本、单元、集成及打包检查；Docker 检查首页、健康和容器重启 | 真实上游音源、多房间长时负载、生产 CDN 和真实 NAS 待专项测试 |
| Windows | Release 工作流构建 x64；验签后才随发行发布 | 实际证书、Windows 10/11 应用原地升级和自动回滚需验收 |
| Android | Mobile workflow 生成带检查的调试 APK | 正式签名、后台播放、真机平板和折叠屏待验收 |
| iOS | Mobile workflow 编译未签名模拟器 | 原生播放器、真实配置、真机包和商店审批待办 |
| GitHub | `main` 禁止强推、删除；所有正式 Release 不可变；PR 依赖审查，定期审计和校验下载 | 内部直接推送仍按仓库规则，维护者在发版前确认目标提交的 CI |

GitHub 默认工作流 token 为只读，发布和 README 同步作业单独声明写权限。公开仓库有私密漏洞报告、Secret Scanning 和 Push Protection。首次设置时没有可用的仓库签名 Secrets。已保留官网、Topics、Issues 和 Wiki。首次变更涉及现有 npm 组件与平台工具，采用 [同类项目研究](ECOSYSTEM-RESEARCH.md) 的设计参考，未导入外部项目代码。每个发行按 [发布流程](AUTO_UPDATE.md) 验证受影响平台。
