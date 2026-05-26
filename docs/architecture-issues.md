# 架构待改进项

## 1. Pi 框架利用不足

**现状：** 只用了 `agent.prompt()` → `waitForIdle()` → 读最后消息。把 Pi 当成带工具调用的 LLM wrapper。

**未利用的 Pi 能力：**
- `subscribe()` 事件系统 — 可实时监听 Agent 执行过程
- `shouldStopAfterTurn` — 可控制 Agent 最大轮次（防止无限搜索）
- `steer()` / `followUp()` — 可中途注入指令修正 Agent 行为
- `prepareNextTurn` — 可动态调整下一轮的 context/model
- `AgentEvent` 流 — `tool_execution_start/end` 可用于进度追踪

**改进方向：** 用事件系统做实时进度推送；用 `shouldStopAfterTurn` 限制搜索次数。

---

## 2. JSON 输出不可靠

**现状：** 完全依赖 prompt 约束 LLM 输出 JSON，直接 `JSON.parse`。无校验、无重试、无 fallback。

**风险：**
- 模型偶尔输出 markdown 包裹的 JSON（```json ... ```）
- 模型输出额外文字解释 + JSON 混合
- 字段缺失或类型不对（如 confidence 返回字符串）

**改进方向：**
- 加 Zod schema 校验 Agent 输出
- JSON.parse 失败时尝试提取（正则匹配 `{...}`）
- 校验失败时自动重试一次（带更强的格式约束 prompt）

---

## 3. 无可观测性

**现状：** 不知道每个 Agent 搜了什么、搜了几次、耗时多少、消耗多少 token。出问题时无法定位。

**需要的指标：**
- 每个 Agent 的总耗时
- web_search 调用次数和关键词
- token 消耗（input/output）
- 成功/失败率
- 归因 Agent 收到了多少有效 factor

**改进方向：**
- 用 Pi 的 `subscribe()` 监听 `tool_execution_start/end` 和 `turn_end` 事件
- 结构化日志输出（JSON 格式，方便后续接入监控）
- 前端展示"数据来源"时附带搜索关键词

---

## 4. 前端体验断层

**现状：** 15-30 秒等待，只有骨架屏 + 3 步文案轮播。用户不知道真实进度。

**理想体验：**
- 每个采集 Agent 完成时立即展示该维度的部分结果
- 归因 Agent 开始时告知用户"正在综合分析"
- 流式输出归因 summary

**改进方向：**
- API 改为 SSE（Server-Sent Events）流式响应
- 前端逐步渲染：EloAgent 完成 → 显示排名数据；MarketAgent 完成 → 显示赔率
- 或者至少推送真实进度（"4 个 Agent 已完成 2 个"）

---

## 5. 缓存在 serverless 环境失效

**现状：** 内存 Map 缓存。本地 dev 有效，但 Cloudflare Workers 每次请求可能是不同 isolate，缓存无法共享。

**改进方向：**
- 阶段 A（本地开发）：内存缓存够用，保持现状
- 部署时：迁移到 Cloudflare KV
  - 已有 worker 基础设施（项目里有 wrangler 配置）
  - KV 写入延迟约 60s 全球同步，对 30min TTL 场景可接受
- 或用 Cloudflare D1（SQLite）存储预测历史，支持后续回溯分析

---

## 6. 搜索质量不可控

**现状：** Agent 是否调用 web_search、搜什么关键词、搜几次——全靠 prompt 引导。

**风险：**
- Agent 可能不搜索，直接用训练数据编造"最新"信息
- 搜索关键词不精准，返回无关结果
- 搜索过多次浪费 Tavily 额度（免费 1000 次/月）

**改进方向：**
- 用 Pi 的 `beforeToolCall` 钩子记录每次搜索
- 用 `afterToolCall` 检查搜索结果质量（结果为空时可自动换关键词重试）
- 用 `shouldStopAfterTurn` 限制每个 Agent 最多 3 轮（约 3 次搜索）
- 在 system prompt 中强制要求"必须至少搜索一次再输出结果"
- 输出中要求包含 sources 字段，前端校验是否有真实 URL

---

## 优先级建议

| 优先级 | 问题 | 原因 |
|--------|------|------|
| P0 | JSON 输出校验 | 不修会直接崩溃 |
| P0 | 搜索质量控制 | 不搜索 = 预测无意义 |
| P1 | 可观测性 | 没有日志无法调优 |
| P1 | 前端流式体验 | 30 秒等待用户会流失 |
| P2 | Pi 框架深度利用 | 功能增强，非紧急 |
| P2 | 缓存迁移 KV | 部署时再处理 |
