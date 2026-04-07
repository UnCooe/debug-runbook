# agent-debugger

**面向 AI Agent 的 Runbook 驱动后端故障排查框架。**

> 当前状态：早期开源 MVP。
>
> 这个仓库的来源，是一套真实线上 AI 排障 / 自愈工作流的抽象。但原始生产环境里的 DAG 编排、权限体系、观测基础设施都属于私有系统，当前仓库不会完整复现。这里开源的是其中最可复用的一层：Runbook、证据规范化、决策逻辑，以及 MCP 接入入口。

## 你是不是也这样排查线上问题？

很多线上故障并不是没有规律，而是排查流程本身高度套路化：

- 先对齐实际结果和期望结果。
- 再看 Redis 缓存里的值对不对。
- 再看数据库源数据对不对。
- 再看 trace，确认链路停在哪一层。
- 最后判断是缓存陈旧、预期副作用没发生，还是持久化状态本身异常。

一个典型例子：

- 某个详情页返回的资产状态不对。
- 实际排查顺序往往很稳定：先查缓存，再查 DB，再查 trace，再查外部依赖。
- 交给 Agent 的输入也很稳定：`trace_id`、期望结果、实际结果。

`agent-debugger` 做的事，就是把这类反复出现的排障套路变成可执行 Runbook，让 Agent 按顺序收集证据，而不是自由猜测。

## 这个仓库今天真正实现了什么

- 一个根据故障信号选择 Runbook 的 selector。
- 一个按固定顺序调用 adapter 的 executor。
- 一层证据规范化逻辑，把工具输出转成紧凑、结构化的 findings。
- 一个根据证据组合触发结论和下一步建议的 decision engine。
- 一个可接入 AI 工具链的 MCP server 入口。

## 5 分钟跑起来

最快的理解方式不是先接入真实系统，而是先跑零配置 demo。这里用的是可重放 fixture，不需要 Langfuse、Postgres、Redis 凭证。

环境要求：

- Node.js `>= 18.17`
- `pnpm`

直接运行：

```bash
pnpm install
pnpm demo
pnpm benchmark
pnpm check
```

你会看到：

- 一个从故障输入到结构化报告的完整演示。
- 内置案例集上的 benchmark 结果。
- runbook / adapter / evidence policy 的结构一致性校验。

需要明确的是：

- `pnpm demo` 和 `pnpm benchmark` 验证的是可重放的排障案例。
- 它们证明的是这套 investigation 模型和仓库结构成立，不代表已经覆盖完整的生产集成链路。

## 一个具体的 Demo 场景

默认 demo 重放的是这类问题：

- 实际结果：订单创建了，但下游任务没有生成。
- 期望结果：订单创建后应该存在对应的任务记录。
- 排查顺序：trace -> persistence -> idempotency/cache。

输出里会明确展示：

- 选中了哪个 Runbook
- 命中了哪些证据
- 最终触发了哪个结论
- 建议下一步做什么

## 接入你的真实系统

当你确认零配置 demo 跑通之后，再接入真实观测和存储系统。

先构建 MCP 服务：

```bash
pnpm build
```

创建配置文件：

```bash
cp agent-debugger.config.example.yaml agent-debugger.config.yaml
```

示例：

```yaml
adapters:
  langfuse:
    base_url: https://cloud.langfuse.com
    secret_key: ${LANGFUSE_SECRET_KEY}
    public_key: ${LANGFUSE_PUBLIC_KEY}
  db:
    type: postgres
    connection_string: ${DATABASE_URL}
    allowed_tables: [orders, tasks]
  redis:
    url: ${REDIS_URL}
    key_prefix_allowlist: ["idempotency:", "task:idempotent:", "order:view:", "task:view:"]

runbooks:
  - ./runbooks/request_not_effective.yaml
```

在你的 AI 客户端里接入 MCP：

```json
{
  "mcpServers": {
    "agent-debugger": {
      "command": "node",
      "args": ["/path/to/agent-debugger/dist/mcp/server.js"],
      "env": {
        "LANGFUSE_SECRET_KEY": "sk-...",
        "LANGFUSE_PUBLIC_KEY": "pk-...",
        "DATABASE_URL": "postgresql://...",
        "REDIS_URL": "redis://..."
      }
    }
  }
}
```

然后给出明确的故障输入：

> Investigate `order_id=order_123`. Actual: order was created but no task was generated. Expected: a task row should exist.

## 这个仓库不是什么

- 它不是原始内部线上系统的开源镜像。
- 它不是一个通用的 autonomous bug-fixing 平台。
- 它不包含原系统里的私有 DAG 编排、权限边界和内部修复链路。
- 它也不代表可以无限放权给 Agent 自动修复。

## 安全边界

- 当前 MVP 中所有 adapter 都是只读的。
- SQL 查询会拦截写操作。
- DB 访问受表白名单限制。
- Redis 访问受 key 前缀白名单限制。
- Langfuse span 字段会先按 allowlist 过滤，再进入证据层。

## 内置 Runbook

| Runbook | 场景 |
|---------|---------|
| `request_not_effective` | 请求成功了，但预期副作用没有发生 |
| `cache_stale` | 缓存状态和持久化状态看起来不一致 |
| `state_abnormal` | 持久化业务状态本身不符合预期 |

当前内置 Runbook 的 context 支持范围是刻意收窄的：

- `request_not_effective`：`request_id`、`order_id`
- `cache_stale`：`order_id`、`task_id`
- `state_abnormal`：`order_id`、`task_id`

如果你需要更广的 locator 支持，比如 `trace_id` 或 `user_id`，请通过配置里的 `runbooks:` 加载自定义 Runbook。

也支持通过配置里的 `runbooks:` 加载自定义 Runbook。每个自定义 Runbook 需要带上同名的 `.selector.json`、`.execution.json`、`.decision.json` 配套元数据文件。

## 架构

```text
Incident Input (context_id + symptom + expected)
       ↓
[Runbook Selector]   通过 *.selector.json 匹配信号权重
       ↓
[Executor]           按 runbook 定义的顺序调用 adapter
       ↓
[Adapter Layer]      Langfuse / PostgreSQL / Redis -> Evidence[]
       ↓
[Decision Engine]    根据证据触发结论和下一步建议
       ↓
[Reporter]           输出结构化 IncidentReport
```

## 文档

- [架构设计](docs/architecture.md)
- [证据模型](docs/evidence-model.md)
- [Runbook 规范](docs/runbook-spec.md)
- [Adapter 规范](docs/tool-adapter-spec.md)
- [评估方法](docs/evaluation.md)
- [发布清单](docs/release-checklist.md)
- [发布公告草稿](docs/release-announcement.md)
- [v0.1.0 发布说明草稿](docs/release-v0.1.0.md)
- [变更记录](CHANGELOG.md)
- [安全策略](SECURITY.md)

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
