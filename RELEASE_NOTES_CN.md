# JukeboxRoom v0.0.15

> 📅 发布日期：2026-11-12 ｜ 🏷️ Tag：`v0.0.15` ｜ 📦 对比上一正式版本：[v0.0.13...v0.0.15](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.13...v0.0.15)

本版本完成 Windows 桌面端 GitHub 自动更新接入，并汇总近期的性能、稳定性和数据安全改进。

## 版本亮点

- **Windows 桌面自动更新**：检查 GitHub Releases 稳定版本；由用户决定是否下载，显示真实进度，下载完成后确认即可退出并安装。
- **Windows 发布修复**：修复 GitHub Actions runner 找不到 `rcedit.exe` 导致安装包未生成的问题。
- **首屏更轻快**：Three.js 延迟到需要 3D 视觉效果时加载；静态资源压缩并采用分级缓存。
- **本机数据更安全**：卸载桌面版时保留用户数据；设置页可打开数据目录，或在二次确认后清理数据。
- **稳定性与安全增强**：收紧媒体代理访问边界，修复多个房间事件、健康检查与 API 错误处理边界，并改善 PWA 更新缓存和网络错误提示。

## 下载

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows 桌面版 | `jukeboxroom-desktop-setup-0.0.15-x64.exe` | x64 NSIS 安装程序，内置本地服务端；同一 Release 提供自动更新元数据与 SHA-256 校验清单。 |

本次 GitHub Actions 只构建 Windows 桌面版。Android APK 暂不随本次 Release 发布，以免使用临时 debug 密钥构建的安装包造成签名不匹配、无法覆盖升级。

## 升级说明

- Windows 用户可从本页下载安装包覆盖安装；桌面版未使用商业代码签名证书，首次运行可能出现 SmartScreen 提示。
- Web / 自托管用户按原有部署方式拉取 `main` 并重启服务。
- Android 用户请继续使用当前安装版本；本次没有发布新的 APK。

## 已知事项

- Windows 安装包未使用商业代码签名证书，可能触发 SmartScreen 提示。
- Android APK 需要稳定的发布签名配置后再随版本发布。

完整历史见 [CHANGELOG.md](CHANGELOG.md)、[发布说明历史](docs/releases/release-notes.md) 与 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。
