# debug-runbook

**Runbook-driven backend incident investigation for AI agents.**

`debug-runbook` 将资深工程师的故障排查流程编码为可执行的 Runbook，让 AI Agent 按顺序收集证据、评估决策规则，最终输出结构化事故报告。

> 当前状态：早期开源 MVP，持续迭代中。

---

## 核心思路

普通 AI 调试演示只是暴露工具 API，没有调查顺序、证据标准和漂移检测。

`debug-runbook` 编码了这些缺失的约束：

1. **Runbook 选择**：根据 symptom 信号权重选择最匹配的调查剧本
2. **有序执行**：按 Runbook 声明的步骤顺序调用 adapter
3. **Evidence 规范化**：所有工具返回值统一为 Evidence 对象，而非原始 payload
4. **决策规则**：evidence 类型组合触发具体结论，结论必须有证据支撑
5. **结构化报告**：根因、已确认事实、替代假设、下一步建议

---

## 快速开始

### 安装

```bash
pnpm install
pnpm build
```

### 配置

```bash
cp agent-debugger.config.example.yaml agent-debugger.config.yaml
# 填入你的 Langfuse / DB / Redis 凭据
```

```yaml
# agent-debugger.config.yaml
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
    key_prefix_allowlist: ["cache:order:", "idempotency:"]
```

### 作为 MCP 工具接入 AI

在 Claude Desktop / OpenClaw 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "agent-debugger": {
      "command": "node",
      "args": ["/path/to/debug-runbook/dist/mcp/server.js"],
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

然后直接告诉 AI：

> `investigate` `trace_id=abc123`，现象：订单创建成功但下游任务未生成，期望：tasks 表中应有对应记录

### 运行 demo（无需真实系统）

```bash
npm run demo:order-task-missing
npm run benchmark        # 7/7 全通过
npm run check            # 结构校验
```

---

## 架构

```
Incident Input (context_id + symptom + expected)
       ↓
[Runbook Selector]   selector.json 信号权重匹配
       ↓
[Executor]           按 execution.json 顺序调用 adapter
       ↓
[Adapter Layer]      Langfuse / PostgreSQL / Redis → Evidence[]
       ↓
[Decision Engine]    decision.json 规则匹配 → 结论 + 置信度
       ↓
[Reporter]           结构化 IncidentReport
```

### 目录结构

```
debug-runbook/
├── src/                    # TypeScript 源码
│   ├── adapters/           # Langfuse / DB / Redis adapter
│   ├── core/               # selector / executor / reporter
│   ├── config/             # YAML 配置加载器
│   ├── mcp/server.ts       # MCP Server 入口
│   └── types/              # Zod Schema 全局类型
├── runbooks/               # 故障调查剧本（YAML + JSON sidecar）
├── adapters/               # adapter 规范化元数据（JSON）
├── evidence-policies/      # 跨源派生证据规则
├── fixtures/               # 可重播的测试案例
├── scripts/                # Demo 和基准测试脚本
└── docs/                   # 设计文档
```

---

## 内置 Runbook

| Runbook | 适用场景 |
|---------|---------|
| `request_not_effective` | 请求成功但预期副作用未产生（订单创建但任务缺失等） |
| `cache_stale` | 返回值与持久化状态不符，疑缓存陈旧 |
| `state_abnormal` | 持久化状态本身与业务预期不符 |

### 添加自定义 Runbook

1. 创建 `your-runbook.yaml`（参考 `docs/runbook-spec.md`）
2. 创建配套的 `.selector.json` / `.execution.json` / `.decision.json`
3. 在 `agent-debugger.config.yaml` 的 `runbooks:` 列表中添加路径

---

## 安全约束

- **只读**：所有 adapter 均为只读，MVP 阶段无写操作
- **SQL 安全**：拦截 INSERT/UPDATE/DELETE/DROP 等危险语句
- **表白名单**：DB 只允许访问指定表
- **key 前缀白名单**：Redis 只允许访问指定前缀的 key
- **字段过滤**：Langfuse span 字段按 allowlist 过滤，防 token 爆炸

---

## 文档

- [架构设计](docs/architecture.md)
- [证据模型](docs/evidence-model.md)
- [Runbook 规范](docs/runbook-spec.md)
- [Adapter 规范](docs/tool-adapter-spec.md)
- [评估方法](docs/evaluation.md)

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
