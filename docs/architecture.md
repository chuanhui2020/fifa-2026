# FIFA 2026 比赛预测系统 - 架构文档

## 系统概述

基于 Pi Agent 框架的多 Agent 比赛预测系统。通过多个专职采集 Agent 并行收集实时数据，由归因 Agent 综合分析并输出带归因拆解的预测结果。

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| Agent 运行时 | `@earendil-works/pi-agent-core` | Agent 生命周期、消息流、工具调用、状态管理 |
| LLM 抽象层 | `@earendil-works/pi-ai` | 统一多 provider 接口，模型注册 |
| 采集模型 | DeepSeek-V4-Flash | 低成本、快速，适合结构化数据提取 |
| 归因模型 | DeepSeek-V4-Pro | 强推理能力，综合分析 + 归因拆解 |
| Web 搜索 | Tavily API | 实时数据获取（排名、赔率、伤病） |
| 前端框架 | Next.js 16 (App Router) | 页面渲染 + API 路由 |
| 样式 | Tailwind CSS 4 | 深色主题 UI |
| 缓存 | 内存缓存（阶段 A）/ Cloudflare KV（阶段 B） | 避免重复预测请求 |

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                             │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │ MatchCard   │───▶│ PredictionCard                       │   │
│  │             │    │  - 概率条 (主胜/平/客胜)              │   │
│  │             │    │  - 归因分析详情                       │   │
│  │             │    │  - Loading 骨架屏                     │   │
│  └─────────────┘    └──────────────────────────────────────┘   │
│                              │                                  │
│                              ▼ POST /api/predict                │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ /api/predict/route.ts                                     │  │
│  │  - 参数校验                                               │  │
│  │  - 55s 超时保护                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
├─────────────────────────────────────────────────────────────────┤
│  Orchestrator (orchestrator.ts)                                 │
│                                                                 │
│  ┌────────────┐                                                 │
│  │ 缓存检查   │──── 命中 ──▶ 直接返回                          │
│  └────────────┘                                                 │
│       │ 未命中                                                  │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Promise.allSettled (并行调度)                              │  │
│  │                                                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │EloAgent  │ │FormAgent │ │MarketAgent│ │SquadAgent│   │  │
│  │  │(flash)   │ │(flash)   │ │(flash)    │ │(flash)   │   │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬──────┘ └────┬─────┘   │  │
│  │       │             │            │             │          │  │
│  │       └─────────────┴────────────┴─────────────┘          │  │
│  │                         │                                  │  │
│  └─────────────────────────┼──────────────────────────────────┘  │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Attribution Agent (pro)                                    │  │
│  │  - 接收所有 CollectorOutput                                │  │
│  │  - 因子交互分析                                            │  │
│  │  - 矛盾信号解决                                            │  │
│  │  - 输出概率 + 归因拆解                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌────────────┐                                                 │
│  │ 写入缓存   │ (TTL 30min)                                    │
│  └────────────┘                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Tool Layer                                                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ web_search (Tavily AgentTool)                             │  │
│  │  - 注册为 Pi AgentTool                                    │  │
│  │  - Agent 通过 function calling 自主调用                    │  │
│  │  - 返回结构化搜索结果 (markdown)                           │  │
│  │  - 支持 basic / advanced 搜索深度                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│                     Tavily API (外部)                            │
└─────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
src/
├── agents/
│   ├── types.ts                  # 统一类型 (CollectorOutput, PredictionResult, Attribution, Factor)
│   ├── llm.ts                    # Pi AI 模型获取 (getFlashModel, getProModel, getApiKey)
│   ├── orchestrator.ts           # 编排层 (缓存检查 → 并行采集 → 串行归因)
│   ├── cache.ts                  # 内存缓存 (TTL 30min)
│   ├── prompts/
│   │   ├── loader.ts             # Prompt 模板加载 + {{变量}} 替换
│   │   ├── elo.system.md         # EloAgent 系统提示词
│   │   ├── elo.user.md           # EloAgent 用户提示词模板
│   │   ├── form.system.md
│   │   ├── form.user.md
│   │   ├── market.system.md
│   │   ├── market.user.md
│   │   ├── squad.system.md
│   │   ├── squad.user.md
│   │   ├── attribution.system.md # 归因 Agent 系统提示词
│   │   └── attribution.user.md   # 归因 Agent 用户提示词模板
│   ├── tools/
│   │   └── web-search.ts         # Tavily web search AgentTool
│   ├── collectors/
│   │   ├── types.ts              # CollectorAgent 接口定义
│   │   ├── runner.ts             # 通用 Pi Agent 运行器 (创建 Agent + 注册工具 + 执行)
│   │   ├── elo.ts                # Elo/排名采集 Agent
│   │   ├── form.ts               # 近期状态采集 Agent
│   │   ├── market.ts             # 赔率采集 Agent
│   │   └── squad.ts              # 阵容/伤病采集 Agent
│   └── attribution/
│       └── agent.ts              # 归因分析 Agent
├── app/
│   ├── api/predict/route.ts      # POST /api/predict 端点
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── FilterChips.tsx
│   ├── MatchCard.tsx             # 比赛卡片 (集成 PredictionCard)
│   └── PredictionCard.tsx        # 预测结果展示组件
└── data/
    └── matches.ts
```

## 核心组件详解

### 1. Pi Agent 集成 (llm.ts)

```typescript
import { getModel } from "@earendil-works/pi-ai";

// Pi AI 内置 DeepSeek provider，直接通过 model registry 获取
export function getFlashModel() {
  return getModel("deepseek", "deepseek-v4-flash");
}

export function getProModel() {
  return getModel("deepseek", "deepseek-v4-pro");
}
```

Pi AI 的 `getModel()` 返回完整的 Model 对象，包含 API 类型、baseUrl、cost 等元数据，Agent 运行时自动处理请求路由。

### 2. 采集 Agent 运行器 (collectors/runner.ts)

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { webSearchTool } from "../tools/web-search";

const agent = new Agent({
  initialState: {
    systemPrompt,          // 从 .md 模板加载
    model,                 // DeepSeek-V4-Flash
    messages: [],
    tools: [webSearchTool], // 注册 Tavily 搜索工具
  },
  getApiKey: () => getApiKey(),
});

await agent.prompt(userPrompt);  // 发送用户消息，Agent 自主决定是否调用工具
await agent.waitForIdle();       // 等待 Agent 完成（含多轮工具调用）
```

Pi Agent 的工具调用流程：
1. Agent 收到 prompt
2. 模型决定调用 `web_search` tool
3. Pi 运行时执行 tool（调 Tavily API）
4. 搜索结果自动注入对话
5. 模型基于搜索结果生成最终 JSON 输出

### 3. Web Search Tool (tools/web-search.ts)

实现 Pi 的 `AgentTool` 接口：

```typescript
export const webSearchTool: AgentTool = {
  name: "web_search",
  description: "Search the web for current information...",
  parameters: WebSearchParams,  // TypeBox schema
  label: "Web Search",
  async execute(_toolCallId, params) {
    // 调用 Tavily API
    const response = await fetch("https://api.tavily.com/search", { ... });
    return { content: [{ type: "text", text: formattedResults }], details: data };
  },
};
```

模型通过 function calling 自主决定何时搜索、搜什么关键词。

### 4. Orchestrator (orchestrator.ts)

```typescript
export async function predict(matchId, homeTeam, awayTeam) {
  // 1. 缓存检查
  const cached = getCached(matchId);
  if (cached) return cached;

  // 2. 并行调度采集 Agent（容错：部分失败不影响整体）
  const results = await Promise.allSettled(
    collectors.map(agent => agent.run(matchId, homeTeam, awayTeam))
  );

  // 3. 归因分析
  const prediction = await runAttribution(matchId, homeTeam, awayTeam, validResults);

  // 4. 写入缓存
  setCache(matchId, prediction);
  return prediction;
}
```

### 5. Prompt 模板系统 (prompts/loader.ts)

```typescript
// 从文件加载 prompt，替换 {{变量}}
export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const raw = readFileSync(join(PROMPTS_DIR, name), "utf-8");
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value), raw
  );
}
```

Prompt 与代码解耦，修改提示词不需要改代码或重新部署。

## 数据流

### 采集 Agent 输出 (CollectorOutput)

```typescript
{
  agentId: "elo",
  matchId: "1",
  timestamp: 1716700000000,
  confidence: 0.85,
  factors: [
    {
      name: "fifa_ranking_diff",
      value: 15,
      direction: "home",
      weight: 0.7,
      reasoning: "主队 FIFA 排名高出 15 位"
    }
  ],
  sources: ["https://www.fifa.com/fifa-world-ranking"]
}
```

### 归因 Agent 输出 (PredictionResult)

```typescript
{
  matchId: "1",
  prediction: { homeWin: 0.45, draw: 0.28, awayWin: 0.27 },
  attribution: [
    {
      factor: "Elo 评分差距",
      contribution: 0.12,
      direction: "home",
      explanation: "主队 Elo 高出 120 分，历史上这个差距对应约 12% 的胜率优势"
    },
    {
      factor: "近期状态",
      contribution: -0.08,
      direction: "away",
      explanation: "主队近 5 场仅 1 胜，状态明显下滑"
    }
  ],
  summary: "主队实力占优但近期状态不佳，客队势头正盛。综合来看主队仍有微弱优势，但比赛悬念较大。",
  confidence: 0.65,
  generatedAt: 1716700030000
}
```

## 环境变量

```bash
DEEPSEEK_API_KEY=xxx      # DeepSeek API 密钥
TAVILY_API_KEY=xxx        # Tavily 搜索 API 密钥
```

## 性能与限制

| 指标 | 值 |
|------|------|
| 预估延迟（首次） | 15-30 秒（4 个采集并行 + 归因串行） |
| 预估延迟（缓存命中） | < 50ms |
| 缓存 TTL | 30 分钟 |
| API 超时 | 55 秒 |
| Tavily 免费额度 | 1000 次/月 |
| 每次预测搜索次数 | 约 4-12 次（每个 Agent 1-3 次） |

## 演进路线

### 阶段 A（当前）：按需触发

用户点击 → 实时采集 → 归因 → 展示

### 阶段 B（后续）：定时预采集

- 赛前 24h：采集 Elo、历史交锋
- 赛前 2h：采集赔率、阵容
- 用户请求时：归因 Agent 读缓存直接分析（3-5 秒响应）
- 缓存从内存迁移到 Cloudflare KV
- Cloudflare Cron Trigger 驱动定时任务

### 可扩展方向

- 增加采集维度（H2H 历史交锋、战术匹配度、天气/场地因素）
- 赛后回溯校准（对比预测 vs 实际结果，调整 Agent 权重）
- 流式输出（采集进度实时反馈给前端）
- 多模型对比（同时用 Claude / GPT 做归因，取共识）
