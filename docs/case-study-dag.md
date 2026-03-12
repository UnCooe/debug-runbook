# 🪛 Case Study: 适配你的业务系统

本篇指南将以一个真实的 **DAG (有向无环图) 情报分析系统** 为案例，教你如何将你的业务系统接入 `agent-debugger` 并零代码配置专属的自动化排错流程。

---

## 业务背景

假设你的团队维护着一个情报分析系统。每一条情报的处理都是一个基于 DAG 的异步任务流，包含多个节点：数据抓取 → 文本清洗 → 向量化 → LLM 分析 → 结果入库。

由于节点多、耗时长且涉及多个外部 API，线上排错一直是个痛点：
- **痛点 1**：一个节点失败会导致最终结果没出来，追踪完整链路非常费时。
- **痛点 2**：排障是有"固定套路"的，通常就是去看 Langfuse Trace，查某几个 Span 是否报错，再去数据库搜一下入库记录。

为了解决这个问题，团队决定利用 `agent-debugger` 将这一套"固定排错套路"固化下来并赋予大模型。

---

## 接入步骤

### 第一步：开启并配置数据源 (Adapter)

该系统主要依赖两大数据源：**Langfuse**（记录 DAG 每一环节的执行流）和 **PostgreSQL**（记录最终分析结果）。

只需在项目根目录创建或修改 `agent-debugger.config.yaml`：

```yaml
adapters:
  langfuse:
    base_url: https://cloud.langfuse.com
    secret_key: ${LANGFUSE_SECRET_KEY}
    public_key: ${LANGFUSE_PUBLIC_KEY}
    span_field_allowlist:
      - input
      - output.error
      - level
      - statusMessage

  db:
    type: postgres
    connection_string: ${DATABASE_URL}
    allowed_tables: [reports, dag_tasks] # 严格的安全边界，大模型只能查这两个表
```

### 第二步：编写 DAG 专属 Runbook

在 `runbooks/` 目录下创建一个名为 `dag_node_failure.yaml` 的文件，将你们老专家排查 DAG 失败的思路写成机器可读的规则：

#### 1. 触发条件 (Selector)
告诉大模型，什么情况下该选这个 Runbook？
```yaml
name: dag_node_failure
description: 调查 DAG 情报分析链路中某个节点失败导致最终无结果的问题。

match:
  context_types:
    - trace_id
    - report_id
  symptoms:
    - missing report
    - dag failed
    - stuck
```

#### 2. 调查动作 (Steps)
大模型选中这个 Runbook 后，框架应该按什么顺序自动调接外部系统？
```yaml
steps:
  # 步骤 1：去 Langfuse 看有没有 ERROR 级别的 Span
  - id: check_trace_errors
    tool: trace.lookup
    required: true
    purpose: 检查是否有任何 DAG 节点抛出异常
    params:
      trace_ref_column: langfuse_trace_id # 如果初始线索只有 report_id，用它回查 trace_id

  # 步骤 2：去数据库看状态
  - id: check_db_record
    tool: db.readonly_query
    required: true
    purpose: 核实最终结果是否确实未入库
    params:
      table: reports
      match_column: id
```

#### 3. 决策逻辑 (Decision Rules)
拿到线索（Evidence）后，怎么推断事故结论？也就是经验沉淀的过程。

```yaml
decision_rules:
  - id: upstream_api_timeout
    when:
      all:
        - finding_type: downstream_error # Langfuse 返回了 Error Span
        - finding_type: db_row_missing   # 数据库确实没结果
    conclusion: 外部数据源超时导致分析流中断
    confidence: high
```

---

## 这套机制好在哪里？

完成上述两步配置后，整个框架就被赋予了处理你们系统业务报错的能力。

1. **绝对安全**。即便大模型"幻觉"发作想要执行 `DROP TABLE`，也会在 DB Adapter 的 `allowed_tables` 白名单和强只读事务（`READ ONLY`）层被立即拦截。
2. **保护 Token 额度**。如果不加限制地丢一条复杂 DAG Trace 给 Claude，一次对话可能耗费数万 Token。`span_field_allowlist` 机制仅将关键属性（如 `output.error`）提取并转化为几十个字的结构化 Evidence，大幅节约成本并提高推理精准度。
3. **团队积累**。下一次有新同事入职，遇到"DAG 不产出数据"的问题，他只需要通过 MCP 把问题描述丢给大模型。大模型会自动匹配 `dag_node_failure.yaml`，代替他去执行 Langfuse 检索和 DB 查询，甚至直接在聊天框里输出包含错误堆栈的诊断报告。

> **现在就开始适配吧！前往 `agent-debugger.config.example.yaml` 复制一份属于你的配置文件。**
