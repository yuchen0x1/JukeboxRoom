# JukeboxRoom v0.0.13

> 📅 发布日期：2026-11-08 ｜ 🏷️ Tag：`v0.0.13` ｜ 📦 对比上一版本：[v0.0.12...v0.0.13](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.12...v0.0.13)

JukeboxRoom v0.0.13 是「管理后台」版本：新增独立管理后台与登录页、普通用户自助注册、首个超级管理员环境变量引导，以及带安全边界的角色管理体系。此前版本的赛博科技感 UI、快捷键、均衡器、跨源换源等基线全部保留。

---

## ✨ 版本亮点

- 🛡️ **完整管理后台**：概览、用户、房间、任务、审计、曲库、AutoDJ 七个页签，一站式运营。
- 👤 **账号体系闭环**：后台登录页支持普通账号自助注册，普通用户永远无法借注册进入后台。
- 👑 **角色安全管理**：超级管理员可在线调整角色，且不可自降、不可降级最后一个超管。
- 🔑 **无默认密码**：首个超级管理员只由环境变量显式引导创建，仓库与日志中不存在任何固定凭据。
- 🏠 **房间管理增强**：管理员可全服公告、强制关闭房间。

## 🆕 新增功能

### 独立管理后台（`/admin`）

- 七个管理页签：**概览**（系统健康与概况）、**用户**（搜索 / 封禁 / 角色调整）、**房间**（列表 / 公告 / 强制关闭）、**任务**（定义 / 运行 / 历史）、**审计**（操作日志）、**曲库**（本地歌曲与扫描）、**AutoDJ**（状态与开关）。
- 首页底栏新增「管理后台」入口，路由懒加载，不影响首屏体积。

### 登录与注册

- 独立登录页 `/admin/login`，登录 / 注册模式一键切换。
- 管理员会话以 access/refresh token 存储，请求自动携带 `Authorization: Bearer`，401 时自动清理本地会话。
- 普通账号登录管理后台会被明确拒绝：「该账号不是管理员，无法进入管理后台」。
- 公开注册永远只创建 `user` 角色，服务端忽略任何请求中携带的提权字段。

### 首个超级管理员引导

```env
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=请替换为至少 8 位随机密码
```

- 两项必须**同时**配置，只配置一项会在启动时告警并跳过。
- 用户名长度 2-32、密码长度 8-128，且不能与已有用户重名。
- 创建成功后日志只打印用户名，**绝不打印密码**；创建完成后可移除环境变量。
- 桌面版不执行该初始化（Web 后台仅面向自部署场景）。

### 角色管理与安全边界

- 超级管理员可在用户页直接调整角色：`超级管理员 / 管理员 / 主持人 / 普通用户`。
- 普通管理员不能修改任何角色；超级管理员不能降低自己的权限；不能降级最后一个超级管理员。
- 角色变更后立即撤销目标用户的 refresh session，权限即时生效；管理员被封禁时同步撤销其 refresh session。

### 房间管理

- `POST /api/admin/rooms/:id/announce`：管理员向房间发布全服公告。
- `POST /api/admin/rooms/:id/close`：管理员强制关闭房间，清理内存与持久化数据（种子测试房除外）。

## 🎨 UI 与体验

- 管理后台沿用全站赛博 HUD 视觉体系：终端徽章、霓虹描边、玻璃拟态卡片。
- 用户列表角色徽章区分四级：金色（超级管理员）、青蓝（管理员 / 主持人）、灰蓝（普通用户）。
- 未登录访问 `/admin` 自动跳转登录页，登录成功后原路返回后台。

## 🧹 问题修复与安全性

- 补全普通用户角色徽章 `.role-badge-user` 缺失的样式定义。
- 首个管理员初始化杜绝固定默认密码设计，避免「出厂即被登录」风险。
- 角色与封禁操作均写入审计日志，可追溯。
- 回归测试扩充：新增初始管理员引导、注册提权、角色安全边界等用例（服务端测试 92 → **94** 项，客户端 22 项，全部通过）。

## 📥 下载与安装

| 平台 | 文件名称 | 架构 | 大小 | 说明 |
|---|---|---|---|---|
| 🪟 Windows 桌面版 | [jukeboxroom-desktop-setup-0.0.13-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.13/jukeboxroom-desktop-setup-0.0.13-x64.exe) | x64 | ≈149 MB | NSIS 安装程序，内置本地服务端，无需安装 Node.js |
| 🤖 Android | [jukeboxroom-android-0.0.13-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.13/jukeboxroom-android-0.0.13-debug.apk) | 通用（arm64 等） | ≈38 MB | 独立音乐播放器，无需配置服务器地址 |

> 💡 网页版 / 自部署用户无需下载安装包，直接拉取源码或 Docker 部署即可，参见 [README](https://github.com/yuchen0x1/JukeboxRoom#readme) 与 [部署文档](docs/DEPLOY.md)。

## ⬆️ 安装与升级说明

- **Windows 桌面版**：直接运行安装包覆盖安装即可，用户数据与音源账号凭据保留。首次运行如出现 Windows SmartScreen 提示，请核对下载来源为本项目 GitHub Release 后选择「仍要运行」（当前构建未使用商业代码签名证书）。
- **Android**：下载 APK 后安装；如系统提示「未知来源应用」，允许安装即可。覆盖安装不会清空收藏与本地歌单。
- **自部署（源码 / Docker）**：拉取最新代码后按原有方式重启服务；**启用管理后台前先配置 `ADMIN_INIT_USERNAME` / `ADMIN_INIT_PASSWORD`**，创建首个超级管理员后可移除。

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

- v0.0.12 → v0.0.13：<https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.12...v0.0.13>
- 完整历史见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases 页面](https://github.com/yuchen0x1/JukeboxRoom/releases)。

## 🙏 致谢

- 感谢以下开源项目支撑本项目运行：[Node.js](https://nodejs.org)、[Express](https://expressjs.com)、[Socket.IO](https://socket.io)、[React](https://react.dev)、[Vite](https://vite.dev)、[Electron](https://www.electronjs.org)、[Capacitor](https://capacitorjs.com) 等。
- 感谢音乐源聚合接口（Meting）及其上游各音乐平台。
- 感谢 GitHub 生态与社区用户在 [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) 与 QQ 交流群中的反馈。
