# JukeboxRoom v0.0.19

发布日期：2026-11-14（北京时间） · [与上一版比较](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.18...v0.0.19)

## 本版更新

- 咪咕短信登录深度修复：实测确认验证码与「发码时的会话」绑定（Cookie + 固定指纹），旧实现两段式请求互不关联，导致正确验证码也被返回「短信验证码错误或已失效」。新实现发码与登录复用同一会话，并从 token-validate 的响应头/Set-Cookie 正确提取 pacmtoken。
- 登录令牌（STnid…）为一次性凭证，token-validate 严格只调用一次；登录与验证码失败继续透传咪咕通行证的真实原因。
- 已通过真实接口完成发码、登录与用户信息校验的端到端验证；新增 9 项回归测试。

## 下载与发布资产

| 文件 | 用途 |
|---|---|
| [jukeboxroom-desktop-setup-0.0.19-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.19/jukeboxroom-desktop-setup-0.0.19-x64.exe) | Windows x64 安装程序（内置本地服务端，无需安装 Node.js） |
| [jukeboxroom-desktop-setup-0.0.19-x64.exe.blockmap](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.19/jukeboxroom-desktop-setup-0.0.19-x64.exe.blockmap) | Windows 增量更新所需文件 |
| [latest.yml](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.19/latest.yml) | Windows 自动更新版本及 SHA-512 元数据 |
| [SHA256SUMS.txt](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.19/SHA256SUMS.txt) | 发布文件 SHA-256 校验清单 |

## 升级与适用范围

- Windows 用户可下载安装包覆盖安装；操作前建议备份收藏、歌单与本机配置。
- 已支持自动更新的 Windows 客户端可在设置页检查版本，确认下载后重启安装；本版卸载程序保留本机数据。
- 本次只发布 Windows 安装包；Android 暂缓发包，请继续使用现有版本。
- Web / 自托管用户按原部署方式更新；启用管理后台时按部署文档配置首个管理员。

## 已知限制

- Windows 安装包未使用商业代码签名证书，首次运行可能触发 SmartScreen。
- 本版未发布 Android APK 或 iOS IPA。
- 音乐播放、登录、封面和歌词可用性受外部平台、账号权限与网络环境影响；咪咕为实验性非官方接口，上游变更可能导致功能波动。

[本版技术变更](https://github.com/yuchen0x1/JukeboxRoom/blob/v0.0.19/CHANGELOG.md) · [完整发布历史](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md) · [部署说明](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/DEPLOY.md)
