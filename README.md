# 轻统计 · Qingstat

![](/packages/server/public/counterscale-logo-300x300.webp)

![ci status](https://github.com/Adsryen/qingstat/actions/workflows/ci.yaml/badge.svg)

**轻统计（Qingstat）** 是一款可自托管在 [Cloudflare](https://cloudflare.com) 上的简易网站分析（Web Analytics）追踪器与仪表盘。

目标：部署简单、维护成本低，流量较大时运营费用也接近为零。

## 致谢与二次开发说明

本仓库基于 [benvinegar/counterscale](https://github.com/benvinegar/counterscale) 二次开发，并重命名为 **轻统计 / Qingstat**。

感谢原作者 [Ben Vinegar](https://github.com/benvinegar) 及贡献者。核心设计与大量实现来自上游 Counterscale。

- 上游：https://github.com/benvinegar/counterscale
- 本仓库：https://github.com/Adsryen/qingstat

### 本 fork 能力摘要

- `/console` 多站点、实时在线、访客明细、主题与中英双语
- 埋点代码生成（HTML / npm）
- D1 站点元数据 + Analytics Engine 访问量
- Engagement / Presence

### 线上实例（ops）

| 项 | 值 |
|----|-----|
| 产品名 | 轻统计 · Qingstat |
| 代码仓库 | https://github.com/Adsryen/qingstat |
| Worker 脚本名 | `counterscale`（CF 侧暂保留） |
| URL | https://pv.we-together.club |
| AE | `metricsDataset`（`WEB_COUNTER_AE`） |
| D1 | `counterscale`（`DB`） |
| R2 | `counterscale-daily-rollups` |

> 代码包名与品牌为 `@qingstat/*` / 轻统计；Cloudflare 资源名仍用 `counterscale`，避免生产中断。

#### Windows 部署

```powershell
Copy-Item packages/tracker/dist/loader/tracker.js packages/server/public/tracker.js -Force
pnpm --filter @qingstat/server build
$sha = (git rev-parse HEAD).Trim()
Set-Location packages/server
npx wrangler deploy --var "VERSION:$sha"
```

D1：`npx wrangler d1 migrations apply counterscale --remote`

## 许可证

MIT。详见 [LICENSE](LICENSE)。
