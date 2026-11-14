# JukeboxRoom 宣传页（静态落地页）

纯静态单页，无构建步骤、无外部依赖。托管在腾讯云 EdgeOne Pages。

## 本地预览

直接双击 `index.html`，或：

```bash
python -m http.server 8765
# 打开 http://127.0.0.1:8765
```

## EdgeOne Pages 部署（Git 方式，推荐）

在 EdgeOne Pages 控制台「创建项目 → 导入 Git 仓库」选择 `yuchen0x1/JukeboxRoom`，按如下配置：

| 配置项 | 值 |
|---|---|
| 框架预设 | 无框架 / 静态站点 |
| 根目录 | `/` |
| 构建命令 | 留空 |
| 输出目录 | `website` |

保存后每次推送 `main` 会自动重新部署，分配的默认域名为 `*.edgeone.app`。

## 替代方式：拖拽上传

不需要自动更新时，也可以把 `website/` 目录里的全部文件（`index.html` 和 `assets/`）直接拖到 EdgeOne Pages「直接上传」入口，立即生成链接；后续改动需手动重新上传。

## 目录结构

```text
website/
├── index.html   # 单文件页面（内联 CSS/JS）
└── assets/      # favicon 与界面截图（来自 docs/screenshots）
```

页面内容与 README 的产品描述保持同步；更新产品特性时请一并检查本页文案。
