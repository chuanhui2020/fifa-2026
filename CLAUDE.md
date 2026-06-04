# FIFA 2026 赛程网站

> **沟通约定**：始终用中文回答，思考过程与结果说明也一律用中文。

## 项目概述

FIFA 2026 世界杯赛程展示网站，供团队直观查看比赛信息。后续将接入 agent 系统计算概率。

## 技术栈

- **框架**: Next.js 16 (App Router, TypeScript)
- **样式**: Tailwind CSS 4
- **部署目标**: Cloudflare Pages + Workers
- **设计风格**: PolyMarket 深色主题，卡片式布局

## 当前进度

### 已完成

- [x] 项目初始化 (Next.js + Tailwind + TypeScript)
- [x] 深色主题设计系统（配色、字体、间距）
- [x] 完整赛程数据（104 场比赛，含小组赛 72 场 + 淘汰赛 32 场）
- [x] 比赛卡片组件（状态指示、队伍、比分、场馆）
- [x] 筛选功能（按阶段、按小组）
- [x] 按日期分组展示
- [x] 响应式布局（移动端单列 / 桌面端双列）
- [x] 微信端适配（safe-area、禁字体缩放、tap-highlight）
- [x] 无障碍支持（prefers-reduced-motion、aria-label）

- [x] Cloudflare Pages 部署配置（wrangler.toml + deploy 脚本 + README 部署指南）
- [x] 实时比分更新（独立 Worker + Cron + KV，赛事窗口自限流）
- [x] Agent 系统（概率计算、预测）— 采集 + 归因 + 赔率 devig 已接入

### 待完成

- [ ] 时区切换（ET / 北京时间 / 自动检测）
- [ ] 收藏/关注比赛功能
- [ ] 分享功能（微信分享卡片 meta）

## 数据来源

- 赛程数据来自 ESPN (espn.com/soccer/schedule)
- 时间为美东时间 (ET)
- 淘汰赛对阵为占位符，赛事进行后需更新

## 外部服务依赖

| 服务 | 用途 | 环境变量 | 必须 | 费用 |
|---|---|---|---|---|
| the-odds-api.com | 赔率数据（market agent 主路径，确定性 devig） | `ODDS_API_KEY` | 否（无则回退 LLM） | 免费 500 次/月 |
| eloratings.net | Elo 评分（elo agent 主路径，直连 World.tsv） | 无需 key | 否（无则回退 LLM） | 免费 |
| DeepSeek API | LLM 推理（form/squad agent + attribution 归因） | `DEEPSEEK_API_KEY` | 是 | 按 token 计费 |
| Tavily | 网页搜索（form/squad agent + 回退路径） | 无需 key 环境变量（key 存 KV，经「号池管理」界面增删） | 是 | 免费 1000 次/月·号 |
| Cloudflare KV | 缓存 + 校准数据持久化 + 号池（含 key 原文） | `FIFA_MATCHES`(binding) | 是 | Pages 免费额度内 |

> **Tavily 号池**：所有 key 统一存于 KV（单键 `tavily:pool`，含 key 原文 + 元数据），**不再读任何环境变量**。账号经「号池管理」界面增删：新增（粘贴 key，调官方 `/usage` 校验后入库）、暂停（不派发、保留计数）、删除（从 KV 彻底移除）。派发按 least-used 在健康号间均匀分摊；每号本月用量记于 KV，达上限（默认 1000，留安全余量 `TAVILY_SAFETY_MARGIN`=50）或遇额度型 429 自动剔除到**下月 2 号**（UTC+8），下月初计数清零。瞬时 429 只换号重试、不剔除。解封会顺带清零该号软计数。admin 端点 `/api/tavily-pool`（GET 状态，`?live=1` 附官方真实额度 / POST `add`·`pause`·`resume`·`delete`·`reinstate`）+ 前端「号池管理」面板。key 原文永不返回前端（仅暴露 keyId 哈希 + 末 4 位）。可选 `TAVILY_MONTHLY_LIMIT`、`TAVILY_SAFETY_MARGIN` 覆盖默认值。

### AI 模型

- **DeepSeek V4 Flash** — 采集 agent（elo/market 回退时、form/squad 始终使用）
- **DeepSeek V4 Pro** — attribution 归因综合（最终概率 + 中文摘要）

### 降级策略

- the-odds-api 不可用 → market agent 回退到 LLM + Tavily 搜索赔率
- eloratings.net 不可用 → elo agent 回退到 LLM + Tavily 搜索评分
- 两个确定性源都挂 → 系统仍可运行，只是概率锚点退化为 LLM 输出（有幻觉风险）

## 架构

静态导出（`next.config.ts` 的 `output: "export"`）+ Cloudflare Pages Functions。
**后端接口不在 `src/app/api`，而在根目录 `functions/api/`**（Pages Functions 约定）。
实时比分由独立 Worker（`worker/`）通过 Cron 抓取写入 KV，前端读 `/api/matches`，
失败则回退到内置静态赛程（`src/data/matches.ts`）——后端全挂也能看赛程。

完整 Cloudflare 部署拓扑（组件清单、数据流、KV 键参考）见 [docs/cloudflare-architecture.md](docs/cloudflare-architecture.md)；
预测系统内部的 Agent 管线见 [docs/architecture.md](docs/architecture.md)。

## 项目结构

```
functions/api/                # Cloudflare Pages Functions（后端接口）
├── predict.ts                # 预测（admin 鉴权 + IP 限流 + KV 缓存）
├── predict-stream.ts         # 预测流式输出
├── admin-login.ts            # 管理员登录（签发 HMAC token）
├── matches.ts                # 读取 KV 赛程
├── resolve-match.ts          # 录入真实比分（校准用）
├── calibration-metrics.ts    # 校准指标
└── warmup.ts                 # 预热

worker/                       # 独立 Worker：定时抓 ESPN 实时比分 → KV
└── src/index.ts              # Cron 入口（按赛事/比赛窗口自限流）
                              # + espn.ts / football-data.ts / transform.ts / group-map.ts

src/
├── app/
│   ├── globals.css           # 深色主题变量 + 动画 + 微信适配
│   ├── layout.tsx            # 全局布局 + meta + viewport
│   └── page.tsx              # 主赛程页面（筛选 + 列表）
├── agents/
│   ├── orchestrator.ts       # 编排（并行采集 + 串行归因 + 超时/缓存/校准记录）
│   ├── base-probability.ts   # 基准概率
│   ├── cache.ts              # KV 缓存读写
│   ├── calibration.ts        # 校准数据记录
│   ├── llm.ts / types.ts / validate.ts / parse-json.ts / team-names.ts
│   ├── collectors/           # 采集 Agent: elo / form / market / squad（+ runner）
│   ├── attribution/          # 归因 Agent（最终概率 + 中文摘要）
│   ├── elo/                  # eloratings.net 直连客户端
│   ├── odds/                 # the-odds-api 客户端 + devig（去抽水）
│   ├── tools/                # web-search（Tavily）
│   └── prompts/              # Prompt 模板（.md）+ loader
├── components/               # FilterChips / MatchCard / PredictionCard / AdminLoginModal
├── contexts/AdminContext.tsx # 管理员登录态
├── hooks/useMatches.ts       # 赛程数据（静态兜底 + 轮询 /api/matches）
├── lib/timezone.ts           # 时区工具
└── data/                     # matches.ts（104 场）/ teams.ts / venues.ts
```

## 开发命令

```bash
npm run dev    # 启动开发服务器 (localhost:3000)
npm run build  # 生产构建
npm run lint   # ESLint 检查
```
