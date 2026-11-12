# 发布说明历史

## 0.0.15（正式发布，2026-11-13）

- Windows 桌面版新增咪咕音乐（实验性）搜索、播放和手机号短信验证码登录。
- 登录令牌使用 AES-256-GCM 加密保存在本机，手机号和短信验证码不写入磁盘；设置页支持查看登录状态和退出登录。
- 增加咪咕媒体 CDN 白名单与健康检查，并优化网易云播放失败时的配置和切换音源提示。
- 咪咕接入使用非官方社区接口，可能随上游变化失效；本次继续发布 Windows 安装包、自动更新元数据和 SHA-256 清单，Android APK 暂缓。

完整变更见 [CHANGELOG.md](../../CHANGELOG.md)；正式 Release 资产见 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。

## 0.0.14（正式发布，2026-11-12）

- 正式交付 Windows 桌面版 GitHub 自动更新、首屏性能与本机数据保护改进。
- 修复 Windows 发布工作流无法定位 `rcedit.exe` 的问题，并为工具发现逻辑补充回归测试。
- 加强媒体代理、房间事件和健康检查边界，并改进 PWA 缓存升级与网络错误处理。
- 本次发布 Windows 安装包、自动更新元数据和 SHA-256 清单；Android APK 暂缓发布，待稳定签名配置就绪后再发布。

完整变更见 [CHANGELOG.md](../../CHANGELOG.md)；正式 Release 资产见 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。
