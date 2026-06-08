# Cloudflare 部署架构

本文档描述项目在 Cloudflare 上的**基础设施/部署拓扑**。预测系统内部的 Agent 管线见 [architecture.md](architecture.md)。

本项目是典型的 Cloudflare 全家桶 serverless 架构:**静态站 + 边缘函数 + KV + 独立 Cron Worker**。没有常驻 Node 服务器,前端为静态导出(`next.config.ts` 的 `output: "export"`),所有动态逻辑跑在 Cloudflare Workers 运行时(V8 isolate,边缘节点,开启 `nodejs_compat`)。

核心要点:**两个独立部署单元(Pages 与 Worker)共享同一个 KV**,KV 是它们之间唯一的通信桥梁——Worker 写、Pages 读。

## 架构图

```
                          浏览器 / 微信
                              │
              ┌───────────────┴────────────────┐
              │   Cloudflare Pages「fifa-2026」  │
              │                                 │
              │  ① 静态前端 (out/)               │   Next.js 16 output:"export"
              │     纯 HTML/CSS/JS               │
              │                                 │
              │  ② Pages Functions              │   Workers 运行时
              │     (functions/api/*)           │   nodejs_compat
              │     /api/matches    读赛程       │
              │     /api/predict    预测(admin)  │
              │     /api/admin-login 登录        │
              │     /api/resolve-match 等        │
              └───────────────┬─────────────────┘
                              │ 读/写
                    ┌─────────▼──────────┐
                    │  Cloudflare KV     │   binding: FIFA_MATCHES
                    │  「FIFA_MATCHES」  │   id: d6f5bfa0...
                    │  matches:all       │   ← 两个单元共享
                    │  meta:* / 预测缓存  │
                    │  校准 / 限流计数     │
                    └─────────▲──────────┘
                              │ 写
              ┌───────────────┴─────────────────┐
              │  Cloudflare Worker「fifa-2026-cron」│  独立部署 (worker/)
              │  Cron: */2 * * * *                │
              │  抓 ESPN 实时比分 → 写 KV          │
              │  /health 健康检查                  │
              └────────────────┬─────────────────┘
                               │ 外呼
                     ESPN / football-data API
```

## 组件清单

| 组件 | 名称 | 配置文件 | 部署方式 | 职责 |
|---|---|---|---|---|
| **Pages** | `fifa-2026` | `wrangler.toml` | git push master 自动 / `npm run deploy` | 静态前端 + `functions/api/*` 后端接口 |
| **Worker** | `fifa-2026-cron` | `worker/wrangler.toml` | `npm run worker:deploy`(**不随 git 自动部署**) | Cron 定时抓实时比分写 KV |
| **KV** | `FIFA_MATCHES` | 两处 `wrangler.toml` 同一 id | `wrangler kv namespace create` | 两单元共享的状态存储 |

> Pages Functions 和 Worker 是**两个独立部署单元**,各自 `wrangler.toml` 绑定**同一个 KV id**(`d6f5bfa045204fe0ae11f86d08959e23`)。换 Cloudflare 账号部署时需重建 KV 并替换两处 id。

## 数据流

### 1. 访客看赛程(读路径)

```
浏览器 → 静态站 → 前端 JS 调 /api/matches (Pages Function) → 读 KV matches:all → 返回
```

KV 无数据或接口失败 → 前端**回退到打包进去的静态 104 场赛程**(`src/data/matches.ts`)。
因此**后端全挂也能看赛程**(`src/hooks/useMatches.ts` 负责兜底 + 轮询:live 时 30s、平时 5min)。

### 2. 实时比分(写路径)

```
Cron(每 2 分钟)→ Worker → 抓 ESPN → 转换 → 写 KV matches:all + meta:lastUpdated
```

Worker 内部按赛事/比赛窗口**自限流**(`worker/src/index.ts`):
- 非赛事期(6/11 前、7/20 后):最多每 6 小时抓一次
- 赛事期但无进行中/临近比赛:最多每 ~55 分钟一次
- 比赛窗口(±2h 内):每次 Cron 都抓

### 3. 胜率预测(admin 路径)

```
?admin=1 登录 → /api/admin-login 签发 HMAC token
            → POST /api/predict(Bearer token + IP 限流 + KV 缓存)
            → orchestrator 并行跑 4 个采集 agent(elo/form/market/squad)
            → 归因 agent 综合 → 结果写 KV 缓存 + 记录校准
```

所有会花钱或能写数据的接口(`predict`、`predict-stream`、`resolve-match`、`warmup`、`calibration-metrics`)都需 admin token;`matches` 公开只读,`admin-login` 为登录入口。

## KV 键参考

| 键 | 写入方 | 读取方 | 说明 |
|---|---|---|---|
| `matches:all` | Worker | `/api/matches` / `/api/cron-predict` | 实时赛程全量数据(cron-predict 读其比分做自动复盘判定) |
| `meta:lastUpdated` | Worker | Worker / `/api/matches` / `/health` | 上次抓取时间戳 |
| `meta:activeWindow` | Worker | Worker | 是否处于比赛窗口 |
| `prediction:{matchId}` | `/api/predict` | `/api/predict` | 预测结果缓存(TTL 30min) |
| `predictions:published` | `/api/predict` / `/api/cron-predict` | `/api/predictions` | 已发布预测(matchId→最新结果,无 TTL,公开只读) |
| `pred-history:{matchId}` | `/api/predict` / `/api/cron-predict` | `/api/prediction-history` | 单场预测历史快照(封顶 30 次,含重大变更,复盘用) |
| `odds:{key}` | odds 采集 | odds 采集 | 赔率快照缓存(TTL 3h,省 API 配额) |
| `cal:{matchId}` | `/api/resolve-match` / `/api/cron-predict` / 预测 | 校准统计 | 单场校准记录(cron-predict 按比分自动 resolve) |
| `cal:manifest` | 校准 | 校准 | 校准记录 id 清单 |
| `ratelimit:{ip}:{window}` | `/api/predict` | `/api/predict` | 限流计数(TTL 60s) |

## 运行时与外部依赖

- **运行时**:Pages Functions 与 Worker 均跑在 Cloudflare Workers 的 V8 isolate(边缘),`nodejs_compat`。前端为纯静态资源,**无服务端渲染**。
- **Worker 外呼**:ESPN(比分)、football-data(兜底,需 `FOOTBALL_DATA_API_KEY`)、**回调 Pages `/api/cron-predict`**(定时预测,需 `PAGES_BASE_URL` + `CRON_SECRET`)。
- **Pages Functions 外呼**:DeepSeek(LLM)、Tavily(搜索)、the-odds-api(赔率)、eloratings.net(Elo)。

> **定时预测**:Pages Functions 无 cron,时钟借自 Worker——Worker 每 2min 在 `scheduled` 末尾 `waitUntil` 回调 `/api/cron-predict`(`X-Cron-Secret` 鉴权)。该端点按距开赛时间分档调度(>24h/6h、24-1h/1h、1h-5min/10min 不走缓存、<5min 停)预测最多 5 场,并自动 resolve 已结束比赛。详见 [CLAUDE.md 的「定时预测与复盘」](../CLAUDE.md)。

> 各外部服务的用途、环境变量与降级策略见 [CLAUDE.md 的「外部服务依赖」](../CLAUDE.md)。

## 部署拓扑

```bash
# 1. 创建 KV(首次,需把 id 填进根目录与 worker/ 两处 wrangler.toml)
npx wrangler kv namespace create FIFA_MATCHES

# 2. 部署(Pages 也可由 git push master 自动触发)
npm run deploy        # Pages:前端 + Functions
npm run worker:deploy # Worker:实时比分 Cron(独立,不随 git 自动部署)
npm run deploy:all    # 两者一起
```

完整部署步骤(secrets、admin 入口、本地预览)见 [README.md](../README.md)。
