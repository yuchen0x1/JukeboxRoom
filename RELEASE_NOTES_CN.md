# JukeboxRoom v0.0.24

发布日期：2026-11-27（北京时间） · [与上一版比较](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.23...v0.0.24)

## 本版更新

- 修复 Socket.IO 首次连接超时后的重试挂起，以及离开/切换房间后迟到的重连响应覆盖当前会话。
- 修复 Windows 下服务端测试隔离断言读取 TAP 转义路径失败。
- 修复生产环境一键自更新因 `NODE_ENV=production` 未安装前端 TypeScript/Vite 构建依赖的问题。
- 服务端最低运行版本明确为 Node.js 24+，与当前依赖实际要求一致。

## 下载与发布资产

| 文件 | 用途 |
|---|---|
| `jukeboxroom-server-0.0.24.zip` | Node.js 24+ 自托管部署包 |
| `jukeboxroom-web-0.0.24.tar.gz` | Web/PWA 静态资源 |
| `jukeboxroom-desktop-setup-0.0.24-x64.exe` | 未签名 Windows x64 安装程序，兼容旧版更新提示 |
| `jukeboxroom-desktop-setup-0.0.24-x64.exe.blockmap` | Windows 更新差分元数据 |
| `latest.yml` | Windows 更新版本与 SHA-512 元数据 |
| `SHA256SUMS.txt` | 本次公开 Release 资产 SHA-256 清单 |

## 升级与适用范围

- Web/PWA 用户会看到新版本提示，并可在方便时刷新。
- 自托管服务端请先升级到 Node.js 24+；既有数据目录与配置格式不变。
- Windows 签名凭据未配置，本版仍发布未签名 Windows 安装包、`latest.yml` 和 `.blockmap`，以保持旧版更新提示；首次运行可能触发 SmartScreen，新安装不会启用后续应用内更新。本版不发布 Android APK 或 iOS IPA。

## 验证结果

- 服务端 151 项测试通过，其中更新模块 14 项。
- 客户端 61 项测试、TypeScript 检查、生产构建和包体预算检查通过。
- 桌面更新 13 项测试通过。
- 根、服务端、客户端和桌面生产依赖审计均为 0 个已知漏洞。
- Windows 安装升级、Android/iOS 真机和外部音乐平台长时间播放未在本次验证。

## 已知限制

- Windows x64 安装包未签名；旧桌面版可通过本次 Release 获取更新，新安装不会启用后续应用内更新。
- Node.js 20/22 不再支持当前服务端依赖组合。
- 音乐播放、登录、封面和歌词可用性受外部平台、账号权限与网络环境影响。

[完整版本历史](docs/releases/release-notes.md) · [部署说明](docs/DEPLOY.md)
