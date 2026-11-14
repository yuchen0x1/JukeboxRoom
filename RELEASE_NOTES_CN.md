# JukeboxRoom v0.0.20

发布日期：2026-11-14（北京时间） · [与上一版比较](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.19...v0.0.20)

## 本版更新

- 修复更新面板把发布说明显示为 HTML 源码的问题：electron-updater 对 GitHub Release 下发的是转换后的 HTML，面板此前只按 Markdown 语法剥离，导致 `<h1>`、`<a href>` 等标签原样裸露。新增统一纯文本转换（HTML 实体解码、块级标签转换行、列表符号化、Markdown 兜底），桌面版设置页两处与 Web 端更新浮层同步修复。
- 测试样例中的过期短信验证码替换为虚构码（数据清理，无凭据价值）。

## 下载与发布资产

| 文件 | 用途 |
|---|---|
| [jukeboxroom-desktop-setup-0.0.20-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.20/jukeboxroom-desktop-setup-0.0.20-x64.exe) | Windows x64 安装程序（内置本地服务端，无需安装 Node.js） |
| [jukeboxroom-desktop-setup-0.0.20-x64.exe.blockmap](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.20/jukeboxroom-desktop-setup-0.0.20-x64.exe.blockmap) | Windows 增量更新所需文件 |
| [latest.yml](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.20/latest.yml) | Windows 自动更新版本及 SHA-512 元数据 |
| [SHA256SUMS.txt](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.20/SHA256SUMS.txt) | 发布文件 SHA-256 校验清单 |

## 升级与适用范围

- Windows 用户可下载安装包覆盖安装；操作前建议备份收藏、歌单与本机配置。
- 已支持自动更新的 Windows 客户端可在设置页检查版本，确认下载后重启安装；本版卸载程序保留本机数据。
- 本次只发布 Windows 安装包；Android 暂缓发包，请继续使用现有版本。
- Web / 自托管用户按原部署方式更新；启用管理后台时按部署文档配置首个管理员。

## 已知限制

- Windows 安装包未使用商业代码签名证书，首次运行可能触发 SmartScreen。
- 本版未发布 Android APK 或 iOS IPA。
- 音乐播放、登录、封面和歌词可用性受外部平台、账号权限与网络环境影响；咪咕为实验性非官方接口，上游变更可能导致功能波动。

[本版技术变更](https://github.com/yuchen0x1/JukeboxRoom/blob/v0.0.20/CHANGELOG.md) · [完整发布历史](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md) · [部署说明](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/DEPLOY.md)
