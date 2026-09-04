# 依赖安全审计记录

> 审计日期：2026-08-04
> 依据：`06-综合升级路线图.md` 阶段一 M1 门禁「npm audit 0 漏洞」

## 结果汇总

| 范围 | 命令 | 结果 |
|---|---|---|
| server | `npm audit --omit=dev` | **0 漏洞** ✓ |
| client | `npm audit` | 生产依赖 1 个已知例外（见下）|

## 已修复（2026-08-04）

| 包 | 原版本 | 新版本 | 漏洞 |
|---|---|---|---|
| brace-expansion | 5.0.7 | 5.0.9 | GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895（DoS）|
| postcss | 8.5.15 | 8.5.25 | GHSA-r28c-9q8g-f849 / GHSA-fxqj-rqcc-2cmp（路径遍历）|
| tar | 7.5.19 | 7.5.22 | GHSA-r292-9mhp-454m（DoS）|
| nanoid | 3.3.12 | 3.3.17 | （随 audit fix 升级）|

## 已知例外（风险接受，跟踪升级）

**react-router 7.18.2 — GHSA-qwww-vcr4-c8h2（RSC Mode CSRF Bypass，high）**

- 影响区间：7.12.0 - 8.2.0；**截至 2026-08-04 无修复版**（latest = 7.18.2 仍在区间内，8.x 最高 8.2.0 亦受影响）。
- 不可利用性论证：本项目为 Vite SPA，仅使用声明式 `BrowserRouter` + `Routes`，未启用 RSC Mode / SSR / Server Actions / single-fetch，漏洞入口不生效。
- 为何不降级：npm 建议的 7.11.0 落入 6.0.0 - 7.17.0 区间，会暴露 14 个更严重 advisory（XSS / RCE / DoS，含 GHSA-2w69、GHSA-49rj 等），降级为劣化。
- 处置：保留 7.18.2；跟踪官方修复版（7.18.3 / 8.2.1+）发布后第一时间升级；升级时执行全量路由回归（Home / Room / TvDisplay 三路由冒烟）。

## 回归证据

- `client: npm run build` ✓（18.66s，无错误）
- `server: node --test` 29/29 ✓
- 服务器 4000 持续运行（PID 见 `server/data/server.pid`），`/` 返回 index.html
