# 发布前检查清单（RELEASE_CHECKLIST）

> 适用版本：JukeboxRoom v0.0.10 及后续版本。每次发版前逐项勾选，全部通过后才可创建 Tag 并发布 Release。
> 永久规则：代码与发布一律只推送到 GitHub（`https://github.com/yuchen0x1/JukeboxRoom`），不向 Gitee 推送。

## 1. 版本号与元数据

- [ ] 五处版本号已同步更新（示例：`0.0.10` → 下一版本号）：
  - [ ] `package.json`（根）
  - [ ] `client/package.json`
  - [ ] `server/package.json`
  - [ ] `desktop/package.json`
  - [ ] `client/android/app/build.gradle`（`versionCode` +1，`versionName` 同步）
- [ ] `CHANGELOG.md` 顶部已新增本版本条目（日期为发布当天，保留全部历史记录）。
- [ ] `RELEASE_NOTES_CN.md` 与 `RELEASE_NOTES_EN.md` 已更新为本版本内容，中英文一致。
- [ ] Android `versionCode` 严格递增，未与历史版本重复。

## 2. 代码质量检查

- [ ] `git status` 干净，无未提交的业务代码改动；发布相关改动已提交。
- [ ] `npm run check` 通过（服务端测试 + 客户端测试 + 前端构建 + 生产依赖审计）。
  - 参考 v0.0.10 基线：服务端 92 项测试、客户端 17 项测试全部通过；生产依赖审计 0 漏洞。
- [ ] 本版本新增/修改的功能已有对应回归测试（如适用）。
- [ ] 安全自查：新增接口/外部请求是否走既有 SSRF 校验与鉴权链路；新增环境变量已写入 `server/.env.example` 与部署文档。

## 3. 构建产物

- [ ] Windows 桌面版构建：`cd desktop && npm run dist`，产物输出至 `release/desktop/`。
  - 文件名格式：`jukeboxroom-desktop-setup-<版本号>-x64.exe`（附 `.blockmap`）。
- [ ] Android 构建：Capacitor 打包，产物 `release/jukeboxroom-android-<版本号>-debug.apk`。
- [ ] 产物在真实设备/系统上完成冒烟测试：
  - [ ] Windows：安装 → 启动 → 加入房间/播放 → 关闭最小化到托盘 → 托盘退出。
  - [ ] Android：安装 → 搜索/播放 → 后台播放与媒体通知 → 覆盖安装数据保留。
  - [ ] 应用内「更新日志」能加载（动态接口正常，断网时回退静态文件）。
- [ ] 确认桌面版内嵌 server 依赖完整（`desktop/scripts/afterPack.cjs` 逻辑未被破坏，v0.0.8 曾因此出现启动错误）。

## 4. 发布流程

- [ ] 确认当前分支为 `main`、跟踪 `origin/main`，且 `git remote -v` 中 `origin` 指向 GitHub `yuchen0x1/JukeboxRoom`；不得向 Gitee 或其他远程推送。
- [ ] 推送代码：`git push origin main`。
- [ ] 在版本号、日志和构建检查全部完成后创建并推送 Tag：`git tag v<版本号> && git push origin v<版本号>`。
- [ ] 创建 GitHub Release（`gh release create v<版本号>` 或网页端），正文使用 `RELEASE_NOTES_CN.md` 内容（可附英文版链接）。
- [ ] 上传资产：Windows `.exe` + Android `.apk`，文件名与下表一致：

| 资产 | 命名规则 |
|---|---|
| Windows 安装包 | `jukeboxroom-desktop-setup-<版本号>-x64.exe` |
| Android 安装包 | `jukeboxroom-android-<版本号>-debug.apk` |

## 5. 发布后验证

- [ ] Release 页面资产可下载，链接直链有效（`releases/download/v<版本号>/…`）。
- [ ] 线上应用内「更新日志」已出现新版本条目（动态同步生效）。
- [ ] 桌面版/Android 版「检查更新」能检测到新版本。
- [ ] 在应用内完成一次一键更新（自部署环境），升级流程正常。
- [ ] Release 标记为 Latest，历史 Release 未被误删或覆盖。

## 6. 回滚预案

- [ ] 保留上一版本安装包（本地 `release/` 与 GitHub Release 资产）。
- [ ] 如新版本出现严重问题：在 GitHub Release 页面将上一版本重新标记为 Latest，并置顶公告说明回退。
