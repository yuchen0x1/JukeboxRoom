# JukeboxRoom v0.0.10

> 📅 发布日期：2026-11-04 ｜ 🏷️ Tag：`v0.0.10` ｜ 📦 对比上一版本：[v0.0.9...v0.0.10](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.9...v0.0.10)

JukeboxRoom 是支持多人房间点歌的音乐播放系统（Node.js 服务端 + React 网页端，另有 Windows 桌面版与 Android 版）。本次版本让应用内「更新日志」自动同步 GitHub Releases，从此发布新版不再需要随包更新日志文件。

---

## ✨ 版本亮点

- 🔄 **应用内更新日志动态化**：「更新日志」窗口改为实时读取 GitHub Releases 说明，新版发布后自动展示最新条目，彻底解决日志遗漏、过期的问题。
- 🛟 **离线兜底**：网络不可用或接口异常时，自动回退到随包内置的 `changelog.md`，并按版本号去重，不会出现重复或空白。
- 📜 **日志补齐**：随包内置日志补齐 v0.0.8、v0.0.9 条目，历史版本记录完整可查。

## 🆕 新增功能

### 应用内更新日志动态同步（桌面版 / Android 版 / 网页版）

- 服务端新增 `GET /api/update/changelog` 接口：从 GitHub Releases API 读取最近发布说明（最多 15 条），服务端缓存 10 分钟，减轻上游请求压力。
- 接口支持通过 `UPDATE_GITHUB_TOKEN`（只读令牌）提升 GitHub 匿名请求限额，避免限流导致日志加载失败。
- GitHub 请求地址沿用既有安全校验链路（URL 白名单 + DNS 校验），保持与更新检查相同的 SSRF 防护边界。

## 🔧 功能优化

- 「更新日志」展示逻辑重写：优先展示动态接口内容，失败时合并回退静态 `changelog.md`，并按版本号去重展示。
- 客户端请求携带中断控制器（AbortController），关闭弹窗时立即取消进行中的请求。

## 🧹 问题修复

- 补齐 v0.0.8、v0.0.9 的随包更新日志条目，历史版本在应用内不再缺失。

## 📥 下载与安装

| 平台 | 文件名称 | 架构 | 大小 | 说明 |
|---|---|---|---|---|
| 🪟 Windows 桌面版 | [jukeboxroom-desktop-setup-0.0.10-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.10/jukeboxroom-desktop-setup-0.0.10-x64.exe) | x64 | ≈149 MB | NSIS 安装程序，内置本地服务端，无需安装 Node.js |
| 🤖 Android | [jukeboxroom-android-0.0.10-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.10/jukeboxroom-android-0.0.10-debug.apk) | 通用（arm64 等） | ≈38 MB | 独立音乐播放器，无需配置服务器地址 |

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
- **GitHub 限流**：未配置 `UPDATE_GITHUB_TOKEN` 时，应用内更新日志依赖匿名 GitHub API 请求，遇到限流时自动回退静态日志（内容可能略旧）。
- **构建体积**：前端 Three.js vendor chunk 较大，Vite 构建时有体积告警（不影响功能）。

## 📋 更新日志

- v0.0.9 → v0.0.10：<https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.9...v0.0.10>
- 涉及提交：`0c35771` feat: 应用内更新日志动态同步 GitHub Releases，补齐 0.0.8/0.0.9 条目
- 完整历史见 [CHANGELOG.md](CHANGELOG.md) 与 [Releases 页面](https://github.com/yuchen0x1/JukeboxRoom/releases)。

## 🙏 致谢

- 感谢以下开源项目支撑本项目运行：[Node.js](https://nodejs.org)、[Express](https://expressjs.com)、[Socket.IO](https://socket.io)、[React](https://react.dev)、[Vite](https://vite.dev)、[Electron](https://www.electronjs.org)、[Capacitor](https://capacitorjs.com) 等。
- 感谢音乐源聚合接口（Meting）及其上游各音乐平台。
- 感谢 GitHub 生态与社区用户在 [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) 与 QQ 交流群中的反馈。
