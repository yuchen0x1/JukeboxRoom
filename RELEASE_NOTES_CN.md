# JukeboxRoom v0.0.11

> 📅 发布日期：2026-11-06 ｜ 🏷️ Tag：`v0.0.11` ｜ 📦 对比上一版本：[v0.0.10...v0.0.11](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.10...v0.0.11)

JukeboxRoom 是支持多人房间点歌的音乐播放系统（Node.js 服务端 + React 网页端，另有 Windows 桌面版与 Android 版）。本次版本是一次**体验大版本**：全站 UI 赛博科技感重构，并新增快捷键、均衡器、跨源换源等实用功能，同时完成一轮深度安全与依赖体检。

---

## ✨ 版本亮点

- 🛸 **全站 UI 赛博科技感重构**：霓虹光晕、全息渐变、扫描线流光、HUD 边角与发光矩阵底网，房间大厅、播放页、桌面端全面换装。
- ⌨️ **完整快捷键体系**：空格播放/暂停、组合键切歌与调音量、`/` 一键聚焦搜索框。
- 🎚️ **五段 Web Audio 均衡器**：原声 / 超重低音 / 清亮人声 / 通透高音 / 沉浸律动，纯前端实时滤波，不占服务器算力。
- 🔀 **跨源智能换源**：当前音源不可播时，自动在其他平台匹配同名可播版本。
- 🛡️ **深度安全体检**：生产与开发依赖 0 漏洞，修复内存节点泄露与多环境兼容缺陷。

## 🆕 新增功能

### 快捷键体系（网页版房间页 / 桌面版）

| 快捷键 | 功能 |
|---|---|
| `Space` | 播放 / 暂停 |
| `Ctrl / Cmd + →` | 下一曲（普通成员自动发起跳歌投票） |
| `Ctrl / Cmd + ←` | 上一曲 / 重播 |
| `Ctrl / Cmd + ↑ / ↓` | 音量增减（5% 步长，实时提示） |
| `/` 或 `Ctrl / Cmd + F` | 聚焦搜索框 |

> 输入框、聊天框、可编辑区域内自动避让，不会误触。

### 五段音频均衡器（EQ）

- 基于 Web Audio API 的 `BiquadFilterNode` 实时链路，5 档预设：**原声无损 / 超重低音 / 清亮人声 / 通透高音 / 沉浸律动**。
- 与房间 3D 频谱视觉链路自动级联，所选预设本地记忆。

### 跨源智能换源

- 按「歌名 + 歌手」在其他音乐平台智能匹配同名可播版本，缓解单平台无版权 / VIP 限制带来的播放失败。

### 歌单导入与导出

- 外部歌单链接解析增强：网易云移动端短链（`163cn.tv`）、QQ 音乐多路径格式（`taoge` / `details` / `tid`）均可直接粘贴导入。
- 房间播放队列新增「导出」按钮，一键导出 JSON 备份，便于迁移与分享。

### 桌面版系统托盘增强

- 托盘菜单动态显示当前播放曲名，并提供「播放 / 暂停」「下一首」快捷控制，无需唤起窗口即可后台切歌。

## 🎨 UI 重构明细

- **首页大厅**：房间卡片升级为「动态节点」样式 —— HUD 四角瞄准框、悬浮升维、发光描边、播放中房间带等离子光柱与 4 柱立体声波律动条；顶部改为仪表盘式 HUD（`ACTIVE NODES` 在线节点计数 + 脉冲状态灯 + 发光矩阵底网）。
- **房间页**：房间号改为等宽终端徽章 `ROOM-ID #xxxxxx`；工作台标签页新增霓虹背光与发光描边；搜索状态栏加入侧边等离子光条。
- **全屏播放页**：黑胶唱片新增慢速自转的全息雷达光环与播放态外发光；主播放键升级为青蓝渐变发光控制中枢。
- **桌面端**：侧边栏激活项霓虹内发光，状态圆点带脉冲光晕。

## 🧹 问题修复与安全性

- 修复 `roomStore` 在 Node / 测试等非浏览器上下文加载即抛 `localStorage is not defined` 的问题（安全读写 + 异常兜底）。
- 修复均衡器在音频链路重复挂载时旧 `BiquadFilterNode` 未断开导致的**音频节点泄露**风险。
- 歌单导出文件名增加 Windows 非法字符清洗，避免下载异常。
- 修复 `coverBackdrop` 重复注释；封面色彩提取保持跨域污染（tainted canvas）兜底，不会引发渲染崩溃。
- 依赖体检：清理客户端开发依赖中的 `glob` / `minimatch` 已知漏洞，`npm run audit:prod` 与全量开发依赖审计均为 **0 漏洞**。
- 回归测试扩充：新增 EQ 预设、歌单导出解析、双语歌词融合等 5 项客户端用例（客户端测试 17 → 22 项，服务端保持 92 项）。

## 📥 下载与安装

| 平台 | 文件名称 | 架构 | 大小 | 说明 |
|---|---|---|---|---|
| 🪟 Windows 桌面版 | [jukeboxroom-desktop-setup-0.0.11-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.11/jukeboxroom-desktop-setup-0.0.11-x64.exe) | x64 | ≈149 MB | NSIS 安装程序，内置本地服务端，无需安装 Node.js |
| 🤖 Android | [jukeboxroom-android-0.0.11-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.11/jukeboxroom-android-0.0.11-debug.apk) | 通用（arm64 等） | ≈38 MB | 独立音乐播放器，无需配置服务器地址 |

> 💡 网页版 / 自部署用户无需下载安装包，直接拉取源码或 Docker 部署即可，参见 [README](https://github.com/yuchen0x1/JukeboxRoom#readme) 与 [部署文档](docs/DEPLOY.md)。

## ⬆️ 安装与升级说明

- **Windows 桌面版**：直接运行安装包覆盖安装即可，用户数据与音源账号凭据保留。首次运行如出现 Windows SmartScreen 提示，请核对下载来源为本项目 GitHub Release 后选择「仍要运行」（当前构建未使用商业代码签名证书）。
- **Android**：下载 APK 后安装；如系统提示「未知来源应用」，允许安装即可。覆盖安装不会清空收藏与本地歌单。
- **自部署（源码 / Docker）**：拉取最新代码后按原有方式重启服务；如已配置一键更新，可在应用内直接完成升级。

## 🖥️ 系统要求

| 端 | 要求 |
|---|---|
| 服务端部署 | Node.js ≥ 20、npm；Redis 可选（未配置时使用内置 JSON 存储，适合小规模单实例部署） |
| Windows 桌面版 | Windows 10/11（x64）；服务端已内置，无需安装 Node.js |
| Android | Android 6.0（API 23）及以上（targetSdk 35） |
| 网络要求 | 应用内更新日志需能访问 `api.github.com`；自部署服务器需能访问音乐源接口 |

## ⚠️ 已知问题

- **未签名发布物**：Windows 安装包未使用商业代码签名证书，首次运行可能触发 SmartScreen 提示；Android 安装包为 debug 签名。
- **均衡器生效条件**：EQ 依赖 Web Audio 链路，在开启 3D 频谱背景（星河 / 声波地形 / 唱片等）时效果最佳；纯封面背景模式下浏览器可能因跨域限制跳过频谱接入。
- **构建体积**：前端 Three.js vendor chunk 较大，Vite 构建时有体积告警（不影响功能）。

## 📋 更新日志

- v0.0.10 → v0.0.11：<https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.10...v0.0.11>
- 完整历史见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases 页面](https://github.com/yuchen0x1/JukeboxRoom/releases)。

## 🙏 致谢

- 感谢以下开源项目支撑本项目运行：[Node.js](https://nodejs.org)、[Express](https://expressjs.com)、[Socket.IO](https://socket.io)、[React](https://react.dev)、[Vite](https://vite.dev)、[Electron](https://www.electronjs.org)、[Capacitor](https://capacitorjs.com) 等。
- 感谢音乐源聚合接口（Meting）及其上游各音乐平台。
- 感谢 GitHub 生态与社区用户在 [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) 与 QQ 交流群中的反馈。
