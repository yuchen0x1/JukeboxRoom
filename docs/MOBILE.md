# Web 与移动端维护

当前工程基线为 0.0.17。以下维护改进位于 `main`，不表示旧版安装包已包含这些功能，也不改动已有 Release 资产。

| 平台 | 运行方式 | 本轮维护 |
|---|---|---|
| Web / PWA | 浏览器连接自托管服务 | 管理员更新权限、失败及重启状态提示、缓存写入与受限存储兼容 |
| Android | 本机独立播放器，原生 Media3 播放 | 搜索翻页与切源、音源设置、手机版本检查、日志、原生播放及返回键 |
| iOS | 加载已配置 HTTPS 站点的客户端 | 品牌/版本对齐、同步隔离、配置恢复、模拟器编译检查 |

## Android 使用与构建

搜索目前支持网易云与 QQ 音乐。设置中的 Meting HTTPS 地址用于网易云播放解析、热榜与歌词；凭据、查询参数及片段不能填入该地址。设置只保存在当前设备，不会上传到仓库。音乐权限、版权和第三方服务状态仍会影响播放。

“检查 Android 更新”查找实际包含 APK 的稳定 Release。Windows 发了新版本、Android 没有 APK 时，不会向手机用户提示安装 Windows 或降级。更新日志优先在线读取，网络不可用时回退到随包记录。

需要 Node.js、JDK 21、Android SDK 35 和 build-tools 35.0.0：

```bash
npm ci --prefix client
npm run cap:build:apk --prefix client
```

调试 APK 位于 `client/android/app/build/outputs/apk/debug/app-debug.apk`。它不是正式签名发布物；CI 每次生成的 debug 签名也不保证和已安装应用一致。覆盖升级前应核对签名并备份数据。

正式 APK 沿用已有 `keystore.properties` 或 `ANDROID_KEYSTORE_*`/`ANDROID_KEY_*` 环境变量配置，再执行：

```bash
npm run cap:build:apk:release --prefix client
```

不得把证书、私钥或密码写入仓库。Android 同步始终构建本地播放器，不受 iOS 的 `CAPACITOR_SERVER_URL` 影响。

## iOS 同步与编译

在 macOS 配置 Xcode 和 CocoaPods，将 `client/.env.capacitor.example` 复制为 `.env.capacitor`，填写实际可访问的 HTTPS 音乐站点后执行：

```bash
npm ci --prefix client
npm run cap:sync:ios --prefix client
npm run cap:open:ios --prefix client
```

缺少站点地址或使用不安全地址时，同步会在修改工程前失败。远程模式使用 `capacitor-stub`，不删除或覆盖 `client/dist`。原始 Capacitor 配置会在同步成功或失败后恢复。

iOS 保留 `com.openmusic.app` 身份，品牌改为 JukeboxRoom，当前版本元数据为 0.0.17 / 17。它仍是远程站点客户端；不承诺 Android 的本机独立播放或后台音乐服务。真机 IPA 需要用户自己的开发者签名和实际站点。

## 持续检查与验收边界

`.github/workflows/mobile.yml` 在客户端变更时运行：

- Android：JDK 21、SDK 35，构建 debug APK 并运行 lint；产物作为有保留期限的 Actions 调试 artifact 提供，不创建正式 Release。
- iOS：macOS 安装原生依赖，使用保留测试域名 `https://example.invalid` 作为编译配置，构建未签名模拟器应用。此作业只检查原生编译，不发布安装包，也不验证实际站点或真机播放。

本地回归：

```bash
npm test --prefix client
node --test client/scripts/capacitor-config.test.mjs
npm run build
```

已有本机 Playwright/Edge 时可运行 `node scripts/check-mobile-browser.mjs`。它以新浏览器上下文和合成原生桥/API 响应检查移动布局、翻页、搜索竞态、设置、更新和 Web 权限错误；不用真实账号或运行数据。截图保存在系统临时目录。它不能替代 Android 真机后台播放、耳机、通知、签名覆盖安装和 iOS 真机验收。

接口与生命周期依据：[Capacitor 7 iOS](https://capacitorjs.com/docs/v7/ios)、[App 插件](https://capacitorjs.com/docs/v7/apis/app)、[MediaController](https://developer.android.com/reference/androidx/media3/session/MediaController)。
