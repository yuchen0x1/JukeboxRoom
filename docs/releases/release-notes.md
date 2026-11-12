# 发布说明历史

## 0.0.14（持续维护，2026-11-12）

- Windows 桌面版接入基于 GitHub Releases 的真实自动更新：只检查稳定版本，下载前征得用户确认，显示真实进度，失败自动重试一次，下载完成后由用户确认退出并安装。
- 增加 GitHub Actions CI 与 tag 发布流程；发布流程只接受版本一致的 `vX.Y.Z` tag，并把更新元数据与 Windows NSIS 安装包上传到 GitHub。
- 明确 Web、自托管、Windows、Android/iOS 的更新边界、回滚方式和未签名构建的 SmartScreen 限制。

完整的历史变更见 [CHANGELOG.md](../../CHANGELOG.md)；正式 Release 资产见 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)。
