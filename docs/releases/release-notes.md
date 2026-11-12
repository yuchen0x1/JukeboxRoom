# 发布说明历史

## 0.0.15（正式发布，2026-11-12）

- 正式交付 Windows 桌面版 GitHub 自动更新、首屏性能与本机数据保护改进。
- 修复 Windows 发布工作流无法定位 `rcedit.exe` 的问题，并为工具发现逻辑补充回归测试。
- 本次发布 Windows 安装包、自动更新元数据和 SHA-256 清单；Android APK 暂缓发布，待稳定签名配置就绪后再发布。

完整变更见 [CHANGELOG.md](../../CHANGELOG.md)；正式 Release 资产见 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。

## 0.0.14（开发维护版本，未正式发布；维护始于 2026-11-10）

- Windows 桌面端可检查 GitHub Releases 稳定版更新；用户确认下载后可查看实时进度，下载失败会重试一次，并在安装前再次确认。
- 首屏资源按需加载与压缩缓存策略优化，降低常规页面初次加载开销。
- 卸载 Windows 桌面版时保留本机数据；设置页提供数据目录访问与二次确认清理入口。
- 加强媒体代理、房间事件和健康检查边界，并改进 PWA 更新缓存与网络错误处理。
- 本次自动发布流程构建 Windows 安装包、自动更新元数据和 SHA-256 清单；Android APK 暂缓发布，待稳定签名配置就绪后再发布。

完整变更见 [CHANGELOG.md](../../CHANGELOG.md)；正式 Release 资产见 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。
