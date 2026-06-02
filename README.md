# FIFA 2026 世界杯赛程

团队内部使用的 FIFA 2026 世界杯赛程网站，PolyMarket 风格深色 UI，支持移动端和微信内置浏览器。

## 功能

- 104 场完整赛程（小组赛 + 淘汰赛）
- 按阶段 / 小组筛选
- 按日期分组展示
- 比赛状态实时标识（即将开始 / 进行中 / 已结束）
- 响应式布局，微信端适配
- 深色主题，高对比度，护眼

## 技术栈

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Cloudflare Pages

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000 查看。

## 本地预览（含后端 Functions）

`npm run dev` 只跑前端（看赛程足够，预测/实时比分接口不可用）。要在本地连同 Cloudflare Pages Functions 一起调试：

```bash
cp .dev.vars.example .dev.vars   # 填入真实密钥（已 gitignore）
npm run build
npx wrangler pages dev out       # 本地起 Pages + Functions
```

## 部署到 Cloudflare

> 架构拓扑(Pages + Functions + KV + Worker、数据流、KV 键)见 [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md)。

项目由**两个可独立部署的部分**组成：

1. **Pages**：前端静态站（`out/`）+ 后端接口（`functions/api/*`，预测、登录、赛程读取）。
2. **Worker**（`worker/`，可选）：定时抓 ESPN 实时比分写入 KV。**不部署也能用**——前端会回退到内置的 104 场静态赛程。

### 1. 创建 KV namespace

```bash
npx wrangler kv namespace create FIFA_MATCHES
```

把输出的 `id` 填到 **两个** 配置文件里（换 Cloudflare 账号部署时必须重建并替换，否则会指向他人空间）：

- `wrangler.toml`（根目录，Pages 用）
- `worker/wrangler.toml`（Worker 用）

### 2. 配置密钥（secrets）

**Pages Functions** 在 Cloudflare 控制台 `Pages → 项目 → Settings → Environment variables`（或用 CLI）设置：

| 变量 | 必须 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | LLM 推理（采集 + 归因） |
| `TAVILY_API_KEY` | 是 | 网页搜索 |
| `ODDS_API_KEY` | 否 | 赔率数据，无则回退 LLM |
| `ADMIN_PASSWORD` | 是 | 管理员密码（触发预测用） |
| `ADMIN_SECRET` | 是 | 签发 admin token 的 HMAC 密钥，随便设一段长随机串 |

**Worker**（仅在要跑实时比分时）：

```bash
cd worker && npx wrangler secret put FOOTBALL_DATA_API_KEY   # 可选，ESPN 的兜底数据源
```

### 3. 部署

```bash
npm run deploy        # 部署 Pages（前端 + Functions）
npm run worker:deploy # 部署 Worker（实时比分，可选）
npm run deploy:all    # 两者一起
```

### 4. 管理员预测入口

预测接口受 `ADMIN_PASSWORD` 保护以控制 LLM 成本。访问 `https://<站点>/?admin=1`，输入密码后即可在比赛卡片上触发胜率预测。普通访客只能看赛程。

## Roadmap

- [ ] 时区切换（ET / 北京时间）
- [ ] 收藏比赛
- [x] 实时比分更新（Worker + KV，赛事窗口自限流）
- [x] Agent 系统 - 胜率预测（采集 + 归因，已接入赔率 devig）
