# 32强对阵同步与预测指南

## 问题背景

32强（round32）及后续淘汰赛的对阵在小组赛期间为占位符（如 "Group A Winner"、"3rd Place A/B/C/D/F"），需要等小组赛结束后才能确定真实队伍。

## 解决方案

### 自动机制（推荐）

**Worker 定时抓取 + 自动合并**

1. Worker 每 2 分钟从 ESPN API 拉取赛程
2. ESPN 在小组赛结束后会自动返回真实对阵（如 "Brazil vs Japan"）
3. `transform.ts` 的 `mergeMatches` 函数通过 `stage + date + venue` 三元组匹配
4. 自动用真实队名覆盖 KV 中的占位符比赛

**优点**：无需人工干预，Worker 运行中会自动更新

### 手动触发（应急方案）

**管理员界面操作**

1. 登录管理员账号
2. 点击管理面板中的 **"同步32强对阵"** 按钮
3. 系统从 ESPN 拉取未来7天赛程并更新 KV
4. 刷新页面查看更新后的对阵

**API 端点**：`POST /api/sync-knockout`

```bash
curl -X POST https://fifa-2026.pages.dev/api/sync-knockout \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

响应示例：
```json
{
  "success": true,
  "totalUpdated": 16,
  "knockoutUpdated": 16,
  "knockoutMatches": [
    {
      "id": 74,
      "stage": "round32",
      "date": "2026-06-29",
      "homeTeam": "Brazil",
      "awayTeam": "Japan"
    }
    // ...
  ]
}
```

## 批量预测

对阵确认后，使用 **"一键预测"** 批量生成预测：

### 方式1：前端一键预测（推荐）

1. 对阵同步完成后，"一键预测" 按钮会显示需要预测的场次数
2. 点击按钮自动预测所有已确定对阵的比赛
3. 默认走缓存（省 token），可选"强制全部重测"绕过缓存

### 方式2：API 批量预测

**端点**：`POST /api/predict-batch`

```bash
curl -X POST https://fifa-2026.pages.dev/api/predict-batch \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "round32",
    "maxCount": 10,
    "forceRefresh": false
  }'
```

参数说明：
- `stage`：比赛阶段（默认 `"round32"`，可选 `"round16"` / `"quarter"` 等）
- `maxCount`：单次最多预测场次（默认 10，防止超时）
- `forceRefresh`：是否强制刷新（默认 false，走缓存）

响应示例：
```json
{
  "success": true,
  "stage": "round32",
  "totalMatches": 5,
  "predicted": [
    {
      "matchId": 74,
      "homeTeam": "Brazil",
      "awayTeam": "Japan",
      "success": true,
      "prediction": { /* 预测结果 */ }
    }
    // ...
  ]
}
```

## 工作流程

### 小组赛结束后的完整流程

1. **等待 ESPN 更新**（通常在最后一场小组赛结束后几小时内）
2. **Worker 自动同步**（或手动点击"同步32强对阵"）
3. **验证对阵更新**：刷新页面，检查32强比赛是否显示真实队名
4. **批量预测**：点击"一键预测"，生成所有32强比赛的预测
5. **监控进度**：按钮会显示 "预测中 X/Y…"

### 后续淘汰赛阶段

- **16强**：32强比赛结束后，重复上述流程
- **1/4决赛**：16强结束后同步
- **半决赛**：1/4决赛结束后同步
- **决赛**：半决赛结束后同步

## 技术细节

### mergeMatches 匹配优先级

```typescript
// 1. espnId 精确匹配（最稳定）
if (update.espnId) {
  idx = merged.findIndex(m => m.espnId === update.espnId);
}

// 2. 主客队对匹配（日期无关，适合小组赛时间调整）
if (idx < 0) {
  const pk = pairKey(update.homeTeam, update.awayTeam);
  idx = merged.findIndex(m => pairKey(m.homeTeam, m.awayTeam) === pk);
}

// 3. stage+date+venue 匹配（淘汰赛占位符覆盖）★
if (idx < 0) {
  idx = merged.findIndex(
    m => m.stage === update.stage && 
         m.date === update.date && 
         m.venue === update.venue
  );
}

// 4. 新增比赛（ESPN 返回了种子里缺的场次）
if (idx >= 0) {
  merged[idx] = { ...merged[idx], ...update, id: merged[idx].id };
} else {
  merged.push(update);
}
```

### isConfirmedFixture 校验

```typescript
// 预测系统只接受真实队名，拒绝占位符
export function isConfirmedFixture(homeTeam: string, awayTeam: string): boolean {
  return isRealTeam(homeTeam) && isRealTeam(awayTeam);
}

// isRealTeam 检查队名是否在 teamNames 字典中（48 支参赛队）
// 占位符如 "Group A Winner" 不在字典中，返回 false
```

## 故障排查

### 对阵未更新

1. **检查 ESPN API**：
   ```bash
   curl "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260629"
   ```
   - 如果返回占位符（如 "TBD"），说明 ESPN 尚未更新，需等待
   - 如果返回真实队名，说明 Worker 可能未运行或 KV 写入失败

2. **检查 Worker 状态**：
   ```bash
   curl https://fifa-worker.YOUR_SUBDOMAIN.workers.dev/health
   ```
   - 查看 `lastUpdated` 时间戳，确认 Worker 是否在运行

3. **手动触发同步**：点击管理界面的"同步32强对阵"按钮

### 预测失败

1. **检查对阵是否确认**：页面上比赛卡片应显示真实队名（不是 "Group A Winner"）
2. **检查错误信息**：预测失败会显示具体错误（API 额度、超时、网络等）
3. **逐场预测**：如果批量预测部分失败，可在比赛卡片上单独点击"预测"按钮

## 相关文件

- `functions/api/sync-knockout.ts` — 手动同步 API
- `functions/api/predict-batch.ts` — 批量预测 API
- `worker/src/transform.ts` — mergeMatches 合并逻辑
- `src/data/teams.ts` — isConfirmedFixture 校验
- `src/app/page.tsx` — 前端管理界面按钮
