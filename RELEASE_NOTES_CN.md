# JukeboxRoom v0.0.17

> 📅 发布日期：2026-11-13 ｜ 🏷️ Tag：`v0.0.17` ｜ 📦 对比上一正式版本：[v0.0.16...v0.0.17](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.16...v0.0.17)

本版本修复 Windows 系统代理环境下桌面端本机服务和音频播放的兼容性，并保留 v0.0.16 的透明多尺寸 Windows 图标修复。

## 版本亮点

- **系统代理兼容**：外部网络请求继续使用 Windows 系统代理，同时绕过 `localhost`、`127.0.0.1` 和 `::1`，避免代理工具拦截桌面端内置本机服务。
- **音频播放回退**：桌面音频优先通过本机媒体代理播放；代理不可达时自动回退到原始 CDN 地址，交给 Chromium/系统代理重试。
- **错误处理更清晰**：增加音频加载超时、取消、网络中断和格式错误状态，减少“解析成功但无法播放”的误判。
- **回归测试**：覆盖代理绕过规则、播放地址回退、自动更新和桌面打包资源。
- **图标保持一致**：EXE、安装程序、桌面快捷方式、任务栏、窗口标题栏和系统托盘继续使用透明多尺寸图标，无需重新配置。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows 桌面版 | `jukeboxroom-desktop-setup-0.0.17-x64.exe` | x64 NSIS 安装程序，内置本地服务端；同一 Release 提供自动更新元数据与 SHA-256 校验清单。 |

本次 GitHub Actions 只构建 Windows 桌面版。Android APK 暂不随本次 Release 发布，以免使用临时 debug 密钥构建的安装包造成签名不匹配、无法覆盖升级。

## 升级说明

- Windows 用户可从本页下载安装包覆盖安装；桌面版未使用商业代码签名证书，首次运行可能出现 SmartScreen 提示。
- 已安装 v0.0.16 的 Windows 用户可在设置页检查更新，确认下载后重启安装 v0.0.17。
- Web / 自托管用户按原有部署方式拉取 `main` 并重启服务。
- Android 用户请继续使用当前安装版本；本次没有发布新的 APK。

## 已知事项

- Windows 安装包未使用商业代码签名证书，可能触发 SmartScreen 提示。
- Android APK 需要稳定的发布签名配置后再随版本发布。

完整历史见 [CHANGELOG.md](CHANGELOG.md)、[发布说明历史](docs/releases/release-notes.md) 与 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。
