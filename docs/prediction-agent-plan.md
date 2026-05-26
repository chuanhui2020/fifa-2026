# FIFA 2026 比赛预测 - Multi Agent 方案

## 概述

基于 Pi Agent 框架（`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`），使用多个采集 Agent 收集比赛相关信息，由归因 Agent 综合分析并输出预测结果。

## 技术框架

- **Agent 运行时**: Pi Agent Core — 管理 Agent 生命周期、消息流、状态
- **LLM 抽象层**: Pi AI — 统一多 provider 接口，内置 DeepSeek provider 支持
- **Web 搜索**: DeepSeek API 原生 `web_search` 参数，通过 Pi 的 `onPayload` 钩子注入
- **模型获取**: `getModel("deepseek", "deepseek-v4-flash")` / `getModel("deepseek", "deepseek-v4-pro")`

## 模型分配

| 角色 | 模型 | 用途 |
|------|------|------|
| 采集 Agent | DeepSeek-V4-Flash | 快速、低成本，联网搜索 + 结构化数据提取 |
| 归因 Agent | DeepSeek-V4-Pro | 强推理，综合分析 + 归因拆解 |

## 架构

```
用户点击"预测" → /api/predict
  → orchestrator.ts (Promise.allSettled 并行调度)
    ├─ Pi Agent (flash + web_search) → EloAgent
    ├─ Pi Agent (flash + web_search) → FormAgent
    ├─ Pi Agent (flash + web_search) → MarketAgent
    └─ Pi Agent (flash + web_search) → SquadAgent
  → Pi Agent (pro) → AttributionAgent (归因分析)
  → PredictionCard 前端展示
```

## Web 搜索方案

采集 Agent 使用 DeepSeek API 原生联网搜索能力，通过 Pi 的 `onPayload` 钩子注入：

```typescript
const agent = new Agent({
  initialState: { systemPrompt, model, messages: [] },
  getApiKey: () => getApiKey(),
  onPayload: (params: any) => {
    return { ...params, web_search: true };
  },
});
```

这样每个采集 Agent 都能搜索实时数据（赔率、伤病、排名），无需额外搜索服务。

## 触发策略

### 阶段 A：按需触发（当前实现）

- 用户点击某场比赛的"预测"按钮
- Orchestrator 并行调度所有采集 Agent
- 采集完成后，将结构化结果传给归因 Agent
- 归因 Agent 输出最终预测
- 结果缓存到 Cloudflare KV（TTL 30 分钟），相同比赛短时间内再次请求直接返回缓存

预估延迟：10-20 秒（采集并行 + 归因串行）

### 阶段 B：定时预采集 + 按需归因（后续）

- 赛前 24h：采集 Elo、历史交锋（变化慢）
- 赛前 2h：采集赔率、阵容伤病（变化快）
- 用户请求时：归因 Agent 读缓存直接分析，响应 3-5 秒
- Cloudflare Cron Trigger 驱动定时任务

## 采集 Agent 设计

### 统一输出 Schema

```typescript
interface CollectorOutput {
  agentId: string;           // e.g. "elo", "form", "market", "squad"
  matchId: string;           // 比赛 ID
  timestamp: number;         // 采集时间
  confidence: number;        // 0-1, 数据可信度
  factors: Factor[];         // 输出因子列表
  sources: string[];         // 数据来源 URL
}

interface Factor {
  name: string;              // 因子名称 e.g. "elo_diff"
  value: number;             // 数值
  direction: "home" | "away" | "neutral";  // 利好方向
  weight: number;            // 建议权重 0-1
  reasoning: string;         // 简短说明
}
```

### 各 Agent 职责

**EloAgent**
- 数据源：FIFA 排名、Elo 评分网站（通过 DeepSeek web_search 联网获取）
- 输出因子：排名差、Elo 差、近 N 场胜率

**FormAgent**
- 数据源：近 5-10 场比赛结果（通过 DeepSeek web_search 联网获取）
- 输出因子：近期胜率、进球效率、失球率、连胜/连败

**MarketAgent**
- 数据源：博彩公司赔率（通过 DeepSeek web_search 联网获取）
- 输出因子：赔率隐含概率、赔率变动趋势

**SquadAgent**
- 数据源：伤病报告、首发预测（通过 DeepSeek web_search 联网获取）
- 输出因子：关键球员缺阵影响、阵容完整度

## 归因 Agent 设计

### 输入

所有采集 Agent 的 `CollectorOutput[]`

### 输出 Schema

```typescript
interface PredictionResult {
  matchId: string;
  prediction: {
    homeWin: number;         // 概率 0-1
    draw: number;
    awayWin: number;
  };
  attribution: Attribution[];  // 归因拆解
  summary: string;             // 自然语言总结
  confidence: number;          // 整体置信度
  generatedAt: number;
}

interface Attribution {
  factor: string;              // 因子名称
  contribution: number;        // 对最终概率的贡献度 (-1 到 1)
  direction: "home" | "away" | "neutral";
  explanation: string;         // 归因解释
}
```

### 归因 Agent Prompt 要点

- 不是简单加权平均，要理解因子间交互
- 识别矛盾信号并解释（如"实力强但状态差"）
- 输出结构化 JSON + 自然语言总结
- 明确标注不确定性

## 技术实现

### 依赖

- `@earendil-works/pi-agent-core` — Agent 运行时
- `@earendil-works/pi-ai` — 统一 LLM 层（内置 DeepSeek provider）
- DeepSeek API（`web_search` 联网搜索）
- Cloudflare KV（结果缓存，阶段 B）

### 目录结构

```
src/agents/
├── types.ts                  # 统一类型（CollectorOutput, PredictionResult）
├── llm.ts                    # Pi AI 模型获取 + API key
├── orchestrator.ts           # 编排层（并行采集 + 串行归因）
├── prompts/
│   ├── loader.ts             # Prompt 模板加载 + 变量替换
│   ├── elo.system.md
│   ├── elo.user.md
│   ├── form.system.md
│   ├── form.user.md
│   ├── market.system.md
│   ├── market.user.md
│   ├── squad.system.md
│   ├── squad.user.md
│   ├── attribution.system.md
│   └── attribution.user.md
├── collectors/
│   ├── types.ts              # CollectorAgent 接口
│   ├── runner.ts             # 通用 Pi Agent 运行器（含 web_search）
│   ├── elo.ts
│   ├── form.ts
│   ├── market.ts
│   └── squad.ts
└── attribution/
    └── agent.ts              # 归因 Pi Agent

src/app/api/predict/route.ts  # POST /api/predict
src/components/PredictionCard.tsx  # 前端展示
```

### API 端点

```
POST /api/predict
Body: { matchId: string, homeTeam: string, awayTeam: string }
Response: PredictionResult
```

## 实施进度

- [x] Pi Agent 框架集成（pi-agent-core + pi-ai）
- [x] 类型定义（CollectorOutput, PredictionResult, Attribution）
- [x] Orchestrator 编排逻辑（Promise.allSettled 并行 + 容错）
- [x] 4 个采集 Agent（Elo / Form / Market / Squad）
- [x] 归因 Agent
- [x] Prompt 模板化（独立 .md 文件 + loader）
- [x] DeepSeek web_search 联网搜索集成
- [x] /api/predict API 端点
- [x] PredictionCard 前端组件（概率条 + 归因详情）
- [x] 集成到 MatchCard（upcoming 比赛显示预测按钮）
- [ ] KV 缓存层（避免重复请求）
- [ ] 错误重试 / 超时处理
- [ ] Loading 骨架屏动画
- [ ] 端到端测试

## 风险与注意事项

- DeepSeek `web_search` 返回的数据质量需验证，可能需要调优 prompt 引导搜索方向
- 足球预测随机性高，前端展示需明确"概率预测，仅供参考"
- 4 个 Agent 并行请求，需注意 DeepSeek API 并发限制
- 归因 Agent 依赖采集结果质量，如果采集数据不足归因可能不准确
- 初期可以只上 2-3 个采集 Agent，验证效果后再扩展
