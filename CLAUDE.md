# FIFA 2026 赛程网站

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

### 待完成

- [ ] 时区切换（ET / 北京时间 / 自动检测）
- [ ] 收藏/关注比赛功能
- [ ] Cloudflare Pages 部署配置
- [ ] 实时比分更新（Cloudflare Cron Trigger）
- [x] Agent 系统（概率计算、预测）— 骨架已完成
- [ ] 分享功能（微信分享卡片 meta）

## 数据来源

- 赛程数据来自 ESPN (espn.com/soccer/schedule)
- 时间为美东时间 (ET)
- 淘汰赛对阵为占位符，赛事进行后需更新

## 项目结构

```
src/
├── app/
│   ├── globals.css          # 深色主题变量 + 动画 + 微信适配
│   ├── layout.tsx           # 全局布局 + meta + viewport
│   ├── page.tsx             # 主赛程页面（筛选 + 列表）
│   └── api/predict/route.ts # 预测 API 端点
├── agents/
│   ├── types.ts             # 统一类型定义
│   ├── llm.ts               # DeepSeek 客户端配置
│   ├── orchestrator.ts      # 编排层（并行采集 + 串行归因）
│   ├── prompts/             # Prompt 模板文件
│   │   ├── loader.ts        # 模板加载 + 变量替换
│   │   ├── elo.system.md
│   │   ├── elo.user.md
│   │   ├── form.system.md
│   │   ├── form.user.md
│   │   ├── market.system.md
│   │   ├── market.user.md
│   │   ├── squad.system.md
│   │   ├── squad.user.md
│   │   ├── attribution.system.md
│   │   └── attribution.user.md
│   ├── collectors/          # 采集 Agent（DeepSeek-V4-Flash）
│   │   ├── types.ts
│   │   ├── elo.ts
│   │   ├── form.ts
│   │   ├── market.ts
│   │   └── squad.ts
│   └── attribution/         # 归因 Agent（DeepSeek-V4-Pro）
│       └── agent.ts
├── components/
│   ├── FilterChips.tsx      # 横滑筛选组件
│   ├── MatchCard.tsx        # 比赛卡片组件
│   └── PredictionCard.tsx   # 预测结果展示组件
└── data/
    └── matches.ts           # 完整赛程数据（104 场）
```

## 开发命令

```bash
npm run dev    # 启动开发服务器 (localhost:3000)
npm run build  # 生产构建
npm run lint   # ESLint 检查
```
