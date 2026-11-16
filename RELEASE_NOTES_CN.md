# JukeboxRoom v0.0.21

发布日期：2026-11-16（北京时间） · [与上一版比较](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.20...v0.0.21)

## 本版更新

- 收紧 QQ 扫码登录的回调地址校验：仅允许已知 HTTPS QQ 登录域名，并对响应重定向与 HTML 跳转逐跳执行 DNS、私网地址和 SSRF 校验。
- provider JSON 请求统一使用安全出站请求器，限制 DNS、私网目标、重定向和响应大小；受控扫码会话保留多个 `Set-Cookie`。
- 进程进入不健康状态后，健康探针仍可访问，但新的业务 API 请求明确返回 503；429 响应增加标准 `Retry-After`。
- 健康接口补充版本与 memory/redis 存储信息；Prometheus 指标增加累计请求耗时和按状态码统计；HTTPS 下身份 Cookie 按 `req.secure` 设置。
- 新增可部署到 EdgeOne Pages 的静态宣传页，更新首页截图并补充官网入口；桌面构建依赖锁定 `minimatch` 11.0.1。

## 下载与发布资产

| 文件 | 用途 |
|---|---|
| [jukeboxroom-desktop-setup-0.0.21-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.21/jukeboxroom-desktop-setup-0.0.21-x64.exe) | Windows x64 安装程序（内置本地服务端，无需安装 Node.js） |
| [jukeboxroom-desktop-setup-0.0.21-x64.exe.blockmap](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.21/jukeboxroom-desktop-setup-0.0.21-x64.exe.blockmap) | Windows 增量更新所需文件 |
| [latest.yml](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.21/latest.yml) | Windows 自动更新版本及 SHA-512 元数据 |
| [SHA256SUMS.txt](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.21/SHA256SUMS.txt) | 发布文件 SHA-256 校验清单 |

## 升级与适用范围

- Windows 用户可下载安装包覆盖安装；操作前建议备份收藏、歌单与本机配置。
- 已支持自动更新的 Windows 客户端可在设置页检查版本，确认下载后重启安装；本版卸载程序保留本机数据。
- 本次只发布 Windows 安装包；Android 与 iOS 暂缓发包，请继续使用现有版本。
- Web / 自托管用户按原部署方式更新；启用管理后台时按部署文档配置首个管理员。

## 已知限制

- Windows 安装包未使用商业代码签名证书，首次运行可能触发 SmartScreen。
- 本版未发布 Android APK 或 iOS IPA。
- 音乐播放、登录、封面和歌词可用性受外部平台、账号权限与网络环境影响；咪咕为实验性非官方接口，上游变更可能导致功能波动。

[本版技术变更](https://github.com/yuchen0x1/JukeboxRoom/blob/v0.0.21/CHANGELOG.md) · [完整发布历史](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md) · [部署说明](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/DEPLOY.md)
